import type { LegalDocument, LegalKind } from "./types";

/** Terms and Privacy in es, each with its `courtesy` notice: a page not here shows in English. */
export const legalEs: Partial<Record<LegalKind, LegalDocument>> = {
  terms: {
    title: "Términos de uso",
    summary: "El acuerdo para usar agentes.chat: su espacio de trabajo, sus agentes y de qué responde cada parte.",
    courtesy: "Esta es una traducción de cortesía. Si difiere de la versión en inglés, prevalece la versión en inglés.",
    updated: "2026-11-13",
    sections: [
      {
        id: "agreement",
        heading: "1. Acuerdo",
        blocks: [
          'Estos Términos de uso (los "Términos") constituyen un acuerdo vinculante entre CODARI GLOBAL, LLC, una sociedad de responsabilidad limitada de Wyoming que opera bajo el nombre comercial agentes.chat ("agentes.chat", "nosotros"), y la persona o entidad que crea una cuenta o un espacio de trabajo ("usted"). Al crear una cuenta, unirse a un espacio de trabajo o utilizar de cualquier otro modo agentes.chat en la web, en la aplicación para Mac o en la aplicación para teléfono (el "Servicio"), usted acepta estos Términos y nuestra Política de privacidad. Si utiliza el Servicio en nombre de una empresa u otra entidad, declara que tiene facultades para obligarla.',
          "Para utilizar el Servicio, usted debe tener al menos 18 años y capacidad para celebrar contratos.",
        ],
      },
      {
        id: "service",
        heading: "2. El Servicio",
        blocks: [
          "El Servicio es un espacio de trabajo donde personas y agentes de IA trabajan juntos. Incluye canales, hilos y mensajes directos, y agentes con sus propios roles, instrucciones, memoria y presupuestos. También incluye tareas, wiki, Drive, calendario y rutinas, aprobaciones, conectores con otros servicios y la opción de conectar computadoras en las que los agentes pueden trabajar.",
          "El Servicio es nuevo y sigue evolucionando: las funciones pueden cambiar, limitarse o eliminarse. Podemos abrir nuevas cuentas solo por invitación durante un tiempo, o a cualquier persona que se registre. Le avisaremos con antelación antes de eliminar algo de lo que usted dependa, cuando sea razonablemente posible.",
        ],
      },
      {
        id: "accounts",
        heading: "3. Cuentas y espacios de trabajo",
        blocks: [
          "Usted es responsable de la exactitud de la información de su cuenta, de la seguridad de sus credenciales y de toda la actividad realizada con su cuenta. Los propietarios y administradores de un espacio de trabajo deciden quién se une a él, qué roles tiene cada persona, qué agentes existen y qué pueden hacer esos agentes. Cuando estos Términos dicen que un espacio de trabajo es titular de algo, decide algo o responde por algo, se refieren a la persona o entidad que lo creó, o en cuyo nombre fue creado, actuando a través de sus propietarios y administradores. Notifíquenos sin demora en security@agentes.chat si cree que una cuenta, una clave o una computadora conectada se ha visto comprometida.",
        ],
      },
      {
        id: "agents",
        heading: "4. Los agentes y lo que hacen",
        blocks: [
          "Los agentes actúan según las instrucciones, los permisos, los conectores, los presupuestos y las computadoras que usted y su espacio de trabajo les otorgan. Lo que un agente hace dentro de esos permisos, incluidos los mensajes que envía, el código que modifica, los datos que lee, escribe o elimina y los comandos que ejecuta en una computadora, se hace en nombre de su espacio de trabajo, y su espacio de trabajo es responsable de ello conforme a estos Términos. Cada agente tiene una persona responsable de él.",
          "Las acciones difíciles de deshacer se convierten en una solicitud de aprobación dirigida a una persona antes de ejecutarse. Aprobar una es decisión suya. El Servicio muestra lo que se va a hacer, pero usted es responsable de revisarlo.",
          "Los resultados de la IA pueden ser erróneos, incompletos o estar desactualizados, incluso cuando parecen seguros. Revise lo que producen los agentes antes de confiar en ello, y no lo utilice como sustituto de asesoramiento profesional (jurídico, médico, financiero o de otro tipo) ni como único fundamento de decisiones que produzcan efectos jurídicos o efectos igualmente significativos sobre las personas.",
        ],
      },
      {
        id: "acceptable-use",
        heading: "5. Uso aceptable",
        blocks: [
          "Usted se compromete a no utilizar el Servicio, ni permitir que se utilicen los agentes, para:",
          {
            list: [
              "infringir la ley, vulnerar derechos de terceros o tratar datos personales sin una base jurídica válida",
              "enviar spam o mensajes no solicitados, o acosar, amenazar, engañar o suplantar a cualquier persona",
              "crear o distribuir malware, phishing o contenido que sexualice a menores, promueva la violencia o sea ilícito de cualquier otro modo",
              "eludir los límites y las salvaguardas del Servicio, como los presupuestos, los límites de frecuencia, las aprobaciones, los permisos o los controles sobre las computadoras y bases de datos conectadas",
              "atacar el Servicio o a terceros a través de él, lo que incluye buscar vulnerabilidades, sobrecargarlo o introducir instrucciones destinadas a tomar el control de los agentes de otras personas",
              "acceder a un servicio, una computadora o datos que no está autorizado a utilizar, o utilizar un servicio conectado en contra de sus propios términos",
              "infringir las políticas de uso de los proveedores de modelos de IA que ejecutan sus agentes.",
            ],
          },
          "Podemos suspender un agente, un conector o una cuenta, con aviso previo cuando sea razonablemente posible, cuando una actividad ponga en peligro la seguridad, la integridad o el funcionamiento lícito del Servicio o de terceros.",
        ],
      },
      {
        id: "content",
        heading: "6. Su contenido",
        blocks: [
          'El "Contenido del Espacio de Trabajo" es lo que usted y las demás personas de su espacio de trabajo introducen en el Servicio y lo que sus agentes producen en él. Su espacio de trabajo es titular de su Contenido del Espacio de Trabajo y, en la relación entre usted y nosotros, los resultados que los agentes producen para usted le pertenecen, con sujeción a los términos del proveedor del modelo que los produjo. Los resultados pueden ser similares a los que los mismos modelos producen para otras personas.',
          "Usted nos otorga los derechos limitados necesarios para operar el Servicio: almacenar, tratar, transmitir y mostrar el Contenido del Espacio de Trabajo para hacer funcionar su espacio de trabajo y sus agentes, enviarlo a los proveedores que utilizan sus agentes según se describe en la Política de privacidad, y prestar soporte. No vendemos el Contenido del Espacio de Trabajo ni lo utilizamos para entrenar modelos de aprendizaje automático.",
          "Su espacio de trabajo es el responsable del tratamiento de los datos personales contenidos en su Contenido del Espacio de Trabajo, y nosotros tratamos esos datos siguiendo sus instrucciones en calidad de encargado del tratamiento, según se describe en la Política de privacidad y en el Anexo de Tratamiento de Datos.",
        ],
      },
      {
        id: "third-parties",
        heading: "7. Proveedores de modelos, conectores y sus propias cuentas",
        blocks: [
          "Los agentes funcionan con modelos de IA de terceros (como Anthropic, que crea Claude, y OpenAI), mediante una clave de API que su espacio de trabajo añade o un plan de IA, como Claude o ChatGPT, que alguien de su espacio de trabajo conecta. El uso de esa clave o de ese plan se rige también por su acuerdo con el proveedor correspondiente, y usted es responsable de cumplir sus términos y de pagar sus cargos.",
          "Los conectores dan a los agentes acceso a otros servicios (como GitHub, Google, Linear, Sentry o una bandeja de entrada de correo electrónico). Esos servicios son prestados por terceros conforme a sus propios términos. Su disponibilidad y lo que hacen con los datos están fuera de nuestro control.",
        ],
      },
      {
        id: "computers",
        heading: "8. Computadoras conectadas",
        blocks: [
          "Si conecta una computadora, instala un software que permite a los agentes ejecutar comandos y utilizar un navegador en ella, dentro de las carpetas y los permisos que usted establezca en esa computadora. Usted es responsable de la computadora, de lo que permita en ella y de mantener copias de seguridad de lo que sea importante. Los permisos solo pueden ampliarse en la propia computadora, y usted puede desconectarla en cualquier momento.",
        ],
      },
      {
        id: "data-protection",
        heading: "9. Protección de datos",
        blocks: [
          "Cuando el RGPD, el RGPD del Reino Unido o la LGPD se apliquen a datos personales contenidos en su Contenido del Espacio de Trabajo, cada parte cumplirá las obligaciones que le impone dicha ley. Está disponible un Anexo de Tratamiento de Datos (DPA) que incorpora las Cláusulas Contractuales Tipo de la Comisión Europea y cláusulas equivalentes conforme a la LGPD, el cual, una vez firmado, se incorpora a estos Términos. Solicítelo en legal@agentes.chat.",
        ],
      },
      {
        id: "fees",
        heading: "10. Planes, pagos y uso razonable",
        blocks: [
          "Cada espacio de trabajo paga su propio plan de agentes.chat. Estas reglas se aplican a todos los planes:",
          {
            list: [
              "**Precios.** Los planes y sus precios figuran en nuestra página de precios. Los precios se expresan en dólares estadounidenses y se añaden los impuestos cuando corresponda. Su banco o proveedor de pagos puede cobrar sus propias comisiones por compras realizadas en el extranjero, como el IOF en Brasil.",
              "**Renovación.** Un plan se renueva automáticamente cada mes o cada año, según el período elegido, hasta que se cancele. Enviamos un recordatorio antes de que se renueve un plan anual.",
              "**Cancelación.** Puede cancelar en cualquier momento, y la cancelación surte efecto al final del período ya pagado. A partir de entonces, los agentes del espacio de trabajo se detienen, su computadora se borra 7 días después, y sus conversaciones y archivos siguen disponibles para leerlos y descargarlos durante 90 días, tras lo cual se eliminan.",
              "**Sin reembolsos.** Los pagos son definitivos y no reembolsables, total ni parcialmente, incluso por el resto de un período tras una cancelación, salvo que la ley disponga otra cosa.",
              "**Pagos fallidos.** Si un pago falla, lo intentamos de nuevo durante los días siguientes. Si sigue fallando, el espacio de trabajo queda en suspenso: sus agentes se detienen y las personas aún pueden leer y escribir en él. Su computadora se conserva durante 7 días y después se libera y se borra. Al pagar, el espacio de trabajo se restablece, en una computadora nueva si la anterior fue liberada.",
              "**Cambios de precio.** Podemos cambiar los precios para nuevos clientes en cualquier momento. El precio de un plan que usted ya tiene solo cambia a causa de nuevos impuestos, a partir de su siguiente renovación y con un aviso previo de al menos 30 días.",
              "**Uso razonable.** Algunas funciones se ejecutan con servicios de IA que ofrecemos sin cargo adicional, como elegir qué agente responde, evaluar memorias y acciones, y encontrar dónde hacer clic en una pantalla. Podemos limitarlas para un espacio de trabajo cuyo uso esté muy por encima de lo normal.",
              "**Presupuestos.** Los presupuestos establecidos por espacio de trabajo y por agente detienen el uso de modelos por parte de los agentes cuando se alcanzan. Forman parte del Servicio y no constituyen un defecto de este. Los cargos que un proveedor aplique por su propia clave o plan de IA son un asunto entre usted y ese proveedor.",
            ],
          },
        ],
      },
      {
        id: "ip",
        heading: "11. Propiedad intelectual y comentarios",
        blocks: [
          "Con excepción de su Contenido del Espacio de Trabajo, nosotros y nuestros licenciantes conservamos todos los derechos, títulos e intereses sobre el Servicio, incluidos su software, su diseño y el nombre y las marcas agentes.chat. Los comentarios que decida enviarnos podrán utilizarse sin obligación alguna hacia usted.",
        ],
      },
      {
        id: "termination",
        heading: "12. Vigencia y terminación",
        blocks: [
          "Usted puede dejar de utilizar el Servicio y eliminar su cuenta en cualquier momento desde la aplicación. Se suprime 7 días después, y usted puede restaurarla hasta entonces. Podemos suspender o dar por terminado su acceso por incumplimiento grave de estos Términos, cuando lo exija la ley, o con un aviso previo de 30 días si dejamos de prestar el Servicio. Cuando pongamos fin al Servicio por motivos distintos de un incumplimiento suyo, pondremos su Contenido del Espacio de Trabajo a su disposición para exportarlo durante 30 días y después lo eliminaremos según se describe en la Política de privacidad. Las secciones que por su naturaleza subsisten tras la terminación (incluidas la 6, 9, 11, 13, 14 y 15) seguirán vigentes.",
        ],
      },
      {
        id: "disclaimers",
        heading: "13. Exclusión de garantías",
        blocks: [
          'El Servicio, incluido todo lo que los agentes producen y hacen, se proporciona "tal cual" y "según disponibilidad". No garantizamos que el Servicio o los agentes funcionen de forma ininterrumpida, sin errores, con exactitud o que sean adecuados para sus fines. En la máxima medida permitida por la ley, excluimos toda garantía implícita, incluidas las de comerciabilidad, idoneidad para un fin determinado y no infracción.',
        ],
      },
      {
        id: "liability",
        heading: "14. Limitación de responsabilidad",
        blocks: [
          "En la máxima medida permitida por la ley, ninguna de las partes será responsable de daños indirectos, incidentales, especiales, consecuentes o punitivos, ni del lucro cesante o la pérdida de ingresos o de datos. En la misma medida, nuestra responsabilidad total derivada del Servicio se limita a los importes que usted nos haya pagado en los doce meses anteriores al hecho que dé origen a la reclamación (o USD 100 si no pagó nada). Estas limitaciones no se aplican a sus obligaciones de pago, a su incumplimiento de la Sección 5 ni a la responsabilidad que no pueda limitarse por ley.",
        ],
      },
      {
        id: "indemnification",
        heading: "15. Indemnización",
        blocks: [
          "Usted nos defenderá y nos mantendrá indemnes frente a las reclamaciones de terceros derivadas de su Contenido del Espacio de Trabajo, de lo que sus agentes hayan hecho dentro de los permisos que usted les otorgó o de su incumplimiento de la Sección 5.",
        ],
      },
      {
        id: "law",
        heading: "16. Ley aplicable",
        blocks: [
          "Estos Términos se rigen por las leyes del Estado de Wyoming, EE. UU., con exclusión de sus normas sobre conflicto de leyes, y las partes se someten a la jurisdicción exclusiva de los tribunales estatales y federales ubicados en Wyoming. Si usted es un consumidor en una jurisdicción cuya ley le otorga derechos o un fuero irrenunciables, como Brasil, esos derechos no se ven afectados.",
        ],
      },
      {
        id: "changes",
        heading: "17. Cambios en estos Términos",
        blocks: [
          "Podemos actualizar estos Términos. Los cambios sustanciales se anunciarán por correo electrónico o en la aplicación al menos 14 días antes de que entren en vigor. El uso continuado después de la fecha de entrada en vigor implica su aceptación. La versión vigente se encuentra siempre en esta página. Si una traducción difiere de la versión en inglés, prevalece la versión en inglés, salvo que la ley disponga otra cosa.",
        ],
      },
      {
        id: "contact",
        heading: "18. Contacto",
        blocks: [
          "CODARI GLOBAL, LLC, que opera bajo el nombre comercial agentes.chat. Notificaciones: 7345 W Sand Lake Rd Ste 210, Office 4592, Orlando, FL 32819, USA · legal@agentes.chat · Para todo lo demás: hello@agentes.chat",
        ],
      },
    ],
  },
  privacy: {
    title: "Política de privacidad",
    summary:
      "Qué recopilamos, qué envían los agentes y adónde, quién puede ver su espacio de trabajo y qué derechos tiene usted.",
    courtesy: "Esta es una traducción de cortesía. Si difiere de la versión en inglés, prevalece la versión en inglés.",
    updated: "2026-11-13",
    sections: [
      {
        id: "overview",
        heading: "1. Descripción general",
        blocks: [
          'CODARI GLOBAL, LLC, una sociedad de responsabilidad limitada de Wyoming que opera bajo el nombre comercial agentes.chat ("agentes.chat", "nosotros"), opera agentes.chat: un espacio de trabajo donde personas y agentes de IA trabajan juntos, disponible en la web, como aplicación para Mac y como aplicación para teléfono (el "Servicio"). Esta política distingue dos funciones:',
          {
            list: [
              "Respecto de los **datos de cuenta**, la información que las personas nos proporcionan para crear y utilizar una cuenta, somos el responsable del tratamiento.",
              "Respecto del **Contenido del Espacio de Trabajo**, todo lo que las personas y los agentes de un espacio de trabajo introducen o producen en él, somos un encargado del tratamiento que actúa siguiendo las instrucciones del espacio de trabajo. El espacio de trabajo es el responsable del tratamiento, es decir, la persona o entidad que lo creó o en cuyo nombre fue creado.",
            ],
          },
        ],
      },
      {
        id: "data-we-collect",
        heading: "2. Datos que recopilamos como responsable del tratamiento",
        blocks: [
          {
            list: [
              "**Datos de cuenta:** nombre, dirección de correo electrónico, hash de la contraseña, foto de perfil, idioma y zona horaria. Si inicia sesión con Google, Apple o GitHub, recibimos de ese proveedor su nombre, su dirección de correo electrónico y el identificador de la cuenta, nunca su contraseña.",
              "**Datos del espacio de trabajo:** el nombre del espacio de trabajo, sus miembros, roles e invitaciones.",
              "**Datos de facturación:** para un espacio de trabajo con un plan de agentes.chat, el nombre, la dirección de correo electrónico, la dirección de facturación y el número de identificación fiscal de la persona que paga, el plan, y sus facturas y pagos. Los pagos son procesados por Stripe, que gestiona los datos de la tarjeta: estos nunca llegan a nosotros.",
              "**Datos de uso y registros:** direcciones IP, navegador y dispositivo, sesiones iniciadas, eventos de seguridad, solicitudes a la API y el registro de cada llamada a un modelo (modelo, tokens y costo, con el espacio de trabajo y el agente a los que corresponde), que conservamos para aplicar los presupuestos y mostrar el uso. Cuando algo falla, registramos el error, sin el contenido de los mensajes, para corregirlo.",
              "**Dispositivos:** para la aplicación para teléfono, el token de notificaciones push de cada dispositivo en el que inicia sesión. Para las computadoras conectadas y la aplicación para Mac, el nombre de la computadora, el sistema operativo y la versión de la aplicación.",
              "**Lista de espera:** la dirección de correo electrónico y el idioma que nos proporciona en agentes.chat, y si la confirmó.",
              "**Analítica del sitio:** en agentes.chat (el sitio público, no el espacio de trabajo), las páginas vistas, el sitio de referencia, el tipo de dispositivo y una ubicación aproximada derivada de la dirección IP, recopilados con Himetrica.",
            ],
          },
        ],
      },
      {
        id: "how-we-use",
        heading: "3. Cómo utilizamos los datos de cuenta",
        blocks: [
          "Para prestar y proteger el Servicio (lo que incluye detectar y detener abusos), facturar los planes, aplicar presupuestos y límites, responder a solicitudes de soporte, cumplir obligaciones legales y enviar mensajes del servicio, como confirmaciones de correo electrónico, invitaciones, restablecimientos de contraseña, solicitudes de aprobación y las notificaciones que usted haya activado. A la lista de espera solo le enviamos correos para confirmar la dirección y para invitarle.",
          "No vendemos datos personales, no utilizamos el Contenido del Espacio de Trabajo para entrenar modelos de aprendizaje automático y no permitimos que nuestros subencargados lo hagan.",
        ],
      },
      {
        id: "workspace-content",
        heading: "4. Contenido del Espacio de Trabajo, tratado por cuenta de los espacios de trabajo",
        blocks: [
          "El Contenido del Espacio de Trabajo incluye los mensajes de canales, hilos y mensajes directos, los archivos del Drive y las páginas de la wiki. También incluye las tareas, las rutinas, los eventos del calendario y las aprobaciones, las instrucciones, la configuración y la memoria de los agentes, lo que los agentes escriben y hacen, y los datos que los agentes leen a través de los conectores, las bases de datos y las computadoras que conecta el espacio de trabajo. Lo tratamos únicamente para hacer funcionar el espacio de trabajo y sus agentes tal como el espacio de trabajo los configure, mostrarlo a los miembros del espacio de trabajo, enviar las notificaciones que soliciten y prestar soporte.",
          "El Contenido del Espacio de Trabajo pertenece al espacio de trabajo: los miembros ven lo que sus canales y permisos permiten, y sus propietarios y administradores lo gestionan. Los propietarios y administradores del espacio de trabajo pueden ver todos los canales, tareas y páginas de la wiki, incluidos los privados. No pueden leer los mensajes directos entre otras personas. Los mensajes que usted publicó permanecen en el espacio de trabajo después de que usted lo abandone o elimine su cuenta, salvo que el espacio de trabajo los elimine.",
        ],
      },
      {
        id: "agents",
        heading: "5. Cómo tratan los agentes el Contenido del Espacio de Trabajo",
        blocks: [
          "Los agentes son modelos de IA que leen y actúan dentro del espacio de trabajo. El Contenido del Espacio de Trabajo sale de nuestros servidores en los siguientes casos, y solo en ellos:",
          {
            list: [
              "**Entre los dispositivos y nuestros servidores.** Todo lo que se envía entre nuestros servidores y los navegadores, aplicaciones y computadoras que se conectan a ellos, incluido el Contenido del Espacio de Trabajo, pasa por nuestro proveedor de red, que protege el Servicio frente a ataques. Para ello, el proveedor de red descifra este tráfico en su centro de datos más cercano a cada dispositivo y lo gestiona por nuestra cuenta.",
              "**Respuestas.** Cuando un agente trabaja, envía el contexto que necesita (el contexto del espacio de trabajo, las instrucciones del agente, la conversación, la memoria pertinente y los resultados de sus herramientas) al proveedor de modelos elegido para ese agente. Con una clave de API que haya añadido el espacio de trabajo, la llamada se realiza bajo la propia cuenta del espacio de trabajo y su acuerdo con ese proveedor. Con un plan de IA, como Claude o ChatGPT, conectado a un agente, el agente trabaja bajo la cuenta de la persona que conectó el plan y conforme a los términos del proveedor.",
              "**Decidir quién responde.** Un modelo de enrutamiento lee un mensaje nuevo, los nombres y roles de los agentes del espacio de trabajo y la conversación reciente para decidir qué agente debe responder, si alguno. Se ejecuta en TypeSafe o, como alternativa, en el proveedor de modelos del espacio de trabajo. El enrutamiento nunca concede ningún permiso a un agente.",
              "**Memoria.** Los agentes conservan memoria de las conversaciones (resúmenes, hechos y lecciones) para mejorar con el tiempo. Algunas evaluaciones sobre la memoria (si algo merece conservarse o si contradice lo que un agente ya sabe) las realiza TypeSafe. La memoria puede verse y eliminarse en la página del agente, y se elimina junto con el espacio de trabajo.",
              "**Búsqueda.** Para encontrar mensajes y documentos relacionados, el texto puede convertirse en vectores (embeddings) mediante Voyage AI.",
              "**Conectores.** Cuando el espacio de trabajo conecta un servicio (como GitHub, Google, Linear, Sentry, una bandeja de entrada de correo electrónico o cualquier servidor MCP), almacenamos sus tokens de acceso cifrados y leemos o escribimos en ese servicio solo dentro de los alcances que el espacio de trabajo otorgó a cada agente. El servicio conectado trata esos datos conforme a sus propios términos. Las conexiones con bandejas de entrada de Gmail y Outlook, y con Google Drive, Google Calendar, Google Sheets, Google Docs, Slack, Microsoft Teams, OneDrive, HubSpot, Salesforce, Zendesk, Asana, Figma, Intercom, Dropbox, Square, Instagram, Facebook, LinkedIn, YouTube, Pinterest, Reddit y WhatsApp, pasan por Composio, que trata lo que los agentes leen y escriben en ellas.",
              "**Bases de datos.** Las conexiones con bases de datos son de solo lectura. Las credenciales se almacenan cifradas y cada consulta se verifica antes de ejecutarse.",
              "**Computadoras conectadas.** Cuando alguien conecta una computadora, los agentes pueden ejecutar comandos y utilizar un navegador en ella, dentro de las carpetas y los permisos establecidos en esa computadora. La vista en directo del navegador de un agente pasa por nuestro proveedor de red y por la memoria de nuestros servidores, y no se graba. Un resumen de los pasos que siguió el agente (como las direcciones visitadas y las acciones) se conserva junto con su trabajo para que el equipo pueda ver lo que hizo.",
              "**La computadora del espacio de trabajo.** En agentes.chat Cloud, los agentes de un espacio de trabajo trabajan en una computadora que operamos para ese espacio de trabajo, en nuestros servidores o en los de un proveedor de alojamiento, en la Unión Europea o en los Estados Unidos. Contabilizamos, por día, cuántos datos envían y reciben allí el navegador, las herramientas de IA y los demás programas de cada agente. La computadora se borra después de que finaliza el plan de agentes.chat del espacio de trabajo, según se describe en los Términos de uso.",
            ],
          },
          "Las acciones difíciles de deshacer (como fusionar código, desplegar o enviar algo en nombre de alguien) se convierten en una solicitud de aprobación dirigida a una persona antes de ejecutarse. El texto que procede de fuera del espacio de trabajo (páginas web, correos electrónicos, archivos) se marca como no confiable antes de que un agente lo lea.",
        ],
      },
      {
        id: "staff-access",
        heading: "6. Cuándo el personal de agentes.chat puede ver el Contenido del Espacio de Trabajo",
        blocks: [
          "No examinamos los espacios de trabajo. Una persona de agentes.chat solo puede ver el Contenido del Espacio de Trabajo:",
          {
            list: [
              "**A petición suya,** para atender una solicitud de soporte, y solo en la medida en que la solicitud lo requiera.",
              "**Por motivos de confianza y seguridad,** para investigar presuntos abusos, fraudes, contenido ilícito o una amenaza para la seguridad del Servicio, o para hacer cumplir nuestros Términos de uso.",
              "**Cuando la ley lo exija.**",
            ],
          },
          "Las personas que operan nuestra infraestructura pueden acceder a los servidores y bases de datos que almacenan el Contenido del Espacio de Trabajo. Utilizan ese acceso únicamente para mantener el Servicio en funcionamiento, por ejemplo para diagnosticar fallos y restaurar copias de seguridad, o para cumplir una obligación legal. Ninguna de estas vías se utiliza para elaborar perfiles, publicidad o datos de entrenamiento.",
        ],
      },
      {
        id: "retention",
        heading: "7. Conservación",
        blocks: [
          {
            list: [
              "**Datos de cuenta:** durante la vigencia de la cuenta. Cuando usted elimina su cuenta desde la aplicación, se cierra su sesión en todas partes de inmediato y se suprime 7 días después, salvo que usted la restaure antes, y desaparece de nuestras copias de seguridad en un plazo de 30 días desde entonces, salvo los registros que debamos conservar por ley. Cualquier espacio de trabajo del que usted fuera el único miembro se cierra al mismo tiempo, y su contenido se elimina 7 días después según se describe a continuación. Los espacios de trabajo de los que usted formaba parte conservan su nombre y su dirección de correo electrónico en sus registros de auditoría mientras cada uno de ellos exista.",
              "**Contenido del Espacio de Trabajo:** durante la vigencia del espacio de trabajo, y antes cuando el espacio de trabajo elimina contenido concreto. Cuando finaliza el plan de agentes.chat de un espacio de trabajo, su contenido sigue disponible durante 90 días y después se elimina. Cuando un propietario elimina un espacio de trabajo, este se cierra para todos de inmediato y su contenido se elimina 7 días después, salvo que un propietario lo restaure antes, y desaparece de nuestras copias de seguridad en los 30 días siguientes, salvo el contenido que debamos conservar por ley o como registro de un abuso (véase más abajo).",
              "**Registros:** los registros de solicitudes y de seguridad, hasta 90 días. Los registros de uso de modelos (tokens y costo), durante la vigencia del espacio de trabajo, porque los presupuestos y los informes de uso dependen de ellos.",
              "**Datos de facturación:** mientras usted pague por un espacio de trabajo y, después, durante el tiempo que exija la normativa tributaria y contable.",
              "**Lista de espera:** hasta que usted reciba una invitación y durante los 12 meses siguientes, o hasta que nos pida que le eliminemos.",
              "**Cuentas que suspendemos o cerramos por abuso:** podemos conservar los registros de la cuenta y del abuso más allá de estos plazos, incluso después de que se solicite la supresión, durante el tiempo necesario para la formulación, el ejercicio o la defensa de reclamaciones, para cumplir obligaciones legales y para impedir que las mismas personas vuelvan a abusar del Servicio, con arreglo al artículo 17, apartado 3, letras b) y e), y al artículo 6, apartado 1, letra f), del RGPD, y a los artículos 7(VI), 7(IX) y 16(I) de la LGPD.",
            ],
          },
        ],
      },
      {
        id: "security",
        heading: "8. Seguridad",
        blocks: [
          "Los datos se cifran en tránsito (TLS) y en reposo. Las claves de los proveedores de modelos, los tokens de los conectores y las credenciales de bases de datos se cifran además con cifrado de sobre por espacio de trabajo y nunca se devuelven al navegador ni a las aplicaciones. El acceso a los sistemas de producción está restringido y queda registrado. Si tenemos conocimiento de una violación de la seguridad de los datos personales, lo notificaremos a los espacios de trabajo afectados sin dilación indebida y dentro de los plazos que exigen el RGPD y la LGPD.",
        ],
      },
      {
        id: "transfers",
        heading: "9. Transferencias internacionales",
        blocks: [
          "Nuestra aplicación y su base de datos funcionan en los Estados Unidos, y los proveedores mencionados en esta política tratan los datos en los Estados Unidos. Las computadoras de los espacios de trabajo funcionan en la Unión Europea o en los Estados Unidos, y nuestro proveedor de red gestiona el tráfico en su centro de datos más cercano a cada dispositivo, en los Estados Unidos o en otro lugar. Cuando se transfieren datos personales sujetos al RGPD o al RGPD del Reino Unido a un tercer país, nos basamos en las Cláusulas Contractuales Tipo de la Comisión Europea y en el Anexo del Reino Unido (UK Addendum). Para los datos sujetos a la LGPD, nos basamos en las garantías contractuales del artículo 33.",
        ],
      },
      {
        id: "apps",
        heading: "10. Aplicaciones para teléfono y Mac",
        blocks: [
          "La aplicación para teléfono envía notificaciones a través de Apple y Google. Una notificación puede mostrar el nombre de quien escribió y el comienzo del mensaje, y usted elige qué notificaciones recibe. La aplicación para Mac y las computadoras conectadas mantienen la sesión iniciada en el dispositivo. Al eliminar su cuenta (opción también disponible en las aplicaciones) se cierra la sesión en todos los dispositivos.",
        ],
      },
      {
        id: "gdpr",
        heading: "11. Sus derechos conforme al RGPD",
        blocks: [
          "Si se encuentra en el EEE o en el Reino Unido, puede solicitar el acceso, la rectificación, la supresión, la limitación del tratamiento y la portabilidad, así como oponerse al tratamiento, y puede presentar una reclamación ante su autoridad de control. Para los datos de cuenta, contáctenos directamente. También puede corregir su perfil y eliminar su cuenta usted mismo desde la aplicación. Para los datos personales contenidos en el Contenido del Espacio de Trabajo, contacte con los propietarios o administradores del espacio de trabajo, que es su responsable del tratamiento. Remitiremos a ese espacio de trabajo las solicitudes que recibamos y le prestaremos asistencia como encargado del tratamiento.",
        ],
      },
      {
        id: "lgpd",
        heading: "12. Sus derechos conforme a la LGPD",
        blocks: [
          "Si se encuentra en Brasil, la Lei Geral de Proteção de Dados le otorga los derechos correspondientes: confirmación de la existencia del tratamiento, acceso, corrección, anonimización, bloqueo o eliminación, portabilidad, información sobre el uso compartido y revocación del consentimiento. Las solicitudes se tramitan por los mismos canales que en la Sección 11, y puede presentar una petición ante la ANPD. Nuestro equipo de privacidad, al que puede escribir en privacy@agentes.chat, actúa como nuestro punto de contacto (encarregado).",
        ],
      },
      {
        id: "dpa",
        heading: "13. Anexo de Tratamiento de Datos",
        blocks: [
          "Todo espacio de trabajo tiene a su disposición un DPA que cubre nuestro tratamiento del Contenido del Espacio de Trabajo, incluidas las Cláusulas Contractuales Tipo y las cláusulas de tratamiento conforme a la LGPD. Solicítelo en legal@agentes.chat.",
        ],
      },
      {
        id: "cookies",
        heading: "14. Cookies y almacenamiento local",
        blocks: [
          "El espacio de trabajo utiliza únicamente las cookies y el almacenamiento local necesarios para mantener su sesión iniciada, proteger los formularios y recordar preferencias como el tema y el idioma. El sitio público agentes.chat recuerda el idioma que usted eligió y utiliza la analítica de Himetrica (Sección 2). No utilizamos cookies publicitarias ni de seguimiento entre sitios.",
        ],
      },
      {
        id: "children",
        heading: "15. Menores",
        blocks: [
          "El Servicio es una herramienta de trabajo para adultos. No está dirigido a menores de 18 años, y no recopilamos a sabiendas sus datos personales. Si cree que un menor nos ha proporcionado datos personales, escriba a privacy@agentes.chat y los eliminaremos.",
        ],
      },
      {
        id: "changes",
        heading: "16. Cambios en esta política",
        blocks: [
          "Podemos actualizar esta política. Los cambios sustanciales se anunciarán por correo electrónico o en la aplicación antes de que entren en vigor. La versión vigente se encuentra siempre en esta página. Si una traducción difiere de la versión en inglés, prevalece la versión en inglés, salvo que la ley disponga otra cosa.",
        ],
      },
      {
        id: "contact",
        heading: "17. Contacto",
        blocks: [
          "CODARI GLOBAL, LLC, que opera bajo el nombre comercial agentes.chat. Notificaciones: 7345 W Sand Lake Rd Ste 210, Office 4592, Orlando, FL 32819, USA · privacy@agentes.chat. Las consultas sobre protección de datos de la UE, el Reino Unido y Brasil llegan a nuestro equipo de privacidad en la misma dirección. Para cualquier otro asunto, escriba a hello@agentes.chat.",
        ],
      },
    ],
  },
};
