// Correos. Texto plano, cortos, firmados «Feehund».
// MENSAJES: a la persona, en el idioma en que usó la página. Redacción definitiva: la MISMA con el envío a mano (fase 1)
// y con el automático (fase 2). Promesa: «en 24 horas» (las programadas, «el <fecha>»). Nunca «hoy» ni «al instante».
// urgente: al equipo (AVISOS_CORREO), en castellano, con todo lo necesario para enviar la carta a mano en 2 minutos.

const FIN = '\n\nFeehund · feehund.com';
const PIE = {
  es: FIN + '\nSi no has pedido esto, no hagas nada: sin el código no se envía ninguna carta.',
  ca: FIN + '\nSi no ho has demanat, no facis res: sense el codi no s\'envia cap carta.',
  en: FIN + '\nIf you did not ask for this, do nothing: no letter is sent without the code.',
};
// [REVISIÓN LEGAL] confirmación en soporte duradero de la renuncia al desistimiento (art. 98.7 TRLGDCU)
const RENUNCIA = {
  es: '\n\nAntes de pagar pediste que la enviáramos ya (o en la fecha programada) y aceptaste que, una vez enviada, pierdes el derecho de desistimiento. Condiciones: https://feehund.com/condiciones/#te-damos-de-baja',
  ca: "\n\nAbans de pagar vas demanar que l'enviéssim ara (o a la data programada) i vas acceptar que, un cop enviada, perds el dret de desistiment. Condicions: https://feehund.com/ca/condicions/#te-damos-de-baja",
  en: '\n\nBefore paying you asked us to send it now (or on the scheduled date) and accepted that, once sent, you lose the right of withdrawal. Terms: https://feehund.com/en/terms/#te-damos-de-baja',
};

export const MENSAJES = {
  es: {
    codigo: (c, e) => [`Tu código para firmar la baja de ${e}: ${c}`, `Tu código para firmar la carta de baja de ${e} es:\n\n${c}\n\nCaduca en 15 minutos.` + PIE.es],
    recibido: (e, url) => [`Recibido: enviamos tu baja de ${e} en 24 horas`, `Gracias. Hemos recibido tu pago y ya estamos gestionando tu baja.\n\nEnviamos tu carta a ${e} por correo electrónico certificado en las próximas 24 horas y te mandamos el justificante a este correo. Te adjuntamos la carta firmada.\n\nCómo va: ${url}` + RENUNCIA.es + FIN],
    programada: (e, f, url) => [`Recibido: enviamos tu baja de ${e} el ${f}`, `Gracias. Hemos recibido tu pago y tu baja ya está programada.\n\nEnviamos tu carta a ${e} el ${f} por correo electrónico certificado y ese día te mandamos el justificante a este correo. Hasta entonces puedes cancelarla y te devolvemos el dinero. Te adjuntamos la carta firmada.\n\nCómo va: ${url}` + RENUNCIA.es + FIN],
    justificante: (e, f, url) => [`Tu baja de ${e} ya está enviada: aquí tienes el justificante`, `Enviamos tu carta de baja a ${e} el ${f} por correo electrónico certificado. Te adjuntamos el justificante del envío certificado y tu carta: guárdalos, son la prueba de que la pediste y de cuándo.\n\nSi ${e} te contesta, la respuesta te llega a este correo.\nSi te vuelven a cobrar después de la baja, te enviamos una segunda carta gratis: ${url}` + FIN],
    devuelta: (e, imp) => [`No hemos podido entregar tu baja a ${e}: te devolvemos ${imp}`, `El correo de ${e} no ha aceptado tu carta. Te devolvemos ${imp} a la misma tarjeta; tarda de 5 a 10 días en verse.\n\nPuedes darte de baja por los otros caminos de nuestra guía gratis.` + FIN],
    recobro: (e, url) => [`Recibido: enviamos una segunda carta a ${e} en 24 horas`, `En las próximas 24 horas enviamos a ${e} una segunda carta, gratis, reclamando el cobro posterior a tu baja y citando el justificante. Te la adjuntamos.\n\nCómo va: ${url}` + FIN],
    cancelada: (e, imp) => [`Envío a ${e} cancelado`, `Has cancelado el envío de tu baja a ${e} y hemos borrado tus datos. Te devolvemos ${imp} a la misma tarjeta.` + FIN],
    restantes: (n, imp) => [`Te devolvemos ${imp}`, `Te devolvemos ${imp} por ${n === 1 ? 'la baja que no has usado' : `las ${n} bajas que no has usado`}. Tarda de 5 a 10 días en verse en tu tarjeta.` + FIN],
    descripcion: (n) => n === 1 ? 'Te damos de baja · 1 baja con certificado' : `Te damos de baja · ${n} bajas con certificado`,
    renuncia: 'Pides que enviemos la carta ya (o en la fecha programada). Por eso, una vez enviada, pierdes el derecho de desistimiento. Si no llega, te devolvemos el dinero.',
  },
  ca: {
    codigo: (c, e) => [`El teu codi per signar la baixa de ${e}: ${c}`, `El teu codi per signar la carta de baixa de ${e} és:\n\n${c}\n\nCaduca d'aquí a 15 minuts.` + PIE.ca],
    recibido: (e, url) => [`Rebut: enviem la teva baixa de ${e} en 24 hores`, `Gràcies. Hem rebut el teu pagament i ja estem gestionant la teva baixa.\n\nEnviem la teva carta a ${e} per correu electrònic certificat en les properes 24 hores i t'enviem el justificant a aquest correu. T'adjuntem la carta signada.\n\nCom va: ${url}` + RENUNCIA.ca + FIN],
    programada: (e, f, url) => [`Rebut: enviem la teva baixa de ${e} el ${f}`, `Gràcies. Hem rebut el teu pagament i la teva baixa ja està programada.\n\nEnviem la teva carta a ${e} el ${f} per correu electrònic certificat i aquell dia t'enviem el justificant a aquest correu. Fins llavors la pots cancel·lar i et retornem els diners. T'adjuntem la carta signada.\n\nCom va: ${url}` + RENUNCIA.ca + FIN],
    justificante: (e, f, url) => [`La teva baixa de ${e} ja està enviada: aquí tens el justificant`, `Vam enviar la teva carta de baixa a ${e} el ${f} per correu electrònic certificat. T'adjuntem el justificant de l'enviament certificat i la teva carta: guarda'ls, són la prova que la vas demanar i de quan.\n\nSi ${e} et contesta, la resposta t'arriba a aquest correu.\nSi et tornen a cobrar després de la baixa, t'enviem una segona carta gratis: ${url}` + FIN],
    devuelta: (e, imp) => [`No hem pogut lliurar la teva baixa a ${e}: et retornem ${imp}`, `El correu de ${e} no ha acceptat la teva carta. Et retornem ${imp} a la mateixa targeta; triga de 5 a 10 dies a veure's.\n\nPots donar-te de baixa pels altres camins de la nostra guia gratis.` + FIN],
    recobro: (e, url) => [`Rebut: enviem una segona carta a ${e} en 24 hores`, `En les properes 24 hores enviem a ${e} una segona carta, gratis, reclamant el cobrament posterior a la teva baixa i citant el justificant. Te l'adjuntem.\n\nCom va: ${url}` + FIN],
    cancelada: (e, imp) => [`Enviament a ${e} cancel·lat`, `Has cancel·lat l'enviament de la teva baixa a ${e} i hem esborrat les teves dades. Et retornem ${imp} a la mateixa targeta.` + FIN],
    restantes: (n, imp) => [`Et retornem ${imp}`, `Et retornem ${imp} per ${n === 1 ? 'la baixa que no has fet servir' : `les ${n} baixes que no has fet servir`}. Triga de 5 a 10 dies a veure's a la targeta.` + FIN],
    descripcion: (n) => n === 1 ? 'Et donem de baixa · 1 baixa amb certificat' : `Et donem de baixa · ${n} baixes amb certificat`,
    renuncia: 'Demanes que enviem la carta ara (o a la data programada). Per això, un cop enviada, perds el dret de desistiment. Si no arriba, et retornem els diners.',
  },
  en: {
    codigo: (c, e) => [`Your code to sign your ${e} cancellation: ${c}`, `Your code to sign your cancellation letter to ${e} is:\n\n${c}\n\nIt expires in 15 minutes.` + PIE.en],
    recibido: (e, url) => [`Received: we send your ${e} cancellation within 24 hours`, `Thank you. We have received your payment and are already handling your cancellation.\n\nWe send your letter to ${e} by certified email within the next 24 hours and email you the proof of sending. Your signed letter is attached.\n\nHow it is going: ${url}` + RENUNCIA.en + FIN],
    programada: (e, f, url) => [`Received: we send your ${e} cancellation on ${f}`, `Thank you. We have received your payment and your cancellation is scheduled.\n\nWe send your letter to ${e} on ${f} by certified email and that day we email you the proof of sending. Until then you can cancel it and we refund you. Your signed letter is attached.\n\nHow it is going: ${url}` + RENUNCIA.en + FIN],
    justificante: (e, f, url) => [`Your ${e} cancellation has been sent: here is your proof`, `We sent your cancellation letter to ${e} on ${f} by certified email. The certified proof of sending and your letter are attached: keep them, they prove you asked and when.\n\nIf ${e} replies, the reply comes to this email.\nIf they charge you again after the cancellation, we send a second letter for free: ${url}` + FIN],
    devuelta: (e, imp) => [`We could not deliver your cancellation to ${e}: refunding ${imp}`, `${e}'s email did not accept your letter. We are refunding ${imp} to the same card; it takes 5 to 10 days to show.\n\nYou can still cancel the other ways in our free guide.` + FIN],
    recobro: (e, url) => [`Received: we send a second letter to ${e} within 24 hours`, `Within the next 24 hours we send ${e} a second letter, for free, disputing the charge after your cancellation and quoting the proof of sending. It is attached.\n\nHow it is going: ${url}` + FIN],
    cancelada: (e, imp) => [`Sending to ${e} cancelled`, `You cancelled sending your letter to ${e} and we have deleted your details. We are refunding ${imp} to the same card.` + FIN],
    restantes: (n, imp) => [`Refunding ${imp}`, `We are refunding ${imp} for ${n === 1 ? 'the cancellation you did not use' : `the ${n} cancellations you did not use`}. It takes 5 to 10 days to show on your card.` + FIN],
    descripcion: (n) => n === 1 ? 'We cancel it for you · 1 certified cancellation' : `We cancel it for you · ${n} certified cancellations`,
    renuncia: 'You ask us to send the letter now (or on the scheduled date). Once it is sent, you lose the right of withdrawal. If it is not delivered, we refund you.',
  },
};
export const msj = (idioma) => MENSAJES[idioma] || MENSAJES.es;

/* ---------- correos urgentes al equipo (castellano) ---------- */
const fecha = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const datosPersona = (b) => [`- Nombre: ${b.datos.nombre}`, `- Correo: ${b.datos.correo}`, b.datos.dni ? `- DNI/NIE: ${b.datos.dni}` : '', b.datos.dato ? `- Dato del contrato: ${b.datos.dato}` : ''].filter(Boolean).join('\n');

export const urgente = {
  baja: ({ e, b, c, recordatorio, gestion, lleidaCc, limite, programada }) => [
    `${recordatorio ? 'RECORDATORIO' : 'URGENTE'} · Enviar la baja de ${e.nombre} antes del ${limite} · ${b.ref}`,
    [`${recordatorio ? 'Esta baja sigue sin enviar.' : 'Nueva baja pagada.'} Hay que enviarla por correo certificado de Lleida.net como muy tarde el ${limite} (a la persona le hemos dicho ${programada ? `que sale el ${fecha(b.envio)}` : 'que sale en 24 horas'}).`,
      '',
      'Cómo (2 minutos):',
      `1. Lleida.net › Correo electrónico certificado › nuevo envío (o desde tu correo, con copia a ${lleidaCc}).`,
      `2. Para: ${e.correo}`,
      `3. Asunto (cópialo tal cual, lleva la referencia): ${c.asunto}`,
      '4. Texto: el de abajo, entre las dos rayas.',
      `5. Adjunta la carta en PDF (va en este correo).${e.dni === 'copia' ? ` ${e.nombre} suele pedir copia del DNI: la carta dice que la persona la enviará si se la piden.` : ''}`,
      `6. Cuando Lleida.net te mande el certificado en PDF, súbelo y pulsa «Hecho»: ${gestion}`,
      '   Eso le manda a la persona su justificante. Si la carta no se puede entregar, en la misma página: «No se pudo entregar» (se le devuelve el dinero).',
      '',
      `Empresa: ${e.nombre} · dirección de bajas de su ficha comprobada: ${e.correo}`,
      `Referencia: ${b.ref} · pagada: ${b.pagadaEn ? fecha(b.pagadaEn.slice(0, 10)) : '-'} · envío: ${fecha(b.envio)}`,
      '',
      'Persona:',
      datosPersona(b),
      '',
      '──────── texto de la carta ────────',
      c.cuerpo.join('\n'),
      '───────────────────────────────────',
      '',
      'Cuando esté enviada, borra este correo: lleva datos personales.',
    ].join('\n'),
  ],
  recobro: ({ e, b, r, gestion, lleidaCc, limite }) => [
    `URGENTE · Enviar la segunda carta a ${e.nombre} antes del ${limite} · ${b.ref}`,
    [`La persona dice que ${e.nombre} le ha vuelto a cobrar después de la baja. Hay que enviar la segunda carta (gratis) por correo certificado de Lleida.net como muy tarde el ${limite} (le hemos dicho que sale en 24 horas).`,
      '',
      `1. Para: ${e.correo} (con copia a ${lleidaCc} si lo envías desde tu correo)`,
      `2. Asunto: ${r.asunto}`,
      '3. Texto: el de abajo. Adjunta la reclamación en PDF y el justificante de la primera carta (van en este correo).',
      `Página de gestión: ${gestion}`,
      '',
      'Persona:',
      datosPersona(b),
      '',
      '──────── texto de la carta ────────',
      r.cuerpo.join('\n'),
      '───────────────────────────────────',
      '',
      'Cuando esté enviada, borra este correo: lleva datos personales.',
    ].join('\n'),
  ],
};
