# «Te damos de baja» · lista para el abogado (antes de cobrar)

Los textos marcados **[REVISIÓN LEGAL]** están en la web como borrador. Nada se cobra hasta su visto bueno.

## Qué hace el servicio, en una frase
La persona rellena sus datos, firma con un código que le llega al correo y paga 3,99 € (2,99 € cada baja más). Su carta
de baja se envía en las 24 horas siguientes por correo electrónico certificado de Lleida.net a la dirección de bajas de la empresa.
**Fase 1 (al principio):** la envía a mano la titular desde su cuenta de Lleida.net con los datos que le llegan en un
correo urgente. **Fase 2:** sale sola desde hola@feehund.com con copia a Lleida.net y «responder a» la persona.
La persona ve y recibe exactamente lo mismo en las dos fases. Si no llega, se devuelve el dinero. Si la empresa
vuelve a cobrar, segunda carta gratis (una por compra). El registro de cada baja se guarda 6 años; lo demás se borra a los 90 días.

## 1. Mandato: enviar bajas en nombre de otra persona
- Texto de la casilla (paso 3): «Autorizo a Feehund a enviar esta carta en mi nombre a [empresa] por correo electrónico
  certificado, y confirmo que soy el titular del contrato.» ¿Basta como mandato (art. 1709 y ss. del Código Civil)?
- La firma es una **firma electrónica simple** (Reglamento eIDAS art. 3.10; Ley 6/2020): código de un solo uso enviado
  al correo + casilla, con hora, navegador, hash de la IP y huella (SHA-256) del texto firmado. Opcional: firma dibujada
  en el PDF. ¿Es suficiente prueba? ¿Conviene ofrecer certificado digital (AutoFirma)?
- **Suplantación**: solo comprobamos que la persona controla ese correo. ¿Qué responsabilidad tiene Feehund si alguien da
  de baja el contrato de otro? ¿Hace falta algo más (p. ej., que el correo sea el de la cuenta en la empresa)?
- Varias fichas dicen que la empresa **no aclara si acepta una baja enviada por un tercero** (Adamo, Ara, El Español,
  Llamaya, Hits Mobile…). Finetwork pide además confirmar por SMS; Sector Alarm tiene formulario propio. ¿Se pueden
  ofrecer igualmente, con el aviso que ya se muestra?

## 2. Desistimiento
- Casilla del paso 4: «Pido que la enviéis ya (o en la fecha programada) y entiendo que, una vez enviada, pierdo el
  derecho de desistimiento.» Base pensada: **art. 103 a) TRLGDCU** (servicio ejecutado por completo con consentimiento
  expreso previo). ¿Es la excepción correcta (y no la 103 m)?
- Bajas **programadas**: se pueden cancelar y se devuelve el dinero hasta el día de envío. Bajas del **lote sin usar**: se
  devuelven cuando la persona quiera y solas a los 180 días. ¿Correcto?
- Confirmación en soporte duradero (art. 98.7): los correos «programada» y «enviada» recuerdan la renuncia y enlazan las
  condiciones. Stripe también la muestra junto al botón de pago. ¿Suficiente?
- Información precontractual (art. 97): precio con IVA, características, garantías, identidad del vendedor. ¿Falta algo?

## 3. La carta (`assets/te-damos-de-baja/carta.js`, una hoja, es/ca/en según la empresa)
- Frase de telecos: «Conforme a la normativa de protección de los usuarios de telecomunicaciones, la baja debe hacerse
  efectiva en un plazo máximo de dos días hábiles…» ¿Citar norma concreta (RD 899/2009 art. 7, Ley 11/2022)?
- Seguros: «Conforme al artículo 22 de la Ley 50/1980, de Contrato de Seguro, comunico mi oposición a la prórroga…» con
  un mes de antelación.
- «Motivo de la baja: decisión personal.» (Orange, Amena, Jazztel y Simyo piden motivo.)
- Petición de no hacer más cargos, anular la domiciliación y confirmar por escrito.
- Frase sobre Feehund: «Envío esta carta a través de Feehund, que la remite en mi nombre y con mi autorización.»
  (Las respuestas: la carta pide que confirmen la baja por escrito al correo de la persona.)
- Firma: «Firmado electrónicamente el [fecha, hora] con un código de verificación enviado a [correo]. Referencia FH-…»
- Segunda carta (reclamación del cobro posterior), mismo formato.
- Remitente visible: «"Nombre Apellidos (vía Feehund)" <hola@feehund.com>». ¿Problema?

## 4. Condiciones del servicio
Sección nueva «Te damos de baja» en /condiciones/ (y ca/en): qué es, precio, autorización, cuándo se envía,
desistimiento, garantías (reembolso si no se entrega; segunda carta), alcance (no garantizamos que la empresa tramite la
baja ni evitamos penalizaciones). Revisar: limitación de responsabilidad, identidad del vendedor (autónoma), ley y
fuero, resolución de litigios en línea.

## 5. Protección de datos (RGPD)
- Datos nuevos: nombre, correo, dato del contrato, DNI/NIE, firma dibujada, carta, prueba de la firma. Sección nueva en
  /privacidad/ (y ca/en). ¿Base jurídica «ejecución del contrato»?
- **Foto del DNI/NIE**: solo se pide (obligatoria) en las 10 empresas cuyas condiciones la exigen para tramitar la baja
  (O2, Tuenti, Orange, Amena, Jazztel, Simyo, R, Sector Alarm, Ocaso, Reale); va adjunta a la carta y al correo urgente.
  Se guarda cifrada **solo hasta que se confirma la entrega** y se borra; el archivo de 6 años guarda únicamente «se
  aportó copia» y su SHA-256. Las copias de seguridad semanales la conservan como mucho 12 semanas. ¿Minimización
  suficiente? ¿Hay que avisar de algo más al pedirla? En las otras 7 que la mencionan, solo el número.
- Encargados: **Brevo** (correo, UE), **Lleida.net** (¿encargado o tercero de confianza responsable del
  certificado?), **Stripe**, **Cloudflare** (KV y copias de seguridad en R2, datos cifrados con AES-GCM).
- **Proveedores sin nombre:** por decisión de la titular, ni las páginas, ni la carta, ni los correos, ni las
  condiciones nombran a los proveedores; dicen «correo electrónico certificado». En privacidad figuran por
  **categoría**: «un prestador cualificado de servicios de confianza que certifica el envío», «un servicio de envío de
  correo electrónico», «el procesador de pagos», «el alojamiento web y las copias de seguridad». ¿Basta con la
  categoría de destinatarios (art. 13.1 e RGPD) o hay que nombrarlos? (El justificante que se adjunta lo emite y firma
  el prestador y lleva su nombre.) Contratos de encargo (DPA) y transferencias
  fuera del EEE (cláusulas tipo / Data Privacy Framework).
- **Lectura con IA de Mi banco**: si el móvil no puede leer el extracto, se envía a **Anthropic (fuera de la UE)** y no se
  guarda. Ya está en /privacidad/ con «⚖ abogado». En «Te damos de baja» el extracto **no viaja** (la comprobación de un
  cobro posterior se hace en el dispositivo).
- **Plazos (decididos, a confirmar):** el registro de cada baja (nombre, DNI/NIE, empresa, fechas, carta, justificante,
  pago y prueba de la autorización) se guarda **6 años**, como prueba ante reclamaciones y por la contabilidad. ¿Son
  correctos los 6 años (art. 30 del Código de Comercio; plazos de reclamación) y la base jurídica (art. 17.3 b y e RGPD
  frente a una petición de supresión)? Lo demás se borra a los **90 días** del envío; hasta entonces se puede pedir la
  segunda carta gratis. Copias de seguridad cifradas semanales, 12 semanas.
- Registro de actividades de tratamiento; ¿hace falta evaluación de impacto?

## 6. Fase 1: envío a mano
- Los datos de la persona y la carta llegan al **buzón de correo de la titular** (correo urgente) y se envían desde **su
  cuenta personal de Lleida.net**. ¿Cómo se cuenta en privacidad (texto nuevo: «el equipo de Feehund recibe tu carta y
  tus datos por correo… y los borra de ese correo cuando está enviada»)? ¿Hace falta algo más con su proveedor de correo?
- El correo urgente lleva la foto del DNI adjunta (solo en esas 10 empresas): queda en el buzón de la titular hasta que
  lo borre. ¿Basta con la instrucción de borrarlo tras el envío?
- La web promete «la enviamos **en 24 horas**» (o «el <fecha>» si está programada). ¿Algún riesgo si un día no se puede
  (enfermedad, vacaciones)?
- La titular **no es autónoma ni empresa** (solo NIF): ¿puede cobrar este servicio así? (también con el gestor)

## 7. Fiscal y otros
- Factura: Stripe no la emite; Verifactu; IVA 21 % incluido; epígrafe del IAE para este servicio.
- ¿Algún registro o autorización para gestionar trámites en nombre de consumidores?
- Seguro de responsabilidad civil profesional, por si una carta se envía mal.
