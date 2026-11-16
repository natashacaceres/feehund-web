/* «Te damos de baja»: páginas /baja/enviar/ y /baja/estado/ (y ca/en). Habla con /api/baja/… (functions/_baja/LEEME.md).
   La carta que se ve aquí sale del mismo módulo que la que se envía (te-damos-de-baja/carta.js).
   Nada se guarda en el navegador: el enlace de estado (?p=…) llega también por correo. */
import { carta, calcularEnvio, validarDatos, fechaLarga, hoyEspana, total, euros, DATO, datoObligatorio, MAX_BAJAS } from "./te-damos-de-baja/carta.js";

const LANG = ["es", "ca", "en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const main = document.querySelector("main.tb");
const API = "/api/baja/";
const GUIA = { es: "/baja/", ca: "/ca/baixa/", en: "/en/cancel/" }[LANG];
const ENVIAR = { es: "/baja/enviar/", ca: "/ca/baixa/enviar/", en: "/en/cancel/send/" }[LANG];
const EXTRACTO = { es: "/extracto/", ca: "/ca/extracte/", en: "/en/statement/" }[LANG];

const T = {
  es: {
    aviso: (a) => a.habiles ? `${a.habiles} días hábiles` : a.meses ? (a.meses === 1 ? "un mes" : `${a.meses} meses`) : a.dias === 1 ? "24 horas" : `${a.dias} días`,
    calc: (f, e) => `La enviamos el ${f}, con el aviso que pide ${e}. Te avisamos ese día.`, calcHoy: "La enviamos en las 24 horas siguientes al pago.",
    fecha: { fin: "Fecha de fin de la permanencia", ren: "Fecha de la próxima renovación o vencimiento" },
    lejos: "Elige una fecha de los próximos 18 meses.", pasada: "Elige una fecha a partir de mañana.",
    idiomaCarta: { es: "La carta va en castellano, el idioma de la empresa.", ca: "La carta va en catalán, el idioma de la empresa.", en: "La carta va en inglés, el idioma de la empresa." },
    sms: (e) => `${e} te mandará un SMS para confirmar la baja: ábrelo y confírmala.`,
    formulario: (e) => `${e} tiene su propio formulario. Enviamos tu carta con todos los datos que pide; si aun así te lo piden, te escribirán a ti.`,
    dniCopia: (e) => `${e} suele pedir copia del DNI. No hace falta ahora: si te la pide, se la envías tú.`,
    opcional: "(opcional)", pay: (p, x) => `${p ? "Pagar y programar" : "Pagar y enviar"} · ${x}`, usar: (p) => p ? "Programar mi baja" : "Enviar mi baja",
    pack: (n, x) => n === 1 ? `1 baja · ${x}` : `${n} bajas · ${x}`, packNota: (x) => `La segunda y las siguientes, ${x} cada una. Las que no uses te las devolvemos.`,
    reenv: "Código reenviado.", sinCodigos: "Ya te hemos enviado varios códigos. Revisa el correo no deseado o empieza de nuevo.",
    caducado: "El código ha caducado. Pide otro.", intentos: "Demasiados intentos. Vuelve a empezar.",
    servicio: "Ahora mismo no podemos hacerlo. Prueba en unos minutos.", limite: "Has hecho muchos intentos hoy. Prueba mañana.",
    perdido: "Esta página ya no está disponible o el enlace no es correcto. A los 90 días del envío solo guardamos la prueba de tu baja: si necesitas el justificante, escríbenos a hola@feehund.com.",
    prog: (f) => f, quedan: (n) => n === 1 ? "Te queda 1 baja pagada" : `Te quedan ${n} bajas pagadas`,
    devuelto: (x) => `Te devolvemos ${x}. Tarda de 5 a 10 días en verse en tu tarjeta.`, borrado: "Hemos borrado tus datos.",
    borrarProg: "Cancelar el envío", guardamos: (f) => `Guardamos tu carta, el justificante y el pago 6 años, como prueba de tu baja. Lo demás lo borramos ${f ? "el " + f : "90 días después del envío"}.`, cancelada: "Envío cancelado.",
    nadaRecobro: (e) => `No vemos cobros de ${e} después de la baja en ese extracto.`, recobroVisto: (f, x) => `Vemos un cobro de ${x} el ${f}.`,
    leyendo: "Leyendo tu extracto en tu dispositivo…", noLeido: "No hemos podido leer ese archivo. Escríbelo a mano.",
    confirmarBorrar: "¿Seguro? No se puede deshacer.",
  },
  ca: {
    aviso: (a) => a.habiles ? `${a.habiles} dies hàbils` : a.meses ? (a.meses === 1 ? "un mes" : `${a.meses} mesos`) : a.dias === 1 ? "24 hores" : `${a.dias} dies`,
    calc: (f, e) => `L'enviem el ${f}, amb l'avís que demana ${e}. T'avisem aquell dia.`, calcHoy: "L'enviem en les 24 hores següents al pagament.",
    fecha: { fin: "Data de fi de la permanència", ren: "Data de la propera renovació o venciment" },
    lejos: "Tria una data dels propers 18 mesos.", pasada: "Tria una data a partir de demà.",
    idiomaCarta: { es: "La carta va en castellà, l'idioma de l'empresa.", ca: "La carta va en català, l'idioma de l'empresa.", en: "La carta va en anglès, l'idioma de l'empresa." },
    sms: (e) => `${e} t'enviarà un SMS per confirmar la baixa: obre'l i confirma-la.`,
    formulario: (e) => `${e} té el seu propi formulari. Enviem la teva carta amb totes les dades que demana; si tot i així te'l demanen, t'escriuran a tu.`,
    dniCopia: (e) => `${e} sol demanar còpia del DNI. Ara no cal: si te la demana, l'hi envies tu.`,
    opcional: "(opcional)", pay: (p, x) => `${p ? "Pagar i programar" : "Pagar i enviar"} · ${x}`, usar: (p) => p ? "Programar la meva baixa" : "Enviar la meva baixa",
    pack: (n, x) => n === 1 ? `1 baixa · ${x}` : `${n} baixes · ${x}`, packNota: (x) => `La segona i les següents, ${x} cadascuna. Les que no facis servir te les retornem.`,
    reenv: "Codi reenviat.", sinCodigos: "Ja t'hem enviat diversos codis. Revisa el correu brossa o torna a començar.",
    caducado: "El codi ha caducat. Demana'n un altre.", intentos: "Massa intents. Torna a començar.",
    servicio: "Ara mateix no ho podem fer. Prova-ho d'aquí a uns minuts.", limite: "Avui has fet molts intents. Prova-ho demà.",
    perdido: "Aquesta pàgina ja no està disponible o l'enllaç no és correcte. Als 90 dies de l'enviament només guardem la prova de la teva baixa: si necessites el justificant, escriu-nos a hola@feehund.com.",
    prog: (f) => f, quedan: (n) => n === 1 ? "Et queda 1 baixa pagada" : `Et queden ${n} baixes pagades`,
    devuelto: (x) => `Et retornem ${x}. Triga de 5 a 10 dies a veure's a la targeta.`, borrado: "Hem esborrat les teves dades.",
    borrarProg: "Cancel·lar l'enviament", guardamos: (f) => `Guardem la teva carta, el justificant i el pagament 6 anys, com a prova de la teva baixa. La resta l'esborrem ${f ? "el " + f : "90 dies després de l'enviament"}.`, cancelada: "Enviament cancel·lat.",
    nadaRecobro: (e) => `No veiem cobraments de ${e} després de la baixa en aquest extracte.`, recobroVisto: (f, x) => `Veiem un cobrament de ${x} el ${f}.`,
    leyendo: "Llegint el teu extracte al teu dispositiu…", noLeido: "No hem pogut llegir aquest fitxer. Escriu-ho a mà.",
    confirmarBorrar: "Segur? No es pot desfer.",
  },
  en: {
    aviso: (a) => a.habiles ? `${a.habiles} working days'` : a.meses ? (a.meses === 1 ? "one month's" : `${a.meses} months'`) : a.dias === 1 ? "24 hours'" : `${a.dias} days'`,
    calc: (f, e) => `We send it on ${f}, with the notice ${e} asks for. We will let you know that day.`, calcHoy: "We send it within 24 hours of payment.",
    fecha: { fin: "Minimum term end date", ren: "Next renewal or expiry date" },
    lejos: "Choose a date within the next 18 months.", pasada: "Choose a date from tomorrow on.",
    idiomaCarta: { es: "The letter is in Spanish, the company's language.", ca: "The letter is in Catalan, the company's language.", en: "The letter is in English, the company's language." },
    sms: (e) => `${e} will text you to confirm the cancellation: open it and confirm.`,
    formulario: (e) => `${e} has its own form. We send your letter with everything it asks for; if they still ask for the form, they will write to you.`,
    dniCopia: (e) => `${e} often asks for a copy of your ID. You do not need it now: if they ask, you send it yourself.`,
    opcional: "(optional)", pay: (p, x) => `${p ? "Pay and schedule" : "Pay and send"} · ${x}`, usar: (p) => p ? "Schedule my cancellation" : "Send my cancellation",
    pack: (n, x) => n === 1 ? `1 cancellation · ${x}` : `${n} cancellations · ${x}`, packNota: (x) => `The second and the rest, ${x} each. We refund the ones you do not use.`,
    reenv: "Code sent again.", sinCodigos: "We have already sent you several codes. Check your spam folder or start again.",
    caducado: "The code has expired. Ask for a new one.", intentos: "Too many attempts. Start again.",
    servicio: "We cannot do it right now. Try again in a few minutes.", limite: "You have tried many times today. Try tomorrow.",
    perdido: "This page is no longer available or the link is wrong. 90 days after sending we only keep the proof of your cancellation: if you need the proof of sending, email us at hola@feehund.com.",
    prog: (f) => f, quedan: (n) => n === 1 ? "You have 1 paid cancellation left" : `You have ${n} paid cancellations left`,
    devuelto: (x) => `We are refunding ${x}. It takes 5 to 10 days to show on your card.`, borrado: "We have deleted your details.",
    borrarProg: "Cancel sending", guardamos: (f) => `We keep your letter, the proof of sending and the payment for 6 years, as proof of your cancellation. We delete the rest ${f ? "on " + f : "90 days after sending"}.`, cancelada: "Sending cancelled.",
    nadaRecobro: (e) => `We see no ${e} charges after the cancellation in that statement.`, recobroVisto: (f, x) => `We see a charge of ${x} on ${f}.`,
    leyendo: "Reading your statement on your device…", noLeido: "We could not read that file. Type it in instead.",
    confirmarBorrar: "Are you sure? It cannot be undone.",
  },
}[LANG];

const fd = (iso) => fechaLarga(iso, LANG);
const fill = (k, v) => document.querySelectorAll('[data-t="' + k + '"]').forEach((el) => { el.textContent = v; });
const err = (id, on, texto) => { const e = $(id); if (!e) return on; if (texto) e.textContent = texto; e.hidden = !on; return on; };
async function api(ruta, cuerpo) {
  const r = await fetch(API + ruta, cuerpo ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) } : {});
  const j = await r.json().catch(() => ({ error: "servicio" }));
  if (!r.ok) throw Object.assign(new Error(j.error || "servicio"), { codigo: j.error || "servicio", estado: r.status });
  return j;
}
const espera = (btn, on) => { if (!btn) return; btn.disabled = on; btn.setAttribute("aria-busy", on ? "true" : "false"); };

/* ============ FLUJO (/baja/enviar/) ============ */
async function flujo() {
  const slug = (Q.get("empresa") || "").toLowerCase().replace(/_/g, "-");
  const pasos = [...document.querySelectorAll(".tb-paso[data-paso]")];
  const back = $("tbBack"), cnt = $("tbCnt"), bar = $("tbBar");
  const guia = GUIA + (slug ? slug + "/" : "");
  ["tbGuia", "tbGuia2"].forEach((id) => { if ($(id)) $(id).href = guia; });
  const solo = (id) => { pasos.forEach((p) => { p.hidden = true; }); ["tbCarga", "tbNo", "tbOff"].forEach((x) => { if ($(x)) $(x).hidden = x !== id; }); document.querySelectorAll(".tb-prog").forEach((el) => { el.hidden = Boolean(id); }); };

  let E;
  try { E = await api("empresa?id=" + encodeURIComponent(slug)); } catch (e) { fill("empresa", Q.get("nombre") || ""); solo("tbNo"); return; }
  fill("empresa", E.nombre);
  if (!E.activo) { solo("tbOff"); return; }
  solo(null); $("tbCarga").hidden = true;

  let paso = 1, token = Q.get("p") || null, lote = Q.get("compra") || null, firmada = false, editado = false;
  const show = (n) => {
    paso = n; pasos.forEach((p) => { p.hidden = Number(p.dataset.paso) !== n; });
    cnt.textContent = cnt.dataset.fmt.replace("{n}", n);
    bar.setAttribute("aria-valuenow", n); bar.firstElementChild.style.width = (n * 25) + "%";
    const h = pasos[n - 1].querySelector("h2"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
    if (n === 2) pintarCarta(); if (n === 3) fill("correo", $("tbCorreo").value.trim() || "—"); if (n === 4) payLabel();
  };
  back.addEventListener("click", () => { if (paso > 1 && !(paso === 4 && firmada)) show(paso === 4 ? 2 : paso - 1); else if (history.length > 1) history.back(); else location.href = back.dataset.salida; });

  /* Paso 1 · Cuándo */
  const fecha = $("tbFecha"), hoy = E.hoy || hoyEspana();
  fecha.min = hoy;
  document.querySelectorAll('input[name="cuando"]').forEach((r) => { r.closest(".tb-op").hidden = E.opciones.indexOf(r.value) < 0; });
  if (E.opciones.length === 1) document.querySelector('input[name="cuando"][value="' + E.opciones[0] + '"]').checked = true;
  $("tbAvPre").hidden = !E.aviso || !Object.keys(E.aviso).length; fill("aviso", E.aviso ? T.aviso(E.aviso) : "");
  const cuando = () => (document.querySelector('input[name="cuando"]:checked') || {}).value || "";
  const eleccion = () => ({ cuando: cuando(), fecha: fecha.value || undefined });
  const sync1 = () => {
    const c = cuando(), conFecha = c === "fin" || c === "ren";
    $("tbFechaBox").hidden = !conFecha;
    document.querySelectorAll("#tbFechaBox [data-para]").forEach((el) => { el.hidden = el.dataset.para !== c; });
    $("tbAvPerm").hidden = !(c === "ya" && E.permanencia); $("tbPen").hidden = $("tbAvPerm").hidden;
    const r = c ? calcularEnvio(E, eleccion(), hoy) : null;
    $("tbCalc").hidden = !(r && r.ok); $("tbTarde").hidden = !(r && r.ok && r.tarde);
    if (r && r.ok) $("tbCalc").textContent = r.programada ? T.calc(fd(r.envio), E.nombre) : T.calcHoy;
    return r;
  };
  document.querySelectorAll('input[name="cuando"]').forEach((r) => r.addEventListener("change", () => { sync1(); err("tbE1", false); }));
  fecha.addEventListener("input", () => { sync1(); err("tbE1f", false); });
  $("tbPenChk").addEventListener("change", () => err("tbE1p", false));
  $("tbN1").addEventListener("click", () => {
    const c = cuando();
    if (err("tbE1", !c)) return;
    const r = sync1();
    if (!r.ok) { err("tbE1f", true, r.error === "lejos" ? T.lejos : fecha.value ? T.pasada : null); fecha.focus(); return; }
    if (c === "ya" && E.permanencia && err("tbE1p", !$("tbPenChk").checked)) { $("tbPenChk").focus(); return; }
    show(2);
  });

  /* Paso 2 · Tus datos */
  $("tbDatoL").textContent = DATO[LANG][E.dato] + " "; $("tbDatoOpc").textContent = datoObligatorio(E) ? "" : T.opcional;
  if (E.dato === "tarjeta4") { $("tbDato").inputMode = "numeric"; $("tbDato").maxLength = 4; }
  $("tbDniBox").hidden = E.dni === "no"; $("tbDniCopia").hidden = E.dni !== "copia";
  if (E.dni === "copia") $("tbDniCopia").textContent = T.dniCopia(E.nombre);
  const extra = E.aviso_extra ? T[E.aviso_extra](E.nombre) : ""; $("tbExtra").hidden = !extra; if (extra) $("tbExtra").querySelector("span").textContent = extra;
  $("tbCartaIdioma").hidden = E.idioma === LANG; $("tbCartaIdioma").textContent = T.idiomaCarta[E.idioma] || "";
  const datos = () => ({ nombre: $("tbNombre").value, correo: $("tbCorreo").value, dato: $("tbDato").value, dni: $("tbDni").value });
  function pintarCarta() {
    const v = validarDatos(E, datos());
    const c = carta(E, { datos: { ...v.datos, nombre: v.datos.nombre, dni: v.datos.dni || $("tbDni").value.trim() }, eleccion: eleccion(), fecha: hoy });
    $("tbCartaTxt").textContent = c.cuerpo.join("\n");
  }
  const CAMPOS = { nombre: "tbNombre", correo: "tbCorreo", dni: "tbDni", dato: "tbDato" };
  Object.values(CAMPOS).forEach((id) => $(id).addEventListener("input", () => { pintarCarta(); $(id).removeAttribute("aria-invalid"); err(id + "E", false); editado = true; }));
  const marcar = (malos) => { Object.entries(CAMPOS).forEach(([k, id]) => { const b = malos.indexOf(k) >= 0; err(id + "E", b); if (b) $(id).setAttribute("aria-invalid", "true"); else $(id).removeAttribute("aria-invalid"); }); };
  $("tbN2").addEventListener("click", async () => {
    err("tbE2", false);
    const v = validarDatos(E, datos());
    marcar(v.errores);
    if (!v.ok) { $(CAMPOS[v.errores[0]]).focus(); return; }
    if (token && !editado) { show(3); return; } // vuelve atrás sin cambiar nada: mismo código
    espera($("tbN2"), true);
    try {
      const r = await api("pedido", { empresa: slug, idioma: LANG, eleccion: eleccion(), datos: v.datos, compra: lote || undefined });
      token = r.p; editado = false; show(3);
    } catch (e) {
      if (e.codigo.indexOf("datos:") === 0) { const m = e.codigo.slice(6).split(","); marcar(m); $(CAMPOS[m[0]] || "tbNombre").focus(); }
      else err("tbE2", true, T[e.codigo] || T.servicio);
    } finally { espera($("tbN2"), false); }
  });

  /* Paso 3 · Firma */
  const otp = [...document.querySelectorAll("#tbOtp input")], otpBox = $("tbOtp");
  otp.forEach((inp, i) => {
    inp.addEventListener("input", () => { inp.value = inp.value.replace(/\D/g, "").slice(-1); otpBox.removeAttribute("aria-invalid"); err("tbE3c", false); if (inp.value && otp[i + 1]) otp[i + 1].focus(); });
    inp.addEventListener("keydown", (e) => { if (e.key === "Backspace" && !inp.value && otp[i - 1]) otp[i - 1].focus(); });
    inp.addEventListener("paste", (e) => { const t = ((e.clipboardData || window.clipboardData).getData("text") || "").replace(/\D/g, "").slice(0, 6); if (!t) return; e.preventDefault(); otp.forEach((o, k) => { o.value = t[k] || ""; }); otp[Math.min(t.length, 5)].focus(); });
  });
  $("tbReenviar").addEventListener("click", async () => {
    const m = $("tbReenvMsg"); m.hidden = true;
    try { await api("firma/reenviar", { p: token }); m.textContent = T.reenv; } catch (e) { m.textContent = e.codigo === "codigos" ? T.sinCodigos : T.servicio; }
    m.hidden = false;
  });
  const firma = lienzo($("tbFirma"));
  $("tbFirmaBorrar").addEventListener("click", () => firma.borrar());
  $("tbAut").addEventListener("change", () => err("tbE3a", false));
  $("tbN3").addEventListener("click", async () => {
    const code = otp.map((o) => o.value).join("");
    if (err("tbE3c", code.length < 6)) { otpBox.setAttribute("aria-invalid", "true"); otp[0].focus(); return; }
    if (err("tbE3a", !$("tbAut").checked)) { $("tbAut").focus(); return; }
    espera($("tbN3"), true);
    try { await api("firma", { p: token, codigo: code, autorizo: true, firma: firma.jpeg() }); firmada = true; show(4); }
    catch (e) {
      if (e.codigo === "codigo") { err("tbE3c", true); otpBox.setAttribute("aria-invalid", "true"); otp.forEach((o) => { o.value = ""; }); otp[0].focus(); }
      else err("tbE3x", true, T[e.codigo] || T.servicio);
    } finally { espera($("tbN3"), false); }
  });

  /* Paso 4 · Pago */
  const packs = $("tbPacks");
  packs.innerHTML = "";
  for (let n = 1; n <= Math.min(3, MAX_BAJAS); n++) {
    const l = document.createElement("label"); l.className = "tb-op";
    l.innerHTML = '<input type="radio" name="pack"><span class="tb-op-t"><strong></strong></span>';
    l.querySelector("input").value = String(n); l.querySelector("input").checked = n === 1; l.querySelector("strong").textContent = T.pack(n, euros(total(n, E.precio), LANG));
    packs.appendChild(l);
  }
  $("tbPackNota").textContent = T.packNota(euros(E.precio.extra, LANG));
  if (lote) { packs.hidden = true; $("tbPackNota").hidden = true; $("tbLote").hidden = false; }
  const unidades = () => Number((document.querySelector('input[name="pack"]:checked') || {}).value || 1);
  const payLabel = () => { const r = calcularEnvio(E, eleccion(), hoy), prog = Boolean(r.ok && r.programada); $("tbPay").textContent = lote ? T.usar(prog) : T.pay(prog, euros(total(unidades(), E.precio), LANG)); };
  packs.addEventListener("change", payLabel);
  $("tbDes").addEventListener("change", () => err("tbE4d", false));
  $("tbPay").addEventListener("click", async () => {
    err("tbE4p", false);
    if (err("tbE4d", !$("tbDes").checked)) { $("tbDes").focus(); return; }
    espera($("tbPay"), true);
    try { const r = await api("pago", { p: token, unidades: unidades(), renuncia: true }); location.href = r.url; }
    catch (e) { err("tbE4p", true); $("tbE4p").focus(); espera($("tbPay"), false); }
  });

  sync1();
  // Vuelve de Stripe sin pagar: la carta ya está firmada, se queda en el pago
  if (token && Q.get("pago") === "no") { firmada = true; show(4); err("tbE4p", true); return; }
  show(1);
}

// Firma dibujada (opcional): ratón, dedo o lápiz. jpeg() → null si no se ha dibujado nada.
function lienzo(c) {
  const g = c.getContext("2d"); let tocado = false, abajo = false, ult = null;
  const limpio = () => { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.strokeStyle = "#13212b"; g.lineWidth = 3.2; g.lineCap = g.lineJoin = "round"; };
  limpio();
  const pos = (e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)]; };
  c.addEventListener("pointerdown", (e) => { abajo = true; ult = pos(e); c.setPointerCapture(e.pointerId); e.preventDefault(); });
  c.addEventListener("pointermove", (e) => { if (!abajo) return; const p = pos(e); g.beginPath(); g.moveTo(ult[0], ult[1]); g.lineTo(p[0], p[1]); g.stroke(); ult = p; tocado = true; });
  ["pointerup", "pointercancel"].forEach((t) => c.addEventListener(t, () => { abajo = false; }));
  return { borrar: () => { tocado = false; limpio(); }, jpeg: () => (tocado ? c.toDataURL("image/jpeg", 0.85) : null) };
}

/* ============ ESTADO (/baja/estado/) ============ */
async function estado() {
  const p = Q.get("p");
  const ver = (st) => document.querySelectorAll(".tb-est").forEach((el) => { el.hidden = el.dataset.estado !== st; });
  if (!p) { $("tbPerdido").querySelector("p").textContent = T.perdido; ver("error"); return; }
  let S;
  for (let i = 0; i < 8; i++) { // al volver de Stripe el pago puede tardar unos segundos en confirmarse
    try { S = await api("estado?p=" + encodeURIComponent(p)); } catch (e) { $("tbPerdido").querySelector("p").textContent = e.estado === 404 ? T.perdido : T.servicio; ver("error"); return; }
    if (S.estado !== "pago" && S.estado !== "firmada") break;
    ver("pago"); await new Promise((r) => setTimeout(r, 2500));
  }
  fill("empresa", S.nombre);
  ver(S.estado === "borrador" || S.estado === "firmada" ? "pago" : S.estado);
  fill("fecha-prog", fd(S.envio));
  if (S.enviadaEn) fill("fecha-env", fd(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date(S.enviadaEn))));
  fill("correo", S.correo);
  document.querySelectorAll('[data-api="certificado-pdf"]').forEach((a) => { a.href = API + "certificado.pdf?p=" + encodeURIComponent(p); a.hidden = !S.certificado; });
  document.querySelectorAll('[data-api="carta-pdf"]').forEach((a) => { a.href = API + "carta.pdf?p=" + encodeURIComponent(p); });
  $("tbTarde").hidden = !S.tarde;

  // Lote: las bajas que quedan
  if (S.lote && S.lote.quedan > 0) {
    $("tbLoteBox").hidden = false; $("tbLoteH").textContent = T.quedan(S.lote.quedan);
    const sel = $("tbLoteEmp");
    api("empresas").then((l) => { l.sort((a, b) => a.nombre.localeCompare(b.nombre)).forEach((e) => { const o = document.createElement("option"); o.value = e.slug; o.textContent = e.nombre; sel.appendChild(o); }); });
    $("tbLoteUsar").addEventListener("click", () => { if (sel.value) location.href = ENVIAR + "?empresa=" + encodeURIComponent(sel.value) + "&compra=" + encodeURIComponent(S.lote.compra); });
    $("tbLoteDev").addEventListener("click", async () => {
      if (!confirm(T.confirmarBorrar)) return;
      try { const r = await api("lote/devolver", { compra: S.lote.compra }); $("tbLoteMsg").textContent = T.devuelto(euros(r.devuelto, LANG)); $("tbLoteUsar").hidden = $("tbLoteDev").hidden = sel.hidden = true; }
      catch { $("tbLoteMsg").textContent = T.servicio; }
      $("tbLoteMsg").hidden = false;
    });
  }

  // Segunda carta: el extracto se lee en el dispositivo (mismo motor que Mi banco) y no sale de él
  $("tbRecBox").hidden = !(S.recobro || S.recobroHecho);
  if (S.recobroHecho) { $("tbRecOk").hidden = false; $("tbRecElegir").hidden = $("tbRecMano").hidden = true; }
  const desde = S.efecto && S.efecto.fecha && S.efecto.cuando === "fin" ? S.efecto.fecha : S.envio;
  $("tbRecFecha").min = S.envio; $("tbRecFecha").max = hoyEspana();
  const abrir = (f, x) => { $("tbRecobro").hidden = false; if (f) $("tbRecFecha").value = f; if (x) $("tbRecImp").value = String(x).replace(".", LANG === "en" ? "." : ","); $("tbRecVisto").hidden = !f; if (f) $("tbRecVisto").textContent = T.recobroVisto(fd(f), euros(Math.round(x * 100), LANG)); };
  $("tbRecMano").addEventListener("click", () => abrir());
  $("tbRecArchivo").addEventListener("change", async (ev) => {
    const files = ev.target.files; if (!files.length) return;
    const m = $("tbRecNada"); m.hidden = false; m.textContent = T.leyendo;
    try {
      const { analizar } = await import("/assets/extracto/motor.js");
      const r = await analizar(files, { idioma: LANG });
      const id = S.empresa.replace(/-/g, "_");
      const series = [].concat(r.cobros || [], r.terminados || [], r.gastos_fijos || []).filter((c) => c.comercio_id === id && c.ultimo_cargo > desde);
      if (!series.length) { m.textContent = T.nadaRecobro(S.nombre); return; }
      const c = series.sort((a, b) => (a.ultimo_cargo < b.ultimo_cargo ? 1 : -1))[0];
      m.hidden = true; abrir(c.ultimo_cargo, Math.abs(c.importe));
    } catch { m.textContent = T.noLeido; }
  });
  $("tbRecEnviar").addEventListener("click", async () => {
    err("tbRecE", false);
    const f = $("tbRecFecha").value, x = $("tbRecImp").value.replace(/\s|€/g, "").replace(",", ".");
    if (err("tbRecE", !f || !(Number(x) > 0))) return;
    espera($("tbRecEnviar"), true);
    try { await api("recobro", { p, fecha: f, importe: Number(x) }); $("tbRecobro").hidden = true; $("tbRecElegir").hidden = $("tbRecMano").hidden = true; $("tbRecOk").hidden = false; }
    catch (e) { err("tbRecE", true, e.codigo === "recobro_usado" ? null : T.servicio); }
    finally { espera($("tbRecEnviar"), false); }
  });

  // Tus datos
  const b = $("tbBorrar");
  b.textContent = T.borrarProg; b.hidden = S.estado !== "programada"; // solo se puede cancelar antes de que salga
  $("tbBorrarNota").textContent = T.guardamos(S.borrarEl ? fd(S.borrarEl) : null);
  b.addEventListener("click", async () => {
    if (!confirm(T.confirmarBorrar)) return;
    try { const r = await api("cancelar", { p }); $("tbBorrarNota").textContent = T.cancelada + (r.devuelto ? " " + T.devuelto(euros(r.devuelto, LANG)) : ""); b.hidden = true; document.querySelectorAll(".tb-est, #tbRecBox, #tbLoteBox").forEach((el) => { el.hidden = true; }); }
    catch { $("tbBorrarNota").textContent = T.servicio; }
  });
}

/* ============ GRACIAS (después de pagar) ============ */
// Solo confirma si hay un pago válido; si no, lleva a la lista de bajas. Igual con el envío a mano y con el automático.
async function gracias() {
  const p = Q.get("p"), fuera = () => location.replace(GUIA);
  if (!p) return fuera();
  let S = null;
  for (let i = 0; i < 8; i++) { // el aviso de Stripe puede tardar unos segundos
    try { S = await api("estado?p=" + encodeURIComponent(p)); } catch { return fuera(); }
    if (S.estado !== "pago") break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!S || ["en_marcha", "programada", "hecha"].indexOf(S.estado) < 0) return fuera();
  fill("empresa", S.nombre); fill("correo", S.correo); fill("fecha-prog", fd(S.envio));
  document.querySelectorAll("[data-cuando]").forEach((el) => { el.hidden = el.dataset.cuando !== (S.estado === "programada" ? "prog" : "hoy"); });
  if (S.lote && S.lote.quedan > 0) { $("grLote").hidden = false; fill("quedan", T.quedan(S.lote.quedan)); }
  $("grEstado").href = { es: "/baja/estado/", ca: "/ca/baixa/estat/", en: "/en/cancel/status/" }[LANG] + "?p=" + encodeURIComponent(p);
  $("grCarga").hidden = true; $("grOk").hidden = false;
  $("grH").setAttribute("tabindex", "-1"); $("grH").focus({ preventScroll: true });
}

if (main && main.dataset.vista === "flujo") flujo();
if (main && main.dataset.vista === "estado") estado();
if (main && main.dataset.vista === "gracias") gracias();
