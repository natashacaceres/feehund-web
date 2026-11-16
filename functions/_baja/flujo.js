// «Te damos de baja», de principio a fin.
//   borrador (datos + código) → firmada (código + autorización) → pagada → [programada] → enviada → entregada (justificante)
//   → archivada a los DIAS_BORRADO días (90): se guarda 6 años lo que prueba la baja y el pago, y se borra lo demás.
//   Si no llega: devuelta (con reembolso).
// Dos modos (variable ENVIO_MODO), y la persona ve EXACTAMENTE lo mismo en los dos (pantallas, correos, plazos):
//   «manual» (fase 1, por defecto): al tocar enviar llega un correo URGENTE a AVISOS_CORREO con todo lo necesario; se
//            envía a mano por Lleida.net y en /baja/gestion/ se sube el certificado y se marca hecho.
//   «lleida» (fase 2): se envía solo desde hola@feehund.com con copia a Lleida.net y el certificado se trae por su API.
// Precio: data/te-damos-de-baja.json (lo escribe envio_web.py, el único sitio del precio).

import DATOS from '../../data/te-damos-de-baja.json' with { type: 'json' };
import { calcularEnvio, carta, cartaRecobro, fechaLarga, hoyEspana, sumarDias, validarDatos, MAX_BAJAS, total, euros, esFecha } from '../../assets/te-damos-de-baja/carta.js';
import { aleatorio, codigo6, referencia, hmac, sha256, igual, firmarId, leerToken, b64, deB64 } from './cripto.js';
import { leer, borrar, listar, guardarBaja, guardarCompra, guardar, limitar, exportar } from './almacen.js';
import { crearPago, leerPago, devolver, enviarCorreo, estadoCorreo, buscarCertificados, descargarCertificado, LLEIDA_CC } from './servicios.js';
import { cartaPdf } from './pdf.js';
import { msj, urgente } from './mensajes.js';

export const EMPRESAS = DATOS.empresas;
export const PRECIO = DATOS.precio;
export const empresaDe = (slug) => EMPRESAS[String(slug || '').toLowerCase().replace(/_/g, '-')] || null;
export const modo = (env) => (env.ENVIO_MODO === 'lleida' ? 'lleida' : 'manual');
const IDIOMAS = ['es', 'ca', 'en'];
export const RUTA = {
  es: { estado: '/baja/estado/', enviar: '/baja/enviar/', gracias: '/baja/gracias/' },
  ca: { estado: '/ca/baixa/estat/', enviar: '/ca/baixa/enviar/', gracias: '/ca/baixa/gracies/' },
  en: { estado: '/en/cancel/status/', enviar: '/en/cancel/send/', gracias: '/en/cancel/thanks/' },
};
const diasBorrado = (env) => Number(env.DIAS_BORRADO) || 90;
const ANOS_ARCHIVO = 6;        // prueba ante reclamaciones y contabilidad [REVISIÓN LEGAL]
const DIAS_SIN_ENTREGA = 4;   // (modo lleida) sin «delivered» de Brevo en estos días: no entregada y se devuelve
const DIAS_RESTANTES = 180;   // bajas pagadas sin usar: se devuelven solas
const MAX_ENVIOS_CODIGO = 4, MAX_INTENTOS = 5, MIN_CODIGO = 15;

export class Fallo extends Error { constructor(codigo, estado = 400) { super(codigo); this.codigo = codigo; this.estado = estado; } }
const ahoraISO = () => new Date().toISOString();
// Plazo para enviarla a mano: 24 horas desde el pago, o el día programado entero
const plazo = (b) => b.programada ? fechaLarga(b.envio, 'es') + ' (todo el día)'
  : new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(Date.parse(b.pagadaEn) + 864e5));
const horaEspana = (d = new Date()) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(d);
export const base = (env, url) => env.URL_WEB || new URL(url).origin;
const tokenBaja = (env, b) => firmarId(env, 'baja', b.id);
const urlEstado = async (env, origen, b) => `${origen}${RUTA[b.idioma].estado}?p=${await tokenBaja(env, b)}`;
const urlGestion = async (env, origen, b) => `${origen}/baja/gestion/?g=${await firmarId(env, 'gestion', b.id)}`;
const nombreArchivo = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const deBase64 = (s) => Uint8Array.from(atob(s), (x) => x.charCodeAt(0));

/* ---------- la carta ---------- */
function laCarta(b) {
  const e = empresaDe(b.empresa);
  return carta(e, { datos: b.datos, eleccion: b.eleccion, fecha: b.fechaCarta, firma: b.firma ? { cuando: b.firma.cuando, correo: b.datos.correo } : null, ref: b.ref });
}
async function pdfDe(env, b, c = laCarta(b)) {
  const adj = (await leer(env, 'adj', b.id)) || {};
  return cartaPdf({ lineas: c.cuerpo, negrita: [c.asunto.split(' · ')[0]], firma: adj.firma ? deB64(adj.firma) : null, titulo: c.asunto });
}
const archivoCarta = (c, b) => `${nombreArchivo(c.asunto.split(' · ')[0])}-${b.ref}.pdf`;
// Imagen JPEG «data:image/jpeg;base64,…» que manda la página (ya reducida). Máximo 1,5 MB.
function jpeg(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m || m[1].length > 2_000_000) throw new Fallo('imagen');
  const b = deB64(m[1]);
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Fallo('imagen');
  return m[1];
}

/* ---------- foto del DNI (solo empresas que la exigen): hasta la entrega ---------- */
async function fotoDni(env, b) {
  const adj = await leer(env, 'adj', b.id);
  return adj?.dni ? [{ nombre: `dni-nie-${b.ref}.jpg`, bytes: deB64(adj.dni), tipo: 'image/jpeg' }] : [];
}
async function borrarFotoDni(env, b) {
  const adj = await leer(env, 'adj', b.id);
  if (!adj?.dni) return;
  delete adj.dni;
  if (Object.keys(adj).length) await guardar(env, 'adj', b.id, adj, { ttlDias: 400 }); else await borrar(env, 'adj', b.id);
  b.dniCopia = { ...b.dniCopia, borradaEn: ahoraISO() };
}

/* ---------- 1. datos: borrador y código ---------- */
export async function crearBaja(env, req, cuerpo) {
  const e = empresaDe(cuerpo.empresa);
  if (!e) throw new Fallo('empresa', 404);
  const idioma = IDIOMAS.includes(cuerpo.idioma) ? cuerpo.idioma : 'es';
  const hoy = hoyEspana();
  const env1 = calcularEnvio(e, cuerpo.eleccion, hoy);
  if (!env1.ok) throw new Fallo(env1.error);
  const v = validarDatos(e, cuerpo.datos);
  // Foto del DNI/NIE: solo donde la empresa la exige para tramitar la baja (copia_dni = obligatoria)
  const dni = e.copia_dni === 'obligatoria' ? jpeg(cuerpo.dniFoto) : null;
  if (e.copia_dni === 'obligatoria' && !dni) v.errores.push('dnifoto');
  if (v.errores.length) throw new Fallo('datos:' + v.errores.join(','));

  // Frenos: 30 borradores al día por conexión y 10 por correo (un lote de 5 con algún reintento)
  const ip = await hmac(env.TOKEN_SECRET, 'ip:' + (req.headers.get('cf-connecting-ip') || '') + hoy);
  const quien = await hmac(env.TOKEN_SECRET, 'correo:' + v.datos.correo + hoy);
  if (!(await limitar(env, 'ip:' + ip, 30, 86400)) || !(await limitar(env, 'c:' + quien, 10, 86400))) throw new Fallo('limite', 429);

  let compra = null; // baja con una compra ya pagada (las que quedan de un lote)
  if (cuerpo.compra) {
    const cid = await leerToken(env, 'compra', cuerpo.compra);
    const c = cid && (await leer(env, 'compra', cid));
    if (!c || c.estado !== 'pagada' || c.bajas.length >= c.unidades) throw new Fallo('compra');
    compra = cid;
  }
  const b = {
    id: aleatorio(16), ref: referencia(), empresa: String(cuerpo.empresa).toLowerCase().replace(/_/g, '-'), idioma,
    eleccion: { cuando: cuerpo.eleccion.cuando, fecha: env1.objetivo }, envio: env1.envio, tarde: env1.tarde, datos: v.datos,
    estado: 'borrador', dniCopia: dni ? { sha256: await sha256(deB64(dni)) } : null, creada: ahoraISO(), fechaCarta: hoy, compraLote: compra, otp: null, intentos: 0, enviosCodigo: 0,
  };
  if (dni) await guardar(env, 'adj', b.id, { dni }, { ttlDias: 2 });
  await mandarCodigo(env, b);
  await guardarBaja(env, b);
  return { p: await tokenBaja(env, b), envio: b.envio, programada: env1.programada, tarde: b.tarde, ref: b.ref };
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
async function bajaDe(env, token, tipo = 'baja') {
  const id = await leerToken(env, tipo, token);
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
  const e = empresaDe(b.empresa), ahora = new Date();
  b.otp = null; b.estado = 'firmada'; b.fechaCarta = hoyEspana(ahora);
  b.firma = {
    cuando: `${fechaLarga(b.fechaCarta, e.idioma)}, ${horaEspana(ahora)}`, en: ahora.toISOString(),
    ip: await hmac(env.TOKEN_SECRET, 'ip:' + (req.headers.get('cf-connecting-ip') || '')), // no reversible sin la clave
    agente: (req.headers.get('user-agent') || '').slice(0, 200), dibujada: Boolean(firma),
  };
  b.cartaHash = await sha256(laCarta(b).cuerpo.join('\n')); // prueba de lo que se firmó
  await guardarBaja(env, b);
  return { ok: true, lote: Boolean(b.compraLote) };
}

/* ---------- 3. pago (o una baja del lote) ---------- */
export async function pagar(env, req, token, cuerpo) {
  const b = await bajaDe(env, token);
  if (b.estado !== 'firmada') throw new Fallo('estado');
  if (cuerpo.renuncia !== true) throw new Fallo('renuncia');
  const origen = base(env, req.url), p = await tokenBaja(env, b);
  const gracias = `${origen}${RUTA[b.idioma].gracias}?p=${p}`;

  if (b.compraLote) { // ya pagada en un lote: se gasta una
    const c = await leer(env, 'compra', b.compraLote);
    if (!c || c.estado !== 'pagada' || c.bajas.length >= c.unidades) throw new Fallo('compra');
    c.bajas.push(b.id); await guardarCompra(env, c);
    b.compra = c.id; b.renunciaEn = ahoraISO(); b.precio = c.precio?.extra ?? PRECIO.extra;
    await pagada(env, origen, b);
    return { url: gracias };
  }
  const unidades = Math.min(MAX_BAJAS, Math.max(1, parseInt(cuerpo.unidades, 10) || 1));
  const c = { id: aleatorio(16), estado: 'abierta', unidades, bajas: [b.id], correo: b.datos.correo, idioma: b.idioma, creada: ahoraISO(),
    precio: { ...PRECIO }, total: total(unidades, PRECIO), devueltas: [], recobroUsado: false };
  const M = msj(b.idioma);
  const sesion = await crearPago(env, {
    compra: c.id, unidades, precio: PRECIO, correo: b.datos.correo, idioma: b.idioma, vuelta: gracias,
    cancelar: `${origen}${RUTA[b.idioma].enviar}?empresa=${b.empresa}&p=${p}&pago=no`,
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
  const adj = await leer(env, 'adj', b.id); // firma dibujada y foto del DNI: duran hasta la entrega (o el archivo)
  if (adj) await guardar(env, 'adj', b.id, adj, { ttlDias: 400 });
  const programada = b.envio > hoyEspana();
  b.estado = programada ? 'programada' : 'pagada'; b.programada = programada;
  await guardarBaja(env, b);
  // La confirmación a la persona: la misma en los dos modos
  const e = empresaDe(b.empresa), M = msj(b.idioma), url = await urlEstado(env, origen, b);
  const [asunto, texto] = programada ? M.programada(e.nombre, fechaLarga(b.envio, b.idioma), url) : M.recibido(e.nombre, url);
  await enviarCorreo(env, { para: b.datos.correo, asunto, texto, idem: `recibido-${b.id}`, adjuntos: [{ nombre: archivoCarta(laCarta(b), b), bytes: await pdfDe(env, b), tipo: 'application/pdf' }] });
  if (!programada) await despachar(env, origen, b);
}

/** Toca enviar hoy: solo (modo lleida) o aviso urgente para enviarla a mano (modo manual). */
async function despachar(env, origen, b, recordatorio = false, hoy = hoyEspana()) {
  if (modo(env) === 'lleida') return enviar(env, origen, b);
  b.estado = 'pagada'; b.avisadaEn = hoy;
  await guardarBaja(env, b);
  await avisoUrgente(env, origen, b, recordatorio);
}
async function avisoUrgente(env, origen, b, recordatorio) {
  if (!env.AVISOS_CORREO) throw new Fallo('sin_avisos', 503);
  const e = empresaDe(b.empresa), c = laCarta(b);
  const [asunto, texto] = urgente.baja({ e, b, c, recordatorio, gestion: await urlGestion(env, origen, b), lleidaCc: LLEIDA_CC, limite: plazo(b), programada: b.programada });
  await enviarCorreo(env, { para: env.AVISOS_CORREO, asunto, texto, idem: `urgente-${b.id}-${b.avisadaEn}`, adjuntos: [{ nombre: archivoCarta(c, b), bytes: await pdfDe(env, b, c), tipo: 'application/pdf' }, ...(await fotoDni(env, b))] });
}

/* ---------- 4a. envío automático (modo lleida) ---------- */
export async function enviar(env, origen, b) {
  if (!['firmada', 'programada', 'pagada'].includes(b.estado) || !b.pagadaEn) throw new Fallo('estado');
  const e = empresaDe(b.empresa);
  if (b.fechaCarta < b.envio) b.fechaCarta = b.envio; // la carta programada lleva la fecha del día en que sale
  const c = laCarta(b), pdf = await pdfDe(env, b, c);
  const adjuntos = [{ nombre: archivoCarta(c, b), bytes: pdf, tipo: 'application/pdf' }, ...(await fotoDni(env, b))];
  b.correoId = await enviarCorreo(env, {
    de: { nombre: `${b.datos.nombre} (vía Feehund)` }, para: env.ENVIO_PRUEBA || e.correo, cc: LLEIDA_CC, responderA: b.datos.correo,
    asunto: c.asunto, texto: c.cuerpo.join('\n'), adjuntos, idem: `baja-${b.id}`, etiquetas: [{ name: 'tipo', value: 'baja' }],
  });
  b.estado = 'enviada'; b.enviadaEn = ahoraISO();
  await guardarBaja(env, b);
  return b;
}

/* ---------- 4b. hecho a mano (modo manual): /baja/gestion/ ---------- */
export async function gestion(env, token) {
  const b = await bajaDe(env, token, 'gestion'), e = empresaDe(b.empresa), c = laCarta(b);
  return {
    ref: b.ref, estado: b.estado, empresa: e.nombre, para: e.correo, asunto: c.asunto, texto: c.cuerpo.join('\n'), envio: b.envio,
    persona: { nombre: b.datos.nombre, correo: b.datos.correo, dni: b.datos.dni || null, dato: b.datos.dato || null }, dniFoto: (await fotoDni(env, b)).length > 0,
    pagadaEn: b.pagadaEn || null, certificado: Boolean(b.certificado), recobro: b.recobro || null,
  };
}
export async function gestionArchivo(env, token, cual) {
  const b = await bajaDe(env, token, 'gestion');
  if (cual === 'carta') { const c = laCarta(b); return { bytes: await pdfDe(env, b, c), nombre: archivoCarta(c, b), tipo: 'application/pdf' }; }
  if (cual === 'dni') { const [f] = await fotoDni(env, b); if (f) return f; }
  if (cual === 'recobro' && b.recobro) { const r = laRecobro(b); return { bytes: cartaPdf({ lineas: r.cuerpo, negrita: [r.asunto.split(' · ')[0]], titulo: r.asunto }), nombre: `reclamacion-${b.ref}.pdf`, tipo: 'application/pdf' }; }
  throw new Fallo('no_existe', 404);
}
/** Enviada a mano: se sube el certificado de Lleida.net (PDF) y la persona recibe su justificante. */
export async function gestionHecho(env, req, token, cuerpo) {
  const b = await bajaDe(env, token, 'gestion');
  if (!['pagada', 'programada', 'enviada'].includes(b.estado)) throw new Fallo('estado');
  const pdf = cuerpo.certificado ? deBase64(String(cuerpo.certificado).replace(/^data:application\/pdf;base64,/, '')) : null;
  if (!pdf || pdf.length < 100 || pdf.length > 8_000_000 || String.fromCharCode(...pdf.slice(0, 5)) !== '%PDF-') throw new Fallo('certificado');
  if (b.fechaCarta < b.envio) b.fechaCarta = b.envio;
  b.enviadaEn = b.enviadaEn || ahoraISO(); b.enviadaA = 'mano';
  await justificante(env, base(env, req.url), b, pdf);
  return { ok: true };
}
export async function gestionDevolver(env, token) {
  const b = await bajaDe(env, token, 'gestion');
  if (!['pagada', 'programada', 'enviada'].includes(b.estado)) throw new Fallo('estado');
  await noEntregada(env, b);
  return { ok: true };
}

/* ---------- justificante: el mismo en los dos modos ---------- */
async function justificante(env, origen, b, pdf) {
  await guardar(env, 'cert', b.id, { pdf: b64(pdf) }, { ttlDias: diasBorrado(env) + 30 }); // se archiva antes
  b.certificado = { en: ahoraISO() };
  await borrarFotoDni(env, b); // entregada: la copia del DNI ya no hace falta
  b.estado = 'entregada'; b.entregadaEn = b.entregadaEn || ahoraISO(); b.borrarEl = sumarDias(hoyEspana(), diasBorrado(env));
  await guardarBaja(env, b);
  const e = empresaDe(b.empresa), c = laCarta(b);
  const [asunto, texto] = msj(b.idioma).justificante(e.nombre, fechaLarga(b.enviadaEn.slice(0, 10), b.idioma), await urlEstado(env, origen, b));
  await enviarCorreo(env, { para: b.datos.correo, asunto, texto, idem: `justificante-${b.id}`, adjuntos: [
    { nombre: `justificante-${b.ref}.pdf`, bytes: pdf, tipo: 'application/pdf' },
    { nombre: archivoCarta(c, b), bytes: await pdfDe(env, b, c), tipo: 'application/pdf' }] });
}
async function traerCertificado(env, origen, b) { // modo lleida
  const filas = await buscarCertificados(env, b.ref);
  const lista = filas.find((f) => f.estado === 5 || f.estado === 50);
  if (!lista) return false;
  const pdf = await descargarCertificado(env, lista.fileId);
  if (!pdf) return false;
  b.lleidaFile = lista.fileId;
  await justificante(env, origen, b, pdf);
  return true;
}

async function reembolsar(env, b, motivo) {
  const c = b.compra && (await leer(env, 'compra', b.compra));
  if (!c || !c.pago || c.devueltas.includes(b.id)) return 0;
  const importe = b.precio || c.precio?.extra || PRECIO.extra;
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

/** (modo lleida) Cómo va una baja enviada: rebote (devolución) o entrega, y el certificado. */
export async function revisar(env, origen, b) {
  if (modo(env) !== 'lleida' || b.enviadaA === 'mano') return b;
  if (b.estado === 'enviada' && b.correoId) {
    const ev = await estadoCorreo(env, b.correoId);
    if (ev === 'bounced' || ev === 'failed') { await noEntregada(env, b); return b; }
    if (ev !== 'delivered' && Date.now() - Date.parse(b.enviadaEn) > DIAS_SIN_ENTREGA * 864e5) { await noEntregada(env, b); return b; }
  }
  if (b.estado === 'enviada' && !b.certificado) await traerCertificado(env, origen, b).catch(() => false);
  return b;
}

/* ---------- estado (lo que ve la persona: igual en los dos modos) ---------- */
export function estadoCliente(b) {
  if (b.estado === 'borrador' || b.estado === 'firmada') return 'pago';
  if (b.estado === 'programada') return 'programada';
  if (b.estado === 'entregada' && b.certificado) return 'hecha';
  if (b.estado === 'devuelta') return 'devuelta';
  return 'en_marcha'; // pagada, enviada (aún sin justificante)
}
export async function estado(env, req, token) {
  const origen = base(env, req.url);
  let b = await bajaDe(env, token);
  let c = b.compra ? await leer(env, 'compra', b.compra) : null;
  // Al volver de Stripe, si su aviso aún no ha llegado, se pregunta directamente
  if (c && c.estado === 'abierta' && c.sesion && b.estado === 'firmada') {
    const s = await leerPago(env, c.sesion).catch(() => null);
    if (s && (await compraPagada(env, origen, c.id, s).catch(() => false))) { b = await leer(env, 'baja', b.id); c = await leer(env, 'compra', c.id); }
  }
  // El justificante lo trae la tarea (cada hora), no esta consulta: así se ve igual que con el envío a mano
  const e = empresaDe(b.empresa);
  return {
    empresa: b.empresa, nombre: e.nombre, estado: estadoCliente(b), ref: b.ref, envio: b.envio, enviadaEn: b.certificado ? b.enviadaEn : null,
    certificado: Boolean(b.certificado), tarde: b.tarde, efecto: b.eleccion, borrarEl: b.borrarEl || null, correo: b.datos.correo,
    lote: c && c.estado === 'pagada' ? { quedan: c.unidades - c.bajas.length, compra: await firmarId(env, 'compra', c.id) } : null,
    recobro: Boolean(c && !c.recobroUsado && b.certificado && b.estado === 'entregada'), recobroHecho: Boolean(b.recobroEn),
  };
}

export async function pdfCarta(env, token) { const b = await bajaDe(env, token); if (!b.firma) throw new Fallo('estado'); const c = laCarta(b); return { pdf: await pdfDe(env, b, c), nombre: archivoCarta(c, b) }; }
export async function pdfCertificado(env, token) {
  const b = await bajaDe(env, token);
  const cert = b.certificado && (await leer(env, 'cert', b.id));
  if (!cert) throw new Fallo('sin_certificado', 404);
  return { pdf: deBase64(cert.pdf), nombre: `justificante-${b.ref}.pdf` };
}

/* ---------- segunda carta gratis (una por compra) ---------- */
function laRecobro(b) {
  return cartaRecobro(empresaDe(b.empresa), { datos: b.datos, fecha: b.recobro.fecha, envio: (b.enviadaEn || b.envio).slice(0, 10), ref: b.ref, cobro: b.recobro.cobro, importe: b.recobro.importe, firma: { cuando: b.firma.cuando, correo: b.datos.correo } });
}
export async function recobro(env, req, token, cuerpo) {
  const b = await bajaDe(env, token);
  if (b.estado !== 'entregada' || !b.certificado) throw new Fallo('estado');
  const c = await leer(env, 'compra', b.compra);
  if (!c || c.recobroUsado) throw new Fallo('recobro_usado');
  const cobro = cuerpo.fecha, importe = Number(String(cuerpo.importe).replace(',', '.'));
  if (!esFecha(cobro) || cobro < b.envio || cobro > hoyEspana() || !(importe > 0 && importe < 10000)) throw new Fallo('datos');
  const origen = base(env, req.url), e = empresaDe(b.empresa);
  c.recobroUsado = true; await guardarCompra(env, c); // antes de enviar: nunca dos segundas cartas
  b.recobro = { fecha: hoyEspana(), cobro, importe }; b.recobroEn = ahoraISO();
  await guardarBaja(env, b);
  const r = laRecobro(b), pdf = cartaPdf({ lineas: r.cuerpo, negrita: [r.asunto.split(' · ')[0]], titulo: r.asunto });
  const cert = await leer(env, 'cert', b.id);
  const adjuntos = [{ nombre: `reclamacion-${b.ref}.pdf`, bytes: pdf, tipo: 'application/pdf' }];
  if (cert) adjuntos.push({ nombre: `justificante-${b.ref}.pdf`, bytes: deBase64(cert.pdf), tipo: 'application/pdf' });
  if (modo(env) === 'lleida') {
    await enviarCorreo(env, {
      de: { nombre: `${b.datos.nombre} (vía Feehund)` }, para: env.ENVIO_PRUEBA || e.correo, cc: LLEIDA_CC, responderA: b.datos.correo,
      asunto: r.asunto, texto: r.cuerpo.join('\n'), adjuntos, idem: `recobro-${b.id}`,
    });
  } else {
    const [asunto, texto] = urgente.recobro({ e, b, r, gestion: await urlGestion(env, origen, b), lleidaCc: LLEIDA_CC, limite: plazo({ pagadaEn: b.recobroEn }) });
    await enviarCorreo(env, { para: env.AVISOS_CORREO, asunto, texto, idem: `urgente-recobro-${b.id}`, adjuntos });
  }
  const [asunto, texto] = msj(b.idioma).recobro(e.nombre, await urlEstado(env, origen, b));
  await enviarCorreo(env, { para: b.datos.correo, asunto, texto, idem: `recobro-aviso-${b.id}`, adjuntos: [adjuntos[0]] });
  return { ok: true };
}

/* ---------- cancelar una baja programada (antes de que salga) ---------- */
export async function cancelar(env, token) {
  const b = await bajaDe(env, token);
  if (b.estado !== 'programada') throw new Fallo('estado');
  const imp = await reembolsar(env, b, 'cancelada');
  b.estado = 'cancelada'; b.canceladaEn = ahoraISO();
  const [asunto, texto] = msj(b.idioma).cancelada(empresaDe(b.empresa).nombre, euros(imp, b.idioma));
  await enviarCorreo(env, { para: b.datos.correo, asunto, texto, idem: `cancelada-${b.id}` });
  await archivar(env, b);
  return { ok: true, devuelto: imp };
}

/* ---------- archivo: lo que se guarda 6 años (prueba y contabilidad); lo demás se borra ---------- */
// [REVISIÓN LEGAL] qué se guarda y cuánto
export async function archivar(env, b) {
  const e = empresaDe(b.empresa), adj = (await leer(env, 'adj', b.id)) || {}, cert = await leer(env, 'cert', b.id);
  const c = await leer(env, 'compra', b.compra || b.compraLote || '-');
  const carta = b.firma ? laCarta(b) : null;
  const a = {
    ref: b.ref, empresa: { id: b.empresa, nombre: e?.nombre, correo: e?.correo }, persona: { nombre: b.datos.nombre, dni: b.datos.dni || null },
    fechas: { creada: b.creada, firmada: b.firma?.en || null, pagada: b.pagadaEn || null, enviada: b.enviadaEn || null, entregada: b.entregadaEn || null, devuelta: b.devueltaEn || null, cancelada: b.canceladaEn || null },
    estado: b.estado, carta: carta && { asunto: carta.asunto, texto: carta.cuerpo.join('\n'), sha256: b.cartaHash }, firma: b.firma ? { ...b.firma, imagen: adj.firma || null } : null,
    autorizacion: { autorizo: Boolean(b.firma), renunciaEn: b.renunciaEn || null }, certificado: cert?.pdf || null,
    pago: { compra: b.compra || null, intento: c?.pago || null, importe: b.precio || null, devuelto: Boolean(c?.devueltas?.includes(b.id)) },
    dniCopia: b.dniCopia ? { aportada: true, sha256: b.dniCopia.sha256 } : null, // la foto nunca entra en el archivo
    recobro: b.recobro || null, archivadaEn: ahoraISO(),
  };
  await guardar(env, 'archivo', b.id, a, { meta: { ref: b.ref, emp: b.empresa, e: b.estado }, ttlDias: ANOS_ARCHIVO * 366 });
  await Promise.all([borrar(env, 'baja', b.id), borrar(env, 'adj', b.id), borrar(env, 'cert', b.id)]);
}

/** Devuelve las bajas pagadas de un lote que no se han usado. */
export async function devolverRestantes(env, token, motivo = 'restantes') {
  const id = await leerToken(env, 'compra', token);
  const c = id && (await leer(env, 'compra', id));
  if (!c || c.estado !== 'pagada') throw new Fallo('compra', 404);
  return devolverResto(env, c, motivo);
}
async function devolverResto(env, c, motivo) {
  const n = c.unidades - c.bajas.length;
  if (n <= 0) return { ok: true, devuelto: 0 };
  const importe = n * (c.precio?.extra ?? PRECIO.extra);
  await devolver(env, { pago: c.pago, importe, clave: c.id + '-resto', motivo });
  c.unidades = c.bajas.length; c.restoDevuelto = (c.restoDevuelto || 0) + importe; await guardarCompra(env, c);
  const [asunto, texto] = msj(c.idioma).restantes(n, euros(importe, c.idioma));
  await enviarCorreo(env, { para: c.correo, asunto, texto, idem: `resto-${c.id}` });
  return { ok: true, devuelto: importe };
}

/* ---------- tarea diaria (la llama el Worker feehund-baja-tarea) ---------- */
export async function tarea(env, origen, hoy = hoyEspana()) {
  const hecho = { enviadas: 0, avisos: 0, revisadas: 0, archivadas: 0, restos: 0, copia: null, errores: [] };
  const intentar = async (que, f) => { try { await f(); } catch (err) { hecho.errores.push(`${que}: ${err.codigo || err.message}`.slice(0, 120)); } };
  for (const { id, meta } of await listar(env, 'baja')) {
    if (meta.e === 'programada' && meta.env <= hoy) {
      await intentar('envio ' + id.slice(0, 6), async () => { await despachar(env, origen, await leer(env, 'baja', id), false, hoy); if (modo(env) === 'lleida') hecho.enviadas++; else hecho.avisos++; });
    } else if (meta.e === 'pagada' && modo(env) === 'manual') {
      // sigue sin hacer: se vuelve a avisar cada día
      await intentar('aviso ' + id.slice(0, 6), async () => { const b = await leer(env, 'baja', id); if ((b.avisadaEn || '') < hoy) { await despachar(env, origen, b, true, hoy); hecho.avisos++; } });
    } else if (meta.e === 'enviada') {
      await intentar('revision ' + id.slice(0, 6), async () => { await revisar(env, origen, await leer(env, 'baja', id)); hecho.revisadas++; });
    }
    if ((meta.e === 'entregada' || meta.e === 'devuelta') && meta.borrar && meta.borrar <= hoy) {
      await intentar('archivo ' + id.slice(0, 6), async () => { await archivar(env, await leer(env, 'baja', id)); hecho.archivadas++; });
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
  // Copia de seguridad semanal en R2 (enlace COPIAS). Si no está puesto, no se hace.
  if (env.COPIAS) await intentar('copia', async () => { hecho.copia = await copiaSemanal(env, hoy); });
  return hecho;
}

/* ---------- copia de seguridad semanal (R2) ---------- */
// Lo que hay en KV tal cual: los valores ya van cifrados con DATA_KEY (sin esa clave no se pueden leer). Una por semana
// (la primera ejecución de la tarea cada lunes o después), se guardan las 12 últimas. Restaurar: workers/baja-tarea/restaurar.mjs
export const COPIAS_GUARDADAS = 12;
export async function copiaSemanal(env, hoy = hoyEspana()) {
  const dia = new Date(hoy + 'T12:00:00Z').getUTCDay() || 7;
  const nombre = `semanal/${sumarDias(hoy, 1 - dia)}.json`; // la semana se nombra por su lunes
  if (await env.COPIAS.head(nombre)) return null;
  const filas = await exportar(env, ['baja', 'compra', 'archivo', 'adj', 'cert']);
  await env.COPIAS.put(nombre, JSON.stringify({ version: 1, creada: ahoraISO(), cifrado: 'AES-GCM con DATA_KEY (cada valor)', filas }), { httpMetadata: { contentType: 'application/json' } });
  const todas = (await env.COPIAS.list({ prefix: 'semanal/' })).objects.map((o) => o.key).sort();
  for (const vieja of todas.slice(0, Math.max(0, todas.length - COPIAS_GUARDADAS))) await env.COPIAS.delete(vieja);
  return { nombre, filas: filas.length };
}
