// Mi banco: «Pregúntale a Tiqui». La primera pregunta es gratis (functions/api/ia/[[ruta]].js, ruta pregunta-gratis);
// después salen los dos planes y se paga en Stripe (/api/ia/pagar). El extracto viaja cifrado con el código, que se crea
// aquí y solo tiene quien paga (también le llega por correo y sale en el recibo). Al volver (?tiqui=ok) se activa el pase.
// Va antes de «Compartir» en el móvil y fijo a la derecha en el ordenador. Sin estilos ni scripts en línea (CSP).
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const LANG = ["es", "ca", "en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
  // Mi datáfono: Tiqui para negocios (pregunta por el resumen del datáfono, planes 4,99 € y 9,99 € con factura)
  const NEG = /\/(datafono|datafon|card-machine)\//.test(location.pathname);
  const PAG_DAT = { es: "/datafono/", ca: "/ca/datafon/", en: "/en/card-machine/" };
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
      planes: { basico: ["0,99 €", "7 días"], completo: ["2,99 €", "3 meses"] }, pagar: (p) => "Pagar " + p,
      unPago: "Un solo pago. Sin suscripción", ahoraNo: "Ahora no", momento: "Un momento…", errorPago: "No se ha podido. Prueba otra vez.",
      holaNeg: "¿Qué quieres saber de tu datáfono?", sugNeg: ["¿Cuánto me cobra el banco al mes?", "¿Por qué unas tarjetas me cobran más?", "¿A quién me cambio?"],
      planesNeg: { negocio_mes: ["4,99 €", "1 mes"], negocio_3m: ["9,99 €", "3 meses"] }, unPagoNeg: "Un solo pago. Sin suscripción. Con factura",
      tuyo: "Tiqui ya es tuyo", copiar: "Copiar", copiado: "Copiado", correo: "Te lo hemos mandado por correo. Con él vuelves desde Tu Tiqui, sin subir nada.",
      hasta: (d) => "Hasta el " + d.getDate() + " de " + ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][d.getMonth()],
      invita: "Invitar a un amigo", invitaYo: "Tus preguntas me salen caras, jeje. Invita a un amigo: si paga, te regalo 30 días.", fin: "Se nos acabó el tiempo.",
      enlaceCopiado: "Enlace copiado. Pásaselo a quien quieras.", sinHuecos: "Ya te han regalado días 3 amigos. ¡Gracias!",
      regalo: (d) => "Un amigo ha pagado. Tienes 30 días más, " + d.charAt(0).toLowerCase() + d.slice(1) + ".", compartirTxt: "Mira lo que pagas cada mes sin darte cuenta. Es gratis.",
      topeDia: "Por hoy ya está. Mañana seguimos.", topeTotal: "Has llegado al máximo de este pase.", noAbre: "Ese código no existe o ya caducó.", sinPagar: "Aún no nos ha llegado el pago. Si has pagado, recarga en un momento.",
    },
    ca: {
      titulo: "Pregunta-li a Tiqui", gratis: "La teva primera pregunta és gratis", siguePlanes: "Tria quant de temps i continua preguntant",
      hola: "Què vols saber de les teves despeses?", escribe: "Escriu la teva pregunta", enviar: "Enviar",
      adonde: "On van els meus diners?", raro: "Hi ha alguna cosa estranya al meu compte?", llevo: (m) => "Quant porto a " + m + "?", mesMas: "Quin mes vaig gastar més?",
      seguimos: "Continuem?", verPago: "Veure el pagament", verPagos: (n) => "Veure els " + n + " pagaments", ocultar: "Amagar",
      noComprobado: "No he pogut comprovar les xifres, així que prefereixo no donar-te-les. Prova de preguntar-ho d'una altra manera.", noPuedo: "Ara no puc respondre. Prova-ho d'aquí a un moment.",
      planes: { basico: ["0,99 €", "7 dies"], completo: ["2,99 €", "3 mesos"] }, pagar: (p) => "Pagar " + p,
      unPago: "Un sol pagament. Sense subscripció", ahoraNo: "Ara no", momento: "Un moment…", errorPago: "No s'ha pogut. Torna-ho a provar.",
      holaNeg: "Què vols saber del teu datàfon?", sugNeg: ["Quant em cobra el banc al mes?", "Per què unes targetes em cobren més?", "A qui em canvio?"],
      planesNeg: { negocio_mes: ["4,99 €", "1 mes"], negocio_3m: ["9,99 €", "3 mesos"] }, unPagoNeg: "Un sol pagament. Sense subscripció. Amb factura",
      tuyo: "Tiqui ja és teu", copiar: "Copiar", copiado: "Copiat", correo: "T'ho hem enviat per correu. Amb ell tornes des d'El teu Tiqui, sense pujar res.",
      hasta: (d) => "Fins al " + d.getDate() + " " + ["de gener", "de febrer", "de març", "d'abril", "de maig", "de juny", "de juliol", "d'agost", "de setembre", "d'octubre", "de novembre", "de desembre"][d.getMonth()],
      invita: "Convidar un amic", invitaYo: "Les teves preguntes em surten cares, jeje. Convida un amic: si paga, et regalo 30 dies.", fin: "Se'ns ha acabat el temps.",
      enlaceCopiado: "Enllaç copiat. Passa'l a qui vulguis.", sinHuecos: "Ja t'han regalat dies 3 amics. Gràcies!",
      regalo: (d) => "Un amic ha pagat. Tens 30 dies més, " + d.charAt(0).toLowerCase() + d.slice(1) + ".", compartirTxt: "Mira què pagues cada mes sense adonar-te'n. És gratis.",
      topeDia: "Per avui ja està. Demà continuem.", topeTotal: "Has arribat al màxim d'aquest passi.", noAbre: "Aquest codi no existeix o ja ha caducat.", sinPagar: "Encara no ens ha arribat el pagament. Si has pagat, torna a carregar d'aquí a un moment.",
    },
    en: {
      titulo: "Ask Tiqui", gratis: "Your first question is free", siguePlanes: "Pick how long and keep asking",
      hola: "What do you want to know about your spending?", escribe: "Type your question", enviar: "Send",
      adonde: "Where does my money go?", raro: "Is anything odd in my account?", llevo: (m) => "How much have I spent on " + m + "?", mesMas: "Which month did I spend the most?",
      seguimos: "Shall we carry on?", verPago: "See the payment", verPagos: (n) => "See the " + n + " payments", ocultar: "Hide",
      noComprobado: "I couldn't check the figures, so I'd rather not give them to you. Try asking another way.", noPuedo: "I can't answer right now. Try again in a moment.",
      planes: { basico: ["0,99 €", "7 days"], completo: ["2,99 €", "3 months"] }, pagar: (p) => "Pay " + p,
      unPago: "One payment. No subscription", ahoraNo: "Not now", momento: "One moment…", errorPago: "That didn't work. Try again.",
      holaNeg: "What do you want to know about your card machine?", sugNeg: ["How much does the bank charge me a month?", "Why do some cards cost me more?", "Who should I switch to?"],
      planesNeg: { negocio_mes: ["4,99 €", "1 month"], negocio_3m: ["9,99 €", "3 months"] }, unPagoNeg: "One payment. No subscription. With invoice",
      tuyo: "Tiqui is yours", copiar: "Copy", copiado: "Copied", correo: "We've emailed it to you. Use it to come back from Your Tiqui, without uploading anything.",
      hasta: (d) => "Until " + d.getDate() + " " + ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getMonth()],
      invita: "Invite a friend", invitaYo: "Your questions cost me a fortune, hehe. Invite a friend: if they pay, I'll give you 30 days.", fin: "Our time is up.",
      enlaceCopiado: "Link copied. Send it to anyone you like.", sinHuecos: "3 friends have already given you days. Thank you!",
      regalo: (d) => "A friend has paid. You have 30 more days, " + d.charAt(0).toLowerCase() + d.slice(1) + ".", compartirTxt: "See what you pay every month without noticing. It's free.",
      topeDia: "That's it for today. See you tomorrow.", topeTotal: "You've reached the limit of this pass.", noAbre: "That code doesn't exist or has expired.", sinPagar: "We haven't received the payment yet. If you've paid, reload in a moment.",
    },
  }[LANG];

  if (NEG) { T.hola = T.holaNeg; T.planes = T.planesNeg; T.unPago = T.unPagoNeg; }

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
    if (NEG) return T.sugNeg.slice();
    const porMarca = {};
    todos.forEach((m) => { if (!(m.importe < 0)) return; const mk = MARCAS.find(([, re]) => re.test(String(m.concepto).toUpperCase())); if (mk) porMarca[mk[0]] = (porMarca[mk[0]] || 0) - m.importe; });
    const top = Object.keys(porMarca).sort((a, b) => porMarca[b] - porMarca[a])[0];
    return [T.adonde, T.raro, top ? T.llevo(top) : T.mesMas];
  }

  // el pase de negocio se guarda aparte del de Mi banco: cada uno pregunta por lo suyo
  const GRATIS = NEG ? "fh-tiqui-gratis-negocio" : "fh-tiqui-gratis", PASE = NEG ? "fh-tiqui-pase-negocio" : "fh-tiqui-pase", PEND = NEG ? "fh-tiqui-pend-negocio" : "fh-tiqui-pend", AMIGO = "fh-amigo", MIREF = "fh-tiqui-ref";
  const leer = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
  const poner = (k, v) => { try { if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch (e) {} };
  const leerPase = () => { const p = leer(PASE); return p && p.hasta > Date.now() ? p : null; };
  const ALF = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // sin I, L, O, U
  const nuevoCodigo = () => "FH-" + [...crypto.getRandomValues(new Uint8Array(16))].map((x) => ALF[x & 31]).join("").match(/.{4}/g).join("-");
  // Cifrado en el navegador: la llave sale del código (PBKDF2 → AES-GCM). Al servidor solo llega la caja cerrada.
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s); };
  const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function llave(codigo, sal) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(codigo).toUpperCase().replace(/[^0-9A-Z]/g, "")), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sal, iterations: 310000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function cerrarCaja(codigo, datos) {
    const sal = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const cif = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await llave(codigo, sal), new TextEncoder().encode(JSON.stringify(datos))));
    return { sal: b64(sal), iv: b64(iv), datos: b64(cif) };
  }
  async function abrirCaja(codigo, caja) {
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(caja.iv) }, await llave(codigo, deB64(caja.sal)), deB64(caja.datos));
    return JSON.parse(new TextDecoder().decode(claro));
  }
  let ultimoR = null, historial = [], codigoNuevo = null, datosNeg = null;
  const datosPregunta = () => (NEG ? { negocio: datosNeg } : { movimientos: envio() });
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
    sub.textContent = T.siguePlanes; sub.hidden = false;
    const f = document.createDocumentFragment(); f.appendChild(document.createTextNode(T.seguimos));
    const pl = mk("div", "tqc-planes"); pl.id = "tqcPlanes";
    Object.keys(T.planes).forEach((k) => {
      const [p, d, mas] = T.planes[k]; const b = mk("button", "tqc-plan" + (k === "completo" || k === "negocio_3m" ? " tqc-plan--top" : "")); b.type = "button";
      b.append(mk("span", "tqc-plan-p", p), mk("span", "tqc-plan-d", d)); if (mas) b.appendChild(mk("span", "tqc-plan-m", mas));
      b.addEventListener("click", () => abrirPago(k)); pl.appendChild(b);
    });
    f.appendChild(pl);
    burbuja("ia", f).classList.add("tqc-m--planes");
  }
  function abrirPago(planIni) {
    let plan = T.planes[planIni] ? planIni : Object.keys(T.planes)[0];
    const d = mk("div", "tqc-pago"), c = mk("div", "tqc-pago-c"); c.setAttribute("role", "dialog"); c.setAttribute("aria-modal", "true");
    c.appendChild(mk("h2", "tqc-pago-t", T.titulo));
    const pl = mk("div", "tqc-planes"); pl.setAttribute("role", "radiogroup");
    const ok = mk("button", "tqc-cta"); ok.type = "button";
    const msg = mk("p", "tqc-pronto"); msg.hidden = true; msg.setAttribute("role", "status");
    const pintar = () => { pl.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.plan === plan))); ok.textContent = T.pagar(T.planes[plan][0]); };
    Object.keys(T.planes).forEach((k) => {
      const [p, du, mas] = T.planes[k]; const b = mk("button", "tqc-plan" + (k === "completo" || k === "negocio_3m" ? " tqc-plan--top" : "")); b.type = "button"; b.setAttribute("role", "radio"); b.dataset.plan = k;
      b.append(mk("span", "tqc-plan-p", p), mk("span", "tqc-plan-d", du)); if (mas) b.appendChild(mk("span", "tqc-plan-m", mas));
      b.addEventListener("click", () => { plan = k; pintar(); }); pl.appendChild(b);
    });
    ok.addEventListener("click", async () => {
      if (!(NEG ? datosNeg : ultimoR)) return;
      ok.disabled = true; ok.textContent = T.momento; msg.hidden = true;
      try {
        const codigo = nuevoCodigo();
        const caja = await cerrarCaja(codigo, NEG ? { n: datosNeg } : { r: ultimoR });
        const am = leer(AMIGO), mio = leer(MIREF);
        const r = await api("pagar", { plan, codigo, caja, idioma: LANG, vuelta: location.pathname, amigo: am && am !== mio ? am : undefined });
        if (!r.ok || !r.d.url) throw new Error("pago");
        poner(PEND, { codigo, plan });
        location.href = r.d.url;
      } catch (e) { ok.disabled = false; pintar(); msg.textContent = T.errorPago; msg.hidden = false; }
    });
    const no = mk("button", "tqc-no", T.ahoraNo); no.type = "button";
    c.append(pl, ok, msg, mk("p", "tqc-unpago", T.unPago), no); d.appendChild(c); document.body.appendChild(d); pintar();
    const cerrar = () => { d.remove(); removeEventListener("keydown", tecla); };
    const tecla = (e) => { if (e.key === "Escape") cerrar(); };
    addEventListener("keydown", tecla); d.addEventListener("click", (e) => { if (e.target === d) cerrar(); }); no.addEventListener("click", cerrar);
    ok.focus({ preventScroll: true });
  }
  async function preguntarPago(p, t) {
    burbuja("tu", t);
    const pensando = burbuja("ia", mk("span", "tqc-dots")); pensando.firstChild.append(mk("i"), mk("i"), mk("i"));
    const r = await api("pregunta", Object.assign({ codigo: p.codigo, pregunta: t, idioma: LANG, historial }, datosPregunta()));
    pensando.remove();
    if (!r.ok) {
      if (r.d.error === "codigo") { burbuja("ia", T.fin); invitar(p); return; }
      burbuja("ia", r.d.error === "tope_dia" ? T.topeDia : r.d.error === "tope_total" ? T.topeTotal : r.d.error === "no_comprobado" ? T.noComprobado : T.noPuedo);
      if (r.d.error === "tope_total") invitar(p);
      return;
    }
    respuesta(r.d.texto, r.d.pagos);
    historial.push({ rol: "tu", texto: t }, { rol: "ia", texto: r.d.texto }); historial = historial.slice(-8);
  }
  async function preguntar(t) {
    const p = leerPase(); if (p) return preguntarPago(p, t);
    if (gratisUsada()) { burbuja("tu", t); planesEnChat(); return; }
    burbuja("tu", t);
    const pensando = burbuja("ia", mk("span", "tqc-dots")); pensando.firstChild.append(mk("i"), mk("i"), mk("i"));
    const r = await api("pregunta-gratis", Object.assign({ pregunta: t, idioma: LANG }, datosPregunta()));
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
    const pase = leerPase();
    const top = mk("div", "tqc-top"); top.appendChild(mk("h2", "tqc-h", T.titulo)); sub = mk("p", "tqc-sub", pase ? T.hasta(new Date(pase.hasta)) : gratisUsada() ? "" : T.gratis); sub.hidden = !sub.textContent; top.appendChild(sub);
    msgs = mk("div", "tqc-msgs"); msgs.setAttribute("aria-live", "polite");
    sug = mk("div", "tqc-sug");
    sugerencias().forEach((q) => { const b = mk("button", null, q); b.type = "button"; b.addEventListener("click", () => preguntar(q)); sug.appendChild(b); });
    const f = mk("form", "tqc-in"); const inp = mk("input"); inp.id = "tqcTxt"; inp.autocomplete = "off"; inp.maxLength = 400; inp.placeholder = T.escribe; inp.setAttribute("aria-label", T.escribe);
    const env = mk("button", null, "→"); env.type = "submit"; env.setAttribute("aria-label", T.enviar);
    f.append(inp, env); f.addEventListener("submit", (e) => { e.preventDefault(); const t = inp.value.trim(); if (t) { inp.value = ""; preguntar(t); } });
    ch.append(top, msgs, sug, f);
    caja.appendChild(ch);
    historial = [];
    const viejo = leer(PASE);
    if (!pase && viejo && viejo.codigo) setTimeout(() => estado(viejo, true), 0);
    if (pase) {
      if (codigoNuevo) {
        const f2 = document.createDocumentFragment(); f2.appendChild(mk("b", null, T.tuyo));
        const cod = mk("span", "tqc-cod", codigoNuevo); const cp = mk("button", "tqc-ver", T.copiar); cp.type = "button";
        cp.addEventListener("click", () => { try { navigator.clipboard.writeText(codigoNuevo).then(() => { cp.textContent = T.copiado; }, () => {}); } catch (e) {} });
        f2.append(cod, cp, mk("span", "tqc-cod-t", T.correo)); burbuja("ia", f2).classList.add("tqc-m--cod"); codigoNuevo = null;
      }
      burbuja("ia", T.hola);
      if (regaloPendiente) { burbuja("ia", T.regalo(T.hasta(new Date(pase.hasta)))); regaloPendiente = 0; } else estado(pase);
    } else burbuja("ia", T.hola); // los planes salen solo cuando la persona pregunta
  }
  // Invita a un amigo: un enlace propio (sin el código); si el amigo paga, 30 días más para ti
  const RUTA = { es: "/extracto/", ca: "/ca/extracte/", en: "/en/statement/" }[LANG];
  function invitar(pase) {
    const f = document.createDocumentFragment(); f.appendChild(document.createTextNode(T.invitaYo));
    const b = mk("button", "tqc-inv-b"); b.type = "button";
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v8h14v-8M12 8.5v12M12 8.5c-1.5-3.5-5.5-4-5.5-1.5S10 8.5 12 8.5zM12 8.5c1.5-3.5 5.5-4 5.5-1.5S14 8.5 12 8.5z"/></svg>';
    b.appendChild(mk("span", null, T.invita));
    const s = mk("span", "tqc-inv-s"); s.hidden = true;
    b.addEventListener("click", async () => {
      b.disabled = true;
      const r = await api("invitar", { codigo: pase.codigo }); b.disabled = false;
      if (!r.ok || !r.d.id) { s.textContent = T.noPuedo; s.hidden = false; return; }
      poner(MIREF, r.d.id);
      if (!r.d.quedan) { s.textContent = T.sinHuecos; s.hidden = false; return; }
      const url = location.origin + RUTA + "?amigo=" + r.d.id;
      try { if (navigator.share) { await navigator.share({ title: "Feehund", text: T.compartirTxt, url }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
      try { await navigator.clipboard.writeText(T.compartirTxt + " " + url); s.textContent = T.enlaceCopiado; } catch (e) { s.textContent = url; }
      s.hidden = false;
    });
    f.append(b, s);
    burbuja("ia", f).classList.add("tqc-m--inv");
  }
  // Al abrir: lo que queda del pase (puede haber crecido por un amigo) y el aviso del regalo
  let regaloPendiente = 0;
  async function estado(pase, caducado) {
    const r = await api("estado", { codigo: pase.codigo });
    if (!r.ok) return;
    poner(PASE, Object.assign({}, pase, { plan: r.d.plan, hasta: r.d.hasta }));
    if (caducado) { // aquí ya había caducado, pero un amigo le ha dado más días: se vuelve a montar con el pase
      if (r.d.hasta > Date.now()) { regaloPendiente = r.d.regalo || 0; if (caja) caja.remove(); montarCaja(); colocar(); }
      else if (msgs && !msgs.querySelector(".tqc-m--inv")) { const fin = burbuja("ia", T.fin); msgs.insertBefore(fin, msgs.firstChild); invitar(pase); }
      return;
    }
    if (sub) sub.textContent = T.hasta(new Date(r.d.hasta));
    if (r.d.regalo) burbuja("ia", T.regalo(T.hasta(new Date(r.d.hasta))));
  }
  // Llega por el enlace de un amigo: se guarda para cuando pague
  (function () {
    const q = new URLSearchParams(location.search), a = String(q.get("amigo") || "").toUpperCase();
    if (!q.has("amigo")) return;
    if (/^[0-9A-HJKMNP-TV-Z]{8}$/.test(a) && a !== leer(MIREF)) poner(AMIGO, a);
    q.delete("amigo"); const qs = q.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  })();

  // Dónde va: en el ordenador, a la derecha del resultado; en el móvil, antes de «Compartir» (o tras las gráficas si están abiertas)
  const ancho = matchMedia("(min-width:1100px)");
  function colocar() {
    if (!caja) return;
    if (NEG) {
      const res = $("res"), solo = $("tqcSolo");
      if (res && !res.hidden) { if (ancho.matches) { if (caja.parentNode !== res) res.insertBefore(caja, res.firstChild); } else if (caja.parentNode !== res || caja.nextElementSibling) res.appendChild(caja); }
      else if (solo && caja.parentNode !== solo) solo.appendChild(caja);
      altoOrdenador(); return;
    }
    const res = $("xRes"), r3 = res && res.querySelector(".r3"), tj = $("xTarjeta"), gr = $("pgGr");
    if (!res) return;
    if (ancho.matches) { if (caja.parentNode !== res) res.insertBefore(caja, res.firstChild); }
    else if (r3 && r3.hidden && gr) { if (caja.previousElementSibling !== gr) gr.after(caja); }
    else if (tj && tj.parentNode) { if (caja.nextElementSibling !== tj) tj.before(caja); }
    else if (caja.parentNode !== res) res.appendChild(caja);
    altoOrdenador();
  }
  // Ordenador: Tiqui cabe entero en la pantalla nada más entrar (con «Escribe tu pregunta» a la vista) y es lo bastante
  // alto para que, al final de la página, su borde de abajo coincida con el del contenido.
  function altoOrdenador() {
    if (!caja) return;
    if (!ancho.matches) { caja.style.removeProperty("--tqc-alto"); return; }
    // dónde empieza Tiqui sin hacer scroll: arriba de su columna (Tiqui es fijo al bajar, así que se mide la columna, no Tiqui)
    const res = caja.parentNode; if (!res || res.id === "tqcSolo") { caja.style.removeProperty("--tqc-alto"); return; }
    const arriba = res.getBoundingClientRect().top + scrollY + (parseFloat(getComputedStyle(res).paddingTop) || 0);
    caja.style.setProperty("--tqc-alto", Math.max(420, Math.round(innerHeight - arriba - 16)) + "px");
  }
  let tAlto; addEventListener("resize", () => { clearTimeout(tAlto); tAlto = setTimeout(altoOrdenador, 120); });
  ancho.addEventListener("change", colocar);
  document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("#pgTabs")) setTimeout(colocar, 0); });

  document.addEventListener("fh-resultado", (e) => {
    const r = e.detail; if (!r) return;
    try {
      ultimoR = r;
      // Lo que Feehund ya sabe (sus cobros) y lo que contestaste en las preguntas manda sobre las reglas de arriba
      const CASA = ["telecos", "energia", "agua", "alarmas", "hogar", "gastos_fijos", "vivienda"], SUSC = ["streaming", "musica", "nube_apps", "ia", "prensa", "gimnasios", "citas", "videojuegos", "idiomas", "reparto", "suscripciones", "club_descuentos", "bienestar", "pasarelas"];
      const sabe = {};
      (r.cobros || []).forEach((c) => {
        const s2 = CASA.indexOf(c.categoria) >= 0 ? "casa" : SUSC.indexOf(c.categoria) >= 0 ? "suscr" : c.categoria === "comisiones" ? "comisiones" : null;
        if (s2) (c.movimientos || []).forEach((m) => { sabe[m.fecha + "|" + m.importe + "|" + m.concepto] = s2; });
      });
      todos = ((r.lectura && r.lectura.movimientos) || []).map((m, n) => {
        const c = clasificar(m), k = sabe[m.fecha + "|" + m.importe + "|" + m.concepto];
        return Object.assign({}, m, { id: "m" + n, c: k ? { k: c.k, s: k } : c });
      });
      if (caja) caja.remove();
      montarCaja(); setTimeout(colocar, 0); setTimeout(altoOrdenador, 800); // otra vez cuando ya está todo encima (el aviso de ejemplo llega después)
    } catch (err) { /* si algo falla, el resumen sigue como siempre */ }
  });

  // Mi datáfono: los datos del negocio salen del mismo cálculo que pinta el resultado (assets/app.js, evento «fh-datafono»)
  function datosDeCalculo(d) {
    const { I, R, PLANS } = d, V = I.V || 0, ops = I.T > 0 ? V / I.T : 0, c = R && R.cur, plan = c && c.p;
    const per = /(\d{2})\/(\d{2})\/(\d{4}).*?(\d{2})\/(\d{2})\/(\d{4})/.exec(($("dPeriodo") || {}).textContent || "");
    let filas = (R && R.ranked) || [];
    try { if (typeof calcular === "function" && PLANS) { const R2 = calcular(PLANS, Object.assign({}, I, { cons: 0 })); if (R2 && R2.ranked) filas = R2.ranked; } } catch (e) { /* las de la recomendación */ }
    const cada = plan && (plan.modelo === "Porcentaje" || plan.id === "CONTRATO") && I.T > 0
      ? { particulares: c.rp * 100 + (c.fp || 0) / I.T * 100, empresa: c.re * 100 + (c.fe || 0) / I.T * 100, fuera_europa: c.rn * 100 + (c.fn || 0) / I.T * 100, amex: c.ra * 100 + (c.fa || 0) / I.T * 100, bizum: c.rb * 100 + (c.fb || 0) / I.T * 100 } : null;
    if (cada && plan.id === "CONTRATO") ["rp", "re", "rn", "ra", "rb"].forEach((k, i) => { if (plan[k] == null || plan[k] === "") delete cada[["particulares", "empresa", "fuera_europa", "amex", "bizum"][i]]; });
    return {
      desde: per ? per[3] + "-" + per[2] + "-" + per[1] : null, hasta: per ? per[6] + "-" + per[5] + "-" + per[4] : null,
      sector: I.sector || null, forma: I.forma || null, actual: plan ? (plan.id === "CONTRATO" ? null : plan.plan) : null,
      ventas: { particulares: V * I.wP, empresa: V * I.wE, fuera_europa: V * I.wN, amex: V * I.wA, bizum: V * I.wB },
      operaciones: Math.round(ops), pagado: I.curCost > 0 ? I.curCost : null, permanencia_meses: I.MREM || 0, cada100_actual: cada,
      fijo: plan && plan.id === "CONTRATO" ? (plan.fp || null) : null, cuota: plan && plan.id === "CONTRATO" ? (plan.cuota || null) : null, alquiler: plan && plan.id === "CONTRATO" ? (plan.alq || null) : null,
      tarifas: filas.filter((r) => !r.es_actual && V > 0).slice(0, 40).map((r) => ({ nombre: r.p.plan, coste_mes: Math.round(r.Cn * 100) / 100, cada100: Math.round(r.Cn / V * 10000) / 100, comprobada: r.p.fiab === "Alta", nota: r.p.aviso || null })),
    };
  }
  if (NEG) {
    document.addEventListener("fh-datafono", (e) => {
      try { datosNeg = datosDeCalculo(e.detail); if (caja) caja.remove(); montarCaja(); setTimeout(colocar, 0); setTimeout(altoOrdenador, 800); } catch (err) { /* el resultado sigue como siempre */ }
    });
    // «A quién cambiarte» (Qué hacer ahora) pregunta a Tiqui
    document.addEventListener("fh-tiqui-preguntar", (e) => {
      if (!caja) return;
      caja.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (e.detail) preguntar(String(e.detail));
    });
  }

  // ---------- Al abrir la página: volver de Stripe (?tiqui=ok / ?tiqui=no) o con el código (?vuelta#CÓDIGO) ----------
  const aviso = (t) => { const e = $(NEG ? "dErr" : "xErr"); if (e) { e.textContent = t; e.hidden = false; } };
  async function abrirYMostrar(codigo) {
    const r = await api("abrir", { codigo });
    if (!r.ok || !r.d.caja) { aviso(T.noAbre); return false; }
    if (r.d.plan && r.d.hasta) poner(PASE, { codigo, plan: r.d.plan, hasta: r.d.hasta });
    let datos; try { datos = await abrirCaja(codigo, r.d.caja); } catch (e) { aviso(T.noAbre); return false; }
    // un pase de negocio abierto desde Mi banco o Tu Tiqui: se va a Mi datáfono
    if (datos && datos.n && !NEG) { try { localStorage.setItem("fh-tiqui-pase-negocio", JSON.stringify({ codigo, plan: r.d.plan, hasta: r.d.hasta })); localStorage.removeItem(PASE); } catch (e) {} location.replace(PAG_DAT[LANG] + "?vuelta#" + encodeURIComponent(codigo)); return true; }
    if (NEG) {
      if (!datos || !datos.n) return false;
      // Mi datáfono sin resultado delante: Tiqui sale solo, arriba, con los datos guardados
      datosNeg = datos.n;
      let solo = $("tqcSolo");
      if (!solo) { solo = mk("div", "tqc-solo"); solo.id = "tqcSolo"; const lector = $("dLector"); (lector && lector.parentNode ? lector.parentNode : document.body).insertBefore(solo, lector); }
      if (caja) caja.remove(); montarCaja(); colocar(); solo.scrollIntoView({ block: "start" });
      return true;
    }
    return !!(window.FeehundMostrar && datos && window.FeehundMostrar(datos.r));
  }
  async function inicio() {
    const q = new URLSearchParams(location.search), limpia = () => history.replaceState(null, "", location.pathname);
    if (q.get("tiqui") === "ok") {
      const pend = leer(PEND), sesion = q.get("s") || ""; limpia();
      if (!pend) return;
      let r = await api("canjear", { codigo: pend.codigo, sesion });
      if (!r.ok && r.d.error === "sin_pagar") { await new Promise((x) => setTimeout(x, 3000)); r = await api("canjear", { codigo: pend.codigo, sesion }); }
      if (!r.ok) { aviso(T.sinPagar); return; }
      poner(PASE, { codigo: pend.codigo, plan: r.d.plan, hasta: r.d.hasta }); poner(PEND, null);
      codigoNuevo = pend.codigo;
      await abrirYMostrar(pend.codigo);
    } else if (q.get("tiqui") === "no") {
      const pend = leer(PEND); limpia(); poner(PEND, null);
      if (pend) await abrirYMostrar(pend.codigo); // vuelve a ver lo suyo, sin subir nada
    } else if (q.has("vuelta")) {
      const h = decodeURIComponent(location.hash.slice(1)).trim().toUpperCase(), p = leerPase();
      const codigo = /^FH-?[0-9A-Z]/.test(h) ? h : p && p.codigo; limpia();
      if (codigo) await abrirYMostrar(codigo);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => inicio().catch(() => {})); else inicio().catch(() => {});
})();
