// Norma 43 / Cuaderno 43 de la AEB (.n43 .q43 .aeb .txt): extracto de cuenta en registros de 80 caracteres.
// 11 cabecera de cuenta · 22 movimiento · 23 textos del movimiento · 24 equivalencia de divisa · 33 final de cuenta · 88 fin.
// Posiciones en los comentarios: desde 1, como en el cuaderno. En el código: desde 0.

import { crearMovimiento, crearLectura, lecturaConError, aviso } from '../nucleo/modelo.js';
import { fechaValida, aISO } from '../nucleo/fechas.js';
import { decodificar } from '../nucleo/texto.js';
import {
  registroNorma43, trocearRegistros, partirLineas, perfilPorCuenta, formatearImporte, formatearFecha, avisoContado, avisoLineas,
  pistasDeCortes, empalmeDeCorte, SIN_PISTAS,
} from './formato.js';

/** Conceptos comunes de la AEB (posiciones 23-24 del registro 22). */
export const CONCEPTOS_COMUNES = {
  '01': 'Talones y reintegros',
  '02': 'Abonarés, entregas e ingresos',
  '03': 'Domiciliados y recibos',
  '04': 'Giros, transferencias, traspasos y cheques',
  '05': 'Amortizaciones de préstamos',
  '06': 'Remesas de efectos',
  '07': 'Suscripciones',
  '08': 'Dividendos y cupones',
  '09': 'Bolsa',
  10: 'Cheques gasolina',
  11: 'Cajero automático',
  12: 'Tarjetas',
  13: 'Operaciones con el extranjero',
  14: 'Devoluciones e impagados',
  15: 'Nóminas y seguros sociales',
  16: 'Timbres y corretaje',
  17: 'Intereses, comisiones, custodia, gastos e impuestos',
  98: 'Anulaciones',
  99: 'Varios',
};

/** Divisa ISO 4217 numérica (como la trae Norma 43) → código de letras. */
export const DIVISAS_ISO = {
  978: 'EUR', 840: 'USD', 826: 'GBP', 756: 'CHF', 392: 'JPY', 124: 'CAD', '036': 'AUD', 554: 'NZD', 752: 'SEK',
  578: 'NOK', 208: 'DKK', 985: 'PLN', 203: 'CZK', 348: 'HUF', 946: 'RON', 975: 'BGN', 949: 'TRY', 484: 'MXN',
  '032': 'ARS', 170: 'COP', 152: 'CLP', 604: 'PEN', 986: 'BRL', 858: 'UYU', 156: 'CNY', 344: 'HKD', 702: 'SGD',
  356: 'INR', 410: 'KRW', 376: 'ILS', 504: 'MAD', 710: 'ZAR', 784: 'AED', 682: 'SAR', 643: 'RUB', 937: 'VES',
};

/** AAMMDD → AAAA-MM-DD (o null si no es una fecha real). */
function fechaN43(s) {
  if (!/^\d{6}$/.test(s)) return null;
  const aa = +s.slice(0, 2), mm = +s.slice(2, 4), dd = +s.slice(4, 6);
  const anio = aa < 70 ? 2000 + aa : 1900 + aa;
  return fechaValida(anio, mm, dd) ? aISO(anio, mm, dd) : null;
}

/** 14 dígitos con 2 decimales implícitos → céntimos enteros (así las sumas son exactas). */
function centimos(s) {
  return /^\d{14}$/.test(s) ? Number(s) : null;
}

/** Saldo con su clave: 1 deudor (negativo), 2 acreedor. Sin clave válida solo vale si es cero; si no, no se sabe el signo. */
function saldoConClave(clave, importe) {
  if (importe === null) return null;
  if (clave === '1') return -importe || 0; // un saldo deudor de 0,00 no es "-0"
  if (clave === '2' || importe === 0) return importe;
  return null;
}

/** Divisa de 3 posiciones: numérica ISO o de letras. '' si viene vacía o a ceros. */
function divisaN43(s) {
  const t = s.trim();
  if (!t || /^0+$/.test(t)) return '';
  if (/^\d{3}$/.test(t)) return DIVISAS_ISO[t] ?? t;
  if (/^[A-Za-z]{3}$/.test(t)) return t.toUpperCase();
  return '';
}

// ——— Unir los campos de concepto de los registros 23 ———
// Cada registro 23 trae dos campos de 38 posiciones. Cuando un campo llena las 38 y el siguiente empieza pegado,
// no se sabe si es una palabra partida («NETFLI» + «X.COM») o dos datos distintos («GOOGLE ONE» + «1234»).
// La decisión la toman pistasDeCortes y empalmeDeCorte de formato.js (las mismas reglas que el :86: de MT940).
const ANCHO_23 = 38;
const campoLleno = (campo) => campo.length >= ANCHO_23 && campo[ANCHO_23 - 1] !== ' ';

/** Une los campos de texto de los 23 de un movimiento. */
function unirTextos(segmentos, pistas = SIN_PISTAS) {
  let texto = '';
  let anterior = null;
  for (const seg of segmentos) {
    if (!seg.trim()) { anterior = seg; continue; }
    if (texto) texto += anterior !== null && anterior.trim() ? empalmeDeCorte(anterior, seg, campoLleno(anterior), pistas) : ' ';
    texto += seg;
    anterior = seg;
  }
  return texto.replace(/\s+/g, ' ').trim();
}

function referenciaUtil(s) {
  const t = s.trim();
  return t && !/^0+$/.test(t) ? t : '';
}

/** Registros con su línea. Líneas recortadas o con CRLF se rellenan a 80; registros pegados sin saltos se separan. */
function aRegistros(texto) {
  const salida = [];
  const lineas = partirLineas(texto);
  let pegados = 0;
  for (let i = 0; i < lineas.length; i++) {
    let l = lineas[i];
    if (i === 0 && l.charCodeAt(0) === 0xfeff) l = l.slice(1);
    l = l.replace(/[\s\u0000\u001a]+$/, '');
    if (!l) continue;
    if (l.length > 80) {
      const trozos = trocearRegistros(l);
      const tipos = trozos.map((t) => registroNorma43(t.replace(/\s+$/, '')));
      const buenos = tipos.filter(Boolean).length;
      // registros pegados sin saltos de línea: cada trozo de 80 va por su cuenta (uno roto no se lleva a los demás)
      if (trozos.length >= 2 && buenos >= 2 && buenos >= trozos.length * 0.8) {
        trozos.forEach((t, k) => salida.push({ linea: i + 1, fila: ++pegados, texto: t.padEnd(80, ' '), tipo: tipos[k] }));
        continue;
      }
      // un registro con caracteres de más detrás de la posición 80: el registro vale, lo de detrás no es de la norma
      const tipo = l.length < 160 ? registroNorma43(l.slice(0, 80)) : null;
      salida.push({ linea: i + 1, fila: i + 1, texto: tipo ? l.slice(0, 80) : l, tipo });
      continue;
    }
    salida.push({ linea: i + 1, fila: i + 1, texto: l.padEnd(80, ' '), tipo: registroNorma43(l) });
  }
  // si todo venía en una sola línea, la "fila" es el número de registro
  return salida;
}

function nuevoBloque(t, r) {
  const entidad = t.slice(2, 6), oficina = t.slice(6, 10), numero = t.slice(10, 20);
  const clave = t[32];
  const saldo = centimos(t.slice(33, 47));
  const codigoDivisa = t.slice(47, 50);
  const divisa = divisaN43(codigoDivisa);
  return {
    clave: `${entidad}|${oficina}|${numero}|${codigoDivisa}`,
    entidad, oficina, numero,
    nombre: t.slice(51, 77).trim(),
    fecha_inicial: fechaN43(t.slice(20, 26)),
    fecha_final: fechaN43(t.slice(26, 32)),
    saldoInicial: saldoConClave(clave, saldo),
    divisa: divisa || 'EUR',
    divisaSupuesta: !divisa,
    modalidad: t[50].trim() || null,
    linea: r.fila,
    movs: [],
    cierre: null,
  };
}

/** Movimientos sin su registro 11 (falta o está roto). Cada grupo va aparte: no se sabe si son de la misma cuenta. */
function bloqueSinCabecera(r, n) {
  return {
    clave: `sin_cabecera_${n}`, entidad: null, oficina: null, numero: null, nombre: '', fecha_inicial: null, fecha_final: null,
    saldoInicial: null, divisa: 'EUR', divisaSupuesta: true, modalidad: null, linea: r.fila, movs: [], cierre: null, sinCabecera: true,
  };
}

function leerCierre(t, r) {
  const clave = t[58];
  const saldo = centimos(t.slice(59, 73));
  return {
    debe: { apuntes: Number(t.slice(20, 25)), centimos: centimos(t.slice(25, 39)) },
    haber: { apuntes: Number(t.slice(39, 44)), centimos: centimos(t.slice(44, 58)) },
    saldoFinal: saldoConClave(clave, saldo),
    divisa: divisaN43(t.slice(73, 76)),
    linea: r.fila,
  };
}

function sumar(movs) {
  const s = { debe: { apuntes: 0, centimos: 0 }, haber: { apuntes: 0, centimos: 0 } };
  for (const m of movs) {
    const lado = m.debe ? s.debe : s.haber; // por la clave D/H: un cargo de 0,00 sigue siendo del debe
    lado.apuntes++;
    lado.centimos += Math.abs(m.centimos);
  }
  return s;
}

const enEuros = (s) => ({ apuntes: s.apuntes, importe: s.centimos === null ? null : s.centimos / 100 });

/**
 * Lee un fichero Norma 43. Una LecturaArchivo por cuenta (los bloques 11…33 de la misma cuenta se juntan).
 * @param {{nombre: string, bytes?: Uint8Array, texto?: string}} entrada
 * @param {{idArchivo: number|string, opciones?: {idioma?: string}}} ctx
 */
export async function leer(entrada, ctx) {
  const archivo = entrada.nombre;
  const idioma = ctx?.opciones?.idioma ?? 'es';
  const texto = typeof entrada.texto === 'string' ? entrada.texto : decodificar(entrada.bytes, { pista: 'norma43' }).texto;
  const registros = aRegistros(texto);

  const bloques = [];
  const raras = [];
  const conFechaValor = [];
  let bloque = null;
  let ultimo = null; // último 22, para pegarle sus 23 y 24
  let fin = null;
  let validos = 0;
  let huerfanos = 0;

  for (const r of registros) {
    const t = r.texto;
    switch (r.tipo) {
      case '11':
        bloque = nuevoBloque(t, r);
        bloques.push(bloque);
        ultimo = null;
        validos++;
        break;
      case '22': {
        const fop = fechaN43(t.slice(10, 16));
        const fval = fechaN43(t.slice(16, 22));
        const cent = centimos(t.slice(28, 42));
        if (cent === null || (!fop && !fval)) { raras.push(r.fila); ultimo = null; break; }
        // sin 11 delante, o después del 33 de otra cuenta (su 11 falta o está roto): se leen igual, en un bloque
        // sin saldo inicial y con aviso. Antes se perdían todos los de la segunda cuenta y los de la primera no.
        if (!bloque || bloque.cierre) { bloque = bloqueSinCabecera(r, ++huerfanos); bloques.push(bloque); }
        if (!fop) conFechaValor.push(r.fila);
        ultimo = {
          fila: r.fila,
          crudo: t.trimEnd(),
          fecha: fop ?? fval,
          fecha_valor: fval,
          comun: t.slice(22, 24),
          debe: t[27] === '1',
          centimos: t[27] === '1' ? -cent : cent,
          ref1: referenciaUtil(t.slice(52, 64)),
          ref2: referenciaUtil(t.slice(64, 80)),
          textos: [],
          equivalencia: null,
        };
        bloque.movs.push(ultimo);
        validos++;
        break;
      }
      case '23':
        if (!ultimo) { raras.push(r.fila); break; }
        ultimo.textos.push(t.slice(4, 42), t.slice(42, 80));
        break;
      case '24': {
        if (!ultimo) { raras.push(r.fila); break; }
        ultimo.equivalencia = { divisa: divisaN43(t.slice(4, 7)) || null, importe: centimos(t.slice(7, 21)) / 100, fila: r.fila };
        break;
      }
      case '33':
        if (!bloque || bloque.cierre || bloque.sinCabecera) {
          // un 33 sin su 11: si cierra movimientos sueltos, al menos da el saldo final
          if (bloque && bloque.sinCabecera && !bloque.cierre) bloque.cierre = leerCierre(t, r);
          else raras.push(r.fila);
          ultimo = null;
          break;
        }
        bloque.cierre = leerCierre(t, r);
        ultimo = null;
        break;
      case '88':
        fin = { registros: Number(t.slice(20, 26)) || null, fila: r.fila };
        ultimo = null;
        break;
      default:
        raras.push(r.fila);
        // un 23 detrás de una línea rara sigue siendo de su movimiento; detrás de un 22 roto, es de ese 22 y no se pega a otro
        if (t.startsWith('22')) ultimo = null;
    }
  }

  if (!validos) return lecturaConError(archivo, 'norma43', 'danado', { archivo });

  // agrupar los bloques por cuenta, en el orden en que aparecen
  const porCuenta = new Map();
  for (const b of bloques) {
    if (!porCuenta.has(b.clave)) porCuenta.set(b.clave, []);
    porCuenta.get(b.clave).push(b);
  }

  // palabras enteras y costumbre del banco al partir los textos de los 23 (de todo el archivo)
  const pistas = pistasDeCortes(bloques.flatMap((b) => b.movs.map((m) => m.textos)), campoLleno);

  const lecturas = [];
  let n = 0;
  for (const bs of porCuenta.values()) {
    // los bloques de una misma cuenta, por fecha; si alguno no la trae, en el orden del archivo
    if (bs.every((b) => b.fecha_inicial)) bs.sort((a, b) => (a.fecha_inicial < b.fecha_inicial ? -1 : a.fecha_inicial > b.fecha_inicial ? 1 : 0));
    const b0 = bs[0];
    const divisa = b0.divisa;
    const cuenta = b0.sinCabecera ? null : `${b0.entidad}-${b0.oficina}-${b0.numero}`;
    const avisos = [];
    const movimientos = [];
    const equivalencias = [];
    for (const b of bs) {
      for (const m of b.movs) {
        const id = `${ctx.idArchivo}-${++n}`;
        // texto de los 23; si no hay, o vienen en blanco, el nombre del concepto común y las referencias
        const concepto = (m.textos.length ? unirTextos(m.textos, pistas) : '')
          || [CONCEPTOS_COMUNES[m.comun] ?? '', m.ref1, m.ref2].filter(Boolean).join(' ');
        movimientos.push(crearMovimiento({
          id,
          fecha: m.fecha,
          fecha_valor: m.fecha_valor,
          concepto,
          importe: m.centimos / 100 || 0, // un cargo de 0,00 no es "-0"
          saldo: null,
          divisa,
          origen: { archivo, fila: m.fila, texto: m.crudo },
          concepto_comun: m.comun,
          cuenta,
        }));
        if (m.equivalencia) equivalencias.push({ movimiento: id, ...m.equivalencia });
      }
    }

    // comprobaciones de cada bloque: resumen del 33 frente a lo leído, y saldo 11 + abonos − cargos = 33
    const resumen = [];
    for (const b of bs) {
      const leidos = sumar(b.movs);
      const info = {
        fecha_inicial: b.fecha_inicial, fecha_final: b.fecha_final,
        saldo_inicial: b.saldoInicial === null ? null : b.saldoInicial / 100,
        saldo_final: b.cierre?.saldoFinal == null ? null : b.cierre.saldoFinal / 100,
        totales: b.cierre ? { debe: enEuros(b.cierre.debe), haber: enEuros(b.cierre.haber) } : null,
        leidos: { debe: enEuros(leidos.debe), haber: enEuros(leidos.haber) },
        cuadra: null,
      };
      resumen.push(info);
      if (!b.cierre) {
        if (!avisos.some((a) => a.codigo === 'formato_sin_cierre')) avisos.push(aviso('formato_sin_cierre', { archivo }));
        continue;
      }
      const c = b.cierre;
      const mismosApuntes = c.debe.apuntes === leidos.debe.apuntes && c.haber.apuntes === leidos.haber.apuntes;
      const mismosImportes = c.debe.centimos === leidos.debe.centimos && c.haber.centimos === leidos.haber.centimos;
      if (!mismosApuntes) {
        avisos.push(aviso('formato_totales_no_coinciden', {
          archivo, declarados: c.debe.apuntes + c.haber.apuntes, leidos: leidos.debe.apuntes + leidos.haber.apuntes,
        }));
      } else if (!mismosImportes) {
        avisos.push(aviso('formato_importes_no_coinciden', { archivo }));
      }
      if (b.saldoInicial !== null && c.saldoFinal !== null) {
        const diferencia = b.saldoInicial + leidos.haber.centimos - leidos.debe.centimos - c.saldoFinal;
        info.cuadra = diferencia === 0;
        // si el resumen ya explica la diferencia, no se repite el aviso
        if (diferencia !== 0 && mismosApuntes && mismosImportes) {
          avisos.push(aviso('formato_no_cuadra', { archivo, diferencia: formatearImporte(Math.abs(diferencia) / 100, divisa, idioma), importe: Math.abs(diferencia) / 100 }));
        }
      }
    }
    // los bloques seguidos de la misma cuenta deben enlazar: final de uno = inicial del siguiente
    for (let i = 1; i < bs.length; i++) {
      const fa = bs[i - 1].cierre?.saldoFinal, ib = bs[i].saldoInicial;
      if (fa != null && ib !== null && fa !== ib) {
        avisos.push(aviso('formato_saldo_no_continua', { archivo, fecha: formatearFecha(bs[i].fecha_inicial), desde: bs[i].fecha_inicial }));
      }
    }
    if (b0.sinCabecera) avisos.push(aviso('formato_sin_cabecera', { archivo }));
    else if (b0.divisaSupuesta) avisos.push(aviso('formato_divisa_supuesta', { archivo }));

    const ultimoBloque = bs[bs.length - 1];
    const fechasIni = bs.map((b) => b.fecha_inicial).filter(Boolean).sort();
    const fechasFin = bs.map((b) => b.fecha_final).filter(Boolean).sort();
    const suma = (k, lado) => resumen.reduce((acc, r) => (acc === null || !r[k] || r[k][lado].importe === null ? null : {
      apuntes: acc.apuntes + r[k][lado].apuntes, importe: Math.round((acc.importe + r[k][lado].importe) * 100) / 100,
    }), { apuntes: 0, importe: 0 });

    lecturas.push(crearLectura({
      archivo,
      formato: 'norma43',
      perfil: b0.sinCabecera ? null : perfilPorCuenta({ entidad: b0.entidad }),
      nivel: 'A',
      movimientos,
      saldo_inicial: b0.saldoInicial === null ? null : b0.saldoInicial / 100,
      saldo_final: ultimoBloque.cierre?.saldoFinal == null ? null : ultimoBloque.cierre.saldoFinal / 100,
      fecha_inicial: fechasIni[0] ?? null,
      fecha_final: fechasFin[fechasFin.length - 1] ?? null,
      avisos,
      extra: {
        cuenta: b0.sinCabecera ? null : { entidad: b0.entidad, oficina: b0.oficina, numero: b0.numero, nombre: b0.nombre || null },
        divisa,
        modalidad: b0.modalidad,
        totales: { debe: suma('totales', 'debe'), haber: suma('totales', 'haber') },
        leidos: { debe: suma('leidos', 'debe'), haber: suma('leidos', 'haber') },
        bloques: resumen,
        cuadra: resumen.every((r) => r.cuadra === true),
        equivalencias,
        fin_fichero: fin,
      },
    }));
  }

  // avisos de todo el archivo: en la primera lectura
  if (raras.length) lecturas[0].avisos.unshift(avisoLineas(archivo, raras));
  if (conFechaValor.length) lecturas[0].avisos.push(avisoContado('formato_fecha_valor_usada', conFechaValor.length, { archivo, filas: conFechaValor.slice(0, 50) }));
  return lecturas.length === 1 ? lecturas[0] : lecturas;
}
