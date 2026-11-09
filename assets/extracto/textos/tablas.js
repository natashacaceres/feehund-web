// Mensajes de la lectura de hojas de cálculo y CSV. Frases cortas y llanas, de tú, sin jerga.
// Las {llaves} se rellenan con los datos del aviso.
export default {
  protegido: {
    es: 'El archivo {archivo} está protegido con contraseña. Ábrelo en Excel, Numbers o LibreOffice, guárdalo sin contraseña y vuelve a subirlo.',
    ca: 'El fitxer {archivo} està protegit amb contrasenya. Obre\'l a l\'Excel, al Numbers o al LibreOffice, desa\'l sense contrasenya i torna\'l a pujar.',
    en: 'The file {archivo} is password protected. Open it in Excel, Numbers or LibreOffice, save it without a password and upload it again.',
  },
  pedir_columnas: {
    es: 'No sabemos qué columna es cada cosa en {archivo}. Toca la columna de la fecha, la del concepto y la del importe.',
    ca: 'No sabem quina columna és cada cosa a {archivo}. Toca la columna de la data, la del concepte i la de l\'import.',
    en: 'We cannot tell which column is which in {archivo}. Tap the date column, the description column and the amount column.',
  },
  mapeo_sin_movimientos: {
    es: 'Con las columnas que has elegido no sale ningún movimiento. Revisa que la fecha y el importe estén en su sitio.',
    ca: 'Amb les columnes que has triat no surt cap moviment. Revisa que la data i l\'import siguin al seu lloc.',
    en: 'The columns you chose give no transactions. Check that the date and the amount are in the right place.',
  },
  filas_saltadas: {
    es: 'En {archivo} hay filas que no parecen movimientos, como títulos, totales o notas. No las hemos contado.',
    ca: 'A {archivo} hi ha files que no semblen moviments, com ara títols, totals o notes. No les hem comptat.',
    en: 'In {archivo} some rows do not look like transactions, such as titles, totals or notes. We did not count them.',
  },
  filas_irregulares: {
    es: 'En {archivo} hay filas con más columnas que las demás. Puede que algún importe lleve una coma sin comillas. No las hemos contado para no equivocarnos.',
    ca: 'A {archivo} hi ha files amb més columnes que les altres. Pot ser que algun import porti una coma sense cometes. No les hem comptat per no equivocar-nos.',
    en: 'In {archivo} some rows have more columns than the rest. An amount may have a comma without quotes. We did not count them to avoid mistakes.',
  },
  csv_comillas: {
    es: 'En {archivo} hay comillas sin cerrar. Lo hemos leído igualmente, pero revisa los conceptos por si alguno ha quedado cortado.',
    ca: 'A {archivo} hi ha cometes sense tancar. L\'hem llegit igualment, però revisa els conceptes per si algun ha quedat tallat.',
    en: '{archivo} has quotes that are not closed. We read it anyway, but check the descriptions in case one got cut.',
  },
  demasiadas_filas: {
    es: '{archivo} tiene más de {max} filas. Hemos leído las {max} primeras.',
    ca: '{archivo} té més de {max} files. N\'hem llegit les {max} primeres.',
    en: '{archivo} has more than {max} rows. We read the first {max}.',
  },
  fecha_dia_mes_supuesto: {
    es: 'En {archivo} las fechas se pueden leer como día y mes o como mes y día. Las hemos leído como día y mes, que es lo habitual en España.',
    ca: 'A {archivo} les dates es poden llegir com a dia i mes o com a mes i dia. Les hem llegit com a dia i mes, que és el més habitual aquí.',
    en: 'In {archivo} the dates could be day then month or month then day. We read them as day then month, as is usual in Spain.',
  },
  anio_supuesto: {
    es: 'Las fechas de {archivo} no traen el año. Lo hemos sacado del resto del extracto o de la fecha de hoy. Revisa que el periodo sea el correcto.',
    ca: 'Les dates de {archivo} no porten l\'any. L\'hem tret de la resta de l\'extracte o de la data d\'avui. Revisa que el període sigui el correcte.',
    en: 'The dates in {archivo} have no year. We took it from the rest of the statement or from today\'s date. Check that the period is right.',
  },
  importes_sin_signo: {
    es: 'En {archivo} todos los importes son positivos. Si tu banco no pone signo a los cargos, los gastos pueden salir como ingresos. Prueba a descargar el extracto en otro formato.',
    ca: 'A {archivo} tots els imports són positius. Si el teu banc no posa signe als càrrecs, les despeses poden sortir com a ingressos. Prova de descarregar l\'extracte en un altre format.',
    en: 'In {archivo} all amounts are positive. If your bank does not sign its charges, spending may show up as income. Try downloading the statement in another format.',
  },
  casi_todo_positivo: {
    es: 'Casi todos los importes de {archivo} son positivos. Si es el extracto de una tarjeta, puede que las compras vengan sin signo y salgan como ingresos. Revisa los movimientos.',
    ca: 'Gairebé tots els imports de {archivo} són positius. Si és l\'extracte d\'una targeta, pot ser que les compres vinguin sense signe i surtin com a ingressos. Revisa els moviments.',
    en: 'Almost all amounts in {archivo} are positive. If this is a card statement, purchases may come without a sign and show up as income. Check the transactions.',
  },
  revolut_pendientes: {
    es: 'Hay movimientos de Revolut que aún no estaban completados, como pendientes, devueltos o rechazados. No los hemos contado.',
    ca: 'Hi ha moviments de Revolut que encara no estaven completats, com ara pendents, retornats o rebutjats. No els hem comptat.',
    en: 'Some Revolut transactions were not completed yet, such as pending, reverted or declined ones. We did not count them.',
  },
  ing_250: {
    es: 'Tu archivo de ING tiene justo 250 movimientos. Puede que ING no dé más en cada descarga y que falten los más antiguos. Si quieres más meses, descarga periodos más cortos y súbelos juntos.',
    ca: 'El teu fitxer d\'ING té just 250 moviments. Pot ser que ING no en doni més a cada descàrrega i que en faltin els més antics. Si vols més mesos, descarrega períodes més curts i puja\'ls junts.',
    en: 'Your ING file has exactly 250 transactions. ING may not give more per download, so the oldest ones may be missing. For more months, download shorter periods and upload them together.',
  },
  estados_sin_completar: {
    es: 'En {archivo} hay movimientos que no se llegaron a completar, como pendientes, rechazados o anulados. No los hemos contado.',
    ca: 'A {archivo} hi ha moviments que no es van arribar a completar, com ara pendents, rebutjats o anul·lats. No els hem comptat.',
    en: '{archivo} has transactions that were never completed, such as pending, declined or cancelled ones. We did not count them.',
  },
  decimales_unidos: {
    es: 'En {archivo} la coma separa las columnas y también los céntimos. Hemos vuelto a unir los importes partidos. Revisa que estén bien.',
    ca: 'A {archivo} la coma separa les columnes i també els cèntims. Hem tornat a ajuntar els imports partits. Revisa que estiguin bé.',
    en: 'In {archivo} the comma separates the columns and also the cents. We joined the split amounts back together. Check that they look right.',
  },
  miles_unidos: {
    es: 'En {archivo} algunos importes llevaban la coma de los miles sin comillas y se partían en dos columnas. Los hemos vuelto a unir porque así cuadran con el saldo.',
    ca: 'A {archivo} alguns imports portaven la coma dels milers sense cometes i es partien en dues columnes. Els hem tornat a ajuntar perquè així quadren amb el saldo.',
    en: 'In {archivo} some amounts had a thousands comma without quotes and were split into two columns. We joined them back because that way they match the balance.',
  },
  columnas_desplazadas: {
    es: 'En {archivo} los títulos no estaban justo encima de sus columnas. Los hemos movido para que cuadren. Revisa las fechas y los importes.',
    ca: 'A {archivo} els títols no eren just a sobre de les seves columnes. Els hem mogut perquè quadrin. Revisa les dates i els imports.',
    en: 'In {archivo} the column titles were not right above their columns. We moved them so they match. Check the dates and the amounts.',
  },
  hoja_sin_leer: {
    es: 'No hemos podido leer la hoja {hoja} de {archivo}. Si tiene movimientos, guárdala como un archivo aparte y súbela.',
    ca: 'No hem pogut llegir el full {hoja} de {archivo}. Si té moviments, desa\'l com un fitxer a part i puja\'l.',
    en: 'We could not read the sheet {hoja} in {archivo}. If it has transactions, save it as a separate file and upload it.',
  },
  hojas_ocultas: {
    es: '{archivo} tiene hojas ocultas. No las hemos leído.',
    ca: '{archivo} té fulls amagats. No els hem llegit.',
    en: '{archivo} has hidden sheets. We did not read them.',
  },
  nota_comision_separada: {
    es: 'Comisión cobrada junto a este movimiento.',
    ca: 'Comissió cobrada amb aquest moviment.',
    en: 'Fee charged with this transaction.',
  },
  nota_cambio_divisa: {
    es: 'Cambio de moneda.',
    ca: 'Canvi de moneda.',
    en: 'Currency exchange.',
  },
};
