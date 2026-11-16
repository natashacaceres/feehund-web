// Cifrado de los datos guardados (AES-GCM con DATA_KEY), enlaces firmados (HMAC con TOKEN_SECRET) y códigos.
// Sin dependencias: Web Crypto, que existe en Cloudflare y en Node.

const te = new TextEncoder(), td = new TextDecoder();

export const b64 = (bytes) => { let s = ''; const b = new Uint8Array(bytes); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
export const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const url64 = (bytes) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const aleatorio = (n = 16) => url64(crypto.getRandomValues(new Uint8Array(n)));
export const codigo6 = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e6).padStart(6, '0');
// Referencia corta y legible para la carta y el asunto (sin letras que se confunden)
export function referencia() {
  const abc = 'ACDEFGHJKLMNPQRTUVWXY34679', r = crypto.getRandomValues(new Uint8Array(8));
  return 'FH-' + [...r].map((x) => abc[x % abc.length]).join('').replace(/^(.{4})/, '$1-');
}

export async function sha256(texto) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof texto === 'string' ? te.encode(texto) : texto))].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function claveHmac(secreto) {
  if (!secreto || secreto.length < 32) throw new Error('TOKEN_SECRET falta o es corto');
  return crypto.subtle.importKey('raw', te.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
export async function hmac(secreto, texto) { return url64(await crypto.subtle.sign('HMAC', await claveHmac(secreto), te.encode(texto))); }
export function igual(a, b) { // comparación en tiempo constante
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0;
}

/** Enlace de una baja o de una compra: «<id>.<firma>». Quien tiene el enlace puede ver el estado; nadie puede inventarlo. */
export const firmarId = async (env, tipo, id) => `${id}.${(await hmac(env.TOKEN_SECRET, tipo + ':' + id)).slice(0, 22)}`;
export async function leerToken(env, tipo, token) {
  const [id, firma] = String(token || '').split('.');
  if (!id || !firma || !/^[A-Za-z0-9_-]{16,40}$/.test(id)) return null;
  return igual(firma, (await hmac(env.TOKEN_SECRET, tipo + ':' + id)).slice(0, 22)) ? id : null;
}

async function claveDatos(env) {
  const raw = env.DATA_KEY ? deB64(env.DATA_KEY) : null;
  if (!raw || raw.length !== 32) throw new Error('DATA_KEY falta o no tiene 32 bytes en base64');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
/** Cifra un objeto. aad (la clave de KV) ata el dato a su sitio: no se puede copiar a otra clave. */
export async function cifrar(env, obj, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad) }, await claveDatos(env), te.encode(JSON.stringify(obj)));
  return 'v1.' + b64(iv) + '.' + b64(c);
}
export async function descifrar(env, texto, aad) {
  const [v, iv, c] = String(texto).split('.');
  if (v !== 'v1') throw new Error('formato');
  const p = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv), additionalData: te.encode(aad) }, await claveDatos(env), deB64(c));
  return JSON.parse(td.decode(p));
}
