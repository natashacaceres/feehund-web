// CSV, TSV y TXT con columnas. Separador propio (; , tab |) y después Papa Parse con ese separador.
// También lee texto pegado con tabuladores y tablas de ancho fijo (columnas alineadas con espacios).

import { crearLectura, lecturaConError, aviso } from '../nucleo/modelo.js';
import { decodificar } from '../nucleo/texto.js';
import { deTablaAMovimientos } from '../nucleo/tabla.js';
import { detectarCabecera } from '../nucleo/cabeceras.js';

const MAX_BYTES = 10 * 1024 * 1024;
const CANDIDATOS = [';', ',', '\t', '|'];
const TIENE_FECHA = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/;
const EMPIEZA_FECHA = /^\s*(?:\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?|\d{4}-\d{2}-\d{2})\b/;
// Importe partido por la coma decimal en un CSV con comas: «-13» y «99», «1.000» y «00», «(3» y «00)», «8» y «00-».
const PARTE_ENTERA = /^[-+−]?\(?\s*(?:\d{1,3}(?:\.\d{3})+|\d+)$/;
const PARTE_CENTIMOS = /^\d{2}\s*[-)]?\s*(?:€|EUR)?$/i;
const PUNTO_DECIMAL = /^[-+−]?\(?\d+\.\d{2}\)?$/;

/**
 * Campos por registro en el principio del texto, respetando comillas (las comillas solo abren al principio de un campo).
 * @returns {number[]} un número por registro no vacío
 */
export function contarCampos(texto, sep, maxRegistros = 50) {
  const out = [];
  let campos = 1, enComillas = false, inicioCampo = true, conContenido = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (enComillas) {
      if (ch === '"') { if (texto[i + 1] === '"') i++; else enComillas = false; }
      continue;
    }
    if (ch === sep) { campos++; inicioCampo = true; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      if (conContenido) { out.push(campos); if (out.length >= maxRegistros) return out; }
      campos = 1; inicioCampo = true; conContenido = false;
      continue;
    }
    if (ch === '"' && inicioCampo) { enComillas = true; inicioCampo = false; conContenido = true; continue; }
    if (ch !== ' ' && ch !== '\t') { inicioCampo = false; conContenido = true; }
  }
  if (conContenido && out.length < maxRegistros) out.push(campos);
  return out;
}

/**
 * Separador de columnas: el que da el número de campos más constante (y mayor que 1) en las 50 primeras líneas.
 * @param {string} texto
 * @returns {';'|','|'\t'|'|'|null}
 */
export function detectarSeparador(texto) {
  const muestra = texto.slice(0, 65536);
  // si casi todas las comas van entre una cifra y dos decimales («-13,99 »), son comas decimales y no separan columnas
  const comas = (muestra.match(/,/g) || []).length;
  const decimales = (muestra.match(/\d,\d{2}(?![\d.,])/g) || []).length;
  const comaDecimal = comas > 0 && decimales / comas >= 0.6;
  let mejor = null;
  for (const sep of CANDIDATOS) {
    if (sep === ',' && comaDecimal) continue;
    const cuentas = contarCampos(muestra, sep, 50);
    if (!cuentas.length) continue;
    const veces = new Map();
    for (const c of cuentas) veces.set(c, (veces.get(c) ?? 0) + 1);
    let moda = 0, max = 0;
    for (const [c, k] of veces) if (k > max || (k === max && c > moda)) { moda = c; max = k; }
    if (moda < 2) continue;
    const constancia = max / cuentas.length;
    if (!mejor || constancia > mejor.constancia + 1e-9 || (Math.abs(constancia - mejor.constancia) <= 1e-9 && moda > mejor.moda)) {
      mejor = { sep, constancia, moda };
    }
  }
  return mejor ? mejor.sep : null;
}

/** Celda de CSV: quita el truco ="0012" de Excel. */
function limpiarCelda(c) {
  if (typeof c !== 'string') return c;
  const m = c.match(/^\s*="(.*)"\s*$/s);
  return m ? m[1].replace(/""/g, '"') : c;
}

function quitarComillas(c) {
  const t = c.trim();
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') return t.slice(1, -1).replace(/""/g, '"');
  return c;
}

/** Filas con el número de campos más repetido (para elegir entre dos lecturas). */
function regulares(filas) {
  const veces = new Map();
  for (const f of filas) if (f.length > 1) veces.set(f.length, (veces.get(f.length) ?? 0) + 1);
  let max = 0;
  for (const k of veces.values()) if (k > max) max = k;
  return max;
}

function parsear(Papa, texto, sep, avisos, archivo) {
  const r = Papa.parse(texto, { delimiter: sep, quoteChar: '"', skipEmptyLines: false, header: false, dynamicTyping: false });
  let filas = r.data;
  if (r.errors.some((e) => e.type === 'Quotes')) {
    // comillas sin cerrar: se prueba a leer sin comillas y se queda la lectura más regular
    const r2 = Papa.parse(texto, { delimiter: sep, quoteChar: '\u0000', skipEmptyLines: false, header: false, dynamicTyping: false });
    const sinComillas = r2.data.map((f) => f.map(quitarComillas));
    if (regulares(sinComillas) > regulares(filas)) filas = sinComillas;
    avisos.push(aviso('csv_comillas', { archivo }));
  }
  for (const f of filas) for (let c = 0; c < f.length; c++) f[c] = limpiarCelda(f[c]);
  return filas;
}

/** Posiciones k en que la fila trae un importe partido (fila[k] la parte entera y fila[k+1] los céntimos). */
function partidos(fila) {
  const out = [];
  for (let k = 0; k + 1 < fila.length; k++) {
    const a = fila[k], b = fila[k + 1];
    if (typeof a === 'string' && typeof b === 'string' && PARTE_ENTERA.test(a.trim()) && PARTE_CENTIMOS.test(b.trim())) { out.push(k); k++; }
  }
  return out;
}

function juntar(fila, posiciones) {
  const out = [];
  for (let k = 0; k < fila.length; k++) {
    if (posiciones.includes(k)) { out.push(`${fila[k].trim()},${fila[k + 1].trim()}`); k++; } else out.push(fila[k]);
  }
  return out;
}

function anchoUtil(fila) {
  let n = fila.length;
  while (n > 0 && (fila[n - 1] === null || fila[n - 1] === undefined || String(fila[n - 1]).trim() === '')) n--;
  return n;
}

/**
 * CSV con comas que separan columnas y también decimales, sin comillas («05/01/2026,NETFLIX,-13,99»):
 * Papa Parse parte cada importe en dos campos. Se vuelven a juntar solo si no hay duda:
 * - con fila de títulos: la fila tiene justo tantos campos de más como importes partidos;
 * - sin títulos: los importes partidos están en las mismas columnas en el 80 % de las filas con fecha;
 * y nunca si en el archivo hay importes con punto decimal («13.99»: entonces las comas no son decimales).
 * Tiene que pasar en al menos la mitad de las filas con fecha. Las filas que no se pueden juntar se quedan como
 * están y tabla.js las salta por tener columnas de más.
 * @returns {null|{filas: Array, unidas: number}}
 */
export function unirDecimalesPartidos(filas) {
  const cab = detectarCabecera(filas);
  const desde = cab ? cab.indice + 1 : 0;
  const conFecha = [];
  for (let i = desde; i < filas.length; i++) {
    const f = filas[i];
    if (!f || f.length < 3) continue;
    let fecha = false, punto = false;
    for (const c of f) {
      if (typeof c !== 'string') continue;
      if (!fecha && TIENE_FECHA.test(c)) fecha = true;
      if (PUNTO_DECIMAL.test(c.trim())) punto = true;
    }
    if (punto) return null;
    if (fecha) conFecha.push(i);
  }
  if (!conFecha.length) return null;
  const nuevas = filas.slice();
  let unidas = 0;
  if (cab) {
    const esperado = anchoUtil(filas[cab.indice]);
    for (const i of conFecha) {
      const f = filas[i];
      const sobran = anchoUtil(f) - esperado;
      if (sobran <= 0) continue;
      const pos = partidos(f);
      if (pos.length !== sobran) continue;
      nuevas[i] = juntar(f, pos);
      unidas++;
    }
  } else {
    const veces = new Map();
    const posDe = new Map();
    for (const i of conFecha) {
      const pos = partidos(filas[i]);
      if (!pos.length) continue;
      const clave = pos.join(',');
      posDe.set(i, pos);
      veces.set(clave, (veces.get(clave) ?? 0) + 1);
    }
    let mejor = null, max = 0;
    for (const [k, n] of veces) if (n > max) { mejor = k; max = n; }
    if (mejor === null || max < conFecha.length * 0.8) return null;
    const elegidas = mejor.split(',').map(Number);
    for (const i of conFecha) {
      const pos = posDe.get(i);
      if (!pos || !elegidas.every((k) => pos.includes(k))) continue;
      nuevas[i] = juntar(filas[i], elegidas);
      unidas++;
    }
  }
  return unidas && unidas >= conFecha.length * 0.5 ? { filas: nuevas, unidas } : null;
}

/**
 * Tabla de ancho fijo: columnas separadas por huecos que están en blanco en (casi) todas las líneas de movimientos.
 * Los huecos se buscan en las líneas que empiezan por una fecha (si hay al menos 3), para que una línea de título
 * con fechas («Periodo del 01/01/2026 al 31/01/2026») no los rompa.
 * @returns {string[][]|null}
 */
export function columnasPorPosicion(texto) {
  const lineas = texto.split(/\r\n|\n|\r/);
  const todas = lineas.filter((l) => TIENE_FECHA.test(l)).slice(0, 2000);
  const empiezan = todas.filter((l) => EMPIEZA_FECHA.test(l));
  const conFecha = empiezan.length >= 3 ? empiezan : todas;
  if (conFecha.length < 3) return null;
  let ancho = 0;
  for (const l of conFecha) if (l.length > ancho) ancho = l.length;
  if (ancho > 500) return null; // un extracto de ancho fijo no tiene líneas tan largas: esto es otra cosa
  const blancos = new Uint32Array(ancho + 1);
  for (const l of conFecha) {
    for (let p = 0; p <= ancho; p++) if (p >= l.length || l[p] === ' ' || l[p] === '\t') blancos[p]++;
  }
  const hueco = (p) => blancos[p] >= conFecha.length * 0.95;
  // columnas = tramos con texto separados por huecos de 2 o más posiciones (un solo espacio va dentro de la columna)
  const cortes = [];
  let p = 0;
  while (p < ancho) {
    while (p < ancho && hueco(p)) p++;
    if (p >= ancho) break;
    const ini = p;
    let fin = ancho;
    while (p < ancho) {
      if (!hueco(p)) { p++; continue; }
      let q = p;
      while (q < ancho && hueco(q)) q++;
      if (q - p >= 2 || q >= ancho) { fin = p; p = q; break; }
      p = q;
    }
    cortes.push([ini, fin]);
  }
  if (cortes.length < 3) return null;
  // cada columna va desde su comienzo hasta el comienzo de la siguiente (así no se corta un texto que se sale un poco)
  return lineas.map((l) => (l.trim()
    ? cortes.map(([a], k) => l.slice(k === 0 ? 0 : a, k === cortes.length - 1 ? undefined : cortes[k + 1][0]).trim())
    : []));
}

/**
 * Lee un CSV, TSV o TXT con columnas.
 * @param {{nombre: string, bytes?: Uint8Array, texto?: string, codificacion?: string}} entrada
 * @param {Object} ctx ver DESARROLLO.md
 * @returns {Promise<import('../nucleo/modelo.js').LecturaArchivo>}
 */
export async function leer(entrada, ctx = {}) {
  const nombre = entrada.nombre ?? 'texto';
  const porNombre = /\.txt$/i.test(nombre) ? 'txt' : /\.tsv$/i.test(nombre) ? 'tsv' : 'csv';
  let texto, codificacion = entrada.codificacion ?? null;
  if (typeof entrada.texto === 'string') {
    texto = entrada.texto;
  } else {
    const bytes = entrada.bytes;
    if (!bytes || !bytes.length) return lecturaConError(nombre, porNombre, 'vacio', { archivo: nombre });
    if (bytes.length > MAX_BYTES) return lecturaConError(nombre, porNombre, 'grande', { archivo: nombre });
    const d = decodificar(bytes);
    texto = d.texto;
    codificacion = d.codificacion;
  }
  if (texto.length > MAX_BYTES) return lecturaConError(nombre, porNombre, 'grande', { archivo: nombre });
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  // un solo fin de línea: Papa Parse elige uno para todo el archivo y, si se mezclan CRLF y LF (archivos unidos
  // o retocados a mano), juntaba varias filas en una
  if (texto.includes('\r')) texto = texto.replace(/\r\n?/g, '\n');
  if (!texto.trim()) return lecturaConError(nombre, porNombre, 'vacio', { archivo: nombre });
  const muestra = texto.slice(0, 4000);
  const raros = (muestra.match(/[\u0000-\u0008\u000E-\u001F]/g) || []).length;
  if (raros > muestra.length * 0.01) return lecturaConError(nombre, porNombre, 'desconocido', { archivo: nombre });

  const avisos = [];
  let sep = null;
  const linea = texto.match(/^sep=(.)[ \t]*(?:\r\n|\n|\r)/i); // pista que deja Excel en la primera línea
  if (linea && CANDIDATOS.includes(linea[1])) sep = linea[1];
  sep ??= detectarSeparador(texto);

  let filas = null;
  if (sep) {
    const Papa = (await ctx.cargar('papaparse')).default;
    filas = parsear(Papa, texto, sep, avisos, nombre);
  } else {
    // líneas enteras entre comillas («"05/01/2026;NETFLIX;-13,99"»)
    const lineas = texto.split(/\r\n|\n|\r/).filter((l) => l.trim());
    if (lineas.length && lineas.filter((l) => /^\s*".*"\s*$/.test(l)).length >= lineas.length * 0.8) {
      const sinComillas = texto.split(/\r\n|\n|\r/).map((l) => quitarComillas(l)).join('\n');
      sep = detectarSeparador(sinComillas);
      if (sep) filas = parsear((await ctx.cargar('papaparse')).default, sinComillas, sep, avisos, nombre);
    }
    filas ??= columnasPorPosicion(texto);
  }
  if (!filas) return lecturaConError(nombre, porNombre, 'desconocido', { archivo: nombre });
  if (sep === ',') {
    const u = unirDecimalesPartidos(filas);
    if (u) { filas = u.filas; avisos.push(aviso('decimales_unidos', { archivo: nombre, n: u.unidas })); }
  }

  const formato = sep === '\t' ? 'tsv' : !sep ? 'txt' : porNombre === 'tsv' ? 'csv' : porNombre;
  const res = deTablaAMovimientos(filas, {
    archivo: nombre,
    idArchivo: ctx.idArchivo ?? 0,
    primerN: 1,
    mapeo: ctx.opciones?.mapeo?.[nombre],
    hoy: ctx.opciones?.hoy,
    anchoEstricto: !!sep,
    separador: sep,
  });
  const lectura = crearLectura({
    archivo: nombre,
    formato,
    perfil: res.perfil,
    nivel: 'A',
    movimientos: res.movimientos,
    saldo_inicial: res.saldo_inicial,
    saldo_final: res.saldo_final,
    fecha_inicial: res.fecha_inicial,
    fecha_final: res.fecha_final,
    avisos: [...avisos, ...res.avisos],
    necesita_mapeo: res.necesita_mapeo,
    extra: { ...res.extra, separador: sep ?? 'espacios', codificacion },
  });
  if (!lectura.movimientos.length && !lectura.necesita_mapeo) lectura.error = { codigo: 'sin_movimientos', datos: { archivo: nombre } };
  return lectura;
}
