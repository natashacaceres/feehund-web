// Textos de la parte del navegador: progreso, fotos, HEIC, contraseñas, columnas e imagen para compartir.
// Frases cortas y llanas, en tú. Las {llaves} se rellenan con los datos del aviso o del error.
// Donde el número puede ser 1 hay dos códigos (plural y singular) para que la frase concuerde.
export default {
  // Progreso (lo que se lee mientras trabaja)
  progreso_leyendo: {
    es: 'Leyendo tu archivo',
    ca: 'Llegint el teu fitxer',
    en: 'Reading your file',
  },
  progreso_foto: {
    es: 'Leyendo la foto',
    ca: 'Llegint la foto',
    en: 'Reading the photo',
  },
  progreso_pagina: {
    es: 'Leyendo la página {pagina} de {total}',
    ca: 'Llegint la pàgina {pagina} de {total}',
    en: 'Reading page {pagina} of {total}',
  },
  progreso_preparando_fotos: {
    es: 'Preparando el lector de fotos',
    ca: 'Preparant el lector de fotos',
    en: 'Getting the photo reader ready',
  },
  progreso_saldo: {
    es: 'Comprobando el saldo',
    ca: 'Comprovant el saldo',
    en: 'Checking the balance',
  },
  progreso_cobros: {
    es: 'Buscando cobros que se repiten',
    ca: 'Buscant cobraments que es repeteixen',
    en: 'Looking for charges that repeat',
  },

  // Fotos y capturas
  ocr_no_disponible: {
    es: 'No hemos podido leer la foto {archivo} en este dispositivo. Prueba otra vez o sube el extracto en PDF, Excel o CSV.',
    ca: 'No hem pogut llegir la foto {archivo} en aquest dispositiu. Torna-ho a provar o puja l\'extracte en PDF, Excel o CSV.',
    en: 'We could not read the photo {archivo} on this device. Try again or upload the statement as PDF, Excel or CSV.',
  },
  heic_no_compatible: {
    es: 'Este navegador no abre fotos del iPhone como {archivo}. Haz una captura de pantalla de la foto y súbela, o ábrela en Safari. En el iPhone puedes elegir Ajustes, Cámara, Formatos, Más compatible.',
    ca: 'Aquest navegador no obre fotos de l\'iPhone com {archivo}. Fes una captura de pantalla de la foto i puja-la, o obre-la a Safari. A l\'iPhone pots triar Configuració, Càmera, Formats, Més compatible.',
    en: 'This browser cannot open iPhone photos like {archivo}. Take a screenshot of the photo and upload it, or open it in Safari. On iPhone you can choose Settings, Camera, Formats, Most Compatible.',
  },
  heic_ilegible: {
    es: 'No conseguimos abrir la foto {archivo}. Haz una captura de pantalla de la foto y sube la captura.',
    ca: 'No aconseguim obrir la foto {archivo}. Fes una captura de pantalla de la foto i puja la captura.',
    en: 'We could not open the photo {archivo}. Take a screenshot of it and upload the screenshot instead.',
  },
  foto_sin_movimientos: {
    es: 'Hemos leído {archivo}, pero no vemos movimientos. Comprueba que se vean bien la fecha, el concepto y el importe.',
    ca: 'Hem llegit {archivo}, però no hi veiem moviments. Comprova que es vegin bé la data, el concepte i l\'import.',
    en: 'We read {archivo} but could not find any transactions. Check that the date, description and amount are easy to see.',
  },
  revisa_tabla: {
    es: 'Hemos leído {archivo} a partir de una foto. Repasa la tabla y corrige lo que no esté bien antes de ver el resultado.',
    ca: 'Hem llegit {archivo} a partir d\'una foto. Repassa la taula i corregeix el que no estigui bé abans de veure el resultat.',
    en: 'We read {archivo} from a photo. Look over the table and fix anything that is wrong before you see the result.',
  },
  revisa_dudosos: {
    es: 'Hay {n} filas que no se leen bien. Te las marcamos para que las revises.',
    ca: 'Hi ha {n} files que no es llegeixen bé. Te les marquem perquè les revisis.',
    en: '{n} rows are hard to read. We have marked them so you can check them.',
  },
  revisa_dudoso: {
    es: 'Hay una fila que no se lee bien. Te la marcamos para que la revises.',
    ca: 'Hi ha una fila que no es llegeix bé. Te la marquem perquè la revisis.',
    en: 'One row is hard to read. We have marked it so you can check it.',
  },

  // Lo que la interfaz tiene que pedir
  pide_contrasena: {
    es: '{archivo} tiene contraseña. Escríbela para abrirlo. Solo se usa en tu dispositivo.',
    ca: '{archivo} té contrasenya. Escriu-la per obrir-lo. Només es fa servir al teu dispositiu.',
    en: '{archivo} has a password. Type it in to open the file. It is only used on your device.',
  },
  contrasena_mal: {
    es: 'La contraseña de {archivo} no es correcta. Prueba otra vez.',
    ca: 'La contrasenya de {archivo} no és correcta. Torna-ho a provar.',
    en: 'The password for {archivo} is not right. Please try again.',
  },
  pide_columnas: {
    es: 'No sabemos qué hay en cada columna de {archivo}. Toca la columna de la fecha, la del concepto y la del importe.',
    ca: 'No sabem què hi ha a cada columna de {archivo}. Toca la columna de la data, la del concepte i la de l\'import.',
    en: 'We cannot tell what each column in {archivo} holds. Tap the date column, the description column and the amount column.',
  },
  columnas_despues: {
    es: 'Después te pediremos también las columnas de {archivo}.',
    ca: 'Després també et demanarem les columnes de {archivo}.',
    en: 'After that we will also ask you about the columns in {archivo}.',
  },
  correccion_no_valida: {
    es: 'No hemos entendido el cambio de la fila {fila} de {archivo}, así que la hemos dejado como estaba.',
    ca: 'No hem entès el canvi de la fila {fila} de {archivo}, així que l\'hem deixada com estava.',
    en: 'We did not understand the change in row {fila} of {archivo}, so we left that row as it was.',
  },
  demasiados_archivos: {
    es: 'Son demasiados archivos de una vez. Hemos leído los primeros y hemos dejado {n} sin leer. Analízalos en otra tanda.',
    ca: 'Són massa fitxers alhora. Hem llegit els primers i n\'hem deixat {n} sense llegir. Analitza\'ls en una altra tanda.',
    en: 'That is too many files at once. We read the first ones and left {n} unread. Analyse them in another batch.',
  },
  nombre_texto_pegado: {
    es: 'texto pegado',
    ca: 'text enganxat',
    en: 'pasted text',
  },

  // Fallos del propio análisis
  diccionario_no_disponible: {
    es: 'No hemos podido cargar la lista de comercios, así que todavía no te damos totales. Conéctate a internet un momento y vuelve a probar.',
    ca: 'No hem pogut carregar la llista de comerços, així que encara no et donem totals. Connecta\'t a internet un moment i torna-ho a provar.',
    en: 'We could not load the list of shops and services, so we cannot give you totals yet. Connect to the internet for a moment and try again.',
  },
  busqueda_fallida: {
    es: 'Hemos leído tus movimientos, pero algo ha fallado al buscar los cobros. Prueba otra vez.',
    ca: 'Hem llegit els teus moviments, però alguna cosa ha fallat en buscar els cobraments. Torna-ho a provar.',
    en: 'We read your transactions, but something went wrong while looking for charges. Please try again.',
  },
  motor_parado: {
    es: 'El análisis se ha parado, quizá porque el archivo es demasiado grande para este dispositivo. Prueba con un periodo más corto.',
    ca: 'L\'anàlisi s\'ha aturat, potser perquè el fitxer és massa gran per a aquest dispositiu. Prova amb un període més curt.',
    en: 'The analysis stopped, maybe because the file is too big for this device. Try a shorter period.',
  },
  nada_que_leer: {
    es: 'No hay nada que leer. Elige un archivo o pega los movimientos del extracto.',
    ca: 'No hi ha res a llegir. Tria un fitxer o enganxa els moviments de l\'extracte.',
    en: 'There is nothing to read. Choose a file or paste the transactions from your statement.',
  },
  cancelado: {
    es: 'Hemos parado el análisis y borrado lo que tenía en memoria.',
    ca: 'Hem aturat l\'anàlisi i hem esborrat el que tenia a la memòria.',
    en: 'We stopped the analysis and cleared what it had in memory.',
  },
  aviso_generico: {
    es: 'Hay algo en {archivo} que conviene revisar.',
    ca: 'Hi ha alguna cosa a {archivo} que convé revisar.',
    en: 'There is something in {archivo} worth checking.',
  },
  aviso_generico_sin_archivo: {
    es: 'Hay algo en tus movimientos que conviene revisar.',
    ca: 'Hi ha alguna cosa als teus moviments que convé revisar.',
    en: 'There is something in your transactions worth checking.',
  },
  sin_euros: {
    es: 'No hay movimientos en euros. El total solo cuenta euros, así que sale 0. Los de otras monedas los ves aparte.',
    ca: 'No hi ha moviments en euros. El total només compta euros, així que surt 0. Els d\'altres monedes els veus a part.',
    en: 'There are no transactions in euros. The total only counts euros, so it is 0. You can see the other currencies separately.',
  },
  // Lo que no se ha contado y no tiene frase propia en textos/deteccion.js
  otros_sin_contar: {
    es: 'Otros cargos que no contamos',
    ca: 'Altres càrrecs que no comptem',
    en: 'Other charges we do not count',
  },

  // Imagen para compartir: solo la cifra redondeada
  compartir_total: {
    es: '{cifra} €/año',
    ca: '{cifra} €/any',
    en: '€{cifra} a year',
  },
};
