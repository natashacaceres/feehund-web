// Correos a la persona, en el idioma en que usó la página. Texto plano, cortos, firmados «Feehund».
// e = nombre de la empresa, f = fecha en palabras, url = enlace a /baja/estado/.

const PIE = {
  es: '\n\nFeehund · feehund.com\nSi no has pedido esto, no hagas nada: sin el código no se envía ninguna carta.',
  ca: '\n\nFeehund · feehund.com\nSi no ho has demanat, no facis res: sense el codi no s\'envia cap carta.',
  en: '\n\nFeehund · feehund.com\nIf you did not ask for this, do nothing: no letter is sent without the code.',
};
// [REVISIÓN LEGAL] confirmación en soporte duradero de la renuncia al desistimiento (art. 98.7 TRLGDCU)
const RENUNCIA = { es: '\n\nAntes de pagar pediste que la enviáramos ya (o en la fecha programada) y aceptaste que, una vez enviada, pierdes el derecho de desistimiento. Condiciones: https://feehund.com/condiciones/#te-damos-de-baja', ca: "\n\nAbans de pagar vas demanar que l'enviéssim ara (o a la data programada) i vas acceptar que, un cop enviada, perds el dret de desistiment. Condicions: https://feehund.com/ca/condicions/#te-damos-de-baja", en: '\n\nBefore paying you asked us to send it now (or on the scheduled date) and accepted that, once sent, you lose the right of withdrawal. Terms: https://feehund.com/en/terms/#te-damos-de-baja' };
const FIN = { es: '\n\nFeehund · feehund.com', ca: '\n\nFeehund · feehund.com', en: '\n\nFeehund · feehund.com' };

export const MENSAJES = {
  es: {
    codigo: (c, e) => [`Tu código para firmar la baja de ${e}: ${c}`, `Tu código para firmar la carta de baja de ${e} es:\n\n${c}\n\nCaduca en 15 minutos.` + PIE.es],
    programada: (e, f, url) => [`Baja de ${e} programada para el ${f}`, `Pago recibido. Enviaremos tu carta de baja a ${e} el ${f}, con certificado, y te avisaremos. Hasta ese día puedes cancelarla y te devolvemos el dinero.\n\nTu carta y el estado: ${url}` + RENUNCIA.es + FIN.es],
    enviada: (e, url) => [`Hemos enviado tu baja a ${e}`, `Tu carta de baja ya va de camino a ${e}, con certificado de Lleida.net. Te adjuntamos la carta firmada.\n\nSi ${e} te contesta, la respuesta te llega directamente a ti.\nCuando tengamos el certificado de entrega te lo mandamos.\n\nEstado: ${url}` + RENUNCIA.es + FIN.es],
    certificado: (e, url) => [`Certificado de entrega: baja de ${e}`, `Tu carta de baja llegó a ${e}. Te adjuntamos el certificado de Lleida.net: guárdalo, es la prueba de que la pediste y de cuándo.\n\nSi te vuelven a cobrar después de la fecha de baja, te enviamos una segunda carta gratis: ${url}` + FIN.es],
    devuelta: (e, imp) => [`No hemos podido entregar tu baja a ${e}: te devolvemos ${imp}`, `El correo de ${e} no ha aceptado tu carta. Te devolvemos ${imp} a la misma tarjeta; tarda de 5 a 10 días en verse.\n\nPuedes darte de baja por los otros caminos de nuestra guía gratis.` + FIN.es],
    recobro: (e, url) => [`Segunda carta enviada a ${e}`, `Hemos enviado a ${e} una segunda carta, gratis, reclamando el cobro posterior a tu baja y citando el certificado. Te la adjuntamos.\n\nEstado: ${url}` + FIN.es],
    cancelada: (e, imp) => [`Envío a ${e} cancelado`, `Has cancelado el envío de tu baja a ${e} y hemos borrado tus datos. Te devolvemos ${imp} a la misma tarjeta.` + FIN.es],
    restantes: (n, imp) => [`Te devolvemos ${imp}`, `Te devolvemos ${imp} por ${n === 1 ? 'la baja que no has usado' : `las ${n} bajas que no has usado`}. Tarda de 5 a 10 días en verse en tu tarjeta.` + FIN.es],
    descripcion: (n) => n === 1 ? 'Te damos de baja · 1 baja con certificado' : `Te damos de baja · ${n} bajas con certificado`,
    renuncia: 'Pides que enviemos la carta ya (o en la fecha programada). Por eso, una vez enviada, pierdes el derecho de desistimiento. Si no llega, te devolvemos el dinero.',
  },
  ca: {
    codigo: (c, e) => [`El teu codi per signar la baixa de ${e}: ${c}`, `El teu codi per signar la carta de baixa de ${e} és:\n\n${c}\n\nCaduca d'aquí a 15 minuts.` + PIE.ca],
    programada: (e, f, url) => [`Baixa de ${e} programada per al ${f}`, `Pagament rebut. Enviarem la teva carta de baixa a ${e} el ${f}, amb certificat, i t'avisarem. Fins aquell dia la pots cancel·lar i et retornem els diners.\n\nLa teva carta i l'estat: ${url}` + RENUNCIA.ca + FIN.ca],
    enviada: (e, url) => [`Hem enviat la teva baixa a ${e}`, `La teva carta de baixa ja va cap a ${e}, amb certificat de Lleida.net. T'adjuntem la carta signada.\n\nSi ${e} et contesta, la resposta t'arriba directament a tu.\nQuan tinguem el certificat de lliurament te l'enviarem.\n\nEstat: ${url}` + RENUNCIA.ca + FIN.ca],
    certificado: (e, url) => [`Certificat de lliurament: baixa de ${e}`, `La teva carta de baixa va arribar a ${e}. T'adjuntem el certificat de Lleida.net: guarda'l, és la prova que la vas demanar i de quan.\n\nSi et tornen a cobrar després de la data de baixa, t'enviem una segona carta gratis: ${url}` + FIN.ca],
    devuelta: (e, imp) => [`No hem pogut lliurar la teva baixa a ${e}: et retornem ${imp}`, `El correu de ${e} no ha acceptat la teva carta. Et retornem ${imp} a la mateixa targeta; triga de 5 a 10 dies a veure's.\n\nPots donar-te de baixa pels altres camins de la nostra guia gratis.` + FIN.ca],
    recobro: (e, url) => [`Segona carta enviada a ${e}`, `Hem enviat a ${e} una segona carta, gratis, reclamant el cobrament posterior a la teva baixa i citant el certificat. Te l'adjuntem.\n\nEstat: ${url}` + FIN.ca],
    cancelada: (e, imp) => [`Enviament a ${e} cancel·lat`, `Has cancel·lat l'enviament de la teva baixa a ${e} i hem esborrat les teves dades. Et retornem ${imp} a la mateixa targeta.` + FIN.ca],
    restantes: (n, imp) => [`Et retornem ${imp}`, `Et retornem ${imp} per ${n === 1 ? 'la baixa que no has fet servir' : `les ${n} baixes que no has fet servir`}. Triga de 5 a 10 dies a veure's a la targeta.` + FIN.ca],
    descripcion: (n) => n === 1 ? 'Et donem de baixa · 1 baixa amb certificat' : `Et donem de baixa · ${n} baixes amb certificat`,
    renuncia: 'Demanes que enviem la carta ja (o a la data programada). Per això, un cop enviada, perds el dret de desistiment. Si no arriba, et retornem els diners.',
  },
  en: {
    codigo: (c, e) => [`Your code to sign your ${e} cancellation: ${c}`, `Your code to sign your cancellation letter to ${e} is:\n\n${c}\n\nIt expires in 15 minutes.` + PIE.en],
    programada: (e, f, url) => [`${e} cancellation scheduled for ${f}`, `Payment received. We will send your cancellation letter to ${e} on ${f}, with a certificate, and let you know. Until that day you can cancel it and we refund you.\n\nYour letter and status: ${url}` + RENUNCIA.en + FIN.en],
    enviada: (e, url) => [`We have sent your cancellation to ${e}`, `Your cancellation letter is on its way to ${e}, certified by Lleida.net. Your signed letter is attached.\n\nIf ${e} replies, the reply comes straight to you.\nWe will send you the delivery certificate as soon as we have it.\n\nStatus: ${url}` + RENUNCIA.en + FIN.en],
    certificado: (e, url) => [`Delivery certificate: ${e} cancellation`, `Your cancellation letter reached ${e}. The Lleida.net certificate is attached: keep it, it proves you asked and when.\n\nIf they charge you again after the cancellation date, we send a second letter for free: ${url}` + FIN.en],
    devuelta: (e, imp) => [`We could not deliver your cancellation to ${e}: refunding ${imp}`, `${e}'s email did not accept your letter. We are refunding ${imp} to the same card; it takes 5 to 10 days to show.\n\nYou can still cancel the other ways in our free guide.` + FIN.en],
    recobro: (e, url) => [`Second letter sent to ${e}`, `We have sent ${e} a second letter, for free, disputing the charge after your cancellation and quoting the certificate. It is attached.\n\nStatus: ${url}` + FIN.en],
    cancelada: (e, imp) => [`Sending to ${e} cancelled`, `You cancelled sending your letter to ${e} and we have deleted your details. We are refunding ${imp} to the same card.` + FIN.en],
    restantes: (n, imp) => [`Refunding ${imp}`, `We are refunding ${imp} for ${n === 1 ? 'the cancellation you did not use' : `the ${n} cancellations you did not use`}. It takes 5 to 10 days to show on your card.` + FIN.en],
    descripcion: (n) => n === 1 ? 'We cancel it for you · 1 certified cancellation' : `We cancel it for you · ${n} certified cancellations`,
    renuncia: 'You ask us to send the letter now (or on the scheduled date). Once it is sent, you lose the right of withdrawal. If it is not delivered, we refund you.',
  },
};
export const msj = (idioma) => MENSAJES[idioma] || MENSAJES.es;
