// Mi banco: «Gastos / Ingresos» arriba. Gastos es lo de siempre (Resumen y Gráficas); Ingresos tiene su Resumen y sus Gráficas
// con el mismo diseño. Ingresos = todo lo que entra en la cuenta, tal cual sale en el extracto: no se quita nada, solo se le pone
// nombre (Bizum, transferencia, nómina, Hacienda, efectivo, devolución). Cifras por mes reales; «al mes» = lo del extracto
// repartido entre los meses leídos. Escucha «fh-resultado» (después de graficas.js). Sin estilos ni scripts en línea (CSP).
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const LANG = ["es", "ca", "en"].indexOf(document.documentElement.lang) >= 0 ? document.documentElement.lang : "es";
  const nf0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: "always" });
  const nf2 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });
  const eur = (x) => nf0.format(Math.round(x)) + " €";
  const eurM = (x) => (Math.abs(x) < 10 ? nf2.format(x) + " €" : eur(x));

  const y = (L, conj) => (L.length > 1 ? L.slice(0, -1).join(", ") + conj + L[L.length - 1] : L[0] || "");
  const T = {
    es: {
      gastos: "Gastos", ingresos: "Ingresos", resumen: "Resumen", graficas: "Gráficas",
      entra: "Ingresas al mes", enTotal: (x) => x + " en total",
      queda: (x) => "De media te quedan " + x + " al mes.", pasa: (x) => "De media gastas " + x + " al mes más de lo que te entra.",
      deDonde: "De dónde viene", alMes: "Al mes", mesAMes: "Mes a mes", porMes: "En cada mes",
      veces: (n) => (n === 1 ? "1 vez" : n + " veces"), quedo: (x) => "Te quedaron " + x, falto: (x) => "Gastaste " + x + " más",
      desdeDia: (d) => "Desde el día " + d, hastaDia: (d) => "Hasta el día " + d, otras: (n) => "Otras " + n + " entradas",
      cada100: "De cada 100 € que te entran", entraL: "Entra", saleL: "Sale", mesTip: (m, a, b) => m + " · entra " + a + " · sale " + b,
      nada: "En este extracto no hay entradas de dinero.", waffle: "Cien cuadritos: cada uno es 1 € de cada 100 que te entran",
      tipos: { nomina: "Nómina", transfer: "Transferencia", bizum: "Bizum", hacienda: "Hacienda", ayudas: "Ayudas y pensiones", efectivo: "Efectivo", devolucion: "Devolución", otros: "Otros" },
      tiposP: { nomina: "Nóminas", transfer: "Transferencias", bizum: "Bizums", hacienda: "Hacienda", ayudas: "Ayudas y pensiones", efectivo: "Efectivo", devolucion: "Devoluciones", otros: "Otros" },
      efectivo: "Ingreso en efectivo", devolTarjeta: "Devoluciones de tu tarjeta", hacienda: "Hacienda",
      mesL: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
      meses: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
      cat: { alquiler: "Casa", suministros: "Suministros", casa: "Casa", susc: "Suscripciones", seg: "Seguros", fijo: "Préstamos e impuestos", banco: "Comisiones del banco", otrosF: "Otros pagos fijos" },
      balance: "Balance", quedaMes: "Te queda al mes", faltaMes: "Te falta al mes", enCuenta: "de media",
      fijosDe100: (x) => "De cada 100 € que ingresas, " + x + " van a pagos fijos.", entroL: "Ingresos", gastasteL: "Gastos", peso: "Lo que más pesó",
      hacer: "Qué hacer ahora", revisar: "Para revisar",
      cRevT: (sum) => (sum ? "Revisa las subidas de tus suministros" : "Revisa los cobros que han subido"), cRevL: (L, n) => (L.length ? y(L, " y ") + (L.length === 1 ? " te ha cobrado más algún mes." : " te han cobrado más algún mes.") : n === 1 ? "Hay 1 cosa para revisar." : "Hay " + n + " cosas para revisar."), cRevB: "Ver en Gastos",
      cLuzT: (n) => "Comprueba si " + n + " te cobra lo que gastas de verdad", cLuzL: (a, b) => "Unos meses pagas " + a + " y otros " + b + ". Puede que te estén estimando el consumo.",
      cSegT: (n) => "Compara precios antes de que " + n + " se renueve solo", cSegL: (x) => "Te cuesta " + x + " al año.",
      generales: "Consejos generales", gen: [["Paga todas tus suscripciones con la misma tarjeta", "Así no se te escapa ninguna y ves rápido quién te cobra."], ["Mira qué potencia de luz tienes contratada", "Si nunca llegas a usarla entera, bájala y pagarás menos cada mes."], ["Compara precios de tus suscripciones y recibos cada año", "Cambiarte de compañía puede bajar mucho lo que pagas."]],
      cada100In: "En un mes normal, de cada 100 € que ingresas", quedaL: "Te queda", faltaL: "Te falta", fijosIn: "Ingresos fijos al mes", yaNoIn: "Ingresos que ya no tienes",
      nFijos: (n, x) => (n === 0 ? "No tienes ningún ingreso fijo." : (n === 1 ? "Tienes 1 ingreso fijo: " : "Tienes " + n + " ingresos fijos: ") + x + " al mes."),
      diaPagan: "Qué día te pagan", diaN: (d) => "Día " + d, desdeM: (m) => "Desde " + m, ultimoM: (m) => "Último en " + m, pagosFijosL: "Pagos fijos",
      fijosMes: "Pagos fijos al mes", yaNoMes: "Lo que ya no pagas al mes", mesNormal: "Un mes normal", mesNormalD: "La media de lo que cambia cada mes",
      envios: "Envíos", superM: "Súper", fueraM: "Comer fuera", domicilioM: "Comida a domicilio", recibosCasa: "Suministros", compras: "Compras", verMas: (n) => "Ver " + n + " más", bizum: "Bizum", transfer: "Transferencia",
      cComidaT: () => "Reduce lo que gastas en comer fuera y pedir a domicilio", cComidaL: (x, y) => "Ahora se te van " + x + " al mes. Con la mitad, te ahorras " + y + ".",
      gastasMes: "Gastas al mes", alAnoTot: (x) => x + " al año", fijos: "Pagos fijos", diaDia: "Día a día", personas: "A otras personas", otrosP: "Otros pagos",
      sueltos: "Otros recibos de casa", sueltosD: "Luz, agua y teléfono sin fecha fija", comida: "Comida", comidaD: (a, b, c) => ["Súper " + a, "fuera " + b, "a domicilio " + c].join(" · "),
      ropa: "Ropa y belleza", ocio: "Ocio y deporte", transporte: "Transporte", salud: "Salud", online: "Compras por internet", tiendas: "Otras tiendas",
      tarjeta: "Tarjeta de crédito", impuestos: "Impuestos", comisiones: "Comisiones del banco", efectivoS: "Sacado del cajero", nose: "Sin identificar", otrasP: (n) => "Otras " + n + " personas",
      enviaste: (n) => (n === 1 ? "1 envío" : n + " envíos"), tocaMes: "Toca un mes para ver sus movimientos", gastaste: "Gastaste",
      verFechas: "Ver por fechas", ocultarFechas: "Ocultar fechas", dia: "Día", semana: "Semana", mes: "Mes", fecha: "Elige un día",
      entro: "Entró", salio: "Salió", quedoP: "Te quedó", ant: "Antes", sig: "Después",
      rDia: (d, m) => d + " de " + m, rSem: (a, b) => "Del " + a + " al " + b, fuera: "Esa fecha no está en tu extracto.", vacio: "No hay movimientos en estas fechas.",
    },
    ca: {
      gastos: "Despeses", ingresos: "Ingressos", resumen: "Resum", graficas: "Gràfics",
      entra: "Ingresses al mes", enTotal: (x) => x + " en total",
      queda: (x) => "De mitjana et queden " + x + " al mes.", pasa: (x) => "De mitjana gastes " + x + " al mes més del que t'entra.",
      deDonde: "D'on ve", alMes: "Al mes", mesAMes: "Mes a mes", porMes: "Cada mes",
      veces: (n) => (n === 1 ? "1 cop" : n + " cops"), quedo: (x) => "Et van quedar " + x, falto: (x) => "Vas gastar " + x + " més",
      desdeDia: (d) => "Des del dia " + d, hastaDia: (d) => "Fins al dia " + d, otras: (n) => "Altres " + n + " entrades",
      cada100: "De cada 100 € que t'entren", entraL: "Entra", saleL: "Surt", mesTip: (m, a, b) => m + " · entra " + a + " · surt " + b,
      nada: "En aquest extracte no hi ha entrades de diners.", waffle: "Cent quadradets: cadascun és 1 € de cada 100 que t'entren",
      tipos: { nomina: "Nòmina", transfer: "Transferència", bizum: "Bizum", hacienda: "Hisenda", ayudas: "Ajuts i pensions", efectivo: "Efectiu", devolucion: "Devolució", otros: "Altres" },
      tiposP: { nomina: "Nòmines", transfer: "Transferències", bizum: "Bizums", hacienda: "Hisenda", ayudas: "Ajuts i pensions", efectivo: "Efectiu", devolucion: "Devolucions", otros: "Altres" },
      efectivo: "Ingrés en efectiu", devolTarjeta: "Devolucions de la teva targeta", hacienda: "Hisenda",
      mesL: ["gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost", "setembre", "octubre", "novembre", "desembre"],
      meses: ["gen", "febr", "març", "abr", "maig", "juny", "jul", "ag", "set", "oct", "nov", "des"],
      cat: { alquiler: "Casa", suministros: "Subministraments", casa: "Casa", susc: "Subscripcions", seg: "Assegurances", fijo: "Préstecs i impostos", banco: "Comissions del banc", otrosF: "Altres pagaments fixos" },
      balance: "Balanç", quedaMes: "Et queda al mes", faltaMes: "Et falta al mes", enCuenta: "de mitjana",
      fijosDe100: (x) => "De cada 100 € que ingresses, " + x + " van a pagaments fixos.", entroL: "Ingressos", gastasteL: "Despeses", peso: "El que més va pesar",
      hacer: "Què fer ara", revisar: "Per revisar",
      cRevT: (sum) => (sum ? "Revisa les pujades dels teus subministraments" : "Revisa els cobraments que han pujat"), cRevL: (L, n) => (L.length ? y(L, " i ") + (L.length === 1 ? " t'ha cobrat més algun mes." : " t'han cobrat més algun mes.") : n === 1 ? "Hi ha 1 cosa per revisar." : "Hi ha " + n + " coses per revisar."), cRevB: "Veure a Despeses",
      cLuzT: (n) => "Comprova si " + n + " et cobra el que gastes de debò", cLuzL: (a, b) => "Uns mesos pagues " + a + " i d'altres " + b + ". Potser t'estan estimant el consum.",
      cSegT: (n) => "Compara preus abans que " + n + " es renovi sol", cSegL: (x) => "Et costa " + x + " l'any.",
      generales: "Consells generals", gen: [["Paga totes les subscripcions amb la mateixa targeta", "Així no se t'escapa cap i veus ràpid qui et cobra."], ["Mira quina potència de llum tens contractada", "Si mai arribes a fer-la servir sencera, abaixa-la i pagaràs menys cada mes."], ["Compara preus de les subscripcions i rebuts cada any", "Canviar de companyia pot abaixar molt el que pagues."]],
      cada100In: "En un mes normal, de cada 100 € que ingresses", quedaL: "Et queda", faltaL: "Et falta", fijosIn: "Ingressos fixos al mes", yaNoIn: "Ingressos que ja no tens",
      nFijos: (n, x) => (n === 0 ? "No tens cap ingrés fix." : (n === 1 ? "Tens 1 ingrés fix: " : "Tens " + n + " ingressos fixos: ") + x + " al mes."),
      diaPagan: "Quin dia et paguen", diaN: (d) => "Dia " + d, desdeM: (m) => "Des " + (/^[aeiou]/.test(m) ? "d'" : "de ") + m, ultimoM: (m) => "L'últim " + (/^[aeiou]/.test(m) ? "a l'" : "al ") + m, pagosFijosL: "Pagaments fixos",
      fijosMes: "Pagaments fixos al mes", yaNoMes: "El que ja no pagues al mes", mesNormal: "Un mes normal", mesNormalD: "La mitjana del que canvia cada mes",
      envios: "Enviaments", superM: "Súper", fueraM: "Menjar fora", domicilioM: "Menjar a domicili", recibosCasa: "Subministraments", compras: "Compres", verMas: (n) => "Veure'n " + n + " més", bizum: "Bizum", transfer: "Transferència",
      cComidaT: () => "Redueix el que gastes en menjar fora i demanar a domicili", cComidaL: (x, y) => "Ara se te'n van " + x + " al mes. Amb la meitat, t'estalvies " + y + ".",
      gastasMes: "Gastes al mes", alAnoTot: (x) => x + " l'any", fijos: "Pagaments fixos", diaDia: "Dia a dia", personas: "A altres persones", otrosP: "Altres pagaments",
      sueltos: "Altres rebuts de casa", sueltosD: "Llum, aigua i telèfon sense data fixa", comida: "Menjar", comidaD: (a, b, c) => ["Súper " + a, "fora " + b, "a domicili " + c].join(" · "),
      ropa: "Roba i bellesa", ocio: "Oci i esport", transporte: "Transport", salud: "Salut", online: "Compres per internet", tiendas: "Altres botigues",
      tarjeta: "Targeta de crèdit", impuestos: "Impostos", comisiones: "Comissions del banc", efectivoS: "Tret del caixer", nose: "Sense identificar", otrasP: (n) => "Altres " + n + " persones",
      enviaste: (n) => (n === 1 ? "1 enviament" : n + " enviaments"), tocaMes: "Toca un mes per veure'n els moviments", gastaste: "Vas gastar",
      verFechas: "Veure per dates", ocultarFechas: "Amagar les dates", dia: "Dia", semana: "Setmana", mes: "Mes", fecha: "Tria un dia",
      entro: "Va entrar", salio: "Va sortir", quedoP: "Et va quedar", ant: "Abans", sig: "Després",
      rDia: (d, m) => d + (/^[aeiou]/.test(m) ? " d'" : " de ") + m, rSem: (a, b) => "Del " + a + " al " + b, fuera: "Aquesta data no és al teu extracte.", vacio: "No hi ha moviments en aquestes dates.",
    },
    en: {
      gastos: "Spending", ingresos: "Income", resumen: "Summary", graficas: "Charts",
      entra: "You earn each month", enTotal: (x) => x + " in total",
      queda: (x) => "On average you keep " + x + " a month.", pasa: (x) => "On average you spend " + x + " a month more than comes in.",
      deDonde: "Where it comes from", alMes: "A month", mesAMes: "Month by month", porMes: "Each month",
      veces: (n) => (n === 1 ? "1 time" : n + " times"), quedo: (x) => "You kept " + x, falto: (x) => "You spent " + x + " more",
      desdeDia: (d) => "From day " + d, hastaDia: (d) => "Until day " + d, otras: (n) => n + " other payments in",
      cada100: "Out of every 100 € that comes in", entraL: "In", saleL: "Out", mesTip: (m, a, b) => m + " · in " + a + " · out " + b,
      nada: "There is no money coming in on this statement.", waffle: "A hundred squares: each one is 1 € of every 100 that comes in",
      tipos: { nomina: "Salary", transfer: "Transfer", bizum: "Bizum", hacienda: "Tax office", ayudas: "Benefits and pensions", efectivo: "Cash", devolucion: "Refund", otros: "Other" },
      tiposP: { nomina: "Salary", transfer: "Transfers", bizum: "Bizum", hacienda: "Tax office", ayudas: "Benefits and pensions", efectivo: "Cash", devolucion: "Refunds", otros: "Other" },
      efectivo: "Cash deposit", devolTarjeta: "Refunds to your card", hacienda: "Tax office",
      mesL: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
      meses: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      cat: { alquiler: "Home", suministros: "Utilities", casa: "Home", susc: "Subscriptions", seg: "Insurance", fijo: "Loans and taxes", banco: "Bank fees", otrosF: "Other fixed payments" },
      balance: "Balance", quedaMes: "You keep each month", faltaMes: "You are short each month", enCuenta: "on average",
      fijosDe100: (x) => "Out of every 100 € you earn, " + x + " go to fixed payments.", entroL: "Income", gastasteL: "Spending", peso: "What weighed most",
      hacer: "What to do now", revisar: "To check",
      cRevT: (sum) => (sum ? "Check the price rises on your utilities" : "Check the charges that went up"), cRevL: (L, n) => (L.length ? y(L, " and ") + " charged you more some months." : n === 1 ? "There is 1 thing to check." : "There are " + n + " things to check."), cRevB: "See in Spending",
      cLuzT: (n) => "Check that " + n + " charges you for what you really use", cLuzL: (a, b) => "Some months you pay " + a + " and others " + b + ". They may be estimating your usage.",
      cSegT: (n) => "Compare prices before " + n + " renews on its own", cSegL: (x) => "It costs you " + x + " a year.",
      generales: "General tips", gen: [["Pay all your subscriptions with the same card", "That way none slips past you and you quickly see who charges you."], ["Check how much electricity power you have contracted", "If you never use all of it, lower it and you will pay less every month."], ["Compare prices on your subscriptions and bills every year", "Switching company can cut what you pay a lot."]],
      cada100In: "In a normal month, out of every 100 € you earn", quedaL: "You keep", faltaL: "You are short", fijosIn: "Fixed income each month", yaNoIn: "Income you no longer have",
      nFijos: (n, x) => (n === 0 ? "You have no fixed income." : (n === 1 ? "You have 1 fixed income: " : "You have " + n + " fixed incomes: ") + x + " a month."),
      diaPagan: "Which day you get paid", diaN: (d) => "Day " + d, desdeM: (m) => "Since " + m, ultimoM: (m) => "Last in " + m, pagosFijosL: "Fixed payments",
      fijosMes: "Fixed payments a month", yaNoMes: "What you no longer pay a month", mesNormal: "A normal month", mesNormalD: "The average of what changes each month",
      envios: "Payments to people", superM: "Supermarket", fueraM: "Eating out", domicilioM: "Food delivery", recibosCasa: "Utilities", compras: "Shopping", verMas: (n) => "See " + n + " more", bizum: "Bizum", transfer: "Transfer",
      cComidaT: () => "Cut back on eating out and ordering in", cComidaL: (x, y) => "Right now it is " + x + " a month. With half, you save " + y + ".",
      gastasMes: "You spend each month", alAnoTot: (x) => x + " a year", fijos: "Fixed payments", diaDia: "Day to day", personas: "To other people", otrosP: "Other payments",
      sueltos: "Other home bills", sueltosD: "Power, water and phone with no fixed date", comida: "Food", comidaD: (a, b, c) => ["Supermarket " + a, "eating out " + b, "delivery " + c].join(" · "),
      ropa: "Clothes and beauty", ocio: "Leisure and sport", transporte: "Transport", salud: "Health", online: "Online shopping", tiendas: "Other shops",
      tarjeta: "Credit card", impuestos: "Taxes", comisiones: "Bank fees", efectivoS: "Cash withdrawals", nose: "Not identified", otrasP: (n) => n + " other people",
      enviaste: (n) => (n === 1 ? "1 payment" : n + " payments"), tocaMes: "Tap a month to see its transactions", gastaste: "You spent",
      verFechas: "View by date", ocultarFechas: "Hide dates", dia: "Day", semana: "Week", mes: "Month", fecha: "Pick a day",
      entro: "In", salio: "Out", quedoP: "Left over", ant: "Before", sig: "After",
      rDia: (d, m) => m + " " + d, rSem: (a, b) => a + " to " + b, fuera: "That date is not on your statement.", vacio: "No transactions on these dates.",
    },
  }[LANG];
  const COLOR = { nomina: "#0E5E6F", transfer: "#3E8F9D", bizum: "#7FC1CC", hacienda: "#A8957A", ayudas: "#5E7F3A", efectivo: "#D9C7A5", devolucion: "#FFB238", otros: "#B9AC93" };

  // ---------- Qué es cada entrada: solo lo que dice el concepto ----------
  const limpio = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const titulo = (s) => limpio(s).toLowerCase().replace(/(^|[\s.(\/-])(\p{L})/gu, (a, b, c) => b + c.toUpperCase()).replace(/\b(Sl|Sa|Slu|Ab|Bv|Ltd|Inc)\b/g, (x) => x.toUpperCase());
  function quien(c) {
    const u = limpio(c).toUpperCase();
    let m;
    if (/N[ÓO]MINA/.test(u)) { m = u.match(/(?:TRANSFERENCIA(?: INMEDIATA)? DE|DE)\s+(.+?)(?:,| CONCEPTO|$)/); return { t: "nomina", n: m ? titulo(m[1]) : T.tipos.nomina }; }
    if (/\bAEAT\b|AGENCIA ESTATAL DE ADMIN|HACIENDA|A\.E\.A\.T/.test(u)) return { t: "hacienda", n: T.hacienda };
    if (/\bSEPE\b|SEGURIDAD SOCIAL|\bINSS\b|\bTGSS\b|PRESTACI[ÓO]N|PENSI[ÓO]N|INGRESO M[ÍI]NIMO/.test(u)) { m = u.match(/DE\s+(.+?)(?:,| CONCEPTO|$)/); return { t: "ayudas", n: m ? titulo(m[1]) : T.tipos.ayudas }; }
    if ((m = u.match(/^BIZUM DE\s+(.+?)(?: CONCEPTO|,|$)/))) return { t: "bizum", n: titulo(m[1]) };
    if (/INGRESO (EN )?EFECTIVO|DEP[ÓO]SITO EN EFECTIVO|INGRESO CAJERO/.test(u)) return { t: "efectivo", n: T.efectivo };
    if (/ABONO .*TARJETA|REGULARIZACI[ÓO]N|DEVOLUCI[ÓO]N|RETROCESI[ÓO]N|REEMBOLSO|ANULACI[ÓO]N/.test(u)) return { t: "devolucion", n: T.devolTarjeta };
    if ((m = u.match(/TRANSFERENCIA(?: INMEDIATA)?(?: RECIBIDA)? DE\s+(.+?)(?:,| CONCEPTO|$)/))) return { t: "transfer", n: titulo(m[1]) };
    return { t: "otros", n: titulo(u.replace(/\d[\d\/.\- ]{3,}/g, "").slice(0, 40)) || T.tipos.otros };
  }

  // Ingresos con las mismas reglas que Gastos: lo fijo (el mismo pagador, 3 meses o más y con ritmo) a su importe de
  // cada mes; lo que cambia, mes a mes con lo real; «Un mes normal» es su media. Lo fijo que se cortó, aparte.
  const NO_FIJO = ["devolucion", "hacienda", "efectivo", "otros"];
  const mediana = (L) => { const x = L.slice().sort((a, b) => a - b), n = x.length; return n ? (n % 2 ? x[(n - 1) / 2] : (x[n / 2 - 1] + x[n / 2]) / 2) : 0; };
  function calcular(r) {
    const per = (r.lectura && r.lectura.periodo) || {}, movs = (r.lectura && r.lectura.movimientos) || [];
    const meses = per.meses || 12;
    const lista = [];
    if (per.desde && per.hasta) { let [y, mm] = per.desde.slice(0, 7).split("-").map(Number); const fin = per.hasta.slice(0, 7); for (let n = 0; n < 40; n++) { const k = y + "-" + String(mm).padStart(2, "0"); lista.push({ k, e: 0, s: 0, cub: {}, v: 0 }); if (k >= fin) break; mm++; if (mm > 12) { mm = 1; y++; } } }
    const idx = {}; lista.forEach((m, i) => { idx[m.k] = i; });
    const pag = {};
    movs.forEach((m) => {
      const k = String(m.fecha || "").slice(0, 7); if (idx[k] == null || !m.importe) return;
      const x = lista[idx[k]];
      if (m.importe < 0) { x.s -= m.importe; return; }
      x.e += m.importe;
      const q = quien(m.concepto), key = q.t + "|" + q.n.toUpperCase();
      const p = pag[key] || (pag[key] = { t: q.t, n: q.n, movs: [], porMes: {} }); p.movs.push(m); p.porMes[k] = (p.porMes[k] || 0) + m.importe;
    });
    const fijos = [], yaNo = [], todo = {};
    const meter = (cub, p, m) => { const x = cub[p.t] || (cub[p.t] = { k: p.t, n: T.tiposP[p.t], v: 0, c: 0, movs: [] }); x.v += m.importe; x.c++; x.movs.push(m); };
    Object.values(pag).forEach((p) => {
      const mk = Object.keys(p.porMes).sort(), n = mk.length, span = n ? idx[mk[n - 1]] - idx[mk[0]] + 1 : 0;
      const med = mediana(mk.map((k) => p.porMes[k]));
      if (NO_FIJO.indexOf(p.t) < 0 && n >= 3 && n / span >= 0.5 && med >= 20) { // 20 €: el pádel de un amigo no es un ingreso fijo
        const it = { t: p.t, n: p.n, v: med, desde: mk[0], ultimo: mk[n - 1], movs: p.movs };
        (idx[it.ultimo] >= lista.length - 2 ? fijos : yaNo).push(it);
        return;
      }
      p.movs.forEach((m) => { const k = m.fecha.slice(0, 7); meter(lista[idx[k]].cub, p, m); meter(todo, p, m); lista[idx[k]].v += m.importe; });
    });
    fijos.sort((a, b) => b.v - a.v); yaNo.sort((a, b) => b.v - a.v);
    const fijosT = fijos.reduce((t, x) => t + x.v, 0), cambia = Object.values(todo).reduce((t, x) => t + x.v, 0) / meses;
    return { meses, desde: per.desde, hasta: per.hasta, lista, fijos, yaNo, fijosT, cambia, entra: fijosT + cambia, todo };
  }

  // ---------- Aviso que sigue al dedo (el mismo de las gráficas de gastos) ----------
  let tipEl = null;
  function tip(e, t) {
    if (!tipEl) { tipEl = document.querySelector(".pg-tip") || document.createElement("div"); tipEl.className = "pg-tip"; tipEl.setAttribute("role", "status"); if (!tipEl.isConnected) document.body.appendChild(tipEl); }
    if (!t) { tipEl.classList.remove("on"); return; }
    const p = e.touches ? e.touches[0] : e; tipEl.textContent = t; tipEl.classList.add("on");
    const w = tipEl.offsetWidth;
    tipEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, p.clientX - w / 2)) + "px";
    tipEl.style.top = p.clientY - 56 + "px";
  }
  addEventListener("scroll", () => tip(null, ""), { passive: true });

  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const ini = (n, t) => { const s = el("span", "pg-logo pg-logo--ini", (n || "?").trim().charAt(0).toUpperCase()); s.style.background = COLOR[t]; return s; };
  const nombreMes = (k) => { const s = T.mesL[+k.slice(5, 7) - 1]; return s.charAt(0).toUpperCase() + s.slice(1); };
  const finDeMes = (f) => { const d = new Date(+f.slice(0, 4), +f.slice(5, 7), 0); return d.getDate(); };

  // ---------- Abrir y cerrar: en cada nivel (mes, apartado, grupo) solo uno abierto a la vez, en toda la página ----------
  const abiertos = {};
  function abrible(li, nivel, crear) {
    li.tabIndex = 0; li.setAttribute("role", "button"); li.setAttribute("aria-expanded", "false"); li.classList.add("pg-x--abre");
    let det = null;
    const cerrar = () => { if (det) { det.remove(); det = null; li.setAttribute("aria-expanded", "false"); } if (abiertos[nivel] === cerrar) abiertos[nivel] = null; };
    const abrir = (e) => {
      if (e) e.stopPropagation();
      if (det) { cerrar(); return; }
      if (abiertos[nivel]) abiertos[nivel]();
      det = crear(); li.after(det); li.setAttribute("aria-expanded", "true"); abiertos[nivel] = cerrar;
    };
    li.addEventListener("click", abrir); li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(e); } });
  }
  // ---------- Piezas comunes: la cifra grande, el recuadro y la lista de meses (la media no se toca) ----------
  function cabeza(box, label, valor, calc, caja, ok) {
    const top = el("div", "r3-top"); const pill = $("xMeses"); top.appendChild(el("span", "r3-meses", pill ? pill.textContent : "")); box.appendChild(top);
    box.appendChild(el("p", "r3-cifra-l", label));
    const fila = el("div", "pg-fila"); const cifra = el("p", "r3-cifra"); cifra.appendChild(el("span", null, valor));
    fila.append(cifra, el("p", "r3-calc", calc)); box.appendChild(fila);
    if (caja) { const c = el("p", "r3-escapo", caja); c.dataset.ok = ok ? "si" : "no"; box.appendChild(c); }
  }
  function seccionMeses(media, filas) {
    const sec = el("section", "r3-blq pg-res pg-mes"); sec.appendChild(el("h2", "r3-h", T.mesAMes));
    const ul = el("ul", "pg-rk pg-rk--sin"); const mx = Math.max(1, Math.abs(media.v), ...filas.map((f) => Math.abs(f.v)));
    const fila1 = (f, detalle) => {
      const li = el("li", detalle ? "pg-mes-f" : "pg-mes-media"); if (f.signo) li.classList.add(f.v < 0 ? "pg-neg" : "pg-pos");
      const nom = el("span", "pg-nom", f.t); if (f.sub) nom.appendChild(el("small", null, f.sub));
      const bar = el("span", "pg-bar"); const i = el("i"); i.style.width = Math.max(f.v ? 2 : 0, (Math.abs(f.v) / mx) * 100) + "%"; bar.appendChild(i);
      li.append(nom, el("span", "pg-val", f.txt), bar); ul.appendChild(li);
      if (!detalle) return;
      abrible(li, "mes", () => { const d = el("li", "pg-mes-d"); d.appendChild(detalle()); return d; });
    };
    fila1(media, null);
    filas.forEach((f) => fila1(f, f.detalle));
    sec.appendChild(ul); return sec;
  }
  const subMes = (L, n, desde, hasta) => {
    const parte = [];
    if (n === 0 && desde && +desde.slice(8, 10) > 1) parte.push(T.desdeDia(+desde.slice(8, 10)));
    if (n === L.length - 1 && hasta && +hasta.slice(8, 10) < finDeMes(hasta)) parte.push(T.hastaDia(+hasta.slice(8, 10)));
    return parte.join(" · ");
  };
  const mesL = (k) => T.mesL[+k.slice(5, 7) - 1];
  const logoIn = (it) => (it.t === "bizum" ? ICO_BIZUM("bizum") : ini(it.n, it.t));
  function listaFijos(L, ya) {
    const ul = el("ul", "pg-rk"); const max = Math.max(0.01, ...L.map((x) => x.v));
    L.forEach((x) => {
      const li = el("li"); li.appendChild(logoIn(x));
      const nom = el("span", "pg-nom", x.n);
      if (ya) nom.appendChild(el("small", null, T.ultimoM(mesL(x.ultimo))));
      else if (I && I.lista.length && x.desde > I.lista[Math.min(1, I.lista.length - 1)].k) nom.appendChild(el("small", null, T.desdeM(mesL(x.desde))));
      const bar = el("span", "pg-bar"); const i = el("i"); i.style.width = Math.max(2, (x.v / max) * 100) + "%"; bar.appendChild(i);
      li.append(nom, el("span", "pg-val", eurM(x.v)), bar); ul.appendChild(li);
    });
    return ul;
  }
  // Lo que entró un mes y no es fijo: por tipo (Transferencias, Bizums…); al tocar, los nombres
  function desgloseIn(cub) {
    const box = el("div", "pg-des"); const L = Object.values(cub).sort((a, b) => b.v - a.v);
    if (!L.length) { box.appendChild(el("p", "pg-k", T.vacio)); return box; }
    const ul = el("ul", "pg-rk pg-rk--sin"); const max = Math.max(...L.map((x) => x.v));
    L.forEach((x) => fila(ul, x, 0, max)); box.appendChild(ul); return box;
  }

  // ---------- Ingresos · Resumen: «¿Cuánto me entra y de dónde?» ----------
  function resumen(box, I) {
    box.textContent = "";
    if (!I.lista.some((m) => m.e)) { cabeza(box, T.entra, "0 €", "", T.nada, false); return; }
    cabeza(box, T.entra, eur(I.entra), T.alAnoTot(eur(I.entra * 12)), T.nFijos(I.fijos.length, eur(I.fijosT)), I.fijos.length > 0);
    if (I.fijos.length) { const sec = el("section", "r3-blq pg-res"); cabecera(sec, T.fijosIn, I.fijosT); sec.appendChild(listaFijos(I.fijos, false)); box.appendChild(sec); }
    if (I.yaNo.length) { const sec = el("section", "r3-blq pg-res"); sec.appendChild(el("h2", "r3-h", T.yaNoIn)); sec.appendChild(listaFijos(I.yaNo, true)); box.appendChild(sec); }
    box.appendChild(seccionMeses({ t: T.mesNormal, v: I.cambia, txt: eur(I.cambia) },
      I.lista.map((m, n) => ({ t: nombreMes(m.k) + " " + m.k.slice(0, 4), sub: subMes(I.lista, n, I.desde, I.hasta), v: m.v, txt: eur(m.v), detalle: () => desgloseIn(m.cub) }))));
  }

  // ---------- Ingresos · Gráficas ----------
  function graficas(gr, I) {
    gr.textContent = "";
    if (!I.lista.some((m) => m.e)) { gr.appendChild(el("p", "pg-k", T.nada)); return; }
    // En un mes normal, de cada 100 € que te entran: por tipo
    const porT = {}; I.fijos.forEach((x) => { porT[x.t] = (porT[x.t] || 0) + x.v; }); Object.values(I.todo).forEach((x) => { porT[x.k] = (porT[x.k] || 0) + x.v / I.meses; });
    const tipos = Object.keys(porT).map((t) => ({ t, v: porT[t] })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v), tot = tipos.reduce((a, x) => a + x.v, 0);
    const cnt = tipos.map((x) => Math.floor((x.v / tot) * 100)); let falta = 100 - cnt.reduce((a, b) => a + b, 0);
    tipos.map((x, i) => ({ i, r: (x.v / tot) * 100 - cnt[i] })).sort((a, b) => b.r - a.r).forEach((o) => { if (falta > 0) { cnt[o.i]++; falta--; } });
    const s1 = el("section", "pg-blq"); s1.appendChild(el("h3", "pg-h", T.cada100In));
    const wfz = el("div", "pg-wfz"), wf = el("div", "pg-wf"), wl = el("ul", "pg-wl"); wf.setAttribute("role", "img"); wf.setAttribute("aria-label", T.waffle);
    tipos.forEach((x, n) => {
      for (let k = 0; k < cnt[n]; k++) { const c = el("i"); c.style.background = COLOR[x.t]; wf.appendChild(c); }
      const li = el("li"); const tn = el("span", "pg-tn"); const sq = el("i"); sq.style.background = COLOR[x.t]; tn.append(sq, document.createTextNode(T.tiposP[x.t]));
      li.append(el("span", "pg-cnt", cnt[n] ? cnt[n] + " €" : "<1 €"), tn, el("span", "pg-val", eurM(x.v))); wl.appendChild(li);
    });
    wfz.append(wf, wl); s1.appendChild(wfz); gr.appendChild(s1);
    // Qué día te pagan: los ingresos fijos, por el día del mes en que suelen llegar
    if (I.fijos.length) {
      const s2 = el("section", "pg-blq pg-rel"); s2.appendChild(el("h3", "pg-h", T.diaPagan));
      const L = I.fijos.map((x) => { const c = {}; x.movs.forEach((m) => { const d = +m.fecha.slice(8, 10); c[d] = (c[d] || 0) + 1; }); return { d: +Object.keys(c).sort((a, b) => c[b] - c[a] || a - b)[0], x }; }).sort((a, b) => a.d - b.d);
      const ul = el("ul", "pg-rk pg-rk--sin");
      L.forEach(({ d, x }) => { const li = el("li"); const nom = el("span", "pg-nom", T.diaN(d)); nom.appendChild(el("small", null, x.n)); li.append(nom, el("span", "pg-val", eurM(x.v))); ul.appendChild(li); });
      s2.appendChild(ul); gr.appendChild(s2);
    }
  }

  // ---------- Mes a mes: cada mes real; al tocarlo se abren sus movimientos (en Gastos lo que sale, en Ingresos lo que entra) ----------
  let R = null, nombres = {};
  const fechaL = (f) => T.rDia(+f.slice(8, 10), T.mesL[+f.slice(5, 7) - 1]);
  // Nombre de cada movimiento: el del cobro si el motor lo reconoció; si no, el concepto sin «COMPRA EN», tarjeta ni fechas
  function nombreMov(m) {
    if (nombres[m.id]) return nombres[m.id];
    if (m.importe > 0) return quien(m.concepto).n;
    let u = limpio(m.concepto).toUpperCase();
    const fav = u.match(/A FAVOR DE\s+(.+?)(?:\s+CONCEPTO|,|$)/); if (fav) return titulo(fav[1]);
    u = u.replace(/^APPLE PAY:\s*/, "").replace(/^RECIBO (GC RE |DE )?/, "").replace(/ N[ºO°] RECIBO.*$| REF\. MANDATO.*$/, "").replace(/\*\s*\S+/g, "").replace(/\bWWW\./g, "").replace(/,? ?CON LA TARJETA.*$/, "").replace(/^(COMPRA|PAGO|COMPRAS?) (EN|DE) /, "").replace(/\b\d{4}-\d{2}-\d{2}\b/g, "").replace(/\d[\d\/.\- ]{5,}/g, "").replace(/ CONCEPTO.*$/, "");
    return titulo(u.slice(0, 48)) || "—";
  }
  // ---------- Gastos: «Gastas al mes» = Pagos fijos + un mes normal de lo que cambia ----------
  // Pagos fijos: lo que se repite, a su precio de cada mes. Lo que cambia (día a día, envíos y otros pagos)
  // va mes a mes, con lo real de cada mes; «Un mes normal» es su media. «Ya no pagas» no cuenta: ya no se paga.
  let G = null;
  const DIA = { super: "superM", fuera: "fueraM", domicilio: "domicilioM", ropa: "ropa", ocio: "ocio", suscr: "ocio", transporte: "transporte", salud: "salud", online: "online", otro: "tiendas" };
  const clave = (m) => m.fecha + "|" + m.importe + "|" + m.concepto;
  function calcGastos(r, todos) {
    const per = (r.lectura && r.lectura.periodo) || {}, meses = per.meses || 12, repe = window.FeehundRepe || { items: [], total: 0 };
    const porId = {}; (r.cobros || []).forEach((c) => { porId[c.id] = c; });
    const saltar = new Set(), tarjetas = new Set();
    (r.grupos || []).forEach((g) => { if (!(g.codigo.indexOf("sector_") === 0 || g.codigo === "recibos" || g.codigo === "comisiones")) return; (g.ids || []).forEach((id) => { const c = porId[id]; if (c && c.estado !== "terminado") (c.movimientos || []).forEach((m) => { saltar.add(clave(m)); const t = String(m.concepto || "").match(/TARJETA\s*:?\s*[.\s]*(\d{4})\b/i); if (t && c.tipo !== "comision") tarjetas.add(t[1]); }); }); });
    [].concat(r.terminados || [], (r.cobros || []).filter((c) => c.estado === "terminado")).forEach((c) => (c.movimientos || []).forEach((m) => saltar.add(clave(m))));
    // cada movimiento que cambia: su grupo (día a día, envíos, otros) y su apartado
    const meter = (cub, g, k, n, d, m) => { const G2 = cub[g] || (cub[g] = {}); const x = G2[k] || (G2[k] = { k, n, d, v: 0, c: 0, movs: [] }); x.v += -m.importe; x.c++; x.movs.push(m); };
    const porMes = {}, todo = {}, fijMes = {};
    todos.forEach((m) => {
      if (!(m.importe < 0) || !/^\d{4}-\d{2}/.test(m.fecha || "")) return;
      if (saltar.has(clave(m))) { const f = fijMes[m.fecha.slice(0, 7)] || (fijMes[m.fecha.slice(0, 7)] = { v: 0, movs: [] }); f.v -= m.importe; f.movs.push(m); return; }
      const u = String(m.concepto || "").toUpperCase(), sct = m.c && m.c.s;
      let g, k, n, d = null;
      if (sct !== "tarjeta" && /^BIZUM|^TRANSFERENCIA|^TRASPASO|A FAVOR DE/.test(u)) {
        const f = u.match(/A FAVOR DE\s+(.+?)(?:\s+CONCEPTO|,|$)/); n = f ? titulo(f[1]) : titulo(u.replace(/ CONCEPTO.*$/, "").slice(0, 36)); g = "envios"; k = n.toUpperCase(); d = /^BIZUM/.test(u) ? "bizum" : "transfer";
      } else if (/CAJERO|REINTEGRO|RETIRADA (DE )?EFECTIVO|DISPOSICION (DE )?EFECTIVO|\bATM\b/.test(u)) { g = "otros"; k = "efectivo"; n = T.efectivoS; }
      else if (sct === "tarjeta" || sct === "impuestos" || sct === "comisiones") { g = "otros"; k = sct; n = T[sct]; }
      else if (sct === "casa" || sct === "vivienda") { g = "otros"; k = "recibos"; n = T.recibosCasa; }
      else if (DIA[sct]) { g = "dia"; k = DIA[sct]; n = T[DIA[sct]]; }
      else { g = "otros"; k = "nose"; n = T.nose; }
      const mk = m.fecha.slice(0, 7); meter(porMes[mk] || (porMes[mk] = {}), g, k, n, d, m); meter(todo, g, k, n, d, m);
    });
    const sumaG = (cub) => Object.values(cub).reduce((t, G2) => t + Object.values(G2).reduce((a, x) => a + x.v, 0), 0);
    const fijos = repe.items.map((it) => ({ n: it.n, v: it.v / 12 }));
    const fijosT = fijos.reduce((t, x) => t + x.v, 0), cambia = sumaG(todo) / meses;
    // Para «De cada 100 €» (Gráficas): pagos fijos por tipo y lo que cambia por apartado, al mes
    const TIPO = { alquiler: ["vivienda", "hogar", "gastos_fijos"], suministros: ["telecos", "energia", "agua", "alarmas"], susc: ["streaming", "musica", "nube_apps", "ia", "prensa", "gimnasios", "citas", "videojuegos", "idiomas", "reparto", "suscripciones", "club_descuentos", "bienestar", "pasarelas"], seg: ["seguros"], fijo: ["tarjetas", "impuestos", "autonomos"] };
    const tipoDe = (it) => (it.com ? "banco" : Object.keys(TIPO).find((k) => TIPO[k].indexOf(it.cat) >= 0) || "otrosF");
    const cats = {}; const sumar = (k, n, v, q) => { const c = cats[k] || (cats[k] = { k, n, v: 0, quien: [] }); c.v += v; if (q && c.quien.indexOf(q) < 0) c.quien.push(q); };
    repe.items.forEach((it) => { const k = tipoDe(it); sumar(k, T.cat[k], it.v / 12, it.n); });
    Object.keys(todo).forEach((g) => Object.values(todo[g]).forEach((x) => {
      const k = g === "envios" ? "personas" : /^(superM|fueraM|domicilioM)$/.test(x.k) ? "comida" : x.k === "recibos" ? "suministros" : x.k === "impuestos" ? "fijo" : x.k === "comisiones" ? "banco" : x.k;
      sumar(k, g === "envios" ? T.envios : k === "comida" ? T.comida : T.cat[k] || x.n, x.v / meses, g === "envios" ? x.n : x.n);
    }));
    const lista = []; if (per.desde && per.hasta) { let [y, mm] = per.desde.slice(0, 7).split("-").map(Number); for (let n = 0; n < 40; n++) { const k = y + "-" + String(mm).padStart(2, "0"); lista.push({ k, cub: porMes[k] || {}, v: sumaG(porMes[k] || {}) }); if (k >= per.hasta.slice(0, 7)) break; mm++; if (mm > 12) { mm = 1; y++; } } }
    const comidaFuera = ((todo.dia && todo.dia.fueraM ? todo.dia.fueraM.v : 0) + (todo.dia && todo.dia.domicilioM ? todo.dia.domicilioM.v : 0)) / meses;
    const out = { meses, fijosT, cambia, total: fijosT + cambia, todo, lista, fijMes, desde: per.desde, hasta: per.hasta, tarjetas: tarjetas.size, comidaFuera, cats: Object.values(cats).filter((c) => c.v > 0).sort((a, b) => b.v - a.v) };
    window.FeehundGastosG = out; // para «De cada 100 €» de Gráficas (assets/extracto/graficas.js)
    return out;
  }
  // Cabecera de cada bloque: el título y lo que suma, en la misma fila
  function cabecera(sec, titulo, v, tag) { const c = el("div", "pg-cab"); c.append(el(tag || "h2", tag ? "pg-cab-h" : "r3-h", titulo), el("span", "pg-cab-v", eur(v))); sec.appendChild(c); return c; }
  const ICO_BIZUM = (d) => {
    if (d !== "bizum") return el("span", "pg-logo pg-logo--ini pg-logo--transfer", "T");
    const s = el("span", "pg-logo pg-logo--bizum"); const img = el("img"); img.alt = "Bizum"; img.width = 40; img.height = 40; img.decoding = "async";
    img.src = (document.querySelector("script[src*='ingresos.js']") || {}).src.replace(/assets\/extracto\/ingresos\.js.*$/, "assets/logos/bizum.png"); s.appendChild(img); return s;
  };
  // Un apartado (Súper, una persona…) que se abre y enseña sus movimientos (si los hay: la media no tiene)
  function fila(ul, x, div, max) {
    const li = el("li", "pg-x"); const conMovs = !div && x.movs && x.movs.length;
    if (x.d) li.appendChild(ICO_BIZUM(x.d));
    const nom = el("span", "pg-nom", x.n); if (x.d) nom.appendChild(el("small", null, (x.d === "bizum" ? T.bizum : T.transfer) + " · " + T.veces(x.c)));
    const v = x.v / (div || 1);
    const bar = el("span", "pg-bar"); const i = el("i"); i.style.width = Math.max(2, (v / max) * 100) + "%"; bar.appendChild(i);
    li.append(nom, el("span", "pg-val", eurM(v)), bar); if (x.d) li.classList.add("pg-x--logo"); ul.appendChild(li);
    if (!conMovs) return;
    abrible(li, "mov", () => {
      const det = el("li", "pg-x-d"); const dl = el("ul", "pg-rk pg-rk--sin pg-mes-l");
      x.movs.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).forEach((m) => { const l2 = el("li"); const nm = el("span", "pg-nom", nombreMov(m)); nm.appendChild(el("small", null, fechaL(m.fecha))); l2.append(nm, el("span", "pg-val", nf2.format(Math.abs(m.importe)) + " €")); dl.appendChild(l2); });
      det.appendChild(dl); return det;
    });
  }
  // Lo de un mes (o la media): Día a día, Envíos y Otros pagos, cada uno solo si tiene algo
  function desglose(cub, div) {
    const box = el("div", "pg-des");
    const suma = (g) => Object.values(cub[g] || {}).reduce((a, x) => a + x.v, 0);
    [["dia", T.compras], ["envios", T.envios], ["otros", T.otrosP]].sort((a, b) => suma(b[0]) - suma(a[0])).forEach(([g, t]) => {
      let L = Object.values(cub[g] || {}).filter((x) => x.v / (div || 1) >= 0.5).sort((a, b) => (a.k === "nose") - (b.k === "nose") || b.v - a.v);
      if (!L.length) return;
      // muchas personas con poco: las primeras cinco y el resto juntas
      if (g === "envios" && L.length > 6) { const r2 = L.slice(5); L = L.slice(0, 5).concat([{ k: "_resto", n: T.otrasP(r2.length), v: r2.reduce((a, x) => a + x.v, 0), c: 0, movs: [].concat(...r2.map((x) => x.movs)) }]); }
      const sec = el("div", "pg-des-b"); cabecera(sec, t, L.reduce((s, x) => s + x.v, 0) / (div || 1), "h3");
      const ul = el("ul", "pg-rk pg-rk--sin"); const max = Math.max(...L.map((x) => x.v / (div || 1)));
      L.forEach((x) => fila(ul, x, div, max)); sec.appendChild(ul); box.appendChild(sec);
    });
    return box;
  }
  function mesesGastos() {
    const sec = el("section", "r3-blq pg-res pg-mes"); sec.id = "pgMesG"; sec.appendChild(el("h2", "r3-h", T.mesAMes));
    const ul = el("ul", "pg-rk pg-rk--sin"); const mx = Math.max(1, G.cambia, ...G.lista.map((m) => m.v));
    const fila1 = (titulo, sub, v, cub, div) => {
      const li = el("li", cub ? "pg-mes-f" : "pg-mes-media"); if (cub) { li.tabIndex = 0; li.setAttribute("role", "button"); li.setAttribute("aria-expanded", "false"); }
      const nom = el("span", "pg-nom", titulo); if (sub) nom.appendChild(el("small", null, sub));
      const bar = el("span", "pg-bar"); const i = el("i"); i.style.width = Math.max(v ? 2 : 0, (v / mx) * 100) + "%"; bar.appendChild(i);
      li.append(nom, el("span", "pg-val", eur(v)), bar); ul.appendChild(li);
      if (!cub) return li;
      abrible(li, "mes", () => { const d = el("li", "pg-mes-d"); d.appendChild(desglose(cub, div)); return d; });
      return li;
    };
    fila1(T.mesNormal, null, G.cambia, null, 0);
    G.lista.forEach((m, n) => {
      const parte = [];
      if (n === 0 && G.desde && +G.desde.slice(8, 10) > 1) parte.push(T.desdeDia(+G.desde.slice(8, 10)));
      if (n === G.lista.length - 1 && G.hasta && +G.hasta.slice(8, 10) < finDeMes(G.hasta)) parte.push(T.hastaDia(+G.hasta.slice(8, 10)));
      fila1(nombreMes(m.k) + " " + m.k.slice(0, 4), parte.join(" · "), m.v, m.cub, 0);
    });
    sec.append(ul);
    return sec;
  }
  // Gastos: «Para revisar» (cobros dobles, subidas, recibos altos, bajas): tres a la vista y «Ver N más»
  function paraRevisar() {
    const ul = $("xAcciones"), h = $("xHacerH"); if (!ul) return;
    if (h) h.textContent = T.revisar;
    ul.querySelectorAll(".pg-consejo").forEach((x) => x.remove());
    const items = [...ul.children], mas = $("xMas");
    items.forEach((li, i) => { li.classList.toggle("r3-ac--mas", i >= 3); li.hidden = i >= 3; });
    if (mas) {
      const n = items.length - 3; mas.hidden = n <= 0; if (n > 0) { mas.textContent = T.verMas(n); mas.setAttribute("aria-expanded", "false"); }
      if (!mas.dataset.pgUnaVez) { mas.dataset.pgUnaVez = "1"; mas.addEventListener("click", () => setTimeout(() => { ul.querySelectorAll(".r3-ac--mas").forEach((li) => { li.hidden = false; }); mas.hidden = true; }, 0)); }
    }
  }
  // ---------- Balance: «¿Me llega o no me llega?» ----------
  const ICO_IDEA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>';
  const firmado = (x) => (x < 0 ? "−" : "+") + eur(Math.abs(x));
  // Qué hacer ahora: solo lo que se ve en su extracto, con su porqué. Cada consejo: [título, porqué, botón]
  function consejosBal() {
    const L = [];
    const vivos = (R.cobros || []).filter((c) => c.estado !== "terminado" && (c.movimientos || []).length >= 3);
    // Para revisar: si hay luz, agua o teléfono que han subido, se dice con sus nombres
    const rev = $("xAcciones") ? [...$("xAcciones").children].filter((li) => !li.classList.contains("pg-consejo")) : [];
    const SUM = /^(energia|agua|telecos)$/, sumN = (R.cobros || []).filter((c) => SUM.test(c.categoria)).map((c) => c.nombre);
    const subeSum = rev.map((li) => sumN.find((n) => li.textContent.indexOf(n + ":") === 0)).filter((n, i, a) => n && a.indexOf(n) === i);
    if (rev.length) L.push([T.cRevT(subeSum.length > 0), T.cRevL(subeSum, rev.length), [T.cRevB, irARevisar]]);
    // luz, gas o agua que cambia mucho de un mes a otro: puede ser una lectura estimada
    const luz = vivos.filter((c) => /^(energia|agua)$/.test(c.categoria)).map((c) => { const v = c.movimientos.map((m) => Math.abs(m.importe)); return { c, a: Math.min(...v), b: Math.max(...v) }; })
      .filter((x) => x.b - x.a >= 15 && x.b >= x.a * 1.5).sort((x, y) => y.b - y.a - (x.b - x.a))[0];
    if (luz) L.push([T.cLuzT(luz.c.nombre), T.cLuzL(eur(luz.a), eur(luz.b))]);
    if (G.comidaFuera >= 30) L.push([T.cComidaT(), T.cComidaL(eur(G.comidaFuera), eur(G.comidaFuera / 2))]);
    const items = window.FeehundRepe ? window.FeehundRepe.items : [];
    const seg = vivos.filter((c) => c.categoria === "seguros").map((c) => ({ c, v: (items.find((x) => x.n === c.nombre) || {}).v || 0 })).sort((x, y) => y.v - x.v)[0];
    if (seg && seg.v > 0) L.push([T.cSegT(seg.c.nombre), T.cSegL(eur(seg.v))]);
    return L;
  }
  // «Ver en Gastos»: abre Gastos, Resumen, y baja hasta «Para revisar»
  function irARevisar() {
    const b = document.querySelector('#pgMain button[data-m="g"]'); if (b) b.click();
    const r = document.querySelector('#pgTabs button[data-t="r"]'); if (r && r.getAttribute("aria-selected") !== "true") r.click();
    setTimeout(() => { const h = $("xHacerH"); if (h) h.scrollIntoView({ block: "start", behavior: "smooth" }); }, 80);
  }
  // Lo que entró un mes, por tipo (Transferencias, Bizums…), y lo que salió: pagos fijos, compras, envíos y otros pagos
  function ingresosDelMes(k) {
    const g = {}; ((R && R.lectura && R.lectura.movimientos) || []).forEach((m) => { if (!(m.importe > 0) || String(m.fecha).slice(0, 7) !== k) return; const t = quien(m.concepto).t; const x = g[t] || (g[t] = { n: T.tiposP[t], v: 0, c: 0, movs: [] }); x.v += m.importe; x.c++; x.movs.push(m); });
    return Object.values(g).sort((a, b) => b.v - a.v);
  }
  function gastosDelMes(k) {
    const out = [], gm = G.lista.find((m) => m.k === k), fij = G.fijMes[k];
    if (fij && fij.movs.length) out.push({ n: T.pagosFijosL, v: fij.v, c: fij.movs.length, movs: fij.movs });
    [["dia", T.compras], ["envios", T.envios], ["otros", T.otrosP]].forEach(([g, n]) => { const L = gm && gm.cub[g] ? Object.values(gm.cub[g]) : []; if (!L.length) return; const movs = [].concat(...L.map((x) => x.movs)); out.push({ n, v: L.reduce((a, x) => a + x.v, 0), c: movs.length, movs }); });
    return out.sort((a, b) => b.v - a.v);
  }
  function resumenBal(box) {
    box.textContent = "";
    if (!G || !I) { const top = el("div", "r3-top"); const pill = $("xMeses"); top.appendChild(el("span", "r3-meses", pill ? pill.textContent : "")); box.appendChild(top); return; }
    const entra = I.entra, queda = entra - G.total, pct = entra > 0 ? (G.fijosT / entra) * 100 : 0;
    cabeza(box, queda >= 0 ? T.quedaMes : T.faltaMes, eur(Math.abs(queda)), T.enCuenta, entra > 0 ? T.fijosDe100(eur(pct)) : null, pct < 50);
    const porMesG = {}; G.lista.forEach((m) => { porMesG[m.k] = m; });
    box.appendChild(seccionMeses({ t: T.mesNormal, v: queda, txt: firmado(queda) },
      I.lista.map((m, n) => {
        const d = m.e - m.s;
        return { t: nombreMes(m.k) + " " + m.k.slice(0, 4), sub: subMes(I.lista, n, I.desde, I.hasta), v: d, txt: firmado(d), signo: true, detalle: () => {
          const box2 = el("div", "pg-des"); const ul = el("ul", "pg-rk pg-rk--sin pg-bal-l");
          const fila2 = (titulo, v, grupos) => {
            const li = el("li"); li.append(el("span", "pg-nom", titulo), el("span", "pg-val", eur(v))); ul.appendChild(li);
            abrible(li, "fila", () => { const det = el("li", "pg-x-d"); const u2 = el("ul", "pg-rk pg-rk--sin"); const mx = Math.max(0.01, ...grupos.map((x) => x.v)); grupos.forEach((x) => fila(u2, x, 0, mx)); det.appendChild(u2); return det; });
          };
          fila2(T.entroL, m.e, ingresosDelMes(m.k));
          fila2(T.gastasteL, m.s, gastosDelMes(m.k));
          box2.appendChild(ul); return box2;
        } };
      })));
    const L = consejosBal();
    const lista = (titulo, datos) => {
      const sec = el("section", "r3-blq"); sec.appendChild(el("h2", "r3-h", titulo));
      const ul = el("ul", "r3-acciones");
      datos.forEach(([t, l, btn]) => {
        const li = el("li", "r3-ac"); const ic = el("span", "r3-ac-i"); ic.innerHTML = ICO_IDEA; const m = el("div", "r3-ac-m"); m.append(el("p", "r3-ac-t", t), el("p", "r3-ac-l", l)); li.append(ic, m);
        if (btn) { const b = el("button", "r3-btn", btn[0]); b.type = "button"; b.addEventListener("click", btn[1]); li.appendChild(b); }
        ul.appendChild(li);
      });
      sec.appendChild(ul); box.appendChild(sec);
    };
    if (L.length) lista(T.hacer, L);
    lista(T.generales, T.gen);
  }
  function graficasBal(gr) {
    gr.textContent = "";
    if (!G || !I) return;
    // En cada mes: lo que entra y lo que sale, columna por mes
    const s2 = el("section", "pg-blq pg-rel"); s2.appendChild(el("h3", "pg-h", T.porMes));
    const ley = el("p", "pg-ley"); [["pg-ley-e", T.entraL], ["pg-ley-s", T.saleL]].forEach(([c, t]) => { const x = el("span", c); x.appendChild(el("i")); x.appendChild(document.createTextNode(t)); ley.appendChild(x); });
    const mm = el("ul", "pg-mm"); const top = Math.max(1, ...I.lista.map((m) => Math.max(m.e, m.s)));
    I.lista.forEach((m) => {
      const li = el("li"); li.tabIndex = 0;
      const b = el("span", "pg-mm-b"); const e = el("i", "pg-mm-e"), x = el("i", "pg-mm-s");
      e.style.height = Math.max(m.e ? 2 : 0, (m.e / top) * 100) + "%"; x.style.height = Math.max(m.s ? 2 : 0, (m.s / top) * 100) + "%"; b.append(e, x);
      li.append(b, el("span", "pg-mm-m", T.meses[+m.k.slice(5, 7) - 1]));
      const t = T.mesTip(nombreMes(m.k), eur(m.e), eur(m.s));
      const on = (ev) => { li.classList.add("on"); tip(ev, t); }, off = () => { li.classList.remove("on"); tip(null, ""); };
      li.addEventListener("mousemove", on); li.addEventListener("mouseleave", off); li.addEventListener("touchstart", on, { passive: true }); li.addEventListener("blur", off);
      mm.appendChild(li);
    });
    s2.append(ley, mm); gr.appendChild(s2);
    // En un mes normal, de cada 100 € que te entran: a dónde va
    if (I.entra > 0) {
      const g = (k) => (G.todo[k] ? Object.values(G.todo[k]).reduce((a, x) => a + x.v, 0) / G.meses : 0);
      const queda = I.entra - G.total;
      const L = [[T.pagosFijosL, G.fijosT, "#0E5E6F"], [T.compras, g("dia"), "#C2603A"], [T.envios, g("envios"), "#14213D"], [T.otrosP, g("otros"), "#A8957A"], [queda >= 0 ? T.quedaL : T.faltaL, Math.abs(queda), queda >= 0 ? "#7FC1CC" : "#FFB238"]].filter((x) => x[1] >= 0.5).sort((a, b) => b[1] - a[1]);
      const s1 = el("section", "pg-blq"); s1.appendChild(el("h3", "pg-h", T.cada100In));
      const wl = el("ul", "pg-wl");
      const dentro = {};
      dentro[T.pagosFijosL] = (window.FeehundRepe ? window.FeehundRepe.items : []).map((x) => [x.n, x.v / 12]);
      [["dia", T.compras], ["envios", T.envios], ["otros", T.otrosP]].forEach(([k, n]) => { dentro[n] = Object.values(G.todo[k] || {}).map((x) => [x.n, x.v / G.meses]); });
      L.forEach(([n, v, c]) => {
        const li = el("li"); const tn = el("span", "pg-tn"); const sq = el("i"); sq.style.background = c; tn.append(sq, document.createTextNode(n)); li.append(el("span", "pg-cnt", Math.round((v / I.entra) * 100) + " €"), tn, el("span", "pg-val", eurM(v))); wl.appendChild(li);
        const sub = (dentro[n] || []).filter((x) => x[1] >= 0.5).sort((a, b) => b[1] - a[1]);
        if (sub.length) abrible(li, "graf", () => { const d = el("li", "pg-wl-sub"); const u = el("ul"); sub.forEach(([a, b]) => { const l2 = el("li"); l2.append(el("span", null, a), el("span", "pg-val", eurM(b))); u.appendChild(l2); }); d.appendChild(u); return d; });
      });
      s1.appendChild(wl); gr.appendChild(s1);
    }
  }
  function pintarGastos() {
    if (!G) return;
    const L = $("xCifraL"), C = $("xCifra"), K = $("xCalc");
    const poner = () => { if (L) L.textContent = T.gastasMes; if (C) C.textContent = eur(G.total); if (K) { K.textContent = T.alAnoTot(eur(G.total * 12)); K.hidden = false; } };
    poner(); setTimeout(poner, 900); // después de que la cifra de siempre termine de subir
    // Pagos fijos: el bloque «Sigues pagando» de graficas.js, con su suma en la cabecera
    const pr = $("pgRes");
    if (pr && !pr.querySelector(".pg-cab")) { const h = pr.querySelector(".r3-h"); const c = el("div", "pg-cab"); h.before(c); h.textContent = T.fijosMes; c.append(h, el("span", "pg-cab-v", eur(G.fijosT))); }
    const fin = $("pgFin");
    if (fin && !fin.querySelector(".pg-cab")) { const h = fin.querySelector(".r3-h"); h.textContent = T.yaNoMes; }
    ["pgDia", "pgPer", "pgOtr", "pgMesG"].forEach((id) => { const v = $(id); if (v) v.remove(); });
    const xr = $("xResto"); if (xr) xr.hidden = true; // ahora va dentro de cada mes
    const ancla = fin || pr || $("xEscapo"); if (ancla) ancla.after(mesesGastos());
    paraRevisar();
  }

  // ---------- Pestañas: Balance · Gastos · Ingresos arriba; Resumen / Gráficas dentro de cada una ----------
  let I = null, actual = "b", refrescar = () => {};
  function panel(id, sub) {
    const box = el("div", "pg-in"); box.id = id;
    const tabs = el("div", "pg-tabs pg-tabs--sub"); tabs.setAttribute("role", "tablist");
    [["r", T.resumen], ["g", T.graficas]].forEach(([k, t]) => { const b = el("button", null, t); b.type = "button"; b.setAttribute("role", "tab"); b.dataset.t = k; tabs.appendChild(b); });
    const rr = el("div", "r3 pg-inr"), gg = el("div", "pg");
    box.append(tabs, rr, gg);
    box.ver = (g) => { tabs.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String((x.dataset.t === "g") === g))); rr.hidden = g; gg.hidden = !g; box.g = g; sub(g, g ? gg : rr); };
    tabs.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; box.ver(b.dataset.t === "g"); });
    return box;
  }
  function montar() {
    const res = $("xRes"), tabsG = $("pgTabs"), r3 = res && res.querySelector(".r3"), grG = $("pgGr");
    if (!tabsG || !r3 || !grG) return;
    tabsG.classList.add("pg-tabs--sub"); // Resumen / Gráficas: más pequeñas, van dentro de cada pestaña
    let main = $("pgMain"), inn = $("pgIn"), bal = $("pgBal");
    if (!main) {
      main = el("div", "pg-tabs pg-main pg-main--3"); main.id = "pgMain"; main.setAttribute("role", "tablist");
      [["b", T.balance], ["g", T.gastos], ["i", T.ingresos]].forEach(([k, t]) => { const b = el("button", null, t); b.type = "button"; b.setAttribute("role", "tab"); b.dataset.m = k; main.appendChild(b); });
      tabsG.before(main);
      bal = panel("pgBal", (g, box) => (g ? graficasBal(box) : resumenBal(box)));
      inn = panel("pgIn", (g, box) => (g ? graficas(box, I) : resumen(box, I)));
      main.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; elegir(b.dataset.m); main.scrollIntoView({ block: "start", behavior: "smooth" }); });
    }
    let antes = null;
    const elegir = (m) => {
      actual = m;
      main.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.m === m)));
      if (m === "g") {
        tabsG.hidden = false; inn.hidden = true; bal.hidden = true;
        if (antes) { r3.hidden = antes.r3; grG.hidden = antes.gr; antes = null; }
        return;
      }
      if (!antes) antes = { r3: r3.hidden, gr: grG.hidden };
      if (grG.nextElementSibling !== bal) grG.after(bal); // donde está Gastos, antes del chat
      if (bal.nextElementSibling !== inn) bal.after(inn);
      tabsG.hidden = true; r3.hidden = true; grG.hidden = true;
      bal.hidden = m !== "b"; inn.hidden = m !== "i";
      const chat = $("tqcIa"); if (chat && chat.parentNode === res && !matchMedia("(min-width:1100px)").matches && inn.nextElementSibling !== chat) inn.after(chat);
      (m === "b" ? bal : inn).ver(false);
    };
    refrescar = () => { if (actual === "b") bal.ver(!!bal.g); };
    elegir("b"); // cada lectura nueva empieza en Balance
  }

  document.addEventListener("fh-gastos", (e) => {
    const d = e.detail; if (!d || !d.r) return;
    try { G = calcGastos(d.r, d.todos || []); pintarGastos(); refrescar(); } catch (err) { /* Gastos sigue como antes */ }
  });
  document.addEventListener("fh-resultado", (e) => {
    const r = e.detail; if (!r) return;
    try {
      R = r; nombres = {}; G = null; window.FeehundGastosG = null;
      [...(r.cobros || []), ...(r.gastos_fijos || []), ...(r.terminados || [])].forEach((c) => (c.movimientos || []).forEach((m) => { if (m.id != null) nombres[m.id] = c.nombre; }));
      I = calcular(r); montar();
    } catch (err) { /* si algo falla, Gastos sigue como siempre */ }
  });
})();
