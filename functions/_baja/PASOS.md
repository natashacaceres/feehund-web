# «Te damos de baja» · lo que tienes que hacer tú (fase 1: envío a mano)

Sin pagar nada antes de tener clientes. Cuando alguien paga, te llega un correo URGENTE y la envías tú por Lleida.net
en las 24 horas siguientes (el asunto dice hasta cuándo). Si la baja estaba programada, ese día entero. La persona cree que es automático: ve y recibe lo mismo que cuando lo sea.

## 0. Antes de cobrar de verdad
- Habla con tu **gestor**: cobrar este servicio sin ser autónoma ni empresa.
- **Abogado**: la lista está en `functions/_baja/ABOGADO.md`.

## 1. Brevo (envía los correos de la web; ya tienes cuenta, como en Ipso)
1. Brevo › **Senders, Domains & Dedicated IPs** › **Domains** › **Add a domain** › `feehund.com`.
2. Elige autenticar con Cloudflare (te lleva y los pone solo) o copia a mano los registros que te da en
   Cloudflare › feehund.com › DNS: el código de Brevo (`brevo-code`), DKIM (`brevo1._domainkey`, `brevo2._domainkey`)
   y DMARC.
3. **SPF, con cuidado:** feehund.com ya tiene `v=spf1 include:_spf.mx.cloudflare.net ~all` (para recibir con Email
   Routing). Tiene que quedar **un solo** registro SPF con los dos:
   `v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all`
   Si Brevo propone crear otro registro SPF, no lo crees: edita el que hay y deja esa línea.
4. Espera a que Brevo diga que el dominio está autenticado.
5. **SMTP & API** › **API keys** › **Generate a new API key**, nombre «feehund-web». Copia la clave (`xkeysib-…`).
   Va en el paso 3 como `BREVO_API_KEY`.

## 2. Stripe (cuenta «Calculadora datáfono»)
El producto (`prod_VdmVGkorJMQg6T`) y el webhook ya están creados; el webhook está apagado hasta publicar y se enciende
ese día. Tú solo:
1. Developers › API keys › **Create restricted key**, nombre «Feehund bajas», con estos permisos y nada más:
   Checkout Sessions **Write**, Refunds **Write**, Products **Read**, PaymentIntents **Read**. Copia la clave (`rk_live_…`).
2. Developers › Webhooks › el de `https://feehund.com/api/baja/stripe` › **Signing secret** › Reveal › copia (`whsec_…`).

## 3. Cloudflare (lo que falta; el resto ya está hecho)
Ya hecho: el espacio KV `feehund-baja` y los secretos `TOKEN_SECRET`, `DATA_KEY` y `TAREA_SECRET` en producción.
Falta, en Workers & Pages › **feehund-web** › Settings (todo en **Production**):
1. **Bindings** › Add › **KV namespace**: Variable name `FEEHUND_KV`, KV namespace `feehund-baja`. Save.
2. **Variables and secrets** › Add:
   - Type **Text**: `STRIPE_PRODUCT_BAJA` = `prod_VdmVGkorJMQg6T`
   - Type **Text**: `AVISOS_CORREO` = el correo donde quieres los avisos urgentes y la copia semanal
   - Type **Secret**: `STRIPE_SECRET_KEY` (la `rk_live_…`), `STRIPE_WEBHOOK_SECRET` (la `whsec_…`), `BREVO_API_KEY` (la `xkeysib-…`)
   No toques `ANTHROPIC_API_KEY` (es de Mi banco).
3. Las variables solo cuentan en el siguiente despliegue: se publican con la web.

## 4. Copias de seguridad
Sin hacer nada: cada semana te llega un correo «Copia semanal · Te damos de baja · <fecha>» con un adjunto `.txt`.
Va cifrado con `DATA_KEY` (sin ella no se lee). Guárdalo, y una vez al mes busca en Gmail
`subject:"Copia semanal · Te damos de baja" older_than:12w` y borra lo que salga: así lo borrado desaparece también de
las copias a las 12 semanas. Para recuperar una copia: `workers/baja-tarea/restaurar.mjs` (lo hago yo contigo).
Si algún día activas R2 (Cloudflare › R2, aceptar el plan): crea el bucket `feehund-copias` y enlázalo a feehund-web como
`COPIAS`; desde entonces la copia va ahí, se guardan las 12 últimas solas y deja de llegar el correo.

## 5. La tarea de cada hora (recordatorios, programadas, archivo a los 90 días y copias)
La publico yo con `workers/baja-tarea/wrangler.toml` (cron cada hora) después de publicar la web, con la misma
`TAREA_SECRET`. No tienes que hacer nada.

## 6. Lleida.net
Cuando llegue el primer cliente: alta en Lleida.net (acepta personas físicas) y compra el **pack de bienvenida de 9,99 €**
(10 envíos). Si quieres poder enviar desde tu correo con copia a `correo@certificado.lleida.net`, pídeles que den de
alta tu dirección como remitente.

## Cuando llegue un correo URGENTE
1. Abre Lleida.net › Correo electrónico certificado › nuevo envío.
2. **Para**, **Asunto** y **Texto**: cópialos del correo urgente (el asunto lleva la referencia FH-…, déjalo igual).
3. Adjunta la carta en PDF y, si la hay, la foto del DNI/NIE (las dos van en el correo urgente; también en el enlace de
   gestión). Solo la llevan las 10 empresas que exigen copia; en las demás la carta da el número.
4. Envía. Cuando Lleida te mande el certificado en PDF, abre el enlace de gestión del correo, súbelo y pulsa
   **«Hecho»**: a la persona le llega su justificante.
5. Si no se puede entregar: en esa misma página, **«No se pudo entregar»**. Se le devuelve el dinero y se le avisa.
6. Borra el correo urgente: lleva datos personales.
Si una baja sigue sin «Hecho», al día siguiente te llega un RECORDATORIO.
La persona tiene la promesa de «en 24 horas» (o «el <fecha>» si la programó); las fechas programadas ya dejan ese día
de margen para que llegue a tiempo.

## Qué se guarda (decidido)
- Cada baja se guarda **6 años**, cifrada: nombre, DNI/NIE, empresa, fechas, carta, justificante de Lleida, pago y la
  prueba de la autorización. Sirve si alguien reclama y para la contabilidad (el abogado tiene que confirmar los 6 años).
- Lo demás (correo, enlaces, datos de trabajo) se borra **90 días** después del envío. Hasta entonces la persona puede
  ver su página de estado y pedir la segunda carta gratis.
- Copia de seguridad cifrada **cada semana** en R2 (paso 4).
- **DNI**: en las 10 empresas que exigen copia (O2, Tuenti, Orange, Amena, Jazztel, Simyo, R, Sector Alarm, Ocaso,
  Reale) se pide la foto, obligatoria, y va adjunta. Se borra en cuanto subes el certificado («Hecho»); del archivo de
  6 años solo queda que se aportó. En las otras 21, solo el número. Nadie pierde el botón.