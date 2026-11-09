// Errores de archivo y avisos generales. Frases cortas y llanas, sin jerga.
export default {
  vacio: {
    es: 'El archivo {archivo} está vacío.',
    ca: 'El fitxer {archivo} és buit.',
    en: 'The file {archivo} is empty.',
  },
  grande: {
    es: 'El archivo {archivo} pesa más de 10 MB. Descarga un periodo más corto o divídelo en dos.',
    ca: 'El fitxer {archivo} pesa més de 10 MB. Descarrega un període més curt o divideix-lo en dos.',
    en: 'The file {archivo} is larger than 10 MB. Download a shorter period or split it in two.',
  },
  ilegible: {
    es: 'No conseguimos leer {archivo}. Si es una foto, prueba con otra más nítida, recta y con buena luz.',
    ca: 'No aconseguim llegir {archivo}. Si és una foto, prova amb una altra més nítida, recta i amb bona llum.',
    en: 'We could not read {archivo}. If it is a photo, try a sharper, straight one with good light.',
  },
  desconocido: {
    es: 'No reconocemos el formato de {archivo}. Prueba a descargar el extracto en Excel, CSV o PDF.',
    ca: 'No reconeixem el format de {archivo}. Prova de descarregar l\'extracte en Excel, CSV o PDF.',
    en: 'We do not recognise the format of {archivo}. Try downloading the statement as Excel, CSV or PDF.',
  },
  danado: {
    es: 'El archivo {archivo} parece dañado. Vuelve a descargarlo desde tu banco.',
    ca: 'El fitxer {archivo} sembla malmès. Torna a descarregar-lo des del teu banc.',
    en: 'The file {archivo} seems damaged. Download it again from your bank.',
  },
  demasiadas_imagenes: {
    es: 'Como mucho leemos 20 fotos o páginas escaneadas de una vez. Hemos leído las 20 primeras.',
    ca: 'Com a molt llegim 20 fotos o pàgines escanejades alhora. Hem llegit les 20 primeres.',
    en: 'We read at most 20 photos or scanned pages at a time. We have read the first 20.',
  },
  sin_movimientos: {
    es: 'No hemos encontrado movimientos en {archivo}.',
    ca: 'No hem trobat moviments a {archivo}.',
    en: 'We found no transactions in {archivo}.',
  },
  necesita_conexion: {
    es: 'Para leer este tipo de archivo sin conexión, abre la página una vez con internet y espera a que diga que está lista.',
    ca: 'Per llegir aquest tipus de fitxer sense connexió, obre la pàgina una vegada amb internet i espera que digui que està a punt.',
    en: 'To read this kind of file offline, open the page once with internet and wait until it says it is ready.',
  },
  navegador_antiguo: {
    es: 'Tu navegador no puede hacer esta lectura. Prueba con una versión actual de Chrome, Safari, Firefox o Edge.',
    ca: 'El teu navegador no pot fer aquesta lectura. Prova amb una versió actual de Chrome, Safari, Firefox o Edge.',
    en: 'Your browser cannot do this. Try a current version of Chrome, Safari, Firefox or Edge.',
  },
  desconocido_interno: {
    es: 'Algo ha fallado al leer el archivo. No se ha enviado nada a ningún sitio. Prueba otra vez.',
    ca: 'Alguna cosa ha fallat en llegir el fitxer. No s\'ha enviat res enlloc. Torna-ho a provar.',
    en: 'Something went wrong while reading the file. Nothing was sent anywhere. Please try again.',
  },
};
