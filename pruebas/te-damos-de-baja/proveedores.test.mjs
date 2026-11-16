// La persona nunca ve el nombre de nuestros proveedores (decisión del 16 nov 2026): solo «correo electrónico
// certificado». En privacidad, la categoría («un prestador cualificado de servicios de confianza…»).
// Pueden nombrarlos: el correo urgente al equipo, la página de gestión, PASOS/LEEME y el código. El justificante
// adjunto lo emite el prestador y lleva su nombre: ese no se toca.
// node --test pruebas/te-damos-de-baja/proveedores.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MENSAJES } from '../../functions/_baja/mensajes.js';
import { carta, cartaRecobro } from '../../assets/te-damos-de-baja/carta.js';

const RAIZ = new URL('../../', import.meta.url).pathname;
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), 'utf8');
// «Resend code» es el botón «reenviar código» en inglés, no el proveedor
const PROVEEDOR = /lleida|brevo|sendinblue|\bresend\b(?! code)|stripe|cloudflare|pingen|mensatek/i;
const sinProveedor = (texto, donde) => { const m = PROVEEDOR.exec(texto); assert.equal(m, null, `${donde}: «${m && texto.slice(Math.max(0, m.index - 60), m.index + 30)}»`); };

test('páginas de envío, estado y gracias (es, ca, en)', () => {
  for (const r of ['baja/enviar', 'baja/estado', 'baja/gracias', 'ca/baixa/enviar', 'ca/baixa/estat', 'ca/baixa/gracies', 'en/cancel/send', 'en/cancel/status', 'en/cancel/thanks']) {
    sinProveedor(leer(r + '/index.html'), r);
  }
  // el script, sin sus comentarios (los comentarios no los ve nadie)
  sinProveedor(leer('assets/te-damos-de-baja.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$|\s\/\/ .*$/gm, ''), 'assets/te-damos-de-baja.js');
});

test('condiciones y privacidad: la sección de «Te damos de baja» (y en privacidad, la categoría)', () => {
  for (const r of ['condiciones', 'ca/condicions', 'en/terms', 'privacidad', 'ca/privacitat', 'en/privacy']) {
    const s = leer(r + '/index.html'), i = s.indexOf('id="te-damos-de-baja"');
    assert.ok(i > 0, r);
    sinProveedor(s.slice(i, s.indexOf('<h2', i + 10)), r);
  }
  assert.match(leer('privacidad/index.html'), /un prestador cualificado de servicios de confianza que certifica el envío/);
  // en la lista general de destinatarios, la categoría y no el nombre
  for (const r of ['privacidad', 'ca/privacitat', 'en/privacy']) assert.doesNotMatch(leer(r + '/index.html'), /<strong>(Lleida\.net|Resend|Brevo):<\/strong>/, r);
});

test('correos a la persona, texto del pago y cartas (es, ca, en)', () => {
  for (const [idioma, M] of Object.entries(MENSAJES)) {
    for (const [k, f] of Object.entries(M)) {
      const salida = typeof f === 'function' ? [].concat(f('Empresa', 'Fecha', 'https://feehund.com/x')).join('\n') : f;
      sinProveedor(salida, `${idioma}.${k}`);
    }
  }
  const DATOS = JSON.parse(leer('data/te-damos-de-baja.json'));
  const d = { nombre: 'Ana Prueba Ejemplo', correo: 'ana@example.com', dni: '12345678Z', dato: 'X' };
  for (const e of Object.values(DATOS.empresas)) {
    sinProveedor(carta(e, { datos: d, eleccion: { cuando: e.opciones[0], fecha: '2027-06-01' }, ref: 'FH-AAAA-BBBB', firma: { cuando: 'hoy', correo: d.correo } }).cuerpo.join('\n'), e.id);
    sinProveedor(cartaRecobro(e, { datos: d, fecha: '2027-01-01', envio: '2026-12-01', ref: 'FH-AAAA-BBBB', cobro: '2026-12-20', importe: 9.5, firma: { cuando: 'hoy', correo: d.correo } }).cuerpo.join('\n'), e.id + ' (segunda carta)');
  }
});
