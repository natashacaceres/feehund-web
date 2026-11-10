// Montaje del resultado del lector del datáfono: lecturas crudas → campos de la calculadora con su origen,
// comprobaciones y avisos. Lógica pura (sin DOM, red ni almacenamiento): se prueba en Node igual que en el worker.
//
//   montarResumen(lecturas, {opciones, texto})   → resultado de analizarResumen() (ver DESARROLLO.md, «Lector del datáfono»)
//   CAMPOS                                       campo → casilla de la calculadora (id del input en datafono/index.html)

import { lineasDeLecturas } from './lineas.js';
import { extraerResumen, cuadraComision } from './resumen.js';
import { cabeceraDeOperaciones, operacionesDeTabla, sumarPorMes, esFB500, leerFB500 } from './operaciones.js';
import { proveedoresEn, palabrasDe, PROVEEDORES } from './etiquetas.js';
import { redondear2, aCentimos } from '../nucleo/numeros.js';
import { diasEntre, hoyISO } from '../nucleo/fechas.js';
import { decodificar } from '../nucleo/texto.js';

export const VERSION_RESUMEN = '1.0.0';
export const GRUPOS = ['particulares', 'empresa', 'fuera_europa', 'amex', 'bizum'];

/** Campos que rellena el lector → casilla de la calculadora. Los de «contrato» solo cuentan con «Escribir mis precios». */
export const CAMPOS = {
  ventas_particulares: { id: 'pPart', unidad: 'eur', paso: 1 },
  ventas_empresa: { id: 'pEmp', unidad: 'eur', paso: 1 },
  ventas_fuera_europa: { id: 'pNoe', unidad: 'eur', paso: 1 },
  ventas_amex: { id: 'pAmex', unidad: 'eur', paso: 1 },
  ventas_bizum: { id: 'pBiz', unidad: 'eur', paso: 1 },
  operaciones: { id: 'pOps', unidad: 'num', paso: 2 },
  pagado: { id: 'pPaid', unidad: 'eur', paso: 3 },
  proveedor: { id: 'pProvChips', unidad: 'texto', paso: 4 },
  tasa_particulares: { id: 'cP', unidad: 'pct', paso: 4, contrato: true },
  tasa_empresa: { id: 'cE', unidad: 'pct', paso: 4, contrato: true },
  tasa_fuera_europa: { id: 'cN', unidad: 'pct', paso: 4, contrato: true },
  tasa_amex: { id: 'cA', unidad: 'pct', paso: 4, contrato: true },
  tasa_bizum: { id: 'cB', unidad: 'pct', paso: 4, contrato: true },
  fijo_por_cobro: { id: 'cF', unidad: 'eur', paso: 4, contrato: true },
  cuota: { id: 'cQ', unidad: 'eur', paso: 4, contrato: true },
  alquiler: { id: 'cL', unidad: 'eur', paso: 4, contrato: true },
};
// Lo que un resumen no trae y la calculadora pregunta siempre
export const PREGUNTAS_SIEMPRE = ['permanencia', 'sector', 'forma', 'iva', 'caja'];

const MAX_ORIGENES = 40;
const IVA_ES = 0.21;

/**
 * @param {Object[]} lecturas lecturas de los lectores en modo crudo (pdf, imagen, hoja, csv, pegado) o normales (N43…)
 * @param {{opciones: {idioma, hoy, mes?}, texto: (codigo, idioma, datos) => string}} deps
 */
export function montarResumen(lecturas, deps = {}) {
  const opciones = deps.opciones ?? {};
  const idioma = ['es', 'ca', 'en'].includes(opciones.idioma) ? opciones.idioma : 'es';
  const hoy = /^\d{4}-\d{2}-\d{2}$/.test(opciones.hoy || '') ? opciones.hoy : hoyISO();
  const T = (codigo, datos) => (deps.texto ? deps.texto(codigo, idioma, datos) : codigo);
  const avisos = [], comprobaciones = [], errores = [];
  const necesitaContrasena = [];
  const archivos = [];

  // 1. errores, contraseñas, extractos del banco y ficheros FB 500
  const crudas = [], fb500 = [];
  for (const l of lecturas) {
    const info = { nombre: l.archivo, formato: l.formato, nivel: l.nivel, modo: null };
    archivos.push(info);
    if (l.necesita_contrasena) { necesitaContrasena.push({ archivo: l.archivo, motivo: l.necesita_contrasena.motivo ?? 'requerida' }); continue; }
    if (l.error) { errores.push({ archivo: l.archivo, codigo: l.error.codigo }); info.error = l.error.codigo; continue; }
    const e = l.extra || {};
    if (!e.paginas && !e.tablas && typeof e.texto !== 'string') {
      // un lector que no tiene modo crudo (Norma 43, OFX, camt…): es el extracto de una cuenta, no del datáfono
      errores.push({ archivo: l.archivo, codigo: 'es_extracto_banco' }); info.error = 'es_extracto_banco'; continue;
    }
    if (typeof e.texto === 'string' && esFB500(e.texto)) { fb500.push({ l, info }); continue; }
    crudas.push({ l, info });
    for (const a of l.avisos || []) if (a.codigo === 'demasiadas_imagenes' || a.codigo === 'necesita_ocr' || a.codigo === 'pdf_paginas_ocr') avisos.push(a);
  }

  const { lineas, tablas } = lineasDeLecturas(crudas.map((c) => c.l));
  const nivel = peorNivel(crudas.map((c) => c.l.nivel).concat(fb500.length ? ['A'] : []));

  // 2. ¿exportación con una fila por cobro? (tablas con fecha, importe y comisión o marca)
  let operaciones = [], fuera = null, modo = null;
  for (const { l, info } of fb500) {
    const r = leerFB500(l.extra.texto, l.archivo);
    info.modo = 'operaciones';
    info.formato = 'fb500';
    operaciones.push(...r.operaciones);
    if (r.totales.length) comprobarFB500(r, comprobaciones);
    if (r.sin_leer) avisos.push({ codigo: 'fb500_filas_sin_leer', datos: { archivo: l.archivo, n: r.sin_leer } });
  }
  for (const t of tablas) {
    const cab = cabeceraDeOperaciones(t.filas);
    if (!cab) continue;
    const r = operacionesDeTabla(t, cab);
    if (!r.operaciones.length) continue;
    // casi todo cobros (en positivo): en un extracto del banco la mayoría de las líneas son cargos
    const ventas = r.operaciones.filter((o) => o.clase === 'venta').length;
    if (ventas < 0.6 * r.operaciones.length) continue;
    operaciones.push(...r.operaciones);
    fuera = sumarFuera(fuera, r.fuera);
    const info = archivos.find((a) => a.nombre === t.archivo);
    if (info) info.modo = 'operaciones';
  }

  let res;
  const lineasProveedor = lineas.map((L) => ({ palabras: palabrasDe(L.texto), indice: L.indice, L }));
  if (operaciones.length) {
    modo = 'operaciones';
    res = desdeOperaciones(operaciones, { hoy, mes: opciones.mes, avisos, comprobaciones, fuera });
  } else {
    // cada archivo es un resumen: si hay varios (dos meses), se usa uno, nunca la suma de los dos
    const porArchivo = new Map();
    for (const L of lineas) { if (!porArchivo.has(L.archivo)) porArchivo.set(L.archivo, []); porArchivo.get(L.archivo).push(L); }
    const todos = [...porArchivo.entries()].map(([archivo, ls]) => ({ archivo, r: extraerResumen(ls) }));
    // un archivo con movimientos de cuenta y sin ventas ni cobros es un extracto del banco: se dice y no da cifras
    const conVentas = (r) => r.hechos.some((h) => (h.papel === 'ventas' || h.papel === 'operaciones' || h.papel === 'dia_ventas') && h.valor > 0);
    for (const x of todos) {
      if (x.r.movimientos >= 5 && !conVentas(x.r)) {
        errores.push({ archivo: x.archivo, codigo: 'es_extracto_banco' });
        const info = archivos.find((a) => a.nombre === x.archivo); if (info) info.error = 'es_extracto_banco';
        x.r.hechos = [];
      }
    }
    const leidos = todos.filter((x) => x.r.hechos.length && conVentas(x.r));
    if (leidos.length) {
      leidos.sort((a, b) => (a.r.periodo?.hasta ?? '').localeCompare(b.r.periodo?.hasta ?? ''));
      const elegido = leidos[leidos.length - 1];
      if (leidos.length > 1) avisos.push({ codigo: 'varios_resumenes', datos: { n: leidos.length, archivo: elegido.archivo } });
      modo = 'resumen';
      const info = archivos.find((a) => a.nombre === elegido.archivo);
      if (info) info.modo = 'resumen';
      res = desdeHechos(elegido.r, { hoy, nivel, avisos, comprobaciones });
    }
  }

  // 3. proveedor
  const proveedor = fb500.length
    ? { valor: 'caixabank', nombre: 'CaixaBank', calculadora: 'CaixaBank', seguro: true, como: 'formato', origen: [origenFB(fb500[0].l)] }
    : detectarProveedor(lineasProveedor, tablas);

  const campos = {};
  for (const k of Object.keys(CAMPOS)) campos[k] = vacio(k);
  if (res) Object.assign(campos, res.campos);
  campos.proveedor = proveedor ? { ...vacio('proveedor'), ...proveedor } : vacio('proveedor');

  if (!res && !errores.length && !necesitaContrasena.length) errores.push({ archivo: archivos[0]?.nombre ?? null, codigo: 'sin_datos_datafono' });

  // 4. seguridad final: una comprobación que falla quita la seguridad a sus campos; en fotos, hace falta una que cuadre
  const mal = new Set(), bien = new Set();
  for (const c of comprobaciones) for (const k of c.campos ?? []) (c.estado === 'no_cuadra' ? mal : c.estado === 'cuadra' ? bien : new Set()).add(k);
  for (const [k, c] of Object.entries(campos)) {
    if (c.valor === null || c.valor === undefined) { c.seguro = false; continue; }
    if (mal.has(k)) { c.seguro = false; c.motivos = [...new Set([...(c.motivos ?? []), 'no_cuadra'])]; }
    if (nivel === 'C' && k !== 'proveedor' && !bien.has(k)) { c.seguro = false; c.motivos = [...new Set([...(c.motivos ?? []), 'foto_sin_comprobar'])]; }
  }

  // 5. textos
  const conTexto = (a) => ({ ...a, texto: T(a.codigo, datosTexto(a.datos, idioma)) });
  for (const c of Object.values(campos)) c.motivos_texto = (c.motivos ?? []).map((m) => T('motivo_' + m, {}));
  const preguntar = Object.entries(campos).filter(([k, c]) => !CAMPOS[k].contrato && (c.valor === null || c.valor === undefined || !c.seguro)).map(([k]) => k);
  return {
    version: VERSION_RESUMEN,
    tipo: 'resumen_datafono',
    idioma, hoy,
    lectura: {
      modo, nivel, archivos,
      periodo: res?.periodo ?? null,
      meses: res?.meses ?? null,
      lineas: lineas.length,
      proveedor: proveedor ? { id: proveedor.valor, nombre: proveedor.nombre } : null,
    },
    campos,
    detalle: res?.detalle ?? null,
    comprobaciones: comprobaciones.map((c) => ({ ...c, texto: T(c.codigo + (c.estado === 'cuadra' ? '_si' : '_no'), datosTexto(c.datos, idioma)) })),
    avisos: avisos.map(conTexto),
    preguntar: [...preguntar, ...PREGUNTAS_SIEMPRE],
    necesita_confirmacion: true,
    necesita_contrasena: necesitaContrasena.length ? necesitaContrasena : null,
    errores: errores.map((e) => ({ ...e, texto: T(e.codigo, { archivo: e.archivo ?? '' }) })),
  };
}

/**
 * Formato de un archivo para el lector del datáfono: el de formato.js, salvo que un texto que no reconoce (un
 * resumen en .txt, el fichero FB 500) se lee como texto, no se rechaza.
 */
export async function detectarParaResumen(entrada, detectarFormato) {
  const d = await detectarFormato(entrada);
  const formato = typeof d === 'string' ? d : d?.formato;
  if ((formato === 'desconocido' || (formato === 'txt' && d?.separador === null)) && entrada.bytes?.length && pareceTexto(entrada.bytes)) {
    return { formato: 'txt', lector: 'pegado' };
  }
  return d;
}

function pareceTexto(bytes) {
  const muestra = bytes.subarray(0, 8000);
  if (muestra.includes(0)) return false;
  const t = decodificar(muestra).texto;
  const raros = (t.match(/[\u0000-\u0008\u000E-\u001F\uFFFD]/g) || []).length;
  return raros <= t.length * 0.01;
}

// ───────────── resumen con etiquetas ─────────────

function desdeHechos(r, { hoy, nivel, avisos, comprobaciones }) {
  const hechos = quitarRepetidos(r.hechos, avisos);
  const campos = {};
  const tipos = hechos.filter((h) => h.grupo && !h.total);
  const totales = (papel) => hechos.filter((h) => h.papel === papel && !h.grupo);
  const filasTipo = agruparFilas(tipos);

  // ventas por grupo
  const porGrupo = {};
  for (const g of GRUPOS) porGrupo[g] = { ventas: 0, operaciones: 0, comision: 0, filas: [], hechos: [], con_comision: true, con_operaciones: true };
  for (const f of filasTipo) {
    const p = porGrupo[f.grupo];
    if (f.ventas) { p.ventas += f.ventas.valor; p.hechos.push(f.ventas); }
    if (f.operaciones) p.operaciones += f.operaciones.valor; else if (f.ventas) p.con_operaciones = false;
    if (f.comision) p.comision += f.comision.valor; else if (f.ventas) p.con_comision = false;
    p.filas.push(f);
  }
  const hayTipos = filasTipo.some((f) => f.ventas);
  const sumaTipos = redondear2(GRUPOS.reduce((s, g) => s + porGrupo[g].ventas, 0));
  let ventasTot = elegir(totales('ventas'), hayTipos ? sumaTipos : null);
  // tabla por días: su suma se compara con el total; sin total ni tipos, la suma de los días es el total
  const dias = hechos.filter((h) => h.papel === 'dia_ventas');
  if (dias.length) {
    const sumaDias = redondear2(dias.reduce((s, h) => s + h.valor, 0));
    if (ventasTot.valor !== null) {
      comprobaciones.push({ codigo: 'dias_suman_total', estado: Math.abs(sumaDias - ventasTot.valor) <= 0.011 * dias.length ? 'cuadra' : 'no_cuadra',
        campos: GRUPOS.map((g) => 'ventas_' + g), datos: { suma: sumaDias, total: ventasTot.valor, n: dias.length }, origen: origenes([ventasTot.hecho]) });
    } else if (!hayTipos) {
      ventasTot = { valor: sumaDias, hecho: dias[0], hechos: dias, conflicto: false, distintas: [sumaDias], como: 'sumado' };
    }
  }
  const distingueUso = tipos.some((h) => h.tipo?.uso === 'empresa') || tipos.some((h) => h.grupo === 'empresa');
  const distingueRegion = tipos.some((h) => h.tipo?.region) || tipos.some((h) => h.grupo === 'fuera_europa');

  // comprobación: la suma por tipos da el total
  let tiposCuadran = null;
  if (hayTipos && ventasTot.valor !== null) {
    const n = filasTipo.filter((f) => f.ventas).length;
    tiposCuadran = Math.abs(sumaTipos - ventasTot.valor) <= 0.01 * n + 0.001;
    comprobaciones.push({ codigo: 'tipos_suman_total', estado: tiposCuadran ? 'cuadra' : 'no_cuadra', campos: GRUPOS.map((g) => 'ventas_' + g),
      datos: { suma: sumaTipos, total: ventasTot.valor, diferencia: redondear2(sumaTipos - ventasTot.valor) }, origen: origenes([ventasTot.hecho]) });
  }
  for (const g of GRUPOS) {
    const p = porGrupo[g];
    const k = 'ventas_' + g;
    if (hayTipos) {
      if (!p.filas.length) {
        // el resumen desglosa y este grupo no sale: 0 solo si la suma por tipos cuadra con el total
        campos[k] = { ...vacio(k), valor: tiposCuadran ? 0 : null, seguro: Boolean(tiposCuadran), como: 'sin_ventas', origen: [] };
        continue;
      }
      const motivos = [];
      if (g === 'particulares' && !distingueUso) motivos.push('sin_separar_empresa');
      if (g === 'particulares' && !distingueRegion) motivos.push('sin_separar_region');
      if (p.hechos.some((h) => h.dudoso || h.tipo?.dudoso)) motivos.push('atribuido_por_tamano');
      campos[k] = { ...vacio(k), valor: redondear2(p.ventas), seguro: !motivos.length, como: p.hechos.length > 1 ? 'sumado' : 'leido',
        origen: origenes(p.hechos), motivos };
    } else if (g === 'particulares' && ventasTot.valor !== null) {
      campos[k] = { ...vacio(k), valor: ventasTot.valor, seguro: false, como: 'supuesto', origen: origenes(ventasTot.hechos ?? [ventasTot.hecho]), motivos: ['sin_desglose'] };
    }
  }

  // operaciones
  const opsTipos = GRUPOS.reduce((s, g) => s + porGrupo[g].operaciones, 0);
  const opsCompletas = hayTipos && GRUPOS.every((g) => porGrupo[g].con_operaciones) && opsTipos > 0;
  let opsTot = elegir(totales('operaciones'), opsCompletas ? opsTipos : null);
  const opsDias = hechos.filter((h) => h.papel === 'dia_operaciones');
  if (opsTot.valor === null && !opsCompletas && opsDias.length && opsDias.length === dias.length) {
    opsTot = { valor: opsDias.reduce((s, h) => s + h.valor, 0), hecho: opsDias[0], hechos: opsDias, conflicto: false };
  }
  if (opsTot.valor !== null) {
    campos.operaciones = { ...vacio('operaciones'), valor: opsTot.valor, seguro: !opsTot.conflicto, como: opsTot.hechos ? 'sumado' : 'leido', origen: origenes(opsTot.hechos ?? [opsTot.hecho]) };
    if (opsCompletas) comprobaciones.push({ codigo: 'operaciones_suman_total', estado: opsTipos === opsTot.valor ? 'cuadra' : 'no_cuadra', campos: ['operaciones'],
      datos: { suma: opsTipos, total: opsTot.valor }, origen: origenes([opsTot.hecho]) });
  } else if (opsCompletas) {
    campos.operaciones = { ...vacio('operaciones'), valor: opsTipos, seguro: true, como: 'sumado', origen: origenes(filasTipo.map((f) => f.operaciones).filter(Boolean)) };
  }

  // comisiones y cargos
  const comTipos = redondear2(GRUPOS.reduce((s, g) => s + porGrupo[g].comision, 0));
  const comCompletas = hayTipos && GRUPOS.every((g) => !porGrupo[g].filas.length || porGrupo[g].con_comision) && comTipos > 0;
  const partesIC = ['intercambio', 'marca_tasa'].map((p) => elegir(totales(p), null)).filter((x) => x.valor !== null);
  let comision = elegir(totales('comision'), comCompletas ? comTipos : null);
  if (comCompletas && comision.valor !== null && comision.hecho) {
    comprobaciones.push({ codigo: 'comisiones_suman_total', estado: Math.abs(comTipos - comision.valor) <= 0.011 * filasTipo.length ? 'cuadra' : 'no_cuadra',
      campos: ['pagado'], datos: { suma: comTipos, total: comision.valor }, origen: origenes([comision.hecho]) });
  }
  if (comision.valor === null && comCompletas) comision = { valor: comTipos, hecho: null, hechos: filasTipo.map((f) => f.comision).filter(Boolean), como: 'sumado' };
  const comDias = hechos.filter((h) => h.papel === 'dia_comision');
  if (comision.valor === null && !hayTipos && comDias.length && comDias.length === dias.length) {
    comision = { valor: redondear2(comDias.reduce((s, h) => s + h.valor, 0)), hecho: null, hechos: comDias, como: 'sumado' };
  }
  if (comision.valor === null && partesIC.length) {
    comision = { valor: redondear2(partesIC.reduce((s, x) => s + x.valor, 0)), hecho: null, hechos: partesIC.map((x) => x.hecho), como: 'sumado' };
  }
  const uno = (papel) => elegir(totales(papel), null);
  const cuota = uno('cuota'), alquiler = uno('alquiler'), iva = uno('iva'), otros = sumaDe(totales('cargo_otro'));
  const devueltas = sumaDe(totales('comision_devuelta'));
  const cargosTot = uno('cargos_total');
  const partes = [comision, cuota, alquiler, iva].filter((x) => x.valor !== null);
  const sumaPartes = redondear2(partes.reduce((s, x) => s + x.valor, 0) + otros.valor - devueltas.valor);
  if (cargosTot.valor !== null) {
    const motivos = cargosTot.conflicto ? ['cifras_distintas'] : [];
    campos.pagado = { ...vacio('pagado'), valor: cargosTot.valor, seguro: !motivos.length, como: 'leido', origen: origenes([cargosTot.hecho]), motivos };
    if (partes.length >= 2) comprobaciones.push({ codigo: 'cargos_suman_total', estado: Math.abs(sumaPartes - cargosTot.valor) <= 0.02 ? 'cuadra' : 'no_cuadra',
      campos: ['pagado'], datos: { suma: sumaPartes, total: cargosTot.valor }, origen: origenes([cargosTot.hecho]) });
  } else if (comision.valor !== null) {
    const motivos = [];
    if (cuota.valor === null && alquiler.valor === null) motivos.push('solo_comisiones');
    const todos = partes.flatMap((x) => (x.hecho ? [x.hecho] : x.hechos ?? [])).concat(otros.hechos, devueltas.hechos);
    campos.pagado = { ...vacio('pagado'), valor: sumaPartes, seguro: !motivos.length && !comision.conflicto, como: partes.length > 1 || otros.hechos.length ? 'sumado' : 'leido',
      origen: origenes(todos), motivos };
  }

  // tasas por grupo (para «Escribir mis precios»)
  const general = uno('tasa_general');
  const fijo = uno('fijo');
  for (const g of GRUPOS) {
    const p = porGrupo[g], k = 'tasa_' + g;
    const declaradas = p.filas.map((f) => f.tasa).filter(Boolean);
    const distintas = new Set(declaradas.map((h) => h.valor));
    if (declaradas.length && declaradas.length === p.filas.filter((f) => f.ventas).length && distintas.size === 1) {
      campos[k] = { ...vacio(k), valor: declaradas[0].valor, seguro: true, como: 'leido', origen: origenes(declaradas) };
    } else if (p.ventas > 0 && p.con_comision && p.comision > 0) {
      campos[k] = { ...vacio(k), valor: Math.round((p.comision / p.ventas) * 100 * 1000) / 1000, seguro: false, como: 'calculado',
        origen: origenes(p.filas.flatMap((f) => [f.ventas, f.comision]).filter(Boolean)), motivos: [distintas.size > 1 ? 'varias_tasas' : 'tasa_media'] };
    } else if (general.valor !== null && (!hayTipos || p.filas.length)) {
      campos[k] = { ...vacio(k), valor: general.valor, seguro: !hayTipos ? true : false, como: 'leido', origen: origenes([general.hecho]), motivos: hayTipos ? ['misma_tasa'] : [] };
    }
    // cada fila con tasa y comisión: ¿cuadran?
    for (const f of p.filas) {
      if (!f.tasa || !f.comision || !f.ventas || f.tasa.trozo?.tipo !== 'porcentaje') continue;
      const ok = cuadraComision(f.ventas.valor, f.tasa.valor, f.comision.valor, f.operaciones?.valor ?? 0, fijo.valor ?? 0)
        || cuadraComision(f.ventas.valor, f.tasa.valor, f.comision.valor, 0, 0);
      comprobaciones.push({ codigo: 'comision_cuadra_tasa', estado: ok ? 'cuadra' : 'no_cuadra', campos: ok ? [] : ['tasa_' + g],
        datos: { etiqueta: f.etiqueta, ventas: f.ventas.valor, tasa: f.tasa.valor, comision: f.comision.valor,
          esperado: redondear2(f.ventas.valor * f.tasa.valor / 100) }, origen: origenes([f.comision]) });
    }
  }
  if (fijo.valor !== null) campos.fijo_por_cobro = { ...vacio('fijo_por_cobro'), valor: fijo.valor, seguro: !fijo.conflicto, como: 'leido', origen: origenes([fijo.hecho]) };
  if (cuota.valor !== null) campos.cuota = { ...vacio('cuota'), valor: cuota.valor, seguro: !cuota.conflicto, como: 'leido', origen: origenes([cuota.hecho]),
    motivos: cuota.hecho?.iva === 'incluido' ? ['iva_incluido'] : [] };
  if (alquiler.valor !== null) {
    const conIva = alquiler.hecho?.iva === 'incluido';
    campos.alquiler = { ...vacio('alquiler'), valor: conIva ? redondear2(alquiler.valor / (1 + IVA_ES)) : alquiler.valor, seguro: !alquiler.conflicto && !conIva,
      como: conIva ? 'calculado' : 'leido', origen: origenes([alquiler.hecho]), motivos: conIva ? ['quitado_iva'] : [] };
  }

  // IVA: ¿sale del 21 % de algo?
  if (iva.valor !== null) {
    const bases = [[cuota, alquiler], [cuota, alquiler, comision]].map((l) => redondear2(l.reduce((s, x) => s + (x.valor ?? 0), 0) + otros.valor));
    const ok = bases.some((b) => b > 0 && Math.abs(b * IVA_ES - iva.valor) <= 0.02);
    comprobaciones.push({ codigo: 'iva_cuadra', estado: ok ? 'cuadra' : 'no_cuadra', campos: [], datos: { iva: iva.valor, base: bases[0] }, origen: origenes([iva.hecho]) });
  }

  // neto abonado: ventas − devoluciones − contracargos − (comisiones) − (cuotas)
  const devol = sumaDe(totales('devoluciones')), contra = sumaDe(totales('contracargos'));
  const neto = uno('neto');
  if (neto.valor !== null && ventasTot.valor !== null) {
    const v = ventasTot.valor - devol.valor - contra.valor;
    const cargos = campos.pagado?.valor ?? 0;
    const opciones = [v, v - (comision.valor ?? 0), v - cargos, v - (comision.valor ?? 0) + devueltas.valor].map(redondear2);
    const ok = opciones.some((x) => Math.abs(x - neto.valor) <= 0.02);
    comprobaciones.push({ codigo: 'neto_cuadra', estado: ok ? 'cuadra' : 'no_cuadra', campos: ok ? GRUPOS.map((g) => 'ventas_' + g).concat(['pagado']) : [],
      datos: { neto: neto.valor, ventas: ventasTot.valor }, origen: origenes([neto.hecho]) });
  }

  // tope de la tasa de intercambio en tarjetas de particular del EEE (0,3 %): si se pasa, hay tarjetas de otro tipo mezcladas
  const icPart = porGrupo.particulares.filas.map((f) => f.intercambio).filter(Boolean);
  if (icPart.length && porGrupo.particulares.ventas > 0) {
    const ic = icPart.reduce((s, h) => s + h.valor, 0);
    const pct = (ic / porGrupo.particulares.ventas) * 100;
    const ok = pct <= 0.3 + 0.02;
    comprobaciones.push({ codigo: 'intercambio_tope', estado: ok ? 'cuadra' : 'no_cuadra', campos: ok ? [] : ['ventas_particulares'],
      datos: { pct: Math.round(pct * 1000) / 1000 }, origen: origenes(icPart) });
  }

  if (ventasTot.conflicto) avisos.push({ codigo: 'cifras_distintas', datos: { cifras: ventasTot.distintas.join(' · ') } });
  if (!hayTipos && ventasTot.valor !== null) avisos.push({ codigo: 'sin_desglose' });
  if (hayTipos && !distingueUso) avisos.push({ codigo: 'sin_separar_empresa' });
  if (r.sin_entender.length) avisos.push({ codigo: 'lineas_sin_entender', datos: { n: r.sin_entender.length } });
  if (devol.valor) avisos.push({ codigo: 'hay_devoluciones', datos: { importe: devol.valor } });
  if (contra.valor) avisos.push({ codigo: 'hay_contracargos', datos: { importe: contra.valor } });

  const periodo = r.periodo ? { desde: r.periodo.desde, hasta: r.periodo.hasta, mes: r.periodo.desde.slice(0, 7), origen: origenes([{ linea: r.periodo.linea }]) } : null;
  comprobarPeriodo(periodo, hoy, avisos, comprobaciones);

  return {
    campos, periodo, meses: null,
    detalle: {
      ventas_total: ventasTot.valor, operaciones_total: opsTot.valor, comisiones: comision.valor, intercambio: partesIC[0]?.valor ?? null,
      cuota: cuota.valor, alquiler: alquiler.valor, iva: iva.valor, otros_cargos: otros.valor || null, comisiones_devueltas: devueltas.valor || null,
      devoluciones: devol.valor || null, contracargos: contra.valor || null, neto: neto.valor,
      tipos: filasTipo.filter((f) => f.ventas || f.comision).map((f) => ({ grupo: f.grupo, etiqueta: f.etiqueta, ventas: f.ventas?.valor ?? null,
        operaciones: f.operaciones?.valor ?? null, tasa: f.tasa?.valor ?? null, comision: f.comision?.valor ?? null, origen: origenes([f.ventas ?? f.comision])[0] })),
    },
  };
}

/** Filas de tipo de tarjeta: los hechos de una misma línea y grupo juntos. */
function agruparFilas(tipos) {
  const m = new Map();
  for (const h of tipos) {
    const k = h.linea.indice + '|' + h.grupo + '|' + h.etiqueta;
    if (!m.has(k)) m.set(k, { grupo: h.grupo, etiqueta: h.etiqueta, linea: h.linea });
    const f = m.get(k);
    if (f[h.papel] === undefined) f[h.papel] = h;
  }
  return [...m.values()];
}

/** La misma tabla dos veces (resumen en la primera página y otra vez en el detalle): cada fila cuenta una sola vez. */
function quitarRepetidos(hechos, avisos) {
  const vistos = new Map(), out = [];
  let repetidos = 0;
  const porLinea = new Map();
  for (const h of hechos) { if (!porLinea.has(h.linea.indice)) porLinea.set(h.linea.indice, []); porLinea.get(h.linea.indice).push(h); }
  for (const lista of porLinea.values()) {
    const firma = lista.map((h) => `${h.papel}:${h.grupo ?? ''}:${h.total ? 'T' : ''}:${h.etiqueta.toUpperCase()}:${aCentimos(h.valor)}`).sort().join('|');
    if (lista.some((h) => h.grupo) && vistos.has(firma)) { repetidos++; continue; }
    vistos.set(firma, true);
    out.push(...lista);
  }
  if (repetidos) avisos.push({ codigo: 'filas_repetidas', datos: { n: repetidos } });
  return out;
}

/**
 * De varias cifras para el mismo papel: si todas coinciden, esa; si no, la que cuadra con la suma (si se da); si no,
 * la primera, marcada como conflicto. {valor, hecho, conflicto, distintas}
 */
function elegir(lista, suma) {
  if (!lista.length) return { valor: null, hecho: null, conflicto: false, distintas: [] };
  const distintas = [...new Set(lista.map((h) => aCentimos(h.valor)))].map((c) => c / 100);
  if (distintas.length === 1) return { valor: lista[0].valor, hecho: lista[0], conflicto: false, distintas };
  if (suma !== null) {
    const h = lista.find((x) => Math.abs(x.valor - suma) <= 0.011);
    if (h) return { valor: h.valor, hecho: h, conflicto: false, distintas };
  }
  return { valor: lista[0].valor, hecho: lista[0], conflicto: true, distintas };
}

function sumaDe(lista) {
  return { valor: redondear2(lista.reduce((s, h) => s + h.valor, 0)), hechos: lista };
}

// ───────────── exportaciones por cobro ─────────────

function desdeOperaciones(operaciones, { hoy, mes, avisos, comprobaciones, fuera }) {
  const meses = sumarPorMes(operaciones);
  const mesHoy = hoy.slice(0, 7);
  let elegido = meses.find((m) => m.mes === mes) ?? null;
  if (!elegido) {
    const cerrados = meses.filter((m) => m.mes < mesHoy);
    elegido = cerrados[cerrados.length - 1] ?? meses[meses.length - 1];
  }
  if (meses.length > 1) avisos.push({ codigo: 'varios_meses', datos: { n: meses.length, mes: elegido.mes } });
  const campos = {};
  const enCurso = elegido.mes >= mesHoy;
  const motivosMes = enCurso ? ['mes_en_curso'] : [];
  if (enCurso) avisos.push({ codigo: 'mes_en_curso', datos: { mes: elegido.mes } });
  for (const g of GRUPOS) {
    const k = 'ventas_' + g, d = elegido.grupos[g];
    if (!d) { campos[k] = { ...vacio(k), valor: 0, seguro: !enCurso, como: 'sin_ventas', origen: [] }; continue; }
    const motivos = [...motivosMes];
    if (g === 'particulares' && !d.sabido.uso) motivos.push('sin_separar_empresa');
    if (g === 'particulares' && !d.sabido.region) motivos.push('sin_separar_region');
    campos[k] = { ...vacio(k), valor: d.ventas, seguro: !motivos.length, como: 'sumado', origen: d.filas.slice(0, MAX_ORIGENES), n_origen: d.filas.length, motivos };
  }
  campos.operaciones = { ...vacio('operaciones'), valor: elegido.operaciones, seguro: !enCurso, como: 'contado', origen: [], n_origen: elegido.operaciones, motivos: motivosMes };
  if (elegido.sin_comision < elegido.ops.length) {
    const motivos = ['solo_comisiones', ...motivosMes];
    if (elegido.sin_comision) motivos.push('filas_sin_comision');
    campos.pagado = { ...vacio('pagado'), valor: elegido.comision, seguro: false, como: 'sumado', origen: [], n_origen: elegido.ops.length - elegido.sin_comision, motivos };
  }
  for (const g of GRUPOS) {
    const d = elegido.grupos[g], k = 'tasa_' + g;
    if (d && d.ventas > 0 && !d.sin_comision && d.comision > 0) {
      campos[k] = { ...vacio(k), valor: Math.round((d.comision / d.ventas) * 100 * 1000) / 1000, seguro: false, como: 'calculado', origen: [], motivos: ['tasa_media'] };
    }
  }
  // cada fila: importe − comisión = neto
  const conNeto = elegido.ops.filter((o) => o.neto !== null && o.comision !== null);
  if (conNeto.length) {
    const malas = conNeto.filter((o) => Math.abs(Math.abs(o.importe) - o.comision - Math.abs(o.neto)) > 0.011);
    comprobaciones.push({ codigo: 'neto_por_fila', estado: malas.length ? 'no_cuadra' : 'cuadra', campos: malas.length ? ['pagado'] : [],
      datos: { n: conNeto.length, malas: malas.length }, origen: malas.slice(0, 10).map((o) => o.origen) });
  }
  if (fuera?.fallidas) avisos.push({ codigo: 'operaciones_fallidas', datos: { n: fuera.fallidas } });
  if (fuera?.otras_divisas) avisos.push({ codigo: 'otras_divisas', datos: { n: fuera.otras_divisas, divisas: [...fuera.divisas].join(', ') } });
  if (fuera?.otros_tipos) avisos.push({ codigo: 'otros_movimientos', datos: { n: fuera.otros_tipos } });
  if (elegido.devoluciones) avisos.push({ codigo: 'hay_devoluciones', datos: { importe: elegido.devoluciones } });
  if (elegido.contracargos) avisos.push({ codigo: 'hay_contracargos', datos: { importe: elegido.contracargos } });
  if (elegido.grupos.particulares && !elegido.grupos.particulares.sabido.uso) avisos.push({ codigo: 'sin_separar_empresa' });

  const ultimo = new Date(Date.UTC(+elegido.mes.slice(0, 4), +elegido.mes.slice(5, 7), 0)).getUTCDate();
  const periodo = { desde: `${elegido.mes}-01`, hasta: `${elegido.mes}-${String(ultimo).padStart(2, '0')}`, mes: elegido.mes,
    primera: elegido.desde, ultima: elegido.hasta, origen: [] };
  if (!enCurso && (diasEntre(periodo.desde, elegido.desde) > 3 || diasEntre(elegido.hasta, periodo.hasta) > 3)) {
    avisos.push({ codigo: 'mes_quiza_incompleto', datos: { primera: elegido.desde, ultima: elegido.hasta } });
  }
  return {
    campos, periodo,
    meses: meses.map((m) => ({ mes: m.mes, ventas: m.ventas, operaciones: m.operaciones, comision: m.comision })),
    detalle: {
      ventas_total: elegido.ventas, operaciones_total: elegido.operaciones, comisiones: elegido.sin_comision === elegido.ops.length ? null : elegido.comision,
      cuota: null, alquiler: null, iva: null, otros_cargos: null, devoluciones: elegido.devoluciones || null, contracargos: elegido.contracargos || null,
      neto: elegido.neto,
      tipos: GRUPOS.filter((g) => elegido.grupos[g]).map((g) => ({ grupo: g, etiqueta: null, ventas: elegido.grupos[g].ventas, operaciones: elegido.grupos[g].operaciones,
        tasa: null, comision: elegido.grupos[g].sin_comision ? null : elegido.grupos[g].comision, origen: elegido.grupos[g].filas[0] })),
    },
  };
}

function sumarFuera(a, b) {
  if (!a) return { ...b, divisas: new Set(b.divisas) };
  for (const k of ['fallidas', 'otras_divisas', 'sin_importe', 'otros_tipos']) a[k] += b[k];
  for (const d of b.divisas) a.divisas.add(d);
  return a;
}

function comprobarFB500(r, comprobaciones) {
  const t = r.totales[r.totales.length - 1];
  const ventas = redondear2(r.operaciones.filter((o) => o.clase === 'venta').reduce((s, o) => s + o.importe, 0));
  const devol = redondear2(r.operaciones.filter((o) => o.clase === 'devolucion').reduce((s, o) => s + o.importe, 0));
  const desc = redondear2(r.operaciones.reduce((s, o) => s + (o.comision ?? 0) * (o.clase === 'devolucion' ? -1 : 1), 0));
  if (t.importe !== null) {
    const ok = [ventas - devol, ventas].some((x) => Math.abs(redondear2(x) - Math.abs(t.importe)) <= 0.011);
    comprobaciones.push({ codigo: 'operaciones_suman_total', estado: ok ? 'cuadra' : 'no_cuadra', campos: GRUPOS.map((g) => 'ventas_' + g).concat(['operaciones']),
      datos: { suma: ventas, total: Math.abs(t.importe) }, origen: [t.origen] });
  }
  if (t.descuento !== null) {
    const ok = [desc, redondear2(r.operaciones.reduce((s, o) => s + (o.comision ?? 0), 0))].some((x) => Math.abs(x - Math.abs(t.descuento)) <= 0.011);
    comprobaciones.push({ codigo: 'comisiones_suman_total', estado: ok ? 'cuadra' : 'no_cuadra', campos: ['pagado'],
      datos: { suma: desc, total: Math.abs(t.descuento) }, origen: [t.origen] });
  }
}

// ───────────── periodo, proveedor y utilidades ─────────────

function comprobarPeriodo(periodo, hoy, avisos, comprobaciones) {
  if (!periodo) { avisos.push({ codigo: 'sin_periodo' }); return; }
  const dias = diasEntre(periodo.desde, periodo.hasta) + 1;
  const ok = periodo.desde.endsWith('-01') && dias >= 28 && dias <= 31 && periodo.desde.slice(0, 7) === periodo.hasta.slice(0, 7);
  comprobaciones.push({ codigo: 'periodo_un_mes', estado: ok ? 'cuadra' : 'no_cuadra', campos: ok ? [] : GRUPOS.map((g) => 'ventas_' + g).concat(['operaciones', 'pagado']),
    datos: { desde: periodo.desde, hasta: periodo.hasta, dias }, origen: periodo.origen });
  if (!ok) avisos.push({ codigo: 'periodo_no_es_un_mes', datos: { desde: periodo.desde, hasta: periodo.hasta, dias } });
  if (periodo.hasta >= hoy) avisos.push({ codigo: 'mes_en_curso', datos: { mes: periodo.mes } });
}

function detectarProveedor(lineas, tablas) {
  const vistos = proveedoresEn(lineas);
  if (!vistos.length) {
    // firmas de columnas de una exportación (HIPÓTESIS salvo Adyen y Stripe)
    for (const t of tablas) {
      const cab = cabeceraDeOperaciones(t.filas);
      const titulos = cab ? cab.titulos.map((x) => x.toUpperCase()) : [];
      if (titulos.some((x) => /^PSP REFERENCE$/.test(x))) return deProveedor('adyen', false, null);
      if (titulos.some((x) => /^(CARD_BRAND|REPORTING_CATEGORY|BALANCE_TRANSACTION_ID)$/.test(x))) return deProveedor('stripe', false, null);
    }
    return null;
  }
  const primero = vistos[0];
  const seguro = vistos.length === 1 || primero.veces >= 2 * (vistos[1]?.veces ?? 0);
  return deProveedor(primero.proveedor.id, seguro && vistos.length === 1, primero.primera.L, vistos.length > 1 ? ['varios_proveedores'] : []);
}

function deProveedor(id, seguro, L, motivos = []) {
  const p = PROVEEDORES.find((x) => x.id === id);
  return { valor: p.id, nombre: p.nombre, calculadora: p.calculadora, seguro, como: 'nombre', origen: L ? origenes([{ linea: L }]) : [], motivos };
}

function origenFB(l) { return { archivo: l.archivo, pagina: null, hoja: null, fila: 1, texto: 'FB 500' }; }

/** Origen de cada hecho: archivo, página u hoja, fila y texto original de la línea (y de su etiqueta si está encima). */
function origenes(hechos) {
  const out = [];
  for (const h of hechos) {
    if (!h) continue;
    const L = h.linea;
    if (!L) continue;
    const o = { archivo: L.archivo, pagina: L.pagina ?? null, hoja: L.hoja ?? null, fila: L.fila, texto: L.texto };
    if (h.linea_etiqueta) o.texto = h.linea_etiqueta.texto + ' / ' + L.texto;
    if (h.trozo) o.cifra = h.trozo.texto;
    if (L.nivel === 'C' && h.trozo) { o.confianza = h.trozo.conf ?? null; if (h.trozo.corregido) o.corregido = true; }
    if (!out.some((x) => x.archivo === o.archivo && x.pagina === o.pagina && x.hoja === o.hoja && x.fila === o.fila && x.cifra === o.cifra)) out.push(o);
    if (out.length >= MAX_ORIGENES) break;
  }
  return out;
}

function vacio(k) {
  return { valor: null, seguro: false, como: null, origen: [], motivos: [], casilla: CAMPOS[k]?.id ?? null, unidad: CAMPOS[k]?.unidad ?? null };
}

function peorNivel(niveles) {
  return niveles.includes('C') ? 'C' : niveles.includes('B') ? 'B' : niveles.length ? 'A' : null;
}

/** Datos de un aviso preparados para su frase: importes con coma y euro, meses con nombre. */
function datosTexto(datos = {}, idioma) {
  const out = { ...datos };
  const loc = idioma === 'en' ? 'en-GB' : idioma === 'ca' ? 'ca-ES' : 'es-ES';
  for (const k of ['importe', 'suma', 'total', 'diferencia', 'ventas', 'comision', 'esperado', 'neto', 'iva', 'base']) {
    if (typeof out[k] === 'number') out[k] = new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR', useGrouping: 'always' }).format(out[k]);
  }
  for (const k of ['tasa', 'pct']) if (typeof out[k] === 'number') out[k] = new Intl.NumberFormat(loc, { maximumFractionDigits: 3 }).format(out[k]) + ' %';
  if (typeof out.mes === 'string' && /^\d{4}-\d{2}$/.test(out.mes)) {
    out.mes = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(out.mes + '-15T12:00:00Z'));
  }
  for (const k of ['desde', 'hasta', 'primera', 'ultima']) if (typeof out[k] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(out[k])) out[k] = out[k].split('-').reverse().join('/');
  return out;
}
