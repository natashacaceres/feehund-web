// MT940 (SWIFT, extracto de cuenta para clientes). Bloques {1:…}{2:…}{4:…-} opcionales.
// :20: referencia · :25: cuenta · :28C: número · :60F:/:60M: saldo inicial · :61: movimiento · :86: información
// · :62F:/:62M: saldo final · :64: disponible.
// Varios extractos seguidos de la misma cuenta → una lectura: saldo inicial del primero y final del último,
// comprobando cada extracto y que cada uno enlace con el siguiente.

import { crearMovimiento, crearLectura, lecturaConError, aviso } from '../nucleo/modelo.js';
import { fechaValida, aISO, sumarDias } from '../nucleo/fechas.js';
import { decodificar } from '../nucleo/texto.js';
import {
  unirConceptos, perfilPorCuenta, formatearImporte, formatearFecha, partirLineas, avisoLineas, pistasDeCortes, empalmeDeCorte, SIN_PISTAS,
} from './formato.js';

// Solo las etiquetas de MT940 y MT942: una línea del :86: que empieza por «:12:30 …» (una hora) sigue siendo texto.
// :NS: es un campo propio de algunos bancos (no SWIFT): se reconoce para que no se pegue al :86: anterior.
const RE_ETIQUETA = /^:(20|21|25P?|28C?|13D?|34F|60[FM]|61|62[FM]|64|65|86|90[CD]|NS):(.*)$/;
const RE_SALDO = /^([CD])(\d{6})([A-Z]{3})(\d+[,.]\d*)/;
// fecha valor AAMMDD, fecha contable MMDD opcional, D/C/RC/RD, letra de fondos opcional, importe, tipo (N/F/S + 3), referencias
const RE_61 = /^(\d{6})(\d{4})?(RC|RD|C|D)([A-Z])?(\d+[,.]\d*)([A-Z][A-Z0-9]{3})(.*)$/;

// Tipos SWIFT con un concepto común de Norma 43 equivalente sin duda (03 recibos, 04 órdenes permanentes, 17 comisiones…).
// TRF no está: muchos bancos (Bunq, ING…) ponen NTRF en todo, también en los pagos con tarjeta, y con 04 la detección
// tomaba por transferencia a una persona cualquier cuota de un comercio que no esté en el diccionario.
const COMUN_SWIFT = { DDT: '03', CHG: '17', COM: '17', INT: '17', STO: '04', CHK: '01', SAL: '15', DIV: '08' };

// Códigos de :86: al estilo /CODIGO/valor (Países Bajos, Bunq, Wise…)
const CODIGOS_BARRA = new Set([
  'TRTP', 'IBAN', 'BIC', 'NAME', 'REMI', 'EREF', 'MARF', 'CSID', 'ORDP', 'BENM', 'ID', 'ADDR', 'SVCL', 'PURP', 'RTRN',
  'CNTP', 'USTD', 'STRD', 'CDTRREFTP', 'CDTRREF', 'CD', 'ISSR', 'ULTD', 'ULTC', 'ULTB', 'EXCH', 'CHGS', 'OCMT', 'ACCW', 'BUSP', 'ISDT',
]);

function fechaAAMMDD(s) {
  const aa = +s.slice(0, 2), mm = +s.slice(2, 4), dd = +s.slice(4, 6);
  const anio = aa < 70 ? 2000 + aa : 1900 + aa;
  return fechaValida(anio, mm, dd) ? aISO(anio, mm, dd) : null;
}

/** Fecha contable MMDD: mismo año que la fecha valor, salvo en el cambio de año. */
function fechaContable(mmdd, valor) {
  if (!mmdd || !valor) return null;
  const mm = +mmdd.slice(0, 2), dd = +mmdd.slice(2, 4);
  let anio = +valor.slice(0, 4);
  const mv = +valor.slice(5, 7);
  if (mm - mv > 6) anio--;
  else if (mv - mm > 6) anio++;
  return fechaValida(anio, mm, dd) ? aISO(anio, mm, dd) : null;
}

/**
 * "1234,5" → 123450 céntimos (la coma es el decimal; no hay separador de miles).
 * Más de 2 decimales solo valen si lo que sobra son ceros: «13,999» da null (como parseImporte), no 14,00.
 */
function centimosMT(s) {
  const [ent, dec = ''] = s.split(/[,.]/);
  if (!/^\d+$/.test(ent) || !/^\d*$/.test(dec) || /[1-9]/.test(dec.slice(2))) return null;
  return Number(ent) * 100 + Number((dec + '00').slice(0, 2));
}

function leerSaldo(valor, tipo) {
  const m = RE_SALDO.exec(valor.trim());
  if (!m) return null;
  const f = fechaAAMMDD(m[2]);
  const c = centimosMT(m[4]);
  if (c === null) return null;
  return { centimos: m[1] === 'D' ? -c || 0 : c, fecha: f, divisa: m[3], tipo }; // D0,00 no es "-0"; tipo F (final) o M (intermedio)
}

// ——— Fecha del :60F: e inicio del periodo ———
// Unos bancos fechan el :60F: el primer día del extracto (el saldo al empezar ese día) y otros el día anterior
// (el saldo con que cerró ese día, que es el mismo). Con la segunda costumbre el periodo empezaba un día antes
// del primer movimiento. Regla para el inicio del periodo de cada extracto:
//  1. Si algún movimiento es de la fecha del :60F: o anterior, esa fecha ya es del periodo: se toma tal cual.
//  2. Si no, manda la costumbre que se ve en el propio archivo al encadenar extractos: si el :60F: de un extracto
//     lleva la misma fecha que el :62F: del anterior, es la fecha del cierre (el periodo empieza al día siguiente);
//     si lleva una fecha posterior, es la del primer día. Los saldos intermedios (:60M:, :62M:) no cuentan.
//  3. Sin extractos encadenados: si la fecha es el último día de un mes y el extracto acaba más tarde, es el cierre
//     del mes anterior y el periodo empieza el día 1. Si no, se toma tal cual (un día de más como mucho).
// El inicio nunca pasa del primer movimiento ni de la fecha del :62F:.

function ultimoDiaDeMes(iso) {
  return sumarDias(iso, 1).slice(8, 10) === '01';
}

/** 'cierre' | 'apertura' | null: costumbre del banco al fechar el :60F:, vista en los extractos encadenados. */
function costumbre60F(grupos) {
  let cierre = 0, apertura = 0;
  for (const es of grupos) {
    for (let i = 1; i < es.length; i++) {
      const a = es[i - 1].final, b = es[i].inicial;
      if (!a?.fecha || !b?.fecha || a.tipo !== 'F' || b.tipo !== 'F') continue;
      if (b.fecha === a.fecha) cierre++;
      else if (b.fecha > a.fecha) apertura++;
    }
  }
  if (cierre && !apertura) return 'cierre';
  if (apertura && !cierre) return 'apertura';
  return null;
}

/** Primer día del periodo de un extracto (ver la regla de arriba). */
function inicioExtracto(e, costumbre) {
  const d60 = e.inicial?.fecha ?? null;
  if (!d60) return null;
  let primero = null;
  for (const m of e.movs) if (m.fecha && (!primero || m.fecha < primero)) primero = m.fecha;
  if (primero && primero <= d60) return d60;
  const d62 = e.final?.fecha ?? null;
  let inicio = d60;
  if (costumbre === 'cierre') inicio = sumarDias(d60, 1);
  else if (costumbre === null && ultimoDiaDeMes(d60) && d62 && d62 > d60) inicio = sumarDias(d60, 1);
  if (primero && inicio > primero) inicio = primero;
  if (d62 && inicio > d62) inicio = d62;
  return inicio;
}

/** Une líneas partidas a un ancho fijo: si una va llena y la siguiente empieza pegada, es la misma palabra. */
function unirPartidas(segmentos, ancho) {
  let texto = '', anterior = null;
  for (const seg of segmentos) {
    if (!seg) continue;
    if (texto) texto += anterior.length >= ancho && !/\s$/.test(anterior) && !/^\s/.test(seg) ? '' : ' ';
    texto += seg;
    anterior = seg;
  }
  return texto.replace(/\s+/g, ' ').trim();
}

/** ¿La línea del :86: llega al final? 65 caracteres (la primera, 61 si el banco cuenta la etiqueta :86:). */
const lineaLlena = (l, i) => !/\s$/.test(l) && (l.length >= 65 || (i === 0 && l.length === 61));

/**
 * Junta las líneas de un campo partido a ancho fijo. Si una línea va llena y la siguiente empieza pegada, decide
 * empalmeDeCorte (formato.js): palabra partida («NETFL» + «IX») o dos datos («REF 0001» + «SUSCRIPCION»).
 */
function juntarLineas(lineas, pistas = SIN_PISTAS) {
  let texto = '';
  lineas.forEach((l, i) => {
    if (i > 0) texto += empalmeDeCorte(lineas[i - 1], l, lineaLlena(lineas[i - 1], i - 1), pistas);
    texto += l;
  });
  return texto;
}

/** Campos /CODIGO/valor/ de un :86:. */
function camposBarra(s) {
  const campos = {};
  let actual = null;
  for (const t of s.split('/')) {
    const codigo = t.trim().toUpperCase();
    if (CODIGOS_BARRA.has(codigo)) { actual = codigo; if (campos[actual] === undefined) campos[actual] = ''; continue; }
    if (actual === null || t === '') continue;
    campos[actual] = campos[actual] ? `${campos[actual]}/${t}` : t;
  }
  return campos;
}

/** Trozos de concepto de un :86: (subcampos ?NN, códigos /XXX/ o texto libre). */
function informacion(valor, pistas) {
  if (!valor) return [];
  const lineas = valor.split('\n');
  const plano = juntarLineas(lineas, pistas);
  // 1. subcampos ?00 ?20…?29 ?32 ?33 ?60…?63 (formato alemán y SEPA)
  if (/^\s*\d{3}\?\d{2}/.test(plano) || /\?2\d/.test(plano)) {
    const campos = {};
    const re = /\?(\d{2})([^?]*)/g;
    let m;
    while ((m = re.exec(plano))) (campos[m[1]] ??= []).push(m[2]);
    const claves = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 60, 61, 62, 63].map(String);
    let finalidad = unirPartidas(claves.flatMap((k) => campos[k] ?? []), 27);
    const svwz = /SVWZ\+(.*?)(?=\s?\b(?:EREF|MREF|CRED|KREF|ABWA|ABWE|IBAN|BIC)\+|$)/.exec(finalidad);
    if (svwz) finalidad = svwz[1].trim();
    else finalidad = finalidad.replace(/\b(?:EREF|MREF|CRED|KREF|ABWA|ABWE|IBAN|BIC)\+\S*/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^NOTPROVIDED$/i.test(finalidad)) finalidad = '';
    const nombre = [...(campos['32'] ?? []), ...(campos['33'] ?? [])].join('').trim();
    return [nombre, finalidad, (campos['00'] ?? []).join(' ').trim()];
  }
  // 2. /CODIGO/valor (Países Bajos, Bunq, Wise…)
  if (/^\s*\/[A-Z]{2,9}\//.test(plano)) {
    const c = camposBarra(plano);
    const cntp = c.CNTP ? c.CNTP.split('/') : [];
    const nombre = c.NAME || (cntp.length >= 3 ? cntp[2] : '') || '';
    const remi = (c.REMI || c.USTD || '').trim();
    return [nombre, /^NOTPROVIDED$/i.test(remi) ? '' : remi];
  }
  // 3. texto libre
  return [plano.replace(/\s+/g, ' ').trim()];
}

/**
 * Líneas del cuerpo con su número de línea; null separa mensajes.
 * Las cabeceras SWIFT ({1:…}{2:…}{4:) y los cierres (-} y {5:…}) se quitan; lo demás es cuerpo, vaya o no en bloques.
 */
function cuerpo(texto) {
  const salida = [];
  partirLineas(texto).forEach((l0, i) => {
    let l = i === 0 && l0.charCodeAt(0) === 0xfeff ? l0.slice(1) : l0;
    const k = l.indexOf('{4:');
    if (k >= 0) { salida.push(null); l = l.slice(k + 3); }
    if (/^\s*-\}/.test(l) || /^\s*\{\d:/.test(l) || /^\s*[-$]\s*$/.test(l)) { salida.push(null); return; }
    if (!l.trim()) return;
    salida.push({ linea: i + 1, texto: l.replace(/\s+$/, '') });
  });
  return salida;
}

/**
 * Lee un MT940. Una LecturaArchivo por cuenta y divisa.
 * @param {{nombre: string, bytes?: Uint8Array, texto?: string}} entrada
 * @param {{idArchivo: number|string, opciones?: {idioma?: string}}} ctx
 */
export async function leer(entrada, ctx) {
  const archivo = entrada.nombre;
  const idioma = ctx?.opciones?.idioma ?? 'es';
  const texto = typeof entrada.texto === 'string' ? entrada.texto : decodificar(entrada.bytes).texto;

  // 1. campos (una etiqueta y sus líneas de continuación)
  const campos = [];
  for (const l of cuerpo(texto)) {
    if (l === null) { campos.push(null); continue; }
    const m = RE_ETIQUETA.exec(l.texto);
    if (m) campos.push({ etiqueta: m[1], valor: m[2], linea: l.linea });
    else if (campos.length && campos[campos.length - 1]) campos[campos.length - 1].valor += '\n' + l.texto;
  }

  // 2. extractos
  const extractos = [];
  const raras = [];
  let ex = null, mov = null;
  const nuevo = (linea, heredado) => {
    ex = { referencia: null, cuenta: heredado?.cuenta ?? null, numero: null, inicial: null, final: null, disponible: null, movs: [], linea };
    extractos.push(ex);
    mov = null;
  };
  for (const c of campos) {
    if (c === null) { mov = null; continue; }
    const { etiqueta, valor, linea } = c;
    if (etiqueta === '20') { nuevo(linea); ex.referencia = valor.trim(); continue; }
    if (!ex) nuevo(linea);
    switch (etiqueta) {
      case '25':
        if (ex.cuenta && (ex.movs.length || ex.final)) nuevo(linea);
        ex.cuenta = valor.split('\n')[0].trim();
        break;
      case '28':
      case '28C':
        if (ex.movs.length || ex.final) nuevo(linea, ex); // otro extracto sin :20: (si no, se quedaba con el número del siguiente)
        ex.numero = valor.trim();
        break;
      case '60F':
      case '60M': {
        if (ex.inicial || ex.final) nuevo(linea, ex); // otro extracto sin :20:
        ex.inicial = leerSaldo(valor, etiqueta[2]);
        if (!ex.inicial) raras.push(linea);
        break;
      }
      case '61': {
        const [primera, ...resto] = valor.split('\n');
        const m = RE_61.exec(primera.trim());
        const fv = m ? fechaAAMMDD(m[1]) : null;
        const c61 = m ? centimosMT(m[5]) : null;
        if (!m || !fv || c61 === null) { raras.push(linea); mov = null; break; }
        const signo = m[3] === 'D' || m[3] === 'RC' ? -1 : 1; // RC: anula un abono (sale dinero); RD: anula un cargo
        const [refCliente, refBanco] = m[7].split('//');
        mov = {
          linea,
          fecha_valor: fv,
          fecha: fechaContable(m[2], fv) ?? fv,
          centimos: signo * c61,
          tipo: m[6],
          refCliente: (refCliente ?? '').trim(),
          refBanco: (refBanco ?? '').trim(),
          suplemento: resto.join(' ').trim(),
          info: null,
        };
        ex.movs.push(mov);
        break;
      }
      case '86':
        if (mov && mov.info === null) mov.info = valor;
        break;
      case '62F':
      case '62M':
        ex.final = leerSaldo(valor, etiqueta[2]);
        if (!ex.final) raras.push(linea);
        mov = null;
        break;
      case '64':
        ex.disponible = leerSaldo(valor, null);
        mov = null;
        break;
      default:
        break; // :21:, :13D:, :65:… no hacen falta
    }
  }
  const utiles = extractos.filter((e) => e.inicial || e.final || e.movs.length);
  if (!utiles.length) return lecturaConError(archivo, 'mt940', 'danado', { archivo });

  // 3. por cuenta y divisa, en el orden del archivo
  const grupos = new Map();
  for (const e of utiles) {
    const divisa = e.inicial?.divisa ?? e.final?.divisa ?? null;
    const k = `${e.cuenta ?? ''}|${divisa ?? ''}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(e);
  }

  // palabras enteras y costumbre del banco al partir las líneas del :86: (de todo el archivo)
  const pistas = pistasDeCortes(utiles.flatMap((e) => e.movs.map((m) => (m.info ?? '').split('\n'))), lineaLlena);
  const listas = [...grupos.values()];
  for (const es of listas) {
    es.sort((a, b) => (a.inicial?.fecha && b.inicial?.fecha ? (a.inicial.fecha < b.inicial.fecha ? -1 : a.inicial.fecha > b.inicial.fecha ? 1 : 0) : 0));
  }
  const costumbre = costumbre60F(listas);

  const lecturas = [];
  let n = 0;
  for (const es of listas) {
    const primero = es[0], ultimo = es[es.length - 1];
    const divisa = primero.inicial?.divisa ?? primero.final?.divisa ?? null;
    const avisos = [];
    if (!divisa) avisos.push(aviso('formato_divisa_supuesta', { archivo }));
    const movimientos = [];
    const resumen = [];
    for (const e of es) {
      let suma = 0;
      for (const m of e.movs) {
        suma += m.centimos;
        const refs = [m.refCliente, m.refBanco].filter((r) => r && !/^NONREF$/i.test(r));
        let concepto = unirConceptos([...informacion(m.info, pistas), m.suplemento]);
        if (!concepto) concepto = refs.join(' ');
        const codigo = m.tipo.slice(1);
        movimientos.push(crearMovimiento({
          id: `${ctx.idArchivo}-${++n}`,
          fecha: m.fecha,
          fecha_valor: m.fecha_valor,
          concepto,
          importe: m.centimos / 100 || 0, // sin "-0"
          saldo: null,
          divisa: divisa ?? 'EUR',
          origen: { archivo, fila: m.linea },
          tipo: m.tipo,
          concepto_comun: COMUN_SWIFT[codigo] ?? null,
          cuenta: e.cuenta,
        }));
      }
      const cuadra = e.inicial && e.final ? e.inicial.centimos + suma === e.final.centimos : null;
      resumen.push({
        referencia: e.referencia, numero: e.numero, movimientos: e.movs.length, cuadra,
        saldo_inicial: e.inicial ? e.inicial.centimos / 100 : null, saldo_final: e.final ? e.final.centimos / 100 : null,
        fecha_saldo_inicial: e.inicial?.fecha ?? null, // la del :60F: tal cual
        fecha_inicial: inicioExtracto(e, costumbre), fecha_final: e.final?.fecha ?? null,
      });
      // con un solo extracto, la comprobación general de saldos ya lo dice; aquí se avisa de los intermedios
      if (cuadra === false && es.length > 1) {
        const dif = Math.abs(e.inicial.centimos + suma - e.final.centimos) / 100;
        // el extracto se nombra por su número; si no lo trae, por su fecha (nunca queda en blanco en la frase)
        const nombreExtracto = e.numero || formatearFecha(e.inicial?.fecha ?? e.final?.fecha) || e.referencia || String(es.indexOf(e) + 1);
        avisos.push(aviso('formato_extracto_no_cuadra', { archivo, extracto: nombreExtracto, diferencia: formatearImporte(dif, divisa ?? 'EUR', idioma), importe: dif }));
      }
    }
    for (let i = 1; i < es.length; i++) {
      const a = es[i - 1].final, b = es[i].inicial;
      if (a && b && a.centimos !== b.centimos) {
        avisos.push(aviso('formato_saldo_no_continua', { archivo, fecha: formatearFecha(b.fecha), desde: b.fecha }));
      }
    }
    lecturas.push(crearLectura({
      archivo,
      formato: 'mt940',
      perfil: perfilPorCuenta({ iban: primero.cuenta }),
      nivel: 'A',
      movimientos,
      saldo_inicial: primero.inicial ? primero.inicial.centimos / 100 : null,
      saldo_final: ultimo.final ? ultimo.final.centimos / 100 : null,
      fecha_inicial: inicioExtracto(primero, costumbre),
      fecha_final: ultimo.final?.fecha ?? null,
      avisos,
      extra: {
        cuenta: primero.cuenta,
        divisa,
        fecha_60F: costumbre, // 'cierre' (día anterior), 'apertura' (primer día) o null si el archivo no lo deja ver
        extractos: resumen,
        cuadra: resumen.every((r) => r.cuadra === true),
        disponible: ultimo.disponible ? { importe: ultimo.disponible.centimos / 100, fecha: ultimo.disponible.fecha } : null,
      },
    }));
  }
  if (raras.length) lecturas[0].avisos.unshift(avisoLineas(archivo, raras));
  return lecturas.length === 1 ? lecturas[0] : lecturas;
}
