/**
 * Fabryka narzędzi MCP typu „lista z filtrami" — jedna tabela, stały zestaw
 * kolumn, filtry jako mapa `nazwa → (schema zod, jak nałożyć na zapytanie)`,
 * automatyczne `limit` / `offset`, opcjonalne dołączenie danych z innej
 * tabeli (`attach`) i gate na rolę zespołu.
 *
 * Dzięki temu proste narzędzia mają ~15 linii zamiast ~40, a filtry są
 * spójne (te same nazwy i opisy w każdym narzędziu).
 */
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z, type ZodTypeAny } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  attach,
  clampLimit,
  handle,
  ilikeAny,
  isoDate,
  ok,
  okWith,
  requireRoles,
  requireTeam,
  requireUser,
} from "./_helpers";

export type ListFilter = {
  schema: ZodTypeAny;
  /** Nakłada filtr na zapytanie PostgREST; `v` jest już zwalidowane. */
  apply: (q: any, v: any, args: Record<string, any>) => any;
};

export type AttachSpec = {
  key: string;
  table: string;
  columns: string;
  as: string;
  targetKey?: string;
};

export type ListToolDef = {
  name: string;
  title: string;
  description: string;
  table: string;
  columns: string;
  /** Klucz w wyniku, np. `leads`. */
  resultKey: string;
  /** `team` = administrator/operator; tablica = własne role; brak = dowolny zalogowany (RLS). */
  access?: "team" | readonly string[];
  order?: { column: string; ascending?: boolean };
  defaultLimit?: number;
  maxLimit?: number;
  filters?: Record<string, ListFilter>;
  /** Stały warunek (np. tylko nieusunięte). */
  base?: (q: any) => any;
  /** Dane z innych tabel dołączane po kluczu. */
  attach?: AttachSpec[];
  /** Ostatnie przekształcenie wierszy przed zwróceniem. */
  map?: (row: Record<string, any>) => Record<string, any>;
  openWorld?: boolean;
  /** Kolumna z adresem obrazu — włącza wejście `preview` (obrazy inline w czacie). */
  preview?: { column: string; max?: number };
};

/** Filtr równości. */
export const eq = (column: string, schema: ZodTypeAny): ListFilter => ({
  schema,
  apply: (q, v) => q.eq(column, v),
});
/** Filtr `>=` (np. `created_at` od). */
export const gte = (column: string, schema: ZodTypeAny): ListFilter => ({
  schema,
  apply: (q, v) => q.gte(column, v),
});
/** Filtr `<=`. */
export const lte = (column: string, schema: ZodTypeAny): ListFilter => ({
  schema,
  apply: (q, v) => q.lte(column, v),
});
/** Data „od" (ISO albo YYYY-MM-DD) na kolumnie czasu. */
export const since = (column: string, what = "utworzenia"): ListFilter => ({
  schema: z.string().optional().describe(`Od kiedy (data ${what}, ISO 8601 lub YYYY-MM-DD).`),
  apply: (q, v) => q.gte(column, isoDate(v, "data od")),
});
/** Data „do" (wyłącznie) na kolumnie czasu. */
export const until = (column: string, what = "utworzenia"): ListFilter => ({
  schema: z.string().optional().describe(`Do kiedy (data ${what}, ISO 8601 lub YYYY-MM-DD).`),
  apply: (q, v) => q.lt(column, isoDate(v, "data do")),
});
/** Fraza `ilike` po kilku kolumnach. */
export const search = (columns: readonly string[], describe: string): ListFilter => ({
  schema: z.string().min(2).optional().describe(describe),
  apply: (q, v) => q.or(ilikeAny(columns, v)),
});
/** Filtr `in` po liście wartości. */
export const enumOf = (column: string, values: readonly [string, ...string[]], describe: string) =>
  eq(column, z.enum(values).optional().describe(describe));
/** Flaga bool. */
export const flag = (column: string, describe: string): ListFilter => ({
  schema: z.boolean().optional().describe(describe),
  apply: (q, v) => q.eq(column, v),
});
/** Dowolny tekst równy (status, kanał itp.). */
export const text = (column: string, describe: string): ListFilter =>
  eq(column, z.string().min(1).optional().describe(describe));
/** UUID równy. */
export const uuid = (column: string, describe: string): ListFilter =>
  eq(column, z.string().uuid().optional().describe(describe));

export function defineListTool(def: ListToolDef) {
  const defaultLimit = def.defaultLimit ?? 20;
  const maxLimit = def.maxLimit ?? 100;
  const filters = def.filters ?? {};
  const shape: Record<string, ZodTypeAny> = {};
  for (const [k, f] of Object.entries(filters)) shape[k] = f.schema;
  shape.limit = z
    .number()
    .int()
    .min(1)
    .max(maxLimit)
    .optional()
    .describe(`Ile wierszy (domyślnie ${defaultLimit}, maks. ${maxLimit}).`);
  shape.offset = z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Przesunięcie do stronicowania (domyślnie 0).");
  if (def.preview) {
    shape.preview = z
      .boolean()
      .optional()
      .describe(`Pokaż w czacie obrazy z wyników (do ${def.preview.max ?? 4}).`);
  }

  return defineTool({
    name: def.name,
    title: def.title,
    description: def.description,
    inputSchema: shape,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: def.openWorld ?? false,
    },
    handler: (args: Record<string, any>, ctx: ToolContext) =>
      handle(async () => {
        const client: SupabaseClient =
          def.access === "team"
            ? await requireTeam(ctx)
            : Array.isArray(def.access)
              ? await requireRoles(ctx, def.access)
              : requireUser(ctx);
        const limit = clampLimit(args.limit, defaultLimit, maxLimit);
        const offset = Math.max(0, Number(args.offset ?? 0) || 0);

        let q = client.from(def.table).select(def.columns, { count: "exact" });
        if (def.base) q = def.base(q);
        for (const [k, f] of Object.entries(filters)) {
          const v = args[k];
          if (v === undefined || v === null || v === "") continue;
          q = f.apply(q, v, args);
        }
        const order = def.order ?? { column: "created_at", ascending: false };
        q = q
          .order(order.column, { ascending: order.ascending ?? false })
          .range(offset, offset + limit - 1);

        const { data, error, count } = await q;
        if (error) throw new Error(`${def.table}: ${error.message}`);
        let rows = (data ?? []) as Record<string, any>[];
        for (const a of def.attach ?? []) rows = await attach(client, rows, a);
        if (def.map) rows = rows.map(def.map);
        const payload = {
          [def.resultKey]: rows,
          total: typeof count === "number" ? count : rows.length,
          limit,
          offset,
        };
        if (def.preview && args.preview) {
          const { fetchImageBlocks } = await import("@/lib/media-storage.server");
          const col = def.preview.column;
          const images = await fetchImageBlocks(
            rows.map((r) => r[col]),
            { max: def.preview.max ?? 4 },
          );
          return okWith(payload, images);
        }
        return ok(payload);
      }),
  });
}
