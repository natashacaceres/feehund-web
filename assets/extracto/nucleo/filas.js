// Trozos de texto con posición → movimientos. Sirve para PDF con texto (nivel B), texto pegado (B)
// y fotos o páginas escaneadas leídas con OCR (nivel C).
// Lógica pura: sin DOM, sin red, sin almacenamiento. Funciona igual en Node y en el worker.
//
// reconstruir(paginas, ctx) → { movimientos, saldo_inicial, saldo_final, fecha_inicial, fecha_final, avisos, necesita_mapeo, extra }
//   paginas: [{ numero, ancho, alto, tokens: [{ texto, x0, x1, y0, y1, confianza?, linea? }], nivel? }]  (y crece hacia abajo)
//   ctx: { archivo, idArchivo, nivel: 'B'|'C', hoy: 'AAAA-MM-DD', mapeo?, primerN? }
//
// Regla de oro: una cifra que no está clara sale marcada como dudosa. Nunca se inventa un importe ni un signo.

import { parseImporte, pareceImporte, inferirDecimal, aCentimos } from './numeros.js';
import { parseFechaParcial, completarAnio, fechaValida, aISO, diasEntre, inferirOrden, hoyISO } from './fechas.js';
import { normalizar } from './texto.js';
import { crearMovimiento, aviso } from './modelo.js';

// ───────────────────────── diccionarios ─────────────────────────

const MESES = new Set(('ENE ENERO GEN GENER JAN JANUARY FEB FEBRERO FEBRER FEBRUARY MAR MARZO MARC MARCH ABR ABRIL APR APRIL ' +
  'MAY MAYO MAI MAIG JUN JUNIO JUNY JUNE JUL JULIO JULIOL JULY AGO AGOSTO AGOST AUG AUGUST SEP SEPT SET SEPTIEMBRE SETIEMBRE ' +
  'SETEMBRE SEPTEMBER OCT OCTUBRE OCTOBER NOV NOVIEMBRE NOVEMBRE NOVEMBER DIC DICIEMBRE DES DESEMBRE DEC DECEMBER').split(' '));
const MES_NUMERO = {
  ENERO: 1, GENER: 1, JANUARY: 1, FEBRERO: 2, FEBRER: 2, FEBRUARY: 2, MARZO: 3, MARC: 3, MARCH: 3, ABRIL: 4, APRIL: 4,
  MAYO: 5, MAIG: 5, MAY: 5, JUNIO: 6, JUNY: 6, JUNE: 6, JULIO: 7, JULIOL: 7, JULY: 7, AGOSTO: 8, AGOST: 8, AUGUST: 8,
  SEPTIEMBRE: 9, SETIEMBRE: 9, SETEMBRE: 9, SEPTEMBER: 9, OCTUBRE: 10, OCTOBER: 10, NOVIEMBRE: 11, NOVEMBRE: 11, NOVEMBER: 11,
  DICIEMBRE: 12, DESEMBRE: 12, DECEMBER: 12,
};
const DIAS_SEMANA = new Set(('LUNES MARTES MIERCOLES JUEVES VIERNES SABADO DOMINGO DILLUNS DIMARTS DIMECRES DIJOUS DIVENDRES ' +
  'DISSABTE DIUMENGE MONDAY TUESDAY WEDNESDAY THURSDAY FRIDAY SATURDAY SUNDAY').split(' '));
const RELATIVAS = new Set(['HOY', 'AYER', 'AVUI', 'AHIR', 'TODAY', 'YESTERDAY']);
const DIVISAS = new Set('EUR USD GBP CHF SEK NOK DKK PLN CZK HUF RON BGN MXN ARS COP CLP BRL JPY CNY AUD CAD'.split(' '));
const SIMBOLOS_DIVISA = { '€': 'EUR', '$': 'USD', '£': 'GBP' };
// Marcadores de signo junto al importe: D(ebe), H(aber), DR/DB (debit), CR (credit)
const MARCAS = { D: -1, DR: -1, DB: -1, H: 1, CR: 1 };

// Títulos de columna (normalizados, sin signos) → papel de la columna
const TITULOS = new Map();
function titulos(rol, frases) { for (const f of frases.split('|')) TITULOS.set(f, rol); }
titulos('fecha', 'FECHA|FECHAS|FECHA OPERACION|F OPERACION|FECHA OPER|F OPER|FEC OPER|F OP|FECHA OP|FECHA CONTABLE|F CONTABLE|' +
  'FECHA MOVIMIENTO|F MOVIMIENTO|DATA|DATA OPERACIO|DATA OPERACION|DATA COMPTABLE|DATE|BOOKING DATE|TRANSACTION DATE|' +
  'POSTING DATE|COMPLETED DATE|STARTED DATE|DIA');
titulos('fecha_valor', 'FECHA VALOR|F VALOR|F VAL|FECHA VAL|VALOR|DATA VALOR|VALUE DATE');
titulos('concepto', 'CONCEPTO|CONCEPTOS|DESCRIPCION|CONCEPTE|DESCRIPCIO|DESCRIPTION|DETALLE|DETALLES|DETAILS|PARTICULARS|' +
  'MOVIMIENTO|MOVIMIENTOS|MOVIMENT|OPERACION|OPERACIONES|TRANSACCION|TRANSACTION|COMERCIO|BENEFICIARIO|MERCHANT|PAYEE|TEXTO|' +
  'INFORMACION|DESCRIPCION DEL MOVIMIENTO|CONCEPTO DEL MOVIMIENTO');
titulos('importe', 'IMPORTE|IMPORTES|IMPORT|AMOUNT|CANTIDAD|MONTO|IMPORTE EUR|IMPORT EUR|AMOUNT EUR|IMPORTE EN EUROS|IMPORTE OPERACION');
titulos('cargo', 'CARGO|CARGOS|DEBE|DEBITO|DEBITOS|DEBIT|DEBITS|RETIRADAS|RETIRADA|CARREC|CARRECS|DEURE|PAID OUT|MONEY OUT|' +
  'WITHDRAWALS|WITHDRAWAL|SALIDA|SALIDAS|SALIDA DE DINERO|DINERO SALIENTE|PAGOS');
titulos('abono', 'ABONO|ABONOS|HABER|CREDITO|CREDITOS|CREDIT|CREDITS|INGRESOS|INGRESO|ABONAMENT|ABONAMENTS|HAVER|PAID IN|' +
  'MONEY IN|DEPOSITS|DEPOSIT|ENTRADA|ENTRADAS|ENTRADA DE DINERO|DINERO ENTRANTE');
titulos('saldo', 'SALDO|SALDOS|BALANCE|DISPONIBLE|SALDO EUR|SALDO CONTABLE|SALDO DISPONIBLE');
titulos('otro', 'REFERENCIA|REF|OFICINA|DIVISA|MONEDA|CURRENCY|N|NUM|NUMERO|DOCUMENTO|CATEGORIA|CATEGORY|OBSERVACIONES|' +
  'MAS DATOS|TARJETA|ESTADO|STATE|TIPO|TYPE|CODIGO|ORDENANTE|REMITENTE|EUR');
// Palabras que completan un título partido en dos líneas («Fecha» / «valor»)
const COMPLEMENTOS_TITULO = new Set(['OPERACION', 'OPER', 'VALOR', 'CONTABLE', 'EUR', 'EUROS', 'MOVIMIENTO', 'DISPONIBLE', 'OPERACIO',
  'VALUE', 'DATE', 'DE', 'DEL', 'DINERO', 'ENTRANTE', 'SALIENTE', 'OUT', 'IN']);
const ROLES_IMPORTE = new Set(['importe', 'cargo', 'abono', 'saldo']);
const MAX_PALABRAS_TITULO = 4;

// Etiquetas de saldo y de totales. «resumen» nunca es un movimiento ni un saldo declarado.
const FRASES_SALDO = [
  ['SALDO A CUENTA NUEVA', 'resumen'], ['A CUENTA NUEVA', 'resumen'], ['SUMA Y SIGUE', 'resumen'], ['SUMA ANTERIOR', 'resumen'],
  ['BALANCE CARRIED FORWARD', 'resumen'], ['CARRIED FORWARD', 'resumen'],
  ['BALANCE BROUGHT FORWARD', 'inicial'], ['BROUGHT FORWARD', 'inicial'],
  ['SALDO ANTERIOR', 'inicial'], ['SALDO INICIAL', 'inicial'], ['SALDO DE APERTURA', 'inicial'], ['SALDO APERTURA', 'inicial'],
  ['OPENING BALANCE', 'inicial'], ['STARTING BALANCE', 'inicial'], ['START BALANCE', 'inicial'], ['PREVIOUS BALANCE', 'inicial'],
  ['SALDO FINAL', 'final'], ['SALDO AL CIERRE', 'final'], ['SALDO DE CIERRE', 'final'], ['SALDO CIERRE', 'final'],
  ['NUEVO SALDO', 'final'], ['SALDO NUEVO', 'final'], ['CLOSING BALANCE', 'final'], ['ENDING BALANCE', 'final'],
  ['END BALANCE', 'final'], ['FINAL BALANCE', 'final'],
  ['SALDO DISPONIBLE', 'ignorar'], ['SALDO RETENIDO', 'ignorar'], ['SALDO MEDIO', 'ignorar'], ['SALDO CONTABLE', 'ignorar'],
  ['SALDO PENDIENTE', 'ignorar'], ['SALDO AUTORIZADO', 'ignorar'], ['SALDO ACTUAL', 'ignorar'], ['SALDO EN CUENTA', 'ignorar'],
  ['SALDO DEUDOR', 'ignorar'], ['SALDO ACREEDOR', 'ignorar'], ['SALDO MINIMO', 'ignorar'], ['SALDO MAXIMO', 'ignorar'],
  ['AVAILABLE BALANCE', 'ignorar'], ['CURRENT BALANCE', 'ignorar'],
  ['SALDO A FECHA', 'a_fecha'], ['SALDO A DIA', 'a_fecha'], ['SALDO EN FECHA', 'a_fecha'], ['SALDO A DATA', 'a_fecha'],
  ['SALDO FECHA', 'a_fecha'], ['SALDO AL', 'a_fecha'], ['SALDO A', 'a_fecha'], ['BALANCE AS OF', 'a_fecha'],
  ['BALANCE AS AT', 'a_fecha'], ['BALANCE ON', 'a_fecha'], ['BALANCE AT', 'a_fecha'],
  ['TOTAL CARGOS', 'resumen'], ['TOTAL ABONOS', 'resumen'], ['TOTAL DEBE', 'resumen'], ['TOTAL HABER', 'resumen'],
  ['TOTAL MOVIMIENTOS', 'resumen'], ['TOTAL OPERACIONES', 'resumen'], ['NUMERO DE MOVIMIENTOS', 'resumen'],
  ['N DE MOVIMIENTOS', 'resumen'], ['TOTALES', 'resumen'], ['TOTAL', 'resumen'], ['SUMAS', 'resumen'], ['SUMA', 'resumen'],
  ['SUBTOTAL', 'resumen'], ['SALDO', 'resumen'],
].map(([f, tipo]) => ({ palabras: f.split(' '), tipo, debil: f === 'SALDO' }))
  .sort((a, b) => b.palabras.length - a.palabras.length);
const PRIMERAS_SALDO = new Set(FRASES_SALDO.map((f) => f.palabras[0]));
// Una línea de totales solo tiene estas palabras (para no confundir «TOTAL ENERGIES» con un total)
const RE_SOLO_RESUMEN = /^(?:TOTAL(?:ES)?|SUMAS?|SUBTOTAL|SUMA Y SIGUE|SUMA ANTERIOR|SALDO|SALDO A CUENTA NUEVA|A CUENTA NUEVA|(?:BALANCE )?CARRIED FORWARD)(?: (?:CARGOS|ABONOS|DEBE|HABER|MOVIMIENTOS|OPERACIONES|APUNTES|DEL|DE|LA|EL|PERIODO|MES|DIA|PAGINA|EUR|EUROS|NUMERO|N))*$/;

const RE_PAGINA = /^(?:(?:PAGINA|PAG|PAGE|HOJA|FULL|FOLIO|P)\.?\s*:?\s*)?\d{1,4}\s*(?:(?:DE|\/|OF|-)\s*\d{1,4})?$|^-\s*\d{1,4}\s*-$/;
const RE_FECHA_PEGADA = /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})(?=[A-Za-zÀ-ÿ])/;
const RE_HORA = /^\d{1,2}:\d{2}(?::\d{2})?$/;
const RE_LETRA = /[A-Za-zÀ-ÿ]/;
const MAX_PALABRAS_FECHA = 6;
const MAX_PALABRAS_IMPORTE = 4;

// ───────────────────────── utilidades ─────────────────────────

function mediana(valores) {
  const v = valores.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function normPalabra(t) {
  return normalizar(t).replace(/^[^A-Z0-9'€$£]+|[^A-Z0-9'€$£]+$/g, '');
}

function confianzaDe(c) {
  if (c === null || c === undefined || c === '' || !Number.isFinite(+c)) return null;
  let v = +c;
  if (v > 1) v /= 100; // Tesseract da 0..100
  return Math.max(0, Math.min(1, v));
}

function unirTexto(P, i, j) {
  let s = P[i].t;
  for (let k = i + 1; k <= j; k++) s += ' ' + P[k].t;
  return s;
}

function confMin(P, i, j) {
  let c = null;
  for (let k = i; k <= j; k++) if (P[k].c !== null) c = c === null ? P[k].c : Math.min(c, P[k].c);
  return c;
}

/**
 * Parte un trozo con varias palabras («02/03/2026 NETFLIX.COM») en palabras,
 * con la x estimada en proporción a los caracteres.
 */
export function palabrasDeTrozo(texto, x0, x1, y0, y1) {
  const s = String(texto ?? '');
  const out = [];
  if (!s.trim()) return out;
  const ancho = (x1 - x0) / s.length;
  const re = /\S+/g;
  let m;
  while ((m = re.exec(s))) {
    let palabra = m[0];
    let ini = m.index;
    let corte = false;
    const f = palabra.match(RE_FECHA_PEGADA);
    if (f && f[1].length < palabra.length) {
      out.push({ texto: f[1], x0: x0 + ini * ancho, x1: x0 + (ini + f[1].length) * ancho, y0, y1 });
      ini += f[1].length;
      palabra = palabra.slice(f[1].length);
      corte = true;
    }
    out.push({ texto: palabra, x0: x0 + ini * ancho, x1: x0 + (ini + palabra.length) * ancho, y0, y1, corte });
  }
  return out;
}

// ───────────────────────── 1. palabras y líneas ─────────────────────────

function nuevaPalabra(t, x0, x1, y0, y1, c, linea, corte) {
  return { t, n: normPalabra(t), x0, x1, y0, y1, c, linea: linea ?? null, corte: !!corte, yc: (y0 + y1) / 2 };
}

function prepararPalabras(tokens) {
  const out = [];
  for (const tok of tokens || []) {
    if (!tok || typeof tok.texto !== 'string') continue;
    let x0 = +tok.x0, x1 = +tok.x1, y0 = +tok.y0, y1 = +tok.y1;
    if (![x0, x1, y0, y1].every(Number.isFinite)) continue;
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    const s = tok.texto.replace(/[\u00A0\u2007\u202F\u2009\u200A]/g, ' ');
    if (!s.trim()) continue;
    const c = confianzaDe(tok.confianza);
    if (/\s/.test(s.trim()) || RE_FECHA_PEGADA.test(s.trim()) || s !== s.trim()) {
      for (const p of palabrasDeTrozo(s, x0, x1, y0, y1)) out.push(nuevaPalabra(p.texto, p.x0, p.x1, y0, y1, c, tok.linea, p.corte));
    } else out.push(nuevaPalabra(s, x0, x1, y0, y1, c, tok.linea, tok.corte));
  }
  return out;
}

function anchoCaracter(palabras, hMed) {
  const v = [];
  for (const p of palabras) if (p.t.length >= 2) v.push((p.x1 - p.x0) / p.t.length);
  let w = v.length >= 3 ? mediana(v) : 0;
  if (!(w > 0)) w = mediana(palabras.map((p) => (p.x1 - p.x0) / Math.max(1, p.t.length)));
  if (!(w > 0)) w = hMed * 0.5 || 1;
  return w;
}

// Fotos torcidas: pendiente mediana entre palabras vecinas de la misma línea, y se endereza la y.
function enderezar(palabras, hMed, anchoPagina) {
  if (palabras.length < 12 || !(hMed > 0)) return 0;
  const lejos = Math.max(3 * hMed, 0.6 * (anchoPagina || 0));
  const cubos = new Map();
  for (const p of palabras) {
    const k = Math.floor(p.yc / hMed);
    if (!cubos.has(k)) cubos.set(k, []);
    cubos.get(k).push(p);
  }
  for (const arr of cubos.values()) arr.sort((a, b) => a.x0 - b.x0);
  const pendientes = [];
  for (const p of palabras) {
    const k = Math.floor(p.yc / hMed);
    let mejor = null, mejorDx = Infinity;
    for (const kk of [k - 1, k, k + 1]) {
      const arr = cubos.get(kk);
      if (!arr) continue;
      let lo = 0, hi = arr.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid].x0 < p.x1) lo = mid + 1; else hi = mid; }
      for (let j = lo; j < Math.min(arr.length, lo + 3); j++) {
        const q = arr[j];
        const dx = q.x0 - p.x1;
        if (dx > lejos) break;
        if (Math.abs(q.yc - p.yc) > 0.6 * hMed) continue;
        if (dx < mejorDx) { mejorDx = dx; mejor = q; }
      }
    }
    if (mejor) {
      const ddx = (mejor.x0 + mejor.x1 - p.x0 - p.x1) / 2;
      if (ddx > 0) pendientes.push((mejor.yc - p.yc) / ddx);
    }
  }
  if (pendientes.length < 8) return 0;
  const s = mediana(pendientes);
  if (Math.abs(s) < 0.002 || Math.abs(s) > 0.15) return 0;
  for (const p of palabras) p.yc -= (s * (p.x0 + p.x1)) / 2;
  return s;
}

// ¿Una línea del OCR junta dos filas de la foto? Palabras que se pisan en horizontal y están a distinta altura.
function mezclaFilas(g, hMed) {
  const o = g.slice().sort((a, b) => a.x0 - b.x0);
  for (let i = 0; i < o.length; i++) {
    for (let j = i + 1; j < Math.min(o.length, i + 4); j++) {
      const solape = Math.min(o[i].x1, o[j].x1) - Math.max(o[i].x0, o[j].x0);
      if (solape > 0.3 * Math.min(o[i].x1 - o[i].x0, o[j].x1 - o[j].x0) && Math.abs(o[i].yc - o[j].yc) > 0.6 * hMed) return true;
    }
  }
  return false;
}

function agruparEnLineas(palabras, nivel, hMed) {
  if (nivel === 'C' && palabras.every((p) => p.linea !== null)) {
    const m = new Map();
    for (const p of palabras) { if (!m.has(p.linea)) m.set(p.linea, []); m.get(p.linea).push(p); }
    const grupos = [];
    for (const g of m.values()) {
      if (mezclaFilas(g, hMed)) for (const s of agruparPorAltura(g, nivel, hMed)) grupos.push(s);
      else grupos.push(g);
    }
    const cy = (g) => g.reduce((s, p) => s + p.yc, 0) / g.length;
    return grupos.map((g) => ({ g, y: cy(g) })).sort((a, b) => a.y - b.y).map((o) => o.g);
  }
  return agruparPorAltura(palabras, nivel, hMed);
}

function agruparPorAltura(palabras, nivel, hMed) {
  // B: línea base ±2 unidades; C: centro ±40 % de la altura mediana
  const clave = nivel === 'C' ? (p) => p.yc : (p) => p.y1;
  const tol = nivel === 'C' ? Math.max(0.5, 0.4 * hMed) : 2;
  const orden = palabras.slice().sort((a, b) => clave(a) - clave(b));
  const grupos = [];
  let g = null, suma = 0;
  for (const p of orden) {
    const k = clave(p);
    if (g && Math.abs(k - suma / g.length) <= tol) { g.push(p); suma += k; }
    else { g = [p]; suma = k; grupos.push(g); }
  }
  return grupos;
}

// Quita duplicados (negrita falsa: el mismo texto dos veces casi en el mismo sitio) y junta trozos pegados.
// En el OCR las palabras ya vienen enteras: sus cajas pueden montarse («Sunday,» y «1») y no se juntan.
function juntarPegadas(ws, charW, nivel) {
  const out = [];
  for (const w of ws) {
    const prev = out[out.length - 1];
    if (prev && w.t === prev.t && Math.abs(w.x0 - prev.x0) < 0.5 * charW) continue;
    if (prev && nivel !== 'C' && !w.corte && w.x0 - prev.x1 < 0.25 * charW && w.x0 >= prev.x0 + 0.1 * charW) {
      prev.t += w.t;
      prev.n = normPalabra(prev.t);
      prev.x1 = Math.max(prev.x1, w.x1);
      prev.y0 = Math.min(prev.y0, w.y0);
      prev.y1 = Math.max(prev.y1, w.y1);
      if (w.c !== null) prev.c = prev.c === null ? w.c : Math.min(prev.c, w.c);
      continue;
    }
    out.push({ ...w });
  }
  return out;
}

function lineasDePagina(pagina, nivel) {
  const palabras = prepararPalabras(pagina?.tokens);
  if (!palabras.length) return [];
  const hMed = mediana(palabras.map((p) => p.y1 - p.y0)) || 1;
  const charW = anchoCaracter(palabras, hMed);
  if (nivel === 'C' && !palabras.every((p) => p.linea !== null)) enderezar(palabras, hMed, +pagina.ancho || Math.max(...palabras.map((p) => p.x1)));
  const grupos = agruparEnLineas(palabras, nivel, hMed);
  const altoPagina = Number.isFinite(+pagina.alto) && +pagina.alto > 0 ? +pagina.alto : Math.max(...palabras.map((p) => p.y1));
  const anchoPagina = Number.isFinite(+pagina.ancho) && +pagina.ancho > 0 ? +pagina.ancho : Math.max(...palabras.map((p) => p.x1));
  const lineas = [];
  for (const g of grupos) {
    g.sort((a, b) => a.x0 - b.x0);
    const ws = juntarPegadas(g, charW, nivel);
    let celda = 0;
    for (let i = 0; i < ws.length; i++) {
      if (i > 0 && ws[i].x0 - ws[i - 1].x1 > 1.5 * charW) celda++;
      ws[i].celda = celda;
    }
    const partes = [];
    for (let i = 0; i < ws.length; i++) partes.push((i > 0 ? (ws[i].celda !== ws[i - 1].celda ? '  ' : ' ') : '') + ws[i].t);
    const texto = partes.join('');
    lineas.push({
      pagina: pagina.numero ?? 1, fila: 0, nivel, palabras: ws, texto, norm: normalizar(texto),
      y: nivel === 'C' ? ws.reduce((s, p) => s + p.yc, 0) / ws.length : mediana(ws.map((p) => p.y1)),
      y0: Math.min(...ws.map((p) => p.y0)), y1: Math.max(...ws.map((p) => p.y1)),
      alto: mediana(ws.map((p) => p.y1 - p.y0)) || hMed, charW, altoPagina, anchoPagina,
      campos: [], clase: null,
    });
  }
  lineas.sort((a, b) => a.y - b.y);
  lineas.forEach((l, i) => { l.fila = i + 1; });
  // espaciado típico entre líneas de la página (para unir conceptos partidos)
  const saltos = [];
  for (let i = 1; i < lineas.length; i++) saltos.push(lineas[i].y - lineas[i - 1].y);
  const esp = mediana(saltos.filter((s) => s > 0.5 * hMed)) || hMed * 1.2;
  const espaciado = Math.min(Math.max(esp, hMed), 3 * hMed);
  for (const l of lineas) l.espaciado = espaciado;
  return lineas;
}

// ───────────────────────── 2. campos de cada línea ─────────────────────────

// Confusiones típicas del OCR dentro de cifras: O→0, l/I/|→1, S→5, B→8. Con dos cifras al menos, o con una si el
// trozo es corto («O4» delante de «ene»): «IO» o «Ol» sin ninguna cifra se quedan como texto.
function corregirOCR(t) {
  const cifras = (t.match(/\d/g) || []).length;
  if (cifras < 2 && !(cifras === 1 && t.length <= 3)) return null;
  if (!/^[\d.,:'()/+\-−–—€$£OoIl|SB]+$/.test(t)) return null;
  const c = t.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
  return c !== t ? c : null;
}

// Mes leído con cifras o con la primera letra doble: «0CT», «O0CT», «5EP», «FE8», «JUL1O» → OCT, SEP, FEB, JULIO
function mesOCR(t) {
  const s = String(t).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length < 3 || s.length > 10 || !/[A-Z]/.test(s)) return null;
  const c = s.replace(/0/g, 'O').replace(/5/g, 'S').replace(/8/g, 'B').replace(/1/g, 'I');
  if (MESES.has(c)) return c;
  const d = c.replace(/^(.)\1+/, '$1');
  return MESES.has(d) ? d : null;
}

function prepararOCR(L) {
  const P = L.palabras;
  for (let i = 0; i < P.length; i++) {
    const w = P[i];
    if (!MESES.has(w.n) && /[A-Za-z]/.test(w.t)) {
      // día y mes pegados, con la O leída como cero: «310CT» → «31» y «OCT»
      const limpio = w.t.replace(/[.,:;]+$/, ''); // «310CT.»
      const m = /^\d{1,2}[A-Za-z0-9]{3,6}$/.test(limpio);
      let partida = false;
      for (const k of [2, 1]) {
        if (!m) break;
        const dia = limpio.slice(0, k), resto = limpio.slice(k);
        const mes = /^\d+$/.test(dia) && +dia >= 1 && +dia <= 31 ? mesOCR(resto) : null;
        if (!mes) continue;
        const corte = w.x0 + ((w.x1 - w.x0) * k) / limpio.length;
        const a = { ...w, t: dia, n: dia, x1: corte, corte: false };
        const b = { ...w, t: resto, n: mes, tc: mes, x0: corte, corte: false, mesCorregido: resto.toUpperCase() !== mes };
        P.splice(i, 1, a, b);
        partida = true;
        break;
      }
      if (partida) continue;
      // mes con una cifra dentro o con la primera letra repetida: «O0CT», «5EP»
      const mes = /\d|^(.)\1/i.test(w.t) ? mesOCR(w.t) : null;
      if (mes) { w.n = mes; w.tc = mes; w.mesCorregido = true; continue; }
    }
    const c = corregirOCR(w.t);
    if (c) w.tc = c;
  }
}

/**
 * La letra de los iPhone hace que el OCR lea a veces el 7 como «/» dentro de un importe («-89,/1», «-62/1€»).
 * Solo se corrige si hay signo, moneda o céntimos (si no, podría ser una fecha). Si al corregir no quedan céntimos
 * y el documento sí los escribe, faltaba la coma: «-62/1€» → «-62,71€». Siempre sale como dudoso.
 */
export function corregirBarra(t, decimal) {
  if (!t.includes('/') || !/\d/.test(t) || (t.match(/[\d/]/g) || []).length < 3) return null;
  if (!/[-+−–€$£]|[.,][\d/]/.test(t)) return null;
  let c = t.replace(/\//g, '7');
  const nucleo = c.replace(/[^\d.,]/g, '');
  if (!/[.,]\d{2}$/.test(nucleo)) {
    if (!decimal || !/^\d{3,}$/.test(nucleo)) return null;
    c = c.replace(/(\d)(\d{2})(?!.*\d)/, `$1${decimal}$2`);
  }
  return c;
}

// «S1.850,00»: una letra pegada delante de un importe con miles. Puede ser un 5 mal leído o la última letra del
// concepto («…SL +1.850,00»). Con poca confianza o con miles, se toma sin la letra (y sale dudoso).
function sinLetraDelante(w) {
  const m = w.t.match(/^([A-Za-z])([-+]?\d.*)$/);
  if (!m || !pareceImporte(m[2])) return null;
  const conMiles = /^[-+]?\d{1,3}[.,]\d{3}/.test(m[2]);
  return conMiles || (w.c !== null && w.c < 0.5) ? m[2] : null;
}

function unirCorregido(P, i, j) {
  let s = P[i].tc ?? P[i].t;
  for (let k = i + 1; k <= j; k++) s += ' ' + (P[k].tc ?? P[k].t);
  // separadores sueltos: «12 , 50» o «12, 50» → «12,50»; «02/ 03/2026» → «02/03/2026»
  return s.replace(/(\d)\s*([.,/])\s*(?=\d)/g, '$1$2');
}

function secuenciaFecha(P, i, j, charW) {
  let mes = false;
  for (let k = i; k <= j; k++) {
    if (k > i && (P[k].celda !== P[i].celda || P[k].x0 - P[k - 1].x1 > 1.6 * charW)) return false;
    if (MESES.has(P[k].n) || MESES.has(P[k].n.replace(/^D'/, ''))) mes = true;
  }
  if (mes) return true;
  return j === i + 1 && RE_HORA.test(P[j].t);
}

function probarFecha(L, i, cx) {
  const P = L.palabras, n = P.length, w0 = P[i];
  const ocr = L.nivel === 'C';
  if (!(/^\d/.test(w0.t) || MESES.has(w0.n) || DIAS_SEMANA.has(w0.n) || RELATIVAS.has(w0.n) || (ocr && w0.tc))) return null;
  const max = Math.min(MAX_PALABRAS_FECHA, n - i);
  for (let len = max; len >= 1; len--) {
    const j = i + len - 1;
    if (len > 1 && !secuenciaFecha(P, i, j, L.charW)) continue;
    const s = unirTexto(P, i, j);
    // con decimales de punto, «12.03» es un importe y no el 12 de marzo
    if (len === 1 && cx.decimal === '.' && /^\d{1,2}\.\d{2}$/.test(s)) return null;
    let p = parseFechaParcial(s, { orden: cx.orden, hoy: cx.hoy });
    let corregido = false;
    if (!p && ocr) {
      const c = unirCorregido(P, i, j);
      if (c !== s) { p = parseFechaParcial(c, { orden: cx.orden, hoy: cx.hoy }); corregido = !!p; }
    }
    if (!p) continue;
    if (len >= 2 && /^\d{2}$/.test(P[j].t)) {
      // «02 ENE 03 ENE»: el 03 no es un año, es la fecha valor
      const sig = P[j + 1];
      if (sig && sig.celda === P[j].celda && (MESES.has(sig.n) || DIVISAS.has(sig.n) || /^[€$£,.]/.test(sig.t))) continue;
    }
    return { tipo: 'fecha', i0: i, i1: j, parcial: p, texto: s, corregido, conf: confMin(P, i, j) };
  }
  return null;
}

function secuenciaImporte(P, i, j, charW, cx) {
  let digitos = 0;
  for (let k = i; k <= j; k++) {
    const w = P[k];
    if (k > i && w.x0 - P[k - 1].x1 > 1.3 * charW) return false;
    if (DIVISAS.has(w.n)) continue;
    const t = w.tc ?? w.t;
    if (!/^[\d.,'()+\-−–—€$£]+$/.test(t)) return false;
    if (/\d/.test(t)) digitos++;
  }
  // «100 200,00»: si el documento escribe los miles con punto o coma, son dos cifras distintas
  if (cx.milesConSigno) {
    for (let k = i; k < j; k++) {
      if (/^[-+(−–]?\d{1,3}$/.test(P[k].tc ?? P[k].t) && /^\d{3}(?:[.,]\d{2})?[)\-]?$/.test(P[k + 1].tc ?? P[k + 1].t)) return false;
    }
  }
  return digitos >= 1;
}

function signoExplicito(s) {
  const t = s.replace(/[−‒–—―﹣－]/g, '-').replace(/\s+/g, '').replace(/EUR|USD|GBP|[€$£]/gi, '');
  if (/^\(.*\)$/.test(t) || t.startsWith('-') || t.endsWith('-')) return -1;
  if (t.startsWith('+') || t.endsWith('+')) return 1;
  return 0;
}

function divisaDe(s) {
  if (/€/.test(s)) return 'EUR';
  if (/£/.test(s)) return 'GBP';
  if (/\$/.test(s)) return 'USD';
  const m = s.toUpperCase().match(/\b([A-Z]{3})\b/);
  return m && DIVISAS.has(m[1]) ? m[1] : null;
}

function probarImporte(L, i, cx) {
  const P = L.palabras, n = P.length, w0 = P[i];
  const ocr = L.nivel === 'C';
  if (!/\d/.test(w0.t) && !(ocr && w0.tc) && !/^[-+(−–]?[€$£]?$/.test(w0.t) && !DIVISAS.has(w0.n)) return null;
  const max = Math.min(MAX_PALABRAS_IMPORTE, n - i);
  for (let len = max; len >= 1; len--) {
    const j = i + len - 1;
    if (len > 1 && !secuenciaImporte(P, i, j, L.charW, cx)) continue;
    const s = unirTexto(P, i, j);
    const intentos = [[s, false]];
    if (ocr) {
      // «-12,99E», «-E12.99»: el «€» pegado a la cifra leído como una letra
      // (solo con céntimos: «4C» o «2E» en una dirección no son importes)
      const conEuro = s.replace(/^([-+−–]?)[EC](?=\d[\d.,]*[.,]\d{2}$)|(?<=[.,]\d{2})[EC]$/, (m, signo) => `${signo ?? ''}€`);
      if (conEuro !== s) intentos.push([conEuro, true]);
      const c = unirCorregido(P, i, j);
      const sl = sinLetraDelante(w0);
      if (sl) intentos.push([[sl, ...P.slice(i + 1, j + 1).map((w) => w.tc ?? w.t)].join(' '), true]);
      if (c !== s) intentos.push([c, true]);
      const b = corregirBarra(c, cx.decimal);
      if (b) intentos.push([b, true]);
    }
    for (const [t, corregido] of intentos) {
      let valor = null;
      if (pareceImporte(t)) valor = parseImporte(t);
      else if (cx.decimal === '.' && /^[-+(]?\d{1,2}\.\d{2}\)?-?$/.test(t)) valor = parseImporte(t);
      if (valor === null) continue;
      return { tipo: 'importe', i0: i, i1: j, valor, texto: t, signo: signoExplicito(t), divisa: divisaDe(t), corregido, conf: confMin(P, i, j) };
    }
  }
  return null;
}

function camposDeLinea(L, cx) {
  if (L.nivel === 'C') prepararOCR(L); // puede partir palabras («310CT»): antes de contarlas
  const P = L.palabras, n = P.length;
  const campos = [];
  for (let i = 0; i < n;) {
    const w = P[i];
    let f = probarFecha(L, i, cx) || probarImporte(L, i, cx);
    if (!f) {
      const prev = campos[campos.length - 1];
      if (MARCAS[w.n] !== undefined && prev && prev.tipo === 'importe' && !prev.marca && w.x0 - P[prev.i1].x1 <= 3 * L.charW) {
        prev.marca = w.n;
        prev.i1 = i;
        prev.x1 = w.x1;
        i++;
        continue;
      }
      if (DIVISAS.has(w.n) || SIMBOLOS_DIVISA[w.t]) f = { tipo: 'divisa', i0: i, i1: i, divisa: DIVISAS.has(w.n) ? w.n : SIMBOLOS_DIVISA[w.t] };
      // en una foto, el «€» suelto detrás de un importe a veces se lee «E» o «C»: si no, el importe iría al concepto
      else if (L.nivel === 'C' && /^[ECe]$/.test(w.t) && prev && prev.tipo === 'importe' && w.x0 - P[prev.i1].x1 <= 1.5 * L.charW) f = { tipo: 'divisa', i0: i, i1: i, divisa: 'EUR' };
      else if (/^[*·•|_=~\-−–—/\\.:,;]+$/.test(w.t)) f = { tipo: 'ruido', i0: i, i1: i };
      else f = { tipo: 'texto', i0: i, i1: i };
    }
    f.x0 = P[f.i0].x0;
    f.x1 = P[f.i1].x1;
    f.celda = P[f.i0].celda;
    const prev = campos[campos.length - 1];
    if (f.tipo === 'texto' && prev && prev.tipo === 'texto' && prev.celda === f.celda) { prev.i1 = f.i1; prev.x1 = f.x1; }
    else campos.push(f);
    i = f.i1 + 1;
  }
  // un importe con texto detrás en la misma celda va dentro del concepto («PAGO 12,00 USD NETFLIX»)
  const textoDetras = new Set();
  for (let k = campos.length - 1; k >= 0; k--) {
    const f = campos[k];
    f.orig = unirTexto(P, f.i0, f.i1);
    f.inicioCelda = f.i0 === 0 || P[f.i0 - 1].celda !== f.celda;
    if (f.tipo === 'importe') f.incrustado = textoDetras.has(f.celda);
    if (f.tipo === 'texto') textoDetras.add(f.celda);
  }
  return campos;
}

// ───────────────────────── 3. clasificar líneas ─────────────────────────

function etiquetasSaldo(L) {
  const P = L.palabras;
  const ns = P.map((w) => w.n.replace(/[^A-Z0-9]/g, ''));
  const out = [];
  for (let i = 0; i < ns.length; i++) {
    if (!PRIMERAS_SALDO.has(ns[i])) continue;
    const inicio = i === 0 || P[i - 1].celda !== P[i].celda;
    for (const f of FRASES_SALDO) {
      const k = f.palabras.length;
      if (i + k > ns.length) continue;
      let ok = true;
      for (let a = 0; a < k && ok; a++) ok = ns[i + a] === f.palabras[a];
      if (!ok) continue;
      out.push({ tipo: f.tipo, debil: f.debil, i0: i, i1: i + k - 1, inicio, x0: P[i].x0, x1: P[i + k - 1].x1 });
      i += k - 1;
      break;
    }
  }
  return out;
}

function detectarTitulos(L) {
  const P = L.palabras;
  const sub = [];
  for (let k = 0; k < P.length; k++) for (const s of normalizar(P[k].t).split(/[^A-Z0-9]+/)) if (s) sub.push({ t: s, k });
  if (sub.length < 2 || sub.length > 30) return null;
  const encontrados = [];
  let cubiertos = 0;
  for (let a = 0; a < sub.length;) {
    let hecho = false;
    for (let len = Math.min(MAX_PALABRAS_TITULO, sub.length - a); len >= 1; len--) {
      const frase = sub.slice(a, a + len).map((s) => s.t).join(' ');
      const rol = TITULOS.get(frase);
      if (!rol) continue;
      encontrados.push({ rol, frase, x0: P[sub[a].k].x0, x1: P[sub[a + len - 1].k].x1, k0: sub[a].k, k1: sub[a + len - 1].k });
      cubiertos += len;
      a += len;
      hecho = true;
      break;
    }
    if (!hecho) a++;
  }
  const roles = new Set(encontrados.map((e) => e.rol).filter((r) => r !== 'otro'));
  if (cubiertos / sub.length < 0.6) return null;
  const conAncla = roles.has('fecha') || roles.has('concepto') || roles.has('fecha_valor');
  if (!((roles.size >= 2 && conAncla) || roles.size >= 3)) return null;
  // dos columnas «Fecha»: la segunda es la fecha valor
  const fechas = encontrados.filter((e) => e.rol === 'fecha');
  if (fechas.length === 2 && !encontrados.some((e) => e.rol === 'fecha_valor')) fechas[1].rol = 'fecha_valor';
  return encontrados;
}

// Segunda línea de títulos («operación», «valor») debajo de la primera
function completarTitulos(titulos, L) {
  const P = L.palabras;
  if (!P.length || P.length > 12) return false;
  for (const w of P) {
    const partes = normalizar(w.t).split(/[^A-Z0-9]+/).filter(Boolean);
    if (!partes.length || !partes.every((s) => COMPLEMENTOS_TITULO.has(s) || TITULOS.has(s))) return false;
  }
  const debajo = new Map();
  for (const w of P) {
    let mejor = null, mejorD = Infinity;
    for (const t of titulos) {
      const d = Math.max(0, Math.max(t.x0, w.x0) - Math.min(t.x1, w.x1));
      if (d < mejorD) { mejorD = d; mejor = t; }
    }
    if (!mejor || mejorD > 4 * L.charW) continue;
    if (!debajo.has(mejor)) debajo.set(mejor, []);
    debajo.get(mejor).push(...normalizar(w.t).split(/[^A-Z0-9]+/).filter(Boolean));
    mejor.x0 = Math.min(mejor.x0, w.x0);
    mejor.x1 = Math.max(mejor.x1, w.x1);
  }
  for (const [t, extra] of debajo) {
    const frase = t.frase + ' ' + extra.join(' ');
    const rol = TITULOS.get(frase);
    if (rol) { t.frase = frase; t.rol = rol; }
  }
  return true;
}

function marcaDeTitulos(titulos, charW) {
  return titulos.map((t) => `${t.rol}@${Math.round(t.x0 / (3 * charW))}`).join('|');
}

function clasificar(L) {
  const C = L.campos;
  if (!C.length) return 'vacia';
  if (RE_PAGINA.test(L.norm) && (!C.some((f) => f.tipo === 'fecha') || /^[A-Z]/.test(L.norm))) return 'pagina';
  // fecha del movimiento: la primera que empieza celda y va antes de cualquier importe suelto
  let iFecha = -1;
  for (let k = 0; k < C.length; k++) {
    const f = C[k];
    if (f.tipo === 'importe' && !f.incrustado) break;
    if (f.tipo === 'fecha' && f.inicioCelda) { iFecha = k; break; }
  }
  const importes = [];
  for (let k = iFecha + 1; k < C.length; k++) if (C[k].tipo === 'importe' && !C[k].incrustado) importes.push(C[k]);
  const hayTexto = C.some((f) => f.tipo === 'texto');
  L.iFecha = iFecha;
  L.importes = importes;

  const etiquetas = etiquetasSaldo(L);
  const fuertes = etiquetas.filter((e) => !e.debil && (e.inicio || e.i0 === primerTexto(L)));
  const esMov = iFecha >= 0 && importes.length > 0;
  const textoLinea = C.filter((f) => f.tipo === 'texto').map((f) => normalizar(f.orig)).join(' ').replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (fuertes.length) {
    const validas = fuertes.filter((e) => {
      if (e.tipo === 'resumen') return RE_SOLO_RESUMEN.test(textoLinea);
      if (esMov) return e.i0 === primerTexto(L, iFecha);
      return true;
    });
    if (validas.length) { L.etiquetas = validas; return 'saldo'; }
  }
  if (!importes.length && !C.some((f) => f.tipo === 'importe')) {
    const t = detectarTitulos(L);
    if (t) { L.titulos = t; return 'titulo'; }
  }
  // «SALDO 1.234,56» suelto al final de la tabla
  if (etiquetas.some((e) => e.debil && e.i0 === primerTexto(L, iFecha)) && RE_SOLO_RESUMEN.test(textoLinea) && C.some((f) => f.tipo === 'importe')) {
    L.etiquetas = etiquetas.filter((e) => e.debil).map((e) => ({ ...e, tipo: 'resumen' }));
    return 'saldo';
  }
  if (esMov) return 'mov';
  const utiles = C.filter((f) => f.tipo !== 'ruido');
  if (utiles.length === 1 && utiles[0].tipo === 'fecha') return 'fecha_sola';
  if (importes.length && hayTexto && iFecha < 0) return 'importe_sin_fecha';
  if (importes.length && !hayTexto && !C.some((f) => f.tipo === 'fecha')) return 'solo_importes';
  return 'texto';
}

function primerTexto(L, desde = -1) {
  for (let k = desde + 1; k < L.campos.length; k++) if (L.campos[k].tipo === 'texto') return L.campos[k].i0;
  return -1;
}

// ───────────────────────── periodo y fechas de referencia ─────────────────────────

const DF = String.raw`(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}(?:\s+DE|\s+D')?\s*[A-Z]{3,10}\.?(?:,?\s+(?:DE\s+)?\d{4})?)`;
const RE_PERIODO_1 = new RegExp(String.raw`\b(?:DEL|DESDE(?:\s+EL)?|DES\s+DE(?:L)?|FROM|ENTRE(?:\s+EL)?|PERIODO(?:\s+DEL)?|PERIODE(?:\s+DEL)?|PERIOD(?:\s+FROM)?)\s*:?\s*${DF}\s*(?:AL|HASTA(?:\s+EL)?|FINS\s+(?:AL|EL)|TO|A|Y(?:\s+EL)?|-)\s*${DF}`);
const RE_PERIODO_2 = new RegExp(String.raw`${DF}\s*(?:-|AL|A|TO|HASTA)\s*${DF}`);
const RE_CON_PERIODO = /\b(?:EXTRACTO|EXTRACTE|MOVIMIENTOS|MOVIMENTS|PERIODO|PERIODE|PERIOD|STATEMENT|FECHAS|DATES)\b/;
const RE_MES_EXTRACTO = new RegExp(String.raw`\b(?:EXTRACTO|EXTRACTE|STATEMENT|MOVIMIENTOS|MOVIMENTS|RESUMEN)\b[^0-9]{0,30}?\b(${Object.keys(MES_NUMERO).join('|')})\b,?\s+(?:DE\s+|D'|OF\s+)?(\d{4})\b`);
const RE_EMISION = new RegExp(String.raw`\b(?:FECHA\s+(?:DE\s+)?EMISION|DATA\s+(?:D'?\s*)?EMISSIO|ISSUE\s+DATE|DATE\s+OF\s+ISSUE|FECHA\s+(?:DE\s+)?EXPEDICION|EMITIDO\s+EL|FECHA\s+DEL\s+EXTRACTO|FECHA\s+EXTRACTO)\s*:?\s*${DF}`);

function fechaDeTexto(s, cx) {
  return parseFechaParcial(s.replace(/\s+/g, ' ').trim(), { orden: cx.orden, hoy: cx.hoy });
}

function buscarPeriodo(lineas, cx) {
  let periodo = null, emision = null;
  for (const L of lineas) {
    if (L.clase === 'mov') continue;
    const t = L.norm;
    if (!periodo) {
      let m = t.match(RE_PERIODO_1);
      if (!m && RE_CON_PERIODO.test(t)) m = t.match(RE_PERIODO_2);
      if (m) {
        const a = fechaDeTexto(m[1], cx), b = fechaDeTexto(m[2], cx);
        if (a && b) {
          const anioB = b.anio ?? null;
          if (anioB !== null) {
            let anioA = a.anio ?? (a.mes * 100 + a.dia > b.mes * 100 + b.dia ? anioB - 1 : anioB);
            if (fechaValida(anioA, a.mes, a.dia) && fechaValida(anioB, b.mes, b.dia)) {
              let desde = aISO(anioA, a.mes, a.dia), hasta = aISO(anioB, b.mes, b.dia);
              if (desde > hasta) [desde, hasta] = [hasta, desde];
              if (diasEntre(desde, hasta) <= 800) periodo = { desde, hasta, linea: L };
            }
          }
        }
      }
      if (!periodo) {
        const mm = t.match(RE_MES_EXTRACTO);
        if (mm) {
          const mes = MES_NUMERO[mm[1]], anio = +mm[2];
          const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
          if (fechaValida(anio, mes, 1)) periodo = { desde: aISO(anio, mes, 1), hasta: aISO(anio, mes, ultimo), linea: L };
        }
      }
    }
    if (!emision) {
      const me = t.match(RE_EMISION);
      if (me) { const e = fechaDeTexto(me[1], cx); if (e && e.anio !== null) emision = aISO(e.anio, e.mes, e.dia); }
    }
    if (periodo && emision) break;
  }
  return { periodo, emision };
}

// ───────────────────────── 4. cabeceras y pies repetidos ─────────────────────────

const CLASES_REPETIBLES = new Set(['texto', 'fecha_sola', 'importe_sin_fecha', 'solo_importes', 'vacia']);

function quitarRepetidas(lineas, nPaginas) {
  for (const L of lineas) if (L.clase === 'pagina') L.clase = 'repetida';
  if (nPaginas < 2) return;
  const minPaginas = Math.max(2, Math.ceil(nPaginas * 0.5));
  const porClave = new Map();
  for (const L of lineas) {
    if (!CLASES_REPETIBLES.has(L.clase) || !L.palabras.length) continue;
    const k = L.norm.replace(/\d+/g, '#');
    if (!porClave.has(k)) porClave.set(k, []);
    porClave.get(k).push(L);
  }
  for (const ls of porClave.values()) {
    if (ls.length < minPaginas) continue;
    // una cabecera o un pie sale una vez por página; lo que se repite muchas veces en la misma página es contenido
    const paginasCon = new Set(ls.map((L) => L.pagina)).size;
    if (ls.length > 1.5 * paginasCon) continue;
    const tol = ls[0].nivel === 'C' ? 0.025 : 0.012;
    const orden = ls.map((L) => ({ L, yr: L.y / (L.altoPagina || 1) })).sort((a, b) => a.yr - b.yr);
    let ini = 0;
    for (let i = 1; i <= orden.length; i++) {
      if (i < orden.length && orden[i].yr - orden[i - 1].yr <= tol) continue;
      const grupo = orden.slice(ini, i);
      if (new Set(grupo.map((o) => o.L.pagina)).size >= minPaginas) for (const o of grupo) o.L.clase = 'repetida';
      ini = i;
    }
  }
}

// ───────────────────────── 5. columnas de importes ─────────────────────────

function agrupar1D(miembros, clave, tol) {
  const orden = miembros.slice().sort((a, b) => clave(a) - clave(b));
  const grupos = [];
  let g = null, ultimo = -Infinity;
  for (const m of orden) {
    const v = clave(m);
    if (g && v - ultimo <= tol) g.miembros.push(m);
    else { g = { miembros: [m] }; grupos.push(g); }
    ultimo = v;
  }
  let repetidos = 0;
  for (const gr of grupos) {
    gr.x0 = Math.min(...gr.miembros.map((m) => m.f.x0));
    gr.x1 = Math.max(...gr.miembros.map((m) => m.f.x1));
    gr.cands = new Set(gr.miembros.map((m) => m.c));
    gr.noCero = new Set(gr.miembros.filter((m) => m.f.valor !== 0).map((m) => m.c));
    repetidos += gr.miembros.length - gr.cands.size;
    gr.rol = null;
  }
  return { grupos, puntos: grupos.length + 5 * repetidos };
}

function puntuarTitulo(g, t, charW) {
  const ov = Math.min(g.x1, t.x1) - Math.max(g.x0, t.x0);
  if (ov > 0) return 1 + ov / Math.max(1e-6, Math.min(g.x1 - g.x0, t.x1 - t.x0));
  return -(Math.max(g.x0, t.x0) - Math.min(g.x1, t.x1)) / charW;
}

/**
 * Papel de cada importe de las filas de una sección (importe, cargo, abono, saldo, ruido u otro).
 * Devuelve { porLinea: boolean, supuesto: boolean }.
 */
function rolesDeImportes(cands, titulos, charW, nivel) {
  const miembros = [];
  for (const c of cands) for (const f of c.linea.importes) miembros.push({ f, c });
  if (!miembros.length) return { porLinea: false, supuesto: false };
  const tol = (nivel === 'C' ? 2.5 : 1.5) * charW;
  let mejor = null;
  for (const clave of [(m) => m.f.x1, (m) => m.f.x0, (m) => (m.f.x0 + m.f.x1) / 2]) {
    const r = agrupar1D(miembros, clave, tol);
    if (!mejor || r.puntos < mejor.puntos) mejor = r;
  }
  const { grupos } = mejor;
  let titImporte = (titulos || []).filter((t) => ROLES_IMPORTE.has(t.rol));
  let supuesto = false;
  // títulos que no caen encima de las cifras (texto pegado con un solo espacio): no sirven para situar columnas
  if (titImporte.length) {
    let bajoTitulo = 0;
    for (const g of grupos) if (titImporte.some((t) => puntuarTitulo(g, t, charW) > 0)) bajoTitulo += g.miembros.length;
    if (bajoTitulo < 0.5 * miembros.length) titImporte = [];
  }

  if (titImporte.length) {
    const pares = [];
    for (const g of grupos) for (const t of titImporte) pares.push({ g, t, p: puntuarTitulo(g, t, charW) });
    pares.sort((a, b) => b.p - a.p);
    const usadosT = new Set();
    for (const { g, t, p } of pares) {
      if (g.rol || usadosT.has(t) || p < -8) continue;
      g.rol = t.rol;
      usadosT.add(t);
    }
    const izquierda = Math.min(...titImporte.map((t) => t.x0));
    for (const g of grupos) if (!g.rol) g.rol = g.x1 < izquierda ? 'ruido' : 'otro';
    // los títulos solo dicen dónde va el saldo: el importe se busca por la posición
    if (!grupos.some((g) => g.rol === 'importe' || g.rol === 'cargo' || g.rol === 'abono')) {
      for (const g of grupos) g.rol = null;
      titImporte = [];
    }
  }
  if (!titImporte.length) {
    const n = cands.length;
    const principales = grupos.filter((g) => g.cands.size >= Math.max(2, 0.2 * n));
    // alineación pobre (texto pegado con un solo espacio, fotos): cada fila por su cuenta
    const enPrincipales = principales.reduce((s, g) => s + g.miembros.length, 0);
    // en una tabla de verdad cada cifra va en su celda; con un solo espacio va pegada al concepto
    const enCeldaPropia = miembros.filter((m) => m.f.inicioCelda).length;
    if (enCeldaPropia < 0.5 * miembros.length || (n >= 2 && (!principales.length || enPrincipales < 0.6 * miembros.length))) {
      for (const c of cands) {
        const fs = c.linea.importes.slice().sort((a, b) => a.x0 - b.x0);
        fs.forEach((f) => { f.rol = 'ruido'; });
        if (fs.length >= 2) { fs[fs.length - 1].rol = 'saldo'; fs[fs.length - 2].rol = 'importe'; }
        else if (fs.length === 1) fs[0].rol = 'importe';
      }
      return { porLinea: true, supuesto: false };
    }
    const base = principales.length ? principales : grupos;
    const xIzq = Math.min(...base.map((g) => g.x0));
    for (const g of grupos) {
      const propias = g.miembros.filter((m) => m.f.inicioCelda).length;
      if (!base.includes(g) && g.x1 < xIzq && propias < 0.5 * g.miembros.length) g.rol = 'ruido';
    }
    const utiles = grupos.filter((g) => g.rol !== 'ruido').sort((a, b) => a.x0 - b.x0);
    const grupoDe = new Map();
    for (const g of grupos) for (const m of g.miembros) grupoDe.set(m.f, g);
    const resto = (gs) => {
      if (gs.length === 1) { gs[0].rol = 'importe'; return; }
      if (gs.length < 2) return;
      const porTamano = gs.slice().sort((a, b) => b.cands.size - a.cands.size);
      const [a, b] = porTamano.slice(0, 2).sort((p, q) => p.x0 - q.x0);
      let juntos = 0;
      for (const c of a.noCero) if (b.noCero.has(c)) juntos++;
      if (juntos <= 0.1 * Math.min(a.noCero.size || 1, b.noCero.size || 1)) {
        a.rol = 'cargo'; b.rol = 'abono'; supuesto = true; // costumbre: el cargo va a la izquierda
      } else porTamano[0].rol = 'importe';
      for (const g of gs) if (!g.rol) g.rol = 'otro';
    };
    if (utiles.length >= 2) {
      const der = utiles[utiles.length - 1];
      let conOtros = 0, conAmbos = 0;
      for (const c of cands) {
        const gs = new Set(c.linea.importes.map((f) => grupoDe.get(f)));
        const otros = [...gs].some((g) => g !== der && g.rol !== 'ruido');
        if (otros) { conOtros++; if (gs.has(der)) conAmbos++; }
      }
      if (conOtros && conAmbos >= 0.5 * conOtros) { der.rol = 'saldo'; resto(utiles.slice(0, -1)); }
      else resto(utiles);
    } else if (utiles.length === 1) utiles[0].rol = 'importe';
  }
  for (const g of grupos) for (const m of g.miembros) m.f.rol = g.rol;
  // una fila con dos importes en la misma columna: el de la izquierda va al concepto
  for (const c of cands) {
    const vistos = new Map();
    for (const f of c.linea.importes.slice().sort((a, b) => b.x0 - a.x0)) {
      if (!ROLES_IMPORTE.has(f.rol)) continue;
      if (vistos.has(f.rol)) f.rol = 'ruido';
      else vistos.set(f.rol, f);
    }
  }
  grupos.forEach((g) => { delete g.miembros; });
  return { porLinea: false, supuesto, grupos, titulosAlineados: titImporte.length > 0 };
}

// ───────────────────────── 6. movimientos candidatos ─────────────────────────

function candidatoDeLinea(L, campoFecha, titulos) {
  const C = L.campos;
  const iF = campoFecha ? C.indexOf(campoFecha) : -1;
  let fechaValor = null, iUltFecha = iF;
  // segunda fecha pegada a la primera: fecha valor (o según los títulos)
  if (iF >= 0 && C[iF + 1] && C[iF + 1].tipo === 'fecha') { fechaValor = C[iF + 1]; iUltFecha = iF + 1; }
  let fecha = campoFecha;
  const tVal = titulos?.find((t) => t.rol === 'fecha_valor');
  if (fecha && !fechaValor && tVal) {
    const otra = C.find((f) => f.tipo === 'fecha' && f !== fecha && Math.min(f.x1, tVal.x1) - Math.max(f.x0, tVal.x0) > -2 * L.charW);
    if (otra) fechaValor = otra;
  }
  if (fecha && fechaValor && titulos) {
    const tF = titulos.find((t) => t.rol === 'fecha'), tV = titulos.find((t) => t.rol === 'fecha_valor');
    if (tF && tV) {
      const d = (f, t) => Math.abs((f.x0 + f.x1) / 2 - (t.x0 + t.x1) / 2);
      const cerca = Math.min(d(fecha, tF), d(fecha, tV)) < 6 * L.charW && Math.min(d(fechaValor, tF), d(fechaValor, tV)) < 6 * L.charW;
      if (cerca && d(fecha, tV) + d(fechaValor, tF) < d(fecha, tF) + d(fechaValor, tV)) [fecha, fechaValor] = [fechaValor, fecha];
    }
  }
  return { linea: L, fecha: fecha ? fecha.parcial : null, campoFecha: fecha, fechaValor: fechaValor ? fechaValor.parcial : null,
    campoFechaValor: fechaValor, iUltFecha, heredada: false, prefijo: [], sufijo: [] };
}

function completarCandidato(c, titulos, columnasImporte) {
  const L = c.linea, C = L.campos;
  const rol = (r) => C.find((f) => f.tipo === 'importe' && f.rol === r && L.importes.includes(f)) || null;
  c.importe = rol('importe');
  c.cargo = rol('cargo');
  c.abono = rol('abono');
  c.saldo = rol('saldo');
  // foto con saldo y sin importe: si en la columna del importe hay cifras que no se dejan leer («4741»), el importe
  // está ahí pero ilegible. No va al concepto; quizá lo dé la diferencia de saldos.
  let ilegible = null;
  if (L.nivel === 'C' && c.saldo && !c.importe && !c.cargo && !c.abono && columnasImporte?.length) {
    const tol = 2 * L.charW;
    ilegible = C.find((f) => f.tipo === 'texto' && (f.orig.match(/\d/g) || []).length >= 2 && f.orig.replace(/[^A-Za-z]/g, '').length <= 2
      && columnasImporte.some(([x0, x1]) => f.x1 >= x0 - tol && f.x0 <= x1 + tol)) || null;
    if (ilegible) { c.sinImporte = true; c.textoImporte = ilegible.orig; }
  }
  const deRol = [c.importe, c.cargo, c.abono, c.saldo].filter(Boolean);
  const iPrimerImporte = deRol.length ? Math.min(...deRol.map((f) => C.indexOf(f))) : C.length;
  const iUltImporte = deRol.length ? Math.max(...deRol.map((f) => C.indexOf(f))) : C.length;
  // concepto: lo que va entre las fechas y los importes; si no hay nada, lo de antes de la fecha
  const principal = [], antes = [], despues = [];
  const tConcepto = titulos?.find((t) => t.rol === 'concepto');
  for (let k = 0; k < C.length; k++) {
    const f = C[k];
    if (f === c.campoFecha || f === c.campoFechaValor || deRol.includes(f) || f === ilegible) continue;
    if (f.tipo === 'ruido' || (f.tipo === 'divisa' && k > iPrimerImporte)) continue;
    if (f.tipo === 'importe' && ROLES_IMPORTE.has(f.rol) && !f.incrustado) continue;
    if (f.tipo === 'importe' && f.rol === 'otro') continue;
    if (k < (c.campoFecha ? C.indexOf(c.campoFecha) : 0)) {
      if (!tConcepto || f.x1 >= tConcepto.x0 - 2 * L.charW) antes.push(f);
    } else if (k < iPrimerImporte) principal.push(f);
    else if (k > iUltImporte && f.tipo === 'texto') despues.push(f);
  }
  const elegidos = principal.length ? principal : antes;
  c.partes = elegidos.map((f) => f.orig);
  c.palabrasPrincipal = elegidos.flatMap((f) => L.palabras.slice(f.i0, f.i1 + 1));
  c.extra = despues.map((f) => f.orig);
  // varias columnas de texto con título (Tipo, Descripción…): cada una por su lado, unidas con « · »
  c.columnas = null;
  if (titulos) {
    const fechasX1 = Math.max(-Infinity, ...titulos.filter((t) => t.rol === 'fecha' || t.rol === 'fecha_valor').map((t) => t.x1));
    const importesX0 = Math.min(Infinity, ...titulos.filter((t) => ROLES_IMPORTE.has(t.rol)).map((t) => t.x0));
    const cols = titulos.filter((t) => (t.rol === 'concepto' || (t.rol === 'otro' && !/^(?:DIVISA|MONEDA|CURRENCY|EUR)$/.test(t.frase)))
      && t.x0 > fechasX1 && t.x1 < importesX0).sort((a, b) => a.x0 - b.x0);
    if (cols.length >= 2) c.columnas = cols;
  }
  // divisa: la del importe o una columna de divisa al lado
  const base = c.importe || c.cargo || c.abono;
  c.divisa = base?.divisa ?? null;
  if (!c.divisa && base) {
    const k = C.indexOf(base);
    const sig = C[k + 1];
    if (sig && sig.tipo === 'divisa') c.divisa = sig.divisa;
  }
  c.criticos = [c.campoFecha, base, c.saldo].filter(Boolean);
  const conceptoCampos = C.filter((f) => f.tipo === 'texto' && (f.i0 > (c.campoFecha?.i1 ?? -1)) && f.x0 < (base ? base.x0 : Infinity));
  c.conceptoX0 = conceptoCampos.length ? conceptoCampos[0].x0 : (c.campoFecha ? c.campoFecha.x1 + L.charW : L.palabras[0].x0);
  c.altoConcepto = conceptoCampos.length ? mediana(L.palabras.filter((w) => w.x0 >= c.conceptoX0 && w.x1 <= (base ? base.x0 : Infinity)).map((w) => w.y1 - w.y0)) : L.alto;
  c.importesX0 = deRol.length ? Math.min(...deRol.map((f) => f.x0)) : Infinity;
  c.sinConcepto = !principal.length;
}

// ───────────────────────── 7. conceptos partidos ─────────────────────────

const CLASES_PARADA = new Set(['saldo', 'titulo', 'titulo_resto', 'mov', 'solo_importes', 'saldo_valores']);
const CLASES_SALTO = new Set(['repetida', 'vacia']);

/** Texto de una línea que sigue al concepto, o null si la línea no es continuación. */
function textoDeContinuacion(L, ref, usada) {
  if (usada.has(L) || CLASES_PARADA.has(L.clase) || CLASES_SALTO.has(L.clase)) return null;
  const tolX = (L.nivel === 'C' ? 3 : 2) * L.charW;
  const izq = ref.conceptoX0 - tolX;
  const der = Number.isFinite(ref.importesX0) ? ref.importesX0 + L.charW : Infinity;
  const dentro = [];
  for (const w of L.palabras) {
    if (w.x0 >= izq && w.x1 <= der) dentro.push(w);
    else if (w.x1 <= izq + tolX) {
      // a la izquierda solo se admite una fecha (la fecha valor debajo de la fecha)
      const f = L.campos.find((c) => c.tipo === 'fecha' && w.x0 >= c.x0 - 0.01 && w.x1 <= c.x1 + 0.01);
      if (!f) return null;
    } else return null;
  }
  if (!dentro.length) return null;
  const texto = dentro.map((w) => w.t).join(' ');
  if (!RE_LETRA.test(texto) && !/\d{4,}/.test(texto)) return null;
  if (L.nivel !== 'C' && ref.altoConcepto > 0) {
    const r = mediana(dentro.map((w) => w.y1 - w.y0)) / ref.altoConcepto;
    if (r < 0.7 || r > 1.4) return null;
  }
  return { t: texto, ws: dentro };
}

function unirConceptos(lineas, cands) {
  const usada = new Set(cands.map((c) => c.linea));
  const indice = new Map(lineas.map((L, i) => [L, i]));
  // 1) Las líneas de concepto que hay entre cada movimiento y el siguiente
  const tramos = [];
  for (let a = 0; a < cands.length; a++) {
    const A = cands[a], B = cands[a + 1];
    const ia = indice.get(A.linea);
    const mismaPagina = B && B.linea.pagina === A.linea.pagina;
    const fin = mismaPagina ? indice.get(B.linea) : lineas.length;
    const entre = [];
    let cortado = false;
    let yPrev = A.linea.y;
    for (let i = ia + 1; i < fin; i++) {
      const L = lineas[i];
      if (L.pagina !== A.linea.pagina) break;
      if (CLASES_SALTO.has(L.clase) || L.clase === 'fecha_sola') continue;
      const t = textoDeContinuacion(L, A, usada);
      // Texto fuera de la tabla, a la izquierda de la columna de concepto (el pie legal en vertical de algunos
      // bancos): no corta el concepto, se salta
      if (t === null && L.palabras.length && L.palabras.every((w) => w.x1 <= A.conceptoX0 - L.charW) && !L.campos.some((c) => c.tipo === 'fecha' || c.tipo === 'importe')) continue;
      if (t === null || L.y - yPrev > 2.5 * L.espaciado) { cortado = true; break; }
      entre.push({ L, ...t });
      yPrev = L.y;
    }
    tramos.push({ A, B, mismaPagina, entre, cortado });
  }
  // 2) ¿Celdas centradas en vertical? Entonces la primera línea de debajo de cada movimiento queda a media línea
  //    (y la primera del siguiente concepto, por encima de su fecha). Se mira en todo el documento a la vez.
  //    Se compara lo que baja la primera línea desde la fecha con lo que hay entre dos líneas del mismo concepto:
  //    centradas, la mitad más o menos (4 frente a 10); alineadas arriba, lo mismo (10 frente a 10).
  const medias = [];
  for (const { A, entre } of tramos) {
    if (entre.length < 2) continue;
    const interlinea = entre[1].L.y - entre[0].L.y;
    if (interlinea > 0) medias.push((entre[0].L.y - A.linea.y) / interlinea);
  }
  // Con alinear arriba nunca baja media línea; con 2 líneas centradas, sí. Basta con que pase en una cuarta parte
  // (los conceptos de 3 líneas centrados bajan una línea entera y se parecen a los alineados arriba).
  const medias_ = medias.filter((x) => x < 0.7).length;
  const centradas = medias_ >= 2 && medias_ >= 0.25 * medias.length;
  // 3) Reparto
  for (const { A, B, mismaPagina, entre, cortado } of tramos) {
    let paraA = entre, paraB = [];
    if (centradas && mismaPagina && entre.length) {
      // cada línea va con el movimiento que tiene más cerca
      paraA = entre.filter((e) => e.L.y - A.linea.y <= B.linea.y - e.L.y);
      paraB = entre.filter((e) => e.L.y - A.linea.y > B.linea.y - e.L.y);
    } else if (mismaPagina && !cortado && entre.length) {
      // ¿celdas centradas en vertical? el hueco más grande separa las líneas de A de las de B
      const ys = [A.linea.y, ...entre.map((e) => e.L.y), B.linea.y];
      const huecos = [];
      for (let i = 1; i < ys.length; i++) huecos.push(ys[i] - ys[i - 1]);
      let jMax = 0;
      for (let j = 1; j < huecos.length; j++) if (huecos[j] > huecos[jMax]) jMax = j;
      const otros = huecos.filter((_, j) => j !== jMax);
      const ref = mediana(otros);
      const factor = B.sinConcepto ? 1.25 : 1.5;
      if (jMax < huecos.length - 1 && ref > 0 && huecos[jMax] > factor * ref && (B.sinConcepto || jMax > 0)) {
        paraA = entre.slice(0, jMax);
        paraB = entre.slice(jMax);
      }
    }
    for (const e of paraA) { A.sufijo.push({ t: e.t, ws: e.ws }); usada.add(e.L); e.L.continuacion = true; }
    for (const e of paraB) { B.prefijo.push({ t: e.t, ws: e.ws }); usada.add(e.L); e.L.continuacion = true; }
  }
  // primera fila de cada página con el concepto encima (celdas centradas)
  for (let a = 0; a < cands.length; a++) {
    const A = cands[a];
    if (!A.sinConcepto || A.prefijo.length) continue;
    const ia = indice.get(A.linea);
    const L = lineas[ia - 1];
    if (!L || L.pagina !== A.linea.pagina || A.linea.y - L.y > 1.2 * L.espaciado) continue;
    const t = textoDeContinuacion(L, A, usada);
    if (t !== null) { A.prefijo.push(t); usada.add(L); L.continuacion = true; }
  }
}

// ───────────────────────── 7b. capturas de apps: dos líneas y cabeceras de día ─────────────────────────
//
// En las apps cada movimiento suele ocupar dos líneas: concepto e importe arriba; fecha y saldo (o la categoría,
// o la hora) debajo, en gris. Otras veces la fecha va como cabecera de un grupo de días («Hoy», «Ayer»,
// «Lunes, 2 de marzo», «2 de marzo · 3 movimientos»). Aquí cada línea recibe un papel:
//   P  concepto con importe y sin fecha        D  fecha sola (con hora, «Saldo» y saldo, o «· 3 movimientos»)
//   B  «Saldo 1.234,56 €» sin fecha            T  solo texto (categoría, hora, concepto partido)
//   M  movimiento entero en una línea
// y cada P se completa con la fecha y el saldo de su D, o con la fecha de la cabecera de día que tiene encima.

const RE_CUENTA_DIA = /^\d{1,4} (?:MOVIMIENTOS?|MOVIMENTS?|TRANSACCIONES|TRANSACCION|TRANSACCIONS|TRANSACCIO|TRANSACTIONS?|OPERACIONES|OPERACION|OPERACIONS|OPERACIO|APUNTES?|PAGOS?|COMPRAS?|CARGOS?|PAYMENTS?)$/;
const PALABRAS_SALDO = new Set(['SALDO', 'BALANCE', 'SALDO DISPONIBLE', 'AVAILABLE', 'DISPONIBLE']);
const RE_HORA_TEXTO = /^(?:\d{1,2}[:.]\d{2}(?::\d{2})?(?: ?[AP]M)?)$/;

function textoDeCampo(f) {
  return normalizar(f.orig ?? '').replace(/[^A-Z0-9: ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Papel de una línea en una captura de app, o null si no cuenta (títulos, saldos generales, repetidas). */
function papelApp(L) {
  if (L.clase === 'repetida' || L.clase === 'vacia' || L.clase === 'titulo' || L.clase === 'titulo_resto' || L.clase === 'pagina') return null;
  if (L.clase === 'saldo' && L.etiquetas?.some((e) => e.tipo !== 'resumen')) return null; // saldo inicial, final o disponible
  const fechas = [], importes = [], textos = [];
  let relativa = false, cuenta = false, etiquetaSaldo = false;
  L.campos.forEach((f) => {
    if (f.tipo === 'fecha') {
      fechas.push(f);
      if (RELATIVAS.has(L.palabras[f.i0].n)) relativa = true;
      return;
    }
    if (f.tipo === 'importe') { if (f.incrustado) textos.push(f); else importes.push(f); return; }
    if (f.tipo !== 'texto') return;
    const t = textoDeCampo(f);
    if (!t) return;
    if (RE_HORA_TEXTO.test(t)) return; // la hora no dice nada del movimiento
    if (PALABRAS_SALDO.has(t)) { etiquetaSaldo = true; return; }
    if (RE_CUENTA_DIA.test(t)) { cuenta = true; return; }
    if (DIAS_SEMANA.has(t)) return;
    textos.push(f);
  });
  const conTexto = textos.some((f) => RE_LETRA.test(f.orig));
  if (fechas.length && !conTexto && importes.length <= 1) {
    return { tipo: 'D', fecha: fechas[0], importe: importes[0] ?? null, relativa, cuenta, etiquetaSaldo };
  }
  // una línea con fecha, un texto corto y una cifra: un movimiento entero… o la línea de debajo de un concepto
  // («12 mar · Tarjeta   Saldo 2.391,13 €»). Lo decide candidatosApp mirando la línea de encima.
  if (fechas.length && L.clase === 'mov') {
    const corto = importes.length === 1 && textos.every((f) => f.tipo === 'texto') && textos.map((f) => f.orig).join(' ').length <= 25;
    return { tipo: 'M', fecha: fechas[0], importe: importes[0] ?? null, textos, corto, relativa, cuenta, etiquetaSaldo };
  }
  if (!fechas.length && importes.length && (etiquetaSaldo || L.clase === 'saldo') && !conTexto) return { tipo: 'B', importe: importes[importes.length - 1] };
  if (!fechas.length && importes.length && conTexto) return { tipo: 'P', importes, textos };
  if (!fechas.length && !importes.length && conTexto) {
    // «Correos  -6S,7B €»: el último trozo, a la derecha y con cifras, puede ser un importe que no se deja leer
    const u = textos[textos.length - 1];
    const ilegible = L.nivel === 'C' && textos.length >= 2 && u.celda !== textos[0].celda && /\d/.test(u.orig) && (u.orig.match(/[\d/]/g) || []).length >= 2
      && u.orig.replace(/[^A-Za-z]/g, '').length <= 2 && u.x0 > 0.5 * (L.anchoPagina || Infinity) ? u : null;
    return { tipo: 'T', textos, ilegible };
  }
  return null;
}

// Icono redondo con la inicial a la izquierda del concepto: el OCR lo lee como «O», «9», «(a)»… Si casi todas las
// líneas de concepto empiezan con un trozo corto separado del resto, a la misma altura, se quita.
function quitarIconos(ps) {
  const conIcono = [];
  for (const p of ps) {
    const f = p.textos[0];
    if (!f) continue;
    const W = p.L.palabras;
    // la primera palabra: corta, y mucho más alta que el texto (el círculo entero) o bastante separada del concepto
    const w0 = W[f.i0], w1 = f.i1 > f.i0 ? W[f.i0 + 1] : p.textos[1] ? W[p.textos[1].i0] : null;
    if (!w1 || w0.t.replace(/[()]/g, '').length > 3) continue;
    const altoTexto = mediana(W.filter((w) => w !== w0).map((w) => w.y1 - w.y0));
    if (w0.y1 - w0.y0 < 1.5 * altoTexto && w1.x0 - w0.x1 < 1.5 * p.L.charW) continue;
    conIcono.push({ p, w0, w1 });
  }
  if (conIcono.length < Math.max(2, 0.5 * ps.length)) return;
  const xIcono = mediana(conIcono.map((o) => o.w0.x0)), xTexto = mediana(conIcono.map((o) => o.w1.x0));
  for (const { p, w0, w1 } of conIcono) {
    if (Math.abs(w0.x0 - xIcono) > 3 * p.L.charW || Math.abs(w1.x0 - xTexto) > 3 * p.L.charW) continue;
    const f = p.textos[0];
    if (f.i1 > f.i0) {
      const P = p.L.palabras;
      p.textos = [{ ...f, i0: f.i0 + 1, x0: P[f.i0 + 1].x0, orig: unirTexto(P, f.i0 + 1, f.i1) }, ...p.textos.slice(1)];
    } else p.textos = p.textos.slice(1);
  }
}

function candidatoApp(p, d, debajo, hayDosImportes) {
  const L = p.L;
  const fs = p.importes.slice().sort((a, b) => a.x0 - b.x0);
  let importe = fs[fs.length - 1] ?? null, saldo = null;
  if (d?.importe) saldo = d.importe;
  else if (p.saldo) saldo = p.saldo;
  else if (fs.length >= 2 && hayDosImportes) { importe = fs[fs.length - 2]; saldo = fs[fs.length - 1]; }
  // los importes que no son ni el importe ni el saldo van al concepto, en su sitio
  const sobrantes = fs.filter((f) => f !== importe && f !== saldo);
  const partes = [...p.textos, ...sobrantes].sort((a, b) => a.x0 - b.x0).map((f) => f.orig);
  const campoFecha = d?.fecha ?? null;
  return {
    linea: L, fecha: campoFecha ? campoFecha.parcial : p.fechaDia?.parcial ?? null, campoFecha: campoFecha ?? p.fechaDia ?? null,
    fechaValor: null, campoFechaValor: null, heredada: false, prefijo: [], sufijo: debajo.sufijo, partes, palabrasPrincipal: null,
    extra: debajo.extra, columnas: null, importe, cargo: null, abono: null, saldo,
    sinImporte: !importe, textoImporte: p.ilegible?.orig ?? null,
    divisa: !importe ? null : importe.divisa ?? (L.campos[L.campos.indexOf(importe) + 1]?.tipo === 'divisa' ? L.campos[L.campos.indexOf(importe) + 1].divisa : null),
    criticos: [campoFecha ?? p.fechaDia, importe, saldo].filter(Boolean),
    textoOrigen: d ? `${L.texto} · ${d.L.texto}` : L.texto,
    relativa: Boolean(d?.relativa || (!d && p.relativaDia)),
  };
}

// Con saldo en las líneas de fecha: ¿con qué emparejamiento encadenan los saldos con los importes?
function preferenciaPorSaldo(papeles) {
  const cuenta = (lado) => {
    const pares = [];
    for (let k = 0; k < papeles.length; k++) {
      const p = papeles[k];
      if (p.tipo !== 'P') continue;
      const d = lado === 'debajo' ? papeles[k + 1] : papeles[k - 1];
      if (!d || d.tipo !== 'D' || !d.importe) continue;
      pares.push([Math.abs(aCentimos(p.importes[p.importes.length - 1].valor)), aCentimos(d.importe.valor)]);
    }
    let n = 0;
    for (let i = 1; i < pares.length; i++) {
      const dif = Math.abs(pares[i][1] - pares[i - 1][1]);
      if (dif === pares[i][0] || dif === pares[i - 1][0]) n++;
    }
    return n;
  };
  const a = cuenta('debajo'), b = cuenta('encima');
  return a > b ? 'debajo' : b > a ? 'encima' : null;
}

/**
 * Movimientos de una captura de app. Devuelve null si el documento no tiene esa forma
 * (y entonces se lee como una tabla).
 */
function candidatosApp(lineas) {
  const papeles = [];
  for (const L of lineas) {
    const a = papelApp(L);
    if (!a) continue;
    a.L = L;
    papeles.push(a);
  }
  // fecha con un texto corto en letra más pequeña justo debajo de un concepto con importe: es su línea de debajo
  // (la categoría o «Tarjeta» van con el concepto, aparte)
  const altoDe = (L, campos) => mediana(campos.flatMap((f) => L.palabras.slice(f.i0, f.i1 + 1)).map((w) => w.y1 - w.y0));
  for (let k = 1; k < papeles.length; k++) {
    const a = papeles[k], p = papeles[k - 1];
    if (a.tipo !== 'M' || !a.corto || p.tipo !== 'P' || p.L.pagina !== a.L.pagina || a.L.y - p.L.y > 2.6 * p.L.alto) continue;
    if (altoDe(a.L, [a.fecha, ...a.textos]) >= 0.9 * altoDe(p.L, p.textos)) continue;
    Object.assign(a, { tipo: 'D', etiqueta: a.textos.map((f) => f.orig).join(' ') });
  }
  let nP = 0, nD = 0, nM = 0;
  for (const a of papeles) {
    if (a.tipo === 'P') nP++;
    else if (a.tipo === 'D') nD++;
    else if (a.tipo === 'M') nM++;
  }
  if (nP < 1 || nD < 1 || nP <= nM) return null;

  // ¿cada fecha va debajo de su concepto (dos líneas) o encima (cabecera de día)? Primero lo que dice cada una
  // por la distancia a sus vecinas; las dudosas siguen a la mayoría, al saldo, o a cómo empieza y acaba la lista.
  const Ds = papeles.filter((a) => a.tipo === 'D');
  const indice = new Map(papeles.map((a, i) => [a, i]));
  const vecino = (a, paso) => { const b = papeles[indice.get(a) + paso]; return b && b.L.pagina === a.L.pagina ? b : null; };
  let porGrupo = 0, solos = 0, votoDebajo = 0, votoEncima = 0;
  for (const d of Ds) {
    // cuántos conceptos hay entre esta fecha y la siguiente
    let n = 0;
    for (let k = indice.get(d) + 1; k < papeles.length && papeles[k].tipo !== 'D' && papeles[k].L.pagina === d.L.pagina; k++) if (papeles[k].tipo === 'P') n++;
    if (n >= 2) porGrupo++;
    else if (n === 1) solos++;
    const arriba = vecino(d, -1), abajo = vecino(d, 1);
    const gArriba = arriba ? d.L.y - arriba.L.y : Infinity, gAbajo = abajo ? abajo.L.y - d.L.y : Infinity;
    if (d.cuenta) d.lado = 'encima'; // «2 de marzo · 3 movimientos» solo puede ser una cabecera
    else if (arriba && (arriba.tipo === 'P' || arriba.tipo === 'T' || arriba.tipo === 'B') && gArriba < 0.8 * gAbajo) d.lado = 'debajo';
    else if (abajo && abajo.tipo === 'P' && gAbajo < 0.8 * gArriba) d.lado = 'encima';
    else d.lado = null;
    if (d.lado === 'debajo') votoDebajo++;
    else if (d.lado === 'encima' && !d.cuenta) votoEncima++;
  }
  let general;
  if (porGrupo > solos) general = 'encima'; // varios conceptos por fecha: son cabeceras de día
  else if (votoDebajo !== votoEncima) general = votoDebajo > votoEncima ? 'debajo' : 'encima';
  else {
    const s = preferenciaPorSaldo(papeles);
    if (s) general = s;
    else {
      const extremos = papeles.filter((a) => a.tipo === 'P' || a.tipo === 'D');
      const primera = extremos[0], ultima = extremos[extremos.length - 1];
      general = primera?.tipo === 'P' || ultima?.tipo === 'D' ? 'debajo' : 'encima';
    }
  }
  for (const d of Ds) if (!d.lado) d.lado = general;
  const debajo = Ds.filter((d) => d.lado === 'debajo').length > Ds.length / 2;

  const Ps = papeles.filter((a) => a.tipo === 'P');
  quitarIconos(Ps);
  // ¿la mayoría de líneas de concepto traen dos importes (importe y saldo)?
  const hayDosImportes = Ps.filter((p) => p.importes.length >= 2).length >= 0.5 * Ps.length;

  // fechas y saldos que van con cada concepto
  let fechaDia = null, relativaDia = false, perdidas = 0;
  const asignada = new Map(); // P → D
  for (let k = 0; k < papeles.length; k++) {
    const a = papeles[k];
    if (k > 0 && papeles[k - 1].L.pagina !== a.L.pagina) { fechaDia = null; relativaDia = false; }
    if (a.tipo === 'D') {
      if (a.lado === 'debajo') {
        // la fecha es del concepto de encima (solo con categorías o «Saldo» en medio)
        let j = k - 1;
        const encima = papeles[j];
        // justo encima, un concepto cuyo importe no se deja leer: el saldo dirá cuánto es
        if (encima && encima.tipo === 'T' && encima.ilegible && a.importe && encima.L.pagina === a.L.pagina) {
          Object.assign(encima, { tipo: 'P', importes: [], textos: encima.textos.filter((f) => f !== encima.ilegible) });
          Ps.push(encima);
        }
        let conTexto = false;
        while (j >= 0 && (papeles[j].tipo === 'T' || papeles[j].tipo === 'B') && papeles[j].L.pagina === a.L.pagina) { conTexto ||= papeles[j].tipo === 'T'; j--; }
        const p = papeles[j];
        if (p && p.tipo === 'P' && p.L.pagina === a.L.pagina && !asignada.has(p) && a.L.y - p.L.y <= 4 * Math.max(p.L.alto, a.L.alto)) asignada.set(p, a);
        // una fecha cuyo concepto (encima) no se ha podido leer: un movimiento perdido, se cuenta para avisar. Si no hay
        // ningún concepto antes, es la primera de la captura y el suyo se ha quedado fuera de la imagen: no se cuenta.
        else if (conTexto && p && p.tipo === 'P') perdidas++;
        continue;
      }
      fechaDia = a.fecha;
      relativaDia = a.relativa;
      // fecha encima de un solo concepto con un importe: es su saldo, salvo que sea el mismo importe (total del día)
      if (a.importe && !a.cuenta) {
        let j = k + 1;
        while (j < papeles.length && papeles[j].tipo === 'T') j++;
        const p = papeles[j], tras = papeles[j + 1];
        if (p && p.tipo === 'P' && (!tras || tras.tipo === 'D') && Math.abs(aCentimos(a.importe.valor)) !== Math.abs(aCentimos(p.importes[p.importes.length - 1].valor))) p.saldo = a.importe;
      }
      continue;
    }
    if (a.tipo === 'P') { a.fechaDia = fechaDia; a.relativaDia = relativaDia; continue; }
    if (a.tipo === 'B') {
      // «Saldo 1.234,56 €» debajo de un concepto
      let j = k - 1;
      while (j >= 0 && papeles[j].tipo === 'T') j--;
      const p = papeles[j];
      if (p && p.tipo === 'P' && !p.saldo && p.L.pagina === a.L.pagina) p.saldo = a.importe;
    }
  }

  // líneas de texto justo debajo del concepto, en su columna: con letra más pequeña son la categoría (va aparte,
  // con « · »); con la misma letra, el concepto partido en dos líneas (va seguido)
  const sub = new Map();
  const altoTexto = (L, campos) => mediana(campos.flatMap((f) => L.palabras.slice(f.i0, f.i1 + 1)).map((w) => w.y1 - w.y0));
  for (let k = 0; k < papeles.length; k++) {
    const p = papeles[k];
    if (p.tipo !== 'P') continue;
    const x0 = p.textos.length ? p.textos[0].x0 : p.L.palabras[0].x0;
    const xImporte = Math.min(...p.importes.map((f) => f.x0));
    const altoP = p.textos.length ? altoTexto(p.L, p.textos) : p.L.alto;
    let yPrev = p.L.y;
    const lista = { sufijo: [], extra: [] };
    for (let j = k + 1; j < papeles.length; j++) {
      const t = papeles[j];
      if (t.tipo !== 'T' || t.L.pagina !== p.L.pagina || t.L.y - yPrev > 2.6 * p.L.alto) break;
      const ws = t.textos;
      if (!ws.length || ws[0].x0 < x0 - 2 * p.L.charW || ws[0].x0 > xImporte) break;
      const texto = ws.map((f) => f.orig).join(' ').replace(/\s+/g, ' ').trim();
      if (texto && !RE_HORA_TEXTO.test(texto)) {
        if (altoTexto(t.L, ws) < 0.85 * altoP) lista.extra.push(texto);
        else lista.sufijo.push({ t: texto, ws: null });
      }
      yPrev = t.L.y;
    }
    sub.set(p, lista);
  }

  const cands = [];
  let sinFecha = 0;
  Ps.sort((a, b) => indice.get(a) - indice.get(b));
  for (const p of Ps) {
    const d = asignada.get(p) ?? null;
    if (!d && !p.fechaDia) { sinFecha++; continue; }
    const debajoDe = sub.get(p) ?? { sufijo: [], extra: [] };
    if (d?.etiqueta && !RE_HORA_TEXTO.test(d.etiqueta)) debajoDe.extra.push(d.etiqueta.replace(/^[\s·•|\-–—]+|[\s·•|\-–—]+$/g, ''));
    cands.push(candidatoApp(p, d, debajoDe, hayDosImportes));
  }
  const modo = debajo ? 'dos_lineas' : 'dias';
  return { cands, modo, sinFecha: sinFecha + perdidas };
}

// ───────────────────────── 8. años, orden, saldos y signos ─────────────────────────

function aIso(parcial, anio) {
  return fechaValida(anio, parcial.mes, parcial.dia) ? aISO(anio, parcial.mes, parcial.dia) : null;
}

function ponerAnio(parcial, ref) {
  if (!parcial) return null;
  if (parcial.anio !== null) return aIso(parcial, parcial.anio);
  if (ref.periodo) {
    const { desde, hasta } = ref.periodo;
    const af = +hasta.slice(0, 4);
    const posibles = [af, af - 1, af + 1].map((a) => aIso(parcial, a)).filter(Boolean);
    const dentro = posibles.filter((iso) => diasEntre(desde, iso) >= -3 && diasEntre(iso, hasta) >= -3);
    if (dentro.length) return dentro.sort((x, y) => (x <= hasta ? 0 : 1) - (y <= hasta ? 0 : 1) || (x < y ? 1 : -1))[0];
    return completarAnio(parcial, hasta, 0);
  }
  return completarAnio(parcial, ref.fin, ref.tolerancia);
}

// La fecha valor se pone en el año que la deja más cerca de la fecha de operación
function anioCercano(parcial, fechaISO) {
  if (!parcial || !fechaISO) return null;
  if (parcial.anio !== null) return aIso(parcial, parcial.anio);
  const a = +fechaISO.slice(0, 4);
  let mejor = null;
  for (const an of [a - 1, a, a + 1]) {
    const iso = aIso(parcial, an);
    if (iso && (!mejor || Math.abs(diasEntre(fechaISO, iso)) < Math.abs(diasEntre(fechaISO, mejor)))) mejor = iso;
  }
  return mejor;
}

function ordenDe(cands) {
  let asc = 0, desc = 0;
  for (let i = 1; i < cands.length; i++) {
    const d = diasEntre(cands[i - 1].iso, cands[i].iso);
    if (d > 0) asc++;
    else if (d < 0) desc++;
  }
  return desc > asc ? 'descendente' : asc > desc ? 'ascendente' : null;
}

function resolverBloque(bloque, delta) {
  if (bloque.some((m) => m.abs === null)) return; // un importe sin leer: el saldo no basta para los signos
  const desconocidos = bloque.filter((m) => m.signo === null);
  if (!desconocidos.length || desconocidos.length > 12) return;
  let resto = delta;
  for (const m of bloque) if (m.signo !== null) resto -= m.signo * m.abs;
  const k = desconocidos.length;
  let soluciones = 0, sol = 0;
  for (let mask = 0; mask < (1 << k) && soluciones < 2; mask++) {
    let s = 0;
    for (let b = 0; b < k; b++) s += ((mask >> b) & 1 ? 1 : -1) * desconocidos[b].abs;
    if (s === resto) { soluciones++; sol = mask; }
  }
  if (soluciones !== 1) return;
  desconocidos.forEach((m, b) => { m.signo = (sol >> b) & 1 ? 1 : -1; m.porSaldo = true; });
}

function resolverPorSaldo(enOrden, saldoInicialC, saldoFinalC) {
  let prev = saldoInicialC;
  let pendientes = [];
  for (const m of enOrden) {
    pendientes.push(m);
    if (m.saldoC === null) continue;
    if (prev !== null) resolverBloque(pendientes, m.saldoC - prev);
    prev = m.saldoC;
    pendientes = [];
  }
  if (pendientes.length && prev !== null && saldoFinalC !== null) resolverBloque(pendientes, saldoFinalC - prev);
}

/** Cifras de un texto leído, con las confusiones típicas del OCR ya corregidas («-65,/8» → «6578»). */
function digitosLeidos(t) {
  return String(t ?? '').replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/\//g, '7').replace(/\D/g, '');
}

function distanciaCorta(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return Math.max(a.length, b.length) - i - j <= 1 ? 1 : 2;
}

/**
 * Fotos: el saldo de una fila menos el de la anterior es su importe exacto. Con eso, en orden cronológico:
 * - el importe que no se ha podido leer, que ha salido con otro signo, o cuyas cifras se parecen a las del saldo
 *   (una cifra distinta, como un 7 leído como 1), se propone con la cifra del saldo: dudoso y con lo leído en «original»;
 * - el importe que encaja con el saldo anterior queda comprobado (no es dudoso aunque el OCR dudara).
 * Para proponer, uno de los dos saldos tiene que encajar también con su otro vecino. Una cifra leída entera que no
 * se parece no se toca: si falta una fila entre las dos, la diferencia sería la suma de dos movimientos.
 */
function revisarConSaldos(cron, sIni, sFin) {
  const n = cron.length;
  const valor = (f) => (f.abs === null || f.signo === null ? null : f.signo * f.abs);
  const previo = (i) => (i > 0 ? cron[i - 1].saldoC : sIni);
  const encaja = cron.map((f, i) => {
    const p = previo(i), v = valor(f);
    return f.saldoC !== null && p !== null && v !== null && p + v === f.saldoC;
  });
  // el saldo de la fila i se confirma si encaja con el importe de su fila o con el de la siguiente
  const saldoBueno = (i) => i >= 0 && cron[i].saldoC !== null && (encaja[i] || (i + 1 < n ? encaja[i + 1] : sFin !== null && cron[i].saldoC === sFin));
  for (let i = 0; i < n; i++) {
    const f = cron[i];
    if (f.c.linea.nivel !== 'C') continue;
    if (encaja[i]) { f.verificada = true; continue; }
    const p = previo(i);
    if (f.saldoC === null || p === null) continue;
    const delta = f.saldoC - p;
    if (delta === 0) continue;
    const v = valor(f);
    const campo = f.c.importe || f.c.cargo || f.c.abono;
    const leido = campo?.orig ?? f.c.textoImporte ?? null;
    const saldosBuenos = saldoBueno(i - 1) || saldoBueno(i);
    let proponer = false;
    if (f.abs === null) proponer = saldosBuenos;
    else if (f.abs === Math.abs(delta)) proponer = saldosBuenos; // solo cambia el signo
    else {
      // una cifra que se ha leído entera y no se parece a la del saldo no se cambia: lo más probable es que falte
      // una fila entre las dos (y la diferencia sería la suma de dos movimientos). La validación lo dirá.
      const parecido = leido !== null && distanciaCorta(digitosLeidos(leido), String(Math.abs(delta))) <= 1;
      proponer = saldosBuenos && parecido;
    }
    if (!proponer) continue;
    f.original = { importe: v === null ? null : v / 100, texto: leido };
    f.abs = Math.abs(delta);
    f.signo = Math.sign(delta);
    f.dudoso = true;
    f.propuesta = true;
  }
}

// Cuántos pares consecutivos cuadran |saldo − saldo anterior| = |importe| en ese orden
function encajes(enOrden) {
  let n = 0;
  for (let i = 1; i < enOrden.length; i++) {
    const a = enOrden[i - 1], b = enOrden[i];
    if (a.saldoC !== null && b.saldoC !== null && Math.abs(b.saldoC - a.saldoC) === b.abs) n++;
  }
  return n;
}

function valorConMarca(f) {
  if (!f) return null;
  let v = f.valor;
  if (f.marca && MARCAS[f.marca] !== undefined) v = Math.abs(v) * MARCAS[f.marca];
  return v;
}

function signoDeCampo(f) {
  if (!f) return 0;
  if (f.marca && MARCAS[f.marca] !== undefined) return MARCAS[f.marca];
  return f.signo || 0;
}

// ───────────────────────── mapeo hecho por la persona ─────────────────────────

/** Columnas comunes a varias líneas: unión de los huecos ocupados por las celdas. */
function rejilla(lineas) {
  const tramos = [];
  for (const L of lineas) {
    const cs = celdasDe(L);
    if (cs.length < 2) continue;
    for (const c of cs) if (c.x1 - c.x0 <= 0.4 * (L.anchoPagina || Infinity)) tramos.push([c.x0, c.x1]);
  }
  if (!tramos.length) for (const L of lineas) for (const c of celdasDe(L)) tramos.push([c.x0, c.x1]);
  tramos.sort((a, b) => a[0] - b[0]);
  const cols = [];
  for (const [a, b] of tramos) {
    const u = cols[cols.length - 1];
    if (u && a <= u[1]) u[1] = Math.max(u[1], b);
    else cols.push([a, b]);
  }
  return cols;
}

function celdasDe(L) {
  const cs = [];
  for (const w of L.palabras) {
    const u = cs[cs.length - 1];
    if (u && u.celda === w.celda) { u.x1 = w.x1; u.t += ' ' + w.t; u.ws.push(w); }
    else cs.push({ celda: w.celda, x0: w.x0, x1: w.x1, t: w.t, ws: [w] });
  }
  return cs;
}

function filaEnRejilla(L, cols) {
  const fila = cols.map(() => '');
  for (const c of celdasDe(L)) {
    let mejor = 0, mejorP = -Infinity;
    cols.forEach(([a, b], j) => {
      const ov = Math.min(b, c.x1) - Math.max(a, c.x0);
      const p = ov > 0 ? ov : -Math.min(Math.abs(a - c.x1), Math.abs(c.x0 - b));
      if (p > mejorP) { mejorP = p; mejor = j; }
    });
    fila[mejor] = fila[mejor] ? fila[mejor] + ' ' + c.t : c.t;
  }
  return fila;
}

function lineasDeMuestra(lineas) {
  const utiles = lineas.filter((L) => L.palabras.length && L.clase !== 'repetida');
  const ini = utiles.findIndex((L) => L.clase === 'titulo' || L.campos.some((f) => f.tipo === 'fecha' || f.tipo === 'importe'));
  return utiles.slice(Math.max(0, ini), Math.max(0, ini) + 10);
}

function candidatosDeMapeo(lineas, mapeo, cx) {
  const cols = rejilla(lineas.filter((L) => L.palabras.length && L.clase !== 'repetida'));
  const m = mapeo.columnas || {};
  const indices = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]).filter((j) => Number.isInteger(j) && j >= 0);
  const cands = [];
  let ultimo = null;
  for (const L of lineas) {
    if (!L.palabras.length || L.clase === 'repetida' || L.clase === 'saldo') { if (L.clase === 'saldo') ultimo = null; continue; }
    const fila = filaEnRejilla(L, cols);
    const celda = (j) => (Number.isInteger(j) && j >= 0 && j < fila.length ? fila[j] : '');
    const fecha = parseFechaParcial(celda(m.fecha), { orden: cx.orden, hoy: cx.hoy });
    const campoImporte = (j) => {
      const t = celda(j).trim();
      if (!t) return null;
      const v = parseImporte(t);
      return v === null ? null : { valor: v, signo: signoExplicito(t), divisa: divisaDe(t), texto: t, conf: null, corregido: false };
    };
    const importe = campoImporte(m.importe), cargo = campoImporte(m.cargo), abono = campoImporte(m.abono), saldo = campoImporte(m.saldo);
    const concepto = indices(m.concepto).map(celda).filter(Boolean).join(' · ');
    if (fecha && (importe || cargo || abono)) {
      const c = { linea: L, fecha, fechaValor: parseFechaParcial(celda(m.fecha_valor), { orden: cx.orden, hoy: cx.hoy }), heredada: false,
        prefijo: [], sufijo: [], partes: concepto ? [concepto] : [], extra: [], importe, cargo, abono, saldo,
        divisa: (celda(m.divisa).trim().toUpperCase().match(/^[A-Z]{3}$/) || [null])[0] || importe?.divisa || cargo?.divisa || abono?.divisa || null };
      c.criticos = [importe || cargo || abono, saldo].filter(Boolean);
      cands.push(c);
      ultimo = c;
    } else if (ultimo && !importe && !cargo && !abono && concepto && L.pagina === ultimo.linea.pagina) {
      ultimo.sufijo.push({ t: concepto, ws: null });
    }
  }
  return cands;
}

// ───────────────────────── reconstruir ─────────────────────────

export function reconstruir(paginas, ctx = {}) {
  const archivo = ctx.archivo ?? '';
  const nivelDoc = ctx.nivel === 'C' ? 'C' : 'B';
  const hoy = ctx.hoy || hoyISO();
  const avisos = [];
  const lista = Array.isArray(paginas) ? paginas : [];
  const resultadoVacio = (extra = {}) => ({ movimientos: [], saldo_inicial: null, saldo_final: null, fecha_inicial: null,
    fecha_final: null, avisos, necesita_mapeo: null, extra });

  // 1. líneas
  const lineas = [];
  for (const p of lista) {
    const nivel = p?.nivel === 'B' || p?.nivel === 'C' ? p.nivel : nivelDoc;
    for (const L of lineasDePagina(p, nivel)) lineas.push(L);
  }
  if (!lineas.length) return resultadoVacio({ lineas: 0 });

  // pre-pasada: orden día/mes y separador decimal del documento
  const cx = { hoy, orden: 'dmy', decimal: null };
  const fechasNum = [], cifras = [];
  for (const L of lineas) for (const w of L.palabras) {
    if (/^\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?$/.test(w.t)) fechasNum.push(w.t);
    else if (/^[-+(]?\d[\d.,]*\d[)-]?$/.test(w.t) && /[.,]/.test(w.t)) cifras.push(w.t);
  }
  cx.orden = inferirOrden(fechasNum);
  cx.decimal = inferirDecimal(cifras);
  cx.milesConSigno = cifras.some((t) => /\d[.,]\d{3}[.,]\d{2}\b/.test(t));

  // 2. campos y 3. clases
  for (const L of lineas) { L.campos = camposDeLinea(L, cx); L.clase = clasificar(L); }
  // títulos en dos líneas
  for (let i = 0; i < lineas.length - 1; i++) {
    const L = lineas[i], S = lineas[i + 1];
    if (L.clase !== 'titulo' || S.pagina !== L.pagina || S.y - L.y > 1.8 * Math.max(L.alto, S.alto)) continue;
    if ((S.clase === 'texto' || S.clase === 'titulo') && completarTitulos(L.titulos, S)) S.clase = 'titulo_resto';
  }
  const { periodo, emision } = buscarPeriodo(lineas, cx);
  quitarRepetidas(lineas, new Set(lineas.map((L) => L.pagina)).size);

  // saldos declarados (valores en la misma línea o debajo de la etiqueta)
  const declarados = [];
  for (let i = 0; i < lineas.length; i++) {
    const L = lineas[i];
    if (L.clase !== 'saldo') continue;
    const sinValor = [];
    L.etiquetas.forEach((e, k) => {
      const hasta = k + 1 < L.etiquetas.length ? L.etiquetas[k + 1].i0 : Infinity;
      const tras = L.campos.filter((f) => f.i0 > e.i1 && f.i0 < hasta);
      const valor = tras.find((f) => f.tipo === 'importe');
      const fecha = tras.find((f) => f.tipo === 'fecha' && (!valor || f.i0 < valor.i0));
      if (valor) declarados.push({ tipo: e.tipo, valor: valorConMarca(valor), fecha: fecha?.parcial ?? null, L });
      else sinValor.push({ e, fecha: fecha?.parcial ?? null });
    });
    const S = lineas[i + 1];
    if (sinValor.length && S && S.pagina === L.pagina && S.y - L.y <= 2.5 * L.espaciado && S.clase === 'solo_importes') {
      const libres = S.campos.filter((f) => f.tipo === 'importe');
      for (const { e, fecha } of sinValor) {
        let mejor = null, mejorP = -Infinity;
        for (const f of libres) {
          const ov = Math.min(e.x1, f.x1) - Math.max(e.x0, f.x0);
          const p = ov > 0 ? ov : -Math.abs((e.x0 + e.x1) / 2 - (f.x0 + f.x1) / 2);
          if (p > mejorP) { mejorP = p; mejor = f; }
        }
        if (mejor && mejorP > -10 * L.charW) { declarados.push({ tipo: e.tipo, valor: valorConMarca(mejor), fecha, L }); libres.splice(libres.indexOf(mejor), 1); }
      }
      S.clase = 'saldo_valores';
    }
  }

  // 5. movimientos candidatos
  let cands = [];
  let modo = null, porLinea = false, supuesto = false, hayTitulos = false, sinLeerTotal = 0;
  const mapeo = ctx.mapeo && ctx.mapeo.columnas ? ctx.mapeo : null;
  if (mapeo) {
    modo = 'mapeo';
    cands = candidatosDeMapeo(lineas, mapeo, cx);
  } else {
    // capturas de apps: concepto e importe en una línea y la fecha en otra (debajo, o de cabecera de día)
    const app = candidatosApp(lineas);
    if (app && app.cands.length) {
      modo = app.modo;
      cands = app.cands;
      sinLeerTotal += app.sinFecha;
    } else {
      modo = lineas.some((L) => L.clase === 'mov') ? 'tabla' : null;
      // secciones: cada fila de títulos manda sobre las filas que vienen debajo
      const secciones = new Map();
      let actual = { clave: '', titulos: null, cands: [], sinFecha: [] };
      secciones.set('', actual);
      for (let i = 0; i < lineas.length; i++) {
        const L = lineas[i];
        if (L.clase === 'titulo') {
          const clave = marcaDeTitulos(L.titulos, L.charW);
          if (!secciones.has(clave)) secciones.set(clave, { clave, titulos: L.titulos, cands: [], sinFecha: [] });
          actual = secciones.get(clave);
          hayTitulos = true;
          continue;
        }
        if (L.clase === 'mov') actual.cands.push(candidatoDeLinea(L, L.campos[L.iFecha], actual.titulos));
        else if (L.clase === 'importe_sin_fecha') actual.sinFecha.push(L);
      }
      for (const s of secciones.values()) {
        if (!s.cands.length) continue;
        const charW = mediana(s.cands.map((c) => c.linea.charW));
        const nivel = s.cands.some((c) => c.linea.nivel === 'C') ? 'C' : 'B';
        const r = rolesDeImportes(s.cands, s.titulos, charW, nivel);
        s.titulosUtiles = r.titulosAlineados ? s.titulos : null;
        s.columnasImporte = (r.grupos ?? []).filter((g) => g.rol === 'importe' || g.rol === 'cargo' || g.rol === 'abono').map((g) => [g.x0, g.x1]);
        porLinea ||= r.porLinea;
        supuesto ||= r.supuesto;
        // filas sin fecha con el importe en su columna: llevan la fecha de la fila de arriba
        if (modo === 'tabla' && r.grupos && s.sinFecha.length) {
          const columnas = r.grupos.filter((g) => g.rol === 'importe' || g.rol === 'cargo' || g.rol === 'abono' || g.rol === 'saldo');
          const tol = (nivel === 'C' ? 2.5 : 1.5) * charW;
          for (const L of s.sinFecha) {
            let enColumna = 0;
            for (const f of L.importes) {
              const g = columnas.find((g) => f.x1 >= g.x0 - tol && f.x1 <= g.x1 + tol);
              if (g) { f.rol = g.rol; enColumna++; } else f.rol = 'ruido';
            }
            if (enColumna && L.importes.some((f) => f.rol !== 'saldo' && f.rol !== 'ruido')) L.heredable = true;
          }
        }
      }
      // orden de lectura, con las filas heredadas en su sitio
      const todos = [];
      for (const s of secciones.values()) for (const c of s.cands) todos.push(c);
      const candDeLinea = new Map(todos.map((c) => [c.linea, c]));
      const titulosDe = new Map(), columnasDe = new Map();
      for (const s of secciones.values()) for (const c of s.cands) { titulosDe.set(c, s.titulosUtiles ?? null); columnasDe.set(c, s.columnasImporte); }
      const tituloEnPagina = new Map();
      for (const L of lineas) if (L.clase === 'titulo' && !tituloEnPagina.has(L.pagina)) tituloEnPagina.set(L.pagina, L.y);
      let previo = null;
      let heredadas = 0;
      for (const L of lineas) {
        const c = candDeLinea.get(L);
        if (c) { cands.push(c); previo = c; continue; }
        if (L.heredable && previo && previo.fecha) {
          const yT = tituloEnPagina.get(L.pagina);
          if (L.pagina === previo.linea.pagina || (yT !== undefined && yT < L.y)) {
            const nc = candidatoDeLinea(L, null, titulosDe.get(previo));
            nc.fecha = previo.fecha;
            nc.heredada = true;
            titulosDe.set(nc, titulosDe.get(previo));
            columnasDe.set(nc, columnasDe.get(previo));
            cands.push(nc);
            previo = nc;
            heredadas++;
            continue;
          }
        }
        if (L.clase === 'saldo') previo = null;
      }
      for (const c of cands) completarCandidato(c, titulosDe.get(c), columnasDe.get(c));
      cands = cands.filter((c) => c.importe || c.cargo || c.abono || c.sinImporte);
      if (heredadas) avisos.push(aviso('filas_fecha_de_arriba', { archivo, n: heredadas }));
      unirConceptos(lineas, cands);
      // líneas que empiezan por una fecha y no se han podido leer como movimiento: se dice
      const usadas = new Set(cands.map((c) => c.linea));
      let sinLeer = 0;
      for (const L of lineas) {
        if (usadas.has(L) || L.continuacion || L.clase === 'saldo' || L.clase === 'repetida' || L.clase === 'fecha_sola' || L.clase === 'titulo') continue;
        const f0 = L.campos[0];
        if (f0 && f0.tipo === 'fecha' && f0.parcial && L.campos.some((f) => f.tipo === 'texto')) sinLeer++;
      }
      if (sinLeer >= 3 && sinLeer > 0.2 * cands.length) sinLeerTotal += sinLeer;
    }
  }

  // filas de una en una (texto pegado de una web: fecha, concepto e importe en líneas distintas)
  if (!cands.length && !mapeo) {
    const vert = candidatosVerticales(lineas);
    if (vert.length >= 2) { cands = vert; modo = 'vertical'; }
  }

  if (!cands.length) {
    const muestra = lineasDeMuestra(lineas);
    const cols = rejilla(muestra);
    return {
      ...resultadoVacio({ lineas: lineas.length, modo: null }),
      fecha_inicial: periodo?.desde ?? null,
      fecha_final: periodo?.hasta ?? null,
      necesita_mapeo: { primeras_filas: muestra.map((L) => filaEnRejilla(L, cols)), total_filas: lineas.filter((L) => L.palabras.length).length },
    };
  }

  // años: periodo del documento, si no la última fecha completa, si no hoy
  let fechaRef = null;
  for (const c of cands) if (c.fecha && c.fecha.anio !== null) { const iso = aIso(c.fecha, c.fecha.anio); if (iso && (!fechaRef || iso > fechaRef)) fechaRef = iso; }
  if (emision && (!fechaRef || emision > fechaRef)) fechaRef = emision;
  const ref = periodo ? { periodo } : fechaRef ? { fin: fechaRef, tolerancia: 0 } : { fin: hoy, tolerancia: 1 };
  if (!periodo && !fechaRef && cands.some((c) => c.fecha && c.fecha.anio === null)) avisos.push(aviso('filas_sin_anio', { archivo }));
  for (const c of cands) {
    c.iso = ponerAnio(c.fecha, ref);
    c.isoValor = anioCercano(c.fechaValor, c.iso);
  }
  cands = cands.filter((c) => c.iso);
  if (!cands.length) return { ...resultadoVacio({ lineas: lineas.length, modo }), necesita_mapeo: null };
  const orden = ordenDe(cands);

  // saldos declarados → inicial y final
  const fechasMov = cands.map((c) => c.iso).sort();
  const minF = fechasMov[0], maxF = fechasMov[fechasMov.length - 1];
  const idxPrimera = lineas.indexOf(cands[0].linea), idxUltima = lineas.indexOf(cands[cands.length - 1].linea);
  const ini = [], finales = [];
  for (const d of declarados) {
    if (d.valor === null) continue;
    if (d.tipo === 'inicial') ini.push(d);
    else if (d.tipo === 'final') finales.push(d);
    else if (d.tipo === 'a_fecha' && d.fecha) {
      const iso = ponerAnio(d.fecha, ref);
      const pos = lineas.indexOf(d.L);
      if (!iso) continue;
      if (iso < minF || (iso === minF && pos < idxPrimera && orden !== 'descendente')) ini.push(d);
      else if (iso > maxF || (iso === maxF && pos > idxUltima && orden !== 'descendente')) finales.push(d);
    }
  }
  const desc = orden === 'descendente';
  const saldoInicial = ini.length ? (desc ? ini[ini.length - 1] : ini[0]).valor : null;
  const saldoFinal = finales.length ? (desc ? finales[0] : finales[finales.length - 1]).valor : null;

  // signos
  const nivelCands = cands.map((c) => c.linea.nivel);
  const filas = cands.map((c) => {
    const base = c.importe || null;
    let abs = 0, signo = null, dudoso = false, signoSupuesto = null;
    if (c.cargo || c.abono) {
      const vc = c.cargo ? Math.abs(aCentimos(valorConMarca(c.cargo))) : 0;
      const va = c.abono ? Math.abs(aCentimos(valorConMarca(c.abono))) : 0;
      if (vc && va) { abs = Math.abs(va - vc); signo = va >= vc ? 1 : -1; dudoso = true; }
      else if (vc || !va) { abs = vc; signo = -1; if (c.cargo && signoDeCampo(c.cargo) > 0) dudoso = true; }
      else { abs = va; signo = 1; if (c.abono && signoDeCampo(c.abono) < 0) dudoso = true; }
      if (supuesto) { signoSupuesto = signo; signo = null; }
    } else if (base) {
      abs = Math.abs(aCentimos(valorConMarca(base)));
      const s = signoDeCampo(base);
      signo = s || null;
    } else if (c.sinImporte) abs = null; // foto: el importe no se ha podido leer; quizá lo dé el saldo
    const sv = c.saldo ? valorConMarca(c.saldo) : null;
    return { c, abs, signo, dudoso, signoSupuesto, saldoC: sv === null ? null : aCentimos(sv), porSaldo: false };
  });
  // política del documento para importes sin signo en una sola columna
  const conImporte = filas.filter((f) => f.c.importe);
  const menos = conImporte.filter((f) => f.signo === -1).length, mas = conImporte.filter((f) => f.signo === 1).length;
  const politica = menos > 0 ? 1 : mas > 0 ? -1 : null;
  for (const f of filas) {
    if (f.c.importe && f.signo === null && politica !== null) {
      f.signo = politica;
      // en una foto, un importe sin signo entre otros con signo puede ser un «−» que no se ha leído
      if (f.c.linea.nivel === 'C' && menos > 0 && mas > 0) f.dudoso = true;
    }
  }
  const sIni = saldoInicial === null ? null : aCentimos(saldoInicial);
  const sFin = saldoFinal === null ? null : aCentimos(saldoFinal);
  // de lo más antiguo a lo más nuevo, para encadenar saldos
  let cron;
  if (orden === 'descendente') cron = filas.slice().reverse();
  else if (orden === 'ascendente') cron = filas;
  else cron = encajes(filas.slice().reverse()) > encajes(filas) ? filas.slice().reverse() : filas;
  if (filas.some((f) => f.signo === null && f.abs !== null)) resolverPorSaldo(cron, sIni, sFin);
  // fotos: lo que dice el saldo sobre cada importe (propuestas para lo que no se ha leído bien y cifras comprobadas)
  if (nivelCands.includes('C')) revisarConSaldos(cron, sIni, sFin);
  let sinSigno = 0, propuestas = 0, ilegibles = 0;
  for (const f of filas) {
    if (f.abs === null) { ilegibles++; continue; }
    if (f.propuesta) propuestas++;
    if (f.signo === null) {
      if (f.signoSupuesto !== null) f.signo = f.signoSupuesto;
      else { f.signo = -1; sinSigno++; }
      if (f.abs !== 0) f.dudoso = true;
    }
  }
  if (sinSigno) avisos.push(aviso('filas_signo_desconocido', { archivo, n: sinSigno }));
  if (supuesto && filas.some((f) => f.signoSupuesto !== null && !f.porSaldo)) avisos.push(aviso('filas_columnas_supuestas', { archivo }));
  if (propuestas) avisos.push(aviso('filas_importe_por_saldo', { archivo, n: propuestas }));
  // filas que parecen movimientos y no se han podido leer (sin fecha, sin importe ni saldo que lo dé…): un solo aviso
  if (sinLeerTotal + ilegibles) avisos.push(aviso('filas_sin_leer', { archivo, n: sinLeerTotal + ilegibles }));

  // fechas de foto con poca confianza: si encajan en el orden de sus vecinas, no se marcan
  const leidas = filas.filter((f) => f.abs !== null);
  const fechaCoherente = new Map();
  leidas.forEach((f, i) => {
    const a = leidas[i - 1]?.c.iso, b = leidas[i + 1]?.c.iso, x = f.c.iso;
    const ok = orden === 'descendente' ? (!a || a >= x) && (!b || x >= b) : orden === 'ascendente' ? (!a || a <= x) && (!b || x <= b) : x === a || x === b;
    fechaCoherente.set(f, ok);
  });

  // salida
  const idArchivo = ctx.idArchivo ?? 0;
  let n = Number.isInteger(ctx.primerN) ? ctx.primerN : 1;
  let dudosos = 0, corregidos = 0, confSuma = 0, confN = 0;
  const movimientos = [];
  for (const f of leidas) {
    const c = f.c, L = c.linea;
    const ocr = L.nivel === 'C';
    let confianza = null, corregido = false, cifraDudosa = false, fechaDudosa = false;
    for (const k of c.criticos) {
      if (k.corregido) corregido = true;
      if (k.conf !== null && k.conf !== undefined) confianza = confianza === null ? k.conf : Math.min(confianza, k.conf);
      const mal = k.corregido || (k.conf !== null && k.conf !== undefined && k.conf < 0.8);
      if (!mal) continue;
      if (k.tipo === 'fecha') fechaDudosa = true;
      else cifraDudosa = true;
    }
    // una cifra que encaja con el saldo anterior está comprobada, aunque el OCR dudara o le faltara el signo
    let dudoso;
    if (f.propuesta) dudoso = true;
    else if (f.verificada) dudoso = fechaDudosa && !fechaCoherente.get(f);
    else dudoso = f.dudoso || (ocr && (cifraDudosa || (fechaDudosa && !fechaCoherente.get(f))));
    if (corregido) corregidos++;
    if (dudoso) dudosos++;
    if (ocr && confianza !== null) { confSuma += confianza; confN++; }
    // en las fotos, rayas y barras sueltas al principio o al final del concepto son bordes o iconos mal leídos
    const concepto = ocr ? conceptoDe(c).replace(/^[\s—–\-_|·•*~=]+|[\s—–\-_|·•*~=]+$/g, '') : conceptoDe(c);
    const campos = {
      id: `${idArchivo}-${n++}`,
      fecha: c.iso,
      fecha_valor: c.isoValor,
      concepto,
      importe: f.abs ? (f.signo * f.abs) / 100 : 0,
      saldo: f.saldoC === null ? null : f.saldoC / 100,
      divisa: c.divisa || 'EUR',
      origen: { archivo, pagina: L.pagina, fila: L.fila, texto: c.textoOrigen ?? L.texto },
    };
    if (ocr && confianza !== null) campos.confianza = Math.round(confianza * 100) / 100;
    if (dudoso) campos.dudoso = true;
    const m = crearMovimiento(campos);
    // lo que se leyó de verdad, cuando la cifra que damos es otra (corregida por el OCR o sacada del saldo)
    if (ocr) {
      const campo = c.importe || c.cargo || c.abono;
      if (f.original) m.original = f.original;
      else if (campo?.corregido && campo.orig && campo.orig !== campo.texto) m.original = { texto: campo.orig };
    }
    movimientos.push(m);
  }
  if (nivelCands.includes('C') && dudosos) avisos.push(aviso('filas_dudosos', { archivo, n: dudosos }));
  // «Hoy» y «Ayer» se cuentan desde el día del análisis: si la captura es de otro día, se dice
  if (cands.some((c) => c.relativa)) avisos.push(aviso('filas_fecha_relativa', { archivo }));

  const extra = { lineas: lineas.length, modo, orden, titulos: hayTitulos, columnas_por_fila: porLinea, dudosos, corregidos };
  if (confN) extra.confianza_media = Math.round((confSuma / confN) * 100) / 100;
  return {
    movimientos,
    saldo_inicial: saldoInicial,
    saldo_final: saldoFinal,
    fecha_inicial: periodo?.desde ?? null,
    fecha_final: periodo?.hasta ?? null,
    avisos,
    necesita_mapeo: null,
    extra,
  };
}

function trozosPorCelda(ws) {
  const out = [];
  for (const w of ws) {
    const u = out[out.length - 1];
    if (u && u.celda === w.celda && Math.abs(u.y - w.y1) < 0.5) { u.x1 = w.x1; u.t += ' ' + w.t; }
    else out.push({ celda: w.celda, y: w.y1, x0: w.x0, x1: w.x1, t: w.t });
  }
  return out;
}

function columnaDeTramo(cols, x0, x1) {
  let mejor = 0, mejorP = -Infinity;
  cols.forEach((t, j) => {
    const ov = Math.min(t.x1, x1) - Math.max(t.x0, x0);
    const p = ov > 0 ? ov : -Math.min(Math.abs(t.x0 - x1), Math.abs(x0 - t.x1));
    if (p > mejorP) { mejorP = p; mejor = j; }
  });
  return mejor;
}

/** Concepto final: líneas de encima, la principal y las de debajo; con varias columnas de texto, cada una junta. */
function conceptoDe(c) {
  const extra = c.extra.filter((s) => s && s.trim());
  const textoDe = (x) => (typeof x === 'string' ? x : x.t);
  if (c.columnas && c.palabrasPrincipal) {
    const cols = c.columnas.map(() => []);
    const poner = (ws) => { for (const tr of trozosPorCelda(ws)) cols[columnaDeTramo(c.columnas, tr.x0, tr.x1)].push(tr.t); };
    for (const p of c.prefijo) if (p.ws) poner(p.ws); else cols[0].push(textoDe(p));
    poner(c.palabrasPrincipal);
    for (const x of c.sufijo) if (x.ws) poner(x.ws); else cols[cols.length - 1].push(textoDe(x));
    return [cols.map((x) => x.join(' ')).filter(Boolean).join(' · '), ...extra].filter(Boolean).join(' · ');
  }
  const principal = [...c.prefijo.map(textoDe), ...c.partes, ...c.sufijo.map(textoDe)].filter(Boolean).join(' ');
  return [principal, ...extra].filter((s) => s && s.trim()).join(' · ');
}

// Fecha, concepto e importe cada uno en su línea (copiar una tabla de una web a veces lo deja así).
function candidatosVerticales(lineas) {
  const utiles = lineas.filter((L) => L.palabras.length && !CLASES_SALTO.has(L.clase) && L.clase !== 'titulo' && L.clase !== 'titulo_resto');
  if (utiles.length < 6) return [];
  const simples = utiles.filter((L) => {
    const C = L.campos.filter((f) => f.tipo !== 'ruido' && f.tipo !== 'divisa');
    return C.length === 1 || (C.length >= 1 && C.every((f) => f.tipo === 'texto'));
  });
  if (simples.length < 0.6 * utiles.length) return [];
  const cands = [];
  let c = null;
  const cerrar = () => { if (c && c.importe) cands.push(c); c = null; };
  for (const L of utiles) {
    if (L.clase === 'saldo') { cerrar(); continue; }
    const C = L.campos.filter((f) => f.tipo !== 'ruido');
    const soloFecha = C.length === 1 && C[0].tipo === 'fecha';
    const soloImporte = C.filter((f) => f.tipo !== 'divisa').length === 1 && C.find((f) => f.tipo === 'importe');
    if (soloFecha) {
      if (c && !c.importe && !c.partes.length && !c.fechaValor) { c.fechaValor = C[0].parcial; c.criticos.push(C[0]); continue; }
      cerrar();
      c = { linea: L, fecha: C[0].parcial, fechaValor: null, heredada: false, prefijo: [], sufijo: [], partes: [], extra: [],
        importe: null, cargo: null, abono: null, saldo: null, divisa: null, criticos: [C[0]] };
      continue;
    }
    if (!c) continue;
    if (soloImporte) {
      const f = C.find((x) => x.tipo === 'importe');
      if (!c.importe) { c.importe = f; c.divisa = f.divisa || C.find((x) => x.tipo === 'divisa')?.divisa || null; c.criticos.push(f); }
      else if (!c.saldo) { c.saldo = f; c.criticos.push(f); }
      continue;
    }
    if (!c.importe) c.partes.push(L.texto.replace(/\s+/g, ' '));
  }
  cerrar();
  return cands;
}
