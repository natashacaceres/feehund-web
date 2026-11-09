// Particularidades de cada banco, reconocidas por los títulos de las columnas.
// OJO: todo lo de aquí son HIPÓTESIS sacadas de la documentación pública y de ejemplos, no de archivos reales.
// Cada perfil lleva hipotesis: true hasta que se confirme con un extracto real anonimizado (tests/anonimizar.js).
// Los bancos sin nada propio (CaixaBank, imagin, Santander, BBVA, Sabadell, Abanca, Bankinter, Openbank, Unicaja,
// Kutxabank, Ibercaja, Cajamar, MyInvestor, Trade Republic…) los lee el lector genérico con el diccionario de cabeceras.js.
// Lógica pura.

/**
 * Ajustes que entiende tabla.js:
 * - papeles: título normalizado → papel; manda sobre el diccionario general.
 * - estados_validos: solo se cuentan las filas con ese estado; las demás se cuentan en el aviso aviso_estados.
 * - comision_aparte: {concepto}: la comisión de la fila va como un movimiento aparte (importe −comisión) y el saldo
 *   de la fila pasa a ese segundo movimiento, porque ya incluye importe y comisión.
 * - comision_incluida: la columna de comisión ya va dentro del importe; no se usa.
 * - cuenta_con_divisa: cuenta = valor de la columna de cuenta + divisa («Current EUR»).
 * - cambio_divisa: cómo reconocer un cambio de moneda (nota 'cambio_divisa').
 * - concepto_orden: orden de los papeles al unir el concepto.
 * - concepto_primero: grupos de títulos; el concepto es el primer valor no vacío.
 * - max_movimientos: {n, aviso}: si salen exactamente n movimientos, aviso (el banco corta las descargas).
 */
export const PERFILES = [
  {
    id: 'revolut',
    nombre: 'Revolut',
    hipotesis: true,
    // Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance.
    // Hipótesis: con la app en castellano los títulos podrían salir traducidos (Tipo, Producto, Fecha de inicio…).
    reconocer: (t) =>
      algun(t, ['TYPE', 'TIPO', 'TIPUS']) && algun(t, ['PRODUCT', 'PRODUCTO', 'PRODUCTE']) &&
      algun(t, ['STARTED DATE', 'FECHA DE INICIO', 'DATA D INICI']) && algun(t, ['STATE', 'ESTADO', 'ESTAT']),
    papeles: {
      PRODUCT: 'cuenta', PRODUCTO: 'cuenta', PRODUCTE: 'cuenta', TYPE: 'tipo', TIPO: 'tipo', TIPUS: 'tipo',
      DESCRIPTION: 'concepto', DESCRIPCION: 'concepto', DESCRIPCIO: 'concepto', BALANCE: 'saldo', SALDO: 'saldo',
      FEE: 'comision', COMISION: 'comision', COMISSIO: 'comision',
    },
    ajustes: {
      // Hipótesis: solo COMPLETED es dinero que se ha movido (PENDING, REVERTED, DECLINED, FAILED no).
      estados_validos: ['COMPLETED', 'COMPLETADO', 'COMPLETADA', 'COMPLETAT'],
      aviso_estados: 'revolut_pendientes',
      // Hipótesis: Balance ya descuenta la comisión (Balance = anterior + Amount − Fee).
      comision_aparte: { concepto: 'Comisión Revolut' },
      cuenta_con_divisa: true,
      // Hipótesis: un cambio de moneda son dos filas, una en cada divisa, con Type EXCHANGE («Exchanged to USD»).
      cambio_divisa: { tipos: ['EXCHANGE', 'CAMBIO', 'CANVI'], concepto: /^(EXCHANGED|CONVERTED|CAMBIAD[OA]|CAMBIO|CANVIAT|CANVI)\b/ },
    },
  },
  {
    id: 'n26',
    nombre: 'N26',
    hipotesis: true,
    // Formato nuevo: Booking Date, Value Date, Partner Name, Partner Iban, Type, Payment Reference, Account Name,
    // Amount (EUR), Original Amount, Original Currency, Exchange Rate. Sin saldo.
    reconocer: (t) => t.has('BOOKING DATE') && t.has('PARTNER NAME') && algun(t, ['AMOUNT EUR', 'AMOUNT']),
    papeles: {
      'BOOKING DATE': 'fecha', 'VALUE DATE': 'fecha_valor', 'PARTNER NAME': 'contraparte', 'PARTNER IBAN': 'otro',
      TYPE: 'tipo', 'PAYMENT REFERENCE': 'concepto_extra', 'ACCOUNT NAME': 'cuenta', 'AMOUNT EUR': 'importe',
      'ORIGINAL AMOUNT': 'otro', 'ORIGINAL CURRENCY': 'otro', 'EXCHANGE RATE': 'otro',
    },
    ajustes: { concepto_orden: ['contraparte', 'concepto_extra', 'concepto'], sin_saldo: true, divisa: 'EUR' },
  },
  {
    id: 'n26',
    nombre: 'N26',
    hipotesis: true,
    // Formato antiguo: Date, Payee, Account number, Transaction type, Payment reference, Amount (EUR),
    // Amount (Foreign Currency), Type Foreign Currency, Exchange Rate. Sin saldo.
    reconocer: (t) => t.has('PAYEE') && t.has('TRANSACTION TYPE') && t.has('AMOUNT EUR'),
    papeles: {
      DATE: 'fecha', PAYEE: 'contraparte', 'ACCOUNT NUMBER': 'otro', 'TRANSACTION TYPE': 'tipo',
      'PAYMENT REFERENCE': 'concepto_extra', 'AMOUNT EUR': 'importe', 'AMOUNT FOREIGN CURRENCY': 'otro',
      'TYPE FOREIGN CURRENCY': 'otro', 'EXCHANGE RATE': 'otro', CATEGORY: 'categoria',
    },
    ajustes: { concepto_orden: ['contraparte', 'concepto_extra', 'concepto'], sin_saldo: true, divisa: 'EUR' },
  },
  {
    id: 'wise',
    nombre: 'Wise',
    hipotesis: true,
    // ID o TransferWise ID, Date, Amount, Currency, Description, Payment Reference, Running Balance, Exchange From,
    // Exchange To, Exchange Rate, Payer Name, Payee Name, Payee Account Number, Merchant, Card Last Four Digits,
    // Card Holder Full Name, Attachment, Note, Total fees. Un archivo por divisa.
    reconocer: (t) => algun(t, ['TRANSFERWISE ID', 'ID']) && t.has('RUNNING BALANCE') && algun(t, ['EXCHANGE FROM', 'MERCHANT', 'PAYEE NAME']),
    papeles: {
      'TRANSFERWISE ID': 'referencia', ID: 'referencia', DATE: 'fecha', AMOUNT: 'importe', CURRENCY: 'divisa',
      DESCRIPTION: 'concepto', 'PAYMENT REFERENCE': 'concepto_extra', 'RUNNING BALANCE': 'saldo', MERCHANT: 'contraparte',
      'PAYER NAME': 'otro', 'PAYEE NAME': 'otro', 'TOTAL FEES': 'comision', NOTE: 'otro',
    },
    ajustes: {
      // Concepto = Merchant o, si no hay, Description.
      concepto_primero: [['MERCHANT'], ['DESCRIPTION']],
      // Hipótesis: Total fees ya va dentro de Amount. No se duplica.
      comision_incluida: true,
      cambio_divisa: { columnas: ['EXCHANGE FROM', 'EXCHANGE TO'], concepto: /^(CONVERTED|CONVERSION|EXCHANGED)\b/ },
    },
  },
  {
    id: 'ing',
    nombre: 'ING',
    hipotesis: true,
    // Filas de logo y datos de cuenta antes de la tabla; F. VALOR, CATEGORÍA, SUBCATEGORÍA, DESCRIPCIÓN, COMENTARIO,
    // IMAGEN, IMPORTE (€), SALDO (€). Hipótesis: como mucho 250 movimientos por descarga.
    reconocer: (t) => t.has('F VALOR') && algun(t, ['SUBCATEGORIA', 'IMAGEN']) && algun(t, ['IMPORTE EUR', 'IMPORTE']) && algun(t, ['DESCRIPCION', 'COMENTARIO']),
    papeles: { 'F VALOR': 'fecha', DESCRIPCION: 'concepto', COMENTARIO: 'concepto_extra', IMAGEN: 'otro' },
    ajustes: { max_movimientos: { n: 250, aviso: 'ing_250' } },
  },
  {
    id: 'bunq',
    nombre: 'bunq',
    hipotesis: true,
    // Date;Interest Date;Amount;Account;Counterparty;Name;Description. Counterparty es el IBAN de la otra parte.
    reconocer: (t) => t.has('INTEREST DATE') && t.has('COUNTERPARTY') && t.has('NAME'),
    papeles: { DATE: 'fecha', 'INTEREST DATE': 'fecha_valor', ACCOUNT: 'cuenta', COUNTERPARTY: 'otro', NAME: 'contraparte', DESCRIPTION: 'concepto' },
    ajustes: { concepto_orden: ['contraparte', 'concepto', 'concepto_extra'] },
  },
];

function algun(conjunto, lista) {
  for (const x of lista) if (conjunto.has(x)) return true;
  return false;
}

/**
 * Banco al que corresponde una fila de títulos.
 * @param {string[]} titulos títulos normalizados (normalizarCabecera)
 * @returns {null|{id: string, nombre: string, hipotesis: boolean, papeles: Object, ajustes: Object}}
 */
export function reconocerPerfil(titulos) {
  const t = new Set((titulos || []).filter(Boolean));
  if (t.size < 2) return null;
  for (const p of PERFILES) {
    if (p.reconocer(t)) return { id: p.id, nombre: p.nombre, hipotesis: p.hipotesis, papeles: p.papeles ?? {}, ajustes: p.ajustes ?? {} };
  }
  return null;
}
