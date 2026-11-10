// Texto pegado. Si tiene estructura (CSV, TSV, Norma 43, OFX, QIF, MT940, camt.053) va a su lector
// con un nombre de la extensión adecuada; si no, cada línea se lee por posiciones como una página (nivel B).

import { crearLectura, lecturaConError } from '../nucleo/modelo.js';
import { decodificar } from '../nucleo/texto.js';
import { reconstruir } from '../nucleo/filas.js';

const LIMITE = 10 * 1024 * 1024;
const ALTO_LINEA = 10; // unidades por línea: la tolerancia de ±2 nunca junta dos líneas
const EXTENSIONES = { norma43: '.n43', ofx: '.ofx', qif: '.qif', mt940: '.sta', camt053: '.xml', tsv: '.tsv', csv: '.csv' };

/** Formato con estructura del texto, mirando el principio: norma43|ofx|qif|mt940|camt053|tsv|csv|null */
export function detectarTipo(texto) {
  const cabeza = String(texto ?? '').slice(0, 20000);
  if (/<OFX>|OFXHEADER\s*:/i.test(cabeza)) return 'ofx';
  if (/<(?:\w+:)?BkToCstmrStmt\b|urn:iso:std:iso:20022:tech:xsd:camt\.053/i.test(cabeza)) return 'camt053';
  const lineas = cabeza.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim()).slice(0, 200);
  if (!lineas.length) return null;
  if (/^!(?:Type|Account|Option)\b/i.test(lineas[0].trim())) return 'qif';
  if (lineas.some((l) => /^:20:/.test(l)) && lineas.some((l) => /^:25:/.test(l)) && lineas.some((l) => /^:(?:60[FM]|61|62[FM]):/.test(l))) return 'mt940';
  if (esNorma43(lineas)) return 'norma43';
  return separador(lineas);
}

function esNorma43(lineas) {
  if (!/^11\d{18}/.test(lineas[0])) return false;
  const validas = lineas.filter((l) => /^(?:11|22|23|33|88)/.test(l) && l.length <= 80);
  return validas.length >= 0.9 * lineas.length && lineas.some((l) => /^(?:22|33)/.test(l));
}

function contarFuera(linea, sep) {
  let n = 0, comillas = false;
  for (const ch of linea) {
    if (ch === '"') comillas = !comillas;
    else if (ch === sep && !comillas) n++;
  }
  return n;
}

function separador(lineas) {
  const sep = caracterSeparador(lineas);
  return sep === null ? null : sep === '\t' ? 'tsv' : 'csv';
}

/** Carácter que separa las columnas (tabulador, punto y coma o coma), o null. */
function caracterSeparador(lineas) {
  if (lineas.length < 2) return null;
  for (const sep of ['\t', ';', ',']) {
    const cuentas = lineas.map((l) => contarFuera(l, sep));
    const con = cuentas.filter((c) => c > 0);
    if (con.length < 2 || con.length < 0.7 * lineas.length) continue;
    const veces = new Map();
    for (const c of con) veces.set(c, (veces.get(c) || 0) + 1);
    const moda = [...veces.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    if (moda < (sep === ',' ? 2 : 1)) continue;
    if (cuentas.filter((c) => c === moda).length < 0.6 * lineas.length) continue;
    // «12,50» con coma decimal y sin comillas: la coma no separa columnas
    if (sep === ',' && !lineas.some((l) => l.includes('"')) && lineas.filter((l) => /\d,\d{2}(?!\d)/.test(l)).length > 0.3 * lineas.length) continue;
    return sep;
  }
  return null;
}

/**
 * Al copiar una tabla de la web de un banco, una celda con un salto de línea (un concepto en dos líneas) parte la
 * fila en dos: «02/03/2026⇥TRANSFERENCIA A FAVOR DE» y «ALQUILERES GARCIA SL⇥−650,00 €⇥1.234,56 €». Si casi todas
 * las filas tienen el mismo número de separadores y dos o tres líneas seguidas suman justo ese número, se juntan.
 * Una línea sin ningún separador (un título) no se junta con nada.
 */
export function repararFilasPartidas(texto, sep) {
  const lineas = texto.split('\n');
  const cuentas = lineas.map((l) => (l.trim() ? contarFuera(l, sep) : -1));
  const veces = new Map();
  for (const c of cuentas) if (c > 0) veces.set(c, (veces.get(c) || 0) + 1);
  if (!veces.size) return texto;
  const [moda, n] = [...veces.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  if (n < 2) return texto;
  const fuera = [];
  for (let i = 0; i < lineas.length; i++) {
    let actual = lineas[i], c = cuentas[i];
    if (c > 0 && c < moda) {
      let j = i + 1, suma = c;
      const partes = [actual];
      while (j < lineas.length && j <= i + 2 && cuentas[j] >= 0 && suma + cuentas[j] <= moda) {
        partes.push(lineas[j]);
        suma += cuentas[j];
        j++;
        if (suma === moda) break;
      }
      if (suma === moda && partes.length > 1) { actual = partes.map((x) => x.trim()).join(' '); i = j - 1; }
    }
    fuera.push(actual);
  }
  return fuera.join('\n');
}

function conExtension(nombre, ext) {
  return nombre.replace(/\.(?:txt|csv|tsv|n43|q43|aeb|ofx|qif|sta|xml)$/i, '') + ext;
}

// Al copiar y pegar se pierden los espacios del final de cada registro de 80 caracteres
function rellenarNorma43(texto) {
  return texto.split('\n').map((l) => (/^\d{2}/.test(l) && l.length < 80 ? l.padEnd(80, ' ') : l)).join('\n');
}

/**
 * Una página de «palabras» con la x en columnas de carácter (tabulador = salto a la siguiente columna de 8).
 * Si casi todas las líneas llevan tabuladores, cada campo va en su columna fija (como una tabla), porque
 * al copiar una tabla de una web el tabulador separa columnas y su ancho no dice nada.
 */
function paginaDeTexto(texto, numero) {
  const lineas = texto.split('\n');
  const conTab = lineas.filter((l) => l.includes('\t')).length;
  const llenas = lineas.filter((l) => l.trim()).length;
  if (llenas && conTab >= 0.5 * llenas) return paginaTabulada(lineas, numero);
  const tokens = [];
  let anchoMax = 0;
  lineas.forEach((linea, i) => {
    let col = 0, inicio = 0, palabra = '';
    const cerrar = () => {
      if (palabra) tokens.push({ texto: palabra, x0: inicio, x1: col, y0: i * ALTO_LINEA, y1: i * ALTO_LINEA + 8 });
      palabra = '';
    };
    for (const ch of linea) {
      if (ch === '\t') { cerrar(); col = Math.max((Math.floor(col / 8) + 1) * 8, col + 2); continue; }
      if (/\s/.test(ch)) { cerrar(); col++; continue; }
      if (!palabra) inicio = col;
      palabra += ch;
      col++;
    }
    cerrar();
    anchoMax = Math.max(anchoMax, col);
  });
  return { numero, ancho: anchoMax || 1, alto: Math.max(1, lineas.length) * ALTO_LINEA, tokens };
}

function paginaTabulada(lineas, numero) {
  const campos = lineas.map((l) => l.split('\t'));
  const anchos = [];
  for (const fila of campos) fila.forEach((c, k) => { anchos[k] = Math.max(anchos[k] ?? 0, [...c].length); });
  const inicio = [];
  let x = 0;
  for (let k = 0; k < anchos.length; k++) { inicio[k] = x; x += anchos[k] + 4; }
  const tokens = [];
  campos.forEach((fila, i) => {
    fila.forEach((campo, k) => {
      let col = 0, desde = 0, palabra = '';
      const cerrar = () => {
        if (palabra) tokens.push({ texto: palabra, x0: inicio[k] + desde, x1: inicio[k] + col, y0: i * ALTO_LINEA, y1: i * ALTO_LINEA + 8 });
        palabra = '';
      };
      for (const ch of campo) {
        if (/\s/.test(ch)) { cerrar(); col++; continue; }
        if (!palabra) desde = col;
        palabra += ch;
        col++;
      }
      cerrar();
    });
  });
  return { numero, ancho: Math.max(1, x), alto: Math.max(1, lineas.length) * ALTO_LINEA, tokens };
}

function porPosiciones(texto, nombre, ctx) {
  // un salto de página (\f) separa páginas: así se quitan cabeceras y pies repetidos
  const paginas = texto.split('\f').map((trozo, i) => paginaDeTexto(trozo, i + 1));
  const res = reconstruir(paginas, {
    archivo: nombre,
    idArchivo: ctx?.idArchivo ?? 0,
    nivel: 'B',
    hoy: ctx?.opciones?.hoy,
    mapeo: ctx?.opciones?.mapeo?.[nombre],
  });
  return crearLectura({
    archivo: nombre,
    formato: 'texto_pegado',
    nivel: 'B',
    movimientos: res.movimientos,
    saldo_inicial: res.saldo_inicial,
    saldo_final: res.saldo_final,
    fecha_inicial: res.fecha_inicial,
    fecha_final: res.fecha_final,
    avisos: res.avisos,
    necesita_mapeo: res.necesita_mapeo,
    extra: res.extra,
  });
}

/**
 * @param {{nombre?: string, texto?: string, bytes?: Uint8Array}} entrada
 * @param {Object} ctx contrato de los lectores (idArchivo, opciones, leerArchivo…)
 * @returns {Promise<Object|Object[]>} LecturaArchivo, o la lista que devuelva el lector del formato reconocido
 */
export async function leer(entrada, ctx = {}) {
  const nombre = entrada?.nombre || 'texto pegado';
  let texto = typeof entrada?.texto === 'string' ? entrada.texto : entrada?.bytes ? decodificar(entrada.bytes).texto : '';
  if (texto.length > LIMITE) return lecturaConError(nombre, 'texto_pegado', 'grande', { archivo: nombre });
  texto = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!texto.trim()) return lecturaConError(nombre, 'texto_pegado', 'vacio', { archivo: nombre });
  // lector del datáfono: el texto tal cual (él separa las líneas y las celdas)
  if (ctx.opciones?.crudo === true) return crearLectura({ archivo: nombre, formato: 'texto_pegado', nivel: 'B', extra: { texto } });

  // filas partidas por un salto de línea dentro de una celda (copiar una tabla de la web). Antes de reconocer el
  // formato: con pocas filas, las partidas pueden hacer que no parezca una tabla. La coma no se mira: con la coma
  // decimal sería adivinar.
  for (const sep of ['\t', ';']) {
    if (!texto.includes(sep)) continue;
    const reparado = repararFilasPartidas(texto, sep);
    if (reparado !== texto) { texto = reparado; break; }
  }
  const tipo = detectarTipo(texto);
  if (tipo && typeof ctx.leerArchivo === 'function') {
    const bytes = new TextEncoder().encode(tipo === 'norma43' ? rellenarNorma43(texto) : texto);
    let lecturas = null;
    try {
      lecturas = await ctx.leerArchivo({ nombre: conExtension(nombre, EXTENSIONES[tipo]), bytes }, ctx.idArchivo);
    } catch {
      lecturas = null;
    }
    const lista = (Array.isArray(lecturas) ? lecturas : lecturas ? [lecturas] : []).filter(Boolean);
    if (lista.some((l) => l.movimientos && l.movimientos.length)) return lista;
    // una tabla con tabuladores que su lector no entiende: se prueba por posiciones
    if (tipo === 'csv' || tipo === 'tsv') {
      const p = porPosiciones(texto, nombre, ctx);
      if (p.movimientos.length) return p;
    }
    if (lista.length) return lista;
  }
  return porPosiciones(texto, nombre, ctx);
}
