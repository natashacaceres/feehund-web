# Feehund · web

Calculadora independiente de comisiones del datáfono. Publicada con Cloudflare Pages desde la rama `main`.

- Las páginas las genera Claude Design y se suben con «Publicar Feehund.command» (Mac).
- `data/tarifas-datafono.json` lo mantiene el agente mensual de verificación de tarifas. **No lo sobrescribe Design.**
- `_headers` lleva `X-Robots-Tag: noindex` mientras la web está en pruebas: quitarlo al lanzar.
