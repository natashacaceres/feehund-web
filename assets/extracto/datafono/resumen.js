// Resumen o liquidación del datáfono con etiquetas («Total ventas 9.432,10», tablas por tipo de tarjeta…) → hechos:
// cada cifra leída con su papel (ventas, comisión, cuota…), su grupo de tarjeta si lo tiene y la línea de la que sale.
// Lógica pura. Regla: si una cifra no se puede atribuir sin adivinar, se marca dudosa; nunca se inventa.

import { papelDeEtiqueta, tipoDeTarjeta, papelDeColumna, sinMencionIva, contieneFrase, palabrasDe } from './etiquetas.js';
import { aCentimos } from '../nucleo/numeros.js';

const PAPELES_COLUMNA = new Set(['importe', 'operaciones', 'tasa', 'comision', 'intercambio', 'marca_tasa', 'neto']);
const NUM = new Set(['importe', 'entero', 'porcentaje']);
// títulos de columna que son etiquetas de total («Ventas brutas», «Neto abonado»)
const COLUMNA_DE_ETIQUETA = { ventas_total: 'importe', operaciones_total: 'operaciones', comision: 'comision', comision_total: 'comision', neto: 'neto',
  intercambio: 'intercambio', marca: 'marca_tasa' };
const MAX_FILAS_TABLA = 80;
const FIJO = ['POR OPERACION', 'POR TRANSACCION', 'POR COBRO', 'POR PAGO', 'PER TRANSACTION', 'PER PAYMENT', 'PER OPERACIO',
  'POR OPERACIONES', 'FIJO POR', 'IMPORTE FIJO', 'CANTIDAD FIJA', 'FIXED FEE', 'PER ITEM'].map((f) => f.split(' '));
const PERIODO = ['PERIODO', 'PERIOD', 'DESDE', 'HASTA', 'DEL', 'AL', 'FROM', 'TO', 'LIQUIDACION', 'FECHA INICIO', 'FECHA FIN',
  'FECHA DESDE', 'FECHA HASTA', 'PERIODE', 'MES', 'MONTH', 'RESUMEN', 'EXTRACTO', 'INFORME'].map((f) => f.split(' '));
const MESES = { ENERO: 1, GENER: 1, JANUARY: 1, FEBRERO: 2, FEBRER: 2, FEBRUARY: 2, MARZO: 3, MARC: 3, MARCH: 3, ABRIL: 4, APRIL: 4,
  MAYO: 5, MAIG: 5, MAY: 5, JUNIO: 6, JUNY: 6, JUNE: 6, JULIO: 7, JULIOL: 7, JULY: 7, AGOSTO: 8, AGOST: 8, AUGUST: 8,
  SEPTIEMBRE: 9, SETIEMBRE: 9, SETEMBRE: 9, SEPTEMBER: 9, OCTUBRE: 10, OCTOBER: 10, NOVIEMBRE: 11, NOVEMBRE: 11, NOVEMBER: 11,
  DICIEMBRE: 12, DESEMBRE: 12, DECEMBER: 12 };

/**
 * @typedef {Object} Hecho
 * @property {string} papel  ventas|operaciones|tasa|comision|intercambio|marca_tasa|neto (por grupo o total), cuota, alquiler,
 *   iva, cargo_otro, cargos_total, devoluciones, contracargos, comision_devuelta, fijo, tasa_general
 * @property {string|null} grupo   particulares|empresa|fuera_europa|amex|bizum (filas de tipo de tarjeta) o null (totales)
 * @property {boolean} [total]     fila de totales de una tabla
 * @property {number} valor        en euros, en número de operaciones o en %
 * @property {Object} linea        la línea de la que sale (lineas.js)
 * @property {string} etiqueta     texto de la etiqueta tal cual
 * @property {boolean} dudoso      la cifra se ha atribuido por su tamaño, no por un título de columna
 * @property {Object} [tipo]       lo que dice la etiqueta del tipo de tarjeta (marca, uso, región)
 * @property {string|null} [iva]   'incluido' | 'sin' si la etiqueta lo dice
 */

/**
 * ¿Es un movimiento de cuenta («02/03 NETFLIX.COM -13,99», «05/10/2026 BIZUM DE ANA 20,00»)? Fecha, concepto con
 * letras e importe en la misma línea. Un resumen del datáfono no pone fecha en sus líneas de totales; sus filas por día
 * no llevan concepto. Estas líneas nunca dan cifras: en un extracto del banco «BIZUM» o «CUOTA HIPOTECA» no son del datáfono.
 */
const MES_SOLO = /^(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC|GEN|JAN|APR|AUG|DEC)[A-Z]*\.?$/i;
const FECHA_CORTA = /^(\d{1,2}[/.-]\d{1,2}|\d{1,2}\s?(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC|GEN|JAN|APR|AUG|DEC)[A-Z]*\.?)(\s|$)/i;
export function esMovimiento(L) {
  if (!L.trozos.some((t) => t.tipo === 'importe')) return false;
  const textos = L.trozos.filter((t) => t.tipo === 'texto').map((t) => t.texto);
  // fecha completa, o corta al principio de un texto («02/03», «1 nov», «02 MAR»), o el número de una fecha de Excel
  const MES = /^(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC|GEN|JAN|APR|AUG|DEC)/i;
  const partida = L.trozos.some((t, i) => t.tipo === 'entero' && t.valor >= 1 && t.valor <= 31 && L.trozos[i + 1]?.tipo === 'texto' && MES.test(L.trozos[i + 1].texto)); // «1» «nov» «2025»
  const fecha = partida || L.trozos.some((t) => t.tipo === 'fecha') || textos.some((t) => FECHA_CORTA.test(t.trim()))
    || (L.hoja_de_calculo && L.trozos.some((t) => t.tipo === 'entero' && t.valor >= 36526 && t.valor <= 54789));
  if (!fecha) return false;
  const letras = textos.map((t) => t.replace(FECHA_CORTA, ' ').replace(MES_SOLO, ' ')).join(' ').replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letras.length < 3) return false;
  return !L.palabras.some((p) => p === 'PERIODO' || p === 'PERIOD' || p === 'PERIODE'); // «Periodo 01/10 - 31/10»
}

/** Líneas → {hechos, periodo, cabeceras, sin_entender, movimientos}. */
export function extraerResumen(lineas) {
  const hechos = [], sinEntender = [];
  const usadas = new Set();
  const cabeceras = [];
  let movimientos = 0;
  lineas.forEach((L, i) => { if (esMovimiento(L)) { usadas.add(i); movimientos++; } });

  // 1. tablas con fila de títulos
  for (let i = 0; i < lineas.length; i++) {
    const cols = columnasDeCabecera(lineas[i]);
    if (!cols) continue;
    cabeceras.push(lineas[i]);
    usadas.add(i);
    let j = i + 1;
    for (; j < lineas.length && j <= i + MAX_FILAS_TABLA; j++) {
      const L = lineas[j], prev = lineas[j - 1];
      if (!mismaTabla(prev, L) || columnasDeCabecera(L)) break;
      if (usadas.has(j)) continue; // un movimiento de cuenta dentro de la tabla
      if (!L.trozos.some((t) => NUM.has(t.tipo))) {
        // una línea solo con texto dentro de la tabla: título de grupo («Visa») o fin de la tabla
        if (tipoDeTarjeta(etiquetaDe(L.trozos)) && j + 1 < lineas.length && mismaTabla(L, lineas[j + 1])) { usadas.add(j); continue; }
        break;
      }
      usadas.add(j);
      filaDeTabla(L, cols, hechos, sinEntender, j === i + 1);
    }
    i = j - 1;
  }

  // 2. líneas sueltas: «etiqueta cifra», varias por línea, o etiqueta encima de la cifra
  for (let i = 0; i < lineas.length; i++) {
    if (usadas.has(i)) continue;
    const L = lineas[i];
    const hayNumeros = L.trozos.some((t) => NUM.has(t.tipo));
    if (!hayNumeros) {
      const S = lineas[i + 1];
      if (S && !usadas.has(i + 1) && soloNumeros(S) && cerca(L, S)) {
        const pares = emparejarDebajo(L, S);
        if (pares.length) { for (const seg of pares) segmentoSuelto(seg, L, S, hechos, sinEntender); usadas.add(i + 1); }
      }
      continue;
    }
    for (const seg of segmentos(L.trozos)) segmentoSuelto(seg, L, L, hechos, sinEntender);
  }
  return { hechos, periodo: buscarPeriodo(lineas), cabeceras: cabeceras.length, sin_entender: sinEntender, movimientos };
}

// ───────────── tablas ─────────────

/** ¿Es una fila de títulos? Al menos dos títulos de cifras (importe, operaciones, tasa, comisión…). */
export function columnasDeCabecera(L) {
  const textos = L.trozos.filter((t) => t.tipo === 'texto');
  if (textos.length < 2 || L.trozos.some((t) => t.tipo === 'importe')) return null;
  const cols = [];
  for (const t of textos) {
    const papel = papelDeColumna(t.texto) ?? COLUMNA_DE_ETIQUETA[papelDeEtiqueta(sinMencionIva(t.texto).palabras)]
      ?? (tipoDeTarjeta(t.texto) === null && /^(TIPO|TARJETA|MARCA|CONCEPTO|PRODUCTO)/.test(palabrasDe(t.texto)[0] ?? '') ? 'etiqueta' : null);
    if (papel) cols.push({ papel, x0: t.x0, x1: t.x1, texto: t.texto });
  }
  const deCifras = new Set(cols.filter((c) => PAPELES_COLUMNA.has(c.papel)).map((c) => c.papel));
  if (deCifras.size < 2) return null;
  return cols;
}

function mismaTabla(a, b) {
  if (a.archivo !== b.archivo || a.pagina !== b.pagina || a.hoja !== b.hoja) return false;
  if (a.hoja_de_calculo) return b.fila - a.fila <= 1;
  return b.y - a.y <= 3.2 * Math.max(a.alto, b.alto);
}

/** Columna de una cifra: la del título que más se solapa; si ninguno, el más cercano (si está cerca). */
function columnaDe(t, cols, L) {
  let mejor = null, solape = 0;
  for (const c of cols) {
    const s = Math.min(t.x1, c.x1) - Math.max(t.x0, c.x0);
    if (s > solape) { solape = s; mejor = c; }
  }
  if (mejor) return mejor;
  if (L.hoja_de_calculo) return null;
  const cx = (t.x0 + t.x1) / 2;
  let d = Infinity;
  for (const c of cols) {
    const dc = Math.min(Math.abs(cx - (c.x0 + c.x1) / 2), Math.abs(t.x1 - c.x1), Math.abs(t.x0 - c.x0));
    if (dc < d) { d = dc; mejor = c; }
  }
  return d <= 8 * (L.ancho_letra || 1) ? mejor : null;
}

function filaDeTabla(L, cols, hechos, sinEntender, primera = false) {
  const etiqueta = etiquetaDe(L.trozos);
  const { palabras, iva } = sinMencionIva(etiqueta);
  const papel = papelDeEtiqueta(palabras);
  const tipo = tipoDeTarjeta(palabras);
  const valores = {}, sueltos = [];
  for (const t of L.trozos) {
    if (!NUM.has(t.tipo)) continue;
    const c = columnaDe(t, cols, L);
    const encaja = c && (c.papel === 'operaciones' ? t.tipo === 'entero' : c.papel === 'tasa' ? t.tipo === 'porcentaje' || t.tipo === 'importe' : t.tipo !== 'porcentaje');
    if (encaja && valores[c.papel] === undefined) valores[c.papel] = t;
    else sueltos.push(t);
  }
  // un entero en una columna de importes («1500» en una hoja) es un importe sin céntimos
  // fila de una tabla por días («03/10/2026  12  345,60  1,52»): cuenta para comprobar la suma, no es un total
  const fecha = L.trozos.find((t) => t.tipo === 'fecha');
  if (fecha && !tipo && (!papel || papel === 'total')) {
    const extra = { grupo: null, dia: fecha.valor };
    for (const [p, t] of [['ventas', valores.importe], ['operaciones', valores.operaciones], ['comision', valores.comision], ['neto', valores.neto]]) {
      if (t) hechos.push({ linea: L, etiqueta, dudoso: false, iva, papel: 'dia_' + p, valor: valorDe(t, p), trozo: t, ...extra });
    }
    return;
  }
  // sin etiqueta y justo debajo de los títulos: la fila de cifras de unos totales («Ventas brutas · Operaciones · Comisiones»)
  const esTotal = /^(TOTAL|TOTALES|SUBTOTAL|SUMA|SUMAS|GRAND)$/.test(palabras[0] ?? '') || papel === 'total' || (!etiqueta && primera);
  if (!etiqueta && !esTotal) { sinEntender.push(L); return; }
  const base = { linea: L, etiqueta, dudoso: false, iva };
  const emitir = (p, t, extra = {}) => { if (t) hechos.push({ ...base, papel: p, valor: valorDe(t, p), trozo: t, ...extra }); };
  // «Total cargos», «Total neto», «Cuota mensual»: su propio papel, aunque empiecen por «Total»
  const papelPropio = papel && !['total', 'ventas_total', 'comision_total', 'operaciones_total', 'comision', 'intercambio', 'marca', 'ignorar'].includes(papel);
  if (papelPropio && !tipo) {
    const t = valores.comision ?? valores.importe ?? valores.neto ?? ultimoImporte(L.trozos);
    if (t) hechos.push({ ...base, papel: papelSuelto(papel), valor: valorDe(t, papel), trozo: t, grupo: null });
    return;
  }
  if (esTotal && tipo && palabras.length > 1) return; // «Total Visa»: subtotal de un grupo, ya contado en sus filas
  if (esTotal || (papel && papel !== 'total' && !tipo && ['ventas_total', 'comision_total', 'operaciones_total'].includes(papel))) {
    const extra = { total: true, grupo: null };
    emitir('ventas', valores.importe, extra);
    emitir('operaciones', valores.operaciones, extra);
    emitir('comision', valores.comision, extra);
    emitir('intercambio', valores.intercambio, extra);
    emitir('marca_tasa', valores.marca_tasa, extra);
    emitir('neto', valores.neto, extra);
    return;
  }
  if (tipo && (!papel || ['ventas_total', 'comision', 'comision_total', 'operaciones_total', 'intercambio', 'marca'].includes(papel))) {
    const extra = { grupo: tipo.grupo, tipo };
    emitir('ventas', valores.importe, extra);
    emitir('operaciones', valores.operaciones, extra);
    emitir('tasa', valores.tasa, extra);
    emitir('comision', valores.comision, extra);
    emitir('intercambio', valores.intercambio, extra);
    emitir('marca_tasa', valores.marca_tasa, extra);
    emitir('neto', valores.neto, extra);
    return;
  }
  if (papel && papel !== 'ignorar' && papel !== 'total') {
    const t = valores.comision ?? valores.importe ?? valores.neto ?? ultimoImporte(L.trozos);
    if (t) hechos.push({ ...base, papel: papelSuelto(papel), valor: valorDe(t, papel), trozo: t, grupo: null });
    return;
  }
  if (papel !== 'ignorar') sinEntender.push(L);
}

// ───────────── líneas sueltas ─────────────

/** Trozos → segmentos [etiqueta, cifras…]: un texto que va detrás de una cifra empieza otro segmento. */
function segmentos(trozos) {
  const out = [];
  let seg = null;
  for (const t of trozos) {
    if (t.tipo === 'texto' || t.tipo === 'fecha') {
      if (!seg || seg.numeros.length) { seg = { textos: [], numeros: [] }; out.push(seg); }
      seg.textos.push(t);
    } else {
      if (!seg) { seg = { textos: [], numeros: [] }; out.push(seg); }
      seg.numeros.push(t);
    }
  }
  // «IVA 21 % sobre cuota 5,25»: un porcentaje entre textos se queda con su etiqueta
  for (let k = 0; k + 1 < out.length; k++) {
    const a = out[k], b = out[k + 1];
    if (a.numeros.length && a.numeros.every((n) => n.tipo === 'porcentaje') && b.textos.length) {
      b.textos = [...a.textos, ...b.textos];
      b.numeros = [...a.numeros, ...b.numeros];
      out.splice(k, 1);
      k--;
    }
  }
  return out;
}

function segmentoSuelto(seg, Letiqueta, Lcifra, hechos, sinEntender) {
  const etiqueta = seg.textos.filter((t) => t.tipo === 'texto').map((t) => t.texto).join(' ');
  if (!etiqueta || !seg.numeros.length) return;
  const { palabras, iva } = sinMencionIva(etiqueta);
  let papel = papelDeEtiqueta(palabras);
  const tipo = tipoDeTarjeta(palabras);
  const L = Lcifra;
  const base = { linea: L, linea_etiqueta: Letiqueta !== Lcifra ? Letiqueta : undefined, etiqueta, iva };
  const importes = seg.numeros.filter((t) => t.tipo === 'importe');
  const enteros = seg.numeros.filter((t) => t.tipo === 'entero');
  const pcts = seg.numeros.filter((t) => t.tipo === 'porcentaje');
  const emitir = (p, t, extra = {}) => { if (t) hechos.push({ ...base, dudoso: false, papel: p, valor: valorDe(t, p), trozo: t, grupo: null, ...extra }); };

  if (papel === 'ignorar' || papel === 'total') return;
  // tarifa por operación: «0,05 € por operación»
  if (FIJO.some((f) => contieneFrase(palabras, f)) && importes.length === 1 && Math.abs(importes[0].valor) < 5) {
    emitir('fijo', importes[0]);
    if (pcts.length === 1) emitir('tasa_general', pcts[0]);
    return;
  }
  if (tipo && (!papel || ['ventas_total', 'comision', 'comision_total', 'operaciones_total'].includes(papel))) {
    const extra = { grupo: tipo.grupo, tipo };
    if (papel === 'comision' || papel === 'comision_total') { emitir('comision', importes[importes.length - 1], extra); emitir('tasa', pcts[0], extra); return; }
    if (papel === 'operaciones_total') { emitir('operaciones', enteros[0], extra); return; }
    filaPorValores(importes, enteros, pcts, base, extra, hechos);
    return;
  }
  if (!papel) { if (!seg.numeros.every((n) => n.tipo === 'entero')) sinEntender.push(L); return; }
  switch (papel) {
    case 'ventas_total':
      emitir('ventas', importes[importes.length - 1] ?? (enteros.length === 1 && /€|EUR/i.test(enteros[0].texto) ? enteros[0] : null), { total: true });
      if (enteros.length === 1 && importes.length) emitir('operaciones', enteros[0], { total: true });
      return;
    case 'operaciones_total':
      if (enteros.length === 1 && !importes.length) emitir('operaciones', enteros[0], { total: true });
      else if (enteros.length === 1 && importes.length === 1) { emitir('operaciones', enteros[0], { total: true }); emitir('ventas', importes[0], { total: true }); }
      return;
    case 'comision':
    case 'comision_total':
      emitir('comision', importes[importes.length - 1], { total: true });
      if (pcts.length === 1) emitir('tasa_general', pcts[0]);
      return;
    case 'intercambio': case 'marca':
      emitir(papel === 'marca' ? 'marca_tasa' : 'intercambio', importes[importes.length - 1], { total: true });
      return;
    default:
      emitir(papelSuelto(papel), importes[importes.length - 1]);
      if (papel === 'iva' && pcts.length === 1) emitir('iva_tipo', pcts[0]);
  }
}

/** Fila de un tipo de tarjeta sin títulos de columna: las cifras se atribuyen por lo que son y por cómo cuadran. */
function filaPorValores(importes, enteros, pcts, base, extra, hechos) {
  const h = (papel, t, dudoso) => { if (t) hechos.push({ ...base, ...extra, papel, valor: valorDe(t, papel), trozo: t, dudoso }); };
  if (enteros.length === 1) h('operaciones', enteros[0], false);
  const tasa = pcts.length === 1 ? pcts[0] : null;
  if (tasa) h('tasa', tasa, false);
  const ops = enteros.length === 1 ? enteros[0].valor : 0;
  if (importes.length === 1) { h('ventas', importes[0], false); return; }
  if (importes.length === 2) {
    const [a, b] = importes;
    if (tasa && cuadraComision(a.valor, tasa.valor, b.valor, ops)) { h('ventas', a, false); h('comision', b, false); return; }
    if (tasa && cuadraComision(b.valor, tasa.valor, a.valor, ops)) { h('ventas', b, false); h('comision', a, false); return; }
    const [mayor, menor] = Math.abs(a.valor) >= Math.abs(b.valor) ? [a, b] : [b, a];
    h('ventas', mayor, true); h('comision', menor, true);
    return;
  }
  if (importes.length === 3) {
    const v = importes.map((t) => aCentimos(Math.abs(t.valor)));
    for (const [i, j, k] of [[0, 1, 2], [0, 2, 1]]) {
      if (v[i] - v[j] === v[k]) { h('ventas', importes[i], false); h('comision', importes[j], false); h('neto', importes[k], false); return; }
    }
    h('ventas', importes[0], true);
  }
}

/** ¿ventas × tasa cuadra con la comisión? Margen de medio céntimo por operación (cada cobro se redondea). */
export function cuadraComision(ventas, tasaPct, comision, ops = 0, fijo = 0) {
  const esperado = Math.abs(ventas) * tasaPct / 100 + (ops || 0) * (fijo || 0);
  const margen = Math.max(0.011, 0.005 * (ops || 0) + 0.011);
  return Math.abs(esperado - Math.abs(comision)) <= margen;
}

/** Etiqueta encima de su cifra: «Total ventas   Comisiones» / «9.432,10 €   61,83 €». Cada cifra con la etiqueta más cercana. */
function emparejarDebajo(L, S) {
  const textos = L.trozos.filter((t) => t.tipo === 'texto' && papelDeEtiqueta(sinMencionIva(t.texto).palabras));
  if (!textos.length) return [];
  const out = new Map();
  for (const n of S.trozos.filter((t) => NUM.has(t.tipo))) {
    const cx = (n.x0 + n.x1) / 2;
    let mejor = null, d = Infinity;
    for (const t of textos) {
      const dt = cx >= t.x0 && cx <= t.x1 ? 0 : Math.min(Math.abs(cx - t.x0), Math.abs(cx - t.x1));
      if (dt < d) { d = dt; mejor = t; }
    }
    const lim = S.hoja_de_calculo ? 0.5 : 12 * (S.ancho_letra || 1);
    if (!mejor || d > lim) continue;
    if (!out.has(mejor)) out.set(mejor, { textos: [mejor], numeros: [] });
    out.get(mejor).numeros.push(n);
  }
  return [...out.values()];
}

const soloNumeros = (L) => L.trozos.length > 0 && L.trozos.every((t) => NUM.has(t.tipo) || (t.tipo === 'texto' && /^(€|EUR|EUROS)$/i.test(t.texto)));
const cerca = (a, b) => a.archivo === b.archivo && a.pagina === b.pagina && a.hoja === b.hoja &&
  (a.hoja_de_calculo ? b.fila - a.fila === 1 : b.y - a.y > 0 && b.y - a.y <= 3 * Math.max(a.alto, b.alto));

// ───────────── utilidades ─────────────

function etiquetaDe(trozos) {
  return trozos.filter((t) => t.tipo === 'texto').map((t) => t.texto).join(' ').trim();
}

function ultimoImporte(trozos) {
  const l = trozos.filter((t) => t.tipo === 'importe');
  return l[l.length - 1] ?? null;
}

/** El valor de una cifra para su papel: importes en positivo (el signo lo pone el papel), % y operaciones tal cual. */
function valorDe(t, papel) {
  if (papel === 'tasa' || papel === 'tasa_general' || papel === 'iva_tipo') return t.tipo === 'porcentaje' ? t.valor : t.valor;
  if (papel === 'operaciones') return Math.abs(t.valor);
  return Math.abs(t.valor);
}

function papelSuelto(p) {
  return { comision_total: 'comision', ventas_total: 'ventas', operaciones_total: 'operaciones', marca: 'marca_tasa' }[p] ?? p;
}

// ───────────── periodo ─────────────

/**
 * Periodo que declara el documento: «Periodo 01/10/2026 - 31/10/2026», «del 1 al 31 de octubre de 2026», «Octubre 2026».
 * @returns {{desde, hasta, origen, como}|null}
 */
export function buscarPeriodo(lineas) {
  // dos fechas en una línea con palabra de periodo, o en la misma línea sin más cifras
  for (const L of lineas.slice(0, 400)) {
    const f = L.trozos.filter((t) => t.tipo === 'fecha');
    if (f.length !== 2 || L.trozos.some((t) => t.tipo === 'importe')) continue;
    if (!PERIODO.some((p) => contieneFrase(L.palabras, p)) && L.trozos.filter((t) => t.tipo === 'texto').length > 3) continue;
    const [a, b] = [f[0].valor, f[1].valor].sort();
    if (a && b && a !== b) return { desde: a, hasta: b, linea: L, como: 'fechas' };
  }
  // mes y año escritos: «Octubre 2026», «octubre de 2026», «Liquidación del mes de octubre de 2026»
  for (const L of lineas.slice(0, 120)) {
    const p = L.palabras;
    for (let i = 0; i < p.length; i++) {
      const mes = MESES[p[i]];
      if (!mes) continue;
      const anio = [p[i + 1], p[i + 2]].map(Number).find((n) => n >= 2000 && n <= 2100)
        ?? L.trozos.filter((t) => t.tipo === 'entero').map((t) => t.valor).find((n) => n >= 2000 && n <= 2100);
      if (!anio) continue;
      const mm = String(mes).padStart(2, '0');
      const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
      return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimo).padStart(2, '0')}`, linea: L, como: 'mes' };
    }
  }
  return null;
}
