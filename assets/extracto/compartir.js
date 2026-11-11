// Imagen para compartir de «Mi banco»: un ticket de papel con el total, una línea que dice qué es, el perro asomando
// y feehund.com/extracto. NADA MÁS: ni empresas, ni listas, ni fechas, ni datos de la persona.
// Dos formatos: 'historia' (1080 × 1920, el que se comparte por defecto en el móvil) y 'cuadrado' (1080 × 1080).
// Mismo estilo que la tarjeta del datáfono: fondo crema, papel con borde de tinta y borde inferior en zigzag.

const CREMA = '#FFF8EC', PAPEL = '#FFFDF7', TINTA = '#14213D', MARCA = '#0E5E6F', GRIS = '#4F5667';
const MEDIDAS = {
  historia: { W: 1080, H: 1920, x0: 130, x1: 950, y0: 640, y1: 1480, cifra: 1000, linea: 1090, url: 1340, perroAncho: 760 },
  cuadrado: { W: 1080, H: 1080, x0: 150, x1: 930, y0: 330, y1: 930, cifra: 610, linea: 690, url: 850, perroAncho: 640 },
};

let fuentes = null;
function cargarFuentes() {
  fuentes ??= (async () => {
    const sistema = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const r = { cifra: `Georgia, ${sistema}`, texto: sistema };
    const conjunto = globalThis.document?.fonts ?? globalThis.fonts;
    try {
      const f = new FontFace('Fraunces', `url("${new URL('../fonts/fraunces-800.woff', import.meta.url).href}")`, { weight: '800' });
      await f.load(); conjunto?.add(f); r.cifra = `Fraunces, ${r.cifra}`;
    } catch { /* sin la fuente de la web: la del sistema */ }
    try {
      const f = new FontFace('Atkinson Hyperlegible Next', `url("${new URL('../fonts/atkinson-next-800.woff2', import.meta.url).href}")`, { weight: '800' });
      await f.load(); conjunto?.add(f); r.texto = `"Atkinson Hyperlegible Next", ${sistema}`;
    } catch { /* idem */ }
    return r;
  })();
  return fuentes;
}

async function perro() {
  try {
    const r = await fetch(new URL('./mascota.png', import.meta.url));
    return r.ok ? await createImageBitmap(await r.blob()) : null;
  } catch { return null; }
}

function lienzoDe(W, H) {
  return typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: W, height: H }) : new OffscreenCanvas(W, H);
}

/**
 * @param {{cifra: string, linea: string, url?: string, formato?: 'historia'|'cuadrado'}} datos
 * @returns {Promise<Blob>} PNG
 */
export async function dibujarTicket({ cifra, linea, url = 'feehund.com/extracto', formato = 'historia' }) {
  const m = MEDIDAS[formato] || MEDIDAS.historia;
  const [f, mascota] = await Promise.all([cargarFuentes(), perro()]);
  const lienzo = lienzoDe(m.W, m.H);
  const c = lienzo.getContext('2d');
  c.fillStyle = CREMA;
  c.fillRect(0, 0, m.W, m.H);
  // el perro asomando por encima del ticket: se dibuja antes y el papel le tapa la parte de abajo
  if (mascota) {
    const ancho = m.perroAncho, alto = (ancho * mascota.height) / mascota.width;
    c.drawImage(mascota, (m.W - ancho) / 2, m.y0 - alto * 0.78, ancho, alto);
    mascota.close?.();
  }
  // papel
  c.fillStyle = PAPEL;
  c.fillRect(m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0);
  // borde de tinta arriba y a los lados, y zigzag abajo
  const B = 7;
  c.fillStyle = TINTA;
  c.fillRect(m.x0, m.y0, m.x1 - m.x0, B);
  c.fillRect(m.x0, m.y0, B, m.y1 - m.y0);
  c.fillRect(m.x1 - B, m.y0, B, m.y1 - m.y0);
  if (c.beginPath) {
    const n = 20, paso = (m.x1 - m.x0) / n, alto = 26;
    c.beginPath();
    c.moveTo(m.x0, m.y1);
    for (let k = 0; k < n; k++) { c.lineTo(m.x0 + k * paso + paso / 2, m.y1 + alto); c.lineTo(m.x0 + (k + 1) * paso, m.y1); }
    c.closePath();
    c.fillStyle = PAPEL; c.fill?.();
    c.lineWidth = B; c.lineJoin = 'round'; c.strokeStyle = TINTA; c.stroke?.();
  }
  // textos
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  const centro = m.W / 2, anchoMax = m.x1 - m.x0 - 90;
  c.fillStyle = TINTA;
  let tam = formato === 'historia' ? 170 : 150;
  do { c.font = `800 ${tam}px ${f.cifra}`; tam -= 6; } while (c.measureText(cifra).width > anchoMax && tam > 40);
  c.fillText(cifra, centro, m.cifra);
  c.fillStyle = GRIS;
  c.font = `800 46px ${f.texto}`;
  c.fillText(linea, centro, m.linea);
  c.fillStyle = MARCA;
  c.font = `800 52px ${f.texto}`;
  c.fillText(url, centro, m.url);
  if (lienzo.convertToBlob) return lienzo.convertToBlob({ type: 'image/png' });
  return new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se ha podido crear la imagen'))), 'image/png'));
}

/** El ticket del total al año: «2.196 €/año» (separador de miles también con cuatro cifras) y «en cobros que se repiten». */
export function ticketDelTotal(n, idioma, t, formato) {
  const cifra = new Intl.NumberFormat(idioma + (idioma === 'en' ? '-GB' : '-ES'), { maximumFractionDigits: 0, useGrouping: 'always' }).format(Math.round(n));
  return dibujarTicket({ cifra: t.texto('compartir_total', idioma, { cifra }), linea: t.texto('compartir_linea', idioma), formato: formato === 'cuadrado' ? 'cuadrado' : 'historia' });
}
