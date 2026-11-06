/* Páginas «Dar de baja». El contenido viene de /data/bajas.json (también escrito en el HTML).
   Si se edita el JSON, la página se actualiza al cargar. Nada se envía ni se guarda. */
(function(){
"use strict";
const ROOT = (document.currentScript && document.currentScript.dataset.root) || "../../";
const LANG = ["es","ca","en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
const $ = id => document.getElementById(id);
/* Modelo de baja: pendiente de revisión legal. */
const MODELO = {
  es: s => "Asunto: Baja de " + s + "\n\nHola:\n\nSolicito la baja de mi suscripción a " + s + " asociada a [CORREO O N.º DE CLIENTE], con efecto al final del periodo ya pagado.\n\nPido confirmación por escrito.\n\n[NOMBRE] · [FECHA]",
  ca: s => "Assumpte: Baixa de " + s + "\n\nHola:\n\nSol·licito la baixa de la meva subscripció a " + s + " associada a [CORREU O NÚM. DE CLIENT], amb efecte al final del període ja pagat.\n\nDemano confirmació per escrit.\n\n[NOM] · [DATA]",
  en: s => "Subject: Cancellation of " + s + "\n\nHello,\n\nI request the cancellation of my " + s + " subscription linked to [EMAIL OR CUSTOMER NUMBER], effective at the end of the period already paid.\n\nPlease confirm in writing.\n\n[NAME] · [DATE]"
}[LANG];
const OK = { es: "Copiado. Pégalo en un correo o en el chat del servicio.", ca: "Copiat. Enganxa'l en un correu o al xat del servei.", en: "Copied. Paste it into an email or the service's chat." }[LANG];
const KO = { es: "No se ha podido copiar. Selecciona el texto y cópialo.", ca: "No s'ha pogut copiar. Selecciona el text i copia'l.", en: "It could not be copied. Select the text and copy it." }[LANG];
const PER = { es: { mes: "/mes", "año": "/año" }, ca: { mes: "/mes", "año": "/any" }, en: { mes: "/month", "año": "/year" } }[LANG];
const btn = $("bCopy");
if (btn) btn.addEventListener("click", async () => {
  const s = btn.dataset.servicio || "", t = MODELO(s), m = $("bMsg");
  let ok = false;
  try { await navigator.clipboard.writeText(t); ok = true; } catch(_) {
    try { const ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); ta.remove(); } catch(_) {}
  }
  m.textContent = ok ? OK : KO; m.hidden = false;
  if (!ok) { const pre = $("bModelo"); if (pre) { pre.textContent = t; pre.hidden = false; } }
});
const slug = document.body.dataset.baja; if (!slug) return;
fetch(ROOT + "data/bajas.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).then(d => {
  const s = d && Array.isArray(d.servicios) && d.servicios.find(x => x.slug === slug); if (!s) return;
  const pasos = s.pasos && s.pasos[LANG];
  if (Array.isArray(pasos) && pasos.length) $("bPasos").querySelectorAll("li").forEach((li, i) => { const p = li.querySelector("p"); if (p && pasos[i] != null) p.textContent = pasos[i]; });
  const tag = $("bTag"); if (tag) tag.hidden = s.sinLlamar !== true;
  if (Array.isArray(s.precios) && $("bPrecios")) {
    const dl = $("bPrecios"); dl.textContent = "";
    s.precios.forEach(p => { const w = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd");
      dt.textContent = typeof p.plan === "object" ? (p.plan[LANG] || p.plan.es) : p.plan; dd.textContent = p.precio + (PER[p.periodo] && !/VERIFICAR/.test(p.precio) ? PER[p.periodo] : ""); w.append(dt, dd); dl.appendChild(w); });
  }
  if ($("bRev")) $("bRev").textContent = s.revisado || "";
  const f = $("bFuente"); if (f && s.fuente) { f.textContent = s.fuente.nombre || ""; if (s.fuente.url) f.href = s.fuente.url; else f.removeAttribute("href"); }
}).catch(() => {});
})();
