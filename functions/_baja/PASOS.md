# «Te damos de baja» · lo que tienes que hacer tú (fase 1: envío a mano)

Sin pagar nada antes de tener clientes. Cuando alguien paga, te llega un correo URGENTE y la envías tú por Lleida.net
ese mismo día. La persona cree que es automático: ve y recibe lo mismo que cuando lo sea.

## 0. Antes de cobrar de verdad
- Habla con tu **gestor**: cobrar este servicio sin ser autónoma ni empresa.
- **Abogado**: la lista está en `functions/_baja/ABOGADO.md`.

## 1. Resend (envía los correos de la web; gratis hasta 3.000 al mes)
1. Crea la cuenta en resend.com › Domains › Add domain › `feehund.com`.
2. Te da 3 registros DNS: cópialos en Cloudflare › feehund.com › DNS › Add record (o dime y lo hacemos juntas).
   Espera a que Resend diga «Verified».
3. API Keys › Create › permiso «Sending access» › copia la clave (`re_…`). Va en el paso 3.

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
   - tipo **Secret**: `STRIPE_SECRET_KEY` (la `rk_live_…`), `STRIPE_WEBHOOK_SECRET` (la `whsec_…`), `RESEND_API_KEY` (la `re_…`).
   - tipo **Secret**, tres claves al azar: `TOKEN_SECRET`, `DATA_KEY` y `TAREA_SECRET`. Para cada una, abre Terminal,
     pega `openssl rand -base64 32`, pulsa Enter y copia lo que sale. **Guarda `DATA_KEY` en tu gestor de contraseñas.**
   - tipo **Text**: `STRIPE_PRODUCT_BAJA` = `prod_VdmVGkorJMQg6T`; `AVISOS_CORREO` = el correo donde
     quieres los avisos urgentes (el que mires en el móvil).
4. Deployments › el último › **Retry deployment**, para que las coja.

## 4. La tarea de cada hora (recordatorios, programadas y borrado a los 30 días)
Workers & Pages › Create › Worker › nombre `feehund-baja-tarea` › Deploy › Edit code: borra lo que hay, pega el
contenido de `workers/baja-tarea/index.js` (te lo paso) › Deploy. Después, en ese Worker:
- Settings › Variables and secrets: Secret `TAREA_SECRET` (la misma del paso 3) y Text `URL_WEB` = `https://feehund.com`.
- Settings › Trigger events › Add › Cron: `0 * * * *` (cada hora).

## 5. Lleida.net
Cuando llegue el primer cliente: alta en Lleida.net (acepta personas físicas) y compra el **pack de bienvenida de 9,99 €**
(10 envíos). Si quieres poder enviar desde tu correo con copia a `correo@certificado.lleida.net`, pídeles que den de
alta tu dirección como remitente.

## Cuando llegue un correo URGENTE
1. Abre Lleida.net › Correo electrónico certificado › nuevo envío.
2. **Para**, **Asunto** y **Texto**: cópialos del correo urgente (el asunto lleva la referencia FH-…, déjalo igual).
3. Adjunta la carta en PDF (va en el correo). Si la empresa pide copia del DNI, descárgala en el enlace de gestión.
4. Envía. Cuando Lleida te mande el certificado en PDF, abre el enlace de gestión del correo, súbelo y pulsa
   **«Hecho»**: a la persona le llega su justificante.
5. Si no se puede entregar: en esa misma página, **«No se pudo entregar»**. Se le devuelve el dinero y se le avisa.
6. Borra el correo urgente: lleva datos personales.
Si una baja sigue sin «Hecho», al día siguiente te llega un RECORDATORIO.

## Decisiones que te tocan
- **Borrar a los 30 días** limita la segunda carta gratis a esos 30 días. ¿60 o 90?
- **Foto del DNI** (opcional): 17 de las 31 empresas piden copia.
- La página y los correos dicen «la enviamos **hoy**». Si alguien paga a las 23:50, la tienes que enviar esa noche o
  muy temprano. Si prefieres «en el día» o «en 24 horas», se cambia en un sitio.
