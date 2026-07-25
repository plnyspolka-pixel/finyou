// Wersjonowany, konfigurowalny katalog reguł analizy KW.
//
// Zasady (spec §„Silnik reguł i rola AI"):
//   – Decyzje STOP / WSTRZYMANE / WARUNKOWO_DOPUSZCZALNE podejmuje ten
//     deterministyczny, testowalny silnik (bez AI).
//   – Każde znalezisko wskazuje konkretny wpis KW (SourceEvidence).
//   – Konflikt/niska pewność → WSTRZYMANE, nigdy pozytywny wynik.
//
// Dodanie nowej reguły: dopisz obiekt do tablicy `RULES` (id, version, run()).
// Trzymaj logikę i treść komunikatów tutaj, nie w komponentach UI.

import { DOCS, mkFinding, NEUTRAL_MESSAGE } from "./finding";
import { matchPartyToOwners, type IdentityMatch } from "./identity";
import type { RiskPolicy } from "./policy";
import type {
  KwAnalysisInput,
  KwFinding,
  LtvResult,
  MortgagePriorityResult,
  NormalizedLandRegister,
} from "./types";

export interface RuleContext {
  input: KwAnalysisInput;
  nlr: NormalizedLandRegister;
  policy: RiskPolicy;
  priority: MortgagePriorityResult;
  ltv: LtvResult;
  /** Dopasowania stron (pożyczkobiorca + dający zabezpieczenie) do Działu II. */
  identity: IdentityMatch[];
}

export interface Rule {
  id: string;
  version: string;
  run(ctx: RuleContext): KwFinding[];
}

const V = "1.0.0";

// ════════════════════════════════════════════════════════════════════════════
// A. Blokery / ryzyka własności i tożsamości.
// ════════════════════════════════════════════════════════════════════════════

const ruleClosedBook: Rule = {
  id: "R-COVER-CLOSED",
  version: V,
  run({ nlr }) {
    if (!nlr.meta.isClosed) return [];
    return [
      mkFinding({
        ruleId: "R-COVER-CLOSED",
        ruleVersion: V,
        category: "OWNERSHIP",
        status: "STOP",
        title: "Księga wieczysta jest zamknięta",
        plainLanguageSummary:
          "Ta księga została zamknięta — nie prowadzi się na niej aktualnego stanu prawnego.",
        source: nlr.migrationComments
          .filter((c) => c.section === "COVER")
          .concat({
            section: "COVER",
            fieldCode: "0.3.0.1",
            fieldLabel: "Chwila zamknięcia",
            rawValue: nlr.meta.closureReason ?? "Księga oznaczona jako zamknięta",
          }),
        whyItMatters: "Na zamkniętej księdze nie można skutecznie ustanowić hipoteki inwestora.",
        rankImpact: "DIRECT",
        enforcementImpact: "DIRECT",
        expectedFromClient: "Wskazanie właściwej, aktualnej księgi wieczystej nieruchomości.",
        requestedDocuments: [DOCS.CORRECT_KW],
        proposedResolution:
          "Ustal aktualną KW (np. z komentarza migracyjnego / podstawy zamknięcia) i wykonaj analizę ponownie.",
        agreementCondition: "Analiza aktualnej, otwartej księgi wieczystej.",
        intermediaryMessage:
          "KW jest zamknięta. Zapytaj klienta o aktualny numer księgi wieczystej — tej nie można użyć jako zabezpieczenia.",
        clientMessage:
          "Podana księga wieczysta jest zamknięta. Prosimy o wskazanie aktualnego numeru KW nieruchomości.",
        investorMessage:
          "Księga zamknięta (pole 0.3.0.1). Zabezpieczenie na tej KW niemożliwe do czasu ustalenia aktualnej księgi.",
      }),
    ];
  },
};

const ruleDataUnavailable: Rule = {
  id: "R-DATA-UNAVAILABLE",
  version: V,
  run({ nlr }) {
    if (nlr.meta.available) return [];
    return [
      mkFinding({
        ruleId: "R-DATA-UNAVAILABLE",
        ruleVersion: V,
        category: "DATA_QUALITY",
        status: "WSTRZYMANE",
        title: "Brak pobranej treści KW",
        plainLanguageSummary:
          "Treść działów księgi wieczystej jest niedostępna — analizy nie można wykonać.",
        source: [{ section: "COVER", rawValue: "Sekcje KW puste / nie pobrano treści z EKW." }],
        whyItMatters:
          "Bez treści działów I-IV nie da się ocenić własności, obciążeń ani miejsca hipoteki.",
        rankImpact: "UNKNOWN",
        enforcementImpact: "UNKNOWN",
        expectedFromClient:
          "Umożliwienie pobrania odpisu KW (poprawny numer) lub dostarczenie treści.",
        requestedDocuments: [DOCS.CORRECT_KW],
        proposedResolution: "Pobierz treść KW z EKW/CMD i uruchom analizę ponownie.",
        intermediaryMessage:
          "Nie udało się pobrać treści KW. Sprawdź numer księgi i pobierz odpis ponownie.",
        clientMessage:
          "Nie udało się pobrać treści księgi wieczystej. Prosimy o potwierdzenie numeru KW.",
        investorMessage: "Brak danych KW — analiza WSTRZYMANA do czasu pobrania treści działów.",
      }),
    ];
  },
};

const ruleOwnerUnconfirmed: Rule = {
  id: "R-OWNER-UNCONFIRMED",
  version: V,
  run({ nlr }) {
    if (!nlr.meta.available || nlr.owners.length > 0) return [];
    return [
      mkFinding({
        ruleId: "R-OWNER-UNCONFIRMED",
        ruleVersion: V,
        category: "OWNERSHIP",
        status: "STOP",
        title: "Nie potwierdzono właściciela (Dział II)",
        plainLanguageSummary: "W Dziale II nie rozpoznano żadnego właściciela nieruchomości.",
        source: [
          {
            section: "II",
            fieldCode: "2.2",
            fieldLabel: "Własność",
            rawValue: "Brak rozpoznanych właścicieli w Dziale II.",
          },
        ],
        whyItMatters: "Bez potwierdzenia właściciela nie można ustalić, kto ma ustanowić hipotekę.",
        rankImpact: "UNKNOWN",
        enforcementImpact: "UNKNOWN",
        expectedFromClient: "Potwierdzenie tożsamości właściciela i podstawy nabycia.",
        requestedDocuments: [DOCS.ACQUISITION_BASIS, DOCS.ID_DOC],
        proposedResolution: "Zweryfikuj Dział II ręcznie i uzupełnij dane właściciela.",
        intermediaryMessage:
          "System nie odczytał właściciela z Działu II. Zweryfikuj treść działu ręcznie.",
        clientMessage:
          "Potrzebujemy potwierdzenia, kto jest właścicielem nieruchomości. Prosimy o dokument nabycia.",
        investorMessage: "Właściciela nie potwierdzono (Dział II) — STOP do czasu weryfikacji.",
      }),
    ];
  },
};

const ruleShareOnly: Rule = {
  id: "R-SHARE-ONLY",
  version: V,
  run({ nlr, input }) {
    // Hipoteka ma objąć CAŁĄ nieruchomość, nie udział ułamkowy.
    const declaredShareProvider = input.declaredCollateralProviders.find(
      (p) => p.declaredShare && !/^1\/1$/.test(p.declaredShare.trim()),
    );
    const mortgageOnShare = nlr.mortgages.find(
      (m) => m.encumberedShare && !/^1\/1$/.test(m.encumberedShare),
    );
    if (!declaredShareProvider && !mortgageOnShare) return [];
    const src = mortgageOnShare
      ? [mortgageOnShare.evidence]
      : [
          {
            section: "II" as const,
            fieldCode: "2.2.1.2",
            fieldLabel: "Wielkość udziału",
            rawValue: `Zadeklarowany udział: ${declaredShareProvider?.declaredShare}`,
          },
        ];
    return [
      mkFinding({
        ruleId: "R-SHARE-ONLY",
        ruleVersion: V,
        category: "OWNERSHIP",
        status: "STOP",
        title: "Zabezpieczenie wyłącznie na udziale",
        plainLanguageSummary:
          "Zabezpieczenie miałoby objąć tylko udział, a nie całą nieruchomość — to niedopuszczalne.",
        source: src,
        whyItMatters:
          "Finance You nie akceptuje hipoteki wyłącznie na udziale ułamkowym nieruchomości głównej.",
        rankImpact: "DIRECT",
        enforcementImpact: "DIRECT",
        expectedFromClient:
          "Ustanowienie hipoteki przez wszystkich współwłaścicieli na całej nieruchomości.",
        proposedResolution:
          "Zmień zakres zabezpieczenia na całą nieruchomość (wszyscy współwłaściciele) albo zmień przedmiot zabezpieczenia.",
        agreementCondition: "Hipoteka na całej nieruchomości (100% prawa), nie na udziale.",
        intermediaryMessage:
          "Zabezpieczenie tylko na udziale jest niedopuszczalne. Potrzebna hipoteka na całej nieruchomości od wszystkich właścicieli.",
        clientMessage:
          "Zabezpieczenie musi obejmować całą nieruchomość. Jeśli jest kilku właścicieli, hipotekę ustanawiają wszyscy.",
        investorMessage:
          "Wykryto zabezpieczenie na udziale — STOP. Wymagana hipoteka na całości prawa.",
      }),
    ];
  },
};

const ruleCoOwners: Rule = {
  id: "R-COOWNERS",
  version: V,
  run({ nlr, input }) {
    if (nlr.owners.length <= 1) return [];
    // Czy wszyscy właściciele są zadeklarowani jako dający zabezpieczenie?
    const providers = input.declaredCollateralProviders;
    const allCovered = nlr.owners.every((o) =>
      providers.some((p) => matchPartyToOwners(p, [o]).kind !== "NO_MATCH"),
    );
    return [
      mkFinding({
        ruleId: "R-COOWNERS",
        ruleVersion: V,
        category: "OWNERSHIP",
        status: allCovered ? "WARUNKOWO_DOPUSZCZALNE" : "STOP",
        title: `Nieruchomość ma ${nlr.owners.length} współwłaścicieli`,
        plainLanguageSummary: allCovered
          ? "Wszyscy współwłaściciele są zadeklarowani jako ustanawiający hipotekę na całości — dopuszczalne warunkowo."
          : "Nie wszyscy współwłaściciele ustanawiają hipotekę na całej nieruchomości.",
        source: nlr.owners.flatMap((o) => o.evidence),
        whyItMatters:
          "Zabezpieczenie musi objąć całą nieruchomość — wymagana zgoda i hipoteka wszystkich współwłaścicieli.",
        rankImpact: "DIRECT",
        enforcementImpact: "POSSIBLE",
        expectedFromClient:
          "Zgoda i ustanowienie hipoteki przez wszystkich współwłaścicieli na całości.",
        requestedDocuments: [DOCS.ID_DOC],
        proposedResolution: allCovered
          ? "Potwierdź, że wszyscy współwłaściciele podpiszą oświadczenie o ustanowieniu hipoteki na całej nieruchomości."
          : "Uzupełnij listę dających zabezpieczenie o wszystkich współwłaścicieli albo zmień zabezpieczenie.",
        agreementCondition:
          "Hipoteka na całej nieruchomości ustanowiona przez wszystkich współwłaścicieli.",
        intermediaryMessage: allCovered
          ? "Jest kilku właścicieli — wszyscy muszą podpisać hipotekę na całości. Zaplanuj podpisy wszystkich."
          : "Nie wszyscy współwłaściciele obejmują hipoteką całość. Ustal, kto jeszcze musi przystąpić.",
        clientMessage:
          "Nieruchomość ma kilku właścicieli — hipotekę na całej nieruchomości muszą ustanowić wszyscy z nich.",
        investorMessage: allCovered
          ? "Wielu współwłaścicieli — dopuszczalne warunkowo, gdy wszyscy obciążą całość."
          : "Nie wszyscy współwłaściciele obciążają całość — STOP do uzupełnienia.",
      }),
    ];
  },
};

const ruleIdentity: Rule = {
  id: "R-IDENTITY",
  version: V,
  run({ identity, nlr }) {
    const out: KwFinding[] = [];
    for (const m of identity) {
      const partyName =
        m.party.companyName ??
        (`${m.party.firstName ?? ""} ${m.party.lastName ?? ""}`.trim() || "strona");
      const src = m.matchedOwner?.evidence ?? [
        {
          section: "II" as const,
          fieldCode: "2.2",
          fieldLabel: "Własność",
          rawValue: `Strona: ${partyName}`,
        },
      ];
      if (m.kind === "PESEL_MATCH" || m.kind === "COMPANY_MATCH") {
        // Zgodność — brak problemu, ale zwracamy pozytywne znalezisko dla przejrzystości.
        out.push(
          mkFinding({
            ruleId: "R-IDENTITY",
            ruleVersion: V,
            category: "IDENTITY",
            status: "BRAK_PROBLEMU",
            title: `Tożsamość potwierdzona: ${partyName}`,
            plainLanguageSummary: "Strona zgadza się z właścicielem w Dziale II.",
            source: src,
            whyItMatters: "Zgodność tożsamości potwierdza umocowanie do ustanowienia hipoteki.",
            expectedFromClient: "Brak — dane zgodne.",
            proposedResolution: "Brak działań.",
            intermediaryMessage: `Tożsamość „${partyName}" zgadza się z KW.`,
            clientMessage: "Dane właściciela są zgodne z księgą wieczystą.",
            investorMessage: `Tożsamość strony „${partyName}" zgodna z Działem II.`,
            confidence: 0.95,
          }),
        );
      } else if (m.kind === "NAME_DIFF_PESEL_MATCH") {
        out.push(
          mkFinding({
            ruleId: "R-IDENTITY",
            ruleVersion: V,
            category: "IDENTITY",
            status: "WSTRZYMANE",
            title: `Inne nazwisko, ten sam PESEL: ${partyName}`,
            plainLanguageSummary:
              "Dane nazwiska w dokumentach i KW są różne; prawdopodobnie chodzi o tę samą osobę, ale potrzebny jest dokument potwierdzający zmianę.",
            source: src,
            whyItMatters:
              "Do aktualizacji Działu II i skutecznej hipoteki potrzeba udokumentowania zmiany nazwiska.",
            rankImpact: "POSSIBLE",
            expectedFromClient: "Dokument potwierdzający zmianę nazwiska.",
            requestedDocuments: [DOCS.MARRIAGE_CERT, DOCS.MENTION_APPLICATION],
            proposedResolution:
              "Uzyskaj akt małżeństwa/USC/decyzję; zaktualizuj Dział II (ewentualnie razem z wnioskiem o hipotekę).",
            agreementCondition: "Aktualizacja Działu II do aktualnego nazwiska.",
            intermediaryMessage:
              "Inne nazwisko niż w KW, ale ten sam PESEL — to zwykle zmiana nazwiska. Poproś o akt małżeństwa lub dokument USC.",
            clientMessage:
              "Nazwisko w dokumentach różni się od tego w KW. Prosimy o dokument potwierdzający zmianę nazwiska (np. akt małżeństwa).",
            investorMessage:
              "Rozbieżność nazwiska przy zgodnym PESEL — WSTRZYMANE do dokumentu zmiany nazwiska; to nie jest inna osoba.",
          }),
        );
      } else if (m.kind === "PESEL_CONFLICT") {
        out.push(
          mkFinding({
            ruleId: "R-IDENTITY",
            ruleVersion: V,
            category: "IDENTITY",
            status: "STOP",
            title: `Rozbieżność tożsamości: ${partyName}`,
            plainLanguageSummary:
              "To samo nazwisko, ale inny PESEL — to poważna rozbieżność tożsamości.",
            source: src,
            whyItMatters:
              "Zgodne nazwisko przy różnym PESEL może oznaczać inną osobę o tym samym nazwisku.",
            rankImpact: "DIRECT",
            expectedFromClient: "Wyjaśnienie i dokumenty tożsamości.",
            requestedDocuments: [DOCS.ID_DOC, DOCS.ACQUISITION_BASIS],
            proposedResolution:
              "Zweryfikuj, czy to właściciel z KW; bez racjonalnego, udokumentowanego wyjaśnienia — STOP.",
            intermediaryMessage:
              "Uwaga: nazwisko się zgadza, ale PESEL jest inny. To może być inna osoba — potrzebne wyjaśnienie i dokumenty.",
            clientMessage:
              "Dane tożsamości nie zgadzają się z KW. Prosimy o dokument tożsamości i wyjaśnienie.",
            investorMessage:
              "Poważna rozbieżność tożsamości (nazwisko zgodne, PESEL różny) — STOP do wyjaśnienia.",
          }),
        );
      } else if (m.kind === "NAME_TYPO") {
        out.push(
          mkFinding({
            ruleId: "R-IDENTITY",
            ruleVersion: V,
            category: "IDENTITY",
            status: "WSTRZYMANE",
            title: `Możliwa literówka w danych: ${partyName}`,
            plainLanguageSummary: m.detail,
            source: src,
            whyItMatters:
              "Różnica pisowni może wymagać sprostowania KW lub potwierdzenia dokumentem.",
            expectedFromClient: "Dokument tożsamości i dokument źródłowy.",
            requestedDocuments: [DOCS.ID_DOC],
            proposedResolution:
              "Potwierdź tożsamość dokumentem; w razie błędu w KW — wniosek o sprostowanie.",
            intermediaryMessage:
              "Drobna różnica w pisowni nazwiska. Poproś o dokument tożsamości, żeby to potwierdzić.",
            clientMessage:
              "Zauważyliśmy drobną różnicę w pisowni danych. Prosimy o dokument tożsamości.",
            investorMessage:
              "Drobna rozbieżność danych osobowych — WSTRZYMANE do potwierdzenia/sprostowania.",
          }),
        );
      } else if (m.kind === "NO_MATCH" && m.party.role !== "BORROWER") {
        // Dający zabezpieczenie nie występuje w Dziale II.
        out.push(
          mkFinding({
            ruleId: "R-IDENTITY",
            ruleVersion: V,
            category: "IDENTITY",
            status: "WSTRZYMANE",
            title: `Strona spoza Działu II: ${partyName}`,
            plainLanguageSummary:
              "Zadeklarowany dający zabezpieczenie nie został dopasowany do właściciela w KW.",
            source: src,
            whyItMatters:
              "Hipotekę ustanawia właściciel — trzeba potwierdzić jego umocowanie i zgodność z Działem II.",
            rankImpact: "POSSIBLE",
            expectedFromClient:
              "Wyjaśnienie roli i dokument potwierdzający prawo do nieruchomości.",
            requestedDocuments: [DOCS.ACQUISITION_BASIS, DOCS.ID_DOC],
            proposedResolution:
              "Potwierdź, że dający zabezpieczenie jest właścicielem z Działu II albo skoryguj role.",
            intermediaryMessage:
              "Osoba deklarowana jako dający zabezpieczenie nie jest widoczna w Dziale II. Wyjaśnij, kto jest właścicielem.",
            clientMessage:
              "Prosimy o potwierdzenie, kto jest właścicielem nieruchomości i ustanawia hipotekę.",
            investorMessage:
              "Dający zabezpieczenie nie dopasowany do Działu II — WSTRZYMANE do potwierdzenia własności.",
          }),
        );
      } else if (m.kind === "NO_MATCH" && m.party.role === "BORROWER") {
        // Pożyczkobiorca nie jest właścicielem — dopuszczalne, jeśli właściciel daje zabezpieczenie.
        out.push(
          mkFinding({
            ruleId: "R-IDENTITY",
            ruleVersion: V,
            category: "IDENTITY",
            status: "WARUNKOWO_DOPUSZCZALNE",
            title: "Pożyczkobiorca nie jest właścicielem",
            plainLanguageSummary:
              "Pożyczkobiorca nie występuje w Dziale II — dopuszczalne, jeśli właściciel świadomie ustanawia hipotekę.",
            source: src,
            whyItMatters:
              "Właściciel (dłużnik rzeczowy) musi ustanowić hipotekę na całej nieruchomości; nie mylić z poręczycielem osobistym.",
            rankImpact: "POSSIBLE",
            expectedFromClient:
              "Zgoda właściciela na obciążenie i ustanowienie hipoteki na całości.",
            requestedDocuments: [DOCS.ID_DOC],
            proposedResolution:
              "Potwierdź, że właściciel z Działu II przejdzie weryfikację i ustanowi hipotekę na całej nieruchomości.",
            agreementCondition: "Właściciel z Działu II ustanawia hipotekę na całej nieruchomości.",
            intermediaryMessage:
              "Pożyczkobiorca nie jest właścicielem. To OK, o ile właściciel zgadza się dać nieruchomość jako zabezpieczenie.",
            clientMessage:
              "Skoro pożyczkobiorca nie jest właścicielem, hipotekę ustanawia właściciel nieruchomości. Potrzebna jego zgoda.",
            investorMessage:
              "Pożyczkobiorca ≠ właściciel — dopuszczalne warunkowo, gdy właściciel (dłużnik rzeczowy) obciąży całość.",
          }),
        );
      }
      // Nieżyjący / małoletni właściciel — dodatkowe znaleziska.
      if (m.party.isDeceased) {
        out.push(
          mkFinding({
            ruleId: "R-IDENTITY",
            ruleVersion: V,
            category: "OWNERSHIP",
            status: "WSTRZYMANE",
            title: "Właściciel wpisany w KW nie żyje",
            plainLanguageSummary:
              "Właściciel z KW nie żyje — potrzebne potwierdzenie spadkobierców.",
            source: src,
            whyItMatters: "Hipotekę ustanawiają spadkobiercy; sam testament nie wystarcza.",
            rankImpact: "DIRECT",
            expectedFromClient:
              "APD albo prawomocne postanowienie o nabyciu spadku i ustalenie wszystkich spadkobierców.",
            requestedDocuments: [DOCS.INHERITANCE, DOCS.ESTATE_DIVISION],
            proposedResolution:
              "Ustal wszystkich spadkobierców; wszyscy ustanawiają hipotekę na całości albo wcześniej dział spadku.",
            agreementCondition:
              "Ujawnienie spadkobierców w Dziale II i hipoteka wszystkich na całości.",
            intermediaryMessage:
              "Właściciel z KW nie żyje. Potrzebny akt poświadczenia dziedziczenia i wszyscy spadkobiercy.",
            clientMessage:
              "Właściciel wpisany w KW nie żyje. Prosimy o dokument potwierdzający spadkobierców (APD lub postanowienie sądu).",
            investorMessage:
              "Nieżyjący właściciel — WSTRZYMANE; hipotekę ustanawiają wszyscy spadkobiercy (nie sam testament).",
          }),
        );
      }
      if (m.party.isMinor) {
        out.push(
          mkFinding({
            ruleId: "R-IDENTITY",
            ruleVersion: V,
            category: "OWNERSHIP",
            status: "WSTRZYMANE",
            title: "Właściciel małoletni / reprezentowany",
            plainLanguageSummary:
              "Właściciel jest małoletni lub reprezentowany — potrzebne wymagane zgody.",
            source: src,
            whyItMatters: "Obciążenie majątku małoletniego wymaga zgody sądu opiekuńczego.",
            expectedFromClient: "Zgoda sądu opiekuńczego i dokumenty przedstawiciela.",
            requestedDocuments: [DOCS.GUARDIAN_CONSENT],
            proposedResolution: "Uzyskaj zgodę sądu opiekuńczego przed ustanowieniem hipoteki.",
            agreementCondition: "Prawomocna zgoda sądu opiekuńczego.",
            intermediaryMessage:
              "Właściciel jest małoletni — bez zgody sądu opiekuńczego nie można ustanowić hipoteki.",
            clientMessage:
              "Ponieważ właściciel jest małoletni, potrzebna jest zgoda sądu opiekuńczego.",
            investorMessage: "Właściciel małoletni — WSTRZYMANE do zgody sądu opiekuńczego.",
          }),
        );
      }
    }
    return out;
  },
};

// ════════════════════════════════════════════════════════════════════════════
// B. Miejsce hipoteki / pierwszeństwo.
// ════════════════════════════════════════════════════════════════════════════

const ruleRank: Rule = {
  id: "R-RANK",
  version: V,
  run({ priority, policy, input }) {
    const rank = priority.expectedInvestorRank;
    // Niejednoznaczne → WSTRZYMANE.
    if (!priority.determinable || rank == null) {
      return [
        mkFinding({
          ruleId: "R-RANK",
          ruleVersion: V,
          category: "RANK",
          status: "WSTRZYMANE",
          title: "Miejsca hipoteki nie ustalono jednoznacznie",
          plainLanguageSummary:
            "Nie da się jeszcze jednoznacznie ustalić, na którym miejscu znajdzie się hipoteka inwestora.",
          source: priority.evidence.length
            ? priority.evidence
            : [
                {
                  section: "IV",
                  fieldCode: "4.4.1.10",
                  fieldLabel: "Pierwszeństwo",
                  rawValue: priority.explanation,
                },
              ],
          whyItMatters: priority.explanation,
          rankImpact: "UNKNOWN",
          expectedFromClient:
            "Dokumenty do ustalenia pierwszeństwa (wzmianki, zaświadczenia, pierwszeństwo).",
          requestedDocuments: [DOCS.MENTION_APPLICATION, DOCS.SENIOR_CERT],
          proposedResolution:
            priority.requiredConditions.join(" ") ||
            "Ręczna analiza pierwszeństwa na podstawie dokumentów.",
          agreementCondition: "Jednoznaczne ustalenie 1. lub dopuszczalnego 2. miejsca hipoteki.",
          intermediaryMessage:
            "Nie wiemy jeszcze, na którym miejscu będzie hipoteka. Zbierz dokumenty do ustalenia pierwszeństwa.",
          clientMessage:
            "Ustalamy kolejność hipotek na nieruchomości. Prosimy o dokumenty wskazane w wymaganiach.",
          investorMessage: `Miejsce hipoteki niejednoznaczne — WSTRZYMANE. ${priority.explanation}`,
        }),
      ];
    }
    if (rank >= 3) {
      return [
        mkFinding({
          ruleId: "R-RANK",
          ruleVersion: V,
          category: "RANK",
          status: "STOP",
          title: `Docelowe ${rank}. miejsce hipoteki`,
          plainLanguageSummary: `Hipoteka inwestora znalazłaby się na ${rank}. miejscu — to poza dopuszczalnym zakresem.`,
          source: priority.evidence,
          whyItMatters: "Finance You dopuszcza wyłącznie pierwsze lub warunkowo drugie miejsce.",
          rankImpact: "DIRECT",
          enforcementImpact: "POSSIBLE",
          expectedFromClient:
            "Zmniejszenie liczby wcześniejszych obciążeń (spłata/wykreślenie) albo zmiana zabezpieczenia.",
          requestedDocuments: [DOCS.PAYOFF_TERMS],
          proposedResolution:
            "Rozważ spłatę/wykreślenie wcześniejszych hipotek lub inne zabezpieczenie, aby uzyskać 1./2. miejsce.",
          intermediaryMessage: `Hipoteka wypadłaby na ${rank}. miejscu — to za daleko. Bez spłaty wcześniejszych hipotek nie zrobimy tej transakcji.`,
          clientMessage:
            "Na nieruchomości jest już kilka hipotek. W obecnym stanie nie możemy udzielić finansowania.",
          investorMessage: `Docelowe ${rank}. miejsce — STOP zgodnie z polityką (dopuszczalne tylko 1./2.).`,
        }),
      ];
    }
    if (rank === 2) {
      if (!policy.allowSecondRank) {
        return [
          mkFinding({
            ruleId: "R-RANK",
            ruleVersion: V,
            category: "RANK",
            status: "STOP",
            title: "Drugie miejsce niedopuszczalne wg polityki",
            plainLanguageSummary: "Polityka ryzyka wyłącza finansowanie na drugim miejscu.",
            source: priority.evidence,
            whyItMatters: "Bieżąca konfiguracja polityki dopuszcza wyłącznie pierwsze miejsce.",
            rankImpact: "DIRECT",
            expectedFromClient: "Uzyskanie pierwszego miejsca (spłata/wykreślenie).",
            proposedResolution: "Doprowadź do pierwszego miejsca hipoteki inwestora.",
            intermediaryMessage:
              "Polityka nie dopuszcza drugiego miejsca. Potrzebne pierwsze miejsce.",
            clientMessage: "W tym wariancie wymagane jest pierwsze miejsce hipoteki.",
            investorMessage: "Drugie miejsce wyłączone polityką — STOP.",
          }),
        ];
      }
      // Drugie miejsce dopuszczalne warunkowo — szczegóły zaświadczenia w regule R-SECOND-RANK-CERT.
      return [
        mkFinding({
          ruleId: "R-RANK",
          ruleVersion: V,
          category: "RANK",
          status: "WARUNKOWO_DOPUSZCZALNE",
          title: "Docelowe drugie miejsce hipoteki",
          plainLanguageSummary:
            "Hipoteka inwestora byłaby na drugim miejscu — dopuszczalne warunkowo (zaświadczenie + CLTV ≤ limit).",
          source: priority.evidence,
          whyItMatters:
            "Drugie miejsce wymaga ustalenia bieżącej i maksymalnej ekspozycji wierzyciela z pierwszego miejsca.",
          rankImpact: "DIRECT",
          expectedFromClient: "Aktualne zaświadczenie wierzyciela z pierwszego miejsca.",
          requestedDocuments: [DOCS.SENIOR_CERT],
          proposedResolution:
            "Uzyskaj kompletne zaświadczenie i przelicz CLTV — dopuszczalne, gdy CLTV ≤ limit polityki.",
          agreementCondition: "Kompletne zaświadczenie wierzyciela z 1. miejsca i CLTV w limicie.",
          payoutCondition:
            "Potwierdzona maksymalna ekspozycja poprzedzająca i CLTV ≤ limit polityki.",
          intermediaryMessage:
            "Hipoteka byłaby na drugim miejscu. To możliwe, ale najpierw potrzebujemy zaświadczenia od banku z pierwszego miejsca.",
          clientMessage:
            "Na nieruchomości jest już jedna hipoteka. Aby udzielić finansowania, potrzebujemy zaświadczenia od obecnego wierzyciela.",
          investorMessage:
            "Drugie miejsce — warunkowo dopuszczalne po zaświadczeniu wierzyciela z 1. miejsca i CLTV w limicie.",
        }),
      ];
    }
    // rank === 1 → korzystne.
    return [
      mkFinding({
        ruleId: "R-RANK",
        ruleVersion: V,
        category: "RANK",
        status: "KORZYSTNE",
        title: "Pierwsze miejsce hipoteki dostępne",
        plainLanguageSummary: priority.usesVacantRank
          ? "Inwestor może uzyskać pierwsze miejsce (dostępne opróżnione miejsce hipoteczne)."
          : "Brak wcześniejszych obciążeń — inwestor uzyska pierwsze miejsce.",
        source: priority.evidence.length
          ? priority.evidence
          : [
              {
                section: "IV",
                fieldCode: "4",
                fieldLabel: "Dział IV",
                rawValue: "Brak aktywnych hipotek.",
              },
            ],
        whyItMatters: "Pierwsze miejsce najlepiej zabezpiecza kapitał inwestora.",
        rankImpact: "DIRECT",
        expectedFromClient: priority.usesVacantRank
          ? "Oświadczenie o rozporządzeniu opróżnionym miejscem."
          : "Brak dodatkowych wymagań w zakresie pierwszeństwa.",
        requestedDocuments: priority.usesVacantRank ? [DOCS.VACANT_RANK_STATEMENT] : [],
        proposedResolution:
          "Złóż prawidłowy wniosek o wpis hipoteki inwestora na pierwszym miejscu.",
        intermediaryMessage: "Dobra wiadomość — hipoteka inwestora będzie na pierwszym miejscu.",
        clientMessage: "Nieruchomość nie ma wcześniejszych hipotek — to korzystna sytuacja.",
        investorMessage: `Przewidywane 1. miejsce hipoteki (ekspozycja ${input.newLoanExposure.toLocaleString("pl-PL")} PLN).`,
        confidence: 0.92,
      }),
    ];
  },
};

const ruleSecondRankCertificate: Rule = {
  id: "R-SECOND-RANK-CERT",
  version: V,
  run({ priority, input }) {
    if (priority.expectedInvestorRank !== 2 || !priority.determinable) return [];
    const cert = input.seniorCreditorCertificate;
    if (!cert) {
      return [
        mkFinding({
          ruleId: "R-SECOND-RANK-CERT",
          ruleVersion: V,
          category: "RANK",
          status: "WSTRZYMANE",
          title: "Brak zaświadczenia wierzyciela z pierwszego miejsca",
          plainLanguageSummary:
            "Dla drugiego miejsca brakuje aktualnego zaświadczenia wierzyciela z pierwszego miejsca.",
          source: priority.evidence,
          whyItMatters:
            "Bez zaświadczenia nie da się ustalić bieżącej ani maksymalnej ekspozycji poprzedzającej inwestora.",
          rankImpact: "DIRECT",
          expectedFromClient: "Aktualne, kompletne zaświadczenie wierzyciela z pierwszego miejsca.",
          requestedDocuments: [DOCS.SENIOR_CERT],
          proposedResolution:
            "Uzyskaj zaświadczenie (saldo, koszty, całkowita spłata, charakter odnawialny, maks. ekspozycja, rachunek, warunki wykreślenia).",
          agreementCondition: "Kompletne zaświadczenie i CLTV w limicie.",
          intermediaryMessage:
            "Brakuje zaświadczenia od banku z pierwszego miejsca. Bez niego nie policzymy drugiego miejsca.",
          clientMessage:
            "Prosimy o aktualne zaświadczenie od obecnego wierzyciela (bank/firma) o stanie zadłużenia.",
          investorMessage: "Drugie miejsce bez zaświadczenia wierzyciela — WSTRZYMANE.",
        }),
      ];
    }
    // Rewolwing bez znanej maksymalnej ekspozycji → STOP.
    if (cert.isRevolving && (cert.maxPossibleExposure == null || cert.maxPossibleExposure <= 0)) {
      return [
        mkFinding({
          ruleId: "R-SECOND-RANK-CERT",
          ruleVersion: V,
          category: "RANK",
          status: "STOP",
          title: "Dług z pierwszego miejsca może wzrosnąć (brak maks. ekspozycji)",
          plainLanguageSummary:
            "Zobowiązanie z pierwszego miejsca jest odnawialne, a maksymalnej ekspozycji nie da się ustalić.",
          source: priority.evidence,
          whyItMatters:
            "Rosnący dług poprzedzający może w każdej chwili wyprzedzić kapitał inwestora.",
          rankImpact: "DIRECT",
          expectedFromClient:
            "Ustalenie maksymalnej możliwej ekspozycji albo zmiana warunków (np. zamknięcie limitu).",
          requestedDocuments: [DOCS.SENIOR_CERT],
          proposedResolution:
            "Bez znanej maks. ekspozycji finansowanie na drugim miejscu nie jest dopuszczalne.",
          intermediaryMessage:
            "Pierwsza hipoteka zabezpiecza dług, który może rosnąć (np. limit/rewolwing). To blokuje drugie miejsce.",
          clientMessage:
            "Obecny kredyt może być odnawialny. Potrzebujemy informacji o maksymalnej możliwej kwocie zadłużenia.",
          investorMessage:
            "Pierwszy dług odnawialny bez znanej maks. ekspozycji — STOP dla 2. miejsca.",
        }),
      ];
    }
    return [
      mkFinding({
        ruleId: "R-SECOND-RANK-CERT",
        ruleVersion: V,
        category: "RANK",
        status: "WARUNKOWO_DOPUSZCZALNE",
        title: "Zaświadczenie wierzyciela z pierwszego miejsca dostarczone",
        plainLanguageSummary:
          "Zaświadczenie pozwala ustalić ekspozycję poprzedzającą — drugie miejsce dopuszczalne, o ile CLTV w limicie.",
        source: priority.evidence,
        whyItMatters:
          "Znana ekspozycja poprzedzająca umożliwia policzenie CLTV i decyzję o drugim miejscu.",
        rankImpact: "DIRECT",
        expectedFromClient: "Brak — zaświadczenie dostarczone; weryfikacja CLTV.",
        proposedResolution:
          "Zweryfikuj CLTV z ekspozycją z zaświadczenia; jeśli w limicie — dopuszczalne warunkowo.",
        agreementCondition: "CLTV ≤ limit polityki z ekspozycją poprzedzającą.",
        payoutCondition: "Kontrolowana wypłata z uwzględnieniem warunków wierzyciela z 1. miejsca.",
        intermediaryMessage:
          "Mamy zaświadczenie z pierwszego miejsca. Sprawdzamy, czy łączne obciążenie mieści się w limicie.",
        clientMessage:
          "Otrzymaliśmy zaświadczenie od obecnego wierzyciela — analizujemy możliwość finansowania.",
        investorMessage: "Zaświadczenie z 1. miejsca dostarczone — decyzja zależy od CLTV.",
        confidence: 0.9,
      }),
    ];
  },
};

const ruleCltv: Rule = {
  id: "R-CLTV",
  version: V,
  run({ ltv, policy }) {
    if (!ltv.determinable) {
      return [
        mkFinding({
          ruleId: "R-CLTV",
          ruleVersion: V,
          category: "VALUATION",
          status: "WSTRZYMANE",
          title: "Brak danych do LTV/CLTV",
          plainLanguageSummary:
            "Brakuje wartości nieruchomości lub wiarygodnego salda długu — nie pokazujemy pozytywnego LTV.",
          source: [
            {
              section: "IV",
              fieldCode: "4.4.1.2",
              fieldLabel: "Suma hipoteki",
              rawValue: ltv.note,
            },
          ],
          whyItMatters:
            "Bez wartości i salda nie da się ocenić bezpieczeństwa łącznego obciążenia.",
          rankImpact: "POSSIBLE",
          expectedFromClient: "Zaakceptowana wartość nieruchomości i saldo długu poprzedzającego.",
          requestedDocuments: [DOCS.VALUATION, DOCS.SENIOR_CERT],
          proposedResolution:
            "Uzupełnij wartość nieruchomości i saldo z zaświadczenia; przelicz CLTV.",
          intermediaryMessage:
            "Nie mamy pełnych danych do policzenia LTV. Potrzebna wartość nieruchomości i saldo długu.",
          clientMessage:
            "Do oceny potrzebujemy wyceny nieruchomości i informacji o obecnym zadłużeniu.",
          investorMessage: "BRAK DANYCH / WSTRZYMANE — LTV/CLTV nieobliczalne.",
        }),
      ];
    }
    if (ltv.withinPolicy === false) {
      return [
        mkFinding({
          ruleId: "R-CLTV",
          ruleVersion: V,
          category: "VALUATION",
          status: "STOP",
          title: `CLTV przekracza limit polityki (${Math.round(policy.maxCltv * 100)}%)`,
          plainLanguageSummary: `Łączne obciążenie (${ltv.cltv != null ? Math.round(ltv.cltv * 100) : "?"}%) przekracza dopuszczalny limit.`,
          source: [
            {
              section: "IV",
              fieldCode: "4.4.1.2",
              fieldLabel: "Suma hipoteki",
              rawValue: ltv.note,
            },
          ],
          whyItMatters: "Zbyt wysokie łączne obciążenie zagraża odzyskaniu kapitału w egzekucji.",
          rankImpact: "POSSIBLE",
          enforcementImpact: "DIRECT",
          expectedFromClient:
            "Niższa kwota pożyczki, wyższa wartość zabezpieczenia albo spłata długu poprzedzającego.",
          proposedResolution:
            "Zmniejsz ekspozycję albo zwiększ wartość zabezpieczenia, aby CLTV zmieścił się w limicie.",
          intermediaryMessage:
            "Łączne obciążenie jest za wysokie. Trzeba zmniejszyć kwotę pożyczki lub spłacić wcześniejszy dług.",
          clientMessage:
            "Suma zobowiązań w stosunku do wartości nieruchomości jest za wysoka dla tej pożyczki.",
          investorMessage: `CLTV ${ltv.cltv != null ? Math.round(ltv.cltv * 100) : "?"}% > limit ${Math.round(policy.maxCltv * 100)}% — STOP.`,
        }),
      ];
    }
    return [
      mkFinding({
        ruleId: "R-CLTV",
        ruleVersion: V,
        category: "VALUATION",
        status: "BRAK_PROBLEMU",
        title: `CLTV w limicie (${ltv.cltv != null ? Math.round(ltv.cltv * 100) : "?"}%)`,
        plainLanguageSummary: "Łączne obciążenie mieści się w limicie polityki.",
        source: [
          { section: "IV", fieldCode: "4.4.1.2", fieldLabel: "Suma hipoteki", rawValue: ltv.note },
        ],
        whyItMatters: "Bezpieczny poziom łącznego obciążenia sprzyja odzyskaniu kapitału.",
        expectedFromClient: "Brak.",
        proposedResolution: "Brak działań.",
        intermediaryMessage: "Łączne obciążenie mieści się w limicie.",
        clientMessage: "Poziom zadłużenia względem wartości nieruchomości jest akceptowalny.",
        investorMessage: `CLTV ${ltv.cltv != null ? Math.round(ltv.cltv * 100) : "?"}% ≤ limit ${Math.round(policy.maxCltv * 100)}%.`,
        confidence: 0.9,
      }),
    ];
  },
};

const ruleVacantRank: Rule = {
  id: "R-VACANT-RANK",
  version: V,
  run({ nlr }) {
    if (nlr.vacantRankRights.length === 0) return [];
    return [
      mkFinding({
        ruleId: "R-VACANT-RANK",
        ruleVersion: V,
        category: "RANK",
        status: "WARUNKOWO_DOPUSZCZALNE",
        title: "Opróżnione miejsce hipoteczne",
        plainLanguageSummary:
          "Opróżnione miejsce nie jest problemem — może być korzystne, jeśli właściciel rozporządzi nim na rzecz inwestora.",
        source: nlr.vacantRankRights.map((v) => v.evidence),
        whyItMatters:
          "Skuteczne rozporządzenie opróżnionym miejscem może dać inwestorowi lepsze pierwszeństwo.",
        rankImpact: "POSSIBLE",
        expectedFromClient:
          "Oświadczenie o rozporządzeniu opróżnionym miejscem i prawidłowy wniosek.",
        requestedDocuments: [DOCS.VACANT_RANK_STATEMENT],
        proposedResolution:
          "Do czasu weryfikacji dokumentów: KORZYSTNE WARUNKOWO — nie zakładaj automatycznie pewnego pierwszego miejsca.",
        agreementCondition:
          "Prawidłowe rozporządzenie opróżnionym miejscem na rzecz hipoteki inwestora.",
        intermediaryMessage:
          "Jest opróżnione miejsce hipoteczne — to raczej dobra wiadomość. Potrzebne oświadczenie właściciela i wniosek.",
        clientMessage:
          "Na nieruchomości jest wolne miejsce po dawnej hipotece. Można je wykorzystać na korzyść finansowania.",
        investorMessage:
          "Opróżnione miejsce (4.8) — KORZYSTNE WARUNKOWO po prawidłowym rozporządzeniu; nie jest to jeszcze wpisane pierwsze miejsce.",
        confidence: 0.85,
      }),
    ];
  },
};

const ruleJointOrCreditor: Rule = {
  id: "R-MORTGAGE-DEPENDENCIES",
  version: V,
  run({ nlr }) {
    const out: KwFinding[] = [];
    for (const m of nlr.mortgages.filter((x) => x.isActive)) {
      if (m.jointBooks.length > 0 || (m.kind ?? "").includes("ŁĄCZNA")) {
        out.push(
          mkFinding({
            ruleId: "R-MORTGAGE-DEPENDENCIES",
            ruleVersion: V,
            category: "MORTGAGE",
            status: "WSTRZYMANE",
            title: "Hipoteka łączna",
            plainLanguageSummary:
              "Wpisana hipoteka obciąża także inne księgi — trzeba ustalić wszystkie współobciążone KW.",
            source: [m.evidence],
            whyItMatters:
              "Zasady zwolnienia zabezpieczenia zależą od wszystkich współobciążonych nieruchomości.",
            rankImpact: "POSSIBLE",
            enforcementImpact: "POSSIBLE",
            expectedFromClient: "Identyfikacja wszystkich współobciążonych KW i zasad zwolnienia.",
            requestedDocuments: [DOCS.SENIOR_CERT],
            proposedResolution:
              "Zbierz listę współobciążonych ksiąg i warunki zwolnienia hipoteki łącznej.",
            intermediaryMessage:
              "To hipoteka łączna — obciąża też inne nieruchomości. Ustal wszystkie księgi objęte tą hipoteką.",
            clientMessage:
              "Hipoteka obejmuje więcej niż jedną nieruchomość. Prosimy o informację o pozostałych księgach.",
            investorMessage: `Hipoteka łączna${m.jointBooks.length ? " (KW: " + m.jointBooks.join(", ") + ")" : ""} — WSTRZYMANE do identyfikacji współobciążeń.`,
          }),
        );
      }
      if (m.otherInfo && /zaj[ęe]ci|cesj|przelew/i.test(m.otherInfo)) {
        out.push(
          mkFinding({
            ruleId: "R-MORTGAGE-DEPENDENCIES",
            ruleVersion: V,
            category: "MORTGAGE",
            status: "WSTRZYMANE",
            title: "Niejasny aktualny wierzyciel (cesja/zajęcie wierzytelności)",
            plainLanguageSummary:
              "Wierzyciel mógł się zmienić (cesja/przelew) albo wierzytelność hipoteczna została zajęta.",
            source: [m.evidence],
            whyItMatters:
              "Bez potwierdzenia aktualnego uprawnionego nie da się bezpiecznie ustalić warunków spłaty/zwolnienia.",
            rankImpact: "POSSIBLE",
            expectedFromClient: "Dokument potwierdzający aktualnego uprawnionego / organ.",
            requestedDocuments: [DOCS.CREDITOR_ASSIGNMENT],
            proposedResolution:
              "Potwierdź aktualnego wierzyciela/uprawnionego przed dalszymi krokami.",
            intermediaryMessage:
              "Nie jest jasne, kto jest teraz wierzycielem (możliwa cesja lub zajęcie). Trzeba to potwierdzić.",
            clientMessage: "Prosimy o informację, kto jest obecnie wierzycielem z tej hipoteki.",
            investorMessage: `Niejasny wierzyciel (${m.otherInfo}) — WSTRZYMANE do potwierdzenia aktualnego uprawnionego.`,
          }),
        );
      }
    }
    return out;
  },
};

// ════════════════════════════════════════════════════════════════════════════
// C. Skuteczność obciążenia / egzekucja (Dział III).
// ════════════════════════════════════════════════════════════════════════════

const ruleSectionThree: Rule = {
  id: "R-SECTION-III",
  version: V,
  run({ nlr, policy }) {
    const out: KwFinding[] = [];
    for (const e of nlr.sectionThreeEntries.filter((x) => x.isActive)) {
      const base = {
        ruleId: "R-SECTION-III",
        ruleVersion: V,
        source: [e.evidence],
      };
      switch (e.kind) {
        case "ENFORCEMENT":
          out.push(
            mkFinding({
              ...base,
              category: "ENFORCEMENT",
              status: "STOP",
              title: "Egzekucja / zajęcie nieruchomości",
              plainLanguageSummary: "W Dziale III jest wpis o egzekucji lub zajęciu nieruchomości.",
              whyItMatters:
                "Po zajęciu nowa hipoteka nie jest zwykłym rozwiązaniem — realne ryzyko dla egzekucji i odzyskania kapitału.",
              rankImpact: "DIRECT",
              enforcementImpact: "DIRECT",
              expectedFromClient: "Prawomocne zakończenie egzekucji i podstawa wykreślenia.",
              requestedDocuments: [DOCS.ENFORCEMENT_CLOSURE],
              proposedResolution:
                "Nie proponuj nowej hipoteki po zajęciu jako zwykłego rozwiązania — wymagane usunięcie wpisu.",
              intermediaryMessage:
                "Jest egzekucja/zajęcie — to blokuje transakcję. Potrzebne prawomocne zakończenie i wykreślenie.",
              clientMessage:
                "Na nieruchomości toczy się egzekucja/zajęcie. W tym stanie nie możemy udzielić finansowania.",
              investorMessage: "Egzekucja/zajęcie (Dział III) — STOP.",
            }),
          );
          break;
        case "WARNING_MISMATCH":
          out.push(
            mkFinding({
              ...base,
              category: "OWNERSHIP",
              status: "STOP",
              title: "Ostrzeżenie o niezgodności stanu prawnego",
              plainLanguageSummary:
                "Wpisane ostrzeżenie o niezgodności stanu prawnego z rzeczywistym.",
              whyItMatters:
                "Stan prawny może nie odpowiadać rzeczywistemu właścicielowi — ryzyko dla skuteczności hipoteki.",
              rankImpact: "DIRECT",
              enforcementImpact: "POSSIBLE",
              expectedFromClient: "Prawomocne usunięcie niezgodności albo wyjaśnienie treści.",
              requestedDocuments: [DOCS.ACQUISITION_BASIS, DOCS.MENTION_APPLICATION],
              proposedResolution:
                "Zależnie od treści: STOP do prawomocnego usunięcia albo WSTRZYMANE do analizy.",
              intermediaryMessage:
                "Jest ostrzeżenie o niezgodności stanu prawnego. Trzeba wyjaśnić, kto naprawdę jest właścicielem.",
              clientMessage:
                "W księdze jest ostrzeżenie o niezgodności stanu prawnego. Prosimy o wyjaśnienie i dokumenty.",
              investorMessage: "Ostrzeżenie o niezgodności — STOP/WSTRZYMANE zależnie od treści.",
            }),
          );
          break;
        case "PROHIBITION":
          out.push(
            mkFinding({
              ...base,
              category: "RIGHT_OR_CLAIM",
              status: "STOP",
              title: "Zakaz zbywania / obciążania",
              plainLanguageSummary: "Wpisany zakaz zbywania albo obciążania nieruchomości.",
              whyItMatters: "Zakaz uniemożliwia skuteczne ustanowienie hipoteki.",
              rankImpact: "DIRECT",
              enforcementImpact: "DIRECT",
              expectedFromClient: "Usunięcie przeszkody (podstawa zniesienia zakazu).",
              proposedResolution: "STOP do usunięcia zakazu.",
              intermediaryMessage:
                "Jest zakaz obciążania nieruchomości — bez jego usunięcia nie da się ustanowić hipoteki.",
              clientMessage:
                "W księdze jest zakaz obciążania nieruchomości. Trzeba go najpierw usunąć.",
              investorMessage: "Zakaz zbywania/obciążania — STOP do usunięcia.",
            }),
          );
          break;
        case "INSOLVENCY":
          out.push(
            mkFinding({
              ...base,
              category: "OWNERSHIP",
              status: "WSTRZYMANE",
              title: "Upadłość / restrukturyzacja / zarządca",
              plainLanguageSummary:
                "Wpis o upadłości, likwidacji, restrukturyzacji, zarządcy lub syndyku.",
              whyItMatters:
                "Ograniczenie reprezentacji/rozporządzania może uniemożliwić skuteczne obciążenie.",
              rankImpact: "POSSIBLE",
              enforcementImpact: "POSSIBLE",
              expectedFromClient: "Dokumenty o umocowaniu (syndyk/zarządca) i zgodę na obciążenie.",
              requestedDocuments: [DOCS.ACQUISITION_BASIS],
              proposedResolution: "Zależnie od treści i umocowania: WSTRZYMANE/STOP.",
              intermediaryMessage:
                "Jest wpis o upadłości/zarządcy. Trzeba sprawdzić, kto może rozporządzać nieruchomością.",
              clientMessage:
                "W księdze jest wpis dotyczący upadłości/zarządu. Prosimy o dokumenty wyjaśniające.",
              investorMessage: "Upadłość/zarządca — WSTRZYMANE/STOP zależnie od umocowania.",
            }),
          );
          break;
        case "OWNERSHIP_CLAIM":
          out.push(
            mkFinding({
              ...base,
              category: "RIGHT_OR_CLAIM",
              status: "WSTRZYMANE",
              title: "Roszczenie o przeniesienie własności",
              plainLanguageSummary:
                "Wpisane roszczenie osoby trzeciej / nabywcy / dewelopera o przeniesienie własności.",
              whyItMatters:
                "Roszczenie wcześniejsze od hipoteki inwestora może doprowadzić do utraty własności lub pierwszeństwa.",
              rankImpact: "DIRECT",
              enforcementImpact: "POSSIBLE",
              expectedFromClient: "Analiza osoby uprawnionej, daty i relacji z transakcją.",
              requestedDocuments: [DOCS.ACQUISITION_BASIS],
              proposedResolution:
                "Zależnie od pierwszeństwa: WSTRZYMANE, a gdy grozi utratą własności/pierwszeństwa — STOP.",
              intermediaryMessage:
                "Ktoś ma roszczenie o przeniesienie własności. Trzeba sprawdzić, czy wyprzedza naszą hipotekę.",
              clientMessage:
                "W księdze jest roszczenie dotyczące własności. Prosimy o wyjaśnienie i dokumenty.",
              investorMessage:
                "Roszczenie o przeniesienie własności — WSTRZYMANE/STOP zależnie od pierwszeństwa.",
            }),
          );
          break;
        case "MORTGAGE_CLAIM":
          out.push(
            mkFinding({
              ...base,
              category: "RANK",
              status: "WSTRZYMANE",
              title: "Roszczenie o ustanowienie hipoteki",
              plainLanguageSummary: "Wpisane roszczenie o ustanowienie konkurencyjnej hipoteki.",
              whyItMatters: "Może wyprzedzić hipotekę inwestora zależnie od pierwszeństwa.",
              rankImpact: "DIRECT",
              expectedFromClient: "Dokumenty do ustalenia pierwszeństwa roszczenia.",
              requestedDocuments: [DOCS.MENTION_APPLICATION],
              proposedResolution: "Ustal pierwszeństwo; WSTRZYMANE/STOP zależnie od wyniku.",
              intermediaryMessage:
                "Jest roszczenie o wpis innej hipoteki. Trzeba ustalić, czy będzie przed naszą.",
              clientMessage:
                "W księdze jest roszczenie dotyczące innej hipoteki. Prosimy o dokumenty.",
              investorMessage:
                "Roszczenie o ustanowienie hipoteki — WSTRZYMANE/STOP zależnie od pierwszeństwa.",
            }),
          );
          break;
        case "LIFE_ESTATE":
          out.push(
            mkFinding({
              ...base,
              category: "ENFORCEMENT",
              status: policy.lifeEstateStatus,
              title: "Dożywocie",
              plainLanguageSummary: "Wpisane dożywocie — istotne ryzyko dla egzekucji i wartości.",
              whyItMatters:
                "Dożywocie może przetrwać egzekucję i istotnie obniżać wartość oraz zbywalność.",
              rankImpact: "POSSIBLE",
              enforcementImpact: "DIRECT",
              expectedFromClient: "Dokument ustanawiający i wycena uwzględniająca obciążenie.",
              requestedDocuments: [DOCS.EASEMENT_DOC, DOCS.VALUATION],
              proposedResolution: "Zgodnie z polityką: STOP lub obowiązkowa ręczna decyzja prawna.",
              intermediaryMessage:
                "Jest dożywocie — poważnie utrudnia egzekucję i obniża wartość. Wymaga decyzji prawnej.",
              clientMessage:
                "Na nieruchomości jest prawo dożywocia. Wpływa ono na wartość zabezpieczenia.",
              investorMessage: "Dożywocie (Dział III) — istotne ryzyko egzekucji i wartości.",
            }),
          );
          break;
        case "PERSONAL_EASEMENT_FLAT":
          out.push(
            mkFinding({
              ...base,
              category: "ENFORCEMENT",
              status: policy.personalEasementStatus,
              title: "Służebność osobista mieszkania",
              plainLanguageSummary:
                "Wpisana służebność osobista mieszkania — ryzyko posiadania, sprzedaży i wartości.",
              whyItMatters:
                "Uprawniony może korzystać z lokalu mimo zmiany właściciela — obniża wartość i utrudnia sprzedaż egzekucyjną.",
              rankImpact: "POSSIBLE",
              enforcementImpact: "DIRECT",
              expectedFromClient: "Dokument ustanawiający, analiza pierwszeństwa i wycena.",
              requestedDocuments: [DOCS.EASEMENT_DOC, DOCS.VALUATION],
              proposedResolution: "STOP albo WSTRZYMANE do analizy wyceny i pierwszeństwa.",
              intermediaryMessage:
                "Jest służebność mieszkania — ktoś ma prawo tam mieszkać. To obniża wartość i utrudnia sprzedaż.",
              clientMessage:
                "Na nieruchomości jest służebność mieszkania. Wpływa na wartość zabezpieczenia.",
              investorMessage:
                "Służebność osobista mieszkania — STOP/WSTRZYMANE do analizy wyceny i pierwszeństwa.",
            }),
          );
          break;
        case "USUFRUCT":
          out.push(
            mkFinding({
              ...base,
              category: "ENFORCEMENT",
              status: "WSTRZYMANE",
              title: "Użytkowanie nieruchomości przez osobę trzecią",
              plainLanguageSummary: "Wpisane użytkowanie — ryzyko wartości i egzekucji.",
              whyItMatters: "Użytkowanie może obniżać wartość i utrudniać sprzedaż egzekucyjną.",
              rankImpact: "POSSIBLE",
              enforcementImpact: "POSSIBLE",
              expectedFromClient: "Dokumenty i wycena uwzględniająca obciążenie.",
              requestedDocuments: [DOCS.EASEMENT_DOC, DOCS.VALUATION],
              proposedResolution: "Uzyskaj dokumenty i wycenę uwzględniającą użytkowanie.",
              intermediaryMessage:
                "Jest prawo użytkowania nieruchomości przez inną osobę. Potrzebna wycena z tym obciążeniem.",
              clientMessage: "Na nieruchomości jest prawo użytkowania. Prosimy o dokumenty.",
              investorMessage:
                "Użytkowanie przez osobę trzecią — WSTRZYMANE do dokumentów i wyceny.",
            }),
          );
          break;
        case "LEASE":
          out.push(
            mkFinding({
              ...base,
              category: "RIGHT_OR_CLAIM",
              status: "WSTRZYMANE",
              title: "Najem / dzierżawa",
              plainLanguageSummary:
                "Wpisany najem albo dzierżawa — wymaga pełnej umowy i warunków.",
              whyItMatters:
                "Warunki najmu/dzierżawy mogą wpływać na wartość, wydanie nieruchomości i egzekucję.",
              rankImpact: "NONE",
              enforcementImpact: "POSSIBLE",
              expectedFromClient: "Pełna umowa i aneksy: termin, czynsz, wypowiedzenie, wydanie.",
              requestedDocuments: [DOCS.LEASE_AGREEMENT],
              proposedResolution: "Zbierz umowę i oceń wpływ na wartość/egzekucję.",
              intermediaryMessage:
                "Jest najem/dzierżawa. Poproś o całą umowę z aneksami (termin, czynsz, wypowiedzenie).",
              clientMessage:
                "Na nieruchomości jest umowa najmu/dzierżawy. Prosimy o pełną umowę z aneksami.",
              investorMessage: "Najem/dzierżawa (Dział III) — WSTRZYMANE do umowy i warunków.",
            }),
          );
          break;
        case "ROAD_EASEMENT":
        case "TRANSMISSION_EASEMENT":
          out.push(
            mkFinding({
              ...base,
              category: "VALUATION",
              status: "INFORMACYJNE",
              title: e.kindLabel,
              plainLanguageSummary:
                "Służebność drogi koniecznej/przesyłu — nie zawsze bloker; może przetrwać egzekucję i wpływać na wartość.",
              whyItMatters: "Wpływa na wartość i powinna być uwzględniona w wycenie.",
              rankImpact: "NONE",
              enforcementImpact: "POSSIBLE",
              expectedFromClient: "Uwzględnienie w wycenie.",
              requestedDocuments: [DOCS.VALUATION],
              proposedResolution: "Przekaż rzeczoznawcy do uwzględnienia w wycenie.",
              intermediaryMessage:
                "Jest służebność drogi/przesyłu — zwykle nie blokuje, ale wpływa na wartość.",
              clientMessage:
                "Na nieruchomości jest służebność drogi/przesyłu. Uwzględnimy ją w wycenie.",
              investorMessage: `${e.kindLabel} — informacyjne; uwzględnić w wycenie.`,
            }),
          );
          break;
        case "LAND_EASEMENT":
          out.push(
            mkFinding({
              ...base,
              category: "VALUATION",
              status: "INFORMACYJNE",
              title: "Służebność gruntowa",
              plainLanguageSummary:
                "Służebność gruntowa — informacja dla rzeczoznawcy; przy istotnym ograniczeniu zabudowy WSTRZYMANE.",
              whyItMatters: "Może ograniczać zabudowę/korzystanie i wpływać na wartość.",
              rankImpact: "NONE",
              enforcementImpact: "POSSIBLE",
              expectedFromClient: "Ocena zakresu w wycenie.",
              requestedDocuments: [DOCS.VALUATION],
              proposedResolution: "Oceń zakres; przy istotnym ograniczeniu — WSTRZYMANE.",
              intermediaryMessage:
                "Jest służebność gruntowa. Zwykle informacyjna, chyba że mocno ogranicza korzystanie.",
              clientMessage:
                "Na nieruchomości jest służebność gruntowa — uwzględnimy ją w wycenie.",
              investorMessage:
                "Służebność gruntowa — informacyjne / WSTRZYMANE zależnie od zakresu.",
            }),
          );
          break;
        case "PREEMPTION":
          out.push(
            mkFinding({
              ...base,
              category: "RIGHT_OR_CLAIM",
              status: "INFORMACYJNE",
              title: "Prawo pierwokupu / odkupu",
              plainLanguageSummary:
                "Prawo pierwokupu/odkupu — co do zasady informacyjne, wpływa na proces sprzedaży.",
              whyItMatters:
                "Może wpływać na sprzedaż egzekucyjną, chyba że treść/pierwszeństwo tworzą realny konflikt.",
              rankImpact: "NONE",
              enforcementImpact: "POSSIBLE",
              expectedFromClient: "Treść uprawnienia do oceny.",
              proposedResolution: "Oceń treść; zwykle informacyjne.",
              intermediaryMessage:
                "Jest prawo pierwokupu/odkupu. Zwykle nie blokuje, ale wpływa na sprzedaż.",
              clientMessage:
                "Na nieruchomości jest prawo pierwokupu/odkupu — to informacja do procesu sprzedaży.",
              investorMessage:
                "Prawo pierwokupu/odkupu — informacyjne, chyba że konkretna treść tworzy konflikt.",
            }),
          );
          break;
        case "CO_ENCUMBRANCE":
          out.push(
            mkFinding({
              ...base,
              category: "PROPERTY_SCOPE",
              status: "WSTRZYMANE",
              title: "Współobciążenie innej nieruchomości",
              plainLanguageSummary:
                "Wpis współobciążający inną nieruchomość — ustal zakres i powiązane KW.",
              whyItMatters: "Zakres zabezpieczenia i zwolnienia zależy od powiązanych ksiąg.",
              rankImpact: "POSSIBLE",
              expectedFromClient: "Wskazanie powiązanych KW i zakresu.",
              proposedResolution: "Ustal zakres i powiązane księgi.",
              intermediaryMessage:
                "Wpis obejmuje też inną nieruchomość. Ustal, których ksiąg dotyczy.",
              clientMessage:
                "Wpis dotyczy także innej nieruchomości. Prosimy o informację o powiązanych księgach.",
              investorMessage: "Współobciążenie innej KW — WSTRZYMANE do ustalenia zakresu.",
            }),
          );
          break;
        case "OTHER":
          out.push(
            mkFinding({
              ...base,
              category: "DATA_QUALITY",
              status: "WSTRZYMANE",
              title: "Wpis Działu III wymaga ręcznej analizy",
              plainLanguageSummary:
                "Nie udało się jednoznacznie sklasyfikować wpisu — wymaga ręcznej analizy.",
              whyItMatters:
                "Niejednoznaczny wpis może wpływać na egzekucję/wartość — nie pomijamy go.",
              rankImpact: "UNKNOWN",
              enforcementImpact: "UNKNOWN",
              expectedFromClient: "Wyjaśnienie treści wpisu i dokumenty źródłowe.",
              requestedDocuments: [DOCS.MENTION_APPLICATION],
              proposedResolution: "Przeanalizuj treść wpisu ręcznie i sklasyfikuj.",
              intermediaryMessage:
                "Jest wpis, którego nie umiemy automatycznie ocenić. Zajmie się nim analityk.",
              clientMessage: NEUTRAL_MESSAGE,
              investorMessage: "Niejednoznaczny wpis Działu III — WSTRZYMANE do ręcznej analizy.",
            }),
          );
          break;
      }
    }
    return out;
  },
};

// ── Wzmianki (wszystkie działy). ─────────────────────────────────────────────
const ruleMentions: Rule = {
  id: "R-MENTIONS",
  version: V,
  run({ nlr }) {
    const active = nlr.mentions.filter((m) => m.isActive);
    if (active.length === 0) return [];
    return active.map((m) =>
      mkFinding({
        ruleId: "R-MENTIONS",
        ruleVersion: V,
        category: "MENTION",
        status: "WSTRZYMANE",
        title: `Aktywna wzmianka (Dział ${m.section.replace("_", "-")})`,
        plainLanguageSummary:
          "Aktywna wzmianka oznacza złożony, nierozpoznany jeszcze wniosek — nie mylić z wpisaną zmianą.",
        source: [m.evidence],
        detectedValue: { dzKwNumber: m.dzKwNumber },
        whyItMatters:
          "Wcześniejszy wniosek może mieć pierwszeństwo i być niekorzystny mimo późniejszej pozytywnej wzmianki. Odróżnij: WNIOSEK ZŁOŻONY / WZMIANKA AKTYWNA / HIPOTEKA WPISANA.",
        rankImpact: "POSSIBLE",
        enforcementImpact: "POSSIBLE",
        expectedFromClient:
          "Wniosek KW, potwierdzenie Dz.Kw, wszystkie załączniki i podstawa żądania.",
        requestedDocuments: [DOCS.MENTION_APPLICATION],
        proposedResolution:
          "Zweryfikuj dokumenty każdej aktywnej wzmianki (także wcześniejszej) — dopiero wtedy można ją uznać za pozytywną/kontrolowaną.",
        agreementCondition: "Wyjaśnienie treści i skutku wszystkich aktywnych wzmianek.",
        intermediaryMessage: `Jest aktywna wzmianka${m.dzKwNumber ? " (" + m.dzKwNumber + ")" : ""}. Poproś klienta o wniosek KW, potwierdzenie złożenia i załączniki.`,
        clientMessage:
          "W księdze jest wzmianka o złożonym wniosku. Prosimy o kopię wniosku, potwierdzenie złożenia (Dz.Kw) i załączniki.",
        investorMessage: `Aktywna wzmianka w Dziale ${m.section.replace("_", "-")} — WSTRZYMANE do weryfikacji dokumentów (wniosek ≠ wpis).`,
      }),
    );
  },
};

// ── Komentarze migracyjne (Dział I-IV). ──────────────────────────────────────
const ruleMigration: Rule = {
  id: "R-MIGRATION",
  version: V,
  run({ nlr }) {
    // Komentarz migracyjny w IV obsługuje priorytet; tutaj traktujemy pozostałe
    // działy jako WSTRZYMANE (niejasny komentarz nigdy nie jest pomijany).
    return nlr.migrationComments
      .filter((c) => c.section !== "COVER")
      .map((c) =>
        mkFinding({
          ruleId: "R-MIGRATION",
          ruleVersion: V,
          category: "DATA_QUALITY",
          status: "WSTRZYMANE",
          title: `Komentarz migracyjny (Dział ${c.section.replace("_", "-")})`,
          plainLanguageSummary:
            "Niejasny komentarz migracyjny — wymaga oceny, nigdy automatycznego pominięcia.",
          source: [c],
          whyItMatters:
            "Komentarz migracyjny może wskazywać na niespójności po migracji z ksiąg papierowych.",
          rankImpact: "UNKNOWN",
          expectedFromClient: "Wyjaśnienie treści komentarza (ewentualnie z sądu).",
          proposedResolution:
            "Oceń komentarz ręcznie; przy wpływie na pierwszeństwo/własność podnieś status.",
          intermediaryMessage:
            "Jest komentarz migracyjny, którego nie da się jednoznacznie ocenić. Zajmie się nim analityk.",
          clientMessage: NEUTRAL_MESSAGE,
          investorMessage: `Komentarz migracyjny (Dział ${c.section.replace("_", "-")}) — WSTRZYMANE do ręcznej oceny.`,
        }),
      );
  },
};

// ── Udział w drodze jako zabezpieczenie dodatkowe (pozytywne rozpoznanie). ────
const ruleRoadShare: Rule = {
  id: "R-ROAD-SHARE",
  version: V,
  run({ nlr }) {
    const roadShare = nlr.associatedRights.find(
      (r) => r.kind === "ROAD_SHARE" || r.kind === "ROAD_ACCESS",
    );
    const shareInCommon = nlr.associatedRights.find((r) => r.kind === "SHARE_IN_COMMON");
    const out: KwFinding[] = [];
    if (roadShare) {
      out.push(
        mkFinding({
          ruleId: "R-ROAD-SHARE",
          ruleVersion: V,
          category: "PROPERTY_SCOPE",
          status: "INFORMACYJNE",
          title: "Udział w drodze dojazdowej",
          plainLanguageSummary:
            "Udział w drodze to dopuszczalne zabezpieczenie dodatkowe do pełnej własności nieruchomości głównej — nie mylić z niedopuszczalnym udziałem w nieruchomości głównej.",
          source: [roadShare.evidence],
          whyItMatters:
            "Sam udział w drodze nie może być głównym zabezpieczeniem, ale jako dodatkowy jest dopuszczalny.",
          expectedFromClient:
            "Potwierdzenie, że głównym zabezpieczeniem jest pełne prawo do nieruchomości głównej.",
          proposedResolution: "Traktuj udział w drodze jako zabezpieczenie dodatkowe.",
          intermediaryMessage:
            "Jest udział w drodze dojazdowej — to normalne i dopuszczalne jako dodatek do głównej nieruchomości.",
          clientMessage:
            "Udział w drodze dojazdowej jest zwykłym elementem — nie stanowi problemu.",
          investorMessage:
            "Udział w drodze — dopuszczalny jako zabezpieczenie dodatkowe (nie główne).",
          confidence: 0.85,
        }),
      );
    }
    if (shareInCommon) {
      out.push(
        mkFinding({
          ruleId: "R-ROAD-SHARE",
          ruleVersion: V,
          category: "PROPERTY_SCOPE",
          status: "BRAK_PROBLEMU",
          title: "Udział w nieruchomości wspólnej związany z lokalem",
          plainLanguageSummary:
            "Udział w nieruchomości wspólnej to element prawa do lokalu, a nie niedopuszczalny samodzielny udział.",
          source: [shareInCommon.evidence],
          whyItMatters: "Nie należy błędnie uznać go za zabezpieczenie na udziale.",
          expectedFromClient: "Brak.",
          proposedResolution: "Brak działań — element prawa do lokalu.",
          intermediaryMessage: "Udział w częściach wspólnych to normalny element własności lokalu.",
          clientMessage:
            "Udział w częściach wspólnych budynku to zwykły element własności mieszkania.",
          investorMessage:
            "Udział w nieruchomości wspólnej związany z lokalem — element prawa do lokalu, nie problem.",
          confidence: 0.9,
        }),
      );
    }
    return out;
  },
};

// ── Wygasający okres użytkowania wieczystego. ────────────────────────────────
const rulePerpetualUsufruct: Rule = {
  id: "R-PERPETUAL-USUFRUCT",
  version: V,
  run({ nlr }) {
    const puw = nlr.associatedRights.find((r) => r.kind === "PERPETUAL_USUFRUCT");
    if (!puw) return [];
    return [
      mkFinding({
        ruleId: "R-PERPETUAL-USUFRUCT",
        ruleVersion: V,
        category: "VALUATION",
        status: "INFORMACYJNE",
        title: "Użytkowanie wieczyste",
        plainLanguageSummary:
          "Prawo użytkowania wieczystego — sprawdź okres względem okresu pożyczki i wpływ na wartość.",
        source: [puw.evidence],
        whyItMatters:
          "Krótki pozostały okres użytkowania wieczystego wpływa na wartość i okres zabezpieczenia.",
        rankImpact: "NONE",
        enforcementImpact: "POSSIBLE",
        expectedFromClient: "Informacja o okresie użytkowania wieczystego.",
        requestedDocuments: [DOCS.VALUATION],
        proposedResolution:
          "Oceń okres; jeśli nieakceptowalny względem okresu pożyczki — WSTRZYMANE.",
        intermediaryMessage:
          "To użytkowanie wieczyste — sprawdź, do kiedy trwa, względem okresu pożyczki.",
        clientMessage:
          "Nieruchomość jest w użytkowaniu wieczystym. Prosimy o informację o okresie tego prawa.",
        investorMessage:
          "Użytkowanie wieczyste — uwzględnić okres w wartości i okresie zabezpieczenia.",
        confidence: 0.85,
      }),
    ];
  },
};

/** Uporządkowany katalog reguł. Kolejność nie wpływa na wynik (agregacja po wadze). */
export const RULES: Rule[] = [
  ruleClosedBook,
  ruleDataUnavailable,
  ruleOwnerUnconfirmed,
  ruleShareOnly,
  ruleCoOwners,
  ruleIdentity,
  ruleRank,
  ruleSecondRankCertificate,
  ruleCltv,
  ruleVacantRank,
  ruleJointOrCreditor,
  ruleSectionThree,
  ruleMentions,
  ruleMigration,
  ruleRoadShare,
  rulePerpetualUsufruct,
];
