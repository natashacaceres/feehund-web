/* Herramienta «Tus fechas» del artículo sobre el recibo del seguro. Todo se calcula en el navegador; no se envía ni se guarda nada. */
(function(){
"use strict";
var root = document.getElementById("sg"); if (!root) return;
var $ = function(id){ return document.getElementById(id); };
var tipo = "hogar";
function parseISO(s){ var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); if (!m) return null; var d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d) ? null : d; }
function addMonths(d, n){ var y = d.getFullYear(), m = d.getMonth() + n, day = d.getDate(); var last = new Date(y, m + 1, 0).getDate(); return new Date(y, m, Math.min(day, last)); }
function f2(n){ return String(n).padStart(2, "0"); }
function fd(d){ return f2(d.getDate()) + "/" + f2(d.getMonth() + 1) + "/" + d.getFullYear(); }
function num(s){ s = String(s || "").replace(/[\s€]/g, ""); if (!s) return null; if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", "."); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); var v = parseFloat(s); return isFinite(v) && v >= 0 ? v : null; }
function eur(v, dec){ var p = Math.abs(v).toFixed(dec).split("."); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, "."); return p.join(",") + " €"; }
function eurAuto(v){ return Math.abs(v - Math.round(v)) < 0.005 ? eur(v, 0) : eur(v, 2); }
function pct(v){ return v.toFixed(1).replace(".", ",") + " %"; }
function today(){ var t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
function line(id, txt){ var el = $(id); el.textContent = txt || ""; el.hidden = !txt; }

function calc(){
  var vida = tipo === "vida";
  $("sgVida").hidden = !vida;
  $("sgOut").hidden = vida;
  if (vida) return;
  var venc = parseISO($("sgVenc").value), carta = parseISO($("sgCarta").value);
  var antes = num($("sgAntes").value), nuevo = num($("sgNuevo").value);
  var hoy = today();
  if (venc) {
    var aviso = addMonths(venc, -2), no = addMonths(venc, -1), sin = addMonths(venc, 1);
    var t1 = "Te tenían que avisar antes del " + fd(aviso) + ".";
    if (carta) t1 += carta <= aviso ? " Te avisaron a tiempo." : " Te avisaron tarde. La ley pide dos meses. Puedes reclamar.";
    line("sgL1", t1);
    var dias = Math.round((no - hoy) / 864e5);
    if (dias >= 0) line("sgL2", "Tienes hasta el " + fd(no) + " para decir que no renuevas. " + (dias === 0 ? "Es hoy." : dias === 1 ? "Te queda 1 día." : "Te quedan " + dias + " días."));
    else line("sgL2", "Este año ya no llegas. Apunta el " + fd(addMonths(no, 12)) + " para el año que viene.");
    $("sgT1").textContent = fd(aviso); $("sgT2").textContent = fd(no); $("sgT3").textContent = fd(venc); $("sgT4").textContent = fd(sin);
    $("sgTl").hidden = false;
    $("sgTl").querySelectorAll("li").forEach(function(li, i){ var d = [aviso, no, venc, sin][i]; li.classList.toggle("is-past", d < hoy); });
  } else { line("sgL1", "Escribe la fecha de vencimiento para ver tus plazos."); line("sgL2", ""); $("sgTl").hidden = true; }
  if (antes && nuevo !== null) {
    var dif = nuevo - antes;
    if (Math.abs(dif) < 0.005) line("sgL3", "El precio no cambia.");
    else line("sgL3", (dif > 0 ? "Te sube " : "Te baja ") + eurAuto(Math.abs(dif)) + " al año, un " + pct(Math.abs(dif) / antes * 100) + ". Son " + eur(Math.abs(dif) / 12, 2) + " al mes.");
  } else line("sgL3", "");
}
root.querySelectorAll("[data-tipo]").forEach(function(b){
  b.addEventListener("click", function(){
    tipo = b.getAttribute("data-tipo");
    root.querySelectorAll("[data-tipo]").forEach(function(x){ x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
    calc();
  });
});
["sgVenc", "sgCarta", "sgAntes", "sgNuevo"].forEach(function(id){ $(id).addEventListener("input", calc); $(id).addEventListener("change", calc); });
$("sgEj").addEventListener("click", function(){
  tipo = "hogar";
  root.querySelectorAll("[data-tipo]").forEach(function(x){ x.setAttribute("aria-pressed", x.getAttribute("data-tipo") === "hogar" ? "true" : "false"); });
  $("sgVenc").value = "2027-01-01"; $("sgCarta").value = "2026-10-15"; $("sgAntes").value = "312"; $("sgNuevo").value = "361";
  calc();
});
calc();
})();
