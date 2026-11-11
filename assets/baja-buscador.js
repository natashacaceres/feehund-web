/* Buscador de /baja/: filtra la lista de empresas mientras escribes. Sin red ni almacenamiento. */
(function () {
  "use strict";
  var q = document.getElementById("bjQ"), grupos = document.getElementById("bjGrupos"), nada = document.getElementById("bjNada");
  if (!q || !grupos) return;
  var plano = function (t) { return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); };
  q.addEventListener("input", function () {
    var t = plano(q.value), hay = 0;
    grupos.querySelectorAll(".bj-grupo").forEach(function (g) {
      var vistos = 0;
      g.querySelectorAll("li").forEach(function (li) { var ok = t ? li.dataset.q.indexOf(t) >= 0 : !li.hasAttribute("data-solo-busqueda"); li.hidden = !ok; if (ok) vistos++; });
      g.hidden = !vistos; hay += vistos;
    });
    nada.hidden = hay > 0;
  });
})();
