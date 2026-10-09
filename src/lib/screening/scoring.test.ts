// Testy normalizacji i scoringu screeningu PEP / sankcji, w tym przypadki
// brzegowe (popularne nazwiska, nazwiska dwuczłonowe, zmiana nazwiska po
// ślubie, literówki, cyrylica) i raport odsetka fałszywych trafień.
import { describe, it, expect } from "vitest";
import {
  asciiFold,
  nameTokens,
  normalizeName,
  cyrillicVariants,
  nameVariants,
  indexKeys,
  parsePartialDate,
  parsePolishTextDate,
  normalizeCountry,
} from "./normalize";
import {
  jaroWinkler,
  tokenSetSimilarity,
  scoreMatch,
  DEFAULT_SCORING,
  type ScoreReference,
  type ScoreSubject,
} from "./scoring";

const person = (
  name: string,
  dob: string | null = null,
  nat: string[] = [],
  aliases: string[] = [],
): ScoreSubject => ({
  kind: "person",
  names: [name, ...aliases],
  birth: parsePartialDate(dob),
  nationality: nat,
});
const ref = (
  names: string[],
  dobs: Array<string | null> = [],
  nat: string[] = [],
): ScoreReference => ({
  kind: "person",
  names,
  births: dobs.map((d) => parsePartialDate(d)),
  nationality: nat,
});

describe("normalizacja", () => {
  it("transliteruje polskie znaki i zachowuje oryginał osobno", () => {
    expect(asciiFold("Łukasz Żółć-Gęślą")).toBe("Lukasz Zolc-Gesla");
    expect(normalizeName("Łukasz Żółć")).toBe("lukasz zolc");
  });

  it("usuwa tytuły i interpunkcję, rozbija nazwiska dwuczłonowe", () => {
    expect(nameTokens("prof. dr hab. inż. Anna Nowak-Jeziorańska")).toEqual([
      "anna",
      "nowak",
      "jezioranska",
    ]);
    expect(nameTokens("Mr. John O'Brien, Jr.")).toEqual(["john", "obrien"]);
  });

  it("pomija formy prawne w nazwach podmiotów", () => {
    expect(normalizeName("„1C-POLAND” Sp. z o.o.", { entity: true })).toBe("1c poland");
    expect(normalizeName("ACRON PAO", { entity: true })).toBe("acron");
  });

  it("przygotowuje warianty transliteracji cyrylicy (PL / EN / ISO 9)", () => {
    const v = cyrillicVariants("Шевченко Щербак Жуков");
    expect(asciiFold(v.pl)).toBe("szewczenko szczerbak zukow");
    expect(v.en).toBe("shevchenko shcherbak zhukov");
    expect(v.iso9).toBe("ševčenko ŝerbak žukov");
    expect(asciiFold(v.iso9)).toBe("sevcenko serbak zukov");
    const keys = nameVariants("Александр Лукашенко").map((x) => x.key);
    expect(keys).toContain("aleksandr lukaszenko");
    expect(keys).toContain("aleksandr lukashenko");
  });

  it("buduje klucze indeksu: obie kolejności i nazwisko + inicjał", () => {
    const keys = indexKeys("Jan Maria Kowalski", { surname: "Kowalski" }).map((k) => k.nameKey);
    expect(keys).toContain("jan maria kowalski");
    expect(keys).toContain("maria kowalski jan");
    expect(keys).toContain("kowalski j");
  });

  it("parsuje daty w formatach źródeł", () => {
    expect(parsePartialDate("1959-01-04")).toEqual({ date: "1959-01-04", year: 1959 });
    expect(parsePartialDate("04.01.1959")).toEqual({ date: "1959-01-04", year: 1959 });
    expect(parsePartialDate("1960")).toEqual({ date: null, year: 1960 });
    expect(parsePolishTextDate("urodzony 5 października 1973 r.")).toEqual({
      date: "1973-10-05",
      year: 1973,
    });
    expect(normalizeCountry("Russian Federation")).toBe("RU");
    expect(normalizeCountry("pl")).toBe("PL");
  });
});

describe("podobieństwo nazw", () => {
  it("Jaro-Winkler: klasyczne wartości", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 2);
    expect(jaroWinkler("kowalski", "kowalski")).toBe(1);
  });

  it("jest niezależne od kolejności imienia i nazwiska", () => {
    expect(tokenSetSimilarity(["kowalski", "jan"], ["jan", "kowalski"]).score).toBe(1);
  });
});

describe("scoring — przypadki brzegowe", () => {
  it("pełna zgodność nazwy i daty → silne trafienie", () => {
    const r = scoreMatch(
      person("Andrzej Adamczyk", "1959-01-04"),
      ref(["Andrzej Mieczysław Adamczyk"], ["1959-01-04"], ["PL"]),
    );
    expect(r.band).toBe("strong");
    expect(r.dob).toBe("exact");
  });

  it("brak daty urodzenia w źródle → najwyżej „do weryfikacji”", () => {
    const r = scoreMatch(person("Jan Kowalski", "1980-05-05"), ref(["Jan Kowalski"]));
    expect(r.total).toBe(DEFAULT_SCORING.strongThreshold - 1);
    expect(r.band).toBe("possible");
    expect(r.capApplied).toMatch(/źródle/);
  });

  it("niezgodna data obniża wynik, ale nie odrzuca automatycznie identycznej nazwy", () => {
    const r = scoreMatch(
      person("Jan Kowalski", "1980-05-05"),
      ref(["Jan Kowalski"], ["1950-02-02"]),
    );
    expect(r.dob).toBe("mismatch");
    expect(r.total).toBe(75);
    expect(r.band).toBe("possible");
  });

  it("źródło zna tylko rok — zgodny rok daje premię, nie karę", () => {
    const r = scoreMatch(person("Viktor Petrov", "1965-03-01"), ref(["Viktor Petrov"], ["1965"]));
    expect(r.dob).toBe("year_match");
    expect(r.band).toBe("strong");
  });

  it("literówka w nazwisku nadal daje trafienie", () => {
    const r = scoreMatch(
      person("Andrzej Adamczk", "1959-01-04"),
      ref(["Andrzej Adamczyk"], ["1959-01-04"]),
    );
    expect(r.band).not.toBe("none");
  });

  it("nazwisko dwuczłonowe pasuje do jednego członu", () => {
    const r = scoreMatch(
      person("Anna Nowak-Jeziorańska", "1970-01-01"),
      ref(["Anna Nowak"], ["1970-01-01"]),
    );
    expect(r.band).not.toBe("none");
  });

  it("cyrylica w źródle vs zapis polski u klienta", () => {
    const r = scoreMatch(
      person("Aleksandr Łukaszenko", "1954-08-30"),
      ref(["Александр Григорьевич Лукашенко"], ["1954-08-30"], ["BY"]),
    );
    expect(r.band).toBe("strong");
  });

  it("transkrypcja angielska vs polska bez cyrylicy (Shevchenko / Szewczenko)", () => {
    const r = scoreMatch(
      person("Taras Szewczenko", "1961-03-09"),
      ref(["Taras Shevchenko"], ["1961-03-09"]),
    );
    expect(r.band).toBe("strong");
  });

  it("inne imię przy tym samym nazwisku → brak trafienia", () => {
    const r = scoreMatch(
      person("Piotr Kowalski", "1980-05-05"),
      ref(["Jan Kowalski"], ["1980-05-05"]),
    );
    expect(r.band).toBe("none");
  });

  it("zmiana nazwiska po ślubie — dopasowanie wymaga aliasu (nazwisko rodowe)", () => {
    const noAlias = scoreMatch(
      person("Anna Nowak", "1975-06-06"),
      ref(["Anna Kowalska"], ["1975-06-06"]),
    );
    expect(noAlias.band).toBe("none");
    const withAlias = scoreMatch(
      person("Anna Nowak", "1975-06-06", [], ["Anna Kowalska"]),
      ref(["Anna Kowalska"], ["1975-06-06"]),
    );
    expect(withAlias.band).toBe("strong");
  });

  it("premie za datę nie podnoszą słabej nazwy ponad próg", () => {
    const r = scoreMatch(
      person("Jan Nowicki", "1980-05-05", ["PL"]),
      ref(["Jan Nowak"], ["1980-05-05"], ["PL"]),
    );
    expect(r.total).toBeLessThan(DEFAULT_SCORING.possibleThreshold);
  });

  it("podmioty: forma prawna nie wpływa na wynik", () => {
    const r = scoreMatch(
      {
        kind: "entity",
        names: ["1C Poland spółka z ograniczoną odpowiedzialnością"],
        birth: { date: null, year: null },
        nationality: [],
      },
      { kind: "entity", names: ["„1C-POLAND” Sp. z o.o."], births: [], nationality: [] },
    );
    expect(r.band).toBe("strong");
  });
});

// --- Raport odsetka fałszywych trafień ------------------------------------------

describe("raport fałszywych trafień (zestaw kontrolny)", () => {
  // Rekordy referencyjne: popularne polskie nazwiska + rekordy sankcyjne.
  const REFS: ScoreReference[] = [
    ref(["Jan Kowalski"], ["1952-03-11"], ["PL"]),
    ref(["Anna Nowak"], ["1968-07-21"], ["PL"]),
    ref(["Piotr Wiśniewski"], ["1971-01-30"], ["PL"]),
    ref(["Katarzyna Wójcik"], ["1983-11-02"], ["PL"]),
    ref(["Tomasz Kamiński"], ["1964-05-17"], ["PL"]),
    ref(["Andrzej Lewandowski"], ["1958-09-09"], ["PL"]),
    ref(["Marek Zieliński"], [], ["PL"]), // brak daty w źródle (np. Wikidata)
    ref(["Александр Лукашенко"], ["1954-08-30"], ["BY"]),
    ref(["Viktor Fedorovych Yanukovych"], ["1950-07-09"], ["UA"]),
    ref(["Arkady Romanovich Rotenberg"], ["1951-12-15"], ["RU"]),
  ];

  // Podmioty, które NIE są tymi osobami (oczekiwany brak sprawy) — typowi klienci.
  const NEGATIVES: ScoreSubject[] = [
    person("Jan Kowalski", "1985-04-12", ["PL"]), // ten sam „Jan Kowalski”, inna data
    person("Jan Kowalski", "1952-03-12", ["PL"]), // inna data o 1 dzień
    person("Janina Kowalska", "1960-01-01", ["PL"]),
    person("Anna Nowakowska", "1968-07-21", ["PL"]),
    person("Anna Nowak", "1990-02-02", ["PL"]),
    person("Piotr Wiśniewski", "1999-12-31", ["PL"]),
    person("Paweł Wiśniewski", "1971-01-30", ["PL"]),
    person("Katarzyna Wójtowicz", "1983-11-02", ["PL"]),
    person("Tomasz Kamiński", "1987-08-08", ["PL"]),
    person("Andrzej Lewandowski", "1993-03-03", ["PL"]),
    person("Marek Zieliński", "1979-04-04", ["PL"]), // brak daty w źródle → zawsze do weryfikacji
    person("Aleksander Łukasiewicz", "1954-08-30", ["PL"]),
    person("Wiktor Janowicz", "1950-07-09", ["PL"]),
    person("Arkadiusz Rogalski", "1951-12-15", ["PL"]),
    person("Michał Rotenberg", "1981-01-01", ["PL"]),
  ];

  // Podmioty, które SĄ osobami z listy (oczekiwane trafienie ≥ 70).
  const POSITIVES: ScoreSubject[] = [
    person("Jan Kowalski", "1952-03-11"),
    person("Anna Nowak-Kowalczyk", "1968-07-21"),
    person("Piotr Wisniewski", "1971-01-30"), // bez polskich znaków
    person("Katarzyna Wojcik", "1983-11-02"),
    person("Kamiński Tomasz", "1964-05-17"), // odwrócona kolejność
    person("Andrzej Lewandowsky", "1958-09-09"), // literówka
    person("Marek Zieliński", null), // brak daty po obu stronach
    person("Aleksandr Łukaszenko", "1954-08-30"), // polska transkrypcja
    person("Wiktor Janukowycz", "1950-07-09"), // polska transkrypcja
    person("Arkadij Rotenberg", "1951-12-15"),
  ];

  const bestScore = (s: ScoreSubject, cfg = DEFAULT_SCORING) =>
    Math.max(...REFS.map((r) => scoreMatch(s, r, cfg).total));
  // Negatywy z nazwą identyczną jak w rekordzie (inna data / brak daty w źródle)
  // celowo trafiają do człowieka — specyfikacja zabrania automatycznego
  // odrzucenia przy niezgodnej dacie. Raportujemy je osobno.
  const sameName = (s: ScoreSubject) => REFS.some((r) => scoreMatch(s, r).nameScore >= 97);

  it("liczy odsetek fałszywych trafień i pominięć", () => {
    const fp = NEGATIVES.filter((s) => bestScore(s) >= DEFAULT_SCORING.possibleThreshold);
    const fpDifferentName = fp.filter((s) => !sameName(s));
    const fn = POSITIVES.filter((s) => bestScore(s) < DEFAULT_SCORING.possibleThreshold);
    const calibrated = { ...DEFAULT_SCORING, dobMismatchPenalty: 35 };
    const fpCalibrated = NEGATIVES.filter(
      (s) => bestScore(s, calibrated) >= calibrated.possibleThreshold,
    );
    const fnCalibrated = POSITIVES.filter(
      (s) => bestScore(s, calibrated) < calibrated.possibleThreshold,
    );
    const pct = (n: number) => `${((n / NEGATIVES.length) * 100).toFixed(1)}%`;
    const report = {
      negatives: NEGATIVES.length,
      positives: POSITIVES.length,
      falsePositives: fp.map((s) => `${s.names[0]} (${s.birth.date}) → ${bestScore(s)}`),
      falsePositiveRate: pct(fp.length),
      falsePositiveRateDifferentName: pct(fpDifferentName.length),
      missed: fn.map((s) => `${s.names[0]} → ${bestScore(s)}`),
      withDobMismatchPenalty35: {
        falsePositiveRate: pct(fpCalibrated.length),
        missed: fnCalibrated.length,
      },
    };
    console.info("[screening] raport FP:", JSON.stringify(report, null, 2));
    // Pominięcie prawdziwej osoby jest niedopuszczalne.
    expect(fn).toEqual([]);
    expect(fnCalibrated).toEqual([]);
    // Inna osoba o innym nazwisku nie generuje sprawy — z jednym świadomym
    // wyjątkiem granicznym: „Wiktor Janowicz” ma podobieństwo nazwy 70 do
    // „Viktor Yanukovych” i identyczną datę urodzenia → do weryfikacji.
    expect(fpDifferentName.map((s) => s.names[0])).toEqual(["Wiktor Janowicz"]);
  });
});
