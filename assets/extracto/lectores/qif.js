// QIF (Quicken Interchange Format): !Type:Bank, !Type:CCard, !Type:Cash (también Oth A y Oth L).
// Campos: D fecha, T o U importe, P beneficiario, M memo, N número, L categoría, ^ fin del movimiento. No trae saldo.
// Fechas: MM/DD/AAAA, DD/MM/AAAA, D/M'AA (apóstrofo de Quicken), AAAA-MM-DD. El orden día/mes se decide con todas las fechas.

import { crearMovimiento, crearLectura, lecturaConError, aviso } from '../nucleo/modelo.js';
import { parseImporte, inferirDecimal } from '../nucleo/numeros.js';
import { parseFecha, inferirOrden } from '../nucleo/fechas.js';
import { decodificar, normalizar } from '../nucleo/texto.js';
import { unirConceptos, partirLineas, avisoLineas } from './formato.js';

const TIPOS_CUENTA = new Set(['BANK', 'CCARD', 'CASH', 'OTH A', 'OTH L']);
const SALDO_APERTURA = /^(?:OPENING BALANCE|SALDO INICIAL|SALDO DE APERTURA|SALDO D'OBERTURA|SALDO INICI)$/;

/** "1/ 5'26" → "1/5/26"; "01.05.2026" y "2026-01-05" quedan igual. */
function normalizarFecha(s) {
  return s.replace(/\s+/g, '').replace(/'/g, '/');
}

/** ¿La lista de fechas va ordenada (hacia delante o hacia atrás)? */
function ordenada(fechas) {
  let sube = true, baja = true;
  for (let i = 1; i < fechas.length; i++) {
    if (fechas[i] < fechas[i - 1]) sube = false;
    if (fechas[i] > fechas[i - 1]) baja = false;
  }
  return sube || baja;
}

/** parseFecha con memoria: en un extracto las mismas fechas se repiten muchas veces. */
function lectorDeFechas() {
  const memo = new Map();
  return (f, orden) => {
    const k = orden + f;
    let v = memo.get(k);
    if (v === undefined) { v = parseFecha(f, { orden }); memo.set(k, v); }
    return v;
  };
}

/**
 * Orden día/mes de las fechas del archivo.
 * inferirOrden decide cuando algún número pasa de 12. Si no pasa ninguno, es ambiguo:
 * si solo una de las dos lecturas deja las fechas ordenadas, esa es la buena; si no, día/mes y aviso.
 */
function decidirOrden(fechas, fecha) {
  const diaMes = fechas.filter((f) => /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(f));
  if (!diaMes.length) return { orden: 'dmy', dudoso: false };
  const orden = inferirOrden([...new Set(diaMes)]);
  const conDmy = diaMes.map((f) => fecha(f, 'dmy'));
  const conMdy = diaMes.map((f) => fecha(f, 'mdy'));
  const todasDmy = conDmy.every(Boolean), todasMdy = conMdy.every(Boolean);
  if (orden === 'mdy' || !todasDmy || !todasMdy) return { orden: !todasDmy && todasMdy ? 'mdy' : orden, dudoso: !todasDmy && !todasMdy };
  // ambiguo: todas valen de las dos formas
  const distintas = new Set(conDmy).size;
  if (distintas >= 3) {
    const okDmy = ordenada(conDmy), okMdy = ordenada(conMdy);
    if (okDmy && !okMdy) return { orden: 'dmy', dudoso: false };
    if (okMdy && !okDmy) return { orden: 'mdy', dudoso: false };
  }
  const iguales = conDmy.every((f, i) => f === conMdy[i]); // 01/01, 02/02…: da igual el orden
  return { orden: 'dmy', dudoso: !iguales };
}

/**
 * Lee un QIF. Una LecturaArchivo por cuenta (si el archivo trae varias con !Account).
 * @param {{nombre: string, bytes?: Uint8Array, texto?: string}} entrada
 * @param {{idArchivo: number|string}} ctx
 */
export async function leer(entrada, ctx) {
  const archivo = entrada.nombre;
  const texto = typeof entrada.texto === 'string' ? entrada.texto : decodificar(entrada.bytes).texto;
  const lineas = partirLineas(texto);

  // 1. registros en bruto por cuenta
  const cuentas = [];
  const porNombre = new Map();
  const cuentaDe = (nombre, tipo) => {
    const k = `${nombre ?? ''}|${tipo}`;
    if (!porNombre.has(k)) { const c = { nombre, tipo, registros: [] }; porNombre.set(k, c); cuentas.push(c); }
    return porNombre.get(k);
  };
  const raras = [];
  let modo = null; // 'cuenta' (datos de !Account), 'movimientos', 'ignorar'
  let cuenta = null;
  let reg = null;
  let datosCuenta = {};
  let ultimaCuenta = null;
  let inversiones = false;
  let cabeceras = 0;

  for (let i = 0; i < lineas.length; i++) {
    let linea = lineas[i];
    if (i === 0 && linea.charCodeAt(0) === 0xfeff) linea = linea.slice(1);
    linea = linea.replace(/\s+$/, '');
    if (!linea.trim()) continue;
    linea = linea.replace(/^\s+/, '');
    if (linea[0] === '!') {
      const cab = linea.slice(1).trim();
      const t = /^Type\s*:\s*(.*)$/i.exec(cab);
      if (t) {
        cabeceras++;
        if (reg && cuenta && modo === 'movimientos') cuenta.registros.push(reg);
        reg = null;
        const tipo = t[1].trim().toUpperCase();
        if (TIPOS_CUENTA.has(tipo)) { modo = 'movimientos'; cuenta = cuentaDe(ultimaCuenta?.N ?? null, tipo); } else {
          modo = 'ignorar'; // categorías, clases, memorizados, inversiones
          if (tipo.startsWith('INVST') || tipo === 'PORT') inversiones = true;
        }
      } else if (/^Account\b/i.test(cab)) {
        cabeceras++;
        if (reg && cuenta && modo === 'movimientos') cuenta.registros.push(reg);
        reg = null; modo = 'cuenta'; datosCuenta = {};
      } else if (!/^(?:Option|Clear)\s*:/i.test(cab)) {
        raras.push(i + 1);
      }
      continue;
    }
    if (modo === 'ignorar') continue;
    if (modo === 'cuenta') {
      if (linea[0] === '^') { ultimaCuenta = datosCuenta; datosCuenta = {}; } else datosCuenta[linea[0]] = linea.slice(1).trim();
      continue;
    }
    if (modo !== 'movimientos') {
      // movimientos sin cabecera !Type: se leen en una cuenta sin nombre
      if (!/^[DTU]/.test(linea)) { raras.push(i + 1); continue; }
      modo = 'movimientos';
      cuenta = cuentaDe(null, 'BANK');
    }
    if (linea[0] === '^') { if (reg) cuenta.registros.push(reg); reg = null; continue; }
    if (!reg) reg = { fila: i + 1 };
    const valor = linea.slice(1).trim();
    switch (linea[0]) {
      case 'D': reg.D = valor; break;
      case 'T': reg.T = valor; break;
      case 'U': if (reg.U === undefined) reg.U = valor; break;
      case 'P': reg.P = valor; break;
      case 'M': reg.M = valor; break;
      case 'N': reg.N = valor; break;
      case 'L': reg.L = valor; break;
      default: break; // C, A, S, E, $, %… : datos que no hacen falta
    }
  }
  if (reg && cuenta && modo === 'movimientos') cuenta.registros.push(reg);
  if (!cabeceras && !cuentas.length) return lecturaConError(archivo, 'qif', 'danado', { archivo });

  // 2. orden de fechas y separador decimal de todo el archivo
  const todos = cuentas.flatMap((c) => c.registros);
  const leerFecha = lectorDeFechas();
  const { orden, dudoso } = decidirOrden(todos.filter((r) => r.D).map((r) => normalizarFecha(r.D)), leerFecha);
  const decimal = inferirDecimal(todos.map((r) => r.T ?? r.U).filter(Boolean));

  // 3. movimientos
  const lecturas = [];
  let n = 0;
  for (const c of cuentas) {
    const avisos = [aviso('formato_divisa_supuesta', { archivo })];
    if (dudoso) avisos.push(aviso('formato_orden_fechas_dudoso', { archivo }));
    const movimientos = [];
    let apertura = null;
    for (const r of c.registros) {
      const fecha = r.D ? leerFecha(normalizarFecha(r.D), orden) : null;
      const importe = parseImporte(r.T ?? r.U ?? null, { decimal });
      if (!fecha || importe === null) { raras.push(r.fila); continue; }
      const categoria = (r.L ?? '').trim();
      const aOtraCuenta = /^\[.+\]$/.test(categoria);
      if (aOtraCuenta && SALDO_APERTURA.test(normalizar(r.P ?? ''))) { apertura = { fecha, importe, fila: r.fila }; continue; } // no es un movimiento
      movimientos.push(crearMovimiento({
        id: `${ctx.idArchivo}-${++n}`,
        fecha,
        fecha_valor: null,
        concepto: unirConceptos([r.P, r.M]),
        importe: importe || 0, // sin "-0"
        saldo: null,
        divisa: 'EUR',
        origen: { archivo, fila: r.fila },
        cuenta: c.nombre,
        nota: aOtraCuenta ? 'traspaso' : undefined, // en Quicken, [Cuenta] es un traspaso entre cuentas propias
      }));
    }
    lecturas.push(crearLectura({
      archivo, formato: 'qif', perfil: null, nivel: 'A', movimientos,
      saldo_inicial: apertura ? apertura.importe : null,
      saldo_final: null,
      avisos,
      extra: { tipo: c.tipo, cuenta: c.nombre, orden_fechas: orden, saldo_apertura: apertura, divisa_supuesta: true },
    }));
  }
  if (!lecturas.length) {
    lecturas.push(crearLectura({ archivo, formato: 'qif', nivel: 'A', avisos: [], extra: { divisa_supuesta: true } }));
  }
  if (raras.length) lecturas[0].avisos.unshift(avisoLineas(archivo, [...new Set(raras)].sort((a, b) => a - b)));
  if (inversiones) lecturas[0].avisos.push(aviso('formato_inversiones_ignoradas', { archivo }));
  return lecturas.length === 1 ? lecturas[0] : lecturas;
}
