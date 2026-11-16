// La persona ve EXACTAMENTE lo mismo con el envío a mano (fase 1, ENVIO_MODO=manual) que con el automático
// (fase 2, ENVIO_MODO=lleida): mismos correos (asunto, texto, adjuntos) y mismo estado en cada paso.
// Corre el recorrido entero con functions/_baja/flujo.js, un KV en memoria y el simulador de Stripe/Resend/Lleida.
// node --test pruebas/te-damos-de-baja/modos.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const PUERTO = 8793, SIM = `http://localhost:${PUERTO}`;
const sim = spawn(process.execPath, [new URL('./simulador.mjs', import.meta.url).pathname], { env: { ...process.env, PUERTO_SIM: String(PUERTO), WEB: 'http://localhost:1' }, stdio: 'ignore' });
test.after(() => sim.kill());
for (let i = 0; i < 50; i++) { try { await fetch(SIM + '/correo.json'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }

const F = await import('../../functions/_baja/flujo.js');
const { firmarId } = await import('../../functions/_baja/cripto.js');

function kvMemoria() {
  const m = new Map();
  return {
    get: async (k) => (m.has(k) ? m.get(k).v : null),
    put: async (k, v, o = {}) => { m.set(k, { v, meta: o.metadata }); },
    delete: async (k) => { m.delete(k); },
    list: async ({ prefix }) => ({ keys: [...m].filter(([k]) => k.startsWith(prefix)).map(([name, x]) => ({ name, metadata: x.meta })), list_complete: true }),
  };
}
const entorno = (modo) => ({
  ENVIO_MODO: modo, FEEHUND_KV: kvMemoria(), TOKEN_SECRET: crypto.randomBytes(32).toString('hex'), DATA_KEY: crypto.randomBytes(32).toString('base64'),
  RESEND_API_KEY: 're_prueba', STRIPE_SECRET_KEY: 'sk_test_prueba', STRIPE_PRODUCT_BAJA: 'prod_prueba', STRIPE_WEBHOOK_SECRET: 'whsec_prueba_local',
  LLEIDA_USER: 'prueba', LLEIDA_API_KEY: 'prueba', AVISOS_CORREO: 'equipo@example.com', URL_WEB: 'https://feehund.com',
  STRIPE_API: SIM, RESEND_API: SIM, LLEIDA_API: SIM + '/cgi-bin/mailcertapi.cgi',
});
const req = () => new Request('https://feehund.com/api/baja/x', { headers: { 'cf-connecting-ip': '192.0.2.1', 'user-agent': 'prueba' } });
const correos = async () => (await fetch(SIM + '/correo.json')).json();
const PDF = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n' + 'x'.repeat(200) + '\n%%EOF\n').toString('base64');

// Lo que la persona ve, sin lo que cambia en cada pasada (referencia, enlaces, código, fechas de hoy)
const limpio = (t) => String(t).replace(/FH-[A-Z0-9]{4}-[A-Z0-9]{4}/g, 'FH-REF').replace(/[?&][pg]=[A-Za-z0-9_.-]+/g, '?p=TOKEN').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, 'MOMENTO').replace(/\b\d{6}\b/g, 'CODIGO');

async function recorrido(modo, correo) {
  const env = entorno(modo), vistas = [];
  const r = await F.crearBaja(env, req(), { empresa: 'o2', idioma: 'es', eleccion: { cuando: 'ya' }, datos: { nombre: 'Ana Prueba Ejemplo', correo, dni: '12345678Z', dato: 'LINEA-1' } });
  const codigo = (await correos()).filter((c) => c.to.includes(correo)).pop().subject.slice(-6);
  await F.firmar(env, req(), r.p, { codigo, autorizo: true });
  const pago = await F.pagar(env, req(), r.p, { unidades: 2, renuncia: true });
  await fetch(pago.url + '?aviso=no', { method: 'POST', redirect: 'manual' }); // paga en el «Stripe» simulado, sin aviso
  const vista = async () => { const { lote, ref, ...v } = await F.estado(env, req(), r.p); vistas.push({ ...v, quedan: lote?.quedan ?? null }); };
  await vista(); // al volver de Stripe (página de gracias / estado)
  if (modo === 'manual') {
    const urgente = (await correos()).filter((c) => c.to.includes('equipo@example.com')).pop();
    assert.match(urgente.subject, /^URGENTE · Enviar hoy la baja de O2 · FH-/);
    assert.match(urgente.text, /Para: bajas@o2online\.es/); // la dirección de la ficha
    const g = await firmarId(env, 'gestion', r.p.split('.')[0]);
    assert.equal((await F.gestion(env, g)).para, 'bajas@o2online.es');
    await F.gestionHecho(env, req(), g, { certificado: PDF });
  } else {
    assert.ok((await correos()).some((c) => c.to.includes('bajas@o2online.es') && c.cc?.includes('correo@certificado.lleida.net')));
    await F.tarea(env, 'https://feehund.com');
  }
  await vista(); // con el justificante
  await F.recobro(env, req(), r.p, { fecha: new Date().toISOString().slice(0, 10), importe: 9.5 });
  await vista();
  const suyos = (await correos()).filter((c) => c.to.includes(correo)).map((c) => ({ asunto: limpio(c.subject), texto: limpio(c.text), adjuntos: c.adjuntos.map(limpio) }));
  return { vistas: vistas.map((v) => JSON.parse(limpio(JSON.stringify(v)))), suyos };
}

test('envío a mano y automático: la persona recibe los mismos correos y ve lo mismo', async () => {
  const a = await recorrido('manual', 'ana.manual@example.com');
  const b = await recorrido('lleida', 'ana.auto@example.com');
  const sinCorreo = (x) => JSON.parse(JSON.stringify(x).replaceAll('ana.manual@example.com', 'X').replaceAll('ana.auto@example.com', 'X'));
  assert.deepEqual(sinCorreo(a.suyos), sinCorreo(b.suyos));
  assert.deepEqual(sinCorreo(a.vistas), sinCorreo(b.vistas));
  // y lo que se ve es lo que se espera
  assert.deepEqual(a.suyos.map((c) => c.asunto), [
    'Tu código para firmar la baja de O2: CODIGO',
    'Recibido: enviamos hoy tu baja de O2',
    'Tu baja de O2 ya está enviada: aquí tienes el justificante',
    'Recibido: enviamos hoy una segunda carta a O2',
  ]);
  assert.deepEqual(a.vistas.map((v) => v.estado), ['en_marcha', 'hecha', 'hecha']);
  assert.equal(a.vistas[0].quedan, 1);
  assert.deepEqual(a.suyos[2].adjuntos, ['justificante-FH-REF.pdf', 'solicitud-de-baja-del-contrato-FH-REF.pdf']);
  for (const c of a.suyos) assert.doesNotMatch(c.texto + c.asunto, /al instante|inmediat/i);
});
