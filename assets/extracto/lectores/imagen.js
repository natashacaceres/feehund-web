// Lector de fotos y capturas (png, jpg, webp, heic). Nivel C: lo leído siempre se enseña para que la persona lo revise.
// 1. Decodifica en local con createImageBitmap. Un HEIC que el navegador no abre se pide en JPG (heic_no_compatible).
// 2. Prepara la imagen para el OCR: gris, contraste (percentiles 2 y 98) y texto oscuro sobre fondo claro (las
//    capturas en modo oscuro se invierten). Ancho: las fotos de cámara (jpg, heic) a 2000 px; las capturas, a su
//    tamaño (entre 1000 y 2000 px): su letra ya tiene el tamaño que Tesseract lee mejor y agrandarlas duplica el
//    tiempo sin leer más (medido en Chrome). Las muy altas se leen en trozos de 8000 px como mucho, que se solapan
//    60 px y se cortan por una franja en blanco para no partir ninguna línea.
// 3. OCR en el hilo principal (ctx.ocr) y reconstrucción de filas con nucleo/filas.js, igual que un PDF.
// Cada imagen suma 1 al límite de 20 del análisis. Los mapas de bits y lienzos se sueltan al acabar cada trozo.
//
// Al final del archivo está la parte del hilo principal, que motor.js carga solo cuando llega la primera foto
// o se pide la imagen para compartir: el OCR con Tesseract y esa imagen.

import { crearLectura, lecturaConError } from '../nucleo/modelo.js';

export const ANCHO_OCR = 2000; // fotos de cámara; y techo para todo
export const ANCHO_MIN = 1000; // capturas pequeñas: se agrandan hasta aquí
export const ALTO_MAX = 8000;
export const SOLAPE = 60;
const VENTANA_CORTE = 600; // franja del final de cada trozo donde se busca una fila en blanco
const GAMMA = 1.6; // oscurece los grises medios (texto gris claro de las apps) sin tocar el blanco
const MIN_CONFIANZA_CIFRA = 0.5; // por debajo, una cifra se vuelve a leer al doble de tamaño
const MAX_SEGUNDAS = 12;

/**
 * @param {{nombre: string, bytes: Uint8Array}} entrada
 * @param {Object} ctx ver «Contrato de los lectores» en DESARROLLO.md
 * @returns {Promise<import('../nucleo/modelo.js').LecturaArchivo>}
 */
export async function leer(entrada, ctx) {
  const nombre = entrada.nombre;
  if (typeof ctx.ocr !== 'function' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    return lecturaConError(nombre, 'imagen', 'navegador_antiguo');
  }
  if (ctx.limiteOcr && ctx.limiteOcr.usadas >= ctx.limiteOcr.max) return lecturaConError(nombre, 'imagen', 'demasiadas_imagenes');

  const tipo = tipoDeImagen(entrada.bytes, nombre);
  let fuente;
  try {
    fuente = await abrir(entrada.bytes, tipo, ctx);
  } catch (e) {
    if (e?.codigo === 'necesita_conexion') return lecturaConError(nombre, 'imagen', 'necesita_conexion');
    if (e?.codigo === 'heic_no_compatible') return lecturaConError(nombre, 'imagen', 'heic_no_compatible');
    return lecturaConError(nombre, 'imagen', tipo === 'heic' ? 'heic_ilegible' : 'ilegible');
  }
  if (ctx.limiteOcr) ctx.limiteOcr.usadas++;

  const palabras = [];
  let confianzaSuma = 0, trozos = 0, invertida = false, siguienteLinea = 0;
  // De cámara (jpg, heic): puede venir torcida y con sombras. Pero una captura de pantalla guardada en jpg o heic
  // (al compartirla, o en un iPhone) es tan alta como la pantalla, y una cámara no saca fotos así (4:3 o 16:9):
  // con más de 1,9 de alto por cada 1 de ancho se lee como captura, a su tamaño y sin enderezar.
  const foto = (tipo === 'jpeg' || tipo === 'heic') && !(fuente.height >= 1.9 * fuente.width);
  const ancho = anchoParaOcr(fuente.width, foto);
  const escala = ancho / fuente.width;
  const alto = Math.max(1, Math.round(fuente.height * escala));
  try {
    let inicio = 0; // primera fila (en la imagen ya escalada) del trozo
    let frontera = 0; // las palabras de este trozo cuentan desde aquí...
    let blancoArriba = 0; // ...y estas primeras filas ya se leyeron en el trozo anterior
    while (frontera < alto) {
      const altoTrozo = Math.min(ALTO_MAX, alto - inicio);
      const lienzo = new OffscreenCanvas(ancho, altoTrozo);
      const c = lienzo.getContext('2d', { willReadFrequently: true });
      c.fillStyle = '#fff';
      c.fillRect(0, 0, ancho, altoTrozo);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(fuente, 0, inicio / escala, fuente.width, altoTrozo / escala, 0, 0, ancho, altoTrozo);
      const datos = c.getImageData(0, 0, ancho, altoTrozo);
      invertida = prepararPixeles(datos.data).invertida || invertida;

      let fin = alto; // frontera inferior de este trozo
      let cortaEnBlanco = false;
      if (inicio + altoTrozo < alto) {
        const corte = buscarCorte(datos.data, ancho, altoTrozo);
        fin = inicio + corte.fila;
        cortaEnBlanco = corte.blanca;
        // Corte por una franja en blanco: lo de debajo se lee entero en el trozo siguiente, aquí se tapa.
        // Si no hay franja en blanco, no se tapa nada: con 60 px de solape cada línea (de hasta 120 px)
        // queda entera en el trozo donde cae su centro, y solo se cuenta ahí.
        if (cortaEnBlanco) pintarBlanco(datos.data, ancho, corte.fila, altoTrozo);
      }
      if (blancoArriba) pintarBlanco(datos.data, ancho, 0, Math.min(blancoArriba, altoTrozo));
      c.putImageData(datos, 0, 0);
      const blob = await lienzo.convertToBlob({ type: 'image/png' });
      lienzo.width = lienzo.height = 0; // suelta la memoria del lienzo

      ctx.progreso?.({ fase: 'foto', trozo: trozos + 1 });
      const r = await ctx.ocr(blob, { archivo: nombre, pagina: 1, trozo: trozos, ancho, alto: altoTrozo, foto });
      trozos++;
      // los números de línea de cada trozo empiezan en 0: se corren para que no se repitan en toda la imagen
      const base = siguienteLinea;
      for (const p of r?.palabras ?? []) {
        const centro = inicio + (p.y0 + p.y1) / 2;
        if (Number.isInteger(p.linea)) siguienteLinea = Math.max(siguienteLinea, base + p.linea + 1);
        if (centro < frontera || centro >= fin) continue; // ya leída en otro trozo
        const palabra = { ...p, y0: p.y0 + inicio, y1: p.y1 + inicio };
        if (Number.isInteger(p.linea)) palabra.linea = base + p.linea;
        else delete palabra.linea;
        palabras.push(palabra);
        confianzaSuma += typeof p.confianza === 'number' ? p.confianza : 0;
      }
      if (fin >= alto) break;
      frontera = fin;
      inicio = fin - SOLAPE; // el trozo siguiente empieza 60 px por encima del corte
      blancoArriba = cortaEnBlanco ? SOLAPE : 0; // esos 60 px ya se leyeron enteros en este trozo
    }
    await segundaLectura(palabras, fuente, escala, ctx, nombre);
  } finally {
    fuente.close?.();
  }

  if (!palabras.length) return lecturaConError(nombre, 'imagen', 'ilegible');
  const confianza = Math.round((confianzaSuma / palabras.length) * 100) / 100;
  if (ctx.opciones?.crudo === true) { // lector del datáfono: las palabras tal cual, sin buscar movimientos
    return crearLectura({ archivo: nombre, formato: 'imagen', nivel: 'C',
      extra: { paginas: [{ numero: 1, ancho, alto, tokens: palabras, nivel: 'C' }], confianza, palabras: palabras.length, trozos, ancho, alto, invertida, tipo, foto } });
  }

  const { reconstruir } = await import('../nucleo/filas.js');
  const r = reconstruir([{ numero: 1, ancho, alto, tokens: palabras }], {
    archivo: nombre,
    idArchivo: ctx.idArchivo,
    nivel: 'C',
    hoy: ctx.opciones?.hoy,
    mapeo: ctx.opciones?.mapeo?.[nombre],
  });
  if (!r.movimientos?.length && !r.necesita_mapeo) return lecturaConError(nombre, 'imagen', 'foto_sin_movimientos');
  return crearLectura({
    archivo: nombre,
    formato: 'imagen',
    perfil: null,
    nivel: 'C',
    movimientos: r.movimientos ?? [],
    saldo_inicial: r.saldo_inicial ?? null,
    saldo_final: r.saldo_final ?? null,
    fecha_inicial: r.fecha_inicial ?? null,
    fecha_final: r.fecha_final ?? null,
    avisos: r.avisos ?? [],
    necesita_mapeo: r.necesita_mapeo ?? null,
    extra: { ...(r.extra ?? {}), confianza, palabras: palabras.length, trozos, ancho, alto, invertida, tipo, foto },
  });
}

/**
 * Segunda lectura de las cifras que el OCR ha leído con muy poca confianza: el trozo de la imagen, al doble de tamaño,
 * vuelve a pasar por el OCR. Con la letra del iPhone a su tamaño, «-2,77» puede salir «-2,17» (confianza 0,09) y al
 * doble sale «-2,//», que filas.js lee como «-2,77». Se queda la lectura con más confianza, pero la palabra conserva
 * la confianza baja de la primera: sigue saliendo dudosa salvo que el saldo la confirme. Como mucho 12 por imagen.
 */
async function segundaLectura(palabras, fuente, escala, ctx, nombre) {
  const dudosas = palabras.filter(pideSegundaLectura).slice(0, MAX_SEGUNDAS);
  for (const p of dudosas) {
    let lienzo = null;
    try {
      const alto = p.y1 - p.y0;
      const mx = Math.max(3, Math.round(alto * 0.2)), my = Math.max(4, Math.round(alto * 0.35));
      const w = Math.round((p.x1 - p.x0 + 2 * mx) * 2), h = Math.round((alto + 2 * my) * 2);
      if (!(w > 0 && h > 0) || w * h > 4e6) continue;
      lienzo = new OffscreenCanvas(w, h);
      const c = lienzo.getContext('2d', { willReadFrequently: true });
      c.fillStyle = '#fff';
      c.fillRect(0, 0, w, h);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(fuente, (p.x0 - mx) / escala, (p.y0 - my) / escala, (p.x1 - p.x0 + 2 * mx) / escala, (alto + 2 * my) / escala, 0, 0, w, h);
      const datos = c.getImageData(0, 0, w, h);
      prepararPixeles(datos.data);
      c.putImageData(datos, 0, 0);
      const blob = await lienzo.convertToBlob({ type: 'image/png' });
      const recorte = { x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1 };
      const r = await ctx.ocr(blob, { archivo: nombre, pagina: 1, ancho: w, alto: h, foto: false, recorte });
      const texto = mejorSegundaLectura(p, r?.palabras);
      if (texto) { p.leidoAntes = p.texto; p.texto = texto; }
    } catch {
      // la segunda lectura es una ayuda: si falla, se queda la primera
    } finally {
      if (lienzo) lienzo.width = lienzo.height = 0;
    }
  }
}

/** ¿Esta palabra del OCR es una cifra leída con tan poca confianza que conviene leerla otra vez? */
export function pideSegundaLectura(p) {
  return typeof p.confianza === 'number' && p.confianza < MIN_CONFIANZA_CIFRA && (String(p.texto).match(/\d/g) || []).length >= 2
    && /[.,/]/.test(p.texto) && !/[A-Za-z]{2}/.test(p.texto);
}

/** Texto de la segunda lectura si es mejor que la primera (bastante más confianza), o null. */
export function mejorSegundaLectura(p, palabrasRecorte) {
  // las palabras con cifras o con signos de cifra («-2,» y «//»); la moneda y las letras sueltas, no
  const cifras = (palabrasRecorte ?? []).filter((x) => /[\d/.,+-]/.test(x.texto) && !/[A-Za-z€$£]{2}/.test(x.texto));
  if (!cifras.some((x) => /\d/.test(x.texto))) return null;
  const texto = cifras.map((x) => x.texto).join('');
  const conf = Math.min(...cifras.map((x) => x.confianza ?? 0));
  return texto !== p.texto && conf > p.confianza + 0.2 ? texto : null;
}

/** Ancho para el OCR: fotos de cámara a 2000 px; capturas a su tamaño, entre 1000 y 2000 px. */
export function anchoParaOcr(anchoOriginal, foto) {
  if (foto) return ANCHO_OCR;
  return Math.min(ANCHO_OCR, Math.max(ANCHO_MIN, Math.round(anchoOriginal)));
}

/**
 * Mapa de bits de la imagen, con la orientación de la foto (EXIF). HEIC solo si el navegador lo abre por sí mismo
 * (Safari y los iPhone): no llevamos decodificador propio, porque el que hay publicado (libheif con libde265) tiene
 * fallos de seguridad conocidos y patentes de HEVC. Si no lo abre, se pide la foto en JPG.
 */
async function abrir(bytes, tipo, ctx) { // eslint-disable-line no-unused-vars
  const blob = new Blob([bytes], { type: MIME[tipo] || '' });
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    try { return await createImageBitmap(blob); } catch { /* el navegador no sabe abrirla */ }
  }
  if (tipo === 'heic') throw conCodigo('heic_no_compatible');
  throw new Error('ilegible');
}

const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', heic: 'image/heic', gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif' };

/** Tipo por los primeros bytes (y, si no se sabe, por la extensión). */
export function tipoDeImagen(bytes, nombre = '') {
  const b = bytes || new Uint8Array(0);
  const ascii = (i, n) => String.fromCharCode(...b.subarray(i, i + n));
  if (b[0] === 0x89 && ascii(1, 3) === 'PNG') return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp';
  if (ascii(0, 3) === 'GIF') return 'gif';
  if (ascii(0, 2) === 'BM') return 'bmp';
  if (ascii(4, 4) === 'ftyp') {
    const marcas = ascii(8, Math.min(32, Math.max(0, b.length - 8)));
    if (/avif|avis/.test(marcas)) return 'avif';
    if (/hei[cmsx]|hev[cmsx]|mif1|msf1/.test(marcas)) return 'heic';
  }
  const ext = String(nombre).toLowerCase().split('.').pop();
  if (ext === 'heic' || ext === 'heif') return 'heic';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  return MIME[ext] ? ext : null;
}

/**
 * Gris, contraste y texto oscuro sobre claro, en el sitio (RGBA). Dos pasadas por los píxeles, nada más.
 * @param {Uint8ClampedArray} d
 * @returns {{invertida: boolean, p2: number, p98: number}}
 */
export function prepararPixeles(d) {
  const n = d.length >> 2;
  const hist = new Uint32Array(256);
  for (let p = 0; p < d.length; p += 4) {
    // lo transparente cuenta como blanco
    const a = d[p + 3];
    let y = (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8;
    if (a < 255) y = Math.round((y * a + 255 * (255 - a)) / 255);
    d[p] = y;
    hist[y]++;
  }
  const p2 = percentil(hist, n * 0.02), p98 = percentil(hist, n * 0.98), mediana = percentil(hist, n * 0.5);
  const rango = p98 - p2;
  const estira = (v) => (rango >= 16 ? Math.min(255, Math.max(0, ((v - p2) * 255) / rango)) : v);
  const invertida = estira(mediana) < 110; // la mayor parte es oscura: fondo oscuro con letra clara
  const tabla = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    let s = estira(v);
    if (invertida) s = 255 - s;
    tabla[v] = Math.round(255 * Math.pow(s / 255, GAMMA));
  }
  for (let p = 0; p < d.length; p += 4) {
    const v = tabla[d[p]];
    d[p] = v; d[p + 1] = v; d[p + 2] = v; d[p + 3] = 255;
  }
  return { invertida, p2, p98 };
}

function percentil(hist, objetivo) {
  let acumulado = 0;
  for (let v = 0; v < 256; v++) {
    acumulado += hist[v];
    if (acumulado >= objetivo) return v;
  }
  return 255;
}

/**
 * Fila donde cortar un trozo: en la franja final, la más baja sin tinta; si no hay, la de menos tinta.
 * @returns {{fila: number, blanca: boolean}}
 */
export function buscarCorte(d, ancho, alto) {
  const desde = Math.max(SOLAPE, alto - VENTANA_CORTE);
  const hasta = alto - SOLAPE;
  const tolerancia = Math.max(2, Math.round(ancho * 0.002));
  let mejor = hasta, menos = Infinity;
  for (let y = hasta; y >= desde; y--) {
    let tinta = 0;
    for (let i = y * ancho * 4, f = i + ancho * 4; i < f; i += 4) if (d[i] < 128 && ++tinta > menos) break;
    if (tinta <= tolerancia) return { fila: y, blanca: true };
    if (tinta < menos) { menos = tinta; mejor = y; }
  }
  return { fila: mejor, blanca: false };
}

function pintarBlanco(d, ancho, desde, hasta) {
  d.fill(255, desde * ancho * 4, hasta * ancho * 4);
}

// =============================================================================================
// Hilo principal (lo usa motor.js; el worker de análisis nunca llama a esto)
// =============================================================================================

const VENDOR = new URL('../../../vendor/', import.meta.url);
const ESPERA_OCR = 180000; // la primera vez baja unos 6 MB (núcleo y modelos)
// Medido en Chrome con imágenes de prueba hechas a propósito (capturas claras y oscuras, fotos de papel rectas,
// torcidas y con sombra), a falta de fotos reales de bancos:
// - un solo bloque de texto (PSM 6): lee las filas enteras, de la fecha al importe; todas las fechas, importes y saldos;
// - umbral local de Sauvola: con la sombra del móvil sobre el papel pasa de 15 a 39 importes bien de 40, y no empeora lo limpio;
// - enderezar (rotateAuto) solo en fotos de cámara: en capturas no cambia nada y tarda un 40 % más.
const MODO_OCR = { tessedit_pageseg_mode: '6', thresholding_method: '2' };
const SIMD = [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11];
const SIMD_RELAJADO = [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 15, 1, 13, 0, 65, 1, 253, 15, 65, 2, 253, 15, 253, 128, 2, 11];

let tesseract = null; // Promise<worker de Tesseract>, uno por análisis
let alProgresoOcr = null;

/** Núcleo de Tesseract que entiende este navegador (SIMD relajado, SIMD o normal), todos «solo LSTM». */
export function nucleoOcr() {
  const vale = (b) => { try { return WebAssembly.validate(new Uint8Array(b)); } catch { return false; } };
  if (vale(SIMD_RELAJADO)) return 'tesseract-core-relaxedsimd-lstm.wasm.js';
  if (vale(SIMD)) return 'tesseract-core-simd-lstm.wasm.js';
  return 'tesseract-core-lstm.wasm.js';
}

/**
 * OCR de una imagen ya preparada. Reutiliza el worker de Tesseract del análisis.
 * @param {Blob} imagen
 * @param {{ancho?: number, alto?: number, foto?: boolean}} info  foto: de cámara (se endereza)
 * @param {(p: {status: string, progress: number}) => void} [alProgreso]
 * @returns {Promise<{palabras: Array<{texto, x0, x1, y0, y1, confianza}>, ancho: number, alto: number, confianza: number|null}>}
 */
export async function reconocer(imagen, info = {}, alProgreso = null) {
  alProgresoOcr = alProgreso;
  if (!tesseract) {
    const p = crearTesseract();
    tesseract = p;
    p.catch(() => { if (tesseract === p) tesseract = null; });
  }
  const { data } = await (await tesseract).recognize(imagen, { ...MODO_OCR, rotateAuto: Boolean(info.foto) }, { blocks: true, text: false });
  const palabras = palabrasDeTesseract(data);
  let { ancho, alto } = info;
  if (!(ancho > 0 && alto > 0)) { const b = await createImageBitmap(imagen); ancho = b.width; alto = b.height; b.close(); }
  return { palabras, ancho, alto, confianza: Number.isFinite(data.confidence) ? data.confidence / 100 : null };
}

/**
 * Palabras del resultado de Tesseract (bloques → párrafos → líneas → palabras), con su caja, su confianza (0..1) y
 * «linea»: el número de línea de Tesseract en toda la imagen. filas.js agrupa por él, que aguanta mejor que la
 * geometría una foto torcida o doblada.
 * @returns {Array<{texto: string, x0: number, x1: number, y0: number, y1: number, confianza: number, linea: number}>}
 */
export function palabrasDeTesseract(data) {
  const palabras = [];
  let linea = 0;
  for (const b of data?.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    for (const x of l.words || []) {
      const texto = String(x.text || '').trim();
      if (texto && x.bbox) palabras.push({ texto, x0: x.bbox.x0, x1: x.bbox.x1, y0: x.bbox.y0, y1: x.bbox.y1, confianza: Math.max(0, Math.min(1, (x.confidence || 0) / 100)), linea });
    }
    linea++;
  }
  return palabras;
}

/**
 * Tesseract spa+cat, sin caché propia (cacheMethod 'none': nada de IndexedDB). Su worker sale de un blob: para que
 * herede el service worker de la página (si el navegador no deja, se abre por su URL).
 */
async function crearTesseract() {
  if (typeof WebAssembly !== 'object') throw conCodigo('navegador_antiguo');
  const T = (await import(new URL('tesseract-7.0.0/tesseract.esm.min.js', VENDOR).href)).default;
  for (const blob of [true, false]) {
    let caer, reloj;
    const caida = new Promise((_, mal) => { caer = mal; reloj = setTimeout(() => mal(conCodigo('ocr_no_disponible')), ESPERA_OCR); });
    caida.catch(() => {});
    const creando = T.createWorker(['spa', 'cat'], 1, {
      workerPath: new URL('tesseract-7.0.0/worker.min.js', VENDOR).href,
      corePath: new URL('tesseract-core-7.0.0/' + nucleoOcr(), VENDOR).href,
      langPath: new URL('tessdata-fast-4.1.0', VENDOR).href,
      gzip: true,
      cacheMethod: 'none',
      workerBlobURL: blob,
      logger: (p) => { try { alProgresoOcr?.(p); } catch { /* el progreso nunca para el OCR */ } },
      errorHandler: (err) => caer(err), // sin esto, un fallo al cargar los modelos dejaría la promesa colgada
    });
    try {
      return await Promise.race([creando, caida]);
    } catch {
      creando.then((w) => w.terminate(), () => {});
      if (globalThis.navigator?.onLine === false) break;
    } finally {
      clearTimeout(reloj);
    }
  }
  throw conCodigo(globalThis.navigator?.onLine === false ? 'necesita_conexion' : 'ocr_no_disponible');
}

/** Cierra el OCR (al acabar cada análisis) y, con todo = true, también los HEIC que estén abiertos. */
export function cerrarOcr(todo = false) {
  const p = tesseract;
  tesseract = null;
  alProgresoOcr = null;
  p?.then((w) => w.terminate(), () => {});
}

/**
 * Imagen para compartir, 1080×1080: solo la frase del total, la mascota y feehund.com/extracto.
 * Crema de fondo, tinta en la cifra y petróleo en la dirección; Atkinson Hyperlegible Next 800 o la del sistema.
 * @param {string} frase «312 €/año», ya en su idioma
 * @returns {Promise<Blob>} PNG
 */
export async function dibujarCompartir(frase) {
  const [familia, mascota] = await Promise.all([fuenteCifra(), imagenMascota()]);
  const L = 1080;
  const lienzo = typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: L, height: L }) : new OffscreenCanvas(L, L);
  const c = lienzo.getContext('2d');
  c.fillStyle = '#FFF8EC';
  c.fillRect(0, 0, L, L);
  if (mascota) {
    const ancho = Math.min(860, mascota.width * 3), alto = (ancho * mascota.height) / mascota.width;
    c.drawImage(mascota, (L - ancho) / 2, 300 - alto / 2, ancho, alto);
    mascota.close?.();
  }
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.fillStyle = '#14213D';
  let tam = 180;
  do { c.font = `800 ${tam}px ${familia}`; tam -= 6; } while (c.measureText(frase).width > 960 && tam > 40);
  c.fillText(frase, L / 2, 690);
  c.fillStyle = '#0E5E6F';
  c.font = `800 56px ${familia}`;
  c.fillText('feehund.com/extracto', L / 2, 920);
  if (lienzo.convertToBlob) return lienzo.convertToBlob({ type: 'image/png' });
  return new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se ha podido crear la imagen'))), 'image/png'));
}

let fuente = null;
function fuenteCifra() {
  fuente ??= (async () => {
    const sistema = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    try {
      const url = new URL('../../fonts/atkinson-next-800.woff2', import.meta.url).href;
      const f = new FontFace('Atkinson Hyperlegible Next', `url("${url}")`, { weight: '800' });
      await f.load();
      (globalThis.document?.fonts ?? globalThis.fonts)?.add(f);
      return `"Atkinson Hyperlegible Next", ${sistema}`;
    } catch {
      return sistema; // sin la fuente de la web: la del sistema
    }
  })();
  return fuente;
}

async function imagenMascota() {
  try {
    const r = await fetch(new URL('../mascota.png', import.meta.url));
    return r.ok ? await createImageBitmap(await r.blob()) : null;
  } catch {
    return null;
  }
}

function conCodigo(codigo) {
  return Object.assign(new Error(codigo), { codigo });
}
