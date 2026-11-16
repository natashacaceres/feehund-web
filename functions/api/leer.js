// Lectura del extracto con Claude (Anthropic) cuando el dispositivo no ha podido leerlo entero.
// Recibe UN archivo (PDF o imagen) en el cuerpo, se lo pasa a la API de Anthropic y devuelve, en streaming,
// los movimientos que Claude transcribe. No guarda nada: ni el archivo, ni la respuesta, ni registros con datos.
// La comprobación de que no falta ningún movimiento (el saldo) la hace después el motor en el dispositivo.
// Llamada HTTP directa (sin el SDK): esta web no tiene paso de compilación ni dependencias npm.
// Clave: variable secreta ANTHROPIC_API_KEY del proyecto de Cloudflare Pages.

const MODELO = 'claude-opus-5-5';
const MAX_BYTES = 10 * 1024 * 1024; // el mismo límite por archivo que la bandeja de la página
const TIPOS = {
  'application/pdf': 'document',
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/gif': 'image',
};
const ORIGENES = /^(https:\/\/(www\.)?feehund\.com|https:\/\/[a-z0-9-]+\.feehund-web\.pages\.dev|http:\/\/localhost(:\d+)?|http:\/\/127\.0\.0\.1(:\d+)?)$/;

const ESQUEMA = {
  type: 'object',
  properties: {
    es_extracto: { type: 'boolean' },
    movimientos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fecha: { type: 'string', description: 'Fecha de operación, AAAA-MM-DD' },
          concepto: { type: 'string', description: 'Texto completo del movimiento, con las líneas partidas unidas' },
          importe: { type: 'number', description: 'Con signo: negativo si sale dinero, positivo si entra' },
          saldo: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Saldo después del movimiento, si aparece' },
        },
        required: ['fecha', 'concepto', 'importe', 'saldo'],
        additionalProperties: false,
      },
    },
  },
  required: ['es_extracto', 'movimientos'],
  additionalProperties: false,
};

const INSTRUCCIONES = `Eres el lector de extractos bancarios de Feehund. Transcribe TODOS los movimientos del documento, uno por uno, en el mismo orden en que aparecen.
- No resumas, no agrupes, no omitas ninguno y no inventes nada. Si un movimiento ocupa varias líneas, es UN solo movimiento: une su texto.
- fecha: la fecha de operación en formato AAAA-MM-DD. Si hay dos fechas (operación y valor), usa la de operación. Si el año no aparece en la fila, dedúcelo del periodo del extracto.
- concepto: el texto del movimiento tal cual, sin el importe ni el saldo.
- importe: número con signo y punto decimal. Negativo si es un cargo, pago, compra, recibo o salida; positivo si es un ingreso, abono o devolución.
- saldo: el saldo que muestra el extracto después de ese movimiento; null si el documento no lo da.
- Ignora cabeceras, pies de página, números de página, totales, resúmenes y saldos iniciales o finales que no sean de un movimiento.
- es_extracto: false si el documento no es un extracto o listado de movimientos de una cuenta o tarjeta; en ese caso, movimientos vacío.`;

const json = (cuerpo, estado = 200) => new Response(JSON.stringify(cuerpo), {
  status: estado, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function aBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'sin_clave' }, 503);
  const origen = request.headers.get('origin');
  if (origen && !ORIGENES.test(origen)) return json({ error: 'origen' }, 403);
  const tipo = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const bloque = TIPOS[tipo];
  if (!bloque) return json({ error: 'tipo' }, 415);
  const largo = Number(request.headers.get('content-length') || 0);
  if (largo > MAX_BYTES) return json({ error: 'grande' }, 413);
  const datos = await request.arrayBuffer();
  if (!datos.byteLength || datos.byteLength > MAX_BYTES) return json({ error: 'grande' }, 413);

  const contenido = bloque === 'document'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: aBase64(datos) } }
    : { type: 'image', source: { type: 'base64', media_type: tipo, data: aBase64(datos) } };

  const respuesta = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2026-10-21',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 64000,
      stream: true,
      fallbacks: 'default',
      system: INSTRUCCIONES,
      output_config: { format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: [contenido, { type: 'text', text: 'Transcribe todos los movimientos de este extracto.' }] }],
    }),
  });
  if (!respuesta.ok || !respuesta.body) {
    // Solo el código de estado: nunca el cuerpo, que podría llevar algo del documento
    return json({ error: 'api', estado: respuesta.status }, 502);
  }
  return new Response(respuesta.body, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

export function onRequest() {
  return json({ error: 'metodo' }, 405);
}
