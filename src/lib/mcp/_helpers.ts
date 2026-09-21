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

/** Blok treści w wyniku narzędzia: tekst, obraz (base64) albo link do zasobu. */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource_link"; uri: string; name: string; mimeType?: string; description?: string };

export function ok(
  payload: unknown,
  structured?: Record<string, unknown>,
  extra: ContentBlock[] = [],
) {
  const content: ContentBlock[] = [
    { type: "text", text: JSON.stringify(payload, null, 2) },
    ...extra,
  ];
  return {
    content,
    structuredContent:
      structured ??
      (typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>)
        : { value: payload }),
  };
}

/**
 * `ok` z dodatkowymi blokami (obrazy do podglądu w czacie, linki do plików).
 * Claude.ai / Claude Code pokazują obrazy inline; klienci bez obsługi
 * obrazów widzą sam tekst.
 */
export function okWith(
  payload: unknown,
  extra: ContentBlock[],
  structured?: Record<string, unknown>,
) {
  return ok(payload, structured, extra);
}

/** Link do pliku (wideo, audio) jako blok wyniku — klient pokazuje go jako zasób. */
export function linkBlock(
  uri: string | null | undefined,
  name: string,
  mimeType?: string,
  description?: string,
): ContentBlock[] {
  return uri ? [{ type: "resource_link", uri, name, mimeType, description }] : [];
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

/**
 * Do narzędzi ZAPISU zespołu: sprawdza rolę (administrator/operator) i zwraca
 * klienta z rolą serwisową — tak samo robią server functions panelu
 * (`assertAdminOrOperator` + `supabaseAdmin`), bo polityki RLS nie obejmują
 * wszystkich zapisów administratora.
 */
export async function requireTeamAdmin(ctx: ToolContext): Promise<SupabaseClient> {
  await requireTeam(ctx);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

/** Jak `requireTeamAdmin`, ale z własną listą ról. */
export async function requireRolesAdmin(
  ctx: ToolContext,
  roles: readonly string[],
): Promise<SupabaseClient> {
  await requireRoles(ctx, roles);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

/** Id zalogowanego użytkownika do pól `created_by` / `decided_by`. */
export function actorId(ctx: ToolContext): string {
  const id = ctx.getUserId();
  if (!id) throw new Error("Brak identyfikatora użytkownika w tokenie.");
  return id;
}

/** Podpis do notatek: data + kto (e-mail albo id). */
export function stamp(ctx: ToolContext): string {
  const when = new Date().toISOString().slice(0, 16).replace("T", " ");
  return `[${when} ${ctx.getUserEmail() ?? ctx.getUserId() ?? "mcp"}]`;
}

/** Buduje patch tylko z pól, które zostały podane (bez `undefined`). */
export function patchOf(input: Record<string, unknown>, keys: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (input[k] !== undefined) out[k] = input[k];
  return out;
}

/** UPDATE … RETURNING — błąd gdy 0 wierszy (brak rekordu). */
export async function updateOne(
  client: SupabaseClient,
  table: string,
  id: string,
  patch: Record<string, unknown>,
  returning = "*",
  idColumn = "id",
): Promise<Record<string, any>> {
  const { data, error } = await client
    .from(table)
    .update(patch)
    .eq(idColumn, id)
    .select(returning)
    .maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  if (!data) throw new Error(`${table}: nie znaleziono rekordu ${id}.`);
  return data as Record<string, any>;
}

/** INSERT … RETURNING jednego wiersza. */
export async function insertOne(
  client: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
  returning = "*",
): Promise<Record<string, any>> {
  const { data, error } = await client.from(table).insert(row).select(returning).single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as Record<string, any>;
}

export const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;
export const WRITE_IDEMPOTENT = { ...WRITE, idempotentHint: true } as const;
export const DESTRUCTIVE = { ...WRITE, destructiveHint: true } as const;
/** Narzędzie, które wysyła coś na zewnątrz (mail, SMS, Messenger). */
export const SENDS = { ...WRITE, openWorldHint: true } as const;

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
