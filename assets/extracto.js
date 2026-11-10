/* Lector de extractos de la página de Design (/extracto/, /ca/extracte/, /en/statement/), conectado al motor de
   /assets/extracto/motor.js. Todo pasa en este dispositivo: el archivo no se envía, no se guarda y no se registra.
   Lo que no cabe en el diseño (contraseña de un PDF) se pide con una ventana del navegador; lo demás usa sus piezas. */
(function () {
  "use strict";
  const ROOT = (document.currentScript && document.currentScript.dataset.root) || "../";
  const $ = (id) => document.getElementById(id);
  const LANG = ["es", "ca", "en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
  const TX = {
    es: { datafono: "Esto es el resumen de tu datáfono, no el extracto de tu cuenta. Se lee en Mi datáfono.", irDatafono: "Ir a Mi datáfono", year: "€/año", menos: " menos/año",
      si: "Sí", no: "No", el: "el", yMas: (n) => " y " + n + " más", deA: (x, a, b) => x + ", de " + a + " a " + b + " €", enExtracto: (x) => x + " € en este extracto",
      preguntas: [["doble", "¿Te cobran algo dos veces?"], ["subida", "¿Te han subido algún precio?"], ["recibo", "¿Algún recibo ha venido más alto de lo normal?"], ["comision", "¿Pagas comisiones al banco?"]],
      pagas: ["Pagas ", " al año en suscripciones y domiciliaciones"], nada: "No hemos visto cobros que se repitan.",
      avisosN: (n) => (n === 0 ? "Todo en orden. No vemos nada raro." : n === 1 ? "Revisa este aviso" : "Revisa estos " + n + " avisos"),
      aDoble: ["Te cobraron dos veces", (x, i, f) => x + " te cobró " + i + " € dos veces el " + f, "Pide al comercio que te lo devuelva"],
      aSubida: ["Te subieron el precio", (x, a, b, c, p) => x + " pasó de " + a + " a " + b + " € " + c + " (+" + p + " %)", "Dar de baja"],
      aRecibo: ["Recibo más alto de lo normal", (x, i, f, p, m) => x + " te cobró " + i + " € el " + f + ", un " + p + " % más que tu media (" + m + " €)", "Revisa esa factura"],
      aComision: ["Comisiones del banco", (l) => "En este extracto te han cobrado " + l, "Pregunta a tu banco cómo evitarlas"],
      aReclamar: ["Comisión que puedes reclamar", (x) => x, "Pide que te la devuelvan"],
      aTarjeta: ["Pagos con tarjeta de crédito", (i, n) => "Pagas " + i + " € con tu tarjeta de crédito (" + n + " pagos). Lo que compras con ella no sale en este extracto.", "Sube también el extracto de la tarjeta"],
      nDevol: (x, i) => x + " te devolvió " + i + " €", nBaja: (x, a, b) => x + " bajó de " + a + " a " + b + " €", nFin: (x, f) => "Ya no te cobran " + x + " (último cargo el " + f + ")", nFinT: (x, f) => x + " ya no sale en esta cuenta desde el " + f + ". Puede que ahora lo pagues con la tarjeta de crédito", nDevC: (x, i) => "Te devolvieron la " + x.toLowerCase() + " (" + i + " €)", otroC: " (otro contrato)",
      eEstable: "Estable", eVaria: "Varía mucho", totalSec: (x, suf) => "Total: " + x + " €" + suf,
      cada: { semanal: "cada semana", mensual: "cada mes", bimestral: "cada 2 meses", trimestral: "cada 3 meses", semestral: "cada 6 meses", anual: "cada año" },
      head: (n, m) => n
        ? "Es lo que pagas al año en " + n + (n === 1 ? " cobro que se repite." : " cobros que se repiten.") + (m ? (m === 1 ? " Hay 1 más que no sumamos porque lo hemos visto pocas veces." : " Hay " + m + " más que no sumamos porque los hemos visto pocas veces.") : "")
        : m ? (m === 1 ? "Es lo que pagarías al año si se repite 1 cobro que solo hemos visto pocas veces." : "Es lo que pagarías al año si se repiten " + m + " cobros que solo hemos visto pocas veces.") : "No hemos visto cobros que se repitan.",
      visto: (n) => (n === 1 ? "Visto 1 vez" : "Visto " + n + " veces"), baja: "Se puede dar de baja", fee: "Comisión evitable", up: "Subió", down: "Bajó", doble: "Cobrado dos veces",
      reclamar: "Se puede reclamar", devuelta: "Te la devolvieron", nuevo: "Nuevo", otro: "Otro contrato",
      entre: (a, b, c) => "Entre " + a + " y " + b + " € " + c, fijo: (x, c) => x + " € " + c, pagado: (x) => x + " € pagados", sinCargo: (n) => (n === 1 ? "1 mes sin cargo" : n + " meses sin cargo"),
      veces: (n) => (n === 1 ? "Cobrada 1 vez" : "Cobrada " + n + " veces"), de: (a, b, c) => "De " + a + " a " + b + " € " + c, repetido: (f) => "Repetido el " + f,
      devol: (n, f) => (n === 1 ? "Una devolución, el " + f : n + " devoluciones, la última el " + f), ultimo: (f, x, c) => "Último cargo el " + f + " · " + x + " € " + c,
      tarjeta: "Puede que ahora lo pagues con la tarjeta de crédito.", darBaja: "Dar de baja", priv: "Se lee en tu dispositivo. No se sube.",
      none: "No ha encontrado cobros que se repitan. Prueba con más meses.", bad: "No se ha podido leer. Prueba con Excel o CSV.", mapeo: "No reconocemos las columnas de este archivo. Prueba a descargarlo en Excel o CSV.",
      dl: "Imagen descargada.", ics: "Archivo de avisos descargado.", sinIcs: "No hay cobros para avisar.", share: (x) => x + " €/año en cobros que se repiten · feehund.com", lista: "Cobros que se repiten" },
    ca: { datafono: "Això és el resum del teu datàfon, no l'extracte del teu compte. Es llegeix a El meu datàfon.", irDatafono: "Anar a El meu datàfon", year: "€/any", menos: " menys/any",
      si: "Sí", no: "No", el: "el", yMas: (n) => " i " + n + " més", deA: (x, a, b) => x + ", de " + a + " a " + b + " €", enExtracto: (x) => x + " € en aquest extracte",
      preguntas: [["doble", "Et cobren alguna cosa dues vegades?"], ["subida", "T'han pujat algun preu?"], ["recibo", "Algun rebut ha vingut més alt del normal?"], ["comision", "Pagues comissions al banc?"]],
      pagas: ["Pagues ", " l'any en subscripcions i domiciliacions"], nada: "No hem vist cobraments que es repeteixin.",
      avisosN: (n) => (n === 0 ? "Tot en ordre. No veiem res d'estrany." : n === 1 ? "Revisa aquest avís" : "Revisa aquests " + n + " avisos"),
      aDoble: ["T'han cobrat dues vegades", (x, i, f) => x + " t'ha cobrat " + i + " € dues vegades el " + f, "Demana al comerç que te'l retorni"],
      aSubida: ["T'han pujat el preu", (x, a, b, c, p) => x + " ha passat de " + a + " a " + b + " € " + c + " (+" + p + " %)", "Donar de baixa"],
      aRecibo: ["Rebut més alt del normal", (x, i, f, p, m) => x + " t'ha cobrat " + i + " € el " + f + ", un " + p + " % més que la teva mitjana (" + m + " €)", "Revisa aquesta factura"],
      aComision: ["Comissions del banc", (l) => "En aquest extracte t'han cobrat " + l, "Pregunta al teu banc com evitar-les"],
      aReclamar: ["Comissió que pots reclamar", (x) => x, "Demana que te la retornin"],
      aTarjeta: ["Pagaments amb targeta de crèdit", (i, n) => "Pagues " + i + " € amb la teva targeta de crèdit (" + n + " pagaments). El que compres amb ella no surt en aquest extracte.", "Puja també l'extracte de la targeta"],
      nDevol: (x, i) => x + " t'ha retornat " + i + " €", nBaja: (x, a, b) => x + " ha baixat de " + a + " a " + b + " €", nFin: (x, f) => "Ja no et cobren " + x + " (últim càrrec el " + f + ")", nFinT: (x, f) => x + " ja no surt en aquest compte des del " + f + ". Potser ara el pagues amb la targeta de crèdit", nDevC: (x, i) => "T'han retornat la " + x.toLowerCase() + " (" + i + " €)", otroC: " (un altre contracte)",
      eEstable: "Estable", eVaria: "Varia molt", totalSec: (x, suf) => "Total: " + x + " €" + suf,
      cada: { semanal: "cada setmana", mensual: "cada mes", bimestral: "cada 2 mesos", trimestral: "cada 3 mesos", semestral: "cada 6 mesos", anual: "cada any" },
      head: (n, m) => n
        ? "És el que pagues cada any en " + n + (n === 1 ? " cobrament que es repeteix." : " cobraments que es repeteixen.") + (m ? (m === 1 ? " N'hi ha 1 més que no sumem perquè l'hem vist poques vegades." : " N'hi ha " + m + " més que no sumem perquè els hem vist poques vegades.") : "")
        : m ? (m === 1 ? "És el que pagaries cada any si es repeteix 1 cobrament que només hem vist poques vegades." : "És el que pagaries cada any si es repeteixen " + m + " cobraments que només hem vist poques vegades.") : "No hem vist cobraments que es repeteixin.",
      visto: (n) => (n === 1 ? "Vist 1 vegada" : "Vist " + n + " vegades"), baja: "Es pot donar de baixa", fee: "Comissió evitable", up: "Ha pujat", down: "Ha baixat", doble: "Cobrat dues vegades",
      reclamar: "Es pot reclamar", devuelta: "Te la van retornar", nuevo: "Nou", otro: "Un altre contracte",
      entre: (a, b, c) => "Entre " + a + " i " + b + " € " + c, fijo: (x, c) => x + " € " + c, pagado: (x) => x + " € pagats", sinCargo: (n) => (n === 1 ? "1 mes sense càrrec" : n + " mesos sense càrrec"),
      veces: (n) => (n === 1 ? "Cobrada 1 vegada" : "Cobrada " + n + " vegades"), de: (a, b, c) => "De " + a + " a " + b + " € " + c, repetido: (f) => "Repetit el " + f,
      devol: (n, f) => (n === 1 ? "Una devolució, el " + f : n + " devolucions, l'última el " + f), ultimo: (f, x, c) => "Últim càrrec el " + f + " · " + x + " € " + c,
      tarjeta: "Potser ara el pagues amb la targeta de crèdit.", darBaja: "Donar de baixa", priv: "Es llegeix al teu dispositiu. No es puja.",
      none: "No ha trobat cobraments que es repeteixin. Prova amb més mesos.", bad: "No s'ha pogut llegir. Prova amb Excel o CSV.", mapeo: "No reconeixem les columnes d'aquest fitxer. Prova de descarregar-lo en Excel o CSV.",
      dl: "Imatge descarregada.", ics: "Fitxer d'avisos descarregat.", sinIcs: "No hi ha cobraments per avisar.", share: (x) => x + " €/any en cobraments que es repeteixen · feehund.com", lista: "Cobraments que es repeteixen" },
    en: { datafono: "This is your card machine summary, not your bank statement. It goes in My card machine.", irDatafono: "Go to My card machine", year: "€/year", menos: " less/year",
      si: "Yes", no: "No", el: "on", yMas: (n) => " and " + n + " more", deA: (x, a, b) => x + ", from " + a + " to " + b + " €", enExtracto: (x) => x + " € in this statement",
      preguntas: [["doble", "Are you charged twice for anything?"], ["subida", "Has any price gone up?"], ["recibo", "Has any bill come in higher than usual?"], ["comision", "Do you pay bank fees?"]],
      pagas: ["You pay ", " a year in subscriptions and direct debits"], nada: "We have not seen any repeating charges.",
      avisosN: (n) => (n === 0 ? "All in order. We see nothing unusual." : n === 1 ? "Check this alert" : "Check these " + n + " alerts"),
      aDoble: ["You were charged twice", (x, i, f) => x + " charged you " + i + " € twice on " + f, "Ask the company for a refund"],
      aSubida: ["Your price went up", (x, a, b, c, p) => x + " went from " + a + " to " + b + " € " + c + " (+" + p + " %)", "Cancel"],
      aRecibo: ["Bill higher than usual", (x, i, f, p, m) => x + " charged you " + i + " € on " + f + ", " + p + " % more than your average (" + m + " €)", "Check that bill"],
      aComision: ["Bank fees", (l) => "In this statement you were charged " + l, "Ask your bank how to avoid them"],
      aReclamar: ["A fee you can claim back", (x) => x, "Ask for it back"],
      aTarjeta: ["Credit card payments", (i, n) => "You pay " + i + " € with your credit card (" + n + " payments). What you buy with it is not in this statement.", "Upload the card statement too"],
      nDevol: (x, i) => x + " refunded you " + i + " €", nBaja: (x, a, b) => x + " went down from " + a + " to " + b + " €", nFin: (x, f) => "You are no longer charged for " + x + " (last charge on " + f + ")", nFinT: (x, f) => x + " has not appeared in this account since " + f + ". You may now pay it with your credit card", nDevC: (x, i) => "Your " + x.toLowerCase() + " was refunded (" + i + " €)", otroC: " (another contract)",
      eEstable: "Stable", eVaria: "Varies a lot", totalSec: (x, suf) => "Total: " + x + " €" + suf,
      cada: { semanal: "every week", mensual: "every month", bimestral: "every 2 months", trimestral: "every 3 months", semestral: "every 6 months", anual: "every year" },
      head: (n, m) => n
        ? "This is what you pay each year in " + n + (n === 1 ? " repeating charge." : " repeating charges.") + (m ? (m === 1 ? " 1 more is not added in because we have only seen it a few times." : " " + m + " more are not added in because we have only seen them a few times.") : "")
        : m ? (m === 1 ? "This is what you would pay each year if 1 charge we have only seen a few times repeats." : "This is what you would pay each year if " + m + " charges we have only seen a few times repeat.") : "We have not seen any repeating charges.",
      visto: (n) => (n === 1 ? "Seen once" : "Seen " + n + " times"), baja: "You can cancel it", fee: "Avoidable fee", up: "Went up", down: "Went down", doble: "Charged twice",
      reclamar: "You can claim it", devuelta: "Refunded", nuevo: "New", otro: "Another contract",
      entre: (a, b, c) => "Between " + a + " and " + b + " € " + c, fijo: (x, c) => x + " € " + c, pagado: (x) => x + " € paid", sinCargo: (n) => (n === 1 ? "1 month with no charge" : n + " months with no charge"),
      veces: (n) => (n === 1 ? "Charged once" : "Charged " + n + " times"), de: (a, b, c) => "From " + a + " to " + b + " € " + c, repetido: (f) => "Repeated on " + f,
      devol: (n, f) => (n === 1 ? "One refund, on " + f : n + " refunds, the last on " + f), ultimo: (f, x, c) => "Last charge on " + f + " · " + x + " € " + c,
      tarjeta: "You may now be paying it with your credit card.", darBaja: "Cancel", priv: "It's read on your device. Nothing is uploaded.",
      none: "No recurring charges found. Try with more months.", bad: "The file could not be read. Try Excel or CSV.", mapeo: "We do not recognise the columns in this file. Try downloading it as Excel or CSV.",
      dl: "Image downloaded.", ics: "Reminder file downloaded.", sinIcs: "There are no charges to remind you about.", share: (x) => "€" + x + "/year in recurring charges · feehund.com", lista: "Recurring charges" },
  }[LANG];
  const BAJA_DIR = { es: "baja", ca: "baixa", en: "cancel" }[LANG];
  // Páginas de baja que existen hoy en la web (las demás no se enlazan hasta que existan)
  const BAJAS = { netflix: "netflix", spotify: "spotify", amazon_prime: "amazon-prime", disney_plus: "disney-plus" };
  const nf2 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });
  const nf0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: "always" });
  const e2 = (x) => nf2.format(x), e0 = (x) => nf0.format(Math.round(x));

  // El motor se carga al abrir la página (pesa poco y no trae librerías); cada lector, solo cuando llega su archivo.
  let motorP = null;
  const motor = () => (motorP = motorP || import(new URL(ROOT + "assets/extracto/motor.js", location.href).href));
  addEventListener("load", () => {
    motor().then(async (m) => {
      if (location.pathname.indexOf("/extracto/") !== 0 || !navigator.serviceWorker) return;
      const reg = await m.registrarSinConexion().catch(() => null);
      if (!reg) return;
      // Versión nueva del lector: si la página está quieta (sin análisis a medias), entra ya y la página se recarga una vez.
      // Si no, entra la próxima vez. Así nadie se queda con un lector viejo por tener la pestaña abierta.
      const quieta = () => !actual && scr.res.hidden && scr.load.hidden;
      let recargada = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (!recargada && quieta()) { recargada = true; location.reload(); } });
      const activar = (w) => { if (w && navigator.serviceWorker.controller && quieta()) w.postMessage({ tipo: "activar" }); };
      activar(reg.waiting);
      reg.addEventListener("updatefound", () => { const w = reg.installing; if (w) w.addEventListener("statechange", () => { if (w.state === "installed") activar(w); }); });
      reg.update().catch(() => {});
    }).catch(() => {});
  });

  const scr = { up: $("xUp"), load: $("xLoad"), res: $("xRes") };
  const cargando = scr.load && scr.load.querySelector("p");
  const textoCarga = cargando ? cargando.textContent : "";
  let actual = null, entradaActual = null, contrasenas = {};

  function show(which) { for (const k in scr) scr[k].hidden = k !== which; scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
  function msg(el, t) { el.textContent = t; el.hidden = !t; }

  async function analyze(entrada) {
    entradaActual = entrada;
    msg($("xErr"), ""); msg($("xMsg"), ""); show("load");
    const t0 = Date.now();
    let r = null, error = null;
    try {
      const m = await motor();
      r = await m.analizar(entrada, { idioma: LANG, contrasenas, onProgreso: (p) => { if (cargando && p && p.texto) cargando.textContent = p.texto; } });
      // PDF con contraseña: se pide aquí mismo y se vuelve a leer
      while (r && r.necesita_contrasena && r.necesita_contrasena.length) {
        let pedida = false;
        for (const p of r.necesita_contrasena) {
          const clave = prompt(p.texto || p.archivo);
          if (clave) { contrasenas[p.archivo] = clave; pedida = true; }
        }
        if (!pedida) break;
        r = await m.analizar(entrada, { idioma: LANG, contrasenas, onProgreso: (p) => { if (cargando && p && p.texto) cargando.textContent = p.texto; } });
      }
    } catch (e) { error = e; }
    await new Promise((ok) => setTimeout(ok, Math.max(0, 900 - (Date.now() - t0))));
    if (cargando) cargando.textContent = textoCarga;
    if (error || !r) { show("up"); msg($("xErr"), (error && error.message) || TX.bad); return; }
    const cobros = (r.cobros || []).filter((c) => c.estado === "seguro" || c.estado === "posible");
    if (!cobros.length && !(r.terminados || []).length && !(r.devoluciones || []).length) {
      // sin ningún movimiento leído: ¿es el resumen del datáfono? Entonces se dice y se enlaza «Mi datáfono»
      if (!((r.lectura && r.lectura.movimientos) || []).length && await esResumenDatafono(entrada)) { show("up"); aMiDatafono($("xErr")); return; }
      show("up");
      const err = (r.errores || [])[0];
      msg($("xErr"), err ? err.texto : r.necesita_mapeo ? TX.mapeo : TX.none);
      return;
    }
    actual = r;
    render(r, cobros); show("res");
    const h = $("xResH"); if (h) h.focus({ preventScroll: true });
  }

  /** ¿Lo lee el lector del datáfono con ventas o cobros? Solo se mira cuando aquí no se ha leído ningún movimiento. */
  async function esResumenDatafono(entrada) {
    try {
      const m = await motor();
      const rr = await m.analizarResumen(entrada, { idioma: LANG });
      const c = (rr && rr.campos) || {};
      return Boolean(rr && rr.lectura && rr.lectura.modo) && ["ventas_particulares", "ventas_empresa", "ventas_fuera_europa", "ventas_amex", "ventas_bizum", "operaciones"]
        .some((k) => c[k] && typeof c[k].valor === "number" && c[k].valor > 0);
    } catch (e) { return false; }
  }
  function aMiDatafono(el) {
    if (!el) return;
    el.textContent = TX.datafono + " ";
    const a = document.createElement("a");
    a.href = ROOT + { es: "datafono/", ca: "ca/datafon/", en: "en/card-machine/" }[LANG];
    a.textContent = TX.irDatafono + " →";
    el.appendChild(a); el.hidden = false;
  }

  // Fecha corta: 17/06
  const fecha = (iso) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "");
  const cada = (c) => TX.cada[c.periodicidad] || "";
  const el = (tag, clase, texto) => { const x = document.createElement(tag); if (clase) x.className = clase; if (texto !== undefined) x.textContent = texto; return x; };
  const extras = [];
  function limpiar() { while (extras.length) extras.pop().remove(); ["xList", "xAlertas", "xNoticias", "xTodo"].forEach((id) => { if ($(id)) $(id).textContent = ""; }); }

  // Una fila: nombre con etiquetas, una línea debajo (y otra si hace falta), enlace de baja y la cifra a la derecha
  function fila(nombre, tags, lineas, cifra, sufijo, baja) {
    const li = el("li", "ext-row"), m = el("div", "ext-row-m"), n = el("p", "ext-n", nombre);
    if (tags.length) { const tw = el("span", "ext-tags"); tags.forEach((t) => tw.appendChild(el("span", "ext-tag", t))); n.appendChild(tw); }
    m.appendChild(n);
    lineas.filter(Boolean).forEach((t) => m.appendChild(el("p", "ext-p", t)));
    if (baja) { const a = el("a", "ext-baja", TX.darBaja + " →"); a.href = baja; m.appendChild(a); }
    li.appendChild(m);
    if (cifra !== null && cifra !== undefined) { const y = el("p", "ext-y", cifra); if (sufijo) y.appendChild(el("span", "", sufijo)); li.appendChild(y); }
    return li;
  }

  function enlaceBaja(c) {
    const pag = BAJAS[c.comercio_id || c.id] || (c.categoria === "gimnasios" ? "gimnasio" : null);
    return pag ? ROOT + (LANG === "es" ? "" : LANG + "/") + BAJA_DIR + "/" + pag + "/" : null;
  }

  function etiquetas(c, otros) {
    const et = c.etiquetas || [], t = [];
    if (c.estado === "posible" && c.periodicidad !== "puntual") t.push(TX.visto(c.num_cargos || 1));
    if (et.indexOf("subio") >= 0) t.push(TX.up);
    if (et.indexOf("bajo") >= 0) t.push(TX.down);
    if (et.indexOf("doble") >= 0) t.push(TX.doble);
    if (et.indexOf("nuevo") >= 0) t.push(TX.nuevo);
    if (et.indexOf("reclamable") >= 0) t.push(TX.reclamar);
    if (et.indexOf("devuelto") >= 0) t.push(TX.devuelta);
    // una comisión que se puede reclamar ya dice que se puede evitar
    if (et.indexOf("evitable") >= 0 && et.indexOf("doble") < 0 && et.indexOf("reclamable") < 0) t.push(c.tipo === "comision" ? TX.fee : TX.baja);
    if (otros) t.push(TX.otro);
    return t;
  }

  // Lo que se paga: fijo «13,99 € cada mes»; variable «Entre 54,06 y 162,10 € cada mes» y lo pagado; comisión «Cobrada 3 veces»
  function lineaPrecio(c) {
    if (c.periodicidad === "puntual") return [TX.veces(c.num_cargos || 1)];
    const extra = c.meses_sin_cargo ? " · " + TX.sinCargo(c.meses_sin_cargo) : "";
    if (c.importe_tipo === "variable" && c.importe_min !== undefined) {
      const precio = c.importe_min === c.importe_max ? TX.fijo(e2(c.importe_min), cada(c)) : TX.entre(e2(c.importe_min), e2(c.importe_max), cada(c));
      return [precio + extra, TX.pagado(e2(c.pagado))];
    }
    return [TX.fijo(e2(c.importe), cada(c)) + extra];
  }

  function render(r, cobros) {
    if ($("tAlerta") && $("xAlertas")) return renderAccion(r, cobros);
    renderLista(r, cobros);
  }

  function renderLista(r, cobros) {
    limpiar();
    const seguros = cobros.filter((c) => c.estado === "seguro");
    const posibles = cobros.filter((c) => c.estado === "posible" && c.tipo !== "comision");
    const total = seguros.length ? r.total_seguro || 0 : r.total_posible || 0;
    $("xTotal").textContent = e0(total) + " " + TX.year;
    $("xCount").textContent = TX.head(seguros.length, posibles.length);

    // Avisos que cambian lo que ves: la tarjeta de crédito y un extracto corto
    const lista = $("xList");
    const avisos = ((r.lectura && r.lectura.avisos) || []).filter((a) => a.codigo === "cobros_tarjeta_credito" || a.codigo === "cobros_periodo_corto");
    for (const a of avisos) { const box = el("div", "ext-priv"); box.appendChild(el("p", "", a.texto)); lista.parentNode.insertBefore(box, lista); extras.push(box); }

    const porId = {};
    (r.cobros || []).concat(r.terminados || []).forEach((c) => { porId[c.id] = c; });
    (r.devoluciones || []).forEach((d) => { porId[d.id] = d; });
    let grupos = r.grupos || [];
    if (!grupos.length) grupos = [{ codigo: "sector_otros", titulo: TX.lista, ids: cobros.map((c) => c.id), total: null }];

    let ul = lista, despues = lista;
    grupos.forEach((g, k) => {
      // Si #xList es un contenedor (el diseño nuevo usa <div class="ext-groups">), cada grupo va en su propia tarjeta
      // dentro de él; si es la lista antigua (<ul>), el primer grupo va en ella y los demás detrás.
      if (lista.tagName !== "UL") { ul = el("ul", "ext-list"); lista.appendChild(ul); }
      else if (k > 0) { ul = el("ul", "ext-list"); despues.after(ul); despues = ul; extras.push(ul); }
      ul.setAttribute("aria-label", g.titulo);
      const cab = el("li", "ext-row"), h = el("h2", "ext-n", g.titulo);
      const cm = el("div", "ext-row-m"); cm.appendChild(h); cab.appendChild(cm);
      if (typeof g.total === "number" && g.total > 0) {
        // lo cobrado una sola vez (comisiones sueltas), lo devuelto y lo repetido no son «al año»
        const sueltas = g.ids.some((id) => porId[id] && porId[id].periodicidad === "puntual");
        const suf = g.codigo === "bajadas" ? TX.menos : g.codigo === "devoluciones" || g.codigo === "dobles" || sueltas ? "" : TX.year.replace("€", "");
        const y = el("p", "ext-y", (g.codigo === "subidas" ? "+" : "") + e2(g.total) + " €");
        if (suf) y.appendChild(el("span", "", suf));
        cab.appendChild(y);
      }
      ul.appendChild(cab);
      const vistos = {};
      g.ids.forEach((id) => {
        const c = porId[id]; if (!c) return;
        if (g.codigo === "subidas") ul.appendChild(fila(c.nombre, [], [TX.de(e2(c.subida.antes), e2(c.subida.ahora), cada(c))], "+" + e2(c.subida_mensual * 12) + " €", TX.year.replace("€", "")));
        else if (g.codigo === "bajadas") ul.appendChild(fila(c.nombre, [], [TX.de(e2(c.bajada.antes), e2(c.bajada.ahora), cada(c))], e2(c.bajada_mensual * 12) + " €", TX.menos));
        else if (g.codigo === "dobles") {
          const rep = (c.movimientos || []).filter((m) => m.doble).map((m) => TX.repetido(fecha(m.fecha)));
          ul.appendChild(fila(c.nombre, [], rep, e2(c.doble.importe) + " €", ""));
        } else if (g.codigo === "devoluciones") ul.appendChild(fila(c.nombre, [], [TX.devol(c.num, fecha(c.ultima_fecha))], e2(c.importe) + " €", ""));
        else if (g.codigo === "terminados") ul.appendChild(fila(c.nombre, [], [TX.ultimo(fecha(c.ultimo_cargo), e2(c.importe), cada(c)), c.quiza_en_tarjeta ? TX.tarjeta : ""], null));
        else {
          const k2 = c.comercio_id || c.nombre, otro = Boolean(vistos[k2]); vistos[k2] = true;
          ul.appendChild(fila(c.nombre, etiquetas(c, otro), lineaPrecio(c), e2(c.coste_anual || 0) + " €", c.periodicidad === "puntual" ? "" : TX.year.replace("€", ""), enlaceBaja(c)));
        }
      });
    });
  }

  // ---------- Resultado accionable (plantillas <template> de Design: tAlerta, tNoticia, tSeccion, tFila) ----------
  // Reglas de los avisos (decididas el 9 nov 2026):
  //   subida: la del motor (último importe ≥ 0,50 € y ≥ 3 % sobre el anterior)
  //   recibo alto: un cargo más de un 20 % por encima de la media de los demás cargos de ese recibo
  //   doble: la del motor (mismo importe en 0 a 3 días)
  const RECIBO_ALTO = 0.2;
  const ICONOS = {
    doble: "M3 9h13v10H3zM8 5h13v10",
    subida: "M4 17l6-6 4 4 6-7M14 8h6v6",
    recibo: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
    comision: "M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.6 5 3.4 5 1.6 5 3.6-2.2 3-5 3-5-1.1-5-3",
    tarjeta: "M3 6h18v12H3zM3 10h18",
  };
  function plantilla(id) { return $(id).content.firstElementChild.cloneNode(true); }
  function poner(raiz, campo, texto) { const x = raiz.querySelector('[data-c="' + campo + '"]'); if (x) x.textContent = texto; return x; }
  function icono(raiz, tipo) {
    // La plantilla trae el icono de un tipo; los demás se dibujan aquí con la misma clase
    if (raiz.querySelector(".al-i--" + tipo)) return;
    const vieja = raiz.querySelector(".al-i"); if (!vieja) return;
    const span = el("span", "al-i al-i--" + tipo); span.setAttribute("role", "img"); span.setAttribute("aria-label", TX["a" + tipo[0].toUpperCase() + tipo.slice(1)][0]);
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"), path = document.createElementNS(ns, "path");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true"); path.setAttribute("d", ICONOS[tipo]);
    svg.appendChild(path); span.appendChild(svg); vieja.replaceWith(span);
  }
  function alerta(tipo, titulo, detalle, cifra, accion, enlace) {
    const a = plantilla("tAlerta");
    a.dataset.tipo = tipo; icono(a, tipo);
    poner(a, "titulo", titulo); poner(a, "detalle", detalle); poner(a, "cifra", cifra || "");
    const ac = a.querySelector('[data-c="accion"]');
    if (ac) { if (accion) { ac.textContent = accion + " →"; if (enlace) ac.href = enlace; else ac.replaceWith(el("p", ac.className, accion)); } else ac.remove(); }
    return a;
  }
  const media = (xs) => xs.reduce((t, x) => t + x, 0) / xs.length;
  const pct = (x) => Math.round(x * 100);

  function renderAccion(r, cobros) {
    limpiar();
    const seguros = cobros.filter((c) => c.estado === "seguro");
    const total = seguros.length ? r.total_seguro || 0 : r.total_posible || 0;
    // Cabecera: «Pagas 3.532 € al año en suscripciones y domiciliaciones»
    const cuenta = $("xCount"), sr = $("xTotal");
    cuenta.textContent = "";
    if (total > 0) { cuenta.append(TX.pagas[0]); cuenta.appendChild(el("strong", "", e0(total) + " €")); cuenta.append(TX.pagas[1]); }
    else cuenta.append(TX.nada);
    if (sr) { sr.textContent = ""; cuenta.appendChild(sr); }

    const porId = {};
    (r.cobros || []).concat(r.terminados || []).forEach((c) => { porId[c.id] = c; });
    (r.devoluciones || []).forEach((d) => { porId[d.id] = d; });
    const grupo = (cod) => (r.grupos || []).find((g) => g.codigo === cod);
    const deGrupo = (cod) => ((grupo(cod) || {}).ids || []).map((id) => porId[id]).filter(Boolean);

    // ---- Para revisar ----
    const avisos = [];
    for (const c of deGrupo("dobles")) {
      const rep = (c.movimientos || []).find((m) => m.doble);
      const imp = (c.doble && c.doble.importe) || (rep && Math.abs(rep.importe)) || c.importe;
      avisos.push({ tipo: "doble", corto: c.nombre + ", " + e2(imp) + " € " + TX.el + " " + fecha(rep ? rep.fecha : c.ultimo_cargo), euros: imp, nodo: alerta("doble", TX.aDoble[0], TX.aDoble[1](c.nombre, e2(imp), fecha(rep ? rep.fecha : c.ultimo_cargo)), e2(imp) + " €", TX.aDoble[2]) });
    }
    for (const c of deGrupo("subidas")) {
      const s1 = c.subida || {}, anual = (c.subida_mensual || 0) * 12;
      avisos.push({ tipo: "subida", corto: TX.deA(c.nombre, e2(s1.antes), e2(s1.ahora)), euros: anual, nodo: alerta("subida", TX.aSubida[0], TX.aSubida[1](c.nombre, e2(s1.antes), e2(s1.ahora), cada(c), pct((s1.ahora - s1.antes) / s1.antes)), "+" + e2(anual) + " " + TX.year, TX.aSubida[2], enlaceBaja(c)) });
    }
    const vistosR = {};
    for (const c of cobros.concat(r.terminados || [])) {
      const kR = c.comercio_id || c.nombre, nombreR = c.nombre + (vistosR[kR] ? TX.otroC : ""); vistosR[kR] = true;
      const movs = (c.movimientos || []).filter((m) => !m.doble && !m.aparte && m.importe < 0);
      if (c.importe_tipo !== "variable" || movs.length < 3) continue;
      // el cargo que más se aleja hacia arriba de la media de los demás
      let peor = null;
      for (const m of movs) {
        const otros = movs.filter((x) => x !== m).map((x) => Math.abs(x.importe)), med = media(otros), v = Math.abs(m.importe);
        if (v > med * (1 + RECIBO_ALTO) && (!peor || v - med > peor.dif)) peor = { m, v, med, dif: v - med };
      }
      if (peor) avisos.push({ tipo: "recibo", corto: nombreR + ", " + e2(peor.v) + " € " + TX.el + " " + fecha(peor.m.fecha), euros: peor.dif, nodo: alerta("recibo", TX.aRecibo[0], TX.aRecibo[1](nombreR, e2(peor.v), fecha(peor.m.fecha), pct(peor.dif / peor.med), e2(peor.med)), "+" + e2(peor.dif) + " €", TX.aRecibo[2]) });
    }
    const comisiones = deGrupo("comisiones");
    for (const c of comisiones.filter((x) => (x.etiquetas || []).indexOf("reclamable") >= 0 && (x.etiquetas || []).indexOf("devuelto") < 0)) {
      avisos.push({ tipo: "comision", corto: c.nombre + ", " + e2(c.coste_anual || c.importe) + " €", euros: c.coste_anual || c.importe, nodo: alerta("comision", TX.aReclamar[0], TX.aReclamar[1](c.nombre), e2(c.coste_anual || c.importe) + " €", TX.aReclamar[2]) });
    }
    const pagadas = comisiones.filter((x) => (x.etiquetas || []).indexOf("devuelto") < 0 && (x.etiquetas || []).indexOf("reclamable") < 0);
    if (pagadas.length) {
      const suma = pagadas.reduce((t, x) => t + (x.coste_anual || x.importe || 0), 0);
      const lista = pagadas.map((x) => x.nombre.toLowerCase() + " (" + e2(x.coste_anual || x.importe) + " €)").join(", ");
      avisos.push({ tipo: "comision", corto: TX.enExtracto(e2(suma)), euros: suma, nodo: alerta("comision", TX.aComision[0], TX.aComision[1](lista), e2(suma) + " €", TX.aComision[2]) });
    }
    avisos.sort((a, b) => b.euros - a.euros);
    const tarjeta = ((r.lectura && r.lectura.avisos) || []).find((a) => a.codigo === "cobros_tarjeta_credito");
    const textoTarjeta = tarjeta && tarjeta.datos ? TX.aTarjeta[1](e2(tarjeta.datos.importe || 0), tarjeta.datos.n || 0) : "";
    const nota = $("xNota");
    // Con sitio para la nota (diseño de preguntas), la tarjeta de crédito va ahí y no como aviso
    if (textoTarjeta && !nota) avisos.push({ tipo: "tarjeta", euros: 0, nodo: alerta("tarjeta", TX.aTarjeta[0], textoTarjeta, "", TX.aTarjeta[2]) });
    if (nota) { nota.textContent = textoTarjeta ? textoTarjeta + " " + TX.aTarjeta[2] + "." : ""; nota.hidden = !textoTarjeta; }
    avisos.forEach((a) => $("xAlertas").appendChild(a.nodo));
    if ($("xAvisosN")) $("xAvisosN").textContent = TX.avisosN(avisos.length);
    mostrar($("xAlertas"), avisos.length);

    // ---- Las grandes preguntas: Sí o No, y una línea solo si es Sí ----
    if ($("xPreguntas") && $("tPregunta")) {
      for (const [tipo, pregunta] of TX.preguntas) {
        const deEste = avisos.filter((a) => a.tipo === tipo);
        const q = plantilla("tPregunta");
        q.dataset.respuesta = deEste.length ? "si" : "no";
        poner(q, "pregunta", pregunta);
        poner(q, "respuesta", deEste.length ? TX.si : TX.no);
        const d = poner(q, "detalle", deEste.length ? deEste[0].corto + (deEste.length > 1 ? TX.yMas(deEste.length - 1) : "") : "");
        if (d && !deEste.length) d.remove();
        $("xPreguntas").appendChild(q);
      }
    }

    // ---- Buenas noticias ----
    const noticias = [];
    for (const d of deGrupo("devoluciones")) noticias.push([d.tipo === "comision" || /^comisi|^comissi|fee/i.test(d.nombre) ? TX.nDevC(d.nombre, e2(d.importe)) : TX.nDevol(d.nombre, e2(d.importe)), ""]);
    for (const c of deGrupo("bajadas")) if (c.bajada) noticias.push([TX.nBaja(c.nombre, e2(c.bajada.antes), e2(c.bajada.ahora)), ""]);
    for (const c of r.terminados || []) noticias.push([(c.quiza_en_tarjeta ? TX.nFinT : TX.nFin)(c.nombre, fecha(c.ultimo_cargo)), ""]);
    for (const [t, cifra] of noticias) { const n = plantilla("tNoticia"); poner(n, "texto", t); const cx = poner(n, "cifra", cifra); if (cx && !cifra) cx.remove(); $("xNoticias").appendChild(n); }
    mostrar($("xNoticias"), noticias.length);

    // ---- Todo lo que pagas: por sector, recibos y comisiones ----
    const secciones = (r.grupos || []).filter((g) => g.codigo.indexOf("sector_") === 0 || g.codigo === "recibos" || g.codigo === "comisiones");
    for (const g of secciones) {
      const items = g.ids.map((id) => porId[id]).filter(Boolean);
      if (!items.length) continue;
      const sec = plantilla("tSeccion");
      // «.sec» ya es la clase de las secciones grandes de la web (con mucho relleno): aquí se cambia por «res-sec»
      if (sec.classList.contains("sec")) { sec.classList.remove("sec"); sec.classList.add("res-sec"); if ($("xTodo").children.length) sec.style.borderTop = "1px solid var(--ink)"; }
      poner(sec, "titulo", g.titulo);
      const sueltas = items.some((c) => c.periodicidad === "puntual");
      // lo que te devolvieron no cuenta en el total de la sección
      const tot = g.codigo === "comisiones" ? items.filter((c) => (c.etiquetas || []).indexOf("devuelto") < 0).reduce((t, c) => t + (c.coste_anual || 0), 0) : typeof g.total === "number" ? g.total : items.reduce((t, c) => t + (c.coste_anual || 0), 0);
      poner(sec, "total", TX.totalSec(e2(tot), sueltas ? "" : TX.year.replace("€", "")));
      const filas = sec.querySelector('[data-c="filas"]');
      const vistos = {};
      for (const c of items) {
        const f = plantilla("tFila"), et = c.etiquetas || [];
        const k2 = c.comercio_id || c.nombre, otro = Boolean(vistos[k2]); vistos[k2] = true;
        poner(f, "nombre", c.nombre + (otro ? " · " + TX.otro : ""));
        let estado = "estable", texto = TX.eEstable;
        if (et.indexOf("subio") >= 0) { estado = "subio"; texto = TX.up; }
        else if (et.indexOf("bajo") >= 0) { estado = "bajo"; texto = TX.down; }
        else if (c.estado === "posible" && c.periodicidad !== "puntual") { estado = "visto"; texto = TX.visto(c.num_cargos || 1); }
        else if (c.importe_tipo === "variable" && c.importe_min > 0 && c.importe_max > c.importe_min * (1 + RECIBO_ALTO)) { estado = "varia"; texto = TX.eVaria; }
        else if (c.periodicidad === "puntual") { estado = "visto"; texto = et.indexOf("devuelto") >= 0 ? TX.devuelta : et.indexOf("reclamable") >= 0 ? TX.reclamar : TX.fee; }
        const e = poner(f, "estado", texto); if (e) e.dataset.estado = estado;
        poner(f, "detalle", lineaPrecio(c).filter(Boolean).join(" · "));
        poner(f, "cifra", e2(c.coste_anual || 0) + " " + (c.periodicidad === "puntual" ? "€" : TX.year));
        filas.appendChild(f);
      }
      $("xTodo").appendChild(sec);
    }
    mostrar($("xTodo"), $("xTodo").querySelectorAll('[data-c="nombre"]').length);
  }

  // Cada bloque va dentro de un botón (<details>) o de una sección: se oculta si está vacío y su contador dice cuántos hay
  function mostrar(cont, n) {
    if (!cont) return;
    const caja = cont.closest("details") || cont.closest("section");
    if (caja) { caja.hidden = !n; const c = caja.querySelector("[data-n]"); if (c) c.textContent = n ? String(n) : ""; if (caja.tagName === "DETAILS") caja.open = false; }
  }

  function download(blob, name) { const u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }

  // Compartir: solo la cifra, nunca la lista ni los nombres
  async function share() {
    if (!actual) return;
    const total = (actual.cobros || []).some((c) => c.estado === "seguro") ? actual.total_seguro : actual.total_posible;
    const m = await motor();
    const blob = await m.generarImagenCompartir(total, { idioma: LANG });
    if (!blob) return;
    const file = new File([blob], "feehund.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text: TX.share(e0(total)) }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    download(blob, "feehund.png"); msg($("xMsg"), TX.dl);
  }

  async function ics() {
    if (!actual) return;
    const m = await motor();
    const txt = m.generarICS(actual, { idioma: LANG });
    if (!txt) { msg($("xMsg"), TX.sinIcs); return; }
    download(new Blob([txt], { type: "text/calendar" }), "feehund-avisos.ics"); msg($("xMsg"), TX.ics);
  }

  // Ejemplo: el extracto inventado de /data/ejemplo.csv (12 meses), leído igual que un archivo de verdad
  async function ejemplo() {
    const r = await fetch(ROOT + "data/ejemplo.csv");
    if (!r.ok) throw new Error(TX.bad);
    return new File([await r.blob()], "ejemplo.csv", { type: "text/csv" });
  }

  const priv = document.querySelector(".ext-priv strong");
  if (priv && /móvil|mòbil|phone/.test(priv.textContent)) priv.textContent = TX.priv;

  const input = $("xFile"), drop = $("xDrop");
  if (!input || !drop) return;
  // Todos los formatos que lee el motor, y varios archivos a la vez
  input.accept = ".csv,.tsv,.txt,.xls,.xlsx,.xlsm,.ods,.numbers,.pdf,.n43,.q43,.aeb,.ofx,.qfx,.qif,.xml,.sta,.mt940,.zip,.png,.jpg,.jpeg,.webp,.heic,.heif,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*";
  input.multiple = true;
  const archivos = (lista) => Array.prototype.slice.call(lista || []);
  $("xPick").addEventListener("click", () => input.click());
  input.addEventListener("change", () => { const fs = archivos(input.files); if (fs.length) { contrasenas = {}; analyze(fs); } input.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-over"); }));
  drop.addEventListener("drop", (e) => { const fs = archivos(e.dataTransfer && e.dataTransfer.files); if (fs.length) { contrasenas = {}; analyze(fs); } });
  // Texto pegado (Ctrl+V con el extracto copiado de la web del banco)
  addEventListener("paste", (e) => {
    if (!scr.up || scr.up.hidden || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
    const t = e.clipboardData && e.clipboardData.getData("text");
    if (t && t.split("\n").length > 2) { contrasenas = {}; analyze(t); }
  });
  $("xDemo").addEventListener("click", () => { contrasenas = {}; ejemplo().then(analyze, () => msg($("xErr"), TX.bad)); });
  $("xShare").addEventListener("click", () => share().catch(() => {}));
  $("xIcs").addEventListener("click", () => ics().catch(() => {}));
  $("xAgain").addEventListener("click", () => {
    actual = null; entradaActual = null; contrasenas = {};
    limpiar(); msg($("xMsg"), "");
    motor().then((m) => m.olvidar()).catch(() => {});
    show("up");
  });
})();
