// «Te damos de baja», de principio a fin:
//   borrador (datos + código enviado) → firmada (código bueno + autorización) → pagada → programada | enviada
//   → entregada (certificado de Lleida) → borrada a los DIAS_BORRADO días.  Si no llega: devuelta (con reembolso).
// Una compra (pago de Stripe) lleva de 1 a 5 bajas: la primera a 3,99 €, las demás a 1,99 €. Las que no se usan
// se pueden devolver, y se devuelven solas a los 180 días.

import DATOS from '../../data/te-damos-de-baja.json';
import { calcularEnvio, carta, cartaRecobro, fechaLarga, hoyEspana, sumarDias, validarDatos, PRECIO, MAX_BAJAS, total, euros, esFecha } from '../../assets/te-damos-de-baja/carta.js';
import { aleatorio, codigo6, referencia, sha256, hmac, igual, firmarId, leerToken, b64, deB64 } from './cripto.js';
import { leer, borrar, listar, guardarBaja, guardarCompra, guardar, limitar } from './almacen.js';
import { crearPago, leerPago, devolver, enviarCorreo, estadoCorreo, buscarCertificados, descargarCertificado, LLEIDA_CC, REMITE } from './servicios.js';
import { cartaPdf } from './pdf.js';
import { msj } from './mensajes.js';

export const EMPRESAS = DATOS.empresas;
export const empresaDe = (slug) => EMPRESAS[String(slug || '').toLowerCase().replace(/_/g, '-')] || null;
const IDIOMAS = ['es', 'ca', 'en'];
const RUTA = { es: { estado: '/baja/estado/', enviar: '/baja/enviar/' }, ca: { estado: '/ca/baixa/estat/', enviar: '/ca/baixa/enviar/' }, en: { estado: '/en/cancel/status/', enviar: '/en/cancel/send/' } };
const diasBorrado = (env) => Number(env.DIAS_BORRADO) || 30;
const DIAS_SIN_ENTREGA = 4;   // sin «delivered» de Resend en estos días: se da por no entregada y se devuelve
const DIAS_RESTANTES = 180;   // bajas pagadas sin usar: se devuelven solas
const MAX_ENVIOS_CODIGO = 4, MAX_INTENTOS = 5, MIN_CODIGO = 15;

export class Fallo extends Error { constructor(codigo, estado = 400) { super(codigo); this.codigo = codigo; this.estado = estado; } }
const ahoraISO = () => new Date().toISOString();
const horaEspana = (d = new Date()) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(d);
const base = (env, url) => env.URL_WEB || new URL(url).origin;
const urlEstado = async (env, origen, b) => `${origen}${RUTA[b.idioma].estado}?p=${await firmarId(env, 'baja', b.id)}`;
const nombreArchivo = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------- la carta final ---------- */
function laCarta(b) {
  const e = empresaDe(b.empresa);
  return carta(e, { datos: b.datos, eleccion: b.eleccion, fecha: b.fechaCarta, firma: b.firma ? { cuando: b.firma.cuando, correo: b.datos.correo } : null, ref: b.ref, adjuntaDni: Boolean(b.tieneDni) });
}
async function pdfDe(env, b, c = laCarta(b)) {
  const adj = (await leer(env, 'adj', b.id)) || {};
  return cartaPdf({ lineas: c.cuerpo, negrita: [c.asunto.split(' · ')[0]], firma: adj.firma ? deB64(adj.firma) : null, titulo: c.asunto });
}
// Imagen JPEG en «data:image/jpeg;base64,…» que manda la página (ya reducida). Máximo 1,5 MB.
function jpeg(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m || m[1].length > 2_000_000) throw new Fallo('imagen');
  const b = deB64(m[1]);
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Fallo('imagen');
  return m[1];
}

/* ---------- 1. datos: crea el borrador y manda el código ---------- */
export async function crearBaja(env, req, cuerpo) {
  const e = empresaDe(cuerpo.empresa);
  if (!e) throw new Fallo('empresa', 404);
  const idioma = IDIOMAS.includes(cuerpo.idioma) ? cuerpo.idioma : 'es';
  const hoy = hoyEspana();
  const env1 = calcularEnvio(e, cuerpo.eleccion, hoy);
  if (!env1.ok) throw new Fallo(env1.error);
  const v = validarDatos(e, cuerpo.datos);
  if (!v.ok) throw new Fallo('datos:' + v.errores.join(','));
  const dni = e.dni === 'copia' ? jpeg(cuerpo.dniFoto) : null;

  // Frenos: 30 borradores al día por conexión y 10 por correo (un lote de 5 con algún reintento)
  const ip = await hmac(env.TOKEN_SECRET, 'ip:' + (req.headers.get('cf-connecting-ip') || '') + hoy);
  const quien = await hmac(env.TOKEN_SECRET, 'correo:' + v.datos.correo + hoy);
  if (!(await limitar(env, 'ip:' + ip, 30, 86400)) || !(await limitar(env, 'c:' + quien, 10, 86400))) throw new Fallo('limite', 429);

  // Baja con una compra ya pagada (las que quedan de un lote)
  let compra = null;
  if (cuerpo.compra) {
    const cid = await leerToken(env, 'compra', cuerpo.compra);
    const c = cid && (await leer(env, 'compra', cid));
    if (!c || c.estado !== 'pagada' || c.bajas.length >= c.unidades) throw new Fallo('compra');
    compra = cid;
  }
  const b = {
    id: aleatorio(16), ref: referencia(), empresa: cuerpo.empresa.replace(/_/g, '-'), idioma, eleccion: { cuando: cuerpo.eleccion.cuando, fecha: env1.objetivo },
    envio: env1.envio, tarde: env1.tarde, datos: v.datos, tieneDni: Boolean(dni), estado: 'borrador', creada: ahoraISO(), fechaCarta: hoy,
    compraLote: compra, otp: null, intentos: 0, enviosCodigo: 0,
  };
  if (dni) await guardar(env, 'adj', b.id, { dni }, { ttlDias: 2 });
  await mandarCodigo(env, b);
  await guardarBaja(env, b);
  return { p: await firmarId(env, 'baja', b.id), envio: b.envio, programada: env1.programada, tarde: b.tarde, ref: b.ref };
}

async function mandarCodigo(env, b) {
  if (b.enviosCodigo >= MAX_ENVIOS_CODIGO) throw new Fallo('codigos', 429);
  const c = codigo6();
  b.otp = { h: await hmac(env.TOKEN_SECRET, `otp:${b.id}:${c}`), hasta: Date.now() + MIN_CODIGO * 60_000 };
  b.intentos = 0; b.enviosCodigo++;
  const [asunto, texto] = msj(b.idioma).codigo(c, empresaDe(b.empresa).nombre);
  await enviarCorreo(env, { para: b.datos.correo, asunto, texto, idem: `codigo-${b.id}-${b.enviosCodigo}`, etiquetas: [{ name: 'tipo', value: 'codigo' }] });
}
export async function reenviarCodigo(env, token) {
  const b = await bajaDe(env, token);
  if (b.estado !== 'borrador') throw new Fallo('estado');
  await mandarCodigo(env, b); await guardarBaja(env, b);
  return { ok: true, quedan: MAX_ENVIOS_CODIGO - b.enviosCodigo };
}
async function bajaDe(env, token) {
  const id = await leerToken(env, 'baja', token);
  const b = id && (await leer(env, 'baja', id));
  if (!b) throw new Fallo('no_existe', 404);
  return b;
}

/* ---------- 2. firma: código + autorización (+ firma dibujada opcional) ---------- */
export async function firmar(env, req, token, cuerpo) {
  const b = await bajaDe(env, token);
  if (b.estado !== 'borrador') throw new Fallo('estado');
  if (cuerpo.autorizo !== true) throw new Fallo('autorizo');
  if (b.intentos >= MAX_INTENTOS) throw new Fallo('intentos', 429);
  const c = String(cuerpo.codigo || '');
  const bueno = b.otp && Date.now() < b.otp.hasta && /^\d{6}$/.test(c) && igual(b.otp.h, await hmac(env.TOKEN_SECRET, `otp:${b.id}:${c}`));
  if (!bueno) { b.intentos++; await guardarBaja(env, b); throw new Fallo(b.otp && Date.now() >= b.otp.hasta ? 'caducado' : 'codigo'); }
  const firma = jpeg(cuerpo.firma);
  if (firma) { const adj = (await leer(env, 'adj', b.id)) || {}; adj.firma = firma; await guardar(env, 'adj', b.id, adj, { ttlDias: 2 }); }
  const e = empresaDe(b.empresa);
  const ahora = new Date();
  b.otp = null; b.estado = 'firmada';
  b.fechaCarta = hoyEspana(ahora);
  b.firma = {
    cuando: `${fechaLarga(b.fechaCarta, e.idioma)}, ${horaEspana(ahora)}`, en: ahora.toISOString(),
    ip: await hmac(env.TOKEN_SECRET, 'ip:' + (req.headers.get('cf-connecting-ip') || '')), // no reversible sin la clave agente: (req.headers.get('user-agent') || '').slice(0, 200), dibujada: Boolean(firma),
  };
  const c2 = laCarta(b);
  b.cartaHash = await sha256(c2.cuerpo.join('\n')); // prueba de lo que se firmó
  await guardarBaja(env, b);
  return { ok: true, lote: Boolean(b.compraLote) };
}

/* ---------- 3. pago (o usar una baja del lote) ---------- */
export async function pagar(env, req, token, cuerpo) {
  const b = await bajaDe(env, token);
  if (b.estado !== 'firmada') throw new Fallo('estado');
  if (cuerpo.renuncia !== true) throw new Fallo('renuncia');
  const origen = base(env, req.url);
  const pEstado = await firmarId(env, 'baja', b.id);

  if (b.compraLote) { // ya pagada en un lote: se gasta una
    const c = await leer(env, 'compra', b.compraLote);
    if (!c || c.estado !== 'pagada' || c.bajas.length >= c.unidades) throw new Fallo('compra');
    c.bajas.push(b.id); await guardarCompra(env, c);
    b.compra = c.id; b.renunciaEn = ahoraISO(); b.precio = PRECIO.extra;
    await pagada(env, origen, b);
    return { url: `${origen}${RUTA[b.idioma].estado}?p=${pEstado}` };
  }
  const unidades = Math.min(MAX_BAJAS, Math.max(1, parseInt(cuerpo.unidades, 10) || 1));
  const c = { id: aleatorio(16), estado: 'abierta', unidades, bajas: [b.id], correo: b.datos.correo, idioma: b.idioma, creada: ahoraISO(), total: total(unidades), devueltas: [], recobroUsado: false };
  const M = msj(b.idioma);
  const sesion = await crearPago(env, {
    compra: c.id, unidades, correo: b.datos.correo, idioma: b.idioma,
    vuelta: `${origen}${RUTA[b.idioma].estado}?p=${pEstado}&pago=ok`,
    cancelar: `${origen}${RUTA[b.idioma].enviar}?empresa=${b.empresa}&p=${pEstado}&pago=no`,
    textos: { descripcion: M.descripcion(unidades), renuncia: M.renuncia },
  });
  c.sesion = sesion.id;
  b.compra = c.id; b.renunciaEn = ahoraISO(); b.precio = PRECIO.primera;
  await guardarCompra(env, c); await guardarBaja(env, b);
  return { url: sesion.url };
}

/** Stripe confirma el pago (aviso firmado o comprobación al volver). Idempotente. */
export async function compraPagada(env, origen, compraId, sesion) {
  const c = await leer(env, 'compra', compraId);
  if (!c) return false;
  if (c.estado === 'pagada') return true;
  if (sesion.payment_status !== 'paid' || sesion.client_reference_id !== compraId) return false;
  c.estado = 'pagada'; c.pago = sesion.payment_intent; c.pagadaEn = ahoraISO(); c.cobrado = sesion.amount_total;
  await guardarCompra(env, c);
  for (const id of c.bajas) { const b = await leer(env, 'baja', id); if (b && b.estado === 'firmada') await pagada(env, origen, b); }
  return true;
}

async function pagada(env, origen, b) {
  b.pagadaEn = ahoraISO();
  // la copia del DNI y la firma duran ya lo que dure la baja (la tarea diaria las borra con ella)
  const adj = await leer(env, 'adj', b.id);
  if (adj) await guardar(env, 'adj', b.id, adj, { ttlDias: 400 });
  if (b.envio <= hoyEspana()) return enviar(env, origen, b);
  b.estado = 'programada'; await guardarBaja(env, b);
  const e = empresaDe(b.empresa), [asunto, texto] = msj(b.idioma).programada(e.nombre, fechaLarga(b.envio, b.idioma), await urlEstado(env, origen, b));
  await enviarCorreo(env, { para: b.datos.correo, asunto, texto, idem: `programada-${b.id}`, adjuntos: [{ nombre: `carta-${b.ref}.pdf`, bytes: await pdfDe(env, b), tipo: 'application/pdf' }] });
}

/* ---------- 4. envío con certificado ---------- */
export async function enviar(env, origen, b) {
  if (!['firmada', 'programada'].includes(b.estado) || !b.pagadaEn) throw new Fallo('estado');
  const e = empresaDe(b.empresa);
  if (b.fechaCarta < b.envio) b.fechaCarta = b.envio; // la carta programada lleva la fecha del día en que sale
  const c = laCarta(b), pdf = await pdfDe(env, b, c), adj = (await leer(env, 'adj', b.id)) || {};
  const adjuntos = [{ nombre: `${nombreArchivo(c.asunto.split(' · ')[0])}-${b.ref}.pdf`, bytes: pdf, tipo: 'application/pdf' }];
  if (adj.dni) adjuntos.push({ nombre: `documento-identidad-${b.ref}.jpg`, bytes: deB64(adj.dni), tipo: 'image/jpeg' });
  const quien = b.datos.nombre.replace(/["<>\\]/g, '');
  b.resendId = await enviarCorreo(env, {
    de: `"${quien} (vía Feehund)" <${REMITE}>`, para: env.ENVIO_PRUEBA || e.correo, cc: LLEIDA_CC, responderA: b.datos.correo,
    asunto: c.asunto, texto: c.cuerpo.join('\n'), adjuntos, idem: `baja-${b.id}`, etiquetas: [{ name: 'tipo', value: 'baja' }],
  });
  b.estado = 'enviada'; b.enviadaEn = ahoraISO();
  await guardarBaja(env, b);
  const [asunto, texto] = msj(b.idioma).enviada(e.nombre, await urlEstado(env, origen, b));
  await enviarCorreo(env, { para: b.datos.correo, asunto, texto, idem: `enviada-${b.id}`, adjuntos: [adjuntos[0]] });
  return b;
}

/* ---------- certificado de Lleida.net ---------- */
async function traerCertificado(env, origen, b) {
  const filas = await buscarCertificados(env, b.ref);
  const lista = filas.find((f) => f.estado === 5 || f.estado === 50);
  if (!lista) return false;
  const pdf = await descargarCertificado(env, lista.fileId);
  if (!pdf) return false;
  await guardar(env, 'cert', b.id, { pdf: b64(pdf) }, { ttlDias: diasBorrado(env) + 5 });
  b.certificado = { fileId: lista.fileId, en: ahoraISO() };
  if (b.estado === 'enviada') marcarEntregada(env, b);
  await guardarBaja(env, b);
  const [asunto, texto] = msj(b.idioma).certificado(empresaDe(b.empresa).nombre, await urlEstado(env, origen, b));
  await enviarCorreo(env, { para: b.datos.correo, asunto, texto, idem: `certificado-${b.id}`, adjuntos: [{ nombre: `certificado-${b.ref}.pdf`, bytes: pdf, tipo: 'application/pdf' }] });
  return true;
}
function marcarEntregada(env, b) { b.estado = 'entregada'; b.entregadaEn = b.entregadaEn || ahoraISO(); b.borrarEl = sumarDias(hoyEspana(), diasBorrado(env)); }

async function reembolsar(env, b, motivo) {
  const c = b.compra && (await leer(env, 'compra', b.compra));
  if (!c || !c.pago || c.devueltas.includes(b.id)) return 0;
  const importe = b.precio || PRECIO.extra;
  await devolver(env, { pago: c.pago, importe, clave: b.id, motivo });
  c.devueltas.push(b.id); await guardarCompra(env, c);
  return importe;
}
async function noEntregada(env, b) {
  const imp = await reembolsar(env, b, 'no_entregada');
  b.estado = 'devuelta'; b.devueltaEn = ahoraISO(); b.borrarEl = sumarDias(hoyEspana(), diasBorrado(env));
  await guardarBaja(env, b);
  const [asunto, texto] = msj(b.idioma).devuelta(empresaDe(b.empresa).nombre, euros(imp, b.idioma));
  await enviarCorreo(env, { para: b.datos.correo, asunto, texto, idem: `devuelta-${b.id}` });
}

/** Mira cómo va una baja enviada: entrega (Resend), rebote (devolución) y certificado (Lleida). */
export async function revisar(env, origen, b) {
  if (b.estado === 'enviada') {
    const ev = b.resendId ? await estadoCorreo(env, b.resendId) : null;
    if (ev === 'bounced' || ev === 'failed') { await noEntregada(env, b); return b; }
    if (ev === 'delivered') { marcarEntregada(env, b); await guardarBaja(env, b); }
    else if (Date.now() - Date.parse(b.enviadaEn) > DIAS_SIN_ENTREGA * 864e5) { await noEntregada(env, b); return b; }
  }
  if ((b.estado === 'enviada' || b.estado === 'entregada') && !b.certificado) await traerCertificado(env, origen, b).catch(() => false);
  return b;
}

/* ---------- estado (lo que ve la persona en /baja/estado/) ---------- */
export async function estado(env, req, token) {
  const origen = base(env, req.url);
  let b = await bajaDe(env, token);
  let c = b.compra ? await leer(env, 'compra', b.compra) : null;
  // Al volver de Stripe, si su aviso aún no ha llegado, se pregunta directamente
  if (c && c.estado === 'abierta' && c.sesion && b.estado === 'firmada') {
    const s = await leerPago(env, c.sesion).catch(() => null);
    if (s && (await compraPagada(env, origen, c.id, s))) { b = await leer(env, 'baja', b.id); c = await leer(env, 'compra', c.id); }
  }
  if (b.estado === 'enviada' || (b.estado === 'entregada' && !b.certificado)) b = await revisar(env, origen, b).catch(() => b);
  const e = empresaDe(b.empresa);
  return {
    empresa: b.empresa, nombre: e.nombre, estado: b.estado === 'firmada' && b.compra ? 'pago' : b.estado, ref: b.ref,
    envio: b.envio, enviadaEn: b.enviadaEn || null, entregadaEn: b.entregadaEn || null, certificado: Boolean(b.certificado),
    tarde: b.tarde, efecto: b.eleccion, borrarEl: b.borrarEl || null, correo: b.datos.correo,
    lote: c && c.estado === 'pagada' ? { quedan: c.unidades - c.bajas.length, compra: await firmarId(env, 'compra', c.id) } : null,
    recobro: Boolean(c && !c.recobroUsado && ['enviada', 'entregada'].includes(b.estado)), recobroHecho: Boolean(b.recobroEn),
  };
}

export async function pdfCarta(env, token) { const b = await bajaDe(env, token); if (!b.firma) throw new Fallo('estado'); return { pdf: await pdfDe(env, b), nombre: `carta-${b.ref}.pdf` }; }
export async function pdfCertificado(env, req, token) {
  let b = await bajaDe(env, token);
  if (!b.certificado && ['enviada', 'entregada'].includes(b.estado)) { await traerCertificado(env, base(env, req.url), b).catch(() => false); b = await leer(env, 'baja', b.id); }
  const cert = b.certificado && (await leer(env, 'cert', b.id));
  if (!cert) throw new Fallo('sin_certificado', 404);
  return { pdf: Uint8Array.from(atob(cert.pdf), (x) => x.charCodeAt(0)), nombre: `certificado-${b.ref}.pdf` };
}

/* ---------- segunda carta gratis (una por compra) ---------- */
export async function recobro(env, req, token, cuerpo) {
  const b = await bajaDe(env, token);
  if (!['enviada', 'entregada'].includes(b.estado)) throw new Fallo('estado');
  const c = await leer(env, 'compra', b.compra);
  if (!c || c.recobroUsado) throw new Fallo('recobro_usado');
  const cobro = cuerpo.fecha, importe = Number(String(cuerpo.importe).replace(',', '.'));
  if (!esFecha(cobro) || cobro < b.envio || cobro > hoyEspana() || !(importe > 0 && importe < 10000)) throw new Fallo('datos');
  const e = empresaDe(b.empresa), hoy = hoyEspana();
  const cr = cartaRecobro(e, { datos: b.datos, fecha: hoy, envio: b.envio, ref: b.ref, cobro, importe, firma: { cuando: b.firma.cuando, correo: b.datos.correo } });
  const adjuntos = [{ nombre: `reclamacion-${b.ref}.pdf`, bytes: cartaPdf({ lineas: cr.cuerpo, negrita: [cr.asunto.split(' · ')[0]], titulo: cr.asunto }), tipo: 'application/pdf' }];
  const cert = await leer(env, 'cert', b.id);
  if (cert) adjuntos.push({ nombre: `certificado-${b.ref}.pdf`, bytes: Uint8Array.from(atob(cert.pdf), (x) => x.charCodeAt(0)), tipo: 'application/pdf' });
  c.recobroUsado = true; await guardarCompra(env, c); // antes de enviar: nunca dos segundas cartas
  await enviarCorreo(env, {
    de: `"${b.datos.nombre.replace(/["<>\\]/g, '')} (vía Feehund)" <${REMITE}>`, para: env.ENVIO_PRUEBA || e.correo, cc: LLEIDA_CC, responderA: b.datos.correo,
    asunto: cr.asunto, texto: cr.cuerpo.join('\n'), adjuntos, idem: `recobro-${b.id}`,
  });
  b.recobroEn = ahoraISO(); await guardarBaja(env, b);
  const [asunto, texto] = msj(b.idioma).recobro(e.nombre, await urlEstado(env, base(env, req.url), b));
  await enviarCorreo(env, { para: b.datos.correo, asunto, texto, idem: `recobro-aviso-${b.id}`, adjuntos: [adjuntos[0]] });
  return { ok: true };
}

/* ---------- borrar mis datos ya (y cancelar si aún no ha salido) ---------- */
export async function borrarYa(env, token) {
  const b = await bajaDe(env, token);
  if (b.estado === 'enviada') throw new Fallo('espera'); // hasta saber si ha llegado (devolución automática)
  let imp = 0;
  if (b.estado === 'programada') imp = await reembolsar(env, b, 'cancelada');
  if (b.estado === 'programada') { const [asunto, texto] = msj(b.idioma).cancelada(empresaDe(b.empresa).nombre, euros(imp, b.idioma)); await enviarCorreo(env, { para: b.datos.correo, asunto, texto, idem: `cancelada-${b.id}` }); }
  await Promise.all([borrar(env, 'baja', b.id), borrar(env, 'adj', b.id), borrar(env, 'cert', b.id)]);
  return { ok: true, devuelto: imp };
}

/** Devuelve las bajas pagadas de un lote que no se han usado (1,99 € cada una). */
export async function devolverRestantes(env, token, motivo = 'restantes') {
  const id = await leerToken(env, 'compra', token);
  const c = id && (await leer(env, 'compra', id));
  if (!c || c.estado !== 'pagada') throw new Fallo('compra', 404);
  return devolverResto(env, c, motivo);
}
async function devolverResto(env, c, motivo) {
  const n = c.unidades - c.bajas.length;
  if (n <= 0) return { ok: true, devuelto: 0 };
  const importe = n * PRECIO.extra;
  await devolver(env, { pago: c.pago, importe, clave: c.id + '-resto', motivo });
  c.unidades = c.bajas.length; c.restoDevuelto = (c.restoDevuelto || 0) + importe; await guardarCompra(env, c);
  const [asunto, texto] = msj(c.idioma).restantes(n, euros(importe, c.idioma));
  await enviarCorreo(env, { para: c.correo, asunto, texto, idem: `resto-${c.id}` });
  return { ok: true, devuelto: importe };
}

/* ---------- tarea diaria (la llama el Worker feehund-baja-tarea) ---------- */
export async function tarea(env, origen, hoy = hoyEspana()) {
  const hecho = { enviadas: 0, revisadas: 0, borradas: 0, restos: 0, errores: [] };
  const intentar = async (que, f) => { try { await f(); } catch (err) { hecho.errores.push(`${que}: ${err.codigo || err.message}`.slice(0, 120)); } };
  for (const { id, meta } of await listar(env, 'baja')) {
    if (meta.e === 'programada' && meta.env <= hoy) await intentar('envio ' + id.slice(0, 6), async () => { await enviar(env, origen, await leer(env, 'baja', id)); hecho.enviadas++; });
    else if (meta.e === 'enviada' || meta.e === 'entregada') await intentar('revision ' + id.slice(0, 6), async () => { const b = await leer(env, 'baja', id); if (b.estado === 'enviada' || !b.certificado) { await revisar(env, origen, b); hecho.revisadas++; } });
    if ((meta.e === 'entregada' || meta.e === 'devuelta') && meta.borrar && meta.borrar <= hoy) {
      await intentar('borrado ' + id.slice(0, 6), async () => { await Promise.all([borrar(env, 'baja', id), borrar(env, 'adj', id), borrar(env, 'cert', id)]); hecho.borradas++; });
    }
  }
  for (const { id, meta } of await listar(env, 'compra')) {
    if (meta.e !== 'pagada') continue;
    await intentar('compra ' + id.slice(0, 6), async () => {
      const c = await leer(env, 'compra', id);
      const vieja = sumarDias(c.pagadaEn.slice(0, 10), DIAS_RESTANTES) <= hoy;
      if (vieja && c.unidades > c.bajas.length) { await devolverResto(env, c, 'caducadas'); hecho.restos++; }
      // La compra se borra cuando ya no queda ninguna de sus bajas ni ninguna por usar
      const vivas = await Promise.all(c.bajas.map((b) => leer(env, 'baja', b).then(Boolean).catch(() => true)));
      if (!vivas.some(Boolean) && (vieja || c.unidades <= c.bajas.length)) await borrar(env, 'compra', id);
    });
  }
  return hecho;
}
