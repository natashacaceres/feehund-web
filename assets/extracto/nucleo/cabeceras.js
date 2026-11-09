// Títulos de columna (ES, CA, EN) → papel de cada columna, y deducción de columnas cuando no hay títulos.
// Lógica pura: sin DOM, sin red, sin almacenamiento.

import { normalizarCabecera, normalizar } from './texto.js';
import { parseFecha, parseFechaParcial, inferirOrden, pareceSerialExcel } from './fechas.js';
import { parseImporte, inferirDecimal, aCentimos } from './numeros.js';

/** Papeles posibles de una columna. 'otro' = título conocido que no usamos (cuenta para reconocer la fila de títulos). */
export const PAPELES = [
  'fecha', 'fecha_valor', 'concepto', 'concepto_extra', 'contraparte', 'importe', 'cargo', 'abono', 'saldo',
  'divisa', 'estado', 'comision', 'tipo', 'categoria', 'referencia', 'cuenta', 'signo', 'otro',
];

/** Papeles que pueden ocupar varias columnas (se guardan como lista de índices). */
export const PAPELES_MULTIPLES = new Set(['concepto', 'concepto_extra', 'contraparte', 'categoria', 'referencia']);

// Diccionario: papel → [título normalizado, prioridad]. A igual papel gana la prioridad más alta (y después la columna más a la izquierda).
// Los títulos se comparan ya pasados por normalizarCabecera: «IMPORTE (€)» → «IMPORTE EUR», «F. VALOR» → «F VALOR».
const ENTRADAS = {
  fecha: [
    ['FECHA OPERACION', 10], ['F OPERACION', 10], ['FECHA DE OPERACION', 10], ['FECHA DE LA OPERACION', 10], ['FECHA OPER', 10],
    ['F OPER', 10], ['FECHA OP', 9], ['F OP', 9], ['FEC OPERACION', 10], ['FECHA OPERATIVA', 10], ['F OPERATIVA', 10],
    ['DATA OPERACIO', 10], ['DATA D OPERACIO', 10], ['DATA DE L OPERACIO', 10], ['DATA DE OPERACIO', 10], ['DATA OPER', 10],
    ['TRANSACTION DATE', 10], ['STARTED DATE', 10], ['FECHA DE INICIO', 10], ['DATA D INICI', 10], ['FECHA TRANSACCION', 10],
    ['FECHA MOVIMIENTO', 9], ['FECHA DEL MOVIMIENTO', 9], ['FECHA MOV', 9], ['DATA MOVIMENT', 9], ['DATA DEL MOVIMENT', 9],
    ['FECHA', 8], ['DATA', 8], ['DATE', 8], ['BOOKING DATE', 8], ['FECHA CONTABLE', 7], ['F CONTABLE', 7], ['DATA COMPTABLE', 7],
    ['FECHA APUNTE', 7], ['POSTED DATE', 7], ['POSTING DATE', 6], ['DIA', 5],
  ],
  fecha_valor: [
    ['FECHA VALOR', 10], ['F VALOR', 10], ['FECHA DE VALOR', 10], ['FEC VALOR', 10], ['FVALOR', 10], ['F VAL', 9], ['DATA VALOR', 10],
    ['DATA DE VALOR', 10], ['VALUE DATE', 10], ['COMPLETED DATE', 10], ['FECHA DE FINALIZACION', 10], ['DATA DE FINALITZACIO', 10],
    ['INTEREST DATE', 10],
  ],
  concepto: [
    ['CONCEPTO', 10], ['CONCEPTE', 10], ['DESCRIPTION', 10], ['DESCRIPCION', 9], ['DESCRIPCIO', 9], ['CONCEPTO DEL MOVIMIENTO', 9],
    ['DESCRIPCION DEL MOVIMIENTO', 9], ['TRANSACTION DESCRIPTION', 9], ['NARRATIVE', 9], ['MOVIMIENTO', 8], ['MOVIMENT', 8],
    ['DETAILS', 8], ['TRANSACTION DETAILS', 8], ['OPERACION', 7], ['OPERACIO', 7], ['MEMO', 6], ['TEXTO', 6],
  ],
  concepto_extra: [
    ['MAS DATOS', 10], ['MES DADES', 10], ['OBSERVACIONES', 10], ['OBSERVACIONS', 10], ['COMENTARIO', 10], ['COMENTARIOS', 10],
    ['COMENTARI', 10], ['CONCEPTO AMPLIADO', 10], ['CONCEPTE AMPLIAT', 10], ['DETALLE', 10], ['DETALL', 10], ['PAYMENT REFERENCE', 10],
    ['INFORMACION ADICIONAL', 10], ['INFORMACIO ADDICIONAL', 10], ['DATOS ADICIONALES', 10], ['DADES ADDICIONALS', 10],
    ['CONCEPTO ADICIONAL', 10], ['CONCEPTE ADDICIONAL', 10],
  ],
  contraparte: [
    ['BENEFICIARIO', 10], ['BENEFICIARI', 10], ['ORDENANTE', 10], ['ORDENANT', 10], ['BENEFICIARIO ORDENANTE', 10],
    ['ORDENANTE BENEFICIARIO', 10], ['PAYEE', 10], ['PAYER', 10], ['COUNTERPARTY', 10], ['COUNTERPARTY NAME', 10], ['MERCHANT', 10],
    ['PAYER NAME', 10], ['PAYEE NAME', 10], ['PARTNER NAME', 10], ['COMERCIO', 10], ['COMERC', 10], ['ESTABLECIMIENTO', 10],
    ['ESTABLIMENT', 10], ['NAME', 8], ['NOMBRE', 7], ['NOM', 7],
  ],
  importe: [
    // con «Importe» (en la divisa original) e «Importe (EUR)» en el mismo archivo, gana el que dice EUR
    ['IMPORTE', 10], ['IMPORT', 10], ['AMOUNT', 10], ['IMPORTE EUR', 11], ['AMOUNT EUR', 11], ['IMPORT EUR', 11], ['IMPORTE EUROS', 11],
    ['IMPORTE EN EUROS', 11], ['IMPORT EN EUROS', 11], ['IMPORTE OPERACION', 9], ['IMPORTE MOVIMIENTO', 9], ['IMPORTE DEL MOVIMIENTO', 9],
    ['TRANSACTION AMOUNT', 9], ['MONTANTE', 8], ['CANTIDAD', 7], ['QUANTITAT', 7],
  ],
  cargo: [
    ['CARGO', 10], ['CARGOS', 10], ['DEBE', 10], ['CARREC', 10], ['CARRECS', 10], ['DEURE', 10], ['DEBIT', 10], ['DEBITS', 10],
    ['DEBIT AMOUNT', 10], ['PAID OUT', 10], ['MONEY OUT', 10], ['IMPORTE CARGO', 10], ['IMPORTE DEBE', 10], ['DEBITO', 9],
    ['GASTO', 8], ['GASTOS', 8], ['WITHDRAWAL', 8], ['WITHDRAWALS', 8], ['SALIDA', 7], ['SALIDAS', 7], ['REINTEGRO', 7], ['REINTEGROS', 7],
  ],
  abono: [
    ['ABONO', 10], ['ABONOS', 10], ['HABER', 10], ['ABONAMENT', 10], ['ABONAMENTS', 10], ['HAVER', 10], ['CREDIT', 10], ['CREDITS', 10],
    ['CREDIT AMOUNT', 10], ['PAID IN', 10], ['MONEY IN', 10], ['IMPORTE ABONO', 10], ['IMPORTE HABER', 10], ['CREDITO', 9],
    ['INGRESO', 8], ['INGRESOS', 8], ['DEPOSIT', 8], ['DEPOSITS', 8], ['ENTRADA', 7], ['ENTRADAS', 7],
  ],
  saldo: [
    ['SALDO', 10], ['SALDO EUR', 10], ['BALANCE', 10], ['RUNNING BALANCE', 10], ['BALANCE EUR', 10], ['SALDO DISPONIBLE', 9],
    ['SALDO CONTABLE', 9], ['SALDO TRAS LA OPERACION', 9], ['SALDO TRAS OPERACION', 9], ['SALDO RESULTANTE', 9],
    ['SALDO DESPUES', 8], ['DISPONIBLE', 7],
  ],
  divisa: [['DIVISA', 10], ['MONEDA', 10], ['CURRENCY', 10], ['MONEDA DIVISA', 10], ['DIVISA MOVIMIENTO', 9]],
  estado: [['STATE', 10], ['ESTADO', 10], ['ESTAT', 10], ['STATUS', 10]],
  comision: [['FEE', 10], ['FEES', 10], ['TOTAL FEES', 10], ['COMISION', 10], ['COMISIONES', 10], ['COMISSIO', 10], ['COMISSIONS', 10]],
  tipo: [
    ['TYPE', 10], ['TIPO', 10], ['TIPUS', 10], ['TRANSACTION TYPE', 10], ['TIPO DE MOVIMIENTO', 10], ['TIPO MOVIMIENTO', 10],
    ['TIPO DE OPERACION', 10], ['TIPO OPERACION', 10], ['TIPUS DE MOVIMENT', 10], ['TIPUS D OPERACIO', 10],
  ],
  categoria: [['CATEGORIA', 10], ['CATEGORY', 10], ['SUBCATEGORIA', 8], ['SUBCATEGORY', 8]],
  referencia: [
    ['REFERENCE', 10], ['REFERENCIA', 10], ['REFERENCIA 1', 10], ['REFERENCIA 2', 9], ['REFERENCIES', 10], ['TRANSFERWISE ID', 10],
    ['TRANSACTION ID', 10], ['ID', 8], ['N REFERENCIA', 10], ['NUM REFERENCIA', 10], ['NUMERO DE REFERENCIA', 10], ['N DOCUMENTO', 8],
  ],
  cuenta: [['ACCOUNT', 10], ['CUENTA', 10], ['COMPTE', 10], ['PRODUCT', 10], ['PRODUCTO', 9], ['ACCOUNT NAME', 10], ['IBAN', 8]],
  signo: [['D H', 10], ['DH', 10], ['SIGNO', 10], ['DEBE HABER', 10], ['CARGO ABONO', 10], ['DEURE HAVER', 10], ['SIGN', 8], ['D C', 8]],
  otro: [
    ['IMAGEN', 1], ['PARTNER IBAN', 1], ['ORIGINAL AMOUNT', 1], ['ORIGINAL CURRENCY', 1], ['EXCHANGE RATE', 1], ['EXCHANGE FROM', 1],
    ['EXCHANGE TO', 1], ['EXCHANGE TO AMOUNT', 1], ['CARD LAST FOUR DIGITS', 1], ['CARD HOLDER FULL NAME', 1], ['ATTACHMENT', 1],
    ['NOTE', 1], ['PAYEE ACCOUNT NUMBER', 1], ['ACCOUNT NUMBER', 1], ['AMOUNT FOREIGN CURRENCY', 1], ['TYPE FOREIGN CURRENCY', 1],
    ['OFICINA', 1], ['HORA', 1], ['TIME', 1], ['TARJETA', 1], ['CARD', 1], ['LOCALIDAD', 1], ['POBLACION', 1], ['CITY', 1],
    ['COUNTRY', 1], ['PAIS', 1], ['IBAN CONTRAPARTE', 1], ['COUNTERPARTY IBAN', 1], ['TIPO DE CAMBIO', 1], ['CAMBIO', 1],
  ],
};

const DICCIONARIO = new Map();
for (const [papel, lista] of Object.entries(ENTRADAS)) {
  for (const [titulo, prioridad] of lista) DICCIONARIO.set(titulo, { papel, prioridad });
}

// Divisas que pueden ir pegadas al título: «Amount (USD)» → «AMOUNT USD».
const DIVISAS_TITULO = new Set(['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'MXN', 'JPY', 'CNY', 'AUD', 'CAD']);
const PAPELES_CON_DIVISA = new Set(['importe', 'cargo', 'abono', 'saldo', 'comision']);

// Reglas por comienzo del título, para títulos largos o raros («Fecha de la transacción», «Importe en EUR»).
// Valen menos que el diccionario y solo para títulos de pocas palabras.
const PREFIJOS = [
  [/^(FECHA|F|FEC|DATA) ?(DE )?VALOR\b|^VALUE DATE\b/, 'fecha_valor'],
  [/^(FECHA|DATA|DATE)\b/, 'fecha'],
  [/^(IMPORTE|IMPORT|AMOUNT)\b/, 'importe'],
  [/^(SALDO|BALANCE)\b/, 'saldo'],
  [/^(CONCEPTO|CONCEPTE|DESCRIPCION|DESCRIPCIO|DESCRIPTION)\b/, 'concepto'],
  [/^(CARGO|DEBE|CARREC|DEBIT)\b/, 'cargo'],
  [/^(ABONO|HABER|ABONAMENT|CREDIT)\b/, 'abono'],
  [/^(DIVISA|MONEDA|CURRENCY)\b/, 'divisa'],
];
// Títulos que empiezan como una columna pero no lo son (fechas del documento, saldos sueltos).
// «Importe original», «Moneda original», «Divisa de origen»: los de la operación en otra moneda, no los de la cuenta.
const NO_ES_COLUMNA = /\b(EXPORTACION|EXPORTACIO|EXPORT|EMISION|EMISSIO|IMPRESION|IMPRESSIO|CONSULTA|GENERACION|DESCARGA|DESCARREGA|NACIMIENTO|NAIXEMENT|INICIAL|ANTERIOR|FINAL|MEDIO|MITJA|RETENIDO|RETINGUT|ORIGINALS?|ORIGEN)\b/;

/** Divisa que declara un título («IMPORTE EUR», «AMOUNT USD», «IMPORTE EN EUROS»), o null. */
function divisaDeTitulo(titulo) {
  const m = typeof titulo === 'string' ? titulo.match(/ (EUROS?|[A-Z]{3})$/) : null;
  if (!m) return null;
  if (m[1] === 'EURO' || m[1] === 'EUROS') return 'EUR';
  return DIVISAS_TITULO.has(m[1]) ? m[1] : null;
}

// Signos de una columna D/H: qué valores dicen cargo y cuáles abono.
export const SIGNOS_CARGO = new Set(['D', 'DEBE', 'CARGO', 'DEBITO', 'DR', 'DB', 'DEBIT', 'DEURE', 'CARREC', '-']);
export const SIGNOS_ABONO = new Set(['H', 'HABER', 'ABONO', 'CREDITO', 'CR', 'CREDIT', 'HAVER', 'ABONAMENT', '+']);

/** Título de una celda, normalizado para buscarlo en el diccionario. */
export function tituloNormalizado(celda) {
  if (celda === null || celda === undefined) return '';
  if (typeof celda !== 'string') return '';
  const s = celda.trim();
  if (/^[+-] ?\/ ?[+-]$/.test(s)) return 'SIGNO'; // «+/-»
  return normalizarCabecera(s);
}

/**
 * Papel de un título ya normalizado.
 * @param {string} titulo
 * @param {Object<string,string>} [extra] papeles propios de un banco que mandan sobre el diccionario
 * @returns {{papel: string, prioridad: number, divisa?: string}|null}
 */
export function papelDeTitulo(titulo, extra) {
  if (!titulo) return null;
  if (extra && extra[titulo]) return { papel: extra[titulo], prioridad: 20 };
  const exacto = DICCIONARIO.get(titulo);
  if (exacto) return { ...exacto };
  // divisa al final del título
  const md = titulo.match(/^(.+) ([A-Z]{3})$/);
  if (md && DIVISAS_TITULO.has(md[2])) {
    const base = (extra && extra[md[1]] && { papel: extra[md[1]], prioridad: 20 }) || DICCIONARIO.get(md[1]);
    if (base && PAPELES_CON_DIVISA.has(base.papel)) return { papel: base.papel, prioridad: base.prioridad, divisa: md[2] };
  }
  // por el comienzo, solo títulos cortos
  if (titulo.split(' ').length <= 5 && !NO_ES_COLUMNA.test(titulo)) {
    for (const [re, papel] of PREFIJOS) if (re.test(titulo)) return { papel, prioridad: 3 };
  }
  return null;
}

/**
 * Reparte papeles a las columnas de una fila de títulos.
 * @param {string[]} titulos títulos normalizados (uno por columna, '' si está vacía)
 * @param {Object<string,string>} [extra] papeles propios de un banco
 * @returns {{columnas: Object, coincidencias: Array<{col:number,papel:string,prioridad:number}>, divisa: string|null}}
 */
export function asignarColumnas(titulos, extra) {
  const coincidencias = [];
  for (let col = 0; col < titulos.length; col++) {
    const m = papelDeTitulo(titulos[col], extra);
    if (!m) continue;
    coincidencias.push({ col, papel: m.papel, prioridad: m.prioridad });
  }
  const columnas = {};
  // primero los papeles de una sola columna, por prioridad
  const unicos = coincidencias
    .filter((c) => !PAPELES_MULTIPLES.has(c.papel) && c.papel !== 'otro')
    .sort((a, b) => b.prioridad - a.prioridad || a.col - b.col);
  const sobranFechas = [];
  for (const c of unicos) {
    if (columnas[c.papel] === undefined) columnas[c.papel] = c.col;
    else if (c.papel === 'fecha') sobranFechas.push(c.col);
  }
  // una segunda fecha sin papel claro hace de fecha valor
  if (columnas.fecha_valor === undefined && sobranFechas.length) columnas.fecha_valor = Math.min(...sobranFechas);
  // si solo hay fecha valor (ING: «F. VALOR»), esa es la fecha
  if (columnas.fecha === undefined && columnas.fecha_valor !== undefined) {
    columnas.fecha = columnas.fecha_valor;
    delete columnas.fecha_valor;
  }
  for (const c of coincidencias) {
    if (!PAPELES_MULTIPLES.has(c.papel)) continue;
    (columnas[c.papel] ||= []).push(c.col);
  }
  // la divisa es la que diga el título de la columna de importe que se usa (no la de otra columna con «USD»)
  const elegida = columnas.importe ?? columnas.cargo ?? columnas.abono;
  const divisa = elegida !== undefined ? divisaDeTitulo(titulos[elegida]) : null;
  return { columnas, coincidencias, divisa };
}

/** ¿La celda parece un dato (fecha o importe) y no un título? */
function pareceDato(celda) {
  if (celda === null || celda === undefined) return false;
  if (typeof celda === 'number') return Number.isFinite(celda);
  if (typeof celda !== 'string') return false;
  const s = celda.trim();
  if (!s || !/\d/.test(s)) return false;
  return parseFecha(s) !== null || parseImporte(s) !== null;
}

/** ¿Hay alguna fecha en la columna en las filas que siguen a la de títulos (antes de otra fila de títulos)? */
function hayFechasDebajo(filas, indice, col, extra) {
  let miradas = 0;
  for (let i = indice + 1; i < filas.length && miradas < 15; i++) {
    const fila = filas[i];
    if (!fila || !fila.some((c) => c !== null && c !== undefined && String(c).trim() !== '')) continue;
    miradas++;
    if (esFechaCelda(fila[col])) return true;
    if (fila.length >= 2 && asignarColumnas(Array.from(fila, tituloNormalizado), extra).coincidencias.length >= 2) return false;
  }
  return false;
}

/** Serial de Excel de una fecha entre 1980 y 2099, contando desde 1900 o desde 1904 (aquí no se sabe cuál usa el libro). */
function serialDeFecha(n) {
  return pareceSerialExcel(n) || pareceSerialExcel(n, true);
}

/** ¿Esta celda es una fecha (texto, «AAAA-MM-DD» de una hoja o número de serie de Excel)? */
export function esFechaCelda(v, orden) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return serialDeFecha(v) || (Number.isInteger(v) && v >= 19800101 && v <= 20991231 && parseFechaParcial(String(v), { compacta: true }) !== null); // serial, o 20260105
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s) return false;
  if (/^\d{5}(\.\d+)?$/.test(s)) return serialDeFecha(Number(s));
  return parseFechaParcial(s, { orden, compacta: true }) !== null;
}

function celdaVacia(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

/**
 * Títulos en dos filas: «Importe» arriba y «Debe | Haber» justo debajo. Si la fila de debajo solo tiene títulos
 * y entre ellos hay un cargo y un abono, se juntan las dos (manda la de abajo) y la tabla empieza después.
 */
function subTitulos(filas, i, titulos, extra) {
  let j = i + 1;
  while (j < filas.length && j <= i + 2 && (!filas[j] || filas[j].every(celdaVacia))) j++;
  const fila = filas[j];
  if (!fila || j > i + 2) return null;
  const abajo = Array.from(fila, tituloNormalizado);
  let cargo = false, abono = false;
  for (let c = 0; c < fila.length; c++) {
    if (celdaVacia(fila[c])) continue;
    const p = papelDeTitulo(abajo[c], extra);
    if (!p) return null; // algo que no es un título: no es una segunda fila de títulos
    if (p.papel === 'cargo') cargo = true;
    if (p.papel === 'abono') abono = true;
  }
  if (!cargo || !abono) return null;
  const unidos = [];
  for (let c = 0; c < Math.max(titulos.length, abajo.length); c++) unidos.push(abajo[c] || titulos[c] || '');
  const asig = asignarColumnas(unidos, extra);
  if (asig.columnas.fecha === undefined) return null;
  return { indice: j, titulos: unidos, asig };
}

/**
 * Busca la fila de títulos: la primera de las 40 primeras con al menos 2 títulos conocidos.
 * Se descartan las filas «clave: valor» del principio (más de un dato en la fila) y, si hay varias candidatas,
 * se prefiere la que tiene fecha e importe y debajo fechas de verdad. Si los títulos ocupan dos filas
 * («Importe» con «Debe» y «Haber» debajo), indice es la segunda.
 * @param {Array<Array<string|number|null>>} filas
 * @param {{papeles?: Object<string,string>, maxFilas?: number}} [opciones]
 * @returns {null|{indice: number, columnas: Object, titulos: string[], coincidencias: number, divisa: string|null}}
 */
export function detectarCabecera(filas, opciones = {}) {
  const limite = Math.min(filas.length, opciones.maxFilas ?? 40);
  let primeraSaldo = null, primeraFuerte = null, primeraDebil = null;
  for (let i = 0; i < limite; i++) {
    const fila = filas[i];
    if (!fila || fila.length < 2) continue;
    let titulos = Array.from(fila, tituloNormalizado);
    let asig = asignarColumnas(titulos, opciones.papeles);
    if (asig.coincidencias.length < 2) continue;
    let datos = 0;
    for (const celda of fila) if (pareceDato(celda)) datos++;
    if (datos > 1) continue;
    let indice = i;
    const sub = subTitulos(filas, i, titulos, opciones.papeles);
    if (sub) ({ indice, titulos, asig } = sub);
    const c = asig.columnas;
    const res = { indice, columnas: c, titulos, coincidencias: asig.coincidencias.length, divisa: asig.divisa };
    const tieneFecha = c.fecha !== undefined;
    const tieneImporte = c.importe !== undefined || c.cargo !== undefined || c.abono !== undefined;
    const tieneSaldo = c.saldo !== undefined;
    if (tieneFecha && (tieneImporte || tieneSaldo)) {
      const debajo = hayFechasDebajo(filas, indice, c.fecha, opciones.papeles);
      if (debajo && tieneImporte) return res;
      if (debajo) primeraSaldo ??= res; // fecha y saldo sin importe: puede ser un resumen encima de la tabla buena
      else primeraFuerte ??= res;
    } else if (tieneFecha || tieneImporte || tieneSaldo) primeraDebil ??= res;
  }
  return primeraSaldo ?? primeraFuerte ?? primeraDebil;
}

// ——— Deducción sin títulos ———

function vacia(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** Valores no vacíos de una columna en unas filas. */
function valoresColumna(filas, indices, col) {
  const out = [];
  for (const i of indices) {
    const v = filas[i]?.[col];
    if (!vacia(v)) out.push(v);
  }
  return out;
}

/**
 * Proporción de filas consecutivas en que saldo[n] = saldo[n−1] + importe[n] (en un orden u otro).
 * utiles: pares que encadenan con un importe distinto de 0 (con importe 0 «encadena» cualquier cosa);
 * centimos: de esos, los que llevan céntimos (una coincidencia con céntimos no sale por casualidad).
 */
export function proporcionCadena(importes, saldos) {
  return cadena(enCentimos(importes), enCentimos(saldos), false);
}

/** Números (o null) → céntimos enteros en un Float64Array, con NaN donde no hay número. */
function enCentimos(nums) {
  const out = new Float64Array(nums.length);
  for (let i = 0; i < nums.length; i++) out[i] = nums[i] === null || nums[i] === undefined ? NaN : aCentimos(nums[i]);
  return out;
}

/**
 * Lo mismo que proporcionCadena, con los céntimos ya calculados. Con corte, deja de mirar una pareja de columnas
 * que en sus primeros 50 o 200 pares casi no encadena (así probar muchas parejas no cuesta filas × parejas).
 * saltos[i]: entre la fila i y la anterior se ha quitado alguna (no se comparan entre sí).
 */
function cadena(ci, cs, corte, saltos = null) {
  let asc = 0, desc = 0, pares = 0, utilAsc = 0, utilDesc = 0, centAsc = 0, centDesc = 0;
  let prev = -1;
  for (let i = 0; i < ci.length; i++) {
    if (saltos && saltos[i]) prev = -1; // entre esta fila y la anterior hay una que no se mira: no se comparan
    if (Number.isNaN(ci[i]) || Number.isNaN(cs[i])) continue;
    if (prev >= 0) {
      pares++;
      const a = cs[prev], b = cs[i], imp = ci[i], ant = ci[prev];
      if (b === a + imp) { asc++; if (imp !== 0) { utilAsc++; if (imp % 100 !== 0) centAsc++; } }
      if (a === b + ant) { desc++; if (ant !== 0) { utilDesc++; if (ant % 100 !== 0) centDesc++; } }
      if (corte && (pares === 50 || pares === 200) && Math.max(asc, desc) < pares * 0.2) {
        return { proporcion: Math.max(asc, desc) / pares, pares, orden: null, utiles: 0, centimos: 0 };
      }
    }
    prev = i;
  }
  if (pares === 0) return { proporcion: 0, pares: 0, orden: null, utiles: 0, centimos: 0 };
  return asc >= desc
    ? { proporcion: asc / pares, pares, orden: 'ascendente', utiles: utilAsc, centimos: centAsc }
    : { proporcion: desc / pares, pares, orden: 'descendente', utiles: utilDesc, centimos: centDesc };
}

/** ¿Encadena de verdad? El 90 % de los pares y al menos 2 con importe; con un solo par, solo si lleva céntimos. */
function encadena(r) {
  return r.proporcion >= 0.9 && (r.utiles >= 2 || (r.pares === 1 && r.centimos === 1));
}

// Límites de la deducción sin títulos: con una muestra basta y así el coste no crece sin control.
const MUESTRA_INFERIR = 2000;   // filas que se miran
const MAX_NUMERICAS = 40;       // más columnas de números que esto no es un extracto que se pueda deducir
const MAX_TRIOS = 12;           // cargo, abono y saldo se buscan entre tres columnas solo si hay pocas
const PRONTO = 200;             // valores que se miran antes de descartar una columna que no llegará al 80 %

/**
 * Deduce las columnas de una tabla sin títulos (o completa las que falten).
 * - fecha: más del 80 % de fechas válidas (la primera es fecha y la segunda fecha valor);
 * - números: más del 80 % de importes válidos; el saldo es el que encadena con el importe;
 * - concepto: el texto más largo y variado.
 * Si no se puede decidir con seguridad devuelve null.
 * @param {Array<Array<string|number|null>>} filas
 * @param {{desde?: number, conocidas?: Object, maxFilas?: number, soloAnchoComun?: boolean}} [opciones]
 *   conocidas: columnas ya sabidas por los títulos; soloAnchoComun: deducir solo con las filas del ancho más repetido (CSV)
 * @returns {null|{columnas: Object, filas_datos: number}}
 */
export function inferirColumnas(filas, opciones = {}) {
  const desde = opciones.desde ?? 0;
  const conocidas = opciones.conocidas ?? {};
  const hasta = Math.min(filas.length, desde + (opciones.maxFilas ?? MUESTRA_INFERIR));
  const usadas = new Set();
  for (const v of Object.values(conocidas)) for (const n of [].concat(v)) if (Number.isInteger(n)) usadas.add(n);

  let ancho = 0;
  const indices = [];
  for (let i = desde; i < hasta; i++) {
    const f = filas[i];
    if (!f) continue;
    // las filas de una sola celda son títulos o notas: no cuentan para decidir columnas
    let llenas = 0;
    for (const v of f) if (!vacia(v) && ++llenas >= 2) break;
    if (llenas < 2) continue;
    indices.push(i);
    if (f.length > ancho) ancho = Math.min(f.length, 200);
  }
  if (!indices.length) return null;
  const quitadas = [];
  if (opciones.soloAnchoComun) {
    // ancho útil (sin las celdas vacías del final) más repetido; si es de casi todas, solo esas filas deciden
    const util = (f) => { let n = f.length; while (n > 0 && vacia(f[n - 1])) n--; return n; };
    const veces = new Map();
    for (const i of indices) { const w = util(filas[i]); veces.set(w, (veces.get(w) ?? 0) + 1); }
    let comun = 0, max = 0;
    for (const [w, k] of veces) if (k > max || (k === max && w < comun)) { comun = w; max = k; }
    if (max >= indices.length * 0.6 && max < indices.length) {
      const quedan = [];
      for (const i of indices) (util(filas[i]) === comun ? quedan : quitadas).push(i);
      indices.length = 0;
      for (const i of quedan) indices.push(i);
    }
  }

  // 1. Columnas de fecha
  const columnas = { ...conocidas };
  if (columnas.fecha === undefined) {
    const deFecha = [];
    for (let col = 0; col < ancho; col++) {
      if (usadas.has(col)) continue;
      const vals = valoresColumna(filas, indices, col);
      if (vals.length < Math.max(1, indices.length * 0.3)) continue;
      const textos = vals.filter((v) => typeof v === 'string');
      const orden = inferirOrden(textos);
      let ok = 0, seriales = 0, vistos = 0;
      for (const v of vals) {
        if (++vistos === PRONTO && ok + seriales < PRONTO / 2) break; // no llegará al 80 %
        if (typeof v === 'number') { if (Number.isInteger(v) && serialDeFecha(v)) seriales++; continue; }
        if (parseFecha(v.trim(), { orden }) !== null) ok++;
      }
      // fechas escritas como texto, también mezcladas con números de serie de Excel (celdas sin formato de fecha)
      if (ok > 0 && (ok + seriales) / vals.length > 0.8) deFecha.push({ col, serial: false });
      else if (seriales === vals.length && vals.length >= 2) deFecha.push({ col, serial: true });
    }
    const texto = deFecha.filter((d) => !d.serial);
    const elegidas = texto.length ? texto : deFecha;
    if (!elegidas.length) return null;
    columnas.fecha = elegidas[0].col;
    usadas.add(elegidas[0].col);
    if (columnas.fecha_valor === undefined && elegidas[1]) { columnas.fecha_valor = elegidas[1].col; usadas.add(elegidas[1].col); }
  }

  // filas con fecha
  const colFecha = columnas.fecha;
  const ordenFecha = inferirOrden(valoresColumna(filas, indices, colFecha).filter((v) => typeof v === 'string'));
  const datos = indices.filter((i) => esFechaCelda(filas[i][colFecha], ordenFecha));
  if (!datos.length) return null;
  // el saldo no se compara a través de una fila quitada (se la saltaría y la cuenta no saldría)
  let saltos = null;
  if (quitadas.length) {
    saltos = new Uint8Array(datos.length);
    let q = 0;
    for (let k = 1; k < datos.length; k++) {
      while (q < quitadas.length && quitadas[q] < datos[k - 1]) q++;
      if (q < quitadas.length && quitadas[q] < datos[k]) saltos[k] = 1;
    }
  }

  // 2. Columnas de números
  const yaDinero = ['importe', 'cargo', 'abono'].some((k) => columnas[k] !== undefined);
  const numericas = [];
  for (let col = 0; col < ancho; col++) {
    if (usadas.has(col)) continue;
    const vals = valoresColumna(filas, datos, col);
    if (!vals.length) continue;
    const decimal = inferirDecimal(vals.length > 500 ? vals.slice(0, 500) : vals);
    // una sola lectura por columna; la que no llega a la mitad en los primeros valores se deja pronto
    let ok = 0, id = 0, vistos = 0, descartada = false;
    const nums = new Array(datos.length).fill(null);
    for (let k = 0; k < datos.length; k++) {
      const v = filas[datos[k]][col];
      if (vacia(v)) continue;
      if (++vistos === PRONTO && ok < PRONTO / 2) { descartada = true; break; }
      if (typeof v === 'string' && /^\d{6,}$/.test(v.trim())) id++; // referencias o números de tarjeta, no importes
      const n = parseImporte(v, { decimal });
      nums[k] = n;
      if (n !== null) ok++;
    }
    if (descartada || ok / vals.length <= 0.8 || id / vals.length > 0.5) continue;
    numericas.push({ col, nums, cent: enCentimos(nums), llenas: vals.length });
  }
  if (numericas.length > MAX_NUMERICAS) return null;

  if (!yaDinero) {
    const dinero = decidirImporteYSaldo(numericas, columnas.saldo !== undefined ? leerNumeros(filas, datos, columnas.saldo) : null, saltos);
    if (!dinero) return null;
    Object.assign(columnas, dinero);
    for (const k of ['importe', 'cargo', 'abono', 'saldo']) if (columnas[k] !== undefined) usadas.add(columnas[k]);
  } else if (columnas.saldo === undefined) {
    // hay importe por los títulos y falta el saldo: solo si encadena sin dudas
    const imp = importesDe(filas, datos, columnas);
    const ci = enCentimos(imp);
    const cand = numericas.filter((n) => !usadas.has(n.col)).filter((n) => encadena(cadena(ci, n.cent, true, saltos)));
    if (cand.length === 1) { columnas.saldo = cand[0].col; usadas.add(cand[0].col); }
  }

  // 3. Concepto: el texto más largo y variado
  const tieneConcepto = ['concepto', 'concepto_extra', 'contraparte'].some((k) => columnas[k] !== undefined && [].concat(columnas[k]).length);
  if (!tieneConcepto) {
    let mejor = null;
    const deNumeros = new Set(numericas.map((n) => n.col));
    for (let col = 0; col < ancho; col++) {
      if (usadas.has(col) || deNumeros.has(col)) continue;
      const vals = valoresColumna(filas, datos, col).filter((v) => typeof v === 'string' && !esFechaCelda(v));
      if (vals.length < datos.length * 0.5) continue;
      let largo = 0;
      const distintos = new Set();
      for (const v of vals) { largo += v.trim().length; if (distintos.size < 5000) distintos.add(normalizar(v)); }
      const medio = largo / vals.length;
      if (medio < 3) continue;
      const puntos = medio * (distintos.size / vals.length);
      if (!mejor || puntos > mejor.puntos) mejor = { col, puntos };
    }
    columnas.concepto = mejor ? [mejor.col] : [];
  }
  return { columnas, filas_datos: datos.length };
}

function leerNumeros(filas, datos, col) {
  const vals = datos.map((i) => filas[i][col]);
  const decimal = inferirDecimal(vals.filter((v) => typeof v === 'string'));
  return vals.map((v) => (vacia(v) ? null : parseImporte(v, { decimal })));
}

function importesDe(filas, datos, columnas) {
  if (columnas.importe !== undefined) return leerNumeros(filas, datos, columnas.importe);
  const c = columnas.cargo !== undefined ? leerNumeros(filas, datos, columnas.cargo) : datos.map(() => null);
  const a = columnas.abono !== undefined ? leerNumeros(filas, datos, columnas.abono) : datos.map(() => null);
  return datos.map((_, k) => (c[k] === null && a[k] === null ? null : (a[k] ?? 0) - Math.abs(c[k] ?? 0)));
}

/** ¿En cada fila hay valor en una sola de las dos columnas? (columnas Cargo y Abono) */
function complementarias(a, b) {
  let filas = 0;
  for (let k = 0; k < a.nums.length; k++) {
    const x = a.nums[k] !== null && a.nums[k] !== 0, y = b.nums[k] !== null && b.nums[k] !== 0;
    if (x && y) return false;
    if (x || y) filas++;
  }
  return filas > 0;
}

/** Entre las columnas de números, cuál es el importe (o cargo y abono) y cuál el saldo. null si hay dudas. */
function decidirImporteYSaldo(numericas, saldoConocido, saltos = null) {
  const bueno = (ci, cs) => encadena(cadena(ci, cs, true, saltos));
  if (saldoConocido) {
    const cs = enCentimos(saldoConocido);
    const cand = numericas.filter((n) => bueno(n.cent, cs));
    return cand.length === 1 ? { importe: cand[0].col } : null;
  }
  if (!numericas.length) return null;
  if (numericas.length === 1) {
    // una sola columna: es el importe si trae signos; si todo es positivo podría ser un saldo
    return numericas[0].nums.some((n) => n !== null && n < 0) ? { importe: numericas[0].col } : null;
  }
  const opciones = [];
  for (const imp of numericas) {
    for (const sal of numericas) {
      if (imp === sal) continue;
      if (bueno(imp.cent, sal.cent)) opciones.push({ importe: imp.col, saldo: sal.col });
    }
  }
  // cargo y abono en columnas separadas (solo con pocas columnas de números: con muchas, los tríos se disparan)
  for (const c of numericas.length <= MAX_TRIOS ? numericas : []) {
    for (const a of numericas) {
      if (c === a) continue;
      if (!complementarias(c, a)) continue;
      const imp = enCentimos(c.nums.map((x, k) => (x === null && a.nums[k] === null ? null : (a.nums[k] ?? 0) - Math.abs(x ?? 0))));
      for (const sal of numericas) {
        if (sal === c || sal === a) continue;
        if (bueno(imp, sal.cent)) opciones.push({ cargo: c.col, abono: a.col, saldo: sal.col });
      }
    }
  }
  if (opciones.length === 1) return opciones[0];
  if (opciones.length > 1) return null;
  // sin saldo que encadene: dos columnas complementarias con signos claros (cargos en negativo, abonos en positivo)
  if (numericas.length === 2 && complementarias(numericas[0], numericas[1])) {
    const [x, y] = numericas;
    const signo = (n) => {
      const v = n.nums.filter((k) => k !== null && k !== 0);
      if (v.every((k) => k < 0)) return -1;
      if (v.every((k) => k > 0)) return 1;
      return 0;
    };
    if (signo(x) === -1 && signo(y) === 1) return { cargo: x.col, abono: y.col };
    if (signo(y) === -1 && signo(x) === 1) return { cargo: y.col, abono: x.col };
  }
  // sin saldo: una sola columna con signos y las demás números enteros (referencias, contadores), nunca dinero
  const conSigno = numericas.filter((n) => n.nums.some((k) => k !== null && k < 0));
  const enteras = (n) => n.nums.every((k) => k === null || Number.isInteger(k));
  if (conSigno.length === 1 && numericas.every((n) => n === conSigno[0] || enteras(n))) return { importe: conSigno[0].col };
  return null;
}
