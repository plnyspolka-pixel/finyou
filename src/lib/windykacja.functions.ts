import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireInvestorPro } from "@/lib/investor-plan/pro-middleware";
import { buildWindDocument, type DocContext } from "@/lib/windykacja-documents";
import { normalizeWindFeeTable, windFeeForAction, type WindFeeTable } from "@/lib/windykacja-fees";
import { defaultDelayRate } from "@/lib/windykacja-debt";
import {
  generateHarmonogram,
  normalizeHarmonogram,
  parseDataISO,
  parseKwota,
  type WindRata,
} from "@/lib/windykacja-harmonogram";
import {
  daysSinceDue,
  formatRachunekSplaty,
  harmonogramFromInput,
  opisHarmonogramu,
  warsawToday,
  windRecalcPlan,
  type WindRecalcPlan,
} from "@/lib/windykacja-recalc";
import { recalcWindCaseDetailed, type WindRecalcOutcome } from "@/lib/windykacja-recalc.server";
import type {
  WindPath,
  WindEventType,
  WindDeliveryStatus,
  WindDocumentType,
} from "@/lib/windykacja-procedure";

// Tabele wind_* są w wygenerowanych typach Database, ale typy nie nadążają
// za migracjami (np. wind_events.oplata) — używamy luźnego dostępu do
// klienta. Typy publiczne zadeklarowane poniżej.
type LooseDb = { from: (t: string) => any };
const loose = (c: unknown) => c as LooseDb;

// ── Typy publiczne ───────────────────────────────────────────────────
export type WindBorrower = {
  id: string;
  imie_nazwisko: string;
  typ: "osoba_fizyczna" | "firma";
  pesel: string | null;
  nip: string | null;
  dowod_osobisty: string | null;
  adres_zamieszkania: string | null;
  adres_do_doreczen: string | null;
  email: string | null;
  telefon: string | null;
  email_zgoda_doreczenia: boolean;
  notatki: string | null;
};

export type WindLoanStatus =
  | "aktywna"
  | "w_zwloce"
  | "wypowiedziana"
  | "windykacja_komornicza"
  | "splacona"
  | "windykacja_karna";

export type WindLoan = {
  id: string;
  borrower_id: string;
  numer_umowy: string | null;
  data_umowy: string | null;
  kwota_pozyczki: number;
  kwota_calkowita: number;
  prowizja: number;
  termin_splaty: string | null;
  numer_kw: string | null;
  kwota_hipoteki: number | null;
  akt_notarialny_777: string | null;
  kwota_777: number | null;
  rachunek_splaty: string | null;
  oprocentowanie_roczne: number;
  stopa_odsetek_max: number;
  status: WindLoanStatus;
  saldo_pozostale: number;
  data_ostatniej_wplaty: string | null;
  data_wypowiedzenia: string | null;
  kwota_doplat: number;
  /** Tabela opłat za czynności windykacyjne z umowy (podstawa naliczania w rejestrze). */
  oplaty_windykacyjne: WindFeeTable | null;
  /**
   * Harmonogram rat z umowy (Zał. 1). Jest → zaległość, opóźnienie i odsetki
   * liczone z rat; brak (null) → model z jednym terminem spłaty.
   */
  harmonogram: WindRata[] | null;
  /** Nazwa pożyczkodawcy z umowy — agent AI dzwoni „w imieniu" tej strony. */
  pozyczkodawca: string | null;
};

export type WindPriority = "niski" | "sredni" | "wysoki" | "krytyczny";
export type WindCaseResult =
  | "splacona"
  | "ugoda"
  | "egzekucja_w_toku"
  | "umorzona"
  | "przekazana_karna";

export type WindCase = {
  id: string;
  loan_id: string;
  sciezka: WindPath;
  etap: string;
  opoznienie_dni: number;
  kwota_zalegla: number;
  data_otwarcia: string;
  data_zamkniecia: string | null;
  wynik: WindCaseResult | null;
  priorytet: WindPriority;
  osoba_prowadzaca: string | null;
};

export type WindEvent = {
  id: string;
  case_id: string;
  typ: WindEventType;
  kategoria: "automatyczne" | "manualne" | "systemowe";
  tytul: string;
  tresc: string | null;
  data_zdarzenia: string;
  data_doreczenia: string | null;
  status_doreczenia: WindDeliveryStatus | null;
  zalacznik_url: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSONB; `unknown` łamie ograniczenie serializacji TanStack ServerFn
  metadata: Record<string, any>;
  /** Opłata windykacyjna naliczona za tę czynność (0 = bez opłaty). */
  oplata: number;
  autor: string | null;
  created_at: string;
};

export type WindDocument = {
  id: string;
  case_id: string;
  event_id: string | null;
  typ: WindDocumentType;
  tytul: string;
  tresc: string | null;
  plik_url: string | null;
  status: "szkic" | "gotowy" | "wyslany";
  /** Skan potwierdzenia nadania listu poleconego (ścieżka w Storage). */
  potwierdzenie_nadania_url: string | null;
  data_nadania: string | null;
  /** Skan potwierdzenia odbioru / zwrotki (ścieżka w Storage). */
  potwierdzenie_odbioru_url: string | null;
  data_odbioru: string | null;
  created_at: string;
};

export type WindCaseEnriched = WindCase & { loan: WindLoan; borrower: WindBorrower };

const LOAN_COLS =
  "id, borrower_id, numer_umowy, data_umowy, kwota_pozyczki, kwota_calkowita, prowizja, termin_splaty, numer_kw, kwota_hipoteki, akt_notarialny_777, kwota_777, rachunek_splaty, oprocentowanie_roczne, stopa_odsetek_max, status, saldo_pozostale, data_ostatniej_wplaty, data_wypowiedzenia, kwota_doplat, oplaty_windykacyjne, harmonogram, pozyczkodawca";

/** Harmonogram z bazy (JSONB) w postaci znormalizowanej — typ WindLoan.harmonogram. */
function withHarmonogram<T extends { harmonogram?: unknown }>(
  loan: T | null | undefined,
): T | null {
  if (!loan) return null;
  return { ...loan, harmonogram: normalizeHarmonogram(loan.harmonogram) };
}

/** Schemat tabeli opłat z umowy (wejście z formularza / odczytu umowy). */
const feeTableSchema = z
  .object({
    sms: z.coerce.number().min(0).nullable().optional(),
    email: z.coerce.number().min(0).nullable().optional(),
    telefon: z.coerce.number().min(0).nullable().optional(),
    pismo: z.coerce.number().min(0).nullable().optional(),
    brak_oplat: z.boolean().nullable().optional(),
    zrodlo: z.enum(["umowa", "recznie"]).nullable().optional(),
  })
  .nullable()
  .optional();

/**
 * Opłata za czynność ZGODNIE Z UMOWĄ sprawy: tabela opłat z wind_loans;
 * gdy umowa jej nie określa — domyślna podpowiedź; umowa bez opłat → 0.
 * Jawnie podana kwota (edycja w formularzu) ma pierwszeństwo.
 */
async function resolveActionFee(
  db: LooseDb,
  caseId: string,
  kind: "sms" | "email" | "telefon" | "pismo",
  explicit: number | null | undefined,
): Promise<number> {
  if (explicit != null && Number.isFinite(explicit)) return Math.max(0, explicit);
  const { data: kase } = await db
    .from("wind_collection_cases")
    .select("id, loan:wind_loans(oplaty_windykacyjne)")
    .eq("id", caseId)
    .maybeSingle();
  const table = normalizeWindFeeTable(
    (kase?.loan as { oplaty_windykacyjne?: unknown } | null)?.oplaty_windykacyjne,
  );
  return windFeeForAction(table, kind).fee;
}
const BORROWER_COLS =
  "id, imie_nazwisko, typ, pesel, nip, dowod_osobisty, adres_zamieszkania, adres_do_doreczen, email, telefon, email_zgoda_doreczenia, notatki";
const CASE_COLS =
  "id, loan_id, sciezka, etap, opoznienie_dni, kwota_zalegla, data_otwarcia, data_zamkniecia, wynik, priorytet, osoba_prowadzaca";
const EVENT_COLS =
  "id, case_id, typ, kategoria, tytul, tresc, data_zdarzenia, data_doreczenia, status_doreczenia, zalacznik_url, metadata, oplata, autor, created_at";
const DOC_COLS =
  "id, case_id, event_id, typ, tytul, tresc, plik_url, status, potwierdzenie_nadania_url, data_nadania, potwierdzenie_odbioru_url, data_odbioru, created_at";

/** Dzisiejsza data w Polsce (Europe/Warsaw), RRRR-MM-DD. */
const todayISO = () => warsawToday();
const emptyToNull = (v: unknown) => (v === "" ? null : v);
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
/** Południe UTC danego dnia — data zdarzenia nie zależy od strefy serwera. */
const noonUTC = (iso: string) => `${iso.slice(0, 10)}T12:00:00.000Z`;
const zl = (n: number) =>
  `${round2(n).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
const dataPL = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

// ── Dashboard: sprawy + zdarzenia (lite) ─────────────────────────────
export const listWindDashboard = createServerFn({ method: "GET" })
  .middleware([requireInvestorPro])
  .handler(async ({ context }) => {
    const db = loose(context.supabase);
    const { data: cases, error } = await db
      .from("wind_collection_cases")
      .select(
        `${CASE_COLS}, loan:wind_loans(${LOAN_COLS}, borrower:wind_borrowers(${BORROWER_COLS}))`,
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const list = (
      (cases ?? []) as Array<WindCase & { loan: (WindLoan & { borrower: WindBorrower }) | null }>
    ).map((c) => ({ ...c, loan: withHarmonogram(c.loan) }));
    const caseIds = list.map((c) => c.id);

    // Zdarzenia z kwotą wpłaty i opłatą — panel liczy z nich zadłużenie z
    // odsetkami karnymi dla każdej sprawy (ten sam silnik co karta sprawy).
    let events: Pick<
      WindEvent,
      | "case_id"
      | "typ"
      | "tytul"
      | "data_zdarzenia"
      | "data_doreczenia"
      | "status_doreczenia"
      | "metadata"
      | "oplata"
    >[] = [];
    if (caseIds.length) {
      const { data: ev } = await db
        .from("wind_events")
        .select(
          "case_id, typ, tytul, data_zdarzenia, data_doreczenia, status_doreczenia, metadata, oplata",
        )
        .in("case_id", caseIds)
        .order("data_zdarzenia", { ascending: false });
      events = (ev ?? []) as typeof events;
    }

    return { cases: list, events };
  });

// ── Pełna sprawa ─────────────────────────────────────────────────────
export const getWindCase = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((d: { caseId: string }) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: c, error } = await db
      .from("wind_collection_cases")
      .select(
        `${CASE_COLS}, loan:wind_loans(${LOAN_COLS}, borrower:wind_borrowers(${BORROWER_COLS}))`,
      )
      .eq("id", data.caseId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) throw new Error("Sprawa nie znaleziona");

    const [{ data: events }, { data: documents }] = await Promise.all([
      db
        .from("wind_events")
        .select(EVENT_COLS)
        .eq("case_id", data.caseId)
        .order("data_zdarzenia", { ascending: false }),
      db
        .from("wind_documents")
        .select(DOC_COLS)
        .eq("case_id", data.caseId)
        .order("created_at", { ascending: false }),
    ]);

    const loan = withHarmonogram(c.loan as (WindLoan & { borrower: WindBorrower }) | null);
    return {
      case: c as WindCase,
      loan,
      borrower: loan?.borrower ?? null,
      events: (events ?? []) as WindEvent[],
      documents: (documents ?? []) as WindDocument[],
    };
  });

// ── Walidacja pól (formularz nowej sprawy, edycja na karcie sprawy) ──
const isBlank = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");
const toNumberInput = (v: unknown) =>
  isBlank(v) ? null : typeof v === "number" ? v : (parseKwota(v) ?? Number.NaN);

/** Kwota z liczby albo tekstu („7 868,48"); pusta → null. */
const kwotaInput = z.preprocess(
  toNumberInput,
  z
    .number({ invalid_type_error: "nieprawidłowa kwota" })
    .finite("nieprawidłowa kwota")
    .min(0, "kwota nie może być ujemna")
    .nullable(),
);
/** Kwota w kolumnie NOT NULL — pusta = 0. */
const kwotaWymagana = kwotaInput.transform((v) => round2(v ?? 0));

/** Stopa w % rocznie (0–100); pusta → null. */
const stopaInput = z.preprocess(
  toNumberInput,
  z
    .number({ invalid_type_error: "nieprawidłowa stopa" })
    .min(0, "stopa nie może być ujemna")
    .max(100, "stopa ponad 100% rocznie — sprawdź wartość")
    .nullable(),
);

/** Data RRRR-MM-DD (także DD.MM.RRRR); pusta → null. */
const dataInput = z.preprocess(
  (v) => (isBlank(v) ? null : v),
  z
    .string({ invalid_type_error: "nieprawidłowa data" })
    .nullable()
    .transform((v, ctx) => {
      if (v == null) return null;
      const iso = parseDataISO(v);
      if (!iso) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "nieprawidłowa data (RRRR-MM-DD)" });
        return z.NEVER;
      }
      return iso;
    }),
);

/** Tekst (przycięty); pusty → null. */
const tekstInput = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || null : (v ?? null)),
    z
      .string({ invalid_type_error: "nieprawidłowa wartość" })
      .max(max, `najwyżej ${max} znaków`)
      .nullable(),
  );

/** Rachunek do spłaty: NRB (26 cyfr) albo IBAN PL → zapis grupowy. */
const rachunekInput = tekstInput(64).transform((v, ctx) => {
  if (v == null) return null;
  const f = formatRachunekSplaty(v);
  if (!f) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "podaj 26 cyfr numeru rachunku (NRB) albo IBAN PL",
    });
    return z.NEVER;
  }
  return f;
});

/**
 * Harmonogram rat: undefined = bez zmian, null / [] = brak harmonogramu
 * (model z jednym terminem spłaty). Błędny wiersz → błąd z numerem raty.
 */
const harmonogramInput = z
  .array(z.unknown(), { invalid_type_error: "harmonogram musi być listą rat" })
  .max(600, "najwyżej 600 rat")
  .nullable()
  .optional()
  .transform((rows, ctx) => {
    if (rows == null) return rows;
    const { harmonogram, bledy } = harmonogramFromInput(rows);
    for (const message of bledy.slice(0, 5)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
    if (bledy.length > 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `…oraz ${bledy.length - 5} innych błędów w harmonogramie.`,
      });
    }
    return harmonogram;
  });

/** Nazwy pól w komunikatach i w zdarzeniu „Zmieniono dane pożyczki". */
const POLE: Record<string, string> = {
  numer_umowy: "Numer umowy",
  data_umowy: "Data umowy",
  kwota_pozyczki: "Kwota wypłacona (na rękę)",
  kwota_calkowita: "Kwota do zwrotu bez odsetek",
  prowizja: "Prowizja Finance You",
  termin_splaty: "Termin spłaty",
  numer_kw: "Numer KW",
  kwota_hipoteki: "Kwota hipoteki",
  akt_notarialny_777: "Akt notarialny (art. 777 k.p.c.)",
  kwota_777: "Kwota z aktu 777",
  rachunek_splaty: "Rachunek do spłaty",
  oprocentowanie_roczne: "Oprocentowanie roczne",
  stopa_odsetek_max: "Stopa odsetek za opóźnienie",
  kwota_doplat: "Dopłaty",
  oplaty_windykacyjne: "Opłaty windykacyjne",
  harmonogram: "Harmonogram rat",
  pozyczkodawca: "Pożyczkodawca",
  imie_nazwisko: "Dłużnik",
  typ: "Typ dłużnika",
  pesel: "PESEL",
  nip: "NIP",
  dowod_osobisty: "Dowód osobisty",
  adres_zamieszkania: "Adres zamieszkania",
  adres_do_doreczen: "Adres do doręczeń",
  email: "E-mail",
  telefon: "Telefon",
  email_zgoda_doreczenia: "Zgoda na doręczenia e-mail",
  notatki: "Notatki",
  sciezka: "Ścieżka",
  etap: "Etap",
  priorytet: "Priorytet",
  osoba_prowadzaca: "Osoba prowadząca",
  kwota_zalegla: "Kwota zaległa",
  opoznienie_dni: "Dni opóźnienia",
  wynik: "Wynik",
  data_zamkniecia: "Data zamknięcia",
  kwota: "kwota",
  data: "data",
};

/** Walidacja z czytelnym komunikatem po polsku zamiast surowego ZodError. */
function parseInput<S extends z.ZodTypeAny>(schema: S, d: unknown): z.output<S> {
  const r = schema.safeParse(d);
  if (r.success) return r.data;
  const msgs = r.error.issues.map((i) => {
    if (i.code === z.ZodIssueCode.unrecognized_keys) {
      return `Tych pól nie można zmienić tutaj: ${i.keys.join(", ")}.`;
    }
    const msg = /[.!?]$/.test(i.message) ? i.message : `${i.message}.`;
    const key = [...i.path].reverse().find((p): p is string => typeof p === "string");
    // Błędy harmonogramu mają już numer raty.
    if (!key || key === "harmonogram") return msg;
    const wplata = i.path[0] === "wplaty" && typeof i.path[1] === "number" ? i.path[1] + 1 : null;
    if (wplata != null) return `Wpłata ${wplata} — ${POLE[key] ?? key}: ${msg}`;
    return `${POLE[key] ?? key}: ${msg}`;
  });
  throw new Error([...new Set(msgs)].join(" "));
}

/** Porównanie wartości pola przed i po edycji (obiekty — bez względu na kolejność kluczy). */
function sameValue(a: unknown, b: unknown): boolean {
  const stable = (v: unknown) =>
    JSON.stringify(v ?? null, (_k, x: unknown) =>
      x && typeof x === "object" && !Array.isArray(x)
        ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => p.localeCompare(q)))
        : x,
    );
  return stable(a) === stable(b);
}

async function readLoan(db: LooseDb, id: string): Promise<WindLoan> {
  const { data, error } = await db.from("wind_loans").select(LOAN_COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Pożyczka nie znaleziona");
  return withHarmonogram(data as WindLoan) as WindLoan;
}

/** Otwarte sprawy pożyczki (bez daty zamknięcia). */
async function openCaseIds(db: LooseDb, loanId: string): Promise<string[]> {
  const { data, error } = await db
    .from("wind_collection_cases")
    .select("id")
    .eq("loan_id", loanId)
    .is("data_zamkniecia", null);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string }>).map((c) => c.id);
}

// ── Utworzenie sprawy (borrower + loan + case + zdarzenie systemowe) ──
const createSchema = z.object({
  imie_nazwisko: z.string().trim().min(1, "podaj imię i nazwisko albo nazwę dłużnika"),
  typ: z.enum(["osoba_fizyczna", "firma"]).default("osoba_fizyczna"),
  pesel: z.string().optional().nullable(),
  nip: z.string().optional().nullable(),
  adres_zamieszkania: z.string().optional().nullable(),
  adres_do_doreczen: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  telefon: z.string().optional().nullable(),
  email_zgoda_doreczenia: z.boolean().default(false),
  numer_umowy: z.string().optional().nullable(),
  data_umowy: dataInput,
  /** Kwota wypłacona na rękę. */
  kwota_pozyczki: kwotaWymagana,
  /** Kwota pożyczki + prowizja pożyczkodawcy, BEZ odsetek umownych. */
  kwota_calkowita: kwotaWymagana,
  /** Prowizja Finance You potrącona z wypłaty. */
  prowizja: kwotaWymagana,
  termin_splaty: dataInput,
  numer_kw: z.string().optional().nullable(),
  kwota_hipoteki: kwotaInput,
  akt_notarialny_777: tekstInput(300),
  kwota_777: kwotaInput,
  rachunek_splaty: rachunekInput,
  oprocentowanie_roczne: stopaInput.transform((v) => v ?? 0),
  /** Stopa odsetek za opóźnienie z umowy; 0 / brak = odsetki maksymalne za opóźnienie z dnia umowy. */
  stopa_odsetek_max: stopaInput,
  /** Tabela opłat za czynności windykacyjne z umowy (odczyt AI / korekta). */
  oplaty_windykacyjne: feeTableSchema,
  /** Harmonogram rat (Zał. 1) — z odczytu umowy, generatora albo wpisany ręcznie. */
  harmonogram: harmonogramInput,
  /** Nazwa pożyczkodawcy z umowy. */
  pozyczkodawca: tekstInput(200),
  /**
   * Kwota zaległa po wpłatach — tylko dla pożyczki bez harmonogramu
   * (0 = całe saldo). Z harmonogramem liczona z rat, wartość ignorowana.
   */
  kwota_zalegla: kwotaWymagana,
  sciezka: z.enum(["miekka", "standardowa", "twarda", "karna"]).default("miekka"),
  etap: z.string().default("kontakt_wstepny"),
  priorytet: z.enum(["niski", "sredni", "wysoki", "krytyczny"]).default("sredni"),
  osoba_prowadzaca: z.string().optional().nullable(),
  /** Skan umowy pożyczki (ścieżka w Storage) — zapisywany jako dowód w aktach. */
  umowa_url: z.string().optional().nullable(),
  /** Wpłaty otrzymane dotychczas od klienta (z potwierdzeń przelewów). */
  wplaty: z
    .array(
      z.object({
        kwota: kwotaInput
          .refine((v) => v != null && v > 0, "kwota wpłaty musi być większa od 0")
          .transform((v) => round2(v ?? 0)),
        data: dataInput.refine((v) => v != null, "podaj datę wpłaty").transform((v) => v ?? ""),
        zalacznik_url: z.string().optional().nullable(),
      }),
    )
    .default([]),
});

export const createWindCase = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((d: Record<string, unknown>) => parseInput(createSchema, d))
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const autor = context.claims?.email ?? null;
    const asOf = todayISO();

    const wplaty = [...(data.wplaty ?? [])].sort((a, b) => a.data.localeCompare(b.data));
    const harmonogram = data.harmonogram ?? null;
    // Stopa odsetek za opóźnienie: z umowy, a gdy nie podano — odsetki
    // maksymalne za opóźnienie z dnia zawarcia umowy (WIN_01).
    const stopa =
      data.stopa_odsetek_max != null && data.stopa_odsetek_max > 0
        ? data.stopa_odsetek_max
        : defaultDelayRate(data.data_umowy);
    // Termin spłaty = termin ostatniej raty, gdy podano tylko harmonogram.
    const terminSplaty =
      data.termin_splaty ?? harmonogram?.[harmonogram.length - 1]?.termin ?? null;

    // Pożyczka z harmonogramem: kwota zaległa = niezapłacone raty wymagalne
    // na dziś (po zaliczeniu wpłat z potwierdzeń), opóźnienie od najstarszej
    // zaległej raty, saldo = zaległe raty + raty przyszłe.
    const plan: WindRecalcPlan | null = harmonogram
      ? windRecalcPlan({
          loan: {
            kwota_pozyczki: data.kwota_pozyczki,
            kwota_calkowita: data.kwota_calkowita,
            prowizja: data.prowizja,
            data_umowy: data.data_umowy,
            termin_splaty: terminSplaty,
            oprocentowanie_roczne: data.oprocentowanie_roczne,
            stopa_odsetek_max: stopa,
            status: "w_zwloce",
            harmonogram,
          },
          events: wplaty.map((w) => ({
            typ: "wplata",
            data_zdarzenia: noonUTC(w.data),
            metadata: { kwota: w.kwota },
          })),
          asOf,
        })
      : null;

    let saldo: number;
    let kwotaZalegla: number;
    let opoznienie: number;
    if (plan) {
      saldo = plan.loanPatch.saldo_pozostale;
      kwotaZalegla = plan.casePatch.kwota_zalegla;
      opoznienie = plan.casePatch.opoznienie_dni;
    } else {
      // Model jednoterminowy: saldo = kwota do zwrotu minus wpłaty z
      // potwierdzeń przelewów. Ręcznie podana kwota zaległa jest podstawą
      // odsetek za opóźnienie sprawy, ale NIE nadpisuje salda pożyczki.
      const naleznoscBazowa = data.kwota_calkowita || data.kwota_pozyczki;
      const sumaWplat = wplaty.reduce((s, w) => s + w.kwota, 0);
      saldo = round2(Math.max(0, naleznoscBazowa - sumaWplat));
      kwotaZalegla = data.kwota_zalegla || saldo;
      opoznienie = daysSinceDue(terminSplaty, asOf);
    }

    const { data: borrower, error: bErr } = await db
      .from("wind_borrowers")
      .insert({
        imie_nazwisko: data.imie_nazwisko,
        typ: data.typ,
        pesel: emptyToNull(data.pesel),
        nip: emptyToNull(data.nip),
        adres_zamieszkania: emptyToNull(data.adres_zamieszkania),
        adres_do_doreczen: emptyToNull(data.adres_do_doreczen),
        email: emptyToNull(data.email),
        telefon: emptyToNull(data.telefon),
        email_zgoda_doreczenia: data.email_zgoda_doreczenia,
      })
      .select("id")
      .single();
    if (bErr) throw new Error(bErr.message);

    const { data: loan, error: lErr } = await db
      .from("wind_loans")
      .insert({
        borrower_id: borrower.id,
        numer_umowy: emptyToNull(data.numer_umowy),
        data_umowy: data.data_umowy,
        kwota_pozyczki: data.kwota_pozyczki,
        kwota_calkowita: data.kwota_calkowita,
        prowizja: data.prowizja,
        termin_splaty: terminSplaty,
        numer_kw: emptyToNull(data.numer_kw),
        kwota_hipoteki: data.kwota_hipoteki,
        akt_notarialny_777: data.akt_notarialny_777,
        kwota_777: data.kwota_777,
        rachunek_splaty: data.rachunek_splaty,
        oprocentowanie_roczne: data.oprocentowanie_roczne,
        stopa_odsetek_max: stopa,
        oplaty_windykacyjne: normalizeWindFeeTable(data.oplaty_windykacyjne) ?? null,
        harmonogram,
        pozyczkodawca: data.pozyczkodawca,
        status: plan?.loanPatch.status ?? "w_zwloce",
        saldo_pozostale: saldo,
        data_ostatniej_wplaty: wplaty.length ? wplaty[wplaty.length - 1].data : null,
      })
      .select("id")
      .single();
    if (lErr) throw new Error(lErr.message);

    const { data: kase, error: cErr } = await db
      .from("wind_collection_cases")
      .insert({
        loan_id: loan.id,
        sciezka: data.sciezka,
        etap: data.etap,
        opoznienie_dni: opoznienie,
        kwota_zalegla: kwotaZalegla,
        data_otwarcia: asOf,
        priorytet: data.priorytet,
        osoba_prowadzaca: emptyToNull(data.osoba_prowadzaca),
      })
      .select("id")
      .single();
    if (cErr) throw new Error(cErr.message);

    await db.from("wind_events").insert({
      case_id: kase.id,
      typ: "zmiana_etapu",
      kategoria: "systemowe",
      tytul: "Sprawa windykacyjna otwarta",
      tresc: [
        `Ścieżka: ${data.sciezka}, etap: ${data.etap}.`,
        plan
          ? `Harmonogram: ${opisHarmonogramu(harmonogram)}. Zaległe raty na ${dataPL(asOf)}: ${zl(kwotaZalegla)}, opóźnienie ${opoznienie} dni.`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      autor,
    });

    // Skan umowy pożyczki — dowód w aktach sprawy.
    if (data.umowa_url) {
      await db.from("wind_events").insert({
        case_id: kase.id,
        typ: "notatka",
        kategoria: "systemowe",
        tytul: "Umowa pożyczki — skan w aktach",
        tresc: "Umowa wgrana przy zakładaniu sprawy; dane sprawy odczytane z umowy.",
        zalacznik_url: data.umowa_url,
        autor,
      });
    }

    // Wpłaty otrzymane dotychczas (z potwierdzeń przelewów) — pełna historia
    // do wyliczenia zaległości i odsetek. Jeden insert: zapisują się wszystkie
    // albo żadna.
    let ostrzezenie: string | null = null;
    if (wplaty.length) {
      const { error: wErr } = await db.from("wind_events").insert(
        wplaty.map((w) => ({
          case_id: kase.id,
          typ: "wplata",
          kategoria: "manualne",
          tytul: "Odnotowano wpłatę",
          tresc: "Wpłata z potwierdzenia przelewu (przy zakładaniu sprawy).",
          data_zdarzenia: noonUTC(w.data),
          zalacznik_url: emptyToNull(w.zalacznik_url),
          metadata: { kwota: w.kwota, sposob: "przelew (potwierdzenie)" },
          autor,
        })),
      );
      if (wErr) {
        console.error("[windykacja] zapis wpłat przy zakładaniu sprawy:", wErr.message);
        ostrzezenie = `Sprawa założona, ale nie zapisano wpłat (${wErr.message}) — dodaj je na karcie sprawy.`;
        // Migawka sprawy zgodna z tym, co faktycznie jest w aktach.
        if (plan) {
          try {
            const r = await recalcWindCaseDetailed(db, kase.id as string, { asOf });
            if (r) kwotaZalegla = r.casePatch.kwota_zalegla;
          } catch (e) {
            console.error("[windykacja] przeliczenie sprawy:", (e as Error).message);
          }
        }
      }
    }

    return { caseId: kase.id as string, kwota_zalegla: kwotaZalegla, ostrzezenie };
  });

// ── Edycja: borrower / loan / case (tylko pola z listy) ──────────────
const borrowerPatchSchema = z
  .object({
    imie_nazwisko: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() : v),
      z
        .string()
        .min(1, "podaj imię i nazwisko albo nazwę dłużnika")
        .max(300, "najwyżej 300 znaków"),
    ),
    typ: z.enum(["osoba_fizyczna", "firma"]),
    pesel: z.preprocess(
      (v) => (isBlank(v) ? null : typeof v === "string" ? v.replace(/\s/g, "") : v),
      z
        .string()
        .regex(/^\d{11}$/, "PESEL ma 11 cyfr")
        .nullable(),
    ),
    nip: z.preprocess(
      (v) =>
        isBlank(v) ? null : typeof v === "string" ? v.replace(/[\s-]/g, "").replace(/^PL/i, "") : v,
      z
        .string()
        .regex(/^\d{10}$/, "NIP ma 10 cyfr")
        .nullable(),
    ),
    dowod_osobisty: tekstInput(30),
    adres_zamieszkania: tekstInput(500),
    adres_do_doreczen: tekstInput(500),
    email: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() || null : (v ?? null)),
      z.string().email("nieprawidłowy adres e-mail").max(254).nullable(),
    ),
    telefon: tekstInput(30),
    email_zgoda_doreczenia: z.boolean(),
    notatki: tekstInput(5000),
  })
  .partial()
  .strict();

export const updateWindBorrower = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((d: { id: string; patch: Record<string, unknown> }) =>
    parseInput(z.object({ id: z.string().uuid(), patch: borrowerPatchSchema }), d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const patch = Object.fromEntries(Object.entries(data.patch).filter(([, v]) => v !== undefined));
    const { data: rows, error } = Object.keys(patch).length
      ? await db.from("wind_borrowers").update(patch).eq("id", data.id).select(BORROWER_COLS)
      : await db.from("wind_borrowers").select(BORROWER_COLS).eq("id", data.id);
    if (error) throw new Error(error.message);
    const borrower = (rows ?? [])[0] as WindBorrower | undefined;
    if (!borrower) throw new Error("Dłużnik nie znaleziony albo brak uprawnień do edycji");
    return { ok: true as const, borrower };
  });

/**
 * Pola pożyczki, które można zmienić z karty sprawy. Status, saldo
 * i wypowiedzenie mają osobne funkcje (wpłata, wypowiedzenie umowy).
 */
const loanPatchSchema = z
  .object({
    numer_umowy: tekstInput(100),
    data_umowy: dataInput,
    kwota_pozyczki: kwotaWymagana,
    kwota_calkowita: kwotaWymagana,
    prowizja: kwotaWymagana,
    termin_splaty: dataInput,
    numer_kw: tekstInput(60),
    kwota_hipoteki: kwotaInput,
    akt_notarialny_777: tekstInput(300),
    kwota_777: kwotaInput,
    rachunek_splaty: rachunekInput,
    oprocentowanie_roczne: stopaInput.transform((v) => v ?? 0),
    /** Pusta / 0 = odsetki maksymalne za opóźnienie z dnia umowy. */
    stopa_odsetek_max: stopaInput,
    kwota_doplat: kwotaWymagana,
    oplaty_windykacyjne: feeTableSchema,
    harmonogram: harmonogramInput,
    pozyczkodawca: tekstInput(200),
  })
  .partial()
  .strict();

export const updateWindLoan = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((d: { id: string; caseId?: string | null; patch: Record<string, unknown> }) =>
    parseInput(
      z.object({
        id: z.string().uuid(),
        /** Sprawa, której migawkę przeliczyć (i w której aktach zapisać zmianę). */
        caseId: z.string().uuid().nullable().optional(),
        patch: loanPatchSchema,
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { id, caseId } = data;

    if (caseId) {
      const { data: kase, error } = await db
        .from("wind_collection_cases")
        .select("loan_id")
        .eq("id", caseId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!kase || kase.loan_id !== id) throw new Error("Sprawa nie dotyczy tej pożyczki");
    }

    const before = await readLoan(db, id);
    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries(data.patch).filter(([, v]) => v !== undefined),
    );
    if ("oplaty_windykacyjne" in patch) {
      patch.oplaty_windykacyjne = normalizeWindFeeTable(patch.oplaty_windykacyjne) ?? null;
    }
    // Pusta stopa odsetek za opóźnienie = odsetki maksymalne z dnia umowy.
    if ("stopa_odsetek_max" in patch && !(Number(patch.stopa_odsetek_max) > 0)) {
      const dataUmowy =
        "data_umowy" in patch ? (patch.data_umowy as string | null) : before.data_umowy;
      patch.stopa_odsetek_max = defaultDelayRate(dataUmowy);
    }
    // Zapisujemy tylko pola, które faktycznie się zmieniły.
    const changed = Object.keys(patch).filter(
      (k) => !sameValue((before as Record<string, unknown>)[k], patch[k]),
    );
    if (changed.length) {
      const update = Object.fromEntries(changed.map((k) => [k, patch[k]]));
      const { data: rows, error } = await db
        .from("wind_loans")
        .update(update)
        .eq("id", id)
        .select("id");
      if (error) throw new Error(error.message);
      if (!rows?.length) throw new Error("Pożyczka nie znaleziona albo brak uprawnień do edycji");
    }

    let loan = changed.length ? await readLoan(db, id) : before;

    // Pożyczka z harmonogramem: przeliczamy migawkę sprawy — wskazanej albo
    // wszystkich otwartych spraw tej pożyczki (kwota zaległa, opóźnienie,
    // saldo i status pożyczki).
    let recalc: WindRecalcOutcome | null = null;
    let recalcError: Error | null = null;
    if (loan.harmonogram) {
      try {
        const ids = caseId ? [caseId] : await openCaseIds(db, id);
        for (const cid of ids) {
          const r = await recalcWindCaseDetailed(db, cid);
          if (cid === caseId) recalc = r;
        }
        if (ids.length) loan = await readLoan(db, id);
      } catch (e) {
        // Zmiana jest już zapisana — najpierw ślad w aktach, potem błąd.
        recalcError = e as Error;
      }
    }

    // Ślad w aktach sprawy: co zmieniono w danych pożyczki.
    if (caseId && changed.length) {
      const linie = [`Zmienione pola: ${changed.map((k) => POLE[k] ?? k).join(", ")}.`];
      if (changed.includes("harmonogram")) {
        linie.push(`Harmonogram: ${opisHarmonogramu(loan.harmonogram)}.`);
      }
      if (recalc) {
        linie.push(
          `Zaległe raty na ${dataPL(recalc.asOf)}: ${zl(recalc.casePatch.kwota_zalegla)}, opóźnienie ${recalc.casePatch.opoznienie_dni} dni.`,
        );
      }
      const { error: evErr } = await db.from("wind_events").insert({
        case_id: caseId,
        typ: "notatka",
        kategoria: "systemowe",
        tytul: "Zmieniono dane pożyczki",
        tresc: linie.join("\n"),
        autor: context.claims?.email ?? null,
      });
      if (evErr) console.error("[windykacja] zdarzenie edycji pożyczki:", evErr.message);
    }
    if (recalcError) {
      throw new Error(
        `Dane pożyczki zapisane, ale nie udało się przeliczyć zaległości: ${recalcError.message}`,
      );
    }

    return { ok: true as const, loan };
  });

const casePatchSchema = z
  .object({
    sciezka: z.enum(["miekka", "standardowa", "twarda", "karna"]),
    etap: z.string().trim().min(1, "podaj etap").max(100),
    priorytet: z.enum(["niski", "sredni", "wysoki", "krytyczny"]),
    osoba_prowadzaca: tekstInput(200),
    kwota_zalegla: kwotaWymagana,
    opoznienie_dni: z.coerce.number().int().min(0).max(36_500),
    wynik: z.preprocess(
      (v) => (isBlank(v) ? null : v),
      z.enum(["splacona", "ugoda", "egzekucja_w_toku", "umorzona", "przekazana_karna"]).nullable(),
    ),
    data_zamkniecia: dataInput,
  })
  .partial()
  .strict();

export const updateWindCase = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((d: { id: string; patch: Record<string, unknown> }) =>
    parseInput(z.object({ id: z.string().uuid(), patch: casePatchSchema }), d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const patch = Object.fromEntries(Object.entries(data.patch).filter(([, v]) => v !== undefined));
    const { data: rows, error } = Object.keys(patch).length
      ? await db.from("wind_collection_cases").update(patch).eq("id", data.id).select(CASE_COLS)
      : await db.from("wind_collection_cases").select(CASE_COLS).eq("id", data.id);
    if (error) throw new Error(error.message);
    const kase = (rows ?? [])[0] as WindCase | undefined;
    if (!kase) throw new Error("Sprawa nie znaleziona albo brak uprawnień do edycji");
    return { ok: true as const, case: kase };
  });

// ── Zmiana etapu / ścieżki (zapisuje zdarzenie) ──────────────────────
export const changeWindStage = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((d: Record<string, unknown>) =>
    z
      .object({
        caseId: z.string().uuid(),
        sciezka: z.enum(["miekka", "standardowa", "twarda", "karna"]),
        etap: z.string().min(1),
        note: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { error } = await db
      .from("wind_collection_cases")
      .update({ sciezka: data.sciezka, etap: data.etap })
      .eq("id", data.caseId);
    if (error) throw new Error(error.message);

    const { data: ev, error: eErr } = await db
      .from("wind_events")
      .insert({
        case_id: data.caseId,
        typ: "zmiana_etapu",
        kategoria: "systemowe",
        tytul: `Zmiana etapu → ${data.sciezka} / ${data.etap}`,
        tresc: emptyToNull(data.note),
        autor: context.claims?.email ?? null,
      })
      .select(EVENT_COLS)
      .single();
    if (eErr) throw new Error(eErr.message);
    return ev as WindEvent;
  });

// ── Status wypowiedzenia umowy (jednorazowy wybór dla firmy/sprawy) ───
// Decyduje o logice finansowej: po wypowiedzeniu odsetki za opóźnienie
// naliczamy od CAŁOŚCI, przed — tylko od zaległych rat.
export const setWindTermination = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((d: Record<string, unknown>) =>
    z
      .object({
        loanId: z.string().uuid(),
        caseId: z.string().uuid(),
        terminated: z.boolean(),
        data_wypowiedzenia: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: loan } = await db
      .from("wind_loans")
      .select("status, harmonogram")
      .eq("id", data.loanId)
      .maybeSingle();

    const patch: Record<string, unknown> = data.terminated
      ? {
          status: "wypowiedziana",
          data_wypowiedzenia: data.data_wypowiedzenia || todayISO(),
        }
      : {
          // Cofnięcie wypowiedzenia: wracamy do statusu „w zwłoce".
          status: loan?.status === "wypowiedziana" ? "w_zwloce" : loan?.status,
          data_wypowiedzenia: null,
        };

    const { error } = await db.from("wind_loans").update(patch).eq("id", data.loanId);
    if (error) throw new Error(error.message);

    // Pożyczka z harmonogramem: po wypowiedzeniu wymagalne są wszystkie raty
    // (po cofnięciu — znów tylko zapadłe) — przeliczamy migawkę sprawy.
    if (normalizeHarmonogram(loan?.harmonogram)) {
      try {
        await recalcWindCaseDetailed(db, data.caseId);
      } catch (e) {
        console.error("[windykacja] przeliczenie sprawy po wypowiedzeniu:", (e as Error).message);
      }
    }

    const { data: ev, error: eErr } = await db
      .from("wind_events")
      .insert({
        case_id: data.caseId,
        typ: "notatka",
        kategoria: "systemowe",
        tytul: data.terminated
          ? "Umowa oznaczona jako wypowiedziana"
          : "Cofnięto status wypowiedzenia",
        tresc: data.terminated
          ? `Od dnia ${patch.data_wypowiedzenia} cała należność jest wymagalna; odsetki za opóźnienie naliczane są od całości (art. 481 § 2¹ k.c.).`
          : "Umowa niewypowiedziana — odsetki za opóźnienie naliczane są wyłącznie od zaległych rat.",
        autor: context.claims?.email ?? null,
      })
      .select(EVENT_COLS)
      .single();
    if (eErr) throw new Error(eErr.message);
    return ev as WindEvent;
  });

// ── Działanie kontaktowe: SMS / e-mail / telefon ─────────────────────
export const performWindContact = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((d: Record<string, unknown>) =>
    z
      .object({
        caseId: z.string().uuid(),
        typ: z.enum(["sms", "email", "telefon"]),
        target: z.string().optional().nullable(),
        subject: z.string().optional().nullable(),
        tresc: z.string().min(1, "Treść jest wymagana"),
        /** Brak = opłata zgodnie z tabelą opłat z umowy (albo domyślna podpowiedź). */
        oplata: z.coerce.number().min(0).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    let status: WindDeliveryStatus | null = null;
    let extra: Record<string, unknown> = {};
    let tytul = "";
    // Opłata za czynność — zgodnie z umową pożyczki tej sprawy.
    const oplata = await resolveActionFee(db, data.caseId, data.typ, data.oplata);

    if (data.typ === "sms") {
      tytul = "SMS wysłany";
      if (!data.target) throw new Error("Brak numeru telefonu");
      const { sendSmsInternal } = await import("@/lib/voicebot.functions");
      const res = await sendSmsInternal({
        phone: data.target,
        body: data.tresc,
        source: "windykacja",
        // Wysyłka ręczna operatora windykacji — poza limitami hamulca SMS.
        category: "critical",
      });
      status = res.ok ? "doreczone" : null;
      extra = { ok: res.ok, sid: res.sid ?? null, error: res.error ?? null, numer: data.target };
      if (!res.ok) tytul = "SMS — błąd wysyłki";
    } else if (data.typ === "email") {
      tytul = `E-mail: ${data.subject || "Wiadomość"}`;
      if (!data.target) throw new Error("Brak adresu e-mail");
      const { sendResendEmail } = await import("@/lib/resend-send.server");
      const res = await sendResendEmail({
        to: data.target,
        subject: data.subject || "Finance You — windykacja",
        category: "transactional",
        text: data.tresc,
      });
      status = res.ok ? "doreczone" : null;
      extra = { ok: res.ok, id: res.id ?? null, error: res.error ?? null, email: data.target };
      if (!res.ok) tytul = "E-mail — błąd wysyłki";
    } else {
      tytul = "Rozmowa telefoniczna";
      extra = { numer: data.target ?? null };
    }

    const { data: ev, error } = await db
      .from("wind_events")
      .insert({
        case_id: data.caseId,
        typ: data.typ,
        kategoria: data.typ === "telefon" ? "manualne" : "automatyczne",
        tytul,
        tresc: data.tresc,
        data_doreczenia:
          data.typ === "email" || data.typ === "sms"
            ? status
              ? new Date().toISOString()
              : null
            : null,
        status_doreczenia: status,
        metadata: extra,
        // SMS/e-mail, który nie wyszedł, nie obciąża dłużnika opłatą.
        oplata: data.typ === "telefon" || status ? oplata : 0,
        autor: context.claims?.email ?? null,
      })
      .select(EVENT_COLS)
      .single();
    if (error) throw new Error(error.message);
    return ev as WindEvent;
  });

// ── Pismo nadane (manualne) ──────────────────────────────────────────
export const addWindPismoNadane = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((d: Record<string, unknown>) =>
    z
      .object({
        caseId: z.string().uuid(),
        tytul: z.string().min(1),
        data_nadania: z.string().min(1),
        numer_nadania: z.string().optional().nullable(),
        zalacznik_url: z.string().optional().nullable(),
        tresc: z.string().optional().nullable(),
        oplata: z.coerce.number().min(0).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: ev, error } = await db
      .from("wind_events")
      .insert({
        case_id: data.caseId,
        typ: "pismo_nadane",
        kategoria: "manualne",
        tytul: data.tytul,
        tresc: emptyToNull(data.tresc),
        data_zdarzenia: new Date(`${data.data_nadania}T12:00:00`).toISOString(),
        status_doreczenia: "oczekuje",
        zalacznik_url: emptyToNull(data.zalacznik_url),
        metadata: { numer_nadania: data.numer_nadania ?? null },
        oplata: data.oplata,
        autor: context.claims?.email ?? null,
      })
      .select(EVENT_COLS)
      .single();
    if (error) throw new Error(error.message);
    return ev as WindEvent;
  });

// ── Aktualizacja doręczenia (osobne zdarzenie — append-only) ─────────
export const addWindDelivery = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((d: Record<string, unknown>) =>
    z
      .object({
        caseId: z.string().uuid(),
        typ: z.enum(["pismo_doreczone", "pismo_awizo", "pismo_zwrot"]),
        status_doreczenia: z.enum(["doreczone", "awizowane", "termin_uplynal", "zwrot"]),
        data: z.string().min(1),
        zalacznik_url: z.string().optional().nullable(),
        note: z.string().optional().nullable(),
        nadanie_event_id: z.string().uuid().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const labels: Record<string, string> = {
      pismo_doreczone: "Pismo doręczone (zwrotka)",
      pismo_awizo: "Awizo",
      pismo_zwrot: "Przesyłka zwrócona — fikcja doręczenia",
    };
    const { data: ev, error } = await db
      .from("wind_events")
      .insert({
        case_id: data.caseId,
        typ: data.typ,
        kategoria: "manualne",
        tytul: labels[data.typ],
        tresc: emptyToNull(data.note),
        data_zdarzenia: new Date(`${data.data}T12:00:00`).toISOString(),
        data_doreczenia: new Date(`${data.data}T12:00:00`).toISOString(),
        status_doreczenia: data.status_doreczenia,
        zalacznik_url: emptyToNull(data.zalacznik_url),
        metadata: { nadanie_event_id: data.nadanie_event_id ?? null },
        autor: context.claims?.email ?? null,
      })
      .select(EVENT_COLS)
      .single();
    if (error) throw new Error(error.message);
    return ev as WindEvent;
  });

// ── Wpłata (zdarzenie + aktualizacja salda) ──────────────────────────
export const addWindWplata = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((d: Record<string, unknown>) =>
    parseInput(
      z.object({
        caseId: z.string().uuid(),
        loanId: z.string().uuid(),
        kwota: kwotaInput
          .refine((v) => v != null && v > 0, "kwota wpłaty musi być większa od 0")
          .transform((v) => round2(v ?? 0)),
        data: dataInput.refine((v) => v != null, "podaj datę wpłaty").transform((v) => v ?? ""),
        sposob: z.string().optional().nullable(),
      }),
      d,
    ),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);

    // Wpłata musi dotyczyć pożyczki tej sprawy.
    const { data: kase, error: kErr } = await db
      .from("wind_collection_cases")
      .select("loan_id, kwota_zalegla")
      .eq("id", data.caseId)
      .maybeSingle();
    if (kErr) throw new Error(kErr.message);
    if (!kase) throw new Error("Sprawa nie znaleziona");
    if (kase.loan_id !== data.loanId) throw new Error("Wpłata nie dotyczy pożyczki tej sprawy");
    const { data: loan, error: lErr } = await db
      .from("wind_loans")
      .select("saldo_pozostale, status, data_ostatniej_wplaty, harmonogram")
      .eq("id", data.loanId)
      .maybeSingle();
    if (lErr) throw new Error(lErr.message);
    if (!loan) throw new Error("Pożyczka nie znaleziona");

    const { data: ev, error } = await db
      .from("wind_events")
      .insert({
        case_id: data.caseId,
        typ: "wplata",
        kategoria: "manualne",
        tytul: "Odnotowano wpłatę",
        tresc: data.sposob ? `Sposób: ${data.sposob}` : null,
        data_zdarzenia: noonUTC(data.data),
        metadata: { kwota: data.kwota, sposob: data.sposob ?? null },
        autor: context.claims?.email ?? null,
      })
      .select(EVENT_COLS)
      .single();
    if (error) throw new Error(error.message);

    // Data ostatniej wpłaty — najpóźniejsza (wpłata wpisana wstecz jej nie cofa).
    const ostatnia =
      loan.data_ostatniej_wplaty && String(loan.data_ostatniej_wplaty) > data.data
        ? String(loan.data_ostatniej_wplaty).slice(0, 10)
        : data.data;

    // Pożyczka z harmonogramem: wpłata rozliczana na raty wg umowy (koszty →
    // odsetki za opóźnienie → raty od najstarszej) — kwotę zaległą, opóźnienie
    // i saldo przeliczamy z rat, a nie odejmujemy całej wpłaty.
    if (normalizeHarmonogram(loan.harmonogram)) {
      await db.from("wind_loans").update({ data_ostatniej_wplaty: ostatnia }).eq("id", data.loanId);
      try {
        const r = await recalcWindCaseDetailed(db, data.caseId);
        if (r) {
          return {
            event: ev as WindEvent,
            saldo_pozostale: r.loanPatch.saldo_pozostale,
            kwota_zalegla: r.casePatch.kwota_zalegla,
          };
        }
      } catch (e) {
        // Wpłata jest już w aktach (karta sprawy liczy zaległość na bieżąco
        // ze zdarzeń) — nie zgłaszamy błędu, żeby nie wpisano jej drugi raz.
        console.error("[windykacja] przeliczenie sprawy po wpłacie:", (e as Error).message);
      }
      return {
        event: ev as WindEvent,
        saldo_pozostale: Number(loan.saldo_pozostale ?? 0),
        kwota_zalegla: Number(kase.kwota_zalegla ?? 0),
      };
    }

    // Model jednoterminowy: wpłata pomniejsza saldo pożyczki i kwotę zaległą.
    const newSaldo = round2(Math.max(0, Number(loan.saldo_pozostale ?? 0) - data.kwota));
    const newZalegla = round2(Math.max(0, Number(kase.kwota_zalegla ?? 0) - data.kwota));
    await db
      .from("wind_loans")
      .update({
        saldo_pozostale: newSaldo,
        data_ostatniej_wplaty: ostatnia,
        status: newSaldo <= 0 ? "splacona" : loan.status,
      })
      .eq("id", data.loanId);
    await db
      .from("wind_collection_cases")
      .update({ kwota_zalegla: newZalegla })
      .eq("id", data.caseId);

    return { event: ev as WindEvent, saldo_pozostale: newSaldo, kwota_zalegla: newZalegla };
  });

// ── Notatka ──────────────────────────────────────────────────────────
export const addWindNotatka = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((d: Record<string, unknown>) =>
    z.object({ caseId: z.string().uuid(), tresc: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: ev, error } = await db
      .from("wind_events")
      .insert({
        case_id: data.caseId,
        typ: "notatka",
        kategoria: "manualne",
        tytul: "Notatka",
        tresc: data.tresc,
        autor: context.claims?.email ?? null,
      })
      .select(EVENT_COLS)
      .single();
    if (error) throw new Error(error.message);
    return ev as WindEvent;
  });

// ── Generowanie dokumentu (szablon + zdarzenie) ──────────────────────
export const generateWindDocument = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((d: Record<string, unknown>) =>
    z
      .object({
        caseId: z.string().uuid(),
        typ: z.enum([
          "wezwanie",
          "wypowiedzenie",
          "wniosek_klauzula",
          "wniosek_komornik",
          "aneks",
          "porozumienie",
          "ugoda",
          "zawiadomienie_286",
          "zawiadomienie_297",
          "notatka",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: c } = await db
      .from("wind_collection_cases")
      .select(
        `kwota_zalegla, loan:wind_loans(${LOAN_COLS}, borrower:wind_borrowers(${BORROWER_COLS}))`,
      )
      .eq("id", data.caseId)
      .maybeSingle();
    if (!c) throw new Error("Sprawa nie znaleziona");
    const loan = c.loan as (WindLoan & { borrower: WindBorrower }) | null;
    const b = loan?.borrower;

    // Pożyczka z harmonogramem: kwoty w piśmie z rat wymagalnych na dziś,
    // a nie z ostatniego zapisu (od niego mogły zapaść kolejne raty).
    let kwotaZalegla = Number(c.kwota_zalegla ?? 0);
    let saldoPozostale = Number(loan?.saldo_pozostale ?? 0);
    if (normalizeHarmonogram(loan?.harmonogram)) {
      const r = await recalcWindCaseDetailed(db, data.caseId);
      if (r) {
        kwotaZalegla = r.casePatch.kwota_zalegla;
        saldoPozostale = r.loanPatch.saldo_pozostale;
      }
    }

    const ctx: DocContext = {
      dluznik: b?.imie_nazwisko ?? "…",
      adres: b?.adres_do_doreczen || b?.adres_zamieszkania || "…",
      pesel: b?.pesel,
      nip: b?.nip,
      numer_umowy: loan?.numer_umowy,
      data_umowy: loan?.data_umowy,
      kwota_zalegla: kwotaZalegla,
      saldo_pozostale: saldoPozostale,
      numer_kw: loan?.numer_kw,
      akt_777: loan?.akt_notarialny_777,
      rachunek: loan?.rachunek_splaty,
      data: new Date().toISOString(),
    };
    const built = buildWindDocument(data.typ as WindDocumentType, ctx);

    const { data: ev, error: eErr } = await db
      .from("wind_events")
      .insert({
        case_id: data.caseId,
        typ: "dokument_wygenerowany",
        kategoria: "systemowe",
        tytul: `Wygenerowano: ${built.tytul}`,
        tresc: built.tresc,
        autor: context.claims?.email ?? null,
      })
      .select(EVENT_COLS)
      .single();
    if (eErr) throw new Error(eErr.message);

    const { data: doc, error: dErr } = await db
      .from("wind_documents")
      .insert({
        case_id: data.caseId,
        event_id: ev.id,
        typ: data.typ,
        tytul: built.tytul,
        tresc: built.tresc,
        status: "gotowy",
      })
      .select(DOC_COLS)
      .single();
    if (dErr) throw new Error(dErr.message);

    return { document: doc as WindDocument, event: ev as WindEvent };
  });

// ── Rejestracja dokumentu DOCX wygenerowanego z szablonu Kreatora ────
// (Sam plik DOCX powstaje przez generateDocxFromTemplate; tu wiążemy go ze
//  sprawą: zdarzenie dowodowe + wpis dokumentu z linkiem do pliku.)
export const recordWindGeneratedDoc = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((d: Record<string, unknown>) =>
    z
      .object({
        caseId: z.string().uuid(),
        typ: z.enum([
          "wezwanie",
          "wypowiedzenie",
          "wniosek_klauzula",
          "wniosek_komornik",
          "aneks",
          "porozumienie",
          "ugoda",
          "zawiadomienie_286",
          "zawiadomienie_297",
          "notatka",
        ]),
        tytul: z.string().min(1),
        plik_url: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: ev, error: eErr } = await db
      .from("wind_events")
      .insert({
        case_id: data.caseId,
        typ: "dokument_wygenerowany",
        kategoria: "systemowe",
        tytul: `Wygenerowano (DOCX): ${data.tytul}`,
        tresc: "Dokument utworzony z gotowego szablonu Kreatora dokumentów.",
        zalacznik_url: data.plik_url,
        autor: context.claims?.email ?? null,
      })
      .select(EVENT_COLS)
      .single();
    if (eErr) throw new Error(eErr.message);

    const { data: doc, error: dErr } = await db
      .from("wind_documents")
      .insert({
        case_id: data.caseId,
        event_id: ev.id,
        typ: data.typ,
        tytul: data.tytul,
        plik_url: data.plik_url,
        status: "gotowy",
      })
      .select(DOC_COLS)
      .single();
    if (dErr) throw new Error(dErr.message);

    return { document: doc as WindDocument, event: ev as WindEvent };
  });

// ── Potwierdzenie nadania / odbioru dla pisma z systemu ──────────────
// Inwestor wgrywa skan dowodu nadania (list polecony) albo zwrotki (ZPO)
// dla konkretnego pisma wygenerowanego w systemie. Skan zostaje przypięty
// do dokumentu, a w osi czasu powstaje zdarzenie dowodowe.
export const attachWindDocProof = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((d: Record<string, unknown>) =>
    z
      .object({
        caseId: z.string().uuid(),
        documentId: z.string().uuid(),
        rodzaj: z.enum(["nadanie", "odbior"]),
        plik_url: z.string().min(1),
        data: z.string().min(1),
        numer_nadania: z.string().optional().nullable(),
        oplata: z.coerce.number().min(0).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: doc } = await db
      .from("wind_documents")
      .select("id, tytul")
      .eq("id", data.documentId)
      .maybeSingle();
    if (!doc) throw new Error("Pismo nie znalezione");

    const patch =
      data.rodzaj === "nadanie"
        ? {
            potwierdzenie_nadania_url: data.plik_url,
            data_nadania: data.data,
            status: "wyslany",
          }
        : { potwierdzenie_odbioru_url: data.plik_url, data_odbioru: data.data };
    const { data: updated, error: uErr } = await db
      .from("wind_documents")
      .update(patch)
      .eq("id", data.documentId)
      .select(DOC_COLS)
      .single();
    if (uErr) throw new Error(uErr.message);

    const isNadanie = data.rodzaj === "nadanie";
    const { data: ev, error: eErr } = await db
      .from("wind_events")
      .insert({
        case_id: data.caseId,
        typ: isNadanie ? "pismo_nadane" : "pismo_doreczone",
        kategoria: "manualne",
        tytul: isNadanie
          ? `${doc.tytul} — potwierdzenie nadania`
          : `${doc.tytul} — potwierdzenie odbioru (zwrotka)`,
        data_zdarzenia: new Date(`${data.data}T12:00:00`).toISOString(),
        data_doreczenia: isNadanie ? null : new Date(`${data.data}T12:00:00`).toISOString(),
        status_doreczenia: isNadanie ? "oczekuje" : "doreczone",
        zalacznik_url: data.plik_url,
        metadata: { document_id: data.documentId, numer_nadania: data.numer_nadania ?? null },
        oplata: data.oplata,
        autor: context.claims?.email ?? null,
      })
      .select(EVENT_COLS)
      .single();
    if (eErr) throw new Error(eErr.message);

    return { document: updated as WindDocument, event: ev as WindEvent };
  });

// ── Seed danych demonstracyjnych ─────────────────────────────────────
export const seedWindDemo = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .handler(async ({ context }) => {
    const db = loose(context.supabase);
    const author = context.claims?.email ?? null;
    const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
    const dateOnly = (daysAgo: number) => iso(daysAgo).slice(0, 10);

    async function makeCase(args: {
      name: string;
      typ?: "osoba_fizyczna" | "firma";
      pesel?: string;
      nip?: string;
      adres: string;
      email?: string;
      telefon?: string;
      zgoda?: boolean;
      numer_umowy: string;
      data_umowy_daysAgo: number;
      kwota: number;
      total: number;
      termin_daysAgo: number;
      kw?: string;
      akt?: string;
      sciezka: WindPath;
      etap: string;
      priorytet: WindPriority;
      status: WindLoanStatus;
      zalegla: number;
      saldo: number;
      wypowiedzenie_daysAgo?: number;
      doplaty?: number;
      pozyczkodawca?: string;
      /** Harmonogram rat — sprawa liczona z rat (kwota zaległa, opóźnienie, saldo). */
      harmonogram?: WindRata[];
      /** Wpłaty (zdarzenia „wplata" z kwotą). */
      wplaty?: Array<{ data: string; kwota: number }>;
      events: Array<Partial<WindEvent> & { typ: WindEventType; tytul: string }>;
    }) {
      const dataUmowy = dateOnly(args.data_umowy_daysAgo);
      const harmonogram = args.harmonogram?.length ? args.harmonogram : null;
      const { data: borrower } = await db
        .from("wind_borrowers")
        .insert({
          imie_nazwisko: args.name,
          typ: args.typ ?? "osoba_fizyczna",
          pesel: args.pesel ?? null,
          nip: args.nip ?? null,
          adres_zamieszkania: args.adres,
          adres_do_doreczen: args.adres,
          email: args.email ?? null,
          telefon: args.telefon ?? null,
          email_zgoda_doreczenia: args.zgoda ?? false,
        })
        .select("id")
        .single();
      const { data: loan } = await db
        .from("wind_loans")
        .insert({
          borrower_id: borrower.id,
          numer_umowy: args.numer_umowy,
          data_umowy: dataUmowy,
          kwota_pozyczki: args.kwota,
          kwota_calkowita: args.total,
          prowizja: Math.round(args.kwota * 0.1),
          // Z harmonogramem: termin spłaty = termin ostatniej raty.
          termin_splaty: harmonogram
            ? harmonogram[harmonogram.length - 1].termin
            : dateOnly(args.termin_daysAgo),
          numer_kw: args.kw ?? null,
          kwota_hipoteki: args.kw ? Math.round(args.total * 1.5) : null,
          akt_notarialny_777: args.akt ?? null,
          kwota_777: args.akt ? Math.round(args.total * 1.5) : null,
          rachunek_splaty: "PL00 1010 0000 0000 0000 0000 0000",
          oprocentowanie_roczne: 0,
          // Odsetki maksymalne za opóźnienie z dnia umowy (WIN_01).
          stopa_odsetek_max: defaultDelayRate(dataUmowy),
          status: args.status,
          saldo_pozostale: args.saldo,
          data_wypowiedzenia:
            args.wypowiedzenie_daysAgo != null ? dateOnly(args.wypowiedzenie_daysAgo) : null,
          kwota_doplat: args.doplaty ?? 0,
          harmonogram,
          pozyczkodawca: args.pozyczkodawca ?? null,
        })
        .select("id")
        .single();
      const { data: kase } = await db
        .from("wind_collection_cases")
        .insert({
          loan_id: loan.id,
          sciezka: args.sciezka,
          etap: args.etap,
          opoznienie_dni: Math.max(0, args.termin_daysAgo),
          kwota_zalegla: args.zalegla,
          data_otwarcia: dateOnly(Math.max(0, args.termin_daysAgo - 1)),
          priorytet: args.priorytet,
          osoba_prowadzaca: author,
        })
        .select("id")
        .single();
      for (const e of args.events) {
        await db.from("wind_events").insert({
          case_id: kase.id,
          typ: e.typ,
          kategoria: e.kategoria ?? "manualne",
          tytul: e.tytul,
          tresc: e.tresc ?? null,
          data_zdarzenia: e.data_zdarzenia ?? iso(0),
          data_doreczenia: e.data_doreczenia ?? null,
          status_doreczenia: e.status_doreczenia ?? null,
          metadata: e.metadata ?? {},
          autor: author,
        });
      }
      if (args.wplaty?.length) {
        await db.from("wind_events").insert(
          args.wplaty.map((w) => ({
            case_id: kase.id,
            typ: "wplata",
            kategoria: "manualne",
            tytul: "Odnotowano wpłatę",
            tresc: "Sposób: przelew",
            data_zdarzenia: noonUTC(w.data),
            metadata: { kwota: w.kwota, sposob: "przelew" },
            autor: author,
          })),
        );
      }
      // Sprawa z harmonogramem — kwota zaległa, opóźnienie i saldo z rat.
      if (harmonogram) await recalcWindCaseDetailed(db, kase.id as string);
      return kase.id as string;
    }

    // Harmonogram demonstracyjny: 24 raty po 4 000 zł (= kwota do zwrotu
    // 96 000 zł, umowa bez odsetek umownych). Sześć pierwszych zapłaconych
    // w terminie, siódma — sprzed ok. 8 dni — zaległa.
    const [zy, zm, zd] = dateOnly(8).split("-").map(Number);
    const m0 = zy * 12 + (zm - 1) - 6;
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const harmonogramDemo = generateHarmonogram({
      pierwszaRata: `${Math.floor(m0 / 12)}-${pad2((m0 % 12) + 1)}-${pad2(Math.min(zd, 28))}`,
      liczbaRat: 24,
      kwotaRaty: 4000,
    });

    // 1) Ścieżka miękka — harmonogram rat, jedna rata zaległa (ok. 8 dni),
    //    po kontakcie telefonicznym
    await makeCase({
      name: "Jan Kowalski",
      pesel: "85010112345",
      adres: "ul. Polna 5/2, 00-001 Warszawa",
      email: "jan.kowalski@example.com",
      telefon: "+48600100200",
      zgoda: true,
      numer_umowy: "FY/2026/0042",
      data_umowy_daysAgo: 200,
      kwota: 80000,
      total: 96000,
      termin_daysAgo: 8,
      kw: "WA1M/00012345/6",
      akt: "Rep. A 1234/2026, Kancelaria Notarialna A. Nowak",
      sciezka: "miekka",
      etap: "kontakt_wstepny",
      priorytet: "sredni",
      status: "w_zwloce",
      zalegla: 4000,
      saldo: 72000,
      pozyczkodawca: "Finance You sp. z o.o.",
      harmonogram: harmonogramDemo,
      wplaty: harmonogramDemo.slice(0, 6).map((r) => ({ data: r.termin, kwota: r.kwota })),
      events: [
        {
          typ: "sms",
          kategoria: "automatyczne",
          tytul: "SMS wysłany",
          tresc: "Przypomnienie o zaległej racie.",
          data_zdarzenia: iso(6),
          data_doreczenia: iso(6),
          status_doreczenia: "doreczone",
        },
        {
          typ: "telefon",
          tytul: "Rozmowa telefoniczna",
          tresc: "Klient deklaruje spłatę do końca tygodnia.",
          data_zdarzenia: iso(5),
        },
      ],
    });

    // 2) Ścieżka standardowa — wezwanie nadane, oczekuje na doręczenie
    await makeCase({
      name: "Anna Wiśniewska",
      pesel: "90020223456",
      adres: "ul. Lipowa 12, 30-001 Kraków",
      email: "anna.w@example.com",
      telefon: "+48600300400",
      zgoda: true,
      numer_umowy: "FY/2026/0031",
      data_umowy_daysAgo: 240,
      kwota: 120000,
      total: 150000,
      termin_daysAgo: 22,
      kw: "KR1P/00054321/9",
      akt: "Rep. A 5678/2026",
      sciezka: "standardowa",
      etap: "oczekiwanie_doreczenie",
      priorytet: "wysoki",
      status: "w_zwloce",
      zalegla: 150000,
      saldo: 150000,
      events: [
        {
          typ: "dokument_wygenerowany",
          kategoria: "systemowe",
          tytul: "Wygenerowano: Wezwanie do zapłaty",
          data_zdarzenia: iso(7),
        },
        {
          typ: "email",
          kategoria: "automatyczne",
          tytul: "E-mail: Wezwanie do zapłaty",
          tresc: "Wezwanie do zapłaty z 7-dniowym terminem.",
          data_zdarzenia: iso(7),
          data_doreczenia: iso(7),
          status_doreczenia: "doreczone",
        },
        {
          typ: "pismo_nadane",
          tytul: "Wezwanie do zapłaty — nadane",
          data_zdarzenia: iso(6),
          status_doreczenia: "oczekuje",
          metadata: { numer_nadania: "(00)459007734567890123" },
        },
      ],
    });

    // 3) Ścieżka twarda — umowa wypowiedziana, wniosek do komornika
    await makeCase({
      name: "Przedsiębiorstwo Bud-Max sp. z o.o.",
      typ: "firma",
      nip: "5223456789",
      adres: "ul. Przemysłowa 8, 02-200 Warszawa",
      email: "biuro@budmax.example.com",
      telefon: "+48600500600",
      numer_umowy: "FY/2025/0190",
      data_umowy_daysAgo: 400,
      kwota: 300000,
      total: 372000,
      termin_daysAgo: 65,
      kw: "WA3M/00099999/1",
      akt: "Rep. A 9012/2025",
      sciezka: "twarda",
      etap: "egzekucja_nieruchomosc",
      priorytet: "krytyczny",
      status: "windykacja_komornicza",
      zalegla: 372000,
      saldo: 372000,
      wypowiedzenie_daysAgo: 40,
      doplaty: 5000,
      events: [
        {
          typ: "dokument_wygenerowany",
          kategoria: "systemowe",
          tytul: "Wygenerowano: Wypowiedzenie umowy",
          data_zdarzenia: iso(40),
        },
        {
          typ: "pismo_nadane",
          tytul: "Wypowiedzenie umowy — nadane",
          data_zdarzenia: iso(39),
          status_doreczenia: "oczekuje",
          metadata: { numer_nadania: "(00)459007734511112222" },
        },
        {
          typ: "pismo_doreczone",
          tytul: "Pismo doręczone (zwrotka)",
          data_zdarzenia: iso(35),
          data_doreczenia: iso(35),
          status_doreczenia: "doreczone",
        },
        {
          typ: "czynnosc_sadowa",
          tytul: "Wniosek o klauzulę wykonalności",
          data_zdarzenia: iso(20),
        },
        {
          typ: "czynnosc_sadowa",
          tytul: "Wniosek do komornika o egzekucję z nieruchomości",
          data_zdarzenia: iso(8),
        },
      ],
    });

    // 4) Ścieżka karna — zero rat, zawiadomienie 286 k.k. w przygotowaniu
    await makeCase({
      name: "Marek Zieliński",
      pesel: "88030334567",
      adres: "ul. Krótka 1, 80-001 Gdańsk (adres nieaktualny)",
      telefon: "+48600700800",
      numer_umowy: "FY/2026/0007",
      data_umowy_daysAgo: 120,
      kwota: 150000,
      total: 186000,
      termin_daysAgo: 75,
      kw: "GD1G/00077777/3",
      akt: "Rep. A 0007/2026",
      sciezka: "karna",
      etap: "zabezpieczenie_dowodow",
      priorytet: "krytyczny",
      status: "windykacja_karna",
      zalegla: 186000,
      saldo: 186000,
      events: [
        {
          typ: "telefon",
          tytul: "Próba kontaktu — bez odpowiedzi",
          tresc: "Numer nieaktywny, dłużnik nieosiągalny.",
          data_zdarzenia: iso(50),
        },
        {
          typ: "notatka",
          tytul: "Zero wpłat od początku umowy",
          tresc: "Brak jakiejkolwiek wpłaty, zerwany kontakt — przesłanki art. 286 k.k.",
          data_zdarzenia: iso(30),
        },
      ],
    });

    return { ok: true };
  });
