// Wspólne helpery dla narzędzi MCP.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

export function userClient(ctx: ToolContext): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function publicClient(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function requireAuth(ctx: ToolContext) {
  if (!ctx.isAuthenticated()) {
    throw new Error("Not authenticated");
  }
}

export function ok(payload: unknown, structured?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent:
      structured ??
      (typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>)
        : { value: payload }),
  };
}

export function fail(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true as const };
}

export async function isAdmin(ctx: ToolContext): Promise<boolean> {
  return hasRole(ctx, ["administrator", "operator"]);
}

export async function userRoles(ctx: ToolContext): Promise<string[]> {
  const s = userClient(ctx);
  const { data } = await s.from("user_roles").select("role").eq("user_id", ctx.getUserId());
  return ((data ?? []) as { role: string }[]).map((r) => r.role);
}

export async function hasRole(ctx: ToolContext, roles: readonly string[]): Promise<boolean> {
  const mine = await userRoles(ctx);
  return mine.some((r) => roles.includes(r));
}

export const TEAM_ROLES = ["administrator", "operator"] as const;

/**
 * Klient z tokenem użytkownika po sprawdzeniu, że to członek zespołu
 * (administrator/operator). Rzuca `Error` — handler łapie przez `handle()`.
 */
export async function requireTeam(ctx: ToolContext): Promise<SupabaseClient> {
  requireAuth(ctx);
  if (!(await hasRole(ctx, TEAM_ROLES))) {
    throw new Error("Wymagane uprawnienia administrator/operator");
  }
  return userClient(ctx);
}

/** Jak `requireTeam`, ale z własną listą ról (np. administrator + księgowość). */
export async function requireRoles(
  ctx: ToolContext,
  roles: readonly string[],
): Promise<SupabaseClient> {
  requireAuth(ctx);
  if (!(await hasRole(ctx, roles))) {
    throw new Error(`Wymagane uprawnienia: ${roles.join(" / ")}`);
  }
  return userClient(ctx);
}

/** Zalogowany użytkownik (dowolna rola) — widoczność wg RLS. */
export function requireUser(ctx: ToolContext): SupabaseClient {
  requireAuth(ctx);
  return userClient(ctx);
}

type HandlerResult = ReturnType<typeof ok> | ReturnType<typeof fail>;

/** Opakowanie handlera: każdy wyjątek zamienia na `fail(message)`. */
export async function handle(fn: () => Promise<HandlerResult>): Promise<HandlerResult> {
  try {
    return await fn();
  } catch (e) {
    return fail((e as Error)?.message ?? String(e));
  }
}

/** Fraza do `ilike` w filtrze `or` PostgREST — bez znaków, które psują składnię. */
export function likeSafe(q: string): string {
  return q
    .replace(/[%_,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `or(col1.ilike.%q%,col2.ilike.%q%)` dla listy kolumn. */
export function ilikeAny(columns: readonly string[], q: string): string {
  const s = likeSafe(q);
  return columns.map((c) => `${c}.ilike.%${s}%`).join(",");
}

/** Waliduje datę (ISO 8601 albo `YYYY-MM-DD`) i zwraca ISO; `undefined` przepuszcza. */
export function isoDate(v: string | undefined, label = "data"): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`Nieprawidłowa ${label}: ${v}`);
  return d.toISOString();
}

/** ISO sprzed `days` dni. */
export function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function clampLimit(v: number | undefined, def: number, max: number): number {
  return Math.max(1, Math.min(max, v ?? def));
}

export function snippet(s: string | null | undefined, len = 300): string {
  return (s ?? "").replace(/\s+/g, " ").trim().slice(0, len);
}

export function personLabel(p: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone_raw?: string | null;
  phone?: string | null;
  company_name?: string | null;
}): string {
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return name || p.company_name || p.email || p.phone_raw || p.phone || "(bez nazwy)";
}

/**
 * Dokleja do wierszy dane z innej tabeli po kluczu (np. nazwę leada do
 * wiadomości). Jedno zapytanie `in(...)`, brak wpisu = `null`.
 */
export async function attach<T extends Record<string, any>>(
  client: SupabaseClient,
  rows: T[],
  opts: {
    key: keyof T & string;
    table: string;
    columns: string;
    as: string;
    /** Kolumna w tabeli docelowej (domyślnie `id`). */
    targetKey?: string;
  },
): Promise<Array<T & Record<string, unknown>>> {
  const ids = [
    ...new Set(
      rows.map((r) => r[opts.key] as unknown).filter((v): v is string => typeof v === "string"),
    ),
  ];
  if (ids.length === 0) return rows.map((r) => ({ ...r, [opts.as]: null }));
  const targetKey = opts.targetKey ?? "id";
  const { data, error } = await client.from(opts.table).select(opts.columns).in(targetKey, ids);
  if (error) throw new Error(`${opts.table}: ${error.message}`);
  const map = new Map<string, Record<string, unknown>>();
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    map.set(String(row[targetKey]), row);
  }
  return rows.map((r) => ({ ...r, [opts.as]: map.get(String(r[opts.key])) ?? null }));
}

/** Wynik zapytania jako tablica; błąd PostgREST → wyjątek z nazwą tabeli. */
export async function rowsOf<T = Record<string, any>>(q: any, table = "zapytanie"): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as T[];
}

/** Pierwszy wiersz albo `null`. */
export async function oneOf<T = Record<string, any>>(
  q: any,
  table = "zapytanie",
): Promise<T | null> {
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? null) as T | null;
}

/** Sekcja złożonego raportu: błąd nie wywraca całości, ląduje w `errors`. */
export async function section<T>(
  errors: string[],
  label: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    errors.push(`${label}: ${(e as Error).message}`);
    return null;
  }
}

/** Liczności wartości kolumny w tablicy wierszy — do statystyk bez SQL-owego GROUP BY. */
export function countBy<T extends Record<string, any>>(
  rows: T[],
  key: keyof T & string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = r[key] === null || r[key] === undefined || r[key] === "" ? "(brak)" : String(r[key]);
    out[k] = (out[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}
