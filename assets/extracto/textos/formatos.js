// Textos de los lectores de formatos bancarios (Norma 43, OFX, QIF, camt.053, MT940) y del ZIP.
// Frases cortas y llanas, en tú. Las {llaves} se rellenan con los datos del aviso.
// Donde el número puede ser 1 hay dos códigos: el plural y el singular (_una o _uno) para que la frase concuerde.
export default {
  // Líneas o movimientos que no se han podido leer
  formato_lineas_saltadas: {
    es: 'En {archivo} hay {n} líneas que no entendemos y no las hemos tenido en cuenta. Son las líneas {lineas}.',
    ca: 'A {archivo} hi ha {n} línies que no entenem i no les hem tingut en compte. Són les línies {lineas}.',
    en: 'In {archivo} there are {n} lines we do not understand, so we left them out. They are lines {lineas}.',
  },
  formato_lineas_saltadas_una: {
    es: 'En {archivo} hay una línea que no entendemos y no la hemos tenido en cuenta. Es la línea {lineas}.',
    ca: 'A {archivo} hi ha una línia que no entenem i no l\'hem tinguda en compte. És la línia {lineas}.',
    en: 'In {archivo} there is one line we do not understand, so we left it out. It is line {lineas}.',
  },
  formato_movimientos_saltados: {
    es: 'En {archivo} hay {n} movimientos sin fecha o sin importe que se puedan leer. No los hemos tenido en cuenta.',
    ca: 'A {archivo} hi ha {n} moviments sense una data o un import que es puguin llegir. No els hem tingut en compte.',
    en: 'In {archivo} there are {n} transactions without a readable date or amount. We left them out.',
  },
  formato_movimientos_saltados_uno: {
    es: 'En {archivo} hay un movimiento sin fecha o sin importe que se pueda leer. No lo hemos tenido en cuenta.',
    ca: 'A {archivo} hi ha un moviment sense una data o un import que es puguin llegir. No l\'hem tingut en compte.',
    en: 'In {archivo} there is one transaction without a readable date or amount. We left it out.',
  },

  // Resumen y saldos que trae el propio archivo
  formato_totales_no_coinciden: {
    es: 'El resumen de {archivo} habla de {declarados} movimientos y nosotros hemos leído {leidos}. Puede que el archivo esté incompleto. Vuelve a descargarlo desde tu banco.',
    ca: 'El resum de {archivo} parla de {declarados} moviments i nosaltres n\'hem llegit {leidos}. Potser el fitxer està incomplet. Torna a descarregar-lo des del teu banc.',
    en: 'The summary in {archivo} mentions {declarados} transactions and we read {leidos}. The file may be incomplete. Download it again from your bank.',
  },
  formato_importes_no_coinciden: {
    es: 'Los totales que da el resumen de {archivo} no coinciden con la suma de los movimientos. Puede que el archivo esté dañado. Vuelve a descargarlo desde tu banco.',
    ca: 'Els totals que dona el resum de {archivo} no coincideixen amb la suma dels moviments. Potser el fitxer està malmès. Torna a descarregar-lo des del teu banc.',
    en: 'The totals in the summary of {archivo} do not match the sum of the transactions. The file may be damaged. Download it again from your bank.',
  },
  formato_no_cuadra: {
    es: 'En {archivo} el saldo inicial más los movimientos no da el saldo final que indica el banco. La diferencia es de {diferencia}.',
    ca: 'A {archivo} el saldo inicial més els moviments no dona el saldo final que indica el banc. La diferència és de {diferencia}.',
    en: 'In {archivo} the opening balance plus the transactions does not give the closing balance shown by the bank. The difference is {diferencia}.',
  },
  formato_extracto_no_cuadra: {
    es: 'En {archivo}, el extracto {extracto} no cuadra. Su saldo inicial más sus movimientos no da su saldo final. La diferencia es de {diferencia}.',
    ca: 'A {archivo}, l\'extracte {extracto} no quadra. El seu saldo inicial més els seus moviments no dona el seu saldo final. La diferència és de {diferencia}.',
    en: 'In {archivo}, statement {extracto} does not add up. Its opening balance plus its transactions does not give its closing balance. The difference is {diferencia}.',
  },
  formato_saldo_no_continua: {
    es: 'En {archivo} el saldo del {fecha} no sigue al del extracto anterior. Puede que falten movimientos entre los dos.',
    ca: 'A {archivo} el saldo del {fecha} no segueix el de l\'extracte anterior. Potser hi falten moviments entre els dos.',
    en: 'In {archivo} the balance on {fecha} does not follow on from the previous statement. Some transactions may be missing in between.',
  },
  formato_sin_cierre: {
    es: 'Parece que {archivo} está cortado al final. Falta el resumen de la cuenta y no podemos comprobar el saldo.',
    ca: 'Sembla que {archivo} està tallat al final. Hi falta el resum del compte i no podem comprovar el saldo.',
    en: 'It looks like {archivo} is cut off at the end. The account summary is missing, so we cannot check the balance.',
  },
  formato_sin_cabecera: {
    es: 'En {archivo} falta el principio de la cuenta, con su saldo inicial. Hemos leído los movimientos, pero no podemos comprobar el saldo.',
    ca: 'A {archivo} hi falta el començament del compte, amb el saldo inicial. Hem llegit els moviments, però no podem comprovar el saldo.',
    en: 'In {archivo} the start of the account, with its opening balance, is missing. We read the transactions, but we cannot check the balance.',
  },

  // Datos que el archivo no dice y hemos tenido que suponer
  formato_divisa_supuesta: {
    es: 'El archivo {archivo} no dice en qué moneda está la cuenta. Hemos supuesto que es en euros.',
    ca: 'El fitxer {archivo} no diu en quina moneda està el compte. Hem suposat que és en euros.',
    en: 'The file {archivo} does not say which currency the account is in. We assumed euros.',
  },
  formato_fecha_valor_usada: {
    es: 'En {n} movimientos de {archivo} no se podía leer la fecha de la operación. Hemos usado la fecha valor, que suele ser la misma o muy cercana.',
    ca: 'En {n} moviments de {archivo} no es podia llegir la data de l\'operació. Hem fet servir la data valor, que sol ser la mateixa o molt propera.',
    en: 'In {n} transactions in {archivo} we could not read the transaction date. We used the value date, which is usually the same or very close.',
  },
  formato_fecha_valor_usada_uno: {
    es: 'En un movimiento de {archivo} no se podía leer la fecha de la operación. Hemos usado la fecha valor, que suele ser la misma o muy cercana.',
    ca: 'En un moviment de {archivo} no es podia llegir la data de l\'operació. Hem fet servir la data valor, que sol ser la mateixa o molt propera.',
    en: 'In one transaction in {archivo} we could not read the transaction date. We used the value date, which is usually the same or very close.',
  },
  formato_signo_por_tipo: {
    es: 'El archivo {archivo} trae todos los importes en positivo. Para saber si el dinero entra o sale hemos mirado el tipo de cada movimiento.',
    ca: 'El fitxer {archivo} porta tots els imports en positiu. Per saber si els diners entren o surten hem mirat el tipus de cada moviment.',
    en: 'The file {archivo} shows every amount as positive. To tell whether money came in or went out, we looked at the type of each transaction.',
  },
  formato_signo_invertido: {
    es: 'En {archivo} los cargos venían en positivo y los abonos en negativo. Les hemos dado la vuelta según el tipo de cada movimiento.',
    ca: 'A {archivo} els càrrecs venien en positiu i els abonaments en negatiu. Els hem capgirat segons el tipus de cada moviment.',
    en: 'In {archivo} charges came as positive and credits as negative. We flipped them using the type of each transaction.',
  },
  formato_signo_dudoso: {
    es: 'En {n} movimientos de {archivo} no sabemos si el dinero entra o sale. Los hemos marcado para que los revises.',
    ca: 'En {n} moviments de {archivo} no sabem si els diners entren o surten. Els hem marcat perquè els revisis.',
    en: 'In {n} transactions in {archivo} we cannot tell whether money came in or went out. We have marked them so you can check them.',
  },
  formato_signo_dudoso_uno: {
    es: 'En un movimiento de {archivo} no sabemos si el dinero entra o sale. Lo hemos marcado para que lo revises.',
    ca: 'En un moviment de {archivo} no sabem si els diners entren o surten. L\'hem marcat perquè el revisis.',
    en: 'In one transaction in {archivo} we cannot tell whether money came in or went out. We have marked it so you can check it.',
  },
  formato_orden_fechas_dudoso: {
    es: 'En {archivo} no se distingue si las fechas van como día y mes o como mes y día. Las hemos leído como día y mes. Revisa alguna fecha antes de fiarte del resultado.',
    ca: 'A {archivo} no es distingeix si les dates van com a dia i mes o com a mes i dia. Les hem llegit com a dia i mes. Revisa alguna data abans de refiar-te del resultat.',
    en: 'In {archivo} we cannot tell whether dates are written day then month or month then day. We read them as day then month. Check a few dates before you trust the result.',
  },

  // Movimientos que no entran a propósito
  formato_pendientes_ignorados: {
    es: 'En {archivo} hay {n} movimientos que el banco aún tenía pendientes. No los hemos tenido en cuenta.',
    ca: 'A {archivo} hi ha {n} moviments que el banc encara tenia pendents. No els hem tingut en compte.',
    en: 'In {archivo} there are {n} transactions the bank still had pending. We left them out.',
  },
  formato_pendientes_ignorados_uno: {
    es: 'En {archivo} hay un movimiento que el banco aún tenía pendiente. No lo hemos tenido en cuenta.',
    ca: 'A {archivo} hi ha un moviment que el banc encara tenia pendent. No l\'hem tingut en compte.',
    en: 'In {archivo} there is one transaction the bank still had pending. We left it out.',
  },
  formato_inversiones_ignoradas: {
    es: 'En {archivo} también hay movimientos de inversiones. Esos no los leemos, solo los de la cuenta y las tarjetas.',
    ca: 'A {archivo} també hi ha moviments d\'inversions. Aquests no els llegim, només els del compte i les targetes.',
    en: 'In {archivo} there are also investment transactions. We do not read those, only account and card ones.',
  },
  formato_sin_cuentas: {
    es: 'En {archivo} no hay movimientos de una cuenta ni de una tarjeta. Si es un extracto de inversiones, no lo leemos.',
    ca: 'A {archivo} no hi ha moviments d\'un compte ni d\'una targeta. Si és un extracte d\'inversions, no el llegim.',
    en: 'There are no account or card transactions in {archivo}. If it is an investment statement, we do not read it.',
  },

  // ZIP
  zip_demasiados_archivos: {
    es: 'El ZIP {archivo} tiene más de {max} archivos. Descomprímelo y añade solo los extractos.',
    ca: 'El ZIP {archivo} té més de {max} fitxers. Descomprimeix-lo i afegeix només els extractes.',
    en: 'The ZIP {archivo} has more than {max} files. Unzip it and add only the statements.',
  },
  zip_demasiado_grande: {
    es: 'El ZIP {archivo} ocupa demasiado una vez abierto. Descomprímelo y añade solo los extractos.',
    ca: 'El ZIP {archivo} ocupa massa un cop obert. Descomprimeix-lo i afegeix només els extractes.',
    en: 'The ZIP {archivo} is too big once opened. Unzip it and add only the statements.',
  },
  zip_con_contrasena: {
    es: 'El archivo {archivo} tiene contraseña dentro del ZIP. Descomprímelo en tu dispositivo y añade el archivo que hay dentro.',
    ca: 'El fitxer {archivo} té contrasenya dins del ZIP. Descomprimeix-lo al teu dispositiu i afegeix el fitxer que hi ha a dins.',
    en: 'The file {archivo} inside the ZIP has a password. Unzip it on your device and add the file inside.',
  },
  zip_no_compatible: {
    es: 'No podemos abrir {archivo} dentro del ZIP. Descomprímelo en tu dispositivo y añade el archivo directamente.',
    ca: 'No podem obrir {archivo} dins del ZIP. Descomprimeix-lo al teu dispositiu i afegeix el fitxer directament.',
    en: 'We cannot open {archivo} inside the ZIP. Unzip it on your device and add the file directly.',
  },
  zip_anidado: {
    es: 'El archivo {archivo} es un ZIP dentro de otro ZIP. Descomprímelo y añade los archivos que hay dentro.',
    ca: 'El fitxer {archivo} és un ZIP dins d\'un altre ZIP. Descomprimeix-lo i afegeix els fitxers que hi ha a dins.',
    en: 'The file {archivo} is a ZIP inside another ZIP. Unzip it and add the files inside.',
  },
};
