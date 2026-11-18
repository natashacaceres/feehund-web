// Los tres servicios de fuera (Stripe, Brevo, Lleida.net), con llamadas HTTP directas (la web no tiene paso de compilación ni npm).
// Las direcciones se pueden cambiar con STRIPE_API, BREVO_API y LLEIDA_API: así las pruebas usan un simulador
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
/** Pago de «Pregúntale a Tiqui» (Checkout). importe en céntimos; ref: huella del código (no el código). */
export function crearPagoTiqui(env, { ref, plan, importe, producto, idioma, vuelta, cancelar, textos }) {
  return stripe(env, 'POST', '/v1/checkout/sessions', {
    mode: 'payment',
    line_items: { 0: { quantity: 1, price_data: { currency: 'eur', unit_amount: importe, product: producto } } },
    client_reference_id: ref,
    locale: idioma === 'ca' ? 'es' : idioma,
    success_url: vuelta,
    cancel_url: cancelar,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    metadata: { servicio: 'tiqui', plan },
    payment_intent_data: { metadata: { servicio: 'tiqui', plan }, description: textos.descripcion, statement_descriptor_suffix: 'FEEHUND TIQUI' },
    // [REVISIÓN LEGAL] contenido digital: empieza en cuanto se paga (art. 103 m TRLGDCU)
    custom_text: { submit: { message: textos.renuncia } },
  }, 'tiqui-' + ref);
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

/* ================= Brevo (correo transaccional) ================= */
// POST /v3/smtp/email con la cabecera api-key (BREVO_API_KEY). Remitente hola@feehund.com (dominio autenticado en Brevo).
// Brevo no tiene clave de idempotencia: la ponemos nosotros en KV («correo:<hash>») para que un reintento (aviso de
// Stripe repetido, tarea que corre dos veces) no mande el mismo correo dos veces.
const brevoBase = (env) => env.BREVO_API || 'https://api.brevo.com';
export const REMITE = 'hola@feehund.com';
const html = (t) => '<div style="font:15px/1.5 Arial,sans-serif;white-space:pre-wrap">' + String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]) + '</div>';
const nombre70 = (n) => String(n || '').replace(/["<>\\]/g, '').slice(0, 70);

/**
 * Envía un correo. de: { nombre } (el remitente es siempre hola@feehund.com). adjuntos: [{ nombre, bytes, tipo }].
 * idem: clave para que un reintento no lo duplique. Devuelve el messageId de Brevo.
 */
export async function enviarCorreo(env, { de, para, cc, responderA, asunto, texto, adjuntos = [], idem, etiquetas }) {
  if (!env.BREVO_API_KEY) throw new ErrorServicio('brevo', 0, 'sin_clave');
  const marca = idem && env.FEEHUND_KV ? 'correo:' + (await crypto.subtle.digest('SHA-256', te.encode(idem)).then((h) => b64(h).slice(0, 32))) : null;
  if (marca) {
    const ya = await env.FEEHUND_KV.get(marca);
    if (ya && ya !== 'enviando') return ya;
    if (ya === 'enviando') throw new ErrorServicio('brevo', 409, 'en_curso');
    await env.FEEHUND_KV.put(marca, 'enviando', { expirationTtl: 120 });
  }
  const r = await fetch(brevoBase(env) + '/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: nombre70(de?.nombre || 'Feehund'), email: REMITE },
      to: [].concat(para).map((email) => ({ email })), cc: cc ? [].concat(cc).map((email) => ({ email })) : undefined,
      replyTo: responderA ? { email: responderA } : undefined, subject: asunto, textContent: texto, htmlContent: html(texto),
      attachment: adjuntos.length ? adjuntos.map((a) => ({ name: a.nombre, content: b64(a.bytes) })) : undefined,
      tags: etiquetas?.length ? etiquetas.map((t) => t.value) : undefined,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.messageId) {
    if (marca) await env.FEEHUND_KV.delete(marca);
    throw new ErrorServicio('brevo', r.status, j.code);
  }
  if (marca) await env.FEEHUND_KV.put(marca, j.messageId, { expirationTtl: 30 * 86400 });
  return j.messageId;
}
/**
 * Consulta barata (1 evento del último día) que hace la tarea una vez por semana: Brevo desactiva las claves que pasan
 * 90 días sin uso, y así la clave sigue viva aunque no haya ventas. Usa el mismo endpoint que la fase 2 (eventos), así
 * que también comprueba que el permiso «Transactional email» de la clave alcanza para leerlos. Devuelve el estado HTTP.
 */
export async function pulsoBrevo(env) {
  const r = await fetch(brevoBase(env) + '/v3/smtp/statistics/events?limit=1&days=1', { headers: { 'api-key': env.BREVO_API_KEY, accept: 'application/json' } });
  return r.status;
}
/** (fase 2) Cómo va un correo: 'delivered', 'bounced' (rebote, bloqueo, dirección no válida, error) o null si aún no se sabe. */
export async function estadoCorreo(env, messageId) {
  const r = await fetch(brevoBase(env) + '/v3/smtp/statistics/events?messageId=' + encodeURIComponent(messageId) + '&days=90', { headers: { 'api-key': env.BREVO_API_KEY, accept: 'application/json' } });
  if (!r.ok) throw new ErrorServicio('brevo', r.status);
  const ev = ((await r.json()).events || []).map((e) => e.event);
  if (ev.includes('delivered')) return 'delivered';
  if (ev.some((e) => ['hardBounces', 'bounces', 'blocked', 'invalid', 'error'].includes(e))) return 'bounced';
  return null;
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
