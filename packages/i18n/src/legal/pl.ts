import type { LegalDocument, LegalKind } from "./types";

/** Terms and Privacy in pl, each with its `courtesy` notice: a page not here shows in English. */
export const legalPl: Partial<Record<LegalKind, LegalDocument>> = {
  terms: {
    title: "Warunki korzystania",
    summary:
      "Umowa dotycząca korzystania z agentes.chat: Twój obszar roboczy, Twoi agenci oraz zakres odpowiedzialności każdej ze stron.",
    courtesy:
      "Niniejszy dokument jest tłumaczeniem grzecznościowym. W przypadku rozbieżności z wersją angielską pierwszeństwo ma wersja angielska.",
    updated: "2026-11-13",
    sections: [
      {
        id: "agreement",
        heading: "1. Umowa",
        blocks: [
          "Niniejsze Warunki korzystania („Warunki”) stanowią wiążącą umowę między CODARI GLOBAL, LLC, spółką z ograniczoną odpowiedzialnością (limited liability company) z siedzibą w stanie Wyoming, prowadzącą działalność pod nazwą agentes.chat („agentes.chat”, „my”, „nas”), a osobą lub podmiotem, który zakłada konto lub obszar roboczy („Ty”). Zakładając konto, dołączając do obszaru roboczego lub w inny sposób korzystając z agentes.chat w przeglądarce, w aplikacji na komputery Mac lub w aplikacji na telefon („Usługa”), akceptujesz niniejsze Warunki oraz naszą Politykę prywatności. Jeżeli korzystasz z Usługi w imieniu spółki lub innego podmiotu, oświadczasz, że jesteś umocowany do zaciągania w jego imieniu zobowiązań.",
          "Aby korzystać z Usługi, musisz mieć ukończone co najmniej 18 lat i posiadać zdolność do zawarcia umowy.",
        ],
      },
      {
        id: "service",
        heading: "2. Usługa",
        blocks: [
          "Usługa to obszar roboczy, w którym ludzie i agenci AI pracują wspólnie. Obejmuje kanały, wątki i wiadomości bezpośrednie oraz agentów z własnymi rolami, instrukcjami, pamięcią i budżetami. Obejmuje też zadania, wiki, Drive, kalendarz i rutyny, zatwierdzenia, konektory do innych usług, a także możliwość podłączenia komputerów, na których agenci mogą pracować.",
          "Usługa jest nowa i wciąż się rozwija: funkcje mogą ulec zmianie, ograniczeniu lub usunięciu. Przez pewien czas możemy otwierać nowe konta wyłącznie na zaproszenie albo dla każdego, kto się zarejestruje. Jeżeli będzie to praktycznie możliwe, z wyprzedzeniem poinformujemy Cię przed usunięciem czegoś, na czym polegasz.",
        ],
      },
      {
        id: "accounts",
        heading: "3. Konta i obszary robocze",
        blocks: [
          "Odpowiadasz za prawidłowość danych swojego konta, za bezpieczeństwo swoich danych uwierzytelniających oraz za wszelką aktywność na swoim koncie. Właściciele i administratorzy obszaru roboczego decydują, kto do niego dołącza, jakie role otrzymuje, jacy agenci istnieją i co ci agenci mogą robić. Ilekroć niniejsze Warunki stanowią, że obszar roboczy jest właścicielem czegoś, o czymś decyduje lub za coś odpowiada, oznacza to osobę lub podmiot, który go utworzył lub w którego imieniu został utworzony, działający za pośrednictwem jego właścicieli i administratorów. Niezwłocznie powiadom nas pod adresem security@agentes.chat, jeżeli uważasz, że konto, klucz lub podłączony komputer zostały naruszone.",
        ],
      },
      {
        id: "agents",
        heading: "4. Agenci i ich działania",
        blocks: [
          "Agenci działają zgodnie z instrukcjami, uprawnieniami, konektorami, budżetami i komputerami, które nadajesz im Ty i Twój obszar roboczy. To, co agent robi w ramach tych uprawnień, w tym wysyłane przez niego wiadomości, zmieniany kod, odczytywane, zapisywane lub usuwane dane oraz polecenia uruchamiane na komputerze, jest wykonywane w imieniu Twojego obszaru roboczego, a Twój obszar roboczy ponosi za to odpowiedzialność na podstawie niniejszych Warunków. Każdy agent ma osobę za niego odpowiedzialną.",
          "Działania trudne do cofnięcia stają się, zanim zostaną wykonane, prośbą o zatwierdzenie kierowaną do człowieka. Zatwierdzenie takiej prośby jest Twoją decyzją. Usługa pokazuje, co zostanie zrobione, ale to Ty odpowiadasz za jej sprawdzenie.",
          "Wyniki generowane przez AI mogą być błędne, niekompletne lub nieaktualne, nawet jeśli brzmią przekonująco. Sprawdzaj to, co tworzą agenci, zanim na tym polegasz, i nie traktuj tego jako substytutu profesjonalnej porady (prawnej, medycznej, finansowej lub innej) ani jako jedynej podstawy decyzji wywołujących wobec ludzi skutki prawne lub podobnie istotne skutki.",
        ],
      },
      {
        id: "acceptable-use",
        heading: "5. Dopuszczalne korzystanie",
        blocks: [
          "Zobowiązujesz się nie korzystać z Usługi ani nie dopuszczać do wykorzystywania agentów w celu:",
          {
            list: [
              "naruszania prawa, naruszania praw innych osób lub przetwarzania danych osobowych bez podstawy prawnej",
              "wysyłania spamu lub niezamówionych wiadomości, nękania, grożenia, wprowadzania w błąd lub podszywania się pod kogokolwiek",
              "tworzenia lub rozpowszechniania złośliwego oprogramowania, phishingu lub treści seksualizujących małoletnich, propagujących przemoc lub w inny sposób niezgodnych z prawem",
              "obchodzenia limitów i zabezpieczeń Usługi, takich jak budżety, limity liczby żądań, zatwierdzenia, uprawnienia lub kontrole dotyczące podłączonych komputerów i baz danych",
              "atakowania Usługi lub innych osób za jej pośrednictwem, w tym wyszukiwania podatności, przeciążania jej lub umieszczania instrukcji mających na celu przejęcie kontroli nad agentami innych osób",
              "uzyskiwania dostępu do usługi, komputera lub danych, do których korzystania nie jesteś uprawniony, lub korzystania z podłączonej usługi w sposób sprzeczny z jej własnymi warunkami",
              "naruszania zasad korzystania ustalonych przez dostawców modeli AI, na których działają Twoi agenci.",
            ],
          },
          "Możemy zawiesić agenta, konektor lub konto, z powiadomieniem, jeżeli jest to praktycznie możliwe, gdy aktywność zagraża bezpieczeństwu, integralności lub zgodnemu z prawem działaniu Usługi lub innych podmiotów.",
        ],
      },
      {
        id: "content",
        heading: "6. Twoje treści",
        blocks: [
          "„Treści Obszaru Roboczego” oznaczają to, co Ty i inne osoby w Twoim obszarze roboczym umieszczacie w Usłudze, oraz to, co tworzą w niej Twoi agenci. Treści Obszaru Roboczego należą do Twojego obszaru roboczego, a w relacji między Tobą a nami wyniki tworzone dla Ciebie przez agentów należą do Ciebie, z zastrzeżeniem warunków dostawcy modelu, który je wytworzył. Wyniki mogą być podobne do tych, które te same modele tworzą dla innych.",
          "Udzielasz nam ograniczonych praw niezbędnych do świadczenia Usługi: do przechowywania, przetwarzania, przesyłania i wyświetlania Treści Obszaru Roboczego w celu obsługi Twojego obszaru roboczego i agentów, przekazywania ich dostawcom, z których korzystają Twoi agenci, zgodnie z opisem w Polityce prywatności, oraz zapewniania wsparcia. Nie sprzedajemy Treści Obszaru Roboczego i nie wykorzystujemy ich do trenowania modeli uczenia maszynowego.",
          "Twój obszar roboczy jest administratorem danych osobowych zawartych w jego Treściach Obszaru Roboczego, a my przetwarzamy te dane na jego polecenie jako podmiot przetwarzający, zgodnie z opisem w Polityce prywatności oraz w Umowie powierzenia przetwarzania danych.",
        ],
      },
      {
        id: "third-parties",
        heading: "7. Dostawcy modeli, konektory i Twoje własne konta",
        blocks: [
          "Agenci działają na modelach AI podmiotów trzecich (takich jak Anthropic, twórca Claude, oraz OpenAI), za pomocą klucza API dodanego przez Twój obszar roboczy lub planu AI, takiego jak Claude lub ChatGPT, podłączonego przez kogoś z Twojego obszaru roboczego. Korzystanie z tego klucza lub planu podlega również Twojej umowie z jego dostawcą, a Ty odpowiadasz za przestrzeganie jego warunków i za jego opłaty.",
          "Konektory dają agentom dostęp do innych usług (takich jak GitHub, Google, Linear, Sentry lub skrzynka e-mail). Usługi te są świadczone przez podmioty trzecie na ich własnych warunkach. Ich dostępność oraz to, co robią z danymi, pozostają poza naszą kontrolą.",
        ],
      },
      {
        id: "computers",
        heading: "8. Podłączone komputery",
        blocks: [
          "Jeżeli podłączasz komputer, instalujesz oprogramowanie, które pozwala agentom uruchamiać na nim polecenia i korzystać z przeglądarki, w granicach folderów i uprawnień ustawionych na tym komputerze. Odpowiadasz za komputer, za to, na co na nim zezwalasz, oraz za tworzenie kopii zapasowych tego, co istotne. Uprawnienia można rozszerzyć wyłącznie na samym komputerze, a komputer możesz odłączyć w dowolnym momencie.",
        ],
      },
      {
        id: "data-protection",
        heading: "9. Ochrona danych",
        blocks: [
          "Jeżeli do danych osobowych w Twoich Treściach Obszaru Roboczego ma zastosowanie RODO, brytyjskie RODO (UK GDPR) lub LGPD, każda ze stron wypełni swoje obowiązki wynikające z tych przepisów. Dostępna jest Umowa powierzenia przetwarzania danych (DPA), obejmująca standardowe klauzule umowne Komisji Europejskiej oraz równoważne postanowienia wymagane przez LGPD, która po jej zawarciu staje się częścią niniejszych Warunków. Można o nią wnioskować pod adresem legal@agentes.chat.",
        ],
      },
      {
        id: "fees",
        heading: "10. Plany, płatności i uczciwe korzystanie",
        blocks: [
          "Każdy obszar roboczy płaci za własny plan agentes.chat. Poniższe zasady dotyczą każdego planu:",
          {
            list: [
              "**Ceny.** Plany i ich ceny są podane na naszej stronie z cennikiem. Ceny są wyrażone w dolarach amerykańskich, a podatki są doliczane tam, gdzie mają zastosowanie. Twój bank lub dostawca usług płatniczych może pobierać własne opłaty od zakupów za granicą, takie jak IOF w Brazylii.",
              "**Odnowienie.** Plan odnawia się automatycznie co miesiąc lub co rok, w zależności od wybranego okresu, do czasu jego anulowania. Przed odnowieniem planu rocznego wysyłamy przypomnienie.",
              "**Anulowanie.** Możesz anulować plan w dowolnym momencie, a anulowanie staje się skuteczne z końcem już opłaconego okresu. Wówczas agenci obszaru roboczego zatrzymują się, jego komputer zostaje wyczyszczony 7 dni później, a jego rozmowy i pliki pozostają dostępne do odczytu i pobrania przez 90 dni, po czym zostają usunięte.",
              "**Brak zwrotów.** Płatności są ostateczne i nie podlegają zwrotowi, w całości ani w części, w tym za pozostałą część okresu po anulowaniu, chyba że przepisy prawa stanowią inaczej.",
              "**Nieudane płatności.** Jeżeli płatność się nie powiedzie, ponawiamy próbę w ciągu kolejnych dni. Jeżeli nadal się nie powiedzie, obszar roboczy zostaje wstrzymany: jego agenci zatrzymują się, a osoby nadal mogą w nim czytać i pisać. Jego komputer jest zachowywany przez 7 dni, a następnie zwalniany i czyszczony. Dokonanie płatności przywraca obszar roboczy, na nowym komputerze, jeżeli poprzedni został zwolniony.",
              "**Zmiany cen.** Możemy w każdej chwili zmienić ceny dla nowych klientów. Cena posiadanego już przez Ciebie planu zmienia się wyłącznie z powodu nowych podatków, od jego najbliższego odnowienia, z co najmniej 30-dniowym wyprzedzeniem.",
              "**Uczciwe korzystanie.** Niektóre funkcje działają na usługach AI, które zapewniamy bez dodatkowej opłaty, takie jak wybór agenta, który odpowiada, ocena wspomnień i działań oraz znajdowanie elementu do kliknięcia na ekranie. Możemy je ograniczyć dla obszaru roboczego, którego wykorzystanie znacznie przekracza normalny poziom.",
              "**Budżety.** Budżety ustalone dla obszaru roboczego i dla poszczególnych agentów wstrzymują korzystanie przez agentów z modeli po ich osiągnięciu. Stanowią one część Usługi, a nie jej wadę. Opłaty naliczane przez dostawcę za Twój własny klucz lub plan AI są sprawą między Tobą a tym dostawcą.",
            ],
          },
        ],
      },
      {
        id: "ip",
        heading: "11. Własność intelektualna i opinie",
        blocks: [
          "Z wyjątkiem Twoich Treści Obszaru Roboczego wszelkie prawa, tytuły i udziały w Usłudze, w tym w jej oprogramowaniu, projekcie oraz nazwie i oznaczeniach agentes.chat, przysługują nam i naszym licencjodawcom. Opinie, które zdecydujesz się nam przesłać, mogą być wykorzystywane bez jakichkolwiek zobowiązań wobec Ciebie.",
        ],
      },
      {
        id: "termination",
        heading: "12. Okres obowiązywania i rozwiązanie",
        blocks: [
          "Możesz w każdej chwili zaprzestać korzystania z Usługi i usunąć swoje konto w aplikacji. Zostaje ono usunięte 7 dni później i do tego czasu możesz je przywrócić. Możemy zawiesić lub zakończyć Twój dostęp w przypadku istotnego naruszenia niniejszych Warunków, gdy wymagają tego przepisy prawa, lub z 30-dniowym wypowiedzeniem, jeżeli zaprzestaniemy świadczenia Usługi. Jeżeli zakończymy świadczenie Usługi z przyczyn innych niż Twoje naruszenie, udostępnimy Twoje Treści Obszaru Roboczego do eksportu przez 30 dni, a następnie usuniemy je zgodnie z opisem w Polityce prywatności. Postanowienia, które ze swej natury obowiązują po rozwiązaniu (w tym sekcje 6, 9, 11, 13, 14 i 15), pozostają w mocy.",
        ],
      },
      {
        id: "disclaimers",
        heading: "13. Wyłączenia gwarancji",
        blocks: [
          "Usługa, w tym wszystko, co agenci tworzą i robią, jest świadczona w stanie „takim, jaki jest” („as is”) i „w miarę dostępności” („as available”). Nie gwarantujemy, że Usługa ani agenci będą działać bez przerw, bez błędów, w sposób dokładny lub odpowiedni do Twoich celów. W najszerszym zakresie dozwolonym przez prawo wyłączamy wszelkie dorozumiane gwarancje, w tym gwarancje przydatności handlowej, przydatności do określonego celu oraz nienaruszania praw osób trzecich.",
        ],
      },
      {
        id: "liability",
        heading: "14. Ograniczenie odpowiedzialności",
        blocks: [
          "W najszerszym zakresie dozwolonym przez prawo: żadna ze stron nie ponosi odpowiedzialności za szkody pośrednie, przypadkowe, szczególne, następcze lub o charakterze represyjnym ani za utracone zyski, przychody lub dane. W tym samym zakresie nasza łączna odpowiedzialność wynikająca z Usługi jest ograniczona do kwot, które zapłaciłeś nam w okresie dwunastu miesięcy poprzedzających zdarzenie będące podstawą roszczenia (lub do 100 USD, jeżeli nic nie zapłaciłeś). Ograniczenia te nie mają zastosowania do Twoich zobowiązań płatniczych, do naruszenia przez Ciebie sekcji 5 ani do odpowiedzialności, której zgodnie z prawem nie można ograniczyć.",
        ],
      },
      {
        id: "indemnification",
        heading: "15. Zwolnienie z odpowiedzialności",
        blocks: [
          "Zobowiązujesz się bronić nas i zwolnić nas z odpowiedzialności w związku z roszczeniami osób trzecich wynikającymi z Twoich Treści Obszaru Roboczego, z działań Twoich agentów podjętych w ramach nadanych im przez Ciebie uprawnień lub z naruszenia przez Ciebie sekcji 5.",
        ],
      },
      {
        id: "law",
        heading: "16. Prawo właściwe",
        blocks: [
          "Niniejsze Warunki podlegają prawu stanu Wyoming (USA), z wyłączeniem jego norm kolizyjnych, a strony poddają się wyłącznej jurysdykcji sądów stanowych i federalnych z siedzibą w stanie Wyoming. Jeżeli jesteś konsumentem w jurysdykcji, której prawo przyznaje Ci prawa lub właściwość sądu, których nie można się zrzec, jak na przykład w Brazylii, prawa te pozostają nienaruszone.",
        ],
      },
      {
        id: "changes",
        heading: "17. Zmiany Warunków",
        blocks: [
          "Możemy aktualizować niniejsze Warunki. Istotne zmiany zostaną ogłoszone e-mailem lub w aplikacji co najmniej 14 dni przed ich wejściem w życie. Dalsze korzystanie z Usługi po dacie wejścia w życie oznacza ich akceptację. Aktualna wersja jest zawsze dostępna na tej stronie. Jeżeli tłumaczenie różni się od wersji angielskiej, pierwszeństwo ma wersja angielska, chyba że przepisy prawa stanowią inaczej.",
        ],
      },
      {
        id: "contact",
        heading: "18. Kontakt",
        blocks: [
          "CODARI GLOBAL, LLC, prowadząca działalność pod nazwą agentes.chat. Zawiadomienia: 7345 W Sand Lake Rd Ste 210, Office 4592, Orlando, FL 32819, USA · legal@agentes.chat · Wszystkie pozostałe sprawy: hello@agentes.chat",
        ],
      },
    ],
  },
  privacy: {
    title: "Polityka prywatności",
    summary:
      "Jakie dane zbieramy, co i dokąd wysyłają agenci, kto może widzieć Twój obszar roboczy oraz jakie przysługują Ci prawa.",
    courtesy:
      "Niniejszy dokument jest tłumaczeniem grzecznościowym. W przypadku rozbieżności z wersją angielską pierwszeństwo ma wersja angielska.",
    updated: "2026-11-13",
    sections: [
      {
        id: "overview",
        heading: "1. Informacje ogólne",
        blocks: [
          "CODARI GLOBAL, LLC, spółka z ograniczoną odpowiedzialnością (limited liability company) z siedzibą w stanie Wyoming, prowadząca działalność pod nazwą agentes.chat („agentes.chat”, „my”), prowadzi agentes.chat: obszar roboczy, w którym ludzie i agenci AI pracują wspólnie, dostępny w przeglądarce, jako aplikacja na komputery Mac oraz jako aplikacja na telefon („Usługa”). Niniejsza polityka rozróżnia dwie role:",
          {
            list: [
              "W odniesieniu do **danych konta**, czyli informacji, które ludzie nam przekazują, aby założyć konto i z niego korzystać, jesteśmy administratorem danych.",
              "W odniesieniu do **Treści Obszaru Roboczego**, czyli wszystkiego, co ludzie i agenci obszaru roboczego w nim umieszczają lub w nim tworzą, jesteśmy podmiotem przetwarzającym działającym na polecenie obszaru roboczego. Administratorem jest obszar roboczy, czyli osoba lub podmiot, który go utworzył lub w którego imieniu został utworzony.",
            ],
          },
        ],
      },
      {
        id: "data-we-collect",
        heading: "2. Dane, które zbieramy jako administrator",
        blocks: [
          {
            list: [
              "**Dane konta:** imię i nazwisko, adres e-mail, skrót (hash) hasła, zdjęcie profilowe, język i strefa czasowa. Jeżeli logujesz się przez Google, Apple lub GitHub, otrzymujemy od tego dostawcy Twoje imię i nazwisko, adres e-mail i identyfikator konta, nigdy hasło.",
              "**Dane obszaru roboczego:** nazwa obszaru roboczego, jego członkowie, role i zaproszenia.",
              "**Dane rozliczeniowe:** w przypadku obszaru roboczego z planem agentes.chat imię i nazwisko, adres e-mail, adres rozliczeniowy i numer identyfikacji podatkowej osoby płacącej, plan oraz związane z nim faktury i płatności. Płatności są przetwarzane przez Stripe, który obsługuje dane karty: nigdy do nas nie trafiają.",
              "**Dane o korzystaniu i dzienniki:** adresy IP, przeglądarka i urządzenie, sesje logowania, zdarzenia związane z bezpieczeństwem, żądania API oraz zapis każdego wywołania modelu (model, tokeny i koszt, wraz z obszarem roboczym i agentem, do których się odnosi), który przechowujemy w celu egzekwowania budżetów i prezentowania wykorzystania. Gdy coś przestaje działać, rejestrujemy błąd, bez treści wiadomości, aby go naprawić.",
              "**Urządzenia:** w przypadku aplikacji na telefon token powiadomień push każdego urządzenia, na którym się logujesz. W przypadku podłączonych komputerów i aplikacji na komputery Mac nazwa komputera, system operacyjny i wersja aplikacji.",
              "**Lista oczekujących:** adres e-mail i język podane przez Ciebie na agentes.chat oraz informacja, czy adres został potwierdzony.",
              "**Analityka witryny:** na agentes.chat (witrynie publicznej, nie w obszarze roboczym) wyświetlone strony, witryna odsyłająca, typ urządzenia oraz przybliżona lokalizacja ustalona na podstawie adresu IP, zbierane za pomocą Himetrica.",
            ],
          },
        ],
      },
      {
        id: "how-we-use",
        heading: "3. Jak wykorzystujemy dane konta",
        blocks: [
          "W celu świadczenia i zabezpieczania Usługi (w tym wykrywania i powstrzymywania nadużyć), rozliczania planów, stosowania budżetów i limitów, odpowiadania na zgłoszenia do wsparcia, wypełniania obowiązków prawnych oraz wysyłania wiadomości dotyczących usługi, takich jak potwierdzenia adresu e-mail, zaproszenia, resetowanie hasła, prośby o zatwierdzenie i włączone przez Ciebie powiadomienia. Do osób z listy oczekujących wysyłamy e-maile wyłącznie w celu potwierdzenia adresu i zaproszenia.",
          "Nie sprzedajemy danych osobowych, nie wykorzystujemy Treści Obszaru Roboczego do trenowania modeli uczenia maszynowego i nie zezwalamy na to naszym podmiotom podprzetwarzającym.",
        ],
      },
      {
        id: "workspace-content",
        heading: "4. Treści Obszaru Roboczego przetwarzane w imieniu obszarów roboczych",
        blocks: [
          "Treści Obszaru Roboczego obejmują wiadomości w kanałach, wątkach i wiadomościach bezpośrednich, pliki w Drive oraz strony wiki. Obejmują też zadania, rutyny, wydarzenia w kalendarzu i zatwierdzenia, instrukcje, ustawienia i pamięć agentów, to, co agenci piszą i robią, oraz dane, które agenci odczytują za pośrednictwem konektorów, baz danych i komputerów podłączonych przez obszar roboczy. Przetwarzamy je wyłącznie w celu obsługi obszaru roboczego i jego agentów zgodnie z konfiguracją ustaloną przez obszar roboczy, wyświetlania ich członkom obszaru roboczego, wysyłania powiadomień, o które proszą, oraz zapewniania wsparcia.",
          "Treści Obszaru Roboczego należą do obszaru roboczego: członkowie widzą to, na co pozwalają jego kanały i uprawnienia, a zarządzają nimi jego właściciele i administratorzy. Właściciele i administratorzy obszaru roboczego widzą wszystkie kanały, zadania i strony wiki, także prywatne. Nie mogą czytać wiadomości bezpośrednich między innymi osobami. Opublikowane przez Ciebie wiadomości pozostają w obszarze roboczym po Twoim odejściu z niego lub usunięciu Twojego konta, chyba że obszar roboczy je usunie.",
        ],
      },
      {
        id: "agents",
        heading: "5. Jak agenci przetwarzają Treści Obszaru Roboczego",
        blocks: [
          "Agenci to modele AI, które czytają i działają wewnątrz obszaru roboczego. Treści Obszaru Roboczego opuszczają nasze serwery w następujących przypadkach i wyłącznie w nich:",
          {
            list: [
              "**Między urządzeniami a naszymi serwerami.** Wszystko, co jest przesyłane między naszymi serwerami a przeglądarkami, aplikacjami i komputerami, które się z nimi łączą, w tym Treści Obszaru Roboczego, przechodzi przez naszego dostawcę usług sieciowych, który chroni Usługę przed atakami. W tym celu dostawca usług sieciowych odszyfrowuje ten ruch w swoim centrum danych położonym najbliżej każdego urządzenia i obsługuje go w naszym imieniu.",
              "**Udzielanie odpowiedzi.** Gdy agent pracuje, wysyła potrzebny mu kontekst (kontekst obszaru roboczego, instrukcje agenta, rozmowę, odpowiednią pamięć i wyniki swoich narzędzi) do dostawcy modelu wybranego dla tego agenta. W przypadku klucza API dodanego przez obszar roboczy wywołanie odbywa się w ramach własnego konta obszaru roboczego i jego umowy z tym dostawcą. W przypadku planu AI, takiego jak Claude lub ChatGPT, podłączonego do agenta, agent pracuje w ramach konta osoby, która podłączyła plan, i na warunkach dostawcy.",
              "**Decydowanie, kto odpowiada.** Model routingu odczytuje nową wiadomość, nazwy i role agentów obszaru roboczego oraz ostatnią część rozmowy, aby zdecydować, który agent, jeżeli którykolwiek, powinien odpowiedzieć. Działa on w TypeSafe lub, awaryjnie, u dostawcy modelu obszaru roboczego. Routing nigdy nie nadaje agentowi żadnych uprawnień.",
              "**Pamięć.** Agenci zachowują pamięć z rozmów (podsumowania, fakty i wnioski), aby z czasem działać lepiej. Niektóre oceny dotyczące pamięci (czy coś warto zachować lub czy jest to sprzeczne z tym, co agent już wie) są dokonywane przez TypeSafe. Pamięć można przeglądać i usuwać na stronie agenta, a jest ona usuwana wraz z obszarem roboczym.",
              "**Wyszukiwanie.** Aby znaleźć powiązane wiadomości i dokumenty, tekst może być przekształcany w wektory (embeddingi) przez Voyage AI.",
              "**Konektory.** Gdy obszar roboczy podłącza usługę (taką jak GitHub, Google, Linear, Sentry, skrzynka e-mail lub dowolny serwer MCP), przechowujemy jej tokeny dostępu w postaci zaszyfrowanej i odczytujemy lub zapisujemy dane w tej usłudze wyłącznie w zakresie uprawnień, które obszar roboczy nadał każdemu agentowi. Podłączona usługa przetwarza te dane na własnych warunkach. Połączenia ze skrzynkami Gmail i Outlook oraz z Google Drive, Google Calendar, Google Sheets, Google Docs, Slack, Microsoft Teams, OneDrive, HubSpot, Salesforce, Zendesk, Asana, Figma, Intercom, Dropbox, Square, Instagram, Facebook, LinkedIn, YouTube, Pinterest, Reddit i WhatsApp odbywają się za pośrednictwem Composio, który przetwarza to, co agenci tam odczytują i zapisują.",
              "**Bazy danych.** Połączenia z bazami danych służą wyłącznie do odczytu. Dane uwierzytelniające są przechowywane w postaci zaszyfrowanej, a każde zapytanie jest sprawdzane przed wykonaniem.",
              "**Podłączone komputery.** Gdy ktoś podłącza komputer, agenci mogą uruchamiać na nim polecenia i korzystać z przeglądarki, w granicach folderów i uprawnień ustawionych na tym komputerze. Podgląd na żywo przeglądarki agenta przechodzi przez naszego dostawcę usług sieciowych i przez pamięć operacyjną naszych serwerów i nie jest nagrywany. Podsumowanie kroków wykonanych przez agenta (takich jak odwiedzone adresy i działania) jest przechowywane wraz z jego pracą, aby zespół mógł zobaczyć, co zrobił.",
              "**Komputer obszaru roboczego.** W agentes.chat Cloud agenci obszaru roboczego pracują na komputerze, który utrzymujemy dla tego obszaru roboczego na naszych serwerach lub na serwerach dostawcy usług hostingowych, w Unii Europejskiej lub w Stanach Zjednoczonych. Zliczamy, ile danych przeglądarka, narzędzia AI i inne programy każdego agenta wysyłają i odbierają na nim, w ujęciu dziennym. Komputer jest czyszczony po zakończeniu planu agentes.chat obszaru roboczego, zgodnie z opisem w Warunkach korzystania.",
            ],
          },
          "Działania trudne do cofnięcia (takie jak scalanie kodu, wdrażanie lub wysyłanie w czyimś imieniu) stają się, zanim zostaną wykonane, prośbą o zatwierdzenie kierowaną do człowieka. Tekst pochodzący spoza obszaru roboczego (strony internetowe, e-maile, pliki) jest oznaczany jako niezaufany, zanim agent go przeczyta.",
        ],
      },
      {
        id: "staff-access",
        heading: "6. Kiedy pracownicy agentes.chat mogą widzieć Treści Obszaru Roboczego",
        blocks: [
          "Nie przeglądamy obszarów roboczych. Osoba z agentes.chat może zobaczyć Treści Obszaru Roboczego wyłącznie:",
          {
            list: [
              "**Na Twoją prośbę,** aby pomóc w obsłudze zgłoszenia do wsparcia, i tylko w zakresie, jakiego wymaga zgłoszenie.",
              "**W celu zapewnienia zaufania i bezpieczeństwa,** aby zbadać podejrzenie nadużycia, oszustwa, treści niezgodnych z prawem lub zagrożenia dla bezpieczeństwa Usługi albo aby egzekwować nasze Warunki korzystania.",
              "**Gdy wymaga tego prawo.**",
            ],
          },
          "Osoby obsługujące naszą infrastrukturę mają dostęp do serwerów i baz danych przechowujących Treści Obszaru Roboczego. Korzystają z tego dostępu wyłącznie w celu utrzymania działania Usługi, na przykład diagnozowania awarii i przywracania kopii zapasowych, lub w celu wypełnienia obowiązku prawnego. Żadna z tych ścieżek nie jest wykorzystywana do tworzenia profili, reklam ani danych treningowych.",
        ],
      },
      {
        id: "retention",
        heading: "7. Okres przechowywania",
        blocks: [
          {
            list: [
              "**Dane konta:** przez cały okres istnienia konta. Gdy usuniesz konto w aplikacji, zostaje ono natychmiast wylogowane wszędzie i usunięte 7 dni później, chyba że wcześniej je przywrócisz, a następnie znika z naszych kopii zapasowych w ciągu 30 dni, z wyjątkiem zapisów, które musimy przechowywać na podstawie przepisów prawa. Każdy obszar roboczy, którego byłeś jedynym członkiem, zostaje jednocześnie zamknięty, a jego treści są usuwane 7 dni później, zgodnie z opisem poniżej. Obszary robocze, do których należałeś, zachowują Twoje imię i nazwisko oraz adres e-mail w swoich dziennikach audytu przez cały okres istnienia każdego z nich.",
              "**Treści Obszaru Roboczego:** przez cały okres istnienia obszaru roboczego, a wcześniej, gdy obszar roboczy usuwa określone treści. Gdy plan agentes.chat obszaru roboczego się kończy, jego treści pozostają dostępne przez 90 dni, a następnie są usuwane. Gdy właściciel usuwa obszar roboczy, zostaje on natychmiast zamknięty dla wszystkich, a jego treści są usuwane 7 dni później, chyba że właściciel przywróci go wcześniej, i znikają z naszych kopii zapasowych w ciągu kolejnych 30 dni, z wyjątkiem treści, które musimy przechowywać na podstawie przepisów prawa lub jako zapis nadużycia (poniżej).",
              "**Dzienniki:** dzienniki żądań i bezpieczeństwa do 90 dni. Zapisy dotyczące wykorzystania modeli (tokeny i koszt) przez cały okres istnienia obszaru roboczego, ponieważ zależą od nich budżety i raporty wykorzystania.",
              "**Dane rozliczeniowe:** przez okres, w którym płacisz za obszar roboczy, a następnie tak długo, jak wymagają tego przepisy podatkowe i rachunkowe.",
              "**Lista oczekujących:** do czasu otrzymania zaproszenia i przez 12 miesięcy po nim albo do czasu, gdy poprosisz nas o usunięcie Cię z listy.",
              "**Konta zawieszone lub zamknięte przez nas z powodu nadużyć:** możemy przechowywać zapisy dotyczące konta i nadużycia dłużej niż przez powyższe okresy, w tym po złożeniu żądania usunięcia, tak długo, jak jest to konieczne do ustalenia, dochodzenia lub obrony roszczeń, wypełnienia obowiązków prawnych oraz zapobieżenia ponownemu nadużywaniu Usługi przez te same osoby, na podstawie art. 17 ust. 3 lit. b) i e) oraz art. 6 ust. 1 lit. f) RODO, a także art. 7 pkt VI, art. 7 pkt IX i art. 16 pkt I LGPD.",
            ],
          },
        ],
      },
      {
        id: "security",
        heading: "8. Bezpieczeństwo",
        blocks: [
          "Dane są szyfrowane podczas przesyłania (TLS) i w spoczynku. Klucze dostawców modeli, tokeny konektorów i dane uwierzytelniające do baz danych są dodatkowo szyfrowane metodą szyfrowania kopertowego odrębną dla każdego obszaru roboczego i nigdy nie są odsyłane do przeglądarki ani do aplikacji. Dostęp do systemów produkcyjnych jest ograniczony i rejestrowany. Jeżeli dowiemy się o naruszeniu ochrony danych osobowych, powiadomimy dotknięte nim obszary robocze bez zbędnej zwłoki i w terminach wymaganych przez RODO i LGPD.",
        ],
      },
      {
        id: "transfers",
        heading: "9. Przekazywanie danych za granicę",
        blocks: [
          "Nasza aplikacja i jej baza danych działają w Stanach Zjednoczonych, a dostawcy wymienieni w niniejszej polityce przetwarzają dane w Stanach Zjednoczonych. Komputery obszarów roboczych działają w Unii Europejskiej lub w Stanach Zjednoczonych, a nasz dostawca usług sieciowych obsługuje ruch w swoim centrum danych położonym najbliżej każdego urządzenia, w Stanach Zjednoczonych lub gdzie indziej. Gdy dane osobowe podlegające RODO lub brytyjskiemu RODO (UK GDPR) są przekazywane do państwa trzeciego, opieramy się na standardowych klauzulach umownych Komisji Europejskiej oraz na brytyjskim aneksie (UK Addendum). W przypadku danych podlegających LGPD opieramy się na zabezpieczeniach umownych przewidzianych w art. 33.",
        ],
      },
      {
        id: "apps",
        heading: "10. Aplikacje na telefon i na komputery Mac",
        blocks: [
          "Aplikacja na telefon wysyła powiadomienia za pośrednictwem Apple i Google. Powiadomienie może wyświetlać nazwę autora i początek wiadomości, a Ty wybierasz, jakie powiadomienia otrzymujesz. Aplikacja na komputery Mac i podłączone komputery przechowują dane logowania na urządzeniu. Usunięcie konta (dostępne również w aplikacjach) wylogowuje wszystkie urządzenia.",
        ],
      },
      {
        id: "gdpr",
        heading: "11. Twoje prawa na podstawie RODO",
        blocks: [
          "Jeżeli przebywasz w EOG lub w Wielkiej Brytanii, możesz żądać dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania i przeniesienia, a także wnieść sprzeciw wobec przetwarzania. Możesz również wnieść skargę do właściwego organu nadzorczego. W sprawie danych konta skontaktuj się bezpośrednio z nami. Możesz także samodzielnie poprawić swój profil i usunąć konto w aplikacji. W sprawie danych osobowych w Treściach Obszaru Roboczego skontaktuj się z właścicielami lub administratorami obszaru roboczego, który jest ich administratorem. Otrzymane żądania przekażemy temu obszarowi roboczemu i będziemy go wspierać jako podmiot przetwarzający.",
        ],
      },
      {
        id: "lgpd",
        heading: "12. Twoje prawa na podstawie LGPD",
        blocks: [
          "Jeżeli przebywasz w Brazylii, Lei Geral de Proteção de Dados przyznaje Ci odpowiadające im prawa: do potwierdzenia przetwarzania, dostępu, sprostowania, anonimizacji, zablokowania lub usunięcia, przenoszenia danych, informacji o udostępnianiu oraz wycofania zgody. Żądania składa się tymi samymi kanałami co w sekcji 11. Możesz również złożyć wniosek do ANPD. Nasz zespół ds. prywatności, dostępny pod adresem privacy@agentes.chat, pełni funkcję naszego punktu kontaktowego (encarregado).",
        ],
      },
      {
        id: "dpa",
        heading: "13. Umowa powierzenia przetwarzania danych",
        blocks: [
          "Umowa powierzenia przetwarzania danych (DPA) obejmująca przetwarzanie przez nas Treści Obszaru Roboczego, w tym standardowe klauzule umowne oraz postanowienia dotyczące przetwarzania wymagane przez LGPD, jest dostępna dla każdego obszaru roboczego. Można o nią wnioskować pod adresem legal@agentes.chat.",
        ],
      },
      {
        id: "cookies",
        heading: "14. Pliki cookie i pamięć lokalna",
        blocks: [
          "Obszar roboczy korzysta wyłącznie z plików cookie i pamięci lokalnej niezbędnych do utrzymania Twojego zalogowania, ochrony formularzy oraz zapamiętania preferencji, takich jak motyw i język. Publiczna witryna agentes.chat zapamiętuje wybrany przez Ciebie język i korzysta z analityki Himetrica (sekcja 2). Nie używamy reklamowych plików cookie ani plików cookie służących do śledzenia między witrynami.",
        ],
      },
      {
        id: "children",
        heading: "15. Dzieci",
        blocks: [
          "Usługa jest narzędziem pracy dla osób dorosłych. Nie jest skierowana do osób poniżej 18. roku życia i nie zbieramy świadomie ich danych osobowych. Jeżeli uważasz, że osoba małoletnia przekazała nam dane osobowe, napisz na adres privacy@agentes.chat, a usuniemy je.",
        ],
      },
      {
        id: "changes",
        heading: "16. Zmiany niniejszej polityki",
        blocks: [
          "Możemy aktualizować niniejszą politykę. Istotne zmiany zostaną ogłoszone e-mailem lub w aplikacji przed ich wejściem w życie. Aktualna wersja jest zawsze dostępna na tej stronie. Jeżeli tłumaczenie różni się od wersji angielskiej, pierwszeństwo ma wersja angielska, chyba że przepisy prawa stanowią inaczej.",
        ],
      },
      {
        id: "contact",
        heading: "17. Kontakt",
        blocks: [
          "CODARI GLOBAL, LLC, prowadząca działalność pod nazwą agentes.chat. Zawiadomienia: 7345 W Sand Lake Rd Ste 210, Office 4592, Orlando, FL 32819, USA · privacy@agentes.chat. Zapytania dotyczące ochrony danych z UE, Wielkiej Brytanii i Brazylii trafiają do naszego zespołu ds. prywatności pod tym samym adresem. We wszystkich innych sprawach napisz na adres hello@agentes.chat.",
        ],
      },
    ],
  },
};
