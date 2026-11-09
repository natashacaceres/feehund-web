// OFX (Open Financial Exchange): 1.x en SGML (etiquetas de dato sin cerrar) y 2.x en XML.
// Cuentas (STMTRS) y tarjetas (CCSTMTRS). Una LecturaArchivo por extracto. Sin saldo inicial: OFX no lo trae.

import { crearMovimiento, crearLectura, lecturaConError, aviso } from '../nucleo/modelo.js';
import { parseImporte, inferirDecimal } from '../nucleo/numeros.js';
import { parseFecha, diasEntre } from '../nucleo/fechas.js';
import { decodificar } from '../nucleo/texto.js';
import { decodificarEntidades } from '../nucleo/xml.js';
import { unirConceptos, perfilPorCuenta, avisoContado } from './formato.js';

// Agregados (etiquetas con hijos) que pueden aparecer en extractos. El resto son datos.
const AGREGADOS = new Set([
  'OFX', 'SIGNONMSGSRSV1', 'SONRS', 'STATUS', 'FI', 'BANKMSGSRSV1', 'STMTTRNRS', 'STMTRS', 'BANKACCTFROM', 'BANKACCTTO',
  'CCACCTFROM', 'CCACCTTO', 'BANKTRANLIST', 'STMTTRN', 'PAYEE', 'LEDGERBAL', 'AVAILBAL', 'BALLIST', 'BAL', 'CURRENCY',
  'ORIGCURRENCY', 'CREDITCARDMSGSRSV1', 'CCSTMTTRNRS', 'CCSTMTRS', 'STMTENDTRNRS', 'CCSTMTENDTRNRS', 'INVSTMTMSGSRSV1',
  'INVSTMTTRNRS', 'INVSTMTRS', 'INVTRANLIST', 'INVPOSLIST', 'INVBAL', 'INVACCTFROM', 'SECLISTMSGSRSV1', 'SECLIST',
  'MKTGINFO', 'IMAGEDATA', 'REWARDINFO', 'EXTBANKACCTTO', 'INV401K', 'INV401KBAL',
]);

// Tipos que dicen hacia dónde va el dinero. PAYMENT en una cuenta es un pago (sale);
// en una tarjeta es lo que se paga a la tarjeta (entra).
const TIPOS = {
  cuenta: {
    cargo: new Set(['DEBIT', 'PAYMENT', 'POS', 'ATM', 'FEE', 'SRVCHG', 'CHECK', 'DIRECTDEBIT', 'REPEATPMT', 'CASH']),
    abono: new Set(['CREDIT', 'INT', 'DIV', 'DEP', 'DIRECTDEP']),
  },
  tarjeta: {
    cargo: new Set(['DEBIT', 'POS', 'ATM', 'FEE', 'SRVCHG', 'CHECK', 'DIRECTDEBIT', 'REPEATPMT', 'CASH']),
    abono: new Set(['CREDIT', 'PAYMENT', 'INT', 'DIV', 'DEP', 'DIRECTDEP']),
  },
};
// Tipos que no sirven para decidir que los signos vienen al revés: INT son intereses cobrados o pagados
// (OFX dice que depende del signo) y PAYMENT cambia de sentido según la cuenta y según el banco
// (hay tarjetas que llaman PAYMENT a cada compra). Con ellos se daba la vuelta a todas las compras.
const SIN_VOTO = new Set(['PAYMENT', 'INT']);
// Todo en positivo: estos no dicen si el dinero entra o sale
const SIGNO_INCIERTO = new Set(['INT']);

// Concepto común de Norma 43 equivalente, solo para los tipos que no dejan duda (como en camt y MT940)
const COMUN_OFX = { DIRECTDEBIT: '03', FEE: '17', SRVCHG: '17', INT: '17', ATM: '11', CASH: '11', POS: '12', CHECK: '01', DIV: '08' };

/**
 * Árbol tolerante: vale para SGML (datos sin cierre) y para XML.
 * Nodo: { nombre, valor?: string, hijos?: Nodo[], linea }
 */
function arbolOFX(texto, inicio, esXML) {
  const raiz = { nombre: '#', hijos: [], linea: 1 };
  const pila = [raiz];
  // [^<>]* y no [^>]*: una etiqueta sin '>' no puede tragarse las siguientes (con muchas, el coste era cuadrático)
  const re = /<(\/?)([A-Za-z0-9._]+)([^<>]*)>([^<]*)/g;
  re.lastIndex = inicio;
  const fichas = [];
  let m, contado = 0, linea = 1;
  while ((m = re.exec(texto))) {
    for (; contado < m.index; contado++) if (texto.charCodeAt(contado) === 10) linea++;
    fichas.push({ cierre: m[1] === '/', nombre: m[2].toUpperCase(), vacia: m[1] !== '/' && /\/\s*$/.test(m[3]), texto: m[4], linea });
  }
  for (let i = 0; i < fichas.length; i++) {
    const f = fichas[i];
    if (f.cierre) {
      for (let k = pila.length - 1; k > 0; k--) if (pila[k].nombre === f.nombre) { pila.length = k; break; }
      continue;
    }
    // un agregado no puede ir dentro de otro igual: si falta </STMTTRN> (o </PAYEE> dentro de él),
    // el siguiente <STMTTRN> cierra el anterior y todo lo que quedó abierto dentro
    if (AGREGADOS.has(f.nombre)) {
      for (let k = pila.length - 1; k > 0; k--) if (pila[k].nombre === f.nombre) { pila.length = k; break; }
    }
    const padre = pila[pila.length - 1];
    if (f.vacia) { // <MEMO/> o <BANKTRANLIST/>: elemento vacío, no abre nada
      padre.hijos.push(AGREGADOS.has(f.nombre) ? { nombre: f.nombre, hijos: [], linea: f.linea } : { nombre: f.nombre, valor: '', linea: f.linea });
      continue;
    }
    const valor = f.texto.trim();
    const sig = fichas[i + 1];
    const cierraYa = sig && sig.cierre && sig.nombre === f.nombre;
    if (valor !== '' && !AGREGADOS.has(f.nombre)) {
      padre.hijos.push({ nombre: f.nombre, valor: decodificarEntidades(valor), linea: f.linea });
      if (cierraYa) i++; // <NAME>…</NAME> al estilo XML
    } else if (cierraYa) {
      padre.hijos.push({ nombre: f.nombre, valor: '', linea: f.linea });
      i++;
    } else if (AGREGADOS.has(f.nombre) || esXML) {
      const nodo = { nombre: f.nombre, hijos: [], linea: f.linea };
      padre.hijos.push(nodo);
      pila.push(nodo);
    } else {
      padre.hijos.push({ nombre: f.nombre, valor: '', linea: f.linea }); // dato vacío en SGML
    }
  }
  return raiz;
}

/** Descendientes con alguno de esos nombres (sin entrar en los que ya coinciden). */
function buscarOFX(nodo, nombres) {
  const r = [];
  const pila = [...(nodo.hijos ?? [])].reverse();
  while (pila.length) {
    const n = pila.pop();
    if (nombres.includes(n.nombre)) { r.push(n); continue; }
    if (n.hijos) for (let i = n.hijos.length - 1; i >= 0; i--) pila.push(n.hijos[i]);
  }
  return r;
}

function hijoOFX(nodo, nombre) {
  return nodo?.hijos?.find((h) => h.nombre === nombre) ?? null;
}

/**
 * Agregado de un extracto (BANKTRANLIST, LEDGERBAL…): hijo directo o, si el banco no cerró un agregado anterior
 * (falta </BANKACCTFROM> en SGML y todo lo que sigue queda dentro), el primero que haya debajo.
 */
function agregadoOFX(st, nombre) {
  return hijoOFX(st, nombre) ?? buscarOFX(st, [nombre])[0] ?? null;
}

/**
 * Dato de un hijo directo; si no está, el primero que haya debajo (sin entrar en otros movimientos).
 * La cola se recorre con un índice: con shift() y push(...hijos), una lista de 80 000 etiquetas sin el dato
 * tardaba 4,5 s (crecía con el cuadrado) y una de varios millones lanzaba un error.
 */
function datoOFX(nodo, nombre) {
  const h = hijoOFX(nodo, nombre);
  if (h && h.valor !== undefined) return h.valor || null;
  const cola = nodo?.hijos ? nodo.hijos.slice() : [];
  for (let i = 0; i < cola.length; i++) {
    const n = cola[i];
    if (n.nombre === nombre && n.valor !== undefined) return n.valor || null;
    if (n.hijos && n.nombre !== 'STMTTRN' && n.nombre !== 'BANKTRANLIST') for (const x of n.hijos) cola.push(x);
  }
  return null;
}

/**
 * AAAAMMDD[HHMMSS[.XXX]][[±H:TZ]] → AAAA-MM-DD (sin cambiar de zona: la fecha es la que pone el banco).
 * También AAAA-MM-DD, que escriben algunos programas aunque OFX no lo admita (no hay ambigüedad).
 */
function fechaOFX(s) {
  const m = /^\s*(\d{8})/.exec(s ?? '');
  if (m) return parseFecha(m[1], { compacta: true });
  const iso = /^\s*(\d{4}-\d{2}-\d{2})(?![\d-])/.exec(s ?? '');
  return iso ? parseFecha(iso[1]) : null;
}

/** Importe OFX: con signo; algunos bancos españoles usan coma decimal. */
function importeOFX(s, decimal) {
  if (!s) return null;
  return parseImporte(s.trim().replace(/^([+-]?)([.,])(\d)/, '$10$2$3'), { decimal }); // "-.99" → "-0.99"
}

/** OFX 1.x con CHARSET:1252: si se decodificó como cp850, se vuelve a leer como windows-1252. */
function textoOFX(entrada) {
  let texto, codificacion;
  if (typeof entrada.texto === 'string') { texto = entrada.texto; codificacion = entrada.codificacion ?? null; } else ({ texto, codificacion } = decodificar(entrada.bytes));
  if (codificacion === 'cp850' && entrada.bytes && /CHARSET\s*:\s*(?:1252|ISO-?8859-1|LATIN-?1)/i.test(texto.slice(0, 2000))) {
    return new TextDecoder('windows-1252').decode(entrada.bytes);
  }
  return texto;
}

/**
 * Lee un OFX. Una LecturaArchivo por extracto de cuenta o de tarjeta.
 * @param {{nombre: string, bytes?: Uint8Array, texto?: string, codificacion?: string}} entrada
 * @param {{idArchivo: number|string}} ctx
 */
export async function leer(entrada, ctx) {
  const archivo = entrada.nombre;
  const texto = textoOFX(entrada);
  const inicio = texto.search(/<OFX[\s>]/i);
  if (inicio < 0) return lecturaConError(archivo, 'ofx', 'danado', { archivo });
  const cabecera = texto.slice(0, inicio);
  const esXML = /<\?xml/i.test(cabecera) || /OFXHEADER\s*=\s*"?2/i.test(cabecera);
  const version = (/VERSION\s*[:=]\s*"?(\d{3})/i.exec(cabecera) || [])[1] ?? null;
  const arbol = arbolOFX(texto, inicio, esXML);

  const extractos = buscarOFX(arbol, ['STMTRS', 'CCSTMTRS']);
  const hayInversiones = buscarOFX(arbol, ['INVSTMTRS']).length > 0;
  if (!extractos.length) return lecturaConError(archivo, 'ofx', hayInversiones ? 'formato_sin_cuentas' : 'danado', { archivo });

  // separador decimal de todo el archivo (OFX dice punto, pero hay bancos que usan coma)
  // los movimientos van en BANKTRANLIST; si no hay ninguno ahí (lista vacía <BANKTRANLIST/> o mal anidada), se buscan en todo el extracto
  const transacciones = extractos.map((st) => {
    const lista = agregadoOFX(st, 'BANKTRANLIST');
    const dentro = lista ? buscarOFX(lista, ['STMTTRN']) : [];
    return dentro.length ? dentro : buscarOFX(st, ['STMTTRN']);
  });
  const decimal = inferirDecimal(transacciones.flat().map((t) => datoOFX(t, 'TRNAMT')).filter(Boolean)) ?? '.';

  const lecturas = [];
  let n = 0;
  extractos.forEach((st, k) => {
    const tarjeta = st.nombre === 'CCSTMTRS';
    const cuentaNodo = hijoOFX(st, tarjeta ? 'CCACCTFROM' : 'BANKACCTFROM') ?? hijoOFX(st, 'BANKACCTFROM') ?? hijoOFX(st, 'CCACCTFROM');
    const banco = datoOFX(cuentaNodo, 'BANKID');
    const oficina = datoOFX(cuentaNodo, 'BRANCHID');
    const numero = datoOFX(cuentaNodo, 'ACCTID');
    const cuenta = [banco, oficina, numero].filter(Boolean).join('-') || null;
    const curdef = (datoOFX(st, 'CURDEF') ?? 'EUR').toUpperCase();
    const lista = agregadoOFX(st, 'BANKTRANLIST');
    const desde = fechaOFX(datoOFX(lista, 'DTSTART'));
    const hasta = fechaOFX(datoOFX(lista, 'DTEND'));
    const avisos = [];
    const brutos = [];
    const lineasMalas = [];
    const equivalencias = [];

    for (const trn of transacciones[k]) {
      const tipo = (datoOFX(trn, 'TRNTYPE') ?? '').toUpperCase() || null;
      const publicado = fechaOFX(datoOFX(trn, 'DTPOSTED'));
      let usuario = fechaOFX(datoOFX(trn, 'DTUSER'));
      const disponible = fechaOFX(datoOFX(trn, 'DTAVAIL'));
      if (usuario && publicado && Math.abs(diasEntre(publicado, usuario)) > 31) usuario = null; // fecha de usuario absurda
      const importe = importeOFX(datoOFX(trn, 'TRNAMT'), decimal);
      const fecha = usuario ?? publicado ?? disponible;
      if (importe === null || !fecha) { lineasMalas.push(trn.linea); continue; }
      const payee = hijoOFX(trn, 'PAYEE');
      const nombre = datoOFX(trn, 'NAME') ?? (payee ? datoOFX(payee, 'NAME') : null);
      const memo = datoOFX(trn, 'MEMO');
      const moneda = hijoOFX(trn, 'CURRENCY');
      const original = hijoOFX(trn, 'ORIGCURRENCY');
      brutos.push({
        tipo,
        fecha,
        publicado: publicado ?? fecha,
        fecha_valor: usuario && publicado && usuario !== publicado ? publicado : disponible,
        importe,
        concepto: unirConceptos([nombre, memo]),
        divisa: (moneda && datoOFX(moneda, 'CURSYM')) || curdef,
        fila: trn.linea,
        original: original ? { divisa: datoOFX(original, 'CURSYM'), cambio: datoOFX(original, 'CURRATE') } : null,
      });
    }

    // el signo, contrastado con el tipo de cada movimiento
    const { cargo, abono } = TIPOS[tarjeta ? 'tarjeta' : 'cuenta'];
    const sinNegativos = brutos.length > 0 && brutos.every((b) => b.importe >= 0);
    let coherentes = 0, alReves = 0;
    for (const b of brutos) {
      if (!b.importe || SIN_VOTO.has(b.tipo)) continue;
      if (cargo.has(b.tipo)) { if (b.importe < 0) coherentes++; else alReves++; } else if (abono.has(b.tipo)) { if (b.importe > 0) coherentes++; else alReves++; }
    }
    let dudosos = 0;
    if (sinNegativos && brutos.some((b) => cargo.has(b.tipo))) {
      // todo en positivo: el signo sale del tipo (DEBIT, POS…); lo que no tiene un tipo claro queda marcado
      for (const b of brutos) {
        if (cargo.has(b.tipo)) b.importe = -b.importe;
        else if (!abono.has(b.tipo) || SIGNO_INCIERTO.has(b.tipo)) { b.dudoso = true; dudosos++; }
      }
      avisos.push(aviso('formato_signo_por_tipo', { archivo }));
      if (dudosos) avisos.push(avisoContado('formato_signo_dudoso', dudosos, { archivo }));
    } else if (alReves >= 3 && alReves > coherentes * 3) {
      // signos al revés (pasa en tarjetas: compras en positivo y pagos en negativo): los tipos lo delatan
      for (const b of brutos) b.importe = -b.importe;
      avisos.push(aviso('formato_signo_invertido', { archivo }));
    }

    const movimientos = brutos.map((b) => {
      const id = `${ctx.idArchivo}-${++n}`;
      if (b.original) equivalencias.push({ movimiento: id, ...b.original });
      return crearMovimiento({
        id, fecha: b.fecha, fecha_valor: b.fecha_valor, concepto: b.concepto, importe: b.importe || 0, saldo: null, divisa: b.divisa,
        origen: { archivo, fila: b.fila }, tipo: b.tipo, concepto_comun: COMUN_OFX[b.tipo] ?? null, cuenta, dudoso: b.dudoso,
      });
    });
    if (lineasMalas.length) avisos.unshift(avisoContado('formato_movimientos_saltados', lineasMalas.length, { archivo, filas: lineasMalas.slice(0, 50) }));

    // saldo final: solo si es del final del periodo. Algunos bancos dan el de hoy, con movimientos que no vienen
    // en la lista; otros, el de un día anterior al último movimiento (ese saldo no es el final de la lista).
    const libro = agregadoOFX(st, 'LEDGERBAL');
    const saldo = libro ? importeOFX(datoOFX(libro, 'BALAMT'), decimal) : null;
    const saldoFecha = libro ? fechaOFX(datoOFX(libro, 'DTASOF')) : null;
    const ultimoPublicado = brutos.reduce((max, b) => (b.publicado > max ? b.publicado : max), '');
    const saldoDelPeriodo = saldo !== null && (!saldoFecha || ((!hasta || diasEntre(hasta, saldoFecha) <= 1) && ultimoPublicado <= saldoFecha));
    const disp = agregadoOFX(st, 'AVAILBAL');

    lecturas.push(crearLectura({
      archivo,
      formato: 'ofx',
      perfil: perfilPorCuenta({ entidad: /^\d{4}$/.test(banco ?? '') ? banco : undefined, iban: numero }),
      nivel: 'A',
      movimientos,
      saldo_inicial: null,
      saldo_final: saldoDelPeriodo ? saldo : null,
      fecha_inicial: desde,
      fecha_final: hasta,
      avisos,
      extra: {
        version,
        tipo: tarjeta ? 'tarjeta' : 'cuenta',
        cuenta: { banco, oficina, numero, tipo: datoOFX(cuentaNodo, 'ACCTTYPE') },
        divisa: curdef,
        saldo_libro: saldo === null ? null : { importe: saldo, fecha: saldoFecha },
        saldo_disponible: disp ? { importe: importeOFX(datoOFX(disp, 'BALAMT'), decimal), fecha: fechaOFX(datoOFX(disp, 'DTASOF')) } : null,
        equivalencias,
      },
    }));
  });
  if (hayInversiones) lecturas[0].avisos.push(aviso('formato_inversiones_ignoradas', { archivo }));
  return lecturas.length === 1 ? lecturas[0] : lecturas;
}
