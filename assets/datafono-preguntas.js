// Mi datáfono: el camino corto. Después de las cifras (leídas del resumen o escritas a mano) salen solo 3 preguntas en la
// ventana de Feehund, como en Mi banco: con quién cobras, qué negocio tienes y si te queda permanencia. Lo demás se da por
// hecho (1 datáfono, vendes igual todo el año, autónomo, recuperas el IVA, el importe se teclea) y la calculadora de
// siempre (assets/app.js) hace las cuentas: aquí solo se pulsan sus botones, como lo haría la persona. Si algo falla, se
// enseña la calculadora entera, como antes.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const LANG = ["es", "ca", "en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
  const ROOT = (document.currentScript && document.currentScript.dataset.root) || "../";
  const TX = {
    es: { titulo: "1 minuto y queda perfecto", de: (a, b) => a + " de " + b, nose: "No lo sé", prov: "¿Con quién cobras?", plan: "¿Qué plan tienes?", otro: "¿Cuál?",
      sector: "¿Qué negocio tienes?", perm: "¿Te queda permanencia?", cuando: "¿Cuándo acaba?", pen: "Lo que te cobran por salir antes, si lo sabes", seguir: "Seguir",
      mano: "Escríbelo a mano", manoQ: "Lo que pone tu resumen del mes", vendido: "Lo que cobraste con tarjeta", cobros: "Cuántos cobros", pagado: "Lo que te cobró el banco",
      falta: "Escribe lo que cobraste con tarjeta y cuántos cobros.", volver: "Volver" },
    ca: { titulo: "1 minut i queda perfecte", de: (a, b) => a + " de " + b, nose: "No ho sé", prov: "Amb qui cobres?", plan: "Quin pla tens?", otro: "Quin?",
      sector: "Quin negoci tens?", perm: "Et queda permanència?", cuando: "Quan s'acaba?", pen: "El que et cobren per sortir abans, si ho saps", seguir: "Continuar",
      mano: "Escriu-ho a mà", manoQ: "El que posa el teu resum del mes", vendido: "El que vas cobrar amb targeta", cobros: "Quants cobraments", pagado: "El que et va cobrar el banc",
      falta: "Escriu el que vas cobrar amb targeta i quants cobraments.", volver: "Tornar" },
    en: { titulo: "1 minute and it's perfect", de: (a, b) => a + " of " + b, nose: "I don't know", prov: "Who do you use?", plan: "Which plan do you have?", otro: "Which one?",
      sector: "What kind of business do you have?", perm: "Are you still tied in?", cuando: "When does it end?", pen: "What they charge you to leave early, if you know", seguir: "Continue",
      mano: "Type it in", manoQ: "What your monthly summary says", vendido: "What you took by card", cobros: "How many payments", pagado: "What the bank charged you",
      falta: "Type what you took by card and how many payments.", volver: "Back" },
  }[LANG];
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const pulsado = (sel) => document.querySelector(sel + ' .chip[aria-pressed="true"]');
  const pulsar = (sel, v) => { const b = document.querySelector(sel + ' .chip[data-v="' + v + '"]'); if (b) b.click(); return !!b; };
  const grupo = (name) => '#calc [data-name="' + name + '"]';

  // ---------- la ventana (igual que la de Mi banco)
  let caja = null;
  function ventana() {
    if (caja) caja.remove();
    caja = el("div", "dp"); caja.setAttribute("role", "dialog"); caja.setAttribute("aria-modal", "true");
    const c = el("div", "dp-c");
    const t = el("div", "dp-t"); const cara = el("img"); cara.src = ROOT + "assets/img/feehund-perro-olfatea.webp"; cara.alt = ""; cara.width = 44; cara.height = 44;
    t.append(cara, el("p", null, TX.titulo));
    c.append(t, el("div", "dp-bar"), el("p", "dp-n"), el("div", "dp-cuerpo"));
    c.querySelector(".dp-bar").appendChild(el("i"));
    caja.appendChild(c); document.body.appendChild(caja);
    return c;
  }
  let antes = 0; // 1 cuando se viene de «Escríbelo a mano»: ese fue el paso 1
  function paso(n, total, pregunta) {
    n += antes; total += antes;
    const c = caja.querySelector(".dp-c");
    c.querySelector(".dp-bar i").style.width = Math.round(n / total * 100) + "%";
    c.querySelector(".dp-n").textContent = TX.de(n, total);
    const cuerpo = c.querySelector(".dp-cuerpo"); cuerpo.textContent = "";
    cuerpo.appendChild(el("h2", "dp-q", pregunta));
    return cuerpo;
  }
  function opciones(cuerpo, lista, alElegir) {
    const ops = el("div", "dp-ops");
    // las etiquetas de los botones de la calculadora llevan los 3 idiomas en <span data-l>: se copian tal cual (el CSS enseña el de la página)
    lista.forEach(([lab, v, html]) => { const b = el("button"); if (html) b.innerHTML = html; else b.textContent = lab; b.type = "button"; b.addEventListener("click", () => alElegir(v)); ops.appendChild(b); });
    cuerpo.appendChild(ops); return ops;
  }
  const deChips = (sel) => [...document.querySelectorAll(sel + " .chip")].map((b) => [b.textContent.trim(), b.dataset.v, b.innerHTML]);

  // ---------- las 3 preguntas
  async function empezar(ejemplo) {
    const up = $("dUp"); if (up) up.hidden = true;
    const rev = $("dRev"); if (rev) rev.hidden = true;
    // el ejemplo es una cafetería sin permanencia: sin preguntas, directo al resultado
    if (ejemplo) {
      const ch = pulsado("#pProvChips");
      if (!ch || (ch.dataset.v === "OTRO" && !$("pProv").value)) pulsar("#pProvChips", "CONTRATO");
      if (!$("pPlanChips").hidden && !pulsado("#pPlanChips")) { const b = document.querySelector("#pPlanChips .chip"); if (b) b.click(); }
      pulsar("#pSectorChips", "Bar o restaurante"); pulsar(grupo("pPermS"), "No");
      await porDefecto();
      const ok = await conducir();
      const l = $("dLoad"); if (l) l.hidden = true; // «Leyendo…» se queda hasta que el resultado está listo
      const d = $("dCalc"); if (d) d.hidden = false;
      if (!ok) calculadora(); else scrollTo(0, 0);
      return;
    }
    ventana();
    const preguntas = [];
    // con quién cobras: solo si el resumen no lo ha dicho ya (o falta elegir el plan)
    const ch = pulsado("#pProvChips");
    if (!ch || (ch.dataset.v === "OTRO" && !$("pProv").value)) preguntas.push(preguntaProv);
    else if (!$("pPlanChips").hidden && !pulsado("#pPlanChips")) preguntas.push((n, total) => new Promise((fin) => plan(n, total, fin)));
    preguntas.push(preguntaSector, preguntaPerm);
    for (let i = 0; i < preguntas.length; i++) { const ok = await preguntas[i](i + 1, preguntas.length); if (ok === false) { cerrar(); return calculadora(); } }
    await porDefecto();
    const hecho = await conducir();
    cerrar();
    const d = $("dCalc"); if (d) d.hidden = false;
    if (!hecho) calculadora();
  }
  function preguntaProv(n, total) {
    return new Promise((fin) => {
      const cuerpo = paso(n, total, TX.prov);
      const lista = deChips("#pProvChips").filter(([, v]) => v !== "CONTRATO");
      opciones(cuerpo, lista, (v) => {
        pulsar("#pProvChips", v);
        if (v === "OTRO") return otro(n, total, fin);
        if (!$("pPlanChips").hidden) return plan(n, total, fin);
        fin(true);
      });
      const no = el("button", "dp-nose", TX.nose); no.type = "button";
      no.addEventListener("click", () => { pulsar("#pProvChips", "CONTRATO"); fin(true); });
      cuerpo.appendChild(no);
    });
  }
  function plan(n, total, fin) {
    const cuerpo = paso(n, total, TX.plan);
    opciones(cuerpo, deChips("#pPlanChips"), (v) => { pulsar("#pPlanChips", v); fin(true); });
  }
  function otro(n, total, fin) {
    const cuerpo = paso(n, total, TX.otro), sel = $("pProv");
    const lista = [...sel.querySelectorAll("option")].filter((o) => o.value && o.value !== "CONTRATO").map((o) => [o.textContent, o.value]);
    opciones(cuerpo, lista, (v) => { sel.value = v; sel.dispatchEvent(new Event("change", { bubbles: true })); fin(true); }).classList.add("dp-lista");
  }
  function preguntaSector(n, total) {
    return new Promise((fin) => {
      const cuerpo = paso(n, total, TX.sector);
      opciones(cuerpo, deChips("#pSectorChips"), (v) => { pulsar("#pSectorChips", v); fin(true); });
    });
  }
  function preguntaPerm(n, total) {
    return new Promise((fin) => {
      const cuerpo = paso(n, total, TX.perm);
      opciones(cuerpo, deChips(grupo("pPermS")), (v) => {
        pulsar(grupo("pPermS"), v);
        if (v !== "Sí") return fin(true);
        // ¿cuándo acaba? (mes y año, como en la calculadora) y, si lo sabe, lo que cuesta salir antes
        const c2 = paso(n, total, TX.cuando), fila = el("div", "dp-fila");
        const copia = (id) => { const o = $(id), s = o.cloneNode(true); s.id = "dp-" + id; s.value = o.value; s.addEventListener("change", () => { o.value = s.value; o.dispatchEvent(new Event("change", { bubbles: true })); }); return s; };
        fila.append(copia("pPermM"), copia("pPermY")); c2.appendChild(fila);
        const lab = el("label", "dp-lab", TX.pen), pen = el("input"); pen.type = "text"; pen.inputMode = "decimal"; pen.placeholder = "0"; pen.id = "dpPen"; lab.htmlFor = "dpPen";
        const fp = el("div", "dp-campo"); fp.append(lab, pen); c2.appendChild(fp);
        const ok = el("button", "dp-ok", TX.seguir); ok.type = "button";
        ok.addEventListener("click", () => {
          if (!$("pPermM").value || !$("pPermY").value) { fila.querySelector("select").focus(); return; }
          const p = $("pPen"); p.value = pen.value.trim() || "0"; p.dispatchEvent(new Event("input", { bubbles: true }));
          fin(true);
        });
        c2.appendChild(ok);
      });
    });
  }
  // lo que ya no se pregunta: lo más común
  async function porDefecto() {
    const poner = (name, v) => { if (!pulsado(grupo(name))) pulsar(grupo(name), v); };
    const s = ["pPart", "pEmp", "pNoe", "pAmex", "pBiz"].map((id) => $(id).value.trim());
    if (s[0] && s.slice(1).every((x) => !x || x === "0" || x === "0,00")) poner("pMix", "No");
    poner("pNd", "1"); poner("pEst", "Igual"); poner("pForma", "Autónomo"); poner("pIva", "Sí"); poner("pLock", "No");
    await tick();
  }
  // pasa por los pasos de la calculadora pulsando «Siguiente» hasta el resultado
  async function conducir() {
    for (let k = 0; k < 16; k++) {
      if (!$("res").hidden) return true;
      const st = [...document.querySelectorAll("#calc > .q")].find((s) => !s.hidden);
      if (!st) return false;
      // un botón oculto dentro del paso no vale (la calculadora entera sigue oculta mientras tanto, eso sí vale)
      const bs = [...st.querySelectorAll("[data-pnext]")].filter((x) => !x.disabled);
      const b = bs.find((x) => { const h = x.closest("[hidden]"); return !(h && st.contains(h)); }) || bs[0]; // el último paso solo tiene el de «Ver resultado»
      if (!b) return false;
      b.click(); await tick();
    }
    return !$("res").hidden;
  }
  function cerrar() { if (caja) { caja.remove(); caja = null; } }
  function calculadora() {
    const d = $("dCalc"); if (d) d.hidden = false;
    const q = [...document.querySelectorAll("#calc > .q")].find((s) => !s.hidden), h = q && q.querySelector("h2");
    if (h) h.focus({ preventScroll: true }); scrollTo(0, 0);
  }

  // ---------- escribirlo a mano: tres cifras, con el mismo aspecto que «Revisa tus cifras»
  function aMano() {
    const up = $("dUp"); if (up) up.hidden = true;
    let sec = $("dMano");
    if (!sec) {
      sec = el("section", "ext-s dl-rev dp-mano"); sec.id = "dMano";
      const h = el("h2", null, TX.mano); h.tabIndex = -1;
      // la misma barrita que las preguntas que vienen después: esto es el paso 1 de 4
      const barra = el("div", "dp-bar dp-mano-bar"), relleno = el("i"); relleno.style.width = "25%"; barra.appendChild(relleno);
      sec.append(barra, el("p", "dp-n dp-mano-n", TX.de(1, 4)), h, el("p", "dl-per", TX.manoQ));
      const f = el("form", "dl-form"); f.noValidate = true;
      const campos = el("div", "dl-campos");
      [["dmV", TX.vendido, "€"], ["dmN", TX.cobros, ""], ["dmP", TX.pagado, "€"]].forEach(([id, lab, u]) => {
        const c = el("div", "campo"); c.dataset.estado = "vacio";
        const tx = el("div", "campo-txt"), l = el("label", null, lab); l.htmlFor = id; tx.appendChild(l);
        const inp = el("div", "campo-in"), i = el("input"); i.id = id; i.type = "text"; i.inputMode = u ? "decimal" : "numeric"; i.autocomplete = "off";
        inp.append(i, el("span", null, u)); c.append(tx, inp); campos.appendChild(c);
      });
      const err = el("p", "ext-err"); err.hidden = true; err.setAttribute("role", "alert");
      const bar = el("div", "dl-bar"), ok = el("button", "btn btn--gold", TX.seguir); ok.type = "submit";
      const vuelta = el("a", "link-alt dl-again", TX.volver); vuelta.href = "#dUp";
      vuelta.addEventListener("click", (e) => { e.preventDefault(); sec.hidden = true; if (up) up.hidden = false; scrollTo(0, 0); });
      bar.append(ok, vuelta); f.append(campos, err, bar); sec.appendChild(f);
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        const num = (s) => { s = String(s || "").trim().replace(/\s|€/g, ""); if (!s) return null; if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); else s = s.replace(",", "."); return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null; };
        const v = num($("dmV").value), n = num($("dmN").value), p = num($("dmP").value);
        if (!(v > 0) || !(n > 0)) { err.textContent = TX.falta; err.hidden = false; return; }
        const fmt = (x, d) => (LANG === "en" ? x.toFixed(d) : x.toFixed(d).replace(".", ","));
        const escribe = (id, x) => { const i = $(id); i.value = x; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); };
        escribe("pPart", fmt(v, 2)); ["pEmp", "pNoe", "pAmex", "pBiz"].forEach((id) => escribe(id, ""));
        escribe("pOps", String(Math.round(n)));
        if (p > 0) escribe("pPaid", fmt(p, 2)); else { const no = document.querySelector("#calc [data-paid-no]"); if (no) no.click(); }
        sec.hidden = true; antes = 1; empezar().finally(() => { antes = 0; });
      });
      const lector = $("dLector"), rev = $("dRev");
      (rev && rev.parentNode ? rev.parentNode : lector).insertBefore(sec, rev || null);
    }
    sec.hidden = false; scrollTo(0, 0);
    const i = $("dmV"); if (i) i.focus({ preventScroll: true });
  }

  window.FeehundPreguntas = { empezar: (ej) => empezar(ej).catch(() => { cerrar(); calculadora(); }), aMano };
})();
