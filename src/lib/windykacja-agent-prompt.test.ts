import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  WIND_AGENT_DATA_COLLECTION,
  WIND_AGENT_FIRST_MESSAGE,
  WIND_AGENT_PLACEHOLDERS,
  WIND_AGENT_PROMPT,
  WIND_AGENT_VARIABLE_NAMES,
  WIND_NO_DATA,
  buildWindCallVariables,
  currentDelayDays,
  feesForSpeech,
  kwotaDoMowy,
  previousPromiseText,
  windCallStage,
  windPromiseDeadline,
  type WindCallVariablesInput,
} from "./windykacja-agent-prompt";
import { summarizeWindCallOutcome } from "./windykacja-call-outcome";

// Wtorek, 6 października 2026, 10:00 w Warszawie.
const NOW = new Date("2026-10-06T08:00:00Z");

function input(over: Partial<WindCallVariablesInput> = {}): WindCallVariablesInput {
  return {
    now: NOW,
    imieInwestora: "Adam Inwestor",
    borrower: { imie_nazwisko: "Jan Kowalski", typ: "osoba_fizyczna", pesel: null },
    loan: {
      numer_umowy: "FY/2026/014",
      data_umowy: "2026-03-02",
      termin_splaty: null,
      status: "w_zwloce",
      data_wypowiedzenia: null,
      rachunek_splaty: "12 3456 7890 1234 5678 9012 3456",
      numer_kw: "WA1M/00012345/6",
      kwota_hipoteki: 300000,
      akt_notarialny_777: "Rep. A 123/2026",
      kwota_777: 300000,
      oplaty_windykacyjne: { telefon: 50, sms: 25, pismo: 300, zrodlo: "umowa" },
    },
    kase: { sciezka: "miekka", opoznienie_dni: 5, data_otwarcia: "2026-10-01" },
    kwota: 12345,
    ...over,
  };
}

const placeholdersIn = (text: string) =>
  Array.from(text.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]);

describe("prompt agenta windykacyjnego", () => {
  it("każda zmienna z promptu i pierwszej wiadomości ma wartość domyślną i jest wyliczana", () => {
    const used = new Set([
      ...placeholdersIn(WIND_AGENT_PROMPT),
      ...placeholdersIn(WIND_AGENT_FIRST_MESSAGE),
    ]);
    const vars = buildWindCallVariables(input());
    for (const name of used) {
      expect(WIND_AGENT_VARIABLE_NAMES).toContain(name);
      expect(WIND_AGENT_PLACEHOLDERS[name as keyof typeof WIND_AGENT_PLACEHOLDERS]).toBeTruthy();
      expect(vars[name as keyof typeof vars]).toBeTruthy();
    }
    // Żadnej zmiennej „na zapas": każda zadeklarowana jest użyta.
    for (const name of WIND_AGENT_VARIABLE_NAMES) expect(used.has(name)).toBe(true);
  });

  it("pierwsza wiadomość ujawnia AI i nagrywanie, ale nie zdradza sprawy osobie trzeciej", () => {
    expect(WIND_AGENT_FIRST_MESSAGE).toMatch(/asystent AI/);
    expect(WIND_AGENT_FIRST_MESSAGE).toMatch(/nagrywana/);
    expect(WIND_AGENT_FIRST_MESSAGE).not.toMatch(/pożycz|zaległ|dług|umow|kwot/i);
  });

  it("prompt zawiera twarde granice: bez gróźb, bez osób trzecich, bez zmiany rachunku", () => {
    expect(WIND_AGENT_PROMPT).toMatch(/Nie grozisz/);
    expect(WIND_AGENT_PROMPT).toMatch(/Gdy odbiera ktoś inny/);
    expect(WIND_AGENT_PROMPT).toMatch(/Nigdy nie podajesz innego rachunku/);
    expect(WIND_AGENT_PROMPT).toMatch(/kontakt@financeyou\.pl/);
    // Ten sam limit słów w prompcie, co w kodzie liczącym etapy.
    expect(WIND_AGENT_PROMPT).toMatch(/„przypomnienie"/);
    expect(WIND_AGENT_PROMPT).toMatch(/„monit"/);
    expect(WIND_AGENT_PROMPT).toMatch(/„ostatnie_wezwanie"/);
  });

  it("dokumentacja zawiera aktualną treść promptu i pierwszej wiadomości", () => {
    const doc = readFileSync("docs/windykacja-agent-glosowy.md", "utf8");
    expect(doc).toContain(WIND_AGENT_PROMPT);
    expect(doc).toContain(WIND_AGENT_FIRST_MESSAGE);
  });

  it("dane zbierane po rozmowie mają opis i typ", () => {
    for (const [, v] of Object.entries(WIND_AGENT_DATA_COLLECTION)) {
      expect(["string", "number", "boolean"]).toContain(v.type);
      expect(v.description.length).toBeGreaterThan(10);
    }
  });
});

describe("etap rozmowy i termin", () => {
  it("etap wynika ze ścieżki, opóźnienia i wypowiedzenia", () => {
    expect(windCallStage({ sciezka: "miekka", opoznienie_dni: 5 })).toBe("przypomnienie");
    expect(windCallStage({ sciezka: "miekka", opoznienie_dni: 20 })).toBe("monit");
    expect(windCallStage({ sciezka: "standardowa", opoznienie_dni: 3 })).toBe("monit");
    expect(windCallStage({ sciezka: "twarda" })).toBe("ostatnie_wezwanie");
    expect(windCallStage({ sciezka: "miekka", data_wypowiedzenia: "2026-09-01" })).toBe(
      "ostatnie_wezwanie",
    );
    expect(windCallStage({ sciezka: "miekka", status_pozyczki: "wypowiedziana" })).toBe(
      "ostatnie_wezwanie",
    );
  });

  it("termin wpłaty nie wypada w weekend", () => {
    // wtorek + 7 = wtorek; wtorek + 5 = niedziela → poniedziałek; wtorek + 3 = piątek
    expect(windPromiseDeadline("2026-10-06", "przypomnienie")).toBe("2026-10-13");
    expect(windPromiseDeadline("2026-10-06", "monit")).toBe("2026-10-12");
    expect(windPromiseDeadline("2026-10-06", "ostatnie_wezwanie")).toBe("2026-10-09");
    // czwartek + 3 = niedziela → poniedziałek; środa + 3 = sobota → poniedziałek
    expect(windPromiseDeadline("2026-10-08", "ostatnie_wezwanie")).toBe("2026-10-12");
    expect(windPromiseDeadline("2026-10-07", "ostatnie_wezwanie")).toBe("2026-10-12");
  });

  it("opóźnienie liczone na dziś, a nie z dnia otwarcia sprawy", () => {
    expect(currentDelayDays(input(), "2026-10-06")).toBe(10);
    const zTerminem = input({ loan: { ...input().loan!, termin_splaty: "2026-09-01" } });
    expect(currentDelayDays(zTerminem, "2026-10-06")).toBe(35);
  });
});

describe("zmienne rozmowy", () => {
  it("komplet dla typowej sprawy", () => {
    const v = buildWindCallVariables(input());
    expect(v.adresat).toBe("pan Jan Kowalski");
    expect(v.forma).toBe("Pan");
    expect(v.kwota_zaleglosci).toBe("12 345");
    expect(v.kwota_zaleglosci_slownie).toBe("dwanaście tysięcy trzysta czterdzieści pięć złotych");
    expect(v.etap).toBe("przypomnienie");
    expect(v.dni_opoznienia).toBe("10");
    expect(v.dzisiaj).toBe("wtorek, 6 października 2026");
    expect(v.termin_maksymalny).toBe("wtorek, 13 października 2026");
    expect(v.hipoteka).toBe("tak");
    expect(v.akt_777).toBe("tak");
    expect(v.umowa_wypowiedziana).toBe("nie");
    expect(v.oplaty_windykacyjne).toBe(
      "monit telefoniczny 50 zł, monit SMS 25 zł, wezwanie listem poleconym 300 zł",
    );
    expect(v.poprzednia_deklaracja).toBe(WIND_NO_DATA);
  });

  it("PESEL ustala formę grzecznościową, ale nie trafia do zmiennych", () => {
    // 85.05.12, przedostatnia cyfra parzysta → kobieta
    const v = buildWindCallVariables(
      input({
        borrower: { imie_nazwisko: "Kuba Nowak", typ: "osoba_fizyczna", pesel: "85051212345" },
      }),
    );
    expect(v.forma).toBe("Pani");
    expect(Object.values(v).join(" ")).not.toContain("85051212345");
  });

  it("firma: zwrot do firmy, bez formy grzecznościowej", () => {
    const v = buildWindCallVariables(
      input({ borrower: { imie_nazwisko: "ABC sp. z o.o.", typ: "firma", pesel: null } }),
    );
    expect(v.adresat).toBe("firma ABC sp. z o.o.");
    expect(v.forma).toBe(WIND_NO_DATA);
    expect(v.typ_dluznika).toBe("firma");
  });

  it("brak danych = „brak”, a nie zmyślona wartość", () => {
    const v = buildWindCallVariables(
      input({
        loan: { numer_umowy: null, oplaty_windykacyjne: null },
        kwota: 0,
        kase: { sciezka: "miekka", opoznienie_dni: 0, data_otwarcia: null },
      }),
    );
    expect(v.numer_umowy).toBe(WIND_NO_DATA);
    expect(v.kwota_zaleglosci).toBe(WIND_NO_DATA);
    expect(v.dni_opoznienia).toBe(WIND_NO_DATA);
    expect(v.hipoteka).toBe(WIND_NO_DATA);
    expect(v.akt_777).toBe(WIND_NO_DATA);
    expect(v.rachunek_splaty).toBe(WIND_NO_DATA);
    expect(v.oplaty_windykacyjne).toBe(WIND_NO_DATA);
  });

  it("opłaty tylko z umowy — umowa bez opłat albo bez tabeli to „brak”", () => {
    expect(feesForSpeech({ brak_oplat: true })).toBe(WIND_NO_DATA);
    expect(feesForSpeech(null)).toBe(WIND_NO_DATA);
    expect(feesForSpeech({ telefon: 0 })).toBe(WIND_NO_DATA);
    expect(feesForSpeech({ telefon: 1500 })).toBe("monit telefoniczny 1500 zł");
  });

  it("kwota słownie do mowy", () => {
    expect(kwotaDoMowy(1000)).toBe("tysiąc złotych");
    expect(kwotaDoMowy(2500.4)).toBe("dwa tysiące pięćset złotych");
  });

  it("wypowiedziana umowa → ostatnie wezwanie z krótkim terminem", () => {
    const v = buildWindCallVariables(
      input({
        loan: { ...input().loan!, status: "wypowiedziana", data_wypowiedzenia: "2026-09-20" },
      }),
    );
    expect(v.etap).toBe("ostatnie_wezwanie");
    expect(v.umowa_wypowiedziana).toBe("tak");
    expect(v.termin_maksymalny).toBe("piątek, 9 października 2026");
  });
});

describe("poprzednia deklaracja", () => {
  const promise = { data: "2026-10-02", kwota: 5000, z_dnia: "2026-09-29T10:00:00Z" };

  it("niedotrzymana — termin minął, brak wpłaty po rozmowie", () => {
    expect(previousPromiseText(promise, [], "2026-10-06")).toBe(
      "5000 zł do 2 października 2026 (ustalone 29 września 2026) — według akt wpłata nie wpłynęła",
    );
  });

  it("wpłata po rozmowie, ale zaległość nadal jest", () => {
    expect(previousPromiseText(promise, ["2026-10-01T09:00:00Z"], "2026-10-06")).toMatch(
      /odnotowano wpłatę/,
    );
  });

  it("termin jeszcze trwa", () => {
    expect(previousPromiseText({ ...promise, data: "2026-10-08" }, [], "2026-10-06")).toMatch(
      /termin jeszcze nie minął/,
    );
  });
});

describe("wynik rozmowy do akt", () => {
  it("deklaracja z rozmowy z pożyczkobiorcą — z opłatą", () => {
    const r = summarizeWindCallOutcome({
      outcome: "answered",
      outcomeLabel: "Odebrana",
      summary: "Klient zapłaci w piątek.",
      collected: {
        wynik_rozmowy: "deklaracja_calosci",
        tozsamosc_potwierdzona: true,
        deklarowana_kwota: "12 345 zł",
        deklarowana_data: "2026-10-09",
        powod_opoznienia: "Kontrahent spóźnił się z zapłatą faktury.",
      },
      durationSec: 140,
    });
    expect(r.dotarl).toBe(true);
    expect(r.tytul).toMatch(/deklaracja: 12 345 zł do 2026-10-09/);
    expect(r.metadata.deklarowana_data).toBe("2026-10-09");
    expect(r.metadata.deklarowana_kwota).toBe(12345);
    expect(r.tresc).toMatch(/Kontrahent/);
  });

  it("poczta głosowa albo osoba trzecia — monit nie dotarł, bez opłaty", () => {
    const vm = summarizeWindCallOutcome({
      outcome: "voicemail",
      outcomeLabel: "Poczta głosowa",
      collected: {},
    });
    expect(vm.dotarl).toBe(false);
    expect(vm.tresc).toMatch(/bez opłaty/);

    const third = summarizeWindCallOutcome({
      outcome: "answered",
      outcomeLabel: "Odebrana",
      collected: { wynik_rozmowy: "osoba_trzecia", tozsamosc_potwierdzona: false },
    });
    expect(third.dotarl).toBe(false);
    expect(third.tytul).toMatch(/osoba trzecia/);
  });

  it("niepoprawna data z analizy nie trafia do deklaracji", () => {
    const r = summarizeWindCallOutcome({
      outcome: "answered",
      outcomeLabel: "Odebrana",
      collected: { wynik_rozmowy: "odmowa", deklarowana_data: "w przyszłym tygodniu" },
    });
    expect(r.metadata.deklarowana_data).toBeNull();
  });
});
