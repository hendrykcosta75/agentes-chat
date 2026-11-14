import type { LegalDocument, LegalKind } from "./types";

/** Terms and Privacy in nl, each with its `courtesy` notice: a page not here shows in English. */
export const legalNl: Partial<Record<LegalKind, LegalDocument>> = {
  terms: {
    title: "Gebruiksvoorwaarden",
    summary:
      "De overeenkomst voor het gebruik van agentes.chat: uw werkruimte, uw agents en waarvoor elke partij verantwoordelijk is.",
    courtesy:
      "Dit is een vertaling die uitsluitend ter informatie wordt verstrekt. Indien deze afwijkt van de Engelse versie, prevaleert de Engelse versie.",
    updated: "2026-11-13",
    sections: [
      {
        id: "agreement",
        heading: "1. Overeenkomst",
        blocks: [
          'Deze Gebruiksvoorwaarden (de "Voorwaarden") vormen een bindende overeenkomst tussen CODARI GLOBAL, LLC, een limited liability company naar het recht van Wyoming die handelt onder de naam agentes.chat ("agentes.chat", "wij", "ons"), en de persoon of entiteit die een account of een werkruimte aanmaakt ("u"). Door een account aan te maken, lid te worden van een werkruimte of agentes.chat anderszins te gebruiken via het web, de Mac-app of de telefoonapp (de "Dienst"), aanvaardt u deze Voorwaarden en ons Privacybeleid. Indien u de Dienst gebruikt namens een bedrijf of andere entiteit, verklaart u bevoegd te zijn deze te binden.',
          "Om de Dienst te gebruiken, moet u ten minste 18 jaar oud zijn en bevoegd zijn een overeenkomst aan te gaan.",
        ],
      },
      {
        id: "service",
        heading: "2. De Dienst",
        blocks: [
          "De Dienst is een werkruimte waarin mensen en AI-agents samenwerken. Deze omvat kanalen, threads en directe berichten, en agents met hun eigen rollen, instructies, geheugen en budgetten. Daarnaast omvat deze taken, wiki, Drive, agenda en routines, goedkeuringen, connectoren met andere diensten en de mogelijkheid om computers te koppelen waarop agents kunnen werken.",
          "De Dienst is nieuw en nog in ontwikkeling: functies kunnen worden gewijzigd, beperkt of verwijderd. Wij kunnen nieuwe accounts gedurende een bepaalde tijd uitsluitend op uitnodiging openstellen, of voor iedereen die zich aanmeldt. Voordat wij iets verwijderen waarop u vertrouwt, stellen wij u daarvan vooraf op de hoogte, voor zover redelijkerwijs mogelijk.",
        ],
      },
      {
        id: "accounts",
        heading: "3. Accounts en werkruimten",
        blocks: [
          "U bent verantwoordelijk voor de juistheid van uw accountgegevens, voor de beveiliging van uw inloggegevens en voor alle activiteiten onder uw account. De eigenaren en beheerders van een werkruimte bepalen wie er lid van wordt, welke rollen zij hebben, welke agents er bestaan en wat die agents mogen doen. Waar deze Voorwaarden bepalen dat een werkruimte iets bezit, beslist of ergens voor instaat, wordt daarmee bedoeld de persoon of entiteit die de werkruimte heeft aangemaakt, of namens wie deze is aangemaakt, handelend via de eigenaren en beheerders ervan. Meld het ons onverwijld via security@agentes.chat indien u vermoedt dat een account, een sleutel of een gekoppelde computer is gecompromitteerd.",
        ],
      },
      {
        id: "agents",
        heading: "4. Agents en wat zij doen",
        blocks: [
          "Agents handelen op basis van de instructies, machtigingen, connectoren, budgetten en computers die u en uw werkruimte hun geven. Wat een agent binnen die machtigingen doet, met inbegrip van de berichten die hij verstuurt, de code die hij wijzigt, de gegevens die hij leest, schrijft of verwijdert en de opdrachten die hij op een computer uitvoert, geschiedt namens uw werkruimte, en uw werkruimte is daarvoor op grond van deze Voorwaarden verantwoordelijk. Voor elke agent is een persoon verantwoordelijk.",
          "Handelingen die moeilijk ongedaan te maken zijn, worden een goedkeuringsverzoek aan een persoon voordat zij plaatsvinden. Het goedkeuren daarvan is uw beslissing. De Dienst toont wat er zal gebeuren, maar u bent verantwoordelijk voor de beoordeling daarvan.",
          "AI-uitvoer kan onjuist, onvolledig of verouderd zijn, ook wanneer deze overtuigend klinkt. Controleer wat agents produceren voordat u erop vertrouwt, en gebruik het niet als vervanging van professioneel advies (juridisch, medisch, financieel of anderszins) of als enige grondslag voor beslissingen met rechtsgevolgen of vergelijkbaar ingrijpende gevolgen voor personen.",
        ],
      },
      {
        id: "acceptable-use",
        heading: "5. Aanvaardbaar gebruik",
        blocks: [
          "U verbindt zich ertoe de Dienst niet te gebruiken, en niet toe te staan dat agents worden gebruikt, om:",
          {
            list: [
              "de wet te overtreden, inbreuk te maken op rechten van anderen of persoonsgegevens te verwerken zonder rechtmatige grondslag",
              "spam of ongevraagde berichten te verzenden, of iemand te intimideren, te bedreigen, te misleiden of zich als iemand anders voor te doen",
              "malware, phishing of inhoud te maken of te verspreiden die minderjarigen seksualiseert, geweld bevordert of anderszins onrechtmatig is",
              "de limieten en waarborgen van de Dienst te omzeilen, zoals budgetten, snelheidslimieten, goedkeuringen, machtigingen of de controles op gekoppelde computers en databases",
              "de Dienst aan te vallen of via de Dienst anderen aan te vallen, met inbegrip van het zoeken naar kwetsbaarheden, het overbelasten ervan of het plaatsen van instructies die bedoeld zijn om de agents van anderen over te nemen",
              "toegang te verkrijgen tot een dienst, computer of gegevens die u niet bevoegd bent te gebruiken, of een gekoppelde dienst in strijd met diens eigen voorwaarden te gebruiken",
              "het gebruiksbeleid te schenden van de aanbieders van AI-modellen waarop uw agents draaien.",
            ],
          },
          "Wij kunnen een agent, een connector of een account opschorten, met voorafgaande kennisgeving voor zover redelijkerwijs mogelijk, wanneer activiteiten de beveiliging, integriteit of rechtmatige werking van de Dienst of van anderen bedreigen.",
        ],
      },
      {
        id: "content",
        heading: "6. Uw inhoud",
        blocks: [
          '"Werkruimte-inhoud" betekent wat u en de andere personen in uw werkruimte in de Dienst invoeren en wat uw agents daarin produceren. Uw werkruimte is eigenaar van haar Werkruimte-inhoud, en in de verhouding tussen u en ons is de uitvoer die agents voor u produceren van u, onder voorbehoud van de voorwaarden van de modelaanbieder die deze heeft geproduceerd. Uitvoer kan vergelijkbaar zijn met wat dezelfde modellen voor anderen produceren.',
          "U verleent ons de beperkte rechten die nodig zijn om de Dienst te exploiteren: het opslaan, verwerken, verzenden en weergeven van Werkruimte-inhoud om uw werkruimte en agents te laten functioneren, het verzenden ervan naar de aanbieders die uw agents gebruiken zoals beschreven in het Privacybeleid, en het verlenen van ondersteuning. Wij verkopen Werkruimte-inhoud niet en gebruiken deze niet om machinelearningmodellen te trainen.",
          "Uw werkruimte is de verwerkingsverantwoordelijke voor de persoonsgegevens in haar Werkruimte-inhoud, en wij verwerken die gegevens als verwerker volgens haar instructies, zoals beschreven in het Privacybeleid en de Verwerkersovereenkomst (Data Processing Addendum).",
        ],
      },
      {
        id: "third-parties",
        heading: "7. Modelaanbieders, connectoren en uw eigen accounts",
        blocks: [
          "Agents draaien op AI-modellen van derden (zoals Anthropic, de maker van Claude, en OpenAI), via een API-sleutel die uw werkruimte toevoegt of een AI-abonnement, zoals Claude of ChatGPT, dat iemand in uw werkruimte koppelt. Het gebruik van die sleutel of dat abonnement valt tevens onder uw overeenkomst met de betreffende aanbieder, en u bent verantwoordelijk voor de naleving van diens voorwaarden en voor diens kosten.",
          "Connectoren geven agents toegang tot andere diensten (zoals GitHub, Google, Linear, Sentry of een e-mailinbox). Die diensten worden door derden onder hun eigen voorwaarden aangeboden. Hun beschikbaarheid en wat zij met gegevens doen, vallen buiten onze invloed.",
        ],
      },
      {
        id: "computers",
        heading: "8. Gekoppelde computers",
        blocks: [
          "Indien u een computer koppelt, installeert u software waarmee agents opdrachten kunnen uitvoeren en een browser kunnen gebruiken op die computer, binnen de mappen en machtigingen die u op die computer instelt. U bent verantwoordelijk voor de computer, voor wat u daar toestaat en voor het maken van back-ups van wat belangrijk is. Machtigingen kunnen uitsluitend op de computer zelf worden uitgebreid, en u kunt de koppeling op elk moment verbreken.",
        ],
      },
      {
        id: "data-protection",
        heading: "9. Gegevensbescherming",
        blocks: [
          "Waar de AVG (GDPR), de UK GDPR of de LGPD van toepassing is op persoonsgegevens in uw Werkruimte-inhoud, zal elke partij haar verplichtingen op grond van die wet nakomen. Een Verwerkersovereenkomst (Data Processing Addendum, DPA) waarin de modelcontractbepalingen (Standard Contractual Clauses) van de Europese Commissie en gelijkwaardige LGPD-bepalingen zijn opgenomen, is beschikbaar en maakt, zodra deze is ondertekend, deel uit van deze Voorwaarden. Vraag deze aan via legal@agentes.chat.",
        ],
      },
      {
        id: "fees",
        heading: "10. Abonnementen, betalingen en redelijk gebruik",
        blocks: [
          "Elke werkruimte betaalt voor haar eigen agentes.chat-abonnement. De volgende regels gelden voor elk abonnement:",
          {
            list: [
              "**Prijzen.** De abonnementen en hun prijzen staan op onze prijzenpagina. Prijzen zijn in Amerikaanse dollars, en belastingen worden toegevoegd waar deze van toepassing zijn. Uw bank of betaaldienstaanbieder kan eigen kosten in rekening brengen voor aankopen in het buitenland, zoals de IOF in Brazilië.",
              "**Verlenging.** Een abonnement wordt automatisch elke maand of elk jaar verlengd, afhankelijk van de gekozen periode, totdat het wordt opgezegd. Wij sturen een herinnering voordat een jaarabonnement wordt verlengd.",
              "**Opzegging.** U kunt op elk moment opzeggen, en de opzegging gaat in aan het einde van de reeds betaalde periode. Daarna stoppen de agents van de werkruimte, wordt haar computer 7 dagen later gewist, en blijven haar gesprekken en bestanden 90 dagen beschikbaar om te lezen en te downloaden, waarna zij worden verwijderd.",
              "**Geen terugbetalingen.** Betalingen zijn definitief en worden niet, geheel noch gedeeltelijk, terugbetaald, ook niet voor het resterende deel van een periode na een opzegging, behalve waar de wet anders voorschrijft.",
              "**Mislukte betalingen.** Indien een betaling mislukt, proberen wij het in de daaropvolgende dagen opnieuw. Mislukt deze dan nog steeds, dan wordt de werkruimte gepauzeerd: haar agents stoppen, en mensen kunnen er nog steeds in lezen en schrijven. Haar computer wordt 7 dagen bewaard en daarna vrijgegeven en gewist. Na betaling wordt de werkruimte hersteld, op een nieuwe computer indien de oude is vrijgegeven.",
              "**Prijswijzigingen.** Wij kunnen de prijzen voor nieuwe klanten op elk moment wijzigen. De prijs van een abonnement dat u al heeft, wijzigt uitsluitend als gevolg van nieuwe belastingen, met ingang van de eerstvolgende verlenging, met een kennisgeving van ten minste 30 dagen.",
              "**Redelijk gebruik.** Sommige functies draaien op AI-diensten die wij zonder extra kosten leveren, zoals het kiezen welke agent antwoordt, het beoordelen van herinneringen en handelingen, en het vinden van waar op een scherm moet worden geklikt. Wij kunnen deze beperken voor een werkruimte waarvan het gebruik ver boven het normale ligt.",
              "**Budgetten.** Budgetten die per werkruimte en per agent zijn ingesteld, stoppen het modelgebruik van agents wanneer zij zijn bereikt. Zij maken deel uit van de Dienst en vormen geen gebrek daarvan. Kosten die een aanbieder in rekening brengt voor uw eigen sleutel of AI-abonnement, zijn een zaak tussen u en die aanbieder.",
            ],
          },
        ],
      },
      {
        id: "ip",
        heading: "11. Intellectuele eigendom en feedback",
        blocks: [
          "Met uitzondering van uw Werkruimte-inhoud behouden wij en onze licentiegevers alle rechten, aanspraken en belangen in de Dienst, met inbegrip van de software, het ontwerp en de naam en merken agentes.chat. Feedback die u ons vrijwillig toestuurt, mag worden gebruikt zonder enige verplichting jegens u.",
        ],
      },
      {
        id: "termination",
        heading: "12. Duur en beëindiging",
        blocks: [
          "U kunt op elk moment stoppen met het gebruik van de Dienst en uw account in de app verwijderen. Het wordt 7 dagen later verwijderd, en u kunt het tot die tijd herstellen. Wij kunnen uw toegang opschorten of beëindigen bij een wezenlijke schending van deze Voorwaarden, waar de wet dit vereist, of met een kennisgeving van 30 dagen indien wij de Dienst stopzetten. Wanneer wij de Dienst beëindigen om andere redenen dan uw schending, stellen wij uw Werkruimte-inhoud gedurende 30 dagen beschikbaar voor export en verwijderen wij deze daarna zoals beschreven in het Privacybeleid. Bepalingen die naar hun aard de beëindiging overleven (waaronder de artikelen 6, 9, 11, 13, 14 en 15), blijven van kracht.",
        ],
      },
      {
        id: "disclaimers",
        heading: "13. Uitsluiting van garanties",
        blocks: [
          'De Dienst, met inbegrip van alles wat agents produceren en doen, wordt geleverd "in de huidige staat" ("as is") en "zoals beschikbaar" ("as available"). Wij garanderen niet dat de Dienst of de agents ononderbroken, foutloos of nauwkeurig zullen zijn of geschikt voor uw doeleinden. Voor zover maximaal toegestaan door de wet sluiten wij alle stilzwijgende garanties uit, met inbegrip van verkoopbaarheid, geschiktheid voor een bepaald doel en het niet inbreuk maken op rechten van derden.',
        ],
      },
      {
        id: "liability",
        heading: "14. Beperking van aansprakelijkheid",
        blocks: [
          "Voor zover maximaal toegestaan door de wet: geen van de partijen is aansprakelijk voor indirecte, incidentele of bijzondere schade, gevolgschade of punitieve schadevergoeding, of voor gederfde winst, omzet of verloren gegevens. In dezelfde mate is onze totale aansprakelijkheid voortvloeiend uit de Dienst beperkt tot de bedragen die u ons hebt betaald in de twaalf maanden voorafgaand aan de gebeurtenis die tot de vordering heeft geleid (of USD 100 indien u niets hebt betaald). Deze beperkingen gelden niet voor uw betalingsverplichtingen, uw schending van artikel 5 of aansprakelijkheid die wettelijk niet kan worden beperkt.",
        ],
      },
      {
        id: "indemnification",
        heading: "15. Vrijwaring",
        blocks: [
          "U zult ons verdedigen tegen en vrijwaren voor vorderingen van derden die voortvloeien uit uw Werkruimte-inhoud, uit wat uw agents hebben gedaan binnen de machtigingen die u hun hebt gegeven, of uit uw schending van artikel 5.",
        ],
      },
      {
        id: "law",
        heading: "16. Toepasselijk recht",
        blocks: [
          "Op deze Voorwaarden is het recht van de staat Wyoming, VS, van toepassing, met uitsluiting van de conflictregels daarvan, en de partijen onderwerpen zich aan de exclusieve bevoegdheid van de staats- en federale rechtbanken in Wyoming. Indien u een consument bent in een rechtsgebied waarvan het recht u rechten of een bevoegde rechter toekent waarvan niet kan worden afgeweken, zoals Brazilië, blijven die rechten onverlet.",
        ],
      },
      {
        id: "changes",
        heading: "17. Wijzigingen van deze Voorwaarden",
        blocks: [
          "Wij kunnen deze Voorwaarden bijwerken. Wezenlijke wijzigingen worden ten minste 14 dagen voordat zij in werking treden per e-mail of in de app aangekondigd. Voortgezet gebruik na de ingangsdatum geldt als aanvaarding. De actuele versie staat altijd op deze pagina. Indien een vertaling afwijkt van de Engelse versie, prevaleert de Engelse versie, behalve waar de wet anders voorschrijft.",
        ],
      },
      {
        id: "contact",
        heading: "18. Contact",
        blocks: [
          "CODARI GLOBAL, LLC, handelend onder de naam agentes.chat. Kennisgevingen: 7345 W Sand Lake Rd Ste 210, Office 4592, Orlando, FL 32819, USA · legal@agentes.chat · Al het overige: hello@agentes.chat",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacybeleid",
    summary: "Wat wij verzamelen, wat agents waarheen sturen, wie uw werkruimte kan zien en welke rechten u hebt.",
    courtesy:
      "Dit is een vertaling die uitsluitend ter informatie wordt verstrekt. Indien deze afwijkt van de Engelse versie, prevaleert de Engelse versie.",
    updated: "2026-11-13",
    sections: [
      {
        id: "overview",
        heading: "1. Overzicht",
        blocks: [
          'CODARI GLOBAL, LLC, een limited liability company naar het recht van Wyoming die handelt onder de naam agentes.chat ("agentes.chat", "wij"), exploiteert agentes.chat: een werkruimte waarin mensen en AI-agents samenwerken, beschikbaar via het web, als Mac-app en als telefoonapp (de "Dienst"). Dit beleid onderscheidt twee rollen:',
          {
            list: [
              "Voor **accountgegevens**, de informatie die personen ons verstrekken om een account aan te maken en te gebruiken, zijn wij de verwerkingsverantwoordelijke.",
              "Voor **Werkruimte-inhoud**, alles wat de personen en agents van een werkruimte daarin invoeren of daarin produceren, zijn wij een verwerker die handelt volgens de instructies van de werkruimte. De werkruimte is de verwerkingsverantwoordelijke, dat wil zeggen de persoon of entiteit die de werkruimte heeft aangemaakt of namens wie deze is aangemaakt.",
            ],
          },
        ],
      },
      {
        id: "data-we-collect",
        heading: "2. Gegevens die wij als verwerkingsverantwoordelijke verzamelen",
        blocks: [
          {
            list: [
              "**Accountgegevens:** naam, e-mailadres, wachtwoordhash, profielfoto, taal en tijdzone. Indien u zich aanmeldt met Google, Apple of GitHub, ontvangen wij van die aanbieder uw naam, e-mailadres en de accountidentificatie, nooit het wachtwoord.",
              "**Werkruimtegegevens:** de naam, leden, rollen en uitnodigingen van de werkruimte.",
              "**Factuurgegevens:** voor een werkruimte met een agentes.chat-abonnement de naam, het e-mailadres, het factuuradres en het fiscaal identificatienummer van de persoon die betaalt, het abonnement en de bijbehorende facturen en betalingen. Betalingen worden verwerkt door Stripe, dat de kaartgegevens verwerkt: deze bereiken ons nooit.",
              "**Gebruiks- en loggegevens:** IP-adressen, browser en apparaat, aanmeldsessies, beveiligingsgebeurtenissen, API-verzoeken en de registratie van elke modelaanroep (model, tokens en kosten, met de werkruimte en de agent waartoe deze behoort), die wij bewaren om budgetten te handhaven en het gebruik te tonen. Wanneer er iets misgaat, registreren wij de fout, zonder berichtinhoud, om deze te verhelpen.",
              "**Apparaten:** voor de telefoonapp het pushmeldingstoken van elk apparaat waarop u zich aanmeldt. Voor gekoppelde computers en de Mac-app de naam, het besturingssysteem en de appversie van de computer.",
              "**Wachtlijst:** het e-mailadres en de taal die u ons op agentes.chat opgeeft, en of u het adres hebt bevestigd.",
              "**Websiteanalyse:** op agentes.chat (de openbare website, niet de werkruimte) de bekeken pagina's, de verwijzende website, het type apparaat en een bij benadering bepaalde locatie afgeleid van het IP-adres, verzameld met Himetrica.",
            ],
          },
        ],
      },
      {
        id: "how-we-use",
        heading: "3. Hoe wij accountgegevens gebruiken",
        blocks: [
          "Om de Dienst te leveren en te beveiligen (met inbegrip van het opsporen en stoppen van misbruik), abonnementen te factureren, budgetten en limieten toe te passen, op ondersteuningsverzoeken te reageren, aan wettelijke verplichtingen te voldoen en dienstberichten te versturen, zoals e-mailbevestigingen, uitnodigingen, wachtwoordherstel, goedkeuringsverzoeken en meldingen die u hebt ingeschakeld. Wij e-mailen de wachtlijst uitsluitend om het adres te bevestigen en om u uit te nodigen.",
          "Wij verkopen geen persoonsgegevens, gebruiken Werkruimte-inhoud niet om machinelearningmodellen te trainen en staan onze subverwerkers niet toe dat te doen.",
        ],
      },
      {
        id: "workspace-content",
        heading: "4. Werkruimte-inhoud, verwerkt namens werkruimten",
        blocks: [
          "Werkruimte-inhoud omvat berichten in kanalen, threads en directe berichten, bestanden in de Drive en wikipagina's. Daarnaast omvat deze taken, routines, agenda-items en goedkeuringen, de instructies, instellingen en het geheugen van agents, wat agents schrijven en doen, en de gegevens die agents lezen via de connectoren, databases en computers die de werkruimte koppelt. Wij verwerken deze uitsluitend om de werkruimte en haar agents te laten functioneren zoals de werkruimte die configureert, om deze te tonen aan de leden van de werkruimte, om de meldingen te versturen waarom zij vragen, en om ondersteuning te verlenen.",
          "Werkruimte-inhoud behoort toe aan de werkruimte: leden zien wat de kanalen en machtigingen van de werkruimte toestaan, en de eigenaren en beheerders ervan beheren deze. Eigenaren en beheerders van de werkruimte kunnen elk kanaal, elke taak en elke wikipagina zien, ook als die privé zijn. Directe berichten tussen andere mensen kunnen ze niet lezen. Berichten die u hebt geplaatst, blijven in de werkruimte nadat u deze verlaat of uw account verwijdert, tenzij de werkruimte ze verwijdert.",
        ],
      },
      {
        id: "agents",
        heading: "5. Hoe agents Werkruimte-inhoud verwerken",
        blocks: [
          "Agents zijn AI-modellen die binnen de werkruimte lezen en handelen. Werkruimte-inhoud verlaat onze servers in de volgende gevallen, en uitsluitend in die gevallen:",
          {
            list: [
              "**Tussen apparaten en onze servers.** Alles wat tussen onze servers en de browsers, apps en computers die daarmee verbinding maken wordt verzonden, Werkruimte-inhoud inbegrepen, gaat via onze netwerkaanbieder, die de Dienst tegen aanvallen beschermt. Daartoe ontsleutelt de netwerkaanbieder dit verkeer in zijn datacenter dat het dichtst bij elk apparaat ligt, en verwerkt hij dit namens ons.",
              "**Antwoorden.** Wanneer een agent werkt, stuurt hij de context die hij nodig heeft (de context van de werkruimte, de instructies van de agent, het gesprek, relevant geheugen en de resultaten van zijn tools) naar de modelaanbieder die voor die agent is gekozen. Met een API-sleutel die de werkruimte heeft toegevoegd, wordt de aanroep gedaan onder het eigen account van de werkruimte en haar eigen overeenkomst met die aanbieder. Met een AI-abonnement, zoals Claude of ChatGPT, dat aan een agent is gekoppeld, werkt de agent onder het account van de persoon die het abonnement heeft gekoppeld en onder de voorwaarden van de aanbieder.",
              "**Bepalen wie antwoordt.** Een routeringsmodel leest een nieuw bericht, de namen en rollen van de agents van de werkruimte en het recente gesprek om te bepalen welke agent, indien van toepassing, moet antwoorden. Het draait bij TypeSafe of, als terugvaloptie, bij de modelaanbieder van de werkruimte. Routering verleent een agent nooit enige machtiging.",
              "**Geheugen.** Agents bewaren geheugen uit gesprekken (samenvattingen, feiten en lessen) zodat zij in de loop van de tijd beter worden. Sommige oordelen over het geheugen (of iets het bewaren waard is, of strijdig is met wat een agent al weet) worden door TypeSafe gemaakt. Het geheugen kan op de pagina van de agent worden bekeken en verwijderd, en wordt samen met de werkruimte verwijderd.",
              "**Zoeken.** Om verwante berichten en documenten te vinden, kan tekst door Voyage AI worden omgezet in vectoren (embeddings).",
              "**Connectoren.** Wanneer de werkruimte een dienst koppelt (zoals GitHub, Google, Linear, Sentry, een e-mailinbox of een MCP-server), slaan wij de toegangstokens daarvan versleuteld op en lezen of schrijven wij in die dienst uitsluitend binnen de bereiken (scopes) die de werkruimte aan elke agent heeft gegeven. De gekoppelde dienst verwerkt die gegevens onder zijn eigen voorwaarden. Koppelingen met Gmail- en Outlook-inboxen, en met Google Drive, Google Calendar, Google Sheets, Google Docs, Slack, Microsoft Teams, OneDrive, HubSpot, Salesforce, Zendesk, Asana, Figma, Intercom, Dropbox, Square, Instagram, Facebook, LinkedIn, YouTube, Pinterest, Reddit en WhatsApp, lopen via Composio, dat verwerkt wat agents daar lezen en schrijven.",
              "**Databases.** Databaseverbindingen zijn alleen-lezen. Inloggegevens worden versleuteld opgeslagen en elke query wordt gecontroleerd voordat deze wordt uitgevoerd.",
              "**Gekoppelde computers.** Wanneer iemand een computer koppelt, kunnen agents daar opdrachten uitvoeren en een browser gebruiken, binnen de mappen en machtigingen die op die computer zijn ingesteld. De live weergave van de browser van een agent gaat via onze netwerkaanbieder en via het geheugen van onze servers, en wordt niet opgenomen. Een samenvatting van de stappen die de agent heeft gezet (zoals bezochte adressen en handelingen) wordt bij zijn werk bewaard, zodat het team kan zien wat hij heeft gedaan.",
              "**De computer van de werkruimte.** Op agentes.chat Cloud werken de agents van een werkruimte op een computer die wij voor die werkruimte beheren, op onze servers of die van een hostingaanbieder, in de Europese Unie of de Verenigde Staten. Wij meten per dag hoeveel gegevens de browser, de AI-tools en andere programma's van elke agent daar verzenden en ontvangen. De computer wordt gewist nadat het agentes.chat-abonnement van de werkruimte is beëindigd, zoals beschreven in de Gebruiksvoorwaarden.",
            ],
          },
          "Handelingen die moeilijk ongedaan te maken zijn (zoals het samenvoegen van code, het uitrollen of het verzenden namens iemand), worden een goedkeuringsverzoek aan een persoon voordat zij plaatsvinden. Tekst die van buiten de werkruimte afkomstig is (webpagina's, e-mails, bestanden), wordt als onbetrouwbaar gemarkeerd voordat een agent deze leest.",
        ],
      },
      {
        id: "staff-access",
        heading: "6. Wanneer medewerkers van agentes.chat Werkruimte-inhoud kunnen zien",
        blocks: [
          "Wij kijken niet zomaar rond in werkruimten. Een persoon bij agentes.chat kan Werkruimte-inhoud uitsluitend zien:",
          {
            list: [
              "**Op uw verzoek,** om te helpen bij een ondersteuningsverzoek, en alleen voor zover het verzoek dat vereist.",
              "**Ten behoeve van vertrouwen en veiligheid,** om vermoedelijk misbruik, fraude, onrechtmatige inhoud of een bedreiging van de beveiliging van de Dienst te onderzoeken, of om onze Gebruiksvoorwaarden te handhaven.",
              "**Wanneer de wet dit vereist.**",
            ],
          },
          "De personen die onze infrastructuur beheren, hebben toegang tot de servers en databases waarin Werkruimte-inhoud is opgeslagen. Zij gebruiken die toegang uitsluitend om de Dienst draaiende te houden, zoals het opsporen van storingen en het terugzetten van back-ups, of om aan een wettelijke verplichting te voldoen. Geen van deze wegen wordt gebruikt voor het opstellen van profielen, voor advertenties of voor trainingsgegevens.",
        ],
      },
      {
        id: "retention",
        heading: "7. Bewaring",
        blocks: [
          {
            list: [
              "**Accountgegevens:** gedurende het bestaan van het account. Wanneer u uw account in de app verwijdert, wordt het onmiddellijk overal uitgelogd en 7 dagen later verwijderd, tenzij u het daarvoor herstelt, en verdwijnt het daarna binnen 30 dagen uit onze back-ups, met uitzondering van gegevens die wij wettelijk moeten bewaren. Elke werkruimte waarvan u het enige lid was, wordt tegelijkertijd gesloten, en de inhoud daarvan wordt 7 dagen later verwijderd zoals hierna beschreven. De werkruimten waarvan u lid was, behouden uw naam en e-mailadres in hun auditlogs zolang elk daarvan bestaat.",
              "**Werkruimte-inhoud:** gedurende het bestaan van de werkruimte, en eerder wanneer de werkruimte specifieke inhoud verwijdert. Wanneer het agentes.chat-abonnement van een werkruimte eindigt, blijft de inhoud ervan 90 dagen beschikbaar en wordt deze daarna verwijderd. Wanneer een eigenaar een werkruimte verwijdert, wordt deze onmiddellijk voor iedereen gesloten en wordt de inhoud 7 dagen later verwijderd, tenzij een eigenaar de werkruimte vóór die tijd herstelt, en verdwijnt deze binnen 30 dagen daarna uit onze back-ups, met uitzondering van inhoud die wij wettelijk of als registratie van misbruik (hieronder) moeten bewaren.",
              "**Logs:** verzoek- en beveiligingslogs gedurende maximaal 90 dagen. Registraties van modelgebruik (tokens en kosten) gedurende het bestaan van de werkruimte, omdat budgetten en gebruiksrapporten daarvan afhankelijk zijn.",
              "**Factuurgegevens:** zolang u voor een werkruimte betaalt, en daarna zolang de fiscale en boekhoudkundige wetgeving dat vereist.",
              "**Wachtlijst:** totdat u wordt uitgenodigd en gedurende 12 maanden daarna, of totdat u ons vraagt u te verwijderen.",
              "**Accounts die wij wegens misbruik opschorten of sluiten:** wij kunnen de gegevens van het account en van het misbruik langer dan deze termijnen bewaren, ook nadat om verwijdering is verzocht, zolang dat nodig is voor de vaststelling, uitoefening of verdediging van rechtsvorderingen, om aan wettelijke verplichtingen te voldoen en om te voorkomen dat dezelfde personen de Dienst opnieuw misbruiken, op grond van artikel 17, lid 3, onder b) en e), en artikel 6, lid 1, onder f), van de AVG en de artikelen 7(VI), 7(IX) en 16(I) van de LGPD.",
            ],
          },
        ],
      },
      {
        id: "security",
        heading: "8. Beveiliging",
        blocks: [
          "Gegevens worden versleuteld tijdens de overdracht (TLS) en in rust. Sleutels van modelaanbieders, tokens van connectoren en inloggegevens van databases worden bovendien versleuteld met envelopversleuteling per werkruimte en worden nooit teruggestuurd naar de browser of de apps. De toegang tot productiesystemen is beperkt en wordt gelogd. Indien wij kennis krijgen van een inbreuk in verband met persoonsgegevens, stellen wij de betrokken werkruimten daarvan zonder onredelijke vertraging en binnen de termijnen die de AVG en de LGPD voorschrijven in kennis.",
        ],
      },
      {
        id: "transfers",
        heading: "9. Internationale doorgiften",
        blocks: [
          "Onze applicatie en de bijbehorende database draaien in de Verenigde Staten, en de in dit beleid genoemde aanbieders verwerken gegevens in de Verenigde Staten. De computers van de werkruimten draaien in de Europese Unie of de Verenigde Staten, en onze netwerkaanbieder verwerkt verkeer in zijn datacenter dat het dichtst bij elk apparaat ligt, in de Verenigde Staten of elders. Wanneer persoonsgegevens die onder de AVG of de UK GDPR vallen naar een derde land worden doorgegeven, baseren wij ons op de modelcontractbepalingen (Standard Contractual Clauses) van de Europese Commissie en het UK Addendum. Voor gegevens die onder de LGPD vallen, baseren wij ons op de contractuele waarborgen van artikel 33.",
        ],
      },
      {
        id: "apps",
        heading: "10. Telefoon- en Mac-apps",
        blocks: [
          "De telefoonapp verstuurt meldingen via Apple en Google. Een melding kan de naam tonen van degene die heeft geschreven en het begin van het bericht, en u kiest welke meldingen u ontvangt. De Mac-app en gekoppelde computers bewaren hun aanmelding op het apparaat. Het verwijderen van uw account (ook mogelijk in de apps) meldt elk apparaat af.",
        ],
      },
      {
        id: "gdpr",
        heading: "11. Uw rechten op grond van de AVG (GDPR)",
        blocks: [
          "Indien u zich in de EER of het Verenigd Koninkrijk bevindt, kunt u verzoeken om inzage, rectificatie, wissing, beperking van de verwerking en overdraagbaarheid, en bezwaar maken tegen de verwerking, en kunt u een klacht indienen bij uw toezichthoudende autoriteit. Neem voor accountgegevens rechtstreeks contact met ons op. U kunt uw profiel ook zelf corrigeren en uw account zelf verwijderen in de app. Neem voor persoonsgegevens in Werkruimte-inhoud contact op met de eigenaren of beheerders van de werkruimte, die daarvoor verwerkingsverantwoordelijke is. Verzoeken die wij ontvangen, verwijzen wij door naar die werkruimte, en wij staan haar als verwerker bij.",
        ],
      },
      {
        id: "lgpd",
        heading: "12. Uw rechten op grond van de LGPD",
        blocks: [
          "Indien u zich in Brazilië bevindt, kent de Lei Geral de Proteção de Dados u de overeenkomstige rechten toe: bevestiging van de verwerking, inzage, correctie, anonimisering, blokkering of verwijdering, overdraagbaarheid, informatie over het delen van gegevens en intrekking van toestemming. Verzoeken verlopen via dezelfde kanalen als in artikel 11, en u kunt een verzoekschrift indienen bij de ANPD. Ons privacyteam, bereikbaar via privacy@agentes.chat, treedt op als ons contactpunt (encarregado).",
        ],
      },
      {
        id: "dpa",
        heading: "13. Verwerkersovereenkomst (Data Processing Addendum)",
        blocks: [
          "Een DPA voor onze verwerking van Werkruimte-inhoud, met inbegrip van de modelcontractbepalingen (Standard Contractual Clauses) en de LGPD-verwerkingsbepalingen, is beschikbaar voor elke werkruimte. Vraag deze aan via legal@agentes.chat.",
        ],
      },
      {
        id: "cookies",
        heading: "14. Cookies en lokale opslag",
        blocks: [
          "De werkruimte gebruikt uitsluitend de cookies en lokale opslag die nodig zijn om u aangemeld te houden, formulieren te beschermen en voorkeuren zoals thema en taal te onthouden. De openbare website agentes.chat onthoudt de taal die u hebt gekozen en gebruikt Himetrica-analyse (artikel 2). Wij gebruiken geen advertentiecookies of cookies voor tracking over websites heen.",
        ],
      },
      {
        id: "children",
        heading: "15. Kinderen",
        blocks: [
          "De Dienst is een werkinstrument voor volwassenen. Deze is niet gericht op personen jonger dan 18 jaar, en wij verzamelen niet bewust hun persoonsgegevens. Indien u meent dat een minderjarige ons persoonsgegevens heeft verstrekt, schrijf dan naar privacy@agentes.chat en wij zullen deze verwijderen.",
        ],
      },
      {
        id: "changes",
        heading: "16. Wijzigingen van dit beleid",
        blocks: [
          "Wij kunnen dit beleid bijwerken. Wezenlijke wijzigingen worden per e-mail of in de app aangekondigd voordat zij in werking treden. De actuele versie staat altijd op deze pagina. Indien een vertaling afwijkt van de Engelse versie, prevaleert de Engelse versie, behalve waar de wet anders voorschrijft.",
        ],
      },
      {
        id: "contact",
        heading: "17. Contact",
        blocks: [
          "CODARI GLOBAL, LLC, handelend onder de naam agentes.chat. Kennisgevingen: 7345 W Sand Lake Rd Ste 210, Office 4592, Orlando, FL 32819, USA · privacy@agentes.chat. Vragen over gegevensbescherming uit de EU, het Verenigd Koninkrijk en Brazilië bereiken ons privacyteam via hetzelfde adres. Voor al het overige kunt u schrijven naar hello@agentes.chat.",
        ],
      },
    ],
  },
};
