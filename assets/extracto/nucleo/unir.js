// Unión de varios archivos en una sola lista de movimientos: quita los repetidos entre archivos
// distintos y deja las otras monedas aparte. Lógica pura: sin DOM, sin red, sin almacenamiento.
//
// Un duplicado es la misma fecha + importe en céntimos + concepto normalizado (+ saldo si lo traen los dos)
// en la misma cuenta, si los dos dicen la suya. Reglas por orden: clave exacta; mismo importe y saldo; mismo
// importe y concepto recortado o escrito de otra forma (también si la fecha de uno es la fecha valor del otro);
// y, entre archivos que coinciden en casi todo, mismo importe y concepto a 3 días o menos.
// Solo se quitan entre archivos distintos y con la unión de multiconjuntos: si un movimiento aparece 2 veces
// en un archivo y 3 en otro, quedan 3. Así dos cafés iguales del mismo día nunca se pierden. Las lecturas de un
// mismo archivo (las cuentas de un Norma 43, camt o MT940, las hojas de un libro) cuentan como un solo archivo:
// entre ellas nunca se quita nada. Dos archivos que no dicen su cuenta y que apenas coinciden en los días que
// comparten se toman por cuentas distintas, y entre ellos tampoco.
// Cada movimiento quitado queda apuntado (con su archivo y fila) junto al que se ha quedado.
// Se queda el del archivo mejor leído (hoja o CSV antes que PDF, PDF antes que foto) y, a igual nivel, el primero.

import { aCentimos } from './numeros.js';
import { normalizar } from './texto.js';
import { aviso } from './modelo.js';
import { lineaDeOrigen } from './validar.js';

/** Longitud mínima (sin espacios ni signos) del concepto más corto para casar conceptos recortados. */
const MIN_CONCEPTO_RECORTADO = 6;
/** Letras mínimas de las palabras propias del concepto más corto para casarlo por palabras. */
const MIN_LETRAS_PROPIAS = 5;
/** Dos archivos sin cuenta son de la misma si al menos esta parte de sus movimientos comunes coincide. */
const MIN_AFINIDAD = 0.5;
/** Días de margen para la afinidad (fecha de operación frente a fecha valor). */
const DIAS_AFINIDAD = 3;
/** Para casar un movimiento con otro de fecha cercana, los dos archivos tienen que coincidir en esta parte. */
const MIN_AFINIDAD_FECHA = 0.8;
/** Días de distancia como mucho para casar por fecha cercana. */
const DIAS_FECHA_CERCANA = 3;

// Palabras que dicen el tipo de operación y no quién cobra: no bastan para reconocer un concepto recortado.
const GENERICAS = new Set([
  'COMPRA', 'COMPRAS', 'TARJ', 'TARJETA', 'TARGETA', 'CARD', 'PAGO', 'PAGAMENT', 'PAYMENT', 'RECIBO', 'REBUT', 'ADEUDO', 'SEPA',
  'DOMICILIACION', 'DOMICILIADO', 'CARGO', 'CARREC', 'ABONO', 'ABONAMENT', 'TRANSFERENCIA', 'TRANSF', 'TRANS', 'TRF', 'TRANSFER',
  'OPERACION', 'COMISION', 'COMISSIO', 'CON', 'LA', 'EL', 'LOS', 'LAS', 'DEL', 'POR', 'PARA', 'FAVOR', 'EN', 'DE', 'AMB', 'PER',
  'THE', 'AND', 'FOR', 'TO', 'FROM', 'WWW', 'COM', 'HTTP', 'HTTPS', 'REF', 'NUM', 'FECHA', 'DATA', 'DATE', 'CREDITO', 'DEBITO',
  'BIZUM', 'DEVOLUCION', 'DEVOLUCIO', 'INGRESO', 'INGRES', 'RETIRADA', 'CAJERO', 'CAIXER', 'EFECTIVO', 'TRASPASO', 'TRASPAS',
]);
const GENERICAS_LISTA = [...GENERICAS];
/** Palabra genérica, o el principio de una (un formato que corta «RECIBO» en «RECIB»). */
const esGenerica = (p) => GENERICAS.has(p) || GENERICAS_LISTA.some((g) => g.length > p.length && g.startsWith(p));

const finito = (n) => typeof n === 'number' && Number.isFinite(n);
const esFecha = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f);
const numeroDeDia = (f) => Math.round(Date.parse(f + 'T00:00:00Z') / 86400000);
const aEuros = (c) => (c === 0 ? 0 : c / 100);

/** Concepto para comparar: normalizado (mayúsculas, sin acentos) y sin espacios ni signos. */
export function claveConcepto(concepto) {
  return normalizar(concepto).replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Palabras de un concepto para casar conceptos que un formato recorta o escribe de otra forma
 * («COMPRA EN NETFLIX.COM, CON LA TARJETA 4940XXXXXXXX1234» y «COMPRA NETFLIX.COM»).
 * Se quedan fuera las cifras sueltas (fechas, referencias) y las tarjetas enmascaradas.
 */
function palabrasDe(concepto) {
  const todas = normalizar(concepto).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const palabras = todas.filter((p) => !/\d/.test(p) || /^\p{L}+\d{1,2}$/u.test(p)); // «PLUS1» sí; «4940XXXX1234» o «2026» no
  const propias = palabras.filter((p) => p.length >= 3 && !esGenerica(p));
  return { palabras, propias, letras: propias.reduce((s, p) => s + p.length, 0) };
}

/**
 * Identidad de una cuenta para comparar archivos distintos.
 *  · Número de cuenta o IBAN (8 cifras o más, o enmascarado con * o X): sus 4 últimas cifras, así casan
 *    «ES91 2100 0418 4502 0005 1332», «2100-0418-0200051332» y «**** 1332».
 *  · Nombre de cuenta o bolsillo («Current EUR», «Savings EUR»): el nombre normalizado.
 * Norma 43 y OFX dan la cuenta como objeto ({entidad, oficina, numero} o {banco, oficina, numero}).
 * @returns {{cifras: string}|{texto: string}|null}
 */
export function identidadCuenta(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'object') valor = valor.iban ?? valor.numero ?? null;
  if (valor === null || valor === undefined || typeof valor === 'object') return null;
  const s = String(valor).trim();
  if (!s) return null;
  const cifras = s.replace(/\D/g, '');
  const enmascarada = /[*•·xX]{2,}[\s.-]*\d{4,}\s*$/.test(s);
  if (cifras.length >= 8 || (enmascarada && cifras.length >= 4)) return { cifras: cifras.slice(-4) };
  const texto = normalizar(s).replace(/[^A-Z0-9]/g, '');
  return texto ? { texto } : null;
}

/** "3-12" → "3"; "3.1-4" → "3.1" (el id de un movimiento es «índice del archivo»-«n»). Sin guion, null. */
function prefijoDe(id) {
  const m = String(id ?? '').match(/^(.+)-[^-]+$/);
  return m ? m[1] : null;
}

/** Prefijo común de los ids de una lectura, o null si no hay uno solo. */
function prefijoLectura(l) {
  let p = null;
  for (const m of l.movimientos ?? []) {
    if (!m) continue;
    const x = prefijoDe(m.id);
    if (x === null || (p !== null && x !== p)) return null;
    p = x;
  }
  return p;
}

/**
 * Lecturas que salen de un mismo archivo: las que comparten nombre (`archivo`) o el prefijo de los ids
 * (el idArchivo, que no cambia aunque el montaje ponga otro nombre a la segunda cuenta de un Norma 43).
 * @returns {number[]} para cada lectura, el índice de la primera lectura de su archivo
 */
function archivoDeCadaLectura(lista) {
  const padre = lista.map((_, i) => i);
  const raiz = (i) => { while (padre[i] !== i) i = padre[i] = padre[padre[i]]; return i; };
  const juntar = (a, b) => { const ra = raiz(a), rb = raiz(b); if (ra !== rb) padre[Math.max(ra, rb)] = Math.min(ra, rb); };
  const porNombre = new Map(), porPrefijo = new Map();
  lista.forEach((l, i) => {
    if (!l) return;
    const nombre = typeof l.archivo === 'string' && l.archivo ? l.archivo : null;
    if (nombre !== null) { if (porNombre.has(nombre)) juntar(porNombre.get(nombre), i); else porNombre.set(nombre, i); }
    const p = prefijoLectura(l);
    if (p !== null) { if (porPrefijo.has(p)) juntar(porPrefijo.get(p), i); else porPrefijo.set(p, i); }
  });
  return lista.map((_, i) => raiz(i));
}

/**
 * Movimientos de una lectura en orden de lectura. Si el archivo va del más nuevo al más antiguo,
 * se toma al revés (por líneas completas del banco) para que dentro de un mismo día quede el orden real.
 */
function enOrdenDeLectura(lectura) {
  const movs = Array.isArray(lectura?.movimientos) ? lectura.movimientos.filter(Boolean) : [];
  let primera = null, ultima = null;
  for (const m of movs) if (esFecha(m.fecha)) { primera = m.fecha; break; }
  for (let i = movs.length - 1; i >= 0; i--) if (esFecha(movs[i].fecha)) { ultima = movs[i].fecha; break; }
  if (primera === null || ultima === null || primera <= ultima) return movs;
  const lineas = [];
  for (const m of movs) {
    const clave = lineaDeOrigen(m);
    const ult = lineas[lineas.length - 1];
    if (ult && clave !== null && ult.clave === clave) ult.movs.push(m);
    else lineas.push({ clave, movs: [m] });
  }
  return lineas.reverse().flatMap((l) => l.movs);
}

function preparar(m, ia, pos, cuentaArchivo, noFiables) {
  const divisa = String(m.divisa || 'EUR').toUpperCase();
  const centimos = finito(m.importe) ? aCentimos(m.importe) : null;
  const saldo = finito(m.saldo) ? aCentimos(m.saldo) : null;
  const concepto = claveConcepto(m.concepto);
  const comparable = centimos !== null && esFecha(m.fecha); // sin fecha o sin importe no se compara con nada
  return {
    m, ia, pos, divisa, centimos, saldo, concepto,
    fecha: m.fecha,
    dia: comparable ? numeroDeDia(m.fecha) : null,
    fv: esFecha(m.fecha_valor) ? m.fecha_valor : null,
    // un saldo dudoso (foto) o que no cuadra en su archivo no impide reconocer un duplicado
    bloquea: saldo !== null && !m.dudoso && !noFiables.has(m.id),
    cuenta: identidadCuenta(m.cuenta) ?? cuentaArchivo,
    comparable,
    clave: comparable ? `${divisa}|${m.fecha}|${centimos}|${concepto}` : null,
    claveSaldo: comparable && saldo !== null ? `${divisa}|${centimos}|${saldo}` : null,
    claveFechaImporte: comparable ? `${divisa}|${m.fecha}|${centimos}` : null,
    usadoPor: -1,
    palabras: null, // se calculan solo si hacen falta
  };
}

/** Si los dos dicen su cuenta, tiene que ser la misma. Si uno da el número y otro el nombre, no se puede saber. */
function cuentasCompatibles(a, b) {
  if (!a.cuenta || !b.cuenta) return true;
  if (a.cuenta.cifras !== undefined && b.cuenta.cifras !== undefined) return a.cuenta.cifras === b.cuenta.cifras;
  if (a.cuenta.texto !== undefined && b.cuenta.texto !== undefined) return a.cuenta.texto === b.cuenta.texto;
  return true;
}
const mismoSaldo = (a, b) => a.saldo !== null && b.saldo !== null && a.saldo === b.saldo;
const saldosCompatibles = (a, b) => !(a.bloquea && b.bloquea && a.saldo !== b.saldo);
const fechasCompatibles = (a, b) => a.fecha === b.fecha || (a.fv !== null && a.fv === b.fecha) || (b.fv !== null && b.fv === a.fecha);

/**
 * ¿Es el mismo concepto escrito más corto? Un concepto contiene al otro (recortado al final), o todas las
 * palabras propias del más corto están en el otro (la última puede venir cortada).
 */
function conceptosCompatibles(a, b) {
  const [corto, largo] = a.concepto.length <= b.concepto.length ? [a.concepto, b.concepto] : [b.concepto, a.concepto];
  if (corto.length >= MIN_CONCEPTO_RECORTADO && largo.includes(corto)) return true;
  a.palabras ??= palabrasDe(a.m.concepto);
  b.palabras ??= palabrasDe(b.m.concepto);
  return palabrasDentro(a.palabras, b.palabras) || palabrasDentro(b.palabras, a.palabras);
}

function palabrasDentro(corto, largo) {
  if (corto.letras < MIN_LETRAS_PROPIAS || !largo.palabras.length) return false;
  const todas = new Set(largo.palabras);
  const ultima = corto.palabras[corto.palabras.length - 1];
  return corto.propias.every((p) => todas.has(p)
    || (p === ultima && largo.palabras.some((q) => q.length > p.length && q.startsWith(p) && !GENERICAS.has(q))));
}

function anotar(indice, clave, entrada) {
  if (clave === null) return;
  const lista = indice.get(clave);
  if (lista) lista.push(entrada);
  else indice.set(clave, [entrada]);
}

function origenCorto(m) {
  const o = m.origen ?? {};
  const r = { id: m.id, archivo: o.archivo ?? null, fila: o.fila ?? null };
  if (o.pagina !== undefined && o.pagina !== null) r.pagina = o.pagina;
  if (o.hoja !== undefined && o.hoja !== null) r.hoja = o.hoja;
  return r;
}

/**
 * Empareja los movimientos de todas las lecturas: cada uno se compara con los de los archivos anteriores
 * (en el turno de `turno`) y, si es el mismo, se quita. `distintas`: parejas de lecturas («ia|ib») que son
 * de cuentas distintas aunque no lo digan, entre las que no se quita nada.
 */
function emparejar(lista, archivoDe, turno, noFiables, distintas) {
  const afinidades = new Map();
  const afines = (a, b) => {
    const k = clavePareja(a, b);
    if (!afinidades.has(k)) afinidades.set(k, afinidad(lista[a], lista[b]));
    const f = afinidades.get(k);
    return f !== null && f >= MIN_AFINIDAD_FECHA;
  };
  const guardados = [];
  const porClave = new Map();          // divisa|fecha|céntimos|concepto
  const porSaldo = new Map();          // divisa|céntimos|saldo
  const porFechaImporte = new Map();   // divisa|fecha|céntimos
  const porValorImporte = new Map();   // divisa|fecha valor|céntimos
  const porDiaImporte = new Map();     // divisa|céntimos|día (número de día, para buscar a ±3 días)
  const duplicados = [];
  const archivos = new Array(lista.length).fill(null);
  const parejas = new Map();           // «ia|ib» → movimientos casados entre esas dos lecturas

  for (const ia of turno) {
    const lectura = lista[ia];
    const propio = archivoDe[ia];
    const cuentaArchivo = identidadCuenta(lectura.extra?.iban ?? lectura.extra?.cuenta ?? null);
    const entradas = enOrdenDeLectura(lectura).map((m, pos) => preparar(m, ia, pos, cuentaArchivo, noFiables));
    let quitados = 0;
    const compatibles = (x, s) => cuentasCompatibles(x, s) && !distintas.has(clavePareja(x.ia, s.ia));

    // Busca en los otros archivos un movimiento libre: ni de este archivo ni casado ya con otro de este archivo.
    const buscar = (candidatos, ok) => {
      if (!candidatos) return null;
      for (const s of candidatos) if (s.usadoPor !== propio && ok(s)) return s;
      return null;
    };
    const pasada = (pendientes, regla, encontrar) => {
      const quedan = [];
      for (const x of pendientes) {
        const s = x.comparable ? encontrar(x) : null;
        if (!s) { quedan.push(x); continue; }
        s.usadoPor = propio;
        quitados++;
        duplicados.push({ ...origenCorto(x.m), igual_a: origenCorto(s.m), regla });
        const k = clavePareja(x.ia, s.ia);
        parejas.set(k, (parejas.get(k) ?? 0) + 1);
      }
      return quedan;
    };

    let pendientes = entradas;
    // 1) clave exacta con el mismo saldo; 2) clave exacta, saldo de uno solo (o que no se usa)
    pendientes = pasada(pendientes, 'exacta', (x) => buscar(porClave.get(x.clave), (s) => mismoSaldo(x, s) && compatibles(x, s)));
    pendientes = pasada(pendientes, 'exacta', (x) => buscar(porClave.get(x.clave), (s) => saldosCompatibles(x, s) && compatibles(x, s)));
    // 3) mismo importe y mismo saldo el mismo día (o fecha valor = fecha): concepto recortado en otro formato
    pendientes = pasada(pendientes, 'saldo', (x) => (x.claveSaldo === null ? null
      : buscar(porSaldo.get(x.claveSaldo), (s) => fechasCompatibles(x, s) && compatibles(x, s))));
    // 4) sin saldo en alguno: mismo importe, el mismo día (o la fecha valor de uno es la fecha del otro),
    //    y el mismo concepto recortado o escrito de otra forma
    const ok4 = (x) => (s) => fechasCompatibles(x, s) && saldosCompatibles(x, s) && compatibles(x, s) && conceptosCompatibles(x, s);
    pendientes = pasada(pendientes, 'concepto_recortado', (x) => buscar(porFechaImporte.get(x.claveFechaImporte), ok4(x))
      ?? (x.fv !== null ? buscar(porFechaImporte.get(`${x.divisa}|${x.fv}|${x.centimos}`), ok4(x)) : null)
      ?? buscar(porValorImporte.get(x.claveFechaImporte), ok4(x)));
    // 5) a 3 días o menos (un archivo da la fecha de operación y otro la fecha valor, sin decir las dos):
    //    mismo importe y concepto, y solo entre archivos que coinciden en casi todo lo demás (misma cuenta).
    //    El más cercano; a igual distancia, el primero.
    pendientes = pasada(pendientes, 'fecha_cercana', (x) => {
      let mejor = null, distancia = Infinity;
      for (let d = -DIAS_FECHA_CERCANA; d <= DIAS_FECHA_CERCANA; d++) {
        if (!d || Math.abs(d) >= distancia) continue;
        const s = buscar(porDiaImporte.get(`${x.divisa}|${x.centimos}|${x.dia + d}`), (c) => saldosCompatibles(x, c) && compatibles(x, c)
          && conceptosCompatibles(x, c) && afines(x.ia, c.ia));
        if (s && Math.abs(d) < distancia) { mejor = s; distancia = Math.abs(d); }
      }
      return mejor;
    });

    // Los que quedan son nuevos. Se apuntan al final para no casar dentro del mismo archivo.
    for (const x of pendientes) {
      x.usadoPor = propio;
      guardados.push(x);
      anotar(porClave, x.clave, x);
      anotar(porSaldo, x.claveSaldo, x);
      anotar(porFechaImporte, x.claveFechaImporte, x);
      if (x.comparable && x.fv !== null && x.fv !== x.fecha) anotar(porValorImporte, `${x.divisa}|${x.fv}|${x.centimos}`, x);
      if (x.comparable) anotar(porDiaImporte, `${x.divisa}|${x.centimos}|${x.dia}`, x);
    }
    archivos[ia] = { archivo: lectura.archivo ?? null, movimientos: entradas.length, duplicados: quitados };
  }
  return { guardados, duplicados, archivos, parejas };
}

const clavePareja = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Cuenta que dice una lectura (la del archivo o la de todos sus movimientos), o null si no la dice o dice varias. */
function cuentaDeLectura(l) {
  let id = identidadCuenta(l.extra?.iban ?? l.extra?.cuenta ?? null);
  for (const m of l.movimientos ?? []) {
    const c = identidadCuenta(m?.cuenta);
    if (c === null) continue;
    if (id === null) id = c;
    else if (JSON.stringify(c) !== JSON.stringify(id)) return null;
  }
  return id;
}

/**
 * ¿Parecen de la misma cuenta? En los días que cubren los dos archivos, casi cada movimiento del que tiene
 * menos tiene en el otro uno del mismo importe a 3 días o menos (la fecha valor puede ir un par de días
 * después). Dos cuentas distintas solo coinciden de vez en cuando (la comisión de mantenimiento el mismo día).
 * @returns {number|null} parte de los movimientos con pareja, o null si no coinciden en ningún día
 */
function afinidad(a, b) {
  const fechasDe = (l) => (l.movimientos ?? []).filter((m) => m && esFecha(m.fecha) && finito(m.importe));
  const ma = fechasDe(a), mb = fechasDe(b);
  if (!ma.length || !mb.length) return null;
  const rango = (ms) => ms.reduce(([lo, hi], m) => [m.fecha < lo ? m.fecha : lo, m.fecha > hi ? m.fecha : hi], [ms[0].fecha, ms[0].fecha]);
  const [loA, hiA] = rango(ma), [loB, hiB] = rango(mb);
  const lo = loA > loB ? loA : loB, hi = hiA < hiB ? hiA : hiB;
  if (lo > hi) return null;
  const dentro = (ms) => ms.filter((m) => m.fecha >= lo && m.fecha <= hi);
  let [pocos, muchos] = [dentro(ma), dentro(mb)];
  if (pocos.length > muchos.length) [pocos, muchos] = [muchos, pocos];
  if (!pocos.length) return null;
  const dia = numeroDeDia;
  const indice = new Map();
  for (const m of muchos) anotar(indice, `${String(m.divisa || 'EUR').toUpperCase()}|${aCentimos(m.importe)}`, dia(m.fecha));
  let con = 0;
  for (const m of pocos) {
    const dias = indice.get(`${String(m.divisa || 'EUR').toUpperCase()}|${aCentimos(m.importe)}`);
    if (dias && dias.some((d) => Math.abs(d - dia(m.fecha)) <= DIAS_AFINIDAD)) con++;
  }
  return con / pocos.length;
}

/**
 * Une las lecturas de todos los archivos.
 * Dos archivos que no dicen su cuenta y que, en los días que comparten, apenas coinciden en importes, se toman
 * por cuentas distintas: entre ellos no se quita nada (así no se pierde una de las dos comisiones del mismo día).
 * @param {Array<import('./modelo.js').LecturaArchivo>} lecturas
 * @param {{saldosNoFiables?: Iterable<string>}} [opciones] ids cuyo saldo no se usa para separar movimientos
 *   (los de saldosNoFiables(validaciones) de validar.js)
 * @returns {{
 *   movimientos: Array, duplicados_quitados: number, por_divisa: Object<string, Array>,
 *   otras_monedas: Array<{divisa, movimientos, cargos, abonos, n_cargos, n_abonos}>,
 *   duplicados: Array<{id, archivo, fila, pagina?, igual_a, regla}>,
 *   archivos: Array<{archivo, movimientos, duplicados}>, avisos: Array<{codigo, datos?}>,
 *   cuentas_distintas: Array<[string, string]>
 * }}
 */
export function unir(lecturas, opciones = {}) {
  const lista = Array.isArray(lecturas) ? lecturas : [];
  const noFiables = new Set(opciones.saldosNoFiables ?? []);
  const archivoDe = archivoDeCadaLectura(lista);

  // Cuando un movimiento está en dos archivos se queda el del archivo mejor leído: una hoja o un CSV
  // (nivel A) antes que un PDF (B), y un PDF antes que una foto (C). Así no se pierde el concepto
  // entero si el PDF lo recorta, ni un importe exacto por uno leído de una foto. A igual nivel, el primero.
  // Las lecturas de un mismo archivo van seguidas, con el nivel de la mejor de ellas.
  const PESO = { A: 0, B: 1, C: 2 };
  const peso = (l) => PESO[l?.nivel] ?? 1;
  const pesoArchivo = new Map();
  lista.forEach((l, ia) => { if (l) pesoArchivo.set(archivoDe[ia], Math.min(pesoArchivo.get(archivoDe[ia]) ?? 9, peso(l))); });
  const turno = lista.map((l, ia) => ia).filter((ia) => lista[ia])
    .sort((a, b) => pesoArchivo.get(archivoDe[a]) - pesoArchivo.get(archivoDe[b]) || archivoDe[a] - archivoDe[b] || a - b);

  let r = emparejar(lista, archivoDe, turno, noFiables, new Set());
  // Lecturas casadas entre sí que no dicen la misma cuenta y apenas coinciden: cuentas distintas.
  const distintas = new Set();
  const cuentas = lista.map((l) => (l ? cuentaDeLectura(l) : null));
  for (const k of r.parejas.keys()) {
    const [a, b] = k.split('|').map(Number);
    if (cuentas[a] !== null && cuentas[b] !== null && JSON.stringify(cuentas[a]) === JSON.stringify(cuentas[b])) continue;
    const f = afinidad(lista[a], lista[b]);
    if (f !== null && f < MIN_AFINIDAD) distintas.add(k);
  }
  if (distintas.size) r = emparejar(lista, archivoDe, turno, noFiables, distintas);
  const { guardados, duplicados, archivos } = r;

  // Orden final por fecha ascendente, estable respecto al orden de lectura: a igual fecha, por archivo
  // (en el orden en que llegaron) y por posición dentro del archivo. Sin fecha, al final.
  const claveOrden = (x) => (esFecha(x.fecha) ? x.fecha : '\uffff');
  guardados.sort((a, b) => {
    const fa = claveOrden(a), fb = claveOrden(b);
    return fa < fb ? -1 : fa > fb ? 1 : a.ia - b.ia || a.pos - b.pos;
  });
  const movimientos = guardados.map((x) => x.m);

  const por_divisa = { EUR: [] };
  for (const x of guardados) (por_divisa[x.divisa] ??= []).push(x.m);

  const otras_monedas = [];
  for (const [divisa, movs] of Object.entries(por_divisa)) {
    if (divisa === 'EUR' || !movs.length) continue;
    let cargos = 0, abonos = 0, nCargos = 0, nAbonos = 0;
    for (const m of movs) {
      if (!finito(m.importe)) continue;
      const c = aCentimos(m.importe);
      if (c < 0) { cargos -= c; nCargos++; } else if (c > 0) { abonos += c; nAbonos++; }
    }
    otras_monedas.push({ divisa, movimientos: movs.length, cargos: aEuros(cargos), abonos: aEuros(abonos), n_cargos: nCargos, n_abonos: nAbonos });
  }
  otras_monedas.sort((a, b) => b.movimientos - a.movimientos || (a.divisa < b.divisa ? -1 : 1));

  const avisos = [];
  if (duplicados.length) avisos.push(aviso(duplicados.length === 1 ? 'duplicados_uno' : 'duplicados', { n: duplicados.length }));
  for (const o of otras_monedas) avisos.push(aviso(o.movimientos === 1 ? 'otra_moneda_uno' : 'otra_moneda', { n: o.movimientos, divisa: o.divisa }));

  const cuentas_distintas = [...distintas].map((k) => k.split('|').map((i) => lista[Number(i)].archivo ?? null));
  return { movimientos, duplicados_quitados: duplicados.length, por_divisa, otras_monedas, duplicados, archivos: archivos.filter(Boolean), avisos, cuentas_distintas };
}
