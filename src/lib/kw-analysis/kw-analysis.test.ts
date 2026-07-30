import { describe, it, expect } from "vitest";
import { renderKwSections, type KwExtraction } from "@/lib/kw-render";
import { runKwAnalysis } from "./engine";
import type { KwDocumentSections } from "./normalize";
import type { FindingStatus, KwAnalysisInput, Party, SeniorDebtCertificate } from "./types";

// ── Ważne, poprawne PESEL-e (data + suma kontrolna) do fixtures. ─────────────
const PESEL_A = "44051401359"; // Jan Kowalski
const PESEL_B = "86050212343"; // Anna Nowak
const PESEL_C = "90010112349"; // Piotr Zieliński

// Buduje sekcje kw_documents z KwExtraction (format EKW), z opcjonalnym
// nadpisaniem surowego tekstu działów III/IV (wzmianki, egzekucja itp.).
function sections(
  x: KwExtraction,
  overrides: Partial<KwDocumentSections> = {},
): KwDocumentSections {
  const r = renderKwSections(x);
  return {
    kwNumber: x.kwNumber ?? "WR1K/00012345/6",
    okladka: r.okladka,
    dzial_1o: r.dzial_1o,
    dzial_1s: r.dzial_1s,
    dzial_2: r.dzial_2,
    dzial_3: r.dzial_3,
    dzial_4: r.dzial_4,
    fetchedAt: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

function owner(
  firstName: string,
  lastName: string,
  pesel?: string,
): NonNullable<KwExtraction["dzial2"]>["wlasciciele"] {
  return [{ imiePierwsze: firstName, nazwisko: lastName, pesel: pesel ?? null }];
}

function baseExtraction(over: Partial<KwExtraction> = {}): KwExtraction {
  return {
    kwNumber: "WR1K/00012345/6",
    sadRejonowy: "SĄD REJONOWY WE WROCŁAWIU",
    typKsiegi: "NIERUCHOMOŚĆ LOKALOWA",
    dzial1o: {
      miejscowosc: "WROCŁAW",
      ulica: "TESTOWA",
      przeznaczenie: "LOKAL MIESZKALNY",
      obszar: "45,50 M2",
    },
    dzial2: { wlasciciele: owner("JAN", "KOWALSKI", PESEL_A) },
    dzial3: { brakWpisu: true, wpisy: [] },
    dzial4: { brakWpisu: true, hipoteki: [] },
    ...over,
  };
}

function party(role: Party["role"], over: Partial<Party> = {}): Party {
  return { role, firstName: "JAN", lastName: "KOWALSKI", pesel: PESEL_A, ...over };
}

function baseInput(over: Partial<KwAnalysisInput> = {}): KwAnalysisInput {
  return {
    caseId: "case-1",
    kwNumber: "WR1K/00012345/6",
    fetchedAt: "2026-07-01T10:00:00.000Z",
    sourceProvider: "CMD_KW_ENGINE",
    rawKwData: null,
    borrower: party("BORROWER"),
    declaredCollateralProviders: [party("COLLATERAL_PROVIDER")],
    transactionType: "CASH_LOAN",
    requestedCashAmount: 200_000,
    newLoanExposure: 200_000,
    requestedMortgageSum: 300_000,
    acceptedPropertyValue: 600_000,
    ...over,
  };
}

function statusesOf(
  findings: { ruleId: string; status: FindingStatus }[],
  ruleId: string,
): FindingStatus[] {
  return findings.filter((f) => f.ruleId === ruleId).map((f) => f.status);
}

describe("runKwAnalysis — determinizm i kontrakt", () => {
  it("każde znalezisko ma źródło i trzy komunikaty", () => {
    const res = runKwAnalysis(baseInput(), sections(baseExtraction()));
    for (const f of res.findings) {
      expect(f.source.length).toBeGreaterThan(0);
      expect(f.intermediaryMessage.length).toBeGreaterThan(0);
      expect(f.clientMessage.length).toBeGreaterThan(0);
      expect(f.investorMessage.length).toBeGreaterThan(0);
      expect(f.ruleVersion).toBeTruthy();
    }
    expect(res.disclaimer).toContain("Finance You");
  });

  it("ten sam snapshot ⇒ identyczny wynik", () => {
    const s = sections(baseExtraction());
    const a = runKwAnalysis(baseInput(), s);
    const b = runKwAnalysis(baseInput(), s);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});

describe("Scenariusz 1 — czysta KW, brak hipotek (pierwsze miejsce)", () => {
  it("KORZYSTNE, rank=1, brak nierozwiązanych blokerów", () => {
    const res = runKwAnalysis(baseInput(), sections(baseExtraction()));
    expect(res.priority.determinable).toBe(true);
    expect(res.priority.expectedInvestorRank).toBe(1);
    expect(statusesOf(res.findings, "R-RANK")).toContain("KORZYSTNE");
    expect(res.overallStatus).toBe("KORZYSTNE");
  });
});

describe("Scenariusz 2 — opróżnione miejsce hipoteczne", () => {
  it("KORZYSTNE WARUNKOWO, nie problem", () => {
    const d4 =
      "Numer hipoteki (roszczenia) 1 Rodzaj hipoteki HIPOTEKA UMOWNA — WYKREŚLONA. Uprawnienie do rozporządzania opróżnionym miejscem hipotecznym po wykreślonej hipotece przysługuje właścicielowi.";
    const res = runKwAnalysis(baseInput(), sections(baseExtraction(), { dzial_4: d4 }));
    expect(statusesOf(res.findings, "R-VACANT-RANK")).toContain("WARUNKOWO_DOPUSZCZALNE");
    expect(res.priority.usesVacantRank).toBe(true);
  });
});

describe("Scenariusz 3/4 — jedna wcześniejsza hipoteka (drugie miejsce)", () => {
  const mortgageExtraction = baseExtraction({
    dzial4: {
      brakWpisu: false,
      hipoteki: [
        {
          rodzaj: "HIPOTEKA UMOWNA",
          sumaKwota: 250_000,
          walutaSumy: "ZŁ",
          wierzyciel: "BANK TESTOWY S.A.",
          tresc: "Hipoteka umowna na rzecz banku.",
        },
      ],
    },
  });

  it("bez zaświadczenia ⇒ WSTRZYMANE", () => {
    const res = runKwAnalysis(baseInput(), sections(mortgageExtraction));
    expect(res.priority.expectedInvestorRank).toBe(2);
    expect(statusesOf(res.findings, "R-RANK")).toContain("WARUNKOWO_DOPUSZCZALNE");
    expect(statusesOf(res.findings, "R-SECOND-RANK-CERT")).toContain("WSTRZYMANE");
    expect(res.overallStatus).toBe("WSTRZYMANE");
  });

  it("z kompletnym zaświadczeniem i CLTV≤50% ⇒ WARUNKOWO", () => {
    const cert: SeniorDebtCertificate = {
      creditorName: "BANK TESTOWY S.A.",
      outstandingPrincipal: 100_000,
      totalPayoffAmount: 100_000,
      isRevolving: false,
    };
    const res = runKwAnalysis(
      baseInput({
        seniorCreditorCertificate: cert,
        newLoanExposure: 150_000,
        acceptedPropertyValue: 600_000,
      }),
      sections(mortgageExtraction),
    );
    // CLTV = (100k + 150k)/600k = 41.7% ≤ 50%.
    expect(res.ltv.determinable).toBe(true);
    expect(res.ltv.withinPolicy).toBe(true);
    expect(statusesOf(res.findings, "R-SECOND-RANK-CERT")).toContain("WARUNKOWO_DOPUSZCZALNE");
    expect(res.overallStatus).toBe("WARUNKOWO_DOPUSZCZALNE");
  });
});

describe("Scenariusz 5 — pierwszy dług rewolwingowy bez znanej ekspozycji", () => {
  it("STOP dla drugiego miejsca", () => {
    const mortgageExtraction = baseExtraction({
      dzial4: {
        brakWpisu: false,
        hipoteki: [
          {
            rodzaj: "HIPOTEKA UMOWNA",
            sumaKwota: 300_000,
            walutaSumy: "ZŁ",
            wierzyciel: "BANK X",
            tresc: "Hipoteka.",
          },
        ],
      },
    });
    const cert: SeniorDebtCertificate = {
      creditorName: "BANK X",
      outstandingPrincipal: 50_000,
      isRevolving: true,
      maxPossibleExposure: null,
    };
    const res = runKwAnalysis(
      baseInput({ seniorCreditorCertificate: cert }),
      sections(mortgageExtraction),
    );
    expect(statusesOf(res.findings, "R-SECOND-RANK-CERT")).toContain("STOP");
    expect(res.overallStatus).toBe("STOP");
  });
});

describe("Scenariusz 6 — docelowe trzecie miejsce", () => {
  it("STOP", () => {
    const ext = baseExtraction({
      dzial4: {
        brakWpisu: false,
        hipoteki: [
          {
            rodzaj: "HIPOTEKA UMOWNA",
            sumaKwota: 200_000,
            walutaSumy: "ZŁ",
            wierzyciel: "BANK A",
            tresc: "Hipoteka 1.",
          },
          {
            rodzaj: "HIPOTEKA UMOWNA",
            sumaKwota: 100_000,
            walutaSumy: "ZŁ",
            wierzyciel: "BANK B",
            tresc: "Hipoteka 2.",
          },
        ],
      },
    });
    const res = runKwAnalysis(baseInput(), sections(ext));
    expect(res.priority.expectedInvestorRank).toBe(3);
    expect(statusesOf(res.findings, "R-RANK")).toContain("STOP");
    expect(res.overallStatus).toBe("STOP");
  });
});

describe("Scenariusz 7 — niejasna aktywna wzmianka w Dziale IV", () => {
  it("WSTRZYMANE, priorytet nieokreślony", () => {
    const d4 =
      "Wzmianka o wniosku Dz Kw WR1K 99999 8 dotyczy wpisu hipoteki na rzecz osoby trzeciej";
    const res = runKwAnalysis(baseInput(), sections(baseExtraction(), { dzial_4: d4 }));
    expect(res.activeMentionCount).toBeGreaterThan(0);
    expect(statusesOf(res.findings, "R-MENTIONS")).toContain("WSTRZYMANE");
    expect(res.priority.determinable).toBe(false);
    expect(statusesOf(res.findings, "R-RANK")).toContain("WSTRZYMANE");
  });
});

describe("Scenariusz 10 — wpis egzekucji / zajęcia (Dział III)", () => {
  it("STOP", () => {
    const d3 =
      "Egzekucja z nieruchomości. Wszczęcie egzekucji przez komornika sądowego, zajęcie nieruchomości.";
    const res = runKwAnalysis(baseInput(), sections(baseExtraction(), { dzial_3: d3 }));
    const enf = res.findings.filter(
      (f) => f.ruleId === "R-SECTION-III" && f.title.includes("Egzekucja"),
    );
    expect(enf.length).toBeGreaterThan(0);
    expect(enf[0].status).toBe("STOP");
    expect(res.overallStatus).toBe("STOP");
  });
});

describe("Scenariusz 11 — ostrzeżenie o niezgodności", () => {
  it("STOP", () => {
    const d3 =
      "Ostrzeżenie o niezgodności stanu prawnego ujawnionego w księdze z rzeczywistym stanem prawnym.";
    const res = runKwAnalysis(baseInput(), sections(baseExtraction(), { dzial_3: d3 }));
    const w = res.findings.filter((f) => f.title.includes("niezgodności"));
    expect(w[0]?.status).toBe("STOP");
  });
});

describe("Scenariusz 12/13 — dożywocie i służebność osobista mieszkania", () => {
  it("dożywocie ⇒ STOP (polityka domyślna)", () => {
    const d3 = "Dożywocie na rzecz Anny Kowalskiej.";
    const res = runKwAnalysis(baseInput(), sections(baseExtraction(), { dzial_3: d3 }));
    expect(res.findings.find((f) => f.title === "Dożywocie")?.status).toBe("STOP");
  });
  it("służebność osobista mieszkania ⇒ WSTRZYMANE (polityka domyślna)", () => {
    const d3 =
      "Służebność osobista mieszkania na rzecz Jana Nowaka polegająca na prawie zamieszkiwania.";
    const res = runKwAnalysis(baseInput(), sections(baseExtraction(), { dzial_3: d3 }));
    expect(res.findings.find((f) => f.title.includes("Służebność osobista"))?.status).toBe(
      "WSTRZYMANE",
    );
  });
});

describe("Scenariusz 14/15 — droga konieczna i najem", () => {
  it("służebność drogi koniecznej ⇒ INFORMACYJNE", () => {
    const d3 = "Służebność drogi koniecznej przez działkę sąsiednią.";
    const res = runKwAnalysis(baseInput(), sections(baseExtraction(), { dzial_3: d3 }));
    const f = res.findings.find(
      (x) => x.ruleId === "R-SECTION-III" && x.title.includes("drogi koniecznej"),
    );
    expect(f?.status).toBe("INFORMACYJNE");
  });
  it("najem/dzierżawa ⇒ WSTRZYMANE", () => {
    const d3 = "Dzierżawa nieruchomości na rzecz spółki na okres 10 lat.";
    const res = runKwAnalysis(baseInput(), sections(baseExtraction(), { dzial_3: d3 }));
    expect(res.findings.find((f) => f.title.includes("Najem"))?.status).toBe("WSTRZYMANE");
  });
});

describe("Scenariusz 16 — hipoteka tylko na udziale", () => {
  it("STOP", () => {
    const ext = baseExtraction({
      dzial4: {
        brakWpisu: false,
        hipoteki: [
          {
            rodzaj: "HIPOTEKA UMOWNA",
            sumaKwota: 100_000,
            walutaSumy: "ZŁ",
            wierzyciel: "BANK",
            tresc: "Hipoteka obciąża udział 1/2 w nieruchomości.",
          },
        ],
      },
    });
    const res = runKwAnalysis(
      baseInput({
        declaredCollateralProviders: [party("COLLATERAL_PROVIDER", { declaredShare: "1/2" })],
      }),
      sections(ext),
    );
    expect(statusesOf(res.findings, "R-SHARE-ONLY")).toContain("STOP");
  });
});

describe("Scenariusz 17 — kilku współwłaścicieli", () => {
  it("KORZYSTNE — możliwość przystąpienia wszystkich do pożyczki", () => {
    const ext = baseExtraction({
      dzial2: {
        wlasciciele: [
          { imiePierwsze: "JAN", nazwisko: "KOWALSKI", pesel: PESEL_A },
          { imiePierwsze: "ANNA", nazwisko: "NOWAK", pesel: PESEL_B },
        ],
      },
    });
    const res = runKwAnalysis(
      baseInput({
        declaredCollateralProviders: [
          party("COLLATERAL_PROVIDER", { firstName: "JAN", lastName: "KOWALSKI", pesel: PESEL_A }),
          party("COLLATERAL_PROVIDER", { firstName: "ANNA", lastName: "NOWAK", pesel: PESEL_B }),
        ],
      }),
      sections(ext),
    );
    expect(statusesOf(res.findings, "R-COOWNERS")).toContain("KORZYSTNE");
  });

  it("KORZYSTNE także gdy nie wszyscy współwłaściciele są zadeklarowani", () => {
    const ext = baseExtraction({
      dzial2: {
        wlasciciele: [
          { imiePierwsze: "JAN", nazwisko: "KOWALSKI", pesel: PESEL_A },
          { imiePierwsze: "ANNA", nazwisko: "NOWAK", pesel: PESEL_B },
        ],
      },
    });
    const res = runKwAnalysis(
      baseInput({
        declaredCollateralProviders: [party("COLLATERAL_PROVIDER", { pesel: PESEL_A })],
      }),
      sections(ext),
    );
    expect(statusesOf(res.findings, "R-COOWNERS")).toContain("KORZYSTNE");
    expect(statusesOf(res.findings, "R-COOWNERS")).not.toContain("STOP");
  });
});

describe("Scenariusz 19/20 — rozbieżność nazwisko/PESEL", () => {
  it("to samo PESEL, inne nazwisko => WSTRZYMANE, ta sama osoba", () => {
    const res = runKwAnalysis(
      baseInput({
        borrower: party("BORROWER", { lastName: "NOWAK-KOWALSKA", pesel: PESEL_A }),
        declaredCollateralProviders: [
          party("COLLATERAL_PROVIDER", { lastName: "NOWAK-KOWALSKA", pesel: PESEL_A }),
        ],
      }),
      sections(baseExtraction()),
    );
    const f = res.findings.filter((x) => x.ruleId === "R-IDENTITY" && x.status === "WSTRZYMANE");
    expect(f.length).toBeGreaterThan(0);
    expect(f[0].plainLanguageSummary).toContain("prawdopodobnie");
  });

  it("to samo nazwisko, inny PESEL ⇒ STOP (poważna rozbieżność)", () => {
    const res = runKwAnalysis(
      baseInput({
        borrower: party("BORROWER", { pesel: PESEL_C }),
        declaredCollateralProviders: [party("COLLATERAL_PROVIDER", { pesel: PESEL_C })],
      }),
      sections(baseExtraction()),
    );
    expect(statusesOf(res.findings, "R-IDENTITY")).toContain("STOP");
    expect(res.overallStatus).toBe("STOP");
  });
});

describe("Scenariusz 21 — pożyczkobiorca inny niż właściciel", () => {
  it("brak znaleziska — pożyczkobiorca spoza Działu II nie jest oceniany", () => {
    const res = runKwAnalysis(
      baseInput({
        borrower: party("BORROWER", { firstName: "MAREK", lastName: "WISNIEWSKI", pesel: PESEL_B }),
        declaredCollateralProviders: [
          party("COLLATERAL_PROVIDER", { firstName: "JAN", lastName: "KOWALSKI", pesel: PESEL_A }),
        ],
      }),
      sections(baseExtraction()),
    );
    expect(res.findings.some((f) => f.title.includes("Pożyczkobiorca nie jest właścicielem"))).toBe(
      false,
    );
  });
});

describe("R-CLTV — dane o zadłużeniu tylko przy obciążonym Dziale IV", () => {
  it("czysty Dział IV + brak wartości ⇒ prosimy tylko o wycenę, bez danych o zadłużeniu", () => {
    const res = runKwAnalysis(
      baseInput({ acceptedPropertyValue: null }),
      sections(baseExtraction()),
    );
    const f = res.findings.find((x) => x.ruleId === "R-CLTV");
    expect(f?.status).toBe("WSTRZYMANE");
    expect(f?.requestedDocuments.map((d) => d.code)).toEqual(["VALUATION"]);
    expect(f?.clientMessage).not.toContain("zadłużeniu");
  });

  it("hipoteka w Dziale IV + brak danych ⇒ prosimy o wycenę i saldo", () => {
    const ext = baseExtraction({
      dzial4: {
        brakWpisu: false,
        hipoteki: [
          {
            rodzaj: "HIPOTEKA UMOWNA",
            sumaKwota: 250_000,
            walutaSumy: "ZŁ",
            wierzyciel: "BANK TESTOWY S.A.",
            tresc: "Hipoteka umowna na rzecz banku.",
          },
        ],
      },
    });
    const res = runKwAnalysis(baseInput({ acceptedPropertyValue: null }), sections(ext));
    const f = res.findings.find((x) => x.ruleId === "R-CLTV");
    expect(f?.status).toBe("WSTRZYMANE");
    expect(f?.requestedDocuments.map((d) => d.code)).toContain("SENIOR_CERT");
  });
});

describe("Scenariusz 26 — hipoteka łączna", () => {
  it("WSTRZYMANE — identyfikacja współobciążonych KW", () => {
    const ext = baseExtraction({
      dzial4: {
        brakWpisu: false,
        hipoteki: [
          {
            rodzaj: "HIPOTEKA ŁĄCZNA",
            sumaKwota: 400_000,
            walutaSumy: "ZŁ",
            wierzyciel: "BANK",
            tresc: "Hipoteka łączna obciąża także księgę WR1K/00099999/1.",
          },
        ],
      },
    });
    const res = runKwAnalysis(baseInput(), sections(ext));
    expect(statusesOf(res.findings, "R-MORTGAGE-DEPENDENCIES")).toContain("WSTRZYMANE");
  });
});

describe("Scenariusz 28 — zamknięta KW", () => {
  it("STOP", () => {
    const okladka =
      "Numer księgi wieczystej WR1K/00012345/6. Chwila zamknięcia księgi 2020-01-01. Podstawa zamknięcia: przeniesienie do nowej księgi. Księga zamknięta.";
    const res = runKwAnalysis(baseInput(), sections(baseExtraction(), { okladka }));
    expect(statusesOf(res.findings, "R-COVER-CLOSED")).toContain("STOP");
    expect(res.overallStatus).toBe("STOP");
  });
});

describe("Scenariusz 30 — błędny payload dostawcy", () => {
  it("WSTRZYMANE — brak danych, bez wyjątku", () => {
    const res = runKwAnalysis(baseInput(), {
      kwNumber: "WR1K/00012345/6",
      okladka: null,
      dzial_1o: null,
      dzial_1s: null,
      dzial_2: null,
      dzial_3: null,
      dzial_4: null,
    });
    expect(statusesOf(res.findings, "R-DATA-UNAVAILABLE")).toContain("WSTRZYMANE");
  });
});

describe("Agregacja statusu globalnego", () => {
  it("bloker nie jest przykrywany przez pozytywne wpisy", () => {
    const ext = baseExtraction({
      dzial3: {
        brakWpisu: false,
        wpisy: [
          {
            rodzaj: "EGZEKUCJA",
            tresc: "Zajęcie nieruchomości przez komornika, wszczęcie egzekucji.",
          },
        ],
      },
    });
    const res = runKwAnalysis(baseInput(), sections(ext));
    // Jest też KORZYSTNE (pierwsze miejsce), ale globalnie musi być STOP.
    expect(res.findings.some((f) => f.status === "KORZYSTNE")).toBe(true);
    expect(res.overallStatus).toBe("STOP");
  });
});

// ── Rzeczywisty układ tabelaryczny EKW (przypadek rzeczywistej KW z wydziału LD1M (dane zanonimizowane)). ────────
// Surowe strony EKW: nagłówek każdego działu zawiera numer KW i tytuł działu
// („DZIAŁ IV - HIPOTEKA"), a pusty dział IV z samym komentarzem migracyjnym
// NIE zawiera frazy „BRAK WPISÓW". Właściciele w podrubryce „Osoba fizyczna
// (Imię pierwsze nazwisko, imię ojca, imię matki, PESEL)".
describe("Układ tabelaryczny EKW — pusty dział IV z komentarzem migracji", () => {
  const PESEL_M = PESEL_B;
  const PESEL_F = PESEL_C;
  const header = (dzial: string) =>
    `TREŚĆ KSIĘGI WIECZYSTEJ NR LD1M/00012345/9 , STAN Z DNIA 2026-07-29 17:18 ` +
    `prowadzonej przez SĄD REJONOWY DLA ŁODZI-ŚRÓDMIEŚCIA W ŁODZI, XVI WYDZIAŁ ` +
    `KSIĄG WIECZYSTYCH - LD1M NIERUCHOMOŚĆ GRUNTOWA ${dzial}`;
  const ekwSections: KwDocumentSections = {
    kwNumber: "LD1M000123459",
    okladka: "",
    dzial_1o:
      header("DZIAŁ I-O - OZNACZENIE NIERUCHOMOŚCI") +
      " Nr podstawy wpisu Numer bieżący nieruchomości 1 1, 2 Działki ewidencyjne Lp. 1. --- " +
      "Nr podstawy wpisu Numer działki 498 1, 2 Położenie (numer porządkowy / miejscowość) " +
      "Lp. 1. 1 ANDRESPOL Ulica FREDRY 53 Sposób korzystania DZIAŁKA GRUNTU " +
      "Nr podstawy wpisu Obszar całej nieruchomości 0,0491 HA 1, 2 Powrót",
    dzial_1s: "",
    dzial_2:
      header("DZIAŁ II - WŁASNOŚĆ") +
      " Właściciele Lp. 1. --- Nr podstawy wpisu Lista wskazań udziałów w prawie " +
      "(numer udziału w prawie/ wielkość udziału/rodzaj wspólności) Lp. 1. 3 1 /1 " +
      "WSPÓLNOŚĆ USTAWOWA MAJĄTKOWA MAŁŻEŃSKA 26 Osoba fizyczna " +
      `(Imię pierwsze nazwisko, imię ojca, imię matki, PESEL) OLEH PETRENKO , IWAN, HALYNA, ${PESEL_M} ` +
      "Lp. 2. --- Nr podstawy wpisu Lista wskazań udziałów w prawie " +
      "(numer udziału w prawie/ wielkość udziału/rodzaj wspólności) Lp. 1. 3 1 /1 " +
      "WSPÓLNOŚĆ USTAWOWA MAJĄTKOWA MAŁŻEŃSKA 26 Osoba fizyczna " +
      `(Imię pierwsze nazwisko, imię ojca, imię matki, PESEL) MARIIA PETRENKO , OLEKSANDR, OKSANA, ${PESEL_F} Powrót`,
    dzial_3: header("DZIAŁ III - PRAWA, ROSZCZENIA I OGRANICZENIA") + " BRAK WPISÓW Powrót",
    dzial_4:
      header("DZIAŁ IV - HIPOTEKA") +
      " Komentarz do migracji Nr podstawy wpisu Ostatni numer aktualnego lub wykreślonego " +
      "wpisu w danym dziale w dotychczasowej księdze wieczystej 2 --- Powrót",
    fetchedAt: "2026-07-29T15:18:56.555Z",
  };

  it("nie wykrywa hipoteki z nagłówka działu IV (komentarz migracyjny ≠ wpis)", () => {
    const res = runKwAnalysis(baseInput({ kwNumber: "LD1M/00012345/9" }), ekwSections);
    expect(res.computedFrom.mortgagesCount).toBe(0);
    expect(res.priority.expectedInvestorRank).toBe(1);
    expect(statusesOf(res.findings, "R-SECOND-RANK-CERT")).toHaveLength(0);
    expect(statusesOf(res.findings, "R-MORTGAGE-DEPENDENCIES")).toHaveLength(0);
  });

  it("rozpoznaje oboje właścicieli z podrubryki Osoba fizyczna wraz z PESEL", () => {
    const res = runKwAnalysis(
      baseInput({
        kwNumber: "LD1M/00012345/9",
        borrower: party("BORROWER", {
          firstName: "MARIIA",
          lastName: "PETRENKO",
          pesel: PESEL_F,
        }),
        declaredCollateralProviders: [
          party("COLLATERAL_PROVIDER", {
            firstName: "OLEH",
            lastName: "PETRENKO",
            pesel: PESEL_M,
          }),
          party("COLLATERAL_PROVIDER", {
            firstName: "MARIIA",
            lastName: "PETRENKO",
            pesel: PESEL_F,
          }),
        ],
      }),
      ekwSections,
    );
    expect(res.computedFrom.ownersCount).toBe(2);
    // Pożyczkobiorczyni jest właścicielką (PESEL zgodny) — brak alertu tożsamości.
    expect(res.findings.some((f) => f.title.includes("Pożyczkobiorca nie jest właścicielem"))).toBe(
      false,
    );
    // Współwłasność małżeńska — atut (możliwe przystąpienie obojga do pożyczki).
    expect(statusesOf(res.findings, "R-COOWNERS")).toContain("KORZYSTNE");
  });
});
