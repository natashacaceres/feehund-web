// PDF con texto (nivel B), con contraseña, y con páginas escaneadas que se pintan y pasan por el OCR (nivel C).
// pdf.js trabaja dentro de nuestro worker sin crear otro: su parte «worker» se carga en globalThis.pdfjsWorker.
// Sin DOM: los lienzos son OffscreenCanvas y los recursos (cmaps, fuentes, wasm) son archivos propios de /vendor.

import { crearLectura, lecturaConError, aviso } from '../nucleo/modelo.js';
import { reconstruir, palabrasDeTrozo } from '../nucleo/filas.js';
import { normalizar } from '../nucleo/texto.js';
import { PDFJS_RECURSOS } from '../librerias.js';

const LIMITE = 10 * 1024 * 1024;
const MIN_CARACTERES = 20; // con menos texto, la página se toma por escaneada
const ANCHO_OCR = 2000; // píxeles de ancho al pintar una página para el OCR
const MAX_PIXELES = 16e6;

// ───────────── fábricas para pdf.js sin DOM ─────────────

// Lienzos: dentro del worker solo existe OffscreenCanvas
class FabricaLienzos {
  constructor({ enableHWA = false } = {}) { this.hwa = enableHWA; }
  create(ancho, alto) {
    if (ancho <= 0 || alto <= 0) throw new Error('Tamaño de lienzo no válido');
    const canvas = this._createCanvas(ancho, alto);
    return { canvas, context: canvas.getContext('2d', { willReadFrequently: !this.hwa }) };
  }
  reset(par, ancho, alto) {
    if (!par.canvas) throw new Error('Falta el lienzo');
    if (ancho <= 0 || alto <= 0) throw new Error('Tamaño de lienzo no válido');
    par.canvas.width = ancho;
    par.canvas.height = alto;
  }
  destroy(par) {
    if (!par.canvas) throw new Error('Falta el lienzo');
    par.canvas.width = 0;
    par.canvas.height = 0;
    par.canvas = null;
    par.context = null;
  }
  getNoAlphaContext(canvas) { return canvas.getContext('2d', { alpha: false, willReadFrequently: !this.hwa }); }
  _createCanvas(ancho, alto) {
    if (typeof OffscreenCanvas === 'undefined') throw new Error('Sin OffscreenCanvas');
    return new OffscreenCanvas(ancho, alto);
  }
}

// Filtros SVG: necesitan el DOM. Sin ellos pdf.js pinta igual, sin esos efectos de color.
class FabricaFiltros {
  addFilter() { return 'none'; }
  addHCMFilter() { return 'none'; }
  addAlphaFilter() { return 'none'; }
  addLuminosityFilter() { return 'none'; }
  addKnockoutFilter() { return 'none'; }
  addHighlightHCMFilter() { return 'none'; }
  addSelectionHCMFilter() { return 'none'; }
  addSelectionFilter() { return 'none'; }
  createSelectionStyle() { return null; }
  destroy() {}
}

// cmaps, fuentes estándar y wasm: GET de archivos propios de /vendor (en Node, del disco)
class FabricaDatos {
  constructor({ cMapUrl = null, standardFontDataUrl = null, wasmUrl = null } = {}) {
    this.rutas = { cMapUrl, standardFontDataUrl, wasmUrl };
  }
  async fetch({ kind, filename }) {
    const base = this.rutas[kind];
    if (!base) throw new Error('Ruta de recursos sin configurar');
    const url = new URL(filename, base);
    if (url.protocol === 'file:') {
      const fs = globalThis.process?.getBuiltinModule?.('node:fs/promises');
      if (!fs) throw new Error('Sin acceso al disco');
      return new Uint8Array(await fs.readFile(url));
    }
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) throw new Error(`Recurso no disponible (${r.status})`);
    return new Uint8Array(await r.arrayBuffer());
  }
}

// ───────────── texto de la página → palabras con posición ─────────────

// Gira un punto para que la orientación dominante del texto quede horizontal (q = cuartos de vuelta)
function girar(x, y, q, W, H) {
  switch (q) {
    case 1: return [y, W - x]; // texto hacia abajo
    case 2: return [W - x, H - y]; // boca abajo
    case 3: return [H - y, x]; // texto hacia arriba
    default: return [x, y];
  }
}

/**
 * Ítems de getTextContent → palabras con y hacia abajo (unidades de la página, escala 1).
 * Los ítems pueden traer varias palabras: se parten con la x en proporción a los caracteres.
 */
export function tokensDePagina(items, vp, Util) {
  const brutos = [];
  let caracteres = 0, cifras = 0;
  for (const it of items || []) {
    const s = it?.str;
    if (typeof s !== 'string' || !s.trim() || !Array.isArray(it.transform)) continue;
    const tx = Util.transform(vp.transform, it.transform);
    const alto = Math.hypot(tx[2], tx[3]);
    if (!(alto > 0) || !Number.isFinite(tx[4]) || !Number.isFinite(tx[5])) continue;
    const ang = Math.atan2(tx[1], tx[0]);
    const cuarto = Math.round(ang / (Math.PI / 2));
    if (Math.abs(ang - cuarto * (Math.PI / 2)) > 0.17) continue; // inclinado: sellos y marcas de agua
    const ancho = Number.isFinite(it.width) && it.width > 0 ? it.width : alto * 0.5 * s.length;
    brutos.push({ s, ox: tx[4], oy: tx[5], ex: tx[4] + Math.cos(ang) * ancho, ey: tx[5] + Math.sin(ang) * ancho, alto, q: ((cuarto % 4) + 4) % 4 });
    caracteres += s.replace(/\s+/g, '').length;
    cifras += (s.match(/\d/g) || []).length;
  }
  // la orientación con más letras manda; el texto en otra dirección (márgenes legales en vertical) se deja fuera
  const peso = [0, 0, 0, 0];
  for (const b of brutos) peso[b.q] += b.s.length;
  const q = peso.indexOf(Math.max(...peso));
  const W = vp.width, H = vp.height;
  const tokens = [];
  for (const b of brutos) {
    if (b.q !== q) continue;
    const [ax, ay] = girar(b.ox, b.oy, q, W, H);
    const [bx] = girar(b.ex, b.ey, q, W, H);
    const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx);
    for (const p of palabrasDeTrozo(b.s, x0, x1, ay - b.alto, ay)) tokens.push(p);
  }
  return { tokens, caracteres, cifras, ancho: q % 2 ? H : W, alto: q % 2 ? W : H };
}

// ───────────── banco por el texto de la primera página (solo líneas que no son movimientos) ─────────────

const BANCOS = [
  ['caixabank', /\bCAIXABANK\b|\bLA CAIXA\b/g], ['imagin', /\bIMAGIN\b/g], ['santander', /\bBANCO SANTANDER\b|\bSANTANDER CONSUMER\b/g],
  ['bbva', /\bBBVA\b/g], ['ing', /\bING BANK\b|\bING DIRECT\b|\bING ESPANA\b/g], ['sabadell', /\bBANCO (?:DE )?SABADELL\b|\bBANC SABADELL\b/g],
  ['abanca', /\bABANCA\b/g], ['bankinter', /\bBANKINTER\b/g], ['openbank', /\bOPENBANK\b/g], ['unicaja', /\bUNICAJA\b/g],
  ['kutxabank', /\bKUTXABANK\b/g], ['ibercaja', /\bIBERCAJA\b/g], ['cajamar', /\bCAJAMAR\b/g], ['myinvestor', /\bMYINVESTOR\b/g],
  ['revolut', /\bREVOLUT\b/g], ['n26', /\bN26\b/g], ['wise', /\bWISE (?:EUROPE|PAYMENTS)\b/g], ['bunq', /\bBUNQ\b/g],
  ['trade_republic', /\bTRADE REPUBLIC\b/g],
];

function detectarBanco(items) {
  const lineas = new Map();
  for (const it of items || []) {
    if (typeof it?.str !== 'string' || !Array.isArray(it.transform)) continue;
    const y = Math.round(it.transform[5]);
    lineas.set(y, (lineas.get(y) ?? '') + ' ' + it.str);
  }
  const cuenta = new Map();
  for (const texto of lineas.values()) {
    if (/\d{1,2}[/.-]\d{1,2}/.test(texto) && /\d[.,]\d{2}\b/.test(texto)) continue; // parece un movimiento
    const t = normalizar(texto);
    for (const [id, re] of BANCOS) {
      const n = (t.match(re) || []).length;
      if (n) cuenta.set(id, (cuenta.get(id) ?? 0) + n);
    }
  }
  const orden = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  if (!orden.length || (orden.length > 1 && orden[0][1] === orden[1][1])) return null;
  return orden[0][0];
}

// ───────────── lectura ─────────────

function pareceUnPdf(bytes) {
  const n = Math.min(bytes.length - 4, 1024);
  for (let i = 0; i < n; i++) {
    if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46 && bytes[i + 4] === 0x2d) return true; // %PDF-
  }
  return false;
}

// Fallos del OCR que valen para todo el análisis (no tiene sentido probar con la página siguiente)
const FALLOS_OCR = new Set(['necesita_conexion', 'ocr_no_disponible', 'navegador_antiguo']);

/**
 * Pinta la página, la prepara como una foto (gris, contraste, texto oscuro sobre claro) y la pasa por el OCR.
 * @returns {Promise<Object|{error: string}|null>} la página leída; {error} si el OCR no está disponible; null si falla esta página
 */
async function ocrDePagina(page, n, archivo, ctx, limite, pdfjs) {
  let lienzo = null;
  try {
    if (typeof OffscreenCanvas === 'undefined') return { error: 'navegador_antiguo' };
    // la preparación de la imagen es la de las fotos (lectores/imagen.js); sin conexión puede no estar cargada
    let prepararPixeles;
    try {
      ({ prepararPixeles } = await import('./imagen.js'));
    } catch {
      return { error: globalThis.navigator?.onLine === false ? 'necesita_conexion' : 'ocr_no_disponible' };
    }
    const vp1 = page.getViewport({ scale: 1 });
    let escala = ANCHO_OCR / vp1.width;
    if (vp1.width * vp1.height * escala * escala > MAX_PIXELES) escala = Math.sqrt(MAX_PIXELES / (vp1.width * vp1.height));
    const vp = page.getViewport({ scale: escala });
    lienzo = new FabricaLienzos()._createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    await page.render({ canvas: lienzo, viewport: vp, background: '#ffffff', annotationMode: pdfjs.AnnotationMode?.ENABLE }).promise;
    const ancho = lienzo.width, alto = lienzo.height;
    const c = lienzo.getContext('2d', { willReadFrequently: true });
    const datos = c.getImageData(0, 0, ancho, alto);
    prepararPixeles(datos.data);
    c.putImageData(datos, 0, 0);
    const imagen = await lienzo.convertToBlob({ type: 'image/png' });
    lienzo.width = 0;
    lienzo.height = 0;
    lienzo = null;
    limite.usadas++;
    let r;
    try {
      r = await ctx.ocr(imagen, { archivo, pagina: n, ancho, alto, foto: false });
    } catch (e) {
      // sin conexión o sin OCR en este navegador: la persona tiene que saberlo, no es un fallo de esta página
      // (y la página no gasta cupo, porque no se ha leído)
      if (FALLOS_OCR.has(e?.codigo)) { limite.usadas--; return { error: e.codigo }; }
      return null;
    }
    if (!r || !Array.isArray(r.palabras)) return null;
    return { numero: n, ancho: r.ancho || ancho, alto: r.alto || alto, tokens: r.palabras, nivel: 'C' };
  } catch {
    return null;
  } finally {
    if (lienzo) { lienzo.width = 0; lienzo.height = 0; }
  }
}

async function leerDocumento(doc, pdfjs, archivo, ctx) {
  const total = doc.numPages;
  const limite = ctx.limiteOcr || { usadas: 0, max: 20 };
  const paginas = [], avisos = [], sinTexto = [], sinOcr = [], conOcr = [], sinCifras = [];
  let limiteAvisado = false, falloOcr = null;
  let perfil = null;
  for (let n = 1; n <= total; n++) {
    ctx.progreso?.({ fase: 'pdf', archivo, pagina: n, total });
    let page = null;
    try {
      page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      if (n === 1) perfil = detectarBanco(tc.items);
      const t = tokensDePagina(tc.items, vp, pdfjs.Util);
      if (t.caracteres >= MIN_CARACTERES) {
        paginas.push({ numero: n, ancho: t.ancho, alto: t.alto, tokens: t.tokens, nivel: 'B' });
        if (t.cifras < 0.02 * t.caracteres) sinCifras.push(n);
        continue;
      }
      // página escaneada: se pinta y se lee con el OCR, si lo hay y queda cupo
      sinTexto.push(n);
      if (typeof ctx.ocr !== 'function') { sinOcr.push(n); continue; }
      if (falloOcr) continue; // el OCR ya ha dicho que no está disponible
      if (limite.usadas >= limite.max) {
        if (!limiteAvisado) { avisos.push(aviso('demasiadas_imagenes', { archivo })); limiteAvisado = true; }
        continue;
      }
      ctx.progreso?.({ fase: 'ocr', archivo, pagina: n, total });
      const leida = await ocrDePagina(page, n, archivo, ctx, limite, pdfjs);
      if (leida?.error) falloOcr = leida.error;
      else if (leida) { paginas.push(leida); conOcr.push(n); }
      else avisos.push(aviso('pdf_ocr_fallido', { archivo, pagina: n }));
    } catch {
      avisos.push(aviso('pdf_pagina_fallida', { archivo, pagina: n }));
    } finally {
      try { page?.cleanup(); } catch { /* nada que liberar */ }
    }
  }
  if (sinOcr.length) avisos.push(aviso('necesita_ocr', { archivo, paginas: sinOcr.join(', '), n: sinOcr.length }));
  if (conOcr.length) avisos.push(aviso('pdf_paginas_ocr', { archivo, n: conOcr.length }));
  const soloImagen = sinTexto.length === total;
  const extraBase = { paginas: total, paginas_sin_texto: sinTexto, paginas_ocr: conOcr };
  // nada leído porque el OCR no está disponible: es el error del archivo, con su texto («necesita conexión»…)
  if (!paginas.length && falloOcr) return lecturaConError(archivo, 'pdf_escaneado', falloOcr, { archivo });
  if (falloOcr) avisos.push(aviso(falloOcr, { archivo }));
  if (!paginas.length) {
    return crearLectura({ archivo, formato: soloImagen ? 'pdf_escaneado' : 'pdf', perfil, nivel: soloImagen ? 'C' : 'B', avisos, extra: extraBase });
  }
  const ctxFilas = () => ({ archivo, idArchivo: ctx.idArchivo ?? 0, nivel: conOcr.length ? 'C' : 'B', hoy: ctx.opciones?.hoy, mapeo: ctx.opciones?.mapeo?.[archivo] });
  let res = reconstruir(paginas, ctxFilas());
  // texto que no se deja leer (fuentes sin tabla de caracteres): un extracto sin cifras no es normal, se lee la imagen
  const conTexto = paginas.filter((p) => p.nivel === 'B').length;
  if (!res.movimientos.length && typeof ctx.ocr === 'function' && sinCifras.length && sinCifras.length === conTexto) {
    let cambiadas = 0;
    for (const n of sinCifras) {
      if (limite.usadas >= limite.max) break;
      let page = null;
      try {
        page = await doc.getPage(n);
        ctx.progreso?.({ fase: 'ocr', archivo, pagina: n, total });
        const leida = await ocrDePagina(page, n, archivo, ctx, limite, pdfjs);
        if (leida?.error) { if (!avisos.some((a) => a.codigo === leida.error)) avisos.push(aviso(leida.error, { archivo })); break; }
        if (!leida) break;
        // si la imagen tampoco trae cifras, no es un extracto: no se gasta más tiempo
        const letras = leida.tokens.reduce((s, p) => s + String(p?.texto ?? '').length, 0);
        const digitos = leida.tokens.reduce((s, p) => s + (String(p?.texto ?? '').match(/\d/g) || []).length, 0);
        if (digitos < 0.05 * letras) break;
        paginas[paginas.findIndex((p) => p.numero === n)] = leida;
        conOcr.push(n);
        cambiadas++;
      } catch {
        break; // se queda el texto que había
      } finally {
        try { page?.cleanup(); } catch { /* nada */ }
      }
    }
    if (cambiadas) {
      res = reconstruir(paginas, ctxFilas());
      if (!avisos.some((a) => a.codigo === 'pdf_paginas_ocr')) avisos.push(aviso('pdf_paginas_ocr', { archivo, n: conOcr.length }));
    }
  }
  // nivel C solo si algún movimiento sale de una página leída por OCR
  const deOcr = new Set(conOcr);
  const nivel = res.movimientos.some((m) => deOcr.has(m.origen.pagina)) ? 'C' : soloImagen ? 'C' : 'B';
  return crearLectura({
    archivo,
    formato: nivel === 'C' ? 'pdf_escaneado' : 'pdf',
    perfil,
    nivel,
    movimientos: res.movimientos,
    saldo_inicial: res.saldo_inicial,
    saldo_final: res.saldo_final,
    fecha_inicial: res.fecha_inicial,
    fecha_final: res.fecha_final,
    avisos: [...avisos, ...res.avisos],
    necesita_mapeo: res.necesita_mapeo,
    extra: { ...res.extra, ...extraBase },
  });
}

/**
 * @param {{nombre: string, bytes: Uint8Array}} entrada
 * @param {Object} ctx contrato de los lectores (cargar, opciones.contrasenas, ocr?, limiteOcr, progreso?…)
 * @returns {Promise<Object>} LecturaArchivo
 */
export async function leer(entrada, ctx = {}) {
  const archivo = entrada?.nombre || 'documento.pdf';
  const bytes = entrada?.bytes;
  if (!bytes || !bytes.length) return lecturaConError(archivo, 'pdf', 'vacio', { archivo });
  if (bytes.length > LIMITE) return lecturaConError(archivo, 'pdf', 'grande', { archivo });
  if (!pareceUnPdf(bytes)) return lecturaConError(archivo, 'pdf', 'danado', { archivo });

  let pdfjs;
  try {
    if (!globalThis.pdfjsWorker?.WorkerMessageHandler) globalThis.pdfjsWorker = await ctx.cargar('pdfjs-worker');
    pdfjs = await ctx.cargar('pdfjs');
  } catch {
    return lecturaConError(archivo, 'pdf', 'necesita_conexion', { archivo });
  }
  const contrasena = ctx.opciones?.contrasenas?.[archivo];
  // La contraseña tal cual; si no vale, sin espacios delante o detrás y con la letra del DNI en mayúscula o en
  // minúscula (se copia del correo del banco con un espacio, o se escribe «12345678z»). Todo en este dispositivo.
  const variantes = typeof contrasena === 'string' && contrasena.trim()
    ? [...new Set([contrasena, contrasena.trim(), contrasena.trim().toUpperCase(), contrasena.trim().toLowerCase()])]
    : [undefined];
  let motivo = null;
  for (const clave of variantes) {
    const tarea = abrirDocumento(pdfjs, bytes, clave);
    try {
      let doc;
      try {
        doc = await tarea.promise;
      } catch (e) {
        if (e?.name !== 'PasswordException') return lecturaConError(archivo, 'pdf', 'danado', { archivo });
        // código 1: hace falta contraseña; 2: la que se ha dado no vale
        motivo = e.code === 2 ? 'incorrecta' : 'requerida';
        if (motivo === 'requerida') break;
        continue;
      }
      return await leerDocumento(doc, pdfjs, archivo, ctx);
    } finally {
      try { await tarea.destroy(); } catch { /* ya cerrado */ }
    }
  }
  return crearLectura({ archivo, formato: 'pdf', nivel: 'B', necesita_contrasena: { motivo: motivo ?? 'requerida' } });
}

function abrirDocumento(pdfjs, bytes, contrasena) {
  return pdfjs.getDocument({
    data: new Uint8Array(bytes), // copia: pdf.js se queda con el búfer que recibe
    password: contrasena,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    cMapUrl: PDFJS_RECURSOS + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: PDFJS_RECURSOS + 'standard_fonts/',
    wasmUrl: PDFJS_RECURSOS + 'wasm/',
    useWorkerFetch: false,
    BinaryDataFactory: FabricaDatos,
    CanvasFactory: FabricaLienzos,
    FilterFactory: FabricaFiltros,
    disableWorkerRendering: true,
    enableXfa: false,
    verbosity: 0,
  });
}
