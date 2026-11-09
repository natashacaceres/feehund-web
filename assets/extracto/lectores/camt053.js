// camt.053 (ISO 20022, extracto de cuenta; versiones 001.02 a 001.13). También camt.052 y camt.054, que son parecidos.
// Una LecturaArchivo por Stmt. Solo cuentan los apuntes contabilizados (BOOK); los pendientes se cuentan en un aviso.

import { crearMovimiento, crearLectura, lecturaConError, aviso } from '../nucleo/modelo.js';
import { parseImporte, aCentimos } from '../nucleo/numeros.js';
import { parseFecha } from '../nucleo/fechas.js';
import { decodificar } from '../nucleo/texto.js';
import { leerXML, ErrorXML, hijo, hijos, ruta, rutas, textoDe, buscar } from '../nucleo/xml.js';
import { unirConceptos, perfilPorCuenta, avisoContado } from './formato.js';

const MENSAJES = ['BkToCstmrStmt', 'BkToCstmrAcctRpt', 'BkToCstmrDbtCdtNtfctn'];
const BLOQUES = { BkToCstmrStmt: 'Stmt', BkToCstmrAcctRpt: 'Rpt', BkToCstmrDbtCdtNtfctn: 'Ntfctn' };
// Familias de LDAS que son préstamos: a plazo, con preaviso, al consumo, hipotecas y sindicados
const FAMILIAS_PRESTAMO = new Set(['FTLN', 'NTLN', 'CSLN', 'MGLN', 'SYDN']);

/** Importe XML (xs:decimal: siempre con punto, sin separador de miles: "12.5", "+3", ".5"). */
function importe(nodo) {
  const t = textoDe(nodo);
  if (!t || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)) return null;
  return parseImporte(t.replace(/^([+-]?)\./, '$10.').replace(/\.$/, ''), { decimal: '.' });
}

/** <Dt>AAAA-MM-DD</Dt> o <DtTm>AAAA-MM-DDThh:mm:ss…</DtTm> dentro del nodo. */
function fecha(nodo) {
  if (!nodo) return null;
  const t = textoDe(nodo, 'Dt') ?? textoDe(nodo, 'DtTm') ?? textoDe(nodo);
  return t ? parseFecha(t.slice(0, 10)) : null;
}

/** Nombre de una parte: Nm (hasta 001.07) o Pty/Nm (desde 001.08). */
function nombreDe(nodo) {
  if (!nodo) return null;
  return textoDe(nodo, 'Nm') ?? textoDe(nodo, 'Pty/Nm') ?? null;
}

/** Código de operación del banco: PMNT-RDDT-ESDD, o el propio del banco. */
function codigoOperacion(ntry) {
  const btc = hijo(ntry, 'BkTxCd') ?? ruta(ntry, 'NtryDtls/TxDtls/BkTxCd');
  if (!btc) return null;
  const dominio = textoDe(btc, 'Domn/Cd');
  if (dominio) return [dominio, textoDe(btc, 'Domn/Fmly/Cd'), textoDe(btc, 'Domn/Fmly/SubFmlyCd')].filter(Boolean).join('-');
  return textoDe(btc, 'Prtry/Cd');
}

/**
 * Equivalencia prudente con los conceptos comunes de Norma 43, para que la detección trate igual un recibo
 * venga de un N43 o de un camt (03 recibos, 04 transferencias, 05 préstamos, 11 cajero, 12 tarjetas, 17 comisiones).
 * Solo los casos sin duda; el resto, sin concepto común.
 */
export function conceptoComunISO(codigo) {
  if (!codigo) return null;
  const [d, f, s] = codigo.split('-');
  // Préstamos (LDAS): todo es 05, también sus intereses (LDAS-MGLN-INTR), que con 17 se tomaban por una comisión
  // del banco y sumaban al total. Los depósitos a plazo (FTDP, NTDP) no son un préstamo: sin concepto común.
  if (d === 'LDAS') return FAMILIAS_PRESTAMO.has(f) ? '05' : null;
  if (['CHRG', 'FEES', 'COMM', 'COMI', 'INTR'].includes(s) || ['CHRG', 'FEES'].includes(f)) return '17';
  if (d !== 'PMNT') return null;
  if (f === 'RDDT') return '03';
  if (f === 'CCRD' || f === 'MCRD') return s === 'CWDL' ? '11' : s === 'POSD' || s === 'POSP' || s === 'SMRT' ? '12' : null;
  if (f === 'ICDT' || f === 'RCDT') return '04';
  return null;
}

function saldos(st) {
  const r = [];
  for (const bal of hijos(st, 'Bal')) {
    const tipo = textoDe(bal, 'Tp/CdOrPrtry/Cd') ?? textoDe(bal, 'Tp/CdOrPrtry/Prtry');
    const amt = hijo(bal, 'Amt');
    const v = importe(amt);
    if (!tipo || v === null) continue;
    const valor = textoDe(bal, 'CdtDbtInd') === 'DBIT' ? -Math.abs(v) || 0 : v; // saldo deudor; 0,00 no es "-0"
    r.push({ tipo: tipo.toUpperCase(), importe: valor, divisa: amt.atributos.Ccy ?? null, fecha: fecha(hijo(bal, 'Dt')) });
  }
  return r;
}

/**
 * Lee un camt.053 (o camt.052/054). Una LecturaArchivo por extracto.
 * @param {{nombre: string, bytes?: Uint8Array, texto?: string}} entrada
 * @param {{idArchivo: number|string}} ctx
 */
export async function leer(entrada, ctx) {
  const archivo = entrada.nombre;
  const texto = typeof entrada.texto === 'string' ? entrada.texto : decodificar(entrada.bytes).texto;
  let raiz;
  try {
    raiz = leerXML(texto);
  } catch (e) {
    if (e instanceof ErrorXML) return lecturaConError(archivo, 'camt053', 'danado', { archivo });
    throw e;
  }
  let mensaje = null;
  for (const nombre of MENSAJES) {
    mensaje = raiz.nombre === nombre ? raiz : buscar(raiz, nombre, 1)[0] ?? null;
    if (mensaje) break;
  }
  if (!mensaje) return lecturaConError(archivo, 'camt053', 'danado', { archivo });
  const version = (/camt\.05[234]\.\d{3}\.\d{2}/.exec(texto.slice(0, 4096)) || [])[0] ?? null;
  const extractos = hijos(mensaje, BLOQUES[mensaje.nombre]);
  if (!extractos.length) return lecturaConError(archivo, 'camt053', 'danado', { archivo });

  const lecturas = [];
  let n = 0;
  for (const st of extractos) {
    const iban = textoDe(st, 'Acct/Id/IBAN') ?? textoDe(st, 'Acct/Id/Othr/Id');
    const divisaCuenta = (textoDe(st, 'Acct/Ccy') ?? '').toUpperCase() || null;
    const bal = saldos(st);
    const delaCuenta = (b) => !divisaCuenta || !b.divisa || b.divisa === divisaCuenta;
    const inicial = bal.find((b) => b.tipo === 'OPBD' && delaCuenta(b)) ?? bal.find((b) => b.tipo === 'PRCD' && delaCuenta(b)) ?? null;
    const final = bal.find((b) => b.tipo === 'CLBD' && delaCuenta(b)) ?? null;
    const avisos = [];
    const movimientos = [];
    const saltados = [];
    const pendientes = {};
    let cargos = 0, abonos = 0, sumaCargos = 0, sumaAbonos = 0;

    for (const ntry of hijos(st, 'Ntry')) {
      const estado = (textoDe(ntry, 'Sts/Cd') ?? textoDe(ntry, 'Sts/Prtry') ?? textoDe(ntry, 'Sts') ?? 'BOOK').toUpperCase();
      if (estado !== 'BOOK') { pendientes[estado] = (pendientes[estado] || 0) + 1; continue; }
      const amt = hijo(ntry, 'Amt');
      const v = importe(amt);
      const lado = textoDe(ntry, 'CdtDbtInd');
      const f = fecha(hijo(ntry, 'BookgDt')) ?? fecha(hijo(ntry, 'ValDt'));
      if (v === null || (lado !== 'DBIT' && lado !== 'CRDT') || !f) { saltados.push(ntry.linea); continue; }
      const valor = lado === 'DBIT' ? -Math.abs(v) : Math.abs(v);
      if (valor < 0) { cargos++; sumaCargos += aCentimos(-valor); } else { abonos++; sumaAbonos += aCentimos(valor); }

      // concepto: la otra parte, el texto libre de la remesa y la información del apunte, sin repetir
      const detalles = rutas(ntry, 'NtryDtls/TxDtls');
      const partes = [];
      for (const tx of detalles.slice(0, 3)) {
        const rp = hijo(tx, 'RltdPties');
        // la otra parte y, si la hay, la última: un pago a PayPal o a Adyen lleva detrás el comercio de verdad
        if (lado === 'DBIT') partes.push(nombreDe(hijo(rp, 'Cdtr')), nombreDe(hijo(rp, 'UltmtCdtr')));
        else partes.push(nombreDe(hijo(rp, 'Dbtr')), nombreDe(hijo(rp, 'UltmtDbtr')));
        const ustrd = rutas(tx, 'RmtInf/Ustrd').map((u) => textoDe(u)).filter(Boolean);
        if (ustrd.length) partes.push(ustrd.join(' '));
        else partes.push(textoDe(tx, 'RmtInf/Strd/CdtrRefInf/Ref'));
        partes.push(textoDe(tx, 'AddtlTxInf'));
      }
      partes.push(textoDe(ntry, 'AddtlNtryInf'));
      const codigo = codigoOperacion(ntry);
      movimientos.push(crearMovimiento({
        id: `${ctx.idArchivo}-${++n}`,
        fecha: f,
        fecha_valor: fecha(hijo(ntry, 'ValDt')),
        concepto: unirConceptos(partes),
        importe: valor || 0, // sin "-0"
        saldo: null,
        divisa: (amt.atributos.Ccy ?? divisaCuenta ?? 'EUR').toUpperCase(),
        origen: { archivo, fila: ntry.linea },
        tipo: codigo,
        concepto_comun: conceptoComunISO(codigo),
        cuenta: iban,
      }));
    }

    if (saltados.length) avisos.push(avisoContado('formato_movimientos_saltados', saltados.length, { archivo, filas: saltados.slice(0, 50) }));
    const nPendientes = Object.values(pendientes).reduce((a, b) => a + b, 0);
    if (nPendientes) avisos.push(avisoContado('formato_pendientes_ignorados', nPendientes, { archivo, estados: pendientes }));

    // resumen del propio extracto (TxsSummry): número de apuntes
    const resumen = hijo(st, 'TxsSummry');
    let totales = null;
    if (resumen) {
      const num = (r) => { const t = textoDe(resumen, r); return t && /^\d+$/.test(t) ? Number(t) : null; };
      totales = { apuntes: num('TtlNtries/NbOfNtries'), cargos: num('TtlDbtNtries/NbOfNtries'), abonos: num('TtlCdtNtries/NbOfNtries') };
      const declarados = totales.apuntes ?? (totales.cargos !== null && totales.abonos !== null ? totales.cargos + totales.abonos : null);
      const leidos = cargos + abonos;
      // hay bancos que cuentan también los pendientes: solo se avisa si no encaja de ninguna forma
      if (declarados !== null && declarados !== leidos && declarados !== leidos + nPendientes && !saltados.length) {
        avisos.push(aviso('formato_totales_no_coinciden', { archivo, declarados, leidos }));
      }
    }

    // periodo: el que declara el extracto; si no, las fechas de los saldos (PRCD es del día anterior: no sirve)
    const desde = textoDe(st, 'FrToDt/FrDtTm'), hasta = textoDe(st, 'FrToDt/ToDtTm');
    const fechaIni = (desde && parseFecha(desde.slice(0, 10))) || (inicial?.tipo === 'OPBD' ? inicial.fecha : null);
    const fechaFin = (hasta && parseFecha(hasta.slice(0, 10))) || final?.fecha || null;
    const cuadra = inicial && final ? aCentimos(inicial.importe) + sumaAbonos - sumaCargos === aCentimos(final.importe) : null;

    lecturas.push(crearLectura({
      archivo,
      formato: 'camt053',
      perfil: perfilPorCuenta({ iban }),
      nivel: 'A',
      movimientos,
      saldo_inicial: inicial ? inicial.importe : null,
      saldo_final: final ? final.importe : null,
      fecha_inicial: fechaIni,
      fecha_final: fechaFin,
      avisos,
      extra: {
        version,
        id: textoDe(st, 'Id'),
        cuenta: iban,
        divisa: divisaCuenta,
        saldos: bal,
        totales,
        cuadra,
      },
    }));
  }
  return lecturas.length === 1 ? lecturas[0] : lecturas;
}
