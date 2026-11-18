// Mi banco: «Pregúntale a Tiqui». La primera pregunta es gratis (functions/api/ia/[[ruta]].js, ruta pregunta-gratis);
// después salen los dos planes. El pago todavía no está conectado: el botón dice «Muy pronto».
// Va antes de «Compartir» en el móvil y fijo a la derecha en el ordenador. Sin estilos ni scripts en línea (CSP).
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const LANG = ["es", "ca", "en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
  const ROOT = (document.currentScript && document.currentScript.dataset.root) || "../";
  const nf0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: "always" });
  const nf2 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });
  const eur2 = (x) => nf2.format(Math.abs(x)) + " €";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MES3 = { es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"], ca: ["gen", "febr", "març", "abr", "maig", "juny", "jul", "ag", "set", "oct", "nov", "des"], en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] }[LANG];

  const T = {
    es: {
      titulo: "Pregúntale a Tiqui", gratis: "Tu primera pregunta es gratis", siguePlanes: "Elige cuánto tiempo y sigue preguntando",
      hola: "¿Qué quieres saber de tus gastos?", escribe: "Escribe tu pregunta", enviar: "Enviar",
      adonde: "¿Adónde se va mi dinero?", raro: "¿Hay algo raro en mi cuenta?", llevo: (m) => "¿Cuánto llevo en " + m + "?", mesMas: "¿En qué mes gasté más?",
      seguimos: "¿Seguimos?", verPago: "Ver el pago", verPagos: (n) => "Ver los " + n + " pagos", ocultar: "Ocultar",
      noComprobado: "No he podido comprobar las cifras, así que prefiero no dártelas. Prueba a preguntarlo de otra forma.", noPuedo: "Ahora no puedo responder. Prueba en un momento.",
      planes: { basico: ["0,99 €", "7 días"], completo: ["2,99 €", "3 meses", "Añade más extractos"] }, pagar: (p) => "Pagar " + p,
      unPago: "Un solo pago. Sin suscripción", ahoraNo: "Ahora no", pronto: "Muy pronto. Todavía no se puede pagar.",
    },
    ca: {
      titulo: "Pregunta-li a Tiqui", gratis: "La teva primera pregunta és gratis", siguePlanes: "Tria quant de temps i continua preguntant",
      hola: "Què vols saber de les teves despeses?", escribe: "Escriu la teva pregunta", enviar: "Enviar",
      adonde: "On van els meus diners?", raro: "Hi ha alguna cosa estranya al meu compte?", llevo: (m) => "Quant porto a " + m + "?", mesMas: "Quin mes vaig gastar més?",
      seguimos: "Continuem?", verPago: "Veure el pagament", verPagos: (n) => "Veure els " + n + " pagaments", ocultar: "Amagar",
      noComprobado: "No he pogut comprovar les xifres, així que prefereixo no donar-te-les. Prova de preguntar-ho d'una altra manera.", noPuedo: "Ara no puc respondre. Prova-ho d'aquí a un moment.",
      planes: { basico: ["0,99 €", "7 dies"], completo: ["2,99 €", "3 mesos", "Afegeix més extractes"] }, pagar: (p) => "Pagar " + p,
      unPago: "Un sol pagament. Sense subscripció", ahoraNo: "Ara no", pronto: "Molt aviat. Encara no es pot pagar.",
    },
    en: {
      titulo: "Ask Tiqui", gratis: "Your first question is free", siguePlanes: "Pick how long and keep asking",
      hola: "What do you want to know about your spending?", escribe: "Type your question", enviar: "Send",
      adonde: "Where does my money go?", raro: "Is anything odd in my account?", llevo: (m) => "How much have I spent on " + m + "?", mesMas: "Which month did I spend the most?",
      seguimos: "Shall we carry on?", verPago: "See the payment", verPagos: (n) => "See the " + n + " payments", ocultar: "Hide",
      noComprobado: "I couldn't check the figures, so I'd rather not give them to you. Try asking another way.", noPuedo: "I can't answer right now. Try again in a moment.",
      planes: { basico: ["0,99 €", "7 days"], completo: ["2,99 €", "3 months", "Add more statements"] }, pagar: (p) => "Pay " + p,
      unPago: "One payment. No subscription", ahoraNo: "Not now", pronto: "Coming very soon. You can't pay yet.",
    },
  }[LANG];

  // Sectores: solo lo que se sabe seguro (cadena conocida o palabra que no deja dudas). Lo demás, Tiqui lo dice como «sin saber qué es».
  const SECTORES = [
    ["casa", /OCTOPUS|ENDESA|IBERDROLA|NATURGY|AIGUES|AGUAS DE|VODAFONE|MOVISTAR|ORANGE|DIGI|HOLALUZ|REPSOL|YOIGO|MASMOVIL|LOWI|PEPEPHONE|JAZZTEL/],
    ["super", /MERCADONA|ALDI|LIDL|CONDIS|BON PREU|ESCLAT|GUISSONA|CARREFOUR|CAPRABO|EROSKI|CONSUM|DIA %|SUPERMERCA|SUPERMARKET|HIPERMERCA|\bSUPER\b|ALIMENTACI|AHORRAMAS|HIPERCOR|ALCAMPO/],
    ["fuera", /RESTAURANT|\bBAR\b|TAPAS|TASCA|TAPERIA|ASADOR|PIZZERIA|KEBAB|KFC|SUBWAY|BURGER|MCDONALD|TELEPIZZA|COFFEE|CAFE|BAKERY|WAFFLE|\bFORN\b|STARBUCKS|VIPS|GOIKO|TGTG|TOO GOOD/],
    ["domicilio", /UBER \*?EATS|GLOVO|JUST ?EAT|DELIVEROO/],
    ["transporte", /TMB|T MOBILITAT|TAXI|YEGO|UBER \*TRIP|UBER BV|CABIFY|BOLT|RYANAIR|VUELING|RENFE|IBERIA|BICING|EMT |METRO |GASOLINERA|CEPSA|GALP|SHELL|BP /],
    ["ropa", /ZARA|CALZEDONIA|MANGO|PRIMARK|H&M|BERSHKA|PULL&BEAR|STRADIVARIUS|LEFTIES|DECATHLON|TREATWELL|BEAUTY|PELUQUER/],
    ["salud", /FARMACIA|DROGUERIA|ROSSMANN|CLINICA|DENTAL|OPTICA/],
    ["ocio", /PLAYTOMIC|NATACION|JUEGOS ONCE|CASA DEL LIBRO|FNAC|CINE|TEATRO|ENTRADAS|TICKETMASTER/],
    ["suscr", /NETFLIX|SPOTIFY|APPLE\.COM|ANTHROPIC|CLAUDE|OPENAI|CHATGPT|HBO|DISNEY|PRIME VIDEO|YOUTUBE|DAZN|CLOUDFLARE|WORDPRESS|ADOBE|CANVA|DROPBOX|GOOGLE ONE/],
    ["online", /AMAZON|ALIEXPRESS|SHEIN|TEMU|EBAY|WALLAPOP/],
    ["impuestos", /A\.E\.A\.T|HACIENDA|AYUNTAMIENTO|AJUNTAMENT|TRIBUT/],
    ["comisiones", /COMISION|GASTOS DE RECLAMACION/],
    ["tarjeta", /LIQUIDACION DE LA TARJETA|RECOBRO DE LIQUIDACION/],
    ["bizum", /^BIZUM/],
    ["transfer", /^TRANSFERENCIA/],
  ];
  function comercio(c) {
    const u = String(c || "").toUpperCase();
    let m = u.match(/COMPRA EN (.*?), CON LA/); if (m) return m[1].replace(/^SQ \*|^SUMUP \*\*/, "").trim();
    m = u.match(/^RECIBO (.*?) Nº/); if (m) return m[1].replace(/^GC RE /, "").replace(/,? S\.?L\.?U?\.?|,? S\.A\.?/g, "").trim();
    m = u.match(/A FAVOR DE (.*)/); if (m) return m[1].trim();
    if (/^BIZUM/.test(u)) return "BIZUM";
    if (/IMPUESTO|A\.E\.A\.T/.test(u)) return "HACIENDA";
    return u.replace(/ \d{4} \d{4}.*$/, "").slice(0, 40);
  }
  function clasificar(m) {
    const k = comercio(m.concepto), u = (k + " | " + m.concepto).toUpperCase();
    for (const [id, re] of SECTORES) if (re.test(id === "bizum" || id === "transfer" ? String(m.concepto).toUpperCase() : u)) return { k, s: id };
    return { k, s: null };
  }

  let todos = [];
  const envio = () => todos.map((m) => ({ id: m.id, f: m.fecha, c: m.concepto, k: m.c.k, s: m.c.s, i: m.importe }));
  const MARCAS = [["Mercadona", /MERCADONA/], ["Vodafone", /VODAFONE/], ["Netflix", /NETFLIX/], ["Spotify", /SPOTIFY/], ["Amazon", /AMAZON/], ["Glovo", /GLOVO/], ["Uber Eats", /UBER \*?EATS/], ["Just Eat", /JUST ?EAT/], ["Zara", /ZARA/], ["Ryanair", /RYANAIR/], ["Endesa", /ENDESA/], ["Iberdrola", /IBERDROLA/], ["Movistar", /MOVISTAR/], ["Lidl", /LIDL/], ["Carrefour", /CARREFOUR/], ["Octopus", /OCTOPUS/], ["Apple", /APPLE\.COM/]];
  function sugerencias() {
    const porMarca = {};
    todos.forEach((m) => { if (!(m.importe < 0)) return; const mk = MARCAS.find(([, re]) => re.test(String(m.concepto).toUpperCase())); if (mk) porMarca[mk[0]] = (porMarca[mk[0]] || 0) - m.importe; });
    const top = Object.keys(porMarca).sort((a, b) => porMarca[b] - porMarca[a])[0];
    return [T.adonde, T.raro, top ? T.llevo(top) : T.mesMas];
  }

  const GRATIS = "fh-tiqui-gratis";
  const gratisUsada = () => { try { return !!localStorage.getItem(GRATIS); } catch (e) { return false; } };
  const api = async (ruta, cuerpo) => {
    try { const r = await fetch(ROOT + "api/ia/" + ruta, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }); return { ok: r.ok, d: await r.json().catch(() => ({})) }; }
    catch (e) { return { ok: false, d: {} }; }
  };

  const mk = (tag, clase, texto) => { const x = document.createElement(tag); if (clase) x.className = clase; if (texto !== undefined) x.textContent = texto; return x; };
  let caja = null, msgs = null, sub = null, sug = null;
  function burbuja(quien, nodoOTexto) {
    const m = mk("div", "tqc-m tqc-m--" + quien);
    if (typeof nodoOTexto === "string") m.textContent = nodoOTexto; else m.appendChild(nodoOTexto);
    msgs.appendChild(m); m.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return m;
  }
  // Las cifras en negrita, sin innerHTML con texto del modelo
  function conNegrita(texto) {
    const f = document.createDocumentFragment(), re = /(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?\s?€)/g; let i = 0, m;
    while ((m = re.exec(texto))) { if (m.index > i) f.appendChild(document.createTextNode(texto.slice(i, m.index))); f.appendChild(mk("b", null, m[1])); i = m.index + m[1].length; }
    if (i < texto.length) f.appendChild(document.createTextNode(texto.slice(i)));
    return f;
  }
  function respuesta(texto, pagos) {
    const f = document.createDocumentFragment(); f.appendChild(conNegrita(texto));
    const usados = todos.filter((m) => (pagos || []).indexOf(m.id) >= 0);
    if (usados.length) {
      const t = usados.length === 1 ? T.verPago : T.verPagos(usados.length);
      const b = mk("button", "tqc-ver", t); b.type = "button";
      const ul = mk("ul", "tqc-movs"); ul.hidden = true;
      usados.slice(0, 40).forEach((m) => { const li = mk("li"); const [, mm, dd] = String(m.fecha).split("-"); li.append(mk("span", "tqc-mf", +dd + " " + MES3[+mm - 1]), mk("span", "tqc-mn", m.c.k), mk("span", "tqc-mi", eur2(m.importe))); ul.appendChild(li); });
      b.addEventListener("click", () => { ul.hidden = !ul.hidden; b.textContent = ul.hidden ? t : T.ocultar; });
      f.append(b, ul);
    }
    return burbuja("ia", f);
  }
  function planesEnChat() {
    if ($("tqcPlanes")) return;
    if (sug) sug.hidden = true;
    sub.textContent = T.siguePlanes;
    const f = document.createDocumentFragment(); f.appendChild(document.createTextNode(T.seguimos));
    const pl = mk("div", "tqc-planes"); pl.id = "tqcPlanes";
    Object.keys(T.planes).forEach((k) => {
      const [p, d, mas] = T.planes[k]; const b = mk("button", "tqc-plan" + (k === "completo" ? " tqc-plan--top" : "")); b.type = "button";
      b.append(mk("span", "tqc-plan-p", p), mk("span", "tqc-plan-d", d)); if (mas) b.appendChild(mk("span", "tqc-plan-m", mas));
      b.addEventListener("click", () => abrirPago(k)); pl.appendChild(b);
    });
    f.appendChild(pl);
    burbuja("ia", f).classList.add("tqc-m--planes");
  }
  function abrirPago(planIni) {
    let plan = T.planes[planIni] ? planIni : "basico";
    const d = mk("div", "tqc-pago"), c = mk("div", "tqc-pago-c"); c.setAttribute("role", "dialog"); c.setAttribute("aria-modal", "true");
    c.appendChild(mk("h2", "tqc-pago-t", T.titulo));
    const pl = mk("div", "tqc-planes"); pl.setAttribute("role", "radiogroup");
    const ok = mk("button", "tqc-cta"); ok.type = "button";
    const msg = mk("p", "tqc-pronto"); msg.hidden = true; msg.setAttribute("role", "status");
    const pintar = () => { pl.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.plan === plan))); ok.textContent = T.pagar(T.planes[plan][0]); };
    Object.keys(T.planes).forEach((k) => {
      const [p, du, mas] = T.planes[k]; const b = mk("button", "tqc-plan" + (k === "completo" ? " tqc-plan--top" : "")); b.type = "button"; b.setAttribute("role", "radio"); b.dataset.plan = k;
      b.append(mk("span", "tqc-plan-p", p), mk("span", "tqc-plan-d", du)); if (mas) b.appendChild(mk("span", "tqc-plan-m", mas));
      b.addEventListener("click", () => { plan = k; pintar(); }); pl.appendChild(b);
    });
    ok.addEventListener("click", () => { msg.textContent = T.pronto; msg.hidden = false; });
    const no = mk("button", "tqc-no", T.ahoraNo); no.type = "button";
    c.append(pl, ok, msg, mk("p", "tqc-unpago", T.unPago), no); d.appendChild(c); document.body.appendChild(d); pintar();
    const cerrar = () => { d.remove(); removeEventListener("keydown", tecla); };
    const tecla = (e) => { if (e.key === "Escape") cerrar(); };
    addEventListener("keydown", tecla); d.addEventListener("click", (e) => { if (e.target === d) cerrar(); }); no.addEventListener("click", cerrar);
    ok.focus({ preventScroll: true });
  }
  async function preguntar(t) {
    if (gratisUsada()) { abrirPago("basico"); return; }
    burbuja("tu", t);
    const pensando = burbuja("ia", mk("span", "tqc-dots")); pensando.firstChild.append(mk("i"), mk("i"), mk("i"));
    const r = await api("pregunta-gratis", { pregunta: t, idioma: LANG, movimientos: envio() });
    pensando.remove();
    if (!r.ok) {
      if (r.d.error === "gratis_usada") { try { localStorage.setItem(GRATIS, "1"); } catch (e) {} planesEnChat(); return; }
      burbuja("ia", r.d.error === "no_comprobado" ? T.noComprobado : T.noPuedo); return;
    }
    try { localStorage.setItem(GRATIS, "1"); } catch (e) {}
    respuesta(r.d.texto, r.d.pagos); planesEnChat();
  }
  function montarCaja() {
    caja = mk("section", "tqc"); caja.id = "tqcIa"; caja.setAttribute("aria-label", T.titulo);
    const ch = mk("div", "tqc-chat");
    const top = mk("div", "tqc-top"); top.appendChild(mk("h2", "tqc-h", T.titulo)); sub = mk("p", "tqc-sub", gratisUsada() ? T.siguePlanes : T.gratis); top.appendChild(sub);
    msgs = mk("div", "tqc-msgs"); msgs.setAttribute("aria-live", "polite");
    sug = mk("div", "tqc-sug");
    sugerencias().forEach((q) => { const b = mk("button", null, q); b.type = "button"; b.addEventListener("click", () => preguntar(q)); sug.appendChild(b); });
    const f = mk("form", "tqc-in"); const inp = mk("input"); inp.id = "tqcTxt"; inp.autocomplete = "off"; inp.maxLength = 400; inp.placeholder = T.escribe; inp.setAttribute("aria-label", T.escribe);
    const env = mk("button", null, "→"); env.type = "submit"; env.setAttribute("aria-label", T.enviar);
    f.append(inp, env); f.addEventListener("submit", (e) => { e.preventDefault(); const t = inp.value.trim(); if (t) { inp.value = ""; preguntar(t); } });
    ch.append(top, msgs, sug, f); caja.appendChild(ch);
    if (gratisUsada()) { msgs.textContent = ""; planesEnChat(); } else burbuja("ia", T.hola);
  }
  // Dónde va: en el ordenador, a la derecha del resultado; en el móvil, antes de «Compartir» (o tras las gráficas si están abiertas)
  const ancho = matchMedia("(min-width:1100px)");
  function colocar() {
    if (!caja) return;
    const res = $("xRes"), r3 = res && res.querySelector(".r3"), tj = $("xTarjeta"), gr = $("pgGr");
    if (!res) return;
    if (ancho.matches) { if (caja.parentNode !== res) res.insertBefore(caja, res.firstChild); }
    else if (r3 && r3.hidden && gr) { if (caja.previousElementSibling !== gr) gr.after(caja); }
    else if (tj && tj.parentNode) { if (caja.nextElementSibling !== tj) tj.before(caja); }
    else if (caja.parentNode !== res) res.appendChild(caja);
  }
  ancho.addEventListener("change", colocar);
  document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("#pgTabs")) setTimeout(colocar, 0); });

  document.addEventListener("fh-resultado", (e) => {
    const r = e.detail; if (!r) return;
    try {
      todos = ((r.lectura && r.lectura.movimientos) || []).map((m, n) => Object.assign({}, m, { id: "m" + n, c: clasificar(m) }));
      if (caja) caja.remove();
      montarCaja(); setTimeout(colocar, 0);
    } catch (err) { /* si algo falla, el resumen sigue como siempre */ }
  });
})();
