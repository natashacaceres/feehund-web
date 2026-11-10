// Textos del lector del datáfono (ES, CA, EN). Frases cortas y llanas, de tú. Las {llaves} se rellenan con los datos.
// Las comprobaciones tienen dos frases: <codigo>_si (cuadra) y <codigo>_no (no cuadra).

export default {
  // errores de un archivo
  es_extracto_banco: {
    es: 'Esto parece el extracto de tu cuenta. Aquí va el resumen que te manda el banco o la empresa del datáfono. El extracto se lee en Mi banco.',
    ca: 'Això sembla l\'extracte del teu compte. Aquí va el resum que t\'envia el banc o l\'empresa del datàfon. L\'extracte es llegeix a El meu banc.',
    en: 'This looks like your bank statement. This tool reads the summary your bank or card machine company sends you. Statements go in My bank.',
  },
  sin_datos_datafono: {
    es: 'No encontramos las ventas con tarjeta en este archivo. Prueba con el resumen mensual del datáfono o escríbelo a mano.',
    ca: 'No trobem les vendes amb targeta en aquest arxiu. Prova amb el resum mensual del datàfon o escriu-ho a mà.',
    en: 'We could not find your card sales in this file. Try the monthly summary from your card machine, or type the figures in.',
  },

  // avisos
  fb500_filas_sin_leer: { es: '{n} líneas de {archivo} no se han podido leer.', ca: '{n} línies de {archivo} no s\'han pogut llegir.', en: '{n} lines in {archivo} could not be read.' },
  cifras_distintas: {
    es: 'El resumen da dos cifras distintas para las ventas ({cifras}). Mira cuál es la buena.',
    ca: 'El resum dona dues xifres diferents per a les vendes ({cifras}). Mira quina és la bona.',
    en: 'The summary shows two different sales figures ({cifras}). Check which one is right.',
  },
  sin_desglose: {
    es: 'El resumen no separa las ventas por tipo de tarjeta. Las hemos puesto todas como tarjetas de particular.',
    ca: 'El resum no separa les vendes per tipus de targeta. Les hem posat totes com a targetes de particular.',
    en: 'The summary does not split sales by card type. We have put them all under consumer cards.',
  },
  sin_separar_empresa: {
    es: 'El resumen no dice qué tarjetas son de empresa. Si cobras a muchas empresas, cambia esa cifra.',
    ca: 'El resum no diu quines targetes són d\'empresa. Si cobres a moltes empreses, canvia aquesta xifra.',
    en: 'The summary does not say which cards are business cards. If many of your customers are businesses, change that figure.',
  },
  lineas_sin_entender: {
    es: 'Hay {n} líneas con cifras que no sabemos qué son. No las hemos contado.',
    ca: 'Hi ha {n} línies amb xifres que no sabem què són. No les hem comptat.',
    en: 'There are {n} lines with figures we could not identify. We have left them out.',
  },
  hay_devoluciones: {
    es: 'Ese mes devolviste {importe} a clientes. No se restan de las ventas.',
    ca: 'Aquell mes vas tornar {importe} a clients. No es resten de les vendes.',
    en: 'That month you refunded {importe} to customers. Refunds are not taken off your sales.',
  },
  hay_contracargos: {
    es: 'Hubo contracargos por {importe}. No se cuentan como ventas.',
    ca: 'Hi va haver retrocessions per {importe}. No es compten com a vendes.',
    en: 'There were chargebacks for {importe}. They are not counted as sales.',
  },
  filas_repetidas: {
    es: '{n} líneas salían dos veces en el resumen. Las hemos contado una vez.',
    ca: '{n} línies sortien dues vegades al resum. Les hem comptat una vegada.',
    en: '{n} lines appeared twice in the summary. We counted them once.',
  },
  varios_meses: {
    es: 'El archivo tiene {n} meses. Usamos {mes}. Puedes elegir otro.',
    ca: 'L\'arxiu té {n} mesos. Fem servir {mes}. En pots triar un altre.',
    en: 'The file covers {n} months. We are using {mes}. You can pick another one.',
  },
  varios_resumenes: {
    es: 'Has soltado {n} resúmenes. Usamos el más reciente, {archivo}.',
    ca: 'Has deixat anar {n} resums. Fem servir el més recent, {archivo}.',
    en: 'You dropped {n} summaries. We are using the most recent one, {archivo}.',
  },
  dias_suman_total_si: {
    es: 'Los {n} días del resumen suman {suma}, lo mismo que el total.',
    ca: 'Els {n} dies del resum sumen {suma}, el mateix que el total.',
    en: 'The {n} days in the summary add up to {suma}, the same as the total.',
  },
  dias_suman_total_no: {
    es: 'Los {n} días del resumen suman {suma}, pero el total dice {total}.',
    ca: 'Els {n} dies del resum sumen {suma}, però el total diu {total}.',
    en: 'The {n} days in the summary add up to {suma}, but the total says {total}.',
  },
  mes_en_curso: {
    es: '{mes} aún no ha terminado. Mejor usa un mes completo.',
    ca: '{mes} encara no s\'ha acabat. Millor fes servir un mes sencer.',
    en: '{mes} has not finished yet. A full month gives a better result.',
  },
  mes_quiza_incompleto: {
    es: 'Las ventas van del {primera} al {ultima}. Si faltan días, descarga el mes entero.',
    ca: 'Les vendes van del {primera} al {ultima}. Si falten dies, descarrega el mes sencer.',
    en: 'Sales run from {primera} to {ultima}. If days are missing, download the whole month.',
  },
  operaciones_fallidas: {
    es: '{n} cobros fallidos o cancelados no se han contado.',
    ca: '{n} cobraments fallits o cancel·lats no s\'han comptat.',
    en: '{n} failed or cancelled payments were left out.',
  },
  otras_divisas: {
    es: '{n} cobros en otra moneda ({divisas}) no se han contado.',
    ca: '{n} cobraments en una altra moneda ({divisas}) no s\'han comptat.',
    en: '{n} payments in another currency ({divisas}) were left out.',
  },
  otros_movimientos: {
    es: '{n} líneas no eran cobros (abonos a tu cuenta, ajustes). No se han contado como ventas.',
    ca: '{n} línies no eren cobraments (abonaments al teu compte, ajustos). No s\'han comptat com a vendes.',
    en: '{n} lines were not payments (payouts, adjustments). They were not counted as sales.',
  },
  sin_periodo: {
    es: 'No vemos de qué mes es el resumen. Comprueba que sea de un mes entero.',
    ca: 'No veiem de quin mes és el resum. Comprova que sigui d\'un mes sencer.',
    en: 'We cannot see which month the summary is for. Check that it covers a whole month.',
  },
  periodo_no_es_un_mes: {
    es: 'El resumen va del {desde} al {hasta} ({dias} días). La calculadora pide un mes.',
    ca: 'El resum va del {desde} al {hasta} ({dias} dies). La calculadora demana un mes.',
    en: 'The summary runs from {desde} to {hasta} ({dias} days). The calculator needs one month.',
  },

  // comprobaciones
  tipos_suman_total_si: {
    es: 'Las ventas por tipo de tarjeta suman {suma}, lo mismo que el total.',
    ca: 'Les vendes per tipus de targeta sumen {suma}, el mateix que el total.',
    en: 'Sales by card type add up to {suma}, the same as the total.',
  },
  tipos_suman_total_no: {
    es: 'Las ventas por tipo de tarjeta suman {suma}, pero el total dice {total}.',
    ca: 'Les vendes per tipus de targeta sumen {suma}, però el total diu {total}.',
    en: 'Sales by card type add up to {suma}, but the total says {total}.',
  },
  operaciones_suman_total_si: {
    es: 'Las operaciones suman lo mismo que el total.',
    ca: 'Les operacions sumen el mateix que el total.',
    en: 'The number of payments matches the total.',
  },
  operaciones_suman_total_no: {
    es: 'Las operaciones suman {suma}, pero el total dice {total}.',
    ca: 'Les operacions sumen {suma}, però el total diu {total}.',
    en: 'Payments add up to {suma}, but the total says {total}.',
  },
  comisiones_suman_total_si: {
    es: 'Las comisiones suman {suma}, lo mismo que el total.',
    ca: 'Les comissions sumen {suma}, el mateix que el total.',
    en: 'Fees add up to {suma}, the same as the total.',
  },
  comisiones_suman_total_no: {
    es: 'Las comisiones suman {suma}, pero el total dice {total}.',
    ca: 'Les comissions sumen {suma}, però el total diu {total}.',
    en: 'Fees add up to {suma}, but the total says {total}.',
  },
  cargos_suman_total_si: {
    es: 'Comisiones, cuota y alquiler suman {suma}, lo mismo que el total cobrado.',
    ca: 'Comissions, quota i lloguer sumen {suma}, el mateix que el total cobrat.',
    en: 'Fees, monthly fee and rental add up to {suma}, the same as the total charged.',
  },
  cargos_suman_total_no: {
    es: 'Comisiones, cuota y alquiler suman {suma}, pero el total cobrado dice {total}.',
    ca: 'Comissions, quota i lloguer sumen {suma}, però el total cobrat diu {total}.',
    en: 'Fees, monthly fee and rental add up to {suma}, but the total charged says {total}.',
  },
  comision_cuadra_tasa_si: {
    es: '{etiqueta}. {ventas} al {tasa} da {comision}, lo que pone el resumen.',
    ca: '{etiqueta}. {ventas} al {tasa} dona {comision}, el que posa el resum.',
    en: '{etiqueta}. {ventas} at {tasa} gives {comision}, as the summary says.',
  },
  comision_cuadra_tasa_no: {
    es: '{etiqueta}. {ventas} al {tasa} daría {esperado}, pero el resumen cobra {comision}.',
    ca: '{etiqueta}. {ventas} al {tasa} donaria {esperado}, però el resum cobra {comision}.',
    en: '{etiqueta}. {ventas} at {tasa} would be {esperado}, but the summary charges {comision}.',
  },
  iva_cuadra_si: {
    es: 'El IVA es el 21 % de lo que lo lleva.',
    ca: 'L\'IVA és el 21 % del que en porta.',
    en: 'The VAT is 21 % of the items that carry it.',
  },
  iva_cuadra_no: {
    es: 'El IVA ({iva}) no es el 21 % de la cuota y el alquiler. Revísalo.',
    ca: 'L\'IVA ({iva}) no és el 21 % de la quota i el lloguer. Revisa-ho.',
    en: 'The VAT ({iva}) is not 21 % of the monthly fee and rental. Please check it.',
  },
  neto_cuadra_si: {
    es: 'Lo que te abonaron ({neto}) cuadra con las ventas menos lo cobrado.',
    ca: 'El que et van abonar ({neto}) quadra amb les vendes menys el que s\'ha cobrat.',
    en: 'What was paid to you ({neto}) matches sales minus charges.',
  },
  neto_cuadra_no: {
    es: 'Lo que te abonaron ({neto}) no cuadra con las ventas menos lo cobrado.',
    ca: 'El que et van abonar ({neto}) no quadra amb les vendes menys el que s\'ha cobrat.',
    en: 'What was paid to you ({neto}) does not match sales minus charges.',
  },
  intercambio_tope_si: {
    es: 'La tasa de intercambio de las tarjetas de particular está dentro del límite legal.',
    ca: 'La taxa d\'intercanvi de les targetes de particular és dins del límit legal.',
    en: 'The interchange fee on consumer cards is within the legal limit.',
  },
  intercambio_tope_no: {
    es: 'La tasa de intercambio de las tarjetas de particular es del {pct}, por encima del límite del 0,3 %. Puede que haya tarjetas de empresa o de fuera mezcladas.',
    ca: 'La taxa d\'intercanvi de les targetes de particular és del {pct}, per sobre del límit del 0,3 %. Potser hi ha targetes d\'empresa o de fora barrejades.',
    en: 'The interchange fee on consumer cards is {pct}, above the 0.3 % limit. Business or non-European cards may be mixed in.',
  },
  neto_por_fila_si: {
    es: 'En cada cobro, el importe menos la comisión da el neto.',
    ca: 'En cada cobrament, l\'import menys la comissió dona el net.',
    en: 'For every payment, amount minus fee equals the net amount.',
  },
  neto_por_fila_no: {
    es: 'En {malas} de {n} cobros, el importe menos la comisión no da el neto.',
    ca: 'En {malas} de {n} cobraments, l\'import menys la comissió no dona el net.',
    en: 'In {malas} of {n} payments, amount minus fee does not equal the net amount.',
  },
  periodo_un_mes_si: {
    es: 'El resumen es de un mes entero, del {desde} al {hasta}.',
    ca: 'El resum és d\'un mes sencer, del {desde} al {hasta}.',
    en: 'The summary covers a whole month, from {desde} to {hasta}.',
  },
  periodo_un_mes_no: {
    es: 'El resumen va del {desde} al {hasta}, que no es un mes entero.',
    ca: 'El resum va del {desde} al {hasta}, que no és un mes sencer.',
    en: 'The summary runs from {desde} to {hasta}, which is not a whole month.',
  },

  // por qué una cifra no es segura
  motivo_sin_separar_empresa: { es: 'Puede incluir tarjetas de empresa.', ca: 'Pot incloure targetes d\'empresa.', en: 'May include business cards.' },
  motivo_sin_separar_region: { es: 'Puede incluir tarjetas de fuera de Europa.', ca: 'Pot incloure targetes de fora d\'Europa.', en: 'May include non-European cards.' },
  motivo_atribuido_por_tamano: { es: 'Leído por el orden de las cifras. Compruébalo.', ca: 'Llegit per l\'ordre de les xifres. Comprova-ho.', en: 'Read from the order of the figures. Please check.' },
  motivo_sin_desglose: { es: 'Es el total de todas las tarjetas.', ca: 'És el total de totes les targetes.', en: 'This is the total for all cards.' },
  motivo_solo_comisiones: { es: 'Solo comisiones. Suma la cuota o el alquiler si los pagas aparte.', ca: 'Només comissions. Suma-hi la quota o el lloguer si els pagues a part.', en: 'Fees only. Add any monthly fee or rental you pay separately.' },
  motivo_cifras_distintas: { es: 'El resumen da dos cifras distintas.', ca: 'El resum dona dues xifres diferents.', en: 'The summary shows two different figures.' },
  motivo_varias_tasas: { es: 'Media de varias tasas.', ca: 'Mitjana de diverses taxes.', en: 'Average of several rates.' },
  motivo_tasa_media: { es: 'Comisión entre ventas.', ca: 'Comissió entre vendes.', en: 'Fees divided by sales.' },
  motivo_misma_tasa: { es: 'Es la tasa general del resumen.', ca: 'És la taxa general del resum.', en: 'This is the general rate in the summary.' },
  motivo_iva_incluido: { es: 'Con IVA.', ca: 'Amb IVA.', en: 'VAT included.' },
  motivo_quitado_iva: { es: 'Le hemos quitado el 21 % de IVA.', ca: 'Li hem tret el 21 % d\'IVA.', en: 'We took off 21 % VAT.' },
  motivo_no_cuadra: { es: 'No cuadra con el resto del resumen.', ca: 'No quadra amb la resta del resum.', en: 'Does not match the rest of the summary.' },
  motivo_foto_sin_comprobar: { es: 'Leído de una foto. Compruébalo.', ca: 'Llegit d\'una foto. Comprova-ho.', en: 'Read from a photo. Please check.' },
  motivo_mes_en_curso: { es: 'El mes aún no ha terminado.', ca: 'El mes encara no s\'ha acabat.', en: 'The month has not finished yet.' },
  motivo_filas_sin_comision: { es: 'Algunos cobros no traen su comisión.', ca: 'Alguns cobraments no porten la seva comissió.', en: 'Some payments do not show their fee.' },
  motivo_varios_proveedores: { es: 'El resumen nombra a más de una empresa.', ca: 'El resum anomena més d\'una empresa.', en: 'The summary names more than one company.' },

  // nombres de los campos (pantalla «revisa tus cifras»)
  campo_ventas_particulares: { es: 'Tarjetas españolas o europeas de particulares', ca: 'Targetes espanyoles o europees de particulars', en: 'Spanish or European consumer cards' },
  campo_ventas_empresa: { es: 'Tarjetas de empresa', ca: 'Targetes d\'empresa', en: 'Business cards' },
  campo_ventas_fuera_europa: { es: 'Tarjetas de fuera de Europa', ca: 'Targetes de fora d\'Europa', en: 'Cards from outside Europe' },
  campo_ventas_amex: { es: 'American Express', ca: 'American Express', en: 'American Express' },
  campo_ventas_bizum: { es: 'Bizum en el datáfono', ca: 'Bizum al datàfon', en: 'Bizum on the card machine' },
  campo_operaciones: { es: 'Número de cobros', ca: 'Nombre de cobraments', en: 'Number of payments' },
  campo_pagado: { es: 'Lo que te cobraron ese mes', ca: 'El que et van cobrar aquell mes', en: 'What you were charged that month' },
  campo_proveedor: { es: 'Con quién cobras', ca: 'Amb qui cobres', en: 'Who you use' },
  campo_tasa_particulares: { es: 'Comisión tarjetas de particulares', ca: 'Comissió targetes de particulars', en: 'Fee on consumer cards' },
  campo_tasa_empresa: { es: 'Comisión tarjetas de empresa', ca: 'Comissió targetes d\'empresa', en: 'Fee on business cards' },
  campo_tasa_fuera_europa: { es: 'Comisión tarjetas de fuera de Europa', ca: 'Comissió targetes de fora d\'Europa', en: 'Fee on non-European cards' },
  campo_tasa_amex: { es: 'Comisión American Express', ca: 'Comissió American Express', en: 'American Express fee' },
  campo_tasa_bizum: { es: 'Comisión Bizum', ca: 'Comissió Bizum', en: 'Bizum fee' },
  campo_fijo_por_cobro: { es: 'Fijo por cobro', ca: 'Fix per cobrament', en: 'Fixed fee per payment' },
  campo_cuota: { es: 'Cuota mensual', ca: 'Quota mensual', en: 'Monthly fee' },
  campo_alquiler: { es: 'Alquiler del datáfono al mes, sin IVA', ca: 'Lloguer del datàfon al mes, sense IVA', en: 'Card machine rental per month, excluding VAT' },

  // de dónde sale una cifra
  como_leido: { es: 'Leído en el resumen', ca: 'Llegit al resum', en: 'Read from the summary' },
  como_sumado: { es: 'Suma de varias líneas', ca: 'Suma de diverses línies', en: 'Sum of several lines' },
  como_contado: { es: 'Cobros contados uno a uno', ca: 'Cobraments comptats un a un', en: 'Payments counted one by one' },
  como_calculado: { es: 'Calculado con cifras del resumen', ca: 'Calculat amb xifres del resum', en: 'Worked out from figures in the summary' },
  como_supuesto: { es: 'Supuesto. Compruébalo.', ca: 'Suposat. Comprova-ho.', en: 'Assumed. Please check.' },
  como_sin_ventas: { es: 'No sale en el resumen', ca: 'No surt al resum', en: 'Not in the summary' },
  como_nombre: { es: 'Por el nombre que sale en el resumen', ca: 'Pel nom que surt al resum', en: 'From the name on the summary' },
  como_formato: { es: 'Por el formato del archivo', ca: 'Pel format de l\'arxiu', en: 'From the file format' },
  origen_pagina: { es: 'Página {pagina}, línea {fila}', ca: 'Pàgina {pagina}, línia {fila}', en: 'Page {pagina}, line {fila}' },
  origen_hoja: { es: 'Hoja {hoja}, fila {fila}', ca: 'Full {hoja}, fila {fila}', en: 'Sheet {hoja}, row {fila}' },
  origen_fila: { es: 'Fila {fila}', ca: 'Fila {fila}', en: 'Row {fila}' },
  origen_varias: { es: '{n} filas', ca: '{n} files', en: '{n} rows' },

  // progreso y página
  progreso_resumen: { es: 'Leyendo tu resumen…', ca: 'Llegint el teu resum…', en: 'Reading your summary…' },
  nombre_texto_pegado_resumen: { es: 'texto pegado', ca: 'text enganxat', en: 'pasted text' },
};
