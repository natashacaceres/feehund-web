// Exportaciones con una fila por cobro (Stripe, SumUp, Square, Zettle, Adyen…) y el fichero de operaciones de
// CaixaBank (Comercia Global Payments, «FB 500», ancho fijo) → operaciones con fecha, importe, comisión y grupo de
// tarjeta, y su suma por mes. Lógica pura. Los nombres de columnas de cada proveedor son HIPÓTESIS salvo Adyen,
// Stripe (informe de saldo) y FB 500, que están en su documentación oficial.

import { papelDeColumna, tituloColumna, estadoDeOperacion, tipoDeOperacion, tipoDeTarjeta, esDelEEE, esDeEmpresa, palabrasDe } from './etiquetas.js';
import { parseImporte, redondear2, aCentimos } from '../nucleo/numeros.js';
import { parseFecha, inferirOrden } from '../nucleo/fechas.js';
import { normalizar } from '../nucleo/texto.js';

const MAX_TITULOS = 40;

/**
 * @typedef {Object} Operacion
 * @property {string} fecha AAAA-MM-DD
 * @property {'venta'|'devolucion'|'contracargo'} clase
 * @property {number} importe  en positivo
 * @property {number|null} comision en positivo (null si la fila no la trae)
 * @property {number|null} neto
 * @property {string} grupo   particulares|empresa|fuera_europa|amex|bizum
 * @property {{marca: boolean, region: boolean, uso: boolean}} sabido  qué se sabe de la tarjeta (para decir si el grupo es seguro)
 * @property {Object} origen  {archivo, hoja, fila, texto}
 */

/** Busca en una tabla la fila de títulos de una exportación por cobro. */
export function cabeceraDeOperaciones(filas) {
  for (let i = 0; i < Math.min(filas.length, MAX_TITULOS); i++) {
    const f = filas[i];
    if (!f) continue;
    const cols = {};
    f.forEach((c, k) => {
      const p = papelDeColumna(c);
      if (p && cols[p] === undefined) cols[p] = k;
    });
    // Adyen: «Gross Credit (GC)», «Net Credit (NC)», «Commission (NC)»…
    f.forEach((c, k) => {
      const t = tituloColumna(c);
      if (/^GROSS CREDIT/.test(t) && cols.importe === undefined) cols.importe = k;
      if (/^GROSS DEBIT/.test(t)) cols.importe_debe = k;
      if (/^NET CREDIT/.test(t) && cols.neto === undefined) cols.neto = k;
      if (/^NET DEBIT/.test(t)) cols.neto_debe = k;
      if (/^(COMMISSION|PROCESSING FEE)( [A-Z]{2})?$/.test(t)) cols.comision_parte = [...(cols.comision_parte ?? []), k];
      if (/^(MARKUP|SCHEME FEES|INTERCHANGE)( [A-Z]{2})?$/.test(t)) cols.comision_parte = [...(cols.comision_parte ?? []), k];
      if (/^(CAPTURED|PAYABLE|MAIN AMOUNT) ?(PC|SC)?$/.test(t) && cols.importe === undefined) cols.importe = k;
      if (/^RECORD TYPE$/.test(t)) cols.tipo_operacion = k;
      if (/^GLOBAL CARD BRAND$/.test(t)) cols.marca = k;
      if (/^PAYMENT METHOD VARIANT$/.test(t)) cols.categoria = k;
    });
    // una columna de saldo es de un extracto del banco, no de una exportación del datáfono
    if (f.some((c) => /^(SALDO|SALDOS|BALANCE|SALDO DISPONIBLE|SALDO CONTABLE|SALDO EUR|BALANCE EUR|RUNNING BALANCE|SALDO ACTUAL)$/.test(tituloColumna(c)))) return null;
    // lo que dice que es del datáfono: la comisión de cada cobro o la marca de la tarjeta
    if (cols.fecha !== undefined && cols.importe !== undefined && (cols.comision !== undefined || cols.comision_parte || cols.marca !== undefined)) {
      return { fila: i, cols, titulos: f.map((c) => (typeof c === 'string' ? c : '')) };
    }
  }
  return null;
}

/**
 * Filas de una exportación → operaciones (solo las que cuentan) y lo que se ha dejado fuera.
 * @returns {{operaciones: Operacion[], fuera: {fallidas, otras_divisas, sin_importe, otros_tipos}, columnas, sin_signo}}
 */
export function operacionesDeTabla(tabla, cab) {
  const { cols } = cab;
  const filas = tabla.filas;
  const fechasTexto = [];
  for (let i = cab.fila + 1; i < filas.length && fechasTexto.length < 400; i++) {
    const v = filas[i]?.[cols.fecha];
    if (typeof v === 'string') fechasTexto.push(v.trim().split(/[ T]/)[0]);
  }
  const orden = inferirOrden(fechasTexto);
  const ops = [];
  const fuera = { fallidas: 0, otras_divisas: 0, sin_importe: 0, otros_tipos: 0, divisas: new Set() };
  const celda = (f, k) => (k === undefined ? null : f[k]);
  for (let i = cab.fila + 1; i < filas.length; i++) {
    const f = filas[i];
    if (!f || !f.some((v) => v !== null && v !== undefined && String(v).trim() !== '')) continue;
    const fecha = fechaDe(celda(f, cols.fecha), orden);
    let importe = numero(celda(f, cols.importe));
    if (cols.importe_debe !== undefined && importe === null) { const d = numero(celda(f, cols.importe_debe)); importe = d === null ? null : -d; }
    if (!fecha && importe === null) continue; // fila de totales o vacía
    if (fecha && tipoDeOperacion(celda(f, cols.tipo_operacion)) === 'otro') { fuera.otros_tipos++; continue; } // abonos a la cuenta, ajustes
    const textoFila = tabla.textos?.[i] || f.map((v) => (v === null || v === undefined ? '' : String(v))).join(' | ');
    const origen = { archivo: tabla.archivo, hoja: tabla.hoja ?? null, fila: i + 1, texto: textoFila };
    if (!fecha || importe === null) { fuera.sin_importe++; continue; }
    const divisa = celda(f, cols.divisa);
    if (divisa && !/^(EUR|EURO|EUROS|€|978)$/i.test(String(divisa).trim())) { fuera.otras_divisas++; fuera.divisas.add(String(divisa).trim().toUpperCase()); continue; }
    const estado = estadoDeOperacion(celda(f, cols.estado));
    if (estado === 'mal') { fuera.fallidas++; continue; }
    let clase = tipoDeOperacion(celda(f, cols.tipo_operacion));
    if (clase === 'otro') { fuera.otros_tipos++; continue; }
    if (!clase) clase = importe < 0 ? 'devolucion' : 'venta';
    if (clase === 'venta' && importe < 0) clase = 'devolucion';
    let comision = numero(celda(f, cols.comision));
    if (comision === null && cols.comision_parte) {
      const partes = cols.comision_parte.map((k) => numero(f[k])).filter((v) => v !== null);
      if (partes.length) comision = redondear2(partes.reduce((s, v) => s + Math.abs(v), 0));
    }
    let neto = numero(celda(f, cols.neto));
    if (cols.neto_debe !== undefined && neto === null) { const d = numero(celda(f, cols.neto_debe)); neto = d === null ? null : -d; }
    const reembolsado = numero(celda(f, cols.reembolsado));
    const g = grupoDeFila(celda(f, cols.marca), celda(f, cols.financiacion), celda(f, cols.pais), celda(f, cols.categoria), celda(f, cols.region));
    ops.push({ fecha, clase, importe: Math.abs(importe), comision: comision === null ? null : Math.abs(comision), neto, grupo: g.grupo, sabido: g.sabido,
      reembolsado: estado === 'reembolsada' ? Math.abs(importe) : reembolsado ? Math.abs(reembolsado) : 0, origen });
  }
  return { operaciones: ops, fuera, columnas: Object.keys(cols) };
}

/** Grupo de la calculadora a partir de las columnas de la tarjeta. */
export function grupoDeFila(marca, financiacion, pais, categoria, region) {
  const texto = [marca, financiacion, categoria, region].filter((v) => v !== null && v !== undefined && v !== '').join(' ');
  const t = texto ? tipoDeTarjeta(texto) : null;
  const eee = esDelEEE(pais);
  const empresa = esDeEmpresa(categoria) ?? (t?.uso === 'empresa' ? true : null);
  const sabido = { marca: Boolean(t?.marca), region: eee !== null || Boolean(t?.region), uso: empresa !== null || t?.uso === 'particular' };
  if (t?.grupo === 'amex' || t?.grupo === 'bizum') return { grupo: t.grupo, sabido: { marca: true, region: true, uso: true } };
  if (eee === false || t?.region === 'fuera') return { grupo: 'fuera_europa', sabido };
  if (t?.grupo === 'fuera_europa' && eee === null) return { grupo: 'fuera_europa', sabido: { ...sabido, region: false } }; // JCB, UnionPay…
  if (empresa) return { grupo: 'empresa', sabido };
  return { grupo: 'particulares', sabido };
}

function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? redondear2(v) : null;
  return parseImporte(String(v));
}

function fechaDe(v, orden) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return null; // las fechas de las hojas llegan ya como texto AAAA-MM-DD
  const s = String(v).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return parseFecha(iso[1]);
  return parseFecha(s.split(/[ T]/)[0], { orden });
}

// ───────────── suma por meses ─────────────

/**
 * Operaciones → un resumen por mes {mes, desde, hasta, grupos: {particulares: {ventas, operaciones, comision}}, ventas,
 * operaciones, comision, devoluciones, contracargos, neto, sin_comision, filas}.
 */
export function sumarPorMes(operaciones) {
  const meses = new Map();
  for (const o of operaciones) {
    const mes = o.fecha.slice(0, 7);
    if (!meses.has(mes)) meses.set(mes, { mes, desde: o.fecha, hasta: o.fecha, grupos: {}, ventas: 0, operaciones: 0, comision: 0,
      devoluciones: 0, n_devoluciones: 0, contracargos: 0, neto: 0, hay_neto: true, sin_comision: 0, ops: [] });
    const m = meses.get(mes);
    if (o.fecha < m.desde) m.desde = o.fecha;
    if (o.fecha > m.hasta) m.hasta = o.fecha;
    m.ops.push(o);
    if (o.comision === null) m.sin_comision++;
    else m.comision += o.comision;
    if (o.neto === null) m.hay_neto = false;
    else m.neto += o.neto;
    if (o.clase === 'venta') {
      const g = m.grupos[o.grupo] ?? (m.grupos[o.grupo] = { ventas: 0, operaciones: 0, comision: 0, sin_comision: 0, sabido: { marca: true, region: true, uso: true }, filas: [] });
      g.ventas += o.importe; g.operaciones++; g.filas.push(o.origen);
      if (o.comision === null) g.sin_comision++; else g.comision += o.comision;
      for (const k of ['marca', 'region', 'uso']) g.sabido[k] = g.sabido[k] && o.sabido[k];
      m.ventas += o.importe; m.operaciones++;
      if (o.reembolsado) { m.devoluciones += o.reembolsado; m.n_devoluciones++; }
    } else if (o.clase === 'devolucion') { m.devoluciones += o.importe; m.n_devoluciones++; }
    else if (o.clase === 'contracargo') m.contracargos += o.importe;
  }
  const r2 = (x) => redondear2(x);
  return [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes)).map((m) => {
    for (const g of Object.values(m.grupos)) { g.ventas = r2(g.ventas); g.comision = r2(g.comision); }
    return { ...m, ventas: r2(m.ventas), comision: r2(m.comision), devoluciones: r2(m.devoluciones), contracargos: r2(m.contracargos), neto: m.hay_neto ? r2(m.neto) : null };
  });
}

// ───────────── CaixaBank · Comercia Global Payments · FB 500 ─────────────
// Formato publicado por Comercia Global Payments («Formato Fichero de Operaciones con Tarjeta en Comercios Ampliado
// FB 500», v3.0, julio 2021). Registros de 500 posiciones: «10» cabecera, «20» operación, «90» totales.
// Posiciones (desde 1) y longitudes copiadas de ese documento. Importes «Num(7,2)+Signo»: 9 cifras (2 decimales) y signo.

const RED_ORIGEN = { 0: 'fuera', 1: 'dentro', 2: 'nacional', 3: 'nacional', 4: 'nacional', 5: 'nacional', 6: 'dentro', 7: 'fuera', 8: 'fuera', 9: 'amex' };

/** ¿Parece un FB 500? La mayoría de las líneas empiezan por 10, 20 o 90 y miden unas 500 posiciones. */
export function esFB500(texto) {
  const lineas = String(texto).split(/\r?\n/).filter((l) => l.trim());
  if (lineas.length < 2) return false;
  const buenas = lineas.filter((l) => /^(10|20|90)/.test(l) && l.length >= 300 && l.length <= 520).length;
  return buenas >= lineas.length * 0.9 && lineas.some((l) => l.startsWith('20'));
}

const trozo = (l, pos, lon) => l.slice(pos - 1, pos - 1 + lon);

/** «000012345+» o «+000012345» → 123,45. Sin signo reconocible: null (no se adivina). */
export function importeFB(s, decimales = 2) {
  const t = String(s).trim();
  const m = t.match(/^([+-]?)(\d+)([+-]?)$/);
  if (!m || (m[1] && m[3])) return null;
  const n = Number(m[2]) / 10 ** decimales;
  return redondear2((m[1] || m[3]) === '-' ? -n : n);
}

function fechaDDMMAA(s) {
  if (!/^\d{6}$/.test(s)) return null;
  return parseFecha(`${s.slice(0, 2)}/${s.slice(2, 4)}/20${s.slice(4, 6)}`, { orden: 'dmy' });
}
function fechaDDMMAAAA(s) {
  if (!/^\d{8}$/.test(s)) return null;
  return parseFecha(`${s.slice(0, 2)}/${s.slice(2, 4)}/${s.slice(4)}`, { orden: 'dmy' });
}

/** Grupo de una operación del FB 500 por el código de la tasa de intercambio, la ruta del coste de esquema y la red. */
export function grupoFB500(codTI, codFC, red) {
  const ti = Number(String(codTI).replace(/^TI/, '')), fc = Number(String(codFC).replace(/^FC/, ''));
  if (red === 'amex') return { grupo: 'amex', sabido: { marca: true, region: true, uso: true } };
  if (ti === 55) return { grupo: 'bizum', sabido: { marca: true, region: true, uso: true } };
  // TI: 1-16 consumo nacional; 17-24 empresa nacional; 25-30 crossborder; 31-36 UE (33 y 36 empresa); 37-42 no UE;
  // 43-54 Discover (45, 46, 49, 50, 53, 54 empresa; 51-54 no UE)
  if (ti) {
    const fueraUE = (ti >= 37 && ti <= 42) || (ti >= 51 && ti <= 54);
    const empresa = (ti >= 17 && ti <= 24) || ti === 27 || ti === 33 || ti === 36 || ti === 39 || ti === 42 || [45, 46, 49, 50, 53, 54].includes(ti);
    if (fueraUE) return { grupo: 'fuera_europa', sabido: { marca: true, region: true, uso: true } };
    return { grupo: empresa ? 'empresa' : 'particulares', sabido: { marca: true, region: true, uso: ti !== 26 && ti !== 28 && ti !== 29 && ti !== 30 } };
  }
  // sin TI: la ruta del coste de esquema dice la región (NOUE) y si es B2B; la red de origen, la región
  if (fc === 34) return { grupo: 'empresa', sabido: { marca: true, region: false, uso: true } };
  if ([9, 10, 11, 12, 27, 28, 29, 30, 39, 40].includes(fc)) return { grupo: 'fuera_europa', sabido: { marca: true, region: true, uso: false } };
  if (red === 'fuera') return { grupo: 'fuera_europa', sabido: { marca: false, region: true, uso: false } };
  return { grupo: 'particulares', sabido: { marca: Boolean(fc), region: Boolean(fc) || Boolean(red), uso: false } };
}

/**
 * Lee un FB 500. @returns {{operaciones, totales: [{desde, hasta, importe, descuento, abono, linea}], cabeceras, sin_leer}}
 */
export function leerFB500(texto, archivo) {
  const lineas = String(texto).split(/\r?\n/);
  const ops = [], totales = [], cabeceras = [];
  let sinLeer = 0;
  lineas.forEach((l, i) => {
    if (!l.trim()) return;
    const origen = { archivo, hoja: null, fila: i + 1, texto: l.replace(/\s+/g, ' ').trim().slice(0, 160) };
    const tipo = l.slice(0, 2);
    if (tipo === '10') cabeceras.push({ desde: fechaDDMMAAAA(trozo(l, 12, 8)), hasta: fechaDDMMAAAA(trozo(l, 20, 8)), origen });
    else if (tipo === '90') {
      totales.push({ desde: fechaDDMMAAAA(trozo(l, 12, 8)), hasta: fechaDDMMAAAA(trozo(l, 20, 8)), importe: importeFB(trozo(l, 28, 10)),
        descuento: importeFB(trozo(l, 38, 10)), abono: importeFB(trozo(l, 48, 10)), bonificaciones: importeFB(trozo(l, 58, 10)), origen });
    } else if (tipo === '20') {
      const fecha = fechaDDMMAA(trozo(l, 24, 6));
      const tipoOp = trozo(l, 34, 3);
      const importe = importeFB(trozo(l, 65, 10));
      const descuento = importeFB(trozo(l, 80, 10));
      if (!fecha || importe === null || (tipoOp !== '010' && tipoOp !== '110')) { sinLeer++; return; }
      const red = RED_ORIGEN[trozo(l, 130, 1)] ?? null;
      const g = grupoFB500(trozo(l, 299, 5).trim(), trozo(l, 314, 5).trim(), red);
      ops.push({ fecha, clase: tipoOp === '110' ? 'devolucion' : 'venta', importe: Math.abs(importe), comision: descuento === null ? null : Math.abs(descuento),
        neto: null, grupo: g.grupo, sabido: g.sabido, reembolsado: 0, origen,
        intercambio: importeFB(trozo(l, 304, 10)), esquema: importeFB(trozo(l, 319, 10)) });
    } else sinLeer++;
  });
  return { operaciones: ops, totales, cabeceras, sin_leer: sinLeer };
}

export const _internas = { numero, fechaDe, normalizar, palabrasDe, aCentimos };
