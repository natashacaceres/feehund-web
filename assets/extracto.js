/* Lector de extractos de la página de Design (/extracto/, /ca/extracte/, /en/statement/), conectado al motor de
   /assets/extracto/motor.js. Todo pasa en este dispositivo: el archivo no se envía, no se guarda y no se registra.
   Lo que no cabe en el diseño (contraseña de un PDF) se pide con una ventana del navegador; lo demás usa sus piezas. */
(function () {
  "use strict";
  const ROOT = (document.currentScript && document.currentScript.dataset.root) || "../";
  const $ = (id) => document.getElementById(id);
  const LANG = ["es", "ca", "en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
  const TX = {
    es: { year: "€/año", menos: " menos/año",
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
    ca: { year: "€/any", menos: " menys/any",
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
    en: { year: "€/year", menos: " less/year",
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
    motor().then((m) => { if (location.pathname.indexOf("/extracto/") === 0) m.registrarSinConexion().catch(() => {}); }).catch(() => {});
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
      show("up");
      const err = (r.errores || [])[0];
      msg($("xErr"), err ? err.texto : r.necesita_mapeo ? TX.mapeo : TX.none);
      return;
    }
    actual = r;
    render(r, cobros); show("res");
    const h = $("xResH"); if (h) h.focus({ preventScroll: true });
  }

  // Fecha corta: 17/06
  const fecha = (iso) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "");
  const cada = (c) => TX.cada[c.periodicidad] || "";
  const el = (tag, clase, texto) => { const x = document.createElement(tag); if (clase) x.className = clase; if (texto !== undefined) x.textContent = texto; return x; };
  const extras = [];
  function limpiar() { while (extras.length) extras.pop().remove(); $("xList").textContent = ""; }

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
      if (k > 0) { ul = el("ul", "ext-list"); despues.after(ul); despues = ul; extras.push(ul); }
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
