// Mensajes en lenguaje humano (ES, CA, EN) a partir de códigos. Cada parte del motor trae los suyos
// en textos/<parte>.js; aquí se juntan. Las {llaves} se rellenan con los datos del aviso.

import comun from './textos/comun.js';

const MODULOS = [comun];
const PARTES = ['tablas', 'formatos', 'pdf', 'validacion', 'deteccion', 'web'];

let TEXTOS = Object.assign({}, comun);
let cargadas = null;

/** Carga los textos de todas las partes (una vez). Las que aún no existan se ignoran. */
export function cargarTextos() {
  if (!cargadas) {
    cargadas = Promise.all(PARTES.map((p) => import(`./textos/${p}.js`).then((m) => m.default).catch(() => null)))
      .then((mods) => { for (const m of mods) if (m) { MODULOS.push(m); Object.assign(TEXTOS, m); } });
  }
  return cargadas;
}

const IDIOMAS = ['es', 'ca', 'en'];

/** Texto de un código en el idioma pedido; si falta, en español; si falta el código, uno genérico. */
export function texto(codigo, idioma = 'es', datos = {}) {
  const lang = IDIOMAS.includes(idioma) ? idioma : 'es';
  const t = TEXTOS[codigo];
  const plantilla = t ? (t[lang] ?? t.es) : (TEXTOS.desconocido_interno?.[lang] ?? 'No hemos podido completar este paso.');
  return plantilla.replace(/\{(\w+)\}/g, (_, k) => (datos && datos[k] !== undefined && datos[k] !== null ? String(datos[k]) : ''));
}

/** Todos los códigos conocidos (para las pruebas: ningún código sin texto en los tres idiomas). */
export function codigosConocidos() {
  return Object.keys(TEXTOS);
}

export function textosDe(codigo) {
  return TEXTOS[codigo] ?? null;
}
