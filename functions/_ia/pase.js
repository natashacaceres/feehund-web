// Pase de «Pregúntale a Tiqui»: lo usan /api/ia (al volver de pagar) y /api/baja/stripe (el aviso de Stripe, por si la
// persona cierra la pestaña antes de volver). Lo que llegue primero lo activa; lo segundo no hace nada.
// La clave del pase es la huella del código (SHA-256): Feehund no guarda el código, solo el tiempo justo para mandarlo por correo.

import { enviarCorreo } from '../_baja/servicios.js';

// Sin contador a la vista. Topes que nadie ve, para que ningún pase dé pérdidas (~2,5 céntimos por pregunta).
export const PLANES = {
  basico: { dias: 7, porDia: 20, total: 40, precio: 99 },       // 0,99 €
  completo: { dias: 90, porDia: 25, total: 120, precio: 299 },  // 2,99 €
};
export const PRODUCTO_TIQUI = 'prod_VeGsASLYslzV0Q'; // Stripe (en vivo): «Pregúntale a Tiqui»

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const limpiarCodigo = (c) => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^FH/, '');
export const huella = async (codigo) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('feehund-ia:' + limpiarCodigo(codigo))));
export const codigoValido = (c) => /^[0-9A-HJKMNP-TV-Z]{16}$/.test(limpiarCodigo(c));

const MESES = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  ca: ['de gener', 'de febrer', 'de març', "d'abril", 'de maig', 'de juny', 'de juliol', "d'agost", 'de setembre', "d'octubre", 'de novembre', 'de desembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
function correoTexto(idioma, codigo, hasta, origen) {
  const d = new Date(hasta), enlace = origen + ({ ca: '/ca/tiqui/#', en: '/en/tiqui/#' }[idioma] || '/tiqui/#') + codigo;
  if (idioma === 'ca') return { asunto: 'El teu codi de Tiqui', texto: `Aquest és el teu codi de Tiqui:\n\n${codigo}\n\nAmb ell tornes quan vulguis, des de qualsevol mòbil, sense pujar l'extracte una altra vegada:\n${enlace}\n\nEl tens fins al ${d.getUTCDate()} ${MESES.ca[d.getUTCMonth()]}.\n\nNo el comparteixis: obre els teus moviments.\n\nVas acceptar que el servei comencés de seguida, així que no hi ha devolucions.\n\nFeehund` };
  if (idioma === 'en') return { asunto: 'Your Tiqui code', texto: `This is your Tiqui code:\n\n${codigo}\n\nUse it to come back any time, from any phone, without uploading your statement again:\n${enlace}\n\nIt's yours until ${d.getUTCDate()} ${MESES.en[d.getUTCMonth()]}.\n\nDon't share it: it opens your transactions.\n\nYou agreed that the service starts right away, so there are no refunds.\n\nFeehund` };
  return { asunto: 'Tu código de Tiqui', texto: `Este es tu código de Tiqui:\n\n${codigo}\n\nCon él vuelves cuando quieras, desde cualquier móvil, sin subir el extracto otra vez:\n${enlace}\n\nLo tienes hasta el ${d.getUTCDate()} de ${MESES.es[d.getUTCMonth()]}.\n\nNo lo compartas: abre tus movimientos.\n\nAceptaste que el servicio empezara al momento, así que no hay devoluciones.\n\nFeehund` };
}

/** Activa el pase si la sesión de Stripe está pagada y es de este código. Devuelve el pase o null. */
export async function activarTiqui(env, h, sesion, origen) {
  if (!sesion || sesion.payment_status !== 'paid' || sesion.client_reference_id !== h || sesion.metadata?.servicio !== 'tiqui') return null;
  const plan = PLANES[sesion.metadata.plan] ? sesion.metadata.plan : 'basico', P = PLANES[plan];
  const kPase = 'ia:pase:' + h;
  const ya = JSON.parse((await env.FEEHUND_KV.get(kPase)) || 'null');
  if (ya) return ya;
  const pase = { plan, hasta: Date.now() + P.dias * 864e5, usadas: 0, dia: '', hoy: 0, creado: Date.now(), sesion: sesion.id };
  const ttl = P.dias * 86400 + 86400;
  await env.FEEHUND_KV.put(kPase, JSON.stringify(pase), { expirationTtl: ttl });
  const caja = await env.FEEHUND_KV.get('ia:caja:' + h);
  if (caja) await env.FEEHUND_KV.put('ia:caja:' + h, caja, { expirationTtl: ttl });
  const pend = JSON.parse((await env.FEEHUND_KV.get('ia:pend:' + h)) || 'null');
  const correo = sesion.customer_details?.email || sesion.customer_email;
  if (pend?.codigo && correo) {
    const { asunto, texto } = correoTexto(pend.idioma, pend.codigo, pase.hasta, origen || 'https://feehund.com');
    try { await enviarCorreo(env, { de: { nombre: 'Feehund' }, para: correo, asunto, texto, idem: 'tiqui-' + sesion.id }); } catch (e) { /* el código también se ve en pantalla y en el recibo */ }
  }
  await env.FEEHUND_KV.delete('ia:pend:' + h);
  return pase;
}
