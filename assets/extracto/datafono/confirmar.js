// La persona revisa las cifras del resumen y las confirma. Lógica pura (sin DOM ni almacenamiento).
//   confirmarResumen(resultado, correcciones) → copia del resultado con lo que ha cambiado, todo confirmado.
// Solo un resultado confirmado se puede pasar a la calculadora (rellenar.js lo exige).

/**
 * @param {Object} resultado de analizarResumen()
 * @param {{[campo: string]: number|string|null}} correcciones valor nuevo de cada campo que la persona ha tocado
 *   (número, texto con coma o punto, o null / '' para dejarlo vacío)
 * @returns {Object} copia con campos[*].confirmado = true, necesita_confirmacion = false y confirmado = true
 */
export function confirmarResumen(resultado, correcciones = {}) {
  if (!resultado?.campos) throw new TypeError('Hace falta un resultado de analizarResumen()');
  const r = structuredClone(resultado);
  for (const [k, v] of Object.entries(correcciones ?? {})) {
    const c = r.campos[k];
    if (!c) continue;
    const nuevo = c.unidad === 'texto' ? (v === '' || v === null || v === undefined ? null : String(v)) : numero(v);
    if (v !== null && v !== undefined && v !== '' && nuevo === null) throw new TypeError(`«${v}» no es una cifra (${k})`);
    const igual = nuevo === c.valor || (typeof nuevo === 'number' && typeof c.valor === 'number' && Math.abs(nuevo - c.valor) < 1e-9);
    if (igual) continue;
    r.campos[k] = { ...c, valor: nuevo, como: nuevo === null ? 'vaciado' : 'escrito', seguro: nuevo !== null, origen: [], motivos: [], cambiado: true, antes: c.valor };
    if (k === 'proveedor') r.campos[k].calculadora = nuevo === resultado.campos.proveedor?.valor ? resultado.campos.proveedor.calculadora : null;
  }
  for (const c of Object.values(r.campos)) c.confirmado = true;
  r.necesita_confirmacion = false;
  r.confirmado = true;
  return r;
}

/** «1.234,56», «1234.56», «0,40 %», 12 → número; vacío o ilegible → null. */
export function numero(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s|€|%/g, '');
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}
