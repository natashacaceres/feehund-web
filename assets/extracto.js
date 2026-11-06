/* Detector de cobros que se repiten. Todo ocurre en el navegador: el archivo y sus datos no se envían, no se guardan
   (ni localStorage ni cookies) y no se registran. Diccionario de comercios editable en /data/comercios.json. */
(function(){
"use strict";
const ROOT = (document.currentScript && document.currentScript.dataset.root) || "../";
const $ = id => document.getElementById(id);
const LANG = ["es","ca","en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
const TX = {
  es: { year: "€/año", mes: "€/mes", tri: "€/trimestre", ano: "€/año", n: n => "en " + n + (n === 1 ? " cobro que se repite" : " cobros que se repiten"),
        up: "Subió", fee: "Quizá evitable", baja: "Dar de baja", none: "No ha encontrado cobros que se repitan. Prueba con más meses.", bad: "No se ha podido leer. Prueba con Excel o CSV.",
        share: x => x + " €/año en cobros que se repiten", line: "en cobros que se repiten", dl: "Imagen descargada.", ics: "Archivo de avisos descargado.", soon: d => " se renueva en 3 días", cal: "Avisos de renovación · Feehund" },
  ca: { year: "€/any", mes: "€/mes", tri: "€/trimestre", ano: "€/any", n: n => "en " + n + (n === 1 ? " cobrament que es repeteix" : " cobraments que es repeteixen"),
        up: "Ha pujat", fee: "Potser evitable", baja: "Donar de baixa", none: "No ha trobat cobraments que es repeteixin. Prova amb més mesos.", bad: "No s'ha pogut llegir. Prova amb Excel o CSV.",
        share: x => x + " €/any en cobraments que es repeteixen", line: "en cobraments que es repeteixen", dl: "Imatge descarregada.", ics: "Fitxer d'avisos descarregat.", soon: d => " es renova d'aquí a 3 dies", cal: "Avisos de renovació · Feehund" },
  en: { year: "€/year", mes: "€/month", tri: "€/quarter", ano: "€/year", n: n => "in " + n + (n === 1 ? " recurring charge" : " recurring charges"),
        up: "Went up", fee: "Maybe avoidable", baja: "Cancel", none: "No recurring charges found. Try with more months.", bad: "The file could not be read. Try Excel or CSV.",
        share: x => "€" + x + "/year in recurring charges", line: "in recurring charges", dl: "Image downloaded.", ics: "Reminder file downloaded.", soon: d => " renews in 3 days", cal: "Renewal reminders · Feehund" }
}[LANG];
const BAJA_DIR = { es: "baja", ca: "baixa", en: "cancel" }[LANG];
const nf2 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });
const nf0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: "always" });
const e2 = x => nf2.format(x), e0 = x => nf0.format(Math.round(x));

/* ---------- diccionario de comercios (copia de respaldo; /data/comercios.json manda si se puede leer) */
let DIC = [
  {buscar:["NETFLIX"],nombre:"Netflix",baja:"netflix"},{buscar:["SPOTIFY"],nombre:"Spotify",baja:"spotify"},
  {buscar:["AMAZON PRIME","PRIME VIDEO","PRIMEVIDEO","AMZN PRIME","AMAZON PRIM"],nombre:"Amazon Prime",baja:"amazon-prime"},
  {buscar:["DISNEY PLUS","DISNEYPLUS","DISNEY+"],nombre:"Disney+",baja:"disney-plus"},
  {buscar:["BASIC-FIT","BASIC FIT","BASICFIT"],nombre:"Basic-Fit",baja:"gimnasio"},{buscar:["GIMNASIO"],nombre:"Gimnasio",baja:"gimnasio"},
  {buscar:["MOVISTAR","TELEFONICA DE ESPANA"],nombre:"Movistar",baja:null},{buscar:["IBERDROLA"],nombre:"Iberdrola",baja:null},
  {buscar:["MAPFRE"],nombre:"Mapfre",baja:null},{buscar:["COMISION MANTENIMIENTO","COMISION DE MANTENIMIENTO"],nombre:{es:"Comisión de mantenimiento",ca:"Comissió de manteniment",en:"Maintenance fee"},baja:null,comision:true},{buscar:["AMAZON","AMZN"],nombre:"Amazon",baja:null}
];
fetch(ROOT + "data/comercios.json").then(r => r.ok ? r.json() : null).then(d => { if (d && Array.isArray(d.comercios) && d.comercios.length) DIC = d.comercios; }).catch(() => {});

/* ---------- librerías alojadas en el sitio, cargadas al abrir la página para que funcione sin conexión */
const loadScript = src => new Promise((ok, ko) => { const s = document.createElement("script"); s.src = src; s.async = true; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
let XLSXp = null, PDFp = null;
function libs(){
  if (!XLSXp) XLSXp = loadScript(ROOT + "assets/vendor/xlsx.full.min.js").then(() => window.XLSX).catch(() => null);
  if (!PDFp) PDFp = Promise.all([
    loadScript(ROOT + "assets/vendor/pdf.min.js"),
    fetch(ROOT + "assets/vendor/pdf.worker.min.js").then(r => r.ok ? r.blob() : null).catch(() => null)
  ]).then(([, w]) => { const p = window.pdfjsLib; if (!p) return null; p.GlobalWorkerOptions.workerSrc = w ? URL.createObjectURL(w) : ROOT + "assets/vendor/pdf.worker.min.js"; return p; }).catch(() => null);
}
if (document.readyState === "complete") setTimeout(libs, 200); else addEventListener("load", () => setTimeout(libs, 200));

/* ---------- utilidades de lectura */
const strip = s => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const up = s => strip(s).toUpperCase().replace(/\s+/g, " ").trim();
function parseAmount(v){
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v == null ? "" : v).replace(/[\s\u00a0\u202f€]|EUR/gi, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  if (/^[-−–]/.test(s)) { neg = true; s = s.slice(1); }
  if (/^\+/.test(s)) s = s.slice(1);
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const c = s.lastIndexOf(","), d = s.lastIndexOf(".");
  if (c >= 0 && d >= 0) s = c > d ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (c >= 0) s = (s.match(/,/g).length > 1) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (d >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s); if (!isFinite(n)) return null;
  return neg ? -n : n;
}
function parseDate(v, yHint){
  if (v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
  const s = String(v == null ? "" : v).trim(); let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return mk(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/))) { let y = +m[3]; if (y < 100) y += 2000; return mk(y, +m[2], +m[1]); }
  if (yHint && (m = s.match(/^(\d{1,2})[-/.](\d{1,2})$/))) return mk(yHint, +m[2], +m[1]);
  return null;
}
function mk(y, mo, d){ if (mo < 1 || mo > 12 || d < 1 || d > 31) return null; const x = new Date(y, mo - 1, d); return isNaN(x) ? null : x; }

/* ---------- filas → movimientos {fecha, concepto, importe} */
const HK = {
  fecha: /^(f\.?\s*)?(fecha|date|data)\b|^f\.?\s*(operacion|valor|oper)/,
  concepto: /concepto|descripci|detalle|movimiento|description|concept|observaciones|beneficiario|comercio|referencia ampliada/,
  importe: /^(importe|cantidad|amount|import|euros|eur)\b|importe/,
  cargo: /^(cargo|cargos|debe|debit|debito|salida|gasto)s?\b/,
  abono: /^(abono|abonos|haber|credit|credito|ingreso|entrada)s?\b/,
  saldo: /saldo|balance/
};
function fromRows(rows){
  rows = rows.filter(r => Array.isArray(r) && r.some(c => String(c == null ? "" : c).trim() !== ""));
  if (!rows.length) return [];
  let hi = -1, col = null;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const h = rows[i].map(c => strip(c).toLowerCase().trim());
    const f = h.findIndex(x => HK.fecha.test(x)), c = h.findIndex(x => HK.concepto.test(x) && !HK.fecha.test(x));
    const im = h.findIndex(x => HK.importe.test(x) && !HK.saldo.test(x) && !HK.fecha.test(x));
    const cg = h.findIndex(x => HK.cargo.test(x)), ab = h.findIndex(x => HK.abono.test(x));
    if (f >= 0 && c >= 0 && (im >= 0 || cg >= 0)) { hi = i; col = { f, c, im, cg, ab }; break; }
  }
  if (!col) col = guess(rows), hi = -1;
  if (!col) return [];
  const out = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i], fecha = parseDate(r[col.f]); if (!fecha) continue;
    let imp = null;
    if (col.im >= 0) imp = parseAmount(r[col.im]);
    if ((imp === null || imp === 0) && col.cg >= 0) { const v = parseAmount(r[col.cg]); if (v) imp = -Math.abs(v); }
    if ((imp === null || imp === 0) && col.ab >= 0) { const v = parseAmount(r[col.ab]); if (v) imp = Math.abs(v); }
    const concepto = String(r[col.c] == null ? "" : r[col.c]).trim();
    if (imp === null || !concepto) continue;
    out.push({ fecha, concepto, importe: imp });
  }
  return out;
}
function guess(rows){
  const sample = rows.slice(0, 60), n = Math.max(...sample.map(r => r.length));
  let f = -1, c = -1, im = -1, best = 0, len = 0, neg = -1;
  for (let j = 0; j < n; j++) {
    const v = sample.map(r => r[j]);
    const nd = v.filter(x => parseDate(x)).length;
    if (nd > best) { best = nd; f = j; }
  }
  if (best < 3) return null;
  for (let j = 0; j < n; j++) {
    if (j === f) continue;
    const v = sample.map(r => r[j]);
    const nums = v.map(parseAmount).filter(x => x !== null);
    if (nums.length >= best * 0.6) { const ng = nums.filter(x => x < 0).length; if (ng > neg) { neg = ng; im = j; } }
    else { const L = v.reduce((a, x) => a + String(x == null ? "" : x).length, 0) / v.length; if (L > len) { len = L; c = j; } }
  }
  return im >= 0 && c >= 0 ? { f, c, im, cg: -1, ab: -1 } : null;
}
function parseCSV(text){
  text = text.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).slice(0, 30).join("\n");
  const cand = [";", ",", "\t", "|"]; let sep = ";", bestN = -1;
  for (const s of cand) { const n = lines.split("\n").map(l => l.split(s).length).filter(x => x > 2).length; if (n > bestN) { bestN = n; sep = s; } }
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
async function readFile(file){
  const name = (file.name || "").toLowerCase();
  if (/\.(xlsx|xlsm|xls|ods)$/.test(name)) {
    libs(); const X = await XLSXp; if (!X) throw new Error("xlsx");
    const wb = X.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    let all = [];
    for (const sn of wb.SheetNames) { const m = fromRows(X.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: "" })); if (m.length > all.length) all = m; }
    return all;
  }
  if (/\.pdf$/.test(name) || file.type === "application/pdf") return readPDF(file);
  let text = await file.text();
  if (text.includes("\uFFFD")) { try { text = new TextDecoder("windows-1252").decode(await file.arrayBuffer()); } catch(_) {} }
  return fromRows(parseCSV(text));
}
async function readPDF(file){
  libs(); const P = await PDFp; if (!P) throw new Error("pdf");
  const doc = await P.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent(), rows = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4];
      let r = rows.find(r => Math.abs(r.y - y) < 3); if (!r) rows.push(r = { y, items: [] });
      r.items.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y).forEach(r => lines.push(r.items.sort((a, b) => a.x - b.x).map(i => i.s).join(" ").replace(/\s+/g, " ").trim()));
  }
  const yrs = (lines.join(" ").match(/\b20\d{2}\b/g) || []).map(Number), yHint = yrs.length ? yrs.sort((a, b) => yrs.filter(v => v === b).length - yrs.filter(v => v === a).length)[0] : new Date().getFullYear();
  const AM = /[-−]?\s?\d{1,3}(?:\.\d{3})*,\d{2}\s?-?|[-−]?\d+,\d{2}-?/g, out = [];
  for (const l of lines) {
    const m = l.match(/^(\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?)\s+(?:(\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?)\s+)?(.*)$/); if (!m) continue;
    const fecha = parseDate(m[1], yHint); if (!fecha) continue;
    const rest = m[3], ams = rest.match(AM); if (!ams) continue;
    const imp = parseAmount(ams[0].replace("−", "-").replace(/\s/g, "")); if (imp === null) continue;
    const concepto = rest.slice(0, rest.indexOf(ams[0])).trim(); if (!concepto) continue;
    out.push({ fecha, concepto, importe: imp });
  }
  if (out.length && !out.some(o => o.importe < 0)) out.forEach(o => o.importe = -Math.abs(o.importe));
  return out;
}

/* ---------- limpieza del concepto y detección */
const CITIES = "MADRID BARCELONA VALENCIA SEVILLA ZARAGOZA MALAGA MURCIA PALMA BILBAO ALICANTE CORDOBA VALLADOLID VIGO GIJON HOSPITALET VITORIA GRANADA ELCHE OVIEDO BADALONA CARTAGENA TERRASSA JEREZ SABADELL MOSTOLES SANTANDER PAMPLONA ALMERIA BURGOS SALAMANCA ALBACETE GETAFE HUELVA LOGRONO TARRAGONA LLEIDA GIRONA CADIZ LEON SAN SEBASTIAN DONOSTIA A CORUNA CORUNA LUXEMBOURG LUXEMBURGO AMSTERDAM DUBLIN LONDON LONDRES PARIS LOS GATOS SAN FRANCISCO CORK SUNNYVALE ESP ESPANA SPAIN ES IE NL LU GB US FR DE".split(" ");
const NOISE = /\b(COMPRA|COMPRAS|PAGO|PAGOS|RECIBO|RECIBOS|ADEUDO|ADEUDOS|DIRECTO|SEPA|CARGO|TRANSACCION|OPERACION|TARJETA|TARJ|TJ|CONTACTLESS|APPLE PAY|GOOGLE PAY|DOMICILIACION|DOMICILIADO|EN|DE|DEL|LA|EL|CON|POR|REF|REFERENCIA|MANDATO|ACREEDOR|ID|SA|SL|SLU|SAU|INC|LTD|BV|SARL|GMBH|WWW|COM|NET|ORG|IO|HTTPS?)\b/g;
function clean(c){
  let s = " " + up(c) + " ";
  s = s.replace(/\b\d{4}[\sX*\d]{6,}\d{2,4}\b/g, " ").replace(/X{3,}\d*/g, " ").replace(/\*+\d+/g, " ")
       .replace(/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, " ").replace(/\b[A-Z]*\d{4,}[A-Z\d]*\b/g, " ")
       .replace(/\.(COM|ES|NET|EU|IO)\b/g, " ").replace(/[^A-Z0-9+&\- ]/g, " ").replace(NOISE, " ");
  for (const ct of CITIES) s = s.replace(new RegExp("\\b" + ct + "\\b", "g"), " ");
  return s.replace(/\b\d+\b/g, " ").replace(/\s+/g, " ").trim();
}
const titleCase = s => s.toLowerCase().replace(/(^|[\s\-&+])([a-zñ])/g, (m, a, b) => a + b.toUpperCase());
const FEE = /COMISION|MANTENIMIENTO|CUOTA|ADMINISTRACION|DESCUBIERTO/;
function merchant(concepto){
  const raw = " " + up(concepto) + " ";
  for (const d of DIC) for (const b of (d.buscar || [])) if (raw.includes(up(b))) { const nm = typeof d.nombre === "object" ? (d.nombre[LANG] || d.nombre.es) : d.nombre; return { key: "D:" + nm, nombre: nm, baja: d.baja || null, fee: !!d.comision }; }
  const c = clean(concepto), fee = FEE.test(raw);
  const words = c.split(" ").filter(w => w.length > 1).slice(0, fee ? 3 : 2);
  if (!words.length) return null;
  const k = words.join(" ");
  return { key: "C:" + k, nombre: titleCase(k), baja: null, fee };
}
const DAY = 864e5, mkey = d => d.getFullYear() * 12 + d.getMonth();
function median(a){ const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function detect(movs){
  const groups = new Map();
  for (const m of movs) {
    if (!(m.importe < 0)) continue;
    const g = merchant(m.concepto); if (!g) continue;
    if (!groups.has(g.key)) groups.set(g.key, { ...g, items: [] });
    groups.get(g.key).items.push({ fecha: m.fecha, imp: -m.importe });
  }
  const res = [];
  for (const g of groups.values()) {
    const items = g.items.sort((a, b) => a.fecha - b.fecha);
    const months = new Set(items.map(i => mkey(i.fecha))).size;
    if (months < 2) continue;
    const frequent = items.length > months * 1.5;
    const tol = frequent ? 0.02 : 0.15;
    // agrupar por importe parecido
    const sorted = items.slice().sort((a, b) => a.imp - b.imp), clusters = [];
    for (const it of sorted) { const cl = clusters.find(c => Math.abs(it.imp - c.ref) <= c.ref * tol); if (cl) { cl.items.push(it); cl.ref = median(cl.items.map(i => i.imp)); } else clusters.push({ ref: it.imp, items: [it] }); }
    let best = null;
    for (const cl of clusters) {
      const its = cl.items.sort((a, b) => a.fecha - b.fecha), ms = new Set(its.map(i => mkey(i.fecha))).size;
      if (ms < 2 || its.length > ms * 1.25 || (frequent && its.length < 3)) continue;
      const gaps = []; for (let i = 1; i < its.length; i++) gaps.push((its[i].fecha - its[i - 1].fecha) / DAY);
      const gm = median(gaps);
      let per = gm >= 20 && gm <= 45 ? "m" : gm >= 75 && gm <= 105 ? "t" : gm >= 330 && gm <= 400 ? "a" : null;
      if (!per && g.fee) per = gm < 60 ? "m" : gm < 200 ? "t" : "a";
      if (!per) continue;
      if (!best || its.length > best.its.length) best = { its, per };
    }
    if (!best) continue;
    const its = best.its, last = its[its.length - 1];
    const k = best.per === "m" ? 12 : best.per === "t" ? 4 : 1;
    res.push({ nombre: g.nombre, baja: g.baja, fee: g.fee, per: best.per, imp: last.imp, anual: last.imp * k, subio: (() => { for (let i = its.length - 2; i >= 0; i--) if (Math.abs(its[i].imp - last.imp) > 0.004) return last.imp > its[i].imp; return false; })(), last: last.fecha });
  }
  return res.sort((a, b) => b.anual - a.anual);
}

/* ---------- interfaz */
const scr = { up: $("xUp"), load: $("xLoad"), res: $("xRes") };
let found = [];
function show(which){ for (const k in scr) scr[k].hidden = k !== which; scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
function msg(el, t){ el.textContent = t; el.hidden = !t; }
async function analyze(getMovs){
  msg($("xErr"), ""); show("load");
  const t0 = Date.now(); let movs = null;
  try { movs = await getMovs(); } catch(_) { movs = null; }
  await new Promise(r => setTimeout(r, Math.max(0, 900 - (Date.now() - t0))));
  if (!movs || !movs.length) { show("up"); msg($("xErr"), TX.bad); return; }
  found = detect(movs);
  if (!found.length) { show("up"); msg($("xErr"), TX.none); return; }
  render(); show("res");
  try { if (window.plausible) window.plausible("extracto analizado"); } catch(_) {}
  const h = $("xResH"); if (h) h.focus({ preventScroll: true });
}
function render(){
  const total = found.reduce((a, f) => a + f.anual, 0);
  $("xTotal").textContent = e0(total) + " " + TX.year;
  $("xCount").textContent = TX.n(found.length);
  const ul = $("xList"); ul.textContent = "";
  for (const f of found) {
    const li = document.createElement("li"); li.className = "ext-row";
    const m = document.createElement("div"); m.className = "ext-row-m";
    const n = document.createElement("p"); n.className = "ext-n"; n.textContent = f.nombre;
    const tags = [];
    if (f.subio) tags.push(TX.up);
    if (f.fee) tags.push(TX.fee);
    if (tags.length) { const tw = document.createElement("span"); tw.className = "ext-tags"; tags.forEach(t => { const s = document.createElement("span"); s.className = "ext-tag"; s.textContent = t; tw.appendChild(s); }); n.appendChild(tw); }
    const p = document.createElement("p"); p.className = "ext-p"; p.textContent = e2(f.imp) + " " + (f.per === "m" ? TX.mes : f.per === "t" ? TX.tri : TX.ano);
    m.append(n, p);
    if (f.baja) { const a = document.createElement("a"); a.className = "ext-baja"; a.href = "../" + BAJA_DIR + "/" + f.baja + "/"; a.textContent = TX.baja + " →"; m.appendChild(a); }
    const y = document.createElement("p"); y.className = "ext-y"; y.textContent = e2(f.anual) + " €"; const ys = document.createElement("span"); ys.textContent = TX.year.replace("€", ""); y.appendChild(ys);
    li.append(m, y); ul.appendChild(li);
  }
}

/* compartir: solo la cifra, nunca la lista ni los nombres */
async function share(){
  const total = e0(found.reduce((a, f) => a + f.anual, 0));
  const c = document.createElement("canvas"); c.width = 1080; c.height = 1080; const x = c.getContext("2d");
  try { await Promise.all(['600 120px "Fredoka"', '800 44px "Nunito"', '400 44px "Atkinson Hyperlegible Next"'].map(f => document.fonts.load(f))); } catch(_) {}
  x.fillStyle = "#FFF8EC"; x.fillRect(0, 0, 1080, 1080);
  const img = new Image(); img.src = ROOT + "assets/img/blog-lupa.png";
  try { await img.decode(); x.drawImage(img, 160, 110, 760, 760 * 371 / 880); } catch(_) {}
  const rr = (X, Y, W, H, R) => { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); };
  rr(90, 500, 900, 300, 36); x.fillStyle = "#FFB238"; x.fill(); x.lineWidth = 3; x.strokeStyle = "#14213D"; x.stroke();
  x.fillStyle = "#14213D"; x.textAlign = "center"; x.textBaseline = "alphabetic";
  const big = LANG === "en" ? "€" + total + TX.year.replace("€", "") : total + " " + TX.year;
  let fs = 120; x.font = '600 ' + fs + 'px "Fredoka", sans-serif'; while (x.measureText(big).width > 820 && fs > 60) { fs -= 6; x.font = '600 ' + fs + 'px "Fredoka", sans-serif'; }
  x.fillText(big, 540, 660);
  x.font = '400 44px "Atkinson Hyperlegible Next", sans-serif'; x.fillText(TX.line, 540, 740);
  x.fillStyle = "#0E5E6F"; x.font = '800 44px "Nunito", sans-serif'; x.fillText("feehund.com", 540, 960);
  const blob = await new Promise(r => c.toBlob(r, "image/png")); if (!blob) return;
  const file = new File([blob], "feehund.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text: TX.share(total) + " · feehund.com" }); return; } catch(e) { if (e && e.name === "AbortError") return; } }
  download(blob, "feehund.png"); msg($("xMsg"), TX.dl);
}
function download(blob, name){ const u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }

/* avisos .ics: 3 días antes del próximo cargo previsto */
function ics(){
  const pad = n => String(n).padStart(2, "0"), ymd = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  const now = new Date(), stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const esc = s => String(s).replace(/[\\;,]/g, m => "\\" + m).replace(/\n/g, "\\n");
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Feehund//Avisos//" + LANG.toUpperCase(), "CALSCALE:GREGORIAN", "X-WR-CALNAME:" + esc(TX.cal)];
  found.forEach((f, i) => {
    const step = f.per === "m" ? 1 : f.per === "t" ? 3 : 12;
    let next = new Date(f.last); const add = () => { const d = next.getDate(); next = new Date(next.getFullYear(), next.getMonth() + step, 1); next.setDate(Math.min(d, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate())); };
    add(); while (next - 3 * DAY < now) add();
    const al = new Date(next.getFullYear(), next.getMonth(), next.getDate() - 3), al2 = new Date(al.getFullYear(), al.getMonth(), al.getDate() + 1);
    const t = f.nombre + TX.soon() + " (" + e2(f.imp) + " €)";
    L.push("BEGIN:VEVENT", "UID:" + ymd(al) + "-" + i + "-" + Math.random().toString(36).slice(2) + "@feehund.com", "DTSTAMP:" + stamp,
      "DTSTART;VALUE=DATE:" + ymd(al), "DTEND;VALUE=DATE:" + ymd(al2),
      "RRULE:" + (f.per === "a" ? "FREQ=YEARLY" : "FREQ=MONTHLY;INTERVAL=" + step), "SUMMARY:" + esc(t), "TRANSP:TRANSPARENT",
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(t), "TRIGGER:PT9H", "END:VALARM", "END:VEVENT");
  });
  L.push("END:VCALENDAR");
  download(new Blob([L.join("\r\n") + "\r\n"], { type: "text/calendar" }), "feehund-avisos.ics"); msg($("xMsg"), TX.ics);
}

/* extracto de ejemplo, inventado */
function ejemplo(){
  const R = [];
  const add = (d, c, v) => R.push([d, c, v]);
  [["07", 31], ["08", 31], ["09", 30], ["10", 31]].forEach(([m], k) => {
    add("01/" + m + "/2026", "ADEUDO BASIC-FIT SPAIN SA CUOTA SOCIO", "-29,99");
    add("03/" + m + "/2026", "COMPRA TARJ. 5402XXXXXXXX1234 AMAZON PRIME*2H7KQ1 LUXEMBOURG", "-4,99");
    add("05/" + m + "/2026", "COMPRA TARJ. 5402XXXXXXXX1234 NETFLIX.COM LOS GATOS", k < 2 ? "-13,99" : "-14,99");
    add("08/" + m + "/2026", "RECIBO MOVISTAR TELEFONICA DE ESPANA REF 20260" + (7 + k) + "08", "-45,90");
    add("12/" + m + "/2026", "COMPRA TARJ. 5402XXXXXXXX1234 SPOTIFY P2F8A1 STOCKHOLM", "-11,99");
    add("20/" + m + "/2026", "COMPRA TARJ. 5402XXXXXXXX1234 DISNEY PLUS AMSTERDAM", "-9,99");
    add("22/" + m + "/2026", "RECIBO IBERDROLA CLIENTES SAU LUZ", ["-58,20", "-61,40", "-59,75", "-63,10"][k]);
    add("28/" + m + "/2026", "NOMINA EMPRESA EJEMPLO SL", "1.850,00");
    ["02", "09", "16", "24"].forEach((d, j) => add(d + "/" + m + "/2026", "COMPRA TARJ. 5402XXXXXXXX1234 MERCADONA BARCELONA", "-" + [23.45, 67.8, 41.1, 88.35, 12.3, 54.9, 31.75, 76.2, 19.6, 62.45, 45.05, 93.4, 27.15, 58.6, 36.9, 71.3][k * 4 + j].toFixed(2).replace(".", ",")));
    add("1" + (4 + k) + "/" + m + "/2026", "PAGO BIZUM A AMIGO", "-" + [15, 32, 8, 25][k] + ",00");
    add("2" + (5 - k) + "/" + m + "/2026", "COMPRA TARJ. 5402XXXXXXXX1234 REPSOL ESTACION", "-" + [48.3, 61.9, 35.4, 70.2][k].toFixed(2).replace(".", ","));
  });
  add("31/07/2026", "COMISION MANTENIMIENTO CUENTA", "-15,00");
  add("31/10/2026", "COMISION MANTENIMIENTO CUENTA", "-15,00");
  add("15/07/2026", "RECIBO MAPFRE SEGUROS HOGAR", "-62,40");
  add("15/10/2026", "RECIBO MAPFRE SEGUROS HOGAR", "-62,40");
  add("18/08/2026", "COMPRA TARJ. 5402XXXXXXXX1234 AMAZON.ES MARKETPLACE", "-34,99");
  add("06/10/2026", "COMPRA TARJ. 5402XXXXXXXX1234 AMAZON.ES MARKETPLACE", "-21,50");
  R.sort((a, b) => parseDate(a[0]) - parseDate(b[0]));
  return "Fecha;Concepto;Importe;Saldo\n" + R.map(r => r.join(";") + ";").join("\n");
}

/* eventos */
const input = $("xFile"), drop = $("xDrop");
$("xPick").addEventListener("click", () => input.click());
input.addEventListener("change", () => { const f = input.files && input.files[0]; if (f) analyze(() => readFile(f)); input.value = ""; });
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("is-over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("is-over"); }));
drop.addEventListener("drop", e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) analyze(() => readFile(f)); });
$("xDemo").addEventListener("click", () => analyze(async () => fromRows(parseCSV(ejemplo()))));
$("xShare").addEventListener("click", () => share().catch(() => {}));
$("xIcs").addEventListener("click", ics);
$("xAgain").addEventListener("click", () => { found = []; $("xList").textContent = ""; msg($("xMsg"), ""); show("up"); });
window.FeehundExtracto = { parseCSV, fromRows, detect, ejemplo };
})();
