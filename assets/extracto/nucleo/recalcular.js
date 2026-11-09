// Totales sin los cobros que la persona desmarca. No toca el resultado original: devuelve una copia.
// Lógica pura: sin DOM, sin red.

import { aCentimos } from './numeros.js';

const LISTAS = ['cobros', 'gastos_fijos', 'terminados'];

/**
 * @param {Object} resultado de analizar(), confirmar() o detectar()
 * @param {Iterable<string>} idsDesmarcados ids de los cobros que no se quieren contar
 * @returns {Object} copia con `desmarcado` en cada cobro y total_seguro / total_posible recalculados
 */
export function recalcular(resultado, idsDesmarcados = []) {
  if (!resultado || typeof resultado !== 'object') return resultado;
  // un solo id también vale («netflix»); un texto no se recorre letra a letra
  const ids = new Set(typeof idsDesmarcados === 'string' ? [idsDesmarcados] : (idsDesmarcados ?? []));
  // el resultado son datos planos: si el navegador no tiene structuredClone, vale la copia por JSON
  const copia = typeof structuredClone === 'function' ? structuredClone(resultado) : JSON.parse(JSON.stringify(resultado));
  for (const k of LISTAS) {
    for (const c of Array.isArray(copia[k]) ? copia[k] : []) if (c && typeof c === 'object') c.desmarcado = ids.has(c.id);
  }
  // Sin totales (diccionario que no ha llegado), siguen sin totales: no se inventan.
  if (copia.total_seguro === null && copia.total_posible === null) return copia;
  const suma = (estado) => {
    let centimos = 0;
    for (const c of Array.isArray(copia.cobros) ? copia.cobros : []) {
      if (c && c.estado === estado && !c.desmarcado && Number.isFinite(c.coste_anual)) centimos += aCentimos(c.coste_anual);
    }
    return centimos / 100;
  };
  copia.total_seguro = suma('seguro');
  copia.total_posible = suma('posible');
  return copia;
}
