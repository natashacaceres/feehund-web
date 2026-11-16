// Worker «feehund-baja-tarea»: cada hora llama a la tarea de «Te damos de baja» de la web
// (envía las cartas programadas para hoy, mira si han llegado, trae los certificados de Lleida.net, devuelve el dinero
// de las que no llegan y borra los datos a los 30 días). Toda la lógica y las claves están en la web (Pages):
// este Worker solo guarda TAREA_SECRET, la misma que en la web.
export default {
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(llamar(env));
  },
  // Para probarlo a mano: curl -H "authorization: Bearer <TAREA_SECRET>" https://feehund-baja-tarea.<cuenta>.workers.dev
  async fetch(request, env) {
    const clave = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
    if (!env.TAREA_SECRET || clave !== env.TAREA_SECRET) return new Response('No', { status: 401 });
    return new Response(JSON.stringify(await llamar(env), null, 1), { headers: { 'content-type': 'application/json' } });
  },
};

async function llamar(env) {
  const r = await fetch((env.URL_WEB || 'https://feehund.com') + '/api/baja/tarea', {
    method: 'POST', headers: { authorization: 'Bearer ' + env.TAREA_SECRET },
  });
  const hecho = await r.json().catch(() => ({ error: r.status }));
  console.log('tarea', r.status, JSON.stringify(hecho));
  return hecho;
}
