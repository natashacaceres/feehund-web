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

## 3. Cloudflare
1. Storage & Databases › KV › Create: nombre `feehund-baja`.
2. Workers & Pages › **feehund-web** › Settings › Bindings › Add › KV namespace: nombre `FEEHUND_KV`, espacio `feehund-baja`.
3. Settings › Variables and secrets › Add, en **Production**:
   - tipo **Secret**: `STRIPE_SECRET_KEY` (la `rk_live_…`), `STRIPE_WEBHOOK_SECRET` (la `whsec_…`), `BREVO_API_KEY` (la `xkeysib-…`).
   - tipo **Secret**, tres claves al azar: `TOKEN_SECRET`, `DATA_KEY` y `TAREA_SECRET`. Para cada una, abre Terminal,
     pega `openssl rand -base64 32`, pulsa Enter y copia lo que sale. **Guarda `DATA_KEY` en tu gestor de contraseñas.**
   - tipo **Text**: `STRIPE_PRODUCT_BAJA` = `prod_VdmVGkorJMQg6T`; `AVISOS_CORREO` = el correo donde
     quieres los avisos urgentes (el que mires en el móvil).
4. Deployments › el último › **Retry deployment**, para que las coja.

## 4. Copias de seguridad (R2, gratis hasta 10 GB)
1. R2 Object Storage › Create bucket: nombre `feehund-copias` (ubicación automática).
2. Workers & Pages › **feehund-web** › Settings › Bindings › Add › R2 bucket: nombre `COPIAS`, bucket `feehund-copias`.
Cada semana la tarea guarda ahí una copia de todo, cifrada con `DATA_KEY`, y conserva las 12 últimas. Para
recuperarla: descargar la copia en R2 y `workers/baja-tarea/restaurar.mjs` (lo hago yo contigo).

## 5. La tarea de cada hora (recordatorios, programadas, archivo a los 90 días y copias)
Workers & Pages › Create › Worker › nombre `feehund-baja-tarea` › Deploy › Edit code: borra lo que hay, pega el
contenido de `workers/baja-tarea/index.js` (te lo paso) › Deploy. Después, en ese Worker:
- Settings › Variables and secrets: Secret `TAREA_SECRET` (la misma del paso 3) y Text `URL_WEB` = `https://feehund.com`.
- Settings › Trigger events › Add › Cron: `0 * * * *` (cada hora).

## 6. Lleida.net
Cuando llegue el primer cliente: alta en Lleida.net (acepta personas físicas) y compra el **pack de bienvenida de 9,99 €**
(10 envíos). Si quieres poder enviar desde tu correo con copia a `correo@certificado.lleida.net`, pídeles que den de
alta tu dirección como remitente.

## Cuando llegue un correo URGENTE
1. Abre Lleida.net › Correo electrónico certificado › nuevo envío.
2. **Para**, **Asunto** y **Texto**: cópialos del correo urgente (el asunto lleva la referencia FH-…, déjalo igual).
3. Adjunta la carta en PDF (va en el correo). No hay foto del DNI: la carta da el número y dice que la persona enviará
   copia si la empresa se la pide (esa respuesta le llega a ella).
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
- **DNI sin foto**: la carta da el número. 10 de las 31 empresas dicen en su ficha que la baja va con copia del DNI
  (O2, Tuenti, Orange, Amena, Jazztel, Simyo, R, Sector Alarm, Ocaso, Reale). Siguen con botón: si les falta la copia,
  se la pedirán a la persona. Para quitarles el botón: `QUITAR_SI_PIDEN_COPIA = True` en envio_web.py.
