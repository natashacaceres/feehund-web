// Pase de «Pregunta a Feehund»: lo usan /api/ia (al volver de pagar) y /api/baja/stripe (el aviso de Stripe, por si la
// persona cierra la pestaña antes de volver). Lo que llegue primero lo activa; lo segundo no hace nada.
// La clave del pase es la huella del código (SHA-256): Feehund no guarda el código, solo el tiempo justo para mandarlo por correo.

import { enviarCorreo } from '../_baja/servicios.js';

// Sin contador a la vista. Topes que nadie ve, para que ningún pase dé pérdidas (~2,5 céntimos por pregunta).
export const PLANES = {
  basico: { dias: 7, porDia: 20, total: 40, precio: 99 },       // 0,99 €
  completo: { dias: 90, porDia: 25, total: 120, precio: 299 },  // 2,99 €
  // Feehund para negocios (Mi datáfono), con factura
  negocio_mes: { dias: 30, porDia: 25, total: 80, precio: 499 },  // 4,99 €
  negocio_3m: { dias: 90, porDia: 25, total: 200, precio: 999 },  // 9,99 €
};
export const PRODUCTO_PREGUNTA = 'prod_VeGsASLYslzV0Q'; // Stripe (en vivo): «Pregunta a Feehund»
// Invita a un amigo: si paga, quien invitó tiene 30 días más (y 40 preguntas más), hasta 3 amigos.
export const AMIGO = { dias: 30, preguntas: 40, max: 3 };
// El pase (sin datos tuyos: solo plan y fechas) se guarda un año más tras caducar, para que un amigo pueda revivirlo.
export const GUARDA_PASE = 365 * 86400;
export const refValido = (r) => /^[0-9A-HJKMNP-TV-Z]{8}$/.test(String(r || ''));

/** Si el pago trae el enlace de un amigo, le regala los días a quien invitó. Solo una vez por pago. */
async function regalarAmigo(env, h, sesion) {
  const id = sesion.metadata?.amigo;
  if (!refValido(id)) return;
  const kRef = 'ia:ref:' + id, ref = JSON.parse((await env.FEEHUND_KV.get(kRef)) || 'null');
  if (!ref || ref.h === h || (ref.n || 0) >= AMIGO.max) return;
  const kUsado = 'ia:ref-pago:' + sesion.id;
  if (await env.FEEHUND_KV.get(kUsado)) return;
  await env.FEEHUND_KV.put(kUsado, '1', { expirationTtl: 400 * 86400 });
  const kPase = 'ia:pase:' + ref.h, pase = JSON.parse((await env.FEEHUND_KV.get(kPase)) || 'null');
  if (!pase) return; // su pase ya no existe (caducó del todo): no hay a quién regalar
  pase.hasta = Math.max(pase.hasta, Date.now()) + AMIGO.dias * 864e5;
  pase.extra = (pase.extra || 0) + AMIGO.preguntas;
  pase.regalo = (pase.regalo || 0) + AMIGO.dias;
  const ttl = Math.ceil((pase.hasta - Date.now()) / 1000) + 86400;
  await env.FEEHUND_KV.put(kPase, JSON.stringify(pase), { expirationTtl: ttl + GUARDA_PASE });
  const caja = await env.FEEHUND_KV.get('ia:caja:' + ref.h);
  if (caja) await env.FEEHUND_KV.put('ia:caja:' + ref.h, caja, { expirationTtl: ttl });
  ref.n = (ref.n || 0) + 1;
  await env.FEEHUND_KV.put(kRef, JSON.stringify(ref), { expirationTtl: 400 * 86400 });
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const limpiarCodigo = (c) => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^FH/, '');
export const huella = async (codigo) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('feehund-ia:' + limpiarCodigo(codigo))));
export const codigoValido = (c) => /^[0-9A-HJKMNP-TV-Z]{16}$/.test(limpiarCodigo(c));

const MESES = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  ca: ['de gener', 'de febrer', 'de març', "d'abril", 'de maig', 'de juny', 'de juliol', "d'agost", 'de setembre', "d'octubre", 'de novembre', 'de desembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
function correoTexto(idioma, codigo, hasta, origen, negocio) {
  const res = correoBase(idioma, codigo, hasta, origen, negocio);
  if (!negocio) return res;
  // negocios: el resumen del datáfono, no el extracto
  const cambios = { es: [['sin subir el extracto otra vez', 'sin subir el resumen del datáfono otra vez'], ['abre tus movimientos', 'abre las cifras de tu negocio']], ca: [["sense pujar l'extracte una altra vegada", 'sense pujar el resum del datàfon una altra vegada'], ['obre els teus moviments', 'obre les xifres del teu negoci']], en: [['without uploading your statement again', 'without uploading your card machine summary again'], ['it opens your transactions', "it opens your business's figures"]] }[idioma] || [];
  cambios.forEach(([x, y]) => { res.texto = res.texto.replace(x, y); });
  return res;
}
function correoBase(idioma, codigo, hasta, origen, negocio) {
  const d = new Date(hasta), enlace = origen + (negocio ? ({ ca: '/ca/datafon/?vuelta#', en: '/en/card-machine/?vuelta#' }[idioma] || '/datafono/?vuelta#') : ({ ca: '/ca/pregunta/#', en: '/en/ask/#' }[idioma] || '/pregunta/#')) + codigo;
  if (idioma === 'ca') return { asunto: 'El teu codi de Feehund', texto: `Aquest és el teu codi de Feehund:\n\n${codigo}\n\nAmb ell tornes quan vulguis, des de qualsevol mòbil, sense pujar l'extracte una altra vegada:\n${enlace}\n\nEl tens fins al ${d.getUTCDate()} ${MESES.ca[d.getUTCMonth()]}.\n\nNo el comparteixis: obre els teus moviments.\n\nVas acceptar que el servei comencés de seguida, així que no hi ha devolucions.\n\nFeehund` };
  if (idioma === 'en') return { asunto: 'Your Feehund code', texto: `This is your Feehund code:\n\n${codigo}\n\nUse it to come back any time, from any phone, without uploading your statement again:\n${enlace}\n\nIt's yours until ${d.getUTCDate()} ${MESES.en[d.getUTCMonth()]}.\n\nDon't share it: it opens your transactions.\n\nYou agreed that the service starts right away, so there are no refunds.\n\nFeehund` };
  return { asunto: 'Tu código de Feehund', texto: `Este es tu código de Feehund:\n\n${codigo}\n\nCon él vuelves cuando quieras, desde cualquier móvil, sin subir el extracto otra vez:\n${enlace}\n\nLo tienes hasta el ${d.getUTCDate()} de ${MESES.es[d.getUTCMonth()]}.\n\nNo lo compartas: abre tus movimientos.\n\nAceptaste que el servicio empezara al momento, así que no hay devoluciones.\n\nFeehund` };
}

/** Activa el pase si la sesión de Stripe está pagada y es de este código. Devuelve el pase o null. */
// Antes del 19/11/2026 el chat se llamaba de otra forma y el pago llevaba ese nombre: se aceptan los dos
export const SERVICIOS = ['pregunta', 'tiqui'];

export async function activarPregunta(env, h, sesion, origen) {
  if (!sesion || sesion.payment_status !== 'paid' || sesion.client_reference_id !== h || !SERVICIOS.includes(sesion.metadata?.servicio)) return null;
  const plan = PLANES[sesion.metadata.plan] ? sesion.metadata.plan : 'basico', P = PLANES[plan];
  const kPase = 'ia:pase:' + h;
  const ya = JSON.parse((await env.FEEHUND_KV.get(kPase)) || 'null');
  if (ya) return ya;
  const pase = { plan, hasta: Date.now() + P.dias * 864e5, usadas: 0, dia: '', hoy: 0, creado: Date.now(), sesion: sesion.id };
  const ttl = P.dias * 86400 + 86400;
  await env.FEEHUND_KV.put(kPase, JSON.stringify(pase), { expirationTtl: ttl + GUARDA_PASE });
  const caja = await env.FEEHUND_KV.get('ia:caja:' + h);
  if (caja) await env.FEEHUND_KV.put('ia:caja:' + h, caja, { expirationTtl: ttl });
  const pend = JSON.parse((await env.FEEHUND_KV.get('ia:pend:' + h)) || 'null');
  const correo = sesion.customer_details?.email || sesion.customer_email;
  if (pend?.codigo && correo) {
    const { asunto, texto } = correoTexto(pend.idioma, pend.codigo, pase.hasta, origen || 'https://feehund.com', plan.indexOf('negocio') === 0);
    try { await enviarCorreo(env, { de: { nombre: 'Feehund' }, para: correo, asunto, texto, idem: 'pregunta-' + sesion.id }); } catch (e) { /* el código también se ve en pantalla y en el recibo */ }
  }
  await env.FEEHUND_KV.delete('ia:pend:' + h);
  try { await regalarAmigo(env, h, sesion); } catch (e) { /* el pase del que paga ya está hecho */ }
  return pase;
}
