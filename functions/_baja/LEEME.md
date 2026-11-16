# «Te damos de baja» · cómo funciona

Servicio de pago de feehund.com: enviamos la baja por correo electrónico certificado (Lleida.net) en nombre de la persona.
Solo para las empresas que aceptan la baja por correo (hoy 31). El diagnóstico (Mi banco) y las guías siguen gratis.

Esta carpeta (`functions/_baja/`) no se publica como página: Cloudflare solo publica las rutas de `functions/api/`.
`/workers/` y `/pruebas/` dan 404 en la web (`functions/_middleware.js`).

## Precio y botón: un solo sitio

`investigacion/bajas/herramientas/envio_web.py` del motor es **el único sitio** del precio (`PRECIO`: 3,99 € la primera,
2,99 € cada una más) y de la regla del botón (ficha con `feehund.envio = "correo"`, verificada y con regla de plazo).
Escribe `data/te-damos-de-baja.json` (empresas, dirección de bajas sacada de la ficha y precio) en cada «Subir Feehund»
(lo llama `indice_web.py`), y de ahí salen:
- las guías (`paginas_web.py`: bloque «¿Prefieres que la enviemos por ti?» con el precio);
- Mi banco (`data/bajas-envio.json`, campo `e`, con la misma regla);
- la página de envío y el cobro: Stripe recibe el importe en cada pago (`price_data` sobre el producto
  `STRIPE_PRODUCT_BAJA`); en Stripe no hay precios fijos que cambiar.
  La misma cuenta de Stripe cobra el informe del datáfono: el aviso solo actúa si `metadata.servicio` es
  `te-damos-de-baja` y a todo lo demás contesta 200 sin tocar nada (`webhook.test.mjs`).

Si en la revisión mensual una ficha cambia, el botón aparece o desaparece solo al regenerar. Los cambios se apuntan en
`investigacion/bajas/envio-cambios.json` (qué empresas ganan o pierden el botón, y cuáles aceptarían envío pero aún no
tienen regla de plazo), para el informe mensual. `pruebas/te-damos-de-baja/coherencia.test.mjs` falla si las guías,
Mi banco y el cobro no coinciden.

## Dos fases, lo mismo para la persona (`ENVIO_MODO`)

| | Fase 1 · `manual` (ahora) | Fase 2 · `lleida` |
|---|---|---|
| Al pagar | correo «Recibido: enviamos hoy…» a la persona y correo **URGENTE** a `AVISOS_CORREO` | igual a la persona; la carta sale sola |
| Envío | a mano por Lleida.net, con lo que trae el correo urgente | desde hola@feehund.com (Brevo), Cc correo@certificado.lleida.net, Reply-To la persona |
| Justificante | en `/baja/gestion/?g=…` se sube el certificado de Lleida y se pulsa «Hecho» | la tarea lo trae de la API de Lleida (`list_pdf` por la referencia, `download_pdf`) |
| No se entrega | «No se pudo entregar» en la página de gestión → devolución | rebote en Brevo o 4 días sin entrega → devolución |

La persona nunca ve el nombre de los proveedores, solo «correo electrónico certificado» (`proveedores.test.mjs`); en
privacidad, la categoría. Pantallas, correos y plazos son idénticos en las dos (`pruebas/te-damos-de-baja/modos.test.mjs` lo comprueba). Pasar a
la fase 2 es poner `ENVIO_MODO=lleida` y las claves de Lleida.

## El recorrido

1. **Cuándo** (`/baja/enviar/?empresa=<id>`): lo antes posible, al acabar la permanencia o antes de la renovación.
   `calcularEnvio()` cuenta hacia atrás el aviso de la empresa (días hábiles con festivos nacionales, días o meses) con margen.
2. **Datos y carta**: la carta se ve en vivo, no se edita, va en el idioma de la empresa y cabe en una hoja. Código de 6
   cifras al correo.
3. **Firma**: código + casilla de autorización (+ firma dibujada opcional). Se guarda hora, navegador, hash de la IP y
   SHA-256 del texto firmado.
4. **Pago** en Stripe Checkout (1 a 3 bajas) con la casilla de renuncia al desistimiento. Vuelta a **`/baja/gracias/`**
   (check verde; si no hay pago válido, lleva a `/baja/`).
5. **Estado** (`/baja/estado/?p=…`): programada, en marcha, enviada con justificante, devuelta. Desde ahí: usar las bajas
   del lote, devolverlas, segunda carta gratis (una por compra, hasta los 90 días; el extracto se lee en el
   dispositivo), cancelar una programada antes de que salga.

DNI: en las empresas que exigen copia (`copia_dni: obligatoria`, lista `COPIA_DNI_OBLIGATORIA` de envio_web.py) se pide la
foto, obligatoria, y va adjunta a la carta y al correo urgente; se borra al confirmar la entrega y el archivo guarda solo
su SHA-256. Donde la copia es solo posible (`posible`), el número y «os la envío si me la pedís». En las copias semanales
de R2, lo borrado desaparece cuando rotan (12 semanas).

**Tarea** (Worker `workers/baja-tarea`, cada hora → `POST /api/baja/tarea` con `TAREA_SECRET`): programadas del día
(aviso urgente o envío), recordatorio diario de las que siguen sin enviar, justificantes (fase 2), devoluciones, borrado a
los 90 días (`DIAS_BORRADO`): se **archiva 6 años** lo que prueba la baja (nombre, DNI/NIE, empresa, fechas, carta,
justificante, pago, autorización) y se borra lo demás; devolución de bajas del lote sin usar a los 180 días; **copia
semanal** de todo (cifrado) en R2 (`COPIAS`), las 12 últimas (`workers/baja-tarea/restaurar.mjs` la devuelve a KV).

## Archivos

| Archivo | Qué hace |
|---|---|
| `data/te-damos-de-baja.json` | empresas con botón, su dirección de bajas y el precio (lo genera `envio_web.py`) |
| `assets/te-damos-de-baja/carta.js` | fechas, textos de la carta (es/ca/en), validación; página y servidor |
| `assets/te-damos-de-baja.js`, `/estilo.css`, `/gestion.js` | páginas enviar, estado, gracias y gestión |
| `functions/api/baja/[[ruta]].js` | la API |
| `functions/_baja/flujo.js` | el recorrido, los dos modos y la tarea |
| `functions/_baja/servicios.js` | Stripe, Brevo (correo) y Lleida.net (HTTP directo, sin npm) |
| `functions/_baja/almacen.js`, `cripto.js` | KV cifrado (AES-GCM con `DATA_KEY`), enlaces firmados, códigos |
| `functions/_baja/pdf.js` | la carta en PDF de una hoja |
| `functions/_baja/mensajes.js` | correos a la persona (es/ca/en) y urgentes al equipo |
| `pruebas/te-damos-de-baja/` | simulador de Stripe/Brevo/Lleida, prueba en Chrome, carta, coherencia, los dos modos, aviso de Stripe y proveedores |

Todo lo personal va **cifrado** en KV; los metadatos sin datos personales los lee la tarea sin descifrar.

## Variables (Cloudflare Pages › Settings › Variables and secrets; nunca en el repositorio)

Secretos: `STRIPE_SECRET_KEY` (clave restringida), `STRIPE_WEBHOOK_SECRET`, `BREVO_API_KEY`, `TOKEN_SECRET`,
`DATA_KEY` (32 bytes en base64), `TAREA_SECRET` (la misma en el Worker). Texto: `STRIPE_PRODUCT_BAJA`, `AVISOS_CORREO`
(adónde llegan los urgentes). Enlace KV: `FEEHUND_KV`; enlace R2: `COPIAS` (copias semanales). Fase 2: `ENVIO_MODO=lleida`, `LLEIDA_USER`, `LLEIDA_API_KEY`.
Opcionales: `URL_WEB`, `DIAS_BORRADO` (90), `ENVIO_PRUEBA` (fase 2: todas las cartas a esta dirección).
Si falta alguna, la página dice «Este servicio aún no está abierto» y enlaza la guía gratis.

## Probar en local

```bash
node --test pruebas/te-damos-de-baja/*.test.mjs
# en Chrome: .dev.vars con claves de prueba apuntando al simulador (STRIPE_API, BREVO_API, LLEIDA_API) y PRUEBAS=1
node pruebas/te-damos-de-baja/simulador.mjs            # buzón en http://localhost:8791/correo
npx wrangler pages dev . --port 8788 --kv FEEHUND_KV   # con el almacén local vacío
PLAYWRIGHT=<ruta>/playwright/index.mjs node pruebas/te-damos-de-baja/e2e.mjs
```

## Para más adelante

- **Carta certificada en papel (Pingen)**: añadir `canal: 'papel'`, su precio en `envio_web.py` y una función en
  `servicios.js` que suba el mismo PDF de `pdf.js` (ya es A4 de una hoja). La dirección postal, de la ficha comprobada.
- **AutoFirma** (firmar con certificado digital): opcional, al final del paso 3. No está hecho.
