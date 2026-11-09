# Librerías de terceros (versiones fijas)

Comprobado el 6 de noviembre de 2026 en el registro de npm, en la CDN oficial de SheetJS, en OSV (que reúne los avisos de GitHub),
en Snyk y en las páginas de avisos de cada proyecto. Todas se sirven desde `/vendor/` (nada de CDN) y se cargan solo cuando
llega un archivo que las necesita. Cada carpeta lleva la versión en el nombre y su licencia dentro.

| Librería | Versión | De dónde | Licencia | Para qué | Fallos conocidos |
|---|---|---|---|---|---|
| SheetJS CE | **0.20.3** | cdn.sheetjs.com (`xlsx-0.20.3.tgz`) | Apache-2.0 | xlsx, xls, ods, numbers, html | Ninguno. Corrige CVE-2023-30533 (desde 0.19.3) y CVE-2024-22363 (desde 0.20.2). La 0.18.5 de npm sigue vulnerable: no se usa. OSV marca «xlsx» como afectado en todas las versiones porque solo mira npm; la página oficial de avisos confirma que 0.20.3 está corregida. |
| pdf.js (pdfjs-dist) | **6.5.438**, versión *legacy* | npm (integridad sha512 comprobada por npm) | Apache-2.0 | PDF con texto, con contraseña y escaneados | Ninguno en OSV ni en Snyk («latest non-vulnerable»). CVE-2024-4367 (ejecución de código con fuentes) se corrigió en 4.2.67 y además usamos `isEvalSupported: false`. |
| Papa Parse | **5.7.0** | npm | MIT | CSV, TSV, TXT | Ninguno (OSV y Snyk). |
| fflate | **0.8.3** | npm | MIT | ZIP | Ninguno (OSV y Snyk). Se usa solo `unzipSync`, con límites de tamaño antes de descomprimir. |
| tesseract.js | **7.0.0** | npm | Apache-2.0 | OCR de fotos y PDF escaneados | Ninguno (OSV y Snyk). Siempre con `cacheMethod: 'none'`, porque por defecto guarda los idiomas en IndexedDB. |
| tesseract.js-core | **7.0.0** | npm | Apache-2.0 | motor de OCR en WebAssembly | Ninguno. Solo las 3 variantes LSTM (relaxed SIMD, SIMD y normal). |
| tessdata_fast (spa, cat) | **4.1.0** | github.com/tesseract-ocr/tessdata_fast, etiqueta 4.1.0 | Apache-2.0 | modelos de idioma «fast» de español y catalán | No es código. Comprimidos con gzip para servirlos. |

## Archivos y huellas SHA-256

```
1a0fb062ee9781b13f6687371b202aaefc53b6ce55b530c027e01f9c087b77db  sheetjs-0.20.3/xlsx.mjs
7a7bba23b6b6f23b5c69fbb631f78d1d455f74b57e4aa54e9a2f81a8ab844964  sheetjs-0.20.3/cpexcel.full.mjs
522ad2c83bc8a0010e7f0cc60d0892b77c8d2bf2c9702dc12288311d94270f42  pdfjs-6.5.438/legacy/pdf.min.mjs
b4c8353ded0d88d2e2009574a29eb4e0c3ff7e942ecdf51ef5f71566a9667f31  pdfjs-6.5.438/legacy/pdf.worker.min.mjs
466f45c2a61a698152fb5400c27e56ff2ceb73dcb71fde3fc366a502308eaab0  pdfjs-6.5.438/wasm/jbig2.wasm
7ea4b2b04613370ad4e9c1162da750cc88b4b176eac0d0c164b3caff23fc0a46  pdfjs-6.5.438/wasm/openjpeg.wasm
663d86126d5f5fcb1c61490f94353e2a8375660b8c5498ab3ebab5a34b08800e  pdfjs-6.5.438/wasm/qcms_bg.wasm
4d5d2d6e3282b66aafaa5e6de8ca3ae06f8d3440111ae99c6a30f6c00cfac33e  papaparse-5.7.0/papaparse.min.js   (original)
a317289b56764c2b3f107b00a9c501de4f6a2a3258bbbd372b4bab23e822e59f  papaparse-5.7.0/papaparse.mjs      (envoltorio, ver abajo)
b7ca4450b19559a1d50eb381adcee94b82449674be4cd17789d9beba7e6122a1  fflate-0.8.3/fflate.mjs            (= esm/browser.js del paquete)
64871d76c75609fd5413b88a8171e2ef40deedd77d5875ba23df104b2d05eb29  tesseract-7.0.0/tesseract.esm.min.js
576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d  tesseract-7.0.0/worker.min.js
eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680  tesseract-core-7.0.0/tesseract-core-lstm.wasm.js
c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38  tesseract-core-7.0.0/tesseract-core-simd-lstm.wasm.js
861a536cf9ef8e63cb644d57bab39c388f37f7d6b6f60024b741c5f6b39a59b3  tesseract-core-7.0.0/tesseract-core-relaxedsimd-lstm.wasm.js
512d54fa722c1a0940bd20086d7ec487747e7f94771437d50405d6d8753dcc06  tessdata-fast-4.1.0/spa.traineddata.gz   (original 6f2e04d0…a40ea6b464)
8c4c657d57f8c85cc66a959ec8f9dc8e1f968f4718deb4d45a8de57552960d12  tessdata-fast-4.1.0/cat.traineddata.gz   (original 250db73c…57117d)
```

## Decisiones y por qué

- **SheetJS desde su CDN oficial y no desde npm.** La de npm se quedó en 0.18.5, con dos fallos (CVE-2023-30533 y CVE-2024-22363).
  Se usa `xlsx.mjs` (módulo ES oficial) y `cpexcel.full.mjs` para los XLS antiguos con otras codificaciones.
- **pdf.js en su versión *legacy*.** La versión moderna usa funciones muy nuevas del navegador (por ejemplo `Math.sumPrecise`) y
  falla al abrir PDF con contraseña en navegadores de hace uno o dos años. La legacy es la misma versión con esas funciones añadidas;
  pesa unos 120 KB más. pdf.js corre dentro de nuestro propio worker (sin crear otro) y con `isEvalSupported: false`.
  Se ha quitado `wasm/quickjs-eval.*` (el ejecutor de JavaScript de los PDF): no lo necesitamos y así nadie puede usarlo.
  `cmaps/` y `standard_fonts/` solo se descargan si un PDF concreto los pide.
- **Papa Parse** solo existe como script clásico (UMD). `papaparse.mjs` es el archivo original sin tocar, entre dos líneas que lo
  convierten en módulo ES (definen `module.exports` antes y lo exportan después). El motor decide el separador por su cuenta
  (; , tab |) y se lo pasa a Papa Parse: su detección automática falla con archivos cortos.
- **Tesseract**: un solo worker por análisis, que se cierra al terminar, con la variante del núcleo que encaja con el navegador y
  los modelos «fast» de español y catalán, que son los más rápidos. Nunca guarda nada (`cacheMethod: 'none'`).
  Su worker arranca desde un `blob:` que importa `vendor/tesseract-7.0.0/worker.min.js` (`workerBlobURL: true`). Se probó en
  Chrome: un worker abierto por su URL fuera de `/extracto/` no queda bajo el service worker y, sin conexión, no podría cargar el
  núcleo ni los idiomas. Desde `blob:` sí los recibe del service worker. Si el navegador no deja usar `blob:`, se abre por su URL
  y entonces las fotos solo se leen con conexión. Lo mismo hacen el worker del motor y el de HEIC (`motor.js`).
- **DOMParser no existe dentro de un Web Worker.** Para camt.053 el motor usa un lector XML pequeño propio que además rechaza DTD y
  entidades externas (más seguro que un analizador completo).

## HEIC: sin decodificador propio (decisión del 9 de noviembre de 2026)

Se quitó libheif-js. El único publicado (1.23.5) lleva libde265 1.0.15, con fallos de memoria conocidos (por ejemplo
CVE-2025-61147 y CVE-2026-33164), y HEVC está cubierto por patentes. Ahora un HEIC solo se lee si el navegador lo abre por
sí mismo (Safari y los iPhone). Si no, la persona ve un mensaje que le pide una captura de pantalla o la foto en JPG
(código `heic_no_compatible`). Si algún día se quiere volver a leer HEIC en todos los navegadores, hay que compilar libheif
con libde265 1.1.x y revisarlo con un abogado por las patentes.

## Cómo actualizar una librería

1. Comprobar la versión nueva en npm (`npm view <paquete> version`) o en https://cdn.sheetjs.com, y sus fallos en https://osv.dev y Snyk.
2. Descargar con `npm pack <paquete>@<versión>` (npm comprueba la integridad) y copiar solo los archivos de esta lista a una carpeta nueva `<lib>-<versión>/`.
3. Cambiar la ruta en `assets/extracto/librerias.js` (y en `assets/extracto/recursos.json` para el modo sin conexión).
4. Actualizar esta tabla y las huellas (`shasum -a 256 <archivo>`), pasar todas las pruebas y borrar la carpeta vieja.
