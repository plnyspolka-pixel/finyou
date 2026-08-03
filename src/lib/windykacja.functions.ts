import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildWindDocument, type DocContext } from "@/lib/windykacja-documents";
import type {
  WindPath,
  WindEventType,
  WindDeliveryStatus,
  WindDocumentType,
} from "@/lib/windykacja-procedure";

// Nowe tabele (wind_*) nie są jeszcze w wygenerowanych typach Database —
// używamy luźnego dostępu do klienta. Typy publiczne zadeklarowane poniżej.
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
  "id, borrower_id, numer_umowy, data_umowy, kwota_pozyczki, kwota_calkowita, prowizja, termin_splaty, numer_kw, kwota_hipoteki, akt_notarialny_777, kwota_777, rachunek_splaty, oprocentowanie_roczne, stopa_odsetek_max, status, saldo_pozostale, data_ostatniej_wplaty, data_wypowiedzenia, kwota_doplat";
const BORROWER_COLS =
  "id, imie_nazwisko, typ, pesel, nip, dowod_osobisty, adres_zamieszkania, adres_do_doreczen, email, telefon, email_zgoda_doreczenia, notatki";
const CASE_COLS =
  "id, loan_id, sciezka, etap, opoznienie_dni, kwota_zalegla, data_otwarcia, data_zamkniecia, wynik, priorytet, osoba_prowadzaca";
const EVENT_COLS =
  "id, case_id, typ, kategoria, tytul, tresc, data_zdarzenia, data_doreczenia, status_doreczenia, zalacznik_url, metadata, oplata, autor, created_at";
const DOC_COLS =
  "id, case_id, event_id, typ, tytul, tresc, plik_url, status, potwierdzenie_nadania_url, data_nadania, potwierdzenie_odbioru_url, data_odbioru, created_at";

const todayISO = () => new Date().toISOString().slice(0, 10);
const emptyToNull = (v: unknown) => (v === "" ? null : v);

function daysOverdue(termin?: string | null): number {
  if (!termin) return 0;
  const due = new Date(`${termin}T00:00:00Z`).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - due) / 86_400_000));
}

// ── Dashboard: sprawy + zdarzenia (lite) ─────────────────────────────
export const listWindDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = loose(context.supabase);
    const { data: cases, error } = await db
      .from("wind_collection_cases")
      .select(
        `${CASE_COLS}, loan:wind_loans(${LOAN_COLS}, borrower:wind_borrowers(${BORROWER_COLS}))`,
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const list = (cases ?? []) as Array<
      WindCase & { loan: (WindLoan & { borrower: WindBorrower }) | null }
    >;
    const caseIds = list.map((c) => c.id);

    let events: Pick<
      WindEvent,
      "case_id" | "typ" | "tytul" | "data_zdarzenia" | "data_doreczenia" | "status_doreczenia"
    >[] = [];
    if (caseIds.length) {
      const { data: ev } = await db
        .from("wind_events")
        .select("case_id, typ, tytul, data_zdarzenia, data_doreczenia, status_doreczenia")
        .in("case_id", caseIds)
        .order("data_zdarzenia", { ascending: false });
      events = (ev ?? []) as typeof events;
    }

    return { cases: list, events };
  });

// ── Pełna sprawa ─────────────────────────────────────────────────────
export const getWindCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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

    const loan = (c.loan ?? null) as (WindLoan & { borrower: WindBorrower }) | null;
    return {
      case: c as WindCase,
      loan,
      borrower: loan?.borrower ?? null,
      events: (events ?? []) as WindEvent[],
      documents: (documents ?? []) as WindDocument[],
    };
  });

// ── Utworzenie sprawy (borrower + loan + case + zdarzenie systemowe) ──
const createSchema = z.object({
  imie_nazwisko: z.string().min(1, "Podaj dłużnika"),
  typ: z.enum(["osoba_fizyczna", "firma"]).default("osoba_fizyczna"),
  pesel: z.string().optional().nullable(),
  nip: z.string().optional().nullable(),
  adres_zamieszkania: z.string().optional().nullable(),
  adres_do_doreczen: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  telefon: z.string().optional().nullable(),
  email_zgoda_doreczenia: z.boolean().default(false),
  numer_umowy: z.string().optional().nullable(),
  data_umowy: z.string().optional().nullable(),
  kwota_pozyczki: z.coerce.number().default(0),
  kwota_calkowita: z.coerce.number().default(0),
  prowizja: z.coerce.number().default(0),
  termin_splaty: z.string().optional().nullable(),
  numer_kw: z.string().optional().nullable(),
  kwota_hipoteki: z.coerce.number().optional().nullable(),
  akt_notarialny_777: z.string().optional().nullable(),
  kwota_777: z.coerce.number().optional().nullable(),
  rachunek_splaty: z.string().optional().nullable(),
  oprocentowanie_roczne: z.coerce.number().default(0),
  stopa_odsetek_max: z.coerce.number().default(0),
  kwota_zalegla: z.coerce.number().default(0),
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
        kwota: z.coerce.number().positive(),
        data: z.string().min(1),
        zalacznik_url: z.string().optional().nullable(),
      }),
    )
    .default([]),
});

export const createWindCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, unknown>) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);

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

    // Należność wyliczana automatycznie: kwota do zwrotu minus suma wpłat
    // z potwierdzeń przelewów. Ręcznie podana kwota zaległa ma pierwszeństwo.
    const wplaty = [...(data.wplaty ?? [])].sort((a, b) => a.data.localeCompare(b.data));
    const sumaWplat = wplaty.reduce((s, w) => s + w.kwota, 0);
    const naleznoscBazowa = data.kwota_calkowita || data.kwota_pozyczki;
    const saldoPoWplatach = Math.max(0, naleznoscBazowa - sumaWplat);
    const saldo = data.kwota_zalegla || saldoPoWplatach || naleznoscBazowa;
    const { data: loan, error: lErr } = await db
      .from("wind_loans")
      .insert({
        borrower_id: borrower.id,
        numer_umowy: emptyToNull(data.numer_umowy),
        data_umowy: emptyToNull(data.data_umowy),
        kwota_pozyczki: data.kwota_pozyczki,
        kwota_calkowita: data.kwota_calkowita,
        prowizja: data.prowizja,
        termin_splaty: emptyToNull(data.termin_splaty),
        numer_kw: emptyToNull(data.numer_kw),
        kwota_hipoteki: data.kwota_hipoteki ?? null,
        akt_notarialny_777: emptyToNull(data.akt_notarialny_777),
        kwota_777: data.kwota_777 ?? null,
        rachunek_splaty: emptyToNull(data.rachunek_splaty),
        oprocentowanie_roczne: data.oprocentowanie_roczne,
        stopa_odsetek_max: data.stopa_odsetek_max,
        status: "w_zwloce",
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
        opoznienie_dni: daysOverdue(data.termin_splaty),
        kwota_zalegla: data.kwota_zalegla || saldo,
        data_otwarcia: todayISO(),
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
      tresc: `Ścieżka: ${data.sciezka}, etap: ${data.etap}.`,
      autor: context.claims?.email ?? null,
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
        autor: context.claims?.email ?? null,
      });
    }

    // Wpłaty otrzymane dotychczas (z potwierdzeń przelewów) — pełna historia
    // do wyliczenia odsetek (art. 451 k.c.: koszty → odsetki → kapitał).
    for (const w of wplaty) {
      await db.from("wind_events").insert({
        case_id: kase.id,
        typ: "wplata",
        kategoria: "manualne",
        tytul: "Odnotowano wpłatę",
        tresc: "Wpłata z potwierdzenia przelewu (przy zakładaniu sprawy).",
        data_zdarzenia: new Date(`${w.data}T12:00:00`).toISOString(),
        zalacznik_url: emptyToNull(w.zalacznik_url),
        metadata: { kwota: w.kwota, sposob: "przelew (potwierdzenie)" },
        autor: context.claims?.email ?? null,
      });
    }

    return { caseId: kase.id as string, kwota_zalegla: data.kwota_zalegla || saldo };
  });

// ── Edycja: borrower / loan / case ───────────────────────────────────
export const updateWindBorrower = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; patch: Record<string, unknown> }) =>
    z.object({ id: z.string().uuid(), patch: z.record(z.string(), z.unknown()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.patch)) patch[k] = emptyToNull(v);
    const { error } = await db.from("wind_borrowers").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateWindLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; patch: Record<string, unknown> }) =>
    z.object({ id: z.string().uuid(), patch: z.record(z.string(), z.unknown()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.patch)) patch[k] = emptyToNull(v);
    const { error } = await db.from("wind_loans").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateWindCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; patch: Record<string, unknown> }) =>
    z.object({ id: z.string().uuid(), patch: z.record(z.string(), z.unknown()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.patch)) patch[k] = emptyToNull(v);
    const { error } = await db.from("wind_collection_cases").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Zmiana etapu / ścieżki (zapisuje zdarzenie) ──────────────────────
export const changeWindStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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
      .select("status")
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, unknown>) =>
    z
      .object({
        caseId: z.string().uuid(),
        typ: z.enum(["sms", "email", "telefon"]),
        target: z.string().optional().nullable(),
        subject: z.string().optional().nullable(),
        tresc: z.string().min(1, "Treść jest wymagana"),
        oplata: z.coerce.number().min(0).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    let status: WindDeliveryStatus | null = null;
    let extra: Record<string, unknown> = {};
    let tytul = "";

    if (data.typ === "sms") {
      tytul = "SMS wysłany";
      if (!data.target) throw new Error("Brak numeru telefonu");
      const { sendSmsInternal } = await import("@/lib/voicebot.functions");
      const res = await sendSmsInternal({
        phone: data.target,
        body: data.tresc,
        source: "windykacja",
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
        oplata: data.oplata,
        autor: context.claims?.email ?? null,
      })
      .select(EVENT_COLS)
      .single();
    if (error) throw new Error(error.message);
    return ev as WindEvent;
  });

// ── Pismo nadane (manualne) ──────────────────────────────────────────
export const addWindPismoNadane = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, unknown>) =>
    z
      .object({
        caseId: z.string().uuid(),
        loanId: z.string().uuid(),
        kwota: z.coerce.number().positive(),
        data: z.string().min(1),
        sposob: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);

    const { data: ev, error } = await db
      .from("wind_events")
      .insert({
        case_id: data.caseId,
        typ: "wplata",
        kategoria: "manualne",
        tytul: "Odnotowano wpłatę",
        tresc: data.sposob ? `Sposób: ${data.sposob}` : null,
        data_zdarzenia: new Date(`${data.data}T12:00:00`).toISOString(),
        metadata: { kwota: data.kwota, sposob: data.sposob ?? null },
        autor: context.claims?.email ?? null,
      })
      .select(EVENT_COLS)
      .single();
    if (error) throw new Error(error.message);

    // Aktualizacja salda pożyczki i kwoty zaległej sprawy.
    const { data: loan } = await db
      .from("wind_loans")
      .select("saldo_pozostale, status")
      .eq("id", data.loanId)
      .maybeSingle();
    const { data: kase } = await db
      .from("wind_collection_cases")
      .select("kwota_zalegla")
      .eq("id", data.caseId)
      .maybeSingle();
    const newSaldo = Math.max(0, Number(loan?.saldo_pozostale ?? 0) - data.kwota);
    const newZalegla = Math.max(0, Number(kase?.kwota_zalegla ?? 0) - data.kwota);
    await db
      .from("wind_loans")
      .update({
        saldo_pozostale: newSaldo,
        data_ostatniej_wplaty: data.data,
        status: newSaldo <= 0 ? "splacona" : loan?.status,
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
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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

    const ctx: DocContext = {
      dluznik: b?.imie_nazwisko ?? "…",
      adres: b?.adres_do_doreczen || b?.adres_zamieszkania || "…",
      pesel: b?.pesel,
      nip: b?.nip,
      numer_umowy: loan?.numer_umowy,
      data_umowy: loan?.data_umowy,
      kwota_zalegla: Number(c.kwota_zalegla ?? 0),
      saldo_pozostale: Number(loan?.saldo_pozostale ?? 0),
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
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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
      events: Array<Partial<WindEvent> & { typ: WindEventType; tytul: string }>;
    }) {
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
          data_umowy: dateOnly(args.data_umowy_daysAgo),
          kwota_pozyczki: args.kwota,
          kwota_calkowita: args.total,
          prowizja: Math.round(args.kwota * 0.1),
          termin_splaty: dateOnly(args.termin_daysAgo),
          numer_kw: args.kw ?? null,
          kwota_hipoteki: args.kw ? Math.round(args.total * 1.5) : null,
          akt_notarialny_777: args.akt ?? null,
          kwota_777: args.akt ? Math.round(args.total * 1.5) : null,
          rachunek_splaty: "PL00 1010 0000 0000 0000 0000 0000",
          oprocentowanie_roczne: 0,
          stopa_odsetek_max: 24.5,
          status: args.status,
          saldo_pozostale: args.saldo,
          data_wypowiedzenia:
            args.wypowiedzenie_daysAgo != null ? dateOnly(args.wypowiedzenie_daysAgo) : null,
          kwota_doplat: args.doplaty ?? 0,
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
      return kase.id as string;
    }

    // 1) Ścieżka miękka — opóźnienie 8 dni, po kontakcie telefonicznym
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
      saldo: 96000,
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
