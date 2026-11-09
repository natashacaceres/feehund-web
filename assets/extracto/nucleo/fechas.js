// Fechas de extractos (ES, CA, EN) → "AAAA-MM-DD". Todo en UTC y con texto: sin zonas horarias ni sorpresas.

const MESES = {
  ENE: 1, ENERO: 1, GEN: 1, GENER: 1, JAN: 1, JANUARY: 1,
  FEB: 2, FEBRERO: 2, FEBRER: 2, FEBRUARY: 2,
  MAR: 3, MARZO: 3, MARC: 3, MARCH: 3,
  ABR: 4, ABRIL: 4, APR: 4, APRIL: 4,
  MAY: 5, MAYO: 5, MAI: 5, MAIG: 5,
  JUN: 6, JUNIO: 6, JUNY: 6, JUNE: 6,
  JUL: 7, JULIO: 7, JULIOL: 7, JULY: 7,
  AGO: 8, AGOSTO: 8, AGOST: 8, AUG: 8, AUGUST: 8,
  SEP: 9, SEPT: 9, SET: 9, SEPTIEMBRE: 9, SETIEMBRE: 9, SETEMBRE: 9, SEPTEMBER: 9,
  OCT: 10, OCTUBRE: 10, OCTOBER: 10,
  NOV: 11, NOVIEMBRE: 11, NOVEMBRE: 11, NOVEMBER: 11,
  DIC: 12, DICIEMBRE: 12, DES: 12, DESEMBRE: 12, DEC: 12, DECEMBER: 12,
};
const DIAS_SEMANA = /^(?:LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO|DILLUNS|DIMARTS|DIMECRES|DIJOUS|DIVENDRES|DISSABTE|DIUMENGE|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\b,?\s*|^(?:LUN|MIE|JUE|VIE|SAB|DOM|DL|DT|DC|DJ|DV|DS|DG|MON|TUE|WED|THU|FRI|SAT|SUN)\.?,\s*/;

const DIA_MS = 86400000;

function sinAcentos(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

function dosDigitos(n) {
  return String(n).padStart(2, '0');
}

/** ¿Existe ese día en el calendario? */
export function fechaValida(anio, mes, dia) {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return false;
  if (anio < 1900 || anio > 2200 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

export function aISO(anio, mes, dia) {
  return `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
}

function anioDeDosCifras(a) {
  return a < 70 ? 2000 + a : 1900 + a;
}

/** Número de serie de Excel (1900 o 1904) → "AAAA-MM-DD". */
export function serialExcelAISO(serial, es1904 = false) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null;
  const dias = Math.floor(serial + 1e-7);
  let ms;
  if (es1904) ms = Date.UTC(1904, 0, 1) + dias * DIA_MS;
  else {
    if (dias < 1) return null;
    // Excel cree que 1900 fue bisiesto: a partir del 60 hay un día de más
    ms = dias >= 61 ? Date.UTC(1899, 11, 30) + dias * DIA_MS : Date.UTC(1899, 11, 31) + dias * DIA_MS;
  }
  const d = new Date(ms);
  return aISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** ¿Este número parece un serial de Excel de una fecha de extracto (1980–2099)? */
export function pareceSerialExcel(n, es1904 = false) {
  // 1980-01-01 … 2099-12-31. Los libros con fechas desde 1904 (Numbers, Excel antiguo de Mac) cuentan 1462 días menos.
  const desfase = es1904 ? 1462 : 0;
  return typeof n === 'number' && Number.isFinite(n) && n >= 29221 - desfase && n < 73051 - desfase;
}

/**
 * Lee una fecha, aunque le falte el año.
 * @param {string|number} valor
 * @param {{orden?: 'dmy'|'mdy', serial?: boolean, es1904?: boolean, compacta?: boolean, hoy?: string}} [ctx]
 * @returns {{anio: number|null, mes: number, dia: number, hora: string|null}|null}
 */
export function parseFechaParcial(valor, ctx = {}) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') {
    if (ctx.serial === false || !pareceSerialExcel(valor)) return null;
    const iso = serialExcelAISO(valor, ctx.es1904);
    if (!iso) return null;
    const frac = valor - Math.floor(valor);
    let hora = null;
    if (frac > 1e-6) {
      const seg = Math.round(frac * 86400);
      hora = `${dosDigitos(Math.floor(seg / 3600) % 24)}:${dosDigitos(Math.floor(seg / 60) % 60)}:${dosDigitos(seg % 60)}`;
    }
    const [a, m, d] = iso.split('-').map(Number);
    return { anio: a, mes: m, dia: d, hora };
  }
  if (typeof valor !== 'string') return null;
  let s = sinAcentos(valor).toUpperCase().replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 40) return null;

  // hora al final: "2026-03-02 10:15:00", "02/03/2026 10:15", ISO con T y zona
  let hora = null;
  const mh = s.match(/^(.*?\d)(?:[T ]|, ?)(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?(?: ?(?:Z|[+-]\d{2}:?\d{2}|UTC|GMT|CET|CEST|AM|PM))?$/);
  if (mh) {
    s = mh[1].trim();
    hora = `${dosDigitos(Number(mh[2]))}:${mh[3]}:${mh[4] ?? '00'}`;
  }

  // relativas (capturas de la app del banco)
  if (ctx.hoy && /^(HOY|AVUI|TODAY)$/.test(s)) return desdeISO(ctx.hoy, hora);
  if (ctx.hoy && /^(AYER|AHIR|YESTERDAY)$/.test(s)) return desdeISO(sumarDias(ctx.hoy, -1), hora);

  let m;
  // AAAA-MM-DD, AAAA/MM/DD, AAAA.MM.DD
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) return valida(+m[1], +m[2], +m[3], hora);
  // AAAAMMDD (solo si se pide: se confunde con referencias)
  if (ctx.compacta && (m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return valida(+m[1], +m[2], +m[3], hora);
  // DD/MM/AAAA, DD-MM-AA, DD.MM.AAAA (o MM/DD si la columna lo dice)
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/))) {
    const anio = m[3].length === 2 ? anioDeDosCifras(+m[3]) : +m[3];
    const [dia, mes] = ctx.orden === 'mdy' ? [+m[2], +m[1]] : [+m[1], +m[2]];
    return valida(anio, mes, dia, hora);
  }
  // DD/MM sin año
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})$/))) {
    const [dia, mes] = ctx.orden === 'mdy' ? [+m[2], +m[1]] : [+m[1], +m[2]];
    return valida(null, mes, dia, hora);
  }

  s = s.replace(DIAS_SEMANA, '').replace(/\b(?:DE|DEL)\b\s*|\bD'\s*/g, ' ').replace(/\s+/g, ' ').trim();
  // "02 ENE", "2-ENE-2026", "02ENE26", "2 ENERO 2026", "2 DE GENER DE 2026", "2 JANUARY 2026"
  if ((m = s.match(/^(\d{1,2})[\s.\-/]*([A-Z]{3,10})\.?(?:[\s.\-/,]*(\d{4}|\d{2}))?$/))) {
    const mes = MESES[m[2]];
    if (!mes) return null;
    const anio = m[3] ? (m[3].length === 2 ? anioDeDosCifras(+m[3]) : +m[3]) : null;
    return valida(anio, mes, +m[1], hora);
  }
  // "JAN 2, 2026", "ENERO 2 2026", "MAR 02"
  if ((m = s.match(/^([A-Z]{3,10})\.?\s*(\d{1,2})(?:ST|ND|RD|TH)?(?:,?\s*(\d{4}))?$/))) {
    const mes = MESES[m[1]];
    if (!mes) return null;
    return valida(m[3] ? +m[3] : null, mes, +m[2], hora);
  }
  return null;
}

function valida(anio, mes, dia, hora) {
  if (anio === null) {
    if (!fechaValida(2024, mes, dia)) return null; // 2024 es bisiesto: admite 29/02 hasta saber el año
    return { anio: null, mes, dia, hora };
  }
  if (!fechaValida(anio, mes, dia)) return null;
  return { anio, mes, dia, hora };
}

function desdeISO(iso, hora) {
  const [a, m, d] = iso.split('-').map(Number);
  return { anio: a, mes: m, dia: d, hora };
}

/**
 * Lee una fecha completa. Si le falta el año y no se da ctx.anio, devuelve null.
 * @returns {string|null} "AAAA-MM-DD"
 */
export function parseFecha(valor, ctx = {}) {
  const p = parseFechaParcial(valor, ctx);
  if (!p) return null;
  const anio = p.anio ?? ctx.anio ?? null;
  if (anio === null || !fechaValida(anio, p.mes, p.dia)) return null;
  return aISO(anio, p.mes, p.dia);
}

/**
 * Orden día/mes de una columna: si algún primer número pasa de 12, es día/mes; si el segundo, mes/día.
 * En España, sin pistas, día/mes.
 */
export function inferirOrden(valores) {
  let dmy = 0, mdy = 0;
  for (const v of valores) {
    if (typeof v !== 'string') continue;
    const m = v.trim().match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.]\d{2,4})?\b/);
    if (!m) continue;
    if (+m[1] > 12 && +m[2] <= 12) dmy++;
    if (+m[2] > 12 && +m[1] <= 12) mdy++;
  }
  return mdy > 0 && dmy === 0 ? 'mdy' : 'dmy';
}

/**
 * Pone año a fechas sin año ("02 ENE") sabiendo la fecha final del extracto.
 * Un extracto sin año cubre como mucho 12 meses hasta su fecha final:
 * si la fecha con el año final cae después del final (más la tolerancia), es del año anterior.
 * @param {{mes:number, dia:number}} parcial
 * @param {string} finISO fecha final conocida (cabecera del extracto, última fecha completa o hoy)
 */
export function completarAnio(parcial, finISO, tolerancia = 0) {
  const [af] = finISO.split('-').map(Number);
  let anio = af;
  if (!fechaValida(anio, parcial.mes, parcial.dia)) anio = af - 1; // 29/02 en año no bisiesto
  let iso = aISO(anio, parcial.mes, parcial.dia);
  if (diasEntre(finISO, iso) > tolerancia) {
    anio -= 1;
    if (!fechaValida(anio, parcial.mes, parcial.dia)) return null;
    iso = aISO(anio, parcial.mes, parcial.dia);
  }
  return iso;
}

export function aMs(iso) {
  return Date.parse(iso + 'T00:00:00Z');
}

/** Días de a hasta b (b − a). */
export function diasEntre(a, b) {
  return Math.round((aMs(b) - aMs(a)) / DIA_MS);
}

export function sumarDias(iso, n) {
  const d = new Date(aMs(iso) + n * DIA_MS);
  return aISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Suma meses respetando fin de mes (31 ene + 1 mes = 28/29 feb). */
export function sumarMeses(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  const na = Math.floor(total / 12), nm = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(na, nm, 0)).getUTCDate();
  return aISO(na, nm, Math.min(d, ultimo));
}

/** Fecha de hoy en la zona del dispositivo. */
export function hoyISO() {
  const d = new Date();
  return aISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Meses del periodo con un decimal (días / 30,4375). */
export function mesesEntre(desde, hasta) {
  return Math.round(((diasEntre(desde, hasta) + 1) / 30.4375) * 10) / 10;
}
