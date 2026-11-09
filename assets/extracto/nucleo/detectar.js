// Cobros que se repiten. Agrupa los cargos en euros por comercio, separa series por importe,
// calcula la periodicidad, el estado, las etiquetas y el coste anual. Cada cobro lleva los
// movimientos que lo justifican, con su concepto original y su origen (archivo, fila, página).
// Lógica pura: sin DOM, sin red. Regla: si no está claro, se dice (posible) y no se inventa nada.

import { PERIODICIDADES, bandaDias, aviso } from './modelo.js';
import { redondear2, aCentimos } from './numeros.js';
import { diasEntre, sumarDias, sumarMeses, mesesEntre } from './fechas.js';
import { clasificar, prepararDiccionario, esSuscripcion, CATEGORIAS_VARIABLES } from './conceptos.js';

const ORDEN = ['semanal', 'mensual', 'bimestral', 'trimestral', 'semestral', 'anual'];
// Margen extra para cada hueco suelto (la mediana debe caer en la banda exacta del encargo).
const HOLGURA = { semanal: 1, mensual: 3, bimestral: 4, trimestral: 5, semestral: 7, anual: 10 };
const DIAS_DOBLE = 3; // mismo importe en 0–3 días
const DIAS_NUEVO = 45; // primer cargo en los últimos 45 días
const CARGOS_MES_DISPERSO = 4; // más de 4 al mes con importes dispersos: compra frecuente
const CARGOS_MES_MAX = 8; // más de 8 al mes: compra frecuente aunque el importe se repita (el café de cada día)
const CV_DISPERSO = 0.25;
const TIPOS_QUE_CUENTAN = new Set(['comercio', 'comision', 'gasto_fijo', 'transferencia', 'desconocido']);
const FECHA_MINIMA = '2000-01-01'; // como validar.js: una fecha anterior está mal leída
const DIAS_MARGEN_CALENDARIO = 4; // un cobro de verdad cae siempre el mismo día, con unos días de margen (fines de semana, festivos)
const DIAS_MARGEN_INTERVALO = 2; // cobros cada tantos días fijos (cada 28): el banco apenas los mueve
const PESO_MINIMO = 0.5; // en una tienda con más compras, la serie debe ser al menos la mitad de lo cobrado en su tiempo
// Cuánto puede cambiar el precio entre dos series seguidas para leerlo como una subida (o bajada) del mismo cobro
// [mínimo, máximo] del precio nuevo entre el de antes: en un servicio conocido, también un cambio de plan (de 5,99 a 11,99);
// en lo demás, una subida o bajada normal (un 30 % como mucho); en una tienda que no conocemos, solo subidas.
const CAMBIO_PRECIO = { conocido: [1 / 3, 3], otro: [1 / 1.3, 1.3], tienda: [1, 1.3] };
const PASARELA_CON_COMPRAS = 2.5; // más cargos al mes que esto en PayPal, Apple, Google o Amazon: hay compras sueltas mezcladas
// Se pagan con recibo: un cargo con tarjeta en su tienda (un móvil, un cargador) no es la factura del mes.
const CATEGORIAS_DOMICILIADAS = new Set(['telecos', 'energia', 'agua', 'alarmas']);

/** Códigos que puede llevar un cobro (para las pruebas de textos). */
export const MOTIVOS = ['cargos_regulares', 'anual_dos_cargos', 'solo_dos_cargos', 'un_cargo_conocido', 'cadencia_irregular',
  'comision_suelta', 'periodicidad_supuesta', 'mes_saltado', 'mes_saltado_uno', 'hueco_irregular', 'hueco_irregular_uno', 'importe_variable',
  'precio_subio', 'doble_cobro', 'cargo_aparte', 'cargo_aparte_uno', 'via_pasarela', 'nuevo_reciente', 'sin_cargo_desde', 'periodo_corto',
  'lectura_sin_verificar', 'gasto_fijo', 'transferencia_periodica', 'compras_mezcladas'];
export const AVISOS = ['cobros_periodo_corto', 'cobros_sin_verificar', 'cobros_pasarelas', 'cobros_sin_diccionario'];

// ---------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------

/** ¿Mismo importe? ±2 % o ±0,50 €. */
export function mismoImporte(a, b) {
  const d = Math.abs(a - b);
  return d <= 0.5 + 1e-9 || d <= 0.02 * Math.max(Math.abs(a), Math.abs(b)) + 1e-9;
}

function mediana(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

function coefVariacion(xs) {
  const media = xs.reduce((s, x) => s + x, 0) / xs.length;
  if (!media) return 0;
  const v = xs.reduce((s, x) => s + (x - media) ** 2, 0) / xs.length;
  return Math.sqrt(v) / media;
}

const porFecha = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.n - b.n);
const sumaCentimos = (xs) => xs.reduce((s, x) => s + aCentimos(x), 0) / 100;

function periodicidadDeHueco(d) {
  for (const p of ORDEN) {
    const [a, b] = bandaDias(p);
    if (d >= a && d <= b) return p;
  }
  return null;
}

/** Un hueco entre dos cargos: regular, un periodo saltado (un mes sin cargo) o irregular. */
function tipoHueco(dias, p) {
  const [min, max] = bandaDias(p);
  const h = HOLGURA[p];
  if (dias >= min - h && dias <= max + h) return 'regular';
  if (p !== 'anual' && dias >= 2 * min - h && dias <= 2 * max + h) return 'saltado';
  return 'irregular';
}

/** Periodicidad por la mediana de días entre cargos; si no cae en ninguna banda, la que explique casi todos los huecos. */
export function analizarCadencia(fechas) {
  const huecos = [];
  for (let i = 1; i < fechas.length; i++) huecos.push(diasEntre(fechas[i - 1], fechas[i]));
  const vacio = { periodicidad: null, huecos, regulares: 0, saltados: 0, irregulares: huecos.length, mediana: null };
  if (!huecos.length) return vacio;
  const med = mediana(huecos);
  let p = periodicidadDeHueco(med);
  if (!p) {
    let mejorP = null, mejorN = 0;
    for (const q of ORDEN) {
      let reg = 0, sal = 0;
      for (const g of huecos) { const t = tipoHueco(g, q); if (t === 'regular') reg++; else if (t === 'saltado') sal++; }
      if (reg >= 0.5 * huecos.length && reg + sal >= 0.75 * huecos.length && reg + sal > mejorN) { mejorN = reg + sal; mejorP = q; }
    }
    p = mejorP;
  }
  if (!p) return { ...vacio, mediana: med };
  let regulares = 0, saltados = 0, irregulares = 0;
  for (const g of huecos) {
    const t = tipoHueco(g, p);
    if (t === 'regular') regulares++; else if (t === 'saltado') saltados++; else irregulares++;
  }
  return { periodicidad: p, huecos, regulares, saltados, irregulares, mediana: med };
}

const esRegular = (cad) => Boolean(cad.periodicidad) && cad.irregulares <= Math.floor(0.25 * cad.huecos.length);
const fechasDe = (cargos) => cargos.map((c) => c.fecha);

function diasDelMes(iso) {
  return new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0)).getUTCDate();
}

/** Días entre una fecha y el día `dia` de su mes o del mes de al lado (el 31 es el 30 o el 28 en los meses cortos). */
function desvioDelDia(fecha, dia) {
  const primero = fecha.slice(0, 8) + '01';
  let mejor = Infinity;
  for (const k of [-1, 0, 1]) {
    const base = k ? sumarMeses(primero, k) : primero;
    const objetivo = base.slice(0, 8) + String(Math.min(dia, diasDelMes(base))).padStart(2, '0');
    mejor = Math.min(mejor, Math.abs(diasEntre(objetivo, fecha)));
  }
  return mejor;
}

/**
 * ¿Los cargos siguen un calendario? Un cobro de verdad cae siempre el mismo día del mes (o de la semana),
 * o cada tantos días fijos (cada 28 o 30 días). Unas compras que coinciden en importe por casualidad, no.
 */
export function sigueCalendario(fechas, periodicidad) {
  if (!PERIODICIDADES[periodicidad]) return false;
  if (fechas.length < 2) return true;
  if (periodicidad === 'semanal') {
    // el mismo día de la semana (un día de margen)
    const r = fechas.map((f) => { const x = ((diasEntre(fechas[0], f) % 7) + 7) % 7; return x > 3 ? x - 7 : x; });
    return Math.max(...r) - Math.min(...r) <= 1;
  }
  // el mismo día del mes, con los meses cortos y el paso de un mes al siguiente
  for (const dia of new Set(fechas.map((f) => Number(f.slice(8, 10))))) {
    if (fechas.every((f) => desvioDelDia(f, dia) <= DIAS_MARGEN_CALENDARIO)) return true;
  }
  // o cada 28 o 30 días sin saltarse ninguno (cada 4 semanas): recta por mínimos cuadrados.
  // Solo en los mensuales y con 4 cargos o más: con 3, o con huecos, casi cualquier fecha encaja.
  if (periodicidad !== 'mensual' || fechas.length < 4) return false;
  const ys = fechas.map((f) => diasEntre(fechas[0], f));
  for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > 35) return false;
  const n = ys.length, mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (i - mx) * (ys[i] - my); sxx += (i - mx) ** 2; }
  const paso = sxy / sxx, inicio = my - paso * mx;
  if (paso < 27.5 || paso > 31) return false;
  return ys.every((y, i) => Math.abs(y - (inicio + paso * i)) <= DIAS_MARGEN_INTERVALO);
}

// Búsqueda binaria en cargos ordenados por fecha.
function primeroDesde(cargos, fecha) {
  let lo = 0, hi = cargos.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cargos[m].fecha < fecha) lo = m + 1; else hi = m; }
  return lo;
}
function primeroDespues(cargos, fecha) {
  let lo = 0, hi = cargos.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cargos[m].fecha <= fecha) lo = m + 1; else hi = m; }
  return lo;
}

/** Parte de lo cobrado por el comercio, mientras dura la serie, que es de la serie (1 = solo cobra eso). */
function pesoEnSuTiempo(serie, cargosDelGrupo) {
  const propios = [...serie.cargos, ...serie.dobles.map(([, b]) => b), ...serie.aparte];
  let desde = propios[0].fecha, hasta = desde;
  for (const c of propios) { if (c.fecha < desde) desde = c.fecha; if (c.fecha > hasta) hasta = c.fecha; }
  const enMedio = primeroDespues(cargosDelGrupo, hasta) - primeroDesde(cargosDelGrupo, desde);
  return propios.length / Math.max(1, enMedio);
}

// ---------------------------------------------------------------------------------------------
// Series: qué cargos de un mismo comercio van juntos
// Una serie es { cargos, dobles: [[original, repetido]], aparte: [cargos que no encajan en la cadencia] }
// ---------------------------------------------------------------------------------------------

/** Quita el segundo de cada par con el mismo importe (al céntimo) en 0–3 días: un cobro doble. */
function quitarDobles(cargos) {
  const quedan = [], dobles = [];
  for (const c of cargos) {
    const u = quedan.at(-1);
    if (u && diasEntre(u.fecha, c.fecha) <= DIAS_DOBLE && aCentimos(u.importe) === aCentimos(c.importe)) dobles.push([u, c]);
    else quedan.push(c);
  }
  return { cargos: quedan, dobles, aparte: [] };
}

/**
 * Mismo importe en dos días distintos del mes (dos cuentas de Spotify, una el día 3 y otra el 18): mezclados no tienen
 * ritmo; por separado, cada uno es mensual. Se agrupan los días del mes (el 31 junto al 1) y se parte si cada grupo
 * es un cobro mensual con su calendario. Si no, null.
 */
function partirPorDiaDelMes(cargos) {
  if (cargos.length < 6 || esRegular(analizarCadencia(fechasDe(cargos)))) return null;
  const dias = [...new Set(cargos.map((c) => Number(c.fecha.slice(8, 10))))].sort((a, b) => a - b);
  // el corte más grande entre días seguidos (dando la vuelta al mes) marca dónde empieza el primer grupo
  let inicio = 0, mayor = -1;
  for (let i = 0; i < dias.length; i++) {
    const hueco = i === 0 ? dias[0] + 31 - dias.at(-1) : dias[i] - dias[i - 1];
    if (hueco > mayor) { mayor = hueco; inicio = i; }
  }
  const orden = [...dias.slice(inicio), ...dias.slice(0, inicio)];
  const grupoDe = new Map();
  let grupo = 0;
  for (let i = 0; i < orden.length; i++) {
    if (i > 0 && ((orden[i] - orden[i - 1] + 31) % 31) > 2 * DIAS_MARGEN_CALENDARIO) grupo++;
    grupoDe.set(orden[i], grupo);
  }
  if (grupo === 0) return null;
  const partes = Array.from({ length: grupo + 1 }, () => []);
  for (const c of cargos) partes[grupoDe.get(Number(c.fecha.slice(8, 10)))].push(c);
  const mensual = (p) => {
    const cad = analizarCadencia(fechasDe(p));
    return p.length >= 3 && cad.periodicidad === 'mensual' && esRegular(cad) && sigueCalendario(fechasDe(p), 'mensual');
  };
  return partes.every(mensual) ? partes : null;
}

/** Cargos del mismo importe: un doble de vez en cuando, o dos cobros paralelos si pasa a menudo (dos cuentas). */
function partirPorDobles(cargos) {
  let pares = 0;
  for (let i = 1; i < cargos.length; i++) if (diasEntre(cargos[i - 1].fecha, cargos[i].fecha) <= DIAS_DOBLE) pares++;
  if (pares < 3) {
    const sinDobles = quitarDobles(cargos);
    const partes = partirPorDiaDelMes(sinDobles.cargos);
    if (!partes) return [sinDobles];
    const series = partes.map((p) => ({ cargos: p, dobles: [], aparte: [] }));
    for (const par of sinDobles.dobles) (series.find((s) => s.cargos.includes(par[0])) ?? series[0]).dobles.push(par);
    return series;
  }
  const cadenas = [];
  for (const c of cargos) {
    const k = cadenas.find((ch) => diasEntre(ch.at(-1).fecha, c.fecha) > DIAS_DOBLE);
    if (k) k.push(c); else cadenas.push([c]);
  }
  // Con más de 3 cadenas es algo que se compra muy seguido, no una suscripción: sin partir, no tendrá cadencia.
  if (cadenas.length > 3) return [{ cargos, dobles: [], aparte: [] }];
  return cadenas.map((ch) => ({ cargos: ch, dobles: [], aparte: [] }));
}

/** Cargos que llegan antes de tiempo dentro de una serie con cadencia clara: se enseñan aparte y no cuentan. */
function depurar(serie) {
  const c = serie.cargos;
  if (c.length < 4) return serie;
  const cad = analizarCadencia(fechasDe(c));
  if (!cad.periodicidad || !cad.irregulares) return serie;
  const min = bandaDias(cad.periodicidad)[0] - HOLGURA[cad.periodicidad];
  const dentro = [c[0]], fuera = [];
  for (let i = 1; i < c.length; i++) {
    if (diasEntre(dentro.at(-1).fecha, c[i].fecha) < min) fuera.push(c[i]); else dentro.push(c[i]);
  }
  if (!fuera.length || dentro.length < 3 || !esRegular(analizarCadencia(fechasDe(dentro)))) return serie;
  return { cargos: dentro, dobles: serie.dobles, aparte: serie.aparte.concat(fuera) };
}

function periodicidadComun(a, b) {
  const pa = a.length >= 2 ? analizarCadencia(fechasDe(a)).periodicidad : null;
  const pb = b.length >= 2 ? analizarCadencia(fechasDe(b)).periodicidad : null;
  if (pa && pb && pa !== pb) return null;
  return pa ?? pb;
}

/**
 * Una subida (o bajada) de precio parte la suscripción en dos series seguidas con la misma cadencia: se unen.
 * Solo si el precio de antes se ha repetido (2 cargos o más seguidos) y el cambio cabe en `cambio` [mínimo, máximo]:
 * si no, se pegan compras sueltas de importes que no tienen nada que ver (13,40 → 29,09 → 38,12) y sale un cobro inventado.
 */
// unoVale: en comercios del diccionario basta un cargo al precio de antes si el precio nuevo sube y se repite
// (Netflix 12,99 una vez y luego 13,99 cada mes es una subida, no dos cobros).
function unirConsecutivas(series, [cambioMin, cambioMax], minNuevo = 1, unoVale = false) {
  const res = [];
  for (const s of series) {
    let mejor = -1;
    for (let k = 0; s.cargos.length >= minNuevo && k < res.length; k++) {
      const a = res[k];
      const ua = a.cargos.at(-1);
      if (ua.fecha >= s.cargos[0].fecha) continue; // se solapan: son cobros distintos
      const cambio = s.cargos[0].importe / ua.importe;
      const tramo = a.ultimoTramo ?? a.cargos.length;
      if (tramo < 2 && !(unoVale && a.cargos.length === 1 && cambio > 1 && s.cargos.length >= 2)) continue; // el precio de antes no se llegó a repetir
      if (!(cambio >= cambioMin - 1e-9 && cambio <= cambioMax + 1e-9)) continue;
      const p = periodicidadComun(a.cargos, s.cargos);
      if (!p || tipoHueco(diasEntre(ua.fecha, s.cargos[0].fecha), p) === 'irregular') continue;
      if (mejor < 0 || ua.fecha > res[mejor].cargos.at(-1).fecha) mejor = k;
    }
    if (mejor < 0) res.push(s);
    else {
      const a = res[mejor];
      res[mejor] = { cargos: a.cargos.concat(s.cargos), dobles: a.dobles.concat(s.dobles), aparte: a.aparte.concat(s.aparte), ultimoTramo: s.cargos.length };
    }
  }
  return res;
}

/**
 * Importe fijo: grupos por importe (±2 % o ±0,50 €), cada uno ordenado por fecha.
 * Con `estricto` solo ±2 %: en compras con tarjeta en comercios que no conocemos (cafeterías, restaurantes)
 * los ±0,50 € juntan tickets distintos y salen series por casualidad.
 */
function seriesFijas(cargos, unir, estricto = false, cambio = CAMBIO_PRECIO.otro, minNuevo = 1, unoVale = false) {
  const igual = estricto ? (a, b) => Math.abs(a - b) <= 0.02 * Math.max(a, b) + 1e-9 : mismoImporte;
  const orden = [...cargos].sort((a, b) => a.importe - b.importe || a.n - b.n);
  const grupos = [];
  for (const c of orden) {
    const g = grupos.at(-1);
    if (g && igual(g.ref, c.importe)) g.cargos.push(c); else grupos.push({ ref: c.importe, cargos: [c] });
  }
  let series = [];
  for (const g of grupos) series.push(...partirPorDobles(g.cargos.sort(porFecha)));
  series.sort((a, b) => porFecha(a.cargos[0], b.cargos[0]));
  if (unir) series = unirConsecutivas(series, cambio, minNuevo, unoVale);
  return series.map(depurar);
}

/**
 * Importe variable (luz, agua, teléfono): una serie por factura. Si la misma empresa cobra dos facturas
 * (luz y gas) cada cargo va a la cadena de importe más parecido cuyo último cargo es de hace 7 días o más.
 */
function seriesVariables(cargos) {
  const base = quitarDobles(cargos);
  const cadenas = [];
  for (const c of base.cargos) {
    let mejor = null, dif = Infinity;
    for (const ch of cadenas) {
      const u = ch.cargos.at(-1);
      if (diasEntre(u.fecha, c.fecha) < 7) continue;
      const d = Math.abs(u.importe - c.importe) / Math.max(u.importe, c.importe, 0.01);
      if (d < dif) { dif = d; mejor = ch; }
    }
    if (mejor) mejor.cargos.push(c); else cadenas.push({ cargos: [c], dobles: [], aparte: [] });
  }
  for (const par of base.dobles) (cadenas.find((ch) => ch.cargos.includes(par[0])) ?? cadenas[0]).dobles.push(par);
  return cadenas.map(depurar);
}

/** Cuántos cargos quedan en series con cadencia clara (para elegir entre leer el importe como fijo o como variable). */
function explicados(series) {
  let n = 0;
  for (const s of series) if (s.cargos.length >= 2 && esRegular(analizarCadencia(fechasDe(s.cargos)))) n += s.cargos.length;
  return n;
}

// Comisiones que se cobran cada vez que usas algo (cajero, transferencia, divisa, descubierto, reclamación):
// todas juntas en una serie; dos iguales en pocos días son dos usos, no un cobro doble.
const COMISIONES_POR_USO = new Set(['comision_cajero', 'comision_transferencia', 'comision_cambio_divisa', 'comision_descubierto', 'comision_reclamacion']);

const conModo = (series, modo) => series.map((s) => ({ ...s, modo }));

/** Series de un grupo, cada una con su modo ('fijo' o 'variable'), y los cargos que se dejan fuera por ser compras sueltas. */
function seriesDelGrupo(g) {
  if (g.kind === 'comision' && COMISIONES_POR_USO.has(g.cl.comercio?.id ?? g.clave)) {
    return { series: [{ cargos: g.cargos, dobles: [], aparte: [], modo: 'variable' }], fuera: [] };
  }
  if (g.variableCategoria) {
    // las facturas van por importe variable; las compras con tarjeta en su tienda, aparte y por importe fijo
    // (las compras se miran como en una tienda cualquiera: un bar que se llame como una compañía tampoco cuenta)
    const compras = g.cargos.filter((c) => c.tarjeta), facturas = g.cargos.filter((c) => !c.tarjeta);
    const series = facturas.length ? conModo(seriesVariables(facturas), 'variable') : [];
    if (compras.length) {
      const deCompras = seriesFijas(compras, true, true, CAMBIO_PRECIO.tienda).filter((s) => s.cargos.length < 2 || conPeso(s, compras));
      // la factura pagada con tarjeta cada mes (importe que cambia): vale si cae en su fecha y no se dispara
      if (compras.length >= 3 && explicados(deCompras) < 0.5 * compras.length) {
        const facturasConTarjeta = seriesVariables(compras).filter((s) => {
          const cad = analizarCadencia(fechasDe(s.cargos));
          return s.cargos.length >= 3 && esRegular(cad) && sigueCalendario(fechasDe(s.cargos), cad.periodicidad)
            && coefVariacion(s.cargos.map((c) => c.importe)) <= 0.5;
        });
        if (explicados(facturasConTarjeta) > explicados(deCompras)) {
          series.push(...conModo(facturasConTarjeta, 'variable'));
          return { series, fuera: [] };
        }
      }
      series.push(...conModo(deCompras, 'fijo'));
    }
    return { series, fuera: [] };
  }
  if (g.kind === 'pasarela') return seriesDePasarela(g);
  const recibos = g.cargos.filter((c) => c.recibo).length >= 0.8 * g.cargos.length;
  const tiendaDesconocida = g.kind === 'desconocido' && !recibos;
  const cambio = g.kind === 'comercio' || g.kind === 'comision' ? CAMBIO_PRECIO.conocido : tiendaDesconocida ? CAMBIO_PRECIO.tienda : CAMBIO_PRECIO.otro;
  let fijas = seriesFijas(g.cargos, true, tiendaDesconocida, cambio, 1, g.kind === 'comercio');
  // Compras con tarjeta en un comercio que no conocemos: la serie tiene que caer siempre el mismo día y,
  // si la tienda cobra más cosas, ser buena parte de lo que cobra (o repetirse mucho). Si no, es casualidad.
  if (tiendaDesconocida) fijas = fijas.filter((s) => s.cargos.length < 2 || conPeso(s, g.cargos));
  const admiteVariable = g.kind === 'comision' || (recibos && g.kind !== 'transferencia');
  if (admiteVariable && g.cargos.length >= 3 && explicados(fijas) < 0.5 * g.cargos.length) {
    const variables = seriesVariables(g.cargos);
    if (explicados(variables) > explicados(fijas)) return { series: conModo(variables, 'variable'), fuera: [] };
  }
  return { series: conModo(fijas, 'fijo'), fuera: [] };
}

function conPeso(s, cargosDelGrupo) {
  const cad = analizarCadencia(fechasDe(s.cargos));
  if (!esRegular(cad) || !sigueCalendario(fechasDe(s.cargos), cad.periodicidad)) return false;
  if (cad.periodicidad === 'semanal' && s.cargos.length < 4) return false; // tres compras en dos semanas no son un cobro semanal
  return s.cargos.length >= 4 || pesoEnSuTiempo(s, cargosDelGrupo) >= PESO_MINIMO;
}

/**
 * PayPal, Apple, Google, Amazon: detrás puede haber varios servicios y también compras sueltas.
 * - Importe exacto al 2 % (0,99 y 1,49 son dos cosas distintas, aunque se lleven 0,50 €).
 * - Dos cargos iguales en pocos días son dos compras, no un cobro doble: se enseñan aparte.
 * - Si hay muchas compras mezcladas, solo cuenta lo que se repite con su calendario; lo demás son compras frecuentes.
 */
function seriesDePasarela(g) {
  const meses = Math.max(1, (diasEntre(g.cargos[0].fecha, g.cargos.at(-1).fecha) + 1) / 30.4375);
  const conCompras = g.cargos.length / meses > PASARELA_CON_COMPRAS;
  const series = seriesFijas(g.cargos, true, true, CAMBIO_PRECIO.otro).map((s) => (s.dobles.length
    ? { ...s, dobles: [], aparte: s.aparte.concat(s.dobles.map(([, b]) => b)) } : s));
  if (!conCompras) return { series: conModo(series, 'fijo'), fuera: [] };
  const quedan = [], fuera = [];
  for (const s of series) {
    const cad = analizarCadencia(fechasDe(s.cargos));
    // importe exacto, o un solo cambio de precio después de un precio que se repitió
    const tramos = [];
    for (const c of s.cargos) {
      if (tramos.length && tramos.at(-1).centimos === aCentimos(c.importe)) tramos.at(-1).n++;
      else tramos.push({ centimos: aCentimos(c.importe), n: 1 });
    }
    const exacto = tramos.length === 1 || (tramos.length === 2 && tramos[0].n >= 2);
    if (s.cargos.length >= 3 && exacto && esRegular(cad) && sigueCalendario(fechasDe(s.cargos), cad.periodicidad)) {
      // con pocos cargos, o con el precio nuevo visto una sola vez entre tantas compras, no se puede estar seguro
      const dudoso = s.cargos.length < 4 || tramos.at(-1).n === 1;
      quedan.push({ ...s, modo: 'fijo', ...(dudoso ? { tope: 'posible' } : {}) });
    } else {
      fuera.push(...s.cargos, ...s.aparte);
    }
  }
  return { series: quedan, fuera };
}

/** Comisiones sin cadencia: todas en una sola serie «puntual» (se suma lo cobrado, sin extrapolar). */
function juntarSueltas(series) {
  const regulares = [], sueltas = [];
  for (const s of series) (s.cargos.length >= 2 && esRegular(analizarCadencia(fechasDe(s.cargos))) ? regulares : sueltas).push(s);
  if (sueltas.length < 2) return series;
  const junta = { cargos: [], dobles: [], aparte: [], modo: sueltas[0].modo };
  for (const s of sueltas) { junta.cargos.push(...s.cargos); junta.dobles.push(...s.dobles); junta.aparte.push(...s.aparte); }
  junta.cargos.sort(porFecha);
  return [...regulares, junta];
}

/** Más de 4 cargos al mes con importes dispersos (o más de 8 aunque se repitan): compra frecuente, no cuenta. */
function esCompraFrecuente(cargos) {
  if (cargos.length < 5) return false;
  const meses = Math.max(1, (diasEntre(cargos[0].fecha, cargos.at(-1).fecha) + 1) / 30.4375);
  const porMes = cargos.length / meses;
  if (porMes > CARGOS_MES_MAX) return true;
  return porMes > CARGOS_MES_DISPERSO && coefVariacion(cargos.map((c) => c.importe)) > CV_DISPERSO;
}

/** Periodicidad que se supone para un comercio conocido visto sin cadencia: la primera del diccionario que lo deja activo. */
function periodoSupuesto(comercio, ultimo, hasta) {
  const lista = (comercio.periodos ?? []).filter((p) => PERIODICIDADES[p]);
  if (!lista.length) lista.push('mensual');
  const dias = diasEntre(ultimo, hasta);
  // Con un solo cargo se usa la primera frecuencia del diccionario que siga activa: el orden de «periodos» dice
  // cuál es la habitual de cada comercio (seguros de hogar anual primero, salud mensual primero).
  return lista.find((p) => dias <= 1.5 * PERIODICIDADES[p].dias) ?? lista[0];
}

/**
 * Fecha del próximo cargo: el último más un periodo. Si el último cayó el último día de un mes corto y antes
 * cobraba más tarde (un cobro del día 31), vuelve a su día: 31 ene → 28 feb → 31 mar, no 28 mar.
 */
function proximo(cargos, p) {
  const ultimo = cargos.at(-1).fecha;
  if (p === 'semanal') return sumarDias(ultimo, 7);
  const siguiente = sumarMeses(ultimo, PERIODICIDADES[p].meses);
  const dia = Number(ultimo.slice(8, 10));
  if (dia !== diasDelMes(ultimo)) return siguiente;
  const ancla = Math.max(...cargos.slice(-4).map((c) => Number(c.fecha.slice(8, 10))));
  if (ancla <= dia) return siguiente;
  return siguiente.slice(0, 8) + String(Math.min(ancla, diasDelMes(siguiente))).padStart(2, '0');
}

/** Motivo con su número; con 1 lleva su propio código, para que el texto diga «un periodo» y no «1 periodos». */
const motivoContado = (codigo, n) => (n === 1 ? { codigo: codigo + '_uno', datos: { n } } : { codigo, datos: { n } });

/** Movimiento tal cual lo enseña la interfaz: concepto original y de dónde sale. */
function movimientoDe(c, marca) {
  const m = c.mov, o = m.origen ?? {};
  const r = { id: m.id, fecha: m.fecha, concepto: m.concepto, importe: m.importe, archivo: o.archivo ?? null, fila: o.fila ?? null };
  if (o.pagina !== undefined && o.pagina !== null) r.pagina = o.pagina;
  if (o.hoja !== undefined && o.hoja !== null) r.hoja = o.hoja;
  if (m.dudoso) r.dudoso = true;
  if (marca) r[marca] = true;
  return r;
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cobro';
}

// ---------------------------------------------------------------------------------------------
// De una serie a un cobro
// ---------------------------------------------------------------------------------------------

function evaluar(serie, g, ctx, unicaDelGrupo) {
  const cargos = serie.cargos;
  const n = cargos.length;
  if (!n) return null;
  const modo = serie.modo;
  const ultimo = cargos.at(-1);
  const cad = analizarCadencia(fechasDe(cargos));
  const regular = esRegular(cad);
  const comercio = g.cl.comercio;
  const enDiccionario = g.kind === 'comercio' && Boolean(comercio);
  const suscripcion = enDiccionario && esSuscripcion(comercio);
  // Lo que se paga con recibo (teléfono, luz, agua, alarma): si solo hay compras con tarjeta en su tienda,
  // no se supone ninguna frecuencia (un móvil de 299 € no son 3.588 € al año).
  const soloCompras = suscripcion && CATEGORIAS_DOMICILIADAS.has(comercio.categoria) && cargos.every((c) => c.tarjeta);
  const motivos = [];
  let periodicidad = cad.periodicidad;
  let estado;

  // Estado según cuántos cargos hay y si llegan con cadencia
  if (regular && (n >= 3 || (n === 2 && periodicidad === 'anual'))) {
    estado = 'seguro';
    motivos.push(n === 2 ? { codigo: 'anual_dos_cargos' } : { codigo: 'cargos_regulares', datos: { n } });
  } else if (regular && n === 2) {
    estado = 'posible';
    motivos.push({ codigo: 'solo_dos_cargos' });
  } else if (g.kind === 'comision') {
    periodicidad = 'puntual'; // las comisiones siempre se enseñan, aunque no se repitan
    estado = 'posible';
    motivos.push({ codigo: 'comision_suelta', datos: { n } });
  } else if (suscripcion && unicaDelGrupo && !soloCompras) {
    periodicidad = periodoSupuesto(comercio, ultimo.fecha, ctx.hasta);
    estado = 'posible';
    motivos.push({ codigo: n === 1 ? 'un_cargo_conocido' : 'cadencia_irregular', datos: { n } }, { codigo: 'periodicidad_supuesta' });
  } else {
    return null; // no hay repetición clara: no se enseña
  }
  if (regular && cad.saltados) motivos.push(motivoContado('mes_saltado', cad.saltados));
  if (regular && cad.irregulares) motivos.push(motivoContado('hueco_irregular', cad.irregulares));
  if (serie.tope === 'posible' && estado === 'seguro') {
    estado = 'posible';
    motivos.push({ codigo: 'compras_mezcladas' });
  }

  const P = PERIODICIDADES[periodicidad];
  if (periodicidad !== 'puntual') {
    const dias = diasEntre(ultimo.fecha, ctx.hasta);
    if (dias > 1.5 * P.dias) {
      // dos cargos parecidos en una tienda que no conocemos, y nada más: no es un cobro que haya terminado
      if (estado === 'posible' && !suscripcion && g.kind !== 'gasto_fijo') return null;
      estado = 'terminado';
      motivos.push({ codigo: 'sin_cargo_desde', datos: { dias } });
    }
  }
  if (estado !== 'terminado' && ctx.meses < 3) {
    if (estado === 'seguro') estado = 'posible';
    motivos.push({ codigo: 'periodo_corto' });
  }
  if (estado !== 'terminado' && ctx.fotoSinVerificar) {
    if (estado === 'seguro') estado = 'posible';
    motivos.push({ codigo: 'lectura_sin_verificar' });
  }

  // Importe y coste anual
  // (las facturas de luz, agua o teléfono siempre van por la media; las compras con tarjeta en su tienda, por su importe)
  let importeTipo = 'fijo';
  if (g.variableCategoria && modo === 'variable') importeTipo = 'variable';
  else if (modo === 'variable' && !cargos.every((c) => mismoImporte(c.importe, ultimo.importe))) importeTipo = 'variable';
  if (importeTipo === 'variable') motivos.push({ codigo: 'importe_variable' });

  let calculo, coste;
  if (periodicidad === 'puntual') {
    const desde12 = sumarMeses(ctx.hasta, -12);
    const importes = cargos.filter((c) => c.fecha > desde12).map((c) => c.importe);
    if (!importes.length) return null;
    coste = sumaCentimos(importes);
    calculo = { formula: 'suma_12_meses', base: coste, cargos_al_anio: importes.length, importes };
  } else if (importeTipo === 'variable') {
    const importes = cargos.slice(-3).map((c) => c.importe);
    const base = redondear2(sumaCentimos(importes) / importes.length);
    coste = redondear2(base * P.alAnio);
    calculo = { formula: 'media3_x_cargos_anio', base, cargos_al_anio: P.alAnio, importes };
  } else {
    coste = redondear2(ultimo.importe * P.alAnio);
    calculo = { formula: 'ultimo_x_cargos_anio', base: ultimo.importe, cargos_al_anio: P.alAnio, importes: [ultimo.importe] };
  }

  // Subida de precio: el último importe frente al anterior distinto
  let subida = null, subidaMensual = null;
  if (importeTipo === 'fijo' && periodicidad !== 'puntual') {
    let j = n - 2;
    while (j >= 0 && aCentimos(cargos[j].importe) === aCentimos(ultimo.importe)) j--;
    if (j >= 0) {
      const antes = cargos[j].importe;
      const dif = redondear2(ultimo.importe - antes);
      if (dif >= 0.5 - 1e-9 && dif >= 0.03 * antes - 1e-9) {
        subidaMensual = redondear2((dif * P.alAnio) / 12);
        subida = { antes, ahora: ultimo.importe, diferencia: dif, desde: cargos[j + 1].fecha };
        motivos.push({ codigo: 'precio_subio', datos: { antes, ahora: ultimo.importe } });
      }
    }
  }

  // Etiquetas
  const etiquetas = new Set();
  if (subida) etiquetas.add('subio');
  if (serie.dobles.length) {
    etiquetas.add('doble');
    motivos.push({ codigo: 'doble_cobro', datos: { n: serie.dobles.length } });
  }
  if ((enDiccionario && comercio.evitable) || g.kind === 'comision' || serie.dobles.length) etiquetas.add('evitable');
  if ((comercio?.id ?? g.clave) === 'comision_reclamacion') etiquetas.add('reclamable');
  if (g.kind === 'pasarela') etiquetas.add('varias_posibles');
  const margen = periodicidad === 'puntual' ? 35 : bandaDias(periodicidad)[1];
  if (suscripcion && estado !== 'terminado' && diasEntre(g.cargos[0].fecha, ctx.hasta) <= DIAS_NUEVO && diasEntre(ctx.desde, g.cargos[0].fecha) > margen) {
    etiquetas.add('nuevo');
    motivos.push({ codigo: 'nuevo_reciente' });
  }
  if (serie.aparte.length) motivos.push(motivoContado('cargo_aparte', serie.aparte.length));
  const pasarela = g.kind === 'pasarela' ? comercio.id : masComun(cargos.map((c) => c.pasarela).filter(Boolean));
  if (pasarela && g.kind !== 'pasarela') motivos.push({ codigo: 'via_pasarela', datos: { pasarela } });
  if (g.kind === 'gasto_fijo') motivos.push({ codigo: 'gasto_fijo' });
  if (g.kind === 'transferencia') motivos.push({ codigo: 'transferencia_periodica' });

  const movimientos = [
    ...cargos.map((c) => movimientoDe(c)),
    ...serie.dobles.map(([, b]) => movimientoDe(b, 'doble')),
    ...serie.aparte.map((c) => movimientoDe(c, 'aparte')),
  ].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

  // Comisiones, gastos fijos y pasarelas tienen su nombre en los tres idiomas (textos/deteccion.js), aunque al
  // diccionario le falte la entrada: entonces el código sale de la clave («comision_otra»).
  const idConNombre = ['comision', 'gasto_fijo', 'pasarela'].includes(g.kind) ? (comercio?.id ?? (/^[a-z_]+$/.test(g.clave) ? g.clave : null)) : null;
  return {
    id: null,
    nombre: g.cl.nombre ?? (g.cl.concepto_limpio || ultimo.mov.concepto),
    nombre_codigo: idConNombre ? 'nombre_' + idConNombre : null,
    categoria: comercio?.categoria ?? g.cl.categoria ?? (g.kind === 'transferencia' ? 'transferencia' : 'otros'),
    comercio_id: comercio?.id ?? null,
    tipo: g.kind,
    pasarela: pasarela ?? null,
    periodicidad,
    importe: ultimo.importe,
    importe_tipo: importeTipo,
    coste_anual: coste,
    estado,
    etiquetas: [...etiquetas].sort(),
    subida_mensual: subidaMensual,
    subida,
    baja: comercio && (enDiccionario || g.kind === 'comision') ? (comercio.baja ?? `/baja/${comercio.id}/`) : null,
    ayuda: pasarela ? `/baja/${pasarela}/` : null,
    calculo,
    motivos,
    primer_cargo: cargos[0].fecha,
    ultimo_cargo: ultimo.fecha,
    proximo_cargo: estado === 'terminado' || periodicidad === 'puntual' ? null : proximo(cargos, periodicidad),
    num_cargos: n,
    ...(serie.dobles.length ? {
      doble: { movimientos: serie.dobles.flat().map((c) => c.mov.id), importe: sumaCentimos(serie.dobles.map(([, b]) => b.importe)) },
    } : {}),
    movimientos,
  };
}

function masComun(xs) {
  if (!xs.length) return null;
  const n = new Map();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// ---------------------------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------------------------

const porCoste = (a, b) => b.coste_anual - a.coste_anual || String(a.nombre).localeCompare(String(b.nombre)) || (a.id < b.id ? -1 : 1);

/**
 * Cobros que se repiten en los cargos en euros.
 * @param {import('./modelo.js').Movimiento[]} movimientosEUR
 * @param {{diccionario: Object, desde?: string, hasta?: string, meses?: number, nivel?: 'A'|'B'|'C', validacion?: string, hoy?: string}} ctx
 * @returns {{cobros: Object[], gastos_fijos: Object[], terminados: Object[], total_seguro: number, total_posible: number,
 *   avisos: {codigo: string, datos?: Object}[], no_contados: {motivo: string, movimientos: number, importe: number}[]}}
 */
export function detectar(movimientosEUR, ctx = {}) {
  const dic = prepararDiccionario(ctx.diccionario);
  const enEuros = (movimientosEUR ?? []).filter((m) => m && (!m.divisa || m.divisa === 'EUR') && typeof m.fecha === 'string' && Number.isFinite(m.importe));
  // Una fecha imposible (futura, de antes de 2000 o mal escrita) no entra: si no, una sola fila mal leída
  // movería el final del periodo y todos los cobros parecerían terminados. validar.js ya avisa de esas filas.
  const tope = /^\d{4}-\d{2}-\d{2}$/.test(ctx.hoy ?? '') ? sumarDias(ctx.hoy, 1) : null;
  const fechaPosible = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && f >= FECHA_MINIMA && (tope === null || f <= tope);
  const lista = enEuros.filter((m) => fechaPosible(m.fecha));
  let primera = null, ultima = null;
  for (const m of lista) {
    if (primera === null || m.fecha < primera) primera = m.fecha;
    if (ultima === null || m.fecha > ultima) ultima = m.fecha;
  }
  const desde = ctx.desde && (!primera || ctx.desde <= primera) ? ctx.desde : primera;
  const hasta = ctx.hasta && (!ultima || ctx.hasta >= ultima) ? ctx.hasta : ultima;
  const meses = Number.isFinite(ctx.meses) ? ctx.meses : desde && hasta ? mesesEntre(desde, hasta) : 0;
  const c = { desde, hasta, meses, fotoSinVerificar: ctx.nivel === 'C' && ctx.validacion !== 'verificada' };

  // 1. Agrupar los cargos por comercio (o por lo que sean) y apartar lo que no cuenta
  const grupos = new Map();
  const noContados = new Map();
  const apartar = (motivo, importe) => {
    const x = noContados.get(motivo) ?? { motivo, movimientos: 0, centimos: 0 };
    x.movimientos++; x.centimos += aCentimos(importe);
    noContados.set(motivo, x);
  };
  for (const m of enEuros) if (m.importe < 0 && !fechaPosible(m.fecha)) apartar('fecha_fuera_de_rango', -m.importe);
  let orden = 0;
  for (const m of lista) {
    if (!(m.importe < 0)) continue;
    const cl = clasificar(m, dic);
    if (!TIPOS_QUE_CUENTAN.has(cl.tipo)) { apartar(cl.motivo ?? cl.tipo, -m.importe); continue; }
    let g = grupos.get(cl.clave);
    if (!g) {
      const kind = cl.tipo === 'comercio' && cl.comercio?.categoria === 'pasarelas' ? 'pasarela' : cl.tipo;
      g = { clave: cl.clave, cl, kind, cargos: [], variableCategoria: Boolean(cl.comercio && CATEGORIAS_VARIABLES.has(cl.comercio.categoria)) };
      grupos.set(cl.clave, g);
    }
    g.cargos.push({ mov: m, fecha: m.fecha, importe: redondear2(-m.importe), recibo: cl.recibo, tarjeta: Boolean(cl.tarjeta), pasarela: cl.pasarela, n: orden++ });
  }

  // 2. Series y cobros de cada grupo
  const cobros = [], gastos = [], terminados = [];
  const porGrupo = [];
  for (const g of grupos.values()) {
    g.cargos.sort(porFecha);
    if ((g.kind === 'comercio' || g.kind === 'desconocido') && esCompraFrecuente(g.cargos)) {
      for (const x of g.cargos) apartar('compra_frecuente', x.importe);
      continue;
    }
    const { series, fuera } = seriesDelGrupo(g);
    for (const x of fuera) apartar('compra_frecuente', x.importe);
    const lista2 = g.kind === 'comision' ? juntarSueltas(series) : series;
    const delGrupo = [];
    for (const s of lista2) {
      const cobro = evaluar(s, g, c, lista2.length === 1);
      if (cobro) delGrupo.push(cobro);
    }
    delGrupo.sort((a, b) => (a.primer_cargo < b.primer_cargo ? -1 : a.primer_cargo > b.primer_cargo ? 1 : b.coste_anual - a.coste_anual));
    porGrupo.push({ g, delGrupo });
  }
  // Ids: primero los del diccionario, que son fijos («apple» es siempre Apple); un comercio desconocido que se llame
  // igual (una compra en «APPLE») nunca se queda con ese id.
  const usados = new Set();
  const idUnico = (base, reservado) => {
    let id = base;
    for (let k = 2; usados.has(id) || (reservado && dic.porId.has(id)); k++) id = `${base}-${k}`;
    usados.add(id);
    return id;
  };
  // (una comisión que no está en el diccionario conserva su id fijo, «comision_otra»)
  const idFijo = (g) => g.cl.comercio?.id ?? (g.kind === 'comision' && /^[a-z_]+$/.test(g.clave) ? g.clave : null);
  for (const delDiccionario of [true, false]) {
    for (const { g, delGrupo } of porGrupo) {
      if (Boolean(idFijo(g)) !== delDiccionario) continue;
      const base = idFijo(g) ?? slug(g.clave.replace(/^d:/, '').replace(/^transferencia:/, 'transferencia '));
      for (const cobro of delGrupo) {
        cobro.id = idUnico(base, !delDiccionario);
        if (g.kind === 'gasto_fijo' || g.kind === 'transferencia') gastos.push(cobro);
        else if (cobro.estado === 'terminado') terminados.push(cobro);
        else cobros.push(cobro);
      }
    }
  }
  cobros.sort(porCoste);
  gastos.sort(porCoste);
  terminados.sort((a, b) => (a.ultimo_cargo > b.ultimo_cargo ? -1 : a.ultimo_cargo < b.ultimo_cargo ? 1 : porCoste(a, b)));

  // 3. Totales (solo seguros en el destacado; los posibles, aparte) y avisos
  const total = (estado) => sumaCentimos(cobros.filter((x) => x.estado === estado).map((x) => x.coste_anual));
  const avisos = [];
  if (lista.length && meses < 3) avisos.push(aviso('cobros_periodo_corto', { dias: desde && hasta ? diasEntre(desde, hasta) + 1 : 0 }));
  if (c.fotoSinVerificar && cobros.length) avisos.push(aviso('cobros_sin_verificar'));
  if (cobros.some((x) => x.tipo === 'pasarela')) avisos.push(aviso('cobros_pasarelas'));
  if (!dic.porId.size) avisos.push(aviso('cobros_sin_diccionario'));

  return {
    cobros,
    gastos_fijos: gastos,
    terminados,
    total_seguro: total('seguro'),
    total_posible: total('posible'),
    avisos,
    no_contados: [...noContados.values()].map((x) => ({ motivo: x.motivo, movimientos: x.movimientos, importe: x.centimos / 100 })),
  };
}
