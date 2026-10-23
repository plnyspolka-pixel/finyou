// Oświadczenie inwestora o źródle pochodzenia środków (AML) — czysta logika
// bez I/O, wspólna dla formularza w panelu, walidacji serwerowej i testów.
//
// Podstawa prawna (ustawa z dnia 1 marca 2018 r. o przeciwdziałaniu praniu
// pieniędzy oraz finansowaniu terroryzmu, t.j. Dz.U. 2025):
//   - art. 34 ust. 1 pkt 4 lit. b — badanie źródła pochodzenia wartości
//     majątkowych będących w dyspozycji klienta „w przypadkach uzasadnionych
//     okolicznościami”; inwestor wnosi własne środki na pożyczki, więc sama
//     natura relacji jest taką okolicznością;
//   - art. 34 ust. 3 — obowiązek udokumentowania zastosowanych środków;
//   - art. 43 ust. 4 — wysokie kwoty / nietypowe transakcje → wyjaśnienie
//     okoliczności i intensyfikacja monitoringu;
//   - art. 44 ust. 1 pkt 2 — państwo trzecie wysokiego ryzyka → informacja
//     o źródle majątku i źródle pochodzenia wartości majątkowych (obowiązkowo);
//   - art. 46 ust. 2 pkt 2 — PEP → ustalenie źródła majątku i źródła środków
//     (obowiązkowo);
//   - art. 41 — brak możliwości zastosowania środka = brak relacji.
//
// Zmiana treści oświadczenia wymaga podbicia SOF_DECLARATION_TEXT_VERSION —
// zapisujemy wersję i pełny tekst przy każdym oświadczeniu (dowód dla GIIF).
import { z } from "zod";

export const SOF_DECLARATION_TEXT_VERSION = "sof-2026-10-v1";

export type EntityVariant = "osoba_fizyczna" | "jdg" | "osoba_prawna";

/** Kategorie źródeł — kody trafiają do bazy, etykiety do formularza i panelu. */
export const SOURCE_OF_FUNDS_CATEGORIES = [
  {
    code: "wynagrodzenie",
    label: "Wynagrodzenie za pracę lub z umów cywilnoprawnych",
    forVariants: ["osoba_fizyczna", "jdg"],
  },
  {
    code: "dzialalnosc_gospodarcza",
    label: "Dochody z działalności gospodarczej",
    forVariants: ["osoba_fizyczna", "jdg", "osoba_prawna"],
  },
  {
    code: "kapital_spolki",
    label: "Kapitał własny spółki, zyski zatrzymane, wpłaty wspólników",
    forVariants: ["osoba_prawna"],
  },
  {
    code: "oszczednosci",
    label: "Oszczędności zgromadzone z opodatkowanych dochodów z lat ubiegłych",
    forVariants: ["osoba_fizyczna", "jdg", "osoba_prawna"],
  },
  {
    code: "dochody_kapitalowe",
    label: "Dochody kapitałowe: odsetki, dywidendy, zyski z inwestycji, najem",
    forVariants: ["osoba_fizyczna", "jdg", "osoba_prawna"],
  },
  {
    code: "sprzedaz_nieruchomosci",
    label: "Sprzedaż nieruchomości",
    forVariants: ["osoba_fizyczna", "jdg", "osoba_prawna"],
  },
  {
    code: "sprzedaz_firmy_udzialow",
    label: "Sprzedaż przedsiębiorstwa, udziałów lub akcji",
    forVariants: ["osoba_fizyczna", "jdg", "osoba_prawna"],
  },
  {
    code: "darowizna_spadek",
    label: "Darowizna lub spadek",
    forVariants: ["osoba_fizyczna", "jdg"],
  },
  {
    code: "kredyt_pozyczka",
    label: "Kredyt lub pożyczka (środki obce)",
    forVariants: ["osoba_fizyczna", "jdg", "osoba_prawna"],
  },
  {
    code: "inne",
    label: "Inne źródło (opisz poniżej)",
    forVariants: ["osoba_fizyczna", "jdg", "osoba_prawna"],
  },
] as const;

export type SourceOfFundsCode = (typeof SOURCE_OF_FUNDS_CATEGORIES)[number]["code"];

export const SOURCE_OF_FUNDS_CODES = SOURCE_OF_FUNDS_CATEGORIES.map((c) => c.code) as [
  SourceOfFundsCode,
  ...SourceOfFundsCode[],
];

export function sourceOfFundsLabel(code: string): string {
  return SOURCE_OF_FUNDS_CATEGORIES.find((c) => c.code === code)?.label ?? code;
}

/** Kategorie dostępne dla wariantu strony (spółka nie ma „wynagrodzenia” ani „spadku”). */
export function categoriesForVariant(variant: EntityVariant | null | undefined) {
  if (!variant) return SOURCE_OF_FUNDS_CATEGORIES;
  return SOURCE_OF_FUNDS_CATEGORIES.filter((c) =>
    (c.forVariants as readonly string[]).includes(variant),
  );
}

/** Deklarowana skala finansowania przez platformę w ciągu 12 miesięcy. */
export const PLANNED_SCALE_BANDS = [
  { code: "do_100k", label: "do 100 000 zł" },
  { code: "100k_500k", label: "100 000 – 500 000 zł" },
  { code: "500k_1m", label: "500 000 – 1 000 000 zł" },
  { code: "1m_5m", label: "1 000 000 – 5 000 000 zł" },
  { code: "powyzej_5m", label: "powyżej 5 000 000 zł" },
] as const;

export type PlannedScaleCode = (typeof PLANNED_SCALE_BANDS)[number]["code"];

export const PLANNED_SCALE_CODES = PLANNED_SCALE_BANDS.map((b) => b.code) as [
  PlannedScaleCode,
  ...PlannedScaleCode[],
];

export function plannedScaleLabel(code: string): string {
  return PLANNED_SCALE_BANDS.find((b) => b.code === code)?.label ?? code;
}

/** Od tej skali oświadczenie zawsze trafia do analizy compliance (art. 43 ust. 4 pkt 2). */
export const HIGH_SCALE_CODES: readonly PlannedScaleCode[] = ["1m_5m", "powyzej_5m"];

/** Państwa EOG + Szwajcaria i Wielka Brytania — środki spoza tej listy idą do analizy. */
export const LOW_RISK_FUNDS_COUNTRIES: readonly string[] = [
  "PL",
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
  "CH",
  "GB",
];

/** Oświadczenia zaznaczane osobno — wszystkie obowiązkowe. */
export const SOF_STATEMENTS = [
  {
    code: "srodki_wlasne",
    label:
      "Środki, które zamierzam przeznaczyć na pożyczki, są moje własne (odpowiednio: spółki, którą reprezentuję). Nie działam na rzecz ani na rachunek osoby trzeciej.",
  },
  {
    code: "legalne_pochodzenie",
    label:
      "Środki pochodzą z legalnych, wskazanych wyżej źródeł i nie pochodzą z przestępstwa ani z przestępstwa skarbowego.",
  },
  {
    code: "aktualizacja_okolicznosci",
    label: "Niezwłocznie poinformuję Finance You o zmianie powyższych okoliczności.",
  },
] as const;

export type SofStatementCode = (typeof SOF_STATEMENTS)[number]["code"];

export const SOF_TRUTH_CLAUSE =
  "Oświadczam, że powyższe informacje są prawdziwe i kompletne. Przyjmuję do wiadomości, że odmowa złożenia oświadczenia albo podanie nieprawdziwych informacji uniemożliwia Finance You zastosowanie środków bezpieczeństwa finansowego, co skutkuje odmową nawiązania lub rozwiązaniem współpracy (art. 41 ustawy AML) i może stanowić podstawę zawiadomienia Generalnego Inspektora Informacji Finansowej.";

export const SOF_DECLARATION_TEXT = [
  "Oświadczenie o źródle pochodzenia środków",
  "Na podstawie art. 34 ust. 1 pkt 4 lit. b w związku z art. 34 ust. 3, art. 43 ust. 4, art. 44 ust. 1 pkt 2 i art. 46 ust. 2 pkt 2 ustawy z dnia 1 marca 2018 r. o przeciwdziałaniu praniu pieniędzy oraz finansowaniu terroryzmu, jako Inwestor zamierzający udzielać pożyczek za pośrednictwem Finance You sp. z o.o., wskazuję źródła pochodzenia środków, kraj ich pochodzenia oraz planowaną skalę finansowania w ciągu 12 miesięcy, i oświadczam, że:",
  ...SOF_STATEMENTS.map((s, i) => `${i + 1}. ${s.label}`),
  SOF_TRUTH_CLAUSE,
].join("\n");

const CountryCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Podaj dwuliterowy kod kraju (np. PL).");

export const SourceOfFundsInput = z
  .object({
    sources: z
      .array(z.enum(SOURCE_OF_FUNDS_CODES))
      .min(1, "Wskaż co najmniej jedno źródło środków.")
      .max(SOURCE_OF_FUNDS_CODES.length)
      .refine((arr) => new Set(arr).size === arr.length, "Źródła nie mogą się powtarzać."),
    other_description: z.string().trim().max(500).optional().nullable(),
    description: z.string().trim().max(1500).optional().nullable(),
    funds_country: CountryCode.default("PL"),
    planned_scale: z.enum(PLANNED_SCALE_CODES, {
      errorMap: () => ({ message: "Wybierz planowaną skalę finansowania." }),
    }),
    statements: z.object({
      srodki_wlasne: z.literal(true, {
        errorMap: () => ({ message: "Potwierdź, że środki są Twoje własne." }),
      }),
      legalne_pochodzenie: z.literal(true, {
        errorMap: () => ({ message: "Potwierdź legalne pochodzenie środków." }),
      }),
      aktualizacja_okolicznosci: z.literal(true, {
        errorMap: () => ({
          message: "Potwierdź, że poinformujesz o zmianie okoliczności.",
        }),
      }),
    }),
    truth_confirmed: z.literal(true, {
      errorMap: () => ({ message: "Potwierdź prawdziwość i kompletność oświadczenia." }),
    }),
    declaration_text_version: z.string().max(40),
  })
  .superRefine((v, ctx) => {
    if (v.sources.includes("inne") && !(v.other_description ?? "").trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["other_description"],
        message: "Opisz inne źródło środków.",
      });
    }
    if (v.sources.includes("kredyt_pozyczka") && (v.description ?? "").trim().length < 10) {
      ctx.addIssue({
        code: "custom",
        path: ["description"],
        message: "Dla środków obcych opisz, kto i na jakich warunkach ich udzielił.",
      });
    }
  });

export type SourceOfFundsValue = z.infer<typeof SourceOfFundsInput>;

/** Szkic formularza — te same pola, ale checkboxy mogą być jeszcze niezaznaczone. */
export type SourceOfFundsDraft = Omit<
  SourceOfFundsValue,
  "statements" | "truth_confirmed" | "sources"
> & {
  sources: SourceOfFundsCode[];
  statements: Record<SofStatementCode, boolean>;
  truth_confirmed: boolean;
};

export function emptySourceOfFunds(): SourceOfFundsDraft {
  return {
    sources: [],
    other_description: "",
    description: "",
    funds_country: "PL",
    planned_scale: "do_100k",
    statements: {
      srodki_wlasne: false,
      legalne_pochodzenie: false,
      aktualizacja_okolicznosci: false,
    },
    truth_confirmed: false,
    declaration_text_version: SOF_DECLARATION_TEXT_VERSION,
  };
}

/** Pierwszy błąd formularza albo null, gdy oświadczenie kompletne. */
export function sourceOfFundsError(v: unknown): string | null {
  const r = SourceOfFundsInput.safeParse(v);
  return r.success
    ? null
    : (r.error.issues[0]?.message ?? "Uzupełnij oświadczenie o źródle środków.");
}

/**
 * Status oświadczenia w pipelinie — `investors.sof_status`. Samo złożenie
 * zamyka krok (`zlozone`); compliance może je dodatkowo potwierdzić
 * (`zaakceptowane`) albo odrzucić (`odrzucone` — jedyny status blokujący,
 * art. 41 ustawy AML).
 */
export type SourceOfFundsStatus = "zlozone" | "zaakceptowane" | "odrzucone";

export const SOF_STATUS_LABELS: Record<SourceOfFundsStatus, string> = {
  zlozone: "Oświadczenie złożone",
  zaakceptowane: "Potwierdzone przez compliance",
  odrzucone: "Odrzucone przez compliance",
};

/** Statusy, które zamykają krok pipeline'u i otwierają dalsze kroki. */
export const SOF_DONE_STATUSES: readonly SourceOfFundsStatus[] = ["zlozone", "zaakceptowane"];

/** Statusy, które wymagają reakcji człowieka. */
export const SOF_ATTENTION_STATUSES: readonly SourceOfFundsStatus[] = ["odrzucone"];

export type SofRiskFlag =
  | "inne_zrodlo"
  | "srodki_obce"
  | "kraj_podwyzszonego_ryzyka"
  | "wysoka_skala";

export const SOF_RISK_FLAG_LABELS: Record<SofRiskFlag, string> = {
  inne_zrodlo: "źródło spoza katalogu (opis własny)",
  srodki_obce: "środki obce (kredyt / pożyczka) przeznaczone na pożyczki",
  kraj_podwyzszonego_ryzyka: "środki spoza EOG, Szwajcarii i Wielkiej Brytanii",
  wysoka_skala: "deklarowana skala od 1 mln zł rocznie",
};

export interface SourceOfFundsAssessment {
  /** Sygnały podwyższonego ryzyka — informacja dla compliance, nie blokada. */
  flags: SofRiskFlag[];
  /** true = compliance dostaje e-mail z prośbą o wgląd w oświadczenie. */
  flagged: boolean;
}

/**
 * Ocena oparta na ryzyku: oświadczenie zawsze zamyka krok pipeline'u; sygnały
 * ryzyka zapisujemy przy oświadczeniu i pokazujemy compliance (e-mail + karta
 * inwestora), które może je odrzucić. Nic nie jest wstrzymywane automatycznie.
 */
export function assessSourceOfFunds(
  v: Pick<SourceOfFundsValue, "sources" | "funds_country" | "planned_scale">,
): SourceOfFundsAssessment {
  const flags: SofRiskFlag[] = [];
  if (v.sources.includes("inne")) flags.push("inne_zrodlo");
  if (v.sources.includes("kredyt_pozyczka")) flags.push("srodki_obce");
  if (!LOW_RISK_FUNDS_COUNTRIES.includes(v.funds_country.toUpperCase())) {
    flags.push("kraj_podwyzszonego_ryzyka");
  }
  if (HIGH_SCALE_CODES.includes(v.planned_scale)) flags.push("wysoka_skala");
  return { flags, flagged: flags.length > 0 };
}
