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
    },
    ca: {
      resumen: "Resum", graficas: "Gràfics", pagas: "Pagues l'any en coses que es repeteixen",
      calc: (n) => "a l'any, calculat amb " + (n === 1 ? "1 mes" : n + " mesos"), mes: (x) => "Uns " + x + " al mes",
      quien: "Qui se l'emporta", alAno: "L'any", evitable: "Es pot evitar", cada100: "De cada 100 €", menos1: "<1 €",
      tipos: { casa: "Casa", susc: "Subscripcions", seg: "Assegurances", banco: "Comissions del banc", otros: "Altres pagaments" },
      tipMes: (n, x) => n + ": uns " + x + " al mes", tip100: (k, l) => k + " de cada 100 €: " + l, menos: "Menys d'1",
      nada: "No hem vist pagaments que es repeteixin.", waffle: "Cent quadradets: cadascun és 1 € de cada 100 que es repeteixen",
      compartirMi: "Compartir la meva targeta", compartir: "Compartir", guardar: "Desar la imatge",
    },
    en: {
      resumen: "Summary", graficas: "Charts", pagas: "You pay each year in things that repeat",
      calc: (n) => "a year, worked out from " + (n === 1 ? "1 month" : n + " months"), mes: (x) => "About " + x + " a month",
      quien: "Who gets it", alAno: "A year", evitable: "Avoidable", cada100: "Out of every 100 €", menos1: "<1 €",
      tipos: { casa: "Home", susc: "Subscriptions", seg: "Insurance", banco: "Bank fees", otros: "Other payments" },
      tipMes: (n, x) => n + ": about " + x + " a month", tip100: (k, l) => k + " of every 100 €: " + l, menos: "Less than 1",
      nada: "We didn't see any payments that repeat.", waffle: "A hundred squares: each one is 1 € of every 100 that repeat",
      compartirMi: "Share my card", compartir: "Share", guardar: "Save image",
    },
  }[LANG];

  // Mismas reglas que la cifra del resumen (assets/extracto.js): seguros (o posibles si no hay ninguno) y comisiones no devueltas
  const SUSC = ["streaming", "musica", "nube_apps", "ia", "prensa", "gimnasios", "citas", "videojuegos", "idiomas", "reparto", "suscripciones", "club_descuentos", "bienestar", "pasarelas"];
  const TIPOS = [
    { k: "casa", cats: ["telecos", "energia", "agua", "alarmas", "hogar", "gastos_fijos"] },
    { k: "susc", cats: SUSC },
    { k: "seg", cats: ["seguros"] },
    { k: "banco", cats: ["comisiones", "tarjetas"] },
  ];
  const tipoDe = (cat) => (TIPOS.find((t) => t.cats.indexOf(cat) >= 0) || { k: "otros" }).k;
  const COLOR_TIPO = { casa: "#0E5E6F", susc: "#7FC1CC", seg: "#3E8F9D", otros: "#D9C7A5", banco: "#FFB238" };

  function calcRepe(r) {
    const cobros = r.cobros || [], porId = {}; cobros.forEach((c) => { porId[c.id] = c; });
    const hay = cobros.some((c) => c.estado === "seguro");
    const cuenta = (c) => (hay ? c.estado === "seguro" : c.estado === "seguro" || c.estado === "posible");
    const periodo = (r.lectura && r.lectura.periodo) || {};
    const dias = periodo.dias || 365, meses = periodo.meses || 12;
    const anualCom = (c) => (c.periodicidad === "puntual" ? (c.coste_anual || c.importe || 0) * 365 / dias : c.coste_anual || 0);
    let total = 0; const junta = {};
    (r.grupos || []).forEach((g) => {
      if (!(g.codigo.indexOf("sector_") === 0 || g.codigo === "recibos" || g.codigo === "comisiones")) return;
      const com = g.codigo === "comisiones";
      const sel = (g.ids || []).map((id) => porId[id]).filter(Boolean).filter((c) => (com ? (c.etiquetas || []).indexOf("devuelto") < 0 : cuenta(c)));
      let gv = 0;
      sel.forEach((c) => {
        const v = com ? anualCom(c) : c.coste_anual || 0; gv += v;
        const k = com ? "_comisiones" : c.comercio_id || c.nombre;
        const it = junta[k] || (junta[k] = { n: com ? T.tipos.banco : c.nombre, id: com ? null : c.comercio_id, cat: com ? "comisiones" : c.categoria, v: 0, com });
        it.v += v;
      });
      if (Math.round(gv) > 0) total += Math.round(gv);
    });
    return { total, meses, items: Object.values(junta).filter((x) => x.v >= 0.5).sort((a, b) => b.v - a.v) };
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
      '<div class="pg-top"><p class="pg-k">' + esc(T.pagas) + '</p><p class="pg-big">' + eur(repe.total) + "</p>" +
      (repe.meses < 12 ? '<p class="pg-calc">' + esc(T.calc(repe.meses)) + "</p>" : "") + '<p class="pg-mes">' + esc(T.mes(eur(repe.total / 12))) + "</p></div>" +
      '<section class="pg-blq"><h3 class="pg-h">' + esc(T.quien) + '</h3><ul class="pg-rk"></ul><p class="pg-nota">' + esc(T.alAno) + "</p></section>" +
      '<section class="pg-blq"><h3 class="pg-h">' + esc(T.cada100) + '</h3><div class="pg-wfz"><div class="pg-wf" role="img" aria-label="' + esc(T.waffle) + '"></div><ul class="pg-wl"></ul></div></section>';

    // Quién se lo lleva
    const rk = gr.querySelector(".pg-rk");
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
    sh.innerHTML = ICO_SHARE; const sp = document.createElement("span"); sp.textContent = T.compartirMi; sh.appendChild(sp);
    if (tj.dataset.pgPlegable) return;
    tj.dataset.pgPlegable = "1";
    const gu = document.createElement("button"); gu.type = "button"; gu.className = "pg-guardar"; gu.innerHTML = ICO_BAJAR; gu.setAttribute("aria-label", T.guardar); gu.title = T.guardar;
    (tj.querySelector(".r3-tarjeta-v") || tj).appendChild(gu);
    const guardar = () => {
      const img = $("xTarjetaImg"); if (!img || !img.src) return;
      const a = document.createElement("a"); a.href = img.src; a.download = "feehund-mi-tarjeta.png"; document.body.appendChild(a); a.click(); a.remove();
    };
    gu.addEventListener("click", guardar);
    const img = $("xTarjetaImg"); if (img) { img.addEventListener("click", () => { if (tj.classList.contains("pg-abierta")) guardar(); }); img.title = T.guardar; }
    sh.addEventListener("click", (e) => {
      if (!tj.classList.contains("pg-plegada")) return; // ya abierta: comparte como siempre (WhatsApp, Instagram…)
      e.preventDefault(); e.stopImmediatePropagation();
      tj.classList.remove("pg-plegada"); tj.classList.add("pg-abierta");
      sh.innerHTML = ICO_SHARE; const s2 = document.createElement("span"); s2.textContent = T.compartir; sh.appendChild(s2);
      setTimeout(() => tj.scrollIntoView({ behavior: "smooth", block: "center" }), 450);
    }, true);
  }

  document.addEventListener("fh-resultado", (e) => {
    const r = e.detail; if (!r) return;
    try { repe = calcRepe(r); montarPestanas(); plegarTarjeta(); } catch (err) { /* si algo falla, el resumen sigue como siempre */ }
  });
})();
