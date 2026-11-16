// API de «Te damos de baja» (/api/baja/…). La lógica está en functions/_baja/ (LEEME.md lo explica todo).
//   GET  empresa?id=            datos públicos de la empresa (data-api="empresa")
//   POST pedido                 datos de la persona → borrador + código al correo (datos-guardar, baja-inicio)
//   POST firma/reenviar         otro código (firma-reenviar)
//   POST firma                  código + autorización (+ firma dibujada) (firma-verificar)
//   POST pago                   página de pago de Stripe, o gasta una baja del lote (pago, pack-usar)
//   POST stripe                 aviso de Stripe (webhook), firmado con STRIPE_WEBHOOK_SECRET
//   GET  estado?p=              cómo va (baja-estado, pack-restantes)
//   GET  carta.pdf?p=           la carta firmada (carta-pdf)
//   GET  certificado.pdf?p=     el certificado de Lleida.net (certificado-pdf)
//   POST recobro                segunda carta gratis (recobro-detectado)
//   POST borrar                 borrar mis datos ya / cancelar si aún no ha salido
//   POST lote/devolver          devolver las bajas del lote que no se han usado
//   POST tarea                  tarea diaria (la llama el Worker con TAREA_SECRET)

import { EMPRESAS, empresaDe, Fallo, crearBaja, reenviarCodigo, firmar, pagar, compraPagada, estado, pdfCarta, pdfCertificado, recobro, borrarYa, devolverRestantes, tarea } from '../../_baja/flujo.js';
import { eventoStripe } from '../../_baja/servicios.js';
import { igual } from '../../_baja/cripto.js';
import { calcularEnvio, hoyEspana } from '../../../assets/te-damos-de-baja/carta.js';

const ORIGENES = /^(https:\/\/(www\.)?feehund\.com|https:\/\/[a-z0-9-]+\.feehund-web\.pages\.dev|http:\/\/localhost(:\d+)?|http:\/\/127\.0\.0\.1(:\d+)?)$/;
const json = (cuerpo, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
const pdf = ({ pdf, nombre }) => new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${nombre}"`, 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' } });

const LISTO = (env) => Boolean(env.FEEHUND_KV && env.TOKEN_SECRET && env.DATA_KEY && env.RESEND_API_KEY && env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_BAJA1 && env.STRIPE_PRICE_BAJA_EXTRA);

async function cuerpoJson(request, max = 3_000_000) {
  if (Number(request.headers.get('content-length') || 0) > max) throw new Fallo('grande', 413);
  const t = await request.text();
  if (t.length > max) throw new Fallo('grande', 413);
  try { return JSON.parse(t || '{}'); } catch { throw new Fallo('json'); }
}

export async function onRequest({ request, env, params, waitUntil }) {
  const ruta = [].concat(params.ruta || []).join('/');
  const url = new URL(request.url), metodo = request.method;
  const p = url.searchParams.get('p');
  try {
    // Avisos de fuera (sin comprobación de origen: van firmados)
    if (ruta === 'stripe' && metodo === 'POST') {
      const texto = await request.text();
      const ev = await eventoStripe(env, texto, request.headers.get('stripe-signature'));
      if (!ev) return json({ error: 'firma' }, 400);
      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(ev.type)) {
        const s = ev.data.object;
        if (s.metadata?.servicio === 'te-damos-de-baja') await compraPagada(env, env.URL_WEB || url.origin, s.client_reference_id, s);
      }
      return json({ ok: true });
    }
    if (ruta === 'tarea' && metodo === 'POST') {
      const clave = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
      if (!env.TAREA_SECRET || !igual(clave, env.TAREA_SECRET)) return json({ error: 'clave' }, 401);
      // Solo en pruebas (PRUEBAS=1): ?hoy=AAAA-MM-DD hace la tarea como si fuera ese día
      const hoy = env.PRUEBAS === '1' && /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('hoy') || '') ? url.searchParams.get('hoy') : undefined;
      return json(await tarea(env, env.URL_WEB || url.origin, hoy));
    }

    if (metodo === 'GET' && ruta === 'empresa') {
      const e = empresaDe(url.searchParams.get('id'));
      if (!e) return json({ error: 'empresa' }, 404);
      const { id, revisado, ...publico } = e;
      // Fecha recomendada si viene la del fin de la permanencia o la renovación (?cuando=fin&fecha=…)
      const cuando = url.searchParams.get('cuando');
      const envio = cuando ? calcularEnvio(e, { cuando, fecha: url.searchParams.get('fecha') }) : null;
      return json({ ...publico, hoy: hoyEspana(), envio, activo: LISTO(env) });
    }
    if (metodo === 'GET' && ruta === 'empresas') {
      return json(Object.entries(EMPRESAS).map(([slug, e]) => ({ slug, nombre: e.nombre, sector: e.sector })));
    }
    if (metodo === 'GET' && ruta === 'estado') return json(await estado(env, request, p));
    if (metodo === 'GET' && ruta === 'carta.pdf') return pdf(await pdfCarta(env, p));
    if (metodo === 'GET' && ruta === 'certificado.pdf') return pdf(await pdfCertificado(env, request, p));

    if (metodo !== 'POST') return json({ error: 'metodo' }, 405);
    const origen = request.headers.get('origin');
    if (!origen || !ORIGENES.test(origen)) return json({ error: 'origen' }, 403);
    if (!LISTO(env)) return json({ error: 'apagado' }, 503);
    const c = await cuerpoJson(request);
    switch (ruta) {
      case 'pedido': return json(await crearBaja(env, request, c));
      case 'firma/reenviar': return json(await reenviarCodigo(env, c.p));
      case 'firma': return json(await firmar(env, request, c.p, c));
      case 'pago': return json(await pagar(env, request, c.p, c));
      case 'recobro': return json(await recobro(env, request, c.p, c));
      case 'borrar': return json(await borrarYa(env, c.p));
      case 'lote/devolver': return json(await devolverRestantes(env, c.compra));
      default: return json({ error: 'ruta' }, 404);
    }
  } catch (err) {
    if (err instanceof Fallo) return json({ error: err.codigo }, err.estado);
    // Nunca el detalle: podría llevar datos. Solo el servicio que ha fallado.
    console.log('baja', ruta, err.servicio || 'interno', err.estado || '', err.codigo || err.message?.slice(0, 80));
    return json({ error: err.servicio ? 'servicio' : 'interno', servicio: err.servicio || null }, 502);
  }
}
