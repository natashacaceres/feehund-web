// Tarjeta para compartir de «Mi banco»: 1080 × 1920 (historia), dibujada en este dispositivo cuando la persona pulsa
// compartir. Una sola plantilla con huecos: los textos vienen de /data/personalidades.json. No se guarda en ningún sitio
// ni se envía nada: las fuentes, la imagen y los textos son archivos de la propia web (sin conexión, del service worker).
// Solo lleva la cabecera, «feehund», el nombre, la frase, el número con su dato y Tiqui. Nada más.

import { textosDe, rellenar, partirEquilibrado, palabrasDe, datoPara } from './nucleo/tarjeta.js';

export const ANCHO = 1080, ALTO = 1920;
export const TEMAS = {
  azul: { fondo: '#14213D', circulo: '#1E2E52', texto: '#FFF8EC', numero: '#FFB238' },
  crema: { fondo: '#FFF8EC', circulo: '#E3EEF0', texto: '#14213D', numero: '#0E5E6F' }, // nunca ámbar sobre crema
};
// Medidas en px. «top» = borde superior de la caja de texto.
export const M = {
  izquierda: 80, derecha: 1000,
  cabecera: { top: 282, tam: 29, espacio: 0.16, marca: 40 },
  nombre: { top: 352, ancho: 920, max: 224, interlineado: 0.9, espacio: -0.015 },
  frase: { hueco: 36, tam: 46, interlineado: 1.2 },
  fila: { top: 872, numAncho: 440, numMax: 216, numInterlineado: 0.9, numEspacio: -0.02, hueco: 28, datoTam: 44, datoInterlineado: 1.15, datoAncho: 420, datoSobre: 24, cifras: 0.95 },
  circulo: { x: 810, y: 1680, r: 620 },
  tiqui: { ancho: 940, derecha: 1170, abajo: 1926 },
  zona: { x0: 80, x1: 1000, y0: 270, y1: 1570 },
  minimo: 27, // ningún texto más pequeño
};

const SISTEMA = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const REDONDA = `Fredoka, "Atkinson Hyperlegible Next", ${SISTEMA}`;
const LEGIBLE = `"Atkinson Hyperlegible Next", ${SISTEMA}`;
const FUENTES = [
  ['Fredoka', '600', 'fredoka-600.woff2', REDONDA],
  ['Atkinson Hyperlegible Next', '400', 'atkinson-next-400.woff2', LEGIBLE],
  ['Atkinson Hyperlegible Next', '600', 'atkinson-next-600.woff2', LEGIBLE],
];

// ---------- Archivos de la web (se piden una vez y se quedan en memoria mientras la página está abierta) ----------

let fuentes = null, datos = null, tiqui = null;

/** Registra las tres fuentes autoalojadas y espera a que estén cargadas (document.fonts.load) antes de dibujar. */
function cargarFuentes() {
  fuentes ??= (async () => {
    const conjunto = globalThis.document?.fonts ?? globalThis.fonts;
    if (!conjunto) return;
    for (const [familia, peso, archivo] of FUENTES) {
      try {
        const url = new URL(`../fonts/${archivo}`, import.meta.url).href;
        conjunto.add(new FontFace(familia, `url("${url}") format("woff2")`, { weight: peso, style: 'normal' }));
      } catch { /* sin FontFace: la del sistema */ }
    }
    await Promise.all(FUENTES.map(([familia, peso]) => conjunto.load(`${peso} 100px "${familia}"`).catch(() => [])));
  })();
  return fuentes;
}

function cargarDatos() {
  datos ??= fetch(new URL('../../data/personalidades.json', import.meta.url)).then((r) => {
    if (!r.ok) throw new Error('No se han podido leer los textos de la tarjeta');
    return r.json();
  });
  datos.catch(() => { datos = null; });
  return datos;
}

function cargarTiqui() {
  tiqui ??= (async () => {
    const url = new URL('../img/tiqui-reojo.png', import.meta.url).href;
    if (typeof Image !== 'undefined') {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    }
    const r = await fetch(url);
    if (!r.ok) throw new Error('No se ha podido leer la imagen');
    return createImageBitmap(await r.blob());
  })();
  tiqui.catch(() => { tiqui = null; });
  return tiqui;
}

// ---------- Texto ----------

const letras = (s) => [...s];

/** Lo que la primera letra asoma a la izquierda de su sitio (uno o dos píxeles): se le deja hueco para no salir del margen. */
function sangria(c, s) {
  const primera = letras(s)[0];
  // +1: el suavizado de los bordes pinta medio píxel más allá de la letra
  return primera ? Math.max(0, Math.ceil((c.measureText(primera).actualBoundingBoxLeft || 0) + 1)) : 0;
}

/** Ancho con espaciado entre letras (ls en px), contando lo que asoma la primera letra. */
function ancho(c, s, ls = 0) {
  return sangria(c, s) + c.measureText(s).width + ls * Math.max(0, letras(s).length - 1);
}

/** Escribe con espaciado entre letras: cada letra donde acaba el texto anterior (respeta el kerning). */
function escribir(c, s, x, y, ls = 0) {
  x += sangria(c, s);
  if (!ls) { c.fillText(s, x, y); return; }
  let antes = '';
  letras(s).forEach((k, i) => {
    c.fillText(k, x + c.measureText(antes).width + ls * i, y);
    antes += k;
  });
}

/** Ascendente y descendente de la fuente (los de la caja de la línea, no los de las letras). */
function metricas(c) {
  const m = c.measureText('Hg');
  const tam = parseFloat(/(\d+(?:\.\d+)?)px/.exec(c.font)?.[1]) || 16;
  return { asc: m.fontBoundingBoxAscent ?? tam * 0.95, desc: m.fontBoundingBoxDescent ?? tam * 0.25 };
}

/** Línea base de una línea cuya caja empieza en top (interlineado en múltiplos del tamaño; null = el de la fuente). */
function lineaBase(c, top, tam, interlineado) {
  const { asc, desc } = metricas(c);
  const alto = interlineado ? interlineado * tam : asc + desc;
  return top + (alto - (asc + desc)) / 2 + asc;
}

/** El mayor tamaño (máx.) con el que todas las líneas caben en el ancho. */
function tamanoQueCabe(c, lineas, peso, familia, espacio, anchoMax, max) {
  c.font = `${peso} 100px ${familia}`;
  const a100 = Math.max(...lineas.map((l) => ancho(c, l, espacio * 100)));
  let tam = Math.min(max, Math.floor((anchoMax * 100) / a100));
  const mide = (t) => { c.font = `${peso} ${t}px ${familia}`; return Math.max(...lineas.map((l) => ancho(c, l, espacio * t))); };
  while (tam > M.minimo && mide(tam) > anchoMax) tam--;
  while (tam < max && mide(tam + 1) <= anchoMax) tam++;
  return Math.max(M.minimo, tam);
}

// El dato: palabras con trozos en dos fuentes. Las cifras van en Fredoka (el cero de Atkinson va tachado).
const CIFRAS = /(\d(?:[\d.,]*\d)?)/;
function trozos(palabra) {
  return palabra.split(CIFRAS).filter(Boolean).map((t) => ({ t, cifra: CIFRAS.test(t) && /^\d/.test(t) }));
}
function fuenteTrozo(tr, tam) {
  return tr.cifra ? `600 ${Math.max(M.minimo, tam * M.fila.cifras)}px ${REDONDA}` : `400 ${tam}px ${LEGIBLE}`;
}
function anchoMixto(c, linea, tam) {
  c.font = `400 ${tam}px ${LEGIBLE}`;
  let w = sangria(c, linea);
  palabrasDe(linea).forEach((p, i) => {
    if (i) { c.font = `400 ${tam}px ${LEGIBLE}`; w += c.measureText(' ').width; }
    for (const tr of trozos(p)) { c.font = fuenteTrozo(tr, tam); w += c.measureText(tr.t).width; }
  });
  return w;
}
function escribirMixto(c, linea, x, y, tam) {
  c.font = `400 ${tam}px ${LEGIBLE}`;
  x += sangria(c, linea);
  palabrasDe(linea).forEach((p, i) => {
    if (i) { c.font = `400 ${tam}px ${LEGIBLE}`; x += c.measureText(' ').width; }
    for (const tr of trozos(p)) { c.font = fuenteTrozo(tr, tam); c.fillText(tr.t, x, y); x += c.measureText(tr.t).width; }
  });
}

// ---------- Plantilla ----------

/**
 * Dibuja la tarjeta en un lienzo de 1080 × 1920.
 * @param {HTMLCanvasElement|OffscreenCanvas} lienzo
 * @param {Object} t  textos de la personalidad (nucleo/tarjeta.js textosDe)
 * @param {Object} valores  {n, m}
 * @param {{idioma?, tema?, capas?: string[]}} o  capas: para las pruebas (fondo, circulo, tiqui, texto)
 * @returns {Array<{que, x0, y0, x1, y1}>} dónde ha ido cada texto
 */
export function dibujar(lienzo, t, valores, imagen, o = {}) {
  const idioma = o.idioma || 'es';
  const color = TEMAS[o.tema] || TEMAS.azul;
  const capas = new Set(o.capas || ['fondo', 'circulo', 'tiqui', 'texto']);
  const c = lienzo.getContext('2d');
  const cajas = [];
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';

  // 1. Fondo a sangre
  if (capas.has('fondo')) { c.fillStyle = color.fondo; c.fillRect(0, 0, ANCHO, ALTO); }
  // 2. Círculo
  if (capas.has('circulo')) {
    c.fillStyle = color.circulo;
    c.beginPath();
    c.arc(M.circulo.x, M.circulo.y, M.circulo.r, 0, Math.PI * 2);
    c.fill();
  }
  // 3. Tiqui, sin deformar: 940 de ancho, borde derecho en 1170 y borde inferior en 1926
  if (capas.has('tiqui') && imagen) {
    const w = M.tiqui.ancho, h = (w * imagen.height) / imagen.width;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(imagen, M.tiqui.derecha - w, M.tiqui.abajo - h, w, h);
  }
  const texto = capas.has('texto');
  c.fillStyle = color.texto;

  // 4. Cabecera: a la izquierda en mayúsculas y «feehund» a la derecha, en la misma línea base
  c.font = `600 ${M.cabecera.marca}px ${REDONDA}`;
  const base = lineaBase(c, M.cabecera.top, M.cabecera.marca, null);
  const anchoMarca = c.measureText('feehund').width;
  if (texto) { c.textAlign = 'right'; c.fillText('feehund', M.derecha, base); c.textAlign = 'left'; }
  cajas.push({ que: 'marca', x0: M.derecha - anchoMarca, x1: M.derecha, y0: M.cabecera.top, y1: base });
  const cab = t.cabecera.toLocaleUpperCase(idioma);
  let tamCab = M.cabecera.tam;
  const sitioCab = M.derecha - anchoMarca - 24 - M.izquierda;
  for (;;) {
    c.font = `600 ${tamCab}px ${LEGIBLE}`;
    if (tamCab <= M.minimo || ancho(c, cab, M.cabecera.espacio * tamCab) <= sitioCab) break;
    tamCab--;
  }
  if (texto && cab) escribir(c, cab, M.izquierda, base, M.cabecera.espacio * tamCab);
  cajas.push({ que: 'cabecera', x0: M.izquierda, x1: M.izquierda + ancho(c, cab, M.cabecera.espacio * tamCab), y0: M.cabecera.top, y1: base, tam: tamCab });

  // 5. Nombre: como mucho dos líneas, del mayor tamaño que quepa en 920 (máximo 224)
  // el nombre también puede llevar {n} («Un alma de {n}»)
  let lineas = Array.isArray(t.lineas) && t.lineas.length ? t.lineas.map((l) => rellenar(l, valores, idioma)) : null;
  if (!lineas) {
    c.font = `600 100px ${REDONDA}`;
    lineas = partirEquilibrado(palabrasDe(rellenar(t.nombre, valores, idioma)), (s) => ancho(c, s, M.nombre.espacio * 100));
  }
  if (lineas.length > 2) lineas = [lineas[0], lineas.slice(1).join(' ')];
  const tamNombre = tamanoQueCabe(c, lineas, 600, REDONDA, M.nombre.espacio, M.nombre.ancho, M.nombre.max);
  c.font = `600 ${tamNombre}px ${REDONDA}`;
  const altoLineaNombre = M.nombre.interlineado * tamNombre;
  lineas.forEach((l, i) => {
    const top = M.nombre.top + i * altoLineaNombre;
    if (texto) escribir(c, l, M.izquierda, lineaBase(c, top, tamNombre, M.nombre.interlineado), M.nombre.espacio * tamNombre);
    cajas.push({ que: 'nombre', x0: M.izquierda, x1: M.izquierda + ancho(c, l, M.nombre.espacio * tamNombre), y0: top, y1: top + altoLineaNombre, tam: tamNombre });
  });
  const finNombre = M.nombre.top + lineas.length * altoLineaNombre;

  // 6. Frase: 36 px por debajo del nombre, una sola línea
  const frase = rellenar(t.frase, valores, idioma);
  let tamFrase = M.frase.tam;
  for (;;) {
    c.font = `400 ${tamFrase}px ${LEGIBLE}`;
    if (tamFrase <= M.minimo || ancho(c, frase) <= M.nombre.ancho) break;
    tamFrase--;
  }
  const topFrase = finNombre + M.frase.hueco;
  if (texto) escribir(c, frase, M.izquierda, lineaBase(c, topFrase, tamFrase, M.frase.interlineado));
  cajas.push({ que: 'frase', x0: M.izquierda, x1: M.izquierda + ancho(c, frase), y0: topFrase, y1: topFrase + M.frase.interlineado * tamFrase, tam: tamFrase });

  // 7. Fila del dato, alineada por abajo: el número grande y, 28 px a su derecha, el dato en dos líneas
  const F = M.fila;
  const num = rellenar(t.num, valores, idioma);
  const tamNum = tamanoQueCabe(c, [num], 600, REDONDA, F.numEspacio, F.numAncho, F.numMax);
  c.font = `600 ${tamNum}px ${REDONDA}`;
  const anchoNum = ancho(c, num, F.numEspacio * tamNum);
  const altoNum = F.numInterlineado * tamNum;

  const dato = rellenar(datoPara(t, valores), valores, idioma);
  const xDato = M.izquierda + anchoNum + F.hueco;
  const sitioDato = Math.min(F.datoAncho, M.derecha - xDato);
  let tamDato = F.datoTam, lineasDato;
  for (;;) {
    lineasDato = partirEquilibrado(palabrasDe(dato), (s) => anchoMixto(c, s, tamDato), { sinSueltas: true });
    if (tamDato <= M.minimo || Math.max(...lineasDato.map((l) => anchoMixto(c, l, tamDato))) <= sitioDato) break;
    tamDato--;
  }
  const altoLineaDato = F.datoInterlineado * tamDato;
  const altoDato = lineasDato.length * altoLineaDato;
  const abajo = F.top + Math.max(altoNum, altoDato + F.datoSobre);

  const topNum = abajo - altoNum;
  c.font = `600 ${tamNum}px ${REDONDA}`;
  c.fillStyle = color.numero;
  if (texto) escribir(c, num, M.izquierda, lineaBase(c, topNum, tamNum, F.numInterlineado), F.numEspacio * tamNum);
  cajas.push({ que: 'numero', x0: M.izquierda, x1: M.izquierda + anchoNum, y0: topNum, y1: abajo, tam: tamNum });

  c.fillStyle = color.texto;
  const topDato = abajo - F.datoSobre - altoDato;
  lineasDato.forEach((l, i) => {
    const top = topDato + i * altoLineaDato;
    c.font = `400 ${tamDato}px ${LEGIBLE}`;
    if (texto) escribirMixto(c, l, xDato, lineaBase(c, top, tamDato, F.datoInterlineado), tamDato);
    cajas.push({ que: 'dato', x0: xDato, x1: xDato + anchoMixto(c, l, tamDato), y0: top, y1: top + altoLineaDato, tam: /\d/.test(l) ? Math.min(tamDato, Math.max(M.minimo, tamDato * F.cifras)) : tamDato });
  });
  return cajas;
}

function lienzoNuevo() {
  return typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: ANCHO, height: ALTO }) : new OffscreenCanvas(ANCHO, ALTO);
}

function aPng(lienzo) {
  if (lienzo.convertToBlob) return lienzo.convertToBlob({ type: 'image/png' });
  return new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se ha podido crear la imagen'))), 'image/png'));
}

/** Textos, fuentes e imagen listos para dibujar. opciones.datos: otro personalidades.json (pruebas). */
export async function preparar(personalidadId, opciones = {}) {
  const [d, imagen] = await Promise.all([opciones.datos ? opciones.datos : cargarDatos(), cargarTiqui().catch(() => null), cargarFuentes()]);
  const t = textosDe(d, personalidadId, opciones.idioma || 'es');
  if (!t) throw new Error(`No hay textos para la personalidad «${personalidadId}»`);
  return { t, imagen };
}

/**
 * La tarjeta de una personalidad.
 * @param {string} personalidadId  id de /data/personalidades.json
 * @param {{n?, m?}} valores  lo que rellena {n} y {m}
 * @param {{idioma?: 'es'|'ca'|'en', tema?: 'azul'|'crema'}} opciones
 * @returns {Promise<Blob>} PNG de 1080 × 1920
 */
export async function generarTarjeta(personalidadId, valores = {}, opciones = {}) {
  const { t, imagen } = await preparar(personalidadId, opciones);
  const lienzo = lienzoNuevo();
  dibujar(lienzo, t, valores, imagen, opciones);
  return aPng(lienzo);
}

/**
 * Comparte la tarjeta con el menú del móvil si se puede; si no, la descarga como «feehund-tarjeta.png».
 * @returns {Promise<'compartida'|'cancelada'|'descargada'>}
 */
export async function compartirTarjeta(blob) {
  const nombre = 'feehund-tarjeta.png';
  const archivo = new File([blob], nombre, { type: 'image/png' });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo] });
      return 'compartida';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelada';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'descargada';
}
