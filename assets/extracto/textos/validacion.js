// Textos de la validación (saldos, fechas, periodo) y de la unión de varios archivos.
// Frases cortas y llanas, en tú. Las {llaves} se rellenan con los datos del aviso.
// Donde el número puede ser 1 hay dos códigos (plural y singular) para que la frase concuerde.
// Las fechas llegan ya escritas como dd/mm/aaaa en {desde_fecha} y {hasta_fecha}.
export default {
  // Resultado de la comprobación de saldos
  verificada: {
    es: 'Hemos comprobado el saldo fila a fila y cuadra.',
    ca: 'Hem comprovat el saldo fila per fila i quadra.',
    en: 'We checked the balance row by row and it adds up.',
  },
  verificada_declarados: {
    es: 'Hemos comprobado que el saldo inicial del extracto más los movimientos da su saldo final, y cuadra.',
    ca: 'Hem comprovat que el saldo inicial de l\'extracte més els moviments dona el saldo final, i quadra.',
    en: 'We checked that the opening balance of the statement plus the transactions gives its closing balance, and it adds up.',
  },
  verificada_ambos: {
    es: 'Hemos comprobado el saldo fila a fila y también los saldos que indica el extracto. Todo cuadra.',
    ca: 'Hem comprovat el saldo fila per fila i també els saldos que indica l\'extracte. Tot quadra.',
    en: 'We checked the balance row by row and also the balances shown on the statement. Everything adds up.',
  },
  no_cuadra: {
    es: 'Hay {n} filas en las que el saldo no cuadra. Revísalas antes de fiarte del resultado.',
    ca: 'Hi ha {n} files en què el saldo no quadra. Revisa-les abans de refiar-te del resultat.',
    en: 'There are {n} rows where the balance does not add up. Check them before you trust the result.',
  },
  no_cuadra_una: {
    es: 'Hay una fila en la que el saldo no cuadra. Revísala antes de fiarte del resultado.',
    ca: 'Hi ha una fila en què el saldo no quadra. Revisa-la abans de refiar-te del resultat.',
    en: 'There is one row where the balance does not add up. Check it before you trust the result.',
  },
  no_cuadra_declarados: {
    es: 'El saldo inicial del extracto más los movimientos que hemos leído no da su saldo final. Puede que falte algún movimiento. Revísalo antes de fiarte del resultado.',
    ca: 'El saldo inicial de l\'extracte més els moviments que hem llegit no dona el saldo final. Potser hi falta algun moviment. Revisa-ho abans de refiar-te del resultat.',
    en: 'The opening balance of the statement plus the transactions we read does not give its closing balance. A transaction may be missing. Check it before you trust the result.',
  },
  no_cuadra_saldo_final: {
    es: 'El último saldo que hemos leído no lleva al saldo final que indica el extracto. Puede que falte algún movimiento al final.',
    ca: 'L\'últim saldo que hem llegit no porta al saldo final que indica l\'extracte. Potser hi falta algun moviment al final.',
    en: 'The last balance we read does not lead to the closing balance shown on the statement. A transaction may be missing at the end.',
  },
  sin_verificar: {
    es: 'Tu archivo no trae el saldo de cada movimiento, así que no hemos podido comprobar que no falte ninguno.',
    ca: 'El teu fitxer no porta el saldo de cada moviment, així que no hem pogut comprovar que no en falti cap.',
    en: 'Your file does not show the balance after each transaction, so we could not check that none is missing.',
  },
  sin_verificar_foto: {
    es: 'En la foto no hemos podido leer el saldo de cada movimiento, así que no hemos podido comprobar que no falte ninguno. Revisa la tabla antes de seguir.',
    ca: 'A la foto no hem pogut llegir el saldo de cada moviment, així que no hem pogut comprovar que no en falti cap. Revisa la taula abans de continuar.',
    en: 'We could not read the balance of each transaction in the photo, so we could not check that none is missing. Check the table before you go on.',
  },
  divisa_sin_verificar: {
    es: 'No hemos podido comprobar el saldo de los movimientos en {divisa}.',
    ca: 'No hem pogut comprovar el saldo dels moviments en {divisa}.',
    en: 'We could not check the balance of the transactions in {divisa}.',
  },
  orden_mismo_dia: {
    es: 'Algunos movimientos del mismo día venían en otro orden. Para comprobar el saldo los hemos puesto en el orden en que cuadran.',
    ca: 'Alguns moviments del mateix dia venien en un altre ordre. Per comprovar el saldo els hem posat en l\'ordre en què quadren.',
    en: 'Some transactions from the same day came in a different order. To check the balance we put them in the order in which it adds up.',
  },

  // Explicación de cada fila que no cuadra (la interfaz enseña la fila al lado)
  fila_importe: {
    es: 'El saldo cambia en una cantidad distinta del importe. Puede que el importe esté mal leído o que falte un movimiento justo antes.',
    ca: 'El saldo canvia en una quantitat diferent de l\'import. Potser l\'import està mal llegit o hi falta un moviment just abans.',
    en: 'The balance changes by a different amount than the transaction. The amount may be misread, or a transaction just before it may be missing.',
  },
  fila_saldo: {
    es: 'Este saldo no sigue a la fila anterior, pero la siguiente vuelve a cuadrar. Parece que solo este saldo está mal leído.',
    ca: 'Aquest saldo no segueix la fila anterior, però la següent torna a quadrar. Sembla que només aquest saldo està mal llegit.',
    en: 'This balance does not follow from the row before, but the next row adds up again. It looks like only this balance is misread.',
  },
  fila_inicial: {
    es: 'Esta fila no cuadra con el saldo inicial que indica el extracto.',
    ca: 'Aquesta fila no quadra amb el saldo inicial que indica l\'extracte.',
    en: 'This row does not match the opening balance shown on the statement.',
  },

  // Fechas y periodo
  periodo_corto: {
    es: 'Tu extracto cubre menos de 3 meses. Con tan pocos meses no damos ningún cobro por seguro y todos salen como posibles. Si puedes, sube los movimientos de un año entero.',
    ca: 'El teu extracte cobreix menys de 3 mesos. Amb tan pocs mesos no donem cap cobrament per segur i tots surten com a possibles. Si pots, puja els moviments d\'un any sencer.',
    en: 'Your statement covers less than 3 months. With so few months we do not mark any payment as certain, so they all show as possible. If you can, upload a whole year of transactions.',
  },
  hueco: {
    es: 'Del {desde_fecha} al {hasta_fecha} no hay ningún movimiento. Si tienes un extracto de esas fechas, súbelo también para que no se escape ningún cobro.',
    ca: 'Del {desde_fecha} al {hasta_fecha} no hi ha cap moviment. Si tens un extracte d\'aquestes dates, puja\'l també perquè no se n\'escapi cap cobrament.',
    en: 'There are no transactions from {desde_fecha} to {hasta_fecha}. If you have a statement for those dates, upload it too so no payment is missed.',
  },
  fecha_futura: {
    es: 'Hay {n} movimientos con una fecha posterior a hoy. Revisa que las fechas estén bien leídas. Para calcular el periodo no los tenemos en cuenta.',
    ca: 'Hi ha {n} moviments amb una data posterior a avui. Revisa que les dates estiguin ben llegides. Per calcular el període no els tenim en compte.',
    en: 'There are {n} transactions dated after today. Check that the dates were read correctly. We leave them out when we work out the period.',
  },
  fecha_futura_una: {
    es: 'Hay un movimiento con una fecha posterior a hoy. Revisa que la fecha esté bien leída. Para calcular el periodo no lo tenemos en cuenta.',
    ca: 'Hi ha un moviment amb una data posterior a avui. Revisa que la data estigui ben llegida. Per calcular el període no el tenim en compte.',
    en: 'There is one transaction dated after today. Check that the date was read correctly. We leave it out when we work out the period.',
  },
  fecha_antigua: {
    es: 'Hay {n} movimientos con una fecha anterior al año 2000. Revisa que las fechas estén bien leídas. Para calcular el periodo no los tenemos en cuenta.',
    ca: 'Hi ha {n} moviments amb una data anterior a l\'any 2000. Revisa que les dates estiguin ben llegides. Per calcular el període no els tenim en compte.',
    en: 'There are {n} transactions dated before the year 2000. Check that the dates were read correctly. We leave them out when we work out the period.',
  },
  fecha_antigua_una: {
    es: 'Hay un movimiento con una fecha anterior al año 2000. Revisa que la fecha esté bien leída. Para calcular el periodo no lo tenemos en cuenta.',
    ca: 'Hi ha un moviment amb una data anterior a l\'any 2000. Revisa que la data estigui ben llegida. Per calcular el període no el tenim en compte.',
    en: 'There is one transaction dated before the year 2000. Check that the date was read correctly. We leave it out when we work out the period.',
  },
  fecha_no_valida: {
    es: 'Hay {n} movimientos sin una fecha que podamos leer. Para calcular el periodo no los tenemos en cuenta.',
    ca: 'Hi ha {n} moviments sense una data que puguem llegir. Per calcular el període no els tenim en compte.',
    en: 'There are {n} transactions without a date we can read. We leave them out when we work out the period.',
  },
  fecha_no_valida_una: {
    es: 'Hay un movimiento sin una fecha que podamos leer. Para calcular el periodo no lo tenemos en cuenta.',
    ca: 'Hi ha un moviment sense una data que puguem llegir. Per calcular el període no el tenim en compte.',
    en: 'There is one transaction without a date we can read. We leave it out when we work out the period.',
  },

  // Varios archivos y otras monedas
  duplicados: {
    es: 'Hemos quitado {n} movimientos que estaban repetidos en más de un archivo.',
    ca: 'Hem tret {n} moviments que estaven repetits en més d\'un fitxer.',
    en: 'We removed {n} transactions that appeared in more than one file.',
  },
  duplicados_uno: {
    es: 'Hemos quitado un movimiento que estaba repetido en más de un archivo.',
    ca: 'Hem tret un moviment que estava repetit en més d\'un fitxer.',
    en: 'We removed one transaction that appeared in more than one file.',
  },
  otra_moneda: {
    es: 'Hay {n} movimientos en {divisa}. Te los enseñamos aparte y no entran en el total, que solo cuenta euros.',
    ca: 'Hi ha {n} moviments en {divisa}. Te\'ls ensenyem a part i no entren al total, que només compta euros.',
    en: 'There are {n} transactions in {divisa}. We show them separately and leave them out of the total, which only counts euros.',
  },
  otra_moneda_uno: {
    es: 'Hay un movimiento en {divisa}. Te lo enseñamos aparte y no entra en el total, que solo cuenta euros.',
    ca: 'Hi ha un moviment en {divisa}. Te l\'ensenyem a part i no entra al total, que només compta euros.',
    en: 'There is one transaction in {divisa}. We show it separately and leave it out of the total, which only counts euros.',
  },
};
