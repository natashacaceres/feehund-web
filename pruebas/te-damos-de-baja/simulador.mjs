// Simulador local de Stripe, Brevo y Lleida.net para probar «Te damos de baja» sin claves ni dinero.
// Uso: node pruebas/te-damos-de-baja/simulador.mjs   (puerto 8791; la web en wrangler pages dev, puerto 8788)
//   http://localhost:8791/correo        buzón: todos los correos «enviados» (con el código de firma)
//   http://localhost:8791/pagar/<id>    la «página de pago» de Stripe (tarjeta de prueba)
// Imita solo lo que usa el servicio, con los mismos nombres de campos que las API de verdad.
// Un destinatario que contiene «rebota» devuelve hardBounces (para probar la devolución automática).
import http from 'node:http';
import crypto from 'node:crypto';

const PUERTO = Number(process.env.PUERTO_SIM || 8791);
const WEB = process.env.WEB || 'http://localhost:8788';
const WHSEC = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_prueba_local';
const sesiones = new Map(), devoluciones = [], correos = [];
let rebotar = false; // GET /control/rebotar: el siguiente correo con copia a Lleida rebota
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const leerCuerpo = (req) => new Promise((ok) => { const t = []; req.on('data', (d) => t.push(d)); req.on('end', () => ok(Buffer.concat(t).toString())); });
const jsonR = (res, cod, obj) => { res.writeHead(cod, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
// Formulario anidado de Stripe → objeto
function deFormulario(t) {
  const o = {};
  for (const [k, v] of new URLSearchParams(t)) {
    const partes = k.replace(/\]/g, '').split('['); let x = o;
    partes.forEach((p, i) => { if (i === partes.length - 1) x[p] = v; else x = x[p] ??= {}; });
  }
  return o;
}
function pdfPrueba(texto) {
  const flujo = `BT /F1 14 Tf 60 780 Td (${texto.replace(/[()\\]/g, '')}) Tj ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let s = '%PDF-1.4\n'; const pos = [];
  objs.forEach((o, i) => { pos.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map((p) => String(p).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(s, 'latin1');
}
async function avisoStripe(s) {
  const cuerpo = JSON.stringify({ id: 'evt_' + crypto.randomUUID(), type: 'checkout.session.completed', data: { object: s } });
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', WHSEC).update(`${t}.${cuerpo}`).digest('hex');
  const r = await fetch(WEB + '/api/baja/stripe', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${v1}` }, body: cuerpo });
  console.log('aviso de Stripe →', r.status);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), ruta = url.pathname;
  const cuerpo = await leerCuerpo(req);
  try {
    /* ---- Stripe ---- */
    if (ruta === '/v1/checkout/sessions' && req.method === 'POST') {
      if (!/^Bearer sk_test_/.test(req.headers.authorization || '')) return jsonR(res, 401, { error: { type: 'invalid_request_error', code: 'api_key_invalid' } });
      const f = deFormulario(cuerpo), id = 'cs_test_' + crypto.randomBytes(10).toString('hex');
      // Como Stripe: importe en cada línea (price_data) sobre un producto que tiene que existir
      const items = Object.values(f.line_items || {});
      if (!items.length || items.some((it) => it.price_data?.product !== (process.env.STRIPE_PRODUCT_BAJA || 'prod_prueba') || it.price_data?.currency !== 'eur')) return jsonR(res, 400, { error: { type: 'invalid_request_error', code: 'resource_missing' } });
      const total = items.reduce((a, it) => a + Number(it.price_data.unit_amount) * Number(it.quantity), 0);
      const s = { id, object: 'checkout.session', url: `http://localhost:${PUERTO}/pagar/${id}`, amount_total: total, currency: 'eur', client_reference_id: f.client_reference_id, customer_email: f.customer_email, metadata: f.metadata, payment_status: 'unpaid', status: 'open', success_url: f.success_url, cancel_url: f.cancel_url, payment_intent: null, custom_text: f.custom_text, items };
      sesiones.set(id, s); return jsonR(res, 200, s);
    }
    if (ruta.startsWith('/v1/checkout/sessions/') && req.method === 'GET') {
      const s = sesiones.get(ruta.split('/').pop()); return s ? jsonR(res, 200, s) : jsonR(res, 404, { error: { code: 'resource_missing' } });
    }
    if (ruta === '/v1/refunds' && req.method === 'POST') {
      const f = deFormulario(cuerpo), idem = req.headers['idempotency-key'];
      const ya = devoluciones.find((d) => d.idem === idem); if (ya) return jsonR(res, 200, ya);
      const d = { id: 're_' + crypto.randomBytes(8).toString('hex'), object: 'refund', amount: Number(f.amount), payment_intent: f.payment_intent, status: 'succeeded', idem, metadata: f.metadata };
      devoluciones.push(d); console.log('devolución', d.amount, d.metadata?.motivo); return jsonR(res, 200, d);
    }
    if (ruta.startsWith('/pagar/')) { // la página de pago
      const s = sesiones.get(ruta.split('/').pop());
      if (!s) { res.writeHead(404); return res.end('No existe'); }
      if (req.method === 'POST') {
        s.payment_status = 'paid'; s.status = 'complete'; s.payment_intent = 'pi_test_' + crypto.randomBytes(8).toString('hex');
        if (url.searchParams.get('aviso') !== 'no') await avisoStripe(s);
        res.writeHead(303, { location: s.success_url }); return res.end();
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Pago de prueba</title>
<body style="font:16px system-ui;max-width:420px;margin:40px auto;padding:0 16px;background:#f6f8fa">
<p style="background:#ffe7b8;padding:8px 12px;border-radius:8px">Simulador de Stripe · modo prueba · no se cobra nada</p>
<h1 style="font-size:22px">Feehund</h1><p>${s.items.map((i) => `${i.quantity} × Te damos de baja · ${(i.price_data.unit_amount / 100).toFixed(2).replace('.', ',')} €`).join('<br>')}</p>
<p style="font-size:28px;font-weight:700">${(s.amount_total / 100).toFixed(2).replace('.', ',')} €</p>
<p>${esc(s.customer_email)}</p><p style="font-size:13px;color:#555">${esc(s.custom_text?.submit?.message)}</p>
<form method="post"><p>Tarjeta 4242 4242 4242 4242 · 12/34 · 123</p><button style="width:100%;padding:14px;font-size:17px;background:#0E5E6F;color:#fff;border:0;border-radius:8px" id="pagar">Pagar</button></form>
<p><a href="${esc(s.cancel_url)}" id="volver">← Volver sin pagar</a></p></body>`);
    }
    /* ---- Brevo (correo transaccional) ---- */
    if (ruta === '/v3/smtp/email' && req.method === 'POST') {
      if (!/^xkeysib-/.test(req.headers['api-key'] || '')) return jsonR(res, 401, { code: 'unauthorized', message: 'Key not found' });
      const j = JSON.parse(cuerpo);
      if (!j.sender?.email || !j.to?.length || !j.subject || !(j.textContent || j.htmlContent)) return jsonR(res, 400, { code: 'missing_parameter', message: 'falta algo' });
      const a = (l) => (l || []).map((x) => x.email);
      const c = { id: `<${crypto.randomUUID()}@smtp-relay.mailin.fr>`, en: new Date().toISOString(), from: `"${j.sender.name}" <${j.sender.email}>`, to: a(j.to), cc: j.cc ? a(j.cc) : undefined,
        reply_to: j.replyTo ? [j.replyTo.email] : undefined, subject: j.subject, text: j.textContent, attachments: (j.attachment || []).map((x) => ({ filename: x.name, content: x.content })) };
      c.last_event = c.to.some((x) => x.includes('rebota')) || (rebotar && (c.cc || []).length) ? 'hardBounces' : 'delivered';
      if ((c.cc || []).length) rebotar = false;
      correos.push(c); console.log('correo →', c.to.join(', '), '·', c.subject); return jsonR(res, 201, { messageId: c.id });
    }
    if (ruta === '/v3/smtp/statistics/events' && req.method === 'GET') {
      const c = correos.find((x) => x.id === url.searchParams.get('messageId'));
      return jsonR(res, 200, { events: c ? [{ event: 'requests', email: c.to[0], messageId: c.id, date: c.en }, { event: c.last_event, email: c.to[0], messageId: c.id, date: c.en }] : [] });
    }
    if (ruta === '/control/vaciar') { correos.length = 0; devoluciones.length = 0; sesiones.clear(); rebotar = false; return jsonR(res, 200, { ok: true }); }
    if (ruta === '/control/rebotar') { rebotar = true; return jsonR(res, 200, { ok: true }); }
    if (ruta === '/devoluciones.json') return jsonR(res, 200, devoluciones);
    if (ruta === '/correo.json') return jsonR(res, 200, correos.map(({ attachments, ...c }) => ({ ...c, adjuntos: (attachments || []).map((a) => a.filename) })));
    if (ruta.startsWith('/adjunto/')) {
      const [, , cid, n] = ruta.split('/'), a = correos.find((c) => c.id === decodeURIComponent(cid))?.attachments?.[Number(n)];
      if (!a) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': a.content_type || 'application/octet-stream', 'content-disposition': `inline; filename="${a.filename}"` }); return res.end(Buffer.from(a.content, 'base64'));
    }
    if (ruta === '/correo') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Buzón de prueba</title><meta http-equiv="refresh" content="5">
<body style="font:15px system-ui;max-width:760px;margin:24px auto;padding:0 16px"><h1 style="font-size:20px">Buzón de prueba (${correos.length})</h1>
${correos.slice().reverse().map((c) => `<article style="border:1px solid #ccc;border-radius:8px;padding:12px;margin:12px 0"><div style="font-size:13px;color:#555">${esc(c.en)} · de ${esc(c.from)}<br>para <b>${esc(c.to.join(', '))}</b>${c.cc ? ' · cc ' + esc(c.cc.join(', ')) : ''}${c.reply_to ? ' · responder a ' + esc(c.reply_to.join(', ')) : ''}</div>
<h2 style="font-size:16px;margin:6px 0">${esc(c.subject)}</h2><pre style="white-space:pre-wrap;font:13px/1.45 ui-monospace,monospace;background:#f6f8fa;padding:8px">${esc(c.text)}</pre>
${(c.attachments || []).map((a, i) => `<a href="/adjunto/${encodeURIComponent(c.id)}/${i}" target="_blank">📎 ${esc(a.filename)}</a>`).join(' · ')}</article>`).join('')}</body>`);
    }
    /* ---- Lleida.net Mailcert ---- */
    if (ruta === '/cgi-bin/mailcertapi.cgi' && req.method === 'POST') {
      const xml = new URLSearchParams(cuerpo).get('xml') || '';
      const campo = (t) => (xml.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1];
      if (!campo('user') || !/^x-api-key /.test(req.headers.authorization || '')) { res.writeHead(200, { 'content-type': 'text/xml' }); return res.end('<result><action>x</action><status>-2</status><msg>Invalid user</msg></result>'); }
      const certificados = correos.filter((c) => (c.cc || []).includes('correo@certificado.lleida.net'));
      if (xml.includes('<list_pdf>')) {
        const ref = campo('subjrw') || '';
        const filas = certificados.map((c, i) => ({ c, i })).filter(({ c }) => c.subject.includes(ref) && c.last_event === 'delivered');
        res.writeHead(200, { 'content-type': 'text/xml' });
        return res.end(`<?xml version="1.0"?><pdf_list last_file_id="${filas.length}">${filas.map(({ c, i }) => `<pdf_row><mail_id>${i + 1}</mail_id><mail_to>${esc(c.to[0])}</mail_to><mail_subj>${esc(c.subject)}</mail_subj><file_id>${i + 1}</file_id><file_status>5</file_status><mail_date>${c.en.replace(/\D/g, '').slice(0, 14)}</mail_date></pdf_row>`).join('')}</pdf_list>`);
      }
      if (xml.includes('<download_pdf>')) {
        const c = certificados[Number(campo('file_id')) - 1];
        if (!c) { res.writeHead(200, { 'content-type': 'text/xml' }); return res.end('<result><status>-3</status></result>'); }
        res.writeHead(200, { 'content-type': 'application/pdf' }); return res.end(pdfPrueba(`Certificado de prueba Lleida.net - ${c.subject} - entregado a ${c.to[0]}`));
      }
    }
    res.writeHead(404); res.end('?');
  } catch (e) { console.error(e); jsonR(res, 500, { error: String(e.message) }); }
}).listen(PUERTO, () => console.log(`Simulador en http://localhost:${PUERTO} (buzón: /correo)`));
