import type { LegalDocument, LegalKind } from "./types";

/** Terms and Privacy in fr, each with its `courtesy` notice: a page not here shows in English. */
export const legalFr: Partial<Record<LegalKind, LegalDocument>> = {
  terms: {
    title: "Conditions d'utilisation",
    summary:
      "Le contrat d'utilisation d'agentes.chat : votre espace de travail, vos agents et les responsabilités de chaque partie.",
    courtesy:
      "Ceci est une traduction de courtoisie. En cas de divergence avec la version anglaise, la version anglaise prévaut.",
    updated: "2026-11-13",
    sections: [
      {
        id: "agreement",
        heading: "1. Contrat",
        blocks: [
          "Les présentes Conditions d'utilisation (les « Conditions ») constituent un contrat ayant force obligatoire entre CODARI GLOBAL, LLC, société à responsabilité limitée (limited liability company) du Wyoming exerçant sous le nom agentes.chat (« agentes.chat », « nous »), et la personne physique ou morale qui crée un compte ou un espace de travail (« vous »). En créant un compte, en rejoignant un espace de travail ou en utilisant de toute autre manière agentes.chat sur le web, l'application Mac ou l'application mobile (le « Service »), vous acceptez les présentes Conditions et notre Politique de confidentialité. Si vous utilisez le Service pour le compte d'une société ou d'une autre entité, vous déclarez être habilité à l'engager.",
          "Vous devez être âgé d'au moins 18 ans et avoir la capacité de contracter pour utiliser le Service.",
        ],
      },
      {
        id: "service",
        heading: "2. Le Service",
        blocks: [
          "Le Service est un espace de travail où des personnes et des agents d'IA travaillent ensemble. Il comprend des canaux, des fils de discussion et des messages directs, ainsi que des agents dotés de leurs propres rôles, instructions, mémoire et budgets. Il comprend aussi des tâches, un wiki, un Drive, un agenda et des routines, des approbations, des connecteurs vers d'autres services et la possibilité de connecter des ordinateurs sur lesquels les agents peuvent travailler.",
          "Le Service est nouveau et continue d'évoluer : des fonctionnalités peuvent être modifiées, limitées ou supprimées. Nous pouvons, pendant un certain temps, n'ouvrir de nouveaux comptes que sur invitation, ou les ouvrir à toute personne qui s'inscrit. Dans la mesure du possible, nous vous informerons à l'avance avant de supprimer un élément dont vous dépendez.",
        ],
      },
      {
        id: "accounts",
        heading: "3. Comptes et espaces de travail",
        blocks: [
          "Vous êtes responsable de l'exactitude des informations de votre compte, de la sécurité de vos identifiants et de toute activité réalisée sous votre compte. Les propriétaires et administrateurs d'un espace de travail décident qui le rejoint, quels rôles ces personnes ont, quels agents existent et ce que ces agents peuvent faire. Lorsque les présentes Conditions indiquent qu'un espace de travail possède quelque chose, en décide ou en répond, elles désignent la personne physique ou morale qui l'a créé, ou pour le compte de laquelle il a été créé, agissant par l'intermédiaire de ses propriétaires et administrateurs. Avertissez-nous sans délai à security@agentes.chat si vous pensez qu'un compte, une clé ou un ordinateur connecté a été compromis.",
        ],
      },
      {
        id: "agents",
        heading: "4. Les agents et leurs actions",
        blocks: [
          "Les agents agissent selon les instructions, autorisations, connecteurs, budgets et ordinateurs que vous et votre espace de travail leur fournissez. Ce qu'un agent fait dans le cadre de ces autorisations, y compris les messages qu'il envoie, le code qu'il modifie, les données qu'il lit, écrit ou supprime et les commandes qu'il exécute sur un ordinateur, est fait pour le compte de votre espace de travail, et votre espace de travail en est responsable au titre des présentes Conditions. Chaque agent a une personne qui en est responsable.",
          "Les actions difficiles à annuler font l'objet d'une demande d'approbation adressée à une personne avant d'être exécutées. L'approbation d'une telle demande relève de votre décision. Le Service indique ce qui sera fait, mais il vous appartient de l'examiner.",
          "Les résultats produits par l'IA peuvent être erronés, incomplets ou obsolètes, même lorsqu'ils semblent assurés. Examinez ce que les agents produisent avant de vous y fier, et ne l'utilisez pas en remplacement d'un conseil professionnel (juridique, médical, financier ou autre) ni comme unique fondement de décisions produisant des effets juridiques ou des effets significatifs similaires sur des personnes.",
        ],
      },
      {
        id: "acceptable-use",
        heading: "5. Utilisation acceptable",
        blocks: [
          "Vous vous engagez à ne pas utiliser le Service, ni laisser des agents être utilisés, pour :",
          {
            list: [
              "enfreindre la loi, porter atteinte aux droits d'autrui ou traiter des données à caractère personnel sans base légale",
              "envoyer du spam ou des messages non sollicités, ou harceler, menacer, tromper qui que ce soit ou usurper son identité",
              "créer ou diffuser des logiciels malveillants, de l'hameçonnage ou des contenus qui sexualisent des mineurs, font l'apologie de la violence ou sont illicites de toute autre manière",
              "contourner les limites et garde-fous du Service, tels que les budgets, les limites de débit, les approbations, les autorisations ou les contrôles portant sur les ordinateurs et bases de données connectés",
              "attaquer le Service, ou des tiers par son intermédiaire, notamment en recherchant des vulnérabilités, en le surchargeant ou en y insérant des instructions destinées à prendre le contrôle des agents d'autres personnes",
              "accéder à un service, un ordinateur ou des données que vous n'êtes pas autorisé à utiliser, ou utiliser un service connecté en violation de ses propres conditions",
              "enfreindre les politiques d'utilisation des fournisseurs de modèles d'IA qui font fonctionner vos agents.",
            ],
          },
          "Nous pouvons suspendre un agent, un connecteur ou un compte, avec préavis dans la mesure du possible, lorsqu'une activité menace la sécurité, l'intégrité ou le fonctionnement licite du Service ou de tiers.",
        ],
      },
      {
        id: "content",
        heading: "6. Votre contenu",
        blocks: [
          "Le « Contenu de l'Espace de travail » désigne ce que vous et les autres personnes de votre espace de travail introduisez dans le Service et ce que vos agents y produisent. Votre espace de travail est propriétaire de son Contenu de l'Espace de travail et, dans les rapports entre vous et nous, les résultats que les agents produisent pour vous vous appartiennent, sous réserve des conditions du fournisseur du modèle qui les a produits. Ces résultats peuvent être similaires à ceux que les mêmes modèles produisent pour d'autres.",
          "Vous nous concédez les droits limités nécessaires à l'exploitation du Service : stocker, traiter, transmettre et afficher le Contenu de l'Espace de travail afin de faire fonctionner votre espace de travail et vos agents, le transmettre aux fournisseurs utilisés par vos agents comme décrit dans la Politique de confidentialité, et fournir une assistance. Nous ne vendons pas le Contenu de l'Espace de travail et ne l'utilisons pas pour entraîner des modèles d'apprentissage automatique.",
          "Votre espace de travail est le responsable du traitement des données à caractère personnel contenues dans son Contenu de l'Espace de travail, et nous traitons ces données sur ses instructions en qualité de sous-traitant, comme décrit dans la Politique de confidentialité et l'Avenant relatif au traitement des données.",
        ],
      },
      {
        id: "third-parties",
        heading: "7. Fournisseurs de modèles, connecteurs et vos propres comptes",
        blocks: [
          "Les agents fonctionnent grâce à des modèles d'IA de tiers (tels qu'Anthropic, qui développe Claude, et OpenAI), au moyen d'une clé d'API ajoutée par votre espace de travail ou d'un abonnement d'IA, tel que Claude ou ChatGPT, connecté par une personne de votre espace de travail. L'utilisation de cette clé ou de cet abonnement est également régie par votre contrat avec le fournisseur concerné, et il vous incombe de respecter ses conditions et de payer ses frais.",
          "Les connecteurs donnent aux agents accès à d'autres services (tels que GitHub, Google, Linear, Sentry ou une boîte de réception e-mail). Ces services sont fournis par des tiers selon leurs propres conditions. Leur disponibilité et l'usage qu'ils font des données échappent à notre contrôle.",
        ],
      },
      {
        id: "computers",
        heading: "8. Ordinateurs connectés",
        blocks: [
          "Si vous connectez un ordinateur, vous installez un logiciel qui permet aux agents d'y exécuter des commandes et d'y utiliser un navigateur, dans les limites des dossiers et autorisations que vous définissez sur cet ordinateur. Vous êtes responsable de l'ordinateur, de ce que vous y autorisez et de la sauvegarde de ce qui importe. Les autorisations ne peuvent être étendues que sur l'ordinateur lui-même, et vous pouvez le déconnecter à tout moment.",
        ],
      },
      {
        id: "data-protection",
        heading: "9. Protection des données",
        blocks: [
          "Lorsque le RGPD, le RGPD du Royaume-Uni ou la LGPD s'applique aux données à caractère personnel contenues dans votre Contenu de l'Espace de travail, chaque partie respecte les obligations qui lui incombent en vertu de cette loi. Un Avenant relatif au traitement des données (DPA) intégrant les clauses contractuelles types de la Commission européenne et des stipulations équivalentes au titre de la LGPD est disponible et, une fois signé, fait partie intégrante des présentes Conditions. Demandez-le à legal@agentes.chat.",
        ],
      },
      {
        id: "fees",
        heading: "10. Abonnements, paiements et usage raisonnable",
        blocks: [
          "Chaque espace de travail paie son propre abonnement agentes.chat. Les règles suivantes s'appliquent à tous les abonnements :",
          {
            list: [
              "**Prix.** Les abonnements et leurs prix figurent sur notre page de tarifs. Les prix sont exprimés en dollars américains, et les taxes s'y ajoutent lorsqu'elles sont applicables. Votre banque ou votre prestataire de paiement peut prélever ses propres frais sur les achats effectués à l'étranger, comme l'IOF au Brésil.",
              "**Renouvellement.** Un abonnement se renouvelle automatiquement chaque mois ou chaque année, selon la période choisie, jusqu'à sa résiliation. Nous envoyons un rappel avant le renouvellement d'un abonnement annuel.",
              "**Résiliation.** Vous pouvez résilier à tout moment, et la résiliation prend effet à la fin de la période déjà payée. Les agents de l'espace de travail s'arrêtent alors, son ordinateur est effacé 7 jours plus tard, et ses conversations et fichiers restent accessibles en lecture et en téléchargement pendant 90 jours, après quoi ils sont supprimés.",
              "**Absence de remboursement.** Les paiements sont définitifs et non remboursables, en tout ou en partie, y compris pour le reste d'une période après une résiliation, sauf disposition légale contraire.",
              "**Échecs de paiement.** Si un paiement échoue, nous réessayons au cours des jours suivants. S'il échoue toujours, l'espace de travail est mis en suspens : ses agents s'arrêtent, et les personnes peuvent toujours y lire et y écrire. Son ordinateur est conservé pendant 7 jours, puis libéré et effacé. Le paiement rétablit l'espace de travail, sur un nouvel ordinateur si l'ancien a été libéré.",
              "**Modifications de prix.** Nous pouvons modifier les prix pour les nouveaux clients à tout moment. Le prix d'un abonnement que vous avez déjà ne change qu'en raison de nouvelles taxes, à compter de son prochain renouvellement, avec un préavis d'au moins 30 jours.",
              "**Usage raisonnable.** Certaines fonctionnalités reposent sur des services d'IA que nous fournissons sans frais supplémentaires, comme le choix de l'agent qui répond, l'évaluation des souvenirs et des actions, et la recherche de l'élément sur lequel cliquer à l'écran. Nous pouvons les limiter pour un espace de travail dont l'utilisation dépasse largement la normale.",
              "**Budgets.** Les budgets définis par espace de travail et par agent arrêtent l'utilisation des modèles par les agents lorsqu'ils sont atteints. Ils font partie du Service et n'en constituent pas un défaut. Les frais facturés par un fournisseur pour votre propre clé ou votre propre abonnement d'IA relèvent de la relation entre vous et ce fournisseur.",
            ],
          },
        ],
      },
      {
        id: "ip",
        heading: "11. Propriété intellectuelle et retours",
        blocks: [
          "À l'exception de votre Contenu de l'Espace de travail, nous et nos concédants conservons l'ensemble des droits, titres et intérêts sur le Service, y compris son logiciel, sa conception ainsi que le nom et les marques agentes.chat. Les retours que vous choisissez de nous envoyer peuvent être utilisés sans aucune obligation envers vous.",
        ],
      },
      {
        id: "termination",
        heading: "12. Durée et résiliation",
        blocks: [
          "Vous pouvez cesser d'utiliser le Service et supprimer votre compte à tout moment dans l'application. Il est supprimé 7 jours plus tard, et vous pouvez le restaurer d'ici là. Nous pouvons suspendre ou mettre fin à votre accès en cas de manquement substantiel aux présentes Conditions, lorsque la loi l'exige, ou moyennant un préavis de 30 jours si nous cessons d'exploiter le Service. Lorsque nous mettons fin au Service pour des raisons autres que votre manquement, nous mettrons votre Contenu de l'Espace de travail à votre disposition pour exportation pendant 30 jours, puis le supprimerons comme décrit dans la Politique de confidentialité. Les sections qui, par leur nature, survivent à la résiliation (notamment les sections 6, 9, 11, 13, 14 et 15) demeurent en vigueur.",
        ],
      },
      {
        id: "disclaimers",
        heading: "13. Exclusions de garantie",
        blocks: [
          "Le Service, y compris tout ce que les agents produisent et font, est fourni « en l'état » et « selon disponibilité ». Nous ne garantissons pas que le Service ou les agents fonctionneront sans interruption ni erreur, seront exacts ou adaptés à vos besoins. Dans toute la mesure permise par la loi, nous excluons toute garantie implicite, y compris de qualité marchande, d'adéquation à un usage particulier et d'absence de contrefaçon.",
        ],
      },
      {
        id: "liability",
        heading: "14. Limitation de responsabilité",
        blocks: [
          "Dans toute la mesure permise par la loi, aucune des parties n'est responsable des dommages indirects, accessoires, spéciaux, consécutifs ou punitifs, ni des pertes de bénéfices, de chiffre d'affaires ou de données. Dans la même mesure, notre responsabilité globale découlant du Service est limitée aux montants que vous nous avez payés au cours des douze mois précédant le fait générateur de la réclamation (ou à 100 USD si vous n'avez rien payé). Ces limites ne s'appliquent pas à vos obligations de paiement, à votre manquement à la section 5, ni à la responsabilité qui ne peut être limitée par la loi.",
        ],
      },
      {
        id: "indemnification",
        heading: "15. Indemnisation",
        blocks: [
          "Vous assurerez notre défense et nous indemniserez contre les réclamations de tiers découlant de votre Contenu de l'Espace de travail, de ce que vos agents ont fait dans le cadre des autorisations que vous leur avez données, ou de votre manquement à la section 5.",
        ],
      },
      {
        id: "law",
        heading: "16. Droit applicable",
        blocks: [
          "Les présentes Conditions sont régies par le droit de l'État du Wyoming (États-Unis), à l'exclusion de ses règles de conflit de lois, et les parties se soumettent à la compétence exclusive des juridictions étatiques et fédérales situées dans le Wyoming. Si vous êtes un consommateur relevant d'une juridiction dont la loi vous accorde des droits ou un for auxquels il ne peut être renoncé, comme le Brésil, ces droits ne sont pas affectés.",
        ],
      },
      {
        id: "changes",
        heading: "17. Modifications des présentes Conditions",
        blocks: [
          "Nous pouvons mettre à jour les présentes Conditions. Les modifications substantielles seront annoncées par e-mail ou dans l'application au moins 14 jours avant leur entrée en vigueur. La poursuite de l'utilisation après la date d'entrée en vigueur vaut acceptation. La version en vigueur figure toujours sur cette page. En cas de divergence entre une traduction et la version anglaise, la version anglaise prévaut, sauf disposition légale contraire.",
        ],
      },
      {
        id: "contact",
        heading: "18. Contact",
        blocks: [
          "CODARI GLOBAL, LLC, exerçant sous le nom agentes.chat. Notifications : 7345 W Sand Lake Rd Ste 210, Office 4592, Orlando, FL 32819, USA · legal@agentes.chat · Pour tout le reste : hello@agentes.chat",
        ],
      },
    ],
  },
  privacy: {
    title: "Politique de confidentialité",
    summary:
      "Ce que nous collectons, ce que les agents envoient et à qui, qui peut voir votre espace de travail, et les droits dont vous disposez.",
    courtesy:
      "Ceci est une traduction de courtoisie. En cas de divergence avec la version anglaise, la version anglaise prévaut.",
    updated: "2026-11-13",
    sections: [
      {
        id: "overview",
        heading: "1. Présentation",
        blocks: [
          "CODARI GLOBAL, LLC, société à responsabilité limitée (limited liability company) du Wyoming exerçant sous le nom agentes.chat (« agentes.chat », « nous »), exploite agentes.chat : un espace de travail où des personnes et des agents d'IA travaillent ensemble, disponible sur le web, en application Mac et en application mobile (le « Service »). La présente politique distingue deux rôles :",
          {
            list: [
              "Pour les **données de compte**, c'est-à-dire les informations que les personnes nous fournissent pour créer et utiliser un compte, nous sommes le responsable du traitement.",
              "Pour le **Contenu de l'Espace de travail**, c'est-à-dire tout ce que les personnes et les agents d'un espace de travail y introduisent ou y produisent, nous sommes un sous-traitant agissant sur les instructions de l'espace de travail. L'espace de travail est le responsable du traitement, à savoir la personne physique ou morale qui l'a créé ou pour le compte de laquelle il a été créé.",
            ],
          },
        ],
      },
      {
        id: "data-we-collect",
        heading: "2. Données que nous collectons en tant que responsable du traitement",
        blocks: [
          {
            list: [
              "**Données de compte :** nom, adresse e-mail, empreinte (hash) du mot de passe, photo de profil, langue et fuseau horaire. Si vous vous connectez avec Google, Apple ou GitHub, nous recevons de ce fournisseur votre nom, votre adresse e-mail et l'identifiant du compte, jamais son mot de passe.",
              "**Données de l'espace de travail :** le nom de l'espace de travail, ses membres, rôles et invitations.",
              "**Données de facturation :** pour un espace de travail disposant d'un abonnement agentes.chat, le nom, l'adresse e-mail, l'adresse de facturation et le numéro d'identification fiscale de la personne qui paie, l'abonnement, ainsi que ses factures et paiements. Les paiements sont traités par Stripe, qui gère les données de carte : elles ne nous parviennent jamais.",
              "**Données d'utilisation et journaux :** adresses IP, navigateur et appareil, sessions de connexion, événements de sécurité, requêtes d'API, et l'enregistrement de chaque appel de modèle (modèle, jetons et coût, avec l'espace de travail et l'agent auxquels il se rattache), que nous conservons pour appliquer les budgets et afficher l'utilisation. Lorsqu'une panne survient, nous enregistrons l'erreur, sans le contenu des messages, afin de la corriger.",
              "**Appareils :** pour l'application mobile, le jeton de notification push de chaque appareil sur lequel vous vous connectez. Pour les ordinateurs connectés et l'application Mac, le nom de l'ordinateur, son système d'exploitation et la version de l'application.",
              "**Liste d'attente :** l'adresse e-mail et la langue que vous nous indiquez sur agentes.chat, et le fait que vous l'ayez confirmée ou non.",
              "**Statistiques du site :** sur agentes.chat (le site public, et non l'espace de travail), les pages consultées, le site de provenance, le type d'appareil et une localisation approximative déduite de l'adresse IP, collectés au moyen de Himetrica.",
            ],
          },
        ],
      },
      {
        id: "how-we-use",
        heading: "3. Utilisation des données de compte",
        blocks: [
          "Pour fournir et sécuriser le Service (y compris détecter et faire cesser les abus), facturer les abonnements, appliquer les budgets et les limites, répondre aux demandes d'assistance, respecter nos obligations légales et envoyer des messages de service tels que les confirmations d'adresse e-mail, les invitations, les réinitialisations de mot de passe, les demandes d'approbation et les notifications que vous avez activées. Nous n'écrivons aux personnes inscrites sur la liste d'attente que pour confirmer leur adresse et pour les inviter.",
          "Nous ne vendons pas de données à caractère personnel, n'utilisons pas le Contenu de l'Espace de travail pour entraîner des modèles d'apprentissage automatique et n'autorisons pas nos sous-traitants ultérieurs à le faire.",
        ],
      },
      {
        id: "workspace-content",
        heading: "4. Contenu de l'Espace de travail, traité pour le compte des espaces de travail",
        blocks: [
          "Le Contenu de l'Espace de travail comprend les messages des canaux, fils de discussion et messages directs, les fichiers du Drive et les pages du wiki. Il comprend aussi les tâches, routines, événements d'agenda et approbations, les instructions, paramètres et la mémoire des agents, ce que les agents écrivent et font, et les données que les agents lisent par l'intermédiaire des connecteurs, bases de données et ordinateurs que l'espace de travail connecte. Nous le traitons uniquement pour faire fonctionner l'espace de travail et ses agents tels que l'espace de travail les configure, pour le présenter aux membres de l'espace de travail, pour envoyer les notifications qu'ils demandent et pour fournir une assistance.",
          "Le Contenu de l'Espace de travail appartient à l'espace de travail : les membres voient ce que ses canaux et autorisations permettent, et ses propriétaires et administrateurs le gèrent. Les propriétaires et les administrateurs de l'espace de travail peuvent voir tous les canaux, toutes les tâches et toutes les pages du wiki, y compris ceux qui sont privés. Ils ne peuvent pas lire les messages directs échangés entre d'autres personnes. Les messages que vous avez publiés restent dans l'espace de travail après que vous l'avez quitté ou que vous avez supprimé votre compte, sauf si l'espace de travail les supprime.",
        ],
      },
      {
        id: "agents",
        heading: "5. Comment les agents traitent le Contenu de l'Espace de travail",
        blocks: [
          "Les agents sont des modèles d'IA qui lisent et agissent au sein de l'espace de travail. Le Contenu de l'Espace de travail quitte nos serveurs dans les cas suivants, et uniquement dans ceux-ci :",
          {
            list: [
              "**Entre les appareils et nos serveurs.** Tout ce qui transite entre nos serveurs et les navigateurs, applications et ordinateurs qui s'y connectent, Contenu de l'Espace de travail compris, passe par notre fournisseur de réseau, qui protège le Service contre les attaques. Pour ce faire, le fournisseur de réseau déchiffre ce trafic dans son centre de données le plus proche de chaque appareil et le traite pour notre compte.",
              "**Réponses.** Lorsqu'un agent travaille, il envoie le contexte dont il a besoin (le contexte de l'espace de travail, les instructions de l'agent, la conversation, la mémoire pertinente et les résultats de ses outils) au fournisseur de modèle choisi pour cet agent. Avec une clé d'API ajoutée par l'espace de travail, l'appel est effectué sous le compte propre de l'espace de travail et dans le cadre de son contrat avec ce fournisseur. Avec un abonnement d'IA, tel que Claude ou ChatGPT, connecté à un agent, l'agent travaille sous le compte de la personne qui a connecté l'abonnement et selon les conditions du fournisseur.",
              "**Choix de l'agent qui répond.** Un modèle de routage lit un nouveau message, les noms et rôles des agents de l'espace de travail et la conversation récente afin de décider quel agent, le cas échéant, doit répondre. Il fonctionne chez TypeSafe ou, à titre subsidiaire, chez le fournisseur de modèle de l'espace de travail. Le routage n'accorde jamais aucune autorisation à un agent.",
              "**Mémoire.** Les agents conservent une mémoire des conversations (résumés, faits et enseignements) afin de s'améliorer au fil du temps. Certaines appréciations relatives à la mémoire (savoir si un élément mérite d'être conservé ou s'il contredit ce qu'un agent sait déjà) sont effectuées par TypeSafe. La mémoire peut être consultée et supprimée sur la page de l'agent, et elle est supprimée avec l'espace de travail.",
              "**Recherche.** Pour trouver des messages et documents connexes, du texte peut être converti en vecteurs (embeddings) par Voyage AI.",
              "**Connecteurs.** Lorsque l'espace de travail connecte un service (tel que GitHub, Google, Linear, Sentry, une boîte de réception e-mail ou tout serveur MCP), nous stockons ses jetons d'accès sous forme chiffrée et ne lisons ou n'écrivons dans ce service que dans les limites des périmètres que l'espace de travail a accordés à chaque agent. Le service connecté traite ces données selon ses propres conditions. Les connexions aux boîtes de réception Gmail et Outlook, ainsi qu'à Google Drive, Google Calendar, Google Sheets, Google Docs, Slack, Microsoft Teams, OneDrive, HubSpot, Salesforce, Zendesk, Asana, Figma, Intercom, Dropbox, Square, Instagram, Facebook, LinkedIn, YouTube, Pinterest, Reddit et WhatsApp, passent par Composio, qui traite ce que les agents y lisent et y écrivent.",
              "**Bases de données.** Les connexions aux bases de données sont en lecture seule. Les identifiants sont stockés sous forme chiffrée et chaque requête est vérifiée avant son exécution.",
              "**Ordinateurs connectés.** Lorsqu'une personne connecte un ordinateur, les agents peuvent y exécuter des commandes et y utiliser un navigateur, dans les limites des dossiers et autorisations définis sur cet ordinateur. L'affichage en direct du navigateur d'un agent passe par notre fournisseur de réseau et par la mémoire de nos serveurs, et n'est pas enregistré. Un résumé des étapes suivies par l'agent (telles que les adresses consultées et les actions effectuées) est conservé avec son travail afin que l'équipe puisse voir ce qu'il a fait.",
              "**L'ordinateur de l'espace de travail.** Sur agentes.chat Cloud, les agents d'un espace de travail travaillent sur un ordinateur que nous exploitons pour cet espace de travail, sur nos serveurs ou sur ceux d'un fournisseur d'hébergement, dans l'Union européenne ou aux États-Unis. Nous mesurons, par jour, la quantité de données que le navigateur, les outils d'IA et les autres programmes de chaque agent y envoient et y reçoivent. L'ordinateur est effacé après la fin de l'abonnement agentes.chat de l'espace de travail, comme le décrivent les Conditions d'utilisation.",
            ],
          },
          "Les actions difficiles à annuler (telles que fusionner du code, déployer ou envoyer un message au nom d'une personne) font l'objet d'une demande d'approbation adressée à une personne avant d'être exécutées. Le texte provenant de l'extérieur de l'espace de travail (pages web, e-mails, fichiers) est signalé comme non fiable avant qu'un agent ne le lise.",
        ],
      },
      {
        id: "staff-access",
        heading: "6. Quand le personnel d'agentes.chat peut voir le Contenu de l'Espace de travail",
        blocks: [
          "Nous ne parcourons pas les espaces de travail. Une personne chez agentes.chat ne peut voir le Contenu de l'Espace de travail que :",
          {
            list: [
              "**À votre demande,** pour traiter une demande d'assistance, et uniquement dans la mesure nécessaire à cette demande.",
              "**Pour des raisons de confiance et de sécurité,** afin d'enquêter sur des soupçons d'abus, de fraude, de contenu illicite ou de menace pour la sécurité du Service, ou afin de faire respecter nos Conditions d'utilisation.",
              "**Lorsque la loi l'exige.**",
            ],
          },
          "Les personnes qui exploitent notre infrastructure peuvent accéder aux serveurs et bases de données qui stockent le Contenu de l'Espace de travail. Elles n'utilisent cet accès que pour assurer le fonctionnement du Service, par exemple pour diagnostiquer des pannes et restaurer des sauvegardes, ou pour respecter une obligation légale. Aucune de ces voies d'accès n'est utilisée pour constituer des profils, de la publicité ou des données d'entraînement.",
        ],
      },
      {
        id: "retention",
        heading: "7. Conservation",
        blocks: [
          {
            list: [
              "**Données de compte :** pendant toute la durée de vie du compte. Lorsque vous supprimez votre compte dans l'application, il est déconnecté partout immédiatement et supprimé 7 jours plus tard, sauf si vous le restaurez avant, et disparaît de nos sauvegardes dans un délai de 30 jours après cela, à l'exception des enregistrements que la loi nous impose de conserver. Tout espace de travail dont vous étiez l'unique membre est fermé au même moment, et son contenu est supprimé 7 jours plus tard comme décrit ci-après. Les espaces de travail dont vous faisiez partie conservent votre nom et votre adresse e-mail dans leurs journaux d'audit aussi longtemps que chacun d'eux existe.",
              "**Contenu de l'Espace de travail :** pendant toute la durée de vie de l'espace de travail, et moins longtemps lorsque l'espace de travail supprime un contenu déterminé. Lorsque l'abonnement agentes.chat d'un espace de travail prend fin, son contenu reste disponible pendant 90 jours, puis est supprimé. Lorsqu'un propriétaire supprime un espace de travail, celui-ci est fermé pour tous immédiatement et son contenu est supprimé 7 jours plus tard, sauf si un propriétaire le restaure avant cette date, puis disparaît de nos sauvegardes dans les 30 jours qui suivent, à l'exception du contenu que nous devons conserver en vertu de la loi ou à titre de preuve d'abus (voir ci-dessous).",
              "**Journaux :** journaux de requêtes et de sécurité pendant 90 jours au maximum. Les enregistrements d'utilisation des modèles (jetons et coût) pendant toute la durée de vie de l'espace de travail, car les budgets et les rapports d'utilisation en dépendent.",
              "**Données de facturation :** tant que vous payez pour un espace de travail, puis aussi longtemps que l'exige la législation fiscale et comptable.",
              "**Liste d'attente :** jusqu'à ce que vous soyez invité et pendant 12 mois après, ou jusqu'à ce que vous nous demandiez de vous en retirer.",
              "**Comptes que nous suspendons ou fermons pour abus :** nous pouvons conserver les enregistrements relatifs au compte et à l'abus au-delà de ces durées, y compris après une demande de suppression, aussi longtemps que nécessaire pour la constatation, l'exercice ou la défense de droits en justice, pour respecter nos obligations légales et pour empêcher les mêmes personnes d'abuser à nouveau du Service, en vertu de l'article 17, paragraphe 3, points b) et e), et de l'article 6, paragraphe 1, point f), du RGPD, ainsi que de l'article 7, VI et IX, et de l'article 16, I, de la LGPD.",
            ],
          },
        ],
      },
      {
        id: "security",
        heading: "8. Sécurité",
        blocks: [
          "Les données sont chiffrées en transit (TLS) et au repos. Les clés des fournisseurs de modèles, les jetons des connecteurs et les identifiants des bases de données sont en outre chiffrés par chiffrement d'enveloppe propre à chaque espace de travail et ne sont jamais renvoyés au navigateur ni aux applications. L'accès aux systèmes de production est restreint et journalisé. Si nous avons connaissance d'une violation de données à caractère personnel, nous en informerons les espaces de travail concernés dans les meilleurs délais et dans les délais exigés par le RGPD et la LGPD.",
        ],
      },
      {
        id: "transfers",
        heading: "9. Transferts internationaux",
        blocks: [
          "Notre application et sa base de données fonctionnent aux États-Unis, et les fournisseurs nommés dans la présente politique traitent les données aux États-Unis. Les ordinateurs des espaces de travail fonctionnent dans l'Union européenne ou aux États-Unis, et notre fournisseur de réseau traite le trafic dans son centre de données le plus proche de chaque appareil, aux États-Unis ou ailleurs. Lorsque des données à caractère personnel soumises au RGPD ou au RGPD du Royaume-Uni sont transférées vers un pays tiers, nous nous appuyons sur les clauses contractuelles types de la Commission européenne et sur l'Addendum du Royaume-Uni (UK Addendum). Pour les données soumises à la LGPD, nous nous appuyons sur les garanties contractuelles prévues à l'article 33.",
        ],
      },
      {
        id: "apps",
        heading: "10. Applications mobile et Mac",
        blocks: [
          "L'application mobile envoie des notifications par l'intermédiaire d'Apple et de Google. Une notification peut afficher le nom de l'auteur et le début du message, et vous choisissez les notifications que vous recevez. L'application Mac et les ordinateurs connectés conservent leur connexion sur l'appareil. La suppression de votre compte (également disponible dans les applications) déconnecte tous les appareils.",
        ],
      },
      {
        id: "gdpr",
        heading: "11. Vos droits au titre du RGPD",
        blocks: [
          "Si vous vous trouvez dans l'EEE ou au Royaume-Uni, vous pouvez demander l'accès, la rectification, l'effacement, la limitation et la portabilité, et vous opposer au traitement, et vous pouvez introduire une réclamation auprès de votre autorité de contrôle. Pour les données de compte, contactez-nous directement. Vous pouvez également corriger votre profil et supprimer votre compte vous-même dans l'application. Pour les données à caractère personnel contenues dans le Contenu de l'Espace de travail, contactez les propriétaires ou administrateurs de l'espace de travail, qui en est le responsable du traitement. Nous transmettrons à cet espace de travail les demandes que nous recevons et l'assisterons en qualité de sous-traitant.",
        ],
      },
      {
        id: "lgpd",
        heading: "12. Vos droits au titre de la LGPD",
        blocks: [
          "Si vous vous trouvez au Brésil, la Lei Geral de Proteção de Dados vous confère les droits correspondants : confirmation de l'existence d'un traitement, accès, correction, anonymisation, blocage ou suppression, portabilité, information sur le partage et retrait du consentement. Les demandes passent par les mêmes canaux qu'à la section 11, et vous pouvez saisir l'ANPD. Notre équipe chargée de la confidentialité, joignable à privacy@agentes.chat, fait office de point de contact (encarregado).",
        ],
      },
      {
        id: "dpa",
        heading: "13. Avenant relatif au traitement des données",
        blocks: [
          "Un DPA couvrant notre traitement du Contenu de l'Espace de travail, comprenant les clauses contractuelles types et les stipulations relatives au traitement au titre de la LGPD, est disponible pour tout espace de travail. Demandez-le à legal@agentes.chat.",
        ],
      },
      {
        id: "cookies",
        heading: "14. Cookies et stockage local",
        blocks: [
          "L'espace de travail utilise uniquement les cookies et le stockage local nécessaires pour maintenir votre connexion, protéger les formulaires et mémoriser des préférences telles que le thème et la langue. Le site public agentes.chat mémorise la langue que vous avez choisie et utilise les statistiques Himetrica (section 2). Nous n'utilisons pas de cookies publicitaires ni de cookies de suivi intersites.",
        ],
      },
      {
        id: "children",
        heading: "15. Enfants",
        blocks: [
          "Le Service est un outil de travail destiné aux adultes. Il ne s'adresse pas aux personnes de moins de 18 ans, et nous ne collectons pas sciemment leurs données à caractère personnel. Si vous pensez qu'un mineur nous a fourni des données à caractère personnel, écrivez à privacy@agentes.chat et nous les supprimerons.",
        ],
      },
      {
        id: "changes",
        heading: "16. Modifications de la présente politique",
        blocks: [
          "Nous pouvons mettre à jour la présente politique. Les modifications substantielles seront annoncées par e-mail ou dans l'application avant leur entrée en vigueur. La version en vigueur figure toujours sur cette page. En cas de divergence entre une traduction et la version anglaise, la version anglaise prévaut, sauf disposition légale contraire.",
        ],
      },
      {
        id: "contact",
        heading: "17. Contact",
        blocks: [
          "CODARI GLOBAL, LLC, exerçant sous le nom agentes.chat. Notifications : 7345 W Sand Lake Rd Ste 210, Office 4592, Orlando, FL 32819, USA · privacy@agentes.chat. Les demandes relatives à la protection des données provenant de l'UE, du Royaume-Uni et du Brésil parviennent à notre équipe chargée de la confidentialité à la même adresse. Pour toute autre question, écrivez à hello@agentes.chat.",
        ],
      },
    ],
  },
};
