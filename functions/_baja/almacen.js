// Almacén en Cloudflare KV (enlace FEEHUND_KV). Todo lo que lleva datos de la persona va cifrado con DATA_KEY.
// Claves:
//   baja:<id>    una carta: datos, carta, firma, estado, envío, certificado (cifrado)
//   compra:<id>  un pago de Stripe con 1 a 5 bajas (cifrado: lleva el correo de quien paga)
//   adj:<id>     firma dibujada de una baja (cifrado, aparte para que «baja:» sea pequeño)
//   archivo:<id> lo que se guarda 6 años de cada baja: prueba de la baja, la autorización y el pago (cifrado)
//   cert:<id>    certificado de Lleida.net en PDF (cifrado)
//   lim:<…>      contadores para frenar abusos (sin datos: solo un hash), caducan solos
// Los metadatos de KV (sin datos personales) dicen el estado y las fechas: la tarea diaria los lee sin descifrar.

import { cifrar, descifrar } from './cripto.js';

const DIA = 86400;
const kv = (env) => { if (!env.FEEHUND_KV) throw new Error('Falta el enlace FEEHUND_KV'); return env.FEEHUND_KV; };

export async function guardar(env, tipo, id, obj, { meta = {}, ttlDias } = {}) {
  const clave = `${tipo}:${id}`;
  const op = { metadata: meta };
  if (ttlDias) op.expirationTtl = Math.round(ttlDias * DIA);
  await kv(env).put(clave, await cifrar(env, obj, clave), op);
}
export async function leer(env, tipo, id) {
  const clave = `${tipo}:${id}`;
  const v = await kv(env).get(clave);
  return v == null ? null : descifrar(env, v, clave);
}
export const borrar = (env, tipo, id) => kv(env).delete(`${tipo}:${id}`);

/** Todas las claves de un tipo con sus metadatos: [{ id, meta }]. */
export async function listar(env, tipo) {
  const out = []; let cursor;
  do {
    const r = await kv(env).list({ prefix: tipo + ':', cursor });
    for (const k of r.keys) out.push({ id: k.name.slice(tipo.length + 1), meta: k.metadata || {} });
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return out;
}

/** Copia de seguridad: los valores tal cual están en KV (ya cifrados con DATA_KEY) y sus metadatos. */
export async function exportar(env, tipos) {
  const filas = [];
  for (const tipo of tipos) {
    for (const { id, meta } of await listar(env, tipo)) {
      const v = await kv(env).get(`${tipo}:${id}`);
      if (v != null) filas.push({ k: `${tipo}:${id}`, v, meta });
    }
  }
  return filas;
}

/** Cuenta un uso; devuelve false si ya se pasó del máximo en la ventana. */
export async function limitar(env, clave, max, segundos) {
  const k = 'lim:' + clave, n = Number(await kv(env).get(k)) || 0;
  if (n >= max) return false;
  await kv(env).put(k, String(n + 1), { expirationTtl: Math.max(60, segundos) });
  return true;
}

// Metadatos de una baja: lo justo para la tarea diaria
export const metaBaja = (b) => ({ e: b.estado, env: b.envio, emp: b.empresa, borrar: b.borrarEl || null, c: b.compra || null });
export const guardarBaja = (env, b) => guardar(env, 'baja', b.id, b, { meta: metaBaja(b), ttlDias: b.estado === 'borrador' || b.estado === 'firmada' ? 2 : 400 });
export const guardarCompra = (env, c) => guardar(env, 'compra', c.id, c, { meta: { e: c.estado, n: c.unidades, u: c.bajas.length }, ttlDias: c.estado === 'abierta' ? 2 : 400 });
