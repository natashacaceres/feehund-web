/* Calculadora del datáfono. Todo se calcula en el navegador: no se envía ni se guarda nada. Las tarifas se leen de /data/tarifas-datafono.json. */
// ---------- pago: configuración en un solo sitio
const PAGO = {
  enlace: "https://buy.stripe.com/3cI5kEffNfIK5r93fb2VG00",
  activo: true,
  precio: 10,
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
    plans.push({ id: "CONTRATO", prov: "Su contrato", plan: "Su contrato actual", tipo: "Contrato", modelo: "Porcentaje", sim: "Contrato", fiab: "Contrato",
      rp: d(c.rp), fp: N(c.f), re: d(c.re), fe: N(c.f), rn: d(c.rn), fn: N(c.f), ra: d(c.ra), fa: N(c.f), rb: d(c.rb), fb: N(c.f), bz: 1, minop: 0,
      inc: [0, 0, 0, 0], incb: 0, exc: null, excmin: null, cuota: N(c.cuota), cuenta: 0, alq: N(c.alq), adic: null, compra: 0, dias: null,
      pm: 0, pv: null, pn: null, sector: "Todos", aviso: "Precios de su propio contrato.", tramos: [] });
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
    if (r.es_actual) r.payback = "Es su plan";
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
      ? "una cuota fija cubre el " + Math.round(r.cubierto * 100) + " % de sus ventas con tarjeta"
      : "cobra " + pct(r.rp) + " en tarjetas europeas de particular" + (r.fp > 0 ? " + " + r.fp.toFixed(2).replace(".", ",") + " € por cobro" : " sin fijo por cobro"))
      + (I.wN >= 0.15 ? "; tarjetas de turistas: " + (r.p.modelo === "Tramos" && r.p.inc[2] === 1 ? "incluidas en la cuota" : pct(r.rn)) : "");
  });
  const ranked = rows.filter(r => r.sim).sort((x, y) => x.total2 - y.total2);
  const out = rows.filter(r => !r.sim);
  const best = ranked[0] || c;
  const eur = x => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F");
  const minimo = I.cons ? " como mínimo" : "";
  let verdict, tono;
  if (best.es_actual) { verdict = "Ya está en la opción más barata. No le compensa cambiar."; tono = "igual"; }
  else if (best.ahorro_m <= 0) {
    if (best.neto24 > 0) { verdict = "Solo compensa por la promoción de bienvenida de " + best.p.plan + ". Al acabar, pagaría unos " + eur(-best.ahorro_m) + "\u00a0€/mes más que hoy."; tono = "dudoso"; }
    else { verdict = "No compensa cambiar: ninguna opción le cuesta menos al mes que lo que paga hoy."; tono = "no"; }
  } else if (Math.max(best.neto24, best.neto24_espera) <= 0) { verdict = "No compensa: " + best.p.plan + " le ahorra " + best.ahorro_m.toFixed(2).replace(".", ",") + "\u00a0€/mes, pero en 2 años no recupera lo que cuesta cambiar."; tono = "no"; }
  else if (best.neto24_espera > best.neto24) { verdict = "Compensa, pero espere: cambie a " + best.p.plan + " cuando acabe su permanencia, en " + I.MREM + " meses, y se ahorra la penalización."; tono = "si"; }
  else { verdict = "Compensa cambiar a " + best.p.plan + ": ahorra unos " + eur(best.ahorro_m) + "\u00a0€/mes" + minimo + "."; tono = "si"; }
  return { CURANN, cur: c, best, ranked, out, verdict, tono };
}
if (typeof module !== "undefined") module.exports = { calcular };

let REFERENCIA = null;

// Título en una sola línea: reduce la letra hasta que quepa (mínimo 22 px; por debajo, deja que se parta).
(function fitTitle(){
  const h = document.querySelector(".c-hero h1"); if (!h) return;
  const MAX = 68, MIN = 22;
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
    if (document.fonts.load) document.fonts.load('400 68px "Playfair Display"').then(fit, () => {});
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
      vYes: "Sí, paga de más.", vNo: "No, está bien.", noSub: "Ninguna tarifa le ahorra lo bastante para que compense cambiar.",
      payLine: (x, p) => "Ahorro estimado: " + x + "/año · Recomendación: " + p,
      iCost: (c, s) => "Coste: " + c + "/mes · Ahorro: " + s + "/año", iAltCost: c => c + "/mes",
      iWait2: (d, pen) => "Cuando acabe su permanencia, en " + d + "." + (pen ? " Así evita la penalización de " + pen + "." : ""),
      iBankX: (x, y) => "Pida igualar " + x + "/mes o la tarifa " + y + "; si no, solicite la baja.",
      iSteps2: ["Contrate el nuevo proveedor.", "Reciba y active el nuevo datáfono.", "Pida por escrito la baja del anterior.", "Si su datáfono actual es de alquiler, devuélvalo."],
      prog: (i, n) => i + " de " + n, pre: "Paga", post: "de más", one: x => x + "/mes",
      instant: "Al instante", months: n => "≈ " + n + (n === 1 ? " mes" : " meses"), cheap: n => "de " + n + " tarifas le salen más baratas",
      ref: (v, s) => "Comisión media que cobran los bancos en España: " + v + "\u00a0% (" + s + "Banco de España). No incluye cuotas ni alquiler.",
      shareTxtYes: x => x + " de más por cobrar con tarjeta. Calcule lo suyo, gratis:", shareTxtNo: "¿Paga de más por cobrar con tarjeta? Calcúlelo gratis:",
      shTop: "Calculadora del datáfono", shYes: "de más por cobrar con tarjeta", shNo: "de coste efectivo por cobrar con tarjeta", shAsk: "¿Y usted?",
      shared: "Imagen descargada y enlace copiado.",
      chooseProv: "Elija su proveedor y plan", banks: "Bancos", fin: "Fintech y otros", own: "Otro o precio negociado: escribir mis precios", own2: "Su contrato actual",
      iSave: x => "Ahorra unos " + x + " al mes", iWait: d => "Cuando acabe su permanencia, en " + d + ". Así evita la penalización.", iNow: "Ya. Cambiar no le cuesta nada.", iNowCost: x => "Ya. Cambiar le cuesta " + x + " y lo recupera con el ahorro.",
      iBank1: p => "Que le iguale " + p + " por cobro con tarjeta europea de particular.", iBank2: "Que le quite la cuota mensual y el alquiler del datáfono.", iBank3: "Que se lo dé por escrito, con la fecha de inicio.",
      iSteps: ["Pida al nuevo proveedor las condiciones por escrito.", "Confirme que el datáfono funciona con su caja o programa de ventas.", "Active el nuevo datáfono antes de dar de baja el antiguo.", "Pida la baja por escrito y guarde el justificante."]
    },
    ca: {
      vYes: "Sí, paga de més.", vNo: "No, està bé.", noSub: "Cap tarifa li estalvia prou perquè compensi canviar.",
      payLine: (x, p) => "Estalvi estimat: " + x + "/any · Recomanació: " + p,
      iCost: (c, s) => "Cost: " + c + "/mes · Estalvi: " + s + "/any", iAltCost: c => c + "/mes",
      iWait2: (d, pen) => "Quan acabi la permanència, el " + d + "." + (pen ? " Així evita la penalització de " + pen + "." : ""),
      iBankX: (x, y) => "Demani igualar " + x + "/mes o la tarifa " + y + "; si no, sol·liciti la baixa.",
      iSteps2: ["Contracti el nou proveïdor.", "Rebi i activi el nou datàfon.", "Demani per escrit la baixa de l'anterior.", "Si el seu datàfon actual és de lloguer, torni'l."],
      prog: (i, n) => i + " de " + n, pre: "Paga", post: "de més", one: x => x + "/mes",
      instant: "A l'instant", months: n => "≈ " + n + (n === 1 ? " mes" : " mesos"), cheap: n => "de " + n + " tarifes li surten més barates",
      ref: (v, s) => "Comissió mitjana que cobren els bancs a Espanya: " + v + "\u00a0% (" + s + "Banc d'Espanya). No inclou quotes ni lloguer.",
      shareTxtYes: x => x + " de més per cobrar amb targeta. Calculi el seu, gratis:", shareTxtNo: "Paga de més per cobrar amb targeta? Calculi-ho gratis:",
      shTop: "Calculadora del datàfon", shYes: "de més per cobrar amb targeta", shNo: "de cost efectiu per cobrar amb targeta", shAsk: "I vostè?",
      shared: "Imatge descarregada i enllaç copiat.",
      chooseProv: "Triï el seu proveïdor i pla", banks: "Bancs", fin: "Fintech i altres", own: "Un altre o preu negociat: escriure els meus preus", own2: "El seu contracte actual",
      iSave: x => "Estalvia uns " + x + " al mes", iWait: d => "Quan acabi la permanència, el " + d + ". Així evita la penalització.", iNow: "Ja. Canviar no li costa res.", iNowCost: x => "Ja. Canviar li costa " + x + " i ho recupera amb l'estalvi.",
      iBank1: p => "Que li iguali " + p + " per cobrament amb targeta europea de particular.", iBank2: "Que li tregui la quota mensual i el lloguer del datàfon.", iBank3: "Que l'hi doni per escrit, amb la data d'inici.",
      iSteps: ["Demani al nou proveïdor les condicions per escrit.", "Confirmi que el datàfon funciona amb la seva caixa o programa de vendes.", "Activi el nou datàfon abans de donar de baixa l'antic.", "Demani la baixa per escrit i guardi'n el justificant."]
    },
    en: {
      vYes: "Yes, you are paying too much.", vNo: "No, you are fine.", noSub: "No rate saves you enough to make switching worth it.",
      payLine: (x, p) => "Estimated saving: " + x + "/year · Recommendation: " + p,
      iCost: (c, s) => "Cost: " + c + "/month · Saving: " + s + "/year", iAltCost: c => c + "/month",
      iWait2: (d, pen) => "When your minimum term ends, in " + d + "." + (pen ? " That way you avoid the " + pen + " penalty." : ""),
      iBankX: (x, y) => "Ask them to match " + x + "/month or the " + y + " rate; if not, request cancellation.",
      iSteps2: ["Sign up with the new provider.", "Receive and activate the new card machine.", "Cancel the previous one in writing.", "If your current card machine is rented, return it."],
      prog: (i, n) => i + " of " + n, pre: "You pay", post: "too much", one: x => x + "/month",
      instant: "Straight away", months: n => "≈ " + n + (n === 1 ? " month" : " months"), cheap: n => "of " + n + " rates are cheaper for you",
      ref: (v, s) => "Average fee charged by banks in Spain: " + v + "\u00a0% (" + s + "Bank of Spain). Excludes monthly fees and rental.",
      shareTxtYes: x => x + " too much to take card payments. Check yours, free:", shareTxtNo: "Paying too much for card payments? Check for free:",
      shTop: "Card terminal calculator", shYes: "too much to take card payments", shNo: "effective cost of card payments", shAsk: "What about you?",
      shared: "Image downloaded and link copied.",
      chooseProv: "Choose your provider and plan", banks: "Banks", fin: "Fintech and others", own: "Other or negotiated price: enter my own prices", own2: "Your current contract",
      iSave: x => "You save about " + x + " a month", iWait: d => "When your minimum term ends, in " + d + ". That way you avoid the penalty.", iNow: "Now. Switching costs you nothing.", iNowCost: x => "Now. Switching costs you " + x + " and the saving pays it back.",
      iBank1: p => "To match " + p + " per payment on European consumer cards.", iBank2: "To drop the monthly fee and the terminal rental.", iBank3: "To put it in writing, with a start date.",
      iSteps: ["Ask the new provider for the terms in writing.", "Check that the terminal works with your till or sales software.", "Activate the new terminal before cancelling the old one.", "Cancel in writing and keep the receipt."]
    }
  };
  const T = () => TX[lang()];

  const SIM = PLANS.filter(p => p.sim === "Sí");
  const grp = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F");
  const eur = (x, d = 0) => { const v = (Math.round(Math.abs(x) * 10**d) / 10**d).toFixed(d).split("."); return (x < 0 ? "−" : "") + grp(v[0]) + (d ? "," + v[1] : "") + "\u00a0€"; };
  const pct = x => (x * 100).toFixed(2).replace(".", ",") + "\u00a0%";
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
    [{es:"Lo tecleo en el datáfono",ca:"L'escric al datàfon",en:"I type it into the terminal"},"No"],
    [{es:"Llega solo desde mi caja o programa de ventas",ca:"Arriba sol des de la meva caixa o programa de vendes",en:"It comes automatically from my till or sales software"},"Sí"],
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
  const stepOK = i => i === 0 ? vals().V > 0 : i === 1 ? vals().ops > 0 : i === 2 ? num($("pPaid").value) > 0 : true;
  function navState(){ steps.forEach((st, i) => st.querySelectorAll("[data-pnext]").forEach(b => b.disabled = !stepOK(i))); }
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
  function answered(i){ clearTimeout(advT); advT = setTimeout(() => { if (pi === i) next(i); }, 250); }
  const provSub = which => { $("pPlanChips").hidden = which !== "plan"; prov.hidden = which !== "sel"; $("pContract").hidden = $("pContractNext").hidden = which !== "own"; };

  pp.addEventListener("click", e => {
    if (e.target.closest("[data-pback]")) { showStep(pi - 1, true); return; }
    const n = e.target.closest("[data-pnext]"); if (n) { if (!n.disabled) next(pi); return; }
    const no = e.target.closest("[data-paid-no]");
    if (no) { no.setAttribute("aria-pressed", "true"); $("pPaid").value = ""; navState(); answered(2); return; }
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
    const lock = P.pLock === "Sí";
    const I = { V, T: V / v.ops, wP:w[0], wE:w[1], wN:w[2], wA:w[3], wB:w[4], NP:.025, BZ:.005, PROMO:true, IVAQ:false, IVA:.21, CTA:true,
      ND:1, nF:2, pF:.5, PEN: num($("pPen").value) || 0, MREM: num($("pPerm").value) || 0, CAJA: lock ? (num($("pCaja").value) || 0) : 0,
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
    if (!(v.V > 0 && v.ops > 0 && P.cur && P.pSector)) { showStep(!(v.V > 0) ? 0 : !(v.ops > 0) ? 1 : !P.cur ? 3 : 5, true); return; }
    const R = calcular(PLANS, I); if (!R) return;
    last = { kind: "precisa", I, R };
    tok++; hideOut();
    fill(); $("res").hidden = false; $("pay").hidden = !ofrecer(last.R);
    $("rVerdict").focus({ preventScroll: true });
    requestAnimationFrame(() => goTo($("res"), true));
  }
  function fill(){
    const { I, R } = last, t = T(), b = R.best, yes = R.tono === "si";
    const wait = yes && (I.MREM || 0) > 0 && b.neto24_espera > b.neto24;
    $("rVerdict").textContent = yes ? t.vYes : t.vNo;
    $("rHero").hidden = $("rFacts").hidden = !yes; $("rNo").hidden = yes;
    $("rNo").textContent = t.noSub;
    if (yes) {
      $("rPre").textContent = t.pre;
      $("rBig").textContent = t.one(eur(Math.max(0, b.ahorro_m)));
      $("rPost").textContent = t.post;
      $("f24").textContent = eur(Math.max(0, wait ? b.neto24_espera : b.neto24));
      const pb = b.payback;
      $("fPay").textContent = typeof pb === "number" ? (pb < 1 ? t.instant : t.months(Math.ceil(pb))) : "—";
      $("fCheap").textContent = R.ranked.filter(r => !r.es_actual && r.ahorro_m > 0).length;
      $("fCheapK").textContent = t.cheap(SIM.length);
    }
    const vol = I.V * ((12 - I.nF) + I.nF * I.pF);
    $("rEff").textContent = vol > 0 ? pct(R.CURANN / vol) : "—";
    const ref = REFERENCIA;
    $("rRef").hidden = !ref;
    if (ref) $("rRef").textContent = t.ref(String(ref.valor).replace(".", ","), ref.periodo ? ref.periodo + ", " : "");
    $("payLine").textContent = t.payLine(eur(anual(R)), precio());
    if (!$("informe").hidden && last.I) fillInforme();
  }
  async function shareCard(){
    if (!last) return;
    const t = T(), yes = last.R.tono === "si", url = "https://natashacaceres.com/calculadora";
    const fig = yes ? t.one(eur(Math.max(0, last.R.best.ahorro_m))) : null;
    const big = fig || $("rEff").textContent, line = fig ? t.shYes : t.shNo, text = fig ? t.shareTxtYes(fig) : t.shareTxtNo;
    const c = document.createElement("canvas"); c.width = 1080; c.height = 1080;
    const x = c.getContext("2d");
    try { await document.fonts.ready; } catch(_) {}
    x.fillStyle = "#0B1220"; x.fillRect(0, 0, 1080, 1080);
    x.textAlign = "center";
    x.fillStyle = "#D4AF37"; x.font = '600 30px Inter, system-ui, sans-serif'; x.fillText(t.shTop.toUpperCase(), 540, 250);
    let size = 150; x.font = '500 ' + size + 'px "Playfair Display", Georgia, serif';
    while (x.measureText(big).width > 940 && size > 60) { size -= 6; x.font = '500 ' + size + 'px "Playfair Display", Georgia, serif'; }
    x.fillText(big, 540, 520);
    x.fillStyle = "#FFFFFF"; x.font = '400 42px Inter, system-ui, sans-serif'; x.fillText(line, 540, 610);
    x.fillStyle = "#B9C0CF"; x.font = '400 34px Inter, system-ui, sans-serif'; x.fillText(t.shAsk, 540, 860); x.fillText("natashacaceres.com/calculadora", 540, 910);
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
  const ofrecer = R => R.tono === "si" && anual(R) >= PAGO.umbralAhorro;
  $("paySoon").hidden = PAGABLE;
  $("payOk").addEventListener("change", () => { $("payBtn").disabled = !(PAGABLE && $("payOk").checked); });
  $("payBtn").addEventListener("click", () => {
    if (!PAGABLE || !$("payOk").checked || !last) return;
    try { sessionStorage.setItem(KEY, JSON.stringify({ I: last.I })); } catch(_) {}
    location.href = PAGO.enlace;
  });
  function fillInforme(){
    const { I, R } = last, t = T(), b = R.best;
    const name = p => p.id === "CONTRATO" ? t.own2 : p.plan;
    const mes = r => eur(Math.max(0, r.ano2 / 12));
    $("iPlan").textContent = name(b.p);
    $("iSave").textContent = t.iCost(mes(b), eur(anual(R)));
    $("iAlts").innerHTML = R.ranked.filter(r => r !== b && !r.es_actual).slice(0, 2).map(r => '<li><b>' + name(r.p) + '</b> · ' + t.iAltCost(mes(r)) + '</li>').join("");
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
    try { history.replaceState(null, "", location.pathname); } catch(_) {}
    pp.hidden = true;
    const R = saved && saved.I ? calcular(PLANS, saved.I) : null;
    if (R) { last = { kind: "precisa", I: saved.I, R }; fillInforme(); }
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
      try { const j = JSON.parse(sc.textContent); const t = j.mainEntity[1].acceptedAnswer; t.text = t.text.replace(/(Fecha de la última revisión|Data de l'última revisió|Date of last review): [^.]+\./, "$1: " + fecha(actualizado, l) + "."); sc.textContent = JSON.stringify(j); } catch(_) {}
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
