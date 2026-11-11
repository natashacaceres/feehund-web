// Contador anónimo de /extracto/ (cambio 13). Cuenta tres eventos por día y nada más:
//   «abre» (abre /extracto/), «resultado» (ve el resultado con su propio archivo, no el ejemplo) y «comparte».
// No guarda IP, cookies, identificadores, importes, empresas ni nada del extracto: solo (día, evento, número).
//
// APAGADO mientras no exista el enlace CONTADOR a una base D1: entonces responde 204 sin hacer nada.
// La página tampoco envía nada mientras assets/extracto.js tenga CONTADOR.activo = false.
//
// Para encenderlo (después de que un abogado confirme que no hace falta consentimiento):
//   1. Cloudflare › Storage & Databases › D1 › Create: nombre «feehund-contador».
//   2. En su Console, ejecutar una vez:
//        CREATE TABLE contador (dia TEXT NOT NULL, evento TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, evento));
//   3. Workers & Pages › feehund-web › Settings › Bindings › Add › D1 database: nombre de variable CONTADOR, base feehund-contador.
//   4. En assets/extracto.js, CONTADOR.activo = true. Publicar.
// Para ver los números: en la Console de feehund-contador,
//   SELECT dia, evento, n FROM contador ORDER BY dia DESC, evento;

const EVENTOS = new Set(["abre", "resultado", "comparte"]);
const VACIA = { status: 204, headers: { "cache-control": "no-store" } };

export async function onRequestPost({ request, env }) {
  if (!env.CONTADOR) return new Response(null, VACIA);
  const evento = (await request.text()).trim().slice(0, 20);
  if (!EVENTOS.has(evento)) return new Response(null, { status: 400, headers: { "cache-control": "no-store" } });
  const dia = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date()); // AAAA-MM-DD, hora de España
  await env.CONTADOR.prepare(
    "INSERT INTO contador (dia, evento, n) VALUES (?1, ?2, 1) ON CONFLICT (dia, evento) DO UPDATE SET n = n + 1"
  ).bind(dia, evento).run();
  return new Response(null, VACIA);
}
