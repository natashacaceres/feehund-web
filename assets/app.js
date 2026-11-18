/* MARCA: el nombre de la marca va solo aquí. Se usa en el logo, el <title>, la cabecera y el pie. */
const MARCA = "Feehund";
(function marca(){
  document.querySelectorAll("[data-marca]").forEach(el => { if (el.tagName === "IMG") el.alt = MARCA; else el.textContent = MARCA; });
  const t = document.documentElement.dataset.title;
  if (!document.documentElement.hasAttribute("data-title-fijo")) document.title = t ? t + " · " + MARCA : MARCA;
})();

/* Contacto: un solo correo. Se inserta en los elementos [data-titular]. */
const TITULAR = {email:"hola@feehund.com"};
(function titular(){
  document.querySelectorAll("[data-titular]").forEach(el => {
    const k = el.dataset.titular; const v = TITULAR[k]; if (!v) return; el.textContent = v;
    if (k === "email" && el.tagName === "A") el.href = "mailto:" + TITULAR.email;
  });
})();

/* Calculadora del datáfono. Todo se calcula en el navegador: no se envía ni se guarda nada. Las tarifas se leen de /data/tarifas-datafono.json. */
// ---------- pago: configuración en un solo sitio
const PAGO = {
  enlace: "https://buy.stripe.com/dRm6oI9Vtbsu4n51732VG01",
  activo: true, // el enlace de Stripe vuelve a https://feehund.com/es/?pago=ok
  precio: 4,
  umbralAhorro: 50
};
let PLANS = [];
// Motor de la calculadora: misma lógica que el Excel (Motor rápido / Motor preciso).
function calcular(PLANS, I) {
  const MARG = { Alta: 0.05, Media: 0.15, Baja: 0.30, Contrato: 0.05 };
  const N = v => (typeof v === "number" && isFinite(v) ? v : 0);
  const sectorOK = s => s === "Todos" || (s === "Restauración" && I.sector === "Bar o restaurante") || (s === "Belleza" && I.sector === "Peluquería o estética");
  let plans = PLANS.slice();
  if (I.contrato) {
    const c = I.contrato, d = v => (v === null || v === undefined || v === "" ? null : v);
    plans.push({ id: "CONTRATO", prov: "Tu contrato", plan: "Tu contrato actual", tipo: "Contrato", modelo: "Porcentaje", sim: "Contrato", fiab: "Contrato",
      rp: d(c.rp), fp: N(c.f), re: d(c.re), fe: N(c.f), rn: d(c.rn), fn: N(c.f), ra: d(c.ra), fa: N(c.f), rb: d(c.rb), fb: N(c.f), bz: 1, minop: 0,
      inc: [0, 0, 0, 0], incb: 0, exc: null, excmin: null, cuota: N(c.cuota), cuenta: 0, alq: N(c.alq), adic: null, compra: 0, dias: null,
      pm: 0, pv: null, pn: null, sector: "Todos", aviso: "Precios de tu propio contrato.", tramos: [] });
  }
  const cur = plans.find(p => p.id === I.cur);
  const iva = 1 + I.IVA;
  const rows = plans.map(p => {
    const r = {};
    r.p = p;
    r.rp = p.rp == null ? I.NP : p.rp; r.fp = N(p.fp);
    r.re = p.re == null ? I.NP : p.re; r.fe = N(p.fe);
    r.rn = p.rn == null ? I.NP : p.rn; r.fn = N(p.fn);
    r.ra = p.ra == null ? I.NP : p.ra; r.fa = N(p.fa);
    r.rb = p.bz === 1 ? (p.rb == null ? I.BZ : p.rb) : r.rp;
    r.fb = p.bz === 1 ? N(p.fb) : r.fp;
    r.incb = p.bz === 1 ? N(p.incb) : p.inc[0];
    const minop = N(p.minop);
    const NE = V => {
      if (!(I.T > 0)) return 0;
      const pz = [[p.inc[0], I.wP, r.rp, r.fp], [p.inc[1], I.wE, r.re, r.fe], [p.inc[2], I.wN, r.rn, r.fn], [p.inc[3], I.wA, r.ra, r.fa], [r.incb, I.wB, r.rb, r.fb]];
      return V / I.T * pz.reduce((s, [inc, w, rr, ff]) => s + (1 - inc) * w * Math.max(I.T * rr + ff, minop), 0);
    };
    const ELIG = V => V * (I.wP * p.inc[0] + I.wE * p.inc[1] + I.wN * p.inc[2] + I.wA * p.inc[3] + I.wB * r.incb);
    const tr = p.tramos || [], nT = tr.length, maxlim = nT ? tr[nT - 1][0] : 0;
    const K = E => (p.modelo === "Tramos" ? tr.filter(t => t[0] < E).length + 1 : 0);
    const CUO = k => (p.modelo === "Tramos" && nT ? tr[Math.min(k, nT) - 1][1] : 0) * (I.IVAQ ? iva : 1);
    const EXC = E => (p.modelo === "Tramos" && E > maxlim ? Math.max((E - maxlim) * N(p.exc), I.T > 0 ? (E - maxlim) / I.T * N(p.excmin) : 0) : 0);
    r.es_actual = p.id === I.cur ? 1 : 0;
    r.mismo = cur && p.prov === cur.prov ? 1 : 0;
    let fijos = N(p.cuota) + (I.CTA ? N(p.cuenta) : 0) + (N(p.alq) + Math.max(0, I.ND - 1) * N(p.adic)) * iva;
    if (I.swLock && !r.mismo) fijos += N(I.swNew) - N(I.swF);
    const V = I.V, E = ELIG(V), Vf = V * I.pF, Ef = ELIG(Vf);
    r.cuota = CUO(K(E)); r.cuotaf = CUO(K(Ef));
    r.Cn = NE(V) + r.cuota + EXC(E) + fijos;
    r.Cf = NE(Vf) + r.cuotaf + EXC(Ef) + fijos;
    r.cubierto = V > 0 ? E / V : 0;
    r.anual = (12 - I.nF) * r.Cn + I.nF * r.Cf;
    r.cuota_anual = (12 - I.nF) * r.cuota + I.nF * r.cuotaf;
    r.promo = I.PROMO && !r.mismo && N(p.pm) > 0 && I.V >= N(p.pv) && (p.pn == null || I.wN <= p.pn) ? 1 : 0;
    r.ahorro_promo = r.promo * Math.min(N(p.pm), 12) / 12 * r.cuota_anual;
    r.coste_cambio = r.mismo ? 0 : N(p.compra) * I.ND * iva + N(I.PEN) + N(I.CAJA);
    r.m = MARG[p.fiab] ?? 0.15;
    r.tasa = V > 0 ? r.Cn / V : 0;
    const formaOK = !I.forma || !p.forma || p.forma === "Todos" || p.forma === I.forma;
    const sim = I.cons
      ? p.sim === "Sí" && sectorOK(p.sector) && p.fiab !== "Baja" && formaOK
      : (p.sim === "Sí" || (p.id === "CONTRATO" && I.cur === "CONTRATO")) && sectorOK(p.sector) && (I.incBaja || p.fiab !== "Baja")
        && (I.maxDias == null || p.dias == null || p.dias <= I.maxDias) && formaOK;
    r.sim = sim;
    return r;
  });
  const c = rows.find(r => r.es_actual);
  if (!c) return null;
  const CURANN = N(I.curCost) > 0 ? N(I.curCost) * (c.Cn > 0 ? c.anual / c.Cn : 12) : c.anual * (1 - I.cons * c.m);
  rows.forEach(r => {
    r.anual_adj = r.es_actual ? CURANN : r.anual * (1 + I.cons * r.m);
    r.ano1 = r.anual_adj - r.ahorro_promo + r.coste_cambio;
    r.ano2 = r.anual_adj;
    r.ahorro1 = r.es_actual ? 0 : CURANN - r.ano1;
    r.ahorro2 = r.es_actual ? 0 : CURANN - r.ano2;
    r.ahorro_m = r.es_actual ? 0 : (CURANN - r.ano2) / 12;
    r.ahorro_lo = r.es_actual ? 0 : (CURANN - r.anual * (1 + r.m)) / 12;
    r.ahorro_hi = r.es_actual ? 0 : (CURANN - r.anual * (1 - r.m)) / 12;
    r.meses_promo = r.promo * Math.min(N(r.p.pm), 12);
    r.promo_m = r.meses_promo > 0 ? r.ahorro_promo / r.meses_promo : 0;
    const a = r.ahorro_m, pm = r.promo_m, mp = r.meses_promo, cc = r.coste_cambio;
    if (r.es_actual) r.payback = "Es tu plan";
    else if (cc <= 0) r.payback = a + pm > 0 ? 0 : "Nunca";
    else if (mp > 0 && (a + pm) * mp >= cc) r.payback = cc / (a + pm);
    else if (a <= 0) r.payback = "Nunca";
    else r.payback = mp + (cc - (a + pm) * mp) / a;
    r.neto24 = r.ahorro1 + r.ahorro2;
    const espera = r.mismo ? 0 : Math.max(0, r.coste_cambio - N(I.PEN));
    r.neto24_espera = r.mismo ? r.neto24 : Math.max(0, 24 - N(I.MREM)) * r.ahorro_m + r.ahorro_promo - espera;
    r.total2 = r.ano1 + r.ano2;
    const pct = x => (x * 100).toFixed(x < 0.01 ? 2 : 1).replace(".", ",") + " %";
    r.razon = (r.p.modelo === "Tramos"
      ? "una cuota fija cubre el " + Math.round(r.cubierto * 100) + " % de tus ventas con tarjeta"
      : "cobra " + pct(r.rp) + " en tarjetas europeas de particular" + (r.fp > 0 ? " + " + r.fp.toFixed(2).replace(".", ",") + " € por cobro" : " sin fijo por cobro"))
      + (I.wN >= 0.15 ? "; tarjetas de turistas: " + (r.p.modelo === "Tramos" && r.p.inc[2] === 1 ? "incluidas en la cuota" : pct(r.rn)) : "");
  });
  const ranked = rows.filter(r => r.sim).sort((x, y) => x.total2 - y.total2);
  const out = rows.filter(r => !r.sim);
  const best = ranked[0] || c;
  const eur = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F");
  const minimo = I.cons ? " como mínimo" : "";
  let verdict, tono;
  if (best.es_actual) { verdict = "Ya estás en la opción más barata. No te compensa cambiar."; tono = "igual"; }
  else if (best.ahorro_m <= 0) {
    if (best.neto24 > 0) { verdict = "Solo compensa por la promoción de bienvenida de " + best.p.plan + ". Al acabar, pagaría unos " + eur(-best.ahorro_m) + "\u00a0€/mes más que hoy."; tono = "dudoso"; }
    else { verdict = "No compensa cambiar: ninguna opción te cuesta menos al mes que lo que pagas hoy."; tono = "no"; }
  } else if (Math.max(best.neto24, best.neto24_espera) <= 0) { verdict = "No compensa: " + best.p.plan + " te ahorra " + best.ahorro_m.toFixed(2).replace(".", ",") + "\u00a0€/mes, pero en 2 años no recuperas lo que cuesta cambiar."; tono = "no"; }
  else if (best.neto24_espera > best.neto24) { verdict = "Compensa, pero espera: cambia a " + best.p.plan + " cuando acabe tu permanencia, en " + I.MREM + " meses, y te ahorras la penalización."; tono = "si"; }
  else { verdict = "Compensa cambiar a " + best.p.plan + ": ahorras unos " + eur(best.ahorro_m) + "\u00a0€/mes" + minimo + "."; tono = "si"; }
  return { CURANN, cur: c, best, ranked, out, verdict, tono };
}
if (typeof module !== "undefined") module.exports = { calcular, seguro };

// Recomendación segura (sin tocar calcular()). Solo se recomienda lo que es cierto en todos los casos posibles:
// - si falta un dato (seg.faltan), no se dice nada;
// - si no se sabe qué tarjetas usan los clientes, se prueba como si todas fueran de particular, de empresa o de fuera de Europa;
// - si hay meses flojos, se prueba con las ventas de cada mes entre el flojo y el normal (lo que se paga hoy, a esa escala);
// - solo cuentan las tarifas comprobadas (fiabilidad Alta) y gana una tarifa si ahorra en todos los casos.
// Devuelve {estado: "si"|"no"|"duda"|"falta", R (para pintar, con best = la tarifa en su peor caso), ok, casos, causas, faltan}.
function seguro(I) {
  const s = I.seg || { faltan: [], mezcla: "conocida", flojo: null };
  if (s.faltan && s.faltan.length) return { estado: "falta", faltan: s.faltan, R: null, ok: [], casos: 0, causas: [] };
  const base = calcular(PLANS, I); if (!base) return null;
  const sumaPEN = I.wP + I.wE + I.wN;
  const mezclas = s.mezcla === "desconocida" ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(m => ({ wP: sumaPEN * m[0], wE: sumaPEN * m[1], wN: sumaPEN * m[2] })) : [{}];
  const vols = [I.V];
  if (s.flojo > 0 && Math.abs(s.flojo - I.V) > 0.005) for (let k = 1; k <= 6; k++) vols.push(I.V + (s.flojo - I.V) * k / 6);
  const coste = J => { const r = calcular(PLANS, Object.assign({}, J, { curCost: 0 })); return r ? r.cur.Cn : 0; };
  const casos = [];
  for (const m of mezclas) {
    const J0 = Object.assign({}, I, m), c0 = coste(J0);
    for (const v of vols) {
      const J = Object.assign({}, J0, { V: v });
      // lo que paga hoy a otra escala de ventas: lo pagado de verdad × lo que cambia su tarifa actual
      if (v !== I.V && I.curCost > 0) { const cv = coste(J); J.curCost = c0 > 0 ? I.curCost * cv / c0 : I.curCost; }
      const r = calcular(PLANS, J); if (r) casos.push(r);
    }
  }
  const umbral = typeof PAGO !== "undefined" ? PAGO.umbralAhorro : 50;
  const gana = r => !!r && r.sim && r.ahorro_m * 12 >= umbral && Math.max(r.neto24, r.neto24_espera) > 0;
  const candidatas = base.ranked.filter(r => !r.es_actual && r.p.fiab === "Alta");
  const ok = [], alguna = [];
  for (const cand of candidatas) {
    const filas = casos.map(R => R.ranked.find(r => r.p.id === cand.p.id) || null);
    if (filas.some(gana)) alguna.push(cand.p.id);
    if (!filas.every(gana)) continue;
    // la fila del peor caso: la que menos ahorra; y lo más que puede costar al año
    const peor = filas.reduce((a, r) => (r.ahorro_m < a.ahorro_m ? r : a));
    const fila = Object.assign({}, peor, {
      neto24: Math.min(...filas.map(r => r.neto24)), neto24_espera: Math.min(...filas.map(r => r.neto24_espera)),
      ano2_max: Math.max(...filas.map(r => r.ano2)), tasa_max: Math.max(...filas.map(r => r.tasa)) });
    ok.push(fila);
  }
  ok.sort((a, b) => Math.max(b.neto24, b.neto24_espera) - Math.max(a.neto24, a.neto24_espera));
  const causas = [];
  if (alguna.length && s.mezcla === "desconocida") causas.push("mezcla");
  if (alguna.length && vols.length > 1) causas.push("flojo");
  if (ok.length) return { estado: "si", R: Object.assign({}, base, { best: ok[0], ranked: ok, tono: "si" }), ok, casos: casos.length, causas, faltan: [] };
  // «No, está bien» solo si ninguna tarifa, tampoco las que no están comprobadas, ahorra en ningún caso
  const otraGana = casos.some(R => R.ranked.some(r => !r.es_actual && r.p.fiab !== "Alta" && gana(r)));
  if (otraGana && !alguna.length) causas.push("tarifas");
  return { estado: causas.length ? "duda" : "no", R: base, ok: [], casos: casos.length, causas, faltan: [] };
}

let REFERENCIA = null;

// Título en una sola línea: reduce la letra hasta que quepa (mínimo 22 px; por debajo, deja que se parta).
(function fitTitle(){
  const h = document.querySelector(".c-hero h1, .home-title h1"); if (!h) return;
  const MAX = 53, MIN = 28;
  const fit = () => {
    h.style.whiteSpace = "nowrap"; h.style.fontSize = MAX + "px";
    const w = h.scrollWidth, a = h.clientWidth;
    let s = w > a ? Math.floor(MAX * a / w * 0.98) : MAX;
    if (s < MIN) { s = MIN; h.style.whiteSpace = "normal"; }
    h.style.fontSize = s + "px";
  };
  fit();
  if (document.fonts) {
    if (document.fonts.ready) document.fonts.ready.then(fit);
    if (document.fonts.load) document.fonts.load('600 52px "Fredoka"').then(fit, () => {});
    document.fonts.addEventListener && document.fonts.addEventListener("loadingdone", fit);
  }
  addEventListener("load", fit);
  if (typeof ResizeObserver !== "undefined") { let w = 0; new ResizeObserver(() => { if (h.clientWidth !== w) { w = h.clientWidth; fit(); } }).observe(h.parentElement); }
  let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(fit, 60); });
  document.addEventListener("nc-lang", () => requestAnimationFrame(fit));
})();

function iniciarUI(){
  const $ = id => document.getElementById(id);
  const LANGS = ["es", "ca", "en"];
  const lang = () => LANGS.indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
  const L = o => LANGS.map(l => '<span data-l="' + l + '">' + o[l] + '</span>').join("");
  const same = s => ({ es: s, ca: s, en: s });

  const TX = {
    es: {
      vYes: "Sí, pagas de más.", vNo: "No, está bien.", noSub: "Ninguna tarifa te ahorra lo bastante para que compense cambiar.",
      payLine: (x, p) => "Ahorras al menos " + x + " al año · Recomendación por " + p,
      mes: x => "Tu mes: " + x + " con tarjeta", cifraSi: "Pagas de más cada mes, como mínimo", cifraEff: "Pagas de cada 100 € que cobras con tarjeta",
      claveSi: x => "Cambiando de tarifa ahorras al menos " + x + " al año.",
      acPagoT: "A quién cambiarte", acPagoL: "Pregúntaselo a Tiqui", acPagoB: () => "Preguntar", acPagoQ: "¿A quién me cambio?",
      acBajaT: n => "Te damos de baja de " + n, acBajaL: "Enviamos la carta por ti", acBajaB: "Empezar", tuBanco: "tu banco",
      acFalta: { pagado: ["Mira lo que te cobró el banco", "Está en tu resumen o en tu cuenta"], perm: ["Mira si tienes permanencia", "Está en tu contrato del datáfono"],
        iva: ["Pregunta si recuperas el IVA", "Te lo dice tu gestoría"], caja: ["Mira si la caja está conectada", "Pregunta a quien te la vendió"] },
      acMezcla: ["Separa tus ventas por tarjeta", "Tu banco te da el desglose"], acFlojo: ["Revisa tu mes más flojo", "Mira el resumen de ese mes"],
      acPersona: ["Pide un análisis personalizado", "Una persona revisa tu caso", "Pedirlo"], contestar: "Contestar",
      barHoy: "Tú, hoy", barMedia: "Media de los bancos, solo comisión", barNueva: "Tarifa recomendada, como mucho",
      buena2: x => "En 2 años ahorras al menos " + x + ".", buenaMedia: "Pagas menos que la media de los bancos.",
      verDetalle: "Ver todo el detalle", ocultarDetalle: "Ocultar el detalle",
      vFalta: n => n === 1 ? "Nos falta un dato." : "Nos faltan datos.", falta: l => "Para decirte algo seguro necesitamos " + l + ".", y: " y ",
      faltaN: { pagado: "lo que te cobró el banco ese mes", perm: "si tienes permanencia", iva: "si recuperas el IVA", caja: "si tu datáfono está conectado a la caja" },
      vDuda: "No podemos asegurártelo.", duda: c => "Con tus datos, el ahorro depende de " + c + ". Por eso no te recomendamos nada.",
      dudaC: { mezcla: "qué tarjetas usan tus clientes", flojo: "cuánto vendes en los meses flojos", tarifas: "tarifas que aún no hemos podido comprobar" },
      iCostMax: (c, s) => "Cuesta como mucho " + c + " al mes y ahorras al menos " + s + " al año",
      iCost: (c, s) => "Cuesta " + c + " al mes y ahorras " + s + " al año", iAltCost: c => c + "/mes",
      iWait2: (d, pen) => "Cuando acabe tu permanencia, en " + d + "." + (pen ? " Así evitas la penalización de " + pen + "." : ""),
      iBankX: (x, y) => "Pide igualar " + x + "/mes o la tarifa " + y + "; si no, solicita la baja.",
      iSteps2: ["Contrata el nuevo proveedor.", "Recibe y activa el nuevo datáfono.", "Pide por escrito la baja del anterior.", "Si tu datáfono actual es de alquiler, devuélvelo."],
      prog: (i, n) => i + " de " + n, pre: "Pagas", post: "de más", one: x => x + "/mes",
      instant: "Al instante", months: n => "≈ " + n + (n === 1 ? " mes" : " meses"), cheap: n => "tarifas te salen más baratas",
      ref: (v, s) => "La comisión media de los bancos en España es del " + v + "\u00a0% (" + s + "Banco de España). No incluye cuotas ni alquiler.",
      shareTxtYes: x => x + " de más por cobrar con tarjeta. Calcula lo tuyo, gratis:", shareTxtNo: "¿Pagas de más por cobrar con tarjeta? Calcúlalo gratis:",
      shTop: "Calculadora del datáfono", shYes: "de más por cobrar con tarjeta", shNo: "de coste efectivo por cobrar con tarjeta", shAsk: "¿Y tú?",
      shared: "Imagen descargada y enlace copiado.",
      chooseProv: "Elige tu banco o empresa y tu plan", banks: "Bancos", fin: "Otras empresas de datáfonos", own: "Escribir mis propios precios", own2: "Tu contrato actual",
      iSave: x => "Ahorras unos " + x + " al mes", iWait: d => "Cuando acabe tu permanencia, en " + d + ". Así evitas la penalización.", iNow: "Ya. Cambiar no te cuesta nada.", iNowCost: x => "Ya. Cambiar te cuesta " + x + " y lo recuperas con el ahorro.",
      iBank1: p => "Que te iguale " + p + " por cobro con tarjeta europea de particular.", iBank2: "Que te quite la cuota mensual y el alquiler del datáfono.", iBank3: "Que te lo dé por escrito, con la fecha de inicio.",
      iSteps: ["Pide al nuevo proveedor las condiciones por escrito.", "Confirma que el datáfono funciona con tu caja o programa de ventas.", "Activa el nuevo datáfono antes de dar de baja el antiguo.", "Pide la baja por escrito y guarda el justificante."]
    },
    ca: {
      vYes: "Sí, pagues de més.", vNo: "No, està bé.", noSub: "Cap tarifa t'estalvia prou perquè compensi canviar.",
      payLine: (x, p) => "Estalvies almenys " + x + " l'any · Recomanació per " + p,
      mes: x => "El teu mes: " + x + " amb targeta", cifraSi: "Pagues de més cada mes, com a mínim", cifraEff: "Pagues de cada 100 € que cobres amb targeta",
      claveSi: x => "Canviant de tarifa estalvies almenys " + x + " l'any.",
      acPagoT: "A qui canviar-te", acPagoL: "Pregunta-ho a Tiqui", acPagoB: () => "Preguntar", acPagoQ: "A qui em canvio?",
      acBajaT: n => "Et donem de baixa de " + n, acBajaL: "Enviem la carta per tu", acBajaB: "Començar", tuBanco: "el teu banc",
      acFalta: { pagado: ["Busca el que et cobra el banc", "És al resum o al compte"], perm: ["Mira si tens permanència", "És al contracte del datàfon"],
        iva: ["Pregunta si recuperes l'IVA", "T'ho diu la gestoria"], caja: ["Mira si la caixa està connectada", "Pregunta a qui te la va vendre"] },
      acMezcla: ["Separa les vendes per targeta", "El banc et dona el desglossament"], acFlojo: ["Revisa el teu mes més fluix", "Mira el resum d'aquell mes"],
      acPersona: ["Demana una anàlisi personalitzada", "Una persona revisa el teu cas", "Demanar-la"], contestar: "Respondre",
      barHoy: "Tu, avui", barMedia: "Mitjana dels bancs, només comissió", barNueva: "Tarifa recomanada, com a màxim",
      buena2: x => "En 2 anys estalvies almenys " + x + ".", buenaMedia: "Pagues menys que la mitjana dels bancs.",
      verDetalle: "Veure tot el detall", ocultarDetalle: "Amagar el detall",
      vFalta: n => n === 1 ? "Ens falta una dada." : "Ens falten dades.", falta: l => "Per dir-te alguna cosa segura necessitem " + l + ".", y: " i ",
      faltaN: { pagado: "el que et va cobrar el banc aquell mes", perm: "si tens permanència", iva: "si recuperes l'IVA", caja: "si el teu datàfon està connectat a la caixa" },
      vDuda: "No t'ho podem assegurar.", duda: c => "Amb les teves dades, l'estalvi depèn de " + c + ". Per això no et recomanem res.",
      dudaC: { mezcla: "quines targetes fan servir els teus clients", flojo: "quant vens els mesos fluixos", tarifas: "tarifes que encara no hem pogut comprovar" },
      iCostMax: (c, s) => "Costa com a màxim " + c + " al mes i estalvies almenys " + s + " l'any",
      iCost: (c, s) => "Costa " + c + " al mes i estalvies " + s + " l'any", iAltCost: c => c + "/mes",
      iWait2: (d, pen) => "Quan acabi la permanència, el " + d + "." + (pen ? " Així evites la penalització de " + pen + "." : ""),
      iBankX: (x, y) => "Demana igualar " + x + "/mes o la tarifa " + y + "; si no, sol·licita la baixa.",
      iSteps2: ["Contracta el nou proveïdor.", "Rep i activa el nou datàfon.", "Demana per escrit la baixa de l'anterior.", "Si el teu datàfon actual és de lloguer, torna'l."],
      prog: (i, n) => i + " de " + n, pre: "Pagues", post: "de més", one: x => x + "/mes",
      instant: "A l'instant", months: n => "≈ " + n + (n === 1 ? " mes" : " mesos"), cheap: n => "tarifes et surten més barates",
      ref: (v, s) => "La comissió mitjana dels bancs a Espanya és del " + v + "\u00a0% (" + s + "Banc d'Espanya). No inclou quotes ni lloguer.",
      shareTxtYes: x => x + " de més per cobrar amb targeta. Calcula el teu, gratis:", shareTxtNo: "Pagues de més per cobrar amb targeta? Calcula-ho gratis:",
      shTop: "Calculadora del datàfon", shYes: "de més per cobrar amb targeta", shNo: "de cost efectiu per cobrar amb targeta", shAsk: "I tu?",
      shared: "Imatge descarregada i enllaç copiat.",
      chooseProv: "Tria el teu banc o empresa i el teu pla", banks: "Bancs", fin: "Altres empreses de datàfons", own: "Escriure els meus propis preus", own2: "El teu contracte actual",
      iSave: x => "Estalvies uns " + x + " al mes", iWait: d => "Quan acabi la permanència, el " + d + ". Així evites la penalització.", iNow: "Ja. Canviar no et costa res.", iNowCost: x => "Ja. Canviar et costa " + x + " i ho recuperes amb l'estalvi.",
      iBank1: p => "Que t'iguali " + p + " per cobrament amb targeta europea de particular.", iBank2: "Que et tregui la quota mensual i el lloguer del datàfon.", iBank3: "Que te'l doni per escrit, amb la data d'inici.",
      iSteps: ["Demana al nou proveïdor les condicions per escrit.", "Confirma que el datàfon funciona amb la teva caixa o programa de vendes.", "Activa el nou datàfon abans de donar de baixa l'antic.", "Demana la baixa per escrit i guarda'n el justificant."]
    },
    en: {
      vYes: "Yes, you are paying too much.", vNo: "No, you are fine.", noSub: "No rate saves you enough to make switching worth it.",
      payLine: (x, p) => "You save at least " + x + " a year · Recommendation for " + p,
      mes: x => "Your month: " + x + " by card", cifraSi: "You overpay each month, at least", cifraEff: "You pay out of every €100 you take by card",
      claveSi: x => "Switching rates saves you at least " + x + " a year.",
      acPagoT: "Who to switch to", acPagoL: "Ask Tiqui", acPagoB: () => "Ask", acPagoQ: "Who should I switch to?",
      acBajaT: n => "We cancel " + n + " for you", acBajaL: "We send the letter for you", acBajaB: "Start", tuBanco: "your bank",
      acFalta: { pagado: ["Find what your bank charged you", "It's on your statement or account"], perm: ["Check your minimum term", "It's in your card machine contract"],
        iva: ["Ask if you reclaim VAT", "Your accountant will know"], caja: ["Check if your till is linked", "Ask whoever sold it to you"] },
      acMezcla: ["Split your sales by card", "Your bank can give you the breakdown"], acFlojo: ["Check your quietest month", "Look at that month's statement"],
      acPersona: ["Ask for a personal review", "A person looks at your case", "Ask"], contestar: "Answer",
      barHoy: "You, today", barMedia: "Bank average, fee only", barNueva: "Recommended rate, at most",
      buena2: x => "In 2 years you save at least " + x + ".", buenaMedia: "You pay less than the bank average.",
      verDetalle: "See all the detail", ocultarDetalle: "Hide the detail",
      vFalta: n => n === 1 ? "We're missing one answer." : "We're missing some answers.", falta: l => "To give you a sure answer we need " + l + ".", y: " and ",
      faltaN: { pagado: "what your bank charged you that month", perm: "whether you have a minimum term", iva: "whether you reclaim VAT", caja: "whether your card machine is linked to your till" },
      vDuda: "We can't be sure.", duda: c => "With your answers, the saving depends on " + c + ". So we don't recommend anything.",
      dudaC: { mezcla: "which cards your customers use", flojo: "how much you sell in quieter months", tarifas: "rates we haven't been able to check yet" },
      iCostMax: (c, s) => "Costs at most " + c + " a month and saves at least " + s + " a year",
      iCost: (c, s) => "Costs " + c + " a month and saves " + s + " a year", iAltCost: c => c + "/month",
      iWait2: (d, pen) => "When your minimum term ends, in " + d + "." + (pen ? " That way you avoid the " + pen + " penalty." : ""),
      iBankX: (x, y) => "Ask them to match " + x + "/month or the " + y + " rate; if not, request cancellation.",
      iSteps2: ["Sign up with the new provider.", "Receive and activate the new card machine.", "Cancel the previous one in writing.", "If your current card machine is rented, return it."],
      prog: (i, n) => i + " of " + n, pre: "You pay", post: "too much", one: x => x + "/month",
      instant: "Straight away", months: n => "≈ " + n + (n === 1 ? " month" : " months"), cheap: n => "rates are cheaper for you",
      ref: (v, s) => "The average bank fee in Spain is " + v + "\u00a0% (" + s + "Bank of Spain). It excludes monthly fees and rental.",
      shareTxtYes: x => x + " too much to take card payments. Check yours, free:", shareTxtNo: "Paying too much for card payments? Check for free:",
      shTop: "Card terminal calculator", shYes: "too much to take card payments", shNo: "effective cost of card payments", shAsk: "What about you?",
      shared: "Image downloaded and link copied.",
      chooseProv: "Choose your bank or company and plan", banks: "Banks", fin: "Other card machine companies", own: "Enter my own prices", own2: "Your current contract",
      iSave: x => "You save about " + x + " a month", iWait: d => "When your minimum term ends, in " + d + ". That way you avoid the penalty.", iNow: "Now. Switching costs you nothing.", iNowCost: x => "Now. Switching costs you " + x + " and the saving pays it back.",
      iBank1: p => "To match " + p + " per payment on European consumer cards.", iBank2: "To drop the monthly fee and the terminal rental.", iBank3: "To put it in writing, with a start date.",
      iSteps: ["Ask the new provider for the terms in writing.", "Check that the terminal works with your till or sales software.", "Activate the new terminal before cancelling the old one.", "Cancel in writing and keep the receipt."]
    }
  };
  const T = () => TX[lang()];

  const SIM = PLANS.filter(p => p.sim === "Sí");
  const SEP = () => lang() === "en" ? [",", "."] : [".", ","];
  const grp = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, SEP()[0]);
  const eur = (x, d = 0) => { const v = (Math.round(Math.abs(x) * 10**d) / 10**d).toFixed(d).split("."); const n = grp(v[0]) + (d ? SEP()[1] + v[1] : ""); return (x < 0 ? "−" : "") + (lang() === "en" ? "€" + n : n + "\u00a0€"); };
  const pct = x => (x * 100).toFixed(2).replace(".", SEP()[1]) + "\u00a0%";
  const num = s => {
    if (s == null) return null; s = String(s).trim().replace(/\s|€|%/g, ""); if (s === "") return null;
    if (/^\d{1,3}(,\d{3})+$/.test(s) || /^\d{1,3}(,\d{3})+\.\d+$/.test(s)) s = s.replace(/,/g, "");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(",", ".");
    const v = parseFloat(s); return isFinite(v) ? v : null; };
  const numPct = s => { if (s == null) return null; s = String(s).trim().replace(",", "."); if (s === "") return null; const v = parseFloat(s); return isFinite(v) ? v / 100 : null; };
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hdrOff = () => { const h = document.querySelector(".hdr"); return (h ? h.getBoundingClientRect().height : 0) + 16; };
  function goTo(el, smooth){ window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.pageYOffset - hdrOff()), behavior: smooth && !reduced() ? "smooth" : "auto" }); }
  function keepTop(el){ if (el.getBoundingClientRect().top < hdrOff()) goTo(el, false); }

  const SECT = [
    [{es:"Bar o cafetería",ca:"Bar o cafeteria",en:"Bar or café"},"Bar o restaurante"],
    [{es:"Restaurante",ca:"Restaurant",en:"Restaurant"},"Bar o restaurante"],
    [{es:"Peluquería o barbería",ca:"Perruqueria o barberia",en:"Hair salon or barber"},"Peluquería o estética"],
    [{es:"Estética, uñas o spa",ca:"Estètica, ungles o spa",en:"Beauty, nails or spa"},"Peluquería o estética"],
    [{es:"Tienda de ropa o calzado",ca:"Botiga de roba o calçat",en:"Clothing or shoe shop"},"Comercio"],
    [{es:"Alimentación",ca:"Alimentació",en:"Food shop"},"Comercio"],
    [{es:"Farmacia u óptica",ca:"Farmàcia o òptica",en:"Pharmacy or optician"},"Comercio"],
    [{es:"Otra tienda",ca:"Una altra botiga",en:"Other shop"},"Comercio"],
    [{es:"Taller o reparaciones",ca:"Taller o reparacions",en:"Workshop or repairs"},"Otro"],
    [{es:"Clínica o consulta",ca:"Clínica o consulta",en:"Clinic or practice"},"Otro"],
    [{es:"Alojamiento",ca:"Allotjament",en:"Accommodation"},"Otro"],
    [{es:"Otro",ca:"Un altre",en:"Other"},"Otro"]
  ];
  const LOCK = [
    [{es:"No, tecleo el importe",ca:"No, escric l'import",en:"No, I type the amount"},"No"],
    [{es:"Sí, el importe llega solo",ca:"Sí, l'import arriba sol",en:"Yes, the amount comes through by itself"},"Sí"],
    [{es:"No lo sé",ca:"No ho sé",en:"I don't know"},"No sé"]
  ];
  const PROVS = [["SumUp","SumUp"],["CaixaBank","CaixaBank"],["BBVA","BBVA"],["Santander-Getnet","Santander"],["Sabadell","Sabadell"],["Revolut","Revolut"],["Square","Square"]]
    .filter(([v]) => SIM.some(p => p.prov === v));
  const chip = (lab, val) => '<button type="button" class="chip" aria-pressed="false" data-v="' + val + '">' + L(lab) + '</button>';
  const press = b => b.parentElement.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", x === b));
  const unpress = el => el.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", "false"));

  const pp = $("calc"), steps = [...pp.querySelectorAll(":scope > .q")], NS = steps.length, prov = $("pProv"), P = {};
  $("pSectorChips").innerHTML = SECT.map(([lab, val]) => chip(lab, val)).join("");
  $("pLockChips").innerHTML = LOCK.map(([lab, val]) => chip(lab, val)).join("");
  $("pProvChips").innerHTML = PROVS.map(([v, lab]) => chip(same(lab), v)).join("")
    + chip({es:"Otro",ca:"Un altre",en:"Other"}, "OTRO") + chip({es:"Escribir mis precios",ca:"Escriure els meus preus",en:"Enter my own prices"}, "CONTRATO");
  function fillSelect(){
    const v = prov.value, t = T();
    prov.innerHTML = '<option value="">' + t.chooseProv + '</option>' + [[t.banks, SIM.filter(p => p.tipo === "Banco")], [t.fin, SIM.filter(p => p.tipo !== "Banco")]]
      .map(([g, l]) => '<optgroup label="' + g + '">' + l.slice().sort((a, b) => a.plan.localeCompare(b.plan, "es")).map(p => '<option value="' + p.id + '">' + p.plan + '</option>').join("") + '</optgroup>').join("")
      + '<option value="CONTRATO">' + t.own + '</option>';
    prov.value = v;
  }
  function vals(){
    const s = ["pPart","pEmp","pNoe","pAmex","pBiz"].map(id => num($(id).value) || 0);
    return { s, V: s.reduce((a, b) => a + b, 0), ops: num($("pOps").value) || 0 };
  }
  // Lo que hace falta para seguir: sin una respuesta no se avanza («No lo sé» es una respuesta, pero luego no se recomienda nada)
  const mixDuda = () => { const s = vals().s; return s[0] > 0 && s.slice(1).every(x => !(x > 0)); };
  const nd = () => P.pNd === "Más" ? (num($("pNdN").value) || 0) : (+P.pNd || 0);
  const flojo = () => num($("pFlojo").value) || 0;
  const permOK = () => P.pPermS === "No" || P.pPermS === "No sé" || (P.pPermS === "Sí" && !!$("pPermM").value && !!$("pPermY").value && num($("pPen").value) !== null);
  const stepOK = i => i === 0 ? vals().V > 0 && (!mixDuda() || !!P.pMix)
    : i === 1 ? vals().ops > 0 && nd() > 0
    : i === 2 ? P.pEst === "Igual" || (P.pEst === "Flojo" && flojo() > 0)
    : i === 3 ? num($("pPaid").value) > 0 || !!pp.querySelector('[data-paid-no][aria-pressed="true"]')
    : i === 5 ? permOK() : true;
  function navState(){ $("pMixQ").hidden = !mixDuda(); steps.forEach((st, i) => st.querySelectorAll("[data-pnext]").forEach(b => b.disabled = !stepOK(i))); }
  let pi = 0, advT = 0;
  function showStep(i, focus){
    clearTimeout(advT);
    pi = Math.max(0, Math.min(NS - 1, i));
    steps.forEach((st, j) => st.hidden = j !== pi);
    navState();
    if (focus && last && !$("res").hidden) { tok++; hideOut(); }
    if (focus) { keepTop(pp); steps[pi].querySelector("h2").focus({ preventScroll: true }); }
  }
  const next = i => { if (i >= NS - 1) run(precisaInput()); else showStep(i + 1, true); };
  function answered(i){ clearTimeout(advT); navState(); }
  const provSub = which => { $("pPlanChips").hidden = which !== "plan"; prov.hidden = which !== "sel"; $("pContract").hidden = $("pContractNext").hidden = which !== "own"; };

  pp.addEventListener("click", e => {
    if (e.target.closest("[data-pback]")) { showStep(pi - 1, true); return; }
    const n = e.target.closest("[data-pnext]"); if (n) { if (!n.disabled) next(pi); return; }
    const no = e.target.closest("[data-paid-no]");
    if (no) { no.setAttribute("aria-pressed", "true"); $("pPaid").value = ""; navState(); answered(3); return; }
    const b = e.target.closest(".chip[data-v]"); if (!b) return;
    const name = b.parentElement.dataset.name; if (!name) return;
    press(b);
    const v = b.dataset.v;
    if (name === "prov") {
      unpress($("pPlanChips"));
      if (v === "OTRO") { P.cur = prov.value && prov.value !== "CONTRATO" ? prov.value : undefined; provSub("sel"); if (P.cur) answered(pi); else prov.focus(); return; }
      if (v === "CONTRATO") { P.cur = "CONTRATO"; provSub("own"); const f = $("cP"); if (f) f.focus({ preventScroll: true }); return; }
      const plans = SIM.filter(p => p.prov === v);
      if (plans.length === 1) { P.cur = plans[0].id; provSub(null); answered(pi); return; }
      P.cur = undefined;
      $("pPlanChips").innerHTML = plans.map(p => chip(same(p.plan), p.id)).join(""); provSub("plan"); return;
    }
    if (name === "plan") { P.cur = v; answered(pi); return; }
    P[name] = v;
    if (name === "pEst") { $("pFlojoQ").hidden = v !== "Flojo"; if (v === "Flojo") $("pFlojo").focus(); }
    if (name === "pNd") { $("pNdMas").hidden = v !== "Más"; if (v === "Más") $("pNdN").focus(); }
    if (name === "pPermS") $("pPermMore").hidden = v !== "Sí";
    if (name === "pLock") { $("pLockMore").hidden = $("pLockNext").hidden = v !== "Sí"; if (v === "Sí") return; }
    answered(pi);
  });
  prov.addEventListener("change", () => {
    P.cur = prov.value || undefined;
    if (P.cur === "CONTRATO") { provSub("own"); return; }
    if (P.cur) answered(pi);
  });
  pp.addEventListener("input", e => {
    if (e.target.id === "pPaid") pp.querySelector("[data-paid-no]").setAttribute("aria-pressed", "false");
    navState();
  });
  pp.addEventListener("keydown", e => {
    if (e.key !== "Enter" || e.target.tagName !== "INPUT") return;
    e.preventDefault();
    const b = [...steps[pi].querySelectorAll("[data-pnext]")].find(x => x.offsetParent !== null);
    if (b && !b.disabled) b.click();
  });
  function precisaInput(){
    const v = vals(), V = v.V, w = v.s.map(x => x / V);
    const contrato = P.cur === "CONTRATO" ? { rp:numPct($("cP").value), re:numPct($("cE").value), rn:numPct($("cN").value), ra:numPct($("cA").value), rb:numPct($("cB").value),
      f:num($("cF").value) || 0, cuota:num($("cQ").value) || 0, alq:num($("cL").value) || 0 } : null;
    const lock = P.pLock === "Sí", perm = P.pPermS === "Sí";
    // Lo que no se sabe no se supone: se apunta en seg.faltan y entonces no se recomienda nada
    const faltan = [];
    if (!(num($("pPaid").value) > 0)) faltan.push("pagado");
    if (P.pPermS !== "No" && !(perm && $("pPermM").value && $("pPermY").value)) faltan.push("perm");
    if (P.pIva === "No sé" || !P.pIva) faltan.push("iva");
    if (P.pLock === "No sé" || !P.pLock || (lock && num($("pCaja").value) === null)) faltan.push("caja");
    const seg = { faltan, mezcla: mixDuda() && P.pMix !== "Sí" ? "desconocida" : "conocida", flojo: P.pEst === "Flojo" ? flojo() : null };
    const I = { V, T: V / v.ops, wP:w[0], wE:w[1], wN:w[2], wA:w[3], wB:w[4], NP:.025, BZ:.005, PROMO:true, IVAQ:false, IVA:.21, CTA:true,
      ND: nd() || 1, nF:0, pF:1, PEN: perm ? (num($("pPen").value) || 0) : 0, MREM: perm ? (num($("pPerm").value) || 0) : 0, CAJA: lock ? (num($("pCaja").value) || 0) : 0, seg,
      cur: P.cur, curCost: num($("pPaid").value) || 0, sector: P.pSector, cons:0, forma: P.pForma || null, incBaja:false, maxDias:null, swLock: lock,
      swF: num($("pSwF").value) || 0, swNew: num($("pSwN").value) || 0, contrato };
    if (P.pIva === "Sí") I.IVA = 0;
    return I;
  }

  // ---------- resultado (en el mismo sitio)
  let last = null, tok = 0;
  const hideOut = () => { ["res","pay","informe","resLoad"].forEach(id => $(id).hidden = true); $("shareMsg").hidden = true; $("contacto").hidden = true; };
  function run(I){
    const v = vals();
    if (!(v.V > 0 && v.ops > 0 && P.cur && P.pSector)) { showStep(!(v.V > 0) ? 0 : !(v.ops > 0) ? 1 : !P.cur ? 4 : 6, true); return; }
    const S = seguro(I); if (!S) return;
    last = { kind: "precisa", I, R: S.R, S };
    tok++; hideOut();
    fill(); $("res").hidden = false; $("pay").hidden = true; // el informe de 4 € ya no se ofrece: lo sustituye Tiqui
    $("rVerdict").focus({ preventScroll: true });
    requestAnimationFrame(() => goTo($("res"), true));
  }
  const lista = (xs, t) => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + t.y + xs[xs.length - 1];
  // Resultado con el mismo orden que «Mi banco»: el mes leído, la frase de Tiqui, la cifra, lo importante,
  // qué hacer ahora (3 como mucho), las barras de lo que pagas por cada 100 €, una buena noticia, compartir y el detalle.
  const LOGOS = { "BBVA": "bancos/bbva", "CaixaBank": "bancos/caixabank", "Santander-Getnet": "bancos/santander", "Sabadell": "bancos/sabadell",
    "Bankinter": "bancos/bankinter", "Unicaja": "bancos/unicaja", "Cajamar": "bancos/cajamar", "Abanca": "bancos/abanca", "Ibercaja": "bancos/ibercaja",
    "Revolut": "bancos/revolut", "SumUp": "sumup", "Zettle": "zettle" };
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  function irAPaso(i){ tok++; hideOut(); pp.hidden = false; showStep(i, true); goTo(pp, true); }
  function fill(){
    const { I, R, S } = last, t = T(), b = R && R.best, yes = S.estado === "si", no = S.estado === "no";
    const wait = yes && (I.MREM || 0) > 0 && b.neto24_espera > b.neto24;
    const sabe = I.curCost > 0 && I.V > 0, hoy = sabe ? I.curCost / I.V * 100 : null, ref = REFERENCIA;
    // 1 y 2: el mes y la frase de Tiqui
    $("rMes").textContent = t.mes(eur(I.V));
    $("rVerdict").textContent = yes ? t.vYes : no ? t.vNo : S.estado === "falta" ? t.vFalta(S.faltan.length) : t.vDuda;
    // 3: la cifra (lo que pagas de más al mes, como mínimo; si no compensa, lo que pagas por cada 100 €)
    $("rHero").hidden = !(yes || sabe);
    $("rPre").textContent = yes ? t.cifraSi : t.cifraEff;
    $("rBig").textContent = yes ? eur(Math.max(0, b.ahorro_m)) : sabe ? eur(hoy, 2) : "";
    // 4: lo importante (azul claro si es buena noticia, ámbar si hay algo que hacer)
    const clave = $("rNo");
    clave.dataset.ok = no ? "si" : "no";
    clave.textContent = yes ? t.claveSi(eur(anual(R))) : no ? t.noSub : S.estado === "falta" ? t.falta(lista(S.faltan.map(k => t.faltaN[k]), t)) : t.duda(lista(S.causas.map(k => t.dudaC[k]), t));
    // 5: qué hacer ahora
    const acc = [];
    if (yes) {
      // «A quién cambiarte» lo contesta Tiqui (assets/extracto/tiqui.js), con sinceridad; ya no hay informe de 4 €
      acc.push({ t: t.acPagoT, l: t.acPagoL, b: t.acPagoB(), fn: () => document.dispatchEvent(new CustomEvent("fh-tiqui-preguntar", { detail: t.acPagoQ })) });
      const plan = PLANS.find(p => p.id === I.cur), prov = plan ? plan.prov : "";
      const nombre = prov === "Santander-Getnet" ? "Santander" : prov;
      acc.push({ logo: LOGOS[prov] ? "/assets/logos/" + LOGOS[prov] + ".png" : null, t: t.acBajaT(nombre || t.tuBanco), l: t.acBajaL, b: t.acBajaB, fn: () => { const a = $("rBajaA"); if (a) location.href = a.href; } });
    } else if (S.estado === "falta") {
      const paso = { pagado: 3, perm: 5, iva: 8, caja: 9 };
      for (const k of S.faltan) acc.push({ t: t.acFalta[k][0], l: t.acFalta[k][1], b: t.contestar, fn: () => irAPaso(paso[k]) });
    } else if (S.estado === "duda") {
      if (S.causas.indexOf("mezcla") >= 0) acc.push({ t: t.acMezcla[0], l: t.acMezcla[1], b: t.contestar, fn: () => irAPaso(0) });
      if (S.causas.indexOf("flojo") >= 0) acc.push({ t: t.acFlojo[0], l: t.acFlojo[1], b: t.contestar, fn: () => irAPaso(2) });
      if (S.causas.indexOf("tarifas") >= 0) acc.push({ t: t.acPersona[0], l: t.acPersona[1], b: t.acPersona[2], fn: () => $("ctaBtn").click() });
    }
    const ul = $("rAcciones"); ul.textContent = "";
    acc.slice(0, 3).forEach(a => {
      const li = el("li", "r3-ac");
      if (a.logo) { const ic = el("img", "r3-ac-logo"); ic.alt = ""; ic.width = 40; ic.height = 40; ic.decoding = "async"; ic.src = a.logo; ic.addEventListener("error", () => ic.remove()); li.appendChild(ic); }
      const m = el("div", "r3-ac-m"); m.appendChild(el("p", "r3-ac-t", a.t)); m.appendChild(el("p", "r3-ac-l", a.l)); li.appendChild(m);
      const btn = el("button", "r3-btn", a.b); btn.type = "button"; btn.addEventListener("click", a.fn); li.appendChild(btn);
      ul.appendChild(li);
    });
    $("rHacer").hidden = !acc.length;
    // 6: barras de lo que pagas por cada 100 € (tú hoy, la media de los bancos y, si compensa, la tarifa recomendada como mucho)
    const barras = [];
    if (sabe) barras.push({ n: t.barHoy, v: hoy });
    if (sabe && ref) barras.push({ n: t.barMedia, v: ref.valor });
    if (yes && b.tasa_max != null) barras.push({ n: t.barNueva, v: b.tasa_max * 100 });
    const lb = $("rBarras"); lb.textContent = "";
    const maximo = Math.max(...barras.map(x => x.v), 0.01);
    for (const x of barras) {
      const li = el("li"), caja = el("div", "r3-bar");
      const fila = el("span", "r3-bar-f"); fila.appendChild(el("span", "r3-bar-n", x.n)); fila.appendChild(el("span", "r3-bar-v", eur(x.v, 2)));
      const pista = el("span", "r3-bar-p"), lleno = el("span", "r3-bar-l"); lleno.style.width = Math.max(2, Math.round(x.v / maximo * 100)) + "%";
      pista.appendChild(lleno); caja.appendChild(fila); caja.appendChild(pista); li.appendChild(caja); lb.appendChild(li);
    }
    $("rCien").hidden = barras.length < 2;
    // 7: una buena noticia
    const buena = yes ? t.buena2(eur(Math.max(0, wait ? b.neto24_espera : b.neto24))) : no && sabe && ref && hoy < ref.valor ? t.buenaMedia : "";
    $("rBuena").textContent = buena; $("rBuenas").hidden = !buena;
    // 8: compartir (solo con una respuesta segura) y el detalle
    $("rShare").hidden = !yes && !no;
    $("rDetalle").hidden = true; $("rVerDetalle").setAttribute("aria-expanded", "false"); $("rVerDetalle").textContent = t.verDetalle;
    $("rFacts").hidden = !yes;
    const cmp = $("rEff").closest(".cmp"); if (cmp) cmp.hidden = !sabe;
    $("rVerDetalle").hidden = !yes && !sabe;
    if (yes) {
      $("f24").textContent = eur(Math.max(0, wait ? b.neto24_espera : b.neto24));
      const pb = b.payback;
      $("fPay").textContent = typeof pb === "number" ? (pb < 1 ? t.instant : t.months(Math.ceil(pb))) : "—";
      $("fCheap").textContent = S.ok.length;
      $("fCheapK").textContent = t.cheap(SIM.length);
    }
    $("rEff").textContent = sabe ? eur(hoy, 2) : "—";
    $("rRef").hidden = !ref;
    if (ref) $("rRef").textContent = t.ref(String(ref.valor).replace(".", ","), ref.periodo ? ref.periodo + ", " : "");
    if (yes) $("payLine").textContent = t.payLine(eur(anual(R)), precio());
    // El resultado nuevo de Mi datáfono (assets/datafono-resultado.js) se monta con estos mismos datos
    document.dispatchEvent(new CustomEvent("fh-datafono", { detail: { I, R, S, PLANS } }));
    if (!$("informe").hidden && last.I) fillInforme();
  }
  $("rVerDetalle").addEventListener("click", () => {
    const d = $("rDetalle"), abrir = d.hidden, t = T();
    d.hidden = !abrir; $("rVerDetalle").setAttribute("aria-expanded", String(abrir)); $("rVerDetalle").textContent = abrir ? t.ocultarDetalle : t.verDetalle;
    if (abrir) d.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "nearest" });
  });
  async function shareCard(){
    if (!last) return;
    const t = T(), yes = last.S.estado === "si", url = location.origin + location.pathname;
    const fig = yes ? t.one(eur(Math.max(0, last.R.best.ahorro_m))) : null;
    const big = fig || $("rEff").textContent, line = fig ? t.shYes : t.shNo, text = fig ? t.shareTxtYes(fig) : t.shareTxtNo;
    const c = document.createElement("canvas"); c.width = 1080; c.height = 1080;
    const x = c.getContext("2d");
    try { await document.fonts.ready; } catch(_) {}
    const TXT = '"Atkinson Hyperlegible Next", system-ui, sans-serif', HEAD = 'Fredoka, ui-rounded, system-ui, sans-serif';
    x.fillStyle = "#FFF8EC"; x.fillRect(0, 0, 1080, 1080);
    const L0 = 260, R0 = 860, T0 = 300, B0 = 880, SC = 0.3, BW = 22 * SC, INK = "#14213D";
    x.fillStyle = "#FFFDF7"; x.fillRect(L0, T0, R0 - L0, B0 - T0);
    x.fillStyle = INK; x.fillRect(L0, T0, R0 - L0, BW); x.fillRect(L0, T0, BW, B0 - T0); x.fillRect(R0 - BW, T0, BW, B0 - T0);
    x.lineWidth = BW; x.strokeStyle = INK; x.lineCap = "round"; x.lineJoin = "round";
    const NZ = Math.round((R0 - L0) / (81 * SC)), ZW = (R0 - L0) / NZ, ZH = 40 * SC; x.beginPath(); x.moveTo(L0, B0);
    for (let k = 0; k < NZ; k++) { x.lineTo(L0 + k * ZW + ZW / 2, B0 + ZH); x.lineTo(L0 + (k + 1) * ZW, B0); }
    x.stroke();
    const pieza = async (sel, dx, dy, w) => { const el = document.querySelector(sel); if (!el) return; try { const im = new Image(); im.src = el.currentSrc || el.src; await im.decode(); x.drawImage(im, dx, dy, w, w * im.naturalHeight / im.naturalWidth); } catch(_) {} };
    await pieza("img.dog-head", L0 - 560 * SC, T0 - 132 * SC, 582 * SC);
    await pieza("img.dog-tail", R0 + 105 * SC - 223 * SC, T0 - 132 * SC, 223 * SC);
    await pieza("img.dog-paws", R0 + 22 * SC - 280 * SC, B0 + 40 * SC, 280 * SC);
    x.textAlign = "center";
    x.fillStyle = "#4A5468"; x.font = "600 26px " + TXT; x.fillText(t.shTop.toUpperCase(), 540, T0 + 90);
    x.setLineDash([12, 10]); x.lineWidth = 3; x.strokeStyle = "rgba(20,33,61,.35)";
    x.beginPath(); x.moveTo(L0 + 50, T0 + 130); x.lineTo(R0 - 50, T0 + 130); x.stroke();
    x.fillStyle = "#14213D"; x.font = "600 44px " + HEAD; x.fillText("TOTAL", 540, T0 + 210);
    x.fillStyle = "#0E5E6F"; let size = 120; x.font = "600 " + size + "px " + HEAD;
    while (x.measureText(big).width > 560 && size > 50) { size -= 6; x.font = "600 " + size + "px " + HEAD; }
    x.fillText(big, 540, T0 + 340);
    x.fillStyle = "#14213D"; x.font = "400 34px " + TXT; x.fillText(line, 540, T0 + 410);
    x.beginPath(); x.moveTo(L0 + 50, T0 + 460); x.lineTo(R0 - 50, T0 + 460); x.stroke(); x.setLineDash([]);
    x.fillStyle = "#4A5468"; x.font = "400 30px " + TXT; x.fillText(t.shAsk, 540, T0 + 520); x.fillText(location.host + location.pathname, 540, T0 + 562);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    if (!blob) return;
    const file = new File([blob], "resultado-datafono.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: text + " " + url }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    try { await navigator.clipboard.writeText(text + " " + url); } catch(_) {}
    $("shareMsg").textContent = t.shared; $("shareMsg").hidden = false;
  }
  $("rShare").addEventListener("click", shareCard);
  const change = () => { tok++; hideOut(); pp.hidden = false; showStep(0, false); goTo(pp, true); steps[0].querySelector("h2").focus({ preventScroll: true }); };
  $("rChange").addEventListener("click", change);

  // ---------- informe de pago (configuración en PAGO, al principio del archivo)
  const PRUEBA = /[?&]prueba=1(&|$)/.test(location.search);
  const PAGABLE = PAGO.activo || PRUEBA;
  const KEY = "nc-calc";
  const precio = () => eur(PAGO.precio);
  const anual = R => Math.max(0, R.best.ahorro_m * 12);
  const ofrecer = x => x.S.estado === "si" && anual(x.R) >= PAGO.umbralAhorro;
  $("paySoon").hidden = PAGABLE;
  $("payOk").addEventListener("change", () => { $("payBtn").disabled = !(PAGABLE && $("payOk").checked); });
  $("payBtn").addEventListener("click", () => {
    if (!PAGABLE || !$("payOk").checked || !last) return;
    try { sessionStorage.setItem(KEY, JSON.stringify({ I: last.I, ruta: location.pathname })); } catch(_) {}
    location.href = PAGO.enlace;
  });
  function fillInforme(){
    const { I, R, S } = last, t = T(), b = R.best;
    const name = p => p.id === "CONTRATO" ? t.own2 : p.plan;
    // lo que cuesta cada tarifa en el peor de los casos posibles (con un solo caso, lo que cuesta)
    const mes = r => eur(Math.max(0, (r.ano2_max != null ? r.ano2_max : r.ano2) / 12));
    $("iPlan").textContent = name(b.p);
    $("iSave").textContent = (S.casos > 1 ? t.iCostMax : t.iCost)(mes(b), eur(anual(R)));
    $("iAlts").innerHTML = R.ranked.filter(r => r.p.id !== b.p.id && !r.es_actual).slice(0, 2).map(r => '<li><b>' + name(r.p) + '</b> · ' + t.iAltCost(mes(r)) + '</li>').join("");
    const wait = (I.MREM || 0) > 0 && b.neto24_espera > b.neto24;
    if (wait) { const d = new Date(); d.setMonth(d.getMonth() + I.MREM); $("iWhen").textContent = t.iWait2(d.toLocaleDateString({ es:"es-ES", ca:"ca-ES", en:"en-GB" }[lang()], { month:"long", year:"numeric" }), I.PEN > 0 ? eur(I.PEN) : ""); }
    else $("iWhen").textContent = b.coste_cambio > 0 ? t.iNowCost(eur(b.coste_cambio)) : t.iNow;
    $("iBank").textContent = t.iBankX(mes(b), name(b.p));
    $("iSteps").innerHTML = t.iSteps2.map(s => '<li>' + s + '</li>').join("");
  }
  $("iPrint").addEventListener("click", () => window.print());
  $("ctaBtn").addEventListener("click", e => {
    e.preventDefault();
    $("contacto").hidden = false;
    requestAnimationFrame(() => { goTo($("contacto"), true); const f = $("ct-n"); if (f) f.focus({ preventScroll: true }); });
  });

  document.addEventListener("nc-lang", () => { fillSelect(); if (last && !$("res").hidden) fill(); if (last && !$("informe").hidden && !$("iBody").hidden) fillInforme(); });
  fillSelect(); showStep(0, false);

  // Vuelta desde el pago (?pago=ok): informe completo en lugar de las preguntas.
  const qs = new URLSearchParams(location.search);
  if (qs.get("pago") === "ok") {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(KEY)); } catch(_) {}
    // Stripe vuelve a /es/ (redirige a /datafono/): si se pagó desde /ca/datafon/ o /en/card-machine/, el informe se muestra en ese idioma.
    const ruta = saved && typeof saved.ruta === "string" ? saved.ruta : "";
    const cual = p => /\/(es\/ca|ca\/datafon)\/(index\.html)?$/.test(p) ? "ca" : /\/(es\/en|en\/card-machine)\/(index\.html)?$/.test(p) ? "en" : "";
    const idioma = cual(ruta), aqui = cual(location.pathname);
    if (idioma && idioma !== aqui) {
      location.replace((idioma === "ca" ? "/ca/datafon/" : "/en/card-machine/") + "?pago=ok"); return;
    }
    try { history.replaceState(null, "", location.pathname); } catch(_) {}
    pp.hidden = true;
    const S = saved && saved.I ? seguro(saved.I) : null, R = S && S.estado === "si" ? S.R : null;
    if (R) { last = { kind: "precisa", I: saved.I, R, S }; fillInforme(); }
    $("iBody").hidden = !R; $("iMissing").hidden = !!R;
    $("informe").hidden = false;
    try { sessionStorage.removeItem(KEY); } catch(_) {}
    requestAnimationFrame(() => goTo($("informe"), false));
  }
}

// ---------- tarifas: /data/tarifas-datafono.json con copia de respaldo en la página (RESPALDO)
(function cargarTarifas(){
  if (!document.getElementById("calcApp")) return;
  const URL_T = "/data/tarifas-datafono.json", URL_T2 = "data/tarifas-datafono.json", LIMITE = 2500;
  const MESES = {
    es: ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"],
    ca: ["gener","febrer","març","abril","maig","juny","juliol","agost","setembre","octubre","novembre","desembre"],
    en: ["January","February","March","April","May","June","July","August","September","October","November","December"]
  };
  const lang = () => ["es","ca","en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
  const fecha = (s, l) => {
    const [y, m, d] = String(s).split("-").map(Number); if (!(d && m)) return s;
    l = l || lang(); const mm = MESES[l][m - 1];
    return l === "en" ? d + " " + mm + " " + y : l === "ca" ? d + (/^[aeiou]/.test(mm) ? " d'" : " de ") + mm + " de " + y : d + " de " + mm + " de " + y;
  };
  const RES = typeof RESPALDO !== "undefined" ? RESPALDO : null;
  const FECHA_OK = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const valido = d => !!d && FECHA_OK(d.actualizado) && Array.isArray(d.planes)
    && d.planes.filter(p => p && p.id && p.prov && Array.isArray(p.inc) && p.inc.length === 4).length >= 10
    && (!RES || d.actualizado >= RES.actualizado);
  const refOK = r => r && typeof r.valor === "number" && isFinite(r.valor) ? r : null;
  let actualizado = null, hecho = false;
  const putDate = () => {
    if (!actualizado) return;
    document.querySelectorAll(".fechaTarifas").forEach(el => el.textContent = fecha(actualizado, el.dataset.fl));
    ["es","ca","en"].forEach(l => {
      const sc = document.getElementById("faq-ld-" + l); if (!sc) return;
      try { const j = JSON.parse(sc.textContent); const t = j.mainEntity[0].acceptedAnswer; t.text = t.text.replace(/(la última revisión es del|l'última revisió és del|the last check was on) [^.]+\./, "$1 " + fecha(actualizado, l) + "."); sc.textContent = JSON.stringify(j); } catch(_) {}
    });
  };
  document.addEventListener("nc-lang", putDate);
  function usar(d){
    if (hecho) return; hecho = true;
    PLANS = d.planes; actualizado = d.actualizado; REFERENCIA = refOK(d.referencia); putDate();
    iniciarUI();
  }
  if (!RES) {
    fetch(URL_T, { cache: "no-store" }).then(r => r.json()).then(d => { if (valido(d)) usar(d); }).catch(() => {});
    return;
  }
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const tope = setTimeout(() => { if (ctl) ctl.abort(); usar(RES); }, LIMITE);
  const pedir = u => fetch(u, { cache: "no-store", signal: ctl ? ctl.signal : undefined }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  pedir(URL_T).catch(e => { if (e && e.name === "AbortError") throw e; return pedir(URL_T2); })
    .then(d => { clearTimeout(tope); usar(valido(d) ? d : RES); })
    .catch(() => { clearTimeout(tope); usar(RES); });
})();

// Dudas: solo una abierta a la vez.
(function faqUna(){
  const list = document.querySelectorAll(".faq-i"); if (!list.length) return;
  list.forEach(d => d.addEventListener("toggle", () => { if (d.open) list.forEach(o => { if (o !== d && o.open) o.open = false; }); }));
})();

// Menús de la cabecera (Recursos e idioma): se cierran al pulsar fuera o con Escape.
(function menus(){
  const ds = [...document.querySelectorAll(".langdd, .navdd")]; if (!ds.length) return;
  ds.forEach(d => d.addEventListener("toggle", () => { if (d.open) ds.forEach(o => { if (o !== d) o.open = false; }); }));
  document.addEventListener("click", e => ds.forEach(d => { if (d.open && !d.contains(e.target)) d.open = false; }));
  // Recursos e idioma: también se abren al pasar el cursor (solo en dispositivos con ratón).
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) document.querySelectorAll(".navdd, .langdd").forEach(d => {
    let t;
    d.addEventListener("mouseenter", () => { clearTimeout(t); d.open = true; });
    d.addEventListener("mouseleave", () => { t = setTimeout(() => { d.open = false; }, 150); });
  });
  document.addEventListener("keydown", e => { if (e.key !== "Escape") return; ds.forEach(d => { if (d.open) { d.open = false; d.querySelector("summary").focus(); } }); });
})();

// Códigos de país ISO para los desplegables de lista de espera
const ISO_PAISES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(" ");

// ---------- página de entrada: países (añada aquí los nuevos)
const PAISES = [{codigo:"ES", nombre:"España", ruta:"/datafono/", idiomas:"Español · Català · English", activo:true}];
(function entrada(){
  const lista = document.getElementById("paises"); if (!lista) return;
  const $ = id => document.getElementById(id);
  const KEY = "nc-pais";
  const rel = r => r.replace(/^\//, "").replace(/\/$/, "/index.html");
  const activo = c => PAISES.find(p => p.codigo === c && p.activo);
  const guardar = c => { try { localStorage.setItem(KEY, c); } catch(_) {} };
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[ch]));
  lista.querySelectorAll("li[data-pais]").forEach(li => li.remove());
  const otroLi = $("otroBtn").parentElement;
  PAISES.filter(p => p.activo).forEach(p => {
    const li = document.createElement("li"); li.dataset.pais = p.codigo;
    li.innerHTML = '<a class="pais-card" href="' + esc(rel(p.ruta)) + '" data-codigo="' + esc(p.codigo) + '"><span class="flag" data-codigo="' + esc(p.codigo) + '" aria-hidden="true"></span><span class="pais-txt"><span class="pais-n">' + esc(p.nombre) + '</span> <span class="pais-l">(' + esc(p.idiomas) + ')</span></span><span class="pais-go" aria-hidden="true">→</span></a>';
    lista.insertBefore(li, otroLi);
  });
  lista.addEventListener("click", e => { const a = e.target.closest("a[data-codigo]"); if (a) guardar(a.dataset.codigo); });

  // Sugerencia: nunca redirige ni oculta la lista.
  const sugerir = (p, continuar) => {
    $("sugTxt").textContent = continuar ? "" : "Parece que está en " + p.nombre + ". ¿Cobra aquí?";
    $("sugTxt").hidden = continuar;
    $("sugBtn").textContent = (continuar ? "Continuar en " : "Sí, ir a ") + p.nombre + " →";
    $("sugBtn").href = rel(p.ruta);
    $("sugBtn").onclick = () => guardar(p.codigo);
    $("sug").hidden = false;
    lista.querySelectorAll("li[data-pais]").forEach(li => li.hidden = li.dataset.pais === p.codigo);
  };
  let previo = null; try { previo = localStorage.getItem(KEY); } catch(_) {}
  if (activo(previo)) sugerir(activo(previo), true);
  else detectar().then(c => { const p = activo(c); if (p) sugerir(p, false); });
  async function detectar(){
    try {
      const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const t = setTimeout(() => ctl && ctl.abort(), 1500);
      const r = await fetch("/cdn-cgi/trace", { cache: "no-store", signal: ctl ? ctl.signal : undefined });
      clearTimeout(t);
      if (r.ok) { const m = (await r.text()).match(/^loc=([A-Z]{2})$/m); if (m) return m[1]; }
    } catch(_) {}
    const l = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    const m = l.match(/-([A-Za-z]{2})\b/); return m ? m[1].toUpperCase() : null;
  }

  // Otro país: lista de espera (FormSubmit)
  const COD = ISO_PAISES;
  const sel = $("oPais"); let lleno = false;
  const llenar = () => {
    if (lleno) return; lleno = true;
    let dn = null; try { dn = new Intl.DisplayNames(["es"], { type: "region" }); } catch(_) {}
    COD.map(c => [c, dn ? dn.of(c) : c]).sort((a, b) => a[1].localeCompare(b[1], "es"))
      .forEach(([c, n]) => { const o = document.createElement("option"); o.value = n; o.textContent = n; sel.appendChild(o); });
  };
  $("otroBtn").addEventListener("click", () => {
    const abrir = $("otro").hidden; llenar();
    $("otro").hidden = !abrir; $("otroBtn").setAttribute("aria-expanded", abrir);
    if (abrir) sel.focus();
  });
  const f = $("otroForm");
  f.addEventListener("submit", async e => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    if (f.elements._honey.value) return;
    f.elements._subject.value = "Lista de espera · " + sel.value;
    $("otroErr").hidden = true; $("otroSend").disabled = true;
    try {
      const r = await fetch(f.action.replace("formsubmit.co/", "formsubmit.co/ajax/"), { method: "POST", headers: { Accept: "application/json" }, body: new FormData(f) });
      if (!r.ok) throw new Error(r.status);
      f.hidden = true; $("otroOk").hidden = false; $("otroOk").focus();
    } catch(_) { $("otroErr").hidden = false; }
    finally { $("otroSend").disabled = false; }
  });
})();

// Formulario de /contacto/ (FormSubmit)
(function contacto(){
  const f = document.getElementById("contactoForm"); if (!f) return;
  const $ = id => document.getElementById(id);
  f.addEventListener("submit", async e => {
    e.preventDefault();
    if (!f.reportValidity() || f.elements._honey.value) return;
    $("cErr").hidden = true; $("cSend").disabled = true;
    try {
      const r = await fetch(f.action.replace("formsubmit.co/", "formsubmit.co/ajax/"), { method: "POST", headers: { Accept: "application/json" }, body: new FormData(f) });
      if (!r.ok) throw new Error(r.status);
      f.hidden = true; $("cOk").hidden = false; $("cOk").focus();
    } catch(_) { $("cErr").hidden = false; }
    finally { $("cSend").disabled = false; }
  });
})();

// ---------- recibo: cabecera «1 de 10», líneas impresas con las respuestas y colita (solo presentación; no toca el cálculo)
(function recibo(){
  const pp = document.getElementById("calc"), wrap = document.getElementById("reciboWrap"); if (!pp || !wrap) return;
  const $ = id => document.getElementById(id);
  const lang = () => ["es","ca","en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
  const TX = {
    es: { q: "Pregunta", de: "de", ventas: "Ventas con tarjeta", cobros: "Pagos con tarjeta", anio: "Mes flojo", pagado: "Pagado al banco", prov: "Banco o empresa", perm: "Permanencia", neg: "Negocio", forma: "Forma", iva: "Recupera el IVA", imp: "Importe al datáfono", mios: "Mis precios", nada: "Sin permanencia", meses: n => n + (n === 1 ? " mes" : " meses"), edit: "Cambiar" },
    ca: { q: "Pregunta", de: "de", ventas: "Vendes amb targeta", cobros: "Pagaments amb targeta", anio: "Mes fluix", pagado: "Pagat al banc", prov: "Banc o empresa", perm: "Permanència", neg: "Negoci", forma: "Forma", iva: "Recupera l'IVA", imp: "Import al datàfon", mios: "Els meus preus", nada: "Sense permanència", meses: n => n + (n === 1 ? " mes" : " mesos"), edit: "Canviar" },
    en: { q: "Question", de: "of", ventas: "Card sales", cobros: "Card payments", anio: "Quiet month", pagado: "Paid to bank", prov: "Bank or company", perm: "Minimum term", neg: "Business", forma: "Legal form", iva: "Reclaims VAT", imp: "Amount entry", mios: "My own prices", nada: "None", meses: n => n + (n === 1 ? " month" : " months"), edit: "Change" }
  };
  const num = s => {
    if (s == null) return null; s = String(s).trim().replace(/\s|€|%/g, ""); if (s === "") return null;
    if (/^\d{1,3}(,\d{3})+$/.test(s) || /^\d{1,3}(,\d{3})+\.\d+$/.test(s)) s = s.replace(/,/g, "");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(",", ".");
    const v = parseFloat(s); return isFinite(v) ? v : null; };
  const fmt = n => { const sep = lang() === "en" ? [",", "."] : [".", ","]; const r = Math.round(n * 100) / 100; const [a, b] = String(Math.abs(r)).split("."); return (r < 0 ? "−" : "") + a.replace(/\B(?=(\d{3})+(?!\d))/g, sep[0]) + (b ? sep[1] + b.padEnd(2, "0") : ""); };
  const eur = n => lang() === "en" ? "€" + fmt(n) : fmt(n) + "\u00a0€";
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[ch]));
  const txt = el => { if (!el) return ""; const s = el.querySelector('[data-l="' + lang() + '"]'); return (s || el).textContent.trim(); };
  const on = sel => pp.querySelector(sel + ' .chip[aria-pressed="true"]');
  const steps = [...pp.querySelectorAll(":scope > .q")], N = steps.length;
  const LAB = ["ventas","cobros","anio","pagado","prov","perm","neg","forma","iva","imp"];
  const CORTO = { es: ["Ventas tarjeta","Nº pagos","Mes flojo","Pagado","Banco","Permanencia","Negocio","Forma","IVA","Importe"], ca: ["Vendes targeta","Nº pagaments","Mes fluix","Pagat","Banc","Permanència","Negoci","Forma","IVA","Import"], en: ["Card sales","No. payments","Quiet month","Paid","Bank","Term","Business","Form","VAT","Entry"] };
  const valor = i => {
    const T = TX[lang()];
    if (i === 0) { const v = ["pPart","pEmp","pNoe","pAmex","pBiz"].reduce((a, id) => a + (num($(id).value) || 0), 0); return v > 0 ? eur(v) : ""; }
    if (i === 1) { const v = num($("pOps").value); return v > 0 ? fmt(v) : ""; }
    if (i === 2) { const e = on('[data-name="pEst"]'); if (!e) return ""; if (e.dataset.v !== "Flojo") return txt(e); const f = num($("pFlojo").value); return f > 0 ? eur(f) : ""; }
    if (i === 3) { const v = num($("pPaid").value); if (v > 0) return eur(v); const no = pp.querySelector('[data-paid-no][aria-pressed="true"]'); return no ? txt(no) : ""; }
    if (i === 4) { const pl = on("#pPlanChips"); if (pl) return txt(pl); const pv = on("#pProvChips"); if (!pv) return ""; if (pv.dataset.v === "CONTRATO") return T.mios; if (pv.dataset.v === "OTRO") { const s = $("pProv"); return s.value && s.selectedIndex > 0 ? s.options[s.selectedIndex].text : ""; } return txt(pv); }
    if (i === 5) { const st = on('[data-name="pPermS"]'); if (!st) return ""; if (st.dataset.v === "No") return T.nada; if (st.dataset.v !== "Sí") return txt(st);
      const m = num($("pPerm").value), p = num($("pPen").value); if (!(m > 0) && !(p > 0)) return T.nada; return [m > 0 ? T.meses(m) : "", p > 0 ? eur(p) : ""].filter(Boolean).join(" · "); }
    if (i === 6) return txt(on("#pSectorChips"));
    if (i === 7) return txt(on('[data-name="pForma"]'));
    if (i === 8) return txt(on('[data-name="pIva"]'));
    if (i === 9) return txt(on("#pLockChips"));
    return "";
  };
  const actual = () => steps.findIndex(s => !s.hidden);
  let prev = -1, raf = 0;
  function pintar(){
    raf = 0;
    const T = TX[lang()], cur = actual(), done = !$("res").hidden || !$("resLoad").hidden;
    const antes = wrap.classList.contains("done");
    wrap.hidden = pp.hidden; wrap.classList.toggle("done", done);
    if (done && !antes && !$("res").hidden) requestAnimationFrame(() => { const hd = document.querySelector(".hdr"); window.scrollTo({ top: Math.max(0, $("res").getBoundingClientRect().top + window.pageYOffset - (hd ? hd.offsetHeight : 0) - 16), behavior: "auto" }); });
    const hasta = done ? N : cur;
    let html = "";
    for (let i = 0; i < hasta; i++) { const v = valor(i); if (!v) continue; const k = T[LAB[i]];
      const ks = (CORTO[lang()] || CORTO.es)[i];
      html += '<li><button type="button" class="r-line" data-goto="' + i + '" aria-label="' + esc(k + ": " + v + ". " + T.edit) + '"><span class="r-k"><span class="kl">' + esc(k) + '</span><span class="ks">' + esc(ks) + '</span></span><span class="r-dots" aria-hidden="true"></span><span class="r-v">' + esc(v) + '</span></button></li>'; }
    $("rLines").innerHTML = html; $("rLines").hidden = !html;
    const n = Math.max(0, cur) + 1;
    $("rN").textContent = (done ? N : n) + " " + T.de + " " + N;
    $("rProg").style.width = (done ? 100 : n / N * 100) + "%";
    if (cur !== prev) {
      if (!done) $("rLive").textContent = T.q + " " + n + " " + T.de + " " + N;
      if (prev >= 0) { const tl = wrap.querySelector(".dog-tail"); if (tl) { tl.classList.remove("wag"); void tl.getBoundingClientRect(); tl.classList.add("wag"); } }
      prev = cur;
    }
  }
  const pedir = () => { if (!raf) raf = setTimeout(pintar, 0); };
  new MutationObserver(pedir).observe(pp, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "aria-pressed"] });
  ["res","resLoad"].forEach(id => new MutationObserver(pedir).observe($(id), { attributes: true, attributeFilter: ["hidden"] }));
  new MutationObserver(pedir).observe(pp, { attributes: true, attributeFilter: ["hidden"] });
  pp.addEventListener("input", pedir); pp.addEventListener("change", pedir);
  pp.addEventListener("submit", e => e.preventDefault());
  $("rLines").addEventListener("click", e => {
    const b = e.target.closest("[data-goto]"); if (!b) return;
    const i = +b.dataset.goto; let cur = actual();
    if (i === cur && wrap.classList.contains("done")) { ["res","pay","resLoad"].forEach(id => $(id).hidden = true); $("shareMsg").hidden = true; }
    let guard = 0;
    while ((cur = actual()) > i && guard++ < 20) { const bk = steps[cur].querySelector("[data-pback]"); if (!bk) break; bk.click(); }
    pintar();
    const h2 = steps[actual()] && steps[actual()].querySelector("h2"); if (h2) h2.focus({ preventScroll: true });
  });
  pintar();
})();

// ---------- «¿Cobras fuera de España?»: lista de espera en ventana emergente (páginas /es/)
(function espera(){
  const dlg = document.getElementById("espera"), abridores = document.querySelectorAll("[data-espera]"); if (!dlg || !abridores.length) return;
  const $ = id => document.getElementById(id);
  const lang = ["es","ca","en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
  const sel = $("wPais"); let lleno = false;
  const llenar = () => {
    if (lleno) return; lleno = true;
    let dn = null; try { dn = new Intl.DisplayNames([lang], { type: "region" }); } catch(_) {}
    ISO_PAISES.map(c => dn ? dn.of(c) : c).sort((a, b) => a.localeCompare(b, lang))
      .forEach(n => { const o = document.createElement("option"); o.value = n; o.textContent = n; sel.appendChild(o); });
  };
  const cerrar = () => { if (dlg.open) { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); } };
  abridores.forEach(b => b.addEventListener("click", e => { e.preventDefault(); const dd = b.closest("details"); if (dd) dd.open = false; llenar(); if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); sel.focus(); }));
  $("esperaX").addEventListener("click", cerrar);
  dlg.addEventListener("click", e => { if (e.target === dlg) cerrar(); });
  const f = $("wForm");
  f.addEventListener("submit", async e => {
    e.preventDefault();
    if (!f.reportValidity() || f.elements._honey.value) return;
    f.elements._subject.value = "Lista de espera · " + sel.value;
    $("wErr").hidden = true; $("wSend").disabled = true;
    try {
      const r = await fetch(f.action.replace("formsubmit.co/", "formsubmit.co/ajax/"), { method: "POST", headers: { Accept: "application/json" }, body: new FormData(f) });
      if (!r.ok) throw new Error(r.status);
      f.hidden = true; $("wOk").hidden = false; $("wOk").focus();
    } catch(_) { $("wErr").hidden = false; }
    finally { $("wSend").disabled = false; }
  });
})();

// Ayudas «?» y fecha de fin de permanencia (pasa a meses en el campo oculto pPerm)
(function ayudas(){
  document.addEventListener("click", e => {
    const b = e.target.closest(".help"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const t = document.getElementById(b.dataset.help); if (!t) return;
    t.hidden = !t.hidden; b.setAttribute("aria-expanded", !t.hidden);
  }, true);
  // Al aparecer la segunda parte (plan, lista o precios), se lleva a la vista.
  ["pPlanChips","pProv","pContract"].forEach(id => { const el = document.getElementById(id); if (!el) return;
    new MutationObserver(() => { if (!el.hidden) { const q = el.previousElementSibling && el.previousElementSibling.classList.contains("sub-q") ? el.previousElementSibling : el; requestAnimationFrame(() => { const hd = document.querySelector(".hdr"); const top = q.getBoundingClientRect().top + window.pageYOffset - (hd ? hd.offsetHeight : 0) - 12; if (q.getBoundingClientRect().top < (hd ? hd.offsetHeight : 0) || q.getBoundingClientRect().bottom > window.innerHeight - 80) window.scrollTo({ top, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }); } })
      .observe(el, { attributes: true, attributeFilter: ["hidden"] }); });
  // Siguiente: siempre lo pulsa la persona; se activa cuando la pregunta tiene respuesta.
  const form = document.getElementById("calc");
  if (form) {
    const qs = [...form.querySelectorAll(":scope > .q")];
    const num = s => { s = String(s || "").replace(/\s|€/g, "").replace(/\./g, "").replace(",", "."); const v = parseFloat(s); return isFinite(v) ? v : 0; };
    const elegido = () => { const pv = document.querySelector('#pProvChips .chip[aria-pressed="true"]'), pl = document.querySelector('#pPlanChips .chip[aria-pressed="true"]'), s = document.getElementById("pProv");
      if (pl) return true; if (!pv) return false; if (pv.dataset.v === "CONTRATO") return true; if (pv.dataset.v === "OTRO") return !!(s && s.value); return document.getElementById("pPlanChips").hidden; };
    // 0 a 2 y 5 (permanencia) los decide la calculadora (stepOK en iniciarUI)
    const caja = () => { const c = document.querySelector('#pLockChips .chip[aria-pressed="true"]'); return !!c && (c.dataset.v !== "Sí" || String(document.getElementById("pCaja").value).trim() !== ""); };
    const ok = i => i === 3 ? (num(document.getElementById("pPaid").value) > 0 || !!form.querySelector('[data-paid-no][aria-pressed="true"]'))
      : i === 4 ? elegido() : i === 9 ? caja() : i >= 6 ? !!qs[i].querySelector('.chips .chip[aria-pressed="true"]') : null;
    const upd = () => qs.forEach((q, i) => { const r = ok(i); if (r === null) return; q.querySelectorAll("[data-pnext]").forEach(b => { if (b.disabled !== !r) b.disabled = !r; }); });
    const pedir = () => setTimeout(upd, 0);
    new MutationObserver(pedir).observe(form, { subtree: true, attributes: true, attributeFilter: ["aria-pressed", "hidden"] });
    form.addEventListener("input", pedir); form.addEventListener("change", pedir); form.addEventListener("click", pedir); upd();
  }
  const m = document.getElementById("pPermM"), y = document.getElementById("pPermY"), out = document.getElementById("pPerm");
  if (!m || !y || !out) return;
  const calc = () => {
    const now = new Date();
    out.value = m.value && y.value ? String(Math.max(0, (+y.value * 12 + +m.value) - (now.getFullYear() * 12 + now.getMonth() + 1))) : "";
    out.dispatchEvent(new Event("input", { bubbles: true }));
  };
  m.addEventListener("change", calc); y.addEventListener("change", calc);
})();

// Pie de las páginas sin calculadora: fecha de las tarifas desde /data/tarifas-datafono.json (si no, se queda la escrita en la página).
(function fechaPie(){
  if (document.getElementById("calcApp")) return;
  const els = document.querySelectorAll(".fechaTarifas"); if (!els.length) return;
  const M = {es:["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"],ca:["gener","febrer","març","abril","maig","juny","juliol","agost","setembre","octubre","novembre","desembre"],en:["January","February","March","April","May","June","July","August","September","October","November","December"]};
  fetch("/data/tarifas-datafono.json", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(d => {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.actualizado)) return;
    const [y, m, dd] = d.actualizado.split("-").map(Number);
    els.forEach(el => { const l = el.dataset.fl || "es", n = M[l] || M.es, mo = n[m - 1];
      el.textContent = l === "en" ? dd + " " + mo + " " + y : l === "ca" ? dd + (/^[ao]/.test(mo) ? " d'" : " de ") + mo + " de " + y : dd + " de " + mo + " de " + y; });
  }).catch(() => {});
})();

// Portada: el nombre de cada tarjeta en una sola línea en todos los idiomas, como en español. Si en catalán o inglés
// es más largo, la letra se encoge un poco (hasta el 72 %); si aun así no cabe, se parte en dos líneas (lo que dice el CSS).
(function () {
  const ajustar = () => document.querySelectorAll(".cubo-t").forEach((t) => {
    t.style.fontSize = ""; t.style.whiteSpace = "nowrap";
    const base = parseFloat(getComputedStyle(t).fontSize);
    let f = base;
    while (t.scrollWidth > t.clientWidth + 1 && f > base * 0.72) { f -= 0.5; t.style.fontSize = f + "px"; }
    if (t.scrollWidth > t.clientWidth + 1) { t.style.fontSize = ""; t.style.whiteSpace = ""; }
  });
  if (!document.querySelector(".cubo-t")) return;
  const ya = () => { ajustar(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustar); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ya); else ya();
  let t0; addEventListener("resize", () => { clearTimeout(t0); t0 = setTimeout(ajustar, 120); });
})();

// Menú del móvil: a la derecha, las tres rayas; al pulsarlas se abre Tu Tiqui, Dar de baja y el idioma.
(function menuMovil(){
  const hdr = document.querySelector(".hdr"), r = hdr && hdr.querySelector(".hdr-r");
  if (!r || hdr.querySelector(".hdr-menu")) return;
  const L = document.documentElement.lang;
  const b = document.createElement("button");
  b.type = "button"; b.className = "hdr-menu"; r.id = r.id || "hdrMenu";
  b.setAttribute("aria-label", L === "en" ? "Menu" : "Menú");
  b.setAttribute("aria-controls", r.id); b.setAttribute("aria-expanded", "false");
  for (let i = 0; i < 3; i++) b.appendChild(document.createElement("i"));
  // los idiomas, a la vista dentro del menú (en el ordenador siguen en su desplegable)
  const ul = r.querySelector(".langdd ul");
  if (ul) {
    const fila = document.createElement("div"); fila.className = "hdr-idiomas";
    ul.querySelectorAll("a").forEach((a) => { const c = a.cloneNode(true); c.textContent = (a.getAttribute("hreflang") || a.textContent).toUpperCase(); c.setAttribute("aria-label", a.textContent); fila.appendChild(c); });
    r.appendChild(fila);
  }
  r.after(b); hdr.classList.add("hdr--menu");
  const poner = (si) => { hdr.classList.toggle("abierto", si); b.setAttribute("aria-expanded", si ? "true" : "false"); };
  b.addEventListener("click", (e) => { e.stopPropagation(); poner(!hdr.classList.contains("abierto")); });
  document.addEventListener("click", (e) => { if (hdr.classList.contains("abierto") && !r.contains(e.target)) poner(false); });
  r.addEventListener("click", (e) => { if (e.target.closest("a")) poner(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && hdr.classList.contains("abierto")) { poner(false); b.focus(); } });
  addEventListener("resize", () => { if (innerWidth > 760) poner(false); });
})();
