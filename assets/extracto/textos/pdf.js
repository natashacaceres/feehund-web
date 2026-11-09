// Avisos de la lectura de PDF, fotos (reconstrucción de filas) y texto pegado. Frases cortas y llanas.
// La cifra va entre paréntesis para que la frase valga igual con 1 que con 20.
export default {
  filas_signo_desconocido: {
    es: 'No sabemos si algunos importes de {archivo} son cargos o abonos ({n} en total). Los hemos marcado para que los revises.',
    ca: 'No sabem si alguns imports de {archivo} són càrrecs o abonaments ({n} en total). Els hem marcat perquè els revisis.',
    en: 'We cannot tell if some amounts in {archivo} are charges or credits ({n} in total). We have marked them for you to check.',
  },
  filas_columnas_supuestas: {
    es: 'En {archivo} no vemos los títulos de las columnas. Hemos supuesto que la primera columna de importes son cargos y la segunda abonos. Revísalo.',
    ca: 'A {archivo} no veiem els títols de les columnes. Hem suposat que la primera columna d\'imports són càrrecs i la segona abonaments. Revisa-ho.',
    en: 'We cannot see the column titles in {archivo}. We have assumed the first amount column is money out and the second is money in. Please check it.',
  },
  filas_fecha_de_arriba: {
    es: 'Algunos movimientos de {archivo} no traen fecha propia ({n} en total). Les hemos puesto la fecha de la fila de arriba.',
    ca: 'Alguns moviments de {archivo} no porten data pròpia ({n} en total). Els hem posat la data de la fila de dalt.',
    en: 'Some transactions in {archivo} have no date of their own ({n} in total). We gave them the date of the row above.',
  },
  filas_sin_anio: {
    es: 'Las fechas de {archivo} no traen el año. Las hemos contado hacia atrás desde hoy.',
    ca: 'Les dates de {archivo} no porten l\'any. Les hem comptat cap enrere des d\'avui.',
    en: 'The dates in {archivo} have no year. We have counted back from today.',
  },
  filas_dudosos: {
    es: 'Algunos movimientos de {archivo} no se leen del todo bien ({n} en total). Revisa sus importes antes de seguir.',
    ca: 'Alguns moviments de {archivo} no es llegeixen del tot bé ({n} en total). Revisa\'n els imports abans de continuar.',
    en: 'Some transactions in {archivo} are not fully clear ({n} in total). Check their amounts before you go on.',
  },
  filas_importe_por_saldo: {
    es: 'En {archivo} hay importes que no se leen bien ({n} en total). Te proponemos el que sale de restar los saldos. Revísalos.',
    ca: 'A {archivo} hi ha imports que no es llegeixen bé ({n} en total). Et proposem el que surt de restar els saldos. Revisa\'ls.',
    en: 'Some amounts in {archivo} are hard to read ({n} in total). We suggest the one you get from the difference between the balances. Please check them.',
  },
  filas_fecha_relativa: {
    es: 'En {archivo} pone «Hoy» o «Ayer». Hemos contado esas fechas desde hoy. Si la captura es de otro día, corrígelas.',
    ca: 'A {archivo} hi posa «Avui» o «Ahir». Hem comptat aquestes dates des d\'avui. Si la captura és d\'un altre dia, corregeix-les.',
    en: '{archivo} says "Today" or "Yesterday". We counted those dates from today. If the screenshot is from another day, please correct them.',
  },
  filas_sin_leer: {
    es: 'Hay filas de {archivo} que parecen movimientos y no hemos sabido leer ({n} en total). Si te faltan cobros, prueba con el extracto en Excel o CSV.',
    ca: 'Hi ha files de {archivo} que semblen moviments i no les hem sabut llegir ({n} en total). Si et falten cobraments, prova amb l\'extracte en Excel o CSV.',
    en: 'Some rows in {archivo} look like transactions and we could not read them ({n} in total). If charges are missing, try the statement as Excel or CSV.',
  },
  necesita_ocr: {
    es: '{archivo} tiene páginas que son una imagen escaneada y ahora no podemos leerlas. Prueba con el PDF que descargas de tu banco o con un Excel.',
    ca: '{archivo} té pàgines que són una imatge escanejada i ara no les podem llegir. Prova amb el PDF que descarregues del teu banc o amb un Excel.',
    en: '{archivo} has pages that are a scanned image and we cannot read them right now. Try the PDF you download from your bank, or an Excel file.',
  },
  pdf_paginas_ocr: {
    es: 'Hemos leído las páginas escaneadas de {archivo} a partir de la imagen. Revisa los importes antes de seguir.',
    ca: 'Hem llegit les pàgines escanejades de {archivo} a partir de la imatge. Revisa els imports abans de continuar.',
    en: 'We read the scanned pages of {archivo} from the image. Check the amounts before you go on.',
  },
  pdf_pagina_fallida: {
    es: 'No hemos podido leer la página {pagina} de {archivo}.',
    ca: 'No hem pogut llegir la pàgina {pagina} de {archivo}.',
    en: 'We could not read page {pagina} of {archivo}.',
  },
  pdf_ocr_fallido: {
    es: 'No hemos podido leer la imagen de la página {pagina} de {archivo}.',
    ca: 'No hem pogut llegir la imatge de la pàgina {pagina} de {archivo}.',
    en: 'We could not read the image on page {pagina} of {archivo}.',
  },
  contrasena_requerida: {
    es: '{archivo} tiene contraseña. Escríbela para abrirlo. La contraseña no sale de tu dispositivo.',
    ca: '{archivo} té contrasenya. Escriu-la per obrir-lo. La contrasenya no surt del teu dispositiu.',
    en: '{archivo} has a password. Type it to open the file. The password never leaves your device.',
  },
  contrasena_incorrecta: {
    es: 'La contraseña de {archivo} no es correcta. Prueba otra vez.',
    ca: 'La contrasenya de {archivo} no és correcta. Torna-ho a provar.',
    en: 'The password for {archivo} is not right. Please try again.',
  },
};
