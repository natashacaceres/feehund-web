// Textos de la tarjeta para compartir: se leen de /data/personalidades.json, se rellenan con {n} y {m} y se parten en
// líneas. Lógica pura (sin DOM ni red): la usan tarjeta.js en el navegador y las pruebas en Node.
// validarPersonalidades() es para las pruebas: en la web nunca se llama, así que un texto mal escrito no rompe nada.

export const IDIOMAS = ['es', 'ca', 'en'];
export const MAX_FRASE = 8; // palabras
export const MAX_DATO = 6; // palabras, sin contar el número grande

/** Minúsculas y sin tildes, para comparar. */
export function normalizar(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export const palabrasDe = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean);

/** Los textos de una personalidad en un idioma (lo que falte, en español). null si el id no existe. */
export function textosDe(datos, id, idioma = 'es') {
  const p = (datos?.personalidades || []).find((x) => x.id === id);
  if (!p) return null;
  const es = p.es || {}, propio = p[idioma] || {};
  const t = { ...es, ...propio };
  const comun = { ...(datos.comun?.es || {}), ...(datos.comun?.[idioma] || {}) };
  return { id, lineas: t.lineas, nombre: t.nombre, frase: t.frase || '', num: t.num || '{n}', dato: t.dato || '', dato_uno: t.dato_uno, cabecera: comun.cabecera || '' };
}

/** Número con separador de miles también con cuatro cifras («1.234»); un texto se deja tal cual. */
export function formatearNumero(v, idioma = 'es') {
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v ?? '');
  const local = idioma === 'en' ? 'en-GB' : idioma === 'ca' ? 'ca-ES' : 'es-ES';
  return new Intl.NumberFormat(local, { maximumFractionDigits: Number.isInteger(v) ? 0 : 1, useGrouping: 'always' }).format(v);
}

/** El dato en singular («dato_uno») cuando el número es 1; si no, el de siempre. */
export function datoPara(t, valores = {}) {
  return valores.n === 1 && t.dato_uno ? t.dato_uno : t.dato;
}

/** «{n}/10» con {n: 7} → «7/10». */
export function rellenar(plantilla, valores = {}, idioma = 'es') {
  return String(plantilla ?? '').replace(/\{(\w+)\}/g, (todo, k) => (valores[k] === undefined || valores[k] === null ? todo : formatearNumero(valores[k], idioma)));
}

/**
 * Parte unas palabras en 1 o 2 líneas lo más iguales posible.
 * @param {string[]} palabras
 * @param {(texto: string) => number} ancho  ancho de una línea
 * @param {{sinSueltas?: boolean}} o  sinSueltas: nunca una palabra sola en la última línea si se puede evitar
 * @returns {string[]} líneas
 */
export function partirEquilibrado(palabras, ancho, o = {}) {
  const n = palabras.length;
  if (n <= 1) return [palabras.join(' ')];
  let mejor = null;
  for (let k = 1; k < n; k++) {
    if (o.sinSueltas && n >= 3 && n - k < 2) continue; // la última línea, con dos palabras como poco
    const a = palabras.slice(0, k).join(' '), b = palabras.slice(k).join(' ');
    const peor = Math.max(ancho(a), ancho(b));
    if (!mejor || peor < mejor.peor - 0.01) mejor = { peor, lineas: [a, b] };
  }
  return mejor.lineas;
}

// ---------- Validación (solo pruebas) ----------

// Palabras prohibidas. Con * al final vale cualquier terminación («comid*» = comida, comidas).
const TEMAS = {
  comida: 'comida* comer comes comemos cena cenas cenar almuerzo* desayun* merienda* restaurante* pizza* hamburgues* tapas tapeo menjar sopar esmorzar* food* dinner* lunch* breakfast* meal* eat eats eating restaurant* takeaway',
  alcohol: 'alcohol* cerveza* cervesa* birra* vino vinos copas cubata* chupito* borrach* resaca* bar bares beer* wine* drunk booze cocktail* coctel* gin vodka whisky ron',
  salud: 'salud salut medico* medica* metge* farmacia* hospital* enfermedad* enferm* malalt* dieta* medicina* medicament* pastilla* terapia* psicolog* dentista* health* doctor* pharmac* clinica* clinic*',
  deudas: 'deuda* deute* debt* debes debo moroso* morosa* prestamo* prestec* loan* hipoteca* mortgage* credito* credit* embargo* owe owes owing',
  apuestas: 'apuesta* apostar aposta* apuestas casino* loteria* lottery quiniela* bingo* poker ruleta* tragaperras bet bets betting gambl* lotto',
  ingresos: 'ingreso* ingres* sueldo* salario* salari* salary* nomina* paga extra cobras income* wage* paycheck* earn earns earning* ganancia*',
  saldo: 'saldo* balance* numeros rojos',
};
// Nombres de personas comunes (sin los que también son palabras corrientes, como Rosa, Luz, Sol, Mar o Pilar)
const PERSONAS = 'maria* jose juan antonio manuel francisco david javier daniel carlos jesus alejandro miguel rafael pablo sergio fernando jorge luis alberto alvaro diego adrian raul enrique ramon vicente andres joaquin oscar ruben ivan mario marcos hugo martin lucas mateo leo nicolas alex jordi josep joan marc pau pere xavier albert oriol arnau pol carmen ana laura isabel cristina marta lucia elena sara paula raquel andrea beatriz patricia silvia monica nuria montse* sonia irene julia claudia carla alba noelia lorena natalia rocio eva ines nerea aitana judith anna laia mireia merce nuria john james michael robert william david mary jennifer linda emma olivia sophia jack harry george charlie amelia emily chloe';
// Lugares (sin los que también son palabras corrientes, como León, Granada o Palma)
const LUGARES = 'espana espanya spain madrid barcelona valencia sevilla zaragoza malaga murcia bilbao alicante cordoba valladolid vigo gijon hospitalet vitoria coruna elche oviedo badalona cartagena terrassa jerez sabadell mostoles pamplona almeria salamanca huelva burgos albacete santander castellon logrono badajoz tarragona lleida girona cadiz jaen huesca teruel soria segovia avila cuenca guadalajara toledo caceres zamora palencia ourense pontevedra lugo asturias cantabria galicia catalunya cataluna catalonia andalucia euskadi navarra aragon extremadura mallorca menorca ibiza eivissa canarias tenerife lanzarote benidorm marbella francia franca france paris italia italy roma rome portugal lisboa lisbon alemania alemanya germany berlin londres london inglaterra anglaterra england europa europe mexico argentina colombia peru venezuela ecuador cuba nueva york';

const lista = (texto) => texto.split(/\s+/).filter(Boolean);

function coincide(tokens, termino) {
  // termino: una o varias palabras; la última puede acabar en *
  const partes = termino.split(' ');
  for (let i = 0; i + partes.length <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < partes.length && ok; j++) {
      const p = partes[j], t = tokens[i + j];
      ok = p.endsWith('*') ? t.startsWith(p.slice(0, -1)) : t === p;
    }
    if (ok) return true;
  }
  return false;
}

const tokensDe = (s) => normalizar(s).split(/[^a-z0-9ñç·]+/).filter(Boolean);

/** Nombres de comercio que se buscan en los textos (los de 3 letras o más; «Ara» no, que en catalán es «ahora»). */
export function nombresDeComercios(comercios) {
  const fuera = new Set(['ara']);
  const r = new Set();
  for (const c of comercios?.comercios || []) {
    const n = tokensDe(c.nombre).join(' ');
    if (n.replace(/ /g, '').length >= 3 && !fuera.has(n)) r.add(n);
  }
  return [...r];
}

/** ¿Qué tiene de prohibido este texto? [] si nada. */
export function prohibidoEn(texto, comercios) {
  const motivos = [];
  const s = String(texto ?? '');
  if (/€/.test(s)) motivos.push('símbolo €');
  const tokens = tokensDe(s);
  if (tokens.some((t) => t === 'euro' || t === 'euros' || t === 'eur')) motivos.push('la palabra «euros»');
  for (const n of nombresDeComercios(comercios)) if (coincide(tokens, n)) motivos.push(`comercio «${n}»`);
  for (const [tema, palabras] of Object.entries(TEMAS)) {
    // «numeros rojos» y «paga extra» son dos palabras
    const terminos = palabras.replace('numeros rojos', 'numeros_rojos').replace('paga extra', 'paga_extra').split(/\s+/).map((x) => x.replace('_', ' '));
    for (const p of terminos) if (coincide(tokens, p)) motivos.push(`tema ${tema} («${p.replace('*', '')}»)`);
  }
  for (const p of lista(PERSONAS)) if (coincide(tokens, p)) motivos.push(`nombre de persona («${p.replace('*', '')}»)`);
  const lugares = LUGARES.replace('nueva york', 'nueva_york').split(/\s+/).map((x) => x.replace('_', ' '));
  for (const p of lugares) if (coincide(tokens, p)) motivos.push(`lugar («${p}»)`);
  return motivos;
}

/**
 * Comprueba /data/personalidades.json. Solo en las pruebas.
 * @returns {Array<{id, idioma, campo, motivo}>} lo que está mal ([] si todo está bien)
 */
export function validarPersonalidades(datos, comercios) {
  const errores = [];
  const mal = (id, idioma, campo, motivo) => errores.push({ id, idioma, campo, motivo });
  if (!datos || !Array.isArray(datos.personalidades)) return [{ id: null, idioma: null, campo: 'personalidades', motivo: 'falta la lista' }];
  const ids = new Set();
  for (const idioma of IDIOMAS) {
    const c = datos.comun?.[idioma];
    if (c) for (const m of prohibidoEn(c.cabecera, comercios)) mal('comun', idioma, 'cabecera', m);
  }
  for (const p of datos.personalidades) {
    if (!p.id) { mal(null, null, 'id', 'falta el id'); continue; }
    if (ids.has(p.id)) mal(p.id, null, 'id', 'id repetido');
    ids.add(p.id);
    if (!p.es) mal(p.id, 'es', '-', 'falta el español');
    for (const idioma of IDIOMAS) {
      const t = p[idioma];
      if (!t) continue;
      if (t.lineas !== undefined) {
        if (!Array.isArray(t.lineas) || !t.lineas.length || t.lineas.some((l) => !String(l).trim())) mal(p.id, idioma, 'lineas', 'líneas vacías');
        else if (t.lineas.length > 2) mal(p.id, idioma, 'lineas', `el nombre tiene ${t.lineas.length} líneas (máximo 2)`);
      } else if (!String(t.nombre ?? '').trim()) mal(p.id, idioma, 'nombre', 'falta el nombre (lineas o nombre)');
      if (!String(t.frase ?? '').trim()) mal(p.id, idioma, 'frase', 'falta la frase');
      if (!String(t.dato ?? '').trim()) mal(p.id, idioma, 'dato', 'falta el dato');
      const nf = palabrasDe(t.frase).length;
      if (nf > MAX_FRASE) mal(p.id, idioma, 'frase', `${nf} palabras (máximo ${MAX_FRASE})`);
      for (const campo of ['dato', 'dato_uno']) {
        const nd = palabrasDe(t[campo]).length;
        if (nd > MAX_DATO) mal(p.id, idioma, campo, `${nd} palabras (máximo ${MAX_DATO})`);
      }
      const textos = { lineas: (t.lineas || []).join(' '), nombre: t.nombre, frase: t.frase, num: t.num, dato: t.dato, dato_uno: t.dato_uno };
      for (const [campo, v] of Object.entries(textos)) for (const m of prohibidoEn(v, comercios)) mal(p.id, idioma, campo, m);
    }
  }
  return errores;
}
