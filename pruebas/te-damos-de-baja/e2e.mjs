// Prueba de punta a punta de «Te damos de baja» en Chrome, contra la web local y el simulador.
//   1. arrancar: node pruebas/te-damos-de-baja/simulador.mjs  y  wrangler pages dev . --port 8788 --kv FEEHUND_KV
//      (con .dev.vars de pruebas: ver LEEME.md, PRUEBAS=1)
//   2. PLAYWRIGHT=<ruta a playwright/index.mjs> CAPTURAS=<carpeta> node pruebas/te-damos-de-baja/e2e.mjs
// Datos inventados: ningún nombre, correo ni DNI real (12345678Z es el DNI de ejemplo de siempre).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const WEB = process.env.WEB || 'http://localhost:8788', SIM = process.env.SIM || 'http://localhost:8791';
const CAP = process.env.CAPTURAS || path.resolve('capturas-baja'); fs.mkdirSync(CAP, { recursive: true });
const vars = Object.fromEntries(fs.readFileSync(new URL('../../.dev.vars', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const correos = async () => (await fetch(SIM + '/correo.json')).json();
const devoluciones = async () => (await fetch(SIM + '/devoluciones.json')).json();
const tarea = async (hoy) => (await fetch(WEB + '/api/baja/tarea' + (hoy ? '?hoy=' + hoy : ''), { method: 'POST', headers: { authorization: 'Bearer ' + vars.TAREA_SECRET } })).json();
const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
let n = 0; const foto = async (page, nombre) => { await page.screenshot({ path: path.join(CAP, `${String(++n).padStart(2, '0')}-${nombre}.png`), fullPage: true }); };
const PERSONA = { nombre: 'Ana Prueba Ejemplo', correo: `ana.prueba+${Date.now().toString(36)}@example.com`, dni: '12345678Z' };
const ok = (m) => console.log('  ✓ ' + m);

async function codigoPara(correo) {
  for (let i = 0; i < 20; i++) {
    const c = (await correos()).filter((x) => x.to.includes(correo) && /: \d{6}$/.test(x.subject)).pop();
    if (c) return c.subject.slice(-6);
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('sin código');
}
async function firmarYSeguir(page, { dibujar = true } = {}) {
  await page.waitForSelector('#tbH3:visible');
  const code = await codigoPara(PERSONA.correo);
  const cajas = page.locator('#tbOtp input');
  for (let i = 0; i < 6; i++) await cajas.nth(i).fill(code[i]);
  if (dibujar) {
    const c = await page.locator('#tbFirma').boundingBox();
    await page.mouse.move(c.x + 30, c.y + c.height * 0.6); await page.mouse.down();
    for (let i = 0; i <= 24; i++) await page.mouse.move(c.x + 30 + i * (c.width - 60) / 24, c.y + c.height * (0.5 + 0.25 * Math.sin(i / 2.2)));
    await page.mouse.up();
  }
  await page.check('#tbAut');
  return code;
}

await fetch(SIM + '/control/vaciar'); // cada prueba empieza con el buzón vacío
const navegador = await chromium.launch({ channel: process.env.CANAL || 'chrome' });
const ctx = await navegador.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2, locale: 'es-ES' });
const page = await ctx.newPage();
const fallos = []; page.on('pageerror', (e) => fallos.push(e.message));

console.log('1 · O2, lo antes posible, con foto del DNI, firma dibujada y lote de 3');
await page.goto(WEB + '/baja/enviar/?empresa=o2&nombre=O2');
await page.waitForSelector('#tbH1:visible');
assert.equal(await page.locator('input[name="cuando"][value="ya"]').isChecked(), true); // O2 solo tiene «lo antes posible»
await foto(page, 'paso1-cuando');
await page.click('#tbN1');
await page.fill('#tbNombre', PERSONA.nombre); await page.fill('#tbCorreo', PERSONA.correo);
await page.fill('#tbDato', 'LINEA-DE-PRUEBA-1'); await page.fill('#tbDni', PERSONA.dni);
// «Foto» del DNI: una imagen cualquiera hecha aquí
const png = Buffer.from(await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 400; c.height = 250; const g = c.getContext('2d'); g.fillStyle = '#cde'; g.fillRect(0, 0, 400, 250); g.fillStyle = '#123'; g.font = '28px sans-serif'; g.fillText('DOCUMENTO DE PRUEBA', 20, 130); return [...new Uint8Array(await (await fetch(c.toDataURL('image/png'))).arrayBuffer())]; }));
await page.setInputFiles('#tbDniFoto', { name: 'dni.png', mimeType: 'image/png', buffer: png });
await page.waitForSelector('#tbDniFotoOk:visible');
const carta1 = await page.textContent('#tbCartaTxt');
assert.match(carta1, /Ana Prueba Ejemplo/); assert.ok(carta1.includes(PERSONA.correo)); assert.match(carta1, /DNI\/NIE: 12345678Z/); assert.match(carta1, /dos días hábiles/); assert.match(carta1, /Adjunto copia/);
await foto(page, 'paso2-datos-y-carta');
await page.click('#tbN2');
await firmarYSeguir(page);
await foto(page, 'paso3-firma');
await page.click('#tbN3');
await page.waitForSelector('#tbH4:visible');
await page.check('input[name="pack"][value="3"]');
assert.match(await page.textContent('#tbPay'), /Pagar y enviar · 7,97 €/);
await page.check('#tbDes');
await foto(page, 'paso4-pago');
await page.click('#tbPay');
await page.waitForURL(/\/pagar\//);
assert.match(await page.textContent('body'), /7,97 €/);
await foto(page, 'stripe-simulado');
await page.click('#pagar');
await page.waitForURL(/\/baja\/estado\/\?p=/);
// el simulador entrega al momento: la página puede mostrar ya «entregada»
await page.waitForSelector('.tb-est[data-estado="enviada"]:visible, .tb-est[data-estado="entregada"]:visible', { timeout: 30000 });
await foto(page, 'estado-enviada');
const urlEstado1 = page.url().replace(/&pago=ok$/, '');
let todos = await correos();
const alaEmpresa = todos.find((c) => c.to.includes('bajas@o2online.es'));
assert.ok(alaEmpresa, 'correo a O2');
assert.deepEqual(alaEmpresa.cc, ['correo@certificado.lleida.net']); assert.deepEqual(alaEmpresa.reply_to, [PERSONA.correo]);
assert.match(alaEmpresa.from, /^"Ana Prueba Ejemplo \(vía Feehund\)" <hola@feehund\.com>$/);
assert.match(alaEmpresa.subject, /^Solicitud de baja del contrato · Ana Prueba Ejemplo · FH-/);
assert.deepEqual(alaEmpresa.adjuntos.map((a) => a.split('-')[0]), ['solicitud', 'documento']);
ok('carta a bajas@o2online.es con copia a Lleida, responder a la persona, PDF y DNI adjuntos');
assert.ok(todos.some((c) => c.to.includes(PERSONA.correo) && /Hemos enviado tu baja a O2/.test(c.subject)));
ok('aviso «enviada» a la persona');
// La carta en PDF: una sola página
const pdf = Buffer.from(await (await page.request.get(WEB + '/api/baja/carta.pdf?p=' + new URL(urlEstado1).searchParams.get('p'))).body());
assert.equal(pdf.slice(0, 5).toString(), '%PDF-'); assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1);
assert.match(pdf.toString('latin1'), /\/Subtype \/Image/); // con la firma dibujada
fs.writeFileSync(path.join(CAP, 'carta-o2.pdf'), pdf);
ok('carta en PDF de una sola hoja, con la firma dibujada');

console.log('2 · Tarea diaria: certificado de Lleida');
let t = await tarea(); assert.equal(t.errores.length, 0, JSON.stringify(t));
await page.goto(urlEstado1);
await page.waitForSelector('.tb-est[data-estado="entregada"]:visible');
await page.waitForSelector('.tb-est[data-estado="entregada"] [data-api="certificado-pdf"]:visible');
assert.match(await page.textContent('#tbLoteH'), /Te quedan 2 bajas pagadas/);
await foto(page, 'estado-entregada-con-certificado-y-lote');
todos = await correos();
assert.ok(todos.some((c) => c.to.includes(PERSONA.correo) && /Certificado de entrega/.test(c.subject) && c.adjuntos.some((a) => a.startsWith('certificado-'))));
ok('certificado guardado y enviado a la persona; quedan 2 del lote');

console.log('3 · Segunda carta gratis (una por compra)');
await page.click('#tbRecMano');
await page.fill('#tbRecFecha', dia(0)); await page.fill('#tbRecImp', '12,50');
await foto(page, 'recobro');
await page.click('#tbRecEnviar');
await page.waitForSelector('#tbRecOk:visible');
todos = await correos();
const rec = todos.find((c) => c.to.includes('bajas@o2online.es') && /^Reclamación/.test(c.subject));
assert.ok(rec && rec.adjuntos.some((a) => a.startsWith('certificado-')) && /12,50 €/.test(rec.text));
const otra = await page.evaluate(async (p) => (await fetch('/api/baja/recobro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p, fecha: new Date().toISOString().slice(0, 10), importe: 3 }) })).status, new URL(urlEstado1).searchParams.get('p'));
assert.equal(otra, 400);
ok('segunda carta con certificado; la tercera se rechaza');

console.log('4 · Usar una del lote: Basic-Fit al acabar la permanencia (programada)');
await page.goto(urlEstado1);
await page.waitForSelector('#tbLoteBox:visible');
await page.waitForFunction(() => document.querySelectorAll('#tbLoteEmp option').length > 20);
await page.selectOption('#tbLoteEmp', 'basic-fit');
await page.click('#tbLoteUsar');
await page.waitForSelector('#tbH1:visible');
await page.check('input[name="cuando"][value="fin"]');
const fin = dia(75); await page.fill('#tbFecha', fin);
await page.waitForSelector('#tbCalc:visible');
await foto(page, 'lote-basic-fit-fecha');
await page.click('#tbN1');
await page.fill('#tbNombre', PERSONA.nombre); await page.fill('#tbCorreo', PERSONA.correo); await page.fill('#tbDato', 'SOCIO-PRUEBA-7');
await page.click('#tbN2');
await firmarYSeguir(page, { dibujar: false });
await page.click('#tbN3');
await page.waitForSelector('#tbLote:visible');
assert.match(await page.textContent('#tbPay'), /Programar mi baja/);
await page.check('#tbDes'); await foto(page, 'lote-paso4');
await page.click('#tbPay');
await page.waitForSelector('.tb-est[data-estado="programada"]:visible');
await foto(page, 'estado-programada');
const urlBasic = page.url();
const envioBasic = (await (await page.request.get(WEB + '/api/baja/estado?p=' + new URL(urlBasic).searchParams.get('p'))).json()).envio;
t = await tarea(); assert.ok(!(await correos()).some((c) => c.to.includes('servicioalcliente@basic-fit.es')), 'no sale antes de tiempo');
t = await tarea(envioBasic); assert.equal(t.enviadas, 1, JSON.stringify(t));
assert.ok((await correos()).some((c) => c.to.includes('servicioalcliente@basic-fit.es')));
ok(`programada para el ${envioBasic} y enviada ese día por la tarea`);

console.log('5 · Zoom programada y cancelada: devuelve 1,99 €');
// (la tarea «del día ${envioBasic}» ya ha borrado la baja de O2: pasaron más de 30 días desde su entrega)
assert.equal((await page.request.get(WEB + '/api/baja/estado?p=' + new URL(urlEstado1).searchParams.get('p'))).status(), 404);
await page.goto(urlBasic); await page.waitForSelector('#tbLoteBox:visible');
await page.waitForFunction(() => document.querySelectorAll('#tbLoteEmp option').length > 20);
await page.selectOption('#tbLoteEmp', 'zoom'); await page.click('#tbLoteUsar');
await page.waitForSelector('#tbH1:visible');
await page.check('input[name="cuando"][value="ren"]'); await page.fill('#tbFecha', dia(200));
await page.click('#tbN1');
await page.fill('#tbNombre', PERSONA.nombre); await page.fill('#tbCorreo', PERSONA.correo);
assert.match(await page.textContent('#tbCartaTxt'), /I hereby request the cancellation of my contract with Zoom, so that it does not renew/);
assert.equal(await page.isVisible('#tbCartaIdioma'), true);
await foto(page, 'zoom-carta-en-ingles');
await page.click('#tbN2'); await firmarYSeguir(page, { dibujar: false }); await page.click('#tbN3');
await page.check('#tbDes'); await page.click('#tbPay');
await page.waitForSelector('.tb-est[data-estado="programada"]:visible');
page.once('dialog', (d) => d.accept());
await page.click('#tbBorrar');
await page.waitForFunction(() => /1,99/.test(document.getElementById('tbBorrarNota').textContent));
await foto(page, 'zoom-cancelada');
assert.ok((await devoluciones()).some((d) => d.amount === 199 && d.metadata?.motivo === 'cancelada'));
ok('cancelada antes de salir y devueltos 1,99 €');

console.log('6 · No llega (rebota) y el aviso de Stripe no llega: se comprueba al volver y se devuelve 3,99 €');
await fetch(SIM + '/control/rebotar');
await page.goto(WEB + '/en/cancel/send/?empresa=privicompras');
await page.waitForSelector('#tbH1:visible');
await page.click('#tbN1');
await page.fill('#tbNombre', PERSONA.nombre); await page.fill('#tbCorreo', PERSONA.correo); await page.fill('#tbDato', '4242');
await page.click('#tbN2'); await firmarYSeguir(page, { dibujar: false }); await page.click('#tbN3');
assert.match(await page.textContent('#tbPay'), /Pay and send · 3,99 €/);
await page.check('#tbDes'); await page.click('#tbPay');
await page.waitForURL(/\/pagar\//);
await page.evaluate(() => { document.querySelector('form').action += '?aviso=no'; });
await page.click('#pagar');
await page.waitForSelector('.tb-est[data-estado="devuelta"]:visible', { timeout: 30000 });
await foto(page, 'en-devuelta');
assert.ok((await devoluciones()).some((d) => d.amount === 399 && d.metadata?.motivo === 'no_entregada'));
ok('sin aviso de Stripe el pago se confirma al volver; rebote → devolución de 3,99 €');

console.log('7 · Borrado a los 30 días');
t = await tarea(dia(31)); assert.ok(t.borradas >= 2, JSON.stringify(t));
await page.goto(urlBasic); await page.waitForSelector('.tb-est[data-estado="error"]:visible');
await foto(page, 'borrada-a-los-30-dias');
ok(`borradas ${t.borradas} bajas`);

console.log('8 · Errores: código malo, pago cancelado, empresa no compatible');
await page.goto(WEB + '/ca/baixa/enviar/?empresa=ara');
await page.waitForSelector('#tbH1:visible');
await page.check('input[name="cuando"][value="ya"]'); await page.click('#tbN1');
await page.fill('#tbNombre', PERSONA.nombre); await page.fill('#tbCorreo', PERSONA.correo);
await page.click('#tbN2'); await page.waitForSelector('#tbH3:visible');
for (let i = 0; i < 6; i++) await page.locator('#tbOtp input').nth(i).fill('0');
await page.check('#tbAut'); await page.click('#tbN3');
await page.waitForSelector('#tbE3c:visible'); await foto(page, 'ca-codigo-malo');
await firmarYSeguir(page, { dibujar: false }); await page.click('#tbN3');
await page.check('#tbDes'); await page.click('#tbPay'); await page.waitForURL(/\/pagar\//);
await page.click('#volver');
await page.waitForSelector('#tbE4p:visible'); await foto(page, 'ca-pago-no-completado');
await page.goto(WEB + '/baja/enviar/?empresa=netflix&nombre=Netflix');
await page.waitForSelector('#tbNo:visible'); await foto(page, 'no-compatible');
ok('mensajes de error');

assert.deepEqual(fallos, [], 'errores de JavaScript en la página: ' + fallos.join(' | '));
await navegador.close();
console.log('\nTODO BIEN · capturas en ' + CAP);
