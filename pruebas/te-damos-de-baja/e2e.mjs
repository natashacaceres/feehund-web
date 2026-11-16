// Prueba de punta a punta de «Te damos de baja» en Chrome, contra la web local y el simulador.
//   1. arrancar: node pruebas/te-damos-de-baja/simulador.mjs  y  wrangler pages dev . --port 8788 --kv FEEHUND_KV
//      (con .dev.vars de pruebas: ver LEEME.md, PRUEBAS=1; ENVIO_MODO=manual o lleida)
//   2. PLAYWRIGHT=<ruta a playwright/index.mjs> CAPTURAS=<carpeta> node pruebas/te-damos-de-baja/e2e.mjs
// Datos inventados: ningún nombre, correo ni DNI real (12345678Z es el DNI de ejemplo de siempre).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const WEB = process.env.WEB || 'http://localhost:8788', SIM = process.env.SIM || 'http://localhost:8791';
const CAP = process.env.CAPTURAS || path.resolve('capturas-baja'); fs.mkdirSync(CAP, { recursive: true });
const vars = Object.fromEntries(fs.readFileSync(new URL('../../.dev.vars', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const MODO = vars.ENVIO_MODO === 'lleida' ? 'lleida' : 'manual';
const correos = async () => (await fetch(SIM + '/correo.json')).json();
const devoluciones = async () => (await fetch(SIM + '/devoluciones.json')).json();
const tarea = async (hoy) => (await fetch(WEB + '/api/baja/tarea' + (hoy ? '?hoy=' + hoy : ''), { method: 'POST', headers: { authorization: 'Bearer ' + vars.TAREA_SECRET } })).json();
const dia = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
let n = 0; const foto = async (page, nombre) => { await page.screenshot({ path: path.join(CAP, `${String(++n).padStart(2, '0')}-${nombre}.png`), fullPage: true }); };
const PERSONA = { nombre: 'Ana Prueba Ejemplo', correo: `ana.prueba+${Date.now().toString(36)}@example.com`, dni: '12345678Z' };
const EQUIPO = vars.AVISOS_CORREO;
const ok = (m) => console.log('  ✓ ' + m);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const certificadoPrueba = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n' + 'Certificado de prueba de Lleida.net '.repeat(10) + '\n%%EOF\n');
const enlaceGestion = (texto) => /https?:\/\/\S+\/baja\/gestion\/\?g=\S+/.exec(texto)[0].replace(/^https?:\/\/[^/]+/, WEB);

async function codigoPara(correo) {
  for (let i = 0; i < 20; i++) {
    const c = (await correos()).filter((x) => x.to.includes(correo) && /: \d{6}$/.test(x.subject)).pop();
    if (c) return c.subject.slice(-6);
    await espera(250);
  }
  throw new Error('sin código');
}
async function correoA(para, re) {
  for (let i = 0; i < 40; i++) { const c = (await correos()).filter((x) => x.to.includes(para) && re.test(x.subject)).pop(); if (c) return c; await espera(250); }
  throw new Error(`sin correo a ${para} ${re}`);
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
}
/** Lo que pasa por detrás tras pagar: a mano (correo urgente + página de gestión) o solo (tarea). Devuelve el correo urgente. */
async function enviarPorDetras(page, empresa, { fotos = false } = {}) {
  if (MODO === 'lleida') { await tarea(); return null; }
  const urg = await correoA(EQUIPO, new RegExp(`^(URGENTE|RECORDATORIO) · Enviar la baja de ${empresa} antes del `));
  const g = await page.context().newPage();
  await g.goto(enlaceGestion(urg.text)); await g.waitForSelector('#geOk:visible');
  if (fotos) await foto(g, 'gestion-equipo');
  await g.setInputFiles('#geCert', { name: 'certificado.pdf', mimeType: 'application/pdf', buffer: certificadoPrueba });
  await g.click('#geHecho'); await g.waitForSelector('#geMsg.tb-ok');
  if (fotos) await foto(g, 'gestion-hecho');
  await g.close();
  return urg;
}

await fetch(SIM + '/control/vaciar'); // cada prueba empieza con el buzón vacío
const navegador = await chromium.launch({ channel: process.env.CANAL || 'chrome' });
const ctx = await navegador.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2, locale: 'es-ES' });
const page = await ctx.newPage();
const fallos = []; ctx.on('weberror', (e) => fallos.push(e.error().message));
console.log(`(modo ${MODO})`);

console.log('1 · O2, lo antes posible, con foto del DNI, firma dibujada y lote de 3');
await page.goto(WEB + '/baja/enviar/?empresa=o2&nombre=O2');
await page.waitForSelector('#tbH1:visible');
assert.equal(await page.locator('input[name="cuando"][value="ya"]').isChecked(), true); // O2 solo tiene «lo antes posible»
await foto(page, 'paso1-cuando');
await page.click('#tbN1');
await page.fill('#tbNombre', PERSONA.nombre); await page.fill('#tbCorreo', PERSONA.correo);
await page.fill('#tbDato', 'LINEA-DE-PRUEBA-1'); await page.fill('#tbDni', PERSONA.dni);
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
assert.match(await page.textContent('#tbPackNota'), /2,99 € cada una/);
await page.check('input[name="pack"][value="3"]');
assert.match(await page.textContent('#tbPay'), /Pagar y enviar · 9,97 €/);
await page.check('#tbDes');
await foto(page, 'paso4-pago');
await page.click('#tbPay');
await page.waitForURL(/\/pagar\//);
assert.match(await page.textContent('body'), /9,97 €/);
await foto(page, 'stripe-simulado');
await page.click('#pagar');
await page.waitForURL(/\/baja\/gracias\/\?p=/);
await page.waitForSelector('#grOk:visible', { timeout: 30000 });
assert.match(await page.textContent('#grOk'), /Gracias por ser parte de Feehund[\s\S]*Ya estamos gestionando tu baja de O2[\s\S]*La enviamos en las próximas 24 horas[\s\S]*Trataremos de estar a la altura/);
assert.ok((await page.textContent('#grOk')).includes(PERSONA.correo));
assert.match(await page.textContent('#grLote'), /Te quedan 2 bajas pagadas/);
await espera(900); await foto(page, 'gracias');
const pToken = new URL(page.url()).searchParams.get('p');
const urlEstado1 = WEB + '/baja/estado/?p=' + pToken;
const recibido = await correoA(PERSONA.correo, /^Recibido: enviamos tu baja de O2 en 24 horas$/);
assert.ok(recibido.adjuntos.some((a) => a.startsWith('solicitud-de-baja')));
ok('página de gracias y correo «Recibido: enviamos tu baja… en 24 horas» con la carta');
await page.goto(urlEstado1);
await page.waitForSelector('.tb-est[data-estado="en_marcha"]:visible');
await foto(page, 'estado-en-marcha');
const urg = await enviarPorDetras(page, 'O2', { fotos: true });
if (urg) {
  assert.match(urg.text, /Para: bajas@o2online\.es/); assert.match(urg.text, /Asunto \(cópialo tal cual[^\n]*: Solicitud de baja del contrato · Ana Prueba Ejemplo · FH-/);
  assert.ok(urg.adjuntos.some((a) => a.startsWith('solicitud-de-baja'))); assert.ok(!urg.adjuntos.some((a) => a.includes('identidad')), 'la foto del DNI no va en el correo');
  assert.ok(!(await correos()).some((c) => c.to.includes('bajas@o2online.es')), 'en modo manual la web no escribe a la empresa');
  ok('correo URGENTE al equipo con la dirección de la ficha, el asunto y la carta; gestión: certificado subido');
} else {
  const alaEmpresa = (await correos()).find((c) => c.to.includes('bajas@o2online.es'));
  assert.deepEqual(alaEmpresa.cc, ['correo@certificado.lleida.net']); assert.deepEqual(alaEmpresa.reply_to, [PERSONA.correo]);
  ok('carta a bajas@o2online.es con copia a Lleida y justificante traído por la tarea');
}
const just = await correoA(PERSONA.correo, /^Tu baja de O2 ya está enviada: aquí tienes el justificante$/);
assert.deepEqual(just.adjuntos.map((a) => a.split('-')[0]), ['justificante', 'solicitud']);
await page.goto(urlEstado1);
await page.waitForSelector('.tb-est[data-estado="hecha"]:visible');
await page.waitForSelector('.tb-est[data-estado="hecha"] [data-api="certificado-pdf"]:visible');
assert.match(await page.textContent('#tbLoteH'), /Te quedan 2 bajas pagadas/);
await foto(page, 'estado-hecha-con-justificante-y-lote');
const pdf = Buffer.from(await (await page.request.get(WEB + '/api/baja/carta.pdf?p=' + pToken)).body());
assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1); assert.match(pdf.toString('latin1'), /\/Subtype \/Image/);
fs.writeFileSync(path.join(CAP, 'carta-o2.pdf'), pdf);
ok('justificante a la persona (certificado + carta); estado «Baja enviada»; carta de una hoja con firma');

console.log('2 · Segunda carta gratis (una por compra)');
await page.click('#tbRecMano');
await page.fill('#tbRecFecha', dia(0)); await page.fill('#tbRecImp', '12,50');
await foto(page, 'recobro');
await page.click('#tbRecEnviar');
await page.waitForSelector('#tbRecOk:visible');
await correoA(PERSONA.correo, /^Recibido: enviamos una segunda carta a O2 en 24 horas$/);
if (MODO === 'manual') { const u = await correoA(EQUIPO, /^URGENTE · Enviar la segunda carta a O2 antes del /); assert.ok(u.adjuntos.some((a) => a.startsWith('justificante-')) && /12,50 €/.test(u.text)); }
const otra = await page.evaluate(async (p) => (await fetch('/api/baja/recobro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p, fecha: new Date().toISOString().slice(0, 10), importe: 3 }) })).status, pToken);
assert.equal(otra, 400);
ok('segunda carta con el justificante; la tercera se rechaza');

console.log('3 · Usar una del lote: Basic-Fit al acabar la permanencia (programada)');
await page.goto(urlEstado1);
await page.waitForFunction(() => document.querySelectorAll('#tbLoteEmp option').length > 20);
await page.selectOption('#tbLoteEmp', 'basic-fit');
await page.click('#tbLoteUsar');
await page.waitForSelector('#tbH1:visible');
await page.check('input[name="cuando"][value="fin"]');
await page.fill('#tbFecha', dia(75));
await page.waitForSelector('#tbCalc:visible');
await foto(page, 'lote-basic-fit-fecha');
await page.click('#tbN1');
await page.fill('#tbNombre', PERSONA.nombre); await page.fill('#tbCorreo', PERSONA.correo); await page.fill('#tbDato', 'SOCIO-PRUEBA-7');
await page.click('#tbN2'); await firmarYSeguir(page, { dibujar: false }); await page.click('#tbN3');
await page.waitForSelector('#tbLote:visible');
assert.match(await page.textContent('#tbPay'), /Programar mi baja/);
await page.check('#tbDes'); await page.click('#tbPay');
await page.waitForSelector('#grOk:visible');
assert.match(await page.textContent('#grOk'), /La enviamos el/);
await espera(900); await foto(page, 'gracias-programada');
const pBasic = new URL(page.url()).searchParams.get('p'), urlBasic = WEB + '/baja/estado/?p=' + pBasic;
await correoA(PERSONA.correo, /^Recibido: enviamos tu baja de Basic-Fit el /);
const envioBasic = (await (await page.request.get(WEB + '/api/baja/estado?p=' + pBasic)).json()).envio;
let t = await tarea(); assert.equal(t.enviadas + t.avisos, 0, 'no sale antes de tiempo');
t = await tarea(envioBasic); assert.equal(t.enviadas + t.avisos, 1, JSON.stringify(t));
if (MODO === 'manual') { const u = await correoA(EQUIPO, /^URGENTE · Enviar la baja de Basic-Fit antes del .+\(todo el día\)/); assert.match(u.text, /le hemos dicho que sale el /); }
t = await tarea(envioBasic); assert.equal(t.avisos, 0, 'el mismo día no se repite el aviso');
await enviarPorDetras(page, 'Basic-Fit');
await correoA(PERSONA.correo, /^Tu baja de Basic-Fit ya está enviada/);
ok(`programada para el ${envioBasic}; ese día la tarea ${MODO === 'manual' ? 'avisa al equipo' : 'la envía'}`);

console.log('4 · Zoom programada y cancelada: devuelve 2,99 €');
await page.goto(urlBasic);
await page.waitForFunction(() => document.querySelectorAll('#tbLoteEmp option').length > 20);
await page.selectOption('#tbLoteEmp', 'zoom'); await page.click('#tbLoteUsar');
await page.waitForSelector('#tbH1:visible');
await page.check('input[name="cuando"][value="ren"]'); await page.fill('#tbFecha', dia(200));
await page.click('#tbN1');
await page.fill('#tbNombre', PERSONA.nombre); await page.fill('#tbCorreo', PERSONA.correo);
assert.match(await page.textContent('#tbCartaTxt'), /I hereby request the cancellation of my contract with Zoom, so that it does not renew/);
await foto(page, 'zoom-carta-en-ingles');
await page.click('#tbN2'); await firmarYSeguir(page, { dibujar: false }); await page.click('#tbN3');
await page.check('#tbDes'); await page.click('#tbPay');
await page.waitForSelector('#grOk:visible');
await page.goto(WEB + '/baja/estado/?p=' + new URL(page.url()).searchParams.get('p'));
await page.waitForSelector('.tb-est[data-estado="programada"]:visible');
page.once('dialog', (d) => d.accept());
await page.click('#tbBorrar');
await page.waitForFunction(() => /2,99/.test(document.getElementById('tbBorrarNota').textContent));
await foto(page, 'zoom-cancelada');
assert.ok((await devoluciones()).some((d) => d.amount === 299 && d.metadata?.motivo === 'cancelada'));
ok('cancelada antes de salir y devueltos 2,99 €');

console.log('5 · No se puede entregar, y el aviso de Stripe no llega: se comprueba al volver y se devuelven 3,99 €');
if (MODO === 'lleida') await fetch(SIM + '/control/rebotar');
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
await page.waitForSelector('#grOk:visible', { timeout: 30000 });
assert.match(await page.textContent('#grOk'), /Thank you for being part of Feehund/);
await espera(900); await foto(page, 'en-thanks');
const pEn = new URL(page.url()).searchParams.get('p');
if (MODO === 'manual') {
  const u = await correoA(EQUIPO, /^URGENTE · Enviar la baja de Privilegios en Compras antes del /);
  const g = await ctx.newPage(); await g.goto(enlaceGestion(u.text));
  await g.waitForSelector('#geOk:visible'); g.once('dialog', (d) => d.accept()); await g.click('#geDevolver'); await g.waitForSelector('#geMsg.tb-ok'); await g.close();
} else await tarea();
await page.goto(WEB + '/en/cancel/status/?p=' + pEn); await page.waitForSelector('.tb-est[data-estado="devuelta"]:visible');
await foto(page, 'en-devuelta');
assert.ok((await devoluciones()).some((d) => d.amount === 399 && d.metadata?.motivo === 'no_entregada'));
ok('sin aviso de Stripe el pago se confirma al volver; no entregada → devolución de 3,99 €');

console.log('6 · Gracias sin pago válido: no confirma nada y lleva a la lista');
await page.goto(WEB + '/baja/gracias/'); await page.waitForURL(/\/baja\/$/);
await page.goto(WEB + '/baja/gracias/?p=inventadoinventado.xxxxxxxxxxxxxxxxxxxxxx'); await page.waitForURL(/\/baja\/$/);
ok('sin pago, a /baja/');

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
