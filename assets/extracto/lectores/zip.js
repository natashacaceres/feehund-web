// ZIP: abre el archivo y lee cada archivo de dentro con el lector que le toque (Wise entrega un CSV por divisa así).
// Protección contra ZIP bomba:
//  1. Antes de descomprimir nada se leen los tamaños declarados en el índice del ZIP y se para si pasan de los límites.
//  2. Al descomprimir (Inflate de fflate, por trozos) se para en cuanto el tamaño real supera el declarado.
//     unzipSync no sirve para esto: no puede parar a mitad y, si el tamaño declarado es falso, recorta en silencio.
//  3. Cada archivo se comprueba con su CRC32: si no coincide, está dañado y no se lee.
// El índice (listarZip) no necesita fflate: formato.js lo usa para distinguir xlsx, ods y numbers de un ZIP normal.

import { lecturaConError } from '../nucleo/modelo.js';
import { decodificarCP850 } from '../nucleo/texto.js';

export const LIMITES_ZIP = {
  archivos: 100,                // archivos útiles en todo el ZIP (contando los de ZIP dentro de ZIP)
  total: 50 * 1024 * 1024,      // bytes descomprimidos en total
  porArchivo: 10 * 1024 * 1024, // bytes descomprimidos por archivo
  niveles: 2,                   // ZIP dentro de ZIP como mucho
};

const TROZO = 8192; // bytes comprimidos por paso: acota lo que puede crecer una bomba antes de pararla

/** ZIP roto o no admitido. El lector lo convierte en un error en lenguaje humano. */
export class ErrorZip extends Error {
  constructor(motivo) {
    super(`ZIP no válido: ${motivo}`);
    this.name = 'ErrorZip';
    this.motivo = motivo;
  }
}

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const u64 = (b, i) => u32(b, i) + u32(b, i + 4) * 4294967296;

let TABLA_CRC = null;
function tablaCRC() {
  if (!TABLA_CRC) {
    TABLA_CRC = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLA_CRC[n] = c;
    }
  }
  return TABLA_CRC;
}

/** CRC32 (el mismo que usa ZIP). */
export function crc32(bytes) {
  return (seguirCRC(-1, bytes) ^ -1) >>> 0;
}

/** CRC32 por trozos: se empieza con -1 y al final se hace (crc ^ -1) >>> 0. */
function seguirCRC(crc, bytes) {
  const t = tablaCRC();
  for (let i = 0; i < bytes.length; i++) crc = t[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return crc;
}

const UTF8 = new TextDecoder('utf-8');
const UTF8_ESTRICTO = new TextDecoder('utf-8', { fatal: true });

function nombreZip(crudo, esUtf8) {
  if (esUtf8) return UTF8.decode(crudo);
  // sin la marca UTF-8: si es UTF-8 válido (macOS, Linux) se toma así; si no, página de códigos del DOS (Windows)
  try { return UTF8_ESTRICTO.decode(crudo); } catch { return decodificarCP850(crudo); }
}

/** Ruta limpia: barras normales, sin "/" inicial, sin "." ni "..". */
function limpiarRuta(ruta) {
  const carpeta = /[/\\]$/.test(ruta);
  const partes = ruta.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.' && p !== '..');
  return partes.join('/') + (carpeta && partes.length ? '/' : '');
}

/**
 * @typedef {Object} EntradaZip
 * @property {string} ruta        ruta dentro del ZIP ("2026/EUR.csv"); las carpetas acaban en "/"
 * @property {boolean} carpeta
 * @property {number} metodo      0 guardado, 8 deflate; otros no se admiten
 * @property {boolean} cifrado    con contraseña
 * @property {number} crc
 * @property {number} comprimido  bytes comprimidos
 * @property {number} tamano      bytes descomprimidos declarados
 * @property {number} local       posición de la cabecera local
 */

/**
 * Índice del ZIP (directorio central). No descomprime nada.
 * @param {Uint8Array} bytes
 * @returns {EntradaZip[]}
 * @throws {ErrorZip}
 */
export function listarZip(bytes) {
  const n = bytes.length;
  if (n < 22) throw new ErrorZip('demasiado corto');
  // fin del directorio central (50 4B 05 06), con hasta 64 KB de comentario detrás
  let e = -1;
  for (let i = n - 22, min = Math.max(0, n - 22 - 65535); i >= min; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) { e = i; break; }
  }
  if (e < 0) throw new ErrorZip('sin índice');
  let total = u16(bytes, e + 10);
  let tamIndice = u32(bytes, e + 12);
  let inicio = u32(bytes, e + 16);
  let finIndice = e;
  if (e >= 20 && u32(bytes, e - 20) === 0x07064b50) { // ZIP64
    const z = u64(bytes, e - 12);
    if (z + 56 <= n && u32(bytes, z) === 0x06064b50) {
      total = u64(bytes, z + 32);
      tamIndice = u64(bytes, z + 40);
      inicio = u64(bytes, z + 48);
      finIndice = z;
    }
  }
  // datos pegados delante del ZIP (autoextraíbles): todas las posiciones se desplazan lo mismo
  let desfase = 0;
  if (inicio + 4 > n || u32(bytes, inicio) !== 0x02014b50) {
    const real = finIndice - tamIndice;
    if (real >= 0 && real + 4 <= n && u32(bytes, real) === 0x02014b50) desfase = real - inicio;
    else if (total > 0) throw new ErrorZip('índice dañado');
  }
  if (total > 1000000) throw new ErrorZip('índice imposible');

  const entradas = [];
  let p = inicio + desfase;
  for (let k = 0; k < total; k++) {
    if (p + 46 > n || u32(bytes, p) !== 0x02014b50) throw new ErrorZip('índice dañado');
    const flags = u16(bytes, p + 8);
    const metodo = u16(bytes, p + 10);
    const crc = u32(bytes, p + 16);
    let comprimido = u32(bytes, p + 20);
    let tamano = u32(bytes, p + 24);
    const ln = u16(bytes, p + 28), le = u16(bytes, p + 30), lc = u16(bytes, p + 32);
    let local = u32(bytes, p + 42);
    if (p + 46 + ln + le > n) throw new ErrorZip('índice dañado');
    const crudo = bytes.subarray(p + 46, p + 46 + ln);
    let rutaUnicode = null;
    // campos extra: ZIP64 (0x0001) y nombre en Unicode de Info-ZIP (0x7075)
    for (let q = p + 46 + ln, fin = q + le; q + 4 <= fin;) {
      const id = u16(bytes, q), lon = u16(bytes, q + 2), d = q + 4;
      if (d + lon > fin) break;
      if (id === 0x0001) {
        let r = d;
        if (tamano === 0xffffffff && r + 8 <= d + lon) { tamano = u64(bytes, r); r += 8; }
        if (comprimido === 0xffffffff && r + 8 <= d + lon) { comprimido = u64(bytes, r); r += 8; }
        if (local === 0xffffffff && r + 8 <= d + lon) { local = u64(bytes, r); r += 8; }
      } else if (id === 0x7075 && lon >= 5 && bytes[d] === 1 && u32(bytes, d + 1) === crc32(crudo)) {
        rutaUnicode = UTF8.decode(bytes.subarray(d + 5, d + lon));
      }
      q = d + lon;
    }
    const ruta = limpiarRuta(rutaUnicode ?? nombreZip(crudo, (flags & 0x800) !== 0));
    entradas.push({ ruta, carpeta: ruta === '' || ruta.endsWith('/'), metodo, cifrado: (flags & 1) !== 0, crc, comprimido, tamano, local: local + desfase });
    p += 46 + ln + le + lc;
  }
  return entradas;
}

/** Bytes comprimidos de una entrada (tal cual están en el ZIP). */
function datosDe(bytes, entrada) {
  const p = entrada.local;
  if (p + 30 > bytes.length || u32(bytes, p) !== 0x04034b50) throw new ErrorZip('cabecera dañada');
  const ini = p + 30 + u16(bytes, p + 26) + u16(bytes, p + 28);
  const fin = ini + entrada.comprimido;
  if (fin > bytes.length) throw new ErrorZip('archivo cortado');
  return bytes.subarray(ini, fin);
}

/** Contenido de una entrada guardada sin comprimir (lo usa formato.js para el "mimetype" de ODS). */
export function datosGuardados(bytes, entrada) {
  if (entrada.metodo !== 0 || entrada.cifrado) return null;
  try { return datosDe(bytes, entrada); } catch { return null; }
}

/**
 * Descomprime una entrada con tope: nunca más de lo declarado, y comprueba el CRC.
 * @param {Uint8Array} bytes  el ZIP entero
 * @param {EntradaZip} entrada
 * @param {*} fflate          módulo fflate (solo hace falta si la entrada está comprimida)
 * @returns {Uint8Array}      copia independiente (se puede transferir sin tocar el ZIP)
 * @throws {ErrorZip}
 */
export function extraer(bytes, entrada, fflate) {
  const datos = datosDe(bytes, entrada);
  let salida;
  if (entrada.metodo === 0) {
    if (datos.length !== entrada.tamano) throw new ErrorZip('tamaño distinto del declarado');
    salida = datos.slice();
  } else if (entrada.metodo === 8) {
    salida = new Uint8Array(entrada.tamano);
    let usado = 0;
    if (datos.length) {
      const inflar = new fflate.Inflate((trozo) => {
        if (usado + trozo.length > salida.length) throw new ErrorZip('más grande de lo declarado');
        salida.set(trozo, usado);
        usado += trozo.length;
      });
      try {
        for (let i = 0; i < datos.length; i += TROZO) inflar.push(datos.subarray(i, i + TROZO), i + TROZO >= datos.length);
      } catch (e) {
        if (e instanceof ErrorZip) throw e;
        throw new ErrorZip('datos comprimidos dañados'); // fflate lanza con datos rotos
      }
    }
    if (usado !== salida.length) throw new ErrorZip('más pequeño de lo declarado');
  } else {
    throw new ErrorZip('método no admitido');
  }
  if (crc32(salida) !== entrada.crc) throw new ErrorZip('crc');
  return salida;
}

/**
 * Comprueba una entrada sin guardar lo descomprimido (por trozos: la memoria no crece con el tamaño):
 * que se pueda descomprimir, que no pase de lo declarado (exacto: que mida justo eso) y, si crc es true, su CRC.
 * @throws {ErrorZip}
 */
export function comprobar(bytes, entrada, fflate, { crc = true, exacto = true } = {}) {
  const datos = datosDe(bytes, entrada);
  let suma = -1, usado = 0;
  if (entrada.metodo === 0) {
    if (datos.length !== entrada.tamano) throw new ErrorZip('tamaño distinto del declarado');
    if (crc) suma = seguirCRC(suma, datos);
  } else if (entrada.metodo === 8) {
    if (datos.length) {
      const inflar = new fflate.Inflate((trozo) => {
        usado += trozo.length;
        if (usado > entrada.tamano) throw new ErrorZip('más grande de lo declarado');
        if (crc) suma = seguirCRC(suma, trozo);
      });
      try {
        for (let i = 0; i < datos.length; i += TROZO) inflar.push(datos.subarray(i, i + TROZO), i + TROZO >= datos.length);
      } catch (e) {
        if (e instanceof ErrorZip) throw e;
        throw new ErrorZip('datos comprimidos dañados');
      }
    }
    if (exacto && usado !== entrada.tamano) throw new ErrorZip('más pequeño de lo declarado');
  } else {
    throw new ErrorZip('método no admitido');
  }
  if (crc && ((suma ^ -1) >>> 0) !== entrada.crc) throw new ErrorZip('crc');
}

/** Carpetas, basura de macOS y Windows, y archivos ocultos: no se leen. */
export function esIgnorable(ruta) {
  if (!ruta || ruta.endsWith('/')) return true;
  const partes = ruta.split('/');
  if (partes.some((s) => s === '__MACOSX' || s.startsWith('.'))) return true; // .DS_Store, ._archivo, .ocultos
  const base = partes[partes.length - 1].toLowerCase();
  return base === 'thumbs.db' || base === 'desktop.ini';
}

/** Nivel de ZIP según el nombre ("a.zip/b.zip" → 2), por si el contexto no lo trae. */
function nivelPorNombre(nombre) {
  return Math.max(1, String(nombre).split('/').filter((s) => /\.zip$/i.test(s)).length);
}

/**
 * Lee un ZIP: cada archivo de dentro pasa por ctx.leerArchivo y el resultado se aplana.
 * La entrada que se pasa a ctx.leerArchivo lleva `zip: {nivel, presupuesto}`: el worker debe pasarla tal cual al lector,
 * así un ZIP dentro de otro conoce su nivel y comparte el mismo presupuesto de archivos y bytes.
 * @param {{nombre: string, bytes: Uint8Array, zip?: {nivel: number, presupuesto: {archivos: number, bytes: number}}}} entrada
 * @param {*} ctx  contrato de lectores (usa idArchivo, cargar y leerArchivo)
 * @returns {Promise<import('../nucleo/modelo.js').LecturaArchivo[]|import('../nucleo/modelo.js').LecturaArchivo>}
 */
export async function leer(entrada, ctx) {
  if (!ctx || typeof ctx.leerArchivo !== 'function') throw new Error('zip.js necesita ctx.leerArchivo');
  const nombre = entrada.nombre;
  const bytes = entrada.bytes instanceof Uint8Array ? entrada.bytes : new Uint8Array(entrada.bytes);
  const padre = entrada.zip ?? null;
  const nivel = Math.max((padre?.nivel ?? 0) + 1, nivelPorNombre(nombre));
  if (nivel > LIMITES_ZIP.niveles || nombre.length > 2000) return lecturaConError(nombre, 'zip', 'zip_anidado', { archivo: nombre });
  const presupuesto = padre?.presupuesto ?? { archivos: LIMITES_ZIP.archivos, bytes: LIMITES_ZIP.total };

  let entradas;
  try {
    entradas = listarZip(bytes);
  } catch (e) {
    if (e instanceof ErrorZip) return lecturaConError(nombre, 'zip', 'danado', { archivo: nombre });
    throw e;
  }
  const utiles = entradas.filter((en) => !en.carpeta && !esIgnorable(en.ruta));
  if (!utiles.length) return lecturaConError(nombre, 'zip', 'vacio', { archivo: nombre });
  if (utiles.length > presupuesto.archivos) {
    return lecturaConError(nombre, 'zip', 'zip_demasiados_archivos', { archivo: nombre, max: LIMITES_ZIP.archivos });
  }

  // 1. tamaños declarados, antes de descomprimir nada
  const problema = (en) => {
    if (en.cifrado) return 'zip_con_contrasena';
    if (en.metodo !== 0 && en.metodo !== 8) return 'zip_no_compatible';
    if (en.tamano > LIMITES_ZIP.porArchivo) return 'grande';
    if (en.tamano === 0) return 'vacio';
    return null;
  };
  const problemas = utiles.map(problema);
  let total = 0, cuantos = 0;
  utiles.forEach((en, k) => { if (!problemas[k]) { total += en.tamano; cuantos++; } });
  if (total > presupuesto.bytes) return lecturaConError(nombre, 'zip', 'zip_demasiado_grande', { archivo: nombre });
  presupuesto.archivos -= cuantos;
  presupuesto.bytes -= total;

  // 2. de uno en uno y en el orden del ZIP: descomprimir con tope, comprobar y leer (solo un archivo abierto a la vez)
  const lecturas = [];
  let fflate = null;
  for (let k = 0; k < utiles.length; k++) {
    const en = utiles[k];
    const interno = `${nombre}/${en.ruta}`;
    if (problemas[k]) { lecturas.push(lecturaConError(interno, 'zip', problemas[k], { archivo: interno })); continue; }
    if (en.metodo === 8 && !fflate) {
      try {
        fflate = await ctx.cargar('fflate');
      } catch {
        lecturas.push(lecturaConError(nombre, 'zip', 'necesita_conexion', { archivo: nombre })); // sin la librería no se puede seguir
        break;
      }
    }
    let contenido;
    try {
      contenido = extraer(bytes, en, fflate);
    } catch (e) {
      if (e instanceof ErrorZip) { lecturas.push(lecturaConError(interno, 'zip', 'danado', { archivo: interno })); continue; }
      throw e;
    }
    const leidas = await ctx.leerArchivo({ nombre: interno, bytes: contenido, zip: { nivel, presupuesto } }, `${ctx.idArchivo}.${k + 1}`);
    if (Array.isArray(leidas)) lecturas.push(...leidas);
    else if (leidas) lecturas.push(leidas);
  }
  return lecturas;
}
