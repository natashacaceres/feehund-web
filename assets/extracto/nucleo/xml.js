// Lector XML pequeño y seguro para extractos (camt.053 y parecidos).
// DOMParser no existe dentro de un Web Worker ni en Node, por eso va aquí, en lógica pura.
// Seguridad: no admite DTD (<!DOCTYPE → error) ni entidades. Solo las 5 entidades básicas y las numéricas: una
// referencia a otra entidad («&xxe;») es un error, como en cualquier lector de XML que cumpla la norma.
// Coste lineal: un solo recorrido con indexOf, sin expresiones que puedan dispararse.

/** Error de un XML mal formado o no admitido (el lector lo convierte en 'danado'). */
export class ErrorXML extends Error {
  constructor(motivo, linea = null) {
    super(`XML no válido: ${motivo}${linea ? ` (línea ${linea})` : ''}`);
    this.name = 'ErrorXML';
    this.motivo = motivo;
    this.linea = linea;
  }
}

const ENTIDADES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const RE_ENTIDAD = /&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]{2,4});/g;
const RE_NOMBRE = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?/;
// Pegado (y): se prueba solo donde empieza cada atributo. Con /g y sin ancla, una etiqueta rota con
// mucho texto sin "=" costaba tiempo cuadrático (40 000 letras, 3 s; 1 MB, horas).
const RE_ATRIBUTO = /([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
// Relleno que dejan algunos programas al final (ceros o Ctrl-Z): fuera del elemento raíz no cuenta como texto
const RE_RELLENO = /[^\s\u0000\u001a]/;
const SIN_ATRIBUTOS = Object.freeze({});
const SIN_HIJOS = Object.freeze([]);

/** &lt; &gt; &amp; &quot; &apos; y &#123; &#x7B;. Lo desconocido se deja tal cual (no se inventa nada). */
export function decodificarEntidades(s) {
  if (s.indexOf('&') === -1) return s;
  return s.replace(RE_ENTIDAD, (todo, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!cp || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return todo;
      return String.fromCodePoint(cp);
    }
    return ENTIDADES[e] ?? todo;
  });
}

// Referencia a una entidad con nombre: solo valen las 5 básicas (sin DTD no puede haber otras)
const RE_REFERENCIA = /&([A-Za-z_][\w.:-]*);/g;

/** Como decodificarEntidades, pero una entidad que no es de las 5 básicas es un error (lectura estricta de XML). */
function textoXML(s, linea) {
  if (s.indexOf('&') === -1) return s;
  RE_REFERENCIA.lastIndex = 0;
  let m;
  while ((m = RE_REFERENCIA.exec(s))) if (!Object.hasOwn(ENTIDADES, m[1])) throw new ErrorXML(`entidad no declarada &${m[1]};`, linea);
  return decodificarEntidades(s);
}

const esEspacio = (c) => c === 32 || c === 9 || c === 10 || c === 13;

/** Atributos de una etiqueta en un solo recorrido: lo que no es un atributo bien escrito se salta hasta el siguiente espacio. */
function leerAtributos(s, linea) {
  if (!s || !s.trim()) return SIN_ATRIBUTOS; // la mayoría de nodos no tienen: un solo objeto para todos
  const atributos = {};
  const n = s.length;
  let i = 0;
  while (i < n) {
    if (esEspacio(s.charCodeAt(i))) { i++; continue; }
    RE_ATRIBUTO.lastIndex = i;
    const m = RE_ATRIBUTO.exec(s);
    if (m) {
      atributos[m[1]] = textoXML(m[2] ?? m[3] ?? '', linea);
      i = RE_ATRIBUTO.lastIndex;
      continue;
    }
    while (i < n && !esEspacio(s.charCodeAt(i))) i++;
  }
  return atributos;
}

/**
 * @typedef {Object} NodoXML
 * @property {string} nombre      nombre local, sin prefijo de espacio de nombres ("Stmt")
 * @property {string|null} prefijo
 * @property {string} qnombre     nombre tal cual ("ns2:Stmt")
 * @property {Object<string,string>} atributos
 * @property {NodoXML[]} hijos
 * @property {string} texto       texto propio (sin el de los hijos), con las entidades ya traducidas
 * @property {number} linea       línea (desde 1) donde empieza la etiqueta
 */

/**
 * Lee un documento XML y devuelve su elemento raíz.
 * @param {string} texto
 * @param {{maxProfundidad?: number, maxNodos?: number}} [opciones]
 * @returns {NodoXML}
 * @throws {ErrorXML} si está mal formado, trae DTD o pasa de los límites
 */
export function leerXML(texto, opciones = {}) {
  const maxProfundidad = opciones.maxProfundidad ?? 100;
  const maxNodos = opciones.maxNodos ?? 2000000;
  const n = texto.length;
  const doc = { nombre: '#documento', prefijo: null, qnombre: '#documento', atributos: {}, hijos: [], texto: '', linea: 1 };
  const pila = [doc];
  // Memoria: un camt de 10 MB tiene cientos de miles de nodos. Cada nombre se guarda una sola vez,
  // y los nodos sin atributos o sin hijos comparten el mismo objeto vacío (de solo lectura).
  const nombres = new Map();
  let nodos = 0;
  let pos = texto.charCodeAt(0) === 0xfeff ? 1 : 0;

  // número de línea por avance incremental: el total sigue siendo lineal
  let contado = 0, linea = 1;
  const lineaEn = (i) => {
    for (; contado < i; contado++) if (texto.charCodeAt(contado) === 10) linea++;
    return linea;
  };
  const anadirTexto = (trozo, desde) => {
    const actual = pila[pila.length - 1];
    if (actual === doc) {
      if (RE_RELLENO.test(trozo)) throw new ErrorXML('texto fuera del elemento raíz', lineaEn(desde));
      return;
    }
    if (/\S/.test(trozo)) actual.texto += trozo;
  };

  while (pos < n) {
    const lt = texto.indexOf('<', pos);
    const fin = lt === -1 ? n : lt;
    if (fin > pos) anadirTexto(textoXML(texto.slice(pos, fin), null), pos);
    if (lt === -1) break;

    const c1 = texto.charCodeAt(lt + 1);
    if (c1 === 63) { // <? … ?> declaración o instrucción: se salta
      const f = texto.indexOf('?>', lt + 2);
      if (f === -1) throw new ErrorXML('instrucción sin cerrar', lineaEn(lt));
      pos = f + 2;
      continue;
    }
    if (c1 === 33) { // <!
      if (texto.startsWith('<!--', lt)) {
        const f = texto.indexOf('-->', lt + 4);
        if (f === -1) throw new ErrorXML('comentario sin cerrar', lineaEn(lt));
        pos = f + 3;
        continue;
      }
      if (texto.startsWith('<![CDATA[', lt)) {
        const f = texto.indexOf(']]>', lt + 9);
        if (f === -1) throw new ErrorXML('CDATA sin cerrar', lineaEn(lt));
        anadirTexto(texto.slice(lt + 9, f), lt);
        pos = f + 3;
        continue;
      }
      // <!DOCTYPE, <!ENTITY…: no se admiten (evita entidades externas y bombas de entidades)
      throw new ErrorXML('doctype', lineaEn(lt));
    }
    if (c1 === 47) { // </cierre>
      const f = texto.indexOf('>', lt + 2);
      if (f === -1) throw new ErrorXML('cierre sin terminar', lineaEn(lt));
      const qnombre = texto.slice(lt + 2, f).trim();
      const actual = pila[pila.length - 1];
      if (actual === doc || actual.qnombre !== qnombre) throw new ErrorXML(`cierre </${qnombre}> que no corresponde`, lineaEn(lt));
      pila.pop();
      pos = f + 1;
      continue;
    }

    // <apertura atributos…> o <vacía/>: el '>' final, respetando comillas
    let i = lt + 1, comilla = 0;
    for (; i < n; i++) {
      const c = texto.charCodeAt(i);
      if (comilla) { if (c === comilla) comilla = 0; } else if (c === 34 || c === 39) comilla = c; else if (c === 62) break;
    }
    if (i >= n) throw new ErrorXML('etiqueta sin cerrar', lineaEn(lt));
    let interior = texto.slice(lt + 1, i);
    const vacia = interior.endsWith('/');
    if (vacia) interior = interior.slice(0, -1);
    const m = RE_NOMBRE.exec(interior);
    if (!m) throw new ErrorXML('nombre de etiqueta no válido', lineaEn(lt));
    const resto = interior.slice(m[0].length);
    if (resto && !/^\s/.test(resto)) throw new ErrorXML('nombre de etiqueta no válido', lineaEn(lt));
    let partes = nombres.get(m[0]);
    if (!partes) {
      const q = m[0], dp = q.indexOf(':');
      partes = { qnombre: q, nombre: dp >= 0 ? q.slice(dp + 1) : q, prefijo: dp >= 0 ? q.slice(0, dp) : null };
      nombres.set(q, partes);
    }
    const nodo = {
      nombre: partes.nombre,
      prefijo: partes.prefijo,
      qnombre: partes.qnombre,
      atributos: leerAtributos(resto, null),
      hijos: SIN_HIJOS,
      texto: '',
      linea: lineaEn(lt),
    };
    if (++nodos > maxNodos) throw new ErrorXML('demasiados elementos', nodo.linea);
    const padre = pila[pila.length - 1];
    if (padre === doc && doc.hijos.length) throw new ErrorXML('más de un elemento raíz', nodo.linea);
    if (padre.hijos === SIN_HIJOS) padre.hijos = [nodo];
    else padre.hijos.push(nodo);
    if (!vacia) {
      pila.push(nodo);
      if (pila.length > maxProfundidad + 1) throw new ErrorXML('demasiado anidado', nodo.linea);
    }
    pos = i + 1;
  }
  if (pila.length !== 1) throw new ErrorXML(`falta cerrar <${pila[pila.length - 1].qnombre}>`, lineaEn(n));
  if (!doc.hijos.length) throw new ErrorXML('sin elemento raíz');
  return doc.hijos[0];
}

/** Primer hijo directo con ese nombre local. */
export function hijo(nodo, nombre) {
  if (!nodo) return null;
  for (const h of nodo.hijos) if (h.nombre === nombre) return h;
  return null;
}

/** Todos los hijos directos con ese nombre local. */
export function hijos(nodo, nombre) {
  if (!nodo) return [];
  const r = [];
  for (const h of nodo.hijos) if (h.nombre === nombre) r.push(h);
  return r;
}

/** Baja por una ruta de nombres locales: ruta(stmt, 'Acct/Id/IBAN'). Primer camino que exista. */
export function ruta(nodo, camino) {
  const partes = camino.split('/');
  const bajar = (n, i) => {
    if (!n) return null;
    if (i === partes.length) return n;
    for (const h of n.hijos) {
      if (h.nombre !== partes[i]) continue;
      const r = bajar(h, i + 1);
      if (r) return r;
    }
    return null;
  };
  return bajar(nodo, 0);
}

/** Todos los nodos al final de la ruta. */
export function rutas(nodo, camino) {
  let actuales = nodo ? [nodo] : [];
  for (const p of camino.split('/')) {
    const sig = [];
    for (const n of actuales) for (const h of n.hijos) if (h.nombre === p) sig.push(h);
    actuales = sig;
  }
  return actuales;
}

/** Texto de un nodo (o del nodo al final de la ruta) con los espacios juntados; null si no hay. */
export function textoDe(nodo, camino) {
  const n = camino ? ruta(nodo, camino) : nodo;
  if (!n) return null;
  const t = n.texto.replace(/\s+/g, ' ').trim();
  return t || null;
}

/** Descendientes con ese nombre local, a cualquier profundidad, en orden de documento (sin entrar en los que ya coinciden). */
export function buscar(nodo, nombre, max = Infinity) {
  const r = [];
  if (!nodo) return r;
  const pila = [nodo];
  while (pila.length && r.length < max) {
    const n = pila.pop();
    if (n !== nodo && n.nombre === nombre) { r.push(n); continue; }
    for (let i = n.hijos.length - 1; i >= 0; i--) pila.push(n.hijos[i]);
  }
  return r;
}
