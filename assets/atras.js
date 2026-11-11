/* Flecha «Volver» de la cabecera (todas las páginas menos la portada).
   - En Mi banco: si se ve el resultado, vuelve a la pantalla de subir el extracto.
   - En Mi datáfono: si no se ve la pantalla de subir, vuelve a ella.
   - En el resto: vuelve a la página anterior de Feehund; si se llegó de fuera, sube un nivel. */
(function () {
  "use strict";
  var b = document.querySelector("[data-atras]"); if (!b) return;
  var p = location.pathname.replace(/index\.html$/, "");
  if (p === "/" || p === "/ca/" || p === "/en/") return;
  var L = document.documentElement.lang;
  b.setAttribute("aria-label", { ca: "Tornar", en: "Back" }[L] || "Volver");
  b.title = b.getAttribute("aria-label");
  b.hidden = false;
  var visible = function (id) { var e = document.getElementById(id); return Boolean(e && !e.hidden); };
  b.addEventListener("click", function () {
    var otra = document.getElementById("xAgain");
    if (otra && (visible("xRes") || visible("xLoad"))) { otra.click(); scrollTo(0, 0); return; }
    if (document.getElementById("dUp") && !visible("dUp")) { location.href = location.pathname; return; }
    var deAqui = false;
    try { deAqui = Boolean(document.referrer) && new URL(document.referrer).origin === location.origin; } catch (e) {}
    if (deAqui && history.length > 1) { history.back(); return; }
    var partes = p.replace(/\/$/, "").split("/"); partes.pop();
    location.href = (partes.join("/") || "") + "/";
  });
})();
