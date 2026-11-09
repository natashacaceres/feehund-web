// Reconoce el formato de un archivo: primero por sus bytes y después por su nombre.
// También guarda las utilidades que comparten los lectores de nivel A (Norma 43, OFX, QIF, camt.053, MT940).
// Lógica pura: sin DOM ni red. Para mirar el contenido solo usa los primeros 64 KB: coste fijo aunque el archivo sea grande.

import { decodificar, normalizar } from '../nucleo/texto.js';
import { pareceImporte } from '../nucleo/numeros.js';
import { parseFechaParcial } from '../nucleo/fechas.js';
import { aviso } from '../nucleo/modelo.js';
import { listarZip, datosGuardados } from './zip.js';

/** Límite por archivo del encargo. */
export const LIMITE_ARCHIVO = 10 * 1024 * 1024;

const NIVEL = {
  xlsx: 'A', xls: 'A', ods: 'A', numbers: 'A', csv: 'A', tsv: 'A', txt: 'A', html: 'A',
  norma43: 'A', ofx: 'A', qif: 'A', camt053: 'A', mt940: 'A', pdf: 'B', imagen: 'C',
};
const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic' };
const CABEZA = 65536; // lo que se mira del contenido
const MARCAS_HEIC = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);
const EXT_N43 = new Set(['n43', 'q43', 'aeb', 'c43', 'csb', 'csb43', 'aeb43']);

function resultado(formato, extra = {}) {
  return { formato, nivel: NIVEL[formato] ?? null, ...extra };
}

/** "Extracto.Enero.N43" → "n43". */
export function extensionDe(nombre) {
  const base = String(nombre ?? '').split('/').pop();
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1).toLowerCase() : '';
}

/**
 * Reconoce el formato.
 * @param {{nombre?: string, bytes?: Uint8Array|ArrayBuffer, texto?: string, codificacion?: string}} entrada
 *   Con solo `texto` (texto pegado) se miran directamente los formatos de texto.
 * @returns {{formato: string, nivel: 'A'|'B'|'C'|null, extension: string, tamano: number,
 *            texto?: string, codificacion?: string, separador?: string|null, variante?: string,
 *            imagen?: 'png'|'jpeg'|'webp'|'heic', mime?: string}}
 *   formato: xlsx | xls | ods | numbers | zip | pdf | imagen | ofx | qif | camt053 | mt940 | norma43 | html | csv | tsv | txt
 *            | vacio | grande | desconocido.
 *   En los de texto va `texto` ya decodificado (el lector no tiene que volver a hacerlo).
 *   `separador` es una pista para csv.js (';', ',', '\t', '|'); en 'txt' con columnas alineadas por espacios es null.
 *   En imágenes, `imagen` dice cuál es y `mime` su tipo.
 */
export function detectarFormato(entrada = {}) {
  const extension = extensionDe(entrada.nombre);
  let bytes = entrada.bytes ?? null;
  if (bytes && !(bytes instanceof Uint8Array)) {
    bytes = ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes);
  }
  if (!bytes) {
    const t = typeof entrada.texto === 'string' ? entrada.texto : '';
    if (t.length > LIMITE_ARCHIVO) return resultado('grande', { extension, tamano: t.length });
    return deTexto(t, entrada.codificacion ?? 'texto', extension, t.length);
  }
  const tamano = bytes.length;
  if (tamano === 0) return resultado('vacio', { extension, tamano });
  if (tamano > LIMITE_ARCHIVO) return resultado('grande', { extension, tamano });
  const firma = porFirma(bytes, extension);
  if (firma) return { ...firma, extension, tamano };
  if (typeof entrada.texto === 'string') return deTexto(entrada.texto, entrada.codificacion ?? 'utf-8', extension, tamano);
  // relleno de ceros o Ctrl-Z al final (programas antiguos): no cuenta para decidir si es binario
  let fin = tamano;
  while (fin > 0 && (bytes[fin - 1] === 0 || bytes[fin - 1] === 0x1a)) fin--;
  if (!fin) return resultado('vacio', { extension, tamano });
  if (pareceBinario(bytes.subarray(0, fin))) return resultado('desconocido', { extension, tamano });
  const { texto, codificacion } = decodificar(bytes, pistaNorma43(bytes) ? { pista: 'norma43' } : {});
  return deTexto(texto, codificacion, extension, tamano);
}

function ascii(b, i, n) {
  let s = '';
  for (let k = i; k < i + n && k < b.length; k++) s += String.fromCharCode(b[k]);
  return s;
}

function u32be(b, i) {
  return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
}

function imagen(tipo) {
  return resultado('imagen', { imagen: tipo, mime: MIME[tipo] });
}

/** Formatos binarios por su firma. null si no es ninguno. */
function porFirma(b, ext) {
  const n = b.length;
  if (n >= 4 && b[0] === 0x50 && b[1] === 0x4b && ((b[2] === 3 && b[3] === 4) || (b[2] === 5 && b[3] === 6) || (b[2] === 7 && b[3] === 8))) {
    return resultado(tipoDeZip(b, ext));
  }
  if (n >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 && b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1) {
    // OLE2: Excel antiguo. Word, PowerPoint u Outlook usan el mismo envoltorio
    return resultado(['doc', 'dot', 'ppt', 'pps', 'pot', 'msg', 'vsd', 'pub'].includes(ext) ? 'desconocido' : 'xls');
  }
  if (n >= 4 && b[0] === 0x09 && (b[1] === 0x00 || b[1] === 0x02 || b[1] === 0x04) && (b[2] === 0x04 || b[2] === 0x06) && b[3] === 0x00) {
    return resultado('xls'); // BIFF2–4 sin envoltorio
  }
  for (let i = 0, lim = Math.min(n, 1024) - 5; i <= lim; i++) {
    if (b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46 && b[i + 4] === 0x2d) return resultado('pdf'); // %PDF-
  }
  if (n >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return imagen('png');
  if (n >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return imagen('jpeg');
  if (n >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return imagen('webp');
  if (n >= 12 && ascii(b, 4, 4) === 'ftyp') {
    const mayor = ascii(b, 8, 4);
    const fin = Math.min(n, Math.max(16, u32be(b, 0)), 256);
    const compatibles = [];
    for (let i = 16; i + 4 <= fin; i += 4) compatibles.push(ascii(b, i, 4));
    const avif = mayor === 'avif' || mayor === 'avis' || compatibles.includes('avif') || compatibles.includes('avis');
    if (MARCAS_HEIC.has(mayor) && !avif) return imagen('heic');
    return resultado('desconocido'); // AVIF, vídeo…
  }
  return null;
}

/** Dentro del ZIP: xlsx, ods y numbers son ZIP con una estructura conocida. */
function tipoDeZip(b, ext) {
  let entradas;
  try {
    entradas = listarZip(b);
  } catch {
    // índice roto: la extensión manda; si no dice nada, zip.js explicará que está dañado
    if (['xlsx', 'xlsm', 'xlsb'].includes(ext)) return 'xlsx';
    if (ext === 'ods' || ext === 'numbers') return ext;
    return 'zip';
  }
  const rutas = entradas.map((e) => e.ruta);
  if (rutas.includes('[Content_Types].xml')) return rutas.some((r) => r.startsWith('xl/')) ? 'xlsx' : 'desconocido'; // docx, pptx…
  const mt = entradas.find((e) => e.ruta === 'mimetype');
  if (mt) {
    const datos = datosGuardados(b, mt);
    const tipo = datos ? ascii(datos, 0, 80) : '';
    if (tipo.startsWith('application/vnd.oasis.opendocument.spreadsheet')) return 'ods';
    if (tipo.startsWith('application/vnd.oasis.opendocument')) return 'desconocido'; // texto o presentación
    if (ext === 'ods') return 'ods';
  }
  if (rutas.some((r) => /(?:^|\/)Index\/[^/]+\.iwa$/.test(r) || r === 'Index.zip' || r.endsWith('.numbers/Index.zip'))) return 'numbers';
  return 'zip';
}

/** Bytes que no son texto (ni UTF-16): ceros sueltos o muchos caracteres de control. */
function pareceBinario(b) {
  const n = Math.min(b.length, 4096);
  if (n >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))) return false;
  let ceroPar = 0, ceroImpar = 0, control = 0;
  for (let i = 0; i < n; i++) {
    const c = b[i];
    if (c === 0) { if (i % 2) ceroImpar++; else ceroPar++; } else if (c < 0x09 || (c > 0x0d && c < 0x20 && c !== 0x1a && c !== 0x1b)) control++;
  }
  const ceros = ceroPar + ceroImpar;
  if (ceros > Math.max(4, n * 0.02)) {
    const utf16 = n > 8 && ((ceroImpar > n * 0.3 && ceroPar < n * 0.05) || (ceroPar > n * 0.3 && ceroImpar < n * 0.05));
    return !utf16;
  }
  return control + ceros > n * 0.05;
}

const CODIGOS_N43 = new Set(['11', '22', '23', '24', '33', '88']);

/** ¿Las líneas empiezan por 11, 22, 23, 24, 33 u 88? Decide la pista de codificación (cp850) antes de decodificar. */
function pistaNorma43(b) {
  const lim = Math.min(b.length, CABEZA);
  let lineas = 0, buenas = 0, i = 0;
  while (i < lim && lineas < 40) {
    while (i < lim && (b[i] === 10 || b[i] === 13)) i++;
    if (i + 2 > lim) break;
    let j = i;
    while (j < lim && b[j] !== 10 && b[j] !== 13) j++;
    const paso = j - i > 160 ? 80 : j - i + 1; // registros pegados sin saltos: uno cada 80
    for (let k = i; k + 2 <= j && lineas < 40; k += paso) {
      lineas++;
      if (CODIGOS_N43.has(String.fromCharCode(b[k], b[k + 1]))) buenas++;
    }
    i = j;
  }
  return lineas > 0 && buenas >= lineas * 0.7;
}

function deTexto(texto, codificacion, ext, tamano) {
  const t = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  if (!t.trim()) return resultado('vacio', { extension: ext, tamano });
  const con = (formato, extra) => resultado(formato, { extension: ext, tamano, texto: t, codificacion, ...extra });
  const cabeza = t.slice(0, CABEZA);
  const inicio = cabeza.trimStart().slice(0, 4096);

  if (/OFXHEADER\s*[:=]/i.test(inicio) || /<OFX[\s>]/i.test(cabeza)) return con('ofx');
  if (/^!(?:Type|Account|Option|Clear)\b/i.test(inicio)) return con('qif');
  if (/urn:iso:std:iso:20022:tech:xsd:camt\.05[234]/.test(cabeza) || /<(?:[\w.-]+:)?BkToCstmr(?:Stmt|AcctRpt|DbtCdtNtfctn)[\s>]/.test(cabeza)) return con('camt053');
  if (esMT940(cabeza)) return con('mt940');
  if (probarNorma43(cabeza, ext)) return con('norma43');
  if (/^<\?xml/i.test(inicio) && /urn:schemas-microsoft-com:office:spreadsheet/i.test(cabeza.slice(0, 16384))) return con('xls', { variante: 'xml2003' });
  if (inicio.startsWith('<') && /<(?:html|table|body|!doctype\s+html)\b/i.test(cabeza)) return con('html');

  const separador = separadorDe(cabeza);
  if (separador) return con(ext === 'txt' ? 'txt' : separador === '\t' ? 'tsv' : 'csv', { separador });
  if (tablaConEspacios(cabeza)) return con('txt', { separador: null });

  // contenido poco claro: la extensión decide solo si el contenido la apoya
  if ((ext === 'ofx' || ext === 'qfx') && /<STMTTRN>/i.test(cabeza)) return con('ofx');
  if (ext === 'qif' && /^\^\s*$/m.test(cabeza) && /^D\S/m.test(cabeza)) return con('qif');
  if (['sta', 'mt940', '940', 'swi'].includes(ext) && /(?:^|[\r\n]):61:/.test(cabeza)) return con('mt940');
  return con('desconocido');
}

function esMT940(cabeza) {
  if (/\{1:F0\d/.test(cabeza.slice(0, 4096)) && /:20:/.test(cabeza)) return true;
  return /(?:^|[\r\n{]):20:/.test(cabeza) && /(?:^|[\r\n]):60[FM]:/.test(cabeza);
}

/** Registros pegados sin saltos de línea: trozos de 80. */
export function trocearRegistros(linea) {
  const trozos = [];
  for (let k = 0; k < linea.length; k += 80) trozos.push(linea.slice(k, k + 80));
  return trozos;
}

function probarNorma43(cabeza, ext) {
  const lineas = cabeza.split(/\r\n|\n|\r/);
  let total = 0, validas = 0, cuenta = false;
  for (const l0 of lineas) {
    const l = l0.replace(/[\s\u0000\u001a]+$/, '');
    if (!l) continue;
    // más de 80: registros pegados o un registro con algo de más detrás (como en norma43.js)
    const trozos = l.length <= 80 ? [l] : l.length < 160 && registroNorma43(l.slice(0, 80)) ? [l.slice(0, 80)] : trocearRegistros(l);
    for (const r of trozos) {
      total++;
      const tipo = registroNorma43(r);
      if (tipo) { validas++; if (tipo === '11' || tipo === '22') cuenta = true; }
      if (total >= 200) break;
    }
    if (total >= 200) break;
  }
  return cuenta && validas >= total * (EXT_N43.has(ext) ? 0.5 : 0.8);
}

/** Separador de columnas que da el mismo número de campos en más líneas (las comillas se respetan). */
function separadorDe(cabeza) {
  const lineas = cabeza.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 60);
  if (!lineas.length) return null;
  // si todas las comas son decimales ("-12,99") no separan columnas: es texto alineado con importes españoles
  const muestra = lineas.join('\n');
  const comas = (muestra.match(/,/g) || []).length;
  const soloDecimales = comas > 0 && (muestra.match(/\d,\d\d(?!\d)/g) || []).length === comas;
  let mejor = null;
  for (const sep of [';', '\t', ',', '|']) {
    if (sep === ',' && soloDecimales) continue;
    const veces = new Map();
    for (const l of lineas) {
      const c = contarCampos(l, sep);
      if (c >= 2) veces.set(c, (veces.get(c) || 0) + 1);
    }
    let moda = 0, cuantas = 0;
    for (const [c, v] of veces) if (v > cuantas || (v === cuantas && c > moda)) { moda = c; cuantas = v; }
    if (!moda) continue;
    if (!mejor || cuantas > mejor.cuantas) mejor = { sep, cuantas };
  }
  if (!mejor) return null;
  return mejor.cuantas >= Math.min(2, lineas.length) && mejor.cuantas >= lineas.length * 0.5 ? mejor.sep : null;
}

function contarCampos(linea, sep) {
  let campos = 1, comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') comillas = !comillas;
    else if (c === sep && !comillas) campos++;
  }
  return campos;
}

/** Texto con columnas alineadas por espacios: líneas con una fecha y un importe. */
function tablaConEspacios(cabeza) {
  const lineas = cabeza.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 80);
  let filas = 0;
  for (const l of lineas) {
    const t = l.trim().split(/\s+/);
    if (t.length < 2 || t.length > 40) continue;
    let fecha = false, importe = false;
    for (let i = 0; i < t.length; i++) {
      if (!fecha && (parseFechaParcial(t[i]) || (i + 1 < t.length && parseFechaParcial(`${t[i]} ${t[i + 1]}`)))) fecha = true;
      else if (!importe && pareceImporte(t[i])) importe = true;
    }
    if (fecha && importe) filas++;
  }
  return filas >= 3 || (filas >= 1 && filas >= lineas.length * 0.5);
}

// ---------------------------------------------------------------------------------------------
// Utilidades de los lectores de nivel A

// Norma 43: forma de cada registro (posiciones de la AEB, desde 0). Solo se comprueban los campos fijos.
const RE_N43 = {
  11: /^11\d{30}.\d{14}/,             // entidad, oficina, cuenta, fechas, D/H y saldo inicial
  22: /^22.{8}\d{14}.{3}[12]\d{14}/,  // libre y oficina, 2 fechas y concepto común, concepto propio, D/H, importe
  23: /^23\d{2}/,                     // código de dato y texto
  24: /^24\d{2}.{3}\d{14}/,           // equivalencia: divisa e importe
  33: /^33\d{56}.\d{14}/,             // cuenta, apuntes y totales de debe y haber, D/H y saldo final
  88: /^88[\d ]{18}/,                 // fin de fichero
};

/** Tipo de registro Norma 43 ('11', '22', '23', '24', '33', '88') si la línea (hasta 80 caracteres) tiene su forma; si no, null. */
export function registroNorma43(linea) {
  if (typeof linea !== 'string' || linea.length < 2 || linea.length > 80) return null;
  const tipo = linea.slice(0, 2);
  const re = RE_N43[tipo];
  return re && re.test(linea.padEnd(80, ' ')) ? tipo : null;
}

/** Parte un texto en líneas (CRLF, LF o CR). */
export function partirLineas(texto) {
  return texto.split(/\r\n|\n|\r/);
}

/**
 * Une trozos de concepto con " · " sin repetir: si uno ya está dentro de otro, queda el más largo.
 * unirConceptos(['NETFLIX', 'NETFLIX.COM MADRID']) → 'NETFLIX.COM MADRID'
 */
export function unirConceptos(partes) {
  const elegidas = [];
  for (const p of partes) {
    if (p === null || p === undefined) continue;
    const texto = String(p).replace(/\s+/g, ' ').trim();
    const clave = normalizar(texto).replace(/[^A-Z0-9]+/g, ' ').trim();
    if (!clave) continue;
    if (elegidas.some((e) => e.clave.includes(clave))) continue;
    const dentro = elegidas.findIndex((e) => clave.includes(e.clave));
    if (dentro >= 0) {
      elegidas[dentro] = { texto, clave };
      for (let i = elegidas.length - 1; i > dentro; i--) if (clave.includes(elegidas[i].clave)) elegidas.splice(i, 1);
    } else {
      elegidas.push({ texto, clave });
    }
  }
  return elegidas.map((e) => e.texto).join(' · ');
}

// ——— Texto cortado a un ancho fijo: registros 23 de Norma 43 (campos de 38) y líneas del :86: de MT940 (65) ———
// Cuando un trozo llega al final de su ancho y el siguiente empieza pegado, no se sabe si es una palabra partida
// («NETFLI» + «X.COM») o dos datos distintos («GOOGLE ONE» + «1234»). Se decide así, de la pista más fuerte a la más débil:
//  1. El propio archivo: si la palabra unida aparece entera en otro sitio del archivo, se une.
//  2. La costumbre del banco en este archivo (hacen falta al menos 4 empalmes para saberla):
//     - «corrido»: casi todos los trozos llegan al final y alguno sigue con un espacio delante. Es un texto largo cortado
//       a ese ancho sin tocar los espacios: si no hay espacio en el corte, tampoco lo había en el texto. Se une.
//     - «campos»: casi ningún trozo llega al final (un dato por campo o por línea). Se separa.
//  3. Si una de las dos partes (de 4 letras o más) aparece como palabra suelta en el archivo y la unida no, se separa.
//  4. Sin pistas, por los caracteres del corte: letra con letra o cifra con cifra se une (palabra o número partido);
//     letra con cifra, cifra con letra o un signo de puntuación se separa («ONE» + «1234»).
const PEGAN = new Set(['*', '/', '-', '_', '&', '@', '#', '+', "'"]);
const DOMINIO = /^(?:COM|ES|NET|ORG|EU|CAT|IO|CO|UK|DE|FR|IT|NL|PT)(?![\p{L}\p{N}])/iu;
const esLetra = (c) => /\p{L}/u.test(c);
const esCifra = (c) => c >= '0' && c <= '9';
const palabraLimpia = (p) => p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toUpperCase();
const conTexto = (t) => typeof t === 'string' && t.trim() !== '';

/** Pistas vacías: solo cuentan los caracteres del corte. */
export const SIN_PISTAS = Object.freeze({ palabras: new Set(), costumbre: null });

/**
 * Palabras enteras del archivo y costumbre del banco al cortar el texto.
 * @param {string[][]} listas trozos de cada movimiento, en orden
 * @param {(trozo: string, indice: number) => boolean} lleno ¿el trozo llega al final de su ancho con una letra o cifra?
 * @returns {{palabras: Set<string>, costumbre: 'corrido'|'campos'|null}}
 */
export function pistasDeCortes(listas, lleno) {
  const palabras = new Set();
  let empalmes = 0, llenos = 0, conEspacio = 0;
  for (const trozos of listas) {
    for (let k = 0; k < trozos.length; k++) {
      const c = trozos[k];
      if (!conTexto(c)) continue;
      const ant = k > 0 && conTexto(trozos[k - 1]) ? trozos[k - 1] : null;
      const sig = k + 1 < trozos.length && conTexto(trozos[k + 1]) ? trozos[k + 1] : null;
      if (ant !== null) {
        empalmes++;
        if (lleno(ant, k - 1)) llenos++;
        if (/^\s/.test(c)) conEspacio++;
      }
      // una palabra que toca un corte pegado puede ser media palabra: no cuenta como entera
      const pegadaDelante = ant !== null && lleno(ant, k - 1) && !/^\s/.test(c);
      const pegadaDetras = sig !== null && lleno(c, k) && !/^\s/.test(sig);
      const partes = c.trim().split(/\s+/);
      for (let i = 0; i < partes.length; i++) {
        if ((i === 0 && pegadaDelante) || (i === partes.length - 1 && pegadaDetras)) continue;
        const p = palabraLimpia(partes[i]);
        if (p) palabras.add(p);
      }
    }
  }
  let costumbre = null;
  if (empalmes >= 4) {
    if (llenos <= empalmes * 0.3) costumbre = 'campos';
    else if (llenos >= empalmes * 0.6 && conEspacio > 0) costumbre = 'corrido';
  }
  return { palabras, costumbre };
}

/**
 * Qué va entre dos trozos seguidos: '' si el corte parte una palabra, ' ' si separa dos datos (reglas de arriba).
 * @param {string} a trozo anterior   @param {string} b trozo siguiente   @param {boolean} aLleno ¿a llega al final de su ancho?
 */
export function empalmeDeCorte(a, b, aLleno, pistas = SIN_PISTAS) {
  if (!aLleno || /\s$/.test(a) || /^\s/.test(b)) return ' ';
  const cola = a.split(/\s+/).pop(), cabeza = b.split(/\s+/)[0];
  const unida = palabraLimpia(cola + cabeza);
  if (unida && pistas.palabras.has(unida)) return '';
  if (pistas.costumbre === 'corrido') return '';
  if (pistas.costumbre === 'campos') return ' ';
  const suelta = (p) => { const x = palabraLimpia(p); return x.length >= 4 && pistas.palabras.has(x); };
  if (suelta(cola) || suelta(cabeza)) return ' ';
  const x = a[a.length - 1], y = b[0];
  if (esLetra(x) && esLetra(y)) return x !== x.toUpperCase() && y !== y.toLowerCase() ? ' ' : ''; // «netflix» + «Madrid» van separadas
  if (esCifra(x) && esCifra(y)) return '';
  if (PEGAN.has(x) || PEGAN.has(y) || y === '.') return '';
  if (x === '.' && DOMINIO.test(b)) return ''; // «NETFLIX.» + «COM»
  return ' ';
}

// Bancos por su código de entidad (los 4 primeros dígitos de la cuenta española). Los nombres son los de bancos.json.
const ENTIDADES_ES = {
  2100: 'caixabank', // también imagin, que usa la misma entidad
  '0049': 'santander',
  '0182': 'bbva',
  1465: 'ing',
  '0081': 'sabadell',
  2080: 'abanca',
  '0128': 'bankinter',
  '0073': 'openbank',
  2103: 'unicaja',
  2095: 'kutxabank',
  2085: 'ibercaja',
  3058: 'cajamar',
  1544: 'myinvestor', // Andbank España, por verificar con un archivo real
};

/**
 * Banco a partir de la entidad (Norma 43) o del IBAN. null si no se sabe: nunca se adivina.
 * @param {{entidad?: string, iban?: string}} cuenta
 */
export function perfilPorCuenta({ entidad, iban } = {}) {
  if (entidad && ENTIDADES_ES[entidad]) return ENTIDADES_ES[entidad];
  const s = String(iban ?? '').replace(/\s+/g, '').toUpperCase();
  if (/^ES\d{6}/.test(s)) return ENTIDADES_ES[s.slice(4, 8)] ?? null;
  if (/^NL\d{2}BUNQ/.test(s)) return 'bunq';
  if (/^LT\d{2}3250/.test(s)) return 'revolut';
  if (/^DE\d{2}10011001/.test(s)) return 'n26';
  if (/^BE\d{2}967/.test(s)) return 'wise';
  return null;
}

/** 1234.5 → "1234,50 €" (para los datos de los avisos). */
export function formatearImporte(n, divisa = 'EUR', idioma = 'es') {
  const loc = idioma === 'en' ? 'en-GB' : idioma === 'ca' ? 'ca-ES' : 'es-ES';
  try {
    return new Intl.NumberFormat(loc, { style: 'currency', currency: divisa }).format(n);
  } catch {
    return `${n.toFixed(2)} ${divisa}`;
  }
}

/** "2026-03-02" → "02/03/2026". */
export function formatearFecha(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** Aviso con número: si es 1 usa el código en singular (codigo + sufijo), como hacen los textos de validación. */
export function avisoContado(codigo, n, datos = {}, sufijo = '_uno') {
  return n === 1 ? aviso(codigo + sufijo, datos) : aviso(codigo, { ...datos, n });
}

/** Aviso de líneas saltadas, con sus números (los 8 primeros en el texto; hasta 50 en `filas` para la interfaz). */
export function avisoLineas(archivo, lineas) {
  const lista = lineas.slice(0, 8).join(', ') + (lineas.length > 8 ? '…' : '');
  return avisoContado('formato_lineas_saltadas', lineas.length, { archivo, lineas: lista, filas: lineas.slice(0, 50) }, '_una');
}
