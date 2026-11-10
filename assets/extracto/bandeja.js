/*
 * La bandeja de «Mi banco» y «Mi datáfono»: lo que la persona suelta, elige o pega se pone en una lista y no se lee
 * hasta que pulsa «Leer». Puede quitar lo que sobra y añadir más (otros meses, la segunda hoja, otra foto).
 * Las fotos se ven en miniatura con una dirección blob: de este dispositivo; nada se envía ni se guarda.
 *
 *   const b = crearBandeja({ zona, boton, idioma, alLeer });
 *   b.anadir(archivosOTexto)   File, lista de File o texto pegado
 *   b.marcar(errores)          [{archivo, codigo}] del motor: señala el archivo que no se ha podido leer
 *   b.vaciar()                 empezar de cero
 *
 * alLeer(entrada) recibe lo que espera el motor: una lista con los File y, si hay, el texto pegado.
 */

const TX = {
  es: { leerTexto: 'Leer el texto', leer: (n, fotos) => (fotos ? (n === 1 ? 'Leer la foto' : 'Leer las ' + n + ' fotos') : n === 1 ? 'Leer el archivo' : 'Leer los ' + n + ' archivos'),
    mas: 'Añadir más', quitar: (x) => 'Quitar ' + x, texto: 'Texto pegado', lineas: (n) => n + ' líneas', lista: 'Archivos para leer',
    mal: 'No se ha podido leer', banco: 'Es el extracto de una cuenta', datafono: 'Es el resumen del datáfono', clave: 'Tiene contraseña' },
  ca: { leerTexto: 'Llegir el text', leer: (n, fotos) => (fotos ? (n === 1 ? 'Llegir la foto' : 'Llegir les ' + n + ' fotos') : n === 1 ? "Llegir l'arxiu" : 'Llegir els ' + n + ' arxius'),
    mas: 'Afegir-ne més', quitar: (x) => 'Treure ' + x, texto: 'Text enganxat', lineas: (n) => n + ' línies', lista: 'Arxius per llegir',
    mal: "No s'ha pogut llegir", banco: "És l'extracte d'un compte", datafono: 'És el resum del datàfon', clave: 'Té contrasenya' },
  en: { leerTexto: 'Read the text', leer: (n, fotos) => (fotos ? (n === 1 ? 'Read the photo' : 'Read the ' + n + ' photos') : n === 1 ? 'Read the file' : 'Read the ' + n + ' files'),
    mas: 'Add more', quitar: (x) => 'Remove ' + x, texto: 'Pasted text', lineas: (n) => n + ' lines', lista: 'Files to read',
    mal: 'Could not be read', banco: 'This is an account statement', datafono: 'This is the card machine summary', clave: 'It has a password' },
};
const FOTO = /\.(png|jpe?g|webp|heic|heif|gif|bmp|avif)$/i;
const esFoto = (f) => /^image\//.test(f.type || '') || FOTO.test(f.name || '');
const clave = (f) => [f.name, f.size, f.lastModified].join('|');
const MAX = 100; // lo que lee el motor de una vez

export function crearBandeja({ zona, boton, idioma = 'es', alLeer }) {
  const t = TX[idioma] || TX.es;
  const doc = zona.ownerDocument;
  const el = (tag, clase, texto) => { const x = doc.createElement(tag); if (clase) x.className = clase; if (texto !== undefined) x.textContent = texto; return x; };
  const textoBoton = boton ? boton.textContent : '';
  const nf = new Intl.NumberFormat(idioma === 'en' ? 'en-GB' : 'es-ES', { maximumFractionDigits: 1 });
  const peso = (b) => (b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : nf.format(b / 1024 / 1024) + ' MB');

  // Estilos propios en un archivo de la web (la página no permite estilos sueltos)
  if (!doc.querySelector('link[data-bandeja]')) {
    const css = el('link'); css.rel = 'stylesheet'; css.href = new URL('./bandeja.css', import.meta.url).href; css.dataset.bandeja = '';
    doc.head.appendChild(css);
  }

  const caja = el('div', 'bj'); caja.hidden = true;
  const lista = el('ul', 'bj-lista'); lista.setAttribute('aria-label', t.lista);
  const leer = el('button', 'btn btn--gold bj-leer'); leer.type = 'button';
  caja.append(lista, leer);
  zona.after(caja);

  /** @type {{id: string, archivo?: File, texto?: string, nodo: HTMLElement, url?: string}[]} */
  let elementos = [];

  function pintar() {
    const n = elementos.length;
    caja.hidden = !n;
    zona.classList.toggle('bj-con', n > 0);
    if (boton) { boton.textContent = n ? t.mas : textoBoton; boton.classList.toggle('btn--gold', !n); }
    const fotos = n > 0 && elementos.every((x) => x.archivo && esFoto(x.archivo));
    leer.textContent = n === 1 && !elementos[0].archivo ? t.leerTexto : t.leer(n, fotos);
  }

  function fila(x) {
    const li = el('li', 'bj-it');
    const ic = el('span', 'bj-ic'); ic.setAttribute('aria-hidden', 'true');
    const nombre = x.archivo ? x.archivo.name : t.texto;
    if (x.archivo && esFoto(x.archivo)) {
      const img = el('img'); img.alt = ''; img.decoding = 'async';
      x.url = URL.createObjectURL(x.archivo); img.src = x.url;
      img.addEventListener('error', () => { img.remove(); ic.textContent = (nombre.split('.').pop() || '').slice(0, 4); }, { once: true });
      ic.appendChild(img);
    } else ic.textContent = x.archivo ? (nombre.includes('.') ? nombre.split('.').pop().slice(0, 4) : 'doc') : 'txt';
    const tx = el('span', 'bj-tx');
    const detalle = x.archivo ? peso(x.archivo.size) : t.lineas(x.texto.split('\n').filter((l) => l.trim()).length);
    tx.append(el('span', 'bj-n', nombre), el('span', 'bj-d', detalle));
    const quitar = el('button', 'bj-x'); quitar.type = 'button'; quitar.setAttribute('aria-label', t.quitar(nombre)); quitar.title = t.quitar(nombre);
    quitar.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    quitar.addEventListener('click', () => {
      const i = elementos.indexOf(x);
      quitarElemento(x);
      pintar();
      // el foco sigue en la lista: el siguiente «quitar», o «Leer», o el botón de elegir si ya no queda nada
      const sig = elementos[Math.min(i, elementos.length - 1)];
      (sig ? sig.nodo.querySelector('.bj-x') : boton || zona).focus();
    });
    li.append(ic, tx, quitar);
    x.nodo = li; x.detalle = detalle;
    return li;
  }

  function quitarElemento(x) {
    if (x.url) URL.revokeObjectURL(x.url);
    x.nodo.remove();
    elementos = elementos.filter((y) => y !== x);
  }

  function anadir(cosa) {
    const nuevos = [];
    const meter = (x) => { if (elementos.length + nuevos.length < MAX) nuevos.push(x); };
    if (typeof cosa === 'string') {
      if (!cosa.trim()) return;
      const ya = elementos.find((x) => typeof x.texto === 'string');
      if (ya) { if (ya.texto === cosa) return; quitarElemento(ya); } // un solo texto pegado: el último
      meter({ id: 'texto', texto: cosa });
    } else {
      for (const f of Array.from(cosa || [])) {
        if (!(f instanceof Blob) || !f.size) continue;
        const id = clave(f);
        if (elementos.some((x) => x.id === id) || nuevos.some((x) => x.id === id)) continue; // el mismo archivo dos veces
        meter({ id, archivo: f });
      }
    }
    if (!nuevos.length) return;
    limpiarMarcas();
    for (const x of nuevos) { elementos.push(x); lista.appendChild(fila(x)); }
    pintar();
  }

  function limpiarMarcas() {
    for (const x of elementos) { x.nodo.classList.remove('is-mal'); x.nodo.querySelector('.bj-d').textContent = x.detalle; }
  }

  function marcar(errores) {
    limpiarMarcas();
    for (const e of errores || []) {
      const x = elementos.find((y) => y.archivo && y.archivo.name === e.archivo);
      if (!x) continue;
      x.nodo.classList.add('is-mal');
      x.nodo.querySelector('.bj-d').textContent = e.codigo === 'es_extracto_banco' ? t.banco : e.codigo === 'es_datafono' ? t.datafono
        : /contrasena/.test(e.codigo || '') ? t.clave : t.mal;
    }
  }

  function vaciar() { for (const x of elementos.slice()) quitarElemento(x); pintar(); }

  leer.addEventListener('click', () => {
    if (!elementos.length) return;
    alLeer(elementos.map((x) => x.archivo || x.texto));
  });

  pintar();
  return { anadir, marcar, vaciar, get total() { return elementos.length; } };
}
