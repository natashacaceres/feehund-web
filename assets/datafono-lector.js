/* Lector del resumen del datáfono en la página de Design (/datafono/, /ca/datafon/, /en/card-machine/), conectado al
   motor de /assets/extracto/motor.js. Todo pasa en este dispositivo: el archivo no se envía, no se guarda y no se registra.
   Rellena las casillas de la calculadora de siempre desde fuera (escribe y lanza «input» y «change», pulsa sus botones):
   no toca assets/app.js. Lo que la persona no confirma no llega a la calculadora. */
(function () {
  "use strict";
  const ROOT = (document.currentScript && document.currentScript.dataset.root) || "../";
  const $ = (id) => document.getElementById(id);
  const LANG = ["es", "ca", "en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
  const TX = {
    es: { renovado: "Hemos puesto al día el lector. Vuelve a soltar tu resumen.", banco: "Esto es el extracto de tu cuenta del banco, no el resumen del datáfono. Se lee en Mi banco.", irBanco: "Ir a Mi banco", seguro: "Leído y comprobado", revisar: "Revísalo", vacio: "No sale en el resumen. Escríbelo si lo sabes.", con: "Con quién cobras",
      mes: (d, h) => "Del " + d + " al " + h, suma: (n) => "Suma de " + n + " filas", noCifra: "Escribe solo la cifra, por ejemplo 1234,56.",
      bad: "No se ha podido leer. Prueba con el PDF o el Excel del resumen.", nada: "No encontramos las ventas con tarjeta en este archivo. Prueba con el resumen del mes o escríbelo a mano.",
      clave: (a) => "Contraseña de " + a, listo: (n) => "Hemos rellenado " + n + " casillas de la calculadora. Revísalas y sigue con las preguntas." },
    ca: { renovado: "Hem posat al dia el lector. Torna a deixar anar el teu resum.", banco: "Això és l'extracte del teu compte del banc, no el resum del datàfon. Es llegeix a El meu banc.", irBanco: "Anar a El meu banc", seguro: "Llegit i comprovat", revisar: "Revisa-ho", vacio: "No surt al resum. Escriu-ho si ho saps.", con: "Amb qui cobres",
      mes: (d, h) => "Del " + d + " al " + h, suma: (n) => "Suma de " + n + " files", noCifra: "Escriu només la xifra, per exemple 1234,56.",
      bad: "No s'ha pogut llegir. Prova amb el PDF o l'Excel del resum.", nada: "No trobem les vendes amb targeta en aquest arxiu. Prova amb el resum del mes o escriu-ho a mà.",
      clave: (a) => "Contrasenya de " + a, listo: (n) => "Hem omplert " + n + " caselles de la calculadora. Revisa-les i continua amb les preguntes." },
    en: { renovado: "We have updated the reader. Please drop your summary again.", banco: "This is your bank account statement, not the card machine summary. It goes in My bank.", irBanco: "Go to My bank", seguro: "Read and checked", revisar: "Please check", vacio: "Not in the summary. Type it in if you know it.", con: "Who you use",
      mes: (d, h) => "From " + d + " to " + h, suma: (n) => "Sum of " + n + " rows", noCifra: "Type just the number, for example 1234.56.",
      bad: "We could not read it. Try the PDF or Excel version of the summary.", nada: "We could not find your card sales in this file. Try the monthly summary or type the figures in.",
      clave: (a) => "Password for " + a, listo: (n) => "We filled in " + n + " boxes in the calculator. Check them and carry on with the questions." },
  }[LANG];
  // «Mi banco» en el idioma de la página
  const MI_BANCO = ROOT + { es: "extracto/", ca: "ca/extracte/", en: "en/statement/" }[LANG];
  const VENTAS = ["ventas_particulares", "ventas_empresa", "ventas_fuera_europa", "ventas_amex", "ventas_bizum", "operaciones", "pagado"];
  const CONTRATO = ["tasa_particulares", "tasa_empresa", "tasa_fuera_europa", "tasa_amex", "tasa_bizum", "fijo_por_cobro", "cuota", "alquiler"];

  // El motor y sus piezas se cargan a la primera; cada lector, solo cuando llega su archivo.
  const mods = {};
  const cargar = (k, ruta) => (mods[k] = mods[k] || import(new URL(ROOT + ruta, location.href).href));
  const motor = () => cargar("motor", "assets/extracto/motor.js");
  const RENOVADO = new URLSearchParams(location.search).get("motor"); // "nuevo" (al abrir) o "repite" (a mitad de una lectura)
  if (RENOVADO) { const u = new URL(location.href); u.searchParams.delete("motor"); history.replaceState(null, "", u.pathname + u.search + u.hash); }

  /**
   * El motor de esta versión. Si el navegador tenía guardada una copia vieja (de cuando se usó «Mi banco»), se vuelven
   * a pedir a la web todos los archivos del motor y la página se recarga una sola vez. No se guarda nada nuevo:
   * solo se renueva la caché normal del navegador.
   */
  // ¿La copia del motor que guarda el navegador es la de la web? Se compara la versión de recursos.js (la huella de
  // todos los archivos del motor) de la caché con la de la web. Cloudflare guarda los .js 4 horas en cada navegador.
  let revisada = null;
  function revisarVersion(motivo) {
    revisada = revisada || (async () => {
      const url = new URL(ROOT + "assets/extracto/recursos.js", location.href).href;
      const version = (t) => (String(t).match(/version:\s*'([^']+)'/) || [])[1] || null;
      try {
        const [web, guardada] = await Promise.all([fetch(url, { cache: "no-store" }).then((r) => r.text()), fetch(url).then((r) => r.text())]);
        if (version(web) && version(guardada) && version(web) !== version(guardada)) await renovarMotor(motivo);
      } catch (e) { /* sin conexión: se sigue con lo que hay */ }
    })();
    return revisada;
  }

  async function motorAlDia(motivo) {
    await revisarVersion(motivo);
    const m = await motor();
    if (typeof m.analizarResumen === "function") return m;
    await renovarMotor(motivo);
    throw Object.assign(new Error("motor viejo"), { viejo: true });
  }
  async function renovarMotor(motivo) {
    if (RENOVADO) return; // ya se intentó: no se recarga en bucle
    let lista = ["/assets/extracto/motor.js"];
    try {
      await import(new URL(ROOT + "assets/extracto/recursos.js?v=" + Date.now(), location.href).href);
      const R = globalThis.RECURSOS_EXTRACTO;
      if (R && R.PAGINA) lista = R.PAGINA.filter((u) => u.indexOf("/assets/extracto/") === 0);
    } catch (e) { /* sin la lista, al menos el motor */ }
    await Promise.all(lista.map((u) => fetch(new URL(u, location.origin).href, { cache: "reload", credentials: "same-origin" }).catch(() => null)));
    const u = new URL(location.href); u.searchParams.set("motor", motivo || "repite");
    location.replace(u.href);
    await new Promise(() => {}); // la página se recarga
  }
  const piezas = () => Promise.all([motor(), cargar("textos", "assets/extracto/textos.js").then((t) => t.cargarTextos().then(() => t)),
    cargar("confirmar", "assets/extracto/datafono/confirmar.js"), cargar("rellenar", "assets/extracto/datafono/rellenar.js")]);

  // Vuelta del pago (?pago=ok, el informe) o un enlace directo a la calculadora: se enseña sin pasar por el lector
  if (/[?&]pago=ok(&|$)/.test(location.search) || /^#(calcApp|calc|res|pay|informe|contacto)$/.test(location.hash)) { const d = $("dCalc"); if (d) d.hidden = false; }

  const scr = { up: $("dUp"), load: $("dLoad"), rev: $("dRev") };
  if (!scr.up || !scr.rev || !$("dFile")) return;
  const cargando = $("dLoadT"), textoCarga = cargando ? cargando.textContent : "";
  let actual = null, contrasenas = {};

  function show(which) {
    for (const k in scr) if (scr[k]) scr[k].hidden = k !== which;
    const l = $("dLector");
    if (l) l.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }
  function msg(el, t) { if (el) { el.textContent = t; el.hidden = !t; } }
  /** Un extracto del banco soltado aquí: se dice para qué es y se enlaza «Mi banco». */
  function aMiBanco(el) {
    el.textContent = TX.banco + " ";
    const a = document.createElement("a"); a.href = MI_BANCO; a.textContent = TX.irBanco + " →";
    el.appendChild(a); el.hidden = false;
  }
  async function esExtractoBanco(entrada) {
    try {
      const rb = await (await motor()).analizar(entrada, { idioma: LANG });
      return Boolean(rb && rb.lectura && (rb.lectura.movimientos || []).length);
    } catch (e) { return false; }
  }
  const esBanco = (r) => (r.errores || []).some((x) => x.codigo === "es_extracto_banco");

  async function analyze(entrada) {
    msg($("dErr"), ""); show("load");
    const t0 = Date.now();
    let r = null, error = null;
    const progreso = (p) => { if (cargando && p && p.texto) cargando.textContent = p.texto; };
    try {
      const m = await motorAlDia("repite");
      r = await m.analizarResumen(entrada, { idioma: LANG, contrasenas, onProgreso: progreso });
      // PDF con contraseña: se pide aquí mismo y se vuelve a leer
      while (r && r.necesita_contrasena && r.necesita_contrasena.length) {
        let pedida = false;
        for (const p of r.necesita_contrasena) { const c = prompt(TX.clave(p.archivo)); if (c) { contrasenas[p.archivo] = c; pedida = true; } }
        if (!pedida) break;
        r = await m.analizarResumen(entrada, { idioma: LANG, contrasenas, onProgreso: progreso });
      }
    } catch (e) {
      error = e;
      // un fallo del propio código (no un archivo que no se deja leer): puede ser una copia vieja de alguna pieza
      if (!e || (!e.codigo && !e.viejo)) await renovarMotor("repite");
    }
    await new Promise((ok) => setTimeout(ok, Math.max(0, 700 - (Date.now() - t0))));
    if (cargando) cargando.textContent = textoCarga;
    if (error || !r) { show("up"); msg($("dErr"), (error && error.message) || TX.bad); return; }
    // sin ventas ni número de cobros no es un resumen del datáfono (un extracto del banco puede traer «comisiones» sueltas)
    const vacio = !["ventas_particulares", "ventas_empresa", "ventas_fuera_europa", "ventas_amex", "ventas_bizum", "operaciones"]
      .some((k) => r.campos[k] && typeof r.campos[k].valor === "number" && r.campos[k].valor > 0);
    if (vacio) {
      // ¿un extracto del banco en PDF, Excel o CSV? Si «Mi banco» le lee movimientos, se dice y se enlaza
      const banco = esBanco(r) || await esExtractoBanco(entrada);
      show("up");
      if (banco) aMiBanco($("dErr")); else msg($("dErr"), r.errores && r.errores[0] ? r.errores[0].texto : TX.nada);
      return;
    }
    actual = r;
    try { await pintar(r); } catch (e) { show("up"); msg($("dErr"), TX.bad); return; }
    show("rev");
    const h = $("dRevH"); if (h) h.focus({ preventScroll: true });
  }

  // ---------- revisa tus cifras
  function plantilla(id) { return $(id).content.firstElementChild.cloneNode(true); }
  function poner(raiz, campo, texto) { const x = raiz.querySelector('[data-c="' + campo + '"]'); if (x) x.textContent = texto; return x; }
  const fechaCorta = (iso) => iso.split("-").reverse().join("/");

  async function pintar(r) {
    const [, textos, , rellenar] = await piezas();
    const t = (c, d) => textos.texto(c, LANG, d);
    const p = r.lectura.periodo, prov = r.campos.proveedor;
    $("dPeriodo").textContent = [p ? TX.mes(fechaCorta(p.desde), fechaCorta(p.hasta)) : "", prov && prov.valor ? TX.con + ": " + prov.nombre : ""].filter(Boolean).join(" · ");
    const avisos = $("dAvisos"); avisos.textContent = "";
    for (const a of (r.errores || []).concat(r.avisos || [])) {
      const li = plantilla("tAviso"), destino = li.dataset.c === "texto" ? li : li.querySelector('[data-c="texto"]') || li;
      if (a.codigo === "es_extracto_banco") aMiBanco(destino); else destino.textContent = a.texto;
      avisos.appendChild(li);
    }
    campos($("dCampos"), VENTAS, r, t, rellenar.formato);
    campos($("dContrato"), CONTRATO, r, t, rellenar.formato);
    const comp = $("dComp"); comp.textContent = "";
    for (const c of r.comprobaciones || []) {
      const li = plantilla("tComp"); li.dataset.estado = c.estado;
      poner(li, "icono", c.estado === "cuadra" ? "✓" : "✗"); poner(li, "texto", c.texto);
      comp.appendChild(li);
    }
    const dd = comp.closest("details"); if (dd) dd.hidden = !(r.comprobaciones || []).length;
  }

  function campos(caja, claves, r, t, formato) {
    caja.textContent = "";
    for (const k of claves) {
      const c = r.campos[k], n = plantilla("tCampo");
      const input = n.querySelector('[data-c="valor"]'), lab = n.querySelector('[data-c="nombre"]');
      input.id = "dl-" + k; input.name = k;
      input.value = c.valor === null ? "" : formato(c.valor, c.unidad, LANG);
      input.defaultValue = input.value;
      if (c.unidad === "num") input.inputMode = "numeric";
      if (lab) { lab.textContent = t("campo_" + k); lab.htmlFor = input.id; }
      poner(n, "unidad", c.unidad === "pct" ? "%" : c.unidad === "eur" ? "€" : "");
      n.dataset.estado = c.valor === null ? "vacio" : c.seguro ? "seguro" : "revisar";
      poner(n, "estado", c.valor === null ? TX.vacio : c.seguro ? TX.seguro : TX.revisar);
      poner(n, "origen", origen(c, t));
      poner(n, "motivos", (c.motivos_texto || []).join(" "));
      input.addEventListener("input", () => input.setCustomValidity(""));
      caja.appendChild(n);
    }
  }

  /** «Página 1, línea 7 · Visa Débito 210 5.432,10…» o «Suma de 290 filas». */
  function origen(c, t) {
    if (c.valor === null) return "";
    const n = c.n_origen || c.origen.length;
    if (n > 1) return TX.suma(n);
    const o = c.origen[0], como = t("como_" + c.como);
    if (!o) return como;
    const donde = o.pagina ? t("origen_pagina", o) : o.hoja ? t("origen_hoja", o) : t("origen_fila", o);
    return como + " · " + donde + " · " + (o.texto.length > 90 ? o.texto.slice(0, 89) + "…" : o.texto);
  }

  // ---------- confirmar y pasar a la calculadora
  async function confirmar() {
    if (!actual) return;
    const [, , conf, rellenar] = await piezas();
    const correcciones = {};
    for (const input of $("dForm").querySelectorAll("input[name]")) if (input.value !== input.defaultValue) correcciones[input.name] = input.value;
    let ok;
    try { ok = conf.confirmarResumen(actual, correcciones); } catch (e) {
      const k = Object.keys(correcciones).find((x) => { try { conf.confirmarResumen(actual, { [x]: correcciones[x] }); return false; } catch (_) { return true; } });
      const input = k && $("dl-" + k);
      if (input) { input.setCustomValidity(TX.noCifra); input.reportValidity(); }
      return;
    }
    // la calculadora pinta sus botones cuando tiene las tarifas: se espera a que estén
    for (let i = 0; i < 100 && !document.querySelector("#pProvChips .chip"); i++) await new Promise((r) => setTimeout(r, 50));
    const hecho = rellenar.rellenarCalculadora(ok, { documento: document, idioma: LANG });
    $("dLector").dataset.rellenado = hecho.rellenados.join(" ");
    irACalculadora(TX.listo(hecho.rellenados.length));
  }

  /** La calculadora va dentro de #dCalc, oculta hasta que la persona confirma sus cifras o elige escribirlas. */
  function mostrarCalculadora() { const d = $("dCalc"); if (d) d.hidden = false; }

  /** Lleva a la calculadora y pone el foco en la pregunta que toca. */
  function irACalculadora(aviso) {
    const calc = $("calcApp"), form = $("calc");
    if (!calc) return;
    mostrarCalculadora();
    const q = form && Array.prototype.find.call(form.querySelectorAll(".q"), (x) => !x.hidden);
    const h = q && q.querySelector("h2");
    if (h) h.focus({ preventScroll: true });
    // un salto, sin animación: la calculadora mueve el foco al pulsar sus botones y cortaría un desplazamiento suave
    (form || calc).scrollIntoView({ block: "start" });
    const vivo = $("dListo");
    if (vivo) vivo.textContent = aviso || "";
  }

  // ---------- ejemplo: el resumen inventado de /data/ejemplo-datafono.csv, leído igual que un archivo de verdad
  async function ejemplo() {
    const r = await fetch(ROOT + "data/ejemplo-datafono.csv");
    if (!r.ok) throw new Error(TX.bad);
    return new File([await r.blob()], "ejemplo-datafono.csv", { type: "text/csv" });
  }

  // aviso para lectores de pantalla al pasar a la calculadora (no se ve)
  const vivo = document.createElement("p"); vivo.id = "dListo"; vivo.className = "sr"; vivo.setAttribute("role", "status"); $("dLector").appendChild(vivo);

  // Al abrir la página se mira que el motor sea de esta versión (y si no, se renueva antes de que la persona haga nada)
  if (RENOVADO === "repite") msg($("dErr"), TX.renovado);
  addEventListener("load", () => { motorAlDia("nuevo").catch(() => {}); });

  const input = $("dFile"), drop = $("dDrop");
  // Los mismos formatos que «Mi banco» (assets/extracto.js), y varios archivos a la vez: lo que es de una cuenta y no
  // del datáfono (Norma 43, OFX, QIF, camt, MT940) se reconoce y se manda a «Mi banco».
  input.accept = ".csv,.tsv,.txt,.xls,.xlsx,.xlsm,.ods,.numbers,.pdf,.n43,.q43,.aeb,.ofx,.qfx,.qif,.xml,.sta,.mt940,.zip,.png,.jpg,.jpeg,.webp,.heic,.heif,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*";
  input.multiple = true;
  const archivos = (lista) => Array.prototype.slice.call(lista || []);
  $("dPick").addEventListener("click", () => input.click());
  input.addEventListener("change", () => { const fs = archivos(input.files); if (fs.length) { contrasenas = {}; analyze(fs); } input.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-over"); }));
  drop.addEventListener("drop", (e) => { const fs = archivos(e.dataTransfer && e.dataTransfer.files); if (fs.length) { contrasenas = {}; analyze(fs); } });
  // Texto pegado (Ctrl+V con el resumen copiado de la web del banco), solo en la primera pantalla y fuera de las casillas
  addEventListener("paste", (e) => {
    if (scr.up.hidden || (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) || (e.target && e.target.closest && e.target.closest("#calcApp"))) return;
    const t = e.clipboardData && e.clipboardData.getData("text");
    if (t && t.split("\n").length > 2) { contrasenas = {}; analyze(t); }
  });
  $("dDemo").addEventListener("click", () => { contrasenas = {}; ejemplo().then(analyze, () => msg($("dErr"), TX.bad)); });
  $("dHand").addEventListener("click", (e) => { e.preventDefault(); irACalculadora(""); });
  $("dForm").addEventListener("submit", (e) => { e.preventDefault(); confirmar().catch(() => {}); });
  $("dAgain").addEventListener("click", (e) => {
    e.preventDefault();
    actual = null; contrasenas = {};
    ["dCampos", "dContrato", "dComp", "dAvisos"].forEach((id) => { if ($(id)) $(id).textContent = ""; });
    motor().then((m) => m.olvidar()).catch(() => {});
    show("up");
  });
})();
