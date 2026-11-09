// Librerías de /vendor, cargadas solo cuando hacen falta. Las rutas son relativas a este archivo,
// así funcionan igual en el navegador (worker) y en Node (pruebas).

export const RUTAS = {
  xlsx: '../../vendor/sheetjs-0.20.3/xlsx.mjs',
  cpexcel: '../../vendor/sheetjs-0.20.3/cpexcel.full.mjs',
  papaparse: '../../vendor/papaparse-5.7.0/papaparse.mjs',
  fflate: '../../vendor/fflate-0.8.3/fflate.mjs',
  pdfjs: '../../vendor/pdfjs-6.5.438/legacy/pdf.min.mjs',
  'pdfjs-worker': '../../vendor/pdfjs-6.5.438/legacy/pdf.worker.min.mjs',
};

/** Carpeta de recursos de pdf.js (cmaps, fuentes estándar, wasm, perfiles ICC). */
export const PDFJS_RECURSOS = new URL('../../vendor/pdfjs-6.5.438/', import.meta.url).href;

const cargadas = new Map();

/** import() de una librería por su nombre, una sola vez. */
export function cargar(nombre) {
  const ruta = RUTAS[nombre];
  if (!ruta) return Promise.reject(new Error(`Librería desconocida: ${nombre}`));
  if (!cargadas.has(nombre)) {
    const p = import(new URL(ruta, import.meta.url).href);
    p.catch(() => cargadas.delete(nombre)); // si falla (sin conexión), se puede reintentar
    cargadas.set(nombre, p);
  }
  return cargadas.get(nombre);
}

/** URL absoluta de un archivo de /vendor o /data (para fetch o para Tesseract). */
export function urlRecurso(rutaRelativaALaRaiz) {
  return new URL('../../' + rutaRelativaALaRaiz.replace(/^\//, ''), import.meta.url).href;
}
