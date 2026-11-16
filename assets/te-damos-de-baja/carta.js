// «Te damos de baja»: fecha de envío y texto de la carta. Lo usan la página (vista previa) y el servidor (la carta
// que se firma y se envía), así que las dos ven exactamente lo mismo. Lógica pura: sin DOM, sin red.
// Fechas siempre como 'AAAA-MM-DD' en hora de España.
// [REVISIÓN LEGAL] Los textos de la carta (CARTA) los tiene que revisar el abogado antes de cobrar.

export const PRECIO = { primera: 399, extra: 199 }; // céntimos, IVA incluido
export const MAX_BAJAS = 5;                          // bajas en una misma compra
export const total = (n) => PRECIO.primera + PRECIO.extra * (Math.max(1, n) - 1);
export const euros = (c, idioma = 'es') => (c / 100).toLocaleString(idioma === 'en' ? 'en-GB' : idioma + '-ES', { minimumFractionDigits: 2 }) + ' €';

/* ---------- fechas ---------- */
const d2 = (n) => String(n).padStart(2, '0');
const aISO = (d) => `${d.getUTCFullYear()}-${d2(d.getUTCMonth() + 1)}-${d2(d.getUTCDate())}`;
const deISO = (iso) => new Date(iso + 'T00:00:00Z');
export const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && aISO(deISO(s)) === s;
export const hoyEspana = (ahora = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(ahora);
export const sumarDias = (iso, n) => { const d = deISO(iso); d.setUTCDate(d.getUTCDate() + n); return aISO(d); };
export const sumarMeses = (iso, n) => {
  const d = deISO(iso), dia = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo)); return aISO(d);
};

// Festivos nacionales (los de toda España) y Viernes Santo. Los autonómicos no se cuentan: por eso hay margen.
function pascua(a) { // algoritmo de Meeus
  const b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((c + 8) / 25);
  const h = (19 * b + c - e - Math.floor((c - g + 1) / 3) + 15) % 30, i = Math.floor(d / 4), k = d % 4;
  const l = (32 + 2 * f + 2 * i - h - k) % 7, m = Math.floor((b + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${a}-${d2(mes)}-${d2(dia)}`;
}
const FIJOS = ['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25'];
export function esHabil(iso) {
  const dia = deISO(iso).getUTCDay();
  if (dia === 0 || dia === 6) return false;
  if (FIJOS.includes(iso.slice(5))) return false;
  return iso !== sumarDias(pascua(+iso.slice(0, 4)), -2);
}
export function restarHabiles(iso, n) { let d = iso; while (n > 0) { d = sumarDias(d, -1); if (esHabil(d)) n--; } return d; }

/** Último día en que la carta puede llegar para que valga el aviso que pide la empresa. */
export function ultimoDiaAviso(aviso, objetivo) {
  if (aviso?.habiles) return restarHabiles(objetivo, aviso.habiles);
  if (aviso?.meses) return sumarMeses(objetivo, -aviso.meses);
  if (aviso?.dias) return sumarDias(objetivo, -aviso.dias);
  return objetivo;
}

/**
 * Cuándo se envía la carta.
 * eleccion: { cuando: 'ya' | 'fin' | 'ren', fecha?: 'AAAA-MM-DD' } (fin = fin de la permanencia o día en que quieres
 * que acabe; ren = fecha de la próxima renovación o vencimiento).
 * Devuelve { ok, error?, envio, objetivo, programada, tarde }: tarde = aunque se envíe hoy, llega con menos aviso del
 * que pide la empresa (puede acabar un periodo más tarde).
 * Margen: un día hábil más (o dos naturales) por si la empresa tarda en leer el correo o hay un festivo local.
 */
export function calcularEnvio(empresa, eleccion, hoy = hoyEspana()) {
  const cuando = eleccion?.cuando;
  if (!empresa.opciones.includes(cuando)) return { ok: false, error: 'cuando' };
  if (cuando === 'ya') return { ok: true, envio: hoy, objetivo: null, programada: false, tarde: false };
  const objetivo = eleccion.fecha;
  if (!esFecha(objetivo) || objetivo <= hoy) return { ok: false, error: 'fecha' };
  if (objetivo > sumarMeses(hoy, 18)) return { ok: false, error: 'lejos' };
  const limite = ultimoDiaAviso(empresa.aviso, objetivo);
  const conMargen = empresa.aviso?.habiles ? restarHabiles(limite, 1) : sumarDias(limite, -2);
  const envio = conMargen > hoy ? conMargen : hoy;
  return { ok: true, envio, objetivo, programada: envio > hoy, tarde: limite < hoy };
}

/* ---------- textos ---------- */
const LOCALE = { es: 'es-ES', ca: 'ca-ES', en: 'en-GB' };
export function fechaLarga(iso, idioma = 'es') {
  return deISO(iso).toLocaleDateString(LOCALE[idioma] || 'es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export const DATO = {
  es: { linea: 'Número de línea o de cliente', poliza: 'Número de póliza', socio: 'Número de socio', instalacion: 'Número de contrato o dirección de la instalación', cuenta: 'Número de cliente', tarjeta4: 'Últimas 4 cifras de la tarjeta con la que pagas' },
  ca: { linea: 'Número de línia o de client', poliza: 'Número de pòlissa', socio: 'Número de soci', instalacion: 'Número de contracte o adreça de la instal·lació', cuenta: 'Número de client', tarjeta4: 'Últimes 4 xifres de la targeta amb què pagues' },
  en: { linea: 'Line or customer number', poliza: 'Policy number', socio: 'Membership number', instalacion: 'Contract number or installation address', cuenta: 'Customer number', tarjeta4: 'Last 4 digits of the card you pay with' },
};
// El dato es obligatorio cuando la empresa lo necesita para encontrar el contrato
export const datoObligatorio = (empresa) => ['poliza', 'socio', 'instalacion', 'tarjeta4'].includes(empresa.dato);

// [REVISIÓN LEGAL] carta de baja (una sola hoja). {…} son los datos de la persona y de la empresa.
const CARTA = {
  es: {
    asunto: (e) => e.tipo === 'seguro' ? 'Oposición a la prórroga del contrato de seguro' : 'Solicitud de baja del contrato',
    dni: 'DNI/NIE', correo: 'Correo', a: (e) => `A la atención de ${e.nombre}`, via: (e) => `Enviada por correo electrónico a ${e.correo}`,
    pido: (e, ef) => `Por la presente solicito la baja de mi contrato con ${e.nombre}${ef}.`,
    ef: { pronto: '', fecha: (f) => `, con efecto el ${f}`, ren: (f) => ` para que no se renueve en su próximo vencimiento, el ${f}` },
    pronto: { telecos: 'con efecto lo antes posible', renovacion: 'con efecto al final del periodo ya pagado, sin que se renueve', otro: 'con efecto lo antes posible' },
    telecos: 'Conforme a la normativa de protección de los usuarios de telecomunicaciones, la baja debe hacerse efectiva en un plazo máximo de dos días hábiles desde la recepción de esta solicitud, o en la fecha indicada si es posterior.',
    seguro: (f) => `Conforme al artículo 22 de la Ley 50/1980, de Contrato de Seguro, comunico mi oposición a la prórroga del contrato, que no deberá renovarse a su vencimiento${f ? ', el ' + f : ''}.`,
    motivo: 'Motivo de la baja: decisión personal.',
    cargos: (c) => `Pido que a partir de esa fecha no se me haga ningún cargo más, que se anule la domiciliación de los recibos y que me confirméis la baja por escrito en ${c}.`,
    adjunto: 'Adjunto copia de mi documento de identidad.',
    feehund: 'Envío esta carta a través de Feehund, que la remite en mi nombre y con mi autorización. Las respuestas llegan directamente a mi correo.',
    saludo: 'Atentamente,',
    firma: (f, c, r) => `Firmado electrónicamente el ${f} con un código de verificación enviado a ${c}. Referencia ${r}.`,
    sinFirma: '[Se firma en el paso siguiente]',
  },
  ca: {
    asunto: (e) => e.tipo === 'seguro' ? 'Oposició a la pròrroga del contracte d\'assegurança' : 'Sol·licitud de baixa del contracte',
    dni: 'DNI/NIE', correo: 'Correu', a: (e) => `A l'atenció de ${e.nombre}`, via: (e) => `Enviada per correu electrònic a ${e.correo}`,
    pido: (e, ef) => `Per la present sol·licito la baixa del meu contracte amb ${e.nombre}${ef}.`,
    ef: { pronto: '', fecha: (f) => `, amb efecte el ${f}`, ren: (f) => ` perquè no es renovi en el proper venciment, el ${f}` },
    pronto: { telecos: 'amb efecte tan aviat com sigui possible', renovacion: 'amb efecte al final del període ja pagat, sense que es renovi', otro: 'amb efecte tan aviat com sigui possible' },
    telecos: 'D\'acord amb la normativa de protecció dels usuaris de telecomunicacions, la baixa s\'ha de fer efectiva en un termini màxim de dos dies hàbils des de la recepció d\'aquesta sol·licitud, o en la data indicada si és posterior.',
    seguro: (f) => `D'acord amb l'article 22 de la Llei 50/1980, de Contracte d'Assegurança, comunico la meva oposició a la pròrroga del contracte, que no s'ha de renovar al venciment${f ? ', el ' + f : ''}.`,
    motivo: 'Motiu de la baixa: decisió personal.',
    cargos: (c) => `Demano que a partir d'aquesta data no se'm faci cap més càrrec, que s'anul·li la domiciliació dels rebuts i que em confirmeu la baixa per escrit a ${c}.`,
    adjunto: 'Adjunto còpia del meu document d\'identitat.',
    feehund: 'Envio aquesta carta a través de Feehund, que la tramet en nom meu i amb la meva autorització. Les respostes arriben directament al meu correu.',
    saludo: 'Atentament,',
    firma: (f, c, r) => `Signat electrònicament el ${f} amb un codi de verificació enviat a ${c}. Referència ${r}.`,
    sinFirma: '[Se signa al pas següent]',
  },
  en: {
    asunto: () => 'Cancellation of my contract',
    dni: 'ID number', correo: 'Email', a: (e) => `For the attention of ${e.nombre}`, via: (e) => `Sent by email to ${e.correo}`,
    pido: (e, ef) => `I hereby request the cancellation of my contract with ${e.nombre}${ef}.`,
    ef: { pronto: '', fecha: (f) => `, effective ${f}`, ren: (f) => `, so that it does not renew on its next renewal date, ${f}` },
    pronto: { telecos: 'effective as soon as possible', renovacion: 'effective at the end of the period already paid, with no renewal', otro: 'effective as soon as possible' },
    telecos: 'Under Spanish telecommunications consumer law, the cancellation must take effect within two working days of receiving this request, or on the date given if later.',
    seguro: (f) => `Under article 22 of Spanish Law 50/1980 on Insurance Contracts, I give notice that I object to the renewal of the contract, which must not renew on expiry${f ? ', ' + f : ''}.`,
    motivo: 'Reason for cancelling: personal decision.',
    cargos: (c) => `Please make no further charges from that date, cancel any direct debit or automatic payment, and confirm the cancellation in writing to ${c}.`,
    adjunto: 'A copy of my identity document is attached.',
    feehund: 'I am sending this letter through Feehund, which forwards it on my behalf and with my authorisation. Replies come straight to my email.',
    saludo: 'Yours faithfully,',
    firma: (f, c, r) => `Signed electronically on ${f} with a verification code sent to ${c}. Reference ${r}.`,
    sinFirma: '[Signed in the next step]',
  },
};

/**
 * La carta, en el idioma de la empresa. Devuelve { idioma, asunto, cuerpo: string[] } (líneas; '' = línea en blanco).
 * p: { datos: {nombre, correo, dato, dni}, eleccion: {cuando, fecha}, fecha: 'AAAA-MM-DD' (de la carta),
 *      firma?: {cuando: 'AAAA-MM-DD HH:MM', correo}, ref?: 'FH-…', adjuntaDni?: boolean }
 */
export function carta(empresa, p) {
  const idioma = CARTA[empresa.idioma] ? empresa.idioma : 'es';
  const T = CARTA[idioma], d = p.datos || {}, el = p.eleccion || {};
  const f = (iso) => fechaLarga(iso, idioma);
  const nombre = d.nombre || ({ es: '[Nombre y apellidos]', ca: '[Nom i cognoms]', en: '[Full name]' })[idioma];
  const correo = d.correo || ({ es: '[Correo]', ca: '[Correu]', en: '[Email]' })[idioma];
  const fechaObj = el.cuando !== 'ya' && esFecha(el.fecha) ? f(el.fecha) : '';
  let efecto;
  if (empresa.tipo === 'seguro') efecto = '';
  else if (el.cuando === 'ya') efecto = ' ' + T.pronto[empresa.tipo === 'telecos' ? 'telecos' : empresa.cuenta === 'renovacion' ? 'renovacion' : 'otro'];
  else efecto = (el.cuando === 'ren' ? T.ef.ren : T.ef.fecha)(fechaObj || '…');

  const cab = [nombre];
  if (empresa.dni !== 'no' && d.dni) cab.push(`${T.dni}: ${d.dni.toUpperCase()}`);
  cab.push(`${T.correo}: ${correo}`);
  if (d.dato) cab.push(`${DATO[idioma][empresa.dato]}: ${d.dato}`);

  const cuerpo = [...cab, '', T.a(empresa), T.via(empresa), '', f(p.fecha || hoyEspana()), '', T.asunto(empresa), ''];
  if (empresa.tipo === 'seguro') cuerpo.push(T.seguro(fechaObj));
  else cuerpo.push(T.pido(empresa, efecto));
  if (empresa.tipo === 'telecos') cuerpo.push('', T.telecos);
  if (empresa.motivo) cuerpo.push('', T.motivo);
  cuerpo.push('', T.cargos(correo));
  if (p.adjuntaDni) cuerpo.push('', T.adjunto);
  cuerpo.push('', T.feehund, '', T.saludo, '', nombre);
  cuerpo.push(p.firma ? T.firma(p.firma.cuando, p.firma.correo, p.ref) : T.sinFirma);
  return { idioma, asunto: T.asunto(empresa) + (p.ref ? ` · ${nombre} · ${p.ref}` : ''), cuerpo };
}

// Segunda carta (gratis, una por compra): la empresa ha vuelto a cobrar después de la baja. [REVISIÓN LEGAL]
const RECOBRO = {
  es: { asunto: 'Reclamación: cargo posterior a la baja', t: (e, envio, ref, cobro, imp) => [`El ${envio} os envié por correo electrónico certificado la solicitud de baja de mi contrato con ${e.nombre} (referencia ${ref}). Adjunto el certificado de entrega.`, '', `A pesar de ello, el ${cobro} me habéis cobrado ${imp}.`, '', 'Os pido que devolváis ese importe en la misma cuenta o tarjeta, que no hagáis más cargos y que me confirméis por escrito que la baja está hecha.'] },
  ca: { asunto: 'Reclamació: càrrec posterior a la baixa', t: (e, envio, ref, cobro, imp) => [`El ${envio} us vaig enviar per correu electrònic certificat la sol·licitud de baixa del meu contracte amb ${e.nombre} (referència ${ref}). Adjunto el certificat de lliurament.`, '', `Tot i això, el ${cobro} m'heu cobrat ${imp}.`, '', 'Us demano que retorneu aquest import al mateix compte o targeta, que no feu més càrrecs i que em confirmeu per escrit que la baixa està feta.'] },
  en: { asunto: 'Complaint: charge after cancellation', t: (e, envio, ref, cobro, imp) => [`On ${envio} I sent you, by certified email, my request to cancel my contract with ${e.nombre} (reference ${ref}). The delivery certificate is attached.`, '', `Despite this, on ${cobro} you charged me ${imp}.`, '', 'Please refund that amount to the same account or card, make no further charges and confirm in writing that the cancellation is done.'] },
};
export function cartaRecobro(empresa, p) {
  const idioma = RECOBRO[empresa.idioma] ? empresa.idioma : 'es';
  const T = RECOBRO[idioma], C = CARTA[idioma], d = p.datos;
  const imp = euros(Math.round(p.importe * 100), idioma);
  const cuerpo = [d.nombre, `${C.correo}: ${d.correo}`, '', C.a(empresa), C.via(empresa), '', fechaLarga(p.fecha, idioma), '', T.asunto, '',
    ...T.t(empresa, fechaLarga(p.envio, idioma), p.ref, fechaLarga(p.cobro, idioma), imp), '', C.feehund, '', C.saludo, '', d.nombre,
    C.firma(p.firma.cuando, p.firma.correo, p.ref)];
  return { idioma, asunto: `${T.asunto} · ${d.nombre} · ${p.ref}-2`, cuerpo };
}

/* ---------- validación de los datos (la misma en la página y en el servidor) ---------- */
export const DNI_RE = /^[0-9XYZ]\d{7}[A-Z]$/;
export function dniValido(s) {
  const v = String(s || '').toUpperCase().replace(/[\s-]/g, '');
  if (!DNI_RE.test(v)) return false;
  const n = +v.slice(0, 8).replace('X', '0').replace('Y', '1').replace('Z', '2');
  return 'TRWAGMYFPDXBNJZSQVHLCKE'[n % 23] === v[8];
}
export const correoValido = (s) => /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/i.test(String(s || '')) && String(s).length <= 120;

/** Comprueba y limpia lo que escribe la persona. Devuelve { ok, datos, errores: [campo] }. */
export function validarDatos(empresa, d = {}) {
  const limpio = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const datos = { nombre: limpio(d.nombre, 90), correo: limpio(d.correo, 120).toLowerCase(), dato: limpio(d.dato, 120), dni: '' };
  const errores = [];
  if (datos.nombre.split(' ').filter(Boolean).length < 2) errores.push('nombre');
  if (!correoValido(datos.correo)) errores.push('correo');
  if (empresa.dni !== 'no') { datos.dni = limpio(d.dni, 12).toUpperCase().replace(/[\s-]/g, ''); if (!dniValido(datos.dni)) errores.push('dni'); }
  if (empresa.dato === 'tarjeta4' && datos.dato && !/^\d{4}$/.test(datos.dato)) errores.push('dato');
  if (datoObligatorio(empresa) && !datos.dato) errores.push('dato');
  return { ok: errores.length === 0, datos, errores };
}
