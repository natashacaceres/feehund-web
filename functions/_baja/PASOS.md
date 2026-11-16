# «Te damos de baja» · lo que tienes que hacer tú

Todo lo demás está hecho y probado en local. Puedes ir en este orden; cuando acabes cada paso, me pasas lo que pone
«me pasas» y yo lo coloco.

## 1. Lleida.net (el certificado)
1. Date de alta en Lleida.net, servicio **Correo electrónico certificado (Mailcert)**. Compra el pack más pequeño
   (desde 25 €; cada envío cuesta 1 € + IVA).
2. En su panel, añade **hola@feehund.com** como remitente autorizado (lista blanca) y elige que el certificado se haga
   cuando pongamos su dirección en copia (**modo SENT_CC**). Si no lo encuentras, pídeselo a su soporte con esas palabras.
3. Pide el **usuario y la clave de la API**. → *me pasas* que ya los tienes (los pegas tú en Cloudflare, paso 4).

## 2. Resend (el que envía los correos)
1. Cuenta en resend.com. Añade el dominio **feehund.com**: te da 3 registros; ponlos en Cloudflare › DNS (o dime y lo
   hago contigo). Espera a que salga «Verified».
2. Crea una **API key** de envío. Comprueba que **hola@feehund.com** recibe correo (es el remitente).

## 3. Stripe (el cobro)
En la cuenta de Feehund, **primero en modo de prueba** y luego igual en real:
1. Producto «Te damos de baja» con **dos precios de pago único**: **3,99 €** y **1,99 €**. Copia los dos códigos
   `price_…`.
2. Desarrolladores › Webhooks › añadir: dirección `https://feehund.com/api/baja/stripe`, eventos
   `checkout.session.completed` y `checkout.session.async_payment_succeeded`. Copia el secreto `whsec_…`.

## 4. Cloudflare (las claves)
1. Workers & Pages › KV › crear un espacio llamado `feehund-baja`.
2. Proyecto **feehund-web** › Settings › Bindings › añadir KV: nombre `FEEHUND_KV`, espacio `feehund-baja`
   (en **Preview** y en **Production**).
3. Settings › Variables and secrets, **primero solo en Preview** (pruebas), todas como «Secret»:
   - `STRIPE_SECRET_KEY` (la `sk_test_…`), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BAJA1` (3,99), `STRIPE_PRICE_BAJA_EXTRA` (1,99)
   - `RESEND_API_KEY`, `LLEIDA_USER`, `LLEIDA_API_KEY`
   - `TOKEN_SECRET`, `DATA_KEY` y `TAREA_SECRET`: tres claves al azar. Para hacerlas, abre Terminal y pega esto tres
     veces (una por clave): `openssl rand -base64 32`
   - `ENVIO_PRUEBA`: **tu propio correo**. Así, en las pruebas, ninguna carta llega a una empresa de verdad.
4. **Guarda `DATA_KEY` en un sitio seguro** (gestor de contraseñas): sin ella no se pueden leer los datos guardados.

## 5. La tarea diaria
Con las claves puestas, lo publico yo: el Worker `feehund-baja-tarea` (necesitarás iniciar sesión en Cloudflare una vez
cuando te lo pida) con la misma `TAREA_SECRET`.

## 6. Prueba de verdad (vista previa)
Con todo puesto en Preview, hacemos juntas una baja de prueba con la tarjeta de prueba de Stripe: la carta te llega a ti
(por `ENVIO_PRUEBA`), con copia real a Lleida (1 €), y comprobamos que llega el certificado.

## 7. Abogado
Contrata la revisión. La lista con todo lo que tiene que mirar está en `functions/_baja/ABOGADO.md`.

## 8. Encender
Con el sí del abogado y tu sí: pongo las mismas variables en **Production** (con las claves reales de Stripe y sin
`ENVIO_PRUEBA`), publico, enciendo «Darme de baja» en Mi banco (`ENVIO_ACTIVO = true`) y vuelvo a poner el bloque
«¿Prefieres que la enviemos por ti?» en las guías de las 31 empresas, con 3,99 €.

## Decisiones que te tocan a ti
- **Borrar a los 30 días** hace que la segunda carta gratis solo se pueda pedir en esos 30 días. ¿Lo subimos a 60 o 90?
- He añadido la **foto del DNI** (opcional) porque 17 de las 31 empresas piden copia. ¿Te parece bien?
- **Firma dibujada**: opcional. **AutoFirma**: no está hecho (lo dejaste para el final).
