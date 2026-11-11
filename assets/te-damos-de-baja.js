/* «Te damos de baja»: solo interfaz. La lógica, los pagos y los envíos los programa el taller en los puntos marcados con data-api="…".
   Datos de ejemplo para maquetar (EMP). Vista previa: ?empresa=basic-fit|vodafone|privilegios-en-compras|edreams-prime · ?paso=1-4 · ?error=codigo|pago
   Estado: ?estado=programada|enviada|entregada|devuelta · ?recobro=1 · ?quedan=2. Nada se guarda en el navegador. */
(function(){
"use strict";
const LANG = ["es","ca","en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
const LOC = { es: "es-ES", ca: "ca-ES", en: "en-GB" }[LANG];
const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const main = document.querySelector("main.tb"); if (!main) return;

/* ---------- datos de ejemplo (el taller los sustituye por data-api="empresa") */
const EMP = {
  "basic-fit": { n: "Basic-Fit", baja: "certificada", aviso: "permanencia", fin: "2027-01-15", envio: "2027-01-02", dni: true },
  "vodafone": { n: "Vodafone", baja: "certificada", aviso: "preaviso", dias: 2, dni: true },
  "privilegios-en-compras": { n: "Privilegios en Compras", baja: "certificada", aviso: null, dni: false },
  "edreams-prime": { n: "eDreams Prime", baja: "online", aviso: null, dni: false }
};
const slug = Q.get("empresa") || main.dataset.empresa || "basic-fit";
const E = EMP[slug] || { n: Q.get("nombre") || slug, baja: "certificada", aviso: null, dni: false };
main.dataset.empresa = slug; main.dataset.baja = E.baja; main.dataset.aviso = E.aviso || ""; main.dataset.pideDni = String(!!E.dni);

const fd = (iso, hora) => { const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : "")); if (isNaN(d)) return iso;
  const s = d.toLocaleDateString(LOC, { day: "numeric", month: "long", year: "numeric" });
  return hora ? s + ", " + d.toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit" }) : s; };
const fill = (k, v) => document.querySelectorAll('[data-t="' + k + '"]').forEach(el => { el.textContent = v; });
fill("empresa", E.n);
if (E.envio) fill("fecha-envio", fd(E.envio));
if (E.dias) fill("dias", String(E.dias));

const T = {
  es: { de: (a, b) => a + " de " + b, pay: m => m ? "Pagar y programar" : "Pagar y enviar", prog: f => "Programada para el " + f, env: f => "Enviada el " + f,
        ef: { ya: "lo antes posible", fin: f => "el " + f, ren: "antes de la próxima renovación" }, reenv: "Código reenviado.",
        carta: (d, emp, ef, hoy) => [d.nombre || "[Nombre y apellidos]", d.correo || "[Correo]", d.cliente ? "N.º de cliente o teléfono: " + d.cliente : "", d.dni ? "DNI: " + d.dni : "", "", "A la atención de " + emp, "", "Asunto: Baja del contrato", "", "Solicito la baja de mi contrato con " + emp + " con efecto " + ef + ".", "", "Pido que no se me hagan más cargos a partir de esa fecha y que me confirméis la baja por escrito.", "", hoy, d.nombre || "[Nombre y apellidos]", "Firmado con código de verificación."] },
  ca: { de: (a, b) => a + " de " + b, pay: m => m ? "Pagar i programar" : "Pagar i enviar", prog: f => "Programada per al " + f, env: f => "Enviada el " + f,
        ef: { ya: "tan aviat com sigui possible", fin: f => "el " + f, ren: "abans de la propera renovació" }, reenv: "Codi reenviat.",
        carta: (d, emp, ef, hoy) => [d.nombre || "[Nom i cognoms]", d.correo || "[Correu]", d.cliente ? "Núm. de client o telèfon: " + d.cliente : "", d.dni ? "DNI: " + d.dni : "", "", "A l'atenció de " + emp, "", "Assumpte: Baixa del contracte", "", "Sol·licito la baixa del meu contracte amb " + emp + " amb efecte " + ef + ".", "", "Demano que no se'm facin més càrrecs a partir d'aquesta data i que em confirmeu la baixa per escrit.", "", hoy, d.nombre || "[Nom i cognoms]", "Signat amb codi de verificació."] },
  en: { de: (a, b) => a + " of " + b, pay: m => m ? "Pay and schedule" : "Pay and send", prog: f => "Scheduled for " + f, env: f => "Sent on " + f,
        ef: { ya: "as soon as possible", fin: f => "on " + f, ren: "before the next renewal" }, reenv: "Code sent again.",
        carta: (d, emp, ef, hoy) => [d.nombre || "[Full name]", d.correo || "[Email]", d.cliente ? "Customer number or phone: " + d.cliente : "", d.dni ? "DNI: " + d.dni : "", "", "For the attention of " + emp, "", "Subject: Contract cancellation", "", "I hereby request the cancellation of my contract with " + emp + ", effective " + ef + ".", "", "Please make no further charges from that date and confirm the cancellation in writing.", "", hoy, d.nombre || "[Full name]", "Signed with a verification code."] }
}[LANG];

/* ============ FLUJO ============ */
if (main.dataset.vista === "flujo") {
  const pasos = [...document.querySelectorAll(".tb-paso[data-paso]")];
  const no = $("tbNo"), back = $("tbBack"), cnt = $("tbCnt"), bar = $("tbBar");
  let paso = 1;
  const pack = Q.get("pack") === "3" ? "3" : "1";

  if (E.baja === "online") {
    pasos.forEach(p => { p.hidden = true; }); no.hidden = false;
    document.querySelectorAll(".tb-prog").forEach(el => { el.hidden = true; });
    return;
  }
  const show = n => {
    paso = n; pasos.forEach(p => { p.hidden = Number(p.dataset.paso) !== n; });
    cnt.textContent = cnt.dataset.fmt.replace("{n}", n);
    bar.setAttribute("aria-valuenow", n); bar.firstElementChild.style.width = (n * 25) + "%";
    const h = pasos[n - 1].querySelector("h2"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
    if (n === 2) carta(); if (n === 3) fill("correo", $("tbCorreo").value.trim() || "—"); if (n === 4) payLabel();
  };
  back.addEventListener("click", () => { if (paso > 1) show(paso - 1); else if (history.length > 1) history.back(); else location.href = back.dataset.salida; });
  const err = (id, on) => { const e = $(id); if (e) e.hidden = !on; return on; };

  /* Paso 1 · Cuándo */
  const avP = $("tbAvPerm"), avA = $("tbAvPre"), pen = $("tbPen"), fecha = $("tbFecha");
  avP.hidden = E.aviso !== "permanencia"; avA.hidden = E.aviso !== "preaviso";
  if (E.fin) fecha.value = E.fin;
  const cuando = () => (document.querySelector('input[name="cuando"]:checked') || {}).value || "";
  const sync1 = () => { const c = cuando(); $("tbFechaBox").hidden = c !== "fin"; pen.hidden = !(c === "ya" && E.aviso === "permanencia" && pen.dataset.abierto === "1"); };
  document.querySelectorAll('input[name="cuando"]').forEach(r => r.addEventListener("change", () => { if (r.value === "ya" && E.aviso === "permanencia") pen.dataset.abierto = "1"; sync1(); err("tbE1", false); }));
  $("tbProgramar").addEventListener("click", () => { document.querySelector('input[name="cuando"][value="fin"]').checked = true; fecha.value = E.envio || E.fin || ""; main.dataset.programada = E.envio || ""; sync1(); show(2); });
  $("tbYa").addEventListener("click", () => { document.querySelector('input[name="cuando"][value="ya"]').checked = true; pen.dataset.abierto = "1"; sync1(); $("tbPenChk").focus(); });
  $("tbN1").addEventListener("click", () => {
    const c = cuando();
    if (err("tbE1", !c)) return;
    if (err("tbE1f", c === "fin" && !fecha.value)) return;
    if (c === "ya" && E.aviso === "permanencia") { pen.dataset.abierto = "1"; sync1(); if (err("tbE1p", !$("tbPenChk").checked)) return; }
    show(2);
  });
  $("tbPenChk").addEventListener("change", () => err("tbE1p", false));

  /* Paso 2 · Tus datos */
  $("tbDniBox").hidden = !E.dni;
  let editada = false;
  const datos = () => ({ nombre: $("tbNombre").value.trim(), correo: $("tbCorreo").value.trim(), cliente: $("tbCliente").value.trim(), dni: E.dni ? $("tbDni").value.trim() : "" });
  const efecto = () => { const c = cuando(); return c === "fin" && fecha.value ? T.ef.fin(fd(fecha.value)) : c === "ren" ? T.ef.ren : T.ef.ya; };
  const carta = () => { if (editada) return; $("tbCartaTxt").textContent = T.carta(datos(), E.n, efecto(), fd(new Date().toISOString().slice(0, 10))).filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"); };
  ["tbNombre", "tbCorreo", "tbCliente", "tbDni"].forEach(id => $(id).addEventListener("input", () => { carta(); $(id).removeAttribute("aria-invalid"); err(id + "E", false); }));
  $("tbEditar").addEventListener("click", () => {
    const ta = $("tbCartaEd"), pre = $("tbCartaTxt"), b = $("tbEditar"), ed = ta.hidden;
    if (ed) { ta.value = pre.textContent; ta.hidden = false; pre.hidden = true; b.textContent = b.dataset.listo; ta.focus(); }
    else { pre.textContent = ta.value; ta.hidden = true; pre.hidden = false; b.textContent = b.dataset.editar; editada = true; }
  });
  $("tbN2").addEventListener("click", () => {
    const d = datos(), bad = [];
    if (!d.nombre) bad.push("tbNombre");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo)) bad.push("tbCorreo");
    if (E.dni && !/^[0-9XYZxyz]\d{7}[A-Za-z]$/.test(d.dni.replace(/[\s-]/g, ""))) bad.push("tbDni");
    ["tbNombre", "tbCorreo", "tbDni"].forEach(id => { const b = bad.indexOf(id) >= 0; err(id + "E", b); if (b) $(id).setAttribute("aria-invalid", "true"); else $(id).removeAttribute("aria-invalid"); });
    if (bad.length) { $(bad[0]).focus(); return; }
    if (!$("tbCartaEd").hidden) $("tbEditar").click();
    show(3);
  });

  /* Paso 3 · Firma */
  const otp = [...document.querySelectorAll("#tbOtp input")], otpBox = $("tbOtp");
  otp.forEach((inp, i) => {
    inp.addEventListener("input", () => { inp.value = inp.value.replace(/\D/g, "").slice(-1); otpBox.removeAttribute("aria-invalid"); err("tbE3c", false); if (inp.value && otp[i + 1]) otp[i + 1].focus(); });
    inp.addEventListener("keydown", e => { if (e.key === "Backspace" && !inp.value && otp[i - 1]) otp[i - 1].focus(); });
    inp.addEventListener("paste", e => { const t = ((e.clipboardData || window.clipboardData).getData("text") || "").replace(/\D/g, "").slice(0, 6); if (!t) return; e.preventDefault(); otp.forEach((o, k) => { o.value = t[k] || ""; }); (otp[Math.min(t.length, 5)]).focus(); });
  });
  $("tbReenviar").addEventListener("click", () => { const m = $("tbReenvMsg"); m.textContent = T.reenv; m.hidden = false; });
  $("tbAut").addEventListener("change", () => err("tbE3a", false));
  $("tbN3").addEventListener("click", () => {
    const code = otp.map(o => o.value).join("");
    const malo = code.length < 6 || Q.get("error") === "codigo" || code === "000000";
    if (err("tbE3c", malo)) { otpBox.setAttribute("aria-invalid", "true"); otp[0].focus(); return; }
    if (err("tbE3a", !$("tbAut").checked)) { $("tbAut").focus(); return; }
    show(4);
  });

  /* Paso 4 · Pago */
  document.querySelector('input[name="pack"][value="' + pack + '"]').checked = true;
  const payLabel = () => { const p = (document.querySelector('input[name="pack"]:checked') || {}).value === "3" ? "9,99 €" : "4,99 €";
    const prog = cuando() === "fin" || cuando() === "ren";
    $("tbPay").textContent = T.pay(prog) + " · " + p; $("tbPay").dataset.modo = prog ? "programar" : "enviar"; };
  document.querySelectorAll('input[name="pack"]').forEach(r => r.addEventListener("change", payLabel));
  $("tbDes").addEventListener("change", () => err("tbE4d", false));
  $("tbPay").addEventListener("click", () => {
    err("tbE4p", false);
    if (err("tbE4d", !$("tbDes").checked)) { $("tbDes").focus(); return; }
    if (Q.get("error") === "pago") { err("tbE4p", true); $("tbE4p").focus(); return; }
    const prog = $("tbPay").dataset.modo === "programar";
    location.href = $("tbPay").dataset.estado + "?empresa=" + encodeURIComponent(slug) + "&estado=" + (prog ? "programada" : "enviada") + "&fecha=" + encodeURIComponent(prog && fecha.value ? fecha.value : "") + ((document.querySelector('input[name="pack"]:checked') || {}).value === "3" ? "&quedan=2" : "");
  });

  sync1();
  const p0 = Math.min(4, Math.max(1, parseInt(Q.get("paso"), 10) || 1));
  if (p0 > 1 && E.aviso === "permanencia") document.querySelector('input[name="cuando"][value="fin"]').checked = true;
  if (Q.get("error") === "codigo" && p0 === 3) { otp.forEach(o => { o.value = "4"; }); }
  show(p0); if (p0 === 1) window.scrollTo(0, 0);
}

/* ============ ESTADO ============ */
if (main.dataset.vista === "estado") {
  const st = ["programada", "enviada", "entregada", "devuelta"].indexOf(Q.get("estado")) >= 0 ? Q.get("estado") : "enviada";
  document.querySelectorAll(".tb-est").forEach(el => { el.hidden = el.dataset.estado !== st; });
  const f = Q.get("fecha") || E.envio || "2027-01-02";
  fill("fecha-prog", fd(f));
  fill("fecha-env", fd(new Date().toISOString().slice(0, 16), true));
  fill("fecha-ent", fd(new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10)));
  $("tbRecobro").hidden = Q.get("recobro") !== "1";
  const q = parseInt(Q.get("quedan"), 10);
  $("tbPackQ").hidden = !(q > 0); if (q > 0) fill("quedan", String(q));
}
})();
