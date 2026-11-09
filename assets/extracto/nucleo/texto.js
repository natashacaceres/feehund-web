// Texto: decodificar bytes (BOM, UTF-8, windows-1252, cp850) y normalizar para comparar.

// IBM850 (MS-DOS Latin-1), bytes 0x80–0xFF. Lo usan muchos ficheros Norma 43.
const CP850 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ';

const BUENAS = new Set('ÁÉÍÓÚÜÑÇÀÈÒÏáéíóúüñçàèòïºª·€¿¡'.split(''));
const RARAS = /[\u0080-\u009F─-◿�]|Ã[\u0080-¿]|Â[\u0080-¿]/g;

// Tabla de los 256 códigos (los primeros 128 son ASCII), para decodificar por trozos sin ir carácter a carácter.
let TABLA_CP850 = null;
function tablaCP850() {
  if (!TABLA_CP850) {
    TABLA_CP850 = new Uint16Array(256);
    for (let b = 0; b < 256; b++) TABLA_CP850[b] = b < 0x80 ? b : CP850.charCodeAt(b - 0x80);
  }
  return TABLA_CP850;
}

export function decodificarCP850(bytes) {
  const tabla = tablaCP850();
  const TROZO = 32768; // por debajo del límite de argumentos de fromCharCode.apply en todos los navegadores
  const partes = [];
  const codigos = new Uint16Array(Math.min(bytes.length, TROZO));
  for (let ini = 0; ini < bytes.length; ini += TROZO) {
    const n = Math.min(TROZO, bytes.length - ini);
    for (let i = 0; i < n; i++) codigos[i] = tabla[bytes[ini + i]];
    partes.push(String.fromCharCode.apply(null, n === codigos.length ? codigos : codigos.subarray(0, n)));
  }
  return partes.join('');
}

function puntuar(texto) {
  let buenas = 0;
  for (const ch of texto) if (BUENAS.has(ch)) buenas++;
  const raras = (texto.match(RARAS) || []).length;
  return buenas - raras * 3;
}

/**
 * Bytes → texto, eligiendo la codificación.
 * @param {Uint8Array} bytes
 * @param {{pista?: 'norma43'}} [opciones]
 * @returns {{texto: string, codificacion: string}}
 */
export function decodificar(bytes, opciones = {}) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { texto: new TextDecoder('utf-8').decode(bytes.subarray(3)), codificacion: 'utf-8' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { texto: new TextDecoder('utf-16le').decode(bytes.subarray(2)), codificacion: 'utf-16le' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { texto: new TextDecoder('utf-16be').decode(bytes.subarray(2)), codificacion: 'utf-16be' };
  }
  // UTF-16 sin BOM: muchos ceros en posiciones alternas
  const muestra = bytes.subarray(0, Math.min(bytes.length, 4000));
  let cerosPar = 0, cerosImpar = 0;
  for (let i = 0; i < muestra.length; i++) if (muestra[i] === 0) (i % 2 ? cerosImpar++ : cerosPar++);
  if (muestra.length > 8 && cerosImpar > muestra.length * 0.3 && cerosPar < muestra.length * 0.05) {
    return { texto: new TextDecoder('utf-16le').decode(bytes), codificacion: 'utf-16le' };
  }
  if (muestra.length > 8 && cerosPar > muestra.length * 0.3 && cerosImpar < muestra.length * 0.05) {
    return { texto: new TextDecoder('utf-16be').decode(bytes), codificacion: 'utf-16be' };
  }
  try {
    const t = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!t.includes('�')) return { texto: t, codificacion: 'utf-8' };
  } catch { /* no es UTF-8: probamos las de un byte */ }

  // Se puntúa con los primeros 64 KB; si ahí no hay ninguna letra que decida, con todo el archivo.
  const elegirCP850 = (trozo) => {
    const pw = puntuar(new TextDecoder('windows-1252').decode(trozo)), pc = puntuar(decodificarCP850(trozo));
    if (pc === pw && pc === 0 && trozo.length < bytes.length) return null;
    return pc > pw || (pc === pw && opciones.pista === 'norma43');
  };
  const cp850 = elegirCP850(bytes.subarray(0, 65536)) ?? elegirCP850(bytes);
  if (cp850) return { texto: decodificarCP850(bytes), codificacion: 'cp850' };
  return { texto: new TextDecoder('windows-1252').decode(bytes), codificacion: 'windows-1252' };
}

/** Quita tildes y diéresis (Ñ → N, Ç → C). */
export function quitarAcentos(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

// Letras de ancho completo («Ｎｅｔｆｌｉｘ») y alfanuméricos matemáticos («𝐍𝐞𝐭𝐟𝐥𝐢𝐱») → letras normales. No se aplica NFKC a
// todo el texto porque cambiaría «Nº» por «NO» y «1ª» por «1A», que los patrones de los conceptos esperan tal cual.
const ANCHO_COMPLETO = /[\uFF01-\uFF5E]/g;
const MATEMATICAS = /[\u{1D400}-\u{1D7FF}]/gu;
function letrasCompatibles(t) {
  if (!/[\uFF01-\uFF5E\uD835]/.test(t)) return t;
  return t.replace(ANCHO_COMPLETO, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(MATEMATICAS, (c) => c.normalize('NFKC'));
}

/** Mayúsculas, sin acentos y con un solo espacio. */
export function normalizar(s) {
  if (s === null || s === undefined) return '';
  return quitarAcentos(letrasCompatibles(String(s))).toUpperCase().replace(/[   \t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Para cabeceras de columna: normaliza y quita símbolos ("IMPORTE (€)" → "IMPORTE EUR"). */
export function normalizarCabecera(s) {
  return normalizar(s).replace(/€/g, ' EUR ').replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Primeros n caracteres con puntos suspensivos (para mensajes). */
export function recortar(s, n = 60) {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

/** Ignora mayúsculas y acentos al comparar. */
export function iguales(a, b) {
  return normalizar(a) === normalizar(b);
}
