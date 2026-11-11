/* «¿Cómo lo descargo de mi banco?»: buscador de bancos con los pasos comprobados de cada uno.
   Datos: /data/bancos-descarga.json (lo genera investigacion/descargas/herramientas/comprobar.py; solo pasos cuyos
   botones aparecen tal cual en la ayuda oficial del banco). Sin pasos comprobados, se remite a la guía general. */
(function () {
  "use strict";
  const caja = document.getElementById("xBk"); if (!caja) return;
  const L = ["es", "ca", "en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
  const TX = {
    es: { app: "En la app", web: "En la web", fmt: (f) => "Se descarga en " + f + ".", meses: (n) => n === 1 ? "Cada archivo es de un mes." : "Hasta " + n + " meses.", rev: (b, f) => "Comprobado el " + f + " con la ayuda oficial de " + b + ".", sin: (b) => "Todavía no tenemos comprobados los pasos de " + b + ".", otro: "Cambiar de banco", nada: "No lo tenemos todavía.", o: " o " },
    ca: { app: "A l'app", web: "Al web", fmt: (f) => "Es descarrega en " + f + ".", meses: (n) => n === 1 ? "Cada fitxer és d'un mes." : "Fins a " + n + " mesos.", rev: (b, f) => "Comprovat el " + f + " amb l'ajuda oficial de " + b + ".", sin: (b) => "Encara no tenim comprovats els passos de " + b + ".", otro: "Canviar de banc", nada: "Encara no el tenim.", o: " o " },
    en: { app: "In the app", web: "On the website", fmt: (f) => "Downloads as " + f + ".", meses: (n) => n === 1 ? "Each file covers one month." : "Up to " + n + " months.", rev: (b, f) => "Checked on " + f + " against " + b + "'s official help (steps in Spanish).", sin: (b) => "We have not checked the steps for " + b + " yet.", otro: "Change bank", nada: "Not available yet.", o: " or " },
  }[L];
  const general = document.getElementById("xBkGeneral"), etiqueta = caja.querySelector(".bk-l"), q = document.getElementById("xBkQ"), lista = document.getElementById("xBkLista"), pasos = document.getElementById("xBkPasos");
  const raiz = (document.currentScript && document.currentScript.dataset.root) || "../";
  const plano = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt !== undefined) x.textContent = txt; return x; };
  const fecha = (iso) => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "";
  let bancos = [];

  function pintarLista() {
    // si el buscador aún muestra el banco elegido, se enseña la lista entera para poder cambiarlo
    const t = q.dataset.elegido && q.value === q.dataset.elegido ? "" : plano(q.value.trim());
    lista.textContent = "";
    q.setAttribute("aria-expanded", "true");
    const vis = bancos.filter((b) => !t || plano(b.n + " " + b.id.replace(/_/g, " ")).indexOf(t) >= 0);
    for (const b of vis) {
      const li = el("li"), btn = el("button", "bk-b", b.n);
      btn.type = "button"; btn.setAttribute("role", "option");
      // mousedown: elige antes de que el buscador pierda el foco y cierre la lista
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => elegir(b));
      li.appendChild(btn); lista.appendChild(li);
    }
    if (!vis.length) lista.appendChild(el("li", "bk-nada", TX.nada + (general ? " " + general.textContent : "")));
    lista.hidden = false;
  }

  // buscador vacío (la X o borrar a mano): se olvida el banco elegido y se cierran sus pasos
  function vaciar() {
    if (q.value !== "" || q.hidden) return;
    delete q.dataset.elegido; pasos.hidden = true; pasos.textContent = "";
    try { localStorage.removeItem("feehund-banco"); } catch (e) {}
  }

  function cerrar() { if (!q.hidden) { lista.hidden = true; q.setAttribute("aria-expanded", "false"); } }

  function elegir(b) {
    try { localStorage.setItem("feehund-banco", b.id); } catch (e) {}
    pasos.textContent = "";
    pasos.appendChild(el("h3", "bk-h", b.n));
    let alguno = false;
    for (const canal of ["app", "web"]) {
      const c = b[canal]; if (!c) continue;
      alguno = true;
      pasos.appendChild(el("h4", "bk-c", TX[canal]));
      const ol = el("ol", "bk-ol");
      for (const p of c.pasos) ol.appendChild(el("li", "", p));
      pasos.appendChild(ol);
      const extra = [];
      if (c.formatos && c.formatos.length) extra.push(TX.fmt(c.formatos.join(TX.o)));
      if (c.meses) extra.push(TX.meses(c.meses));
      if (extra.length) pasos.appendChild(el("p", "bk-x", extra.join(" ")));
    }
    // Lo que el banco no permite o su límite importante (comprobado en su fuente oficial)
    if (b.nota) pasos.appendChild(el("p", "bk-nota", b.nota));
    if (alguno || b.nota) pasos.appendChild(el("p", "bk-rev", TX.rev(b.n, fecha(b.revisado))));
    else { pasos.appendChild(el("p", "bk-x", TX.sin(b.n))); if (general) pasos.appendChild(el("p", "bk-x", general.textContent)); }
    const otro = el("button", "bk-otro", TX.otro); otro.type = "button";
    otro.addEventListener("click", () => { q.value = ""; q.hidden = false; if (etiqueta) etiqueta.hidden = false; pasos.hidden = true; q.focus(); pintarLista(); });
    pasos.appendChild(otro);
    // el banco elegido se queda escrito en el buscador; el botón «Elegir extracto» sigue justo debajo y los pasos, después
    q.value = b.n; q.dataset.elegido = b.n;
    lista.hidden = true; q.setAttribute("aria-expanded", "false"); pasos.hidden = false;
  }

  fetch(raiz + "data/bancos-descarga.json", { cache: "no-cache" }).then((r) => r.ok ? r.json() : []).then((d) => {
    bancos = d || []; if (!bancos.length) { caja.hidden = true; return; }
    q.setAttribute("role", "combobox"); q.setAttribute("aria-controls", "xBkLista"); q.setAttribute("aria-expanded", "false");
    lista.setAttribute("role", "listbox");
    q.addEventListener("input", () => { vaciar(); pintarLista(); });
    q.addEventListener("search", vaciar);
    q.addEventListener("focus", () => { if (q.dataset.elegido && q.value === q.dataset.elegido) q.select(); pintarLista(); });
    q.addEventListener("click", pintarLista);
    q.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); if (e.key === "Enter") { e.preventDefault(); const p = lista.querySelector(".bk-b"); if (p) p.click(); } });
    q.addEventListener("blur", () => setTimeout(cerrar, 150));
    let guardado = null; try { guardado = localStorage.getItem("feehund-banco"); } catch (e) {}
    const b = bancos.find((x) => x.id === guardado);
    if (b) elegir(b); else cerrar();
  }).catch(() => { caja.hidden = true; });
})();
