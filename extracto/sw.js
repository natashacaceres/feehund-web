// Service worker del lector de extractos. Alcance: /extracto/.
// Solo guarda archivos de esta web que están en las listas de assets/extracto/recursos.js
// (globalThis.RECURSOS_EXTRACTO = {PAGINA, LECTORES, OCR}, rutas desde la raíz de la web):
//   PAGINA y LECTORES al instalarse; OCR cuando la página manda 'precachear-ocr'.
// Nunca guarda nada de la persona: ni respuestas de POST, ni blob:, ni data:, ni nada fuera de las listas.
// recursos.js se carga con importScripts, así el navegador reinstala este service worker cuando cambia la lista.
// Al publicar cambios en un archivo de las listas sin tocar la lista, sube VERSION (o la versión de recursos.js).
//
// Versiones sin mezclas: la página y sus archivos salen siempre de la misma copia (la de esta versión).
// Una versión nueva se instala aparte, en su propia caché, y entra cuando se cierran todas las pestañas de /extracto/.
// Hasta entonces la página sigue entera en la versión anterior: nunca HTML nuevo con código viejo.
// Los archivos de las listas casan aunque se pidan con «?v=…» (el export del diseño lo añade): la versión la da la caché.
'use strict';

const VERSION = '2026-11-09.1';
const PREFIJO = 'feehund-extracto-';
const RAIZ = new URL('../', self.location.href).href; // las rutas de las listas son relativas a la raíz de la web
const ALCANCE = new URL(self.registration.scope).pathname; // '/extracto/'
const RECURSOS_JS = new URL('assets/extracto/recursos.js', RAIZ).href;
const RECURSOS_JSON = new URL('assets/extracto/recursos.json', RAIZ).href; // lista provisional, si no hay recursos.js

// Núcleos de Tesseract (igual que nucleoOcr() de lectores/imagen.js): se guarda solo el que puede usar este navegador
const SIMD = [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11];
const SIMD_RELAJADO = [0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 15, 1, 13, 0, 65, 1, 253, 15, 65, 2, 253, 15, 253, 128, 2, 11];

let deScript = null;
try {
  importScripts(RECURSOS_JS);
  deScript = self.RECURSOS_EXTRACTO || null;
} catch { /* no existe o no es un script clásico: al instalar se prueba recursos.json */ }

let listas = null; // { fuente, PAGINA, LECTORES, OCR, todas: Set }
try { if (deScript) listas = prepararListas(deScript, RECURSOS_JS); } catch { listas = null; }
// El nombre de la caché cambia con la lista: una lista nueva nunca se mezcla con la copia anterior
const CACHE = PREFIJO + VERSION + (listas ? '-' + huella(JSON.stringify(deScript)) : '');
let cargando = null;
let ocrEnCurso = null;

// ---------- Listas de recursos ----------

/** FNV-1a de 32 bits en base 36: una huella corta del contenido de la lista. */
function huella(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

/** Rutas de la lista → URL absolutas del mismo origen, sin repetir. */
function aURLs(rutas) {
  const fuera = new Set();
  for (const r of Array.isArray(rutas) ? rutas : []) {
    if (typeof r !== 'string' || !r.trim()) continue;
    const u = new URL(r.trim(), RAIZ);
    if (u.origin !== self.location.origin) continue; // nunca se guarda nada de otra web
    u.hash = '';
    fuera.add(u.href);
  }
  return [...fuera];
}

function prepararListas(datos, fuente) {
  // Las listas pueden estar arriba del todo o dentro de un objeto (p. ej. {version, listas: {…}})
  const buscar = (obj, nombre, hondo) => {
    if (!obj || typeof obj !== 'object') return null;
    const k = Object.keys(obj).find((x) => x.toUpperCase() === nombre);
    if (k && Array.isArray(obj[k])) return obj[k];
    if (hondo) for (const v of Object.values(obj)) { const r = buscar(v, nombre, false); if (r) return r; }
    return null;
  };
  const de = (nombre) => aURLs(buscar(datos, nombre, true));
  const l = { fuente, PAGINA: de('PAGINA'), LECTORES: de('LECTORES'), OCR: de('OCR') };
  if (!l.PAGINA.length) throw new Error('La lista PAGINA está vacía');
  l.todas = new Set([...l.PAGINA, ...l.LECTORES, ...l.OCR, fuente]);
  // Cada archivo también por su dirección sin «?…», para casar «motor.js?v=2» con «motor.js»
  l.porBase = new Map();
  for (const u of l.todas) {
    const b = sinConsulta(u);
    if (!l.porBase.has(b)) l.porBase.set(b, u);
  }
  return l;
}

/** URL sin «?…» ni «#…». */
function sinConsulta(u) {
  const x = new URL(u);
  return x.origin + x.pathname;
}

/** Clave en la caché de una petición: la URL tal cual si está en las listas; si no, la de la lista sin la consulta. */
function claveDe(l, url) {
  if (l.todas.has(url.href)) return url.href;
  return l.porBase.get(url.origin + url.pathname) ?? null;
}

/** Lo de la lista OCR que hace falta en este navegador (un solo núcleo de Tesseract de los tres). */
function ocrDeEsteNavegador(l) {
  const vale = (b) => { try { return WebAssembly.validate(new Uint8Array(b)); } catch { return false; } };
  const nucleo = vale(SIMD_RELAJADO) ? 'tesseract-core-relaxedsimd-lstm.wasm.js' : vale(SIMD) ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js';
  return l.OCR.filter((u) => !u.includes('/tesseract-core-') || u.endsWith('/' + nucleo));
}

/** El código con los comentarios cambiados por espacios (las cadenas se quedan como están). */
function sinComentarios(c) {
  let s = '';
  for (let i = 0; i < c.length;) {
    const ch = c[i];
    let fin = i + 1;
    if (ch === '/' && c[i + 1] === '/') fin = c.indexOf('\n', i) < 0 ? c.length : c.indexOf('\n', i);
    else if (ch === '/' && c[i + 1] === '*') fin = c.indexOf('*/', i + 2) < 0 ? c.length : c.indexOf('*/', i + 2) + 2;
    else if (ch === "'" || ch === '"' || ch === '`') {
      while (fin < c.length && c[fin] !== ch) fin += c[fin] === '\\' ? 2 : 1;
      fin = Math.min(fin + 1, c.length);
      s += c.slice(i, fin);
      i = fin;
      continue;
    } else { s += ch; i = fin; continue; }
    s += c.slice(i, fin).replace(/[^\n]/g, ' ');
    i = fin;
  }
  return s;
}

/** Cadenas de una lista literal que empieza en codigo[i] (justo después de «[»), o null si no es literal. */
function cadenasLiterales(codigo, i) {
  const cadenas = [];
  for (; i < codigo.length; i++) {
    const c = codigo[i];
    if (c === ']') return cadenas;
    if (c === "'" || c === '"' || c === '`') {
      let s = '';
      for (i++; i < codigo.length && codigo[i] !== c; i++) {
        if (c === '`' && codigo[i] === '$' && codigo[i + 1] === '{') return null;
        s += codigo[i] === '\\' ? codigo[++i] : codigo[i];
      }
      cadenas.push(s);
    } else if (!/[\s,]/.test(c)) {
      return null; // variables, «...» o llamadas: no se adivina
    }
  }
  return null;
}

/**
 * Por si recursos.js fuera un módulo con export (importScripts no puede con él): se leen sus listas literales
 * sin ejecutar nada. Si una lista aparece pero no es literal, falla: mejor no instalar que decir
 * «listo sin conexión» con archivos de menos.
 */
function listasDeModulo(codigo) {
  const limpio = sinComentarios(codigo);
  const datos = {};
  const vistas = new Set();
  const re = /\b(PAGINA|LECTORES|OCR)\b['"]?\s*[:=]\s*\[/gi;
  let m;
  while ((m = re.exec(limpio))) {
    const nombre = m[1].toUpperCase();
    vistas.add(nombre);
    const cadenas = cadenasLiterales(limpio, re.lastIndex);
    if (cadenas) datos[nombre] = cadenas;
  }
  for (const n of vistas) if (!datos[n]) throw new Error('Lista no literal: ' + n);
  return datos;
}

async function interpretar(respuesta, fuente) {
  const texto = await respuesta.text();
  return prepararListas(fuente.endsWith('.json') ? JSON.parse(texto) : listasDeModulo(texto), fuente);
}

/** Sin recursos.js clásico: las listas de recursos.json (o del módulo), con su respuesta para guardarla. */
async function listasDeLaRed() {
  for (const fuente of [RECURSOS_JSON, RECURSOS_JS]) {
    const r = await fetch(fuente, { cache: 'reload' });
    if (r.ok) return { listas: await interpretar(r.clone(), fuente), respuesta: r };
  }
  throw new Error('No hay lista de recursos');
}

/** Las listas en memoria; tras un reinicio sin recursos.js clásico, las que se guardaron con la copia. */
function obtenerListas() {
  if (listas) return Promise.resolve(listas);
  if (!cargando) {
    cargando = (async () => {
      const cache = await caches.open(CACHE);
      for (const fuente of [RECURSOS_JSON, RECURSOS_JS]) {
        const r = await cache.match(fuente, { ignoreVary: true });
        if (r) return (listas = await interpretar(r, fuente));
      }
      return null;
    })().catch(() => null).finally(() => { cargando = null; });
  }
  return cargando;
}

// ---------- Estado para la página ----------

async function estado() {
  const l = await obtenerListas();
  if (!l) return { listo: false, ocr: false };
  const cache = await caches.open(CACHE);
  const guardadas = new Set((await cache.keys()).map((r) => r.url));
  const completa = (urls) => urls.length > 0 && urls.every((u) => guardadas.has(u));
  return { listo: completa([...l.PAGINA, ...l.LECTORES]), ocr: completa(ocrDeEsteNavegador(l)) };
}

function mensajes(e) {
  const m = [];
  if (e.listo) m.push('listo-sin-conexion');
  if (e.ocr) m.push('ocr-listo-sin-conexion');
  return m;
}

/** Manda los mensajes a un cliente o a todas las pestañas de /extracto/. */
async function avisar(lista, destino) {
  if (!lista.length) return;
  const clientes = destino ? [destino] : await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of clientes) {
    if (!destino && !new URL(c.url).pathname.startsWith(ALCANCE)) continue;
    for (const m of lista) c.postMessage(m);
  }
}

// ---------- Ciclo de vida ----------

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    let l = listas, respuesta = null;
    if (!l) ({ listas: l, respuesta } = await listasDeLaRed());
    const cache = await caches.open(CACHE);
    const urls = [...new Set([...l.PAGINA, ...l.LECTORES, l.fuente])].filter((u) => !(respuesta && u === l.fuente));
    // Todo o nada: si falta un archivo, la instalación falla y no se dice «listo» sin estarlo
    await cache.addAll(urls.map((u) => new Request(u, { cache: 'reload' })));
    if (respuesta) await cache.put(l.fuente, respuesta);
    listas = l;
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter((n) => n.startsWith(PREFIJO) && n !== CACHE).map((n) => caches.delete(n)));
    // La página sale de la copia: la precarga de navegación solo haría una petición inútil (una versión anterior la encendía)
    if (self.registration.navigationPreload) await self.registration.navigationPreload.disable().catch(() => {});
    await self.clients.claim();
    await avisar(mensajes(await estado().catch(() => ({})))); // las pestañas abiertas ya pueden trabajar sin conexión
  })());
});

// ---------- Mensajes de la página ----------

async function precachearOcr() {
  const l = await obtenerListas();
  if (!l) return;
  const cache = await caches.open(CACHE);
  const guardadas = new Set((await cache.keys()).map((r) => r.url));
  // De uno en uno para no llenar la memoria del móvil; lo que ya está no se vuelve a bajar
  for (const u of ocrDeEsteNavegador(l)) {
    if (guardadas.has(u)) continue;
    try { await cache.add(new Request(u, { cache: 'reload' })); } catch { /* se reintenta la próxima vez */ }
  }
  const e = await estado();
  if (e.ocr) await avisar(['ocr-listo-sin-conexion']);
}

self.addEventListener('message', (event) => {
  const tipo = typeof event.data === 'string' ? event.data : event.data && event.data.tipo;
  if (tipo === 'precachear-ocr') {
    if (!ocrEnCurso) ocrEnCurso = precachearOcr().catch(() => {}).finally(() => { ocrEnCurso = null; });
    event.waitUntil(ocrEnCurso);
  } else if (tipo === 'activar') {
    // La página lo pide solo cuando no está analizando nada: así la versión nueva entra sin esperar a cerrar pestañas
    self.skipWaiting();
  } else if (tipo === 'estado') {
    event.waitUntil(estado().then((e) => avisar(mensajes(e), event.source)).catch(() => {}));
  }
});

// ---------- Peticiones ----------

async function cachePrimero(event, clave) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(clave, { ignoreVary: true });
  if (guardada) return guardada;
  // Solo pasa con lo de OCR aún no guardado (PAGINA y LECTORES se guardan todos al instalar)
  const r = await fetch(event.request);
  // Está en las listas: se guarda con la clave de la lista (sin la consulta) para la próxima vez
  if (r.ok && r.type === 'basic' && !r.redirected) event.waitUntil(cache.put(clave, r.clone()).catch(() => {}));
  return r;
}

/** Copia guardada de una página de /extracto/ (sin ?lang=…), o una redirección a su versión con barra final. */
async function copiaDeNavegacion(url) {
  const cache = await caches.open(CACHE);
  const base = url.origin + url.pathname; // sin ?lang=…
  let r = await cache.match(base, { ignoreVary: true });
  if (!r && base.endsWith('/index.html')) r = await cache.match(base.slice(0, -'index.html'.length), { ignoreVary: true });
  if (!r && !base.endsWith('/') && (await cache.match(base + '/', { ignoreVary: true }))) {
    return Response.redirect(url.pathname + '/' + url.search, 308); // como Cloudflare: carpeta sin barra → con barra
  }
  if (!r) return null;
  // Una respuesta que vino de una redirección no sirve para una navegación: se copia limpia
  if (r.redirected) r = new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: r.headers });
  return r;
}

/**
 * Página de /extracto/: si está en la copia de esta versión, sale de ahí, con o sin red. Así la página y sus archivos
 * son siempre de la misma versión. Lo que no está en la copia va a la red.
 */
// La página y sus archivos de diseño (CSS, app.js, imágenes, fuentes) son de Design y se suben sin regenerar
// recursos.js: van a la red primero y la copia guardada solo se usa sin conexión. Así un cambio de diseño se ve
// en cuanto se publica. El motor (/assets/extracto/, /vendor/, /data/) sí va con su versión, caché primero.
const DEL_MOTOR = /^\/(assets\/extracto\/|vendor\/|data\/)/;

async function navegar(event, url) {
  try {
    const r = await fetch(event.request);
    if (r.ok && r.type === 'basic' && !r.redirected) {
      const base = url.origin + url.pathname;
      event.waitUntil(caches.open(CACHE).then(async (c) => { if (await c.match(base, { ignoreVary: true })) await c.put(base, r.clone()); }).catch(() => {}));
    }
    return r;
  } catch {
    const copia = await copiaDeNavegacion(url).catch(() => null);
    return copia || Response.error();
  }
}

async function redPrimero(event, clave) {
  const cache = await caches.open(CACHE);
  try {
    const r = await fetch(event.request);
    if (r.ok && r.type === 'basic' && !r.redirected) event.waitUntil(cache.put(clave, r.clone()).catch(() => {}));
    return r;
  } catch {
    const guardada = await cache.match(clave, { ignoreVary: true });
    if (guardada) return guardada;
    throw new Error('sin conexión');
  }
}

const servir = (event, url, clave) => (DEL_MOTOR.test(url.pathname) ? cachePrimero(event, clave) : redPrimero(event, clave));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST y demás: no se tocan
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // otras webs: no se tocan
  if (req.mode === 'navigate') {
    if (url.pathname.startsWith(ALCANCE)) event.respondWith(navegar(event, url));
    return;
  }
  if (req.headers.has('range')) return; // trozos de archivo: no se tocan
  url.hash = '';
  if (listas) {
    const clave = claveDe(listas, url);
    if (clave) event.respondWith(servir(event, url, clave));
    return;
  }
  // Sin recursos.js clásico y recién arrancado: hay que leer las listas guardadas antes de decidir
  event.respondWith(obtenerListas().then((l) => {
    const clave = l && claveDe(l, url);
    return clave ? servir(event, url, clave) : fetch(req);
  }));
});
