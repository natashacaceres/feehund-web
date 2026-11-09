// Filas de una hoja de cálculo o de un CSV → movimientos.
// Regla: una fila solo es movimiento si tiene fecha válida e importe válido. Lo demás se salta y se cuenta.
// Lógica pura: sin DOM, sin red, sin almacenamiento.

import { crearMovimiento, aviso } from './modelo.js';
import { parseImporte, inferirDecimal, redondear2 } from './numeros.js';
import { parseFecha, parseFechaParcial, inferirOrden, completarAnio, serialExcelAISO, pareceSerialExcel, aISO } from './fechas.js';
import { normalizar, recortar } from './texto.js';
import {
  detectarCabecera, inferirColumnas, asignarColumnas, tituloNormalizado, esFechaCelda, SIGNOS_CARGO, SIGNOS_ABONO, PAPELES_MULTIPLES,
} from './cabeceras.js';
import { reconocerPerfil } from './perfiles.js';

export const MAX_FILAS = 100000;
const MUESTRA = 5000;
const SEPARADOR = ' · ';

const ETIQUETA_SALDO = /^\s*(saldo|opening|closing|balance)/i;
const SALDO_INICIAL = /^(SALDO (INICIAL|ANTERIOR|DE APERTURA|D OBERTURA|A INICIO|AL INICIO)|OPENING BALANCE|BALANCE BROUGHT FORWARD|PREVIOUS BALANCE|STARTING BALANCE)\b/;
const SALDO_FINAL = /^(SALDO (FINAL|DE CIERRE|DE TANCAMENT|A FECHA|A DATA)|CLOSING BALANCE|BALANCE CARRIED FORWARD|ENDING BALANCE)\b/;
// filas de totales (con o sin fecha): nunca son movimientos. Ojo: «TOTAL ENERGIES» sí lo es, por eso va entero.
const TOTALES = /^(TOTAL|TOTALES|SUBTOTAL|SUMA|SUMAS|TOTAL GENERAL|TOTAL (DE )?(MOVIMIENTOS|CARGOS|ABONOS|DEBE|HABER|PERIODO|DEL PERIODO|MES|DEL MES|DIA|DEL DIA|MOVIMENTS|CARRECS|ABONAMENTS)|TOTALS?)$/;
const PERIODO = /\b(?:DESDE|DES DE|DEL|PERIODO|PERIODE|FROM|ENTRE)\b\D{0,24}?(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})\D{1,24}?(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})/;
const DIVISAS = new Set(['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'MXN', 'ARS', 'COP', 'CLP', 'BRL', 'JPY', 'CNY', 'AUD', 'CAD', 'TRY', 'MAD', 'NZD', 'SGD', 'HKD', 'INR', 'ZAR', 'ILS', 'AED', 'ISK']);
const DIVISA_EN_TEXTO = /\b(EUR|USD|GBP|CHF|SEK|NOK|DKK|PLN|CZK|HUF|RON|BGN|MXN|JPY|AUD|CAD)\b|([€$£¥])/i;
const SIMBOLOS = { '€': 'EUR', $: 'USD', '£': 'GBP', '¥': 'JPY' };
// Lo que puede ir detrás de «Saldo final», «Saldo anterior»… en la misma celda sin que deje de ser la fila del saldo
// (fechas, cifras y estas palabras). «SALDO FINAL PRESTAMO» ya es otra cosa: un movimiento.
const RELLENO_SALDO = new Set([
  'A', 'AL', 'DEL', 'DE', 'LA', 'EL', 'EN', 'D', 'L', 'FECHA', 'DATA', 'DIA', 'HOY', 'AVUI', 'PERIODO', 'PERIODE', 'EXTRACTO',
  'EXTRACTE', 'MES', 'CUENTA', 'COMPTE', 'EUR', 'EUROS', 'EURO', 'AS', 'AT', 'ON', 'OF', 'THE', 'DATE', 'PERIOD', 'STATEMENT',
  'ACCOUNT', 'CONTABLE', 'COMPTABLE', 'DISPONIBLE', 'ACTUAL', 'H', 'DR', 'CR',
]);
// Estados que dicen que el dinero no se ha movido (sin acentos ni signos). Valen para cualquier archivo con columna de estado.
// «Devuelto» no está: el banco puede poner la devolución en otra fila, y quitar el cargo dejaría un ingreso de más.
const ESTADOS_SIN_COMPLETAR = new Set([
  'PENDING', 'PENDIENTE', 'PENDENT', 'DECLINED', 'REJECTED', 'RECHAZADO', 'RECHAZADA', 'REBUTJAT', 'REBUTJADA', 'DENEGADO',
  'DENEGADA', 'DENEGAT', 'REVERTED', 'REVERTIDO', 'REVERTIDA', 'REVERTIT', 'FAILED', 'FALLIDO', 'FALLIDA', 'FALLAT', 'FALLADA',
  'ERROR', 'CANCELLED', 'CANCELED', 'CANCELADO', 'CANCELADA', 'CANCEL LAT', 'CANCEL LADA', 'ANULADO', 'ANULADA', 'ANUL LAT',
  'ANUL LADA', 'EXPIRED', 'CADUCADO', 'CADUCADA', 'CADUCAT', 'RETENIDO', 'RETENIDA', 'RETINGUT', 'RETINGUDA', 'EN PROCESO',
  'EN CURSO', 'EN CURS', 'PROCESSING', 'IN PROGRESS',
]);
// Marca de cargo o abono pegada al importe («13,99 D», «1.500,00 H», «13.99 DR», «CR 5.00»).
const MARCAS_CARGO = new Set(['D', 'DR', 'DB', 'DEB', 'DEBE', 'CARGO', 'DEBIT']);
const MARCAS_ABONO = new Set(['H', 'CR', 'HABER', 'ABONO', 'CREDIT']);
const MARCA_DETRAS = /^(.*\d[^A-Za-z]*?)\s*([A-Za-z]{1,6})\.?$/;
const MARCA_DELANTE = /^([A-Za-z]{1,6})\.?\s+(.*\d.*)$/;

function vacia(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function filaVacia(fila) {
  if (!fila) return true;
  for (const v of fila) if (!vacia(v)) return false;
  return true;
}

/** Texto de una celda tal cual, con un solo espacio. */
function textoCelda(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  return String(v).replace(/\s+/g, ' ').trim();
}

/** La fila original unida con « | » (para enseñar de dónde sale cada movimiento). */
export function textoDeFila(fila, max = 200) {
  if (!fila) return '';
  let ultima = fila.length - 1;
  while (ultima >= 0 && vacia(fila[ultima])) ultima--;
  const partes = [];
  for (let c = 0; c <= ultima; c++) partes.push(textoCelda(fila[c]));
  return recortar(partes.join(' | '), max);
}

function anchoDeFila(fila) {
  let ultima = (fila?.length ?? 0) - 1;
  while (ultima >= 0 && vacia(fila[ultima])) ultima--;
  return ultima + 1;
}

/** Serial de Excel → "AAAA-MM-DD" solo si cae entre 1980 y 2099 (si no, no es una fecha de extracto). */
function serialAISO(v, es1904) {
  return pareceSerialExcel(v, es1904) ? serialExcelAISO(v, es1904) : null;
}

/** Fecha de una celda: "AAAA-MM-DD", {mes, dia} si le falta el año, o null. */
function leerFecha(v, orden, es1904) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') {
    if (Number.isInteger(v) && v >= 19800101 && v <= 20991231) return leerFecha(String(v), orden, es1904); // 20260105
    return Number.isFinite(v) ? serialAISO(v, es1904) : null;
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  if (/^\d{5}(\.\d+)?$/.test(s)) return serialAISO(Number(s), es1904);
  const p = parseFechaParcial(s, { orden, compacta: true });
  if (!p) return null;
  if (p.anio === null) return { mes: p.mes, dia: p.dia };
  return aISO(p.anio, p.mes, p.dia);
}

/** Divisa escrita en una celda («EUR», «€», «Euros»…) o null. */
function leerDivisa(v) {
  const s = normalizar(textoCelda(v));
  if (!s) return null;
  if (DIVISAS.has(s)) return s;
  if (SIMBOLOS[s]) return SIMBOLOS[s];
  if (s === 'EURO' || s === 'EUROS') return 'EUR';
  if (/^[A-Z]{3}$/.test(s)) return s;
  return null;
}

/** Divisa que acompaña a un importe escrito («12,50 USD», «$12.50»). */
function divisaDelImporte(v) {
  if (typeof v !== 'string') return null;
  const m = v.match(DIVISA_EN_TEXTO);
  if (!m) return null;
  return m[1] ? m[1].toUpperCase() : SIMBOLOS[m[2]] ?? null;
}

/** Separa la marca de cargo o abono de un importe: {resto, marca: 'cargo'|'abono'} o null. */
function separarMarca(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(MARCA_DETRAS), resto, marca;
  if (m) { resto = m[1]; marca = m[2]; } else if ((m = s.match(MARCA_DELANTE))) { marca = m[1]; resto = m[2]; } else return null;
  const t = marca.toUpperCase();
  if (MARCAS_CARGO.has(t)) return { resto: resto.trim(), marca: 'cargo' };
  if (MARCAS_ABONO.has(t)) return { resto: resto.trim(), marca: 'abono' };
  return null;
}

/** Importe de una celda; también con la marca de cargo o abono pegada. Si la marca y el signo no casan, null. */
function leerImporte(v, decimal) {
  const n = parseImporte(v, { decimal });
  if (n !== null) return n;
  const sm = separarMarca(v);
  if (!sm) return null;
  const x = parseImporte(sm.resto, { decimal });
  if (x === null) return null;
  const conSigno = /^[-−(]|-$|\)$/.test(sm.resto) ? 'cargo' : /^\+/.test(sm.resto) ? 'abono' : null;
  if (conSigno && conSigno !== sm.marca) return null; // «-13,99 H»: no se elige
  return sm.marca === 'cargo' ? -Math.abs(x) || 0 : Math.abs(x);
}

/** Texto de un importe sin la marca de cargo o abono (para deducir el separador decimal). */
function sinMarca(v) {
  return separarMarca(v)?.resto ?? v;
}

/** ¿Parece un IBAN o un número de cuenta? (no se mete en el concepto) */
function pareceCuenta(s) {
  const t = s.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(t) || /^\d{10,24}$/.test(t);
}

/** Busca «del 01/01/2026 al 31/03/2026» y parecidos en las filas de arriba. */
export function buscarPeriodo(filas, hasta) {
  for (let i = 0; i < Math.min(hasta, filas.length, 40); i++) {
    const fila = filas[i];
    if (!fila || filaVacia(fila)) continue;
    const texto = normalizar(fila.map(textoCelda).join(' '));
    const m = texto.match(PERIODO);
    if (!m) continue;
    const a = parseFecha(m[1]), b = parseFecha(m[2]);
    if (a && b && a <= b) return { desde: a, hasta: b };
  }
  return null;
}

/** ¿Es una fila «Saldo inicial / anterior / final»? Devuelve {tipo, valor} o null. */
function filaDeSaldo(fila, col, decimales) {
  let tipo = null, k = -1;
  for (let c = 0; c < fila.length; c++) {
    const v = fila[c];
    if (typeof v !== 'string' || !ETIQUETA_SALDO.test(v)) continue;
    const t = normalizar(v).replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const mi = t.match(SALDO_INICIAL), mf = mi ? null : t.match(SALDO_FINAL);
    const m = mi ?? mf;
    if (!m || !soloRelleno(t.slice(m[0].length))) continue;
    tipo = mi ? 'inicial' : 'final';
    k = c;
    break;
  }
  if (!tipo) return null;
  const probar = (v, decimal) => (vacia(v) ? null : leerImporte(v, decimal));
  let valor = null;
  if (col.saldo !== undefined && col.saldo !== k) valor = probar(fila[col.saldo], decimales.saldo);
  if (valor === null && col.importe !== undefined && col.importe !== k) valor = probar(fila[col.importe], decimales.importe);
  if (valor === null) {
    // «Saldo final: 1.234,56 €» en la misma celda (sin confundir la fecha con el importe), o el primer importe a la derecha
    const resto = String(fila[k])
      .replace(/^[^:]*?(saldo|balance)[^:\d-]*[:]?/i, ' ')
      .replace(/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?/g, ' ');
    const enCelda = resto.match(/[-+(]?\s?\d[\d.,' ]*\d(?:\s?-|\))?|[-+]?\d/g);
    if (enCelda) {
      // la frase del pie puede ir con otro separador decimal que la tabla: si con el de la columna no se lee, sin pista
      for (let j = enCelda.length - 1; j >= 0 && valor === null; j--) {
        const x = enCelda[j].trim();
        valor = parseImporte(x, { decimal: decimales.saldo }) ?? parseImporte(x);
      }
    }
    for (let c = k + 1; valor === null && c < fila.length; c++) {
      if (typeof fila[c] === 'number' || (typeof fila[c] === 'string' && /\d/.test(fila[c]) && parseFecha(fila[c].trim()) === null)) {
        valor = probar(fila[c], decimales.saldo);
      }
    }
  }
  return valor === null ? null : { tipo, valor };
}

/** ¿Lo que sigue a la etiqueta del saldo son solo fechas, cifras y palabras de relleno? */
function soloRelleno(resto) {
  for (const p of resto.trim().split(' ')) if (p && !/^\d+$/.test(p) && !RELLENO_SALDO.has(p)) return false;
  return true;
}

/** Fila de títulos repetida (exportaciones por páginas): no cuenta como fila saltada. */
function esCabeceraRepetida(fila, titulos) {
  if (!titulos || !titulos.length) return false;
  let iguales = 0;
  for (let c = 0; c < Math.min(fila.length, titulos.length); c++) {
    if (titulos[c] && tituloNormalizado(fila[c]) === titulos[c]) iguales++;
  }
  return iguales >= 2;
}

function codigosDe(avisos) {
  return avisos.map((a) => a.codigo);
}

function completo(col) {
  return col.fecha !== undefined && (col.importe !== undefined || col.cargo !== undefined || col.abono !== undefined);
}

/** Plan de lectura con el mapeo que ha hecho la persona. */
function planDesdeMapeo(filas, mapeo) {
  const c = mapeo?.columnas ?? {};
  const col = {};
  const entero = (n) => Number.isInteger(n) && n >= 0;
  for (const k of ['fecha', 'fecha_valor', 'importe', 'cargo', 'abono', 'saldo', 'divisa']) if (entero(c[k])) col[k] = c[k];
  const conc = Array.isArray(c.concepto) ? c.concepto : c.concepto !== undefined && c.concepto !== null ? [c.concepto] : [];
  col.concepto = conc.filter(entero);
  if (!completo(col)) return null;
  const fila_cabecera = entero(mapeo.fila_cabecera) ? mapeo.fila_cabecera : null;
  const titulos = fila_cabecera === null ? [] : Array.from(filas[fila_cabecera] ?? [], tituloNormalizado);
  // si la fila de títulos tiene una columna de estado, se usa igual (un pago pendiente o rechazado no cuenta)
  const estado = asignarColumnas(titulos).columnas.estado;
  const usadas = new Set(Object.values(col).flat());
  if (estado !== undefined && !usadas.has(estado)) col.estado = estado;
  return {
    col, fila_cabecera, inicio: fila_cabecera === null ? 0 : fila_cabecera + 1, titulos,
    perfil: null, divisaTitulo: null, metodo: 'mapeo',
  };
}

/** Plan de lectura automático: títulos (y perfil del banco) o, si no hay, deducción por el contenido. */
function planAutomatico(filas, ctx = {}) {
  const cab = detectarCabecera(filas);
  if (cab) {
    const perfil = reconocerPerfil(cab.titulos);
    let { columnas, divisa } = cab;
    if (perfil && Object.keys(perfil.papeles).length) {
      const a = asignarColumnas(cab.titulos, perfil.papeles);
      columnas = a.columnas;
      divisa = a.divisa ?? divisa;
    }
    let col = { ...columnas };
    let metodo = 'cabecera';
    if (!completo(col)) {
      const inf = inferirColumnas(filas, { desde: cab.indice + 1, conocidas: col });
      if (inf && completo(inf.columnas)) { col = inf.columnas; metodo = 'cabecera_y_contenido'; }
    }
    if (!completo(col)) return { incompleto: true, sugerencia: col, desde: cab.indice };
    col = columnasGemelas(filas, cab.indice + 1, col, cab.titulos);
    const d = desplazamiento(filas, cab.indice + 1, col);
    if (d) col = moverColumnas(col, d);
    return { col, fila_cabecera: cab.indice, inicio: cab.indice + 1, titulos: cab.titulos, perfil, divisaTitulo: divisa, metodo, desplazamiento: d };
  }
  // CSV sin títulos: si con todas las filas no sale, se prueba solo con las del ancho de la mayoría (una fila con un
  // campo de más, por una coma sin comillas, no estropea la deducción; después se repara o se salta)
  let inf = inferirColumnas(filas, {});
  if (!inf && ctx.anchoEstricto) inf = inferirColumnas(filas, { soloAnchoComun: true });
  if (!inf) return null;
  return { col: inf.columnas, fila_cabecera: null, inicio: 0, titulos: [], perfil: null, divisaTitulo: null, metodo: 'contenido' };
}

/** Proporción de filas con algo en la columna (entre las 200 primeras con datos). */
function proporcionLlena(filas, inicio, k) {
  let llenas = 0, total = 0;
  for (let i = inicio; i < filas.length && total < 200; i++) {
    const f = filas[i];
    if (filaVacia(f)) continue;
    total++;
    if (!vacia(f[k])) llenas++;
  }
  return total ? llenas / total : 0;
}

/**
 * Un título que ocupa varias columnas (celda combinada o colspan) sale repetido. Si la columna elegida para un papel
 * está casi vacía en los datos y una gemela de al lado (mismo título) sí tiene valores, se usa la gemela.
 */
function columnasGemelas(filas, inicio, col, titulos) {
  const out = { ...col };
  const ocupadas = new Set(Object.values(out).flat());
  for (const papel of ['fecha', 'fecha_valor', 'importe', 'cargo', 'abono', 'saldo', 'divisa']) {
    const j = out[papel];
    if (j === undefined || !titulos[j]) continue;
    const gemelas = [j - 2, j - 1, j + 1, j + 2].filter((k) => k >= 0 && titulos[k] === titulos[j] && !ocupadas.has(k));
    if (!gemelas.length || proporcionLlena(filas, inicio, j) >= 0.2) continue;
    const mejor = gemelas.map((k) => ({ k, p: proporcionLlena(filas, inicio, k) })).sort((a, b) => b.p - a.p)[0];
    if (mejor.p >= 0.5) { ocupadas.delete(j); ocupadas.add(mejor.k); out[papel] = mejor.k; }
  }
  return out;
}

/**
 * Títulos corridos una o dos columnas respecto a sus datos (una celda de más o de menos en la fila de títulos).
 * Solo si en la columna de la fecha casi no hay fechas, en otra posición hay más del 80 % y el importe,
 * corrido igual, también es un importe. Si no está claro, 0.
 */
function desplazamiento(filas, inicio, col) {
  const probar = [0, 1, -1, 2, -2];
  const fechas = new Map(probar.map((d) => [d, 0]));
  let total = 0;
  for (let i = inicio; i < filas.length && total < 200; i++) {
    const f = filas[i];
    if (filaVacia(f)) continue;
    total++;
    for (const d of probar) if (esFechaCelda(f[col.fecha + d])) fechas.set(d, fechas.get(d) + 1);
  }
  if (total < 2 || fechas.get(0) >= total * 0.2) return 0;
  const buenos = probar.filter((d) => d !== 0 && fechas.get(d) >= total * 0.8);
  if (buenos.length !== 1) return 0;
  const d = buenos[0];
  const dinero = ['importe', 'cargo', 'abono'].map((k) => col[k]).filter((j) => j !== undefined);
  if (Object.values(col).some((v) => [].concat(v).some((j) => j + d < 0))) return 0;
  let conFecha = 0, conImporte = 0;
  for (let i = inicio, vistas = 0; i < filas.length && vistas < 200; i++) {
    const f = filas[i];
    if (filaVacia(f)) continue;
    vistas++;
    if (!esFechaCelda(f[col.fecha + d])) continue;
    conFecha++;
    if (dinero.some((j) => leerImporte(f[j + d], null) !== null)) conImporte++;
  }
  return conFecha && conImporte >= conFecha * 0.8 ? d : 0;
}

function moverColumnas(col, d) {
  const out = {};
  for (const [k, v] of Object.entries(col)) out[k] = Array.isArray(v) ? v.map((j) => j + d) : v + d;
  return out;
}

/** Las 10 primeras filas con algo, como texto, para que la persona toque las columnas. */
export function primerasFilas(filas, desde = 0, n = 10) {
  const primeras_filas = [], indices = [];
  let total_filas = 0;
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    if (filaVacia(fila)) continue;
    total_filas++;
    if (i < desde || primeras_filas.length >= n) continue;
    const celdas = [];
    const ancho = anchoDeFila(fila);
    for (let c = 0; c < ancho; c++) celdas.push(recortar(textoCelda(fila[c]), 80));
    primeras_filas.push(celdas);
    indices.push(i);
  }
  return { primeras_filas, indices, total_filas };
}

function pedirMapeo(filas, avisos, sugerencia, desde) {
  const p = primerasFilas(filas, desde ?? 0);
  const necesita_mapeo = { primeras_filas: p.primeras_filas, indices: p.indices, total_filas: p.total_filas };
  if (sugerencia && Object.keys(sugerencia).length) necesita_mapeo.sugerencia = sugerencia;
  return {
    movimientos: [], perfil: null, avisos, necesita_mapeo,
    saldo_inicial: null, saldo_final: null, fecha_inicial: null, fecha_final: null,
    extra: { metodo: null },
  };
}

// ——— CSV con comas: importes con coma de miles sin comillas («1,500.00») ———
// La coma de los miles parte el importe en dos campos y la fila sale con columnas de más. Una fila se repara solo si
// lo que sobra se explica por importes partidos en las columnas de dinero (importe, cargo, abono o saldo) y el resultado
// encadena con el saldo de la fila de al lado (saldo = saldo anterior + importe, con el archivo en un orden o en el otro).
// Un importe reparado tiene que salir en la cuenta de su propia fila; un saldo reparado, en la suya o en la de la vecina.
// Si no encadena, o hay más de una forma de repararla, la fila se queda como estaba y se salta como antes.
const MILES_PRIMERO = /^[-+−]?\(?\d{1,3}$/;
const MILES_GRUPO = /^\d{3}$/;
const MILES_ULTIMO = /^\d{3}(?:\.\d{1,2})?\)?-?$/;
const MAX_SOBRAN = 4; // «1,000,000.00» y «1,000,986.01» en la misma fila

/** Formas de repartir n campos de más entre k columnas (listas de k enteros ≥ 0 que suman n). */
function repartos(n, k) {
  if (k === 1) return [[n]];
  const out = [];
  for (let x = 0; x <= n; x++) for (const resto of repartos(n - x, k - 1)) out.push([x, ...resto]);
  return out;
}

/** La fila con los importes partidos vueltos a unir según el reparto, o null si no casa. */
function unirMiles(fila, w, anchoRef, dinero, reparto) {
  const out = new Array(anchoRef).fill(null);
  const unidas = [];
  let src = 0;
  for (let c = 0; c < anchoRef; c++) {
    const j = dinero.indexOf(c);
    const k = j >= 0 ? reparto[j] : 0;
    if (!k) { out[c] = src < w ? fila[src] : null; src++; continue; }
    const partes = [];
    for (let p = src; p <= src + k; p++) partes.push(typeof fila[p] === 'string' ? fila[p].trim() : null);
    if (partes.some((p) => p === null) || !MILES_PRIMERO.test(partes[0]) || !MILES_ULTIMO.test(partes[k])) return null;
    for (let p = 1; p < k; p++) if (!MILES_GRUPO.test(partes[p])) return null;
    out[c] = partes.join(',');
    unidas.push(c);
    src += k + 1;
  }
  return src === w ? { fila: out, unidas } : null;
}

/** ¿Algún par de campos de dinero parece un importe partido por la coma de los miles? */
function pareceMilesPartido(fila, dinero) {
  return dinero.some((c) => typeof fila[c] === 'string' && typeof fila[c + 1] === 'string'
    && MILES_PRIMERO.test(fila[c].trim()) && (MILES_ULTIMO.test(fila[c + 1].trim()) || MILES_GRUPO.test(fila[c + 1].trim())));
}

/**
 * Repara las filas de un CSV con comas que traen importes de miles partidos (ver arriba).
 * @returns {{tabla: Array, reparadas: number, partidas: Set<number>}} partidas: filas que lo parecen y no se han podido reparar
 */
function repararMilesPartidos(tabla, inicio, col, fechas, decimales, anchoRef, conComision = false) {
  const dinero = ['importe', 'cargo', 'abono', 'saldo'].map((k) => col[k]).filter((c) => c !== undefined && c < anchoRef);
  const vacio = { tabla, reparadas: 0, partidas: new Set() };
  if (!dinero.length || col.saldo === undefined || !anchoRef) return vacio;
  if (['importe', 'cargo', 'abono', 'saldo'].some((k) => col[k] !== undefined && decimales[k] === ',')) return vacio; // la coma es el decimal
  dinero.sort((a, b) => a - b);
  const valor = (fila, k) => (col[k] === undefined || vacia(fila[col[k]]) ? null : leerImporte(fila[col[k]], decimales[k]));
  const importeDe = (fila) => {
    let i = valor(fila, 'importe');
    if (i === null && (col.cargo !== undefined || col.abono !== undefined)) {
      const c = valor(fila, 'cargo'), a = valor(fila, 'abono');
      i = c === null && a === null ? null : redondear2((a ?? 0) - Math.abs(c ?? 0));
    }
    // con la comisión aparte (Revolut), el saldo de la fila ya la descuenta
    if (i !== null && conComision) i = redondear2(i - Math.abs(valor(fila, 'comision') ?? 0));
    return i;
  };
  const cent = (n) => (n === null ? null : Math.round(n * 100));

  // 1. Formas de reparar cada fila con columnas de más
  const opciones = new Map();
  for (let i = inicio; i < tabla.length; i++) {
    if (typeof fechas[i] !== 'string') continue;
    const fila = tabla[i];
    const w = anchoDeFila(fila);
    const sobran = w - anchoRef;
    if (sobran < 1 || sobran > MAX_SOBRAN) continue;
    const lista = [];
    for (const reparto of repartos(sobran, dinero.length)) {
      const r = unirMiles(fila, w, anchoRef, dinero, reparto);
      if (!r) continue;
      const imp = importeDe(r.fila), sal = valor(r.fila, 'saldo');
      if (imp === null || sal === null) continue;
      lista.push({ ...r, imp: cent(imp), sal: cent(sal), saldoUnido: r.unidas.includes(col.saldo), importeUnido: r.unidas.some((c) => c !== col.saldo) });
    }
    if (lista.length) opciones.set(i, lista);
  }
  if (!opciones.size) return vacio;

  // 2. Cada fila con su mejor lectura (la única reparación posible, o la fila tal cual) para hacer las cuentas con las vecinas
  const filasMov = [];
  for (let i = inicio; i < tabla.length; i++) if (typeof fechas[i] === 'string') filasMov.push(i);
  const lectura = (i) => {
    const op = opciones.get(i);
    if (op) return op.length === 1 ? op[0] : null;
    return { imp: cent(importeDe(tabla[i])), sal: cent(valor(tabla[i], 'saldo')) };
  };
  const cuadra = (a, b, imp) => a !== null && b !== null && imp !== null && a - b === imp;

  // 3. Se aceptan las reparaciones que encadenan con las vecinas (y solo si hay una)
  let out = null;
  let reparadas = 0;
  const partidas = new Set();
  filasMov.forEach((i, k) => {
    const op = opciones.get(i);
    if (!op) return;
    const ant = k > 0 ? lectura(filasMov[k - 1]) : null, sig = k + 1 < filasMov.length ? lectura(filasMov[k + 1]) : null;
    const buenas = op.filter((x) => {
      const propia = (ant && cuadra(x.sal, ant.sal, x.imp)) || (sig && cuadra(x.sal, sig.sal, x.imp)); // ascendente o descendente
      const vecina = (sig && cuadra(sig.sal, x.sal, sig.imp)) || (ant && cuadra(ant.sal, x.sal, ant.imp));
      if (x.importeUnido && !propia) return false;
      return !!(propia || (x.saldoUnido && vecina));
    });
    if (buenas.length === 1) {
      out ??= tabla.slice();
      out[i] = buenas[0].fila;
      reparadas++;
    } else if (pareceMilesPartido(tabla[i], dinero)) partidas.add(i);
  });
  return { tabla: out ?? tabla, reparadas, partidas };
}

/** Columna con D/H, Cargo/Abono, +/- (para importes que vienen sin signo). */
function columnaDeSigno(filas, desde, excluidas, ancho) {
  let mejor = null;
  for (let c = 0; c < ancho; c++) {
    if (excluidas.has(c)) continue;
    let total = 0, cargo = 0, abono = 0;
    for (let i = desde; i < filas.length && total < 2000; i++) {
      const v = filas[i]?.[c];
      if (vacia(v)) continue;
      total++;
      const t = normalizar(textoCelda(v)).replace(/[.\s]/g, '');
      if (SIGNOS_CARGO.has(t)) cargo++;
      else if (SIGNOS_ABONO.has(t)) abono++;
    }
    if (total >= 3 && (cargo + abono) / total >= 0.9 && cargo > 0 && abono > 0 && (!mejor || total > mejor.total)) mejor = { c, total };
  }
  return mejor ? mejor.c : null;
}

/**
 * Filas de una tabla → movimientos.
 * @param {Array<Array<string|number|null>>} filas celdas de fecha de hojas ya como "AAAA-MM-DD" o "AAAA-MM-DD HH:MM:SS"
 * @param {{archivo?: string, hoja?: string, idArchivo?: number, primerN?: number, mapeo?: Object, hoy?: string,
 *          es1904?: boolean, anchoEstricto?: boolean, separador?: string, textoFila?: (i: number) => string, maxFilas?: number}} ctx
 *   anchoEstricto: CSV; una fila con más campos que el resto no se lee (salvo que sea un importe de miles partido
 *   que encadena con el saldo, solo si separador es ',').  textoFila(i): texto de la fila i para origen.texto.
 * @returns {{movimientos, perfil, avisos, necesita_mapeo, saldo_inicial, saldo_final, fecha_inicial, fecha_final, extra}}
 */
export function deTablaAMovimientos(filas, ctx = {}) {
  const archivo = ctx.archivo ?? '';
  const idArchivo = ctx.idArchivo ?? 0;
  const avisos = [];
  const maxFilas = ctx.maxFilas ?? MAX_FILAS;
  let tabla = Array.isArray(filas) ? filas : [];
  if (tabla.length > maxFilas) {
    tabla = tabla.slice(0, maxFilas);
    avisos.push(aviso('demasiadas_filas', { archivo, max: maxFilas.toLocaleString('es-ES') }));
  }

  // 1. Qué columna es cada cosa
  let plan;
  if (ctx.mapeo) {
    plan = planDesdeMapeo(tabla, ctx.mapeo);
    if (!plan) return pedirMapeo(tabla, [...avisos, aviso('mapeo_sin_movimientos', { archivo })]);
  } else {
    plan = planAutomatico(tabla, ctx);
    if (!plan) return pedirMapeo(tabla, avisos);
    if (plan.incompleto) return pedirMapeo(tabla, avisos, plan.sugerencia, plan.desde);
  }
  const { col, inicio } = plan;
  const perfil = plan.perfil;
  const ajustes = perfil?.ajustes ?? {};
  const porTitulo = new Map();
  const corrido = plan.desplazamiento ?? 0;
  plan.titulos.forEach((t, j) => { if (t && !porTitulo.has(t)) porTitulo.set(t, j + corrido); });
  if (corrido) avisos.push(aviso('columnas_desplazadas', { archivo }));

  // 2. Cómo leer cada columna: orden día/mes, separador decimal (con una muestra de 5.000 filas basta)
  const textos = { fecha: [], fecha_valor: [], importe: [], cargo: [], abono: [], saldo: [], comision: [] };
  let ambiguas = 0, pruebaDmy = 0, pruebaMdy = 0;
  for (let i = inicio; i < Math.min(tabla.length, inicio + MUESTRA); i++) {
    const fila = tabla[i];
    if (!fila) continue;
    for (const k in textos) {
      if (col[k] === undefined) continue;
      const v = fila[col[k]];
      if (typeof v === 'string' && v.trim()) textos[k].push(k.startsWith('fecha') ? v : sinMarca(v));
    }
    const f = fila[col.fecha];
    if (typeof f === 'string') {
      const m = f.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}\b/);
      if (m) {
        const a = +m[1], b = +m[2];
        if (a > 12 && b <= 12) pruebaDmy++;
        else if (b > 12 && a <= 12) pruebaMdy++;
        else if (a <= 12 && b <= 12 && a !== b) ambiguas++;
      }
    }
  }
  const ordenFecha = inferirOrden(textos.fecha);
  const ordenValor = textos.fecha_valor.length ? inferirOrden(textos.fecha_valor) : ordenFecha;
  const decimalArchivo = inferirDecimal([...textos.importe, ...textos.cargo, ...textos.abono, ...textos.saldo]);
  const decimales = {};
  for (const k of ['importe', 'cargo', 'abono', 'saldo', 'comision']) decimales[k] = inferirDecimal(textos[k]) ?? decimalArchivo;

  // columna de signo (D/H): solo si de verdad trae signos
  let colSigno = col.signo;
  if (colSigno !== undefined) {
    let total = 0, ok = 0;
    for (let i = inicio; i < tabla.length && total < 2000; i++) {
      const v = tabla[i]?.[colSigno];
      if (vacia(v)) continue;
      total++;
      const t = normalizar(textoCelda(v)).replace(/[.\s]/g, '');
      if (SIGNOS_CARGO.has(t) || SIGNOS_ABONO.has(t)) ok++;
    }
    if (!total || ok / total < 0.8) colSigno = undefined;
  }

  // 3. Fechas (primera pasada: también sirve para saber si el archivo va del más nuevo al más antiguo)
  const es1904 = !!ctx.es1904;
  const fechas = new Array(tabla.length).fill(null);
  const valores = col.fecha_valor !== undefined ? new Array(tabla.length).fill(null) : null;
  let maxISO = null, parciales = 0, primeraISO = null, ultimaISO = null;
  for (let i = inicio; i < tabla.length; i++) {
    const fila = tabla[i];
    if (!fila) continue;
    const f = leerFecha(fila[col.fecha], ordenFecha, es1904);
    fechas[i] = f;
    if (typeof f === 'string') {
      if (!maxISO || f > maxISO) maxISO = f;
      primeraISO ??= f;
      ultimaISO = f;
    } else if (f) parciales++;
    if (valores) {
      const v = leerFecha(fila[col.fecha_valor], ordenValor, es1904);
      valores[i] = v;
      if (v && typeof v !== 'string') parciales++;
    }
  }
  if (parciales) {
    const fin = maxISO ?? ctx.hoy ?? null;
    let puestas = 0;
    for (const arr of [fechas, valores]) {
      if (!arr) continue;
      for (let i = inicio; i < arr.length; i++) {
        const f = arr[i];
        if (!f || typeof f === 'string') continue;
        arr[i] = fin ? completarAnio(f, fin) : null;
        if (arr[i]) puestas++;
      }
    }
    if (puestas) avisos.push(aviso('anio_supuesto', { archivo, hasta: fin }));
  }
  const descendente = !!(primeraISO && ultimaISO && primeraISO > ultimaISO);

  // 4. Recorrido de las filas
  const ordenConcepto = [];
  for (const papel of ajustes.concepto_orden ?? ['concepto', 'concepto_extra', 'contraparte']) {
    for (const j of [].concat(col[papel] ?? [])) if (!ordenConcepto.includes(j)) ordenConcepto.push(j);
  }
  const colContraparte = new Set([].concat(col.contraparte ?? []));
  const validos = ajustes.estados_validos ? new Set(ajustes.estados_validos) : null;
  let sinCompletar = 0;
  const estadosSinCompletar = new Set();
  const estados = new Map(); // pocos valores distintos: se normalizan una vez
  const estadoNormalizado = (v) => {
    const k = textoCelda(v);
    let e = estados.get(k);
    if (e === undefined) {
      e = normalizar(k).replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (estados.size < 1000) estados.set(k, e);
    }
    return e;
  };
  // CSV: una fila con más campos que el resto suele ser un importe con coma sin comillas; no se lee para no inventar.
  // Se cuentan los campos que trae cada línea (también los vacíos del final): así una nota opcional en la última
  // columna de un CSV bien hecho no cuenta como columna de más.
  let ancho = null;
  let milesPartidos = null; // filas que parecen tener un importe de miles partido y no se han podido reparar
  if (ctx.anchoEstricto) {
    const moda = (medir) => {
      const veces = new Map();
      for (let i = inicio; i < tabla.length; i++) {
        if (typeof fechas[i] !== 'string') continue;
        const w = medir(tabla[i]);
        veces.set(w, (veces.get(w) ?? 0) + 1);
      }
      // con un empate (archivos de pocas filas) gana el ancho menor: así una fila descolocada se salta en vez de leerse mal
      let m = 0, max = 0;
      for (const [w, k] of veces) if (k > max || (k === max && w < m)) { m = w; max = k; }
      return m;
    };
    const deTitulos = plan.fila_cabecera !== null ? (tabla[plan.fila_cabecera]?.length ?? 0) : 0;
    ancho = Math.max(moda((f) => f.length), deTitulos) || null;
    if (ctx.separador === ',') {
      // el ancho de verdad de la tabla: el de los títulos (con las dos filas si van en dos, y corrido si los datos van
      // corridos a la derecha) o, sin títulos, el de la mayoría de las filas
      let anchoRef = moda(anchoDeFila);
      if (plan.fila_cabecera !== null) {
        let t = plan.titulos.length;
        while (t > 0 && !plan.titulos[t - 1]) t--;
        anchoRef = Math.max(anchoDeFila(tabla[plan.fila_cabecera]), t) + Math.max(0, plan.desplazamiento ?? 0);
      }
      const r = repararMilesPartidos(tabla, inicio, col, fechas, decimales, anchoRef, !!ajustes.comision_aparte && col.comision !== undefined);
      if (r.reparadas) {
        for (let i = inicio; i < tabla.length; i++) {
          if (r.tabla[i] === tabla[i]) continue;
          // la fecha se vuelve a leer por si su columna iba detrás del importe partido
          fechas[i] = leerFecha(r.tabla[i][col.fecha], ordenFecha, es1904);
          if (valores) valores[i] = leerFecha(r.tabla[i][col.fecha_valor], ordenValor, es1904);
        }
        tabla = r.tabla;
        avisos.push(aviso('miles_unidos', { archivo, n: r.reparadas }));
      }
      if (r.partidas.size) milesPartidos = r.partidas;
    }
  }

  const concepto = (fila) => {
    if (ajustes.concepto_primero) {
      for (const grupo of ajustes.concepto_primero) {
        for (const t of grupo) {
          const j = porTitulo.get(t);
          if (j === undefined) continue;
          const v = textoCelda(fila[j]);
          if (v) return v;
        }
      }
    }
    const partes = [], vistas = [];
    for (const j of ordenConcepto) {
      const v = textoCelda(fila[j]);
      if (!v || !/[\p{L}\p{N}]/u.test(v)) continue;
      if (colContraparte.has(j) && pareceCuenta(v)) continue;
      const k = normalizar(v);
      if (vistas.some((x) => x === k || x.includes(k))) continue;
      vistas.push(k);
      partes.push(v);
    }
    return partes.join(SEPARADOR);
  };

  const esCambio = (fila, conceptoTxt, tipoTxt) => {
    const cd = ajustes.cambio_divisa;
    if (!cd) return false;
    if (cd.tipos && tipoTxt && cd.tipos.includes(normalizar(tipoTxt))) return true;
    if (cd.columnas) {
      const [a, b] = cd.columnas.map((t) => porTitulo.get(t));
      if (a !== undefined && b !== undefined) {
        const x = normalizar(textoCelda(fila[a])), y = normalizar(textoCelda(fila[b]));
        if (x && y && x !== y) return true;
      }
    }
    return !!(cd.concepto && cd.concepto.test(normalizar(conceptoTxt)));
  };

  const movimientos = [];
  const filaDe = new Map(); // id → índice de fila (para corregir signos después)
  let n = ctx.primerN ?? 1;
  const saltadas = [], irregulares = [];
  let noValidas = 0, filasConMovimiento = 0, primeraFilaMov = -1;
  const estadosVistos = new Set();
  let saldo_inicial = null, saldo_final = null;
  const hoja = ctx.hoja;

  for (let i = inicio; i < tabla.length; i++) {
    const fila = tabla[i];
    if (filaVacia(fila)) continue;

    const s = filaDeSaldo(fila, col, decimales);
    if (s) {
      if (s.tipo === 'inicial') saldo_inicial ??= s.valor;
      else saldo_final = s.valor;
      continue;
    }

    const fecha = fechas[i];
    let importe = null, desdeImporte = false;
    if (col.importe !== undefined) {
      importe = leerImporte(fila[col.importe], decimales.importe);
      desdeImporte = importe !== null;
    }
    if (importe === null && (col.cargo !== undefined || col.abono !== undefined)) {
      const c = col.cargo !== undefined ? leerImporte(fila[col.cargo], decimales.cargo) : null;
      const a = col.abono !== undefined ? leerImporte(fila[col.abono], decimales.abono) : null;
      if (c !== null || a !== null) importe = redondear2((a ?? 0) - Math.abs(c ?? 0));
    }
    // con fecha y con columnas de más (un concepto o un importe con una coma sin comillas): no se lee para no inventar
    if (typeof fecha === 'string' && ((ancho !== null && anchoDeFila(fila) > ancho) || milesPartidos?.has(i))) { irregulares.push(i); continue; }
    if (typeof fecha !== 'string' || importe === null) {
      if (!esCabeceraRepetida(fila, plan.titulos)) saltadas.push(i);
      continue;
    }

    if (validos && col.estado !== undefined) {
      const e = normalizar(textoCelda(fila[col.estado]));
      if (!validos.has(e)) { noValidas++; if (e) estadosVistos.add(e); continue; }
    } else if (col.estado !== undefined) {
      // cualquier archivo con columna de estado: un pago rechazado, pendiente o anulado no es dinero que se haya movido
      const e = estadoNormalizado(fila[col.estado]);
      if (ESTADOS_SIN_COMPLETAR.has(e)) { sinCompletar++; estadosSinCompletar.add(e); continue; }
    }

    let dudoso = false;
    // con la marca pegada al importe («13,99 D») el signo ya está dicho: la columna D/H no se mira
    const conMarca = colSigno !== undefined && desdeImporte && parseImporte(fila[col.importe], { decimal: decimales.importe }) === null;
    if (colSigno !== undefined && desdeImporte && !conMarca) {
      const t = normalizar(textoCelda(fila[colSigno])).replace(/[.\s]/g, '');
      if (importe < 0 && SIGNOS_ABONO.has(t)) dudoso = true; // el importe dice cargo y la columna dice abono: no se elige
      else if (SIGNOS_CARGO.has(t)) importe = -Math.abs(importe) || 0;
      else if (SIGNOS_ABONO.has(t)) importe = Math.abs(importe);
      else if (t) dudoso = true;
    }
    if (importe === 0) importe = 0; // sin «-0»

    const saldo = col.saldo !== undefined ? leerImporte(fila[col.saldo], decimales.saldo) : null;
    // la divisa que dice el título del importe («Importe (EUR)») manda: la columna «Divisa» puede ser la de la operación original
    let divisa = plan.divisaTitulo ?? (col.divisa !== undefined ? leerDivisa(fila[col.divisa]) : null);
    divisa ??= ajustes.divisa ?? divisaDelImporte(fila[col.importe ?? col.cargo ?? col.abono])
      ?? (col.cargo !== undefined ? divisaDelImporte(fila[col.abono]) : null) ?? 'EUR';
    const tipo = col.tipo !== undefined ? textoCelda(fila[col.tipo]) || undefined : undefined;
    const conceptoTxt = concepto(fila) || tipo || ''; // sin concepto, el tipo de operación que da el banco
    if (/^\W*(total|suma|subtotal)/i.test(conceptoTxt) && TOTALES.test(normalizar(conceptoTxt).replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim())) {
      saltadas.push(i);
      continue;
    }
    let cuenta = col.cuenta !== undefined ? textoCelda(fila[col.cuenta]) : '';
    if (ajustes.cuenta_con_divisa) cuenta = `${cuenta} ${divisa}`.trim();
    const origen = { archivo, fila: i + 1, texto: recortar(ctx.textoFila ? ctx.textoFila(i) : textoDeFila(fila), 200) };
    if (hoja) origen.hoja = hoja;
    const fecha_valor = valores && typeof valores[i] === 'string' ? valores[i] : null;
    const nota = esCambio(fila, conceptoTxt, tipo) ? 'cambio_divisa' : undefined;
    const nuevo = (concep, imp, sal, not, dud, conTipo) => {
      const mov = crearMovimiento({
        id: `${idArchivo}-${n++}`, fecha, fecha_valor, concepto: concep, importe: imp, saldo: sal, divisa, origen,
        tipo: conTipo ? tipo : undefined, cuenta: cuenta || undefined, nota: not, dudoso: dud || undefined,
      });
      movimientos.push(mov);
      filaDe.set(mov.id, i);
    };

    const comision = ajustes.comision_aparte && col.comision !== undefined
      ? parseImporte(fila[col.comision], { decimal: decimales.comision }) : null;
    if (comision) {
      // el saldo de la fila ya descuenta importe y comisión: va en el movimiento de la comisión.
      // Una comisión siempre es un cargo, venga escrita en positivo o en negativo.
      const cargoComision = redondear2(-Math.abs(comision));
      const conceptoComision = `${ajustes.comision_aparte.concepto}${SEPARADOR}${conceptoTxt}`.trim();
      if (descendente) {
        nuevo(conceptoComision, cargoComision, saldo, 'comision_separada', false, false);
        nuevo(conceptoTxt, importe, null, nota, dudoso, true);
      } else {
        nuevo(conceptoTxt, importe, null, nota, dudoso, true);
        nuevo(conceptoComision, cargoComision, saldo, 'comision_separada', false, false);
      }
    } else {
      nuevo(conceptoTxt, importe, saldo, nota, dudoso, true);
    }
    filasConMovimiento++;
    if (primeraFilaMov < 0) primeraFilaMov = i;
  }

  // 5. Importes sin signo: buscar una columna D/H por el contenido
  const sinSigno = colSigno === undefined && col.cargo === undefined && col.abono === undefined;
  if (sinSigno && movimientos.length >= 3 && movimientos.every((m) => m.importe >= 0)) {
    // se mira en todas las columnas menos las de fechas y dinero (también en «Tipo»: Cargo, Abono, DEBIT, CREDIT…)
    const excluidas = new Set();
    for (const k of ['fecha', 'fecha_valor', 'importe', 'saldo', 'comision']) if (col[k] !== undefined) excluidas.add(col[k]);
    const c = columnaDeSigno(tabla, inicio, excluidas, Math.max(...tabla.slice(inicio, inicio + 200).map(anchoDeFila), 0));
    if (c !== null) {
      for (const m of movimientos) {
        const t = normalizar(textoCelda(tabla[filaDe.get(m.id)][c])).replace(/[.\s]/g, '');
        if (SIGNOS_CARGO.has(t)) m.importe = -Math.abs(m.importe) || 0;
        else if (!SIGNOS_ABONO.has(t)) m.dudoso = true;
      }
    } else avisos.push(aviso('importes_sin_signo', { archivo }));
  }

  // casi todo positivo: en los extractos de tarjeta las compras a veces vienen sin signo; se avisa, no se cambia nada
  if (sinSigno && movimientos.length >= 5 && !codigosDe(avisos).includes('importes_sin_signo')) {
    const positivos = movimientos.filter((m) => m.importe > 0).length;
    if (positivos / movimientos.length >= 0.8) avisos.push(aviso('casi_todo_positivo', { archivo }));
  }

  // 6. Avisos
  const contar = plan.fila_cabecera === null ? saltadas.filter((i) => i > primeraFilaMov && primeraFilaMov >= 0) : saltadas;
  if (contar.length) avisos.push(aviso('filas_saltadas', { archivo, n: contar.length, filas: contar.slice(0, 10).map((i) => i + 1) }));
  if (irregulares.length) avisos.push(aviso('filas_irregulares', { archivo, n: irregulares.length, filas: irregulares.slice(0, 10).map((i) => i + 1) }));
  if (noValidas && ajustes.aviso_estados) avisos.push(aviso(ajustes.aviso_estados, { archivo, n: noValidas, estados: [...estadosVistos].slice(0, 5).join(', ') }));
  if (sinCompletar) avisos.push(aviso('estados_sin_completar', { archivo, n: sinCompletar, estados: [...estadosSinCompletar].slice(0, 5).join(', ') }));
  if (ajustes.max_movimientos && filasConMovimiento === ajustes.max_movimientos.n) {
    avisos.push(aviso(ajustes.max_movimientos.aviso, { archivo, n: ajustes.max_movimientos.n }));
  }
  if (!pruebaDmy && !pruebaMdy && ambiguas > 0 && movimientos.length) avisos.push(aviso('fecha_dia_mes_supuesto', { archivo }));

  if (!movimientos.length) {
    if (ctx.mapeo) return pedirMapeo(tabla, [...avisos, aviso('mapeo_sin_movimientos', { archivo })]);
    // había filas y ninguna se ha podido leer: mejor preguntar que inventar
    if (saltadas.length && !noValidas && !sinCompletar) return pedirMapeo(tabla, avisos, col, plan.fila_cabecera ?? 0);
  }

  // encima de la tabla solo vale el saldo inicial o anterior: un «saldo a fecha» de ahí arriba suele ser el de hoy
  if (saldo_inicial === null && plan.fila_cabecera !== null) {
    for (let i = 0; i < Math.min(plan.fila_cabecera, 40) && saldo_inicial === null; i++) {
      const fila = tabla[i];
      if (filaVacia(fila)) continue;
      const s = filaDeSaldo(fila, {}, decimales);
      if (s && s.tipo === 'inicial') saldo_inicial = s.valor;
    }
  }

  const periodo = buscarPeriodo(tabla, plan.fila_cabecera ?? (primeraFilaMov >= 0 ? primeraFilaMov : 0));
  return {
    movimientos,
    perfil: perfil?.id ?? null,
    avisos,
    necesita_mapeo: null,
    saldo_inicial,
    saldo_final,
    fecha_inicial: periodo?.desde ?? null,
    fecha_final: periodo?.hasta ?? null,
    extra: {
      metodo: plan.metodo,
      fila_cabecera: plan.fila_cabecera,
      columnas: limpiarColumnas(col, colSigno),
      orden_fecha: ordenFecha,
      decimal: decimalArchivo,
      ...(perfil ? { perfil_hipotesis: !!perfil.hipotesis } : {}),
    },
  };
}

function limpiarColumnas(col, colSigno) {
  const out = {};
  for (const [k, v] of Object.entries(col)) {
    if (k === 'signo') continue;
    if (PAPELES_MULTIPLES.has(k)) { if ([].concat(v).length) out[k] = [].concat(v); } else if (v !== undefined) out[k] = v;
  }
  if (colSigno !== undefined) out.signo = colSigno;
  return out;
}
