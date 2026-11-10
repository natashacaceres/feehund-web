// Modelo de datos común del motor. Todas las piezas crean sus objetos con estas funciones.
// Lógica pura: sin DOM, sin red, sin almacenamiento. Se puede importar en Node para las pruebas.

import { redondear2 } from './numeros.js';

export const NIVELES = ['A', 'B', 'C']; // A estructurado, B PDF con texto, C imagen/OCR
export const VALIDACIONES = ['verificada', 'no_cuadra', 'sin_verificar'];
export const ESTADOS = ['seguro', 'posible', 'terminado'];
export const ETIQUETAS = ['subio', 'bajo', 'evitable', 'doble', 'nuevo', 'reclamable', 'devuelto', 'varias_posibles'];
export const PERIODICIDADES = {
  semanal: { dias: 7, margen: 2, alAnio: 52, meses: 7 / 30.4375 },
  // cada 4 semanas (Basic-Fit y otros gimnasios): 13 cargos al año, no 12
  cuatrisemanal: { dias: 28, margen: 2, alAnio: 13, meses: 28 / 30.4375 },
  mensual: { dias: 30.4375, min: 28, max: 35, alAnio: 12, meses: 1 },
  bimestral: { dias: 61, margen: 6, alAnio: 6, meses: 2 },
  trimestral: { dias: 91, margen: 10, alAnio: 4, meses: 3 },
  semestral: { dias: 182, margen: 15, alAnio: 2, meses: 6 },
  anual: { dias: 365, margen: 20, alAnio: 1, meses: 12 },
};

/** Banda de días [min, max] de cada periodicidad, según el encargo. */
export function bandaDias(periodicidad) {
  const p = PERIODICIDADES[periodicidad];
  if (!p) return null;
  if (p.min !== undefined) return [p.min, p.max];
  return [p.dias - p.margen, p.dias + p.margen];
}

/**
 * Un movimiento normalizado.
 * @typedef {Object} Movimiento
 * @property {string} id            único en el análisis: "<índice de archivo>-<n>"
 * @property {string} fecha         AAAA-MM-DD (fecha de operación; si solo hay una, esa)
 * @property {string|null} fecha_valor
 * @property {string} concepto      texto original tal cual lo da el banco (columnas de concepto unidas con " · ")
 * @property {number} importe       con signo: negativo = cargo, positivo = abono; en céntimos exactos
 * @property {number|null} saldo    saldo después del movimiento, si el archivo lo trae
 * @property {string} divisa        ISO 4217 ("EUR")
 * @property {{archivo: string, hoja?: string, pagina?: number, fila: number, texto?: string}} origen
 * @property {string} [concepto_comun]  Norma 43 (2 dígitos)
 * @property {string} [tipo]        tipo de operación que da el banco (Revolut "Type", N26 "Type"…)
 * @property {string} [cuenta]      para separar cuentas o bolsillos dentro de un mismo archivo
 * @property {number} [confianza]   0..1, lecturas por foto
 * @property {boolean} [dudoso]     lectura por foto con poca confianza: la interfaz debe pedir que se confirme
 * @property {string} [nota]        'comision_separada' (Revolut Fee), 'cambio_divisa', 'traspaso'…
 */
export function crearMovimiento(campos) {
  const m = {
    id: campos.id,
    fecha: campos.fecha,
    fecha_valor: campos.fecha_valor ?? null,
    concepto: String(campos.concepto ?? '').replace(/\s+/g, ' ').trim(),
    importe: redondear2(campos.importe) || 0, // nunca -0
    saldo: campos.saldo === null || campos.saldo === undefined ? null : redondear2(campos.saldo) || 0,
    divisa: (campos.divisa || 'EUR').toUpperCase(),
    origen: { ...campos.origen },
  };
  for (const k of ['concepto_comun', 'tipo', 'cuenta', 'confianza', 'dudoso', 'nota']) {
    if (campos[k] !== undefined && campos[k] !== null) m[k] = campos[k];
  }
  return m;
}

/**
 * Lo que devuelve cada lector para cada archivo (un ZIP devuelve varias).
 * @typedef {Object} LecturaArchivo
 * @property {string} archivo       nombre (dentro de un ZIP: "extractos.zip/EUR.csv")
 * @property {string} formato       xlsx|xls|ods|numbers|csv|tsv|txt|html|norma43|ofx|qif|camt053|mt940|pdf|pdf_escaneado|imagen|texto_pegado
 * @property {string|null} perfil   banco reconocido (ing, revolut, n26, wise…) o null
 * @property {'A'|'B'|'C'} nivel
 * @property {Movimiento[]} movimientos
 * @property {number|null} saldo_inicial  saldo declarado al principio (N43 11, camt OPBD, MT940 60F, PDF «saldo anterior»)
 * @property {number|null} saldo_final    saldo declarado al final (N43 33, camt CLBD, MT940 62F, PDF «saldo final»)
 * @property {string|null} fecha_inicial  periodo declarado por el archivo, si lo trae
 * @property {string|null} fecha_final
 * @property {{codigo: string, datos?: Object}[]} avisos
 * @property {null|{primeras_filas: string[][], total_filas: number, hoja?: string}} necesita_mapeo
 * @property {null|{motivo: 'requerida'|'incorrecta'}} necesita_contrasena
 * @property {null|{codigo: string, datos?: Object}} error   vacio|grande|ilegible|desconocido|danado|demasiadas_imagenes
 * @property {Object} [extra]       datos propios del formato (N43: totales del 33, OCR: confianza media…)
 */
export function crearLectura(campos) {
  return {
    archivo: campos.archivo,
    formato: campos.formato,
    perfil: campos.perfil ?? null,
    nivel: campos.nivel ?? 'A',
    movimientos: campos.movimientos ?? [],
    saldo_inicial: campos.saldo_inicial ?? null,
    saldo_final: campos.saldo_final ?? null,
    fecha_inicial: campos.fecha_inicial ?? null,
    fecha_final: campos.fecha_final ?? null,
    avisos: campos.avisos ?? [],
    necesita_mapeo: campos.necesita_mapeo ?? null,
    necesita_contrasena: campos.necesita_contrasena ?? null,
    error: campos.error ?? null,
    extra: campos.extra ?? {},
  };
}

/** Lectura que no se ha podido hacer, con un error en lenguaje humano (ver textos.js). */
export function lecturaConError(archivo, formato, codigo, datos) {
  return crearLectura({ archivo, formato, error: { codigo, ...(datos ? { datos } : {}) } });
}

/** Aviso con código (el texto humano lo pone textos.js en el idioma pedido). */
export function aviso(codigo, datos) {
  return datos ? { codigo, datos } : { codigo };
}
