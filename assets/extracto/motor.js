// API del lector de extractos y del datáfono (hilo principal). Al importarse no carga nada. Nada sale del dispositivo
// ni se guarda (DESARROLLO.md). Los workers arrancan desde un blob: que importa el archivo real (sin conexión).

const MAX_BYTES = 10 * 1024 * 1024; // por archivo; de una vez, 100 archivos o 100 MB como mucho
const ESPERA_LISTO = 60000; // ms que se espera a que un worker arranque
const RESERVA = { // por si ni textos.js se pudiera cargar
  es: 'Algo ha fallado. No se ha enviado nada. Prueba otra vez.',
  ca: 'Alguna cosa ha fallat. No s\'ha enviat res. Torna-ho a provar.',
  en: 'Something went wrong. Nothing was sent. Please try again.',
};

let motor = null; // Promise<Worker> del análisis
let motorConControl = false;
let renovar = false; // falló un import: el worker recuerda el fallo y el siguiente análisis va a otro
let siguienteId = 1;
const tareas = new Map(); // id → tarea, desde que se pide hasta que se entrega
let extras = null; // carga de recalcular.js, montaje.js y textos
const mod = {}; // módulos cargados a demanda (o su promesa mientras llegan)

/**
 * Lee los extractos y busca los cobros que se repiten, en este dispositivo. Lo que falla en un archivo va en
 * resultado.errores; si no se puede analizar nada, falla con un Error (message: frase para la persona; .codigo).
 * @param {File|Blob|File[]|FileList|string|{archivos?, texto?}} entrada archivos o texto pegado
 * @param {Object} [opciones] idioma, hoy, contrasenas y mapeo (por archivo), onProgreso ({fase, texto, archivo?,
 *   pagina?, total?, progreso?}; fase leyendo|foto|pagina|preparando_fotos|saldo|cobros; progreso 0..1).
 * @returns {Promise<Object>} resultado (DESARROLLO.md, «Resultado de la API», más no_contados)
 */
export async function analizar(entrada, opciones = {}) {
  return pedirLectura('analizar', entrada, opciones, ['contrasenas', 'mapeo', 'hoy']);
}

/** Lector del datáfono (DESARROLLO.md): opciones idioma, hoy, mes, contrasenas y onProgreso. */
export async function analizarResumen(entrada, opciones = {}) {
  return pedirLectura('resumen', entrada, opciones, ['contrasenas', 'hoy', 'mes']);
}

function pedirLectura(tipo, entrada, opciones, claves) {
  const idioma = idiomaDe(opciones.idioma);
  const t = tarea(idioma, opciones);
  (async () => {
    obtenerMotor(); // arranca mientras se leen los archivos
    const { archivos, texto } = (await cargar('montaje', './montaje.js')).separarEntrada(entrada);
    if (!archivos.length && !texto) return acabar(t, 'nada_que_leer');
    const lista = [], transferir = [];
    let total = 0;
    for (const f of archivos) {
      const tamano = Number(f.size) || 0;
      const a = { nombre: String(f.name || 'archivo'), tipo: f.type || '', tamano, bytes: null };
      if (tamano > 0 && tamano <= MAX_BYTES) { // vacíos y grandes ni se leen: el worker da el error
        if (transferir.length >= 100 || (total += tamano) > 10 * MAX_BYTES) a.demasiados = true;
        else try { a.bytes = await f.arrayBuffer(); transferir.push(a.bytes); } catch { a.ilegible = true; }
        if (t.fin) return; // olvidar() mientras se leía: nada llega al worker
      }
      lista.push(a);
    }
    const o = { idioma };
    for (const k of claves) o[k] = opciones[k];
    await enviar(t, tipo, { archivos: lista, texto, opciones: o }, transferir);
  })().catch(() => acabar(t, sinRed() ? 'necesita_conexion' : 'desconocido_interno'));
  return t.promesa;
}

/**
 * Vuelve a validar y detectar con la tabla de fotos ya corregida, sin releer archivos ni guardar nada.
 * @param {Object|Array} correcciones {[id]: {importe?, fecha?, concepto?, eliminar?}} o [{id, …, quitar?}]
 * @returns {Promise<Object>} resultado nuevo (necesita_confirmacion: false)
 */
export async function confirmar(resultado, correcciones = {}, opciones = {}) {
  const idioma = idiomaDe(opciones.idioma || resultado?.idioma);
  if (!resultado?.lectura) throw await fallo('nada_que_leer', idioma);
  const t = tarea(idioma, opciones);
  enviar(t, 'confirmar', { resultado, correcciones, opciones: { idioma, hoy: opciones.hoy || resultado.hoy } }, [])
    .catch(() => acabar(t, 'desconocido_interno'));
  return t.promesa;
}

/** Totales sin los cobros desmarcados, en una copia. Síncrona: su módulo se carga antes de entregar un resultado. */
export function recalcular(resultado, idsDesmarcados = []) {
  return cargado('recalcular').recalcular(resultado, [...idsDesmarcados]);
}

/**
 * Calendario .ics: un evento por cobro en su próximo cargo, con aviso 3 días antes (20 los anuales). Síncrona.
 * Opciones: {idioma?, hoy?, desmarcados?}. @returns {string|null} null si no hay ningún cobro (no se ofrece nada)
 */
export function generarICS(resultado, opciones = {}) {
  return cargado('montaje').generarICS(resultado, opciones);
}

/**
 * PNG de 1080×1080 con el total al año («312 €/año»), la mascota y feehund.com/extracto. Nada más.
 * @param {number|string} total euros al año, ≥ 0; null, vacío o lo que no sea un número → TypeError
 * @returns {Promise<Blob>}
 */
export async function generarImagenCompartir(total, opciones = {}) {
  const idioma = idiomaDe(opciones.idioma);
  // sin total no hay imagen: nunca un «0 €/año» falso; «1.234» tampoco se adivina
  const n = typeof total === 'number' ? total : /^\s*\d+(?:[.,]\d{1,2})?\s*$/.test(total) ? Number(total.trim().replace(',', '.')) : NaN;
  if (!Number.isFinite(n) || n < 0) throw new TypeError('El total tiene que ser un número de euros');
  const [t, f] = await Promise.all([textos(), cargarFotos()]);
  const cifra = new Intl.NumberFormat(idioma + (idioma === 'en' ? '-GB' : '-ES'), { maximumFractionDigits: 0 }).format(Math.round(n));
  return f.dibujarCompartir(t.texto('compartir_total', idioma, { cifra }));
}

// ---------- Sin conexión (service worker) ----------

/** ¿Están guardadas las listas de recursos.js? @returns {Promise<{pagina, lectores, ocr, listo}>} booleanos */
export async function estadoSinConexion() {
  const e = { pagina: false, lectores: false, ocr: false, listo: false };
  try {
    await import('./recursos.js');
    const R = globalThis.RECURSOS_EXTRACTO, hay = new Set();
    for (const n of await caches.keys()) if (n.startsWith('feehund-extracto')) for (const r of await (await caches.open(n)).keys()) hay.add(new URL(r.url).pathname);
    const esta = (u) => hay.has(new URL(u, new URL('../../', import.meta.url)).pathname), nucleo = (u) => u.includes('/tesseract-core-');
    const todas = (l) => l.length > 0 && l.every(esta);
    e.pagina = todas(R.PAGINA);
    e.lectores = todas(R.LECTORES);
    e.ocr = todas(R.OCR.filter((u) => !nucleo(u))) && R.OCR.some((u) => nucleo(u) && esta(u)); // un núcleo: el de este navegador
    e.listo = e.pagina && e.lectores;
  } catch { /* sin caché: todo false */ }
  return e;
}

/** Registra /extracto/sw.js con alcance /extracto/. @returns {Promise<ServiceWorkerRegistration|null>} */
export async function registrarSinConexion() {
  return (await sw()?.register(url('../../extracto/sw.js'), { scope: url('../../extracto/') }).catch(() => null)) ?? null;
}

/** Escucha al service worker: cb({tipo: 'listo-sin-conexion'|'ocr-listo-sin-conexion'}). Devuelve cómo dejar de escuchar. */
export function onEstadoSinConexion(cb) {
  const s = sw();
  if (!s || typeof cb !== 'function') return () => {};
  const f = (e) => {
    const tipo = typeof e.data === 'string' ? e.data : e.data?.tipo;
    if (tipo === 'listo-sin-conexion' || tipo === 'ocr-listo-sin-conexion') cb({ tipo });
  };
  s.addEventListener('message', f);
  s.startMessages?.();
  s.controller?.postMessage({ tipo: 'estado' });
  return () => s.removeEventListener('message', f);
}

/** Pide al service worker que guarde en segundo plano lo de las fotos (OCR y HEIC). @returns {Promise<boolean>} */
export async function pedirOcrSinConexion() {
  const s = sw();
  const activo = s && (s.controller || (await s.getRegistration(url('../../extracto/')))?.active);
  activo?.postMessage({ tipo: 'precachear-ocr' });
  return Boolean(activo);
}

/** Cierra los workers (análisis, OCR y HEIC) y suelta lo que haya en memoria. Lo pendiente falla con «cancelado». */
export function olvidar() {
  for (const t of [...tareas.values()]) acabar(t, 'cancelado');
  cerrarMotor();
  cerrarOcr(true);
}

// ---------- Tareas y workers ----------

/** Una llamada a analizar() o confirmar(). Existe desde el principio: olvidar() la alcanza siempre. */
function tarea(idioma, o) {
  const t = { id: siguienteId++, idioma, onProgreso: o.onProgreso || o.progreso, ultimo: null, fin: false };
  t.promesa = new Promise((ok, mal) => { t.ok = ok; t.mal = mal; });
  tareas.set(t.id, t);
  return t;
}

/** Entrega una tarea una sola vez: con un código (un Error con su frase), con un Error o con el resultado. */
function acabar(t, error, valor) {
  if (t.fin) return;
  t.fin = true;
  t.enviada = false;
  tareas.delete(t.id);
  if (!tareas.size) cerrarOcr(); // un Tesseract por análisis
  if (typeof error === 'string') fallo(error, t.idioma).then(t.mal);
  else if (error) t.mal(error);
  else t.ok(valor);
}

/** Worker de módulo desde un blob: (hereda el service worker) o, si no se puede, por su URL. Espera su «listo». */
function abrirWorker(ruta) {
  const real = url(ruta);
  const probar = (puente) => new Promise((ok, mal) => {
    let w, enlace = null, reloj;
    try {
      if (puente) enlace = URL.createObjectURL(new Blob([`import ${JSON.stringify(real)};`], { type: 'text/javascript' }));
      w = new Worker(enlace || real, { type: 'module' });
    } catch (e) {
      if (enlace) URL.revokeObjectURL(enlace);
      return mal(e);
    }
    const fin = (bien) => {
      clearTimeout(reloj);
      if (enlace) URL.revokeObjectURL(enlace);
      w.onmessage = w.onerror = null;
      if (bien) return ok(w);
      w.terminate();
      mal(new Error('worker'));
    };
    reloj = setTimeout(fin, ESPERA_LISTO);
    w.onmessage = (e) => { if (e.data?.tipo === 'listo') fin(true); };
    w.onerror = (e) => { e.preventDefault?.(); fin(); };
  });
  return probar(true).catch(() => probar(false));
}

function obtenerMotor() {
  const conControl = Boolean(sw()?.controller);
  // Uno nuevo si hay service worker y este se abrió sin él, o si falló; nunca si trabaja
  if (motor && (renovar || (conControl && !motorConControl)) && ![...tareas.values()].some((t) => t.enviada)) cerrarMotor();
  if (!motor) {
    motorConControl = conControl;
    renovar = false;
    const p = abrirWorker('./worker.js').then((w) => { w.onmessage = alMensaje; w.onerror = alCaer; return w; });
    motor = p;
    p.catch(() => { if (motor === p) motor = null; });
  }
  return motor;
}

function cerrarMotor() {
  const p = motor;
  motor = null;
  p?.then((w) => w.terminate(), () => {});
}

async function enviar(t, tipo, datos, transferir) {
  for (;;) {
    const p = obtenerMotor();
    let w;
    try { w = await p; } catch { return acabar(t, sinRed() ? 'necesita_conexion' : 'navegador_antiguo'); }
    if (t.fin) return; // olvidar() mientras arrancaba
    if (motor !== p) continue; // se cambió por otro mientras arrancaba: al nuevo
    t.enviada = true;
    return w.postMessage({ id: t.id, tipo, ...datos }, transferir);
  }
}

function alMensaje(e) {
  const m = e.data || {}, t = tareas.get(m.id);
  if (m.tipo === 'progreso') { if (t) { t.ultimo = m; avisar(t, m); } return; }
  if (m.tipo === 'ocr' || m.tipo === 'heic') return atender(e.target, m, t);
  if ((m.tipo !== 'resultado' && m.tipo !== 'fallo') || !t) return;
  t.enviada = false;
  if (m.tipo === 'fallo' || m.resultado?.errores?.some((x) => /^(necesita_conexion|busqueda_fallida)$/.test(x?.codigo))) renovar = true;
  if (m.tipo === 'fallo') acabar(t, Object.assign(new Error(m.texto || RESERVA[t.idioma]), { codigo: m.codigo }));
  else cargarExtras().then(() => acabar(t, null, m.resultado)); // si olvidar() llega antes, no se entrega
}

/** Responde siempre a una petición del worker (OCR o HEIC): el trabajo hecho o un fallo (montaje.js). */
async function atender(w, m, t) {
  let r = [{ tipo: 'fallo_peticion', codigo: sinRed() ? 'necesita_conexion' : m.tipo === 'ocr' ? 'ocr_no_disponible' : 'heic_ilegible' }, []];
  try {
    if (!t || t.fin) throw 0;
    const [fotos, mo] = await Promise.all([cargarFotos(), cargar('montaje', './montaje.js'), textos()]);
    r = await mo.atenderPeticion(m, {
      fotos, abrirWorker, cerrarOcr, sinRed, idioma: t.idioma, cancelada: () => t.fin, ultimo: () => t.ultimo, alProgreso: (ev) => avisar(t, ev),
    });
  } catch { /* sin lectores/imagen.js o sin montaje.js: el fallo de arriba */ }
  try { w.postMessage({ ...r[0], peticion: m.peticion }, r[1]); } catch { w.postMessage({ tipo: 'fallo_peticion', peticion: m.peticion, codigo: 'ocr_no_disponible' }); }
}

/** El worker se ha caído (sin memoria, por ejemplo): lo que tenía falla y el siguiente análisis abre otro. */
function alCaer(e) {
  e.preventDefault?.();
  cerrarMotor();
  for (const t of [...tareas.values()]) if (t.enviada) acabar(t, 'motor_parado');
}

function avisar(t, m) {
  const { id, tipo, ...ev } = m; // eslint-disable-line no-unused-vars
  try { t.onProgreso?.(ev); } catch (err) { console.error(err); }
}

/** Cierra Tesseract (y con todo, los HEIC abiertos), también si lectores/imagen.js aún se está cargando. */
function cerrarOcr(todo = false) {
  const m = mod.imagen;
  if (typeof m?.then === 'function') m.then((x) => x.cerrarOcr(todo), () => {});
  else m?.cerrarOcr(todo);
}

// ---------- Módulos a demanda ----------

function cargar(nombre, ruta) {
  mod[nombre] ??= import(ruta).then((m) => (mod[nombre] = m), (err) => { delete mod[nombre]; throw err; });
  return Promise.resolve(mod[nombre]);
}

const cargarFotos = () => cargar('imagen', './lectores/imagen.js');
const textos = () => cargar('textos', './textos.js').then(async (m) => { await m.cargarTextos(); return m; });

function cargarExtras() {
  extras ??= Promise.allSettled([cargar('recalcular', './nucleo/recalcular.js'), cargar('montaje', './montaje.js'), textos()]).finally(() => { extras = null; });
  return extras;
}

function cargado(nombre) {
  const m = mod[nombre];
  if (!m || typeof m.then === 'function') throw new Error('Esta función necesita antes un resultado de analizar() o confirmar()');
  return m;
}

/** Error con frase para la persona (message) y código (.codigo). */
async function fallo(codigo, idioma) {
  let frase;
  try { frase = (await textos()).texto(codigo, idioma); } catch { frase = RESERVA[idioma]; }
  return Object.assign(new Error(frase), { codigo });
}

const idiomaDe = (i) => (['es', 'ca', 'en'].includes(i) ? i : 'es');
const sinRed = () => globalThis.navigator?.onLine === false;
// en una página aislada (iframe con sandbox) solo leer navigator.serviceWorker ya lanza: entonces no hay
const sw = () => { try { return globalThis.navigator?.serviceWorker; } catch { return undefined; } };
const url = (ruta) => new URL(ruta, import.meta.url).href;
