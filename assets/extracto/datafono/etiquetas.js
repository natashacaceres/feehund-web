// Diccionarios del lector del datáfono: qué quiere decir cada etiqueta de un resumen o liquidación del TPV,
// cada tipo de tarjeta y cada título de columna. Todo en mayúsculas y sin tildes (texto.js normalizar).
// Lógica pura: sin DOM ni red. Los textos de los proveedores son HIPÓTESIS hasta verlos en archivos reales.

import { normalizar } from '../nucleo/texto.js';

// ───────────── papeles de una línea con etiqueta ─────────────
// Orden: la primera regla que casa manda. Cada regla es una lista de frases; una frase casa si todas sus palabras
// están en la etiqueta como palabras enteras y en ese orden. «!» delante de una palabra: esa palabra no puede estar.
const REGLAS = [
  // lo que no se cuenta nunca: devoluciones de comisiones, abonos de comisiones, retenciones, saldos
  ['comision_devuelta', ['DEVOLUCION DE COMISIONES', 'DEVOLUCION COMISIONES', 'DEVOLUCION DE COMISION', 'COMISIONES DEVUELTAS',
    'ABONO DE COMISIONES', 'ABONO COMISIONES', 'RETROCESION DE COMISIONES', 'FEE REFUND', 'FEES REFUNDED', 'REFUNDED FEES',
    'DEVOLUCIO DE COMISSIONS']],
  ['ignorar', ['SALDO', 'RETENCION', 'RETENCIONES', 'RESERVA', 'RESERVE', 'BALANCE', 'IBAN', 'CUENTA DE ABONO',
    'NUMERO DE CUENTA', 'TELEFONO', 'NIF', 'CIF', 'CODIGO POSTAL', 'PAGINA', 'PAGE', 'PAG', 'REFERENCIA', 'FACTURA N',
    'NUMERO DE FACTURA', 'INVOICE NUMBER', 'BASE IMPONIBLE', 'TIPO IMPOSITIVO']],
  // totales de cargos (comisiones, cuotas, alquiler e IVA juntos)
  ['cargos_total', ['TOTAL CARGOS', 'TOTAL CARGADO', 'TOTAL A CARGAR', 'IMPORTE A CARGAR', 'TOTAL COMISIONES Y CUOTAS',
    'TOTAL COMISIONES Y CARGOS', 'TOTAL GASTOS', 'TOTAL COSTES', 'COSTE TOTAL', 'TOTAL FACTURA', 'TOTAL A PAGAR', 'IMPORTE FACTURA',
    'TOTAL FEES AND CHARGES', 'TOTAL CHARGES', 'TOTAL COSTS', 'TOTAL INVOICE', 'INVOICE TOTAL', 'TOTAL CARRECS', 'TOTAL DESPESES',
    'TOTAL COSTOS']],
  ['intercambio', ['TASA DE INTERCAMBIO', 'TASAS DE INTERCAMBIO', 'TASA INTERCAMBIO', 'INTERCAMBIO', 'INTERCHANGE',
    'INTERCHANGE FEE', 'INTERCHANGE FEES', 'TAXA D INTERCANVI', 'TAXA INTERCANVI']],
  ['marca', ['TASA DE MARCA', 'TASAS DE MARCA', 'TASA MARCA', 'CUOTA DE MARCA', 'SCHEME FEE', 'SCHEME FEES', 'CARD SCHEME FEES',
    'TAXA DE MARCA']],
  ['cargo_otro', ['COMISION POR CONTRACARGO', 'COMISION CONTRACARGO', 'COMISION POR CONTRACARGOS', 'GASTOS DE CONTRACARGO',
    'GASTOS CONTRACARGO', 'CHARGEBACK FEE', 'CHARGEBACK FEES', 'DISPUTE FEE', 'DISPUTE FEES', 'COMISION POR DEVOLUCION',
    'COMISION DEVOLUCION', 'REFUND FEE', 'REFUND FEES', 'PCI', 'CUMPLIMIENTO PCI', 'PCI COMPLIANCE', 'GASTOS DE GESTION',
    'GASTOS DE ENVIO', 'ROLLOS', 'PAPEL', 'SEGURO DEL TERMINAL', 'OTROS CARGOS', 'OTROS GASTOS', 'OTHER FEES', 'OTHER CHARGES',
    'COMISION DE INACTIVIDAD', 'INACTIVITY FEE', 'GASTOS', 'ALTRES CARRECS']],
  ['iva', ['IVA', 'I V A', 'VAT', 'IMPUESTO SOBRE EL VALOR ANADIDO', 'IMPUESTOS', 'TAX', 'TAXES']],
  ['cuota', ['CUOTA', 'CUOTAS', 'MANTENIMIENTO', 'TARIFA PLANA', 'TARIFA MENSUAL', 'PLAN MENSUAL', 'SUSCRIPCION', 'SUBSCRIPTION',
    'MONTHLY FEE', 'MONTHLY PLAN', 'SERVICE FEE MONTHLY', 'QUOTA', 'QUOTES', 'MANTENIMENT', 'CUOTA FIJA', 'CUOTA DE SERVICIO']],
  ['alquiler', ['ALQUILER', 'ALQUILERES', 'RENTING', 'RENTAL', 'RENT', 'LLOGUER', 'ARRENDAMIENTO', 'TERMINAL RENTAL', 'LEASING']],
  ['contracargos', ['CONTRACARGO', 'CONTRACARGOS', 'CHARGEBACK', 'CHARGEBACKS', 'DISPUTA', 'DISPUTAS', 'DISPUTE', 'DISPUTES',
    'RETROCESION', 'RETROCESIONES', 'RETROCESSIO']],
  ['devoluciones', ['DEVOLUCION', 'DEVOLUCIONES', 'REEMBOLSO', 'REEMBOLSOS', 'REFUND', 'REFUNDS', 'ANULACION', 'ANULACIONES',
    'DEVOLUCIO', 'DEVOLUCIONS', 'ABONOS A CLIENTES', 'RETURNS']],
  ['comision_total', ['TOTAL COMISIONES', 'TOTAL COMISION', 'COMISIONES TOTALES', 'IMPORTE COMISIONES', 'TOTAL TASA DE DESCUENTO',
    'TOTAL FEES', 'TOTAL PROCESSING FEES', 'FEES TOTAL', 'TOTAL COMISSIONS', 'TOTAL DE COMISIONES']],
  ['comision', ['COMISION', 'COMISIONES', 'TASA DE DESCUENTO', 'TASAS DE DESCUENTO', 'DESCUENTO', 'COMISION DE SERVICIO',
    'COMISION SERVICIO', 'MARGEN', 'FEE', 'FEES', 'PROCESSING FEE', 'PROCESSING FEES', 'TRANSACTION FEES', 'COMISSIO', 'COMISSIONS',
    'MERCHANT SERVICE CHARGE', 'MSC', 'MARKUP']],
  ['neto', ['IMPORTE NETO', 'NETO', 'TOTAL NETO', 'NETO ABONADO', 'TOTAL ABONADO', 'IMPORTE ABONADO', 'IMPORTE A ABONAR',
    'TOTAL A ABONAR', 'TOTAL LIQUIDADO', 'IMPORTE LIQUIDADO', 'LIQUIDO', 'LIQUIDO A PERCIBIR', 'NET', 'NET AMOUNT', 'NET TOTAL',
    'TOTAL PAYOUT', 'PAYOUT', 'PAYOUTS', 'SETTLED', 'NET SETTLED', 'IMPORT NET', 'TOTAL ABONAT']],
  ['operaciones_total', ['NUMERO DE OPERACIONES', 'N DE OPERACIONES', 'NUM DE OPERACIONES', 'NUM OPERACIONES', 'N OPERACIONES',
    'NUMERO OPERACIONES', 'TOTAL OPERACIONES', 'OPERACIONES', 'NUMERO DE TRANSACCIONES', 'N DE TRANSACCIONES', 'TRANSACCIONES',
    'NUMERO DE PAGOS', 'NUMBER OF TRANSACTIONS', 'TRANSACTIONS', 'TRANSACTION COUNT', 'NUMBER OF PAYMENTS', 'NOMBRE D OPERACIONS',
    'OPERACIONS', 'N D OPERACIONS']],
  ['ventas_total', ['TOTAL VENTAS', 'VENTAS TOTALES', 'TOTAL VENDIDO', 'TOTAL FACTURADO', 'IMPORTE FACTURADO', 'FACTURACION',
    'FACTURACION TOTAL', 'IMPORTE BRUTO', 'VENTAS BRUTAS', 'TOTAL BRUTO', 'BRUTO', 'TOTAL OPERADO', 'IMPORTE OPERADO',
    'VOLUMEN', 'VOLUMEN TOTAL', 'TOTAL VENTAS CON TARJETA', 'VENTAS', 'IMPORTE VENTAS', 'IMPORTE TOTAL', 'TOTAL IMPORTE',
    'GROSS SALES', 'GROSS', 'TOTAL SALES', 'SALES', 'GROSS VOLUME', 'TOTAL VOLUME', 'VOLUME', 'TOTAL VENDES', 'VENDES',
    'FACTURACIO', 'IMPORT BRUT', 'TOTAL TRANSACCIONES', 'TOTAL TRANSACTIONS']],
  ['total', ['TOTAL', 'TOTALES', 'SUMA', 'SUMAS', 'TOTAL GENERAL', 'GRAND TOTAL', 'TOTALS']],
];

const PREPARADAS = REGLAS.map(([papel, frases]) => ({ papel, frases: frases.map((f) => f.split(' ')) }));

/** Palabras de una etiqueta normalizada (sin signos). */
export function palabrasDe(etiqueta) {
  return normalizar(etiqueta).replace(/[^A-Z0-9%]+/g, ' ').trim().split(' ').filter(Boolean);
}

function contieneFrase(palabras, frase) {
  for (let i = 0; i + frase.length <= palabras.length; i++) {
    let ok = true;
    for (let k = 0; k < frase.length; k++) if (palabras[i + k] !== frase[k]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

// «Cuota mensual (IVA incluido)» o «Alquiler sin IVA» no son una línea de IVA: esas menciones se quitan antes
const MENCION_IVA = /\b(?:(?:IVA|VAT|IGIC|IMPUESTOS?) (?:INCLUIDO|INCLUIDOS|INCL|INCLUDED|NO INCLUIDO|EXCLUIDO|EXCL|EXCLUDED|APARTE)|(?:CON|SIN|EXCL|INCL|MAS|MES|AMB|SENSE|PLUS|EX|INC) (?:IVA|VAT|IGIC))\b/g;

/** Etiqueta sin las menciones de IVA que acompañan a otra cifra. {palabras, iva: 'incluido'|'sin'|null}. */
export function sinMencionIva(etiqueta) {
  const n = normalizar(etiqueta).replace(/\+\s*(IVA|VAT)\b/g, 'MAS $1');
  let iva = null;
  const limpio = n.replace(MENCION_IVA, (m) => { iva = /^(SIN|EXCL|EX|SENSE)|NO INCLUIDO|EXCLUIDO|EXCL|APARTE|^MAS|^PLUS/.test(m) ? 'sin' : 'incluido'; return ' '; });
  return { palabras: palabrasDe(limpio), iva };
}

/**
 * Papel de una etiqueta («Total comisiones» → comision_total).
 * @returns {string|null}
 */
export function papelDeEtiqueta(etiqueta) {
  const p = Array.isArray(etiqueta) ? etiqueta : sinMencionIva(etiqueta).palabras;
  if (!p.length) return null;
  for (const r of PREPARADAS) for (const f of r.frases) if (contieneFrase(p, f)) return r.papel;
  return null;
}

// ───────────── tipos de tarjeta ─────────────
// Los cinco grupos de la calculadora: particulares (tarjetas españolas o europeas de particular), empresa,
// fuera_europa, amex y bizum. Una línea puede decir marca, uso y región a la vez («Visa Business no UE»).

const MARCAS = [
  ['amex', ['AMEX', 'AMERICAN EXPRESS', 'AMERICANEXPRESS', 'AMERICAN EXP']],
  ['bizum', ['BIZUM']],
  ['otras_marcas', ['JCB', 'UNIONPAY', 'UNION PAY', 'CUP', 'CHINA UNIONPAY', 'DINERS', 'DINERS CLUB', 'DISCOVER']],
  ['visa', ['VISA', 'VISA ELECTRON', 'ELECTRON', 'V PAY', 'VPAY']],
  ['mastercard', ['MASTERCARD', 'MASTER CARD', 'MASTER', 'MC', 'MAESTRO']],
  ['cartera', ['APPLE PAY', 'GOOGLE PAY', 'SAMSUNG PAY']],
];
const EMPRESA = ['EMPRESA', 'EMPRESAS', 'BUSINESS', 'CORPORATE', 'CORPORATIVA', 'CORPORATIVAS', 'COMERCIAL', 'COMERCIALES',
  'COMMERCIAL', 'PURCHASING', 'FLOTA', 'FLEET', 'PROFESIONAL', 'PROFESIONALES', 'EMPRESARIAL', 'NEGOCIO'];
const FUERA = ['NO UE', 'NO EEE', 'FUERA UE', 'FUERA DE LA UE', 'FUERA DEL EEE', 'FUERA DE EUROPA', 'EXTRACOMUNITARIA',
  'EXTRACOMUNITARIAS', 'EXTRA UE', 'EXTRA EEE', 'NON EEA', 'NON EU', 'OUTSIDE EEA', 'OUTSIDE EU', 'OUTSIDE EUROPE',
  'INTERNACIONAL', 'INTERNACIONALES', 'INTERNATIONAL', 'INTER REGIONAL', 'INTERREGIONAL', 'EXTRANJERA NO UE', 'FORA UE',
  'FORA DE LA UE', 'FORA D EUROPA', 'NO COMUNITARIA', 'NO COMUNITARIAS', 'RESTO DEL MUNDO', 'REST OF WORLD'];
const DENTRO = ['NACIONAL', 'NACIONALES', 'DOMESTICA', 'DOMESTICAS', 'DOMESTIC', 'ESPANOLA', 'ESPANOLAS', 'UE', 'EEE', 'EEA', 'EU',
  'INTRA UE', 'INTRA EEE', 'INTRA REGIONAL', 'INTRARREGIONAL', 'INTRAREGIONAL', 'EUROPEA', 'EUROPEAS', 'COMUNITARIA',
  'COMUNITARIAS', 'EUROPE', 'EUROPEAN', 'INTRA EEA', 'INTRA EU'];
// «Particular» dice el uso; «débito» o «crédito» solo dicen que es una tarjeta (las de empresa también lo son)
const PARTICULAR = ['PARTICULAR', 'PARTICULARES', 'CONSUMO', 'CONSUMIDOR', 'CONSUMIDORES', 'CONSUMER', 'PERSONAL', 'PRIVADA', 'PRIVADAS'];
const FINANCIACION = ['DEBITO', 'CREDITO', 'PREPAGO', 'DEBIT', 'CREDIT', 'PREPAID', 'DEBIT CARD', 'CREDIT CARD'];

const frasesDe = (l) => l.map((f) => f.split(' '));
const MARCAS_P = MARCAS.map(([id, l]) => [id, frasesDe(l)]);
const EMPRESA_P = frasesDe(EMPRESA), FUERA_P = frasesDe(FUERA), DENTRO_P = frasesDe(DENTRO), PARTICULAR_P = frasesDe(PARTICULAR);
const FINANCIACION_P = frasesDe(FINANCIACION);
const alguna = (p, frases) => frases.some((f) => contieneFrase(p, f));

/**
 * ¿Qué tipo de tarjeta dice esta etiqueta?
 * @returns {null|{grupo: 'particulares'|'empresa'|'fuera_europa'|'amex'|'bizum', marca: string|null,
 *   uso: 'empresa'|'particular'|null, region: 'fuera'|'dentro'|null, dudoso: boolean}}
 */
export function tipoDeTarjeta(etiqueta) {
  const p = Array.isArray(etiqueta) ? etiqueta : palabrasDe(etiqueta);
  if (!p.length) return null;
  let marca = null;
  for (const [id, frases] of MARCAS_P) if (alguna(p, frases)) { marca = id; break; }
  const empresa = alguna(p, EMPRESA_P), fuera = alguna(p, FUERA_P);
  const dentro = !fuera && alguna(p, DENTRO_P), particular = alguna(p, PARTICULAR_P), financiacion = alguna(p, FINANCIACION_P);
  if (!marca && !empresa && !fuera && !dentro && !particular && !financiacion) return null;
  const uso = empresa ? 'empresa' : particular ? 'particular' : null;
  const region = fuera ? 'fuera' : dentro ? 'dentro' : null;
  let grupo, dudoso = false;
  if (marca === 'amex') grupo = 'amex';
  else if (marca === 'bizum') grupo = 'bizum';
  else if (fuera) grupo = 'fuera_europa';
  else if (empresa) grupo = 'empresa';
  else if (marca === 'otras_marcas') { grupo = 'fuera_europa'; dudoso = true; } // JCB, UnionPay, Diners: suelen ser de fuera; no se sabe
  else grupo = 'particulares';
  return { grupo, marca, uso, region, dudoso };
}

// ───────────── títulos de columna ─────────────
// Tablas de un resumen (tipos de tarjeta) y exportaciones con una fila por cobro (Stripe, SumUp, Square…).

const COLUMNAS = new Map();
function columnas(papel, titulos) { for (const t of titulos.split('|')) COLUMNAS.set(t, papel); }
columnas('fecha', 'FECHA|FECHAS|FECHA OPERACION|FECHA DE OPERACION|FECHA Y HORA|FECHA HORA|FECHA TRANSACCION|FECHA DE LA TRANSACCION|' +
  'FECHA DE LA OPERACION|F OPERACION|FECHA VENTA|FECHA DEL PAGO|FECHA PAGO|DIA|DATE|DATE TIME|DATETIME|CREATED|CREATED UTC|CREATED DATE|' +
  'CREATED DATE UTC|CREATED AT|TRANSACTION DATE|PAYMENT DATE|TIME|TIMESTAMP|CREATION DATE|BOOKING DATE|DATA|DATA OPERACIO|DATA I HORA|' +
  'DATA DE L OPERACIO|FECHA CREACION');
columnas('hora', 'HORA|HORA OPERACION|TIME OF DAY|HORA DE LA OPERACION');
columnas('importe', 'PRICE GROSS|GROSS PRICE|IMPORTE|IMPORTES|IMPORTE EUR|IMPORTE TOTAL|IMPORTE BRUTO|IMPORTE OPERACION|IMPORTE DE LA OPERACION|IMPORTE VENTA|' +
  'IMPORTE COBRADO|TOTAL|TOTAL EUR|AMOUNT|AMOUNT EUR|GROSS|GROSS AMOUNT|GROSS SALES|TOTAL AMOUNT|SALE AMOUNT|TRANSACTION AMOUNT|' +
  'CAPTURED AMOUNT|PAYMENT AMOUNT|IMPORT|IMPORT TOTAL|IMPORT BRUT|VENTAS|VENTA|FACTURACION|VOLUMEN|VOLUME|SALES|COBRADO|BRUTO|' +
  'IMPORTE FACTURADO|IMPORTE OPERADO');
columnas('comision', 'COMISION|COMISIONES|COMISION EUR|IMPORTE COMISION|IMPORTE COMISIONES|TASA DE DESCUENTO EUR|COSTE|COSTE EUR|' +
  'FEE|FEES|FEE EUR|FEE AMOUNT|PROCESSING FEE|PROCESSING FEES|TRANSACTION FEE|TRANSACTION FEES|COMMISSION|COMISSIO|COMISSIONS|' +
  'IMPORTE TASA|TOTAL COMISION|TOTAL COMISIONES|TOTAL FEES');
columnas('tasa', '%|PCT|PORC|TASA %|TASA|TASA DE DESCUENTO|TASA DESCUENTO|TASA APLICADA|PORCENTAJE|TIPO APLICADO|COMISION %|COMISION PORCENTAJE|RATE|FEE RATE|' +
  'RATE %|TAXA|TAXA DE DESCOMPTE|COMISION APLICADA');
columnas('intercambio', 'TASA DE INTERCAMBIO|TASA INTERCAMBIO|INTERCAMBIO|INTERCHANGE|INTERCHANGE FEE|INTERCHANGE FEES|IC');
columnas('marca_tasa', 'TASA DE MARCA|TASA MARCA|SCHEME FEE|SCHEME FEES|CUOTA DE MARCA');
columnas('neto', 'PRICE NET|NET PRICE|NETO|IMPORTE NETO|NET|NET AMOUNT|NET TOTAL|NET SALES|PAYOUT|PAYOUT AMOUNT|A ABONAR|IMPORTE A ABONAR|ABONADO|' +
  'IMPORTE ABONADO|LIQUIDO|IMPORT NET|TOTAL NETO');
columnas('operaciones', 'OPERACIONES|N OPERACIONES|NUM OPERACIONES|NUMERO DE OPERACIONES|N DE OPERACIONES|NUMERO OPERACIONES|N|NUM|' +
  'NUMERO|CANTIDAD|UNIDADES|TRANSACCIONES|N TRANSACCIONES|N DE TRANSACCIONES|NUMERO DE TRANSACCIONES|COUNT|TRANSACTIONS|' +
  'NUMBER OF TRANSACTIONS|NO OF TRANSACTIONS|QTY|OPERACIONS|N OPERACIONS|PAGOS|N PAGOS|NUMERO DE PAGOS');
columnas('estado', 'ESTADO|ESTADO DE LA OPERACION|ESTADO DEL PAGO|ESTADO TRANSACCION|STATUS|STATE|RESULTADO|RESULT|ESTAT|PAYMENT STATUS|' +
  'TRANSACTION STATUS');
columnas('tipo_operacion', 'TIPO|TIPO DE TRANSACCION|TIPO TRANSACCION|TIPO DE OPERACION|TIPO OPERACION|TRANSACTION TYPE|TYPE|' +
  'REPORTING CATEGORY|OPERACION|CLASE|CLASE DE OPERACION|TIPUS|TIPUS D OPERACIO|EVENT|EVENT TYPE');
columnas('marca', 'MARCA|MARCA TARJETA|MARCA DE LA TARJETA|TIPO DE TARJETA|TIPO TARJETA|TARJETA|CARD|CARD BRAND|CARD TYPE|CARD SCHEME|' +
  'SCHEME|BRAND|PAYMENT METHOD|METODO DE PAGO|MEDIO DE PAGO|FORMA DE PAGO|PAYMENT TYPE|CARD NETWORK|NETWORK|PAYMENT METHOD TYPE|' +
  'TIPUS DE TARGETA|MITJA DE PAGAMENT|MEDIO|PRODUCTO|CARD PRODUCT');
columnas('financiacion', 'CARD FUNDING|FUNDING|FUNDING TYPE|TIPO DE FINANCIACION|DEBITO CREDITO|DEBIT CREDIT|CARD FUNDING TYPE');
columnas('pais', 'CARD ISSUE COUNTRY|CARD ISSUING COUNTRY|ISSUER COUNTRY|ISSUING COUNTRY|CARD COUNTRY|COUNTRY|PAIS|PAIS EMISOR|' +
  'PAIS DE EMISION|PAIS DE LA TARJETA|PAIS TARJETA|PAIS EMISION|ISSUER COUNTRY CODE|COUNTRY CODE|PAIS DE ORIGEN|ORIGEN TARJETA');
columnas('categoria', 'CARD CATEGORY|CATEGORIA|CATEGORIA TARJETA|CATEGORIA DE LA TARJETA|CARD CLASS|CARD USAGE|USO|BUSINESS CARD|' +
  'COMMERCIAL CARD|PAYMENT METHOD VARIANT|CARD PRODUCT TYPE|TIPO DE CLIENTE|SEGMENTO');
columnas('region', 'REGION|AMBITO|AMBITO TARJETA|ORIGEN|PROCEDENCIA|AREA|ZONE|ZONA');
columnas('divisa', 'DIVISA|MONEDA|CURRENCY|MONEDA ORIGINAL|CURRENCY CODE');
columnas('reembolsado', 'AMOUNT REFUNDED|REFUNDED|IMPORTE DEVUELTO|IMPORTE REEMBOLSADO|DEVUELTO|REFUNDED AMOUNT');
columnas('id', 'ID|ID TRANSACCION|ID DE TRANSACCION|CODIGO DE TRANSACCION|CODIGO TRANSACCION|TRANSACTION ID|PAYMENT ID|REFERENCIA|' +
  'REFERENCE|PSP REFERENCE|N OPERACION|NUMERO DE OPERACION|NUM OPERACION|AUTORIZACION|CODIGO AUTORIZACION|AUTH CODE');
columnas('etiqueta', 'CONCEPTO|DESCRIPCION|DESCRIPTION|DETALLE|DETALLES|TIPO DE TARJETA Y AMBITO|CATEGORIA DE TARJETA|PRODUCTO DE TARJETA|' +
  'CLASE DE TARJETA|CONCEPTE');
columnas('ignorar', 'TERMINAL|N TERMINAL|NUMERO TERMINAL|TPV|COMERCIO|N COMERCIO|CODIGO COMERCIO|ESTABLECIMIENTO|DEVICE|READER|' +
  'TARJETA ENMASCARADA|PAN|CARD NUMBER|LAST4|CARD LAST 4|ULTIMOS 4|EMAIL|CUSTOMER|CLIENTE|DESCRIPTION OF GOODS|TIP|PROPINA|PROPINAS|TIPS');

/** Título normalizado de una columna («Importe (€)» → «IMPORTE EUR»). */
export function tituloColumna(celda) {
  if (celda === null || celda === undefined || typeof celda !== 'string') return '';
  return normalizar(celda).replace(/€/g, ' EUR ').replace(/%/g, ' % ').replace(/[^A-Z0-9%]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Papel de un título de columna, o null. */
export function papelDeColumna(celda) {
  const t = tituloColumna(celda);
  if (!t || t.length > 60) return null;
  if (COLUMNAS.has(t)) return COLUMNAS.get(t);
  const sinEur = t.replace(/ (EUR|EUROS|%)$/, '');
  if (COLUMNAS.has(sinEur)) return sinEur !== t && t.endsWith('%') && COLUMNAS.get(sinEur) === 'comision' ? 'tasa' : COLUMNAS.get(sinEur);
  if (/%$/.test(t) && /^(COMISION|TASA|FEE|RATE|DESCUENTO)/.test(t)) return 'tasa';
  return null;
}

// ───────────── estados y tipos de operación (exportaciones por cobro) ─────────────
const ESTADO_BIEN = new Set(['SUCCEEDED', 'SUCCESSFUL', 'SUCCESS', 'PAID', 'COMPLETED', 'COMPLETADA', 'COMPLETADO', 'CORRECTA',
  'CORRECTO', 'APROBADA', 'APROBADO', 'AUTORIZADA', 'AUTORIZADO', 'ACEPTADA', 'ACEPTADO', 'EXITOSA', 'EXITOSO', 'PAGADA', 'PAGADO',
  'SETTLED', 'LIQUIDADA', 'LIQUIDADO', 'CAPTURED', 'APPROVED', 'AUTHORISED', 'AUTHORIZED', 'OK', 'REALIZADA', 'REALIZADO',
  'COMPLETAT', 'COMPLETADA', 'PAGAT', 'ACCEPTAT', 'SENTFORSETTLE', 'SENT FOR SETTLE', 'SETTLEDBULK', 'TRUE', 'SI', 'YES',
  'REEMBOLSADO PARCIALMENTE', 'PARTIALLY REFUNDED', 'PARTIAL REFUND']);
const ESTADO_MAL = new Set(['FAILED', 'FAILURE', 'FALLIDA', 'FALLIDO', 'RECHAZADA', 'RECHAZADO', 'DENEGADA', 'DENEGADO', 'DECLINED',
  'REFUSED', 'CANCELADA', 'CANCELADO', 'CANCELLED', 'CANCELED', 'ANULADA', 'ANULADO', 'VOIDED', 'VOID', 'ERROR', 'PENDIENTE',
  'PENDING', 'EXPIRED', 'CADUCADA', 'ABANDONED', 'INCOMPLETE', 'REQUIRES PAYMENT METHOD', 'FALSE', 'NO', 'REBUTJADA', 'CANCEL·LADA',
  'CANCELLADA', 'REVERSED', 'REVERTIDA', 'BLOCKED', 'BLOQUEADA', 'AUTHORIZATION', 'AUTORIZACION PENDIENTE', 'REFUSED']);
const ESTADO_REEMBOLSADO = new Set(['REFUNDED', 'REEMBOLSADA', 'REEMBOLSADO', 'DEVUELTA', 'DEVUELTO', 'FULLY REFUNDED',
  'REEMBORSADA', 'RETORNADA']);

/** Estado de una operación: 'bien' (cuenta), 'mal' (fallida, no cuenta), 'reembolsada' (cuenta como venta y devolución) o null. */
export function estadoDeOperacion(v) {
  if (v === null || v === undefined || v === '') return null;
  const t = normalizar(String(v)).replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (ESTADO_BIEN.has(t)) return 'bien';
  if (ESTADO_REEMBOLSADO.has(t)) return 'reembolsada';
  if (ESTADO_MAL.has(t)) return 'mal';
  return null;
}

const TIPO_VENTA = ['SETTLED', 'SETTLEDBULK', 'CHARGE', 'PAYMENT', 'SALE', 'SALES', 'VENTA', 'VENTAS', 'PAGO', 'COBRO', 'COMPRA', 'CAPTURE', 'CARD PAYMENT',
  'PAGO CON TARJETA', 'VENDA', 'COBRAMENT', 'PAGAMENT', 'TRANSACCION', 'TRANSACTION', 'OPERACION', 'CARD', 'TARJETA'];
const TIPO_DEVOLUCION = ['REFUNDED', 'REFUNDEDBULK', 'REFUND', 'REFUNDS', 'DEVOLUCION', 'DEVOLUCIONES', 'REEMBOLSO', 'ABONO', 'ANULACION', 'RETURN',
  'PAYMENT REFUND', 'DEVOLUCIO', 'REEMBORSAMENT', 'REVERSAL'];
const TIPO_CONTRACARGO = ['CHARGEBACK', 'DISPUTE', 'CONTRACARGO', 'RETROCESION', 'DISPUTA'];
const TIPO_OTRO = ['CHARGEBACKREVERSED', 'CHARGEBACK REVERSAL', 'DISPUTE REVERSAL', 'MERCHANTPAYOUT', 'MISCCOSTS', 'INVOICEDEDUCTION', 'DEPOSITCORRECTION', 'BALANCETRANSFER', 'PAYOUT', 'TRANSFER', 'TRANSFERENCIA', 'ADJUSTMENT', 'AJUSTE', 'FEE', 'COMISION', 'STRIPE FEE', 'TAX', 'IVA',
  'TOPUP', 'RESERVE', 'RESERVA', 'LIQUIDACION', 'ABONO EN CUENTA', 'SUBSCRIPTION', 'CUOTA', 'PAYOUT REVERSAL', 'APPLICATION FEE',
  'NETWORK COST', 'RESERVED FUNDS', 'TIP', 'PROPINA'];

/** Tipo de una operación por su columna «Tipo»: 'venta' | 'devolucion' | 'contracargo' | 'otro' | null (no se sabe). */
export function tipoDeOperacion(v) {
  if (v === null || v === undefined || v === '') return null;
  const p = palabrasDe(String(v));
  const casa = (l) => l.some((f) => contieneFrase(p, f.split(' ')));
  if (casa(TIPO_CONTRACARGO)) return 'contracargo';
  if (casa(TIPO_DEVOLUCION)) return 'devolucion';
  if (casa(TIPO_OTRO)) return 'otro';
  if (casa(TIPO_VENTA)) return 'venta';
  return null;
}

// ───────────── países del Espacio Económico Europeo ─────────────
// El Reglamento (UE) 2015/751 topa la tasa de intercambio de las tarjetas de particular emitidas en el EEE.
const EEE = 'AT BE BG HR CY CZ DK EE FI FR DE GR EL HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO'.split(' ');
const EEE_NOMBRES = ['AUSTRIA', 'BELGICA', 'BELGIUM', 'BULGARIA', 'CROACIA', 'CROATIA', 'CHIPRE', 'CYPRUS', 'CHEQUIA', 'CZECHIA',
  'REPUBLICA CHECA', 'CZECH REPUBLIC', 'DINAMARCA', 'DENMARK', 'ESTONIA', 'FINLANDIA', 'FINLAND', 'FRANCIA', 'FRANCE', 'ALEMANIA',
  'GERMANY', 'GRECIA', 'GREECE', 'HUNGRIA', 'HUNGARY', 'IRLANDA', 'IRELAND', 'ITALIA', 'ITALY', 'LETONIA', 'LATVIA', 'LITUANIA',
  'LITHUANIA', 'LUXEMBURGO', 'LUXEMBOURG', 'MALTA', 'PAISES BAJOS', 'HOLANDA', 'NETHERLANDS', 'POLONIA', 'POLAND', 'PORTUGAL',
  'RUMANIA', 'ROMANIA', 'ESLOVAQUIA', 'SLOVAKIA', 'ESLOVENIA', 'SLOVENIA', 'ESPANA', 'SPAIN', 'SUECIA', 'SWEDEN', 'ISLANDIA',
  'ICELAND', 'LIECHTENSTEIN', 'NORUEGA', 'NORWAY', 'ESPANYA', 'FRANCA', 'ALEMANYA', 'ITALIA', 'ESP', 'FRA', 'DEU', 'ITA', 'PRT',
  'NLD', 'BEL', 'AUT', 'IRL', 'POL', 'SWE', 'DNK', 'FIN', 'GRC', 'NOR'];
const EEE_SET = new Set([...EEE, ...EEE_NOMBRES]);

/** ¿País del EEE? true, false o null si no se sabe (vacío o ilegible). */
export function esDelEEE(v) {
  if (v === null || v === undefined) return null;
  const t = normalizar(String(v)).replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t === 'UNKNOWN' || t === 'DESCONOCIDO' || t === 'N A' || t === 'NA') return null;
  if (EEE_SET.has(t)) return true;
  if (/^[A-Z]{2,3}$/.test(t) || t.length > 3) return false; // otro código o nombre de país
  return null;
}

/** ¿La categoría de la tarjeta dice empresa? true, false o null. */
export function esDeEmpresa(v) {
  if (v === null || v === undefined || v === '') return null;
  const p = palabrasDe(String(v));
  if (!p.length) return null;
  if (alguna(p, EMPRESA_P) || /CORPORATE|COMMERCIAL|BUSINESS|PURCHASING|FLEET/.test(p.join(' '))) return true;
  // variantes de una sola palabra («visadebit», «mc», «maestro»): de particular salvo que digan lo contrario
  if (p.length === 1 && /^(VISA|MC|MASTERCARD|MAESTRO|ELECTRON|VPAY)(DEBIT|CREDIT|PREPAID|CLASSIC|GOLD|PLATINUM|STANDARD)?$/.test(p[0])) return false;
  if (alguna(p, PARTICULAR_P) || p.includes('STANDARD') || p.includes('CLASSIC') || p.includes('GOLD') || p.includes('PLATINUM')) return false;
  return null;
}

// ───────────── proveedores ─────────────
// id → nombre, frases que lo reconocen y valor del botón de la calculadora (data-v de #pProvChips) si lo tiene.
export const PROVEEDORES = [
  { id: 'sumup', nombre: 'SumUp', frases: ['SUMUP', 'SUM UP'], calculadora: 'SumUp' },
  { id: 'stripe', nombre: 'Stripe', frases: ['STRIPE'], calculadora: null },
  { id: 'square', nombre: 'Square', frases: ['SQUARE', 'SQUAREUP', 'BLOCK INC'], calculadora: 'Square' },
  { id: 'zettle', nombre: 'Zettle', frases: ['ZETTLE', 'IZETTLE', 'ZETTLE BY PAYPAL'], calculadora: null },
  { id: 'mypos', nombre: 'myPOS', frases: ['MYPOS', 'MY POS'], calculadora: null },
  { id: 'revolut', nombre: 'Revolut', frases: ['REVOLUT'], calculadora: 'Revolut' },
  { id: 'dojo', nombre: 'Dojo', frases: ['DOJO', 'PAYMENTSENSE'], calculadora: null },
  { id: 'adyen', nombre: 'Adyen', frases: ['ADYEN'], calculadora: null },
  { id: 'caixabank', nombre: 'CaixaBank', frases: ['CAIXABANK', 'COMERCIA GLOBAL PAYMENTS', 'COMERCIA GLOBAL', 'CAIXABANK PAYMENTS',
    'LA CAIXA'], calculadora: 'CaixaBank' },
  { id: 'santander', nombre: 'Santander', frases: ['GETNET', 'SANTANDER', 'BANCO SANTANDER'], calculadora: 'Santander-Getnet' },
  { id: 'bbva', nombre: 'BBVA', frases: ['BBVA'], calculadora: 'BBVA' },
  { id: 'sabadell', nombre: 'Sabadell', frases: ['SABADELL', 'BANCO SABADELL', 'PAYCOMET'], calculadora: 'Sabadell' },
  { id: 'bankinter', nombre: 'Bankinter', frases: ['BANKINTER'], calculadora: null },
  { id: 'unicaja', nombre: 'Unicaja', frases: ['UNICAJA'], calculadora: null },
  { id: 'kutxabank', nombre: 'Kutxabank', frases: ['KUTXABANK', 'KUTXA'], calculadora: null },
  { id: 'ibercaja', nombre: 'Ibercaja', frases: ['IBERCAJA'], calculadora: null },
  { id: 'ing', nombre: 'ING', frases: ['ING BANK', 'ING DIRECT', 'ING ESPANA'], calculadora: null },
  { id: 'abanca', nombre: 'Abanca', frases: ['ABANCA'], calculadora: null },
  { id: 'cajamar', nombre: 'Cajamar', frases: ['CAJAMAR', 'GRUPO COOPERATIVO CAJAMAR'], calculadora: null },
].map((p) => ({ ...p, partidas: p.frases.map((f) => f.split(' ')) }));

/**
 * Proveedores que nombra un texto, con cuántas veces y en qué línea aparece cada uno por primera vez.
 * @param {Array<{palabras: string[], indice: number}>} lineas
 */
export function proveedoresEn(lineas) {
  const vistos = new Map();
  for (const L of lineas) {
    for (const p of PROVEEDORES) {
      if (!p.partidas.some((f) => contieneFrase(L.palabras, f))) continue;
      const v = vistos.get(p.id) ?? { proveedor: p, veces: 0, primera: L };
      v.veces++;
      vistos.set(p.id, v);
    }
  }
  return [...vistos.values()].sort((a, b) => a.primera.indice - b.primera.indice || b.veces - a.veces);
}

export { contieneFrase };
