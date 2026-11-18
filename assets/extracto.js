/* Lector de extractos de la página de Design (/extracto/, /ca/extracte/, /en/statement/), conectado al motor de
   /assets/extracto/motor.js. Todo pasa en este dispositivo: el archivo no se envía, no se guarda y no se registra.
   Lo que no cabe en el diseño (contraseña de un PDF) se pide con una ventana del navegador; lo demás usa sus piezas. */
(function () {
  "use strict";
  const ROOT = (document.currentScript && document.currentScript.dataset.root) || "../";
  // Contador anónimo (cambio 13). APAGADO: con activo:false no sale ninguna petición. Solo envía el nombre del evento
  // («abre», «resultado», «comparte»), sin cookies, sin identificadores y sin nada del extracto.
  // Se enciende poniendo activo:true, después de crear la base de datos y su enlace en Cloudflare (ver functions/api/contador.js).
  const CONTADOR = { activo: false, ruta: "/api/contador" };
  function contar(evento) {
    if (!CONTADOR.activo || !window.fetch) return;
    try { fetch(CONTADOR.ruta, { method: "POST", body: evento, headers: { "content-type": "text/plain" }, credentials: "omit", cache: "no-store", keepalive: true, referrerPolicy: "no-referrer" }).catch(() => {}); } catch (e) {}
  }
  const $ = (id) => document.getElementById(id);
  const LANG = ["es", "ca", "en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
  const TX = {
    es: { datafono: "Esto es el resumen de tu datáfono, no el extracto de tu cuenta. Se lee en Mi datáfono.", irDatafono: "Ir a Mi datáfono", year: "€/año", menos: " menos/año",
      si: "Sí", no: "No", el: "el", yMas: (n) => " y " + n + " más", deA: (x, a, b) => x + ", de " + a + " a " + b + " €", enExtracto: (x) => x + " € en este extracto",
      preguntas: [["doble", "¿Te cobran algo dos veces?"], ["subida", "¿Te han subido algún precio?"], ["recibo", "¿Algún recibo ha venido más alto de lo normal?"], ["comision", "¿Pagas comisiones al banco?"]],
      pagas: ["Pagas ", " al año en suscripciones y domiciliaciones"], nada: "No hemos visto cobros que se repitan.",
      temas: { doble: "cobros dobles", subida: "subidas de precio", recibo: "recibos más altos de lo normal", comision: "comisiones del banco" },
      bien: (l) => "Todo en orden en " + l + ".", yy: " y ",
      avisosN: (n) => (n === 0 ? "Nada raro por aquí." : n === 1 ? "Revisa este aviso" : "Revisa estos " + n + " avisos"),
      aDoble: ["Te cobraron dos veces", (x, i, f) => x + " te cobró " + i + " € dos veces el " + f, "Pide al comercio que te lo devuelva"],
      aSubida: ["Te subieron el precio", (x, a, b, c, p) => x + " pasó de " + a + " a " + b + " € " + c + " (+" + p + " %)", "Dar de baja"],
      aRecibo: ["Recibo más alto de lo normal", (x, i, f, p, m) => x + " te cobró " + i + " € el " + f + ", un " + p + " % más que tu media (" + m + " €)", "Revisa esa factura"],
      aComision: ["Comisiones del banco", (l) => "En este extracto te han cobrado " + l, "Pregunta a tu banco cómo evitarlas"],
      aReclamar: ["Comisión que puedes reclamar", (x) => x, "Pide que te la devuelvan"],
      aTarjeta: ["Pagos con tarjeta de crédito", (i, n) => "Pagas " + i + " € con tu tarjeta de crédito (" + n + " pagos). Lo que compras con ella no sale en este extracto.", "Elige también el extracto de la tarjeta"],
      nDevol: (x, i) => x + " te devolvió " + i + " €", nBaja: (x, a, b) => x + " bajó de " + a + " a " + b + " €", nFin: (x, f) => "Ya no te cobran " + x + " (último cargo el " + f + ")", nFinT: (x, f) => x + " ya no sale en esta cuenta desde el " + f + ". Puede que ahora lo pagues con la tarjeta de crédito", nDevC: (x, i) => "Te devolvieron la " + x.toLowerCase() + " (" + i + " €)", otroC: " (otro contrato)",
      eEstable: "Estable", eVaria: "Varía mucho", totalSec: (x, suf) => "Total: " + x + " €" + suf,
      cada: { semanal: "cada semana", cuatrisemanal: "cada 4 semanas", mensual: "cada mes", bimestral: "cada 2 meses", trimestral: "cada 3 meses", semestral: "cada 6 meses", anual: "cada año" },
      head: (n, m) => n
        ? "Es lo que pagas al año en " + n + (n === 1 ? " cobro que se repite." : " cobros que se repiten.") + (m ? (m === 1 ? " Hay 1 más que no sumamos porque lo hemos visto pocas veces." : " Hay " + m + " más que no sumamos porque los hemos visto pocas veces.") : "")
        : m ? (m === 1 ? "Es lo que pagarías al año si se repite 1 cobro que solo hemos visto pocas veces." : "Es lo que pagarías al año si se repiten " + m + " cobros que solo hemos visto pocas veces.") : "No hemos visto cobros que se repitan.",
      visto: (n) => (n === 1 ? "Visto 1 vez" : "Visto " + n + " veces"), baja: "Se puede dar de baja", fee: "Comisión evitable", up: "Subió", down: "Bajó", doble: "Cobrado dos veces",
      reclamar: "Se puede reclamar", devuelta: "Te la devolvieron", nuevo: "Nuevo", otro: "Otro contrato",
      entre: (a, b, c) => "Entre " + a + " y " + b + " € " + c, fijo: (x, c) => x + " € " + c, pagado: (x) => x + " € pagados", sinCargo: (n) => (n === 1 ? "1 mes sin cargo" : n + " meses sin cargo"),
      veces: (n) => (n === 1 ? "Cobrada 1 vez" : "Cobrada " + n + " veces"), de: (a, b, c) => "De " + a + " a " + b + " € " + c, repetido: (f) => "Repetido el " + f,
      devol: (n, f) => (n === 1 ? "Una devolución, el " + f : n + " devoluciones, la última el " + f), ultimo: (f, x, c) => "Último cargo el " + f + " · " + x + " € " + c,
      tarjeta: "Puede que ahora lo pagues con la tarjeta de crédito.", darBaja: "Dar de baja", darme: "Darme de baja",
      aDuplicado: ["Pagas dos servicios para lo mismo", (a, b) => a + " y " + b + " hacen lo mismo. Puedes quedarte con uno."], priv: "Privado. No se guarda.",
      none: "No ha encontrado cobros que se repitan. Prueba con más meses.", bad: "No se ha podido leer. Prueba con Excel o CSV.", mapeo: "No reconocemos las columnas de este archivo. Prueba a descargarlo en Excel o CSV.",
      dl: "Imagen guardada. Desde el móvil se comparte directo en Instagram o WhatsApp.", ics: "Archivo de avisos descargado.", sinIcs: "No hay cobros para avisar.", share: (x) => x + " €/año en cobros que se repiten · feehund.com", lista: "Cobros que se repiten" },
    ca: { datafono: "Això és el resum del teu datàfon, no l'extracte del teu compte. Es llegeix a El meu datàfon.", irDatafono: "Anar a El meu datàfon", year: "€/any", menos: " menys/any",
      si: "Sí", no: "No", el: "el", yMas: (n) => " i " + n + " més", deA: (x, a, b) => x + ", de " + a + " a " + b + " €", enExtracto: (x) => x + " € en aquest extracte",
      preguntas: [["doble", "Et cobren alguna cosa dues vegades?"], ["subida", "T'han pujat algun preu?"], ["recibo", "Algun rebut ha vingut més alt del normal?"], ["comision", "Pagues comissions al banc?"]],
      pagas: ["Pagues ", " l'any en subscripcions i domiciliacions"], nada: "No hem vist cobraments que es repeteixin.",
      temas: { doble: "cobraments dobles", subida: "pujades de preu", recibo: "rebuts més alts del normal", comision: "comissions del banc" },
      bien: (l) => "Tot en ordre en " + l + ".", yy: " i ",
      avisosN: (n) => (n === 0 ? "Res d'estrany per aquí." : n === 1 ? "Revisa aquest avís" : "Revisa aquests " + n + " avisos"),
      aDoble: ["T'han cobrat dues vegades", (x, i, f) => x + " t'ha cobrat " + i + " € dues vegades el " + f, "Demana al comerç que te'l retorni"],
      aSubida: ["T'han pujat el preu", (x, a, b, c, p) => x + " ha passat de " + a + " a " + b + " € " + c + " (+" + p + " %)", "Donar de baixa"],
      aRecibo: ["Rebut més alt del normal", (x, i, f, p, m) => x + " t'ha cobrat " + i + " € el " + f + ", un " + p + " % més que la teva mitjana (" + m + " €)", "Revisa aquesta factura"],
      aComision: ["Comissions del banc", (l) => "En aquest extracte t'han cobrat " + l, "Pregunta al teu banc com evitar-les"],
      aReclamar: ["Comissió que pots reclamar", (x) => x, "Demana que te la retornin"],
      aTarjeta: ["Pagaments amb targeta de crèdit", (i, n) => "Pagues " + i + " € amb la teva targeta de crèdit (" + n + " pagaments). El que compres amb ella no surt en aquest extracte.", "Tria també l'extracte de la targeta"],
      nDevol: (x, i) => x + " t'ha retornat " + i + " €", nBaja: (x, a, b) => x + " ha baixat de " + a + " a " + b + " €", nFin: (x, f) => "Ja no et cobren " + x + " (últim càrrec el " + f + ")", nFinT: (x, f) => x + " ja no surt en aquest compte des del " + f + ". Potser ara el pagues amb la targeta de crèdit", nDevC: (x, i) => "T'han retornat la " + x.toLowerCase() + " (" + i + " €)", otroC: " (un altre contracte)",
      eEstable: "Estable", eVaria: "Varia molt", totalSec: (x, suf) => "Total: " + x + " €" + suf,
      cada: { semanal: "cada setmana", cuatrisemanal: "cada 4 setmanes", mensual: "cada mes", bimestral: "cada 2 mesos", trimestral: "cada 3 mesos", semestral: "cada 6 mesos", anual: "cada any" },
      head: (n, m) => n
        ? "És el que pagues cada any en " + n + (n === 1 ? " cobrament que es repeteix." : " cobraments que es repeteixen.") + (m ? (m === 1 ? " N'hi ha 1 més que no sumem perquè l'hem vist poques vegades." : " N'hi ha " + m + " més que no sumem perquè els hem vist poques vegades.") : "")
        : m ? (m === 1 ? "És el que pagaries cada any si es repeteix 1 cobrament que només hem vist poques vegades." : "És el que pagaries cada any si es repeteixen " + m + " cobraments que només hem vist poques vegades.") : "No hem vist cobraments que es repeteixin.",
      visto: (n) => (n === 1 ? "Vist 1 vegada" : "Vist " + n + " vegades"), baja: "Es pot donar de baixa", fee: "Comissió evitable", up: "Ha pujat", down: "Ha baixat", doble: "Cobrat dues vegades",
      reclamar: "Es pot reclamar", devuelta: "Te la van retornar", nuevo: "Nou", otro: "Un altre contracte",
      entre: (a, b, c) => "Entre " + a + " i " + b + " € " + c, fijo: (x, c) => x + " € " + c, pagado: (x) => x + " € pagats", sinCargo: (n) => (n === 1 ? "1 mes sense càrrec" : n + " mesos sense càrrec"),
      veces: (n) => (n === 1 ? "Cobrada 1 vegada" : "Cobrada " + n + " vegades"), de: (a, b, c) => "De " + a + " a " + b + " € " + c, repetido: (f) => "Repetit el " + f,
      devol: (n, f) => (n === 1 ? "Una devolució, el " + f : n + " devolucions, l'última el " + f), ultimo: (f, x, c) => "Últim càrrec el " + f + " · " + x + " € " + c,
      tarjeta: "Potser ara el pagues amb la targeta de crèdit.", darBaja: "Donar de baixa", darme: "Donar-me de baixa",
      aDuplicado: ["Pagues dos serveis per al mateix", (a, b) => a + " i " + b + " fan el mateix. Pots quedar-te amb un."], priv: "Privat. No es desa.",
      none: "No ha trobat cobraments que es repeteixin. Prova amb més mesos.", bad: "No s'ha pogut llegir. Prova amb Excel o CSV.", mapeo: "No reconeixem les columnes d'aquest fitxer. Prova de descarregar-lo en Excel o CSV.",
      dl: "Imatge desada. Des del mòbil es comparteix directament a Instagram o WhatsApp.", ics: "Fitxer d'avisos descarregat.", sinIcs: "No hi ha cobraments per avisar.", share: (x) => x + " €/any en cobraments que es repeteixen · feehund.com", lista: "Cobraments que es repeteixen" },
    en: { datafono: "This is your card machine summary, not your bank statement. It goes in My card machine.", irDatafono: "Go to My card machine", year: "€/year", menos: " less/year",
      si: "Yes", no: "No", el: "on", yMas: (n) => " and " + n + " more", deA: (x, a, b) => x + ", from " + a + " to " + b + " €", enExtracto: (x) => x + " € in this statement",
      preguntas: [["doble", "Are you charged twice for anything?"], ["subida", "Has any price gone up?"], ["recibo", "Has any bill come in higher than usual?"], ["comision", "Do you pay bank fees?"]],
      pagas: ["You pay ", " a year in subscriptions and direct debits"], nada: "We have not seen any repeating charges.",
      temas: { doble: "double charges", subida: "price rises", recibo: "bills higher than usual", comision: "bank fees" },
      bien: (l) => "All in order on " + l + ".", yy: " and ",
      avisosN: (n) => (n === 0 ? "Nothing odd here." : n === 1 ? "Check this alert" : "Check these " + n + " alerts"),
      aDoble: ["You were charged twice", (x, i, f) => x + " charged you " + i + " € twice on " + f, "Ask the company for a refund"],
      aSubida: ["Your price went up", (x, a, b, c, p) => x + " went from " + a + " to " + b + " € " + c + " (+" + p + " %)", "Cancel"],
      aRecibo: ["Bill higher than usual", (x, i, f, p, m) => x + " charged you " + i + " € on " + f + ", " + p + " % more than your average (" + m + " €)", "Check that bill"],
      aComision: ["Bank fees", (l) => "In this statement you were charged " + l, "Ask your bank how to avoid them"],
      aReclamar: ["A fee you can claim back", (x) => x, "Ask for it back"],
      aTarjeta: ["Credit card payments", (i, n) => "You pay " + i + " € with your credit card (" + n + " payments). What you buy with it is not in this statement.", "Choose the card statement too"],
      nDevol: (x, i) => x + " refunded you " + i + " €", nBaja: (x, a, b) => x + " went down from " + a + " to " + b + " €", nFin: (x, f) => "You are no longer charged for " + x + " (last charge on " + f + ")", nFinT: (x, f) => x + " has not appeared in this account since " + f + ". You may now pay it with your credit card", nDevC: (x, i) => "Your " + x.toLowerCase() + " was refunded (" + i + " €)", otroC: " (another contract)",
      eEstable: "Stable", eVaria: "Varies a lot", totalSec: (x, suf) => "Total: " + x + " €" + suf,
      cada: { semanal: "every week", cuatrisemanal: "every 4 weeks", mensual: "every month", bimestral: "every 2 months", trimestral: "every 3 months", semestral: "every 6 months", anual: "every year" },
      head: (n, m) => n
        ? "This is what you pay each year in " + n + (n === 1 ? " repeating charge." : " repeating charges.") + (m ? (m === 1 ? " 1 more is not added in because we have only seen it a few times." : " " + m + " more are not added in because we have only seen them a few times.") : "")
        : m ? (m === 1 ? "This is what you would pay each year if 1 charge we have only seen a few times repeats." : "This is what you would pay each year if " + m + " charges we have only seen a few times repeat.") : "We have not seen any repeating charges.",
      visto: (n) => (n === 1 ? "Seen once" : "Seen " + n + " times"), baja: "You can cancel it", fee: "Avoidable fee", up: "Went up", down: "Went down", doble: "Charged twice",
      reclamar: "You can claim it", devuelta: "Refunded", nuevo: "New", otro: "Another contract",
      entre: (a, b, c) => "Between " + a + " and " + b + " € " + c, fijo: (x, c) => x + " € " + c, pagado: (x) => x + " € paid", sinCargo: (n) => (n === 1 ? "1 month with no charge" : n + " months with no charge"),
      veces: (n) => (n === 1 ? "Charged once" : "Charged " + n + " times"), de: (a, b, c) => "From " + a + " to " + b + " € " + c, repetido: (f) => "Repeated on " + f,
      devol: (n, f) => (n === 1 ? "One refund, on " + f : n + " refunds, the last on " + f), ultimo: (f, x, c) => "Last charge on " + f + " · " + x + " € " + c,
      tarjeta: "You may now be paying it with your credit card.", darBaja: "Cancel", darme: "Cancel it for me",
      aDuplicado: ["Two services for the same thing", (a, b) => a + " and " + b + " do the same. You could keep just one."], priv: "Private. Never stored.",
      none: "No recurring charges found. Try with more months.", bad: "The file could not be read. Try Excel or CSV.", mapeo: "We do not recognise the columns in this file. Try downloading it as Excel or CSV.",
      dl: "Image saved. On your phone it shares straight to Instagram or WhatsApp.", ics: "Reminder file downloaded.", sinIcs: "There are no charges to remind you about.", share: (x) => "€" + x + "/year in recurring charges · feehund.com", lista: "Recurring charges" },
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
      // Versión nueva del lector: si la página está quieta (sin análisis a medias ni archivos esperando en la lista), entra
      // ya y la página se recarga una vez. Si no, entra la próxima vez. Así nadie se queda con un lector viejo.
      const quieta = () => !actual && scr.res.hidden && scr.load.hidden && !(bandeja && bandeja.total);
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
  let actual = null, entradaActual = null, contrasenas = {}, propio = false;

  function show(which) { for (const k in scr) scr[k].hidden = k !== which; document.body.classList.toggle("con-barra", which === "res" && Boolean($("xBarra"))); scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
  function msg(el, t) { el.textContent = t; el.hidden = !t; }

  // Barra de la espera bajo Tiqui: avanza con lo que va contando el motor (leyendo, página 3 de 10, saldo, cobros) y, entre
  // aviso y aviso, poco a poco, para que nunca parezca parada. Llega al 100 % justo antes de enseñar el resultado.
  const barraCarga = (() => {
    const caja = $("xProg"), lleno = $("xProgL");
    let v = 0, techo = 0, paso = 0.03, reloj = null;
    const pintar = () => { if (!caja) return; lleno.style.transform = "scaleX(" + (v / 100).toFixed(3) + ")"; caja.setAttribute("aria-valuenow", String(Math.round(v))); };
    const subir = (t, ritmo) => { if (t > techo) techo = Math.min(97, t); if (ritmo) paso = ritmo; };
    return {
      empezar() { if (!caja) return; clearInterval(reloj); v = 0; techo = 30; paso = 0.03; pintar(); reloj = setInterval(() => { v = Math.min(techo, v + Math.max(0.04, (techo - v) * paso)); pintar(); }, 120); },
      fase(p) {
        if (!p) return;
        if (typeof p.progreso === "number") subir(20 + 55 * Math.max(0, Math.min(1, p.progreso)));
        else if (p.pagina && p.total) subir(20 + 55 * Math.min(1, p.pagina / p.total));
        else subir({ leyendo: 40, foto: 35, preparando_fotos: 30, saldo: 82, cobros: 92 }[p.fase] || 0);
      },
      ia() { subir(97, 0.006); }, // la lectura con IA tarda más: sigue avanzando, despacio
      async fin() { if (!caja) return; clearInterval(reloj); v = 100; pintar(); await new Promise((ok) => setTimeout(ok, 250)); },
      parar() { clearInterval(reloj); },
    };
  })();

  async function analyze(entrada) {
    entradaActual = entrada;
    msg($("xErr"), ""); msg($("xMsg"), ""); show("load"); barraCarga.empezar();
    const t0 = Date.now();
    let r = null, error = null;
    try {
      const m = await motor();
      r = await m.analizar(entrada, { idioma: LANG, contrasenas, onProgreso: (p) => { barraCarga.fase(p); if (cargando && p && p.texto) cargando.textContent = p.texto; } });
      // PDF con contraseña: se pide aquí mismo y se vuelve a leer
      while (r && r.necesita_contrasena && r.necesita_contrasena.length) {
        let pedida = false;
        for (const p of r.necesita_contrasena) {
          const clave = prompt(p.texto || p.archivo);
          if (clave) { contrasenas[p.archivo] = clave; pedida = true; }
        }
        if (!pedida) break;
        r = await m.analizar(entrada, { idioma: LANG, contrasenas, onProgreso: (p) => { barraCarga.fase(p); if (cargando && p && p.texto) cargando.textContent = p.texto; } });
      }
      // Si el dispositivo no lo ha leído entero (filas sin leer, saldo que no cuadra, foto), lo lee Claude
      if (r && lecturaDudosa(r) && paraIA(entrada).length) {
        barraCarga.ia();
        const r2 = await leerConIA(entrada, m).catch((e) => { console.error("Feehund: lectura con IA", e); return null; });
        if (r2 && mejorLectura(r2, r)) r = r2;
      }
    } catch (e) { error = e; }
    await new Promise((ok) => setTimeout(ok, Math.max(0, 900 - (Date.now() - t0))));
    if (cargando) cargando.textContent = textoCarga;
    barraCarga.parar();
    if (error || !r) { show("up"); msg($("xErr"), (error && error.message) || TX.bad); return; }
    if (bandeja) bandeja.marcar(r.errores);
    let cobros = (r.cobros || []).filter((c) => c.estado === "seguro" || c.estado === "posible");
    if (!cobros.length && !(r.terminados || []).length && !(r.devoluciones || []).length) {
      // sin ningún movimiento leído: ¿es el resumen del datáfono? Entonces se dice y se enlaza «Mi datáfono»
      if (!((r.lectura && r.lectura.movimientos) || []).length && await esResumenDatafono(entrada)) { show("up"); aMiDatafono($("xErr")); return; }
      show("up");
      const err = (r.errores || [])[0];
      msg($("xErr"), err ? err.texto : r.necesita_mapeo ? TX.mapeo : TX.none);
      return;
    }
    actual = r;
    await envioP;
    await barraCarga.fin();
    // Lo grande que se repite y no reconocemos (el alquiler, por ejemplo): se pregunta antes del resumen, como mucho 3
    await preguntarDesconocidos(r, !(entrada && entrada.deEjemplo)).catch((e) => console.error("Feehund: preguntas", e));
    cobros = (r.cobros || []).filter((c) => c.estado === "seguro" || c.estado === "posible");
    setTimeout(() => document.dispatchEvent(new CustomEvent("fh-resultado", { detail: r })), 0); // pestañas y gráficas (assets/extracto/graficas.js), después de pintar el resumen
    render(r, cobros); show("res");
    const bShare = $("xShare"); if (bShare) bShare.hidden = !personalidad();
    propio = !(entrada && entrada.deEjemplo);
    if (propio) contar("resultado");
    // Etiqueta «Ejemplo» (#xEjemplo, de Design): solo cuando lo leído es el extracto inventado de ejemplo
    const ej = $("xEjemplo"); if (ej) ej.hidden = !(entrada && entrada.deEjemplo);
    const h = $("xResH"); if (h) h.focus({ preventScroll: true });
  }

  // Volver con el código de Tiqui (o de pagar): pinta un resultado guardado, sin leer nada ni volver a preguntar
  window.FeehundMostrar = (r) => {
    if (!r || !r.cobros) return false;
    actual = r; propio = true;
    const cobros = (r.cobros || []).filter((c) => c.estado === "seguro" || c.estado === "posible");
    setTimeout(() => document.dispatchEvent(new CustomEvent("fh-resultado", { detail: r })), 0);
    render(r, cobros); show("res");
    const bShare = $("xShare"); if (bShare) bShare.hidden = !personalidad();
    const ej = $("xEjemplo"); if (ej) ej.hidden = true;
    return true;
  };

  // ---------- Lectura con IA (Claude) cuando el dispositivo no puede leerlo entero ----------
  // El archivo va a /api/leer (Cloudflare), que se lo pasa a Claude y devuelve los movimientos sin guardar nada.
  // Los movimientos vuelven a pasar por el motor de siempre como un CSV: el mismo análisis y la misma comprobación de saldos.
  const AVISOS_DUDOSOS = ["no_cuadra", "filas_sin_leer"];
  // Mientras lee, la misma pantalla de carga de siempre (Tiqui olfateando), sin textos de IA (decisión del 16 nov)
  const TIPO_IA = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
  const tipoIA = (f) => {
    if (!f || typeof f.name !== "string") return null;
    const t = (f.type || "").toLowerCase();
    if (t === "application/pdf" || /^image\/(jpeg|png|webp|gif)$/.test(t)) return t;
    return TIPO_IA[(f.name.split(".").pop() || "").toLowerCase()] || null;
  };
  const archivosDe = (entrada) => (Array.isArray(entrada) ? entrada : [entrada]).filter(Boolean);
  const paraIA = (entrada) => archivosDe(entrada).filter((f) => tipoIA(f) && f.size > 0 && f.size <= 10 * 1024 * 1024);
  function lecturaDudosa(r) {
    const l = r.lectura || {};
    if (!(l.movimientos || []).length || r.necesita_confirmacion) return true;
    return (l.avisos || []).some((a) => AVISOS_DUDOSOS.indexOf(a.codigo) >= 0);
  }
  // Mejor la de la IA si su saldo cuadra y no lee menos movimientos que el dispositivo
  function mejorLectura(r2, r) {
    const n = (x) => ((x.lectura && x.lectura.movimientos) || []).length;
    if (!n(r2)) return false;
    const cuadra2 = !((r2.lectura.avisos || []).some((a) => a.codigo === "no_cuadra"));
    const cuadra = !((r.lectura && r.lectura.avisos) || []).some((a) => a.codigo === "no_cuadra");
    return (cuadra2 && n(r2) >= n(r) * 0.9) || (!cuadra && n(r2) > n(r));
  }
  // Un CSV como los de los bancos: «Fecha;Concepto;Importe;Saldo» con coma decimal
  function aCSV(movs) {
    const num = (x) => (x === null || x === undefined || !Number.isFinite(x)) ? "" : x.toFixed(2).replace(".", ",");
    const fechaES = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f) ? f.slice(8, 10) + "/" + f.slice(5, 7) + "/" + f.slice(0, 4) : f;
    const lineas = ["Fecha;Concepto;Importe;Saldo"];
    for (const m of movs) lineas.push([fechaES(m.fecha), String(m.concepto || "").replace(/[;\r\n]+/g, " ").trim(), num(m.importe), num(m.saldo)].join(";"));
    return lineas.join("\n") + "\n";
  }
  async function movimientosConIA(f, cual) {
    const res = await fetch(ROOT + "api/leer" + (cual === "preciso" ? "?modelo=preciso" : ""), { method: "POST", body: f, headers: { "content-type": tipoIA(f) }, credentials: "omit", cache: "no-store" });
    if (!res.ok || !res.body || !/event-stream/.test(res.headers.get("content-type") || "")) throw new Error("lectura con IA: " + res.status);
    const lector = res.body.getReader(), dec = new TextDecoder();
    let resto = "", texto = "", parada = null;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      resto += dec.decode(value, { stream: true });
      let i;
      while ((i = resto.indexOf("\n\n")) >= 0) {
        const ev = resto.slice(0, i); resto = resto.slice(i + 2);
        const linea = ev.split("\n").find((l) => l.indexOf("data:") === 0);
        if (!linea) continue;
        let d; try { d = JSON.parse(linea.slice(5)); } catch (e) { continue; }
        if (d.type === "content_block_delta" && d.delta && d.delta.type === "text_delta") texto += d.delta.text;
        else if (d.type === "message_delta" && d.delta) parada = d.delta.stop_reason;
        else if (d.type === "error") throw new Error("lectura con IA: " + ((d.error && d.error.type) || "error"));
      }
    }
    if (parada === "refusal" || !texto) throw new Error("lectura con IA: sin respuesta");
    const datos = JSON.parse(texto);
    return datos && datos.es_extracto !== false && Array.isArray(datos.movimientos) ? datos.movimientos : [];
  }
  // Primero el modelo rápido; si su lectura no cuadra con el saldo, el preciso
  async function leerConIA(entrada, m) {
    const otros = archivosDe(entrada).filter((f) => !paraIA([f]).length);
    const pasada = async (cual) => {
      const leidos = [];
      for (const f of paraIA(entrada)) {
        const movs = await movimientosConIA(f, cual);
        if (movs.length) leidos.push(new File([aCSV(movs)], f.name.replace(/\.[^.]+$/, "") + ".csv", { type: "text/csv" }));
      }
      if (!leidos.length) return null;
      const r = await m.analizar(otros.concat(leidos), { idioma: LANG, contrasenas });
      if (r) r.leidoConIA = cual;
      return r;
    };
    const rapida = await pasada("rapido").catch((e) => { console.error("Feehund: lectura rápida", e); return null; });
    if (rapida && !lecturaDudosa(rapida)) return rapida;
    const precisa = await pasada("preciso").catch((e) => { console.error("Feehund: lectura precisa", e); return null; });
    if (precisa && (!rapida || mejorLectura(precisa, rapida))) return precisa;
    return rapida;
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

  // Fecha en palabras: «13 de marzo» (es), «13 de març» / «13 d'abril» (ca), «13 March» (en)
  const MESES = {
    es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
    ca: ["gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost", "setembre", "octubre", "novembre", "desembre"],
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  }[LANG];
  const fecha = (iso) => {
    if (!iso) return "";
    const d = String(+iso.slice(8, 10)), m = MESES[+iso.slice(5, 7) - 1];
    if (LANG === "en") return d + " " + m;
    if (LANG === "ca") return d + (/^[aeiou]/.test(m) ? " d'" : " de ") + m;
    return d + " de " + m;
  };
  const cada = (c) => TX.cada[c.periodicidad] || "";
  const el = (tag, clase, texto) => { const x = document.createElement(tag); if (clase) x.className = clase; if (texto !== undefined) x.textContent = texto; return x; };
  const extras = [];

  // ---------- Resultado en «tres respuestas» (rediseño del 16 nov 2026, opción A) ----------
  // Orden fijo: la respuesta, qué hacer ahora, en qué se te va, buenas noticias, la tarjeta y los enlaces.
  // El detalle de siempre (avisos, secciones y noticias) sigue debajo, en #xDetalle, y lo abren «Revisar», «Ver» y las barras.
  const TRES = Boolean($("xHacer"));
  const T3 = {
    es: { meses: (n) => (n === 1 ? "1 mes leído" : n + " meses leídos"), calc: (n) => "al año, calculado con " + (n === 1 ? "1 mes" : n + " meses"),
      fRevisar: "Lo he revisado todo.", fNada: "Nada que reclamar. Lo he mirado dos veces, por si acaso.", fPoco: (n) => "Con " + (n === 1 ? "1 mes" : n + " meses") + " veo poco. Con 6 o más, lo veo todo.",
      difT: "Suscripción o recibo", dif: "Suscripción: la eliges y te das de baja cuando quieras, como Netflix o el gimnasio. Recibo: luz, agua, teléfono o internet; cambia según lo que gastas.",
      escRecibo: (x, n) => x + " se te escaparon en " + n + (n === 1 ? " recibo más alto de lo normal" : " recibos más altos de lo normal"),
      escDoble: (x, n) => x + " se te escaparon en " + (n === 1 ? "un posible cobro repetido" : n + " posibles cobros repetidos"),
      escComision: (x) => x + " se te escaparon en comisiones del banco",
      escVarios: (x, m) => x + " se te escaparon " + (m >= 12 ? "este año" : m <= 1 ? "este mes" : "en estos " + m + " meses"), escNada: "No se te escapa nada",
      suscr: (n, x, r) => n ? "Tienes " + n + (n === 1 ? " suscripción que te cuesta " : " suscripciones que te cuestan ") + x + " al año" + (r ? ", y " + r + (r === 1 ? " recibo más." : " recibos más.") : ".")
        : "Tienes " + r + (r === 1 ? " recibo que se repite" : " recibos que se repiten") + " y ninguna suscripción.",
      dq: { titulo: "1 minuto y queda perfecto", que: "¿Qué es esto?", de: (i, n) => i + " de " + n, veces: (x, n, p) => x + " · " + n + " veces" + (p ? ", " + p : ""), mes: "cada mes", dosMeses: "cada 2 meses", ops: { vivienda: "Alquiler o hipoteca", casa: "Luz, agua o internet", susc: "Suscripción", seg: "Seguro", otros: "Otra cosa" }, nose: "No lo sé", grupo: "Lo que me has dicho",
        pagos: (x, n) => x + " en " + n + (n === 1 ? " pago" : " pagos"), ops2: { fuera: "Bar o restaurante", super: "Súper", otro: "Tienda", transporte: "Transporte", salud: "Salud", ocio: "Ocio", persona: "Una persona" } },
      nada: "No hemos visto cobros que se repitan.", tipos: { casa: "Casa", susc: "Suscripciones", seg: "Seguros", banco: "Comisiones del banco", otros: "Otros pagos" }, otros: "Otros", recibos: "Recibos que varían", devolvieron: (x) => "Te devolvieron " + x, devoluciones: (n) => (n === 1 ? "1 devolución" : n + " devoluciones"),
      verMas: (n) => "Ver " + n + " más", verMenos: "Ver menos", verDetalle: "Ver todo el detalle", ocultarDetalle: "Ocultar el detalle",
      revisar: "Revisar", anadir: "Añadir", ver: "Ver", darme: "Darme de baja", darBaja: "Dar de baja",
      dobleT: (x) => x + ": posible cobro repetido", dobleL: (i, f) => i + " dos veces, el " + f,
      reciboT: (x, d, m) => x + ": +" + d + " en " + m, reciboL: (p) => p + " % más que tu media", reciboAnio: (p) => p + " % más que hace un año", consumo: "Puede ser por consumo",
      comT: (x) => "Comisiones del banco: " + x, comL: "Cobradas en este extracto", comLR: "Puedes pedir que te la devuelvan",
      subT: (x, a) => x + ": " + a + " al año", subL: "Tu suscripción más cara" },
    ca: { meses: (n) => (n === 1 ? "1 mes llegit" : n + " mesos llegits"), calc: (n) => "a l'any, calculat amb " + (n === 1 ? "1 mes" : n + " mesos"),
      fRevisar: "Ho he revisat tot.", fNada: "Res a reclamar. Ho he mirat dues vegades, per si de cas.", fPoco: (n) => "Amb " + (n === 1 ? "1 mes" : n + " mesos") + " veig poc. Amb 6 o més, ho veig tot.",
      difT: "Subscripció o rebut", dif: "Subscripció: la tries i et dones de baixa quan vulguis, com Netflix o el gimnàs. Rebut: llum, aigua, telèfon o internet; canvia segons el que gastes.",
      escRecibo: (x, n) => x + " se t'han escapat en " + n + (n === 1 ? " rebut més alt del normal" : " rebuts més alts del normal"),
      escDoble: (x, n) => x + " se t'han escapat en " + (n === 1 ? "un possible cobrament repetit" : n + " possibles cobraments repetits"),
      escComision: (x) => x + " se t'han escapat en comissions del banc",
      escVarios: (x, m) => x + " se t'han escapat " + (m >= 12 ? "aquest any" : m <= 1 ? "aquest mes" : "en aquests " + m + " mesos"), escNada: "No se t'escapa res",
      suscr: (n, x, r) => n ? "Tens " + n + (n === 1 ? " subscripció que et costa " : " subscripcions que et costen ") + x + " l'any" + (r ? ", i " + r + (r === 1 ? " rebut més." : " rebuts més.") : ".")
        : "Tens " + r + (r === 1 ? " rebut que es repeteix" : " rebuts que es repeteixen") + " i cap subscripció.",
      dq: { titulo: "1 minut i queda perfecte", que: "Què és això?", de: (i, n) => i + " de " + n, veces: (x, n, p) => x + " · " + n + " vegades" + (p ? ", " + p : ""), mes: "cada mes", dosMeses: "cada 2 mesos", ops: { vivienda: "Lloguer o hipoteca", casa: "Llum, aigua o internet", susc: "Subscripció", seg: "Assegurança", otros: "Una altra cosa" }, nose: "No ho sé", grupo: "El que m'has dit",
        pagos: (x, n) => x + " en " + n + (n === 1 ? " pagament" : " pagaments"), ops2: { fuera: "Bar o restaurant", super: "Súper", otro: "Botiga", transporte: "Transport", salud: "Salut", ocio: "Oci", persona: "Una persona" } },
      nada: "No hem vist cobraments que es repeteixin.", tipos: { casa: "Casa", susc: "Subscripcions", seg: "Assegurances", banco: "Comissions del banc", otros: "Altres pagaments" }, otros: "Altres", recibos: "Rebuts que varien", devolvieron: (x) => "T'han retornat " + x, devoluciones: (n) => (n === 1 ? "1 devolució" : n + " devolucions"),
      verMas: (n) => "Veure'n " + n + " més", verMenos: "Veure'n menys", verDetalle: "Veure tot el detall", ocultarDetalle: "Amagar el detall",
      revisar: "Revisar", anadir: "Afegir", ver: "Veure", darme: "Donar-me de baixa", darBaja: "Donar de baixa",
      dobleT: (x) => x + ": possible cobrament repetit", dobleL: (i, f) => i + " dues vegades, el " + f,
      reciboT: (x, d, m) => x + ": +" + d + (/^[aeiou]/.test(m) ? " a l'" : " al ") + m, reciboL: (p) => p + " % més que la teva mitjana", reciboAnio: (p) => p + " % més que fa un any", consumo: "Pot ser pel consum",
      comT: (x) => "Comissions del banc: " + x, comL: "Cobrades en aquest extracte", comLR: "Pots demanar que te la retornin",
      subT: (x, a) => x + ": " + a + " l'any", subL: "La teva subscripció més cara" },
    en: { meses: (n) => (n === 1 ? "1 month read" : n + " months read"), calc: (n) => "a year, worked out from " + (n === 1 ? "1 month" : n + " months"),
      fRevisar: "I've checked everything.", fNada: "Nothing to claim. I checked twice, just in case.", fPoco: (n) => "With " + (n === 1 ? "1 month" : n + " months") + " I see little. With 6 or more, I see it all.",
      difT: "Subscription or bill", dif: "Subscription: you choose it and can cancel any time, like Netflix or the gym. Bill: electricity, water, phone or internet; it changes with what you use.",
      escRecibo: (x, n) => x + " slipped away on " + n + (n === 1 ? " bill higher than usual" : " bills higher than usual"),
      escDoble: (x, n) => x + " slipped away on " + (n === 1 ? "a possible repeat charge" : n + " possible repeat charges"),
      escComision: (x) => x + " slipped away on bank fees",
      escVarios: (x, m) => x + " slipped away " + (m >= 12 ? "this year" : m <= 1 ? "this month" : "in these " + m + " months"), escNada: "Nothing is slipping away",
      suscr: (n, x, r) => n ? "You have " + n + (n === 1 ? " subscription costing " : " subscriptions costing ") + x + " a year" + (r ? ", and " + r + (r === 1 ? " more bill." : " more bills.") : ".")
        : "You have " + r + (r === 1 ? " bill that repeats" : " bills that repeat") + " and no subscriptions.",
      dq: { titulo: "1 minute and it's perfect", que: "What is this?", de: (i, n) => i + " of " + n, veces: (x, n, p) => x + " · " + n + " times" + (p ? ", " + p : ""), mes: "every month", dosMeses: "every 2 months", ops: { vivienda: "Rent or mortgage", casa: "Power, water or internet", susc: "Subscription", seg: "Insurance", otros: "Something else" }, nose: "I don't know", grupo: "What you told me",
        pagos: (x, n) => x + " in " + n + (n === 1 ? " payment" : " payments"), ops2: { fuera: "Bar or restaurant", super: "Supermarket", otro: "Shop", transporte: "Transport", salud: "Health", ocio: "Leisure", persona: "A person" } },
      nada: "We have not seen any repeating charges.", tipos: { casa: "Home", susc: "Subscriptions", seg: "Insurance", banco: "Bank fees", otros: "Other payments" }, otros: "Other", recibos: "Bills that vary", devolvieron: (x) => "You got " + x + " back", devoluciones: (n) => (n === 1 ? "1 refund" : n + " refunds"),
      verMas: (n) => "See " + n + " more", verMenos: "See less", verDetalle: "See all the detail", ocultarDetalle: "Hide the detail",
      revisar: "Check", anadir: "Add", ver: "See", darme: "Cancel it for me", darBaja: "Cancel",
      dobleT: (x) => x + ": possible repeat charge", dobleL: (i, f) => i + " twice, on " + f,
      reciboT: (x, d, m) => x + ": +" + d + " in " + m, reciboL: (p) => p + " % above your average", reciboAnio: (p) => p + " % more than a year ago", consumo: "Could be down to usage",
      comT: (x) => "Bank fees: " + x, comL: "Charged in this statement", comLR: "You can ask for it back",
      subT: (x, a) => x + ": " + a + " a year", subL: "Your most expensive subscription" },
  }[LANG];
  // «Darme de baja» solo en suscripciones: nunca luz, agua, gas, teléfono ni seguros
  const SUSCRIPCIONES = ["streaming", "musica", "nube_apps", "ia", "prensa", "gimnasios", "citas", "videojuegos", "idiomas", "reparto", "suscripciones", "club_descuentos", "bienestar"];
  const MESES_FRIO = [11, 12, 1, 2, 3];
  // logo oficial de la empresa: el de su guía de baja (assets/logos/<página>.png); si no hay guía, ninguno
  // y si no tiene guía, el de su nombre (assets/logos/<id con guiones>.png); si no existe, la imagen se quita sola
  const logoDe = (c) => {
    const f = fichaBaja(c);
    if (f && f.p) return ROOT + "assets/logos/" + f.p + ".png";
    return c && c.comercio_id ? ROOT + "assets/logos/" + String(c.comercio_id).replace(/_/g, "-") + ".png" : null;
  };
  const eur = (x) => (Math.abs(x) >= 1 ? e0(x) : e2(x)) + " €";
  let blobTarjeta = null, urlTarjeta = null, turnoTarjeta = 0;

  // Abre el detalle de siempre y lleva la vista a lo que se ha tocado
  function abrirDetalle(nodo) {
    const det = $("xDetalle"); if (!det) return;
    det.hidden = false;
    const b = $("xVerDetalle"); if (b) { b.textContent = T3.ocultarDetalle; b.setAttribute("aria-expanded", "true"); }
    let x = nodo && nodo.closest ? nodo : null;
    for (let p = x; p; p = p.parentElement) { if (p.tagName === "DETAILS") p.open = true; if (p.hidden && p !== det && det.contains(p)) p.hidden = false; }
    const destino = x || det;
    const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // «Ver todo el detalle» lleva al principio del detalle; lo demás (Revisar, una barra…) deja lo tocado en el centro
    destino.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: x ? "center" : "start" });
    if (x) { x.classList.remove("r3-foco"); void x.offsetWidth; x.classList.add("r3-foco"); }
  }

  function renderTres(r, cobros, d) {
    const { avisos, porId } = d;
    const per = (r.lectura && r.lectura.periodo) || {};
    const dias = per.dias || 365, meses = Math.max(1, Math.round(per.meses || dias / 30.44));
    const movsMes = (((r.lectura && r.lectura.movimientos) || []).length) / Math.max(1, dias / 30.44);

    // ---- 3. En qué se te va: lo mismo que suma la cifra, en € al año (también las comisiones) ----
    // Una suscripción vista al menos dos veces cuenta aunque el motor la dé como «posible» (Apple a 2,99 € al mes también es una suscripción)
    const esSusc = (c) => SUSCRIPCIONES.indexOf(c.categoria) >= 0 || c.categoria === "pasarelas";
    const haySeguros = cobros.some((c) => c.estado === "seguro");
    const cuenta = (c) => c && (c.estado === "seguro" || (c.estado === "posible" && (!haySeguros || (esSusc(c) && (c.num_cargos || 0) >= 2))));
    const anualComision = (c) => (c.periodicidad === "puntual" ? (c.coste_anual || c.importe || 0) * 365 / dias : c.coste_anual || 0);
    // Por tipo de pago, como en «Gráficas»: casa, suscripciones, seguros, comisiones del banco y otros (siempre al final)
    const CASA = ["telecos", "energia", "agua", "alarmas", "hogar", "gastos_fijos", "vivienda"];
    const tipoDe = (c) => (c.categoria === "comisiones" || c.categoria === "tarjetas" ? "banco" : esSusc(c) ? "susc" : CASA.indexOf(c.categoria) >= 0 ? "casa" : c.categoria === "seguros" ? "seg" : "otros");
    const porTipo = {};
    for (const g of r.grupos || []) {
      if (!(g.codigo.indexOf("sector_") === 0 || g.codigo === "recibos" || g.codigo === "comisiones")) continue;
      const items = (g.ids || []).map((id) => porId[id]).filter(Boolean);
      const com = g.codigo === "comisiones";
      for (const c of com ? items.filter((x) => (x.etiquetas || []).indexOf("devuelto") < 0) : items.filter(cuenta)) {
        const k = com ? "banco" : tipoDe(c);
        porTipo[k] = (porTipo[k] || 0) + (com ? anualComision(c) : c.coste_anual || 0);
      }
    }
    let barras = Object.keys(porTipo).map((k) => ({ codigo: "tipo_" + k, titulo: T3.tipos[k], v: Math.round(porTipo[k]) })).filter((b) => b.v > 0).sort((a, b) => b.v - a.v);
    barras = barras.filter((b) => b.codigo !== "tipo_otros").concat(barras.filter((b) => b.codigo === "tipo_otros"));
    const total = barras.reduce((t, b) => t + b.v, 0); // la cifra principal es exactamente la suma de las barras

    // ---- 2. Qué hacer ahora ----
    const acciones = [];
    let escapo = 0; const escTipos = {};
    const sumarEsc = (tipo, x) => { escapo += x; escTipos[tipo] = (escTipos[tipo] || 0) + 1; };
    for (const a of avisos.filter((x) => x.tipo === "doble" && x.c)) {
      sumarEsc("doble", a.imp || 0);
      acciones.push({ p: 1, euros: a.imp || 0, logo: logoDe(a.c), t: T3.dobleT(a.c.nombre), l: T3.dobleL(eur(a.imp || 0), fecha(a.fechaD)), b: T3.revisar, nodo: a.nodo });
    }
    for (const a of avisos.filter((x) => x.tipo === "recibo" && x.c)) {
      const { c, peor } = a, mes = +peor.m.fecha.slice(5, 7);
      let linea = T3.reciboL(pct(peor.dif / peor.med)), cuentaEsc = true;
      if (c.categoria === "energia" && MESES_FRIO.indexOf(mes) >= 0) {
        // luz y gas en invierno: con el mismo mes del año anterior; si no lo hay, puede ser consumo
        const antes = (c.movimientos || []).find((m) => m.importe < 0 && m.fecha.slice(5, 7) === peor.m.fecha.slice(5, 7) && +m.fecha.slice(0, 4) === +peor.m.fecha.slice(0, 4) - 1);
        if (antes) {
          const va = Math.abs(antes.importe);
          if (!(peor.v > va * (1 + RECIBO_ALTO))) continue; // como el año pasado: no es para revisar
          linea = T3.reciboAnio(pct(peor.v / va - 1));
        } else { linea = T3.consumo; cuentaEsc = false; }
      }
      if (cuentaEsc) sumarEsc("recibo", peor.dif);
      acciones.push({ p: 3, euros: peor.dif, logo: logoDe(c), t: T3.reciboT(a.nombreR, eur(peor.dif), MESES[mes - 1]), l: linea, b: T3.revisar, nodo: a.nodo });
    }
    const coms = avisos.filter((x) => x.tipo === "comision");
    if (coms.length) {
      const suma = coms.reduce((t, x) => t + (x.euros || 0), 0);
      for (const x of coms) sumarEsc("comision", x.euros || 0);
      escTipos.comision = 1;
      acciones.push({ p: 4, euros: suma, logo: null, t: T3.comT(eur(suma)), l: coms.some((x) => x.reclamable) ? T3.comLR : T3.comL, b: T3.ver, nodo: coms[0].nodo });
    }
    const susc = cobros.filter((c) => c.estado === "seguro" && SUSCRIPCIONES.indexOf(c.categoria) >= 0 && seDaDeBaja(c)).sort((a, b) => (b.coste_anual || 0) - (a.coste_anual || 0))[0];
    if (susc) acciones.push({ p: 5, euros: susc.coste_anual || 0, logo: logoDe(susc), t: T3.subT(susc.nombre, eur(susc.coste_anual || 0)), l: T3.subL, b: compatible(susc) ? T3.darme : T3.darBaja, enlace: enviarBaja(susc) });
    acciones.sort((a, b) => a.p - b.p || b.euros - a.euros);

    // ---- 1. La respuesta ----
    $("xMeses").textContent = T3.meses(meses);
    // «algo que revisar»: lo que se escapó o falta el extracto de la tarjeta (la suscripción más cara es solo una idea)
    const frase = meses < 3 ? T3.fPoco(meses) : escapo > 0 || acciones.some((a) => a.p < 5) ? T3.fRevisar : T3.fNada;
    $("xFrase").textContent = frase;
    const cifra = $("xCifra");
    if (total > 0) { cifra.textContent = eur(total); subirCifra(cifra, total); } else cifra.textContent = "0 €";
    $("xCifraL").hidden = false;
    const calc = $("xCalc"); calc.textContent = meses < 12 ? T3.calc(meses) : ""; calc.hidden = meses >= 12;
    const sr = $("xTotal"); if (sr) sr.textContent = $("xCifraL").textContent + " " + eur(total) + (meses < 12 ? ", " + T3.calc(meses) : "");
    // Lo que la gente busca primero: cuántas suscripciones tiene, cuánto le cuestan y cuántos recibos más
    const esc = $("xEscapo");
    const contados = cobros.filter((c) => cuenta(c) && c.tipo !== "comision" && c.categoria !== "comisiones");
    const subs = contados.filter(esSusc);
    const recs = contados.length - subs.length;
    esc.hidden = !contados.length;
    esc.dataset.ok = subs.length ? "no" : "si";
    esc.textContent = T3.suscr(subs.length, eur(Math.round(subs.reduce((t, c) => t + (c.coste_anual || 0), 0))), recs);

    // ---- 2. pintar las acciones: tres a la vista y el resto detrás de «Ver X más» ----
    const ul = $("xAcciones"); ul.textContent = "";
    acciones.forEach((a, i) => {
      const li = el("li", "r3-ac" + (i >= 3 ? " r3-ac--mas" : ""));
      let ic = null;
      if (a.logo) {
        ic = el("img", "r3-ac-logo"); ic.alt = ""; ic.width = 40; ic.height = 40; ic.decoding = "async"; ic.src = a.logo;
        ic.addEventListener("error", () => ic.remove()); // sin logo, sin círculo
      }
      const m = el("div", "r3-ac-m"); m.appendChild(el("p", "r3-ac-t", pegado(a.t))); m.appendChild(el("p", "r3-ac-l", pegado(a.l)));
      let btn;
      if (a.enlace) { btn = el("a", "r3-btn", a.b); btn.href = a.enlace; }
      else {
        btn = el("button", "r3-btn", a.b); btn.type = "button";
        btn.addEventListener("click", () => { if (a.anadir) anadirTarjeta(); else abrirDetalle(a.nodo); });
      }
      if (ic) li.appendChild(ic);
      li.appendChild(m); li.appendChild(btn);
      if (i >= 3) li.hidden = true;
      ul.appendChild(li);
    });
    $("xHacer").hidden = !acciones.length;
    const mas = $("xMas"); mas.hidden = acciones.length <= 3; mas.textContent = T3.verMas(acciones.length - 3); mas.setAttribute("aria-expanded", "false");

    // ---- 3. pintar las barras ----
    const lb = $("xBarras"); lb.textContent = "";
    const maximo = barras.length ? barras[0].v : 1;
    for (const b of barras) {
      const li = el("li"), btn = el("button", "r3-bar"); btn.type = "button";
      const fila = el("span", "r3-bar-f"); fila.appendChild(el("span", "r3-bar-n", b.titulo)); fila.appendChild(el("span", "r3-bar-v", eur(b.v)));
      const pista = el("span", "r3-bar-p"), lleno = el("span", "r3-bar-l");
      lleno.style.width = Math.max(2, Math.round(b.v / maximo * 100)) + "%";
      pista.appendChild(lleno); btn.appendChild(fila); btn.appendChild(pista);
      btn.addEventListener("click", () => abrirDetalle($("xTodo")));
      li.appendChild(btn); lb.appendChild(li);
    }
    $("xVa").hidden = !barras.length;

    // ---- 4. Buenas noticias: una fila con lo que te devolvieron y cuántas veces (sin palabras delicadas) ----
    const devuelto = (((r.grupos || []).find((g) => g.codigo === "devoluciones") || {}).ids || []).map((id) => porId[id]).filter(Boolean);
    const sumaDev = devuelto.reduce((t, x) => t + (x.importe || 0), 0);
    const nDev = devuelto.reduce((t, x) => t + (x.num || 1), 0);
    if ($("xBuenaT")) { $("xBuenaT").textContent = T3.devolvieron(eur(sumaDev)); $("xBuenaN").textContent = T3.devoluciones(nDev); }
    else $("xBuena").textContent = T3.devolvieron(eur(sumaDev));
    $("xBuenas").hidden = !(sumaDev > 0);
    // al tocar la fila, las devoluciones salen justo debajo (las mismas filas que en el detalle)
    const listaDev = $("xBuenaLista");
    if (listaDev) {
      listaDev.textContent = ""; listaDev.hidden = true; $("xBuena").setAttribute("aria-expanded", "false");
      Array.prototype.slice.call($("xNoticias").children, 0, devuelto.length).forEach((li) => listaDev.appendChild(li.cloneNode(true)));
    }
    // «Buenas noticias» va solo arriba: en el detalle no se repite
    const pasoNot = $("xNoticias") && $("xNoticias").closest(".res-paso"); if (pasoNot) pasoNot.hidden = true;
    // «¿Otro banco o tarjeta?»: no sale si arriba ya está la acción de añadir el extracto de la tarjeta
    if ($("xOtro")) $("xOtro").hidden = acciones.some((a) => a.anadir);

    // ---- 5. La tarjeta: vista previa y barra fija ----
    const det = $("xDetalle"); if (det) det.hidden = true;
    const vd = $("xVerDetalle"); if (vd) { vd.textContent = T3.verDetalle; vd.setAttribute("aria-expanded", "false"); vd.classList.remove("r3-ver--late"); delete vd.dataset.latio; }
    vistaTarjeta().catch(() => {});
  }

  // La tarjeta se dibuja una vez al salir el resultado, en este dispositivo y sin guardarse; compartir usa la misma
  async function vistaTarjeta() {
    blobTarjeta = null; if (urlTarjeta) { URL.revokeObjectURL(urlTarjeta); urlTarjeta = null; }
    const r0 = actual;
    if (r0 && !(r0.personalidad && r0.personalidad.ganadora)) { personalidad(); personalidadEnPagina(r0).then(() => { if (actual === r0 && r0.personalidad) vistaTarjeta(); }); }
    const p = personalidad(), caja = $("xTarjeta"), barra = $("xBarra"), img = $("xTarjetaImg"), mini = $("xBarraImg");
    if (!p) { if (caja) caja.hidden = true; if (barra) barra.hidden = true; return; }
    // el botón y la barra salen ya, con el resultado; la imagen llega después (si no llega, compartir la dibuja al pulsar)
    caja.hidden = false; barra.hidden = false; img.hidden = true; mini.hidden = true; $("xBarraNom").textContent = "";
    // Nunca una caja vacía: si la imagen no llega en 4 s o falla, se oculta la vista previa (el botón sigue y la dibuja al pulsar)
    const turno = ++turnoTarjeta, vista = img.closest(".r3-tarjeta-v") || img;
    vista.hidden = false;
    const sinVista = (motivo, e) => { if (turno !== turnoTarjeta || !img.hidden) return; vista.hidden = true; console.error("Feehund: vista previa de la tarjeta oculta (" + motivo + ")", e || ""); };
    const espera = setTimeout(() => sinVista("no ha llegado en 4 s"), 4000);
    const ruta = (x) => import(new URL(ROOT + x, location.href).href);
    ruta("assets/extracto/tarjeta.js").then((tm) => Promise.all([tm.preparar(p.id, { idioma: LANG }), ruta("assets/extracto/nucleo/tarjeta.js")])).then(([prep, nt]) => {
      if (personalidad() !== p) return;
      const t = prep.t, nombre = nt.rellenar(Array.isArray(t.lineas) && t.lineas.length ? t.lineas.join(" ") : t.nombre, p.dato || {}, LANG);
      $("xBarraNom").textContent = nombre; img.alt = (t.cabecera || "") + " " + nombre;
    }).catch((e) => console.error("Feehund: nombre de la personalidad", e));
    try {
      const m = await motor();
      const blob = await m.generarTarjeta(p.id, p.dato || {}, { idioma: LANG });
      if (personalidad() !== p) return; // ha llegado otro resultado mientras tanto
      blobTarjeta = blob; urlTarjeta = URL.createObjectURL(blob);
      img.onerror = () => { clearTimeout(espera); img.hidden = true; sinVista("la imagen no se ha podido mostrar"); };
      img.onload = () => { clearTimeout(espera); if (turno === turnoTarjeta) vista.hidden = false; };
      img.src = urlTarjeta; mini.src = urlTarjeta; img.hidden = false; mini.hidden = false; vista.hidden = false;
    } catch (e) { clearTimeout(espera); sinVista("no se ha podido dibujar", e); }
  }

  // «Añadir»: vuelve a la carga con el extracto de ahora en la lista y abre el selector para sumar el de la tarjeta
  function anadirTarjeta() {
    show("up");
    const inp = $("xFile"); if (inp) inp.click();
  }
  function limpiar() { while (extras.length) extras.pop().remove(); ["xList", "xAlertas", "xNoticias", "xTodo", "xPreguntas"].forEach((id) => { if ($(id)) $(id).textContent = ""; }); }

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

  // «Te damos de baja» (/baja/enviar/): se ofrece en lo que se puede dejar (suscripciones, cuotas, seguros, teléfono…),
  // no en la luz, el agua, los impuestos ni las comisiones del banco. Lleva la empresa puesta.
  const ENVIAR = ROOT + { es: "baja/enviar/", ca: "ca/baixa/enviar/", en: "en/cancel/send/" }[LANG];
  const SIN_BAJA = ["energia", "agua", "impuestos", "gastos_fijos", "pasarelas", "comisiones", "tarjetas"];
  // categorías en las que dos servicios a la vez suelen sobrar
  const PARA_LO_MISMO = ["streaming", "musica", "gimnasios", "nube_apps", "ia", "prensa", "citas", "videojuegos", "alarmas", "idiomas"];
  // Qué empresas tienen página de baja (p) y cuáles aceptan nuestro envío por correo certificado (e).
  // Sale de las fichas de investigacion/bajas (indice_web.py). Si no está en la lista, no se ofrece nada.
  let ENVIO = {};
  const envioP = fetch(ROOT + "data/bajas-envio.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).then((d) => { ENVIO = d || {}; }).catch(() => {});
  const fichaBaja = (c) => (c && c.comercio_id && ENVIO[c.comercio_id]) || null;
  const seDaDeBaja = (c) => Boolean(c && c.tipo === "comercio" && c.comercio_id && c.periodicidad !== "puntual" && SIN_BAJA.indexOf(c.categoria) < 0 && fichaBaja(c));
  // «Te damos de baja» (envío de pago): encendido con el servicio. Qué empresas lo llevan lo dice data/bajas-envio.json
  // (campo e), con la misma regla que las guías y el cobro (envio_web.py del motor).
  const ENVIO_ACTIVO = true;
  const compatible = (c) => Boolean(ENVIO_ACTIVO && seDaDeBaja(c) && fichaBaja(c).e);
  // compatible: «Te damos de baja»; si no, la página con los pasos para hacerlo uno mismo, en el idioma de la página
  const enviarBaja = (c) => compatible(c)
    ? ENVIAR + "?empresa=" + encodeURIComponent(String(c.comercio_id).replace(/_/g, "-")) + "&nombre=" + encodeURIComponent(c.nombre)
    : ROOT + (LANG === "es" ? "" : LANG + "/") + BAJA_DIR + "/" + fichaBaja(c).p + "/";

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
    if ($("tAlerta") && $("xAlertas")) { const d = renderAccion(r, cobros); if (TRES) renderTres(r, cobros, d); return; }
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

  // ---------- Lo que se repite y no reconocemos: 3 preguntas antes del resumen ----------
  // Pagos del mismo sitio, parecidos, en 2 meses o más, que no están en ningún cobro. Lo que contestas cuenta como un cobro más.
  const TUYOS = "fh-tuyos"; // { clave: opción } en este móvil
  const CAT_DE = { vivienda: "vivienda", casa: "gastos_fijos", susc: "suscripciones", seg: "seguros", otros: "otros" };
  const leerTuyos = () => { try { return JSON.parse(localStorage.getItem(TUYOS) || "{}") || {}; } catch (e) { return {}; } };
  function claveDe(concepto) {
    let t = String(concepto || "").toUpperCase();
    t = t.replace(/N[ºO°]\s*RECIBO[\s\S]*$/, "").replace(/,?\s*CON LA TARJETA[\s\S]*$/, "").replace(/CONCEPTO:[\s\S]*$/, "").replace(/REF\.[\s\S]*$/, "");
    for (let i = 0; i < 3; i++) t = t.replace(/^(RECIBO|ADEUDO|CARGO|PAGO CON TARJETA|PAGO|COMPRA CON TARJETA|COMPRA EN|COMPRA|CON TARJETA|TARJETA|TRANSFERENCIA A FAVOR DE|TRANSFERENCIA|TRANSF\.?)\s+/, "");
    return t.replace(/[^A-ZÁÉÍÓÚÑÜÇ.\s]/g, " ").split(/\s+/).filter((w) => w.length > 1).slice(0, 3).join(" ").trim();
  }
  // Marcas que todo el mundo conoce: se colocan solas, no se preguntan
  const CONOCIDAS = [
    [/NETFLIX|SPOTIFY|HBO|DISNEY|PRIME VIDEO|AMAZON PRIME|YOUTUBE|DAZN|FILMIN|ATRESPLAYER|APPLE\.COM|ICLOUD|AUDIBLE|KINDLE|CHATGPT|OPENAI|CLAUDE|ANTHROPIC|CANVA|ADOBE|DROPBOX|GOOGLE ONE|DEEZER|TIDAL|PLAYSTATION|XBOX|NINTENDO|DUOLINGO|TINDER|BUMBLE|GYM|FITNESS|BASIC.?FIT|DREAMFIT|ALTAFIT/, "susc"],
    [/VODAFONE|MOVISTAR|TELEFONICA|ORANGE|YOIGO|DIGI|MASMOVIL|LOWI|PEPEPHONE|JAZZTEL|SIMYO|O2 |FINETWORK|ENDESA|IBERDROLA|NATURGY|HOLALUZ|OCTOPUS|REPSOL|TOTALENERGIES|AIGUES|AGUAS|CANAL DE ISABEL|AQUALIA|EMASESA|SECURITAS|PROSEGUR/, "casa"],
    [/MAPFRE|MUTUA|AXA|ALLIANZ|SANITAS|ADESLAS|DKV|ASISA|GENERALI|LINEA DIRECTA|LÍNEA DIRECTA|REALE|CASER|ZURICH|OCASO|SANTALUCIA|SANTA LUCIA|VERTI|PELAYO/, "seg"],
  ];
  const conocida = (k) => { const e = CONOCIDAS.find(([re]) => re.test(k)); return e ? e[1] : null; };
  const bonito = (k) => k.toLowerCase().replace(/(^|\s)(\S)/g, (a, b, c) => b + c.toUpperCase());
  function desconocidos(r) {
    const per = (r.lectura && r.lectura.periodo) || {}, dias = per.dias || 365;
    const enCobro = new Set(); (r.cobros || []).forEach((c) => (c.movimientos || []).forEach((m) => enCobro.add(m.id)));
    const FUERA = /BIZUM|LIQUIDACI|RECOBRO|TRASPASO|IMPUESTO|HACIENDA|A\.E\.A\.T|TRIBUT|CAJERO|REINTEGRO|DEVOLUCI|NOMINA|NÓMINA/i;
    const porClave = {};
    ((r.lectura && r.lectura.movimientos) || []).forEach((m) => {
      if (!(m.importe < 0) || enCobro.has(m.id) || FUERA.test(m.concepto || "")) return;
      const k = claveDe(m.concepto); if (k.length < 3) return;
      (porClave[k] = porClave[k] || []).push(m);
    });
    const out = [];
    for (const k of Object.keys(porClave)) {
      const l = porClave[k], imps = l.map((m) => -m.importe), min = Math.min(...imps), max = Math.max(...imps);
      const meses = new Set(l.map((m) => String(m.fecha).slice(0, 7))).size;
      if (l.length < 2 || meses < 2 || max > min * 1.35) continue;
      const total = imps.reduce((a, b) => a + b, 0), fechas = l.map((m) => m.fecha).sort();
      const gaps = fechas.slice(1).map((f, i) => (new Date(f) - new Date(fechas[i])) / 864e5).sort((a, b) => a - b);
      const gap = gaps[Math.floor(gaps.length / 2)] || 30, alAnio = gap <= 40 ? 12 : gap <= 75 ? 6 : gap <= 110 ? 4 : 1;
      // Que se repita de verdad: con 2 pagos, casi iguales y a 1 o 2 meses; con 3 o más, a un ritmo regular (no un bar al que vas a menudo)
      const regular = gap >= 25 && gap <= 70 || gap >= 80 && gap <= 100 || gap >= 330 && gap <= 400;
      if (!regular || (l.length === 2 && max > min * 1.03) || gaps[0] < 20) continue;
      const media = total / l.length;
      out.push({ k, nombre: bonito(k), l, media, alAnio, anual: Math.max(media * alAnio, total * 365 / dias), primero: fechas[0], ultimo: fechas[fechas.length - 1] });
    }
    return out.filter((x) => x.anual >= 150).sort((a, b) => b.anual - a.anual).slice(0, 3);
  }
  function anadirTuyos(r, lista) {
    if (!lista.length) return;
    const ids = [];
    lista.forEach((x) => {
      const id = "tuyo-" + x.k.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      if ((r.cobros || []).some((c) => c.id === id)) return;
      const imps = x.l.map((m) => -m.importe);
      const marca = x.auto ? x.k.toLowerCase().split(/[ .]/)[0] : null; // Netflix, Vodafone…: con su logo y su nombre de siempre
      r.cobros = (r.cobros || []).concat([{ id, nombre: marca ? marca.charAt(0).toUpperCase() + marca.slice(1) : x.nombre, nombre_codigo: null, categoria: CAT_DE[x.op] || "otros", comercio_id: marca, tipo: "comercio", pasarela: null,
        periodicidad: x.alAnio === 12 ? "mensual" : x.alAnio === 6 ? "bimestral" : x.alAnio === 4 ? "trimestral" : "anual", importe: Math.round(x.media * 100) / 100,
        importe_tipo: Math.max(...imps) - Math.min(...imps) < 0.01 ? "fijo" : "variable", coste_anual: Math.round(x.media * x.alAnio * 100) / 100, estado: "seguro", etiquetas: ["tuyo"],
        subida_mensual: null, subida: null, bajada_mensual: null, bajada: null, importe_min: Math.min(...imps), importe_max: Math.max(...imps), pagado: Math.round(imps.reduce((a, b) => a + b, 0) * 100) / 100,
        meses_sin_cargo: 0, baja: null, ayuda: null, calculo: null, motivos: [], primer_cargo: x.primero, ultimo_cargo: x.ultimo, proximo_cargo: null, num_cargos: x.l.length, movimientos: x.l, grupo: "sector_tuyos" }]);
      ids.push(id);
    });
    if (!ids.length) return;
    const g = (r.grupos || []).find((y) => y.codigo === "sector_tuyos");
    if (g) g.ids = g.ids.concat(ids); else r.grupos = (r.grupos || []).concat([{ codigo: "sector_tuyos", titulo: T3.dq.grupo, ids, total: 0 }]);
  }
  // Comercios que Tiqui no sabe qué son y no se repiten como un recibo (un bar, una tienda): se pregunta su sector.
  // Lo contestado vale en este móvil y, sin importes ni fechas, cuenta como un voto para todos (/api/ia/voto).
  function comerciosRaros(r) {
    const C = window.FeehundComercio; if (!C) return { lista: [], importante: false };
    const enCobro = new Set(); [].concat(r.cobros || [], r.gastos_fijos || [], r.terminados || []).forEach((c) => (c.movimientos || []).forEach((m) => enCobro.add(m.id)));
    const FUERA = /BIZUM|LIQUIDACI|RECOBRO|TRASPASO|TRANSFER|IMPUESTO|HACIENDA|A\.E\.A\.T|TRIBUT|CAJERO|REINTEGRO|DEVOLUCI|NOMINA|NÓMINA|HIPOTECA|PRESTAMO|PRÉSTAMO/i;
    let gastado = 0; const por = {};
    ((r.lectura && r.lectura.movimientos) || []).forEach((m) => {
      if (!(m.importe < 0) || FUERA.test(m.concepto || "")) return;
      gastado -= m.importe;
      if (enCobro.has(m.id)) return;
      const c = C.clasificar(m.concepto);
      if (c.s || c.contestado || !c.k || !/[A-Z]{3}/.test(c.k)) return;
      const x = por[c.k] || (por[c.k] = { k: c.k, nombre: bonito(c.k), l: [], total: 0, comercio: true });
      x.l.push(m); x.total -= m.importe;
    });
    const lista = Object.values(por).sort((a, b) => b.total - a.total), raro = lista.reduce((t, x) => t + x.total, 0);
    return { lista, importante: lista.length >= 5 && gastado > 0 && raro / gastado >= 0.15 };
  }
  async function preguntarDesconocidos(r, guardar) {
    const T = T3 && T3.dq; if (!T) return;
    if (window.FeehundComercio) await window.FeehundComercio.listo();
    const lista = desconocidos(r), mios = leerTuyos();
    lista.forEach((x) => { if (!mios[x.k] && conocida(x.k)) x.auto = conocida(x.k); });
    const yaSe = lista.filter((x) => x.auto || (mios[x.k] && mios[x.k] !== "nose")).map((x) => Object.assign(x, { op: x.auto || mios[x.k] }));
    // Como mucho 3 preguntas; 5 si lo que Tiqui no sabe qué es pesa mucho (15 % o más de lo gastado, en 5 sitios o más).
    // Primero lo que se repite (puede ser el alquiler); después los comercios de más dinero.
    const raros = comerciosRaros(r), tope = raros.importante ? 5 : 3;
    const recibos = lista.filter((x) => !x.auto && !mios[x.k]).slice(0, tope);
    const faltan = recibos.concat(raros.lista.slice(0, tope - recibos.length));
    if (!faltan.length) { anadirTuyos(r, yaSe); return; }
    return new Promise((fin) => {
      const ov = el("div", "dq"); ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
      const c = el("div", "dq-c"); ov.appendChild(c); document.body.appendChild(ov); document.body.classList.add("dq-abierta");
      const contestadas = [];
      const paso = (i) => {
        if (i >= faltan.length) {
          const deRecibo = contestadas.filter((x) => !x.comercio), deComercio = contestadas.filter((x) => x.comercio);
          if (guardar) {
            const m = leerTuyos(); deRecibo.forEach((x) => { m[x.k] = x.op; }); try { localStorage.setItem(TUYOS, JSON.stringify(m)); } catch (e) {}
            deComercio.forEach((x) => {
              window.FeehundComercio.guardar(x.k, x.op);
              if (x.op !== "nose") fetch(ROOT + "api/ia/voto", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ comercio: x.k, sector: x.op }) }).catch(() => {});
            });
          }
          anadirTuyos(r, yaSe.concat(deRecibo.filter((x) => x.op !== "nose")));
          ov.remove(); document.body.classList.remove("dq-abierta"); fin(); return;
        }
        const x = faltan[i]; c.textContent = "";
        const top = el("div", "dq-top"); const img = el("img", "dq-tiqui"); img.src = ROOT + "assets/img/tiqui-olfatea.webp"; img.alt = ""; img.width = 56; img.height = 56;
        top.appendChild(img); top.appendChild(el("p", "dq-t", T.titulo)); c.appendChild(top);
        const barra = el("div", "dq-bar"); const lleno = el("i"); lleno.style.width = Math.round((i / faltan.length) * 100) + "%"; barra.appendChild(lleno); c.appendChild(barra);
        setTimeout(() => { lleno.style.width = Math.round(((i + 0.5) / faltan.length) * 100) + "%"; }, 30);
        c.appendChild(el("p", "dq-n", T.de(i + 1, faltan.length)));
        c.appendChild(el("p", "dq-q", T.que));
        c.appendChild(el("p", "dq-nom", x.nombre));
        c.appendChild(el("p", "dq-imp", x.comercio ? T.pagos(eur(x.total), x.l.length) : T.veces(eur(x.media), x.l.length, x.alAnio === 12 ? T.mes : x.alAnio === 6 ? T.dosMeses : "")));
        const ops = el("div", "dq-ops"), OPS = x.comercio ? T.ops2 : T.ops;
        Object.keys(OPS).forEach((k) => { const b = el("button", "dq-op", OPS[k]); b.type = "button"; b.addEventListener("click", () => { x.op = k; contestadas.push(x); paso(i + 1); }); ops.appendChild(b); });
        c.appendChild(ops);
        const no = el("button", "dq-nose", T.nose); no.type = "button"; no.addEventListener("click", () => { x.op = "nose"; contestadas.push(x); paso(i + 1); }); c.appendChild(no);
        const b0 = ops.querySelector("button"); if (b0) b0.focus({ preventScroll: true });
      };
      paso(0);
    });
  }
  const ICONOS = {
    doble: "M3 9h13v10H3zM8 5h13v10",
    subida: "M4 17l6-6 4 4 6-7M14 8h6v6",
    recibo: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
    comision: "M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.6 5 3.4 5 1.6 5 3.6-2.2 3-5 3-5-1.1-5-3",
    tarjeta: "M3 6h18v12H3zM3 10h18",
  };
  function plantilla(id) { return $(id).content.firstElementChild.cloneNode(true); }
  // el número y su «€» o «%» no se separan nunca al saltar de línea
  const pegado = (t) => typeof t === "string" ? t.replace(/(\d) (€|%)/g, "$1\u00a0$2") : t;
  function poner(raiz, campo, texto) { const x = raiz.querySelector('[data-c="' + campo + '"]'); if (x) x.textContent = pegado(texto); return x; }
  function icono(raiz, tipo) {
    // La plantilla trae el icono de un tipo; los demás se dibujan aquí con la misma clase
    if (raiz.querySelector(".al-i--" + tipo)) return;
    const vieja = raiz.querySelector(".al-i"); if (!vieja) return;
    const span = el("span", "al-i al-i--" + tipo); span.setAttribute("role", "img"); span.setAttribute("aria-label", TX["a" + tipo[0].toUpperCase() + tipo.slice(1)][0]);
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"), path = document.createElementNS(ns, "path");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true"); path.setAttribute("d", ICONOS[tipo]);
    svg.appendChild(path); span.appendChild(svg); vieja.replaceWith(span);
  }
  function alerta(tipo, titulo, detalle, cifra, accion, enlace, baja) {
    const a = plantilla("tAlerta");
    a.dataset.tipo = tipo; icono(a, tipo);
    poner(a, "titulo", titulo); poner(a, "detalle", detalle); poner(a, "cifra", cifra || "");
    // «Darme de baja» va en su propio botón (data-c="accion-baja"); si la plantilla no lo trae, en el de la acción
    const ab = a.querySelector('[data-c="accion-baja"]');
    let ac = a.querySelector('[data-c="accion"]');
    if (baja && enlace && ab) { ab.textContent = accion; ab.href = enlace; ab.hidden = false; if (ac) ac.remove(); ac = null; }
    else if (ab) ab.remove();
    if (ac) { if (accion) { ac.textContent = accion + (baja ? "" : " →"); if (enlace) ac.href = enlace; else ac.replaceWith(el("p", ac.className, accion)); } else ac.remove(); }
    if (ac && baja && enlace) ac.classList.add("al-a--baja");
    return a;
  }
  const media = (xs) => xs.reduce((t, x) => t + x, 0) / xs.length;
  const pct = (x) => Math.round(x * 100);

  // Único movimiento del resultado: el total sube de 0 a la cifra en 0,8 s (con «reducir movimiento», aparece directamente)
  function subirCifra(nodo, total) {
    if (!(total > 0) || matchMedia("(prefers-reduced-motion: reduce)").matches || typeof requestAnimationFrame !== "function") return;
    const dur = 800, t0 = performance.now(), fin = e0(total) + " €";
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / dur), suave = 1 - Math.pow(1 - k, 3);
      nodo.textContent = k < 1 ? e0(total * suave) + " €" : fin;
      if (k < 1) requestAnimationFrame(paso);
    };
    nodo.textContent = e0(0) + " €";
    requestAnimationFrame(paso);
  }

  function renderAccion(r, cobros) {
    limpiar();
    const seguros = cobros.filter((c) => c.estado === "seguro");
    const total = seguros.length ? r.total_seguro || 0 : r.total_posible || 0;
    // Cabecera: «Pagas 3.532 € al año en suscripciones y domiciliaciones»
    const cuenta = $("xCount"), sr = $("xTotal");
    cuenta.textContent = "";
    if (total > 0) {
      // la cifra sube de 0 al total en 0,8 s, una sola vez; para el lector de pantalla, la frase completa y fija (#xTotal, aria-live)
      const vista = el("span"); vista.setAttribute("aria-hidden", "true");
      const cifra = el("strong", "", e0(total) + " €");
      vista.append(TX.pagas[0]); vista.appendChild(cifra); vista.append(TX.pagas[1]);
      cuenta.appendChild(vista);
      subirCifra(cifra, total);
    }
    else cuenta.append(TX.nada);
    if (sr) { sr.textContent = total > 0 ? TX.pagas[0] + e0(total) + " €" + TX.pagas[1] : ""; sr.setAttribute("aria-live", "polite"); cuenta.appendChild(sr); }

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
      avisos.push({ tipo: "doble", c, imp, fechaD: rep ? rep.fecha : c.ultimo_cargo, corto: c.nombre + ", " + e2(imp) + " € " + TX.el + " " + fecha(rep ? rep.fecha : c.ultimo_cargo), euros: imp, nodo: alerta("doble", TX.aDoble[0], TX.aDoble[1](c.nombre, e2(imp), fecha(rep ? rep.fecha : c.ultimo_cargo)), e2(imp) + " €", TX.aDoble[2]) });
    }
    for (const c of deGrupo("subidas")) {
      const s1 = c.subida || {}, anual = (c.subida_mensual || 0) * 12;
      avisos.push({ tipo: "subida", corto: TX.deA(c.nombre, e2(s1.antes), e2(s1.ahora)), euros: anual, nodo: alerta("subida", TX.aSubida[0], TX.aSubida[1](c.nombre, e2(s1.antes), e2(s1.ahora), cada(c), pct((s1.ahora - s1.antes) / s1.antes)), "+" + e2(anual) + " " + TX.year, ...(seDaDeBaja(c) ? [TX.darme, enviarBaja(c), true] : [TX.aSubida[2], enlaceBaja(c)])) });
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
      if (peor) avisos.push({ tipo: "recibo", c, nombreR, peor, corto: nombreR + ", " + e2(peor.v) + " € " + TX.el + " " + fecha(peor.m.fecha), euros: peor.dif, nodo: alerta("recibo", TX.aRecibo[0], TX.aRecibo[1](nombreR, e2(peor.v), fecha(peor.m.fecha), pct(peor.dif / peor.med), e2(peor.med)), "+" + e2(peor.dif) + " €", ...(seDaDeBaja(c) && !TRES ? [TX.darme, enviarBaja(c), true] : [TX.aRecibo[2]])) });
    }
    const comisiones = deGrupo("comisiones");
    for (const c of comisiones.filter((x) => (x.etiquetas || []).indexOf("reclamable") >= 0 && (x.etiquetas || []).indexOf("devuelto") < 0)) {
      avisos.push({ tipo: "comision", reclamable: true, corto: c.nombre + ", " + e2(c.coste_anual || c.importe) + " €", euros: c.coste_anual || c.importe, nodo: alerta("comision", TX.aReclamar[0], TX.aReclamar[1](c.nombre), e2(c.coste_anual || c.importe) + " €", TX.aReclamar[2]) });
    }
    const pagadas = comisiones.filter((x) => (x.etiquetas || []).indexOf("devuelto") < 0 && (x.etiquetas || []).indexOf("reclamable") < 0);
    if (pagadas.length) {
      const suma = pagadas.reduce((t, x) => t + (x.coste_anual || x.importe || 0), 0);
      const lista = pagadas.map((x) => x.nombre.toLowerCase() + " (" + e2(x.coste_anual || x.importe) + " €)").join(", ");
      avisos.push({ tipo: "comision", corto: TX.enExtracto(e2(suma)), euros: suma, nodo: alerta("comision", TX.aComision[0], TX.aComision[1](lista), e2(suma) + " €", TX.aComision[2]) });
    }
    // dos o más servicios para lo mismo (dos plataformas, dos gimnasios…): se propone dejar el que menos se usa, el más barato
    const porCategoria = {};
    for (const c of seguros.filter((x) => seDaDeBaja(x) && PARA_LO_MISMO.indexOf(x.categoria) >= 0)) {
      const lista = porCategoria[c.categoria] = porCategoria[c.categoria] || [];
      if (!lista.some((y) => y.comercio_id === c.comercio_id)) lista.push(c);
    }
    for (const k in porCategoria) {
      const l = porCategoria[k].slice().sort((a, b) => (b.coste_anual || 0) - (a.coste_anual || 0));
      if (l.length < 2) continue;
      const quitar = l[l.length - 1];
      // se ve como un cobro doble, pero no cuenta en «¿Te cobran algo dos veces?»: no es un error del comercio
      avisos.push({ tipo: "duplicado", corto: l[0].nombre + " · " + quitar.nombre, euros: quitar.coste_anual || 0,
        nodo: alerta("doble", TX.aDuplicado[0], TX.aDuplicado[1](l[0].nombre, quitar.nombre), e2(quitar.coste_anual || 0) + " " + TX.year, TX.darme, enviarBaja(quitar), true) });
    }
    avisos.sort((a, b) => b.euros - a.euros);
    const tarjeta = ((r.lectura && r.lectura.avisos) || []).find((a) => a.codigo === "cobros_tarjeta_credito");
    const textoTarjeta = tarjeta && tarjeta.datos ? TX.aTarjeta[1](e2(tarjeta.datos.importe || 0), tarjeta.datos.n || 0) : "";
    const nota = $("xNota");
    // Con sitio para la nota (diseño de preguntas), la tarjeta de crédito va ahí y no como aviso
    const enTarjeta = (r.terminados || []).filter((c) => c.quiza_en_tarjeta);
    const textoTarjeta2 = TRES && enTarjeta.length ? (textoTarjeta ? textoTarjeta + " " : "") + enTarjeta.map((c) => TX.nFinT(c.nombre, fecha(c.ultimo_cargo))).join(". ") + "." : textoTarjeta;
    if (textoTarjeta2 && !nota) avisos.push({ tipo: "tarjeta", euros: 0, datos: tarjeta && tarjeta.datos, enTarjeta, nodo: alerta("tarjeta", TX.aTarjeta[0], textoTarjeta2, "", TX.aTarjeta[2]) });
    if (nota) { nota.textContent = textoTarjeta ? textoTarjeta + " " + TX.aTarjeta[2] + "." : ""; nota.hidden = !textoTarjeta; }
    avisos.forEach((a) => $("xAlertas").appendChild(a.nodo));
    if ($("xAvisosN")) $("xAvisosN").textContent = TX.avisosN(avisos.length);
    mostrar($("xAlertas"), avisos.length);

    // ---- Diseño por pasos: lo que está bien, en una sola línea (#xBien) ----
    const bien = TRES ? null : $("xBien");
    if (bien) {
      const ok = TX.preguntas.map(([tipo]) => tipo).filter((tipo) => !avisos.some((a) => a.tipo === tipo)).map((tipo) => TX.temas[tipo]);
      const lista = ok.length > 1 ? ok.slice(0, -1).join(", ") + TX.yy + ok[ok.length - 1] : ok[0] || "";
      bien.textContent = lista ? TX.bien(lista) : ""; bien.hidden = !lista;
      const paso = bien.closest(".res-paso"); if (paso) paso.hidden = !(avisos.length || lista);
    }

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
    for (const c of r.terminados || []) if (!(TRES && c.quiza_en_tarjeta)) noticias.push([(c.quiza_en_tarjeta ? TX.nFinT : TX.nFin)(c.nombre, fecha(c.ultimo_cargo)), ""]);
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
      sec.dataset.codigo = g.codigo;
      poner(sec, "titulo", TRES && g.codigo === "recibos" ? T3.recibos : g.titulo);
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
        const b = f.querySelector('[data-c="baja"]');
        if (b) { if (seDaDeBaja(c)) { b.href = enviarBaja(c); b.textContent = TX.darBaja; b.hidden = false; } else b.remove(); }
        filas.appendChild(f);
      }
      $("xTodo").appendChild(sec);
    }
    mostrar($("xTodo"), $("xTodo").querySelectorAll('[data-c="nombre"]').length);
    const pack = $("xPack");
    if (pack) pack.hidden = TRES || !cobros.some(compatible);
    return { avisos, porId, deGrupo };
  }

  // Cada bloque va dentro de un botón (<details>) o de una sección: se oculta si está vacío y su contador dice cuántos hay
  function mostrar(cont, n) {
    if (!cont) return;
    const caja = cont.closest("details") || cont.closest(".res-paso") || cont.closest("section");
    if (caja) { caja.hidden = !n; const c = caja.querySelector("[data-n]"); if (c) c.textContent = n ? String(n) : ""; if (caja.tagName === "DETAILS") caja.open = false; }
  }

  function download(blob, name) { const u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }

  // Compartir: la tarjeta de la personalidad que da el análisis (assets/extracto/tarjeta.js). Nunca la lista ni los nombres.
  // Se dibuja solo al pulsar y no se guarda. Sin personalidad, no hay botón.
  // Siempre hay personalidad: la del análisis; si no llega, la calcula la página; y si tampoco, el comodín
  function personalidad() {
    const p = actual && actual.personalidad && actual.personalidad.ganadora;
    if (p && p.id) return p;
    if (!actual) return null;
    if (!actual._comodin) {
      const movs = (actual.lectura && actual.lectura.movimientos) || [], per = (actual.lectura && actual.lectura.periodo) || {};
      actual._comodin = { id: "agente_secreto", dato: { n: movs.length, m: per.dias || 0, unidad: "movimientos_en_dias" }, comodin: true };
    }
    return actual._comodin;
  }
  // Si el análisis llegó sin personalidad (lector viejo o fallo), se calcula aquí con los mismos movimientos
  async function personalidadEnPagina(r) {
    if (!r || (r.personalidad && r.personalidad.ganadora)) return;
    try {
      const [mp, dic] = await Promise.all([
        import(new URL(ROOT + "assets/extracto/nucleo/personalidades.js", location.href).href),
        fetch(ROOT + "data/comercios.json").then((x) => x.json()),
      ]);
      const movs = ((r.lectura && r.lectura.movimientos) || []).filter((m) => !m.divisa || m.divisa === "EUR");
      const g = mp.calcularPersonalidades(movs, dic).ganadora;
      if (g && g.id && actual === r) { r.personalidad = { ganadora: g }; delete r._comodin; }
    } catch (e) { console.error("Feehund: personalidad en la página", e); }
  }
  async function share() {
    const p = personalidad();
    if (!p) return;
    const m = await motor();
    const blob = blobTarjeta || await m.generarTarjeta(p.id, p.dato || {}, { idioma: LANG });
    const como = await m.compartirTarjeta(blob);
    if (como === "descargada") msg($("xMsg"), TX.dl);
    if (como !== "cancelada" && propio) contar("comparte");
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
  // La bandeja: lo que se suelta, se elige o se pega va a una lista y se lee al pulsar «Leer» (assets/extracto/bandeja.js).
  // Si no carga, se lee en el momento, como antes.
  let bandeja = null;
  const bandejaP = import(new URL(ROOT + "assets/extracto/bandeja.js", location.href).href)
    .then((b) => (bandeja = b.crearBandeja({ zona: drop, boton: $("xPick"), idioma: LANG, alLeer: (e) => { contrasenas = {}; analyze(e); } })));
  const anadir = (x) => { msg($("xErr"), ""); bandejaP.then((b) => b.anadir(x), () => { contrasenas = {}; analyze(x); }); };
  $("xPick").addEventListener("click", () => input.click());
  input.addEventListener("change", () => { const fs = archivos(input.files); if (fs.length) anadir(fs); input.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-over"); }));
  drop.addEventListener("drop", (e) => { const fs = archivos(e.dataTransfer && e.dataTransfer.files); if (fs.length) anadir(fs); });
  // Texto pegado (Ctrl+V con el extracto copiado de la web del banco) o una captura copiada
  addEventListener("paste", (e) => {
    if (!scr.up || scr.up.hidden || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
    const fs = archivos(e.clipboardData && e.clipboardData.files);
    if (fs.length) { e.preventDefault(); anadir(fs); return; }
    const t = e.clipboardData && e.clipboardData.getData("text");
    if (t && t.split("\n").length > 2) anadir(t);
  });
  $("xDemo").addEventListener("click", () => { contrasenas = {}; ejemplo().then((f) => { f.deEjemplo = true; return analyze(f); }, () => msg($("xErr"), TX.bad)); });
  $("xShare").addEventListener("click", () => share().catch(() => {}));
  if ($("xShare2")) $("xShare2").addEventListener("click", () => share().catch(() => {}));
  // «Ver todo el detalle» da unos latidos la primera vez que se ve con cada resultado, y luego se queda quieto
  if ($("xVerDetalle") && "IntersectionObserver" in window) {
    new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting && !e.target.dataset.latio && !$("xRes").hidden) { e.target.dataset.latio = "1"; e.target.classList.add("r3-ver--late"); }
    }, { threshold: 1 }).observe($("xVerDetalle"));
  }
  // La barra fija se aparta mientras se ve el botón grande de «Compartir mi tarjeta»: así nunca lo tapa
  if ($("xBarra") && "IntersectionObserver" in window) {
    new IntersectionObserver((es) => { for (const e of es) $("xBarra").classList.toggle("r3-barra--fuera", e.isIntersecting); }).observe($("xShare"));
  }
  if ($("xMas")) $("xMas").addEventListener("click", () => {
    const abrir = $("xMas").getAttribute("aria-expanded") !== "true";
    document.querySelectorAll("#xAcciones .r3-ac--mas").forEach((li) => { li.hidden = !abrir; });
    $("xMas").setAttribute("aria-expanded", String(abrir));
    const n = document.querySelectorAll("#xAcciones .r3-ac--mas").length;
    $("xMas").textContent = abrir ? T3.verMenos : T3.verMas(n);
  });
  if ($("xVerDetalle")) $("xVerDetalle").addEventListener("click", () => {
    const det = $("xDetalle"), abrir = det.hidden;
    if (abrir) abrirDetalle(null); else { det.hidden = true; $("xVerDetalle").textContent = T3.verDetalle; $("xVerDetalle").setAttribute("aria-expanded", "false"); }
  });
  if ($("xBuena")) $("xBuena").addEventListener("click", () => {
    const lista = $("xBuenaLista");
    if (!lista || !lista.children.length) { abrirDetalle($("xNoticias")); return; }
    lista.hidden = !lista.hidden; $("xBuena").setAttribute("aria-expanded", String(!lista.hidden));
  });
  if ($("xMasExtractos")) $("xMasExtractos").addEventListener("click", anadirTarjeta);
  contar("abre");
  const btnIcs = $("xIcs"); if (btnIcs) btnIcs.addEventListener("click", () => ics().catch(() => {}));
  $("xAgain").addEventListener("click", () => {
    actual = null; entradaActual = null; contrasenas = {}; propio = false;
    limpiar(); msg($("xMsg"), ""); if (bandeja) bandeja.vaciar();
    motor().then((m) => m.olvidar()).catch(() => {});
    show("up");
  });
})();
