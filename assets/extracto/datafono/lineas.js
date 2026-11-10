// Lecturas «crudas» de los lectores (páginas con palabras, tablas de hojas y CSV, texto pegado) → líneas con
// sus trozos: etiquetas de texto y cifras (importes, porcentajes, enteros, fechas), cada una con su posición.
// Lógica pura: sin DOM ni red. Cada línea guarda de dónde sale (archivo, página u hoja, fila y texto original).

import { lineasDePagina, corregirOCR } from '../nucleo/filas.js';
import { parseImporte, inferirDecimal, redondear2 } from '../nucleo/numeros.js';
import { parseFecha, inferirOrden } from '../nucleo/fechas.js';
import { normalizar } from '../nucleo/texto.js';
import { palabrasDe } from './etiquetas.js';

const MAX_LINEAS = 60000;
const MENOS = /[−‒–—―﹣－]/g;
const ES_FECHA = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/;

/**
 * @typedef {Object} Trozo
 * @property {'texto'|'importe'|'porcentaje'|'entero'|'fecha'} tipo
 * @property {string} texto   tal cual
 * @property {number|string|null} valor  número, o fecha AAAA-MM-DD
 * @property {number} x0 @property {number} x1  posición (en hojas, el número de columna)
 * @property {boolean} [corregido]  el OCR leyó letras dentro de la cifra y se han cambiado
 * @property {number|null} [conf]   confianza del OCR (0..1)
 *
 * @typedef {Object} Linea
 * @property {number} indice     orden en todo el análisis
 * @property {string} archivo
 * @property {number|null} pagina
 * @property {string|null} hoja
 * @property {number} fila       1 = primera fila de la página, de la hoja o del texto
 * @property {string} texto      texto original de la línea
 * @property {'A'|'B'|'C'} nivel A tabla, B PDF o texto, C OCR
 * @property {Trozo[]} trozos
 * @property {string[]} palabras palabras normalizadas de la línea entera
 * @property {number} y @property {number} alto  posición vertical (en hojas, la fila)
 * @property {boolean} hoja_de_calculo
 */

/** Une las lecturas crudas en una lista de líneas, en orden. También devuelve las tablas (para las exportaciones). */
export function lineasDeLecturas(lecturas) {
  const lineas = [], tablas = [];
  const crudas = [];
  for (const l of lecturas) {
    if (l.error || l.necesita_contrasena) continue;
    const e = l.extra || {};
    if (Array.isArray(e.paginas)) {
      for (const p of e.paginas) {
        const nivel = p.nivel === 'C' ? 'C' : 'B';
        for (const L of lineasDePagina(p, nivel)) crudas.push({ archivo: l.archivo, pagina: p.numero ?? 1, hoja: null, nivel, L });
      }
    } else if (Array.isArray(e.tablas)) {
      for (const t of e.tablas) {
        tablas.push({ archivo: l.archivo, hoja: t.hoja ?? null, filas: t.filas, textos: t.textos ?? null });
        t.filas.forEach((f, i) => {
          if (!f || !f.some(lleno)) return;
          crudas.push({ archivo: l.archivo, pagina: null, hoja: t.hoja ?? null, nivel: 'A', fila: i + 1, celdas: f, textoFila: t.textos?.[i] ?? null });
        });
      }
    } else if (typeof e.texto === 'string') {
      const filas = textoATabla(e.texto);
      if (filas.tabulada) tablas.push({ archivo: l.archivo, hoja: null, filas: filas.filas, textos: filas.lineas });
      filas.lineas.forEach((t, i) => {
        if (!t.trim()) return;
        crudas.push({ archivo: l.archivo, pagina: null, hoja: null, nivel: 'B', fila: i + 1, texto: t, tabulada: filas.tabulada ? filas.filas[i] : null });
      });
    }
    if (crudas.length > MAX_LINEAS) break;
  }

  // separador decimal y orden de las fechas de todo el documento (como filas.js)
  const muestras = [], fechas = [];
  for (const c of crudas) for (const w of textosDe(c)) {
    if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(w)) fechas.push(w);
    else if (/^[-+(]?\d[\d.,]*\d[)-]?$/.test(w) && /[.,]/.test(w)) muestras.push(w);
  }
  const cx = { decimal: inferirDecimal(muestras), orden: inferirOrden(fechas) };

  for (const c of crudas.slice(0, MAX_LINEAS)) {
    const L = c.L ? deLineaPdf(c, cx) : c.celdas ? deFilaHoja(c, cx) : deTexto(c, cx);
    if (!L || !L.trozos.length) continue;
    L.indice = lineas.length;
    L.palabras = palabrasDe(L.trozos.filter((t) => t.tipo === 'texto').map((t) => t.texto).join(' '));
    lineas.push(L);
  }
  return { lineas, tablas, decimal: cx.decimal, orden: cx.orden };
}

/** Texto de una fila sin las celdas vacías: «Total cargos | | | 83,42» → «Total cargos | 83,42». */
const compacto = (t) => String(t).split(' | ').map((x) => x.trim()).filter(Boolean).join(' | ');
const lleno = (v) => v !== null && v !== undefined && String(v).trim() !== '';

function textosDe(c) {
  if (c.L) return c.L.palabras.map((w) => w.t);
  if (c.celdas) return c.celdas.filter((v) => typeof v === 'string').flatMap((v) => v.split(/\s+/));
  return String(c.texto).split(/\s+/);
}

// ───────────── PDF y OCR ─────────────

function deLineaPdf(c, cx) {
  const L = c.L;
  // celdas: palabras separadas por más de 1,5 letras (filas.js ya las marca con «celda»)
  const celdas = [];
  for (const w of L.palabras) {
    const k = w.celda ?? 0;
    if (!celdas[k]) celdas[k] = [];
    celdas[k].push(w);
  }
  const trozos = [];
  for (const ws of celdas.filter(Boolean)) {
    for (const t of trozosDePalabras(ws.map((w) => ({ t: w.t, x0: w.x0, x1: w.x1, c: w.c ?? null })), cx, c.nivel)) trozos.push(t);
  }
  return {
    archivo: c.archivo, pagina: c.pagina, hoja: null, fila: L.fila, texto: L.texto, nivel: c.nivel, trozos,
    y: L.y, alto: L.alto || 1, ancho_letra: L.charW || 1, hoja_de_calculo: false,
  };
}

// ───────────── hojas de cálculo y CSV ─────────────

function deFilaHoja(c, cx) {
  const trozos = [];
  c.celdas.forEach((v, col) => {
    if (!lleno(v)) return;
    if (typeof v === 'number') {
      const entero = Number.isInteger(v);
      trozos.push({ tipo: entero ? 'entero' : 'importe', texto: String(v), valor: redondear2(v), x0: col, x1: col + 1, celda: col, numero: true });
      return;
    }
    const s = String(v).trim();
    // una celda es un solo dato: si entera es una cifra, es esa cifra
    const uno = trozoDeCelda(s, cx);
    if (uno) { trozos.push({ ...uno, x0: col, x1: col + 1, celda: col }); return; }
    for (const t of trozosDePalabras(palabrasConPosicion(s, col, col + 1), cx, 'A')) trozos.push({ ...t, celda: col });
  });
  const texto = compacto(c.textoFila || c.celdas.map((v) => (lleno(v) ? String(v) : '')).join(' | '));
  return { archivo: c.archivo, pagina: null, hoja: c.hoja, fila: c.fila, texto, nivel: 'A', trozos, y: c.fila, alto: 1, ancho_letra: 0.2, hoja_de_calculo: true };
}

/** Una celda entera que es una cifra, una fecha o un porcentaje. */
function trozoDeCelda(s, cx) {
  const t = s.replace(MENOS, '-').replace(/[   ]/g, ' ').trim();
  if (!t) return null;
  const f = fechaDe(t, cx);
  if (f) return { tipo: 'fecha', texto: s, valor: f };
  const p = porcentajeDe(t);
  if (p !== null) return { tipo: 'porcentaje', texto: s, valor: p };
  if (/^[-+(]?\s*(?:€|EUR)?\s*\d[\d.,' ]*\s*(?:€|EUR|EUROS)?\s*[)-]?$/i.test(t)) {
    const entero = enteroDe(t, cx);
    if (entero !== null) return { tipo: 'entero', texto: s, valor: entero };
    const v = parseImporte(t, { decimal: cx.decimal });
    if (v !== null) return { tipo: 'importe', texto: s, valor: v };
  }
  return null;
}

// ───────────── texto pegado ─────────────

/** Texto pegado → líneas; si casi todas llevan tabuladores, también como tabla. */
export function textoATabla(texto) {
  const lineas = String(texto).replace(/\r\n?/g, '\n').split('\n');
  const llenas = lineas.filter((l) => l.trim());
  const conTab = llenas.filter((l) => l.includes('\t')).length;
  const tabulada = llenas.length >= 2 && conTab >= llenas.length * 0.6;
  const filas = tabulada ? lineas.map((l) => l.split('\t').map((c) => c.trim())) : null;
  return { lineas, filas, tabulada };
}

function deTexto(c, cx) {
  const trozos = [];
  if (c.tabulada) {
    c.tabulada.forEach((s, col) => {
      if (!s) return;
      const uno = trozoDeCelda(s, cx);
      if (uno) trozos.push({ ...uno, x0: col, x1: col + 1, celda: col });
      else for (const t of trozosDePalabras(palabrasConPosicion(s, col, col + 1), cx, 'B')) trozos.push({ ...t, celda: col });
    });
    return { archivo: c.archivo, pagina: null, hoja: null, fila: c.fila, texto: compacto(c.texto.replace(/\t/g, ' | ')), nivel: 'A', trozos, y: c.fila, alto: 1, ancho_letra: 0.2, hoja_de_calculo: true };
  }
  // columnas alineadas con espacios: la posición es el carácter. Dos espacios o más separan celdas.
  const s = c.texto.replace(/\t/g, '    ');
  const re = /\S+(?: \S+)*/g;
  let m;
  while ((m = re.exec(s))) {
    const ws = palabrasConPosicion(m[0], m.index, m.index + m[0].length);
    for (const t of trozosDePalabras(ws, cx, 'B')) trozos.push(t);
  }
  return { archivo: c.archivo, pagina: null, hoja: null, fila: c.fila, texto: c.texto, nivel: 'B', trozos, y: c.fila, alto: 1, ancho_letra: 1, hoja_de_calculo: false };
}

/** Palabras de un texto, con su x repartida por caracteres entre x0 y x1. */
function palabrasConPosicion(s, x0, x1) {
  const out = [], ancho = (x1 - x0) / Math.max(1, s.length);
  const re = /\S+/g;
  let m;
  while ((m = re.exec(s))) out.push({ t: m[0], x0: x0 + m.index * ancho, x1: x0 + (m.index + m[0].length) * ancho, c: null });
  return out;
}

// ───────────── palabras → trozos ─────────────

/**
 * Palabras de una misma celda → trozos de texto y cifras. Junta «1 234,56», «0,40 %», «- 12,50», «12,50 €».
 * @param {Array<{t, x0, x1, c}>} ws
 */
export function trozosDePalabras(ws, cx, nivel) {
  const out = [];
  for (let i = 0; i < ws.length; i++) {
    let w = ws[i];
    let t = w.t.replace(MENOS, '-');
    let x0 = w.x0, x1 = w.x1, conf = w.c;
    // signo suelto delante, o moneda delante
    if ((t === '-' || t === '+' || t === '€' || /^EUR$/i.test(t)) && i + 1 < ws.length && /^[\d(]/.test(ws[i + 1].t) && !ES_FECHA.test(ws[i + 1].t)) {
      const sig = ws[++i];
      t = (t === '-' || t === '+' ? t : '') + sig.t.replace(MENOS, '-');
      x1 = sig.x1; conf = minConf(conf, sig.c);
    }
    // miles con espacio: «1 234,56» (solo si queda con céntimos: «12 345» pueden ser dos cifras)
    while (i + 1 < ws.length && /^[-+]?\d{1,3}$/.test(t) && /^\d{3}(?:[.,]\d{3})*[.,]\d{2}(?:\s?€)?$/.test(ws[i + 1].t)) {
      const sig = ws[++i];
      t += sig.t; x1 = sig.x1; conf = minConf(conf, sig.c);
    }
    // «%», «€», «EUR» o un signo detrás
    while (i + 1 < ws.length && /^(?:%|€|EUR|EUROS|-|\+)$/i.test(ws[i + 1].t) && /\d$/.test(t) && !(ES_FECHA.test(t) && /^[-+]$/.test(ws[i + 1].t))) {
      const sig = ws[++i];
      t += sig.t === '%' || sig.t === '-' || sig.t === '+' ? sig.t : ' ' + sig.t;
      x1 = sig.x1;
    }
    const trozo = clasificarPalabra(t, cx, nivel);
    trozo.x0 = x0; trozo.x1 = x1; trozo.conf = conf ?? null;
    // el texto se junta con el anterior si también es texto (una etiqueta de varias palabras)
    const prev = out[out.length - 1];
    if (trozo.tipo === 'texto' && prev && prev.tipo === 'texto') { prev.texto += ' ' + trozo.texto; prev.x1 = x1; prev.conf = minConf(prev.conf, conf); }
    else out.push(trozo);
  }
  return out;
}

const minConf = (a, b) => (a === null || a === undefined ? b ?? null : b === null || b === undefined ? a : Math.min(a, b));

function clasificarPalabra(t, cx, nivel) {
  const directo = cifra(t, cx);
  if (directo) return directo;
  if (nivel === 'C') {
    const c = corregirOCR(t);
    const r = c ? cifra(c, cx) : null;
    if (r) return { ...r, texto: t, corregido: true };
  }
  return { tipo: 'texto', texto: t, valor: null };
}

function cifra(t, cx) {
  if (!/\d/.test(t)) return null;
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(t)) return { tipo: 'texto', texto: t, valor: null }; // hora
  const f = fechaDe(t, cx);
  if (f) return { tipo: 'fecha', texto: t, valor: f };
  const p = porcentajeDe(t);
  if (p !== null) return { tipo: 'porcentaje', texto: t, valor: p };
  const e = enteroDe(t, cx);
  if (e !== null) return { tipo: 'entero', texto: t, valor: e };
  const s = t.replace(/\s/g, '');
  // importe con céntimos o con moneda; también «1.234,5» no (los céntimos van siempre con dos cifras)
  if (/^[-+(]?(?:€|EUR)?\d{1,3}(?:[.,' ]?\d{3})*(?:[.,]\d{2})(?:€|EUR|EUROS)?[)-]?$/i.test(s) || /^[-+(]?(?:€|EUR)?\d+(?:€|EUR|EUROS)[)-]?$/i.test(s)) {
    const v = parseImporte(t, { decimal: cx.decimal });
    if (v !== null) return { tipo: 'importe', texto: t, valor: v };
  }
  return null;
}

/** «0,40%», «0.4 %», «1,49%» → 0.4, 1.49. */
export function porcentajeDe(t) {
  const m = String(t).replace(/\s/g, '').match(/^([-+]?)(\d{1,3}(?:[.,]\d{1,4})?)%$/);
  if (!m) return null;
  const v = Number(m[2].replace(',', '.'));
  return Number.isFinite(v) ? (m[1] === '-' ? -v : v) : null;
}

/** «335», «1.234» (con punto de miles si el documento usa coma decimal) → número entero. Sin céntimos ni moneda. */
function enteroDe(t, cx) {
  const s = String(t).trim();
  if (/^\d{1,9}$/.test(s)) return Number(s);
  if (cx.decimal === ',' && /^\d{1,3}(?:\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  if (cx.decimal === '.' && /^\d{1,3}(?:,\d{3})+$/.test(s)) return Number(s.replace(/,/g, ''));
  return null;
}

function fechaDe(t, cx) {
  const s = String(t).trim();
  if (!/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(s)) return null;
  return parseFecha(s, { orden: cx.orden }) ?? null;
}

/** Normaliza una etiqueta para buscar (mayúsculas, sin tildes). */
export function norm(s) { return normalizar(s); }
