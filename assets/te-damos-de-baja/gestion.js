/* /baja/gestion/?g=… — página del equipo para enviar a mano una baja (fase 1). Solo se llega desde el correo urgente.
   Muestra lo que hay que poner en Lleida.net, descarga la carta y el DNI, y al subir el certificado en PDF manda a la
   persona su justificante (el mismo correo que en el envío automático). */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const g = new URLSearchParams(location.search).get("g");
  const API = "/api/baja/";
  const q = (r) => API + r + "?g=" + encodeURIComponent(g);
  const msg = (t, ok) => { const m = $("geMsg"); m.textContent = t; m.className = ok ? "tb-ok" : "tb-err"; m.hidden = false; };
  async function post(ruta, cuerpo) {
    const r = await fetch(API + ruta, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ g, ...cuerpo }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "error"); return j;
  }
  const ESTADOS = { pagada: "Pagada: hay que enviarla hoy", programada: "Programada", enviada: "Enviada, sin justificante", entregada: "Hecha: la persona ya tiene el justificante", devuelta: "No entregada: dinero devuelto" };

  async function cargar() {
    if (!g) { $("geCarga").textContent = "Falta el enlace del correo urgente."; return; }
    let d;
    try { const r = await fetch(q("gestion")); d = await r.json(); if (!r.ok) throw new Error(d.error); }
    catch { $("geCarga").textContent = "Este enlace no vale o la baja ya se ha borrado."; return; }
    $("geCarga").hidden = true; $("geOk").hidden = false;
    $("geTit").textContent = "Baja de " + d.empresa + " · " + d.ref;
    $("geEstado").textContent = ESTADOS[d.estado] || d.estado;
    $("gePara").textContent = d.para; $("geAsunto").textContent = d.asunto; $("geTexto").textContent = d.texto;
    $("geEnvio").textContent = d.envio;
    $("gePersona").textContent = [d.persona.nombre, d.persona.correo, d.persona.dni, d.persona.dato].filter(Boolean).join(" · ");
    $("geCarta").href = q("gestion/carta.pdf");
    $("geDni").hidden = !d.dni; $("geDni").href = q("gestion/dni.jpg");
    $("geRec").hidden = !d.recobro; $("geRec").href = q("gestion/recobro.pdf");
    const abierta = ["pagada", "programada", "enviada"].indexOf(d.estado) >= 0;
    $("geAcciones").hidden = !abierta;
    document.querySelectorAll("[data-copiar]").forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText($(b.dataset.copiar).textContent); b.textContent = "Copiado"; setTimeout(() => { b.textContent = "Copiar"; }, 1500); } catch { /* sin portapapeles */ }
    }));
  }

  $("geHecho").addEventListener("click", async () => {
    const f = $("geCert").files[0];
    if (!f || f.type !== "application/pdf") { msg("Sube el certificado de Lleida.net en PDF.", false); return; }
    const datos = await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(f); });
    $("geHecho").disabled = true;
    try { await post("gestion/hecho", { certificado: datos }); msg("Hecho. La persona ya tiene su justificante.", true); $("geAcciones").hidden = true; $("geEstado").textContent = ESTADOS.entregada; }
    catch (e) { msg(e.message === "certificado" ? "Ese archivo no parece un PDF." : "No se ha podido guardar. Prueba otra vez.", false); }
    finally { $("geHecho").disabled = false; }
  });
  $("geDevolver").addEventListener("click", async () => {
    if (!confirm("¿Seguro? Se le devuelve el dinero a la persona y se le avisa.")) return;
    try { await post("gestion/devolver", {}); msg("Devuelto y avisada la persona.", true); $("geAcciones").hidden = true; $("geEstado").textContent = ESTADOS.devuelta; }
    catch { msg("No se ha podido devolver. Prueba otra vez.", false); }
  });
  cargar();
})();
