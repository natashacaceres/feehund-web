// Montaje del resultado del lector de extractos. Lo usa worker.js y no toca DOM, red ni almacenamiento,
// así se prueba en Node con lecturas falsas. Las piezas del núcleo y los lectores llegan por parámetro.
//
//   leerEntradas(entradas, deps)               archivos y texto pegado → lecturas (un lector por formato)
//   montarResultado(lecturas, deps)            lecturas → resultado de la API (validar, unir, fechas, detectar, textos)
//   lecturasDesdeResultado(resultado, corr.)   vuelve a las lecturas de un resultado, con las correcciones de la persona
//   generarICS(resultado, opciones)            calendario .ics de los cobros (motor.js lo expone tal cual)
//   atenderPeticion(peticion, deps)            hilo principal (motor.js): OCR o HEIC que pide el worker, siempre con respuesta

import { crearLectura, lecturaConError, aviso } from './nucleo/modelo.js';
import { parseImporte, redondear2, formatoEuros } from './nucleo/numeros.js';
import { parseFecha, sumarDias, diasEntre, aISO, hoyISO } from './nucleo/fechas.js';
import { texto, textosDe } from './textos.js';

export const VERSION_RESULTADO = '1.0.0';
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGENES = 20;
const MAX_NIVELES = 4; // archivos dentro de archivos (ZIP en ZIP, texto pegado que es un CSV…)

/** Lectores que existen (lectores/<nombre>.js). Solo se importan estos nombres. */
export const LECTORES = new Set(['hoja', 'csv', 'norma43', 'ofx', 'qif', 'camt053', 'mt940', 'zip', 'pdf', 'imagen', 'pegado']);

/** Lector de cada formato, si formato.js no lo dice. */
export const LECTOR_DE = {
  xlsx: 'hoja', xlsm: 'hoja', xlsb: 'hoja', xls: 'hoja', ods: 'hoja', numbers: 'hoja', html: 'hoja', html_xls: 'hoja',
  csv: 'csv', tsv: 'csv', txt: 'csv',
  norma43: 'norma43', n43: 'norma43', q43: 'norma43', aeb: 'norma43',
  ofx: 'ofx', qfx: 'ofx', qif: 'qif', camt053: 'camt053', camt: 'camt053', mt940: 'mt940', sta: 'mt940',
  zip: 'zip', pdf: 'pdf', pdf_escaneado: 'pdf',
  imagen: 'imagen', png: 'imagen', jpg: 'imagen', jpeg: 'imagen', webp: 'imagen', heic: 'imagen', heif: 'imagen',
  gif: 'imagen', bmp: 'imagen', avif: 'imagen',
  texto_pegado: 'pegado', pegado: 'pegado',
};

const PESO_NIVEL = { A: 0, B: 1, C: 2 };
const GLOBALES = new Set(['diccionario_no_disponible', 'busqueda_fallida']); // fallos del análisis, no de un archivo
const UNA_VEZ = new Set(['demasiadas_imagenes', 'demasiados_archivos']); // límites: un solo error con cuántos quedan fuera
const PESO_VALIDACION = { verificada: 0, sin_verificar: 1, no_cuadra: 2 };

// ---------------------------------------------------------------------------------------------
// Lectura de las entradas
// ---------------------------------------------------------------------------------------------

/**
 * Lee todas las entradas, una detrás de otra para no llenar la memoria.
 * Suelta los bytes de cada entrada en cuanto la ha leído (pone null en su hueco de la lista).
 * @param {Array<{nombre: string, bytes: Uint8Array|null, tamano?: number, texto?: string, pegado?: boolean, ilegible?: boolean}>} entradas
 * @param {{
 *   opciones: {idioma?: string, hoy: string, contrasenas?: Object, mapeo?: Object},
 *   detectarFormato: (entrada) => any,                       // de lectores/formato.js
 *   importarLector: (nombre: string) => Promise<{leer: Function}>,
 *   cargar?: Function, ocr?: Function,
 *   progreso?: (evento) => void, sinConexion?: () => boolean, alFallar?: (error) => void
 * }} deps
 * @returns {Promise<import('./nucleo/modelo.js').LecturaArchivo[]>}
 */
export async function leerEntradas(entradas, deps) {
  const opciones = deps.opciones ?? {};
  const progreso = deps.progreso ?? (() => {});
  const limiteOcr = { usadas: 0, max: MAX_IMAGENES }; // compartido por todo el análisis
  const nombres = new Set();
  // idArchivo: 0..n-1 para las entradas; los de dentro de un ZIP usan la pista del lector ("3.1") si está libre
  const ids = new Set(entradas.map((_, i) => String(i)));
  let libre = entradas.length;

  const fallo = (e) => {
    deps.alFallar?.(e);
    const c = e && typeof e === 'object' ? e.codigo : null;
    if (typeof c === 'string' && textosDe(c)) return c;
    return deps.sinConexion?.() ? 'necesita_conexion' : 'desconocido_interno';
  };

  // desde: el lector que pide leer este archivo (ZIP o texto pegado); nivel: cuántos lectores hay por encima
  async function leerUna(entrada, idArchivo, desde = null, nivel = 0) {
    const nombre = entrada.nombre;
    if (entrada.demasiados) return [lecturaConError(nombre, null, 'demasiados_archivos')];
    if (entrada.ilegible) return [lecturaConError(nombre, null, 'ilegible')];
    const tamano = entrada.bytes ? entrada.bytes.length : Number(entrada.tamano) || 0;
    if (tamano > MAX_BYTES) return [lecturaConError(nombre, null, 'grande')];
    if (!entrada.bytes || entrada.bytes.length === 0) return [lecturaConError(nombre, null, 'vacio')];

    let det;
    if (entrada.pegado) det = { formato: 'texto_pegado', lector: 'pegado' };
    else {
      try { det = interpretarDeteccion(await deps.detectarFormato(entrada)); } catch (e) { return [lecturaConError(nombre, null, fallo(e))]; }
    }
    if (det.error) return [lecturaConError(nombre, det.formato, typeof det.error === 'string' ? det.error : det.error.codigo ?? 'desconocido')];
    if (['vacio', 'grande', 'desconocido'].includes(det.formato)) return [lecturaConError(nombre, null, det.formato)];
    if (!det.lector) return [lecturaConError(nombre, det.formato, 'desconocido')];
    // pegado.js ya ha dicho que este texto es una tabla: si formato.js lo vuelve a mandar a pegado.js, irían de uno
    // a otro sin fin. Lo lee csv.js, que también sabe leer columnas por posiciones.
    if (det.lector === 'pegado' && desde === 'pegado') det = { ...det, lector: 'csv' };

    progreso({ fase: det.lector === 'imagen' ? 'foto' : 'leyendo', archivo: nombre });
    // El lector recibe la entrada tal cual (con `zip`, si viene de dentro de un ZIP) y lo que ya ha visto formato.js:
    // el texto decodificado (no lo tiene que volver a hacer), el separador (pista para csv.js) y, en fotos, `imagen` y `mime`.
    const paraLector = { ...entrada };
    if (typeof det.texto === 'string' && typeof entrada.texto !== 'string') {
      paraLector.texto = det.texto;
      paraLector.codificacion = det.codificacion ?? entrada.codificacion;
    }
    for (const k of ['separador', 'imagen', 'mime', 'variante']) if (det[k] !== undefined && paraLector[k] === undefined) paraLector[k] = det[k];
    const ctx = {
      idArchivo,
      opciones,
      cargar: deps.cargar,
      ocr: deps.ocr,
      leerArchivo: (e, pista) => leerArchivo(e, pista, det.lector, nivel + 1),
      limiteOcr,
      progreso: (ev) => progreso({ archivo: nombre, ...ev }),
      formato: det, // lo que ha visto formato.js, por si el lector lo quiere
    };
    try {
      const mod = await deps.importarLector(det.lector);
      const lista = comoLista(await mod.leer(paraLector, ctx), nombre, det.formato);
      // Un archivo leído con el lector del texto pegado sigue siendo el archivo de la persona: su formato («txt»)
      // y su nombre (pegado.js lo cambia a «.csv» si se lo pasa a csv.js), para que cada fila diga de dónde sale.
      if (det.lector === 'pegado' && !entrada.pegado) {
        const base = (n) => String(n).replace(/\.[^./]*$/, '');
        for (const l of lista) {
          if (l.formato === 'texto_pegado') l.formato = det.formato ?? 'txt';
          if (l.archivo !== nombre && base(l.archivo) === base(nombre)) renombrar(l, nombre);
        }
      }
      return lista;
    } catch (e) {
      return [lecturaConError(nombre, det.formato, fallo(e))];
    }
  }

  /** Lee un archivo (también los de dentro de un ZIP) con un idArchivo que no se repite en el análisis. */
  async function leerArchivo(entrada, pista, desde, nivel = 1) {
    let id = pista !== undefined && pista !== null && pista !== '' && !ids.has(String(pista)) ? pista : null;
    if (id === null) { while (ids.has(String(libre))) libre++; id = libre; }
    ids.add(String(id));
    const nombre = nombreUnico(entrada.nombre, nombres);
    if (nivel > MAX_NIVELES) return [lecturaConError(nombre, null, 'desconocido')]; // nunca un archivo dentro de otro sin fin
    return leerUna({ ...entrada, nombre }, id, desde, nivel);
  }

  const lecturas = [];
  for (let i = 0; i < entradas.length; i++) {
    const e = entradas[i];
    entradas[i] = null; // suelta los bytes en cuanto se han leído
    if (e) lecturas.push(...(await leerUna({ ...e, nombre: nombreUnico(e.nombre, nombres) }, i)));
  }
  return lecturas;
}

/**
 * Archivos y texto de cualquiera de las formas que acepta motor.analizar(): File o Blob, texto pegado, listas
 * (FileList, arrays, también mezcladas) y {archivos, texto}. Los textos vacíos no cuentan.
 * @returns {{archivos: Blob[], texto: string}}
 */
export function separarEntrada(x, archivos = [], trozos = []) {
  if (typeof x === 'string') trozos.push(x);
  else if (x instanceof Blob) archivos.push(x);
  else if (x && typeof x === 'object') {
    if (!Array.isArray(x) && ('archivos' in x || 'texto' in x)) { separarEntrada(x.archivos, archivos, trozos); separarEntrada(x.texto, archivos, trozos); }
    else if (typeof x[Symbol.iterator] === 'function' || typeof x.length === 'number') for (const y of Array.from(x)) separarEntrada(y, archivos, trozos);
  }
  return { archivos, texto: trozos.filter((t) => t.trim()).join('\n\n') };
}

/** Lo que devuelve formato.js (cadena u objeto) → {formato, lector, error?}. */
export function interpretarDeteccion(d) {
  if (!d) return { formato: null, lector: null };
  if (typeof d === 'string') return { formato: d, lector: LECTOR_DE[d] ?? null };
  const formato = d.formato ?? d.tipo ?? null;
  let lector = typeof d.lector === 'string' ? d.lector.replace(/^.*\//, '').replace(/\.m?js$/, '') : null;
  // un «txt» sin separador tiene las columnas alineadas con espacios: se lee por posiciones, como el texto pegado
  if (!lector || !LECTORES.has(lector)) lector = formato === 'txt' && d.separador === null ? 'pegado' : LECTOR_DE[formato] ?? null;
  return { ...d, formato, lector, error: d.error ?? null };
}

function comoLista(r, nombre, formato) {
  const lista = (Array.isArray(r) ? r : [r]).filter((x) => x && typeof x === 'object');
  if (!lista.length) return [lecturaConError(nombre, formato ?? null, 'desconocido_interno')];
  return lista.map((l) => ({
    ...l,
    archivo: l.archivo || nombre,
    nivel: l.nivel || 'A',
    movimientos: Array.isArray(l.movimientos) ? l.movimientos : [],
    avisos: Array.isArray(l.avisos) ? l.avisos : [],
  }));
}

/** "extracto.csv" repetido → "extracto (2).csv", para que cada movimiento diga de qué archivo sale. */
export function nombreUnico(nombre, usados) {
  let n = String(nombre || 'archivo');
  if (usados.has(n)) {
    const punto = n.lastIndexOf('.');
    const [base, ext] = punto > 0 && n.length - punto <= 8 ? [n.slice(0, punto), n.slice(punto)] : [n, ''];
    let k = 2;
    while (usados.has(`${base} (${k})${ext}`)) k++;
    n = `${base} (${k})${ext}`;
  }
  usados.add(n);
  return n;
}

// ---------------------------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------------------------

/**
 * Junta las lecturas en el resultado que pinta la interfaz (ver DESARROLLO.md, «Resultado de la API»).
 * @param {import('./nucleo/modelo.js').LecturaArchivo[]} lecturas
 * @param {{
 *   opciones: {idioma?: string, hoy: string},
 *   diccionario: Object|null,                         // data/comercios.json; null si no se ha podido cargar
 *   nucleo: {unir, validarSaldos, analizarFechas, detectar, combinarValidaciones?, saldosNoFiables?, avisoValidacion?},
 *   confirmado?: boolean,                            // la persona ya ha revisado la tabla leída de fotos
 *   previos?: {errores?, necesita_mapeo?, necesita_contrasena?},   // se conservan al confirmar
 *   progreso?: (evento) => void
 * }} deps
 */
export async function montarResultado(lecturas, deps) {
  const { nucleo } = deps;
  const opciones = deps.opciones ?? {};
  const idioma = ['es', 'ca', 'en'].includes(opciones.idioma) ? opciones.idioma : 'es';
  const hoy = opciones.hoy;
  const progreso = deps.progreso ?? (() => {});
  const conTexto = (a, archivo) => conTextoAviso(a, archivo, idioma);

  // 1. Qué se ha leído y qué falta. Al confirmar se conserva lo de los archivos que no se leyeron (en el idioma
  //    de ahora); los fallos del análisis en sí (diccionario, búsqueda) se vuelven a calcular.
  const previos = deps.previos ?? {};
  const errores = (previos.errores ?? []).filter((e) => e && !GLOBALES.has(e.codigo))
    .map((e) => ({ ...e, texto: textoSeguro(e.codigo, idioma, { ...(e.datos ?? {}), archivo: e.archivo }) }));
  const necesitaContrasena = (previos.necesita_contrasena ?? []).map((n) => ({ ...n, texto: texto(n.motivo === 'incorrecta' ? 'contrasena_mal' : 'pide_contrasena', idioma, { archivo: n.archivo }) }));
  let necesitaMapeo = previos.necesita_mapeo ? { ...previos.necesita_mapeo, texto: texto('pide_columnas', idioma, { archivo: previos.necesita_mapeo.archivo }) } : null;
  const pendientes = [...(necesitaMapeo?.pendientes ?? [])]; // archivos que también piden columnas: después del primero
  const sueltos = []; // avisos de los archivos que no se han podido usar (p. ej. las líneas que se han saltado)
  const leidas = [];
  // los límites (20 fotos, 100 archivos) se dicen una sola vez, con cuántos se han quedado sin leer
  const limites = new Map(errores.filter((e) => UNA_VEZ.has(e.codigo)).map((e) => [e.codigo, e]));
  for (const l of lecturas) {
    if (!l) continue;
    const archivo = l.archivo ?? null;
    if (l.error) {
      const codigo = l.error.codigo || 'desconocido_interno';
      const visto = UNA_VEZ.has(codigo) ? limites.get(codigo) : null;
      if (visto) {
        visto.datos = { ...visto.datos, n: (visto.datos?.n ?? 1) + 1 };
        visto.texto = textoSeguro(codigo, idioma, { archivo: visto.archivo, ...visto.datos });
        continue;
      }
      const datos = UNA_VEZ.has(codigo) ? { ...(l.error.datos ?? {}), n: 1 } : l.error.datos ?? null;
      const error = { archivo, codigo, texto: textoSeguro(codigo, idioma, { archivo, ...(datos ?? {}) }), ...(datos ? { datos } : {}) };
      if (UNA_VEZ.has(codigo)) limites.set(codigo, error);
      errores.push(error);
      for (const a of l.avisos ?? []) sueltos.push(conTexto(a, archivo)); // p. ej. las líneas saltadas de un archivo sin movimientos
    } else if (l.necesita_contrasena) {
      const motivo = l.necesita_contrasena.motivo === 'incorrecta' ? 'incorrecta' : 'requerida';
      necesitaContrasena.push({ archivo, motivo, texto: texto(motivo === 'incorrecta' ? 'contrasena_mal' : 'pide_contrasena', idioma, { archivo }) });
    } else if (l.necesita_mapeo && !l.movimientos?.length) {
      if (!necesitaMapeo) necesitaMapeo = { archivo, ...l.necesita_mapeo, texto: texto('pide_columnas', idioma, { archivo }) };
      else if (archivo !== necesitaMapeo.archivo && !pendientes.includes(archivo)) pendientes.push(archivo);
    } else if (!l.movimientos?.length) {
      // leído sin error pero sin ningún movimiento: se dice, y sus avisos no se pierden
      errores.push({ archivo, codigo: 'sin_movimientos', texto: texto('sin_movimientos', idioma, { archivo }) });
      for (const a of l.avisos ?? []) sueltos.push(conTexto(a, archivo));
    } else {
      leidas.push(l);
    }
  }
  if (necesitaMapeo) necesitaMapeo.pendientes = pendientes;
  asegurarNombresDistintos(leidas);

  // 2. Saldos de cada archivo y unión (los repetidos entre archivos se quitan)
  progreso({ fase: 'saldo' });
  const validaciones = [];
  for (const l of leidas) validaciones.push(await nucleo.validarSaldos(l));
  const noFiables = nucleo.saldosNoFiables ? nucleo.saldosNoFiables(validaciones) : new Set();
  const union = leidas.length
    ? await nucleo.unir(leidas, { saldosNoFiables: noFiables })
    : { movimientos: [], duplicados_quitados: 0, por_divisa: {}, otras_monedas: [], duplicados: [], archivos: [], avisos: [] };
  const movimientos = union.movimientos ?? [];
  const eur = union.por_divisa?.EUR ?? movimientos.filter((m) => m.divisa === 'EUR');

  const nivel = peor(leidas.map((l) => l.nivel), PESO_NIVEL);
  const combinada = nucleo.combinarValidaciones
    ? nucleo.combinarValidaciones(validaciones, { movimientos, nivel })
    : combinarSimple(validaciones);
  const validacion = leidas.length ? combinada.validacion : 'sin_verificar';

  // 3. Periodo (el que declare el extracto amplía el de los movimientos)
  const declarado = periodoDeclarado(leidas);
  const fechas = leidas.length
    ? await nucleo.analizarFechas(eur.length ? eur : movimientos, { hoy, ...declarado })
    : { periodo: { desde: null, hasta: null, dias: 0, meses: 0 }, huecos: [], avisos: [] };

  // 4. Cobros que se repiten (solo cargos en euros). Sin nada leído no hay total: null, nunca un 0 que parezca
  //    «no tienes cobros». Lo mismo si falta la lista de comercios o falla la búsqueda.
  progreso({ fase: 'cobros' });
  let det = { cobros: [], gastos_fijos: [], terminados: [], no_contados: [], total_seguro: null, total_posible: null, avisos: [] };
  const sinEuros = leidas.length > 0 && !eur.length; // solo otras monedas: el total (solo euros) es 0 y se dice por qué
  if (leidas.length && !deps.diccionario) {
    errores.push({ archivo: null, codigo: 'diccionario_no_disponible', texto: texto('diccionario_no_disponible', idioma) });
  } else if (leidas.length) {
    try {
      const p = fechas.periodo ?? {};
      det = await nucleo.detectar(eur, { diccionario: deps.diccionario, desde: p.desde, hasta: p.hasta, meses: p.meses, nivel, validacion, hoy });
    } catch (e) {
      deps.alFallar?.(e);
      det = { ...det, total_seguro: null, total_posible: null };
      errores.push({ archivo: null, codigo: 'busqueda_fallida', texto: texto('busqueda_fallida', idioma) });
    }
  }

  // 5. Avisos, de lo general a lo concreto, sin repetir
  const avisos = [];
  if (leidas.length && combinada.aviso) avisos.push(conTexto(combinada.aviso, leidas.length === 1 ? leidas[0].archivo : null));
  leidas.forEach((l, i) => {
    for (const a of validaciones[i]?.avisos ?? []) avisos.push(conTexto(a, l.archivo));
    for (const a of l.avisos ?? []) avisos.push(conTexto(a, l.archivo));
  });
  const fotos = leidas.filter((l) => l.nivel === 'C');
  if (!deps.confirmado) {
    for (const l of fotos) avisos.push(conTexto(aviso('revisa_tabla'), l.archivo));
    const dudosos = fotos.reduce((s, l) => s + l.movimientos.filter((m) => m.dudoso).length, 0);
    if (dudosos) avisos.push(conTexto(aviso(dudosos === 1 ? 'revisa_dudoso' : 'revisa_dudosos', { n: dudosos }), null));
  }
  for (const a of union.avisos ?? []) avisos.push(conTexto(a, null));
  for (const a of fechas.avisos ?? []) avisos.push(conTexto(a, null));
  for (const a of det.avisos ?? []) avisos.push(conTexto(a, null));
  if (sinEuros) avisos.push(conTexto(aviso('sin_euros'), null));
  avisos.push(...sueltos);
  for (const archivo of pendientes) avisos.push(conTexto(aviso('columnas_despues'), archivo));

  // 6. Resumen por archivo (también sirve para volver a validar al confirmar)
  const porArchivoUnion = new Map((union.archivos ?? []).map((a) => [a.archivo, a]));
  const archivos = leidas.map((l, i) => {
    const v = validaciones[i] ?? {};
    const propios = [];
    if (v.aviso) propios.push({ ...conTexto(v.aviso, l.archivo), fuente: 'validacion' });
    for (const a of l.avisos ?? []) propios.push({ ...conTexto(a, l.archivo), fuente: 'lector' });
    return {
      nombre: l.archivo,
      formato: l.formato ?? null,
      perfil: l.perfil ?? null,
      nivel: l.nivel,
      movimientos: l.movimientos.length,
      duplicados: porArchivoUnion.get(l.archivo)?.duplicados ?? 0,
      validacion: v.validacion ?? 'sin_verificar',
      metodo: v.metodo ?? null,
      orden: v.orden ?? null,
      filas_que_no_cuadran: v.filas_que_no_cuadran?.length ?? 0,
      saldo_inicial: l.saldo_inicial ?? null,
      saldo_final: l.saldo_final ?? null,
      fecha_inicial: l.fecha_inicial ?? null,
      fecha_final: l.fecha_final ?? null,
      avisos: propios,
      extra: l.extra ?? {},
    };
  });

  const p = fechas.periodo ?? {};
  return {
    version: VERSION_RESULTADO,
    idioma,
    hoy,
    lectura: {
      formato: formatoGlobal(leidas),
      nivel,
      archivos,
      movimientos,
      repetidos: repetidosDe(leidas, union.duplicados),
      validacion,
      filas_que_no_cuadran: combinada.filas_que_no_cuadran ?? [],
      periodo: { desde: p.desde ?? null, hasta: p.hasta ?? null, meses: p.meses ?? 0, dias: p.dias ?? 0, corto: p.corto ?? false },
      duplicados_quitados: union.duplicados_quitados ?? 0,
      otras_monedas: union.otras_monedas ?? [],
      huecos: fechas.huecos ?? [],
      fuera_de_rango: fechas.fuera_de_rango ?? null,
      avisos: sinRepetir(avisos),
    },
    cobros: ordenarPorCoste(enSuIdioma(det.cobros, idioma)),
    gastos_fijos: enSuIdioma(det.gastos_fijos, idioma),
    terminados: enSuIdioma(det.terminados, idioma),
    no_contados: noContados(det.no_contados, idioma),
    total_seguro: aImporte(det.total_seguro),
    total_posible: aImporte(det.total_posible),
    necesita_mapeo: necesitaMapeo,
    necesita_contrasena: necesitaContrasena.length ? necesitaContrasena : null,
    necesita_confirmacion: fotos.length > 0 && !deps.confirmado,
    errores,
  };
}

/** Comisiones, gastos fijos y pasarelas tienen su nombre en los tres idiomas (nombre_codigo): se pone el del idioma pedido. */
function enSuIdioma(cobros, idioma) {
  return (Array.isArray(cobros) ? cobros : []).map((c) => (c && c.nombre_codigo && textosDe(c.nombre_codigo) ? { ...c, nombre: texto(c.nombre_codigo, idioma) } : c));
}

/** Lo que no se ha contado (supermercado, Bizum, cajero…) con su código y su frase en el idioma pedido. */
function noContados(lista, idioma) {
  return (Array.isArray(lista) ? lista : []).filter((x) => x && x.motivo).map((x) => {
    const codigo = 'no_contado_' + x.motivo;
    return { ...x, codigo, texto: texto(textosDe(codigo) ? codigo : 'otros_sin_contar', idioma) };
  });
}

/** Texto de un código que existe; si no existe, la frase genérica (nunca un texto que no toca). */
function textoSeguro(codigo, idioma, datos) {
  if (textosDe(codigo)) return texto(codigo, idioma, datos);
  return texto(datos?.archivo ? 'aviso_generico' : 'aviso_generico_sin_archivo', idioma, datos);
}

function conTextoAviso(a, archivo, idioma) {
  const datos = { ...(a.datos ?? {}) };
  if (archivo && datos.archivo === undefined) datos.archivo = archivo;
  const fuera = { codigo: a.codigo, texto: textoSeguro(a.codigo, idioma, datos) };
  if (Object.keys(datos).length) fuera.datos = datos;
  if (archivo) fuera.archivo = archivo;
  return fuera;
}

function sinRepetir(avisos) {
  const vistos = new Set();
  return avisos.filter((a) => {
    const k = `${a.archivo ?? ''}\u0001${a.texto}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

function peor(valores, pesos) {
  let r = null;
  for (const v of valores) if (v in pesos && (r === null || pesos[v] > pesos[r])) r = v;
  return r;
}

function combinarSimple(validaciones) {
  const validacion = peor(validaciones.map((v) => v?.validacion), PESO_VALIDACION) ?? 'sin_verificar';
  return { validacion, filas_que_no_cuadran: validaciones.flatMap((v) => v?.filas_que_no_cuadran ?? []), aviso: null };
}

function formatoGlobal(leidas) {
  const f = new Set(leidas.map((l) => l.formato).filter(Boolean));
  return f.size === 0 ? null : f.size === 1 ? [...f][0] : 'varios';
}

/** Periodo que declaran los extractos. Si hay euros, solo cuentan los extractos con euros: el de una cuenta en dólares
 *  no estira el periodo de los euros (si no, un Netflix pagado hasta junio parecería terminado). */
function periodoDeclarado(leidas) {
  const r = {};
  const conEuros = leidas.filter((l) => l.movimientos.some((m) => m.divisa === 'EUR'));
  for (const l of conEuros.length ? conEuros : leidas) {
    if (typeof l.fecha_inicial === 'string' && (!r.desde || l.fecha_inicial < r.desde)) r.desde = l.fecha_inicial;
    if (typeof l.fecha_final === 'string' && (!r.hasta || l.fecha_final > r.hasta)) r.hasta = l.fecha_final;
    // periodo de cada extracto: un hueco dentro de un periodo declarado no es un hueco de verdad
    if (typeof l.fecha_inicial === 'string' && typeof l.fecha_final === 'string') (r.cubiertos ??= []).push({ desde: l.fecha_inicial, hasta: l.fecha_final });
  }
  return r;
}

function repetidosDe(leidas, duplicados) {
  if (!duplicados?.length) return [];
  const porId = new Map();
  for (const l of leidas) for (const m of l.movimientos) porId.set(m.id, m);
  const fuera = [];
  for (const d of duplicados) {
    const m = porId.get(d.id);
    if (m) fuera.push({ ...m, igual_a: d.igual_a ?? null, regla: d.regla ?? null });
  }
  return fuera;
}

function ordenarPorCoste(cobros) {
  const coste = (c) => (typeof c?.coste_anual === 'number' && Number.isFinite(c.coste_anual) ? c.coste_anual : -Infinity);
  return cobros.sort((a, b) => coste(b) - coste(a));
}

function aImporte(n) {
  return typeof n === 'number' && Number.isFinite(n) ? redondear2(n) : null;
}

/**
 * Dos lecturas con el mismo nombre (dos hojas de un libro, o dos archivos que se llaman igual) se separan
 * cambiando el nombre de la segunda y el de sus movimientos: así cada fila sigue diciendo de dónde sale.
 */
function asegurarNombresDistintos(leidas) {
  const usados = new Set();
  for (const l of leidas) {
    const original = l.archivo ?? 'archivo';
    if (!usados.has(original)) { usados.add(original); continue; }
    const hojas = new Set(l.movimientos.map((m) => m.origen?.hoja).filter(Boolean));
    const preferido = hojas.size === 1 ? `${original} · ${[...hojas][0]}` : original;
    renombrar(l, nombreUnico(preferido, usados));
  }
}

/** Cambia el nombre de una lectura y el del origen de cada uno de sus movimientos. */
function renombrar(l, nuevo) {
  l.archivo = nuevo;
  l.movimientos = (l.movimientos ?? []).map((m) => ({ ...m, origen: { ...m.origen, archivo: nuevo } }));
  if (l.error?.datos?.archivo) l.error = { ...l.error, datos: { ...l.error.datos, archivo: nuevo } };
}

// ---------------------------------------------------------------------------------------------
// Confirmar la tabla leída de fotos
// ---------------------------------------------------------------------------------------------

/**
 * Lecturas de un resultado anterior con las correcciones aplicadas, para volver a validar y detectar sin releer archivos.
 * Los movimientos repetidos entre archivos vuelven a su archivo (para comprobar su saldo) y unir() los vuelve a quitar.
 * En los archivos leídos de fotos se quita la marca de dudoso (y el aviso de filas dudosas): la persona ya ha revisado la tabla.
 * @param {Object} resultado lo que devolvió analizar() (o confirmar())
 * @param {Object|Array|Map} correcciones {[id]: {importe?, fecha?, concepto?, eliminar?}} o [{id, importe?, fecha?, concepto?, quitar?}]
 */
export function lecturasDesdeResultado(resultado, correcciones) {
  const L = resultado?.lectura ?? {};
  const cambios = normalizarCorrecciones(correcciones);
  const nivelDe = new Map((L.archivos ?? []).map((a) => [a.nombre, a.nivel]));
  const porArchivo = new Map();
  const noEntendidos = new Map(); // archivo → avisos de cambios que no se han podido aplicar
  for (const original of [...(L.movimientos ?? []), ...(L.repetidos ?? [])]) {
    if (!original) continue;
    const { igual_a, regla, ...m } = original; // eslint-disable-line no-unused-vars
    m.origen = { ...(m.origen ?? {}) };
    // Lo que se cambia o se quita en una fila vale también para su copia de otro archivo (la que unir() quitó):
    // si no, la fila quitada volvería desde la otra captura y la corregida dejaría una copia con lo que se leyó mal.
    const propio = cambios.get(String(m.id));
    const c = propio ?? (igual_a?.id !== undefined ? cambios.get(String(igual_a.id)) : undefined);
    if (c?.eliminar) continue;
    if (c && !aplicarCorreccion(m, c) && propio) {
      const k = m.origen.archivo ?? '';
      if (!noEntendidos.has(k)) noEntendidos.set(k, []);
      noEntendidos.get(k).push(aviso('correccion_no_valida', { fila: m.origen.fila ?? null, ...(m.origen.pagina ? { pagina: m.origen.pagina } : {}) }));
    }
    if (nivelDe.get(m.origen.archivo) === 'C') delete m.dudoso;
    const k = m.origen.archivo ?? '';
    if (!porArchivo.has(k)) porArchivo.set(k, []);
    porArchivo.get(k).push(m);
  }
  return (L.archivos ?? []).map((a) => crearLectura({
    archivo: a.nombre,
    formato: a.formato,
    perfil: a.perfil,
    nivel: a.nivel,
    movimientos: ordenarComoElArchivo(porArchivo.get(a.nombre) ?? []),
    saldo_inicial: a.saldo_inicial,
    saldo_final: a.saldo_final,
    fecha_inicial: a.fecha_inicial,
    fecha_final: a.fecha_final,
    // del lector vuelven sus avisos, menos los de filas dudosas de una foto (la persona ya las ha revisado) y los de
    // cambios que no se entendieron la vez anterior (solo valen para esa vez)
    avisos: [
      ...(a.avisos ?? []).filter((x) => x.fuente === 'lector' && x.codigo !== 'correccion_no_valida' && !(a.nivel === 'C' && /dudos/.test(x.codigo))).map((x) => {
        const { archivo, ...datos } = x.datos ?? {}; // eslint-disable-line no-unused-vars
        return aviso(x.codigo, Object.keys(datos).length ? datos : undefined);
      }),
      ...(noEntendidos.get(a.nombre) ?? []),
    ],
    extra: a.extra,
  }));
}

/** Correcciones en cualquiera de las dos formas → Map id → {importe?, fecha?, concepto?, eliminar?}. */
export function normalizarCorrecciones(c) {
  const fuera = new Map();
  if (!c) return fuera;
  const pares = c instanceof Map ? [...c.entries()]
    : Array.isArray(c) ? c.filter((x) => x && x.id !== undefined).map((x) => [x.id, x])
    : Object.entries(c);
  for (const [id, x] of pares) {
    if (!x || typeof x !== 'object') continue;
    const k = String(id);
    const c = fuera.get(k) ?? { eliminar: false };
    for (const campo of ['importe', 'fecha', 'concepto']) if (x[campo] !== undefined) c[campo] = x[campo];
    c.eliminar = Boolean(c.eliminar || x.eliminar || x.quitar);
    fuera.set(k, c);
  }
  return fuera;
}

/**
 * Aplica una corrección a un movimiento. Lo que no se entiende (un importe con letras, una fecha que no existe,
 * un concepto vacío) no se aplica: el movimiento se queda como estaba y devuelve false para avisar.
 * Una fecha sin año («15/01») toma el año del movimiento.
 */
function aplicarCorreccion(m, c) {
  const antes = {};
  let bien = true;
  if (c.importe !== undefined && c.importe !== null && c.importe !== '') {
    const v = typeof c.importe === 'number' ? c.importe : parseImporte(String(c.importe));
    if (typeof v !== 'number' || !Number.isFinite(v)) bien = false;
    else if (redondear2(v) !== m.importe) { antes.importe = m.importe; m.importe = redondear2(v) || 0; }
  }
  if (c.fecha !== undefined && c.fecha !== null && c.fecha !== '') {
    const anio = Number(String(m.fecha ?? '').slice(0, 4));
    const f = parseFecha(String(c.fecha), Number.isInteger(anio) && anio > 0 ? { anio } : {});
    if (!f) bien = false;
    else if (f !== m.fecha) { antes.fecha = m.fecha; m.fecha = f; }
  }
  if (c.concepto !== undefined && c.concepto !== null) {
    const t = typeof c.concepto === 'string' ? c.concepto.replace(/\s+/g, ' ').trim() : '';
    if (!t) bien = false;
    else if (t !== m.concepto) { antes.concepto = m.concepto; m.concepto = t; }
  }
  if (Object.keys(antes).length) {
    m.corregido = true;
    m.original = { ...antes, ...(m.original ?? {}) }; // si ya se corrigió antes, se guarda lo que leímos la primera vez
  }
  return bien;
}

/** Orden en que venían en el archivo: el número del id ("3-17" → 17); si no, página y fila. */
function ordenarComoElArchivo(movs) {
  const n = (m) => {
    const x = Number(String(m.id ?? '').split('-').pop());
    return Number.isFinite(x) ? x : Infinity;
  };
  return movs.sort((a, b) => n(a) - n(b) || (a.origen?.pagina ?? 0) - (b.origen?.pagina ?? 0) || (a.origen?.fila ?? 0) - (b.origen?.fila ?? 0));
}

// ---------------------------------------------------------------------------------------------
// Calendario .ics
// ---------------------------------------------------------------------------------------------

const REGLAS = {
  semanal: { regla: 'FREQ=WEEKLY', dias: 7 },
  mensual: { regla: 'FREQ=MONTHLY', meses: 1 },
  bimestral: { regla: 'FREQ=MONTHLY;INTERVAL=2', meses: 2 },
  trimestral: { regla: 'FREQ=MONTHLY;INTERVAL=3', meses: 3 },
  semestral: { regla: 'FREQ=MONTHLY;INTERVAL=6', meses: 6 },
  anual: { regla: 'FREQ=YEARLY', meses: 12 },
};

/**
 * Calendario con un evento por cobro seguro o posible (ni desmarcado ni terminado): día completo en la fecha
 * del próximo cargo, repetido con su periodicidad y con aviso 3 días antes (20 en los anuales).
 * Solo lleva el nombre del servicio y el importe: ni banco, ni concepto, ni cuentas.
 * @param {Object} resultado de analizar(), confirmar() o recalcular()
 * @param {{idioma?: string, hoy?: string, desmarcados?: Iterable<string>, ahora?: Date}} [opciones]
 * @returns {string|null} texto .ics (líneas CRLF de 75 octetos como mucho), o null si no hay ningún cobro que poner
 */
export function generarICS(resultado, opciones = {}) {
  const idioma = ['es', 'ca', 'en'].includes(opciones.idioma) ? opciones.idioma : ['es', 'ca', 'en'].includes(resultado?.idioma) ? resultado.idioma : 'es';
  const hoy = esFechaISO(opciones.hoy) ? opciones.hoy : hoyISO();
  const fuera = new Set([...(opciones.desmarcados ?? [])].map(String));
  const sello = (opciones.ahora instanceof Date ? opciones.ahora : new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  // Sin METHOD: es un calendario para importar (RFC 5545), no una invitación (RFC 5546 pediría un organizador con correo)
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Feehund//Extracto//ES', 'CALSCALE:GREGORIAN'];
  const semilla = semillaUID(resultado);
  const uids = new Set();
  let eventos = 0;
  for (const c of Array.isArray(resultado?.cobros) ? resultado.cobros : []) {
    if (!c || fuera.has(String(c.id)) || c.desmarcado === true || c.incluido === false) continue;
    if (c.estado !== 'seguro' && c.estado !== 'posible') continue;
    const r = REGLAS[c.periodicidad], importe = Number(c.importe);
    const nombre = String((c.nombre_codigo && textosDe(c.nombre_codigo) ? texto(c.nombre_codigo, idioma) : c.nombre) ?? '')
      .replace(/[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim(); // un nombre de solo controles no vale
    const f = r && importe > 0 && nombre ? proximaFecha(c, r, hoy) : null;
    if (!f) continue;
    const cifra = formatoEuros(importe, idioma).replace(/[\u00a0\u202f]/g, ' ');
    const resumen = escaparICS(`${nombre} · ${c.importe_tipo === 'variable' ? '≈ ' : ''}${cifra}`);
    // UID estable: el mismo análisis (o su copia de recalcular) da los mismos, así importar dos veces no duplica
    let id = huella128(`${semilla}|${c.id}|${c.periodicidad}`);
    for (let k = 2; uids.has(id); k++) id = huella128(`${semilla}|${c.id}|${c.periodicidad}|${k}`);
    uids.add(id);
    lineas.push('BEGIN:VEVENT', `UID:${id}@feehund.com`, `DTSTAMP:${sello}`,
      `DTSTART;VALUE=DATE:${f.inicio.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${sumarDias(f.inicio, 1).replace(/-/g, '')}`,
      `RRULE:${f.regla}`, `SUMMARY:${resumen}`, 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${resumen}`, `TRIGGER:${c.periodicidad === 'anual' ? '-P20D' : '-P3D'}`, 'END:VALARM',
      'END:VEVENT');
    eventos++;
  }
  if (!eventos) return null;
  lineas.push('END:VCALENDAR');
  return lineas.map(plegarICS).join('\r\n') + '\r\n';
}

/** Primera fecha de cargo desde hoy y su regla. Los cobros de los días 29 a 31 caen el último día de los meses cortos. */
function proximaFecha(c, r, hoy) {
  const ultimo = esFechaISO(c.ultimo_cargo) ? c.ultimo_cargo : null;
  let base = esFechaISO(c.proximo_cargo) ? c.proximo_cargo : null;
  if (!base && ultimo) base = r.dias ? sumarDias(ultimo, r.dias) : delMes(+ultimo.slice(0, 4), +ultimo.slice(5, 7) + r.meses, +ultimo.slice(8));
  if (!base) return null;
  if (r.dias) {
    if (base < hoy) base = sumarDias(base, Math.ceil(diasEntre(base, hoy) / r.dias) * r.dias);
    return { inicio: base, regla: r.regla };
  }
  const dia = +(ultimo ?? base).slice(8), anio = +base.slice(0, 4), mes = +base.slice(5, 7);
  let inicio = delMes(anio, mes, dia);
  for (let k = 1; inicio < hoy && k < 5000; k++) inicio = delMes(anio, mes + k * r.meses, dia);
  let regla = r.regla;
  if (r.meses < 12 && dia >= 29) regla += `;BYMONTHDAY=${[28, 29, 30, 31].filter((d) => d <= dia).join(',')};BYSETPOS=-1`;
  if (r.meses === 12 && mes === 2 && dia === 29) regla += ';BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1';
  return { inicio, regla };
}

/** Día «dia» del mes (el mes puede pasar de 12) o el último de ese mes si es más corto. */
function delMes(anio, mes, dia) {
  const t = anio * 12 + mes - 1, a = Math.floor(t / 12), m = (t % 12) + 1;
  return aISO(a, m, Math.min(dia, new Date(Date.UTC(a, m, 0)).getUTCDate()));
}

/**
 * Texto de una propiedad .ics (RFC 5545 §3.3.11): barra, punto y coma, coma y saltos de línea, escapados.
 * Los caracteres de control no caben en un texto: se quitan (el tabulador pasa a espacio).
 */
export function escaparICS(t) {
  return String(t).replace(/\r\n|\r/g, '\n').replace(/\t/g, ' ').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** RFC 5545: líneas de 75 octetos como mucho; las siguientes empiezan por un espacio. No parte letras UTF-8. */
export function plegarICS(linea) {
  let fuera = '', trozo = '', octetos = 0, limite = 75;
  for (const ch of linea) {
    const cp = ch.codePointAt(0);
    const n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (octetos + n > limite) { fuera += trozo + '\r\n '; trozo = ''; octetos = 0; limite = 74; }
    trozo += ch;
    octetos += n;
  }
  return fuera + trozo;
}

/**
 * Semilla de los UID: una huella de las fechas, importes y saldos de todos los movimientos. Así el mismo extracto da
 * siempre los mismos UID y dos personas no comparten ninguno. No deja ver nada: son 128 bits de cientos de movimientos.
 */
function semillaUID(resultado) {
  const movs = resultado?.lectura?.movimientos;
  const partes = Array.isArray(movs) && movs.length
    ? movs.map((m) => `${m?.fecha}|${m?.importe}|${m?.saldo}`)
    : (Array.isArray(resultado?.cobros) ? resultado.cobros : []).map((c) => `${c?.id}|${c?.ultimo_cargo}|${c?.importe}`);
  return huella128(partes.join('\n'));
}

/** Huella de 128 bits (cyrb128) en 32 cifras hexadecimales. No es criptográfica: solo hace falta que no se repita. */
export function huella128(texto) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < texto.length; i++) {
    const k = texto.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('');
}

function esFechaISO(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// ---------------------------------------------------------------------------------------------
// Hilo principal: respuesta a las peticiones de OCR y HEIC del worker (la usa motor.js)
// ---------------------------------------------------------------------------------------------

export const ESPERA_PETICION = { ocr: 240000, heic: 150000 }; // ms; la primera foto baja unos 6 MB de OCR

/**
 * Hace el OCR o abre el HEIC que pide el worker y da la respuesta del protocolo. Nunca se queda sin contestar: si el
 * trabajo no acaba a tiempo, responde con un fallo y cierra lo atascado; si la tarea ya no existe, no empieza nada.
 * @param {{tipo: 'ocr'|'heic', imagen?: Blob, info?: Object, bytes?: Uint8Array}} m  la petición
 * @param {{fotos: Object, abrirWorker: Function, cerrarOcr: (todo?: boolean) => void, cancelada: () => boolean,
 *          ultimo?: () => Object|null, alProgreso?: (ev: Object) => void, idioma?: string, sinRed?: () => boolean}} d
 *   fotos: la parte del hilo principal de lectores/imagen.js (reconocer); ultimo: el último progreso del worker
 * @returns {Promise<[Object, Transferable[]]>} [respuesta sin «peticion», lo que se transfiere]
 */
export async function atenderPeticion(m, d) {
  const ocr = m?.tipo === 'ocr', codigo = ocr ? 'ocr_no_disponible' : 'heic_ilegible';
  let reloj;
  try {
    if (d.cancelada()) throw conCodigo('cancelado');
    const limite = new Promise((_, mal) => { reloj = setTimeout(() => mal(conCodigo(codigo, true)), ESPERA_PETICION[ocr ? 'ocr' : 'heic']); });
    const trabajo = ocr
      ? d.fotos.reconocer(m.imagen, m.info || {}, (p) => { if (!d.cancelada()) d.alProgreso?.(progresoOcr(p, d.ultimo?.(), d.idioma)); })
        .then((r) => [{ tipo: 'ocr_hecho', palabras: r?.palabras ?? [], ancho: r?.ancho, alto: r?.alto, confianza: r?.confianza ?? null }, []])
      : Promise.reject(conCodigo('heic_no_compatible')); // ya no hay decodificador de HEIC propio
    const r = await Promise.race([trabajo, limite]);
    if (d.cancelada()) d.cerrarOcr(); // olvidar() mientras leía: no queda nada abierto
    return r;
  } catch (err) {
    if (err?.tarde) d.cerrarOcr(true); // lo atascado se cierra; la siguiente foto abre otro
    const c = typeof err?.codigo === 'string' && textosDe(err.codigo) ? err.codigo : d.sinRed?.() ? 'necesita_conexion' : codigo;
    return [{ tipo: 'fallo_peticion', codigo: c }, []];
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Progreso del OCR: «Preparando el lector de fotos» o, al leer, la frase que mandó el worker («Leyendo la página 3
 * de 20» en un PDF escaneado, «Leyendo la foto» en una captura) con cuánto va (progreso, de 0 a 1).
 */
export function progresoOcr(p, antes, idioma) {
  const prep = p?.status !== 'recognizing text', a = antes || {};
  const frase = prep ? texto('progreso_preparando_fotos', idioma) : (a.fase === 'foto' && a.texto) || texto('progreso_foto', idioma);
  return { ...a, fase: prep ? 'preparando_fotos' : 'foto', progreso: prep ? undefined : p.progress, texto: frase };
}

function conCodigo(codigo, tarde = false) {
  return Object.assign(new Error(codigo), { codigo, tarde });
}
