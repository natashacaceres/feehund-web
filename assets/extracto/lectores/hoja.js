// Hojas de cálculo: xlsx, xlsm, xlsb, xls (BIFF2–8), ods, numbers, y los «xls» que en realidad son HTML o XML 2003.
// SheetJS se carga solo cuando llega uno de estos archivos. Los «xls» que son texto (CSV con otro nombre) van a csv.js.

import { crearLectura, lecturaConError, aviso } from '../nucleo/modelo.js';
import { decodificar } from '../nucleo/texto.js';
import { serialExcelAISO } from '../nucleo/fechas.js';
import { deTablaAMovimientos, MAX_FILAS } from '../nucleo/tabla.js';
import { esFechaCelda } from '../nucleo/cabeceras.js';
import { leer as leerCSV } from './csv.js';
import { listarZip, comprobar, ErrorZip } from './zip.js';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_HOJAS = 50;
// Lo que puede ocupar un libro ya abierto: un xlsx de 10 MB con 100 000 filas no llega a 200 MB
const MAX_DESCOMPRIMIDO = 300 * 1024 * 1024;

function empiezaPor(bytes, texto) {
  if (bytes.length < texto.length) return false;
  for (let i = 0; i < texto.length; i++) if (bytes[i] !== texto.charCodeAt(i)) return false;
  return true;
}

/**
 * Qué hay de verdad dentro, por los primeros bytes (el nombre del archivo puede mentir).
 * @returns {'zip'|'cfb'|'biff'|'html'|'xml'|'fods'|'sylk'|'texto'|'binario'}
 */
export function tipoContenido(bytes) {
  const b = bytes;
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] < 0x09 && b[3] < 0x09) return 'zip';
  if (b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 && b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1) return 'cfb';
  if (b.length >= 4 && b[0] === 0x09 && b[1] <= 0x08) return 'biff'; // BOF de BIFF2, 3 y 4 sin contenedor
  if (empiezaPor(b, '%PDF') || (b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8) || empiezaPor(b, 'GIF8')) return 'binario';
  const { texto } = decodificar(b.subarray(0, 4096));
  const muestra = texto.replace(/^\uFEFF/, '');
  const raros = (muestra.match(/[\u0000-\u0008\u000E-\u001F]/g) || []).length;
  if (raros > muestra.length * 0.01) return 'binario';
  const t = muestra.trimStart();
  if (t.startsWith('<')) {
    if (/urn:schemas-microsoft-com:office:spreadsheet/i.test(muestra) && /<(ss:)?Workbook\b/i.test(muestra)) return 'xml';
    if (/<office:document\b/i.test(muestra)) return 'fods';
    return 'html';
  }
  // SYLK: «ID;P…» y después registros C;, F;, B;, P;, O; o E. Un CSV que empieza por «ID;Fecha…» no lo es.
  if (/^ID;P/.test(t) && /^(?:[CFBPO];|E\s*$)/m.test(t.slice(t.indexOf('\n') + 1))) return 'sylk';
  return 'texto';
}

/** HTML o XML a texto, respetando el juego de caracteres que declare (y si no, adivinándolo). */
function decodificarMarcado(bytes) {
  const conBOM = (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) || (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
  if (!conBOM) {
    let cabeza = '';
    for (let i = 0; i < Math.min(bytes.length, 2048); i++) cabeza += String.fromCharCode(bytes[i]);
    const m = cabeza.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i) || cabeza.match(/<\?xml[^>]+encoding\s*=\s*["']([\w-]+)["']/i);
    if (m) {
      try {
        const t = new TextDecoder(m[1].toLowerCase()).decode(bytes);
        if (!t.includes('\uFFFD')) return t;
      } catch { /* juego de caracteres desconocido: se adivina */ }
    }
  }
  return decodificar(bytes).texto;
}

function formatoDe(tipo, bookType, nombre) {
  if (tipo === null && /\.(xls|xlt)$/i.test(nombre)) return 'xls';
  if (tipo === 'html') return 'html';
  if (tipo === 'fods') return 'ods';
  if (tipo === 'cfb' || tipo === 'biff' || tipo === 'xml' || tipo === 'sylk') return 'xls';
  if (bookType === 'ods') return 'ods';
  if (bookType === 'numbers') return 'numbers';
  if (!bookType && /\.ods$/i.test(nombre)) return 'ods';
  if (!bookType && /\.numbers$/i.test(nombre)) return 'numbers';
  return 'xlsx';
}

/** Error de SheetJS → código para la persona. */
function clasificarError(e) {
  const msg = String(e?.message ?? e ?? '');
  if (/Unsupported ZIP encryption/i.test(msg)) return 'danado'; // un ZIP roto suele parecer «cifrado»
  if (/password|encrypt|protected/i.test(msg)) return 'protegido';
  if (/Cannot find Workbook stream|Could not find workbook|is not a spreadsheet|not supported|Unsupported (Works|Multiplan)|could not find <table>/i.test(msg)) return 'desconocido';
  return 'danado';
}

/** ¿Es un ZIP que se abre bien pero no lleva ninguna hoja de cálculo dentro? (entonces no está dañado: es otra cosa) */
function zipSinHoja(XLSX, bytes) {
  try {
    const c = XLSX.CFB.read(bytes, { type: 'array' });
    const rutas = c.FullPaths.map((p) => p.replace(/^Root Entry\//, '')).filter((p) => p && !p.startsWith('\u0001') && !p.endsWith('/'));
    return rutas.length > 0 && !rutas.some((p) => /^(\[Content_Types\]\.xml|xl\/|content\.xml|mimetype|Index\/|Index\.zip|Metadata\/)/i.test(p));
  } catch {
    return false;
  }
}

/**
 * ¿Algún archivo de dentro del xlsx, ods o numbers está roto? SheetJS descomprime con su propio código y no comprueba
 * nada: con unos pocos bytes cambiados se quedaba colgado para siempre, se quedaba sin memoria (un trozo que acababa
 * antes de tiempo) o leía una hoja vacía. Antes de dárselo se descomprime cada archivo con fflate, por trozos y sin
 * guardarlo, y se comprueba que mida lo declarado y que su CRC coincida (un CRC que no coincide puede ser una cifra
 * cambiada: mejor decir que el archivo está dañado que leer un importe que no es).
 * @returns {Promise<'danado'|'grande'|null>}
 */
async function zipRoto(bytes, ctx) {
  let entradas;
  try { entradas = listarZip(bytes); } catch (e) { if (e instanceof ErrorZip) return 'danado'; throw e; }
  let fflate = null, total = 0;
  for (const en of entradas) {
    if (en.carpeta || en.cifrado || (en.metodo !== 0 && en.metodo !== 8)) continue; // de esos ya se encarga SheetJS
    total += en.tamano;
    if (total > MAX_DESCOMPRIMIDO) return 'grande';
    if (en.metodo === 8 && !fflate) fflate = await ctx.cargar('fflate');
    try { comprobar(bytes, en, fflate); } catch (e) { if (e instanceof ErrorZip) return 'danado'; throw e; }
  }
  return null;
}

// ——— .xls (BIFF): registros mal encadenados ———
// Cada registro BIFF es tipo (2 bytes), largo (2 bytes) y datos. Un solo byte cambiado en un largo descoloca todos los
// registros que siguen y SheetJS se quedaba colgado leyéndolos (encontrado con un xls de los golden y un byte cambiado).
// Antes de dárselo se recorren los registros: largos de 8 224 bytes como mucho, el recorrido acaba justo al final del
// flujo (o en relleno de ceros) y cada BOF tiene su EOF. Solo se miran las cabeceras de los registros: es muy rápido.
const BOF = new Set([0x0009, 0x0209, 0x0409, 0x0809]);

function biffBienFormado(flujo) {
  const n = flujo.length;
  let p = 0, nivel = 0, registros = 0;
  while (p + 4 <= n) {
    const tipo = flujo[p] | (flujo[p + 1] << 8), largo = flujo[p + 2] | (flujo[p + 3] << 8);
    if (tipo === 0 && largo === 0) break; // relleno del final: se comprueba abajo que todo sean ceros
    if (largo > 8224 || p + 4 + largo > n) return false;
    if (registros === 0 && !BOF.has(tipo)) return false;
    if (BOF.has(tipo)) nivel++;
    else if (tipo === 0x000a && --nivel < 0) return false;
    p += 4 + largo;
    registros++;
  }
  for (let i = p; i < n; i++) if (flujo[i] !== 0) return false;
  return registros > 0 && nivel === 0;
}

/** El flujo de registros de un .xls dentro de su contenedor (Workbook en BIFF8, Book en BIFF5), o null. */
function flujoBIFF(XLSX, bytes) {
  try {
    const cfb = XLSX.CFB.read(bytes, { type: 'array' });
    const e = XLSX.CFB.find(cfb, 'Workbook') || XLSX.CFB.find(cfb, 'Book');
    if (!e || !e.content) return null;
    return e.content instanceof Uint8Array ? e.content : Uint8Array.from(e.content);
  } catch {
    return null; // contenedor roto: XLSX.read lo dirá
  }
}

function dos(n) {
  return String(n).padStart(2, '0');
}

/** Serial de Excel → "AAAA-MM-DD" o "AAAA-MM-DD HH:MM:SS" (respetando el sistema 1904 del libro). */
export function isoDeSerial(v, es1904) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const seg = Math.round(v * 86400);
  const dias = Math.floor(seg / 86400);
  const resto = seg - dias * 86400;
  if (dias < (es1904 ? 0 : 1)) return null;
  const iso = serialExcelAISO(dias, es1904);
  if (!iso) return null;
  if (!resto) return iso;
  return `${iso} ${dos(Math.floor(resto / 3600))}:${dos(Math.floor((resto % 3600) / 60))}:${dos(resto % 60)}`;
}

/** Convierte celdas de SheetJS a valores para tabla.js: texto, número o fecha "AAAA-MM-DD". */
function crearConversor(XLSX, es1904) {
  const esFecha = new Map();
  const formatoDeFecha = (z) => {
    let r = esFecha.get(z);
    if (r === undefined) {
      // fecha de verdad (con día o año), no una hora suelta ni una duración
      r = typeof z === 'string' && z !== 'General' && XLSX.SSF.is_date(z) && /[dy]/i.test(z.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''));
      esFecha.set(z, r);
    }
    return r;
  };
  return (c) => {
    if (!c) return null;
    switch (c.t) {
      case 's': return c.v === null || c.v === undefined ? null : String(c.v);
      case 'n':
        if (c.z && formatoDeFecha(c.z)) return isoDeSerial(c.v, es1904) ?? c.w ?? null;
        return typeof c.v === 'number' && Number.isFinite(c.v) ? c.v : null;
      case 'd':
        if (c.v instanceof Date && !Number.isNaN(c.v.getTime())) {
          const d = c.v;
          return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
        }
        return null;
      case 'b': return c.v ? 'TRUE' : 'FALSE';
      case 'e': case 'z': return null;
      default: return c.v ?? null;
    }
  };
}

/** Texto de una fila tal como se ve en la hoja (para origen.texto). */
function textoDeCeldas(celdas, convertir) {
  if (!celdas) return '';
  const ultima = celdas.length - 1;
  const ver = (c) => {
    if (!c) return '';
    // el formato de fecha 14 («m/d/yy») Excel lo enseña al estilo del país: mejor la fecha sin ambigüedad
    if (c.t === 'n' && c.z === 'm/d/yy') { const v = convertir(c); if (typeof v === 'string') return v; }
    if (c.w !== undefined && c.w !== null && c.t !== 'e') return String(c.w).replace(/\s+/g, ' ').trim();
    const v = convertir(c);
    return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim();
  };
  const partes = [];
  for (let k = 0; k <= ultima; k++) partes.push(ver(celdas[k]));
  while (partes.length && !partes[partes.length - 1]) partes.pop();
  return partes.join(' | ');
}

const MAX_CELDAS_COMBINADAS = 200000;

function filasDeHoja(ws, convertir) {
  const datos = ws?.['!data'] ?? [];
  const filas = new Array(datos.length);
  for (let r = 0; r < datos.length; r++) {
    const fila = datos[r];
    if (!fila) { filas[r] = []; continue; }
    const out = new Array(fila.length);
    for (let c = 0; c < fila.length; c++) out[c] = convertir(fila[c]);
    filas[r] = out;
  }
  // celdas combinadas: el valor solo está en la de arriba a la izquierda, pero en pantalla ocupa todo el rango.
  // A lo ancho se copia siempre (un título o un concepto que ocupa dos columnas). Hacia abajo solo se copian fechas
  // (una fecha que abarca varios movimientos): un importe o un saldo copiado en otra fila sería un movimiento inventado.
  let copiadas = 0;
  for (const m of ws?.['!merges'] ?? []) {
    const v = filas[m.s.r]?.[m.s.c];
    if (v === null || v === undefined || v === '') continue;
    const bajar = typeof v === 'string' && esFechaCelda(v);
    const hasta = bajar ? m.e.r : m.s.r;
    for (let r = m.s.r; r <= hasta && r < filas.length && copiadas < MAX_CELDAS_COMBINADAS; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r === m.s.r && c === m.s.c) continue;
        const fila = filas[r] ?? (filas[r] = []);
        if (fila[c] === null || fila[c] === undefined || fila[c] === '') { fila[c] = v; copiadas++; }
      }
    }
  }
  return { filas, celdas: datos };
}

/** Celdas con formato de porcentaje (0,004 que se ve «0,40 %») → «0.4%», para no leerlas como importes. */
function conPorcentajes(filas, celdas) {
  return filas.map((f, r) => (f || []).map((v, c) => {
    const x = celdas[r]?.[c];
    return x && x.t === 'n' && typeof x.v === 'number' && /%/.test(String(x.z ?? '')) ? `${Math.round(x.v * 1e8) / 1e6}%` : v;
  }));
}

function tieneContenido(filas) {
  for (const f of filas) if (f && f.some((v) => v !== null && v !== undefined && String(v).trim() !== '')) return true;
  return false;
}

function pareceTabla(filas) {
  let n = 0;
  for (const f of filas) if (f && f.filter((v) => v !== null && v !== undefined && String(v).trim() !== '').length >= 2) n++;
  return n >= 5;
}

/**
 * Lee una hoja de cálculo.
 * @param {{nombre: string, bytes: Uint8Array}} entrada
 * @param {Object} ctx ver DESARROLLO.md
 * @returns {Promise<import('../nucleo/modelo.js').LecturaArchivo|import('../nucleo/modelo.js').LecturaArchivo[]>}
 */
export async function leer(entrada, ctx = {}) {
  const nombre = entrada.nombre ?? 'hoja';
  const bytes = entrada.bytes;
  const deNombre = formatoDe(null, null, nombre);
  if (!bytes || !bytes.length) return lecturaConError(nombre, deNombre, 'vacio', { archivo: nombre });
  if (bytes.length > MAX_BYTES) return lecturaConError(nombre, deNombre, 'grande', { archivo: nombre });

  const tipo = tipoContenido(bytes);
  if (tipo === 'texto') return leerCSV(entrada, ctx); // CSV o TSV guardado con nombre de Excel
  if (tipo === 'binario') return lecturaConError(nombre, deNombre, 'desconocido', { archivo: nombre });

  if (tipo === 'zip') {
    const roto = await zipRoto(bytes, ctx);
    if (roto) return lecturaConError(nombre, /\.(ods|numbers)$/i.test(nombre) ? deNombre : 'xlsx', roto, { archivo: nombre });
  }
  const XLSX = await ctx.cargar('xlsx');
  if (tipo === 'cfb' || tipo === 'biff') {
    const flujo = tipo === 'biff' ? bytes : flujoBIFF(XLSX, bytes);
    if (flujo && !biffBienFormado(flujo)) return lecturaConError(nombre, 'xls', 'danado', { archivo: nombre });
    XLSX.set_cptable(await ctx.cargar('cpexcel')); // códigos de página de XLS antiguos
  }

  const opciones = { cellDates: false, cellNF: true, cellText: true, dense: true, sheetRows: MAX_FILAS + 1 };
  let wb;
  try {
    if (tipo === 'html' || tipo === 'xml' || tipo === 'fods') {
      // HTML: raw para que «05/01/2026» o «1.234,56» no se conviertan con reglas de EE. UU.; lo leemos nosotros
      // Sin espacios ni saltos delante: SheetJS solo reconoce el HTML si empieza por «<» (algunos bancos, como el
      // Sabadell, mandan «\n\t<!DOCTYPE html…» y se leía como texto con punto y coma).
      wb = XLSX.read(decodificarMarcado(bytes).replace(/^[\s\uFEFF]+/, ''), { ...opciones, type: 'string', raw: tipo === 'html' });
    } else {
      wb = XLSX.read(bytes, { ...opciones, type: 'array' });
    }
  } catch (e) {
    // si no se ha podido abrir, el nombre dice mejor qué esperaba la persona (un .xlsx cifrado va dentro de un contenedor de .xls)
    const f = /\.(xlsx|xlsm|xlsb|xls|ods|numbers)$/i.test(nombre) ? deNombre : formatoDe(tipo, null, nombre);
    const codigo = tipo === 'zip' && zipSinHoja(XLSX, bytes) ? 'desconocido' : clasificarError(e);
    return lecturaConError(nombre, f, codigo, { archivo: nombre });
  }
  const formato = formatoDe(tipo, wb.bookType, nombre);
  if (!wb.SheetNames?.length) return lecturaConError(nombre, formato, 'vacio', { archivo: nombre });

  const es1904 = !!wb.Workbook?.WBProps?.date1904; // Numbers y algunos Excel de Mac cuentan desde 1904
  const convertir = crearConversor(XLSX, es1904);
  const info = wb.Workbook?.Sheets ?? [];
  let visibles = wb.SheetNames.filter((n, i) => ((info.find((s) => s.name === n) ?? info[i])?.Hidden ?? 0) === 0);
  let ocultas = wb.SheetNames.length - visibles.length;
  // si todo lo que se ve está vacío, los datos estarán en una hoja oculta: se leen todas
  const conDatos = (n) => (wb.Sheets[n]?.['!data'] ?? []).some((f) => f && f.some((c) => c && c.v !== undefined && c.v !== null && String(c.v).trim() !== ''));
  if (!visibles.some(conDatos)) { visibles = wb.SheetNames.slice(); ocultas = 0; }

  // tablas a leer: una por hoja; en HTML, todas las tablas una debajo de otra (como las enseña Excel)
  const tablas = [];
  if (formato === 'html') {
    const filas = [], celdas = [];
    for (const n of visibles) {
      const t = filasDeHoja(wb.Sheets[n], convertir);
      if (filas.length) { filas.push([]); celdas.push(null); }
      for (let r = 0; r < t.filas.length; r++) { filas.push(t.filas[r]); celdas.push(t.celdas[r] ?? null); }
    }
    tablas.push({ hoja: undefined, filas, celdas });
  } else {
    for (const n of visibles.slice(0, MAX_HOJAS)) tablas.push({ hoja: n, ...filasDeHoja(wb.Sheets[n], convertir) });
  }

  if (ctx.opciones?.crudo === true) { // lector del datáfono: las filas de cada hoja tal cual, con su texto visible
    const conDatosCrudo = tablas.filter((t) => tieneContenido(t.filas));
    if (!conDatosCrudo.length) return lecturaConError(nombre, formato, 'vacio', { archivo: nombre });
    const avisosCrudo = ocultas ? [aviso('hojas_ocultas', { archivo: nombre, n: ocultas })] : [];
    return crearLectura({ archivo: nombre, formato, nivel: 'A', avisos: avisosCrudo, extra: {
      tablas: conDatosCrudo.map((t) => ({ hoja: t.hoja, filas: conPorcentajes(t.filas, t.celdas), textos: t.filas.map((_, i) => textoDeCeldas(t.celdas[i], convertir)) })),
    } });
  }
  const mapeo = ctx.opciones?.mapeo?.[nombre];
  const hojaMapeo = mapeo ? (mapeo.hoja ?? tablas.find((t) => tieneContenido(t.filas))?.hoja) : undefined;
  let primerN = 1;
  const resultados = [];
  for (const t of tablas) {
    if (!tieneContenido(t.filas)) { resultados.push({ t, vacia: true }); continue; }
    const res = deTablaAMovimientos(t.filas, {
      archivo: nombre,
      hoja: t.hoja,
      idArchivo: ctx.idArchivo ?? 0,
      primerN,
      mapeo: mapeo && t.hoja === hojaMapeo ? mapeo : undefined,
      hoy: ctx.opciones?.hoy,
      es1904,
      textoFila: (i) => textoDeCeldas(t.celdas[i], convertir),
    });
    primerN += res.movimientos.length;
    resultados.push({ t, res });
  }

  const conMovimientos = resultados.filter((r) => r.res?.movimientos.length);
  if (conMovimientos.length) {
    const varias = conMovimientos.length > 1;
    const lecturas = conMovimientos.map(({ t, res }) => {
      const archivo = varias ? `${nombre} · ${t.hoja}` : nombre;
      if (varias) for (const m of res.movimientos) m.origen.archivo = archivo;
      return crearLectura({
        archivo, formato, perfil: res.perfil, nivel: 'A', movimientos: res.movimientos,
        saldo_inicial: res.saldo_inicial, saldo_final: res.saldo_final, fecha_inicial: res.fecha_inicial, fecha_final: res.fecha_final,
        avisos: res.avisos, extra: { ...res.extra, ...(t.hoja ? { hoja: t.hoja } : {}) },
      });
    });
    const primera = lecturas[0];
    for (const r of resultados) {
      if (r.res && !r.res.movimientos.length && pareceTabla(r.t.filas)) primera.avisos.push(aviso('hoja_sin_leer', { archivo: nombre, hoja: r.t.hoja ?? '' }));
    }
    if (ocultas) primera.avisos.push(aviso('hojas_ocultas', { archivo: nombre, n: ocultas }));
    return varias ? lecturas : primera;
  }

  const porMapear = resultados.find((r) => r.res?.necesita_mapeo);
  if (porMapear) {
    const { t, res } = porMapear;
    return crearLectura({
      archivo: nombre, formato, nivel: 'A', avisos: res.avisos,
      necesita_mapeo: { ...res.necesita_mapeo, ...(t.hoja ? { hoja: t.hoja } : {}) },
      extra: t.hoja ? { hoja: t.hoja } : {},
    });
  }
  if (resultados.every((r) => r.vacia)) return lecturaConError(nombre, formato, 'vacio', { archivo: nombre });
  const sin = crearLectura({ archivo: nombre, formato, nivel: 'A', avisos: resultados.flatMap((r) => r.res?.avisos ?? []) });
  sin.error = { codigo: 'sin_movimientos', datos: { archivo: nombre } };
  return sin;
}
