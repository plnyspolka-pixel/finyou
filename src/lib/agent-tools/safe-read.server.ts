// „Szeroki dostęp do bazy, bardzo silne zabezpieczenia”.
//
// Agent NIE dostaje SQL ani PostgREST. Dostaje jedno narzędzie `lookup`, które
// czyta WYŁĄCZNIE z tabel zadeklarowanych niżej, WYŁĄCZNIE kolumny dozwolone,
// WYŁĄCZNIE wiersze zawężone do podmiotu rozmowy (filtr nakłada serwer, nie
// model). Do tego `describe_data`, które zwraca agentowi aktualny obraz tego,
// co wolno — liczony w locie z przecięcia tej listy z żywym schematem
// (PostgREST), więc zmiana schematu w bazie nie wymaga zmiany promptu:
// kolumna, której już nie ma, po prostu znika z opisu.
//
// Tryby kolumn:
//  * `explicit` — tylko wymienione kolumny (tabele z danymi osób).
//  * `auto`     — wszystkie kolumny poza DENY_KEY_PATTERNS (słowniki, cenniki,
//                 treści publiczne). Nowa kolumna w takiej tabeli jest od razu
//                 dostępna — chyba że wygląda na wrażliwą.
import type { AgentKey, SubjectKind, ToolSession } from "./types";
import { hasStrongIdentity, isDeniedKey, redactDeep } from "./guard.server";

export type ScopeBy =
  | { kind: "none" } // tabela publiczna — bez zawężenia
  | { kind: "lead"; column: string }
  | { kind: "client"; column: string }
  | { kind: "investor"; column: string } // auth user_id inwestora
  | { kind: "investor_row"; column: string } // investors.id (klucz w tabelach zależnych)
  | { kind: "case"; column: string }
  | { kind: "loan"; column: string };

export interface ReadableTable {
  table: string;
  /** Kto może czytać tę tabelę. */
  agents: readonly AgentKey[];
  /** Zawężenie wiersza do podmiotu rozmowy. */
  scope: ScopeBy;
  /** Czy odczyt wymaga potwierdzonej tożsamości (dane osobowe/sprawy). */
  requiresIdentity: boolean;
  columns: { mode: "explicit"; list: readonly string[] } | { mode: "auto" };
  /** Domyślne sortowanie i limit — agent nie steruje nimi dowolnie. */
  order?: { column: string; ascending: boolean };
  maxRows: number;
  /** Po co to agentowi — trafia do describe_data. */
  purpose: string;
}

const ALL_PROCESS: readonly AgentKey[] = [
  "recepcja",
  "intake",
  "inwestor_presale",
  "inwestor_panel",
  "windykacja",
  "windykacja_tekst",
];
const WIND: readonly AgentKey[] = ["windykacja", "windykacja_tekst"];
const INVEST: readonly AgentKey[] = ["inwestor_presale", "inwestor_panel", "recepcja"];
const CLIENT: readonly AgentKey[] = ["intake", "recepcja"];

/**
 * Allow-lista. Dodanie tabeli = świadoma decyzja z zakresem i trybem kolumn.
 * Tabele nieobecne tu NIE istnieją dla agenta.
 */
export const READABLE_TABLES: readonly ReadableTable[] = [
  // ── Słowniki / treści publiczne (bez zawężenia, bez tożsamości) ───────────
  {
    table: "access_products",
    agents: INVEST,
    scope: { kind: "none" },
    requiresIdentity: false,
    columns: { mode: "auto" },
    maxRows: 20,
    purpose: "Cennik dostępu dla inwestora (abonament, okresy, ceny) — zawsze aktualny z bazy.",
  },
  {
    table: "legal_documents",
    agents: ALL_PROCESS,
    scope: { kind: "none" },
    requiresIdentity: false,
    columns: {
      mode: "explicit",
      list: ["code", "package_id", "version", "title", "sort_order", "active", "updated_at"],
    },
    order: { column: "sort_order", ascending: true },
    maxRows: 30,
    purpose:
      "Jakie regulaminy/umowy obowiązują (kod, pakiet, wersja, tytuł) — bez treści i plików.",
  },
  {
    table: "training_videos",
    agents: INVEST,
    scope: { kind: "none" },
    requiresIdentity: false,
    columns: {
      mode: "explicit",
      list: [
        "id",
        "title",
        "description",
        "category",
        "duration_seconds",
        "is_published",
        "free_lesson",
        "sort_order",
      ],
    },
    order: { column: "sort_order", ascending: true },
    maxRows: 30,
    purpose: "Szkolenia dla inwestorów — co jest w pakiecie.",
  },

  // ── Klient pożyczkowy (zawężone do leada rozmowy) ─────────────────────────
  {
    table: "leads",
    agents: CLIENT,
    scope: { kind: "lead", column: "id" },
    requiresIdentity: true, // lead dopiero po potwierdzeniu, że to ten człowiek
    columns: {
      mode: "explicit",
      list: [
        "id",
        "type",
        "status",
        "source",
        "created_at",
        "updated_at",
        "first_name",
        "loan_application_id",
      ],
    },
    maxRows: 1,
    purpose: "Status i typ leada rozmówcy (tylko jego).",
  },
  {
    table: "loan_applications",
    agents: CLIENT,
    scope: { kind: "client", column: "client_id" },
    requiresIdentity: true,
    columns: {
      mode: "explicit",
      // Świadomie BEZ: risk_level, initial_score, admin_decision, decision_reason,
      // broker_notes — ocena wewnętrzna nie jest dla klienta.
      list: [
        "id",
        "status",
        "created_at",
        "updated_at",
        "loan_amount",
        "preferred_period_months",
        "completeness_percent",
        "missing_fields",
        "estimated_ltv",
        "available_to_investors",
        "investor_interest_count",
      ],
    },
    order: { column: "created_at", ascending: false },
    maxRows: 3,
    purpose:
      "Wnioski klienta rozmowy: status, kwota, okres, kompletność, braki (bez oceny wewnętrznej i dokumentów).",
  },

  // ── Inwestor (zawężone do investor_user_id rozmowy) ───────────────────────
  {
    table: "investors",
    agents: INVEST,
    scope: { kind: "investor", column: "user_id" },
    requiresIdentity: true,
    // Świadomie BEZ: pesel, nip, bank_account, email, phone, adres, stripe_*.
    columns: {
      mode: "explicit",
      list: [
        "id",
        "user_id",
        "investor_type",
        "entity_type",
        "company_name",
        "is_active",
        "subscription_plan",
        "subscription_status",
        "subscription_active_until",
        "screening_result",
        "created_at",
      ],
    },
    maxRows: 1,
    purpose:
      "Konto inwestora rozmowy: typ, aktywność, abonament (plan, status, do kiedy), wynik screeningu.",
  },
  {
    table: "investor_distribution_criteria",
    agents: INVEST,
    scope: { kind: "investor_row", column: "investor_id" },
    requiresIdentity: true,
    columns: {
      mode: "explicit",
      list: [
        "investor_id",
        "min_amount",
        "max_amount",
        "auto_send_enabled",
        "accepting_applications",
        "paused_until",
        "updated_at",
      ],
    },
    maxRows: 1,
    purpose:
      "Kryteria inwestycyjne inwestora rozmowy (kwoty, LTV, lokalizacje, typy nieruchomości).",
  },
  {
    table: "investor_orders",
    agents: INVEST,
    scope: { kind: "investor", column: "user_id" },
    requiresIdentity: true,
    columns: {
      mode: "explicit",
      list: [
        "id",
        "order_seq",
        "amount_pln",
        "max_period_months",
        "min_annual_yield",
        "validity_days",
        "status",
        "submitted_at",
        "expires_at",
        "rejection_reason",
        "created_at",
      ],
    },
    order: { column: "created_at", ascending: false },
    maxRows: 10,
    purpose: "Zlecenia inwestora rozmowy: kwota, okres, oczekiwana rentowność, status, ważność.",
  },

  // ── Windykacja (zawężone do sprawy rozmowy; dane dopiero po tożsamości) ───
  {
    table: "wind_collection_cases",
    agents: WIND,
    scope: { kind: "case", column: "id" },
    requiresIdentity: true,
    columns: {
      mode: "explicit",
      list: [
        "id",
        "sciezka",
        "etap",
        "opoznienie_dni",
        "kwota_zalegla",
        "data_otwarcia",
        "data_zamkniecia",
        "wynik",
        "priorytet",
      ],
    },
    maxRows: 1,
    purpose: "Sprawa windykacyjna rozmowy: etap, ścieżka, zaległość przy otwarciu.",
  },
  {
    table: "wind_loans",
    agents: WIND,
    scope: { kind: "loan", column: "id" },
    requiresIdentity: true,
    columns: {
      mode: "explicit",
      list: [
        "id",
        "numer_umowy",
        "data_umowy",
        "kwota_pozyczki",
        "kwota_calkowita",
        "termin_splaty",
        "status",
        "saldo_pozostale",
        "data_ostatniej_wplaty",
        "data_wypowiedzenia",
        "oplaty_windykacyjne",
        "harmonogram",
        "pozyczkodawca",
        "rachunek_splaty",
        "oprocentowanie_roczne",
      ],
    },
    maxRows: 1,
    purpose:
      "Konkretna umowa pożyczki z akt: numer, daty, kwoty, harmonogram, opłaty windykacyjne, rachunek spłaty.",
  },
  {
    table: "wind_events",
    agents: WIND,
    scope: { kind: "case", column: "case_id" },
    requiresIdentity: true,
    // Bez `tresc`: to wolny tekst zespołu i inwestora (notatki, podsumowania
    // rozmów, oceny prawne, dane osób trzecich) — nie dla rozmówcy.
    columns: {
      mode: "explicit",
      list: [
        "id",
        "typ",
        "kategoria",
        "tytul",
        "data_zdarzenia",
        "data_doreczenia",
        "status_doreczenia",
        "oplata",
      ],
    },
    order: { column: "data_zdarzenia", ascending: false },
    maxRows: 20,
    purpose: "Historia sprawy: wezwania, wpłaty, telefony, ustalenia (bez surowych metadanych).",
  },
  {
    table: "wind_documents",
    agents: WIND,
    scope: { kind: "case", column: "case_id" },
    requiresIdentity: true,
    columns: {
      mode: "explicit",
      list: ["id", "typ", "tytul", "status", "created_at", "data_nadania", "data_odbioru"],
    },
    order: { column: "created_at", ascending: false },
    maxRows: 20,
    purpose:
      "Jakie dokumenty są w aktach sprawy (typ, tytuł, status, nadanie/odbiór) — bez treści i linków.",
  },
];

export function readableFor(agent: AgentKey): ReadableTable[] {
  return READABLE_TABLES.filter((t) => t.agents.includes(agent));
}

/**
 * Wartość zawężenia z sesji. Każdy zakres podmiotu wymaga POTWIERDZONEJ
 * tożsamości i zgodnego rodzaju podmiotu — pole z kandydata (identify_caller)
 * albo z innego podmiotu nie otwiera niczego. Akta sprawy i konto inwestora
 * dodatkowo wymagają silnej metody (numer umowy z nazwiskiem, kod SMS).
 */
function scopeValue(scope: ScopeBy, session: ToolSession): string | null | "none" {
  if (scope.kind === "none") return "none";
  if (!session.identity_verified) return null;
  switch (scope.kind) {
    case "lead":
      return session.subject_kind === "lead" || session.subject_kind === "client"
        ? session.lead_id
        : null;
    case "client":
      return session.subject_kind === "client" ? session.subject_id : null;
    case "investor":
      return session.subject_kind === "investor" && hasStrongIdentity(session)
        ? session.investor_user_id
        : null;
    case "investor_row":
      return session.subject_kind === "investor" && hasStrongIdentity(session)
        ? session.subject_id
        : null;
    case "case":
      return session.subject_kind === "borrower" && hasStrongIdentity(session)
        ? session.case_id
        : null;
    case "loan":
      return session.subject_kind === "borrower" && hasStrongIdentity(session)
        ? session.loan_id
        : null;
  }
}

export type LookupOutcome =
  | { ok: true; rows: Record<string, unknown>[]; columns: string[]; redactions: string[] }
  | { ok: false; error: string };

/**
 * Jedyny odczyt tabeli dostępny agentowi. Nazwa tabeli i (opcjonalnie)
 * kolumny przychodzą od modelu — wszystko inne nakłada serwer.
 */
export async function safeLookup(input: {
  agent: AgentKey;
  session: ToolSession;
  table: string;
  columns?: string[] | null;
  /** Prosty filtr równości po kolumnie z allow-listy (np. typ zdarzenia). */
  where?: Record<string, string | number | boolean> | null;
  limit?: number | null;
}): Promise<LookupOutcome> {
  const table = String(input.table ?? "")
    .trim()
    .toLowerCase();
  const spec = READABLE_TABLES.find((t) => t.table === table);
  if (!spec) return { ok: false, error: `Tabela „${table}” nie jest dostępna dla agenta.` };
  if (!spec.agents.includes(input.agent)) {
    return { ok: false, error: `Agent „${input.agent}” nie ma dostępu do „${table}”.` };
  }
  if (spec.requiresIdentity && !input.session.identity_verified) {
    return { ok: false, error: "Najpierw potwierdź tożsamość rozmówcy (verify_identity)." };
  }
  const scoped = scopeValue(spec.scope, input.session);
  if (scoped === null) {
    return {
      ok: false,
      error: `Brak podmiotu rozmowy dla „${table}” — najpierw identify_caller / verify_identity.`,
    };
  }

  const live = await liveColumns(table);
  let allowed: string[];
  if (spec.columns.mode === "explicit") {
    allowed = spec.columns.list.filter((c) => live.size === 0 || live.has(c));
  } else {
    allowed = Array.from(live).filter((c) => !isDeniedKey(c));
  }
  if (allowed.length === 0) return { ok: false, error: `Brak dostępnych kolumn w „${table}”.` };

  const requested = (input.columns ?? [])
    .map((c) => String(c).trim().toLowerCase())
    .filter(Boolean);
  const cols = requested.length ? allowed.filter((c) => requested.includes(c)) : allowed;
  if (cols.length === 0)
    return { ok: false, error: `Żadna z żądanych kolumn nie jest dostępna w „${table}”.` };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Nazwa tabeli jest dynamiczna (z allow-listy), więc klient w trybie luźnym.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabaseAdmin as any).from(table).select(cols.join(","));
  if (scoped !== "none" && spec.scope.kind !== "none") q = q.eq(spec.scope.column, scoped);
  for (const [k, v] of Object.entries(input.where ?? {})) {
    const key = String(k).toLowerCase();
    if (!allowed.includes(key))
      return { ok: false, error: `Filtr po „${key}” nie jest dozwolony.` };
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") {
      return { ok: false, error: `Filtr „${key}” ma niedozwoloną wartość.` };
    }
    q = q.eq(key, v);
  }
  if (spec.order) q = q.order(spec.order.column, { ascending: spec.order.ascending });
  const limit = Math.max(1, Math.min(spec.maxRows, Number(input.limit) || spec.maxRows));
  q = q.limit(limit);

  const { data, error } = await q;
  if (error) {
    // Komunikat bazy zostaje w logu serwera — model dostaje ogólny.
    console.warn("[agent-tools/safe-read]", table, error.message);
    return {
      ok: false,
      error: `Odczyt „${table}” nie powiódł się — spróbuj innego pytania albo zaproponuj kontakt z zespołem.`,
    };
  }
  const redactions: string[] = [];
  const rows = redactDeep(
    (data ?? []) as Record<string, unknown>[],
    ["rachunek_splaty"],
    redactions,
  );
  return { ok: true, rows, columns: cols, redactions };
}

// ── Żywy schemat (adaptacja do zmian bazy) ──────────────────────────────────

const schemaCache = new Map<string, { at: number; cols: Set<string> }>();
const SCHEMA_TTL_MS = 5 * 60_000;

/**
 * Kolumny tabeli wg PostgREST (OpenAPI). Pusty zbiór = nie udało się
 * odczytać; wtedy `explicit` działa z listy, a `auto` zwraca nic (fail-closed).
 */
export async function liveColumns(table: string): Promise<Set<string>> {
  const hit = schemaCache.get(table);
  if (hit && Date.now() - hit.at < SCHEMA_TTL_MS) return hit.cols;
  try {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return new Set();
    const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" },
    });
    if (!res.ok) return new Set();
    const spec = (await res.json()) as {
      definitions?: Record<string, { properties?: Record<string, unknown> }>;
    };
    const cols = new Set(Object.keys(spec.definitions?.[table]?.properties ?? {}));
    schemaCache.set(table, { at: Date.now(), cols });
    return cols;
  } catch {
    return new Set();
  }
}

export interface DescribedTable {
  table: string;
  purpose: string;
  columns: string[];
  requires_identity: boolean;
  scoped_to: SubjectKind | "public";
  max_rows: number;
}

/** Co agent może czytać TERAZ — przecięcie allow-listy z żywym schematem. */
export async function describeReadable(agent: AgentKey): Promise<DescribedTable[]> {
  const out: DescribedTable[] = [];
  for (const spec of readableFor(agent)) {
    const live = await liveColumns(spec.table);
    const cols =
      spec.columns.mode === "explicit"
        ? spec.columns.list.filter((c) => live.size === 0 || live.has(c))
        : Array.from(live).filter((c) => !isDeniedKey(c));
    if (cols.length === 0) continue;
    out.push({
      table: spec.table,
      purpose: spec.purpose,
      columns: cols,
      requires_identity: spec.requiresIdentity,
      scoped_to:
        spec.scope.kind === "none"
          ? "public"
          : spec.scope.kind === "case" || spec.scope.kind === "loan"
            ? "borrower"
            : spec.scope.kind === "investor_row"
              ? "investor"
              : (spec.scope.kind as SubjectKind),
      max_rows: spec.maxRows,
    });
  }
  return out;
}
