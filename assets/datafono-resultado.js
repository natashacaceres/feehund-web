// Mi datáfono: el resultado como en Mi banco. Pestañas «Resumen / Gráficas», con los datos de cada negocio.
// Lo lanza assets/app.js (evento «fh-datafono» al final de fill(), con {I, R, S, PLANS}). No cambia ningún cálculo:
// solo enseña lo que ya calcula la calculadora, con palabras de la calle.
//   Resumen: «Sí, pagas de más» · cuánto pagas de cada 100 € · lo más barato para ti · qué pasa cuando un cliente te paga
//            (con su cobro medio) · lo que te cuesta cada tarjeta (si se sabe su tarifa) · qué hacer ahora.
//   Gráficas: lo que se queda tu banco en directo · cómo te pagan tus clientes · lo que te cobraría cada banco · si sigues así.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const lang = () => (["es", "ca", "en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es");
  const n2 = (x) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" }).format(x) + " €";
  const n0 = (x) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: "always" }).format(Math.round(x)) + " €";
  const n4 = (x) => new Intl.NumberFormat("es-ES", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(x) + " €";
  const TX = {
    es: {
      resumen: "Resumen", graficas: "Gráficas", kicker: "Pagas de cada 100 € que cobras con tarjeta",
      barato: (x, y) => "Con lo que cobras tú, hay quien te cobraría " + x + ". Te ahorrarías unos " + y + " al mes.",
      peaje: "Qué pasa cuando un cliente te paga", medio: "Con tu cobro medio", paga: "Tu cliente paga", emisor: "El banco de tu cliente", red: "Visa o Mastercard", banco: "Tu banco", llega: "Te llega a ti",
      tarj: "Lo que te cuesta cada tarjeta", tarjQ: "De cada 100 € que te pagan con cada una.",
      tipos: ["Tarjetas de aquí", "Tarjetas de empresa", "Tarjetas de turistas", "American Express", "Bizum"],
      vivo: "Lo que se queda tu banco de tus ventas, en directo", desde: "desde que abriste la página", escala: ["al día", "a la semana", "al mes", "al año"],
      pagan: "Cómo te pagan tus clientes", paganQ: "De cada 100 € que cobras con tarjeta.",
      cada: "Lo que te cobraría cada banco", cadaQ: "Con tus ventas, de cada 100 €.", tu: (x) => "Tú, " + x,
      cuenta: (a, b) => (a === 0 ? "Nadie te cobraría menos." : a + (a === 1 ? " te cobraría menos. " : " te cobrarían menos. ")) + (b === 0 ? "" : b + ", más."),
      sigues: "Si sigues así", siguesQ: "Lo que pagas de más, sumado año a año.", en5: "en 5 años, con lo que suben los precios",
      meses: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"],
    },
    ca: {
      resumen: "Resum", graficas: "Gràfics", kicker: "Pagues de cada 100 € que cobres amb targeta",
      barato: (x, y) => "Amb el que cobres tu, n'hi ha que et cobrarien " + x + ". T'estalviaries uns " + y + " al mes.",
      peaje: "Què passa quan un client et paga", medio: "Amb el teu cobrament mitjà", paga: "El teu client paga", emisor: "El banc del teu client", red: "Visa o Mastercard", banco: "El teu banc", llega: "Et arriba a tu",
      tarj: "El que et costa cada targeta", tarjQ: "De cada 100 € que et paguen amb cadascuna.",
      tipos: ["Targetes d'aquí", "Targetes d'empresa", "Targetes de turistes", "American Express", "Bizum"],
      vivo: "El que es queda el teu banc de les teves vendes, en directe", desde: "des que has obert la pàgina", escala: ["al dia", "a la setmana", "al mes", "l'any"],
      pagan: "Com et paguen els teus clients", paganQ: "De cada 100 € que cobres amb targeta.",
      cada: "El que et cobraria cada banc", cadaQ: "Amb les teves vendes, de cada 100 €.", tu: (x) => "Tu, " + x,
      cuenta: (a, b) => (a === 0 ? "Ningú et cobraria menys." : a + (a === 1 ? " et cobraria menys. " : " et cobrarien menys. ")) + (b === 0 ? "" : b + ", més."),
      sigues: "Si continues així", siguesQ: "El que pagues de més, sumat any rere any.", en5: "en 5 anys, amb el que pugen els preus",
      meses: ["Gener", "Febrer", "Març", "Abril", "Maig", "Juny", "Juliol", "Agost", "Setembre", "Octubre", "Novembre", "Desembre"],
    },
    en: {
      resumen: "Summary", graficas: "Charts", kicker: "You pay out of every €100 you take by card",
      barato: (x, y) => "For what you take, some would charge you " + x + ". You'd save about " + y + " a month.",
      peaje: "What happens when a customer pays you", medio: "With your average payment", paga: "Your customer pays", emisor: "Your customer's bank", red: "Visa or Mastercard", banco: "Your bank", llega: "You get",
      tarj: "What each card costs you", tarjQ: "Out of every €100 paid with each one.",
      tipos: ["Local cards", "Business cards", "Tourist cards", "American Express", "Bizum"],
      vivo: "What your bank keeps from your sales, live", desde: "since you opened the page", escala: ["a day", "a week", "a month", "a year"],
      pagan: "How your customers pay you", paganQ: "Out of every €100 you take by card.",
      cada: "What each bank would charge you", cadaQ: "With your sales, out of every €100.", tu: (x) => "You, " + x,
      cuenta: (a, b) => (a === 0 ? "Nobody would charge you less." : a + " would charge you less. ") + (b === 0 ? "" : b + " would charge more."),
      sigues: "If you carry on like this", siguesQ: "What you overpay, added up year by year.", en5: "in 5 years, with rising prices",
      meses: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    },
  };
  const IPC = 0.049; // INE, IPC de octubre de 2026 (igual que «Si sigues así» de Mi banco)
  // gráficas por categorías: por tamaño, en este orden y sin repetir (las mismas que en Mi banco)
  const PALETA = ["#14213D", "#B5651D", "#6B4E9B", "#2F7FB8", "#5E8C3A", "#8A8270"];
  const NS = "http://www.w3.org/2000/svg";
  const ICO = {
    paga: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h3"/>',
    emisor: '<path d="M3 9.5 12 4l9 5.5M4.5 9.5h15M6.5 11v6M10 11v6M14 11v6M17.5 11v6M4.5 17.5h15"/>',
    red: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    banco: '<path d="M8.5 6.5V2.5h7v4"/><rect x="6" y="6.5" width="12" height="15" rx="2"/><rect x="8.5" y="9" width="7" height="3.5" rx=".6"/>',
    llega: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  };
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const icono = (k) => { const s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.innerHTML = ICO[k]; return s; };

  let ultimo = null, contador = null;

  // El mes del resumen leído («Del 01/10/2026 al 31/10/2026» → «Octubre»). Si se escribió a mano, no se enseña.
  function mesLeido(t) {
    const p = $("dPeriodo"), m = p && /(\d{2})\/(\d{2})\/(\d{4}).*?(\d{2})\/(\d{2})\/(\d{4})/.exec(p.textContent || "");
    if (!m) return "";
    return m[2] === m[5] && m[3] === m[6] ? t.meses[+m[2] - 1] : "";
  }

  function pintar() {
    if (!ultimo) return;
    const { I, R, S } = ultimo, t = TX[lang()], res = $("res"), r3 = res && res.querySelector(".r3");
    if (!r3 || !R) return;
    const yes = S.estado === "si", sabe = I.curCost > 0 && I.V > 0, hoy = sabe ? I.curCost / I.V * 100 : null, b = R.best;
    res.classList.add("dr");
    // ---------- arriba: el mes, la cifra de cada 100 € y lo más barato para ti
    const mes = mesLeido(t), chip = $("rMes");
    if (chip) { chip.textContent = mes; chip.hidden = !mes; }
    if (sabe) { $("rHero").hidden = false; $("rPre").textContent = t.kicker; $("rBig").textContent = n2(hoy); }
    if (yes && b && b.tasa_max != null) $("rNo").textContent = t.barato(n2(b.tasa_max * 100), n0(Math.max(0, b.ahorro_m)));
    // fuera lo que ya no va: las barras viejas, la buena noticia, compartir y el detalle
    ["rCien", "rBuenas", "rShare", "rVerDetalle", "rDetalle"].forEach((id) => { const e = $(id); if (e) e.hidden = true; });
    r3.querySelectorAll(".dr-nuevo").forEach((e) => e.remove());
    const antesDe = $("rHacer");
    // ---------- qué pasa cuando un cliente te paga (con su cobro medio)
    if (sabe && I.T > 0) {
      const T0 = I.T, coste = I.curCost * T0 / I.V; // lo que paga de media por cada cobro
      let em = T0 * 0.003, red = T0 * 0.0009 + 0.01; // lo máximo por ley (0,3 %) y la cuota de la red
      if (em + red > coste) { const k = coste / (em + red); em *= k * 0.6; red *= k * 0.6; }
      const banco = Math.max(0, coste - em - red);
      const sec = el("section", "r3-blq dr-nuevo dr-peaje");
      sec.append(el("h2", "r3-h", t.peaje), el("p", "dr-q", t.medio));
      const ol = el("ol", "dr-camino");
      [["paga", t.paga, n2(T0), ""], ["emisor", t.emisor, "−" + n2(em), "q"], ["red", t.red, "−" + n2(red), "q"], ["banco", t.banco, "−" + n2(banco), "q y"], ["llega", t.llega, n2(T0 - coste), "v"]].forEach(([k, txt, eur, cl]) => {
        const li = el("li", cl.indexOf("q") >= 0 ? "dr-quita" : cl === "v" ? "dr-tuyo" : "");
        const ic = el("span", "dr-ic" + (cl.indexOf("y") >= 0 ? " dr-ic-y" : cl === "v" ? " dr-ic-v" : "")); ic.appendChild(icono(k));
        li.append(ic, el("b", null, txt), el("span", "dr-e", eur)); ol.appendChild(li);
      });
      sec.appendChild(ol); r3.insertBefore(sec, antesDe);
    }
    // ---------- lo que te cuesta cada tarjeta (solo si se sabe la tarifa: un plan de la lista que cobra por %, o lo escrito del contrato)
    const c = R.cur, plan = c && c.p, w = [I.wP, I.wE, I.wN, I.wA, I.wB];
    const tasas = c ? [[c.rp, c.fp], [c.re, c.fe], [c.rn, c.fn], [c.ra, c.fa], [c.rb, c.fb]] : [];
    const conocida = (i) => {
      if (!plan) return false;
      if (plan.id === "CONTRATO") { const k = ["rp", "re", "rn", "ra", "rb"][i]; return plan[k] != null && plan[k] !== ""; }
      return plan.modelo === "Porcentaje";
    };
    const filas = [0, 1, 2, 3, 4].filter((i) => w[i] > 0 && conocida(i)).map((i) => ({ i, v: tasas[i][0] * 100 + (I.T > 0 ? (tasas[i][1] || 0) / I.T * 100 : 0) }));
    if (filas.length >= 2) {
      const sec = el("section", "r3-blq dr-nuevo dr-tarj");
      sec.append(el("h2", "r3-h", t.tarj), el("p", "dr-q", t.tarjQ));
      const mx = Math.max(...filas.map((f) => f.v), 0.01);
      filas.sort((a, b2) => a.v - b2.v).forEach((f) => {
        const fila = el("div", "dr-tr"), p = el("span", "dr-tp"), i = el("i");
        i.style.width = "max(6px, " + f.v / mx * 100 + "%)"; if (f.v > 1) i.className = "dr-caro";
        p.appendChild(i); fila.append(el("span", "dr-tn", t.tipos[f.i]), p, el("span", "dr-tv", n2(f.v))); sec.appendChild(fila);
      });
      r3.insertBefore(sec, antesDe);
    }
    // ---------- pestañas y gráficas
    let tabs = $("drTabs"), gr = $("drGr");
    if (!tabs) {
      tabs = el("div", "dr-tabs"); tabs.id = "drTabs"; tabs.setAttribute("role", "tablist");
      ["r", "g"].forEach((k) => { const bt = el("button"); bt.type = "button"; bt.setAttribute("role", "tab"); bt.dataset.t = k; tabs.appendChild(bt); });
      res.insertBefore(tabs, r3);
      gr = el("div", "dr-gr"); gr.id = "drGr"; r3.after(gr);
      tabs.addEventListener("click", (e) => { const bt = e.target.closest("button"); if (!bt) return; elegir(bt.dataset.t === "g"); tabs.scrollIntoView({ block: "start", behavior: "smooth" }); });
    }
    tabs.children[0].textContent = t.resumen; tabs.children[1].textContent = t.graficas;
    graficas(gr, t, yes, hoy);
    elegir(false);
  }
  function elegir(g) {
    const tabs = $("drTabs"), r3 = $("res").querySelector(".r3"), gr = $("drGr"); if (!tabs) return;
    [...tabs.children].forEach((x) => x.setAttribute("aria-selected", String((x.dataset.t === "g") === g)));
    r3.hidden = g; gr.hidden = !g;
    document.body.classList.toggle("dr-g", g); // en Gráficas no sale la oferta de pago de debajo
  }

  function graficas(gr, t, yes, hoy) {
    const { I, R } = ultimo, anual = R.CURANN || 0;
    gr.textContent = "";
    // lo que se queda tu banco, en directo
    if (anual > 0) {
      const v = el("div", "dr-vivo"), tt = el("p", "dr-vivo-t"), dot = el("i"); dot.setAttribute("aria-hidden", "true");
      tt.append(dot, document.createTextNode(t.vivo));
      const n = el("p", "dr-vivo-n", n4(0)); n.setAttribute("aria-hidden", "true");
      v.append(tt, n, el("p", "dr-vivo-s", t.desde)); gr.appendChild(v);
      const es = el("ul", "dr-esc");
      [anual / 365, anual / 52, anual / 12, anual].forEach((x, i) => { const li = el("li"); li.append(el("b", null, i === 0 ? n2(x) : n0(x)), el("span", null, t.escala[i])); es.appendChild(li); });
      gr.appendChild(es);
      const t0 = performance.now(), porMs = anual / (365 * 864e5);
      if (contador) clearInterval(contador);
      contador = setInterval(() => { if (!n.isConnected) { clearInterval(contador); return; } n.textContent = n4((performance.now() - t0) * porMs); }, 100);
    }
    // cómo te pagan tus clientes (de cada 100 €)
    const w = [I.wP, I.wE, I.wN, I.wA, I.wB];
    if (w.filter((x) => x > 0.005).length >= 2) {
      const cnt = w.map((x) => Math.floor(x * 100)); let falta = 100 - cnt.reduce((a, b) => a + b, 0);
      w.map((x, i) => ({ i, r: x * 100 - cnt[i] })).sort((a, b) => b.r - a.r).forEach((o) => { if (falta > 0) { cnt[o.i]++; falta--; } });
      const sec = el("section", "dr-blq"); sec.append(el("h3", "dr-h", t.pagan), el("p", "dr-q", t.paganQ));
      const z = el("div", "dr-wfz"), wf = el("div", "dr-wf"), ul = el("ul", "dr-wl"); wf.setAttribute("aria-hidden", "true");
      // lo que se dibuja: cada tipo que se usa, con 1 cuadro como mínimo (sale del mayor); el color, por tamaño y sin repetir
      const dib = cnt.slice(); w.forEach((x, i) => { if (x > 0 && dib[i] === 0) { const m = dib.indexOf(Math.max(...dib)); if (dib[m] > 1) { dib[m]--; dib[i] = 1; } } });
      const orden = w.map((x, i) => ({ x, i })).filter((o) => o.x > 0).sort((a, b) => b.x - a.x), col = {};
      orden.forEach((o, n) => { col[o.i] = PALETA[n]; });
      orden.forEach((o) => { for (let j = 0; j < dib[o.i]; j++) { const q = el("i"); q.style.background = col[o.i]; wf.appendChild(q); } });
      orden.forEach((o) => {
        const li = el("li"), sq = el("i"); sq.style.background = col[o.i]; li.append(el("b", null, cnt[o.i] ? cnt[o.i] + " €" : "<1 €"), sq, document.createTextNode(t.tipos[o.i])); ul.appendChild(li);
      });
      z.append(wf, ul); sec.appendChild(z); gr.appendChild(sec);
    }
    // lo que te cobraría cada banco (las tarifas que le sirven, calculadas con sus ventas)
    // todas las tarifas que le sirven (la cuenta normal, sin el margen de seguridad de la recomendación)
    let filasT = R.ranked || [];
    try { if (typeof calcular === "function" && ultimo.PLANS) { const R2 = calcular(ultimo.PLANS, Object.assign({}, I, { cons: 0 })); if (R2 && R2.ranked) filasT = R2.ranked; } } catch (e) { /* se queda con las de la recomendación */ }
    const otrasF = filasT.filter((r) => !r.es_actual && I.V > 0), otros = otrasF.map((r) => r.Cn / I.V * 100);
    const reco = yes && R.best ? otrasF.find((r) => r.p.id === R.best.p.id) : null;
    if (hoy != null && otros.length >= 3) {
      const todos = otros.concat([hoy]), lo = Math.min(...todos), hi = Math.max(...todos), pos = (x) => (hi > lo ? (x - lo) / (hi - lo) * 100 : 50);
      const sec = el("section", "dr-blq dr-t"); sec.append(el("h3", "dr-h", t.cada), el("p", "dr-q", t.cadaQ));
      const tira = el("div", "dr-tira"); tira.appendChild(el("span", "dr-eje"));
      const marca = reco ? reco.Cn / I.V * 100 : Math.min(...otros);
      otros.forEach((x) => { const d = el("i", Math.abs(x - marca) < 1e-9 ? "dr-min" : null); d.style.left = pos(x) + "%"; tira.appendChild(d); });
      const yo = el("span", "dr-yo", t.tu(n2(hoy))); yo.style.left = Math.min(88, Math.max(12, pos(hoy))) + "%"; tira.appendChild(yo);
      const lmin = el("span", "dr-lmin", n2(marca)); lmin.style.left = Math.min(90, Math.max(6, pos(marca))) + "%"; tira.appendChild(lmin);
      const lmax = el("span", "dr-lmax", n2(Math.max(...otros))); tira.appendChild(lmax);
      sec.append(tira, el("p", "dr-cuenta", t.cuenta(otros.filter((x) => x < hoy - 0.005).length, otros.filter((x) => x > hoy + 0.005).length)));
      gr.appendChild(sec);
    }
    // si sigues así (solo si paga de más)
    const de_mas = yes && R.best ? Math.max(0, R.best.ahorro_m) * 12 : 0;
    if (de_mas > 0) {
      let s = 0; for (let y = 1; y <= 5; y++) s += de_mas * Math.pow(1 + IPC, y);
      const sec = el("section", "dr-blq"); sec.append(el("h3", "dr-h", t.sigues), el("p", "dr-q", t.siguesQ));
      const p = el("p", "dr-sig"); p.append(el("span", "dr-big", n0(s)), el("span", "dr-k", t.en5)); sec.appendChild(p); gr.appendChild(sec);
    }
  }

  document.addEventListener("fh-datafono", (e) => { ultimo = e.detail; try { pintar(); } catch (err) { console.error("Feehund: resultado del datáfono", err); } });
  // al cambiar de idioma, app.js vuelve a pintar el resultado y lanza otra vez «fh-datafono»
})();
