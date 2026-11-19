// El motor que aprende. Cuando Feehund no sabe qué es un comercio, lo busca una sola vez en la web (Claude Haiku con
// búsqueda) y lo guarda. La siguiente persona que lo pregunte ya lo tiene al momento y sin gastar nada.
// Lo que han preguntado al menos 3 personas distintas, y se sabe con seguridad, pasa al diccionario compartido que el
// móvil se descarga (GET /api/ia/aprende): así también clasifica el resumen gratis, sin mandar nada.
// Qué se guarda: solo el nombre del comercio como sale en el extracto y lo que es. Nunca importes, fechas ni quién.
// De las personas solo una huella para contar cuántas distintas lo han visto (máximo 3). Si un nombre es de una
// persona particular (un alquiler, un Bizum), no se guarda el nombre.
//
// KV (FEEHUND_KV):
//   apr:r:<huella del nombre> → { nombre, sector, que, confianza, fuente, fecha, gente: [huellas] } o { persona: true }
//   apr:dic                   → { version, entradas: { NOMBRE: sector } }  (lo que se descarga el móvil)
//   apr:dia:<AAAA-MM-DD>      → búsquedas hechas hoy (tope diario)

const MODELO = 'claude-haiku-5-5';
export const GENTE_PARA_PUBLICAR = 3; // personas distintas antes de pasar al diccionario compartido
const TOPE_DIA = 400; // búsquedas en la web al día, como mucho
const POR_PREGUNTA = 3; // comercios que Feehund puede buscar en una pregunta

export const SECTORES_APRENDE = {
  casa: 'luz, agua, gas, móvil, internet, alquiler, comunidad, seguro de hogar',
  super: 'supermercado o tienda de alimentación',
  fuera: 'bar, cafetería, restaurante, panadería, heladería',
  domicilio: 'comida a domicilio',
  transporte: 'gasolinera, taxi, tren, bus, metro, avión, peaje, aparcamiento, taller',
  ropa: 'ropa, calzado, peluquería, estética',
  salud: 'farmacia, clínica, dentista, óptica, fisio',
  ocio: 'ocio, deporte, cine, libros, viajes, hoteles, juegos',
  suscr: 'suscripción o servicio digital que se paga cada mes',
  online: 'tienda online',
  impuestos: 'impuestos y administraciones',
  otro: 'otra cosa (tienda de barrio, ferretería, electrónica, hogar, mascotas, educación…)',
};

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

/** El nombre tal y como se guarda: mayúsculas, sin acentos ni signos raros. */
export function normal(k) {
  return String(k || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9&.' ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}
const clave = async (n) => 'apr:r:' + (await sha('feehund-aprende:' + n)).slice(0, 32);

/** Lo que nunca se busca: Bizum, transferencias, nóminas, cajeros, números sueltos. */
export function sePuedeBuscar(n) {
  return n.length >= 3 && /[A-Z]{3}/.test(n) && !/BIZUM|TRANSFER|TRASPASO|NOMINA|PENSION|CAJERO|REINTEGRO|DEVOLUCION|ABONO|INGRESO/.test(n);
}

const ESQUEMA = {
  type: 'object',
  properties: {
    persona: { type: 'boolean', description: 'true si el texto es el nombre de una persona particular y no de un negocio' },
    sector: { anyOf: [{ type: 'string', enum: Object.keys(SECTORES_APRENDE) }, { type: 'null' }] },
    que: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Qué es, en pocas palabras (p. ej. «cafetería en Valencia»)' },
    confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
    fuente: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'La dirección web que lo confirma' },
  },
  required: ['persona', 'sector', 'que', 'confianza', 'fuente'],
  additionalProperties: false,
};

const INSTRUCCIONES = `Identificas comercios a partir del texto que sale en un extracto bancario español.
Busca en la web qué negocio es y elige su sector:
${Object.entries(SECTORES_APRENDE).map(([k, v]) => '- ' + k + ': ' + v).join('\n')}
Reglas:
- Confianza alta solo si una página encontrada confirma que ese nombre es ese negocio (su web, Google Maps, un directorio de empresas, una app). Pon esa dirección en fuente.
- Si hay varios negocios con ese nombre y son de sectores distintos, o no encuentras nada claro, sector null y confianza baja. No adivines.
- Si parece el nombre y apellidos de una persona particular, persona true, sector null, y no busques nada más.
- Las siglas S.L., S.A. o SLU son de empresas, no de personas.`;

async function buscarEnLaWeb(env, nombre) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2026-10-21' },
    body: JSON.stringify({
      model: env.APRENDE_MODELO || MODELO, max_tokens: 3000, system: INSTRUCCIONES,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 1, user_location: { type: 'approximate', country: 'ES' } }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: 'Texto del extracto: «' + nombre + '»' }],
    }),
  });
  if (!r.ok) throw new Error('api ' + r.status);
  const d = await r.json();
  const txt = (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(txt);
}

async function publicar(env, nombre, sector) {
  const dic = JSON.parse((await env.FEEHUND_KV.get('apr:dic')) || '{"entradas":{}}');
  if (dic.entradas[nombre] === sector) return;
  dic.entradas[nombre] = sector; dic.version = new Date().toISOString();
  await env.FEEHUND_KV.put('apr:dic', JSON.stringify(dic));
}

/** Qué es cada comercio (como mucho POR_PREGUNTA). quien = huella de la persona, solo para contar personas distintas. */
export async function queEs(env, nombres, quien) {
  const kv = env.FEEHUND_KV, hoy = new Date().toISOString().slice(0, 10);
  const lista = [...new Set((Array.isArray(nombres) ? nombres : []).map(normal))].slice(0, POR_PREGUNTA);
  const salida = [];
  for (const n of lista) {
    if (!sePuedeBuscar(n)) { salida.push({ comercio: n, sector: null, que: 'no se busca (Bizum, transferencia o similar)' }); continue; }
    const k = await clave(n);
    let x = JSON.parse((await kv.get(k)) || 'null');
    if (!x) {
      const kDia = 'apr:dia:' + hoy, hechas = +((await kv.get(kDia)) || 0);
      if (hechas >= TOPE_DIA || !env.ANTHROPIC_API_KEY) { salida.push({ comercio: n, sector: null, que: 'hoy no se puede buscar' }); continue; }
      await kv.put(kDia, String(hechas + 1), { expirationTtl: 2 * 86400 });
      let r; try { r = await buscarEnLaWeb(env, n); } catch (e) { console.log('aprende', String(e.message)); salida.push({ comercio: n, sector: null, que: 'no se ha podido buscar' }); continue; }
      x = r.persona ? { persona: true, fecha: hoy } : { nombre: n, sector: r.sector, que: r.que, confianza: r.confianza, fuente: r.fuente, fecha: hoy, gente: [] };
    }
    if (x.persona) { await kv.put(k, JSON.stringify(x)); salida.push({ comercio: n, sector: null, que: 'parece una persona' }); continue; }
    if (quien && x.gente.length < GENTE_PARA_PUBLICAR && x.gente.indexOf(quien) < 0) x.gente.push(quien);
    await kv.put(k, JSON.stringify(x));
    if (x.sector && x.confianza === 'alta' && x.gente.length >= GENTE_PARA_PUBLICAR) await publicar(env, n, x.sector);
    salida.push({ comercio: n, sector: x.confianza === 'baja' ? null : x.sector, que: x.que, seguro: x.confianza === 'alta' });
  }
  return salida;
}

/** El diccionario compartido que se descarga el móvil. */
export async function diccionario(env) {
  const dic = JSON.parse((await env.FEEHUND_KV.get('apr:dic')) || '{"entradas":{}}');
  return { version: dic.version || null, entradas: dic.entradas || {} };
}

// ---------- «¿Qué es…?»: lo que dice la gente en el chat de Feehund
// apr:v:<huella del nombre> → { nombre, votos: { sector: [huellas] } }. Pasa al diccionario cuando un sector llega a 3
// personas, nadie ha dicho «una persona» y ningún otro sector tiene ni la mitad. Si la búsqueda en la web dijo otra cosa,
// no se publica: queda para revisar.
const VOTOS_DIA = 30; // por persona y día
export async function votar(env, comercio, sector, quien) {
  const kv = env.FEEHUND_KV, n = normal(comercio).replace(/\b\d{4,6}X{4,10}\d{2,4}\b\s*/g, '').trim(), hoy = new Date().toISOString().slice(0, 10);
  if (/\d{4}/.test(n) || !sePuedeBuscar(n) || !(sector === 'persona' || SECTORES_APRENDE[sector])) return { ok: false };
  const kq = 'apr:vq:' + hoy + ':' + quien, hechos = +((await kv.get(kq)) || 0);
  if (hechos >= VOTOS_DIA) return { ok: false };
  await kv.put(kq, String(hechos + 1), { expirationTtl: 2 * 86400 });
  const k = 'apr:v:' + (await sha('feehund-aprende:' + n)).slice(0, 32);
  const x = JSON.parse((await kv.get(k)) || 'null') || { votos: {} };
  Object.values(x.votos).forEach((l) => { const i = l.indexOf(quien); if (i >= 0) l.splice(i, 1); }); // un voto por persona
  (x.votos[sector] = x.votos[sector] || []).push(quien);
  if ((x.votos.persona || []).length) { // si alguien dice que es una persona, el nombre no se guarda y sale del diccionario
    delete x.nombre;
    const dic = JSON.parse((await kv.get('apr:dic')) || '{"entradas":{}}');
    if (dic.entradas[n]) { delete dic.entradas[n]; dic.version = new Date().toISOString(); await kv.put('apr:dic', JSON.stringify(dic)); }
  } else x.nombre = n;
  await kv.put(k, JSON.stringify(x));
  const [gana, l] = Object.entries(x.votos).filter(([s]) => s !== 'persona').sort((a, b) => b[1].length - a[1].length)[0] || [];
  const otros = Object.entries(x.votos).filter(([s]) => s !== gana && s !== 'persona').reduce((m, [, v]) => Math.max(m, v.length), 0);
  if (x.nombre && gana && l.length >= GENTE_PARA_PUBLICAR && otros * 2 < l.length) {
    const web = JSON.parse((await kv.get(await clave(n))) || 'null');
    if (!web || !web.sector || web.sector === gana) await publicar(env, n, gana);
  }
  return { ok: true };
}

// ---------- Lo que Feehund no reconoce: nombres de empresas para investigar por tandas (Privacidad lo dice)
// apr:u:<AAAA-MM-DD>:<huella de la persona> → { nombres: [...] }: una escritura por persona y día, como mucho 60 nombres.
// Solo el nombre de la empresa: nunca importes, fechas, transferencias, Bizum ni personas (el móvil ya los quita y aquí
// se vuelve a filtrar). Caduca a los 120 días. Para investigar: listar el prefijo apr:u: y contar personas por nombre.
const DESCONOCIDOS_MAX = 60;
export async function apuntarDesconocidos(env, nombres, quien) {
  const kv = env.FEEHUND_KV, hoy = new Date().toISOString().slice(0, 10);
  const nuevos = [...new Set((Array.isArray(nombres) ? nombres : []).slice(0, 80).map(normal))]
    .filter((n) => sePuedeBuscar(n) && !/\d{3}|X{4}/.test(n) && n.split(' ').length <= 6);
  if (!nuevos.length || !quien) return { ok: true };
  const k = 'apr:u:' + hoy + ':' + quien;
  const x = JSON.parse((await kv.get(k)) || 'null') || { nombres: [] };
  const antes = x.nombres.length;
  for (const n of nuevos) if (x.nombres.length < DESCONOCIDOS_MAX && x.nombres.indexOf(n) < 0) x.nombres.push(n);
  if (x.nombres.length > antes) await kv.put(k, JSON.stringify(x), { expirationTtl: 120 * 86400 });
  return { ok: true };
}

// ---------- Lo que no reconoce Mi banco, también gratis: se busca en internet una sola vez (19 nov 2026)
// Lo ya sabido (por otra persona o por el chat) se devuelve al momento. De lo nuevo se buscan como mucho
// BUSCAR_POR_VEZ nombres, en el orden en que llegan (el móvil manda primero lo de más gasto), y 20 al día por persona,
// dentro del tope diario de queEs. Cada búsqueda queda guardada para todos (y cuenta para el diccionario compartido).
const BUSCAR_POR_VEZ = 6, BUSCAR_PERSONA_DIA = 20;
// ---------- El mapa de locales (OpenStreetMap: toda España, 19 nov 2026), gratis antes de buscar en internet
// KV osm:i:<2 letras> → { NOMBRE: sector } (nombre completo del local; «sector?» si es un solo local en toda España).
// Antes había también osm:p (prefijos de dos palabras): se quitó con toda España porque casaba nombres por casualidad.
// Datos © colaboradores de OpenStreetMap, licencia ODbL (lo dice «Cómo se calcula»).
const NO_MAPA = new Set(['GRANVIA', 'GRAN VIA', 'RAMBLA', 'DIAGONAL', 'ALAVA', 'ARABA', 'ALBACETE', 'ALICANTE', 'ALACANT', 'ALMERIA', 'ASTURIAS', 'AVILA', 'BADAJOZ', 'BURGOS', 'CACERES', 'CADIZ', 'CANTABRIA', 'CASTELLON', 'CASTELLO', 'CIUDAD REAL', 'CORDOBA', 'CUENCA', 'GIPUZKOA', 'GUIPUZCOA', 'GRANADA', 'GUADALAJARA', 'HUELVA', 'HUESCA', 'JAEN', 'LEON', 'LLEIDA', 'LERIDA', 'LUGO', 'MURCIA', 'NAVARRA', 'OURENSE', 'ORENSE', 'PALENCIA', 'PONTEVEDRA', 'SALAMANCA', 'SEGOVIA', 'SORIA', 'TERUEL', 'TOLEDO', 'VALLADOLID', 'BIZKAIA', 'VIZCAYA', 'ZAMORA', 'ZARAGOZA', 'CEUTA', 'MELILLA', 'CANARIAS', 'TENERIFE', 'LAS PALMAS', 'GRAN CANARIA', 'LANZAROTE', 'FUERTEVENTURA', 'MENORCA', 'ANDALUCIA', 'ARAGON', 'GALICIA', 'EXTREMADURA', 'LA RIOJA', 'RIOJA', 'EUSKADI', 'PAIS VASCO', 'OVIEDO', 'GIJON', 'SANTANDER', 'PAMPLONA', 'LOGRONO', 'VITORIA', 'DONOSTIA', 'SAN SEBASTIAN', 'VIGO', 'CORUNA', 'A CORUNA', 'LA CORUNA', 'SANTIAGO', 'MARBELLA', 'BENIDORM', 'ELCHE', 'CARTAGENA', 'JEREZ', 'ALGECIRAS', 'BADALONA', 'SABADELL', 'TERRASSA', 'HOSPITALET', 'REUS', 'MATARO', 'ESPANA', 'SPAIN', 'PORTUGAL', 'FRANCE', 'FRANCIA', 'ITALIA', 'ITALY', 'LONDON', 'NEW YORK', 'PARIS', 'ROMA', 'BERLIN', 'LISBOA', 'PORTO', 'AMSTERDAM', 'MEXICO', 'ARGENTINA', 'COLOMBIA', 'VENEZUELA', 'CUBA', 'PERU', 'CHILE', 'BRASIL', 'CHINA', 'JAPON', 'TOKYO', 'INDIA', 'ORIENTAL', 'MEDITERRANEO', 'MEDITERRANEA', 'ATLANTICO', 'CENTRAL', 'PLAZA MAYOR', 'EL CENTRO', 'SOL', 'LUNA', 'MAR', 'PLAYA', 'CATALUNYA', 'CATALUNA', 'DUBLIN', 'LONDON', 'LONDRES', 'PARIS', 'ROMA', 'MILANO', 'NAPOLES', 'NAPOLI', 'EUROPA', 'ESPANYA', 'IBIZA', 'MALLORCA', 'VALENCIA', 'SEVILLA', 'BILBAO', 'MALAGA', 'GIRONA', 'TARRAGONA', 'EL RINCON', 'LA CASA', 'EL RACO', 'LA TERRAZA', 'LA PLAZA', 'EL PATIO', 'LA ESQUINA', 'BARCELONA', 'MADRID', 'CENTRO', 'CENTRE', 'GRAN VIA', 'SPAIN', 'ESPANA', 'PLAZA', 'PLACA', 'MERCADO', 'MERCAT', 'TIENDA', 'BOTIGA', 'CASA', 'HOME', 'SHOP', 'STORE', 'CAFE', 'BAR', 'RESTAURANTE', 'FARMACIA', 'HOTEL', 'PARKING', 'METRO', 'GLOBAL', 'SERVICIOS', 'SERVEIS', 'GRUPO', 'GROUP', 'INTERNATIONAL']);
const NEXOS = new Set(['DE', 'DEL', 'LA', 'EL', 'LES', 'LOS', 'LAS', 'I', 'Y', 'D', 'DELS']);
async function delMapa(env, nombre) {
  let w = String(nombre).replace(/^.*?\bCOMPRA EN\s+/, '').replace(/'/g, ' ').split(' ').filter(Boolean)
    .filter((x) => !/^(SQ|SUMUP|ZTL|CRV|PAYPAL|TPV)\*?$|^\*+$/.test(x));
  while (w.length && /^\d+$/.test(w[0])) w.shift();
  if (!w.length) return null;
  const leer = (k) => env.FEEHUND_KV.get(k, { type: 'json', cacheTtl: 3600 }).catch(() => null);
  const ix = await leer('osm:i:' + w[0].slice(0, 2)); // por las dos primeras letras: cada consulta lee un trozo pequeño
  if (!ix) return null;
  for (let k = Math.min(5, w.length); k > 0; k--) {
    const c = w.slice(0, k).join(' ').replace(/^[.* ]+|[.* ]+$/g, '');
    if (NO_MAPA.has(c) || (k === 1 && c.length < 6)) continue;
    for (const c2 of [c, c.replace(/\./g, '')]) {
      const v = ix[c2]; if (!v) continue;
      // «sector?»: un solo local en toda España con ese nombre; vale solo si el banco pone el nombre entero
      if (v.endsWith('?')) { if (k === w.length) return v.slice(0, -1); continue; }
      return v;
    }
  }
  return null;
}

export async function clasificarDesconocidos(env, nombres, quien) {
  const kv = env.FEEHUND_KV, hoy = new Date().toISOString().slice(0, 10), sectores = {};
  const lista = [...new Set((Array.isArray(nombres) ? nombres : []).slice(0, 80).map(normal))]
    .filter((n) => sePuedeBuscar(n) && !/\d{3}|X{4}/.test(n) && n.split(' ').length <= 6).slice(0, 60);
  const sabidos = await Promise.all(lista.map(async (n) => [n, JSON.parse((await kv.get(await clave(n))) || 'null')]));
  const nuevos = [];
  for (const [n, x] of sabidos) {
    if (x && !x.persona && x.sector && x.confianza !== 'baja') sectores[n] = x.sector;
    else if (!x) nuevos.push(n);
  }
  // primero el mapa de locales (gratis); solo lo que no está se busca en internet
  const delM = await Promise.all(nuevos.map((n) => delMapa(env, n).catch(() => null)));
  const quedan = [];
  nuevos.forEach((n, i) => { if (delM[i]) sectores[n] = delM[i]; else quedan.push(n); });
  nuevos.length = 0; nuevos.push(...quedan);
  if (!nuevos.length || !quien || !env.ANTHROPIC_API_KEY) return sectores;
  const kq = 'apr:bq:' + hoy + ':' + quien, hechas = +((await kv.get(kq)) || 0);
  const toca = nuevos.slice(0, Math.max(0, Math.min(BUSCAR_POR_VEZ, BUSCAR_PERSONA_DIA - hechas)));
  if (!toca.length) return sectores;
  await kv.put(kq, String(hechas + toca.length), { expirationTtl: 2 * 86400 });
  const r = await Promise.all(toca.map((n) => queEs(env, [n], quien).then((s) => s[0]).catch(() => null)));
  for (const s of r) if (s && s.sector) sectores[s.comercio] = s.sector;
  return sectores;
}
