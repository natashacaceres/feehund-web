// Página de prueba del lector de extractos: conecta la API de assets/extracto/motor.js con una interfaz mínima
// para que Design vea cada estado (elegir o pegar, contraseña, columnas, revisar una foto y resultado).
// Sin estilos ni scripts en línea (la CSP los bloquea). Nada se guarda: todo vive en memoria hasta «Olvidar todo».
// Los textos del archivo se pintan siempre con textContent, nunca como HTML.
//
// Recorrido de la API que sigue esta página (lo mismo que tendrá que hacer la interfaz definitiva):
//   analizar(archivos | texto | {archivos, texto}, {idioma, contrasenas, mapeo, onProgreso}) → resultado
//   necesita_contrasena → otra vez analizar() con contrasenas {[archivo]: clave}
//   necesita_mapeo → otra vez analizar() con mapeo {[archivo]: {fila_cabecera, columnas, hoja?}}
//   necesita_confirmacion → confirmar(resultado, [{id, fecha?, concepto?, importe?, quitar?}])
//   recalcular(resultado, idsDesmarcados) · generarICS(resultado, {desmarcados}) · generarImagenCompartir(total, {idioma})
//   registrarSinConexion() · onEstadoSinConexion(cb) · estadoSinConexion() · pedirOcrSinConexion() · olvidar()
import * as motor from '/assets/extracto/motor.js';

// ---------- Textos de la página: [es, ca, en] ----------
const T = {
  titulo: ['Lector de extractos', "Lector d'extractes", 'Statement reader'],
  prueba: ['página de prueba', 'pàgina de prova', 'test page'],
  intro: ['Página de prueba del motor. Tus archivos se leen en este dispositivo y no se envían a ningún sitio.', "Pàgina de prova del motor. Els teus fitxers es llegeixen en aquest dispositiu i no s'envien enlloc.", 'Test page for the engine. Your files are read on this device and are not sent anywhere.'],
  saltar: ['Saltar al contenido', 'Salta al contingut', 'Skip to content'],
  idioma: ['Idioma', 'Idioma', 'Language'],
  archivos: ['Tus extractos', 'Els teus extractes', 'Your statements'],
  soltar: ['Suelta aquí los archivos del banco', 'Deixa anar aquí els fitxers del banc', 'Drop your bank files here'],
  formatos: ['Excel, CSV, Norma 43, OFX, QIF, camt.053, MT940, ZIP, PDF o fotos. Hasta 10 MB por archivo.', 'Excel, CSV, Norma 43, OFX, QIF, camt.053, MT940, ZIP, PDF o fotos. Fins a 10 MB per fitxer.', 'Excel, CSV, Norma 43, OFX, QIF, camt.053, MT940, ZIP, PDF or photos. Up to 10 MB per file.'],
  elegir: ['Elegir archivos', 'Tria fitxers', 'Choose files'],
  pegar: ['O pega aquí los movimientos copiados de la web del banco', 'O enganxa aquí els moviments copiats del web del banc', "Or paste here the transactions copied from your bank's website"],
  analizar: ['Analizar', 'Analitza', 'Analyse'],
  ejemplo: ['Probar con un extracto de ejemplo', "Prova amb un extracte d'exemple", 'Try a sample statement'],
  olvidar: ['Olvidar todo', 'Oblida-ho tot', 'Forget everything'],
  nada: ['Elige un archivo o pega movimientos para empezar.', 'Tria un fitxer o enganxa moviments per començar.', 'Choose a file or paste transactions to start.'],
  analizando: ['Analizando…', 'Analitzant…', 'Analysing…'],
  leyendo: ['Leyendo {archivo}…', 'Llegint {archivo}…', 'Reading {archivo}…'],
  pagina: ['Leyendo {archivo}, página {pagina} de {total}…', 'Llegint {archivo}, pàgina {pagina} de {total}…', 'Reading {archivo}, page {pagina} of {total}…'],
  hecho: ['Listo. {n} cobro que se repite. Los seguros suman {total} al año.|Listo. {n} cobros que se repiten. Los seguros suman {total} al año.', "Fet. {n} cobrament que es repeteix. Els segurs sumen {total} l'any.|Fet. {n} cobraments que es repeteixen. Els segurs sumen {total} l'any.", 'Done. {n} repeating charge. The sure ones add up to {total} a year.|Done. {n} repeating charges. The sure ones add up to {total} a year.'],
  fallo: ['Algo ha fallado. No se ha enviado nada a ningún sitio. Prueba otra vez.', "Alguna cosa ha fallat. No s'ha enviat res enlloc. Torna-ho a provar.", 'Something went wrong. Nothing was sent anywhere. Please try again.'],
  sin_motor: ['El lector no está disponible. Recarga la página.', 'El lector no està disponible. Torna a carregar la pàgina.', 'The reader is not available. Reload the page.'],
  ej_no: ['No hemos podido abrir el ejemplo.', "No hem pogut obrir l'exemple.", 'We could not open the sample.'],
  olvidado: ['Hemos borrado todo lo de esta página.', "Hem esborrat tot el d'aquesta pàgina.", 'Everything on this page has been cleared.'],
  red_prep: ['Preparando para usar sin conexión…', 'Preparant per fer-la servir sense connexió…', 'Getting ready to work offline…'],
  red_ok: ['Lista para usar sin conexión.', 'A punt per fer-la servir sense connexió.', 'Ready to use offline.'],
  red_ocr: ['Lista para usar sin conexión, también con fotos.', 'A punt per fer-la servir sense connexió, també amb fotos.', 'Ready to use offline, photos included.'],
  red_no: ['Este navegador no puede guardar la página para usarla sin conexión.', 'Aquest navegador no pot desar la pàgina per fer-la servir sense connexió.', 'This browser cannot save the page to use it offline.'],
  red_nueva: ['Hay una versión nueva. Se usará cuando cierres esta página y la vuelvas a abrir.', 'Hi ha una versió nova. Es farà servir quan tanquis aquesta pàgina i la tornis a obrir.', 'There is a new version. It will be used when you close this page and open it again.'],
  pw_t: ['Este PDF tiene contraseña', 'Aquest PDF té contrasenya', 'This PDF has a password'],
  pw_p: ['La contraseña solo se usa para abrir el archivo en este dispositivo.', 'La contrasenya només serveix per obrir el fitxer en aquest dispositiu.', 'The password is only used to open the file on this device.'],
  pw_de: ['Contraseña de {archivo}', 'Contrasenya de {archivo}', 'Password for {archivo}'],
  pw_mal: ['La contraseña de {archivo} no es correcta. Prueba otra vez.', 'La contrasenya de {archivo} no és correcta. Torna-ho a provar.', 'The password for {archivo} is not correct. Try again.'],
  abrir: ['Abrir', 'Obre', 'Open'],
  map_t: ['Dinos qué hay en cada columna', 'Digues-nos què hi ha a cada columna', 'Tell us what each column holds'],
  map_p: ['No hemos reconocido las columnas de {archivo}. Elige la de la fecha, la del concepto y la del importe, o las de cargo y abono.', "No hem reconegut les columnes de {archivo}. Tria la de la data, la del concepte i la de l'import, o les de càrrec i abonament.", 'We did not recognise the columns in {archivo}. Choose the date, the description and the amount, or debit and credit.'],
  cabecera: ['Fila de títulos', 'Fila de títols', 'Header row'],
  ninguna: ['Ninguna', 'Cap', 'None'],
  fila_n: ['Fila {n}', 'Fila {n}', 'Row {n}'],
  col_n: ['Columna {n}', 'Columna {n}', 'Column {n}'],
  r_: ['Nada', 'Res', 'Nothing'],
  r_fecha: ['Fecha', 'Data', 'Date'],
  r_concepto: ['Concepto', 'Concepte', 'Description'],
  r_importe: ['Importe', 'Import', 'Amount'],
  r_cargo: ['Cargo', 'Càrrec', 'Debit'],
  r_abono: ['Abono', 'Abonament', 'Credit'],
  r_saldo: ['Saldo', 'Saldo', 'Balance'],
  r_fecha_valor: ['Fecha valor', 'Data valor', 'Value date'],
  r_divisa: ['Moneda', 'Moneda', 'Currency'],
  map_falta: ['Falta elegir la fecha, el concepto o el importe.', "Falta triar la data, el concepte o l'import.", 'Choose the date, the description and the amount.'],
  map_doble: ['Has elegido dos columnas para {rol}.', 'Has triat dues columnes per a {rol}.', 'You chose two columns for {rol}.'],
  map_ok: ['Analizar con estas columnas', 'Analitza amb aquestes columnes', 'Analyse with these columns'],
  conf_t: ['Revisa lo que hemos leído', 'Revisa el que hem llegit', 'Check what we read'],
  conf_p: ['Lo hemos leído de una foto o de un PDF escaneado. Corrige lo que no esté bien. Las filas marcadas con «Revisar» son las que menos claras se ven.', "Ho hem llegit d'una foto o d'un PDF escanejat. Corregeix el que no estigui bé. Les files marcades amb «Revisa» són les que es veuen menys clares.", 'We read this from a photo or a scanned PDF. Fix anything that is wrong. Rows marked «Check» are the least clear.'],
  conf_tabla: ['Movimientos leídos', 'Moviments llegits', 'Transactions read'],
  revisar: ['Revisar', 'Revisa', 'Check'],
  quitar: ['Quitar', 'Treu', 'Remove'],
  confirmar: ['Confirmar', 'Confirma', 'Confirm'],
  imp_mal: ['No entendemos el importe de la fila {n}.', "No entenem l'import de la fila {n}.", 'We do not understand the amount in row {n}.'],
  campo: ['{campo} de la fila {n}', '{campo} de la fila {n}', '{campo} in row {n}'],
  c_origen: ['De dónde sale', "D'on surt", 'Where it comes from'],
  origen: ['{archivo}, fila {fila}', '{archivo}, fila {fila}', '{archivo}, row {fila}'],
  origen_p: ['{archivo}, página {pagina}, fila {fila}', '{archivo}, pàgina {pagina}, fila {fila}', '{archivo}, page {pagina}, row {fila}'],
  res_t: ['Resultado', 'Resultat', 'Result'],
  periodo: ['Periodo', 'Període', 'Period'],
  periodo_v: ['Del {desde} al {hasta}, {meses} meses', 'Del {desde} al {hasta}, {meses} mesos', 'From {desde} to {hasta}, {meses} months'],
  saldo: ['Saldo', 'Saldo', 'Balance'],
  v_verificada: ['Verificado. Todas las filas cuadran con el saldo.', 'Verificat. Totes les files quadren amb el saldo.', 'Verified. Every row matches the balance.'],
  v_no_cuadra: ['No cuadra {n} fila con el saldo.|No cuadran {n} filas con el saldo.', 'No quadra {n} fila amb el saldo.|No quadren {n} files amb el saldo.', '{n} row does not match the balance.|{n} rows do not match the balance.'],
  vc_verificada: ['saldo verificado', 'saldo verificat', 'balance verified'],
  vc_no_cuadra: ['el saldo no cuadra', 'el saldo no quadra', 'balance does not match'],
  vc_sin_verificar: ['sin verificar', 'sense verificar', 'not verified'],
  v_sin_verificar: ['Sin verificar. El archivo no trae saldo.', 'Sense verificar. El fitxer no porta saldo.', 'Not verified. The file has no balance.'],
  lectura: ['Lectura', 'Lectura', 'Reading'],
  nivel_A: ['datos del banco', 'dades del banc', 'bank data'],
  nivel_B: ['PDF con texto', 'PDF amb text', 'PDF with text'],
  nivel_C: ['foto o PDF escaneado', 'foto o PDF escanejat', 'photo or scanned PDF'],
  n_mov: ['{n} movimiento|{n} movimientos', '{n} moviment|{n} moviments', '{n} transaction|{n} transactions'],
  dup: ['{n} repetido quitado|{n} repetidos quitados', '{n} repetit tret|{n} repetits trets', '{n} duplicate removed|{n} duplicates removed'],
  nc_t: ['Filas que no cuadran', 'Files que no quadren', 'Rows that do not match'],
  nc_ant: ['Saldo anterior', 'Saldo anterior', 'Previous balance'],
  nc_esp: ['Saldo esperado', 'Saldo esperat', 'Expected balance'],
  nc_leido: ['Saldo leído', 'Saldo llegit', 'Balance read'],
  avisos: ['Avisos', 'Avisos', 'Notes'],
  errores: ['Algo no ha ido bien', 'Alguna cosa no ha anat bé', 'Something did not go well'],
  json: ['Ver los datos que devuelve el motor', 'Mostra les dades que retorna el motor', 'Show the data the engine returns'],
  t_seguro: ['Cobros seguros al año', "Cobraments segurs a l'any", 'Sure charges per year'],
  t_posible: ['Posibles, aparte', 'Possibles, a part', 'Possible, not included'],
  cobros: ['Cobros que se repiten', 'Cobraments que es repeteixen', 'Repeating charges'],
  cobros_p: ['Quita la marca de los que no quieras sumar.', 'Treu la marca dels que no vulguis sumar.', 'Untick the ones you do not want to add up.'],
  ninguno: ['No hemos encontrado cobros que se repitan.', 'No hem trobat cobraments que es repeteixin.', 'We found no repeating charges.'],
  fijos: ['Gastos fijos, no suman', 'Despeses fixes, no sumen', 'Fixed costs, not added up'],
  terminados: ['Cobros que ya no llegan', 'Cobraments que ja no arriben', 'Charges that have stopped'],
  monedas: ['Otras monedas, aparte', 'Altres monedes, a part', 'Other currencies, kept apart'],
  e_seguro: ['Seguro', 'Segur', 'Sure'],
  e_posible: ['Posible', 'Possible', 'Possible'],
  e_terminado: ['Terminado', 'Acabat', 'Stopped'],
  g_subio: ['Ha subido', 'Ha pujat', 'Went up'],
  g_evitable: ['Evitable', 'Evitable', 'Avoidable'],
  g_doble: ['Cobro doble', 'Cobrament doble', 'Charged twice'],
  g_nuevo: ['Nuevo', 'Nou', 'New'],
  g_reclamable: ['Reclamable', 'Reclamable', 'Claimable'],
  g_varias_posibles: ['Puede ser más de una suscripción', "Pot ser més d'una subscripció", 'May be more than one subscription'],
  p_semanal: ['cada semana', 'cada setmana', 'weekly'],
  p_mensual: ['cada mes', 'cada mes', 'monthly'],
  p_bimestral: ['cada dos meses', 'cada dos mesos', 'every two months'],
  p_trimestral: ['cada tres meses', 'cada tres mesos', 'every three months'],
  p_semestral: ['cada seis meses', 'cada sis mesos', 'every six months'],
  p_anual: ['cada año', 'cada any', 'yearly'],
  p_puntual: ['suelto', 'puntual', 'one-off'],
  k_fijo: ['{base} × {veces} = {total} al año', "{base} × {veces} = {total} l'any", '{base} × {veces} = {total} a year'],
  k_media: ['Media de los 3 últimos {base} × {veces} = {total} al año', "Mitjana dels 3 últims {base} × {veces} = {total} l'any", 'Average of the last 3 {base} × {veces} = {total} a year'],
  k_suma: ['Lo cobrado en los últimos 12 meses suma {total}', "El que s'ha cobrat els últims 12 mesos suma {total}", 'Charged in the last 12 months adds up to {total}'],
  k_anual: ['{total} al año', "{total} l'any", '{total} a year'],
  subida: ['Sube {importe} al mes', 'Puja {importe} al mes', 'Up {importe} a month'],
  doble: ['Te lo han cobrado dos veces, {importe}', "T'ho han cobrat dues vegades, {importe}", 'You were charged twice, {importe}'],
  ultimo: ['Último cargo el {fecha}', 'Últim càrrec el {fecha}', 'Last charge on {fecha}'],
  proximo: ['Próximo hacia el {fecha}', 'Proper cap al {fecha}', 'Next around {fecha}'],
  baja: ['Cómo darte de baja', 'Com donar-te de baixa', 'How to cancel'],
  ayuda: ['Cómo ver tus suscripciones ahí', 'Com veure-hi les teves subscripcions', 'How to see your subscriptions there'],
  ver_mov: ['Ver el movimiento|Ver los {n} movimientos', 'Mostra el moviment|Mostra els {n} moviments', 'Show the transaction|Show the {n} transactions'],
  mov_de: ['Movimientos de {nombre}', 'Moviments de {nombre}', 'Transactions for {nombre}'],
  ics: ['Descargar calendario (.ics)', 'Descarrega el calendari (.ics)', 'Download calendar (.ics)'],
  ics_vacio: ['No hay cobros que poner en el calendario.', 'No hi ha cobraments per posar al calendari.', 'There are no charges to put in the calendar.'],
  imagen: ['Imagen para compartir', 'Imatge per compartir', 'Image to share'],
  img_alt: ['{total} al año en cobros que se repiten, con la mascota de feehund', "{total} l'any en cobraments que es repeteixen, amb la mascota de feehund", '{total} a year in repeating charges, with the feehund mascot'],
  img_bajar: ['Descargar la imagen', 'Descarrega la imatge', 'Download the image'],
  compartir: ['Compartir', 'Comparteix', 'Share'],
  total_act: ['Total actualizado, {total} al año.', "Total actualitzat, {total} l'any.", 'Total updated, {total} a year.'],
  c_fecha: ['Fecha', 'Data', 'Date'],
  c_concepto: ['Concepto', 'Concepte', 'Description'],
  c_importe: ['Importe', 'Import', 'Amount'],
  c_fila: ['Fila', 'Fila', 'Row'],
};
const IDIOMAS = ['es', 'ca', 'en'];
const LOCALES = { es: 'es-ES', ca: 'ca-ES', en: 'en-GB' };
const ROLES = ['', 'fecha', 'concepto', 'importe', 'cargo', 'abono', 'saldo', 'fecha_valor', 'divisa'];

const pedido = new URLSearchParams(location.search).get('lang');
let idioma = IDIOMAS.includes(pedido) ? pedido : 'es';

/** Texto en el idioma elegido. «uno|varios» elige la forma según datos.n. */
function t(clave, datos) {
  const v = T[clave];
  let s = v ? v[IDIOMAS.indexOf(idioma)] ?? v[0] : clave;
  if (s.includes('|')) s = s.split('|')[datos && String(datos.n) === '1' ? 0 : 1];
  return datos ? s.replace(/\{(\w+)\}/g, (_, k) => (datos[k] ?? '') + '') : s;
}

// ---------- Ayudas ----------
const $ = (id) => document.getElementById(id);

/** Crea un elemento. Los textos van siempre como nodos de texto. */
function h(tag, at, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(at || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'checked' || k === 'hidden' || k === 'value') el[k] = v;
    else el.setAttribute(k === 'cls' ? 'class' : k, v === true ? '' : v);
  }
  for (const c of hijos.flat(9)) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

const numero = (n, dec) => new Intl.NumberFormat(LOCALES[idioma], dec ? { minimumFractionDigits: dec, maximumFractionDigits: dec } : {}).format(n);
function euros(n, divisa = 'EUR') {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  try { return new Intl.NumberFormat(LOCALES[idioma], { style: 'currency', currency: divisa }).format(n); }
  catch { return numero(n) + ' ' + divisa; }
}
// Euros sin céntimos, como en la imagen para compartir (el texto alternativo dice lo mismo que la imagen)
const enteros = (n) => new Intl.NumberFormat(LOCALES[idioma], { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(n));
const fecha = (iso) => (typeof iso === 'string' && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const cuantos = (x) => (Array.isArray(x) ? x.length : typeof x === 'number' ? x : 0);
const origen = (m) => {
  const o = m.origen || m;
  return t(o.pagina ? 'origen_p' : 'origen', { archivo: o.archivo, fila: o.fila, pagina: o.pagina });
};

// Textos del motor (avisos y motivos) en el idioma elegido, si el código existe.
// Se cargan al analizar, no al abrir la página, para no sumar peso inicial.
let textos = null, cargandoTextos = null;
function cargarTextosMotor() {
  cargandoTextos ||= import('/assets/extracto/textos.js').then(async (m) => { await m.cargarTextos?.(); textos = m; }).catch(() => {});
  return cargandoTextos;
}
function textoMotor(a) {
  // El motor ya trae el texto en el idioma del análisis; si la persona cambia de idioma, se traduce por el código
  if (a.texto && (!E.actual?.idioma || E.actual.idioma === idioma)) return a.texto;
  // los motivos de cada cobro llegan sin prefijo («cargos_regulares») y sus textos son «motivo_cargos_regulares»
  for (const codigo of [a.codigo, 'motivo_' + a.codigo, 'no_contado_' + (a.motivo ?? a.codigo)]) {
    if (codigo && textos?.textosDe?.(codigo)) return textos.texto(codigo, idioma, { archivo: a.archivo, ...a.datos });
  }
  return a.texto || null;
}

// ---------- Estado (solo en memoria) ----------
const E = { archivos: [], opciones: {}, base: null, actual: null, fuera: new Set(), urls: [], ocupado: false, pidioOcr: false };
let ultimoAviso = 0;

function aviso(texto, mal = false) {
  const p = $('aviso');
  p.textContent = texto;
  p.classList.toggle('mal', mal);
}

function traducir() {
  document.documentElement.lang = idioma;
  document.title = t('titulo') + ' · ' + t('prueba');
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  $('idioma').value = idioma;
}

// ---------- Elegir, soltar y pegar ----------
function pintarElegidos() {
  $('elegidos').replaceChildren(...E.archivos.map((f) => h('li', { text: `${f.name} (${numero(Math.max(1, Math.round(f.size / 1024)))} KB)` })));
}

function anadir(lista) {
  const nuevos = [...lista].filter((f) => !E.archivos.some((g) => g.name === f.name && g.size === f.size && g.lastModified === f.lastModified));
  E.archivos.push(...nuevos);
  pintarElegidos();
}

function entrada() {
  const texto = $('pegado').value.trim();
  if (E.archivos.length && texto) return { archivos: E.archivos, texto };
  return E.archivos.length ? E.archivos : texto;
}

function ocupado(si) {
  E.ocupado = si;
  $('resultado').setAttribute('aria-busy', String(si));
  for (const id of ['analizar', 'ejemplo']) $(id).setAttribute('aria-disabled', String(si));
}

function progreso(ev = {}) {
  const ahora = performance.now();
  if (ahora - ultimoAviso < 800) return; // sin saturar el lector de pantalla
  ultimoAviso = ahora;
  aviso(ev.texto || (ev.pagina && ev.total ? t('pagina', ev) : ev.archivo ? t('leyendo', ev) : t('analizando')));
}

async function analizar(extra = {}) {
  if (E.ocupado) return;
  const ent = entrada();
  if (!ent || (Array.isArray(ent) && !ent.length)) { aviso(t('nada'), true); return; }
  E.opciones = { ...E.opciones, ...extra };
  ocupado(true);
  aviso(t('analizando'));
  cargarTextosMotor();
  try {
    await recibir(await motor.analizar(ent, { ...E.opciones, idioma, onProgreso: progreso }));
  } catch (e) {
    // «Olvidar todo» a mitad de un análisis lo cancela: ya se ha dicho que se ha borrado todo, no es un fallo
    if (e?.codigo === 'cancelado') return;
    console.error(e);
    aviso(fallo(e), true);
  } finally {
    ocupado(false);
  }
}

/** Mensaje de un fallo del motor: su frase (Error.message con .codigo) si la trae; si no, una general. */
function fallo(e) {
  return (e?.codigo && (e.message || textoMotor({ codigo: e.codigo }))) || t('fallo');
}

function limpiar(...ids) {
  for (const id of ids) { const s = $(id); s.hidden = true; s.replaceChildren(); }
}

/** Decide qué enseñar según lo que devuelve el motor. */
async function recibir(r) {
  await cargarTextosMotor();
  E.base = E.actual = r;
  E.fuera.clear();
  limpiar('contrasena', 'mapeo', 'confirmar', 'resultado');
  const pide = r.necesita_contrasena?.length ? pedirContrasena : r.necesita_mapeo ? pedirMapeo : null;
  if (pide) {
    pide(r);
    aviso(t(pide === pedirContrasena ? 'pw_t' : 'map_t'));
    if (!r.necesita_confirmacion && cuantos(r.lectura?.movimientos)) pintarResultado(r, false);
    return;
  }
  if (r.necesita_confirmacion) { pedirConfirmacion(r); aviso(t('conf_t')); return; }
  pintarResultado(r, true);
}

function mostrar(id, ...hijos) {
  const s = $(id);
  s.replaceChildren(...hijos.flat(9).filter(Boolean));
  s.hidden = false;
  return s;
}

// ---------- Contraseña de PDF ----------
function pedirContrasena(r) {
  const campos = r.necesita_contrasena.map((p, i) => [
    p.motivo === 'incorrecta' ? h('p', { cls: 'mal', id: `pw-mal-${i}`, text: textoMotor({ codigo: 'contrasena_mal', ...p }) || t('pw_mal', p) }) : null,
    h('label', { for: `pw-${i}`, text: t('pw_de', p) }),
    h('div', {}, h('input', { id: `pw-${i}`, type: 'password', autocomplete: 'off', 'data-archivo': p.archivo, 'aria-describedby': p.motivo === 'incorrecta' ? `pw-mal-${i}` : null })),
  ]);
  const form = h('form', { novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const contrasenas = { ...E.opciones.contrasenas };
    for (const i of form.querySelectorAll('input')) if (i.value) contrasenas[i.dataset.archivo] = i.value;
    analizar({ contrasenas });
  } }, campos, h('div', { cls: 'acciones' }, h('button', { cls: 'boton primario', type: 'submit', text: t('abrir') })));
  mostrar('contrasena', h('h2', { id: 't-contrasena', tabindex: '-1', text: t('pw_t') }), h('p', { text: t('pw_p') }), form);
  $('pw-0').focus();
}

// ---------- Tocar columnas ----------
function pedirMapeo(r) {
  const nm = r.necesita_mapeo;
  const filas = nm.primeras_filas || [];
  const ancho = Math.max(0, ...filas.map((f) => f.length));
  const roles = Array.from({ length: ancho }, (_, c) => h('select', { id: `col-${c}`, 'data-col': c },
    ROLES.map((rol) => h('option', { value: rol, text: t('r_' + rol) }))));
  const cab = h('select', { id: 'fila-cab', onchange: () => cuerpo.querySelectorAll('tr').forEach((tr, i) => tr.classList.toggle('titulos', String(i) === cab.value)) },
    h('option', { value: '', text: t('ninguna') }), filas.map((_, i) => h('option', { value: i, text: t('fila_n', { n: i + 1 }) })));
  const cuerpo = h('tbody', {}, filas.map((f) => h('tr', {}, Array.from({ length: ancho }, (_, c) => h('td', { text: f[c] ?? '' })))));
  const error = h('p', { cls: 'mal', role: 'alert' });
  const form = h('form', { novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const columnas = {};
    for (const s of roles) {
      const rol = s.value, c = Number(s.dataset.col);
      if (!rol) continue;
      if (rol === 'concepto') (columnas.concepto ||= []).push(c);
      else if (rol in columnas) { error.textContent = t('map_doble', { rol: t('r_' + rol).toLowerCase() }); s.focus(); return; }
      else columnas[rol] = c;
    }
    if (columnas.fecha === undefined || !columnas.concepto || (columnas.importe === undefined && columnas.cargo === undefined && columnas.abono === undefined)) {
      error.textContent = t('map_falta'); roles[0]?.focus(); return;
    }
    if (columnas.concepto.length === 1) columnas.concepto = columnas.concepto[0];
    const mapeo = { fila_cabecera: cab.value === '' ? null : Number(cab.value), columnas };
    if (nm.hoja) mapeo.hoja = nm.hoja;
    analizar({ mapeo: { ...E.opciones.mapeo, [nm.archivo]: mapeo } });
  } },
  h('div', { cls: 'fila' }, h('label', { for: 'fila-cab', text: t('cabecera') }), cab),
  h('div', { cls: 'desliza' }, h('table', {},
    h('thead', {}, h('tr', {}, roles.map((s, c) => h('th', { scope: 'col' }, h('label', { for: s.id, text: t('col_n', { n: c + 1 }) }), h('div', {}, s))))),
    cuerpo)),
  error,
  h('div', { cls: 'acciones' }, h('button', { cls: 'boton primario', type: 'submit', text: t('map_ok') })));
  mostrar('mapeo', h('h2', { id: 't-mapeo', tabindex: '-1', text: t('map_t') }), h('p', { text: t('map_p', { archivo: nm.hoja ? `${nm.archivo} (${nm.hoja})` : nm.archivo }) }), form);
  $('t-mapeo').focus();
}

// ---------- Revisar lo leído de fotos (nivel C) ----------
function pedirConfirmacion(r) {
  const movs = r.lectura?.movimientos || [];
  const celda = (m, n, campo, at) => h('td', {}, h('input', { ...at, 'aria-label': t('campo', { campo: t('c_' + campo), n }), 'data-campo': campo, 'data-id': m.id }));
  const filas = movs.map((m, i) => {
    const n = i + 1;
    return h('tr', { cls: m.dudoso ? 'dudosa' : null },
      celda(m, n, 'fecha', { type: 'date', value: m.fecha || '' }),
      celda(m, n, 'concepto', { type: 'text', value: m.concepto || '' }),
      celda(m, n, 'importe', { type: 'text', inputmode: 'decimal', value: typeof m.importe === 'number' ? numero(m.importe, 2) : '' }),
      h('td', {}, origen(m), m.dudoso ? [' ', h('strong', { cls: 'chapa posible', text: t('revisar') })] : null),
      h('td', {}, h('label', { cls: 'marca' }, h('input', { type: 'checkbox', 'data-id': m.id, 'data-campo': 'quitar', 'aria-label': t('campo', { campo: t('quitar'), n }) }))));
  });
  const error = h('p', { cls: 'mal', role: 'alert' });
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    if (E.ocupado) return;
    const { parseImporte } = await import('/assets/extracto/nucleo/numeros.js');
    const cambios = new Map();
    for (const [i, tr] of filas.entries()) {
      const m = movs[i];
      const c = {};
      for (const inp of tr.querySelectorAll('input')) {
        const campo = inp.dataset.campo;
        if (campo === 'quitar') { if (inp.checked) c.quitar = true; continue; }
        if (campo === 'importe') {
          const v = parseImporte(inp.value);
          inp.setAttribute('aria-invalid', String(v === null));
          if (v === null) { error.textContent = t('imp_mal', { n: i + 1 }); inp.focus(); return; }
          if (v !== m.importe) c.importe = v;
        } else if (inp.value !== (m[campo] || '')) c[campo] = inp.value;
      }
      if (Object.keys(c).length) cambios.set(m.id, { id: m.id, ...c });
    }
    ocupado(true);
    try {
      const r2 = await motor.confirmar(E.base, [...cambios.values()], { idioma, onProgreso: progreso });
      limpiar('confirmar');
      E.base = E.actual = r2;
      pintarResultado(r2, true);
    } catch (err) {
      console.error(err);
      aviso(fallo(err), true);
    } finally {
      ocupado(false);
    }
  } },
  h('div', { cls: 'desliza' }, h('table', {},
    h('caption', { text: t('conf_tabla') }),
    h('thead', {}, h('tr', {}, ['c_fecha', 'c_concepto', 'c_importe', 'c_origen', 'quitar'].map((k) => h('th', { scope: 'col', text: t(k) })))),
    h('tbody', {}, filas))),
  error,
  h('div', { cls: 'acciones' }, h('button', { cls: 'boton primario', type: 'submit', text: t('confirmar') })));
  mostrar('confirmar', h('h2', { id: 't-confirmar', tabindex: '-1', text: t('conf_t') }), h('p', { text: t('conf_p') }), form);
  $('t-confirmar').focus();
}

// ---------- Resultado ----------
function tablaMovimientos(movs, titulo) {
  return h('div', { cls: 'desliza', tabindex: '0', role: 'region', 'aria-label': titulo }, h('table', {},
    h('caption', { cls: 'oculto', text: titulo }),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: t('c_fecha') }), h('th', { scope: 'col', text: t('c_concepto') }),
      h('th', { scope: 'col', cls: 'num', text: t('c_importe') }), h('th', { scope: 'col', text: t('c_origen') }))),
    h('tbody', {}, movs.map((m) => h('tr', {}, h('td', { text: fecha(m.fecha) }), h('td', { text: m.concepto }),
      h('td', { cls: 'num', text: euros(m.importe, m.divisa) }), h('td', { text: origen(m) }))))));
}

function calculo(c) {
  const k = c.calculo || {};
  const d = { base: euros(k.base ?? c.importe), veces: k.cargos_al_anio, total: euros(c.coste_anual) };
  if (k.formula === 'suma_12_meses') return t('k_suma', d);
  if (k.formula === 'media3_x_cargos_anio') return t('k_media', d);
  if (k.formula === 'ultimo_x_cargos_anio' || (d.veces && k.base !== undefined)) return t('k_fijo', d);
  return t('k_anual', d);
}

function enlace(ruta, clave) {
  // Solo rutas de esta web o https: nunca javascript:, «//otra.web» ni «/\otra.web» (el navegador lee «\» como «/»).
  // Sin espacios ni caracteres de control: al leer la dirección, el navegador quita tabuladores y saltos de línea.
  if (typeof ruta !== 'string' || /[\\\s\u0000-\u001f\u007f]/.test(ruta)) return null;
  let u;
  try { u = new URL(ruta, location.href); } catch { return null; }
  const propia = /^\/[^/]/.test(ruta) && u.origin === location.origin;
  const segura = ruta.startsWith('https://') && u.protocol === 'https:';
  return propia || segura ? h('p', {}, h('a', { cls: 'enlace', href: ruta, text: t(clave) })) : null;
}

function cobro(c, i, conMarca) {
  const nombre = h('strong', { text: c.nombre });
  const motivos = (c.motivos || []).map(textoMotor).filter(Boolean);
  return h('li', { cls: 'cobro' + (conMarca && E.fuera.has(c.id) ? ' fuera' : ''), 'data-id': c.id },
    h('div', { cls: 'cabeza' },
      conMarca ? h('label', { cls: 'marca' }, h('input', { type: 'checkbox', checked: !E.fuera.has(c.id), 'data-id': c.id, onchange: marcar }), nombre) : nombre,
      c.estado ? h('span', { cls: 'chapa ' + c.estado, text: t('e_' + c.estado) }) : null,
      (c.etiquetas || []).map((g) => h('span', { cls: 'chapa etiqueta', text: t('g_' + g) })),
      c.periodicidad ? h('span', { cls: 'suave', text: t('p_' + c.periodicidad) }) : null),
    h('p', { text: calculo(c) }),
    typeof c.subida_mensual === 'number' && c.subida_mensual > 0 ? h('p', { text: t('subida', { importe: euros(c.subida_mensual) }) }) : null,
    c.doble ? h('p', { text: t('doble', { importe: euros(c.doble.importe) }) }) : null,
    c.ultimo_cargo ? h('p', { cls: 'suave' }, t('ultimo', { fecha: fecha(c.ultimo_cargo) }), c.proximo_cargo ? '. ' + t('proximo', { fecha: fecha(c.proximo_cargo) }) : '') : null,
    motivos.length ? h('ul', {}, motivos.map((m) => h('li', { text: m }))) : null,
    enlace(c.baja, 'baja'), enlace(c.ayuda, 'ayuda'),
    c.movimientos?.length ? h('details', {}, h('summary', { text: t('ver_mov', { n: c.movimientos.length }) }),
      tablaMovimientos(c.movimientos, t('mov_de', { nombre: c.nombre }))) : null);
}

function lista(clave, items, conMarca) {
  if (!items?.length) return null;
  return [h('h3', { text: t(clave) }), conMarca ? h('p', { text: t('cobros_p') }) : null,
    h('ul', { cls: 'lista' }, items.map((c, i) => cobro(c, i, conMarca)))];
}

function totales(r) {
  return h('div', { cls: 'totales', id: 'totales' },
    h('p', { cls: 'total seguro' }, t('t_seguro'), h('strong', { text: euros(r.total_seguro ?? 0) })),
    h('p', { cls: 'total' }, t('t_posible'), h('strong', { text: euros(r.total_posible ?? 0) })));
}

function pintarResultado(r, enfocar) {
  const L = r.lectura || {};
  const nc = L.filas_que_no_cuadran || [];
  const lineas = (clave, items) => (items?.length ? [h('h3', { text: t(clave) }), h('ul', {}, items.map((a) => h('li', { text: textoMotor(a) || a.archivo || '' })))] : null);
  const leido = [L.formato, L.nivel ? t('nivel_' + L.nivel) : null, t('n_mov', { n: numero(cuantos(L.movimientos)) }),
    L.duplicados_quitados ? t('dup', { n: L.duplicados_quitados }) : null].filter(Boolean).join(', ');
  mostrar('resultado',
    h('h2', { id: 't-resultado', tabindex: '-1', text: t('res_t') }),
    h('dl', { cls: 'resumen' },
      h('dt', { text: t('periodo') }), h('dd', { text: L.periodo ? t('periodo_v', { desde: fecha(L.periodo.desde), hasta: fecha(L.periodo.hasta), meses: numero(L.periodo.meses ?? 0) }) : '' }),
      h('dt', { text: t('saldo') }), h('dd', { cls: L.validacion === 'verificada' ? 'bien' : L.validacion === 'no_cuadra' ? 'mal' : null, text: L.validacion ? t('v_' + L.validacion, { n: nc.length }) : '' }),
      h('dt', { text: t('lectura') }), h('dd', { text: leido })),
    (L.archivos || []).length > 1 ? h('ul', {}, L.archivos.map((a) => h('li', { text: `${a.nombre}, ${a.formato}, ${t('n_mov', { n: cuantos(a.movimientos) })}` + (a.validacion ? ', ' + t('vc_' + a.validacion) : '') }))) : null,
    nc.length ? [h('h3', { text: t('nc_t') }), h('div', { cls: 'desliza', tabindex: '0', role: 'region', 'aria-label': t('nc_t') }, h('table', {},
      h('thead', {}, h('tr', {}, [t('c_origen'), t('nc_ant'), t('c_importe'), t('nc_esp'), t('nc_leido')].map((x, j) => h('th', { scope: 'col', cls: j ? 'num' : null, text: x })))),
      h('tbody', {}, nc.slice(0, 200).map((f) => h('tr', {}, h('td', { text: origen(f) }),
        [f.saldo_anterior, f.importe, f.saldo_esperado, f.saldo_leido].map((x) => h('td', { cls: 'num', text: euros(x) }))))))) ] : null,
    lineas('avisos', L.avisos),
    lineas('errores', r.errores),
    totales(r),
    r.cobros?.length ? lista('cobros', r.cobros, true) : h('p', { text: t('ninguno') }),
    lista('fijos', r.gastos_fijos, false),
    lista('terminados', r.terminados, false),
    (L.otras_monedas || []).length ? [h('h3', { text: t('monedas') }), h('ul', {}, L.otras_monedas.map((o) => h('li', { text: typeof o === 'string' ? o : `${o.divisa}, ${t('n_mov', { n: cuantos(o.movimientos) })}` })))] : null,
    h('div', { cls: 'acciones' },
      h('button', { type: 'button', cls: 'boton', text: t('ics'), onclick: bajarIcs }),
      h('button', { type: 'button', cls: 'boton', text: t('imagen'), onclick: imagen })),
    h('figure', { id: 'vista', hidden: true }),
    // Para Design: el objeto tal cual lo devuelve la API (se pinta al abrirlo)
    h('details', { ontoggle: (e) => { const pre = e.target.querySelector('pre'); if (e.target.open && !pre.textContent) pre.textContent = JSON.stringify(E.actual, null, 2).slice(0, 300000); } },
      h('summary', { text: t('json') }), h('pre', { cls: 'desliza', tabindex: '0', role: 'region', 'aria-label': t('json') })));
  if (enfocar) {
    $('t-resultado').focus();
    aviso(t('hecho', { n: r.cobros?.length || 0, total: euros(r.total_seguro ?? 0) }));
  }
}

async function marcar(e) {
  const id = e.target.dataset.id;
  if (e.target.checked) E.fuera.delete(id); else E.fuera.add(id);
  e.target.closest('.cobro').classList.toggle('fuera', !e.target.checked);
  try {
    E.actual = await motor.recalcular(E.base, [...E.fuera]);
    $('totales').replaceWith(totales(E.actual));
    aviso(t('total_act', { total: euros(E.actual.total_seguro ?? 0) }));
  } catch (err) {
    console.error(err);
    aviso(fallo(err), true);
  }
}

function guardarUrl(blob) {
  const url = URL.createObjectURL(blob);
  E.urls.push(url);
  return url;
}

async function bajarIcs() {
  try {
    const ics = await motor.generarICS(E.actual, { idioma, desmarcados: [...E.fuera] });
    // generarICS da null si no hay ningún cobro que poner: solo se descarga un texto (o archivo) que no esté vacío
    const vale = (typeof ics === 'string' && ics.trim() !== '') || (typeof Blob !== 'undefined' && ics instanceof Blob && ics.size > 0);
    if (!vale) { aviso(t('ics_vacio')); return; }
    const blob = ics instanceof Blob ? ics : new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const a = h('a', { href: guardarUrl(blob), download: 'cobros-feehund.ics', hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
  } catch (err) {
    console.error(err);
    aviso(fallo(err), true);
  }
}

async function imagen() {
  try {
    const total = E.actual.total_seguro ?? 0;
    const img = await motor.generarImagenCompartir(total, { idioma });
    const url = img instanceof Blob ? guardarUrl(img) : String(img);
    const fig = $('vista');
    const puedeCompartir = img instanceof Blob && navigator.canShare?.({ files: [new File([img], 'feehund.png', { type: img.type || 'image/png' })] });
    fig.replaceChildren(h('img', { src: url, alt: t('img_alt', { total: enteros(total) }) }),
      h('figcaption', { cls: 'acciones' }, h('a', { cls: 'enlace', href: url, download: 'feehund-extracto.png', text: t('img_bajar') }),
        puedeCompartir ? h('button', { type: 'button', cls: 'boton', text: t('compartir'), onclick: () => navigator.share({ files: [new File([img], 'feehund.png', { type: img.type || 'image/png' })] }).catch(() => {}) }) : null));
    fig.hidden = false;
  } catch (err) {
    console.error(err);
    aviso(fallo(err), true);
  }
}

async function olvidar() {
  try { await motor.olvidar?.(); } catch (err) { console.error(err); }
  for (const u of E.urls) URL.revokeObjectURL(u);
  Object.assign(E, { archivos: [], opciones: {}, base: null, actual: null, urls: [] });
  E.fuera.clear();
  $('archivos').value = '';
  $('pegado').value = '';
  pintarElegidos();
  limpiar('contrasena', 'mapeo', 'confirmar', 'resultado');
  aviso(t('olvidado'));
}

// ---------- Sin conexión ----------
const RED = { listo: false, ocr: false, nueva: false };
/** Avisos del service worker ({tipo}) o estado de estadoSinConexion() ({listo, ocr…}). */
function pintarRed(e) {
  if (!e) return;
  const m = typeof e === 'string' ? e : e.tipo || '';
  if (m === 'listo-sin-conexion' || e.listo === true) RED.listo = true;
  if (m === 'ocr-listo-sin-conexion' || e.ocr === true) RED.ocr = true;
  const estado = t(RED.listo && RED.ocr ? 'red_ocr' : RED.listo ? 'red_ok' : 'red_prep');
  $('red').textContent = RED.nueva ? estado + ' ' + t('red_nueva') : estado;
  if (RED.listo && !RED.ocr && !E.pidioOcr && !navigator.connection?.saveData) {
    E.pidioOcr = true; // las librerías de fotos se guardan después, en segundo plano
    Promise.resolve(motor.pedirOcrSinConexion?.()).catch(() => {});
  }
}

/**
 * Versión nueva ya instalada que espera su turno. El service worker no mezcla versiones: la nueva entra cuando se
 * cierran todas las pestañas de /extracto/. Aquí solo se dice (la interfaz definitiva debería decirlo igual).
 */
function vigilarVersion(reg) {
  if (!reg || typeof reg.addEventListener !== 'function') return;
  const mirar = () => {
    if (!reg.waiting || !navigator.serviceWorker.controller || RED.nueva) return;
    RED.nueva = true;
    pintarRed({});
  };
  reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', mirar));
  mirar();
}

function iniciarRed() {
  if (!('serviceWorker' in navigator) || typeof motor.registrarSinConexion !== 'function') { $('red').textContent = t('red_no'); return; }
  $('red').textContent = t('red_prep');
  motor.onEstadoSinConexion?.(pintarRed);
  Promise.resolve(motor.registrarSinConexion())
    .then((reg) => { vigilarVersion(reg); return motor.estadoSinConexion?.(); })
    .then(pintarRed)
    .catch((err) => { console.error(err); $('red').textContent = t('red_no'); });
}

// ---------- Arranque ----------
function iniciar() {
  traducir();
  $('idioma').addEventListener('change', (e) => {
    idioma = e.target.value;
    const u = new URL(location.href);
    u.searchParams.set('lang', idioma);
    history.replaceState(null, '', u);
    traducir();
    pintarRed({});
    // Lo que está a la vista se vuelve a pintar en el idioma nuevo
    if (['contrasena', 'mapeo', 'confirmar'].some((id) => !$(id).hidden)) recibir(E.base);
    else if (E.actual && !$('resultado').hidden) pintarResultado(E.actual, false);
  });
  $('elegir').addEventListener('click', () => $('archivos').click());
  $('archivos').addEventListener('change', (e) => { anadir(e.target.files); e.target.value = ''; });
  const zona = $('zona');
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('encima'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('encima'));
  zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('encima'); anadir(e.dataTransfer.files); });
  // Un archivo soltado fuera de la zona no debe abrirse en la pestaña
  for (const ev of ['dragover', 'drop']) window.addEventListener(ev, (e) => e.preventDefault());
  $('entrada').addEventListener('submit', (e) => { e.preventDefault(); analizar(); });
  $('ejemplo').addEventListener('click', async () => {
    if (E.ocupado) return;
    try {
      const r = await fetch('/data/ejemplo.csv');
      if (!r.ok) throw new Error(r.status);
      E.archivos = [new File([await r.blob()], 'ejemplo.csv', { type: 'text/csv' })];
      pintarElegidos();
      analizar();
    } catch (err) {
      console.error(err);
      aviso(t('ej_no'), true);
    }
  });
  $('olvidar').addEventListener('click', olvidar);
  iniciarRed();
  // Para las pruebas en navegador: pintar un resultado de ejemplo sin pasar por el motor
  if (new URLSearchParams(location.search).has('prueba')) globalThis.feehundDev = { recibir, E };
}

iniciar();
