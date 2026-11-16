// Precio y empresas con botón: lo mismo en las guías de baja, en Mi banco y en el cobro.
// Fuente única: data/te-damos-de-baja.json (lo escribe envio_web.py del motor al «Subir Feehund»).
// node --test pruebas/te-damos-de-baja/coherencia.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = new URL('../../', import.meta.url).pathname;
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), 'utf8');
const DATOS = JSON.parse(leer('data/te-damos-de-baja.json'));
const ENVIO = JSON.parse(leer('data/bajas-envio.json'));
const euros = (c) => `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')} €`;
const CON_BOTON = new Set(Object.keys(DATOS.empresas));
// /baja/gimnasio/ es la página genérica de Design que nunca se rellenó: functions/_middleware.js la redirige a la lista
const REDIRIGIDAS = new Set(['gimnasio']);

test('Mi banco ofrece el envío justo a las empresas con botón', () => {
  const mibanco = new Set(Object.values(ENVIO).filter((x) => x.e).map((x) => x.p));
  assert.deepEqual([...mibanco].sort(), [...CON_BOTON].sort());
  for (const [id, x] of Object.entries(ENVIO)) if (x.e) assert.equal(DATOS.empresas[x.p]?.id, id);
});

for (const dir of ['baja', 'ca/baixa', 'en/cancel']) {
  test(`guías ${dir}: botón en las empresas con envío, con el precio de la primera baja`, () => {
    const conBoton = new Set();
    for (const slug of fs.readdirSync(path.join(RAIZ, dir))) {
      const f = path.join(RAIZ, dir, slug, 'index.html');
      if (!fs.existsSync(f) || REDIRIGIDAS.has(slug)) continue;
      const s = fs.readFileSync(f, 'utf8');
      const m = /<section class="tb-oferta"[\s\S]*?data-empresa="([^"]+)">([^<]*)<\/a><\/section>/.exec(s);
      if (!m) continue;
      assert.equal(m[1], slug, f);
      assert.ok(m[2].endsWith(' · ' + euros(DATOS.precio.primera)), `${f}: «${m[2]}»`);
      conBoton.add(slug);
    }
    // cada empresa con envío tiene su guía con botón (si la guía existe en este idioma)
    for (const slug of CON_BOTON) if (fs.existsSync(path.join(RAIZ, dir, slug, 'index.html'))) assert.ok(conBoton.has(slug), `${dir}/${slug} sin botón`);
    assert.deepEqual([...conBoton].filter((s) => !CON_BOTON.has(s)), [], 'guías con botón de empresas sin envío');
  });
}

test('el cobro usa el precio del archivo de datos (sin precios fijos en Stripe)', async () => {
  const { crearPago } = await import('../../functions/_baja/servicios.js');
  let cuerpo;
  const antes = globalThis.fetch;
  globalThis.fetch = async (url, op) => { cuerpo = new URLSearchParams(op.body); return new Response('{"id":"cs","url":"u"}'); };
  try {
    await crearPago({ STRIPE_SECRET_KEY: 'sk_test', STRIPE_PRODUCT_BAJA: 'prod_x' }, { compra: 'c', unidades: 3, precio: DATOS.precio, correo: 'a@example.com', idioma: 'es', vuelta: 'v', cancelar: 'c', textos: { descripcion: 'd', renuncia: 'r' } });
  } finally { globalThis.fetch = antes; }
  assert.equal(cuerpo.get('line_items[0][price_data][unit_amount]'), String(DATOS.precio.primera));
  assert.equal(cuerpo.get('line_items[0][quantity]'), '1');
  assert.equal(cuerpo.get('line_items[1][price_data][unit_amount]'), String(DATOS.precio.extra));
  assert.equal(cuerpo.get('line_items[1][quantity]'), '2');
  assert.equal(cuerpo.get('line_items[0][price_data][product]'), 'prod_x');
});

test('ningún precio escrito a mano en el código del servicio', () => {
  for (const f of ['assets/te-damos-de-baja.js', 'assets/te-damos-de-baja/carta.js', 'functions/_baja/flujo.js', 'functions/_baja/servicios.js', 'functions/_baja/mensajes.js', 'functions/api/baja/[[ruta]].js']) {
    assert.doesNotMatch(leer(f), /\b\d,\d\d €|\b(399|299|199|499)\b/, f);
  }
});
