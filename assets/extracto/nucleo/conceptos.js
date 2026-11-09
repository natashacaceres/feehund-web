// Conceptos: limpiar el texto que pone el banco y reconocer qué es cada cargo
// (comercio del diccionario, comisión, gasto fijo, traspaso, cajero, Bizum...).
// Lógica pura: sin DOM, sin red. El diccionario es data/comercios.json ya leído.

import { normalizar } from './texto.js';

/** Categorías del diccionario con importe que cambia cada vez (luz, gas, agua, teléfono). */
export const CATEGORIAS_VARIABLES = new Set(['telecos', 'energia', 'agua']);
/** Categorías del diccionario que no son un servicio al que estás suscrito. */
const NO_SUSCRIPCION = new Set(['comisiones', 'pasarelas', 'gastos_fijos']);

/** ¿Es un comercio del diccionario al que se paga por estar dado de alta? (para «posible» con 1 cargo y «nuevo»). */
export function esSuscripcion(comercio) {
  return Boolean(comercio && comercio.categoria && !NO_SUSCRIPCION.has(comercio.categoria));
}

// ---------------------------------------------------------------------------------------------
// Limpieza del concepto
// ---------------------------------------------------------------------------------------------

// Un concepto de banco no pasa de unos cientos de letras. Si llega uno enorme (una celda rota, un archivo
// pegado en una sola celda), solo se mira el principio: así ninguna expresión regular tarda más de la cuenta.
const LARGO_MAXIMO = 500;
const recortarConcepto = (texto) => String(texto ?? '').slice(0, LARGO_MAXIMO);

const TARJETAS = [
  /\b\d{4,6}[X*•·]{4,10}\d{2,4}\b/g, // 5402XXXXXXXX1234
  /(?:[X*•]{4}[\s-]?){2,3}\d{4}\b/g, // XXXX-XXXX-XXXX-1234, **** **** **** 1234
  /(?<![X*•])[X*•]{2,16}\s?\d{4}\b/g, // **** 1234, XX1234 (con tope: una fila larga de X no se vuelve lenta)
  /\bTARJ(?:ETA)?\.?\s*(?:N\s?[O0º°.]?\s*)?\d{4}\b/g, // TARJ. 1234, TARJETA 1234
];

// Prefijos de operación (también en medio, porque algunos bancos los ponen tras la fecha). Los largos primero.
const PREFIJOS = new RegExp('(?:^|\\s)(?:' + [
  'COMPRA (?:CON )?TARJ(?:ETA)?\\.?(?: (?:DE )?(?:CREDITO|DEBITO))?(?: EN)?',
  'COMPRA INTERNET(?: EN)?',
  'COMPRA EN',
  'PAGO (?:CON )?TARJ(?:ETA)?\\.?(?: (?:DE )?(?:CREDITO|DEBITO))?(?: EN)?',
  'PAGO MOVIL(?: EN)?',
  'PAGO EN',
  'OPERACION (?:CON )?TARJ(?:ETA)?\\.?',
  'CARD PAYMENT(?: TO)?',
  'CARD TRANSACTION(?: REFUND)?(?: OF \\d+(?:[.,]\\d+)?(?: [A-Z]{3})?)?(?: ISSUED BY| FROM)?',
  'DIRECT DEBIT(?: PAYMENT)?(?: TO)?',
  'ISSUED BY', 'PAYMENT TO',
  'RECIBO DOMICILIADO',
  'RECIBO',
  'ADEUDO (?:DIRECTO )?SEPA(?: (?:CORE|B2B))?',
  'ADEUDO (?:POR )?DOMICILIACION',
  'ADEUDO',
  'DOMICILIACION(?: SEPA)?',
  'CARGO POR',
  'CARGO',
  'TRANSFERENCIA(?: (?:INMEDIATA|SEPA|EMITIDA|ENVIADA|REALIZADA|ORDINARIA|PERIODICA|ONLINE))*(?: A FAVOR DE| A)?',
  'TRANSF\\.?(?: (?:INMEDIATA|SEPA|EMITIDA|PERIODICA))*(?: A FAVOR DE| A)?',
  'TRANS\\.(?: A)?',
  'A FAVOR DE',
  'GOOGLE PAY', 'APPLE PAY', 'SAMSUNG PAY', 'GPAY',
  'REF(?:ERENCIA)?\\.?:?', 'NUM\\.?:?', 'N[º°]\\.?',
].join('|') + ')(?=\\s|$|[.:,;*])', 'g');

const FECHAS = [
  /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?)?\b/g, // 2026-03-02 10:15
  /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, // 02/03/2026, 02-03-26
  /\b\d{1,2}[-/.]\d{1,2}\b/g, // 02/03
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g, // 10:15
  /\b\d{1,2} ?(?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEPT?|SET|OCT|NOV|DIC|GEN|MAI|DES|JAN|APR|AUG|DEC)\b(?: ?\d{2,4}\b)?/g, // 02 ENE
];

/**
 * Concepto limpio: mayúsculas, sin acentos, sin prefijos de operación, sin tarjetas enmascaradas,
 * fechas ni referencias. Sirve para agrupar y para enseñar un nombre; el original se guarda aparte.
 * @param {string} texto
 * @returns {string}
 */
export function limpiarConcepto(texto) {
  let s = sinComisionDeCompra(normalizar(recortarConcepto(texto)));
  if (!s) return '';
  for (const re of TARJETAS) s = s.replace(re, ' ');
  s = s.replace(PREFIJOS, ' ');
  for (const re of FECHAS) s = s.replace(re, ' ');
  s = s.replace(/\b\d{5,}\b/g, ' '); // referencias de 5 o más cifras
  s = s.replace(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{8,}\b/g, ' '); // referencias que mezclan letras y cifras
  s = s.replace(/(?:^|\s)[-–—*·/.,;:#]+(?=\s|$)/g, ' '); // signos sueltos
  s = s.replace(/\s+([.,;:])/g, '$1').replace(/\s+/g, ' ').trim();
  s = s.replace(/^COMPRA\s+/, '').replace(/[\s,]+TARJ(?:ETA)?\.?$/, ''); // «COMPRA SPOTIFY, TARJETA»
  return s.replace(/^[\s.,;:*\-–/#]+|[\s.,;:*\-–/#]+$/g, '').trim();
}

// Algunos bancos (Santander) añaden a cada compra con tarjeta «, COMISION 0,00»: es una nota de la compra,
// no una comisión. Solo se quita si el concepto es de una compra y después de la palabra solo hay un importe
// (o nada: a veces el PDF corta el «0,00»). «COMISION CAMBIO DIVISA COMPRA...» sí es una comisión.
function sinComisionDeCompra(n) {
  if (!/\b(?:COMPRA|PAGO|TARJETA|TARJ|CARD)\b/.test(n)) return n;
  return n.replace(/(?:,\s*|\s)COMISI(?:ON|ONES)\b\s*:?\s*(?:\d{1,4}[.,]\d{2}\s*(?:EUR|€)?)?(?=\s*(?:[,;.]|$))/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Palabras para buscar en el diccionario: solo letras y cifras; «+» se lee «PLUS» (Disney+, Movistar+). */
export function tokensDe(texto) {
  const t = normalizar(texto).replace(/L·L/g, 'LL').replace(/\+/g, ' PLUS ').replace(/[^A-Z0-9]+/g, ' ').trim();
  return t ? t.split(' ') : [];
}

// Pagar con el móvil no dice nada del comercio: «GOOGLE PAY MERCADONA» es Mercadona, no Google.
function quitarCarteras(tokens) {
  const r = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if ((t === 'GOOGLE' || t === 'APPLE' || t === 'SAMSUNG') && tokens[i + 1] === 'PAY') { i++; continue; }
    if (t === 'GPAY') continue;
    r.push(t);
  }
  return r;
}

const VACIAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'EL', 'LOS', 'LO', 'Y', 'E', 'EN', 'A', 'AL', 'CON', 'POR', 'PARA', 'D', 'I', 'LES', 'ELS',
  'S', 'L', 'U', 'SL', 'SLU', 'SA', 'SAU', 'SC', 'CB', 'SLL', 'THE', 'OF', 'AND', 'TO', 'FROM', 'ES', 'ESP', 'ESPANA', 'SPAIN', 'EUR', 'EUROS',
  'WWW', 'COM', 'HTTP', 'HTTPS', 'REF', 'NUM', 'N', 'NO', 'FAVOR', 'BENEFICIARIO', 'ORDENANTE', 'CONCEPTO', 'COMPRA', 'PAGO', 'TARJETA', 'TARJ',
  'OPERACION', 'FECHA', 'TRANSFER', 'TRANSFERENCIA', 'TRANSF', 'TRANS', 'EMITIDA', 'ENVIADA', 'INMEDIATA', 'PERIODICA', 'SEPA', 'RECIBO', 'ADEUDO']);

/** Las primeras palabras con sentido del concepto limpio (para agrupar comercios que no están en el diccionario). */
export function palabrasClave(limpio, n = 3) {
  const r = [];
  for (const t of tokensDe(limpio)) {
    if (t.length < 2 || VACIAS.has(t) || /^\d+$/.test(t) || r.includes(t)) continue; // sin repetir («BAR LOS ARCOS BAR LOS ARCOS»)
    r.push(t);
    if (r.length === n) break;
  }
  return r;
}

/** «CAFETERIA LUNA» → «Cafeteria Luna». */
export function nombreLegible(palabras) {
  return palabras.map((p) => p.charAt(0) + p.slice(1).toLowerCase()).join(' ');
}

// ---------------------------------------------------------------------------------------------
// Diccionario preparado: índice por primera palabra de cada patrón
// ---------------------------------------------------------------------------------------------

const PREPARADOS = new WeakMap();
const TIPO_DE_CATEGORIA = { comisiones: 'comision', pasarelas: 'pasarela', gastos_fijos: 'gasto_fijo' };

/**
 * Índice del diccionario para buscar rápido. Se hace una vez por diccionario (queda en caché).
 * @param {Object} dic data/comercios.json
 */
export function prepararDiccionario(dic) {
  if (dic && dic.__preparado) return dic;
  const llave = dic && typeof dic === 'object' ? dic : VACIO;
  let p = PREPARADOS.get(llave);
  if (p) return p;
  const indice = new Map();
  const porId = new Map();
  const agregar = (patron, ref) => {
    const tokens = tokensDe(patron);
    if (!tokens.length) return;
    const item = { tokens, largo: tokens.join(' ').length, ref };
    if (!indice.has(tokens[0])) indice.set(tokens[0], []);
    indice.get(tokens[0]).push(item);
  };
  const pasarelas = [];
  for (const c of llave.comercios ?? []) {
    if (!c || !c.id) continue;
    const ref = { comercio: c, tipo: TIPO_DE_CATEGORIA[c.categoria] ?? 'comercio' };
    porId.set(c.id, ref);
    if (ref.tipo === 'pasarela') pasarelas.push(ref);
    for (const pat of c.patrones ?? []) agregar(pat, ref);
  }
  for (const g of llave.excluir ?? []) {
    const ref = { excluir: true, motivo: g.motivo || 'compra_frecuente' };
    for (const pat of g.patrones ?? []) agregar(pat, ref);
  }
  // La lista general de pasarelas («PAYPAL *») se asocia a su entrada por la primera palabra.
  for (const s of llave.pasarelas ?? []) {
    const t = tokensDe(s);
    const ref = pasarelas.find((r) => r.comercio.patrones.some((x) => tokensDe(x)[0] === t[0]));
    if (ref) agregar(s, ref);
  }
  p = { __preparado: true, indice, porId, cache: new Map() };
  PREPARADOS.set(llave, p);
  return p;
}
const VACIO = { comercios: [], excluir: [], pasarelas: [] };

// Una palabra pegada a una referencia («SPOTIFYP0B7F8E9A1», «NETFLIXCOM») también cuenta,
// pero solo si lo que sigue parece una referencia; así VERTI no casa con VERTICAL.
function restoDeReferencia(resto) {
  return /^(?:COM|ES|NET|AB|EU|SL|SA)$/.test(resto) || (resto.match(/\d/g)?.length ?? 0) >= 2;
}

function buscar(tokens, dic) {
  const r = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const lista = dic.indice.get(tok);
    if (lista) {
      for (const it of lista) {
        let ok = i + it.tokens.length <= tokens.length;
        for (let j = 1; ok && j < it.tokens.length; j++) ok = tokens[i + j] === it.tokens[j];
        if (ok) r.push({ ref: it.ref, inicio: i, fin: i + it.tokens.length, largo: it.largo });
      }
    }
    if (tok.length > 5) {
      for (let L = 5; L < tok.length && L <= 24; L++) {
        const l2 = dic.indice.get(tok.slice(0, L));
        if (!l2 || !restoDeReferencia(tok.slice(L))) continue;
        for (const it of l2) if (it.tokens.length === 1) r.push({ ref: it.ref, inicio: i, fin: i + 1, largo: it.largo });
      }
    }
  }
  return r;
}

// Gana el patrón más largo; a igualdad, el de excluir (mejor no marcar una compra que marcarla de más).
function mejor(coincidencias, filtro) {
  let m = null;
  for (const x of coincidencias) {
    if (!filtro(x.ref)) continue;
    if (!m || x.largo > m.largo || (x.largo === m.largo && x.ref.excluir && !m.ref.excluir)) m = x;
  }
  return m;
}

function hayFrase(tokens, frase) {
  const f = frase.split(' ');
  for (let i = 0; i + f.length <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; ok && j < f.length; j++) ok = tokens[i + j] === f[j];
    if (ok) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Clasificación
// ---------------------------------------------------------------------------------------------

const PALABRAS_TRASPASO = ['TRASPASO', 'TRASPASOS', 'TRASP', 'TRASPAS', 'HUCHA', 'APARTADO', 'APARTADOS', 'POCKET', 'POCKETS', 'VAULT', 'VAULTS', 'REDONDEO', 'ROUNDUP', 'GUARDIOLA', 'CONVERTED'];
const FRASES_TRASPASO = ['ENTRE CUENTAS', 'CUENTA PROPIA', 'CUENTAS PROPIAS', 'A MI CUENTA', 'CUENTA AHORRO', 'CUENTA DE AHORRO', 'ENTRE COMPTES', 'COMPTE PROPI',
  'TO EUR', 'EXCHANGED TO', 'EXCHANGE TO', 'OWN ACCOUNT', 'ROUND UP', 'PLAN PENSIONES', 'PLAN DE PENSIONES', 'APORTACION PLAN', 'SAVINGS PLAN', 'PLAN DE INVERSION', 'PLAN INVERSION'];
const FRASES_CAJERO = ['RETIRADA EFECTIVO', 'RETIRADA DE EFECTIVO', 'DISPOSICION EFECTIVO', 'DISPOSICION DE EFECTIVO', 'DISP EFECTIVO', 'CASH WITHDRAWAL'];
// Comisiones que ningún comercio usa en su concepto: ganan aunque el concepto nombre también un comercio.
const COMISIONES_FUERTES = new Set(['comision_reclamacion', 'comision_descubierto', 'comision_cambio_divisa', 'comision_cajero', 'comision_transferencia']);
// Gastos fijos con palabras que también usan los comercios («ALQUILER EQUIPOS MOVISTAR»).
const GASTOS_BLANDOS = new Set(['alquiler', 'impuestos', 'comunidad']);
// Alquilar un coche o una bici un día no es el alquiler de casa.
const ALQUILER_DE_UN_DIA = ['RENT A CAR', 'RENTACAR', 'CAR RENTAL', 'RENTAL CAR', 'ALQUILER COCHE', 'ALQUILER COCHES', 'ALQUILER DE COCHE', 'ALQUILER DE COCHES',
  'ALQUILER VEHICULO', 'ALQUILER VEHICULOS', 'ALQUILER DE VEHICULO', 'ALQUILER DE VEHICULOS', 'ALQUILER BICI', 'ALQUILER BICICLETA', 'ALQUILER PATINETE'];

// Pago de la tarjeta de crédito: el banco cobra de golpe lo gastado con la tarjeta. No es un cobro que se repita
// (lo de detrás son compras que no salen en este extracto) y, si se cuenta, sale una «suscripción» de cientos de euros.
const PALABRAS_TARJETA = ['TARJETA', 'TARJETAS', 'TARJ', 'VISA', 'MASTERCARD', 'AMEX'];
const DE_CREDITO = ['CREDITO', 'VISA', 'MASTERCARD', 'AMEX'];
const VERBOS_LIQUIDAR = ['LIQUIDACION', 'LIQ', 'LIQUID', 'LIQUIDAC'];
const VERBOS_RECIBO = ['RECIBO', 'ADEUDO', 'DOMICILIACION'];
const VERBOS_PAGO = ['PAGO', 'CARGO', 'SALDO'];
// Con estas palabras es la cuota o los intereses de la tarjeta (eso sí es una comisión), no el pago de lo gastado.
const PALABRAS_CUOTA = ['CUOTA', 'CUOTAS', 'COMISION', 'COMISIONES', 'COMIS', 'COM', 'EMISION', 'RENOVACION', 'INTERESES', 'INTERES', 'SEGURO', 'MANTENIMIENTO', 'FEE'];
// Lo único que puede acompañar al pago de la tarjeta sin que sea una compra en un comercio.
const RESTO_DE_TARJETA = new Set(['CREDITO', 'DEBITO', 'VISA', 'MASTERCARD', 'AMEX', 'CLASICA', 'CLASSIC', 'ORO', 'GOLD', 'PLATINUM', 'PLATINO', 'BUSINESS',
  'PREMIUM', 'BLACK', 'INFINITE', 'ELECTRON', 'LIQUIDACION', 'LIQ', 'LIQUID', 'LIQUIDAC', 'MENSUAL', 'CUENTA', 'CTA', 'SALDO', 'DEUDA', 'TOTAL', 'PENDIENTE',
  'EXTRACTO', 'PERIODO', 'CARGO', 'TARJETAS']);

const algun = (set, palabras) => palabras.some((p) => set.has(p));

function esPagoDeTarjeta(set, limpio) {
  if (!algun(set, PALABRAS_TARJETA) || algun(set, PALABRAS_CUOTA)) return false;
  if (algun(set, VERBOS_LIQUIDAR)) return true;
  // «PAGO TARJETA» y «CARGO TARJETA» también son compras: solo vale si no queda el nombre de ningún comercio
  const soloTarjeta = palabrasClave(limpio, 8).every((p) => RESTO_DE_TARJETA.has(p));
  if (algun(set, VERBOS_RECIBO)) return algun(set, DE_CREDITO) || soloTarjeta;
  return algun(set, VERBOS_PAGO) && algun(set, DE_CREDITO) && soloTarjeta;
}

// Referencia del mandato SEPA de un recibo («REF. MANDATO CWF8RVF»): cada contrato tiene la suya. Una misma empresa
// puede cobrar dos (la luz y el gas de Octopus), y así no se mezclan.
const MANDATO = /\b(?:REF(?:ERENCIA)?\.?\s*(?:DEL?\s+)?MANDATO|ID\.?\s*MANDATO|MANDATO|MANDATE\s*(?:REF(?:ERENCE)?|ID)|REF\.?\s*MANDATE)\s*[:.]?\s*(?:N[º°O]?\.?\s*)?([A-Z0-9][A-Z0-9/-]{3,34})/;
export function mandatoDe(n) {
  const m = MANDATO.exec(n);
  return m && /\d/.test(m[1]) ? m[1] : null;
}

// Comisión por combinación de palabras cuando el concepto dice COMISION (o COM., FEE) en cualquier orden.
function comisionPorPalabras(set) {
  if (algun(set, ['RECLAMACION', 'DEUDORA', 'DEUDORAS', 'IMPAGADO', 'IMPAGADOS', 'IMPAGO'])) return 'comision_reclamacion';
  if (algun(set, ['CAJERO', 'CAJEROS', 'REINTEGRO', 'RETIRADA', 'DISPOSICION', 'ATM', 'EFECTIVO'])) return 'comision_cajero';
  if (algun(set, ['TRANSFERENCIA', 'TRANSFERENCIAS', 'TRANSF', 'TRANS', 'TRF', 'TRANSFER'])) return 'comision_transferencia';
  if (algun(set, ['DIVISA', 'DIVISAS', 'EXTRANJERO', 'CONVERSION', 'EXCHANGE', 'FX', 'CAMBIO'])) return 'comision_cambio_divisa';
  if (algun(set, ['DESCUBIERTO', 'EXCEDIDO', 'OVERDRAFT'])) return 'comision_descubierto';
  if (algun(set, ['MANTENIMIENTO', 'MANT', 'MAINTENANCE'])) return 'comision_mantenimiento';
  if (algun(set, ['ADMINISTRACION', 'ADMON'])) return 'comision_administracion';
  if (algun(set, ['TARJETA', 'TARJ', 'VISA', 'MASTERCARD', 'CARD'])) return 'comision_tarjeta';
  return null;
}

/**
 * Qué es un movimiento.
 * Orden: ingreso → Bizum → traspaso propio → comisión → cajero → gasto fijo → transferencia a otra persona
 * → comercio del diccionario (o exclusión) → pasarela → desconocido.
 * @param {import('./modelo.js').Movimiento} movimiento
 * @param {Object} diccionario data/comercios.json (o ya preparado)
 * @returns {{clave: string, nombre: string|null, comercio: Object|null, pasarela: string|null,
 *   tipo: 'comercio'|'comision'|'gasto_fijo'|'transferencia'|'traspaso'|'cajero'|'bizum'|'excluido'|'ingreso'|'desconocido',
 *   categoria: string|null, recibo: boolean, concepto_limpio: string, motivo?: string}}
 */
export function clasificar(movimiento, diccionario) {
  const dic = prepararDiccionario(diccionario);
  const m = movimiento ?? {};
  const imp = Number(m.importe);
  const signo = imp > 0 ? '+' : imp < 0 ? '-' : '0';
  const llave = `${signo}|${m.concepto_comun ?? ''}|${m.nota ?? ''}|${recortarConcepto(m.tipo)}|${recortarConcepto(m.concepto)}`;
  let r = dic.cache.get(llave);
  if (!r) {
    r = clasificarSinCache(m, imp, dic);
    if (dic.cache.size > 50000) dic.cache.clear();
    dic.cache.set(llave, r);
  }
  return r;
}

function clasificarSinCache(m, imp, dic) {
  const concepto = recortarConcepto(m.concepto);
  const n = sinComisionDeCompra(normalizar(concepto));
  const tokens = quitarCarteras(tokensDe(n));
  const set = new Set(tokens);
  const tt = new Set(tokensDe(recortarConcepto(m.tipo))); // tipo de operación que da el banco (Revolut, N26)
  const cc = m.concepto_comun ? String(m.concepto_comun).padStart(2, '0') : '';
  const limpio = limpiarConcepto(concepto);
  const recibo = algun(set, ['RECIBO', 'RECIBOS', 'ADEUDO', 'DOMICILIACION', 'DOMICILIADO', 'DOMICILIADA', 'REBUT'])
    || hayFrase(tokens, 'DIRECT DEBIT') || cc === '03' || (tt.has('DIRECT') && tt.has('DEBIT'));
  // Compra con tarjeta (no un recibo): la luz o el teléfono no se pagan así cada mes, una compra en su tienda sí.
  const tarjeta = !recibo && (cc === '12' || tt.has('CARD') || algun(set, ['COMPRA', 'COMPRAS', 'TARJETA', 'TARJ', 'CARD', 'TPV', 'DATAFONO'])
    || /\d{4,6}[X*•·]{4,10}\d{2,4}|[X*•]{4}/.test(n));
  const mandato = recibo ? mandatoDe(n) : null;
  const res = (tipo, clave, extra = {}) => ({
    clave, nombre: extra.nombre ?? null, comercio: extra.comercio ?? null, pasarela: extra.pasarela ?? null, tipo,
    categoria: extra.categoria ?? extra.comercio?.categoria ?? null, recibo, tarjeta, mandato, concepto_limpio: limpio, ...(extra.motivo ? { motivo: extra.motivo } : {}),
  });
  const deId = (id) => dic.porId.get(id)?.comercio ?? null;
  const conComercio = (tipo, c, extra = {}) => res(tipo, c.id, { comercio: c, nombre: c.nombre, ...extra });

  if (!Number.isFinite(imp) || imp === 0) return res('excluido', 'excluido:importe_cero', { motivo: 'importe_cero' });
  if (imp > 0) return res('ingreso', 'ingreso');
  if (set.has('BIZUM')) return res('bizum', 'bizum');
  if (m.nota === 'traspaso' || m.nota === 'cambio_divisa' || tt.has('EXCHANGE')
    || algun(set, PALABRAS_TRASPASO) || FRASES_TRASPASO.some((f) => hayFrase(tokens, f))) return res('traspaso', 'traspaso');

  const coinc = buscar(tokens, dic);
  const comercioM = mejor(coinc, (x) => x.excluir || x.tipo === 'comercio');
  const comisionM = mejor(coinc, (x) => x.tipo === 'comision');
  const gastoM = mejor(coinc, (x) => x.tipo === 'gasto_fijo');
  const pasarelaM = mejor(coinc, (x) => x.tipo === 'pasarela');
  const suscripcion = comercioM && !comercioM.ref.excluir ? comercioM : null;

  // Pago de lo gastado con la tarjeta de crédito: no se cuenta (si no nombra ningún comercio)
  if (!comercioM && !comisionM && !gastoM && !pasarelaM && esPagoDeTarjeta(set, limpio)) {
    return res('excluido', 'excluido:tarjeta_credito', { motivo: 'tarjeta_credito' });
  }

  // Comisiones del banco
  const explicita = algun(set, ['COMISION', 'COMISIONES', 'COMIS', 'FEE', 'FEES']) || /(?:^|[\s,;:])COM\.(?=\s|$)/.test(n);
  const separada = m.nota === 'comision_separada' || cc === '17' || tt.has('FEE');
  let idComision = (explicita || separada) ? comisionPorPalabras(set) : null;
  const porPatron = comisionM?.ref.comercio.id ?? null;
  if (porPatron && (!idComision || porPatron !== 'comision_otra')) idComision = porPatron;
  if (!idComision && separada) idComision = 'comision_otra';
  if (!idComision && /^(?:COMISION )?MANTENIMIENTO(?: (?:DE )?(?:LA )?(?:CUENTA|CTA))?$/.test(limpio)) idComision = 'comision_mantenimiento';
  if (idComision && (explicita || separada || COMISIONES_FUERTES.has(idComision) || !suscripcion)) {
    const c = deId(idComision);
    return c ? conComercio('comision', c) : res('comision', idComision, { categoria: 'comisiones' });
  }

  // Cajeros (su comisión ya ha salido arriba)
  if (set.has('CAJERO') || set.has('REINTEGRO') || set.has('REINT') || set.has('ATM') || tt.has('ATM') || cc === '11'
    || FRASES_CAJERO.some((f) => hayFrase(tokens, f))) return res('cajero', 'cajero');

  // Gastos fijos: hipoteca, préstamos, alquiler...
  let gasto = gastoM?.ref.comercio ?? null;
  if (!gasto && cc === '05') gasto = deId('prestamo');
  if (gasto?.id === 'alquiler' && (set.has('RENTACAR') || ALQUILER_DE_UN_DIA.some((f) => hayFrase(tokens, f)))) gasto = null;
  if (gasto && !(GASTOS_BLANDOS.has(gasto.id) && suscripcion)) return conComercio('gasto_fijo', gasto);

  // Transferencias a otra persona (las que no van a un comercio conocido)
  const transferencia = algun(set, ['TRANSFERENCIA', 'TRANSF']) || /\bTRANS\./.test(n) || hayFrase(tokens, 'TRANSFER TO')
    || cc === '04' || tt.has('TRANSFER');
  if (transferencia && !comercioM) {
    const p = palabrasClave(limpio);
    const quien = p.length ? p : ['SIN', 'NOMBRE'];
    return res('transferencia', 'transferencia:' + quien.join(' '), { nombre: p.length ? nombreLegible(p) : null, categoria: 'transferencia' });
  }

  // Comercio del diccionario o algo que no se cuenta (supermercado, gasolinera...)
  if (comercioM?.ref.excluir) return res('excluido', 'excluido:' + comercioM.ref.motivo, { motivo: comercioM.ref.motivo });
  if (suscripcion) {
    const separadas = pasarelaM && (pasarelaM.fin <= suscripcion.inicio || pasarelaM.inicio >= suscripcion.fin);
    return conComercio('comercio', suscripcion.ref.comercio, { pasarela: separadas ? pasarelaM.ref.comercio.id : null });
  }
  if (pasarelaM) {
    const c = pasarelaM.ref.comercio;
    return res('comercio', 'pasarela:' + c.id, { comercio: c, nombre: c.nombre, pasarela: c.id });
  }

  const p = palabrasClave(limpio);
  const palabras = p.length ? p : tokensDe(concepto).filter((t) => !/^\d+$/.test(t)).slice(0, 3);
  return res('desconocido', 'd:' + (palabras.join(' ') || 'SIN CONCEPTO'), { nombre: palabras.length ? nombreLegible(palabras) : null });
}
