// API de «Te damos de baja» (/api/baja/…). La lógica está en functions/_baja/ (LEEME.md lo explica todo).
//   GET  empresa?id=            datos públicos de la empresa y precio (data-api="empresa")
//   GET  empresas               lista para usar una baja del lote
//   POST pedido                 datos de la persona → borrador + código al correo (datos-guardar, baja-inicio)
//   POST firma/reenviar         otro código (firma-reenviar)
//   POST firma                  código + autorización (+ firma dibujada) (firma-verificar)
//   POST pago                   página de pago de Stripe, o gasta una baja del lote (pago, pack-usar)
//   POST stripe                 aviso de Stripe (webhook), firmado con STRIPE_WEBHOOK_SECRET
//   GET  estado?p=              cómo va (baja-estado, pack-restantes) — también la página de gracias
//   GET  carta.pdf?p=           la carta firmada (carta-pdf)
//   GET  certificado.pdf?p=     el justificante (certificado-pdf)
//   POST recobro                segunda carta gratis (recobro-detectado)
//   POST cancelar               cancelar una baja programada antes de que salga (se devuelve el dinero)
//   POST lote/devolver          devolver las bajas del lote que no se han usado
//   GET  gestion?g=             (equipo) datos para enviar la carta a mano
//   GET  gestion/carta.pdf|recobro.pdf?g=
//   POST gestion/hecho          (equipo) subir el certificado de Lleida.net: la persona recibe el justificante
//   POST gestion/devolver       (equipo) no se pudo entregar: devolución
//   POST tarea                  tarea diaria (la llama el Worker con TAREA_SECRET)

import { EMPRESAS, PRECIO, empresaDe, modo, base, Fallo, crearBaja, reenviarCodigo, firmar, pagar, compraPagada, estado, pdfCarta, pdfCertificado, recobro, cancelar, devolverRestantes, gestion, gestionArchivo, gestionHecho, gestionDevolver, tarea } from '../../_baja/flujo.js';
import { eventoStripe } from '../../_baja/servicios.js';
import { igual } from '../../_baja/cripto.js';
import { calcularEnvio, hoyEspana } from '../../../assets/te-damos-de-baja/carta.js';

const ORIGENES = /^(https:\/\/(www\.)?feehund\.com|https:\/\/[a-z0-9-]+\.feehund-web\.pages\.dev|http:\/\/localhost(:\d+)?|http:\/\/127\.0\.0\.1(:\d+)?)$/;
const json = (cuerpo, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
const archivo = ({ bytes, pdf, nombre, tipo = 'application/pdf' }) => new Response(bytes || pdf, { headers: { 'content-type': tipo, 'content-disposition': `inline; filename="${nombre}"`, 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' } });

// Lo que tiene que estar puesto en Cloudflare para abrir el servicio (si falta algo, la página dice que aún no está abierto)
const OBLIGATORIAS = { comun: ['TOKEN_SECRET', 'DATA_KEY', 'BREVO_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRODUCT_BAJA'], manual: ['AVISOS_CORREO'], lleida: ['LLEIDA_USER', 'LLEIDA_API_KEY'] };
const LISTO = (env) => Boolean(env.FEEHUND_KV) && [...OBLIGATORIAS.comun, ...OBLIGATORIAS[modo(env)]].every((k) => env[k]);

async function cuerpoJson(request, max = 12_000_000) {
  if (Number(request.headers.get('content-length') || 0) > max) throw new Fallo('grande', 413);
  const t = await request.text();
  if (t.length > max) throw new Fallo('grande', 413);
  try { return JSON.parse(t || '{}'); } catch { throw new Fallo('json'); }
}

export async function onRequest({ request, env, params }) {
  const ruta = [].concat(params.ruta || []).join('/');
  const url = new URL(request.url), metodo = request.method;
  const p = url.searchParams.get('p'), g = url.searchParams.get('g');
  try {
    // Avisos de fuera (sin comprobación de origen: van firmados)
    if (ruta === 'stripe' && metodo === 'POST') {
      const texto = await request.text();
      const ev = await eventoStripe(env, texto, request.headers.get('stripe-signature'));
      if (!ev) return json({ error: 'firma' }, 400);
      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(ev.type)) {
        const s = ev.data.object;
        if (s.metadata?.servicio === 'te-damos-de-baja') await compraPagada(env, base(env, request.url), s.client_reference_id, s);
      }
      return json({ ok: true });
    }
    if (ruta === 'tarea' && metodo === 'POST') {
      const clave = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
      if (!env.TAREA_SECRET || !igual(clave, env.TAREA_SECRET)) return json({ error: 'clave' }, 401);
      // Solo en pruebas (PRUEBAS=1): ?hoy=AAAA-MM-DD hace la tarea como si fuera ese día
      const hoy = env.PRUEBAS === '1' && /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('hoy') || '') ? url.searchParams.get('hoy') : undefined;
      return json(await tarea(env, base(env, request.url), hoy));
    }

    if (metodo === 'GET') {
      if (ruta === 'empresa') {
        const e = empresaDe(url.searchParams.get('id'));
        if (!e) return json({ error: 'empresa' }, 404);
        const { id, revisado, ...publico } = e;
        const cuando = url.searchParams.get('cuando'); // fecha recomendada si viene la del fin o la renovación
        const envio = cuando ? calcularEnvio(e, { cuando, fecha: url.searchParams.get('fecha') }) : null;
        return json({ ...publico, precio: PRECIO, hoy: hoyEspana(), envio, activo: LISTO(env) });
      }
      if (ruta === 'empresas') return json(Object.entries(EMPRESAS).map(([slug, e]) => ({ slug, nombre: e.nombre, sector: e.sector })));
      if (ruta === 'estado') return json(await estado(env, request, p));
      if (ruta === 'carta.pdf') return archivo(await pdfCarta(env, p));
      if (ruta === 'certificado.pdf') return archivo(await pdfCertificado(env, p));
      if (ruta === 'gestion') return json(await gestion(env, g));
      const m = /^gestion\/(carta\.pdf|recobro\.pdf)$/.exec(ruta);
      if (m) return archivo(await gestionArchivo(env, g, m[1].split('.')[0]));
      return json({ error: 'ruta' }, 404);
    }

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
      case 'cancelar': return json(await cancelar(env, c.p));
      case 'lote/devolver': return json(await devolverRestantes(env, c.compra));
      case 'gestion/hecho': return json(await gestionHecho(env, request, c.g, c));
      case 'gestion/devolver': return json(await gestionDevolver(env, c.g));
      default: return json({ error: 'ruta' }, 404);
    }
  } catch (err) {
    if (err instanceof Fallo) return json({ error: err.codigo }, err.estado);
    // Nunca el detalle: podría llevar datos. Solo el servicio que ha fallado.
    console.log('baja', ruta, err.servicio || 'interno', err.estado || '', err.codigo || err.message?.slice(0, 80));
    return json({ error: err.servicio ? 'servicio' : 'interno', servicio: err.servicio || null }, 502);
  }
}
