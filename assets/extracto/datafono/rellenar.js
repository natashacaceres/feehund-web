// Rellena la calculadora del datáfono (datafono/index.html + assets/app.js) desde fuera, como lo haría la persona:
// escribe en las casillas y lanza los eventos normales (input y change) y pulsa los botones (clic). No toca app.js,
// ni calcular(), ni guarda nada. Solo acepta un resultado confirmado por la persona (confirmar.js).

import { CAMPOS } from './montaje.js';

const PASO_1_3 = ['ventas_particulares', 'ventas_empresa', 'ventas_fuera_europa', 'ventas_amex', 'ventas_bizum', 'operaciones', 'pagado'];
const CONTRATO = ['tasa_particulares', 'tasa_empresa', 'tasa_fuera_europa', 'tasa_amex', 'tasa_bizum', 'fijo_por_cobro', 'cuota', 'alquiler'];

/**
 * @param {Object} confirmado resultado de confirmarResumen()
 * @param {{documento?: Document, idioma?: 'es'|'ca'|'en'}} [opciones]
 * @returns {{rellenados: string[], saltados: string[], proveedor: 'boton'|'contrato'|'lista'|null}}
 */
export function rellenarCalculadora(confirmado, opciones = {}) {
  if (!confirmado?.confirmado) throw new Error('Primero hay que confirmar las cifras (confirmarResumen)');
  const doc = opciones.documento ?? globalThis.document;
  const idioma = opciones.idioma ?? doc.documentElement.lang ?? 'es';
  const rellenados = [], saltados = [];
  const c = confirmado.campos;
  for (const k of PASO_1_3) escribir(doc, CAMPOS[k].id, c[k], idioma, k, rellenados, saltados);

  // paso 4: con quién cobras
  let proveedor = null;
  const chips = doc.getElementById('pProvChips');
  const boton = (v) => chips?.querySelector(`.chip[data-v="${CSS.escape(v)}"]`);
  const p = c.proveedor;
  const tasas = CONTRATO.some((k) => c[k]?.valor !== null && c[k]?.valor !== undefined);
  if (p?.valor && p.calculadora && boton(p.calculadora)) {
    boton(p.calculadora).click();
    proveedor = 'boton';
    rellenados.push('proveedor');
  } else if (tasas && boton('CONTRATO')) {
    boton('CONTRATO').click();
    for (const k of CONTRATO) escribir(doc, CAMPOS[k].id, c[k], idioma, k, rellenados, saltados);
    proveedor = 'contrato';
  } else if (p?.valor && p.nombre && boton('OTRO')) {
    boton('OTRO').click();
    const sel = doc.getElementById('pProv');
    const op = sel && [...sel.options].find((o) => o.value && o.textContent.toLowerCase().includes(p.nombre.toLowerCase()));
    if (op) { sel.value = op.value; sel.dispatchEvent(new Event('change', { bubbles: true })); proveedor = 'lista'; rellenados.push('proveedor'); }
    else saltados.push('proveedor');
  } else saltados.push('proveedor');
  return { rellenados, saltados, proveedor };
}

function escribir(doc, id, campo, idioma, k, rellenados, saltados) {
  const el = doc.getElementById(id);
  if (!el || !campo || campo.valor === null || campo.valor === undefined) { saltados.push(k); return; }
  el.value = formato(campo.valor, campo.unidad, idioma);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  rellenados.push(k);
}

/** Cifra como la escribiría la persona: «1234,56» en español y catalán, «1234.56» en inglés. Sin puntos de miles. */
export function formato(v, unidad, idioma = 'es') {
  const dec = idioma === 'en' ? '.' : ',';
  if (unidad === 'num') return String(Math.round(v));
  const s = unidad === 'pct' ? String(Math.round(v * 1000) / 1000) : (Math.round(v * 100) / 100).toFixed(2);
  return s.replace('.', dec);
}
