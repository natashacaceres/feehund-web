// Los tres servicios de fuera, con llamadas HTTP directas (la web no tiene paso de compilación ni npm).
// Las direcciones se pueden cambiar con STRIPE_API, RESEND_API y LLEIDA_API: así las pruebas usan un simulador
// local. En producción no se ponen y se usan las de verdad.

import { b64, igual } from './cripto.js';

const te = new TextEncoder();
class ErrorServicio extends Error { constructor(servicio, estado, codigo) { super(`${servicio} ${estado} ${codigo || ''}`.trim()); this.servicio = servicio; this.estado = estado; this.codigo = codigo; } }

/* ================= Stripe ================= */
const stripeBase = (env) => env.STRIPE_API || 'https://api.stripe.com';
// Stripe pide formularios con claves anidadas: line_items[0][price]=…
function formulario(obj, pre = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const clave = pre ? `${pre}[${k}]` : k;
    if (typeof v === 'object') formulario(v, clave, out); else out.append(clave, String(v));
  }
  return out;
}
async function stripe(env, metodo, ruta, cuerpo, idem) {
  if (!env.STRIPE_SECRET_KEY) throw new ErrorServicio('stripe', 0, 'sin_clave');
  const h = { authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'stripe-version': '2025-03-31.basil' };
  if (cuerpo) h['content-type'] = 'application/x-www-form-urlencoded';
  if (idem) h['idempotency-key'] = idem;
  const r = await fetch(stripeBase(env) + ruta, { method: metodo, headers: h, body: cuerpo ? formulario(cuerpo) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorServicio('stripe', r.status, j.error?.code || j.error?.type);
  return j;
}

/**
 * Página de pago de Stripe (Checkout). El importe sale de data/te-damos-de-baja.json (precio: {primera, extra}) y se
 * manda en cada pago sobre un único producto (STRIPE_PRODUCT_BAJA): cambiar el precio no obliga a tocar Stripe.
 * unidades: 1 a 5 bajas (la primera a precio.primera, las demás a precio.extra).
 */
export function crearPago(env, { compra, unidades, precio, correo, idioma, vuelta, cancelar, textos }) {
  const linea = (importe, cantidad) => ({ quantity: cantidad, price_data: { currency: 'eur', unit_amount: importe, product: env.STRIPE_PRODUCT_BAJA } });
  const items = [linea(precio.primera, 1)];
  if (unidades > 1) items.push(linea(precio.extra, unidades - 1));
  return stripe(env, 'POST', '/v1/checkout/sessions', {
    mode: 'payment',
    line_items: Object.fromEntries(items.map((x, i) => [i, x])),
    customer_email: correo,
    client_reference_id: compra,
    locale: idioma === 'ca' ? 'es' : idioma, // Stripe no tiene catalán en Checkout
    success_url: vuelta,
    cancel_url: cancelar,
    expires_at: Math.floor(Date.now() / 1000) + 3600, // una hora
    metadata: { compra, servicio: 'te-damos-de-baja', unidades },
    payment_intent_data: { metadata: { compra, servicio: 'te-damos-de-baja' }, description: textos.descripcion, statement_descriptor_suffix: 'FEEHUND BAJA' },
    // [REVISIÓN LEGAL] la renuncia al desistimiento se acepta en nuestra página; Stripe la recuerda junto al botón
    custom_text: { submit: { message: textos.renuncia } },
  }, 'pago-' + compra);
}
export const leerPago = (env, sesion) => stripe(env, 'GET', '/v1/checkout/sessions/' + encodeURIComponent(sesion));

/** Devuelve importe (céntimos) de un pago. clave: para no devolver dos veces lo mismo. */
export function devolver(env, { pago, importe, clave, motivo }) {
  return stripe(env, 'POST', '/v1/refunds', { payment_intent: pago, amount: importe, reason: 'requested_by_customer', metadata: { motivo } }, 'devolucion-' + clave);
}

/** Comprueba la firma del aviso de Stripe (cabecera Stripe-Signature). Devuelve el evento o null. */
export async function eventoStripe(env, cuerpo, cabecera, ahora = Date.now()) {
  if (!env.STRIPE_WEBHOOK_SECRET || !cabecera) return null;
  const partes = Object.fromEntries(cabecera.split(',').map((p) => p.split('=')).filter((p) => p.length === 2 && p[0] !== 'v1'));
  const firmas = cabecera.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(partes.t);
  if (!t || Math.abs(ahora / 1000 - t) > 300) return null; // más de 5 minutos: se rechaza (repetición)
  const k = await crypto.subtle.importKey('raw', te.encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const esperada = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, te.encode(`${t}.${cuerpo}`)))].map((x) => x.toString(16).padStart(2, '0')).join('');
  if (!firmas.some((f) => igual(f, esperada))) return null;
  try { return JSON.parse(cuerpo); } catch { return null; }
}

/* ================= Resend (correo) ================= */
const resendBase = (env) => env.RESEND_API || 'https://api.resend.com';
export const REMITE = 'hola@feehund.com';

/**
 * Envía un correo. adjuntos: [{ nombre, bytes: Uint8Array, tipo }]. idem: clave para que un reintento no lo duplique.
 * Devuelve el id de Resend.
 */
export async function enviarCorreo(env, { de, para, cc, responderA, asunto, texto, html, adjuntos = [], idem, etiquetas }) {
  if (!env.RESEND_API_KEY) throw new ErrorServicio('resend', 0, 'sin_clave');
  const h = { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' };
  if (idem) h['idempotency-key'] = idem;
  const r = await fetch(resendBase(env) + '/emails', {
    method: 'POST', headers: h,
    body: JSON.stringify({
      from: de || `Feehund <${REMITE}>`, to: [].concat(para), cc: cc ? [].concat(cc) : undefined,
      reply_to: responderA ? [].concat(responderA) : undefined, subject: asunto, text: texto, html,
      attachments: adjuntos.length ? adjuntos.map((a) => ({ filename: a.nombre, content: b64(a.bytes), content_type: a.tipo })) : undefined,
      tags: etiquetas,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new ErrorServicio('resend', r.status, j.name);
  return j.id;
}
/** Último estado del correo en Resend: 'delivered', 'bounced', 'sent', 'delivery_delayed', 'complained'… */
export async function estadoCorreo(env, id) {
  const r = await fetch(resendBase(env) + '/emails/' + encodeURIComponent(id), { headers: { authorization: 'Bearer ' + env.RESEND_API_KEY } });
  if (!r.ok) throw new ErrorServicio('resend', r.status);
  return (await r.json()).last_event || null;
}

/* ================= Lleida.net Mailcert ================= */
// Lleida certifica los correos que llevan en copia correo@certificado.lleida.net (modo SENT_CC) enviados desde una
// dirección dada de alta en su lista blanca (hola@feehund.com). Su API solo sirve para buscar y descargar el
// certificado: list_pdf (filtrado por el asunto, subjrw) y download_pdf (file_id). Formato: POST con xml=<…>.
export const LLEIDA_CC = 'correo@certificado.lleida.net';
const lleidaBase = (env) => env.LLEIDA_API || 'https://tsa.lleida.net/cgi-bin/mailcertapi.cgi';
const xmlEsc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
async function lleida(env, accion, campos) {
  if (!env.LLEIDA_USER || !env.LLEIDA_API_KEY) throw new ErrorServicio('lleida', 0, 'sin_clave');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><${accion}><user>${xmlEsc(env.LLEIDA_USER)}</user><password>${xmlEsc(env.LLEIDA_API_KEY)}</password>${Object.entries(campos).map(([k, v]) => `<${k}>${xmlEsc(v)}</${k}>`).join('')}</${accion}>`;
  const r = await fetch(lleidaBase(env), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: 'x-api-key ' + env.LLEIDA_API_KEY },
    body: new URLSearchParams({ xml }),
  });
  if (!r.ok) throw new ErrorServicio('lleida', r.status);
  return r;
}
const etiqueta = (xml, t) => { const m = xml.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return m ? m[1].trim() : null; };

/** Certificados cuyo asunto contiene ref. Devuelve [{ fileId, estado, para, fecha }]. */
export async function buscarCertificados(env, ref) {
  const xml = await (await lleida(env, 'list_pdf', { subjrw: ref, row_order: 'desc' })).text();
  const estado = etiqueta(xml, 'status');
  if (estado && estado !== '100') throw new ErrorServicio('lleida', 200, estado);
  return [...xml.matchAll(/<pdf_row>([\s\S]*?)<\/pdf_row>/g)].map(([, f]) => ({
    fileId: etiqueta(f, 'file_id'), estado: Number(etiqueta(f, 'file_status')), para: etiqueta(f, 'mail_to'), fecha: etiqueta(f, 'mail_date'),
  }));
}
/** PDF del certificado (Uint8Array) o null si aún no está. */
export async function descargarCertificado(env, fileId) {
  const r = await lleida(env, 'download_pdf', { file_id: fileId });
  const bytes = new Uint8Array(await r.arrayBuffer());
  return bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 4)) === '%PDF' ? bytes : null;
}
