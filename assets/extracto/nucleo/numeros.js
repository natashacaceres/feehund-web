// Importes escritos de cualquier forma → número con signo (negativo = cargo).
// Regla de oro: si no está claro, devuelve null. Nunca adivina en silencio.

const MENOS = /[−‒–—―﹣－]/g; // −, –, —… → "-"
const ESPACIOS = /[            　]/g;
const MONEDAS = /(?:EUROS?|EUR|USD|GBP|CHF|SEK|NOK|DKK|PLN|CZK|HUF|RON|BGN|MXN|ARS|COP|CLP|BRL|JPY|CNY|AUD|CAD|€|\$|£|¥)/gi;

/** Redondea a céntimos sin errores de coma flotante visibles. */
export function redondear2(n) {
  return Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100;
}

/** Céntimos enteros (para comparar sin decimales). */
export function aCentimos(n) {
  return Math.round(n * 100);
}

/**
 * Interpreta un importe.
 * @param {string|number|null|undefined} valor
 * @param {{decimal?: ','|'.'|null}} [opciones] decimal: separador decimal ya conocido para la columna
 * @returns {number|null}
 */
export function parseImporte(valor, opciones = {}) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? redondear2(valor) : null;
  if (typeof valor !== 'string') return null;

  let s = valor.replace(MENOS, '-').replace(ESPACIOS, ' ').trim();
  if (!s) return null;

  let negativo = false;
  // (12,50) → negativo
  const par = s.match(/^\((.*)\)$/);
  if (par) { negativo = true; s = par[1].trim(); }
  s = s.replace(MONEDAS, ' ').trim();
  // signo delante (también "- 12,50") o detrás ("12,50-")
  if (/^[+-]/.test(s)) { if (s[0] === '-') negativo = !negativo; s = s.slice(1).trim(); }
  if (/[+-]$/.test(s)) { if (s.endsWith('-')) negativo = !negativo; s = s.slice(0, -1).trim(); }
  // la moneda puede quedar entre el signo y la cifra: "-€12.50"
  s = s.replace(MONEDAS, ' ').trim();
  if (/^[+-]/.test(s)) return null; // doble signo: no se adivina
  // espacios como separador de miles: "1 234,56"
  if (/^\d{1,3}( \d{3})+([.,]\d+)?$/.test(s)) s = s.replace(/ /g, '');
  // apóstrofo suizo "1'234.56"
  if (/^\d{1,3}('\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/'/g, '');
  if (!/^\d[\d.,]*$/.test(s) || /[.,]$/.test(s) || /[.,]{2}/.test(s)) return null;

  const n = interpretarCifras(s, opciones.decimal ?? null);
  if (n === null) return null;
  return redondear2(negativo ? -n : n);
}

function interpretarCifras(s, decimal) {
  const puntos = (s.match(/\./g) || []).length;
  const comas = (s.match(/,/g) || []).length;
  if (puntos === 0 && comas === 0) return Number(s);

  let sepDecimal = null;
  if (puntos > 0 && comas > 0) {
    // el último que aparece es el decimal y solo puede aparecer una vez
    sepDecimal = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const miles = sepDecimal === '.' ? ',' : '.';
    const [ent, dec, ...resto] = s.split(sepDecimal);
    if (resto.length || dec === undefined) return null;
    if (!gruposDeMilesValidos(ent, miles)) return null;
    if (!decimalesValidos(dec)) return null;
    return Number(ent.split(miles).join('') + '.' + dec);
  }

  const sep = puntos > 0 ? '.' : ',';
  const veces = puntos + comas;
  if (veces > 1) {
    // "1.234.567" → miles; "1,234,567" → miles
    if (!gruposDeMilesValidos(s, sep)) return null;
    return Number(s.split(sep).join(''));
  }
  const [ent, dec] = s.split(sep);
  if (decimal === sep) sepDecimal = sep;
  else if (decimal && decimal !== sep) sepDecimal = null; // el separador conocido es otro: esto son miles
  else sepDecimal = dec.length === 3 && ent.length <= 3 && ent !== '0' ? null : sep; // "1.234" → miles; "12,50" → decimal

  if (sepDecimal === null) {
    if (dec.length !== 3) return null;
    return Number(ent + dec);
  }
  if (!decimalesValidos(dec)) return null;
  return Number(ent + '.' + dec);
}

// Más de 2 decimales solo valen si lo que sobra son ceros («12,5000»). «1.234» con punto decimal o «0,999» se
// devuelven como null: casi siempre es una confusión con los miles, y redondear en silencio daría una cifra falsa.
function decimalesValidos(dec) {
  return dec.length <= 2 || /^0+$/.test(dec.slice(2));
}

function gruposDeMilesValidos(s, sep) {
  const partes = s.split(sep);
  if (partes.length === 1) return /^\d+$/.test(partes[0]);
  if (!/^\d{1,3}$/.test(partes[0])) return false;
  return partes.slice(1).every((p) => /^\d{3}$/.test(p));
}

/**
 * Separador decimal más probable de una columna, mirando solo los casos sin ambigüedad.
 * @param {Array<string|number|null>} valores
 * @returns {','|'.'|null}
 */
export function inferirDecimal(valores) {
  let coma = 0, punto = 0;
  for (const v of valores) {
    if (typeof v !== 'string') continue;
    const s = v.replace(MENOS, '-').replace(ESPACIOS, ' ').replace(MONEDAS, '').replace(/[()+\-\s']/g, '');
    if (!/^\d[\d.,]*\d$/.test(s)) continue;
    const ip = s.lastIndexOf('.'), ic = s.lastIndexOf(',');
    if (ip >= 0 && ic >= 0) { if (ip > ic) punto++; else coma++; continue; }
    const sep = ip >= 0 ? '.' : ic >= 0 ? ',' : null;
    if (!sep) continue;
    const decimales = s.length - s.lastIndexOf(sep) - 1;
    const veces = s.split(sep).length - 1;
    if (veces === 1 && decimales !== 3) { if (sep === '.') punto++; else coma++; }
    else if (veces > 1) { if (sep === '.') coma++; else punto++; } // "1.234.567" → miles con punto → decimal coma
  }
  if (coma === 0 && punto === 0) return null;
  if (coma >= punto * 3) return ',';
  if (punto >= coma * 3) return '.';
  return coma >= punto ? ',' : '.';
}

/**
 * ¿Este trozo de texto es un importe con céntimos? (para líneas de PDF y fotos).
 * Exige 2 decimales, o un símbolo de moneda, para no confundir importes con fechas, horas o referencias.
 */
export function pareceImporte(token) {
  if (typeof token !== 'string') return false;
  const s = token.replace(MENOS, '-').replace(ESPACIOS, ' ').trim();
  if (!s || s.length > 24) return false;
  if (/^\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?$/.test(s)) return false; // fecha
  if (/^\d{1,2}:\d{2}/.test(s)) return false; // hora
  const conMoneda = /[€$£]|\bEUR\b/i.test(s);
  const nucleo = s.replace(/^\(|\)$/g, '').replace(MONEDAS, '').replace(/^[+-]\s?|[+-]$/g, '').trim();
  if (!/^\d{1,3}([., ']\d{3})*([.,]\d{2})?$|^\d+([.,]\d{2})?$/.test(nucleo)) return false;
  if (!/[.,]\d{2}$/.test(nucleo) && !conMoneda) return false;
  return parseImporte(s) !== null;
}

/** Formatea para textos y depuración (no para la interfaz final, que es de Design). */
export function formatoEuros(n, idioma = 'es') {
  const loc = idioma === 'en' ? 'en-GB' : idioma === 'ca' ? 'ca-ES' : 'es-ES';
  return new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR' }).format(n);
}
