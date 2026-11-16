// Personalidades del extracto (decisión del 16 nov 2026). Todo se calcula en el dispositivo.
// Los números de la tarjeta (dato.n) son del extracto entero; los umbrales para elegir siguen siendo por mes.
// Los importes solo sirven para contar y comparar; el resultado nunca lleva importes, nombres de
// comercios, personas ni lugares. Si faltan meses o datos para una personalidad, no se calcula.
// Gana la que más supera su umbral; si ninguna llega, sale Agente secreto.

import { clasificar, prepararDiccionario, tokensDe } from './conceptos.js';
import { diasEntre } from './fechas.js';
import { mismoImporte } from './detectar.js';

// Umbrales: editables. Los marcados «propuesto» los fijó el taller y están pendientes de su visto bueno.
export const UMBRALES = {
  bizum_personas_mes: 8,          // Ya te hago un Bizum: personas distintas a las que envías al mes
  grupo_veces: 2,                 // El banco del grupo: veces en el periodo (propuesto)
  grupo_multiplo: 2,              // pago de al menos el doble del habitual
  grupo_dias: 3,                  // Bizum recibidos en 0 a 3 días
  grupo_bizum: 2,                 // de 2 o más personas distintas
  centimo_minimo_bizum: 5,
  centimo_porcentaje: 0.5,        // Cuentas al céntimo: la mitad de los Bizum (propuesto)
  efectivo_mes: 4,                // Team efectivo: retiradas al mes (propuesto)
  cafelitos_mes: 20,              // Mil cafelitos: pagos pequeños al mes (propuesto)
  suscrito_cantidad: 6,           // Suscrito a todo: cosas pagadas cada mes 3 meses seguidos (propuesto)
  pijama_porcentaje: 0.3,         // Compro en pijama: parte de los pagos con señal de internet (propuesto)
  casa_pagos_dia: 5,              // Casa por la ventana: 5 o más pagos en el día
  casa_multiplo: 3,               // y el triple de su día normal
  casa_dias: 2,                   // días en el periodo (propuesto)
  diciembre_multiplo: 2,          // Todo el 23 de diciembre: el doble de comercios nuevos al día (propuesto)
  secreto_movimientos_mes: 40,
  secreto_propias: 0.5,
};

export const EDADES = [20, 30, 50, 70, 90];
const DIAS_MES = 30.44;
const TIPOS_NO_PAGO = new Set(['bizum', 'traspaso', 'cajero', 'ingreso', 'comision', 'transferencia']);
// Palabras que no son el nombre de la persona en un Bizum
const NO_NOMBRE = new Set(['BIZUM', 'ENVIADO', 'ENVIADA', 'ENVIADOS', 'RECIBIDO', 'RECIBIDA', 'RECIBIDOS', 'A', 'AL', 'DE', 'DEL', 'PARA',
  'DESDE', 'EN', 'TRANSFERENCIA', 'INMEDIATA', 'ORDENANTE', 'BENEFICIARIO', 'EMITIDO', 'EMITIDA', 'PAGO', 'COBRO', 'TRANSF', 'TRF']);
const FIN_NOMBRE = new Set(['CONCEPTO', 'MOTIVO', 'REF', 'REFERENCIA', 'NOTA', 'ASUNTO']);
// Apps de comida a domicilio: no cuentan para «Compro en pijama» (decisión del 16 nov)
const COMIDA_A_DOMICILIO = /\b(GLOVO|JUST ?EAT|UBER ?EATS|DELIVEROO)\b/;

/** La persona de un Bizum, solo para contar personas distintas en memoria (nunca sale del análisis). */
export function personaBizum(concepto) {
  const r = [];
  for (const t of tokensDe(String(concepto ?? '').toUpperCase())) {
    if (FIN_NOMBRE.has(t)) break;
    if (NO_NOMBRE.has(t) || /\d/.test(t) || t.length < 2) continue;
    r.push(t);
    if (r.length === 2) break;
  }
  return r.length ? r.join(' ') : null;
}

const mediana = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};
const percentil = (xs, p) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
};
const mesDe = (f) => f.slice(0, 7);
const centimos = (x) => Math.round(Math.abs(x) * 100);

/** Edad redonda de la cuenta a partir de su puntuación (más efectivo, recibos y sitios de siempre suben). */
export function edadDe(puntuacion) {
  if (puntuacion >= 0.9) return 90;
  if (puntuacion >= 0.6) return 70;
  if (puntuacion >= 0.3) return 50;
  if (puntuacion >= 0) return 30;
  return 20;
}

/**
 * @param {Array} movimientos  movimientos normalizados (modelo.js), en euros
 * @param {Object} diccionario data/comercios.json
 * @param {{casaPorLaVentana?: boolean}} opciones  Casa por la ventana solo si la persona la elige
 * @returns {{ganadora: {id: string, dato: Object}, todas: Array, dias: number}}
 */
export function calcularPersonalidades(movimientos, diccionario, opciones = {}) {
  const dic = prepararDiccionario(diccionario);
  const U = { ...UMBRALES, ...(opciones.umbrales ?? {}) };
  const lista = (movimientos ?? []).filter((m) => m && (!m.divisa || m.divisa === 'EUR') && /^\d{4}-\d{2}-\d{2}$/.test(m.fecha ?? '')
    && Number.isFinite(m.importe) && m.importe !== 0).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  const todas = [];
  if (!lista.length) return { ganadora: { id: 'agente_secreto', dato: null, comodin: true }, todas, dias: 0 };

  const desde = lista[0].fecha, hasta = lista[lista.length - 1].fecha;
  const dias = diasEntre(desde, hasta) + 1;
  const meses = dias / DIAS_MES;
  const hayMeses = (n) => dias >= Math.round(n * 28);

  // Clasificar una sola vez
  const mov = lista.map((m) => ({ m, cl: clasificar(m, dic) }));
  const pagos = mov.filter(({ m, cl }) => m.importe < 0 && !TIPOS_NO_PAGO.has(cl.tipo) && cl.motivo !== 'tarjeta_credito');
  const bizum = mov.filter(({ cl }) => cl.tipo === 'bizum');
  const enviados = bizum.filter(({ m }) => m.importe < 0);
  const recibidos = bizum.filter(({ m }) => m.importe > 0);
  const cajeros = mov.filter(({ m, cl }) => m.importe < 0 && cl.tipo === 'cajero');

  const resultado = (id, calculable, extra = {}) => {
    const r = { id, calculable, ...extra };
    if (calculable && Number.isFinite(r.valor) && Number.isFinite(r.umbral) && r.umbral > 0) r.puntuacion = r.valor / r.umbral;
    todas.push(r);
    return r;
  };
  const falta = (id, motivo) => resultado(id, false, { motivo });

  // 1. Ya te hago un Bizum: personas distintas a las que envías al mes. En la tarjeta: Bizum, no personas.
  if (!hayMeses(1)) falta('ya_te_hago_un_bizum', 'faltan_meses');
  else {
    const conNombre = enviados.map(({ m }) => personaBizum(m.concepto));
    const conocidos = conNombre.filter(Boolean).length;
    if (enviados.length && conocidos / enviados.length < 0.8) falta('ya_te_hago_un_bizum', 'sin_nombres');
    else {
      // Personas distintas de cada mes, sumadas y repartidas entre los meses del extracto
      const porMesB = new Map();
      enviados.forEach(({ m }, i) => {
        if (!conNombre[i]) return;
        const s = porMesB.get(mesDe(m.fecha)) ?? new Set();
        s.add(conNombre[i]);
        porMesB.set(mesDe(m.fecha), s);
      });
      const personas = [...porMesB.values()].reduce((t, s) => t + s.size, 0);
      resultado('ya_te_hago_un_bizum', true, { valor: personas / Math.max(1, meses), umbral: U.bizum_personas_mes,
        dato: { n: enviados.length, unidad: 'bizum_enviados' } });
    }
  }

  // 2. El banco del grupo: pagas mucho y en 0 a 3 días te llegan Bizum de 2 o más personas
  if (!hayMeses(3)) falta('el_banco_del_grupo', 'faltan_meses');
  else {
    const tarjeta = pagos.filter(({ cl }) => cl.tarjeta);
    const base = (tarjeta.length >= 5 ? tarjeta : pagos).map(({ m }) => -m.importe);
    const habitual = mediana(base);
    let veces = 0;
    const devueltos = new Set(); // Bizum recibidos que siguen a un pago tuyo
    for (const { m } of (tarjeta.length >= 5 ? tarjeta : pagos)) {
      if (!(habitual > 0) || -m.importe < U.grupo_multiplo * habitual) continue;
      const cerca = recibidos.filter(({ m: r }) => { const d = diasEntre(m.fecha, r.fecha); return d >= 0 && d <= U.grupo_dias; });
      const personas = new Set(cerca.map(({ m: r }) => personaBizum(r.concepto)).filter(Boolean));
      if (personas.size >= U.grupo_bizum) { veces++; for (const { m: r } of cerca) devueltos.add(r.id ?? r); }
    }
    resultado('el_banco_del_grupo', true, { valor: veces, umbral: U.grupo_veces, dato: { n: devueltos.size, unidad: 'bizum_recibidos' } });
  }

  // 3. Cuentas al céntimo: Bizum que no acaban en ,00 ni en ,50
  if (!hayMeses(1)) falta('cuentas_al_centimo', 'faltan_meses');
  else if (bizum.length < U.centimo_minimo_bizum) falta('cuentas_al_centimo', 'pocos_bizum');
  else {
    const raros = bizum.filter(({ m }) => centimos(m.importe) % 50 !== 0).length;
    const pct = raros / bizum.length;
    resultado('cuentas_al_centimo', true, { valor: pct, umbral: U.centimo_porcentaje, dato: { n: Math.round(pct * 100), unidad: 'por_ciento_bizum' } });
  }

  // 4. Team efectivo: retiradas en cajero al mes
  if (!hayMeses(1)) falta('team_efectivo', 'faltan_meses');
  else {
    const v = cajeros.length / Math.max(1, meses);
    resultado('team_efectivo', true, { valor: v, umbral: U.efectivo_mes, dato: { n: cajeros.length, unidad: 'retiradas' } });
  }

  // 5. Mil cafelitos: pagos del 25 % más bajo de sus propios pagos, al mes
  if (!hayMeses(1) || pagos.length < 8) falta('mil_cafelitos', hayMeses(1) ? 'pocos_pagos' : 'faltan_meses');
  else {
    const corte = percentil(pagos.map(({ m }) => -m.importe), 0.25);
    const pequenos = pagos.filter(({ m }) => -m.importe <= corte).length;
    const v = pequenos / Math.max(1, meses);
    resultado('mil_cafelitos', true, { valor: v, umbral: U.cafelitos_mes, dato: { n: pequenos, unidad: 'pagos_pequenos' } });
  }

  // 6. Suscrito a todo: mismo comercio, importe parecido, cada mes, 3 meses seguidos (solo se cuenta)
  if (!hayMeses(3)) falta('suscrito_a_todo', 'faltan_meses');
  else {
    const porClave = new Map();
    for (const { m, cl } of pagos) {
      if (cl.tipo === 'excluido') continue;
      const x = porClave.get(cl.clave) ?? new Map();
      const mes = mesDe(m.fecha);
      x.set(mes, [...(x.get(mes) ?? []), -m.importe]);
      porClave.set(cl.clave, x);
    }
    let n = 0;
    for (const porMes of porClave.values()) {
      const meses_ = [...porMes.keys()].sort();
      let seguidos = 1;
      for (let i = 1; i < meses_.length && seguidos < 3; i++) {
        const [a1, m1] = meses_[i - 1].split('-').map(Number), [a2, m2] = meses_[i].split('-').map(Number);
        const consecutivo = (a2 * 12 + m2) - (a1 * 12 + m1) === 1;
        const parecido = porMes.get(meses_[i]).some((x) => porMes.get(meses_[i - 1]).some((y) => mismoImporte(x, y)));
        seguidos = consecutivo && parecido ? seguidos + 1 : 1;
      }
      if (seguidos >= 3) n++;
    }
    resultado('suscrito_a_todo', true, { valor: n, umbral: U.suscrito_cantidad, dato: { n, unidad: 'cosas_cada_mes' } });
  }

  // 7. Compro en pijama: pagos con señal de compra por internet
  const sinComida = pagos.filter(({ m }) => !COMIDA_A_DOMICILIO.test(String(m.concepto ?? '').toUpperCase()));
  if (!hayMeses(1) || !sinComida.length) falta('compro_en_pijama', hayMeses(1) ? 'pocos_pagos' : 'faltan_meses');
  else {
    const pct = sinComida.filter(({ cl }) => cl.online).length / sinComida.length;
    resultado('compro_en_pijama', true, { valor: pct, umbral: U.pijama_porcentaje, dato: { n: Math.round(pct * 100), unidad: 'por_ciento_pagos' } });
  }

  // 8. Cuenta de X años: efectivo, recibos y sitios de siempre suman; internet y sitios nuevos restan
  if (!hayMeses(3) || pagos.length < 10) falta('cuenta_de_anos', hayMeses(3) ? 'pocos_pagos' : 'faltan_meses');
  else {
    const veces = new Map();
    for (const { cl } of pagos) veces.set(cl.clave, (veces.get(cl.clave) ?? 0) + 1);
    const total = pagos.length;
    const efectivo = cajeros.length / (cajeros.length + total);
    const recibos = pagos.filter(({ cl }) => cl.recibo).length / total;
    const siempre = pagos.filter(({ cl }) => veces.get(cl.clave) >= 3).length / total;
    const online = pagos.filter(({ cl }) => cl.online).length / total;
    const nuevos = pagos.filter(({ cl }) => veces.get(cl.clave) === 1).length / total;
    const s = efectivo + recibos + siempre - online - nuevos;
    const edad = edadDe(s);
    // Solo compite si la edad es extrema (muy joven o muy mayor): las del medio no tienen gracia
    // Pesa poco a propósito: casi todas las cuentas repiten sitios, así que solo gana si ninguna otra destaca (propuesto)
    const fuerza = edad === 90 || edad === 20 ? 1.1 : edad === 70 ? 1 : 0;
    resultado('cuenta_de_anos', true, { valor: fuerza, umbral: 1, dato: { n: edad, unidad: 'anos' } });
  }

  // 12. Todo el 23 de diciembre: solo si el extracto incluye de octubre a diciembre
  const anioDic = (() => {
    for (let a = Number(hasta.slice(0, 4)); a >= Number(desde.slice(0, 4)); a--) {
      if (desde <= `${a}-10-01` && hasta >= `${a}-12-24`) return a;
    }
    return null;
  })();
  if (anioDic === null) falta('todo_el_23_de_diciembre', 'sin_octubre_a_diciembre');
  else {
    const vistos = new Set();
    let antes = 0, despues = 0;
    for (const { m, cl } of pagos) {
      const nuevo = !vistos.has(cl.clave);
      vistos.add(cl.clave);
      if (!nuevo || m.fecha.slice(0, 4) !== String(anioDic)) continue;
      if (m.fecha >= `${anioDic}-12-01` && m.fecha <= `${anioDic}-12-19`) antes++;
      if (m.fecha >= `${anioDic}-12-20` && m.fecha <= `${anioDic}-12-24`) despues++;
    }
    const ratio = despues === 0 ? 0 : antes === 0 ? 5 : Math.min(5, (despues / 5) / (antes / 19));
    resultado('todo_el_23_de_diciembre', true, { valor: ratio, umbral: U.diciembre_multiplo, dato: { n: despues, unidad: 'sitios_nuevos' } });
  }

  // 13. Casa por la ventana (opcional): días con 5 o más pagos y el triple de su día normal
  if (!opciones.casaPorLaVentana) falta('casa_por_la_ventana', 'no_elegida');
  else if (!hayMeses(1)) falta('casa_por_la_ventana', 'faltan_meses');
  else {
    const porDia = new Map();
    for (const { m } of pagos) {
      const d = porDia.get(m.fecha) ?? { n: 0, total: 0 };
      d.n++; d.total += -m.importe;
      porDia.set(m.fecha, d);
    }
    const normal = mediana([...porDia.values()].map((d) => d.total));
    const n = [...porDia.values()].filter((d) => d.n >= U.casa_pagos_dia && d.total >= U.casa_multiplo * normal).length;
    resultado('casa_por_la_ventana', true, { valor: n, umbral: U.casa_dias, dato: { n, unidad: 'dias' } });
  }

  // 14. Agente secreto: pocos movimientos o la mitad de lo que sale va a cuentas propias
  const porMes = lista.length / Math.max(1, meses);
  const salidas = mov.filter(({ m }) => m.importe < 0);
  const totalSalidas = salidas.reduce((s, { m }) => s - m.importe, 0);
  const propias = salidas.filter(({ cl }) => cl.tipo === 'traspaso').reduce((s, { m }) => s - m.importe, 0);
  const pctPropias = totalSalidas > 0 ? propias / totalSalidas : 0;
  const fuerzaSecreto = Math.max(porMes < U.secreto_movimientos_mes ? U.secreto_movimientos_mes / Math.max(1, porMes) : 0,
    pctPropias > U.secreto_propias ? pctPropias / U.secreto_propias : 0);
  resultado('agente_secreto', hayMeses(1), hayMeses(1)
    ? { valor: fuerzaSecreto, umbral: 1, dato: { n: lista.length, m: dias, unidad: 'movimientos_en_dias' } }
    : { motivo: 'faltan_meses' });

  // Gana la que más supera su umbral; si ninguna llega, Agente secreto como comodín
  // Agente secreto es el comodín: solo sale cuando ninguna otra llega
  const candidatas = todas.filter((r) => r.id !== 'agente_secreto' && r.calculable && r.puntuacion >= 1).sort((a, b) => b.puntuacion - a.puntuacion);
  const g = candidatas[0];
  const ganadora = g ? { id: g.id, dato: g.dato }
    : { id: 'agente_secreto', dato: { n: lista.length, m: dias, unidad: 'movimientos_en_dias' }, comodin: true };
  return { ganadora, todas, dias };
}
