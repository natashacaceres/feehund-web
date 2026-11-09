// Validación de lo leído (fase 2). El resultado nunca se oculta: la interfaz siempre lo enseña.
//
//   validarSaldos(lectura)              cada saldo sale del anterior más el importe (saldo encadenado)
//                                       y saldo inicial declarado + movimientos = saldo final declarado.
//   analizarFechas(movimientos, {hoy})  periodo, huecos sin movimientos y fechas imposibles.
//   avisoValidacion, combinarValidaciones, saldosNoFiables: ayudas para el worker.
//
// Lógica pura: sin DOM, sin red, sin almacenamiento. El dinero se compara en céntimos enteros
// (aCentimos) con tolerancia cero, así 0,1 + 0,2 da 0,30 exactos.
// Regla de la casa: si algo no se puede comprobar, se dice «sin verificar»; nunca se da por bueno.

import { aCentimos } from './numeros.js';
import { aviso } from './modelo.js';
import { fechaValida, diasEntre, sumarDias, mesesEntre, hoyISO } from './fechas.js';

/** Filas (líneas del banco) del mismo día que, como mucho, se intentan reordenar. */
export const MAX_BLOQUE_REORDENABLE = 12;
/** Días seguidos sin movimientos a partir de los cuales se avisa (más de 35). */
export const DIAS_HUECO = 35;
/** Antes de esta fecha una fecha de extracto no es plausible. */
export const FECHA_MINIMA = '2000-01-01';
/** Menos meses que esto es un periodo corto (la detección pasa entonces todos los cobros a «posible»). */
export const MESES_MINIMOS = 3;
/** Días que el periodo declarado puede ir más allá de los movimientos; más lejos se toma por mal leído. */
export const MAX_DIAS_DECLARADO_FUERA = 366;

const PASOS_POR_RECORRIDO = 1_000_000; // tope de la búsqueda de orden (protege de casos raros)
const MINIMO_CON_SALDO = 0.5;          // proporción de filas, o de días, con saldo para usar la cadena
const MIN_SALDOS_SUELTOS = 4;          // con menos saldos que la mitad, cuántos hacen falta para probar la cadena
const MIN_CUADRAN_SUELTOS = 0.75;      // y qué parte de sus comprobaciones tiene que cuadrar para usarla
const MAX_FILAS_MISMA_LINEA = 4;       // filas seguidas de una misma línea del banco que se juntan
const MAX_IDS = 50;                    // ids que se adjuntan a un aviso de fechas
const MAX_DIAS_SIN_SALDO = 7;          // días sin ningún saldo que se saltan para mirar el día siguiente

const finito = (n) => typeof n === 'number' && Number.isFinite(n);
const aEuros = (c) => (c === null ? null : c === 0 ? 0 : c / 100);

/**
 * Identifica la línea del archivo de la que sale un movimiento. Dos movimientos de la misma línea
 * (Revolut separa la comisión en otro movimiento) comparten un único saldo.
 * @returns {string|null}
 */
export function lineaDeOrigen(m) {
  const o = m?.origen;
  if (!o || !Number.isFinite(o.fila)) return null;
  return `${o.archivo ?? ''}\u0001${o.hoja ?? ''}\u0001${o.pagina ?? ''}\u0001${o.fila}`;
}

/** Movimientos que hay en una lista de unidades. */
function movimientosDe(unidades) {
  let n = 0;
  for (const u of unidades) n += u.idxs.length;
  return n;
}

/** "3-12" → "3": el id de un movimiento es «índice del archivo»-«n». */
function prefijoId(id) {
  return String(id ?? '').replace(/-[^-]*$/, '');
}

function esISO(f) {
  if (typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  return fechaValida(+f.slice(0, 4), +f.slice(5, 7), +f.slice(8, 10));
}

/** "2026-03-02" → "02/03/2026" (para los textos). */
export function fechaCorta(iso) {
  return esISO(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
}

// ---------------------------------------------------------------------------------------------
// Grupos (cuenta + divisa) y unidades (una línea del banco = un saldo)
// ---------------------------------------------------------------------------------------------

function agrupar(movs) {
  const grupos = new Map();
  movs.forEach((m, i) => {
    if (!m) return;
    const divisa = String(m.divisa || 'EUR').toUpperCase();
    const cuenta = m.cuenta ?? null;
    const clave = `${cuenta ?? ''}\u0001${divisa}`;
    let g = grupos.get(clave);
    if (!g) grupos.set(clave, (g = { cuenta, divisa, indices: [] }));
    g.indices.push(i);
  });
  return [...grupos.values()];
}

/** Filas seguidas de una misma línea: mismo día y, si traen saldo, el mismo. */
function mismaLineaCompatible(movs, tramo) {
  const fecha = movs[tramo[0]].fecha;
  let saldo = null;
  for (const k of tramo) {
    const m = movs[k];
    if (m.fecha !== fecha) return false;
    if (finito(m.saldo)) {
      const c = aCentimos(m.saldo);
      if (saldo !== null && saldo !== c) return false;
      saldo = c;
    }
  }
  return true;
}

function crearUnidad(movs, idxs) {
  let importe = 0, roto = false, saldo = null, rep = idxs[0];
  for (const k of idxs) {
    const m = movs[k];
    if (finito(m.importe)) importe += aCentimos(m.importe);
    else roto = true; // importe desconocido: la cadena no se puede comprobar en este punto
    if (finito(m.saldo)) { saldo = aCentimos(m.saldo); rep = k; }
  }
  return { idxs, importe, saldo, fecha: esISO(movs[idxs[0]].fecha) ? movs[idxs[0]].fecha : null, rep, roto };
}

function crearUnidades(movs, indices) {
  const unidades = [];
  let i = 0;
  while (i < indices.length) {
    const clave = lineaDeOrigen(movs[indices[i]]);
    let j = i + 1;
    if (clave !== null) while (j < indices.length && lineaDeOrigen(movs[indices[j]]) === clave) j++;
    const tramo = indices.slice(i, j);
    if (tramo.length > 1 && tramo.length <= MAX_FILAS_MISMA_LINEA && mismaLineaCompatible(movs, tramo)) {
      unidades.push(crearUnidad(movs, tramo));
    } else {
      for (const k of tramo) unidades.push(crearUnidad(movs, [k]));
    }
    i = j;
  }
  return unidades;
}

/**
 * ¿Hay saldos suficientes para fiarse de la cadena? Al menos la mitad de las filas con saldo,
 * o al menos la mitad de los días con algún saldo (PDF que solo ponen el saldo al final del día).
 * Unos pocos saldos sueltos (un número mal leído) no bastan: eso es «sin verificar», no «no cuadra».
 * Si no llega, validarSaldos aún usa la cadena cuando hay 4 saldos o más y cuadran 3 de cada 4 comprobaciones.
 */
function hayCadena(unidades, conAncla) {
  let con = 0;
  for (const u of unidades) if (u.saldo !== null) con++;
  if (con === 0 || (con < 2 && !conAncla)) return false;
  if (con / unidades.length >= MINIMO_CON_SALDO) return true;
  const dias = new Set(), diasConSaldo = new Set();
  for (const u of unidades) {
    dias.add(u.fecha);
    if (u.saldo !== null) diasConSaldo.add(u.fecha);
  }
  return diasConSaldo.size / dias.size >= MINIMO_CON_SALDO;
}

// ---------------------------------------------------------------------------------------------
// Reordenación dentro del mismo día
// ---------------------------------------------------------------------------------------------

/**
 * Prepara la búsqueda de orden de un bloque. Idea: si todo cuadra, cada fila con saldo b cumple
 * base + (suma de lo colocado hasta b, incluida) = saldo(b). No importa en qué orden van las filas
 * de antes, solo cuáles son. Así el estado de la búsqueda es solo el conjunto de filas colocadas
 * (como mucho 2^12) y, delante de cada fila con saldo, las filas sin saldo que faltan se eligen por
 * su suma exacta (tabla de sumas de los subconjuntos).
 */
function prepararBloque(bloque) {
  const n = bloque.length;
  const imp = bloque.map((u) => u.importe);
  const sal = bloque.map((u) => u.saldo);
  const nulos = [], conSaldo = [];
  for (let i = 0; i < n; i++) (sal[i] === null ? nulos : conSaldo).push(i);
  const k = nulos.length;
  const sumas = new Array(1 << k);
  sumas[0] = 0;
  for (let s = 1; s < 1 << k; s++) {
    const bit = s & -s;
    sumas[s] = sumas[s ^ bit] + imp[nulos[31 - Math.clz32(bit)]];
  }
  const porSuma = new Map();
  for (let s = 0; s < 1 << k; s++) {
    const l = porSuma.get(sumas[s]);
    if (l) l.push(s); else porSuma.set(sumas[s], [s]);
  }
  let total = 0;
  for (const x of imp) total += x;
  return { n, imp, sal, nulos, conSaldo, k, sumas, porSuma, total, llenoB: (1 << conSaldo.length) - 1, llenoN: (1 << k) - 1 };
}

/** Filas sin saldo de un subconjunto (en el orden del archivo) seguidas de la fila con saldo b. */
function pasoDeOrden(p, subconjunto, b) {
  const paso = [];
  for (let t = 0; t < p.k; t++) if (subconjunto & (1 << t)) paso.push(p.nulos[t]);
  paso.push(b);
  return paso;
}

/**
 * Orden del bloque en el que cada saldo queda explicado partiendo de `base` (saldo anterior + lo
 * acumulado) y que acaba en una fila con saldo (todas las filas sin saldo quedan dentro).
 * @returns {number[]|null} orden (posiciones dentro del bloque)
 */
function ordenNucleo(bloque, base, presupuesto) {
  // la última fila tiene que acabar en el total del día (se mira antes de preparar nada: es barato)
  let total = 0;
  for (const u of bloque) total += u.importe;
  if (!bloque.some((u) => u.saldo !== null && u.saldo === base + total)) return null;
  const p = prepararBloque(bloque);
  const muertos = new Uint8Array(1 << p.n);
  const pasos = [];
  const dfs = (mb, mn, suma) => {
    if (mb === p.llenoB) return mn === p.llenoN;
    const clave = mb * (1 << p.k) + mn;
    if (muertos[clave]) return false;
    for (let t = 0; t < p.conSaldo.length; t++) {
      if (mb & (1 << t)) continue;
      const b = p.conSaldo[t];
      const lista = p.porSuma.get(p.sal[b] - p.imp[b] - base - suma);
      if (!lista) continue;
      for (const s of lista) {
        if (s & mn) continue;
        if (--presupuesto.pasos < 0) return false;
        pasos.push(pasoDeOrden(p, s, b));
        if (dfs(mb | (1 << t), mn | s, suma + p.sumas[s] + p.imp[b])) return true;
        pasos.pop();
      }
    }
    if (presupuesto.pasos >= 0) muertos[clave] = 1;
    return false;
  };
  return dfs(0, 0, 0) ? pasos.flat() : null;
}

/**
 * Orden del bloque sin fallos desde `base`. Las filas sin saldo no pueden quedar sueltas al final
 * de cualquier manera (habría demasiadas combinaciones y alguna cuadraría por casualidad): o el día
 * acaba en una fila con saldo, o acaba con las mismas filas sin saldo con las que acaba en el archivo,
 * o con las que empieza (el día viene al revés). Dejar que cualquier fila sin saldo vaya detrás esconde
 * a veces un saldo mal leído (si lo que sobra o falta es justo el importe de otra fila del día).
 */
function ordenDesde(bloque, base, presupuesto) {
  let cola = 0, cabeza = 0;
  while (cola < bloque.length && bloque[bloque.length - 1 - cola].saldo === null) cola++;
  while (cabeza < bloque.length && bloque[cabeza].saldo === null) cabeza++;
  const cerrado = ordenNucleo(bloque, base, presupuesto);
  if (cerrado || cola === bloque.length) return cerrado;
  if (cola > 0) {
    const nucleo = ordenNucleo(bloque.slice(0, bloque.length - cola), base, presupuesto);
    if (nucleo) {
      for (let k = bloque.length - cola; k < bloque.length; k++) nucleo.push(k);
      return nucleo;
    }
  }
  if (cabeza > 0) {
    // el día al revés: las filas sin saldo con las que empieza en el archivo son las últimas del día
    const nucleo = ordenNucleo(bloque.slice(cabeza), base, presupuesto);
    if (nucleo) {
      const orden = nucleo.map((k) => k + cabeza);
      for (let k = cabeza - 1; k >= 0; k--) orden.push(k);
      return orden;
    }
  }
  return null;
}

/**
 * Orden del bloque sin fallos. Sin saldo anterior (ancla null), `aceptar(fin)` puede pedir que lo que
 * deja el día (saldo de cierre más las filas sin saldo de detrás) sirva para lo que viene después.
 */
function buscarOrden(bloque, ancla, pendiente, presupuesto, aceptar = null) {
  if (bloque.some((u) => u.roto)) return null;
  if (ancla !== null) return ordenDesde(bloque, ancla + pendiente, presupuesto);
  // Sin saldo anterior (primer día): la primera fila con saldo no se comprueba contra nada.
  // El saldo de antes del día no se sabe, pero si el día acaba en una fila con saldo b, era
  // saldo(b) − total del día (o del día sin las filas sin saldo del final). Se prueba cada b.
  // Puede haber más de un orden que cuadre (si el día suma cero, cualquier fila puede cerrarlo):
  // vale más el que deja cuadrar el día siguiente; si ninguno lo hace, el primero.
  let total = 0, totalCola = 0;
  for (const u of bloque) total += u.importe;
  for (let k = bloque.length - 1; k >= 0 && bloque[k].saldo === null; k--) totalCola += bloque[k].importe;
  const probadas = new Set();
  let primero = null;
  for (const u of bloque) {
    if (u.saldo === null) continue;
    for (const base of [u.saldo - total, u.saldo - (total - totalCola)]) {
      if (probadas.has(base)) continue;
      probadas.add(base);
      const orden = ordenDesde(bloque, base, presupuesto);
      if (!orden) continue;
      if (!aceptar || aceptar(base + total)) return orden;
      primero ??= orden;
    }
  }
  return primero;
}

/**
 * Orden de un día de más de 12 líneas en el que todas traen saldo: cada línea va detrás de la que deja el
 * saldo del que parte ella (saldo − importe). Sin saldo anterior (primer día), empieza en la línea cuyo saldo
 * de partida no deja ninguna otra; con `aceptar`, mejor la que deja cuadrar el día siguiente.
 * @returns {number[]|null}
 */
function ordenPorSaldos(bloque, ancla, pendiente, presupuesto, aceptar = null) {
  if (bloque.some((u) => u.roto || u.saldo === null)) return null;
  const porPartida = new Map();
  const saldos = new Set();
  bloque.forEach((u, i) => {
    const partida = u.saldo - u.importe;
    if (porPartida.has(partida)) porPartida.get(partida).push(i); else porPartida.set(partida, [i]);
    saldos.add(u.saldo);
  });
  const desde = (base) => {
    const usado = new Uint8Array(bloque.length);
    const orden = [];
    const seguir = (valor) => {
      if (orden.length === bloque.length) return true;
      for (const i of porPartida.get(valor) ?? []) {
        if (usado[i]) continue;
        if (--presupuesto.pasos < 0) return false;
        usado[i] = 1; orden.push(i);
        if (seguir(bloque[i].saldo)) return true;
        usado[i] = 0; orden.pop();
      }
      return false;
    };
    return seguir(base) ? orden : null;
  };
  if (ancla !== null) return desde(ancla + pendiente);
  let primero = null;
  for (const partida of porPartida.keys()) {
    if (saldos.has(partida)) continue; // otra línea deja este saldo: no es la primera del día
    const orden = desde(partida);
    if (!orden) continue;
    if (!aceptar || aceptar(bloque[orden[orden.length - 1]].saldo)) return orden;
    primero ??= orden;
  }
  return primero;
}

/**
 * Para explicar un fallo en un día de más de 12 líneas, todas con saldo y revueltas: tramos que encadenan
 * (cada línea detrás de la que deja el saldo del que parte). Con un importe mal leído salen dos tramos y
 * falla el primero del segundo; con un saldo mal leído, esa línea queda sola entre dos tramos.
 * @returns {{orden: number[], falla: number, causa: 'importe'|'saldo'}|null} null si no es un caso así
 */
function ordenPorTramos(bloque, base) {
  if (bloque.some((u) => u.roto || u.saldo === null)) return null;
  const porPartida = new Map();
  bloque.forEach((u, i) => {
    const partida = u.saldo - u.importe;
    if (porPartida.has(partida)) porPartida.get(partida).push(i); else porPartida.set(partida, [i]);
  });
  const usado = new Uint8Array(bloque.length);
  const siguiente = (valor) => (porPartida.get(valor) ?? []).find((k) => !usado[k]);
  const tramoDesde = (valor) => {
    const t = [];
    for (let k = siguiente(valor); k !== undefined; k = siguiente(bloque[k].saldo)) { usado[k] = 1; t.push(k); }
    return t;
  };
  const tramos = [tramoDesde(base)];
  let quedan = bloque.length - tramos[0].length;
  while (quedan > 0 && tramos.length <= 3) {
    // empieza en una línea a la que no llega ninguna otra de las que quedan
    const saldosLibres = new Set(bloque.filter((_, k) => !usado[k]).map((u) => u.saldo));
    let inicio = bloque.findIndex((u, k) => !usado[k] && !saldosLibres.has(u.saldo - u.importe));
    if (inicio === -1) inicio = bloque.findIndex((_, k) => !usado[k]);
    usado[inicio] = 1;
    const t = [inicio, ...tramoDesde(bloque[inicio].saldo)];
    tramos.push(t);
    quedan -= t.length;
  }
  if (quedan > 0) return null;
  const [t0, t1, t2] = tramos;
  const cierre = t0.length ? bloque[t0[t0.length - 1]].saldo : base;
  if (tramos.length === 2 && t1.length) return { orden: [...t0, ...t1], falla: t1[0], causa: 'importe' };
  if (tramos.length === 3 && t1.length === 1 && cierre + bloque[t1[0]].importe === bloque[t2[0]].saldo - bloque[t2[0]].importe) {
    return { orden: [...t0, ...t1, ...t2], falla: t1[0], causa: 'saldo' };
  }
  return null;
}

/**
 * Completa un bloque ya empezado sin más fallos: cada fila con saldo b cumple
 * base + (suma de lo colocado hasta b) = saldo(b), y al final no queda ninguna fila sin saldo suelta.
 * @returns {number[][]|null} pasos (cada uno: filas sin saldo y la fila con saldo detrás)
 */
function completar(p, mb0, mn0, suma0, base, presupuesto, muertos) {
  const pasos = [];
  const dfs = (mb, mn, suma) => {
    if (mb === p.llenoB) return mn === p.llenoN;
    const clave = `${mb * (1 << p.k) + mn}|${base}`;
    if (muertos.has(clave)) return false;
    for (let t = 0; t < p.conSaldo.length; t++) {
      if (mb & (1 << t)) continue;
      const b = p.conSaldo[t];
      const lista = p.porSuma.get(p.sal[b] - p.imp[b] - base - suma);
      if (!lista) continue;
      for (const s of lista) {
        if (s & mn) continue;
        if (--presupuesto.pasos < 0) return false;
        pasos.push(pasoDeOrden(p, s, b));
        if (dfs(mb | (1 << t), mn | s, suma + p.sumas[s] + p.imp[b])) return true;
        pasos.pop();
      }
    }
    if (presupuesto.pasos >= 0) muertos.add(clave);
    return false;
  };
  return dfs(mb0, mn0, suma0) ? pasos : null;
}

/**
 * Para explicar un fallo dentro de un día desordenado: busca un orden con un solo saldo que no cuadra
 * y en el que todas las filas del día quedan dentro de alguna comprobación. Así un importe mal leído
 * se señala en su día y no arrastra a los días siguientes.
 *  · fallo de importe en b: lo de antes cuadra desde `base`; b no; lo de después cuadra desde saldo(b).
 *    Las filas sin saldo que van delante de b se eligen para que el día cierre en una fila con saldo.
 *  · fallo de saldo en b: el día cuadra entero si b se trata como una fila sin saldo.
 * Con `aceptar`, solo vale un orden cuyo saldo de cierre del día deje cuadrar lo que viene después:
 * aceptar(valores) recibe los saldos de cierre posibles (el leído y, si el fallo es el último, el esperado).
 * @returns {{orden: number[], falla: number, causa: 'importe'|'saldo'}|null}
 */
function ordenConUnFallo(bloque, base, presupuesto, aceptar = null) {
  if (bloque.some((u) => u.roto)) return null;
  const p = prepararBloque(bloque);
  if (!p.conSaldo.length) return null;
  const vale = (valores) => !aceptar || aceptar(valores);
  if (p.conSaldo.length === 1) {
    // una sola fila con saldo: el día entero va delante de ella y es ella la que no cuadra
    if (!vale([p.sal[p.conSaldo[0]], base + p.total])) return null;
    return { orden: pasoDeOrden(p, p.llenoN, p.conSaldo[0]), falla: p.conSaldo[0], causa: 'importe' };
  }
  const muertos = new Set();
  const antes = [];
  // Fallo de importe: recorrido sin fallos desde base y, en algún punto, la fila que falla
  const muertosAntes = new Set();
  const dfs = (mb, mn, suma) => {
    const claveAntes = mb * (1 << p.k) + mn;
    if (muertosAntes.has(claveAntes)) return null;
    const libres = p.llenoN & ~mn;
    for (let t = 0; t < p.conSaldo.length; t++) {
      if (mb & (1 << t)) continue;
      const b = p.conSaldo[t];
      const mbTras = mb | (1 << t);
      // filas sin saldo delante de b: si b es la última con saldo, todas las que quedan; si no, las que
      // hacen que alguna de las que quedan cierre el día (saldo(última) = saldo(b) + lo que falta)
      const candidatas = [];
      if (mbTras === p.llenoB) candidatas.push(libres);
      else {
        const vistas = new Set();
        for (let u = 0; u < p.conSaldo.length; u++) {
          if (mbTras & (1 << u)) continue;
          const objetivo = p.sal[b] + p.total - suma - p.imp[b] - p.sal[p.conSaldo[u]];
          for (const s of p.porSuma.get(objetivo) ?? []) if (!(s & ~libres) && !vistas.has(s)) { vistas.add(s); candidatas.push(s); }
        }
      }
      for (const s of candidatas) {
        const tras = suma + p.sumas[s] + p.imp[b];
        if (p.sal[b] === base + tras) continue; // cuadra: no es un fallo
        if (--presupuesto.pasos < 0) return null;
        // saldo de cierre del día con este fallo: lo de después cuadra desde saldo(b)
        if (!vale(mbTras === p.llenoB ? [p.sal[b], base + tras] : [p.sal[b] + p.total - tras])) continue;
        const resto = completar(p, mbTras, mn | s, tras, p.sal[b] - tras, presupuesto, muertos);
        if (resto) return { pasos: [...antes, pasoDeOrden(p, s, b), ...resto], falla: b };
      }
      // o b cuadra y se sigue buscando el fallo más adelante
      for (const s of p.porSuma.get(p.sal[b] - p.imp[b] - base - suma) ?? []) {
        if (s & mn) continue;
        if (--presupuesto.pasos < 0) return null;
        antes.push(pasoDeOrden(p, s, b));
        const r = dfs(mbTras, mn | s, suma + p.sumas[s] + p.imp[b]);
        if (r) return r;
        antes.pop();
      }
    }
    if (presupuesto.pasos >= 0) muertosAntes.add(claveAntes);
    return null;
  };
  const conImporte = dfs(0, 0, 0);
  if (conImporte) return { orden: conImporte.pasos.flat(), falla: conImporte.falla, causa: 'importe' };

  // Fallo de saldo: b como si no trajera saldo (en medio del día, o la última y sin comprobar).
  // El día cierra en base + total.
  if (!vale([base + p.total])) return null;
  for (const b of p.conSaldo) {
    const sinSaldoB = bloque.map((u, i) => (i === b ? { ...u, saldo: null } : u));
    const orden = ordenNucleo(sinSaldoB, base, presupuesto);
    if (orden) return { orden, falla: b, causa: 'saldo' };
    if (p.sal[b] !== base + p.total) {
      const otros = bloque.filter((_, i) => i !== b);
      const ordenOtros = ordenNucleo(otros, base, presupuesto);
      if (ordenOtros) return { orden: [...ordenOtros.map((i) => (i < b ? i : i + 1)), b], falla: b, causa: 'saldo' };
    }
  }
  return null;
}

/** ¿Falla algún saldo del bloque en el orden del archivo? (simulación, sin tocar el estado) */
function fallaEnOrden(us, i, j, ancla, pendiente) {
  for (let k = i; k < j; k++) {
    const u = us[k];
    if (u.roto) return false; // con un importe desconocido no se reordena
    if (u.saldo === null) { pendiente += u.importe; continue; }
    if (ancla !== null && ancla + pendiente + u.importe !== u.saldo) return true;
    ancla = u.saldo;
    pendiente = 0;
  }
  return false;
}

/**
 * Cuántos saldos fallan en el orden del archivo y si el día acaba en filas sin saldo.
 * También el último saldo leído del día, lo que se esperaba en esa fila y la suma de las filas sin saldo de detrás.
 */
function fallosEnOrden(us, i, j, ancla, pendiente) {
  let fallos = 0, acabaEnNulo = false, esperado = null;
  for (let k = i; k < j; k++) {
    const u = us[k];
    if (u.saldo === null) { pendiente += u.importe; acabaEnNulo = true; continue; }
    esperado = ancla === null ? null : ancla + pendiente + u.importe;
    if (esperado !== null && esperado !== u.saldo) fallos++;
    ancla = u.saldo;
    pendiente = 0;
    acabaEnNulo = false;
  }
  return { fallos, acabaEnNulo, ultimo: ancla, esperadoUltimo: esperado, cola: pendiente };
}

// ---------------------------------------------------------------------------------------------
// Saldo encadenado
// ---------------------------------------------------------------------------------------------

/**
 * Recorre las unidades en orden cronológico supuesto y comprueba cada saldo, día a día.
 * Las filas sin saldo se acumulan hasta la siguiente con saldo. Si un día no cuadra en el orden del archivo:
 *   1) se busca otro orden dentro del día en el que cuadre todo (hasta 12 líneas);
 *   2) si el saldo de partida no estaba comprobado, las filas sin saldo que arrastra pueden ser de antes;
 *   3) si no hay orden sin fallos, el orden con un solo fallo que deje el día cerrado (diagnóstico).
 * Tras un fallo se sigue desde el saldo leído (así un importe mal leído marca solo su fila); si la fila o
 * el día siguiente cuadran con lo esperado, lo mal leído es el saldo de esta fila y se sigue desde lo esperado.
 * @param {Array} us unidades
 * @param {number|null} ancla0 saldo inicial declarado (céntimos) o null
 */
function recorrer(us, ancla0) {
  const n = us.length;
  const presupuesto = { pasos: PASOS_POR_RECORRIDO };
  // sumas acumuladas y siguiente unidad con saldo, para el diagnóstico de un fallo
  const pre = new Array(n + 1);
  const rotos = new Array(n + 1);
  pre[0] = 0;
  rotos[0] = 0;
  for (let k = 0; k < n; k++) {
    pre[k + 1] = pre[k] + (us[k].roto ? 0 : us[k].importe);
    rotos[k + 1] = rotos[k] + (us[k].roto ? 1 : 0);
  }
  const sig = new Array(n);
  for (let k = n - 1, prox = -1; k >= 0; k--) {
    sig[k] = prox;
    if (us[k].saldo !== null) prox = k;
  }

  const r = {
    comprobadas: 0, cuadran: 0, fallos: [], bloquesReordenados: 0, filasReordenadas: 0,
    sinComprobar: 0, anclaComparada: false, anclaFinal: null, pendienteFinal: 0,
  };
  let ancla = ancla0;
  let desdeDeclarado = ancla0 !== null; // el saldo de partida es el inicial declarado
  let anclaLibre = false;               // el saldo de partida se ha tomado sin comprobarlo
  let pendiente = 0;
  let acumuladas = [];
  let finBloque = 0;                    // fin (exclusivo) del día que se está aplicando

  const finDelDia = (desde) => {
    let hasta = desde + 1;
    if (us[desde].fecha !== null) while (hasta < n && us[hasta].fecha === us[desde].fecha) hasta++;
    return hasta;
  };
  // ¿Lo que viene a partir de `desde` cuadra partiendo de `valor`? Mira el primer día con algún saldo
  // (con otro orden si hace falta); los días sin ningún saldo de en medio solo suman. Un importe
  // ilegible por el camino no deja decir nada.
  const vistos = new Map(); // (desde, valor) → resultado: la búsqueda de un fallo pregunta lo mismo muchas veces
  const diaCuadraDesde = (desde, valor) => {
    const clave = `${desde}|${valor}`;
    let sabido = vistos.get(clave);
    if (sabido === undefined) vistos.set(clave, (sabido = cuadraDesde(desde, valor)));
    return sabido;
  };
  const cuadraDesde = (desde, valor) => {
    let pend = 0;
    for (let d = desde, saltos = 0; d < n && saltos <= MAX_DIAS_SIN_SALDO; saltos++) {
      const hasta = finDelDia(d);
      let conSaldo = false;
      for (let k = d; k < hasta; k++) {
        if (us[k].roto) return false;
        if (us[k].saldo !== null) conSaldo = true;
      }
      if (conSaldo) {
        if (!fallaEnOrden(us, d, hasta, valor, pend)) return true;
        if (hasta - d > MAX_BLOQUE_REORDENABLE) return ordenPorSaldos(us.slice(d, hasta), valor, pend, presupuesto) !== null;
        return hasta - d > 1 && buscarOrden(us.slice(d, hasta), valor, pend, presupuesto) !== null;
      }
      for (let k = d; k < hasta; k++) pend += us[k].importe;
      d = hasta;
    }
    return false;
  };
  // Suma de las unidades que van detrás de k en su día, si ninguna trae saldo (null si alguna lo trae
  // o es ilegible): con eso se sabe desde dónde empieza el día siguiente si k es el último saldo del día.
  const colaTras = (k) => {
    if (k < 0 || k >= finBloque) return null;
    if (sig[k] !== -1 && sig[k] < finBloque) return null;
    if (rotos[finBloque] !== rotos[k + 1]) return null;
    return pre[finBloque] - pre[k + 1];
  };

  // k: posición de la unidad en el orden del archivo (para mirar la fila siguiente si falla), o -1.
  // forzar: 'saldo' cuando la búsqueda ya ha decidido que lo mal leído es el saldo de esta fila.
  const aplicar = (u, k, forzar = null) => {
    if (u.roto) {
      r.sinComprobar += movimientosDe(acumuladas) + u.idxs.length;
      ancla = u.saldo; // si trae saldo, se vuelve a partir de él sin comprobarlo
      anclaLibre = ancla !== null;
      pendiente = 0; acumuladas = []; desdeDeclarado = false;
      return;
    }
    if (u.saldo === null) { pendiente += u.importe; acumuladas.push(u); return; }
    if (ancla === null) {
      // primera fila con saldo: no se puede comprobar contra nada y no cuenta como fallo
      r.sinComprobar += movimientosDe(acumuladas) + u.idxs.length;
      ancla = u.saldo; pendiente = 0; acumuladas = []; anclaLibre = true;
      return;
    }
    const esperado = ancla + pendiente + u.importe;
    r.comprobadas++;
    if (desdeDeclarado) r.anclaComparada = true;
    if (esperado === u.saldo) {
      r.cuadran++;
      ancla = u.saldo;
    } else {
      let causa = desdeDeclarado ? 'inicial' : 'importe';
      const v = k >= 0 ? sig[k] : -1;
      // Lo mal leído es el saldo si lo que viene después sigue a lo esperado y no al saldo leído:
      // la siguiente fila con saldo en el orden del archivo o, si es el último saldo del día, el día
      // siguiente (aunque venga revuelto). Si los dos lo explican, no se sabe y se queda en importe.
      const cola = colaTras(k);
      const sigue = (x) => (v !== -1 && rotos[v + 1] === rotos[k + 1] && x + (pre[v + 1] - pre[k + 1]) === us[v].saldo)
        || (cola !== null && diaCuadraDesde(finBloque, x + cola));
      if (forzar === 'saldo') causa = 'saldo';
      else if (sigue(esperado) && !sigue(u.saldo)) causa = 'saldo';
      r.fallos.push({ u, ancla, importe: pendiente + u.importe, esperado, causa, acumuladas: [...acumuladas, u] });
      ancla = causa === 'saldo' ? esperado : u.saldo;
      // tras un salto se sigue desde el saldo leído, que tampoco está comprobado
      pendiente = 0; acumuladas = []; desdeDeclarado = false; anclaLibre = causa !== 'saldo';
      return;
    }
    pendiente = 0; acumuladas = []; desdeDeclarado = false; anclaLibre = false;
  };
  // Aplica un orden encontrado para el bloque [i, j). Con `fallo` (de ordenConUnFallo) se sabe qué fila
  // falla y por qué; si es la última del día, se mira la fila siguiente del archivo como en el orden normal.
  const reordenado = (i, j, orden, fallo = null) => {
    const identidad = orden.every((t, k) => t === k);
    // Si detrás de la fila que falla solo quedan las filas sin saldo con las que acaba el día en el
    // archivo, para mirar lo que viene después vale la posición de justo antes de esas filas.
    let tras = 0;
    while (tras < orden.length && orden[orden.length - 1 - tras] === orden.length - 1 - tras && us[i + orden.length - 1 - tras].saldo === null) tras++;
    orden.forEach((t, pos) => {
      const esFallo = fallo !== null && t === fallo.falla;
      const k = identidad ? i + t : esFallo && pos === orden.length - 1 - tras ? j - 1 - tras : -1;
      aplicar(us[i + t], k, esFallo && fallo.causa === 'saldo' ? 'saldo' : null);
    });
    if (identidad) return;
    r.bloquesReordenados++;
    for (let k = i; k < j; k++) r.filasReordenadas += us[k].idxs.length;
  };

  let i = 0;
  while (i < n) {
    const j = finDelDia(i);
    finBloque = j;
    const reordenable = j - i > 1 && j - i <= MAX_BLOQUE_REORDENABLE;
    let hecho = false;
    if (fallaEnOrden(us, i, j, ancla, pendiente)) {
      // 1) otro orden dentro del día (el primer día, mejor uno que deje cuadrar el siguiente)
      const aceptarFin = ancla === null && j < n ? (fin) => diaCuadraDesde(j, fin) : null;
      // (un día de más de 12 líneas, solo si todas traen saldo: se encadenan por el saldo)
      const orden = reordenable ? buscarOrden(us.slice(i, j), ancla, pendiente, presupuesto, aceptarFin)
        : j - i > MAX_BLOQUE_REORDENABLE ? ordenPorSaldos(us.slice(i, j), ancla, pendiente, presupuesto, aceptarFin) : null;
      if (orden) { reordenado(i, j, orden); hecho = true; }
      // 2) las filas sin saldo que van detrás de un saldo no comprobado (el primero) pueden ser de
      //    antes de ese saldo: PDF que pone el saldo de cierre en la primera fila del día. Se quedan
      //    sin comprobar, y el resto de la cadena se comprueba desde ese saldo.
      const sueltas = anclaLibre && acumuladas.length > 0;
      const conSuelto = () => { r.sinComprobar += movimientosDe(acumuladas); pendiente = 0; acumuladas = []; };
      if (!hecho && sueltas) {
        if (!fallaEnOrden(us, i, j, ancla, 0)) {
          conSuelto();
          for (let k = i; k < j; k++) aplicar(us[k], k);
          hecho = true;
        } else {
          const otro = reordenable ? buscarOrden(us.slice(i, j), ancla, 0, presupuesto) : null;
          if (otro) { conSuelto(); reordenado(i, j, otro); hecho = true; }
        }
      }
      // 3) no hay orden sin fallos: si el orden del archivo no lo explica con un solo fallo limpio,
      //    el orden con un solo fallo que deje el día cerrado (para no arrastrar el error a otros días)
      if (!hecho && ancla !== null) {
        const natural = fallosEnOrden(us, i, j, ancla, pendiente);
        // ¿Lo que viene después sigue a lo que deja el orden del archivo (desde el último saldo leído
        // o desde lo esperado en él, más las filas sin saldo de detrás)?
        const sigueTras = (nat) => j < n && (diaCuadraDesde(j, nat.ultimo + nat.cola)
          || (nat.esperadoUltimo !== null && diaCuadraDesde(j, nat.esperadoUltimo + nat.cola)));
        // Un solo fallo y filas sin saldo al final: si lo de después sigue, esas filas van de verdad
        // detrás del último saldo y el orden del archivo es el bueno. Meterlas dentro del día daría
        // otro fallo al día siguiente.
        const naturalSigue = natural.fallos === 1 && sigueTras(natural);
        let buscar = reordenable && (natural.fallos > 1 || (natural.fallos === 1 && natural.acabaEnNulo && !naturalSigue));
        if (sueltas && !naturalSigue && j < n) {
          // como en 2): sin las filas que arrastra el primer saldo, el día tiene un solo fallo y lo de
          // después sigue. Pasa con un saldo mal leído en el día siguiente al primero.
          const nat0 = fallosEnOrden(us, i, j, ancla, 0);
          if (nat0.fallos === 1 && sigueTras(nat0)) {
            conSuelto();
            for (let k = i; k < j; k++) aplicar(us[k], k);
            hecho = true;
            buscar = false;
          }
        }
        if (buscar) {
          const bloque = us.slice(i, j);
          // Entre los órdenes con un solo fallo, mejor uno cuyo cierre deje cuadrar el día siguiente:
          // así el fallo no arrastra otro fallo detrás. Si no hay ninguno así, el primero que se encuentre.
          const aceptar = j < n ? (valores) => valores.some((x) => diaCuadraDesde(j, x)) : null;
          const conUnFallo = (base) => {
            const uno = ordenConUnFallo(bloque, base, presupuesto, aceptar);
            if (uno || !aceptar) return uno;
            // las filas sin saldo del final del día pueden ir de verdad detrás de su último saldo
            let nCola = 0, suma = 0;
            while (nCola < bloque.length && bloque[bloque.length - 1 - nCola].saldo === null) suma += bloque[bloque.length - 1 - nCola++].importe;
            if (nCola === 0 || nCola === bloque.length) return null;
            const sinCola = ordenConUnFallo(bloque.slice(0, bloque.length - nCola), base, presupuesto, (vs) => aceptar(vs.map((x) => x + suma)));
            if (sinCola) for (let t = bloque.length - nCola; t < bloque.length; t++) sinCola.orden.push(t);
            return sinCola;
          };
          let plan = aceptar ? conUnFallo(ancla + pendiente) : null;
          if (!plan && aceptar && sueltas) {
            // como en 2): sin las filas que arrastra el primer saldo, con otro orden y un solo fallo
            const o = conUnFallo(ancla);
            if (o) plan = { ...o, suelto: true };
          }
          if (!plan) plan = ordenConUnFallo(bloque, ancla + pendiente, presupuesto);
          if (plan) {
            if (plan.suelto) conSuelto();
            reordenado(i, j, plan.orden, plan);
            hecho = true;
          }
        }
        if (!hecho && natural.fallos > 1 && j - i > MAX_BLOQUE_REORDENABLE) {
          // día de más de 12 líneas revuelto: si un solo fallo lo explica, ese y no todas las líneas del día
          const plan = ordenPorTramos(us.slice(i, j), ancla + pendiente);
          if (plan) { reordenado(i, j, plan.orden, plan); hecho = true; }
        }
      }
    }
    if (!hecho) {
      const antes = r.fallos.length;
      for (let k = i; k < j; k++) aplicar(us[k], k);
      // Día con varios fallos y sin orden que lo explique: su último saldo en el archivo puede no ser
      // el de cierre. Si uno solo de sus saldos hace que el día siguiente cuadre entero, se sigue
      // desde ese (sin darlo por comprobado), así el problema no se arrastra a los días siguientes.
      if (r.fallos.length - antes > 1 && j < n && !diaCuadraDesde(j, ancla + pendiente)) {
        const candidatos = new Set();
        for (let k = i; k < j; k++) if (us[k].saldo !== null && us[k].saldo !== ancla && diaCuadraDesde(j, us[k].saldo)) candidatos.add(us[k].saldo);
        if (candidatos.size === 1) {
          r.sinComprobar += movimientosDe(acumuladas);
          ancla = [...candidatos][0]; pendiente = 0; acumuladas = []; anclaLibre = true;
        }
      }
    }
    i = j;
  }
  r.sinComprobar += movimientosDe(acumuladas);
  r.anclaFinal = ancla;
  r.pendienteFinal = pendiente;
  return r;
}

/** Las mismas unidades con las de cada día al revés (el día, en el sentido contrario al de los días). */
function diasAlReves(unidades) {
  const r = [];
  let i = 0;
  while (i < unidades.length) {
    let j = i + 1;
    if (unidades[i].fecha !== null) while (j < unidades.length && unidades[j].fecha === unidades[i].fecha) j++;
    for (let k = j - 1; k >= i; k--) r.push(unidades[k]);
    i = j;
  }
  return r;
}

/**
 * Prueba el orden del archivo y el inverso (se queda con el que más saldos explica, después con el de menos
 * fallos y, si empatan, con el que dicen las fechas) y, si aún falla algo, también con cada día al revés:
 * bancos que ponen los días de lo más antiguo a lo más nuevo y, dentro del día, lo último arriba.
 */
function evaluarCadena(unidades, ancla0) {
  let primera = null, ultima = null;
  for (const u of unidades) if (u.fecha) { primera = u.fecha; break; }
  for (let k = unidades.length - 1; k >= 0; k--) if (unidades[k].fecha) { ultima = unidades[k].fecha; break; }
  const prefiereDesc = primera !== null && ultima !== null && primera > ultima;
  // Primero el sentido que dicen las fechas. Si ahí cuadra todo, los otros como mucho empatan
  // (comprueban las mismas filas) y el empate es para este: no hace falta probarlos.
  const preferido = recorrer(prefiereDesc ? unidades.slice().reverse() : unidades, ancla0);
  if (preferido.fallos.length === 0) return { ...preferido, orden: prefiereDesc ? 'descendente' : 'ascendente' };
  const otro = recorrer(prefiereDesc ? unidades : unidades.slice().reverse(), ancla0);
  // entre los dos sentidos, el que más saldos explica; después, el de menos fallos; si empatan, el de las fechas
  let mejor = { r: preferido, desc: prefiereDesc };
  if (otro.cuadran > preferido.cuadran || (otro.cuadran === preferido.cuadran && otro.fallos.length < preferido.fallos.length)) {
    mejor = { r: otro, desc: !prefiereDesc };
  }
  let filasEnDiasDeVarias = 0;
  for (let i = 0; i < unidades.length; i++) {
    const conOtra = (i > 0 && unidades[i - 1].fecha === unidades[i].fecha) || (i + 1 < unidades.length && unidades[i + 1].fecha === unidades[i].fecha);
    if (conOtra && unidades[i].fecha !== null) filasEnDiasDeVarias += unidades[i].idxs.length;
  }
  if (mejor.r.fallos.length && filasEnDiasDeVarias) {
    // Con cada día al revés solo si tiene menos fallos, contando como un fallo más cada fila que deja sin
    // comprobar de más: si no, un importe mal leído del primer día se escondería delante del primer saldo,
    // que no se comprueba con nada.
    const alReves = diasAlReves(unidades);
    const coste = (r) => r.fallos.length + r.sinComprobar;
    for (const desc of [prefiereDesc, !prefiereDesc]) {
      const r = recorrer(desc ? alReves.slice().reverse() : alReves, ancla0);
      if (r.fallos.length < mejor.r.fallos.length && coste(r) < coste(mejor.r)) mejor = { r, desc, alReves: true };
    }
  }
  const r = { ...mejor.r, orden: mejor.desc ? 'descendente' : 'ascendente' };
  // con los días al revés, todas las filas de los días de más de una línea han cambiado de sitio
  if (mejor.alReves) { r.filasReordenadas += filasEnDiasDeVarias; r.bloquesReordenados += 1; }
  return r;
}

// ---------------------------------------------------------------------------------------------
// Saldos declarados (N43 11/33, camt OPBD/CLBD, MT940 60F/62F, PDF «saldo anterior/final»)
// ---------------------------------------------------------------------------------------------

function divisaPrincipal(lectura, grupos) {
  const d = lectura?.extra?.divisa;
  if (typeof d === 'string' && /^[A-Za-z]{3}$/.test(d)) return d.toUpperCase();
  const cuenta = new Map();
  for (const g of grupos) cuenta.set(g.divisa, (cuenta.get(g.divisa) ?? 0) + g.indices.length);
  let mejor = null, max = -1;
  for (const [div, n] of cuenta) if (n > max || (n === max && div === 'EUR')) { mejor = div; max = n; }
  return mejor ?? 'EUR';
}

function sumaGrupos(gs) {
  let suma = 0;
  for (const g of gs) for (const u of g.unidades) { if (u.roto) return null; suma += u.importe; }
  return suma;
}

/**
 * Saldos declarados por la lectura. Un lector con varias cuentas puede dar los suyos en
 * extra.saldos_declarados = [{cuenta?, divisa?, saldo_inicial, saldo_final}]; si no, se usan
 * lectura.saldo_inicial y lectura.saldo_final, que valen para la divisa principal del archivo.
 */
function resolverDeclarados(lectura, grupos, principal) {
  const extra = lectura?.extra?.saldos_declarados;
  const lista = Array.isArray(extra) && extra.length
    ? extra
    : [{ saldo_inicial: lectura?.saldo_inicial, saldo_final: lectura?.saldo_final }];
  const entradas = [];
  for (const d of lista) {
    const si = finito(d?.saldo_inicial) ? aCentimos(d.saldo_inicial) : null;
    const sf = finito(d?.saldo_final) ? aCentimos(d.saldo_final) : null;
    if (si === null && sf === null) continue;
    const divisa = d.divisa ? String(d.divisa).toUpperCase() : principal;
    const conCuenta = d.cuenta !== undefined && d.cuenta !== null;
    let alcance = grupos.filter((g) => g.divisa === divisa && (!conCuenta || g.cuenta === d.cuenta));
    const e = {
      divisa, cuenta: conCuenta ? d.cuenta : null, si, sf, alcance, grupo: alcance.length === 1 ? alcance[0] : null,
      suma: null, esperado: null, cuadra: null, comprobacion: null,
    };
    if (si !== null && sf !== null) {
      let suma = sumaGrupos(alcance);
      if (suma !== null && si + suma !== sf && alcance.length > 1) {
        // varias cuentas en la misma divisa y un solo par: si cuadra con una de ellas, es la suya
        const una = alcance.find((g) => { const s = sumaGrupos([g]); return s !== null && si + s === sf; });
        if (una) { alcance = [una]; e.alcance = alcance; e.grupo = una; e.cuenta = una.cuenta; suma = sumaGrupos([una]); }
      }
      if (suma !== null) {
        e.suma = suma;
        e.esperado = si + suma;
        e.cuadra = e.esperado === sf;
        e.comprobacion = 'suma';
      }
    }
    entradas.push(e);
  }
  return entradas;
}

function salidaDeclarado(e) {
  return {
    divisa: e.divisa,
    cuenta: e.cuenta,
    saldo_inicial: aEuros(e.si),
    saldo_final: aEuros(e.sf),
    suma_movimientos: aEuros(e.suma),
    saldo_final_esperado: aEuros(e.esperado),
    diferencia: e.cuadra === null || e.sf === null || e.esperado === null ? null : aEuros(e.sf - e.esperado),
    cuadra: e.cuadra,
    comprobacion: e.comprobacion, // 'suma' | 'cadena_inicial' | 'cadena_final' | null (no se pudo comprobar)
  };
}

// ---------------------------------------------------------------------------------------------
// validarSaldos
// ---------------------------------------------------------------------------------------------

function salidaFallo(f, movs, g) {
  const m = movs[f.u.rep];
  const o = m.origen ?? {};
  const fila = { id: m.id, archivo: o.archivo ?? null, fila: o.fila ?? null };
  if (o.pagina !== undefined && o.pagina !== null) fila.pagina = o.pagina;
  if (o.hoja !== undefined && o.hoja !== null) fila.hoja = o.hoja;
  fila.fecha = m.fecha;
  fila.divisa = g.divisa;
  if (g.cuenta !== null) fila.cuenta = g.cuenta;
  fila.saldo_anterior = aEuros(f.ancla);
  fila.importe = aEuros(f.importe); // lo movido desde el último saldo (si hay filas sin saldo, su suma)
  fila.saldo_esperado = aEuros(f.esperado);
  fila.saldo_leido = aEuros(f.u.saldo);
  fila.diferencia = aEuros(f.u.saldo - f.esperado); // leído − esperado
  fila.causa = f.causa; // 'importe' | 'saldo' | 'inicial'
  fila.codigo = `fila_${f.causa}`;
  fila.ids = f.acumuladas.flatMap((u) => u.idxs.map((k) => movs[k].id));
  fila._pos = f.u.rep;
  return fila;
}

/**
 * Comprueba los saldos de una lectura.
 * @param {import('./modelo.js').LecturaArchivo} lectura
 * @returns {{
 *   archivo: string|null,
 *   validacion: 'verificada'|'no_cuadra'|'sin_verificar',
 *   filas_que_no_cuadran: Array<{id, archivo, fila, pagina?, hoja?, fecha, divisa, cuenta?, saldo_anterior, importe,
 *                                saldo_esperado, saldo_leido, diferencia, causa, codigo, ids}>,
 *   orden: 'ascendente'|'descendente'|null,
 *   metodo: 'saldo_encadenado'|'saldos_declarados'|'ambos'|null,
 *   comprobadas: number, cuadran: number, sin_comprobar: number, prefijos: string[],
 *   declarados: Array<{divisa, cuenta, saldo_inicial, saldo_final, suma_movimientos, saldo_final_esperado,
 *                      diferencia, cuadra, comprobacion}>,
 *   grupos: Array<{cuenta, divisa, movimientos, con_saldo, comprobadas, cuadran, no_cuadran, sin_comprobar,
 *                  reordenadas, orden, validacion}>,
 *   avisos: Array<{codigo, datos?}>, aviso: {codigo, datos?}
 * }}
 */
export function validarSaldos(lectura) {
  const movs = Array.isArray(lectura?.movimientos) ? lectura.movimientos : [];
  const grupos = agrupar(movs);
  for (const g of grupos) g.unidades = crearUnidades(movs, g.indices);
  const principal = divisaPrincipal(lectura, grupos);
  const declarados = resolverDeclarados(lectura, grupos, principal);

  // Saldo encadenado por cuenta y divisa
  for (const g of grupos) {
    const dec = declarados.find((e) => e.grupo === g) ?? null;
    const ancla0 = dec && dec.si !== null ? dec.si : null;
    g.cadena = hayCadena(g.unidades, ancla0 !== null);
    g.res = g.cadena ? evaluarCadena(g.unidades, ancla0) : null;
    if (!g.cadena && g.unidades.filter((u) => u.saldo !== null).length >= MIN_SALDOS_SUELTOS) {
      // Menos de la mitad con saldo (una foto en la que no se leen todos): la cadena vale si casi todo cuadra.
      // Unos números sueltos que no son saldos no encadenan nunca, y entonces sigue «sin verificar».
      const res = evaluarCadena(g.unidades, ancla0);
      if (res.comprobadas >= MIN_SALDOS_SUELTOS - 1 && res.cuadran >= res.comprobadas * MIN_CUADRAN_SUELTOS) { g.cadena = true; g.res = res; }
    }
    if (g.res && dec) {
      if (dec.comprobacion === null && dec.si !== null && g.res.anclaComparada) {
        // solo saldo inicial: se ha comprobado con la primera fila
        dec.comprobacion = 'cadena_inicial';
        dec.cuadra = !g.res.fallos.some((f) => f.causa === 'inicial');
      } else if (dec.comprobacion === null && dec.si === null && dec.sf !== null && g.res.anclaFinal !== null) {
        // solo saldo final: el último saldo leído más lo que viene detrás tiene que dar el final
        dec.comprobacion = 'cadena_final';
        dec.esperado = g.res.anclaFinal + g.res.pendienteFinal;
        dec.cuadra = dec.esperado === dec.sf;
      }
    }
  }

  // Estado de cada grupo. Un importe ilegible impide darlo por verificado (su fila no se ha comprobado).
  for (const g of grupos) {
    const deEsteGrupo = declarados.filter((e) => e.alcance.includes(g) && e.cuadra !== null);
    const fallos = g.res ? g.res.fallos.length : 0;
    const roto = g.unidades.some((u) => u.roto);
    if (fallos > 0 || deEsteGrupo.some((e) => e.cuadra === false)) g.estado = 'no_cuadra';
    else if (!roto && ((g.res && g.res.comprobadas > 0) || deEsteGrupo.some((e) => e.cuadra === true))) g.estado = 'verificada';
    else g.estado = 'sin_verificar';
  }

  // Veredicto: cuentan los grupos en euros (si no hay euros, todos). Un grupo de una sola línea no se
  // puede comprobar por naturaleza (como la primera fila de cualquier cadena) y no lo impide.
  const relevantes = grupos.some((g) => g.divisa === 'EUR') ? grupos.filter((g) => g.divisa === 'EUR') : grupos;
  const declaradoMal = declarados.some((e) => e.cuadra === false);
  const veredicto = (estado) => {
    if (grupos.some((g) => estado(g) === 'no_cuadra') || declaradoMal) return 'no_cuadra';
    const comprobables = relevantes.filter((g) => g.unidades.length >= 2 || estado(g) === 'verificada');
    return comprobables.length > 0 && comprobables.every((g) => estado(g) === 'verificada') ? 'verificada' : 'sin_verificar';
  };
  const validacion = veredicto((g) => g.estado);
  // Lo que saldría sin las filas que no cuadran (combinarValidaciones lo usa cuando todos los movimientos
  // de esas filas se han quitado por estar también en otro archivo): cada grupo vale por lo que sí ha
  // cuadrado, y lo que no se ha podido comprobar sigue sin comprobar.
  const validacionSinFallos = veredicto((g) => {
    if (g.estado !== 'no_cuadra') return g.estado;
    const deEsteGrupo = declarados.filter((e) => e.alcance.includes(g) && e.cuadra !== null);
    if (deEsteGrupo.some((e) => e.cuadra === false)) return 'no_cuadra';
    const roto = g.unidades.some((u) => u.roto);
    return !roto && ((g.res && g.res.cuadran > 0) || deEsteGrupo.some((e) => e.cuadra === true)) ? 'verificada' : 'sin_verificar';
  });

  const usaCadena = grupos.some((g) => g.res && g.res.comprobadas > 0);
  const usaDeclarados = declarados.some((e) => e.cuadra !== null);
  const usaSuma = declarados.some((e) => e.comprobacion === 'suma');
  const metodo = usaCadena ? (usaDeclarados ? 'ambos' : 'saldo_encadenado') : usaSuma ? 'saldos_declarados' : null;

  // Orden: el del grupo principal (el más grande de los relevantes con cadena)
  let orden = null, mayor = -1;
  for (const g of relevantes) if (g.res && g.unidades.length > mayor) { mayor = g.unidades.length; orden = g.res.orden; }
  if (orden === null) for (const g of grupos) if (g.res && g.unidades.length > mayor) { mayor = g.unidades.length; orden = g.res.orden; }

  const filas = [];
  for (const g of grupos) if (g.res) for (const f of g.res.fallos) filas.push(salidaFallo(f, movs, g));
  filas.sort((a, b) => a._pos - b._pos);
  for (const f of filas) delete f._pos;

  const avisos = [];
  const reordenadas = grupos.reduce((s, g) => s + (g.res ? g.res.filasReordenadas : 0), 0);
  if (reordenadas > 0) avisos.push(aviso('orden_mismo_dia', { n: reordenadas }));
  for (const e of declarados) {
    if (e.cuadra !== false) continue;
    const datos = { divisa: e.divisa, diferencia: e.sf !== null && e.esperado !== null ? aEuros(e.sf - e.esperado) : null };
    avisos.push(aviso(e.comprobacion === 'cadena_final' ? 'no_cuadra_saldo_final' : 'no_cuadra_declarados', datos));
  }
  const sinVerificar = new Set();
  for (const g of grupos) {
    if (relevantes.includes(g) || g.estado !== 'sin_verificar' || g.unidades.length < 2 || sinVerificar.has(g.divisa)) continue;
    sinVerificar.add(g.divisa);
    avisos.push(aviso('divisa_sin_verificar', { divisa: g.divisa }));
  }

  const resultado = {
    archivo: lectura?.archivo ?? null,
    prefijos: [...new Set(movs.filter(Boolean).map((m) => prefijoId(m.id)))],
    validacion,
    validacion_sin_fallos: validacionSinFallos,
    filas_que_no_cuadran: filas,
    orden,
    metodo,
    comprobadas: grupos.reduce((s, g) => s + (g.res ? g.res.comprobadas : 0), 0) + declarados.filter((e) => e.comprobacion === 'suma').length,
    cuadran: grupos.reduce((s, g) => s + (g.res ? g.res.cuadran : 0), 0) + declarados.filter((e) => e.comprobacion === 'suma' && e.cuadra).length,
    // movimientos que ninguna comprobación de saldo cubre (la primera fila, los de antes del primer saldo…)
    sin_comprobar: grupos.reduce((s, g) => s + (g.res ? g.res.sinComprobar : g.indices.length), 0),
    declarados: declarados.map(salidaDeclarado),
    grupos: grupos.map((g) => ({
      cuenta: g.cuenta,
      divisa: g.divisa,
      movimientos: g.indices.length,
      con_saldo: g.unidades.filter((u) => u.saldo !== null).length,
      comprobadas: g.res ? g.res.comprobadas : 0,
      cuadran: g.res ? g.res.cuadran : 0,
      no_cuadran: g.res ? g.res.fallos.length : 0,
      sin_comprobar: g.res ? g.res.sinComprobar : g.indices.length, // movimientos que ninguna comprobación cubre
      reordenadas: g.res ? g.res.filasReordenadas : 0,
      orden: g.res ? g.res.orden : null,
      validacion: g.estado,
    })),
    avisos,
  };
  resultado.aviso = avisoValidacion(resultado, { nivel: lectura?.nivel });
  return resultado;
}

/**
 * Aviso principal (código + datos) para enseñar el resultado de la validación.
 * @param {{validacion, filas_que_no_cuadran?, metodo?, declarados?}} v
 * @param {{nivel?: 'A'|'B'|'C'}} [opciones] en nivel C (fotos) el texto de «sin verificar» habla de la foto
 */
export function avisoValidacion(v, opciones = {}) {
  if (!v) return aviso('sin_verificar');
  if (v.validacion === 'verificada') {
    if (v.metodo === 'saldos_declarados') return aviso('verificada_declarados');
    if (v.metodo === 'ambos') return aviso('verificada_ambos');
    return aviso('verificada');
  }
  if (v.validacion === 'no_cuadra') {
    const n = v.filas_que_no_cuadran?.length ?? 0;
    if (n === 1) return aviso('no_cuadra_una', { n });
    if (n > 1) return aviso('no_cuadra', { n });
    const final = (v.declarados ?? []).some((e) => e.cuadra === false && e.comprobacion === 'cadena_final');
    return aviso(final ? 'no_cuadra_saldo_final' : 'no_cuadra_declarados');
  }
  return aviso(opciones.nivel === 'C' ? 'sin_verificar_foto' : 'sin_verificar');
}

/**
 * Ids de los movimientos cuyo saldo parece mal leído (la fila siguiente vuelve a cuadrar).
 * Se pasan a unir() para que ese saldo no impida reconocer un duplicado.
 * @param {Array} validaciones resultados de validarSaldos
 * @returns {Set<string>}
 */
export function saldosNoFiables(validaciones) {
  const ids = new Set();
  for (const v of validaciones ?? []) for (const f of v?.filas_que_no_cuadran ?? []) if (f.causa === 'saldo') ids.add(f.id);
  return ids;
}

/**
 * Junta la validación de varios archivos en una sola (lectura.validacion del resultado).
 * Si se pasan los movimientos que quedan tras unir(), un archivo que no aporta ningún movimiento
 * (todo repetido) no cuenta, y una fila que no cuadra solo cuenta si su movimiento sigue en la lista.
 * @param {Array} validaciones resultados de validarSaldos (con su campo archivo)
 * @param {{movimientos?: Array, nivel?: string}} [opciones]
 */
export function combinarValidaciones(validaciones, opciones = {}) {
  let lista = (validaciones ?? []).filter(Boolean);
  let vivas = null;
  if (Array.isArray(opciones.movimientos)) {
    vivas = new Set(opciones.movimientos.map((m) => m.id));
    // un archivo aporta si queda algún movimiento suyo (por nombre o por el prefijo de sus ids)
    const nombres = new Set(opciones.movimientos.map((m) => m.origen?.archivo));
    const prefijos = new Set(opciones.movimientos.map((m) => prefijoId(m.id)));
    lista = lista.filter((v) => nombres.has(v.archivo) || (v.prefijos ?? []).some((x) => prefijos.has(x)));
  }
  const filas = [];
  let hayFallo = false;
  let todasVerificadas = lista.length > 0;
  for (const v of lista) {
    const suyas = (v.filas_que_no_cuadran ?? []).filter((f) => vivas === null || (f.ids ?? [f.id]).some((id) => vivas.has(id)));
    filas.push(...suyas);
    const declaradoMal = (v.declarados ?? []).some((e) => e.cuadra === false);
    if (suyas.length || declaradoMal) hayFallo = true;
    // Si todas sus filas que no cuadran se han quitado por repetidas, el archivo vale por lo que sí ha
    // cuadrado: una parte suya sin comprobar (otra cuenta sin saldos, un importe ilegible) sigue sin comprobar.
    const sinSusFallos = v.validacion_sin_fallos ?? (v.validacion === 'no_cuadra' ? 'sin_verificar' : v.validacion);
    const verificadaTrasUnir = v.validacion === 'verificada'
      || (v.validacion === 'no_cuadra' && !suyas.length && !declaradoMal && sinSusFallos === 'verificada');
    if (!verificadaTrasUnir) todasVerificadas = false;
  }
  const metodos = new Set(lista.map((v) => v.metodo).filter(Boolean));
  const combinada = {
    validacion: hayFallo ? 'no_cuadra' : todasVerificadas ? 'verificada' : 'sin_verificar',
    filas_que_no_cuadran: filas,
    metodo: metodos.size === 1 ? [...metodos][0] : metodos.size > 1 ? 'ambos' : null,
    archivos: lista.map((v) => ({ archivo: v.archivo, validacion: v.validacion })),
    declarados: lista.flatMap((v) => v.declarados ?? []),
  };
  combinada.aviso = avisoValidacion(combinada, { nivel: opciones.nivel });
  return combinada;
}

// ---------------------------------------------------------------------------------------------
// Fechas, periodo y huecos
// ---------------------------------------------------------------------------------------------

function hueco(desde, hasta, dias) {
  return { desde, hasta, dias };
}

/** La regla del periodo corto, igual que en detectar(): hay movimientos y menos de 3 meses. */
export function esCorto(movimientos, meses) {
  return movimientos > 0 && meses < MESES_MINIMOS;
}

function avisoFechas(lista, codigo, cual) {
  if (!lista.length) return null;
  const fechas = lista.map((m) => m.fecha).filter((f) => typeof f === 'string').sort();
  const datos = { n: lista.length, ids: lista.slice(0, MAX_IDS).map((m) => m.id) };
  if (fechas.length) datos.fecha = cual === 'max' ? fechas[fechas.length - 1] : fechas[0];
  return aviso(lista.length === 1 ? `${codigo}_una` : codigo, datos);
}

/**
 * Periodo analizado, huecos de más de 35 días sin movimientos y fechas que no pueden ser.
 * - Fechas posteriores a mañana (hoy + 1) o anteriores al 1-1-2000: aviso con sus ids, y fuera del periodo.
 * - Hueco: días seguidos sin ningún movimiento; desde/hasta son el primer y el último día vacío.
 * - Si el extracto declara su periodo (opciones.desde/hasta), se usa ese periodo: solo amplía el de los
 *   movimientos (el periodo real puede empezar antes del primero). El final nunca pasa de hoy, y un borde
 *   declarado a más de un año de los movimientos se toma por mal leído. Los bordes vacíos también son huecos.
 * - meses = mesesEntre(desde, hasta). Corto es la misma regla que usa detectar(): hay movimientos y
 *   meses < 3 (sin ninguna fecha que se pueda leer, meses = 0 y también es corto). Si es corto, y solo
 *   entonces, va el aviso 'periodo_corto'.
 * - Con opciones.cubiertos (el periodo que declara cada extracto), un hueco que cae entero dentro de uno
 *   no es que falte un extracto: el banco dice que en esos días no hubo movimientos. Sale en `huecos`
 *   con cubierto: true y sin aviso.
 * @param {Array} movimientos
 * @param {{hoy?: string, desde?: string, hasta?: string, cubiertos?: Array<{desde: string, hasta: string}>}} [opciones]
 */
export function analizarFechas(movimientos, opciones = {}) {
  const hoy = esISO(opciones.hoy) ? opciones.hoy : hoyISO();
  const tope = sumarDias(hoy, 1);
  const futuras = [], antiguas = [], invalidas = [];
  const dias = new Set();
  let hay = 0;
  for (const m of Array.isArray(movimientos) ? movimientos : []) {
    if (!m) continue;
    hay++;
    const f = m.fecha;
    if (!esISO(f)) invalidas.push(m);
    else if (f > tope) futuras.push(m);
    else if (f < FECHA_MINIMA) antiguas.push(m);
    else dias.add(f);
  }
  let fechas = [...dias].sort();
  // si ninguna fecha es plausible se usan las que haya: los avisos ya explican el problema
  if (!fechas.length) fechas = [...new Set([...antiguas, ...futuras].map((m) => m.fecha))].sort();

  const avisos = [];
  const fuera = {
    futuras: futuras.map((m) => m.id),
    antiguas: antiguas.map((m) => m.id),
    sin_fecha: invalidas.map((m) => m.id),
  };
  const avisosFecha = [
    avisoFechas(futuras, 'fecha_futura', 'max'),
    avisoFechas(antiguas, 'fecha_antigua', 'min'),
    avisoFechas(invalidas, 'fecha_no_valida', 'min'),
  ].filter(Boolean);

  if (!fechas.length) {
    // sin ninguna fecha: no se sabe el periodo y, como en detectar() (meses = 0), no se da nada por seguro
    const corto = esCorto(hay, 0);
    return {
      periodo: { desde: null, hasta: null, dias: 0, meses: 0, corto, declarado: false },
      huecos: [], avisos: [...(corto ? [aviso('periodo_corto', { meses: 0, dias: 0 })] : []), ...avisosFecha], fuera_de_rango: fuera,
    };
  }

  let desde = fechas[0];
  let hasta = fechas[fechas.length - 1];
  let declarado = false;
  const huecos = [];
  const dDesde = esISO(opciones.desde) && opciones.desde >= FECHA_MINIMA && opciones.desde < desde
    && diasEntre(opciones.desde, desde) <= MAX_DIAS_DECLARADO_FUERA ? opciones.desde : null;
  let dHasta = esISO(opciones.hasta) ? (opciones.hasta > hoy ? hoy : opciones.hasta) : null;
  if (dHasta !== null && (!(dHasta > hasta) || diasEntre(hasta, dHasta) > MAX_DIAS_DECLARADO_FUERA)) dHasta = null;

  if (dDesde) {
    const vacios = diasEntre(dDesde, desde);
    if (vacios > DIAS_HUECO) huecos.push(hueco(dDesde, sumarDias(desde, -1), vacios));
    desde = dDesde;
    declarado = true;
  }
  for (let i = 1; i < fechas.length; i++) {
    const vacios = diasEntre(fechas[i - 1], fechas[i]) - 1;
    if (vacios > DIAS_HUECO) huecos.push(hueco(sumarDias(fechas[i - 1], 1), sumarDias(fechas[i], -1), vacios));
  }
  if (dHasta) {
    const vacios = diasEntre(hasta, dHasta);
    if (vacios > DIAS_HUECO) huecos.push(hueco(sumarDias(hasta, 1), dHasta, vacios));
    hasta = dHasta;
    declarado = true;
  }

  const meses = mesesEntre(desde, hasta);
  const periodo = { desde, hasta, dias: diasEntre(desde, hasta) + 1, meses, corto: esCorto(hay, meses), declarado };
  if (periodo.corto) avisos.push(aviso('periodo_corto', { meses, dias: periodo.dias }));
  // periodos declarados, juntando los que se tocan (un extracto acaba el 31 y el siguiente empieza el 1)
  const cubiertos = [];
  for (const c of (Array.isArray(opciones.cubiertos) ? opciones.cubiertos : [])
    .filter((x) => x && esISO(x.desde) && esISO(x.hasta) && x.desde <= x.hasta)
    .sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0))) {
    const ult = cubiertos[cubiertos.length - 1];
    if (ult && sumarDias(ult.hasta, 1) >= c.desde) { if (c.hasta > ult.hasta) ult.hasta = c.hasta; } else cubiertos.push({ desde: c.desde, hasta: c.hasta });
  }
  for (const h of huecos) {
    if (cubiertos.some((c) => c.desde <= h.desde && c.hasta >= h.hasta)) { h.cubierto = true; continue; }
    avisos.push(aviso('hueco', { ...h, desde_fecha: fechaCorta(h.desde), hasta_fecha: fechaCorta(h.hasta) }));
  }
  avisos.push(...avisosFecha);
  return { periodo, huecos, avisos, fuera_de_rango: fuera };
}
