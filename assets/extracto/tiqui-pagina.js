// Tu Tiqui, la página de quien paga (/tiqui/chat/): a la izquierda sus extractos (banco, meses y un calendario con lo que
// falta) y el botón para sumar otro; a la derecha el chat (assets/extracto/tiqui.js lo monta en #tqcPagina).
// Sumar un extracto: se vuelve a leer todo junto en el dispositivo (lo de antes, desde la caja, más lo nuevo) y el motor
// quita lo repetido. Después se guarda cifrado con el código, como siempre. Nada sale de aquí sin cifrar.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  if (!$("tqcPagina")) return;
  const LANG = ["es", "ca", "en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
  const ROOT = (document.currentScript && document.currentScript.dataset.root) || "../../";
  const T = {
    es: { meses: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
      cortos: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"], falta: "Falta",
      hasta: (d) => "Hasta el " + d.getDate() + " de " + T.meses[d.getMonth()], de: (a, b) => a + " a " + b,
      movs: (n) => n.toLocaleString("es-ES") + " movimientos", desde: (a, b) => "De " + a + " a " + b,
      todo: "Tienes los 12 meses. Así lo hago todo mucho más preciso.",
      faltan: (l) => (l.length === 1 ? "Te falta " + l[0] + ". Súbelo" : "Te faltan " + lista(l) + ". Súbelos") + " y lo hago mucho más preciso.",
      faltanN: (n) => "Te faltan " + n + " meses. Súbelos y lo hago mucho más preciso.",
      leyendo: "Olfateando tu extracto nuevo…", listo: (n) => n > 0 ? "Listo. He sumado " + n.toLocaleString("es-ES") + " movimientos nuevos." : "Ese extracto ya lo tenía. No he repetido nada.",
      noLeo: "Este extracto no lo puedo leer aquí. Súbelo en Mi banco.", noGuardo: "No he podido guardarlo. Prueba otra vez.",
      extracto: "Extracto", mesAno: (f) => T.meses[+f.slice(5, 7) - 1] + " de " + f.slice(0, 4), dat: "Tu datáfono", datP: (a) => "Resumen de " + a, y: " y " },
    ca: { meses: ["gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost", "setembre", "octubre", "novembre", "desembre"],
      cortos: ["Gen", "Feb", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Des"], falta: "Falta",
      hasta: (d) => "Fins al " + d.getDate() + " de " + T.meses[d.getMonth()], de: (a, b) => a + " a " + b,
      movs: (n) => n.toLocaleString("es-ES") + " moviments", desde: (a, b) => "De " + a + " a " + b,
      todo: "Tens els 12 mesos. Així ho faig tot molt més precís.",
      faltan: (l) => (l.length === 1 ? "Et falta " + l[0] + ". Puja'l" : "Et falten " + lista(l) + ". Puja'ls") + " i ho faig molt més precís.",
      faltanN: (n) => "Et falten " + n + " mesos. Puja'ls i ho faig molt més precís.",
      leyendo: "Ensumant el teu extracte nou…", listo: (n) => n > 0 ? "Fet. He sumat " + n.toLocaleString("es-ES") + " moviments nous." : "Aquest extracte ja el tenia. No he repetit res.",
      noLeo: "Aquest extracte no el puc llegir aquí. Puja'l a El meu banc.", noGuardo: "No l'he pogut desar. Torna-ho a provar.",
      extracto: "Extracte", mesAno: (f) => T.meses[+f.slice(5, 7) - 1] + " de " + f.slice(0, 4), dat: "El teu datàfon", datP: (a) => "Resum de " + a, y: " i " },
    en: { meses: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
      cortos: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], falta: "Missing",
      hasta: (d) => "Until " + d.getDate() + " " + T.meses[d.getMonth()], de: (a, b) => a + " to " + b,
      movs: (n) => n.toLocaleString("en-GB") + " transactions", desde: (a, b) => a + " to " + b,
      todo: "You have all 12 months. That makes everything much more accurate.",
      faltan: (l) => "You're missing " + lista(l) + ". Upload " + (l.length === 1 ? "it" : "them") + " and I'll make it much more accurate.",
      faltanN: (n) => "You're missing " + n + " months. Upload them and I'll make it much more accurate.",
      leyendo: "Sniffing your new statement…", listo: (n) => n > 0 ? "Done. I've added " + n.toLocaleString("en-GB") + " new transactions." : "I already had that statement. Nothing was repeated.",
      noLeo: "I can't read this statement here. Upload it in My bank.", noGuardo: "I couldn't save it. Try again.",
      extracto: "Statement", mesAno: (f) => T.meses[+f.slice(5, 7) - 1] + " " + f.slice(0, 4), dat: "Your card machine", datP: (a) => "Summary for " + a, y: " and " },
  }[LANG];
  const lista = (l) => l.length > 1 ? l.slice(0, -1).join(", ") + T.y + l[l.length - 1] : l[0];
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  // El banco de cada archivo: el que reconoció el lector o el que dice el nombre del archivo
  const BANCOS = [["caixabank", /caixa|lacaixa/], ["santander", /santander/], ["bbva", /bbva/], ["sabadell", /sabadell/], ["ing", /\bing\b|ingdirect/],
    ["bankinter", /bankinter/], ["unicaja", /unicaja/], ["kutxabank", /kutxa/], ["abanca", /abanca/], ["ibercaja", /ibercaja/], ["cajamar", /cajamar/],
    ["caja_rural", /rural/], ["openbank", /openbank/], ["evo_banco", /\bevo\b/], ["imagin", /imagin/], ["myinvestor", /myinvestor/], ["revolut", /revolut/],
    ["n26", /n26/], ["wise", /wise|transferwise/], ["bunq", /bunq/], ["trade_republic", /trade.?republic/], ["deutsche_bank", /deutsche/], ["mediolanum", /mediolanum/],
    ["pibank", /pibank/], ["self_bank", /self.?bank/], ["triodos", /triodos/], ["laboral_kutxa", /laboral/], ["hello_bank", /hello/]];
  const NOMBRES = { caixabank: "CaixaBank", santander: "Santander", bbva: "BBVA", sabadell: "Sabadell", ing: "ING", bankinter: "Bankinter", unicaja: "Unicaja",
    kutxabank: "Kutxabank", abanca: "Abanca", ibercaja: "Ibercaja", cajamar: "Cajamar", caja_rural: "Caja Rural", openbank: "Openbank", evo_banco: "EVO Banco",
    imagin: "imagin", myinvestor: "MyInvestor", revolut: "Revolut", n26: "N26", wise: "Wise", bunq: "bunq", trade_republic: "Trade Republic",
    deutsche_bank: "Deutsche Bank", mediolanum: "Mediolanum", pibank: "Pibank", self_bank: "Self Bank", triodos: "Triodos", laboral_kutxa: "Laboral Kutxa", hello_bank: "Hello Bank" };
  function bancoDe(a) {
    const t = (String(a.perfil || "") + " " + String(a.nombre || "")).toLowerCase();
    const b = BANCOS.find(([, re]) => re.test(t));
    return b ? b[0] : null;
  }
  const mes = (f) => String(f).slice(0, 7);
  const nomMes = (ym) => T.meses[+ym.slice(5, 7) - 1];

  let estado = null; // { codigo, datos, negocio }
  function pintar(d) {
    const lista = $("tcLista"), cal = $("tcCal"), aviso = $("tcAviso");
    lista.textContent = ""; cal.textContent = "";
    if (d.negocio) { pintarNegocio(d.datos.n); return; }
    const r = d.datos.r, movs = (r && r.lectura && r.lectura.movimientos) || [], bancos = (r && r.bancos) || {};
    // Cada archivo: su banco, sus fechas y cuántos movimientos tiene
    const porArch = {};
    movs.forEach((m) => { const k = (m.origen && m.origen.archivo) || "?"; const x = porArch[k] || (porArch[k] = { n: 0, min: m.fecha, max: m.fecha }); x.n++; if (m.fecha < x.min) x.min = m.fecha; if (m.fecha > x.max) x.max = m.fecha; });
    const archivos = ((r && r.lectura && r.lectura.archivos) || []).filter((a) => porArch[a.nombre]);
    // varios archivos del mismo banco se juntan en una fila
    const filas = {};
    archivos.forEach((a) => {
      const b = bancos[a.nombre] || bancoDe(a) || "", k = b || a.nombre, x = porArch[a.nombre];
      const f = filas[k] || (filas[k] = { b, nombre: b ? NOMBRES[b] : T.extracto, n: 0, min: x.min, max: x.max });
      f.n += x.n; if (x.min < f.min) f.min = x.min; if (x.max > f.max) f.max = x.max;
    });
    Object.values(filas).forEach((f) => {
      const li = el("li", "tc-ext");
      if (f.b) { const img = el("img", "tc-logo"); img.src = ROOT + "assets/logos/bancos/" + f.b + ".png"; img.alt = ""; img.width = 44; img.height = 44; li.appendChild(img); }
      else li.appendChild(el("span", "tc-logo tc-logo--x", f.nombre.charAt(0)));
      const tx = el("div"); tx.append(el("b", null, f.nombre), el("small", null, T.desde(T.mesAno(f.min), T.mesAno(f.max)) + " · " + T.movs(f.n)));
      li.appendChild(tx); lista.appendChild(li);
    });
    // Calendario: los 12 últimos meses completos
    const hoy = new Date(), tiene = new Set(movs.map((m) => mes(m.fecha)));
    const meses = []; for (let i = 12; i >= 1; i--) { const x = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1); meses.push(x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0")); }
    const anos = [...new Set(meses.map((m) => m.slice(0, 4)))];
    cal.appendChild(el("p", "tc-ano", anos.join(" – ")));
    const g = el("div", "tc-cal-g"), faltan = [];
    meses.forEach((m) => {
      const si = tiene.has(m), c = el("span", si ? "tc-si" : "tc-no");
      c.append(el("b", null, T.cortos[+m.slice(5, 7) - 1]), el("small", null, si ? "✓" : T.falta));
      if (m.slice(5, 7) === "01" && anos.length > 1) c.title = m.slice(0, 4);
      g.appendChild(c); if (!si) faltan.push(nomMes(m));
    });
    cal.appendChild(g);
    aviso.textContent = !faltan.length ? T.todo : faltan.length <= 3 ? T.faltan(faltan) : T.faltanN(faltan.length);
  }
  function pintarNegocio(n) {
    const lista = $("tcLista"), aviso = $("tcAviso");
    $("tcExtH").textContent = T.dat;
    const li = el("li", "tc-ext"), b = bancoDe({ nombre: n && (n.actual || n.proveedor) });
    if (b) { const img = el("img", "tc-logo"); img.src = ROOT + "assets/logos/bancos/" + b + ".png"; img.alt = ""; img.width = 44; img.height = 44; li.appendChild(img); }
    else li.appendChild(el("span", "tc-logo tc-logo--x", "€"));
    const f = (s) => { if (!s) return "?"; const d = new Date(s + "T12:00:00"); return d.getDate() + (LANG === "en" ? " " : " de ") + T.meses[d.getMonth()]; };
    const tx = el("div"); tx.append(el("b", null, (n && (n.actual || n.proveedor)) || T.dat), el("small", null, n && n.desde ? T.de(f(n.desde), f(n.hasta)) : ""));
    li.appendChild(tx); lista.appendChild(li);
    aviso.hidden = true; $("tcCal").hidden = true;
    const a = $("tcAnadir"); a.textContent = "↑ " + a.dataset.neg; a.dataset.ir = ROOT + { es: "datafono/", ca: "ca/datafon/", en: "en/card-machine/" }[LANG];
  }

  // Sumar un extracto: lo de antes (rehecho como CSV por archivo, con su saldo) + lo nuevo, leído junto en el dispositivo
  const aCSV = (movs) => {
    const num = (x) => (x === null || x === undefined || !Number.isFinite(x)) ? "" : x.toFixed(2).replace(".", ",");
    const fecha = (f) => f.slice(8, 10) + "/" + f.slice(5, 7) + "/" + f.slice(0, 4);
    return ["Fecha;Concepto;Importe;Saldo"].concat(movs.map((m) => [fecha(m.fecha), String(m.concepto || "").replace(/[;\r\n]+/g, " ").trim(), num(m.importe), num(m.saldo)].join(";"))).join("\n") + "\n";
  };
  async function sumar(nuevos) {
    const st = $("tcEstado"), r = estado.datos.r, viejos = (r && r.lectura && r.lectura.movimientos) || [];
    st.textContent = T.leyendo; st.hidden = false; $("tcAnadir").disabled = true;
    try {
      const porArch = {}; viejos.forEach((m) => { const k = (m.origen && m.origen.archivo) || "anterior.csv"; (porArch[k] = porArch[k] || []).push(m); });
      const antes = Object.keys(porArch).map((k) => new File([aCSV(porArch[k])], k.replace(/\.[^.]+$/, "") + ".csv", { type: "text/csv" }));
      const motor = await import(new URL(ROOT + "assets/extracto/motor.js", location.href).href);
      const r2 = await motor.analizar(antes.concat(nuevos), { idioma: LANG });
      const movs2 = (r2 && r2.lectura && r2.lectura.movimientos) || [];
      if (!movs2.length || r2.necesita_mapeo || (r2.necesita_contrasena && r2.necesita_contrasena.length)) { st.textContent = T.noLeo; return; }
      // el banco de cada archivo se recuerda (los de antes vuelven como CSV y ya no se reconocerían)
      const bancos = Object.assign({}, (r && r.bancos) || {});
      Object.keys(bancos).forEach((k) => { const csv = k.replace(/\.[^.]+$/, "") + ".csv"; if (csv !== k) bancos[csv] = bancos[k]; });
      ((r && r.lectura && r.lectura.archivos) || []).forEach((a) => { const b = bancoDe(a); if (b) bancos[a.nombre.replace(/\.[^.]+$/, "") + ".csv"] = bancos[a.nombre.replace(/\.[^.]+$/, "") + ".csv"] || b; });
      ((r2.lectura && r2.lectura.archivos) || []).forEach((a) => { const b = bancoDe(a); if (b && !bancos[a.nombre]) bancos[a.nombre] = b; });
      r2.bancos = bancos;
      try { await window.FeehundTiqui.guardar(r2); } catch (e) { st.textContent = T.noGuardo; return; }
      estado.datos = { r: r2 }; pintar(estado);
      st.textContent = T.listo(Math.max(0, movs2.length - viejos.length));
    } catch (e) { console.error("Feehund: sumar extracto", e); st.textContent = T.noLeo; }
    finally { $("tcAnadir").disabled = false; }
  }

  document.addEventListener("fh-tiqui-pagina", (e) => {
    const d = e.detail || {};
    $("tcCarga").hidden = true;
    if (d.error) { $("tcApp").hidden = true; const er = $("tcError"); er.hidden = false; $("tcErrorT").textContent = d.error; return; }
    estado = d;
    $("tcHasta").textContent = T.hasta(new Date(d.hasta)); $("tcHasta").hidden = false;
    // la primera vez se recuerda el banco de cada archivo, que el lector ya no verá si se suma otro extracto
    if (!d.negocio && d.datos.r && !d.datos.r.bancos) { const b = {}; ((d.datos.r.lectura && d.datos.r.lectura.archivos) || []).forEach((a) => { const x = bancoDe(a); if (x) b[a.nombre] = x; }); d.datos.r.bancos = b; }
    pintar(d);
    $("tcApp").classList.add("tc-listo");
  });

  // Añadir extracto
  const file = $("tcFile");
  $("tcAnadir").addEventListener("click", () => { const ir = $("tcAnadir").dataset.ir; if (ir) { location.href = ir; return; } file.click(); });
  file.addEventListener("change", () => { const fs = Array.prototype.slice.call(file.files || []); file.value = ""; if (fs.length && estado) sumar(fs); });

  // Móvil: dos pestañas, «Chat» y «Tus extractos»
  const tabs = $("tcTabs");
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    tabs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    $("tcApp").dataset.ver = b.dataset.ver;
  });
})();
