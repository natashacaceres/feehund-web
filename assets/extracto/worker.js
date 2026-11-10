// Web Worker (módulo) del lector de extractos: lee los archivos, valida, une y busca cobros que se repiten.
// Todo pasa en la memoria de este worker. No guarda nada y no envía nada: el único fetch es el GET de
// /data/comercios.json, un archivo estático de la web que no lleva datos de la persona.
// El OCR y el HEIC se piden al hilo principal (motor.js) por mensajes. Protocolo en DESARROLLO.md.
//
// Ojo: motor.js arranca este worker desde un blob: (así hereda el service worker de la página y funciona
// sin conexión), de modo que self.location es un blob:. Todas las rutas se calculan con import.meta.url.

import { cargar } from './librerias.js';
import { cargarTextos, texto, textosDe } from './textos.js';
import { hoyISO } from './nucleo/fechas.js';
import { leerEntradas, montarResultado, lecturasDesdeResultado, LECTORES } from './montaje.js';

const URL_COMERCIOS = new URL('../../data/comercios.json', import.meta.url).href;
// Fases del contrato. Las de los lectores se traducen: «pdf» es leer una página y «ocr», leer una página escaneada.
const FASES = new Set(['leyendo', 'foto', 'pagina', 'preparando_fotos', 'saldo', 'cobros']);
const DE_LECTOR = { pdf: 'pagina', ocr: 'foto', imagen: 'foto' };

const peticiones = new Map(); // peticion → {ok, mal}: OCR y HEIC que esperan al hilo principal
let siguientePeticion = 1;
let cola = Promise.resolve(); // un análisis detrás de otro
let diccionario = null; // promesa del JSON (datos estáticos de la web, no de la persona)
let nucleo = null; // promesa de los módulos del núcleo (unir y validar)
let busqueda = null; // promesa de detectar.js: si no llega, se entrega lo leído y se dice que la búsqueda ha fallado

self.onmessage = (e) => {
  const m = e.data || {};
  if (m.tipo === 'ocr_hecho' || m.tipo === 'heic_hecho' || m.tipo === 'fallo_peticion') responder(m);
  else if (m.tipo === 'analizar' || m.tipo === 'confirmar') cola = cola.then(() => atender(m)).catch(() => {});
  else if (m.tipo === 'resumen') cola = cola.then(() => atenderResumen(m)).catch(() => {}); // lector del datáfono
};
self.postMessage({ tipo: 'listo' }); // motor.js espera esta señal para saber que el worker ha arrancado

async function atender(m) {
  const id = m.id;
  const o = m.opciones || {};
  const opciones = {
    idioma: ['es', 'ca', 'en'].includes(o.idioma) ? o.idioma : 'es',
    hoy: /^\d{4}-\d{2}-\d{2}$/.test(o.hoy || '') ? o.hoy : hoyISO(),
    contrasenas: o.contrasenas || {},
    mapeo: o.mapeo || {},
  };
  const progreso = (ev) => {
    const p = { ...ev, fase: DE_LECTOR[ev?.fase] ?? (FASES.has(ev?.fase) ? ev.fase : 'leyendo') };
    // con número de página (PDF, también escaneado): «Leyendo la página 3 de 20»
    const codigo = p.pagina && p.total && (p.fase === 'pagina' || p.fase === 'foto') ? 'progreso_pagina'
      : p.fase === 'pagina' ? 'progreso_leyendo' : 'progreso_' + p.fase;
    self.postMessage({ id, tipo: 'progreso', ...p, texto: texto(codigo, opciones.idioma, p) });
  };
  try {
    await cargarTextos();
    const piezas = cargarNucleo();
    piezas.catch(() => {});
    const detectar = cargarDetectar();
    let lecturas;
    let extra = {};
    if (m.tipo === 'analizar') {
      const entradas = prepararEntradas(m, opciones.idioma);
      m.archivos = null; // los bytes quedan solo en «entradas», que leerEntradas va soltando
      lecturas = await leerEntradas(entradas, {
        opciones,
        detectarFormato,
        importarLector,
        cargar,
        progreso,
        sinConexion,
        alFallar: (err) => console.error(err),
        ocr: (imagen, info) => pedir(id, 'ocr', { imagen, info }),
      });
    } else {
      const r = m.resultado || {};
      lecturas = lecturasDesdeResultado(r, m.correcciones);
      extra = { confirmado: true, previos: { errores: r.errores, necesita_mapeo: r.necesita_mapeo, necesita_contrasena: r.necesita_contrasena } };
    }
    const [piezasNucleo, detectarCargado, dicc] = await Promise.all([piezas, detectar, cargarDiccionario()]);
    const resultado = await montarResultado(lecturas, {
      opciones, diccionario: dicc, nucleo: { ...piezasNucleo, detectar: detectarCargado }, progreso, alFallar: (err) => console.error(err), ...extra,
    });
    lecturas = null;
    self.postMessage({ id, tipo: 'resultado', resultado });
  } catch (err) {
    console.error(err);
    const codigo = err?.codigo && textosDe(err.codigo) ? err.codigo : sinConexion() ? 'necesita_conexion' : 'desconocido_interno';
    self.postMessage({ id, tipo: 'fallo', codigo, texto: texto(codigo, opciones.idioma) });
  }
}

/**
 * Lector del datáfono: los mismos lectores en modo crudo (páginas, filas y texto tal cual) y datafono/montaje.js.
 * No usa el diccionario de comercios ni la búsqueda de cobros.
 */
async function atenderResumen(m) {
  const id = m.id;
  const o = m.opciones || {};
  const opciones = {
    idioma: ['es', 'ca', 'en'].includes(o.idioma) ? o.idioma : 'es',
    hoy: /^\d{4}-\d{2}-\d{2}$/.test(o.hoy || '') ? o.hoy : hoyISO(),
    contrasenas: o.contrasenas || {},
    mapeo: {},
    crudo: true,
    mes: /^\d{4}-\d{2}$/.test(o.mes || '') ? o.mes : undefined,
  };
  const progreso = (ev) => {
    const p = { ...ev, fase: DE_LECTOR[ev?.fase] ?? (FASES.has(ev?.fase) ? ev.fase : 'leyendo') };
    const codigo = p.pagina && p.total && (p.fase === 'pagina' || p.fase === 'foto') ? 'progreso_pagina' : p.fase === 'foto' ? 'progreso_foto' : 'progreso_resumen';
    self.postMessage({ id, tipo: 'progreso', ...p, texto: texto(codigo, opciones.idioma, p) });
  };
  try {
    await cargarTextos();
    const resumen = await import('./datafono/montaje.js');
    const entradas = prepararEntradas(m, opciones.idioma);
    m.archivos = null;
    let lecturas = await leerEntradas(entradas, {
      opciones,
      detectarFormato: (e) => resumen.detectarParaResumen(e, detectarFormato),
      importarLector, cargar, progreso, sinConexion,
      alFallar: (err) => console.error(err),
      ocr: (imagen, info) => pedir(id, 'ocr', { imagen, info }),
    });
    const resultado = resumen.montarResumen(lecturas, { opciones, texto });
    lecturas = null;
    self.postMessage({ id, tipo: 'resultado', resultado });
  } catch (err) {
    console.error(err);
    const codigo = err?.codigo && textosDe(err.codigo) ? err.codigo : sinConexion() ? 'necesita_conexion' : 'desconocido_interno';
    self.postMessage({ id, tipo: 'fallo', codigo, texto: texto(codigo, opciones.idioma) });
  }
}

/** Mensaje del motor → entradas para leerEntradas. El texto pegado es una entrada más. */
function prepararEntradas(m, idioma) {
  const entradas = (m.archivos || []).map((a) => ({
    nombre: String(a.nombre || 'archivo'),
    tipo: a.tipo || '',
    tamano: Number(a.tamano) || 0,
    bytes: a.bytes ? new Uint8Array(a.bytes) : null,
    ilegible: Boolean(a.ilegible),
    demasiados: Boolean(a.demasiados), // motor.js no lo ha leído: ya había 100 archivos o 100 MB
  }));
  if (typeof m.texto === 'string' && m.texto.trim()) {
    entradas.push({ nombre: texto('nombre_texto_pegado', idioma), bytes: new TextEncoder().encode(m.texto), texto: m.texto, codificacion: 'utf-8', pegado: true });
  }
  return entradas;
}

async function detectarFormato(entrada) {
  const { detectarFormato: detectar } = await import('./lectores/formato.js');
  return detectar.length >= 2 ? detectar(entrada.bytes, entrada.nombre) : detectar(entrada);
}

function importarLector(nombre) {
  if (!LECTORES.has(nombre)) return Promise.reject(new Error('Lector desconocido: ' + nombre));
  return import(`./lectores/${nombre}.js`);
}

function cargarNucleo() {
  if (!nucleo) {
    nucleo = Promise.all([import('./nucleo/unir.js'), import('./nucleo/validar.js')])
      .then(([u, v]) => ({
        unir: u.unir,
        validarSaldos: v.validarSaldos,
        analizarFechas: v.analizarFechas,
        combinarValidaciones: v.combinarValidaciones,
        saldosNoFiables: v.saldosNoFiables,
        avisoValidacion: v.avisoValidacion,
      }));
    nucleo.catch(() => { nucleo = null; }); // sin conexión: se reintenta en el siguiente análisis
  }
  return nucleo;
}

/** detectar.js. Si no llega (sin conexión, o roto al publicar), una función que falla: montaje.js lo dice y da lo leído. */
function cargarDetectar() {
  if (!busqueda) {
    const p = import('./nucleo/detectar.js').then((d) => d.detectar, (err) => {
      if (busqueda === p) busqueda = null; // se reintenta en el siguiente análisis
      return () => { throw err; };
    });
    busqueda = p;
  }
  return busqueda;
}

/** data/comercios.json una sola vez. Si no llega, null: el resultado lo dice y no da totales. */
function cargarDiccionario() {
  if (!diccionario) {
    diccionario = fetch(URL_COMERCIOS, { credentials: 'omit' }) // un GET de un archivo de la web: ni cookies ni datos
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d && Array.isArray(d.comercios) ? d : null))
      .catch(() => null);
    diccionario.then((d) => { if (!d) diccionario = null; });
  }
  return diccionario;
}

function sinConexion() {
  return self.navigator?.onLine === false;
}

/** Pide un trabajo al hilo principal (OCR o HEIC) y espera su respuesta. */
function pedir(id, tipo, datos, transferir = []) {
  const peticion = siguientePeticion++;
  return new Promise((ok, mal) => {
    peticiones.set(peticion, { ok, mal });
    self.postMessage({ id, tipo, peticion, ...datos }, transferir);
  });
}

function responder(m) {
  const p = peticiones.get(m.peticion);
  if (!p) return;
  peticiones.delete(m.peticion);
  if (m.tipo === 'fallo_peticion') p.mal(Object.assign(new Error(m.codigo || 'fallo_peticion'), { codigo: m.codigo }));
  else if (m.tipo === 'ocr_hecho') p.ok({ palabras: m.palabras || [], ancho: m.ancho, alto: m.alto, confianza: m.confianza });
  else p.ok(m.imagen);
}
