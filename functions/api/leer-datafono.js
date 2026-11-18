// Lectura del resumen del datáfono con Claude cuando el lector del dispositivo no lo ha entendido.
// Recibe UN archivo (PDF o imagen) en el cuerpo y devuelve en JSON qué es (resumen del datáfono, extracto del banco u otra
// cosa) y las cifras del mes que el documento trae. No guarda nada: ni el archivo, ni la respuesta, ni registros con datos.
// Lo que no aparece en el documento va como null: nunca se inventa. La persona revisa cada cifra antes de seguir.
// Llamada HTTP directa (sin el SDK), como /api/leer. Clave: variable secreta ANTHROPIC_API_KEY.

const MODELO = 'claude-opus-5-5';
const MAX_BYTES = 10 * 1024 * 1024;
const TIPOS = {
  'application/pdf': 'document',
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/gif': 'image',
};
const ORIGENES = /^(https:\/\/(www\.)?feehund\.com|https:\/\/[a-z0-9-]+\.feehund-web\.pages\.dev|http:\/\/localhost(:\d+)?|http:\/\/127\.0\.0\.1(:\d+)?)$/;

const num = { anyOf: [{ type: 'number' }, { type: 'null' }] };
const ESQUEMA = {
  type: 'object',
  properties: {
    tipo: { type: 'string', enum: ['resumen_datafono', 'extracto_banco', 'otro'] },
    desde: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Primer día del periodo, AAAA-MM-DD' },
    hasta: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Último día del periodo, AAAA-MM-DD' },
    proveedor: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Banco o empresa del datáfono que emite el documento' },
    ventas_particulares: { ...num, description: 'Ventas con tarjetas de particulares españolas o europeas, en euros' },
    ventas_empresa: { ...num, description: 'Ventas con tarjetas de empresa, en euros' },
    ventas_fuera_europa: { ...num, description: 'Ventas con tarjetas de fuera de Europa, en euros' },
    ventas_amex: { ...num, description: 'Ventas con American Express, en euros' },
    ventas_bizum: { ...num, description: 'Ventas con Bizum en el datáfono, en euros' },
    ventas_total: { ...num, description: 'Total vendido con tarjeta en el periodo, en euros, si el documento no lo separa por tipo' },
    operaciones: { ...num, description: 'Número de cobros u operaciones con tarjeta' },
    pagado: { ...num, description: 'Todo lo que el banco o la empresa cobró ese mes: comisiones + cuota + alquiler, en euros' },
    tasa_particulares: { ...num, description: 'Comisión en % para tarjetas de particulares, si aparece' },
    fijo_por_cobro: { ...num, description: 'Importe fijo por cada cobro, en euros, si aparece' },
    cuota: { ...num, description: 'Cuota mensual, en euros, si aparece' },
    alquiler: { ...num, description: 'Alquiler del datáfono al mes, en euros, si aparece' },
  },
  required: ['tipo', 'desde', 'hasta', 'proveedor', 'ventas_particulares', 'ventas_empresa', 'ventas_fuera_europa', 'ventas_amex', 'ventas_bizum',
    'ventas_total', 'operaciones', 'pagado', 'tasa_particulares', 'fijo_por_cobro', 'cuota', 'alquiler'],
  additionalProperties: false,
};

const INSTRUCCIONES = `Eres el lector de resúmenes de datáfono de Feehund. Lees el documento de un comercio español y devuelves sus cifras.
Primero di qué es (tipo):
- resumen_datafono: resumen, liquidación o informe mensual de las ventas con tarjeta de un datáfono o TPV (de un banco como CaixaBank, Santander/Getnet, BBVA, Sabadell, o de empresas como SumUp, Square, Zettle, Revolut, Stripe, myPOS, Viva…). Trae ventas con tarjeta, número de operaciones o comisiones del comercio.
- extracto_banco: extracto o listado de movimientos de una cuenta corriente o de una tarjeta de una persona o empresa (cargos, recibos, transferencias, saldo). Aunque aparezca alguna línea de «liquidación TPV» o «comisiones», si es una lista de movimientos de una cuenta, es extracto_banco.
- otro: cualquier otra cosa (factura, contrato, ticket suelto, tarifa sin ventas…).
Si no es resumen_datafono, deja todas las cifras en null.
Reglas para las cifras:
- Copia solo lo que el documento dice. Si una cifra no aparece, null. No calcules ni supongas nada, salvo sumar filas del mismo tipo del mismo periodo.
- Importes en euros con punto decimal (1234.56). Comisiones en % como número (0.45 para 0,45 %).
- Ventas por tipo de tarjeta solo si el documento las separa; si solo hay un total, ponlo en ventas_total y deja los tipos en null.
- Las ventas son lo cobrado a los clientes (importe bruto), no lo abonado después de comisiones. Las devoluciones no se restan.
- pagado es todo lo que cobró el banco o la empresa ese periodo (comisiones, cuota, alquiler, otros cargos del datáfono). Si solo aparecen las comisiones, pon esas.`;

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
  if (Number(request.headers.get('content-length') || 0) > MAX_BYTES) return json({ error: 'grande' }, 413);
  const datos = await request.arrayBuffer();
  if (!datos.byteLength || datos.byteLength > MAX_BYTES) return json({ error: 'grande' }, 413);
  const contenido = bloque === 'document'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: aBase64(datos) } }
    : { type: 'image', source: { type: 'base64', media_type: tipo, data: aBase64(datos) } };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
    body: JSON.stringify({
      model: MODELO, max_tokens: 4000, fallbacks: 'default', system: INSTRUCCIONES,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: [contenido, { type: 'text', text: 'Lee este documento.' }] }],
    }),
  });
  if (!r.ok) return json({ error: 'api', estado: r.status }, 502); // nunca el cuerpo: podría llevar algo del documento
  const d = await r.json().catch(() => null);
  const texto = d && (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let salida = null; try { salida = JSON.parse(texto); } catch (e) { /* abajo */ }
  if (!salida || !salida.tipo) return json({ error: 'lectura' }, 502);
  return json(salida);
}

export function onRequest() { return json({ error: 'metodo' }, 405); }
