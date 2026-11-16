// El aviso de Stripe (/api/baja/stripe) llega de una cuenta que también cobra el informe del datáfono.
// Lo que no es de «Te damos de baja» se contesta con 200 y no se toca nada: ni pedido, ni correo, ni error.
// node --test pruebas/te-damos-de-baja/webhook.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { onRequest } from '../../functions/api/baja/[[ruta]].js';

const SECRETO = 'whsec_prueba_local';
function entorno() {
  const escrituras = [];
  const kv = { get: async () => null, put: async (k) => { escrituras.push(k); }, delete: async (k) => { escrituras.push('borrar ' + k); }, list: async () => ({ keys: [], list_complete: true }) };
  return { escrituras, env: { FEEHUND_KV: kv, STRIPE_WEBHOOK_SECRET: SECRETO, TOKEN_SECRET: 'x'.repeat(40), DATA_KEY: crypto.randomBytes(32).toString('base64'), BREVO_API_KEY: 'xkeysib-x', STRIPE_SECRET_KEY: 'sk_x', STRIPE_PRODUCT_BAJA: 'prod_x', AVISOS_CORREO: 'equipo@example.com' } };
}
function aviso(objeto, { tipo = 'checkout.session.completed', firma } = {}) {
  const cuerpo = JSON.stringify({ id: 'evt_x', type: tipo, data: { object: objeto } });
  const t = Math.floor(Date.now() / 1000);
  const v1 = firma ?? crypto.createHmac('sha256', SECRETO).update(`${t}.${cuerpo}`).digest('hex');
  return new Request('https://feehund.com/api/baja/stripe', { method: 'POST', body: cuerpo, headers: { 'stripe-signature': `t=${t},v1=${v1}` } });
}
async function llamar(env, request) {
  const antes = globalThis.fetch, salidas = [];
  globalThis.fetch = async (url) => { salidas.push(String(url)); return new Response('{}', { status: 500 }); }; // ningún servicio de fuera
  try { return { r: await onRequest({ request, env, params: { ruta: ['stripe'] } }), salidas }; } finally { globalThis.fetch = antes; }
}

test('pago del informe del datáfono (otro servicio): 200 y nada más', async () => {
  const { env, escrituras } = entorno();
  const { r, salidas } = await llamar(env, aviso({ id: 'cs_live_x', payment_status: 'paid', client_reference_id: null, metadata: {}, amount_total: 400 }));
  assert.equal(r.status, 200);
  assert.deepEqual(escrituras, []); assert.deepEqual(salidas, []);
});

test('pago con otra metadata o de otro tipo de evento: 200 y nada más', async () => {
  const { env, escrituras } = entorno();
  for (const req of [aviso({ payment_status: 'paid', metadata: { servicio: 'informe-datafono' } }), aviso({ metadata: { servicio: 'te-damos-de-baja' } }, { tipo: 'payment_intent.succeeded' }), aviso({ payment_status: 'paid' })]) {
    const { r, salidas } = await llamar(env, req);
    assert.equal(r.status, 200); assert.deepEqual(salidas, []);
  }
  assert.deepEqual(escrituras, []);
});

test('de «Te damos de baja» pero de una compra que no existe: 200, sin escribir nada', async () => {
  const { env, escrituras } = entorno();
  const { r, salidas } = await llamar(env, aviso({ payment_status: 'paid', client_reference_id: 'noexiste', metadata: { servicio: 'te-damos-de-baja', compra: 'noexiste' } }));
  assert.equal(r.status, 200); assert.deepEqual(escrituras, []); assert.deepEqual(salidas, []);
});

test('firma mala: 400 y nada más', async () => {
  const { env, escrituras } = entorno();
  const { r } = await llamar(env, aviso({ metadata: { servicio: 'te-damos-de-baja' } }, { firma: 'f'.repeat(64) }));
  assert.equal(r.status, 400); assert.deepEqual(escrituras, []);
});
