# «Te damos de baja» · cómo funciona

Servicio de pago de feehund.com: enviamos la baja por correo certificado en nombre de la persona. **3,99 €** la primera,
**1,99 €** cada una más en la misma compra. Solo para las **31 empresas** que aceptan la baja por correo
(`"e": true` en `data/bajas-envio.json`). El diagnóstico (Mi banco) y las guías siguen gratis.

Esta carpeta (`functions/_baja/`) no se publica como página: Cloudflare solo publica las rutas de `functions/api/`.
`/workers/` y `/pruebas/` dan 404 en la web (`functions/_middleware.js`).

## El recorrido

1. **Cuándo** (`/baja/enviar/?empresa=<id>`): lo antes posible, al acabar la permanencia o antes de la renovación (lo que
   permita cada empresa). `calcularEnvio()` cuenta hacia atrás el aviso que pide la empresa (días hábiles con festivos
   nacionales y Viernes Santo, días o meses) y un margen. Si ya no da tiempo, se envía hoy y se avisa.
2. **Datos y carta**: nombre, correo, el dato del contrato, DNI (si lo piden) y foto del DNI (si piden copia). La carta
   se ve en vivo, no se puede editar y va en el idioma de la empresa. Al continuar se guarda un borrador y se manda un
   **código de 6 cifras** al correo (`POST /api/baja/pedido`).
3. **Firma**: código + casilla de autorización (+ firma dibujada opcional, que va en el PDF). Se guarda la hora, el
   navegador, un hash de la IP y el SHA-256 del texto firmado (`POST /api/baja/firma`).
4. **Pago**: Stripe Checkout con 1, 2 o 3 bajas y la casilla de renuncia al desistimiento (`POST /api/baja/pago`).
   Al pagar (aviso firmado de Stripe en `/api/baja/stripe`, o comprobación al volver si el aviso tarda):
   - si toca hoy, **se envía**: correo desde `hola@feehund.com` a la dirección de la ficha, **Cc
     correo@certificado.lleida.net** (Lleida.net Mailcert, modo SENT_CC), **Reply-To** el correo de la persona, la carta
     en el cuerpo y en PDF de una hoja, y la foto del DNI si la hay;
   - si no, queda **programada** y la envía la tarea diaria ese día.
5. **Estado** (`/baja/estado/?p=…`, el enlace también llega por correo): programada, enviada, entregada (con el
   certificado de Lleida en PDF), devuelta. Desde ahí: usar las bajas que quedan del lote, devolverlas, pedir la
   **segunda carta gratis** (una por compra; el extracto se lee en el dispositivo con el motor de Mi banco) y **borrar
   los datos ya** (si estaba programada, se cancela y se devuelve).

**Tarea diaria** (Worker `workers/baja-tarea`, 7:00 UTC → `POST /api/baja/tarea` con `TAREA_SECRET`): envía las
programadas del día; mira en Resend si cada carta llegó (rebote, o 4 días sin entrega → **devolución automática** en
Stripe); trae los certificados de Lleida (`list_pdf` filtrando el asunto por la referencia `FH-XXXX-XXXX`, después
`download_pdf`) y se los manda a la persona; **borra los datos a los 30 días** de la entrega (`DIAS_BORRADO`); devuelve
las bajas de un lote sin usar a los 180 días.

## Archivos

| Archivo | Qué hace |
|---|---|
| `data/te-damos-de-baja.json` | las 31 empresas: correo de la ficha, aviso, opciones, dato, DNI. Lo genera `investigacion/bajas/herramientas/envio_web.py` del motor (nunca a mano) |
| `assets/te-damos-de-baja/carta.js` | fechas, textos de la carta (es/ca/en), validación. Lo usan la página y el servidor |
| `assets/te-damos-de-baja.js` + `/estilo.css` | las páginas enviar y estado |
| `functions/api/baja/[[ruta]].js` | la API |
| `functions/_baja/flujo.js` | el recorrido entero y la tarea diaria |
| `functions/_baja/servicios.js` | Stripe, Resend y Lleida.net (HTTP directo, sin npm) |
| `functions/_baja/almacen.js`, `cripto.js` | KV cifrado (AES-GCM con `DATA_KEY`), enlaces firmados, códigos |
| `functions/_baja/pdf.js` | la carta en PDF de una hoja (Helvetica, sin librerías) |
| `functions/_baja/mensajes.js` | correos a la persona (es/ca/en) |
| `pruebas/te-damos-de-baja/` | simulador de Stripe/Resend/Lleida, prueba en Chrome de punta a punta, pruebas de la carta |

Datos guardados: todo lo personal va **cifrado** en KV (`baja:`, `compra:`, `adj:`, `cert:`); los metadatos sin datos
personales (estado y fechas) los lee la tarea sin descifrar. Los borradores caducan solos a los 2 días.

## Variables (Cloudflare Pages › Settings › Variables, como secretos; nunca en el repositorio)

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BAJA1` (3,99 €), `STRIPE_PRICE_BAJA_EXTRA` (1,99 €),
`TOKEN_SECRET` (32+ caracteres), `DATA_KEY` (32 bytes en base64), `RESEND_API_KEY`, `LLEIDA_USER`, `LLEIDA_API_KEY`,
`TAREA_SECRET` (la misma en el Worker). Enlace KV: `FEEHUND_KV`. Opcionales: `URL_WEB`, `DIAS_BORRADO` (30),
**`ENVIO_PRUEBA`** (en la vista previa: todas las cartas van a esta dirección en vez de a la empresa).
Si falta alguna obligatoria, la página dice «Este servicio aún no está abierto» y enlaza la guía gratis.

## Probar en local

```bash
# .dev.vars con claves de prueba que apunten al simulador (STRIPE_API, RESEND_API, LLEIDA_API = http://localhost:8791…) y PRUEBAS=1
node pruebas/te-damos-de-baja/simulador.mjs            # buzón en http://localhost:8791/correo
npx wrangler pages dev . --port 8788 --kv FEEHUND_KV
node --test pruebas/te-damos-de-baja/carta.test.mjs
PLAYWRIGHT=<ruta>/playwright/index.mjs node pruebas/te-damos-de-baja/e2e.mjs
```

## Para más adelante

- **Carta certificada en papel (9,99 €, Pingen)**: añadir `canal: 'papel'` a la baja y un tercer precio; en
  `servicios.js` una función `enviarCarta()` con la API de Pingen (subir el mismo PDF de `pdf.js`, que ya es A4 de una
  hoja) y en la tarea, mirar su estado de entrega igual que el de Resend. La dirección postal de cada empresa tiene que
  salir de su ficha comprobada.
- **Firmar con mi certificado digital (AutoFirma)**: opcional, al final del paso 3. No está hecho.
- Las 155 empresas que no aceptan correo siguen yendo a su guía gratis.
