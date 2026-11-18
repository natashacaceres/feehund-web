// Mi banco: pestañas «Resumen / Gráficas» y la tarjeta de compartir plegada.
// Las gráficas cuentan lo mismo que el resumen (lo que se repite), más fácil de ver:
//   la cifra al año (la misma del resumen), «Quién se lo lleva» (de mayor a menor, con logos)
//   y «De cada 100 €» por tipo de pago (casa, suscripciones, seguros, comisiones, otros).
// Escucha «fh-resultado» (lo lanza assets/extracto.js con el resultado del motor). Sin estilos ni scripts en línea (CSP).
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const LANG = ["es", "ca", "en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
  const ROOT = (document.currentScript && document.currentScript.dataset.root) || "../";
  const nf0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: "always" });
  const eur = (x) => nf0.format(Math.round(x)) + " €";
  const nf2 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });
  const nf4 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const T = {
    es: {
      resumen: "Resumen", graficas: "Gráficas", pagas: "Pagas al año en cosas que se repiten",
      calc: (n) => "al año, calculado con " + (n === 1 ? "1 mes" : n + " meses"), mes: (x) => "Unos " + x + " al mes",
      quien: "Quién se lo lleva", alAno: "Al año", evitable: "Se puede evitar", cada100: "De cada 100 €", menos1: "<1 €",
      tipos: { casa: "Casa", susc: "Suscripciones", seg: "Seguros", banco: "Comisiones del banco", otros: "Otros pagos" },
      tipMes: (n, x) => n + ": unos " + x + " al mes", tip100: (k, l) => k + " de cada 100 €: " + l, menos: "Menos de 1",
      nada: "No hemos visto pagos que se repitan.", waffle: "Cien cuadritos: cada uno es 1 € de cada 100 que se repiten",
      compartirMi: "Compartir mi tarjeta", compartir: "Compartir", guardar: "Guardar imagen",
      mesAMes: "Mes a mes", media: (x) => "lo habitual " + x, mesTip: (m, x) => m + " · " + x, meses: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
      vivo: "Lo que pagas en recibos, en directo", desde: "desde que abriste la página", escala: ["al día", "a la semana", "al mes", "al año"],
      cuando: "Cuándo se te va", cuandoQ: "Cada punto es un cobro. Toca uno.", ventana: (a, b) => "sale entre el día " + a + " y el " + b, alMes: "al mes", dia: (d) => "Día " + d, unaVez: "1 vez al año",
      sube: "Quién te ha subido el precio", subeQ: "Lo que pagas de más al año por cada subida.", subeTot: "al año, sin que nadie te avise", igual: "Igual", alAnoP: "al año",
      nadieSube: "Nadie te ha subido el precio en este extracto.",
      sigues: "Si sigues así", siguesQ: "Mueve la barra.", enAnos: (n) => (n === 1 ? "en 1 año" : "en " + n + " años"), anos: "Años",
      ipc: "Con lo que suben los precios hoy (IPC 4,9 %, INE, octubre 2026).",
    },
    ca: {
      resumen: "Resum", graficas: "Gràfics", pagas: "Pagues l'any en coses que es repeteixen",
      calc: (n) => "a l'any, calculat amb " + (n === 1 ? "1 mes" : n + " mesos"), mes: (x) => "Uns " + x + " al mes",
      quien: "Qui se l'emporta", alAno: "L'any", evitable: "Es pot evitar", cada100: "De cada 100 €", menos1: "<1 €",
      tipos: { casa: "Casa", susc: "Subscripcions", seg: "Assegurances", banco: "Comissions del banc", otros: "Altres pagaments" },
      tipMes: (n, x) => n + ": uns " + x + " al mes", tip100: (k, l) => k + " de cada 100 €: " + l, menos: "Menys d'1",
      nada: "No hem vist pagaments que es repeteixin.", waffle: "Cent quadradets: cadascun és 1 € de cada 100 que es repeteixen",
      compartirMi: "Compartir la meva targeta", compartir: "Compartir", guardar: "Desar la imatge",
      mesAMes: "Mes a mes", media: (x) => "l'habitual " + x, mesTip: (m, x) => m + " · " + x, meses: ["gen", "febr", "març", "abr", "maig", "juny", "jul", "ag", "set", "oct", "nov", "des"],
      vivo: "El que pagues en rebuts, en directe", desde: "des que has obert la pàgina", escala: ["al dia", "a la setmana", "al mes", "l'any"],
      cuando: "Quan se te'n va", cuandoQ: "Cada punt és un cobrament. Toca'n un.", ventana: (a, b) => "surt entre el dia " + a + " i el " + b, alMes: "al mes", dia: (d) => "Dia " + d, unaVez: "1 cop l'any",
      sube: "Qui t'ha apujat el preu", subeQ: "El que pagues de més l'any per cada pujada.", subeTot: "l'any, sense que ningú t'avisi", igual: "Igual", alAnoP: "l'any",
      nadieSube: "Ningú t'ha apujat el preu en aquest extracte.",
      sigues: "Si continues així", siguesQ: "Mou la barra.", enAnos: (n) => (n === 1 ? "en 1 any" : "en " + n + " anys"), anos: "Anys",
      ipc: "Amb el que pugen els preus avui (IPC 4,9 %, INE, octubre 2026).",
    },
    en: {
      resumen: "Summary", graficas: "Charts", pagas: "You pay each year in things that repeat",
      calc: (n) => "a year, worked out from " + (n === 1 ? "1 month" : n + " months"), mes: (x) => "About " + x + " a month",
      quien: "Who gets it", alAno: "A year", evitable: "Avoidable", cada100: "Out of every 100 €", menos1: "<1 €",
      tipos: { casa: "Home", susc: "Subscriptions", seg: "Insurance", banco: "Bank fees", otros: "Other payments" },
      tipMes: (n, x) => n + ": about " + x + " a month", tip100: (k, l) => k + " of every 100 €: " + l, menos: "Less than 1",
      nada: "We didn't see any payments that repeat.", waffle: "A hundred squares: each one is 1 € of every 100 that repeat",
      compartirMi: "Share my card", compartir: "Share", guardar: "Save image",
      mesAMes: "Month by month", media: (x) => "usual " + x, mesTip: (m, x) => m + " · " + x, meses: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      vivo: "What you pay in bills, live", desde: "since you opened the page", escala: ["a day", "a week", "a month", "a year"],
      cuando: "When it leaves", cuandoQ: "Each dot is a payment. Tap one.", ventana: (a, b) => "goes out between day " + a + " and day " + b, alMes: "a month", dia: (d) => "Day " + d, unaVez: "once a year",
      sube: "Who raised your price", subeQ: "What you pay extra each year for each rise.", subeTot: "a year, without anyone telling you", igual: "Same", alAnoP: "a year",
      nadieSube: "Nobody raised your price in this statement.",
      sigues: "If you carry on like this", siguesQ: "Move the slider.", enAnos: (n) => (n === 1 ? "in 1 year" : "in " + n + " years"), anos: "Years",
      ipc: "With today's price rises (CPI 4.9%, INE, October 2026).",
    },
  }[LANG];

  // «Si sigues así»: a qué equivale. Precios medios de España en 2026 (fuentes en el Manual: Oney, idealista, INE,
  // coches.com, Bodas.net, Ministerio de Vivienda, Carwow, precios públicos de las universidades)
  const IPC = 0.049; // INE, IPC de octubre de 2026
  const COSAS = [
    [922, ["Un curso de universidad pública", "Un curs d'universitat pública", "A year at a state university"], ["60 créditos a 15,37 € de media", "60 crèdits a 15,37 € de mitjana", "60 credits at 15.37 € on average"]],
    [1100, ["Sacarte el carné de conducir", "Treure't el carnet de conduir", "Getting your driving licence"], ["entre 1.000 y 1.600 € en autoescuela", "entre 1.000 i 1.600 € a l'autoescola", "1,000 to 1,600 € at a driving school"]],
    [1389, ["Las vacaciones de verano de una persona", "Les vacances d'estiu d'una persona", "One person's summer holiday"], ["gasto medio en España", "despesa mitjana a Espanya", "average spend in Spain"]],
    [2778, ["Las vacaciones de verano de dos personas", "Les vacances d'estiu de dues persones", "A summer holiday for two"], ["1.389 € por persona", "1.389 € per persona", "1,389 € per person"]],
    [3672, ["Tres meses de alquiler", "Tres mesos de lloguer", "Three months' rent"], ["piso de 80 m² a 15,3 €/m²", "pis de 80 m² a 15,3 €/m²", "80 m² flat at 15.3 €/m²"]],
    [5626, ["Toda la comida de tu casa durante un año", "Tot el menjar de casa teva durant un any", "All your household's food for a year"], ["gasto medio por hogar", "despesa mitjana per llar", "average per household"]],
    [7344, ["Seis meses de alquiler", "Sis mesos de lloguer", "Six months' rent"], ["piso de 80 m² a 15,3 €/m²", "pis de 80 m² a 15,3 €/m²", "80 m² flat at 15.3 €/m²"]],
    [8404, ["Un año de comida y las vacaciones de dos", "Un any de menjar i les vacances de dos", "A year of food and a holiday for two"], ["5.626 € + 2.778 €", "5.626 € + 2.778 €", "5,626 € + 2,778 €"]],
    [11252, ["Dos años de comida de tu casa", "Dos anys de menjar de casa teva", "Two years of your household's food"], ["5.626 € al año", "5.626 € l'any", "5,626 € a year"]],
    [13419, ["Un coche de segunda mano", "Un cotxe de segona mà", "A second-hand car"], ["precio medio en 2026", "preu mitjà el 2026", "average price in 2026"]],
    [14688, ["Un año entero de alquiler", "Un any sencer de lloguer", "A whole year's rent"], ["piso de 80 m² a 15,3 €/m²", "pis de 80 m² a 15,3 €/m²", "80 m² flat at 15.3 €/m²"]],
    [16197, ["Un coche de segunda mano y las vacaciones de dos", "Un cotxe de segona mà i les vacances de dos", "A second-hand car and a holiday for two"], ["13.419 € + 2.778 €", "13.419 € + 2.778 €", "13,419 € + 2,778 €"]],
    [19045, ["Un coche de segunda mano y un año de comida", "Un cotxe de segona mà i un any de menjar", "A second-hand car and a year of food"], ["13.419 € + 5.626 €", "13.419 € + 5.626 €", "13,419 € + 5,626 €"]],
    [20250, ["Una boda de 90 invitados", "Un casament de 90 convidats", "A wedding for 90 guests"], ["225 € por invitado", "225 € per convidat", "225 € per guest"]],
    [25183, ["Una boda media en España", "Un casament mitjà a Espanya", "An average Spanish wedding"], ["unos 112 invitados", "uns 112 convidats", "about 112 guests"]],
    [29376, ["Dos años de alquiler", "Dos anys de lloguer", "Two years' rent"], ["piso de 80 m² a 15,3 €/m²", "pis de 80 m² a 15,3 €/m²", "80 m² flat at 15.3 €/m²"]],
    [42390, ["La entrada de un piso de 90 m²", "L'entrada d'un pis de 90 m²", "The deposit on a 90 m² flat"], ["el 20 % de 212.000 €", "el 20 % de 212.000 €", "20% of 212,000 €"]],
    [43557, ["Un coche nuevo", "Un cotxe nou", "A new car"], ["precio medio en concesionario", "preu mitjà al concessionari", "average dealership price"]],
  ];
  const LI = { es: 0, ca: 1, en: 2 }[LANG];

  // Mismas reglas que la cifra del resumen (assets/extracto.js): seguros (o posibles si no hay ninguno) y comisiones no devueltas
  const SUSC = ["streaming", "musica", "nube_apps", "ia", "prensa", "gimnasios", "citas", "videojuegos", "idiomas", "reparto", "suscripciones", "club_descuentos", "bienestar", "pasarelas"];
  const TIPOS = [
    { k: "casa", cats: ["telecos", "energia", "agua", "alarmas", "hogar", "gastos_fijos", "vivienda"] },
    { k: "susc", cats: SUSC },
    { k: "seg", cats: ["seguros"] },
    { k: "banco", cats: ["comisiones", "tarjetas"] },
  ];
  const tipoDe = (cat) => (TIPOS.find((t) => t.cats.indexOf(cat) >= 0) || { k: "otros" }).k;
  const COLOR_TIPO = { casa: "#0E5E6F", susc: "#7FC1CC", seg: "#3E8F9D", otros: "#D9C7A5", banco: "#FFB238" };

  function calcRepe(r) {
    const cobros = r.cobros || [], porId = {}; cobros.forEach((c) => { porId[c.id] = c; });
    const hay = cobros.some((c) => c.estado === "seguro");
    const esSusc = (c) => SUSC.indexOf(c.categoria) >= 0;
    // igual que assets/extracto.js: una suscripción vista 2 o más veces cuenta aunque sea «posible»
    const cuenta = (c) => c.estado === "seguro" || (c.estado === "posible" && (!hay || (esSusc(c) && (c.num_cargos || 0) >= 2)));
    const periodo = (r.lectura && r.lectura.periodo) || {};
    const dias = periodo.dias || 365, meses = periodo.meses || 12;
    const anualCom = (c) => (c.periodicidad === "puntual" ? (c.coste_anual || c.importe || 0) * 365 / dias : c.coste_anual || 0);
    const junta = {}, porTipo = {}, porMes = {}, lista2 = [];
    (r.grupos || []).forEach((g) => {
      if (!(g.codigo.indexOf("sector_") === 0 || g.codigo === "recibos" || g.codigo === "comisiones")) return;
      const com = g.codigo === "comisiones";
      const sel = (g.ids || []).map((id) => porId[id]).filter(Boolean).filter((c) => (com ? (c.etiquetas || []).indexOf("devuelto") < 0 : cuenta(c)));
      sel.forEach((c) => {
        const v = com ? anualCom(c) : c.coste_anual || 0;
        const tk = com ? "banco" : tipoDe(c.categoria); porTipo[tk] = (porTipo[tk] || 0) + v;
        const k = com ? "_comisiones" : c.comercio_id || c.nombre;
        const it = junta[k] || (junta[k] = { n: com ? T.tipos.banco : c.nombre, id: com ? null : c.comercio_id, cat: com ? "comisiones" : c.categoria, v: 0, com });
        it.v += v;
        (c.movimientos || []).forEach((m) => { const k2 = String(m.fecha || "").slice(0, 7); if (k2.length === 7 && m.importe < 0) porMes[k2] = (porMes[k2] || 0) - m.importe; });
        if (!com && v > 0) lista2.push({ c, v });
      });
    });
    const total = Object.values(porTipo).reduce((t, v) => t + Math.max(0, Math.round(v)), 0); // la misma cifra que el resumen
    // todos los meses del extracto, también los que no tuvieron cargos
    const lista = []; if (periodo.desde && periodo.hasta) { let [y, m] = periodo.desde.slice(0, 7).split("-").map(Number); const fin = periodo.hasta.slice(0, 7); for (let n = 0; n < 40; n++) { const k3 = y + "-" + String(m).padStart(2, "0"); lista.push([k3, porMes[k3] || 0]); if (k3 >= fin) break; m++; if (m > 12) { m = 1; y++; } } }
    // Para el reloj: cada cobro en su día del mes (el más repetido) con lo que pesa al mes
    const puntos = [], subidas = [];
    lista2.forEach(({ c, v }) => {
      const movs = (c.movimientos || []).filter((m) => m.importe < 0 && /^\d{4}-\d{2}-\d{2}/.test(m.fecha || "")).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
      if (!movs.length) return;
      const cuenta = {}; movs.forEach((m) => { const d = +m.fecha.slice(8, 10); cuenta[d] = (cuenta[d] || 0) + 1; });
      const dia = +Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a] || a - b)[0];
      const anual = c.periodicidad === "anual" || movs.length === 1;
      puntos.push({ d: dia, n: c.nombre, v, imp: -movs[movs.length - 1].importe, anual });
      // Subida: un precio fijo que da un salto y se queda (los recibos que varían cada mes, como la luz, no cuentan)
      if (movs.length >= 3) {
        const a = movs.map((m) => -m.importe), ini = a[0], fin = a[a.length - 1], cerca = (x, y) => Math.abs(x - y) <= Math.max(0.02, y * 0.01);
        let k = a.findIndex((x) => !cerca(x, ini));
        if (fin - ini >= 0.5 && k > 0 && a.slice(k).every((x) => cerca(x, fin))) subidas.push({ n: c.nombre, id: c.comercio_id, a: ini, b: fin, extra: v * (fin - ini) / fin });
      }
    });
    return { total, meses, porMes: lista, puntos, subidas: subidas.sort((x, y) => y.extra - x.extra), items: Object.values(junta).filter((x) => x.v >= 0.5).sort((a, b) => b.v - a.v) };
  }

  // Aviso que sigue al ratón o al dedo
  let tipEl = null;
  function tip(e, t) {
    if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "pg-tip"; tipEl.setAttribute("role", "status"); document.body.appendChild(tipEl); }
    if (!t) { tipEl.classList.remove("on"); return; }
    const p = e.touches ? e.touches[0] : e; tipEl.textContent = t; tipEl.classList.add("on");
    const w = tipEl.offsetWidth;
    tipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, p.clientX - w / 2)) + "px";
    tipEl.style.top = p.clientY - 56 + "px";
  }
  addEventListener("scroll", () => tip(null, ""), { passive: true });

  function logo(it) {
    const s = document.createElement("span"); s.className = "pg-logo";
    const ini = () => { s.classList.add("pg-logo--ini"); s.textContent = it.com ? "€" : (it.n || "?").trim().charAt(0).toUpperCase(); };
    if (it.com || !it.id) { ini(); if (it.com) s.classList.add("pg-logo--com"); return s; }
    const img = document.createElement("img"); img.alt = ""; img.width = 40; img.height = 40; img.decoding = "async";
    img.addEventListener("error", ini, { once: true });
    img.src = ROOT + "assets/logos/" + String(it.id).replace(/_/g, "-") + ".png";
    s.appendChild(img); return s;
  }

  function ranking(rk) {
    const max = repe.items[0].v;
    repe.items.forEach((it) => {
      const li = document.createElement("li"); li.tabIndex = 0; if (it.com) li.className = "pg-ambar";
      li.appendChild(logo(it));
      const nom = document.createElement("span"); nom.className = "pg-nom"; nom.textContent = it.n;
      if (it.com) { const tg = document.createElement("span"); tg.className = "pg-tag"; tg.textContent = T.evitable; nom.appendChild(tg); }
      const val = document.createElement("span"); val.className = "pg-val"; val.textContent = eur(it.v);
      const bar = document.createElement("span"); bar.className = "pg-bar"; const i = document.createElement("i"); i.style.width = Math.max(2, (it.v / max) * 100) + "%"; bar.appendChild(i);
      li.append(nom, val, bar); rk.appendChild(li);
      const t = T.tipMes(it.n, eur(it.v / 12));
      const on = (e) => { li.classList.add("on"); tip(e, t); }, off = () => { li.classList.remove("on"); tip(null, ""); };
      li.addEventListener("mousemove", on); li.addEventListener("mouseleave", off); li.addEventListener("touchstart", on, { passive: true });
      li.addEventListener("focus", () => { const b = li.getBoundingClientRect(); on({ clientX: b.left + b.width / 2, clientY: b.top }); }); li.addEventListener("blur", off);
    });
  }
  // Resumen: «Quién se lo lleva» justo después de la frase de suscripciones; fuera «En qué se te va» (lo dice la lista)
  // y las buenas noticias del resumen (siguen dentro de «Ver todo el detalle»)
  function ponerEnResumen() {
    // la cifra grande y «al año, calculado con N meses» en la misma fila (la nota pequeña a la derecha)
    const cifra = document.querySelector("#xRes .r3-cifra"), calc = $("xCalc");
    if (cifra && calc && !cifra.parentNode.classList.contains("pg-fila")) { const fila = document.createElement("div"); fila.className = "pg-fila"; cifra.before(fila); fila.append(cifra, calc); }
    const viejo = $("pgRes"); if (viejo) viejo.remove();
    const va = $("xVa"); if (va) va.hidden = true;
    const bn = $("xBuenas"); if (bn) bn.hidden = true;
    if (!repe || !repe.items.length) return;
    const ancla = $("xEscapo"); if (!ancla) return;
    const sec = document.createElement("section"); sec.className = "r3-blq pg-res"; sec.id = "pgRes";
    const h = document.createElement("h2"); h.className = "r3-h"; h.textContent = T.quien;
    const ul = document.createElement("ul"); ul.className = "pg-rk";
    const nota = document.createElement("p"); nota.className = "pg-nota"; nota.textContent = T.alAno;
    sec.append(h, ul, nota); ancla.after(sec); ranking(ul);
  }

  let repe = null;
  function pintar() {
    const gr = $("pgGr"); if (!gr || !repe) return;
    if (!repe.items.length) { gr.innerHTML = '<p class="pg-k">' + esc(T.nada) + "</p>"; return; }
    const max = repe.items[0].v;
    const porT = {};
    repe.items.forEach((it) => { const k = tipoDe(it.cat); (porT[k] = porT[k] || { tk: k, v: 0, quien: [] }); porT[k].v += it.v; porT[k].quien.push(it.n); });
    const tipos = Object.values(porT).sort((a, b) => b.v - a.v), suma = tipos.reduce((a, t) => a + t.v, 0);
    const cnt = tipos.map((t) => Math.floor((t.v / suma) * 100)); let falta = 100 - cnt.reduce((a, b) => a + b, 0);
    tipos.map((t, i) => ({ i, r: (t.v / suma) * 100 - cnt[i] })).sort((a, b) => b.r - a.r).forEach((o) => { if (falta > 0) { cnt[o.i]++; falta--; } });
    tipos.forEach((t, i) => { t.k = cnt[i]; t.color = COLOR_TIPO[t.tk]; });

    gr.innerHTML =
      '<div class="pg-vivo"><p class="pg-vivo-t"><i aria-hidden="true"></i>' + esc(T.vivo) + '</p><p class="pg-vivo-n" aria-hidden="true">0,0000 €</p><p class="pg-vivo-s">' + esc(T.desde) + '</p></div>' +
      '<ul class="pg-esc"></ul>' +
      '<section class="pg-blq"><h3 class="pg-h">' + esc(T.cada100) + '</h3><div class="pg-wfz"><div class="pg-wf" role="img" aria-label="' + esc(T.waffle) + '"></div><ul class="pg-wl"></ul></div></section>' +
      (repe.puntos.length > 1 ? '<section class="pg-blq pg-rel"><h3 class="pg-h">' + esc(T.cuando) + '</h3><p class="pg-q">' + esc(T.cuandoQ) + '</p><div class="pg-rel-in"></div></section>' : "") +
      '<section class="pg-blq pg-sub"><h3 class="pg-h">' + esc(T.sube) + '</h3></section>' +
      '<section class="pg-blq pg-sig"><h3 class="pg-h">' + esc(T.sigues) + '</h3><p class="pg-q">' + esc(T.siguesQ) + '</p><div class="pg-sig-in"></div></section>';
    vivo(gr); reloj(gr.querySelector(".pg-rel-in")); subidas(gr.querySelector(".pg-sub")); sigues(gr.querySelector(".pg-sig-in"));

    // De cada 100 €
    const wf = gr.querySelector(".pg-wf"), wl = gr.querySelector(".pg-wl");
    tipos.forEach((t, n) => {
      for (let k = 0; k < t.k; k++) { const c = document.createElement("i"); c.dataset.t = n; c.style.background = t.color; wf.appendChild(c); }
      const li = document.createElement("li"); li.tabIndex = 0; li.dataset.t = n;
      const ct = document.createElement("span"); ct.className = "pg-cnt"; ct.textContent = t.k ? t.k + " €" : T.menos1;
      const tn = document.createElement("span"); tn.className = "pg-tn"; const sq = document.createElement("i"); sq.style.background = t.color; tn.append(sq, document.createTextNode(T.tipos[t.tk]));
      const v = document.createElement("span"); v.className = "pg-val"; v.textContent = eur(t.v);
      li.append(ct, tn, v); wl.appendChild(li);
    });
    const filas = [...wl.children];
    const marca = (i, e) => {
      wf.classList.toggle("foco", i != null);
      wf.querySelectorAll("i").forEach((c) => c.classList.toggle("on", c.dataset.t == i));
      filas.forEach((li) => li.classList.toggle("on", li.dataset.t == i));
      if (i == null) { tip(null, ""); return; }
      const t = tipos[i]; if (e) tip(e, T.tip100(t.k ? t.k : T.menos, t.quien.slice(0, 4).join(", ") + (t.quien.length > 4 ? "…" : "")));
    };
    wf.querySelectorAll("i").forEach((c) => { c.addEventListener("mousemove", (e) => marca(c.dataset.t, e)); c.addEventListener("touchstart", (e) => marca(c.dataset.t, e), { passive: true }); });
    wf.addEventListener("mouseleave", () => marca(null));
    filas.forEach((li) => { li.addEventListener("mousemove", (e) => marca(li.dataset.t, e)); li.addEventListener("mouseleave", () => marca(null)); li.addEventListener("touchstart", (e) => marca(li.dataset.t, e), { passive: true }); });

  }

  // ---------- Lo que pagas en recibos, en directo ----------
  let reloj0 = null;
  function vivo(gr) {
    const n = gr.querySelector(".pg-vivo-n"), es = gr.querySelector(".pg-esc"), T0 = repe.total;
    [T0 / 365, T0 / 52, T0 / 12, T0].forEach((v, i) => {
      const li = document.createElement("li"), b = document.createElement("b"), s = document.createElement("span");
      b.textContent = i === 0 ? nf2.format(v) + " €" : eur(v); s.textContent = T.escala[i]; li.append(b, s); es.appendChild(li);
    });
    const t0 = performance.now(), porMs = T0 / (365 * 864e5);
    if (reloj0) clearInterval(reloj0);
    reloj0 = setInterval(() => { if (!n.isConnected) { clearInterval(reloj0); return; } n.textContent = nf4.format((performance.now() - t0) * porMs) + " €"; }, 100);
  }

  // ---------- Cuándo se te va: el mes como un reloj ----------
  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  function reloj(box) {
    if (!box) return;
    const P = repe.puntos, cx = 180, cy = 180, R = 128, pt = (d, r) => { const a = (d - 1) / 31 * 2 * Math.PI - Math.PI / 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    // la ventana de 5 días por la que sale más dinero
    const porDia = {}; P.forEach((p) => { (porDia[p.d] = porDia[p.d] || []).push(p); });
    const peso = (d) => (porDia[d] || []).reduce((s, p) => s + p.v, 0), tot = P.reduce((s, p) => s + p.v, 0);
    let mejor = 1, mx = -1; for (let d = 1; d <= 27; d++) { let s = 0; for (let k = 0; k < 5; k++) s += peso(d + k); if (s > mx) { mx = s; mejor = d; } }
    const pct = Math.round((mx / tot) * 100);
    const svg = svgEl("svg", { viewBox: "0 0 360 360", role: "img", "aria-label": T.cuando });
    svg.appendChild(svgEl("circle", { cx, cy, r: R, fill: "none", stroke: "#D9CBB0", "stroke-width": 2 }));
    const p1 = pt(mejor - 0.4, R), p5 = pt(mejor + 4.6, R);
    svg.appendChild(svgEl("path", { d: "M" + p1[0] + " " + p1[1] + " A" + R + " " + R + " 0 0 1 " + p5[0] + " " + p5[1], fill: "none", stroke: "#FFB238", "stroke-width": 14, "stroke-linecap": "round", opacity: 0.6 }));
    for (let d = 1; d <= 31; d++) { const a = pt(d, R - 6), b = pt(d, R + 6); svg.appendChild(svgEl("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: "#B9AC93", "stroke-width": d % 7 === 1 ? 2 : 1 })); }
    [1, 8, 15, 22, 29].forEach((d) => { const p = pt(d, R + 26), tx = svgEl("text", { x: p[0], y: p[1] + 5, "text-anchor": "middle", fill: "#4F5667", "font-size": 14, "font-weight": 600 }); tx.textContent = d; svg.appendChild(tx); });
    const info = document.createElement("div"); info.className = "pg-rel-info";
    info.innerHTML = '<p class="pg-big">' + pct + ' %</p><p class="pg-k">' + esc(T.ventana(mejor, mejor + 4)) + '</p><p class="pg-rel-d"></p><ul class="pg-rel-l"></ul>';
    const gs = {};
    const ver = (d) => {
      info.querySelector(".pg-rel-d").textContent = T.dia(d);
      const ul = info.querySelector(".pg-rel-l"); ul.textContent = "";
      porDia[d].forEach((p) => { const li = document.createElement("li"), a = document.createElement("span"), b = document.createElement("b"); a.textContent = p.n + (p.anual ? " (" + T.unaVez + ")" : ""); b.textContent = nf2.format(p.imp) + " €"; li.append(a, b); ul.appendChild(li); });
      for (const k in gs) gs[k].classList.toggle("sel", +k === d);
    };
    Object.keys(porDia).forEach((k) => {
      const d = +k, v = peso(d), r = Math.min(30, 6 + Math.sqrt(v / 12) * 2.6), p = pt(d, R - r - 8);
      const g = svgEl("g", { class: "pg-dot", tabindex: 0, role: "button", "aria-label": T.dia(d) + ": " + eur(v / 12) + " " + T.alMes });
      g.appendChild(svgEl("circle", { cx: p[0], cy: p[1], r, fill: "#0E5E6F" }));
      g.addEventListener("click", () => ver(d)); g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ver(d); } });
      gs[d] = g; svg.appendChild(g);
    });
    const c1 = svgEl("text", { x: cx, y: cy - 2, "text-anchor": "middle", fill: "#14213D", "font-size": 32, "font-weight": 800, class: "pg-rel-c" }); c1.textContent = eur(repe.total / 12); // la misma cifra que «al mes» de arriba svg.appendChild(c1);
    const c2 = svgEl("text", { x: cx, y: cy + 22, "text-anchor": "middle", fill: "#4F5667", "font-size": 14 }); c2.textContent = T.alMes; svg.appendChild(c2);
    box.append(svg, info);
    const primero = Object.keys(porDia).map(Number).filter((d) => d >= mejor && d <= mejor + 4).sort((a, b) => peso(b) - peso(a))[0];
    ver(primero || +Object.keys(porDia)[0]);
  }

  // ---------- Quién te ha subido el precio ----------
  function subidas(sec) {
    const S = repe.subidas;
    if (!S.length) { const p = document.createElement("p"); p.className = "pg-q"; p.textContent = T.nadieSube; sec.appendChild(p); return; }
    const q = document.createElement("p"); q.className = "pg-q"; q.textContent = T.subeQ; sec.appendChild(q);
    const tot = S.reduce((s, x) => s + x.extra, 0), mxE = S[0].extra;
    const top = document.createElement("div"); top.className = "pg-sub-tot";
    top.innerHTML = '<span class="pg-big">+' + esc(eur(tot)) + '</span><span class="pg-k">' + esc(T.subeTot) + "</span>"; sec.appendChild(top);
    const ul = document.createElement("ul"); ul.className = "pg-sub-l";
    S.slice(0, 6).forEach((s, i) => {
      const li = document.createElement("li");
      const n = document.createElement("span"); n.className = "pg-sub-n"; n.textContent = s.n;
      const sm = document.createElement("small"); sm.textContent = nf2.format(s.a) + " € → " + nf2.format(s.b) + " €"; n.appendChild(sm);
      const bar = document.createElement("span"); bar.className = "pg-sub-b"; const m = document.createElement("i"); m.style.width = Math.max(4, (s.extra / mxE) * 100) + "%"; m.style.animationDelay = (0.2 + i * 0.12) + "s"; bar.appendChild(m);
      const d = document.createElement("span"); d.className = "pg-sub-d"; d.textContent = "+" + eur(s.extra); const al = document.createElement("small"); al.textContent = T.alAnoP; d.appendChild(al);
      li.append(n, bar, d); ul.appendChild(li);
    });
    sec.appendChild(ul);
  }

  // ---------- Si sigues así: el total sube con el IPC; cada año, una cosa distinta ----------
  function sigues(box) {
    const T0 = repe.total, hoy = [0], con = [0];
    for (let y = 1; y <= 10; y++) { hoy[y] = T0 * y; con[y] = con[y - 1] + T0 * Math.pow(1 + IPC, y); }
    const usadas = {}, anio = [];
    for (let y = 1; y <= 10; y++) { let m = null; COSAS.forEach((c, i) => { if (c[0] <= hoy[y] && !usadas[i]) m = i; }); if (m !== null) usadas[m] = 1; anio[y] = m; }
    box.innerHTML = '<div class="pg-sig-a"><div class="pg-sig-c"><span class="pg-big"></span><span class="pg-k"></span></div><p class="pg-sig-eq"></p></div>' +
      '<div class="pg-sig-b"><div class="pg-sig-cols" aria-hidden="true"></div><div class="pg-sig-ej" aria-hidden="true"></div><label class="pg-k" for="pgAnos">' + esc(T.anos) + '</label><input type="range" id="pgAnos" min="1" max="10" value="1"><p class="pg-sig-ipc">' + esc(T.ipc) + "</p></div>";
    const cols = box.querySelector(".pg-sig-cols"), ej = box.querySelector(".pg-sig-ej"), rg = box.querySelector("input");
    for (let y = 1; y <= 10; y++) { const c = document.createElement("i"); c.style.height = (con[y] / con[10]) * 100 + "%"; cols.appendChild(c); const s = document.createElement("span"); s.textContent = y; ej.appendChild(s); }
    const pon = () => {
      const n = +rg.value; box.querySelector(".pg-sig-c .pg-big").textContent = eur(con[n]); box.querySelector(".pg-sig-c .pg-k").textContent = T.enAnos(n);
      [...cols.children].forEach((c, i) => { c.className = i < n - 1 ? "on" : i === n - 1 ? "yo" : ""; });
      const q = box.querySelector(".pg-sig-eq"), k = anio[n]; q.textContent = "";
      if (k != null) { q.textContent = COSAS[k][1][LI]; const sm = document.createElement("small"); sm.textContent = COSAS[k][2][LI]; q.appendChild(sm); }
    };
    rg.addEventListener("input", pon); pon();
  }

  function montarPestanas() {
    const res = $("xRes"), r3 = res && res.querySelector(".r3"); if (!r3) return;
    let tabs = $("pgTabs"), gr = $("pgGr");
    if (!tabs) {
      tabs = document.createElement("div"); tabs.className = "pg-tabs"; tabs.id = "pgTabs"; tabs.setAttribute("role", "tablist");
      tabs.innerHTML = '<button type="button" role="tab" data-t="r"></button><button type="button" role="tab" data-t="g"></button>';
      tabs.children[0].textContent = T.resumen; tabs.children[1].textContent = T.graficas;
      res.insertBefore(tabs, r3);
      gr = document.createElement("div"); gr.className = "pg"; gr.id = "pgGr"; r3.after(gr);
      tabs.addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        const g = b.dataset.t === "g"; elegir(g);
        tabs.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    }
    const elegir = (g) => {
      tabs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String((x.dataset.t === "g") === g)));
      r3.hidden = g; gr.hidden = !g; if (g) pintar();
    };
    elegir(false); // cada lectura nueva empieza en el resumen
  }

  // Compartir: solo el botón; al tocarlo baja la tarjeta y todo queda en un bloque: la tarjeta con «guardar» en su esquina y «Compartir» debajo
  const ICO_SHARE = '<svg class="pg-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7.5 7.5 12 3l4.5 4.5"/><path d="M5 11.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7.5"/></svg>';
  const ICO_BAJAR = '<svg class="pg-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/></svg>';
  function plegarTarjeta() {
    const tj = $("xTarjeta"), sh = $("xShare"); if (!tj || !sh) return;
    tj.classList.remove("pg-abierta"); tj.classList.add("pg-plegada");
    // En el ejemplo solo se ve el botón: no se abre ni se comparte (no es la tarjeta de nadie)
    const ej = $("xEjemplo"); tj.dataset.ejemplo = ej && !ej.hidden ? "1" : "";
    if (tj.dataset.ejemplo) sh.setAttribute("aria-disabled", "true"); else sh.removeAttribute("aria-disabled");
    sh.innerHTML = ICO_SHARE; sh.removeAttribute("aria-label"); sh.removeAttribute("title"); const sp = document.createElement("span"); sp.textContent = T.compartirMi; sh.appendChild(sp);
    if (tj.dataset.pgPlegable) return;
    tj.dataset.pgPlegable = "1";
    const gu = document.createElement("button"); gu.type = "button"; gu.className = "pg-guardar"; gu.innerHTML = ICO_BAJAR; gu.setAttribute("aria-label", T.guardar); gu.title = T.guardar;
    // Guardar y compartir: dos botones redondos grises debajo de la tarjeta, sin taparla
    const acc = document.createElement("div"); acc.className = "pg-acc"; sh.before(acc); acc.append(gu, sh);
    const guardar = () => {
      const img = $("xTarjetaImg"); if (!img || !img.src) return;
      const a = document.createElement("a"); a.href = img.src; a.download = "feehund-mi-tarjeta.png"; document.body.appendChild(a); a.click(); a.remove();
    };
    gu.addEventListener("click", guardar);
    const img = $("xTarjetaImg"); if (img) { img.addEventListener("click", () => { if (tj.classList.contains("pg-abierta")) guardar(); }); img.title = T.guardar; }
    sh.addEventListener("click", (e) => {
      const ej2 = $("xEjemplo"); if (tj.dataset.ejemplo || (ej2 && !ej2.hidden)) { e.preventDefault(); e.stopImmediatePropagation(); sh.setAttribute("aria-disabled", "true"); return; }
      if (!tj.classList.contains("pg-plegada")) return; // ya abierta: comparte como siempre (WhatsApp, Instagram…)
      e.preventDefault(); e.stopImmediatePropagation();
      tj.classList.remove("pg-plegada"); tj.classList.add("pg-abierta");
      sh.innerHTML = ICO_SHARE; sh.setAttribute("aria-label", T.compartir); sh.title = T.compartir;
      setTimeout(() => tj.scrollIntoView({ behavior: "smooth", block: "center" }), 450);
    }, true);
  }

  document.addEventListener("fh-resultado", (e) => {
    const r = e.detail; if (!r) return;
    try { repe = calcRepe(r); montarPestanas(); ponerEnResumen(); plegarTarjeta(); } catch (err) { /* si algo falla, el resumen sigue como siempre */ }
  });
})();
