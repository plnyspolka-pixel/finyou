// Supabase — ogólny dostęp do bazy dla administratora: schemat (tabele,
// kolumny, funkcje RPC), odczyt dowolnej tabeli z filtrami, zapis (insert /
// upsert / update / delete), wywołanie funkcji RPC, Storage (kubełki, pliki,
// podpisane linki) i edge functions. Klient z rolą serwisową — omija RLS,
// dlatego tylko administrator. Do codziennej pracy są narzędzia dziedzinowe;
// te służą temu, czego one nie obejmują.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { DESTRUCTIVE, WRITE, handle, ok, requireRolesAdmin } from "../_helpers";

const ADMIN_ONLY = ["administrator"] as const;
const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;
const MAX_CHARS = 60_000;

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ident = (what: string) =>
  z.string().min(1).max(63).regex(IDENT, `${what}: tylko litery, cyfry i _`);

export const FILTER_OPS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "contains",
  "containedBy",
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];
export type Filter = { column: string; op: FilterOp; value?: unknown };

const filterSchema = z.object({
  column: z
    .string()
    .min(1)
    .max(200)
    .describe("Kolumna; dla JSON także ścieżka PostgREST, np. `data->>status`."),
  op: z.enum(FILTER_OPS),
  value: z
    .unknown()
    .optional()
    .describe(
      "Wartość; dla `in` tablica, dla `is` null/true/false, dla `contains` tablica/obiekt.",
    ),
});

/** Nakłada listę filtrów na zapytanie PostgREST (select / update / delete). */
export function applyFilters<Q>(q: Q, filters: readonly Filter[]): Q {
  let out: any = q;
  for (const f of filters) {
    const v = f.value as any;
    switch (f.op) {
      case "in":
        if (!Array.isArray(v)) throw new Error(`Filtr in (${f.column}): value musi być tablicą.`);
        out = out.in(f.column, v);
        break;
      case "is":
        if (!(v === null || v === true || v === false)) {
          throw new Error(`Filtr is (${f.column}): value musi być null, true albo false.`);
        }
        out = out.is(f.column, v);
        break;
      default:
        if (v === undefined) throw new Error(`Filtr ${f.op} (${f.column}): brak value.`);
        out = out[f.op](f.column, v);
    }
  }
  return out as Q;
}

/** Wynik z przycięciem, żeby odpowiedź nie rozsadziła kontekstu czatu. */
export function capped(payload: Record<string, unknown>) {
  const text = JSON.stringify(payload);
  if (text.length <= MAX_CHARS) return ok(payload);
  return ok({
    truncated: true,
    note: "Wynik przycięty — zawęź kolumny, filtry albo limit.",
    body: text.slice(0, MAX_CHARS),
  });
}

async function admin(ctx: ToolContext) {
  // Klient serwisowy bez typów tabel — nazwy przychodzą z wejścia narzędzia.
  return (await requireRolesAdmin(ctx, ADMIN_ONLY)) as any;
}

type OpenApi = {
  definitions?: Record<
    string,
    {
      description?: string;
      required?: string[];
      properties?: Record<string, { type?: string; format?: string; description?: string }>;
    }
  >;
  paths?: Record<string, { post?: { parameters?: any[]; summary?: string } }>;
};

export const supabaseListTables = defineTool({
  name: "supabase_list_tables",
  title: "Supabase: schema (tables, columns, RPC)",
  description:
    "Schemat bazy wystawiony przez PostgREST: lista tabel i widoków (bez `table`) albo kolumny jednej tabeli z typami i wymaganymi polami (z `table`), plus lista funkcji RPC. Zacznij od niego przed `supabase_select` / zapisem. Tylko administrator.",
  inputSchema: {
    table: ident("table").optional().describe("Tabela, której kolumny pokazać."),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!key) throw new Error("Brak SUPABASE_SERVICE_ROLE_KEY na serwerze.");
      const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          accept: "application/openapi+json",
        },
      });
      if (!res.ok) throw new Error(`PostgREST OpenAPI: HTTP ${res.status}`);
      const spec = (await res.json()) as OpenApi;
      const defs = spec.definitions ?? {};

      if (a.table) {
        const d = defs[a.table];
        if (!d) throw new Error(`Nie ma tabeli ${a.table} w schemacie public.`);
        const required = new Set(d.required ?? []);
        return ok({
          table: a.table,
          description: d.description ?? null,
          columns: Object.entries(d.properties ?? {}).map(([name, p]) => ({
            name,
            type: p.format ?? p.type ?? null,
            required: required.has(name),
            note: p.description?.includes("<pk/>")
              ? "primary key"
              : p.description?.match(/<fk table='([^']+)' column='([^']+)'\/>/)
                ? p.description.replace(
                    /.*<fk table='([^']+)' column='([^']+)'\/>.*/s,
                    "fk → $1.$2",
                  )
                : null,
          })),
        });
      }

      const rpc = Object.entries(spec.paths ?? {})
        .filter(([p]) => p.startsWith("/rpc/"))
        .map(([p, v]) => ({
          name: p.slice(5),
          args: (v.post?.parameters ?? [])
            .flatMap((x: any) => Object.keys(x?.schema?.properties ?? {}))
            .sort(),
        }));
      return capped({
        tables: Object.keys(defs).sort(),
        rpc_functions: rpc.sort((x, y) => x.name.localeCompare(y.name)),
      });
    }),
});

export const supabaseSelect = defineTool({
  name: "supabase_select",
  title: "Supabase: select rows",
  description:
    "Odczyt z dowolnej tabeli/widoku (rola serwisowa, bez RLS): kolumny w składni PostgREST (także relacje, np. `id, email, leads(id, status)`), filtry, sortowanie, limit/offset i łączna liczba wierszy. Tylko administrator.",
  inputSchema: {
    table: ident("table"),
    columns: z.string().min(1).max(2000).default("*"),
    filters: z.array(filterSchema).max(20).optional(),
    or: z
      .string()
      .max(2000)
      .optional()
      .describe("Warunek `or` PostgREST, np. `status.eq.new,status.eq.open`."),
    order: z
      .array(
        z.object({ column: z.string().min(1).max(200), ascending: z.boolean().default(false) }),
      )
      .max(5)
      .optional(),
    limit: z.number().int().min(1).max(1000).default(50),
    offset: z.number().int().min(0).default(0),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const db = await admin(ctx);
      let q = db.from(a.table).select(a.columns ?? "*", { count: "exact" });
      q = applyFilters(q, (a.filters ?? []) as Filter[]);
      if (a.or) q = q.or(a.or);
      for (const o of a.order ?? []) q = q.order(o.column, { ascending: o.ascending ?? false });
      const limit = a.limit ?? 50;
      const offset = a.offset ?? 0;
      const { data, error, count } = await q.range(offset, offset + limit - 1);
      if (error) throw new Error(`${a.table}: ${error.message}`);
      return capped({ table: a.table, rows: data ?? [], total: count ?? null, limit, offset });
    }),
});

export const supabaseInsert = defineTool({
  name: "supabase_insert",
  title: "Supabase: insert / upsert rows",
  description:
    "Wstawia wiersze do tabeli (rola serwisowa, bez RLS); z `on_conflict` robi upsert po wskazanych kolumnach. Zwraca zapisane wiersze. Wykonuj tylko na wyraźne polecenie użytkownika. Tylko administrator.",
  inputSchema: {
    table: ident("table"),
    rows: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
    on_conflict: z
      .string()
      .max(300)
      .optional()
      .describe("Kolumny unikalne dla upsertu, np. `id` albo `email`."),
    returning: z.string().max(2000).default("*"),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const db = await admin(ctx);
      const base = db.from(a.table);
      const q = a.on_conflict
        ? base.upsert(a.rows, { onConflict: a.on_conflict })
        : base.insert(a.rows);
      const { data, error } = await q.select(a.returning ?? "*");
      if (error) throw new Error(`${a.table}: ${error.message}`);
      return capped({ table: a.table, written: data?.length ?? 0, rows: data ?? [] });
    }),
});

export const supabaseUpdate = defineTool({
  name: "supabase_update",
  title: "Supabase: update rows",
  description:
    "Zmienia wiersze pasujące do filtrów (co najmniej jeden filtr — bez filtrów narzędzie odmawia). `max_rows` chroni przed zmianą większej liczby wierszy niż zakładana: najpierw liczy dopasowania i przerywa, gdy jest ich więcej. Wykonuj tylko na wyraźne polecenie użytkownika. Tylko administrator.",
  inputSchema: {
    table: ident("table"),
    patch: z.record(z.string(), z.unknown()),
    filters: z.array(filterSchema).min(1).max(20),
    max_rows: z.number().int().min(1).max(10_000).default(1),
    returning: z.string().max(2000).default("*"),
  },
  annotations: DESTRUCTIVE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const db = await admin(ctx);
      const filters = (a.filters ?? []) as Filter[];
      if (filters.length === 0) throw new Error("Podaj co najmniej jeden filtr.");
      if (Object.keys(a.patch ?? {}).length === 0) throw new Error("Pusty patch.");
      const maxRows = a.max_rows ?? 1;
      await guardCount(db, a.table, filters, maxRows);
      const { data, error } = await applyFilters(db.from(a.table).update(a.patch), filters).select(
        a.returning ?? "*",
      );
      if (error) throw new Error(`${a.table}: ${error.message}`);
      return capped({ table: a.table, updated: data?.length ?? 0, rows: data ?? [] });
    }),
});

export const supabaseDelete = defineTool({
  name: "supabase_delete",
  title: "Supabase: delete rows",
  description:
    "Usuwa wiersze pasujące do filtrów (co najmniej jeden filtr; `max_rows` jak w `supabase_update`). Nieodwracalne — przed wywołaniem pokaż użytkownikowi, co zostanie usunięte, i poczekaj na potwierdzenie. Tylko administrator.",
  inputSchema: {
    table: ident("table"),
    filters: z.array(filterSchema).min(1).max(20),
    max_rows: z.number().int().min(1).max(10_000).default(1),
  },
  annotations: DESTRUCTIVE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const db = await admin(ctx);
      const filters = (a.filters ?? []) as Filter[];
      if (filters.length === 0) throw new Error("Podaj co najmniej jeden filtr.");
      await guardCount(db, a.table, filters, a.max_rows ?? 1);
      const { data, error } = await applyFilters(db.from(a.table).delete(), filters).select("*");
      if (error) throw new Error(`${a.table}: ${error.message}`);
      return capped({ table: a.table, deleted: data?.length ?? 0, rows: data ?? [] });
    }),
});

async function guardCount(db: any, table: string, filters: Filter[], maxRows: number) {
  const { count, error } = await applyFilters(
    db.from(table).select("*", { count: "exact", head: true }),
    filters,
  );
  if (error) throw new Error(`${table}: ${error.message}`);
  if ((count ?? 0) > maxRows) {
    throw new Error(
      `${table}: filtry pasują do ${count} wierszy, a max_rows = ${maxRows}. Zawęź filtry albo podnieś max_rows.`,
    );
  }
}

export const supabaseRpc = defineTool({
  name: "supabase_rpc",
  title: "Supabase: call RPC function",
  description:
    "Wywołuje funkcję bazy (RPC) z argumentami, z rolą serwisową. Listę funkcji i ich argumentów daje `supabase_list_tables`. Funkcja może zmieniać dane — wywołuj ją tylko na wyraźne polecenie użytkownika, chyba że tylko czyta. Tylko administrator.",
  inputSchema: {
    fn: ident("fn"),
    args: z.record(z.string(), z.unknown()).optional(),
  },
  annotations: DESTRUCTIVE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const db = await admin(ctx);
      const { data, error } = await db.rpc(a.fn, a.args ?? {});
      if (error) throw new Error(`rpc ${a.fn}: ${error.message}`);
      return capped({ fn: a.fn, result: data ?? null });
    }),
});

export const supabaseStorage = defineTool({
  name: "supabase_storage",
  title: "Supabase: storage (buckets, files, signed URLs)",
  description:
    "Storage: `list_buckets` — kubełki; `list` — pliki w kubełku pod prefiksem (`path`); `signed_url` — podpisany link do pliku (domyślnie na godzinę). Tylko administrator.",
  inputSchema: {
    action: z.enum(["list_buckets", "list", "signed_url"]),
    bucket: z.string().min(1).max(100).optional(),
    path: z
      .string()
      .max(1000)
      .optional()
      .describe("Prefiks (list) albo ścieżka pliku (signed_url)."),
    search: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(1000).default(100),
    offset: z.number().int().min(0).default(0),
    expires_in: z
      .number()
      .int()
      .min(60)
      .max(7 * 86_400)
      .default(3600),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const db = await admin(ctx);
      if (a.action === "list_buckets") {
        const { data, error } = await db.storage.listBuckets();
        if (error) throw new Error(`storage: ${error.message}`);
        return ok({
          buckets: (data ?? []).map((b: any) => ({ id: b.id, name: b.name, public: b.public })),
        });
      }
      if (!a.bucket) throw new Error("Podaj bucket.");
      const bucket = db.storage.from(a.bucket);
      if (a.action === "list") {
        const { data, error } = await bucket.list(a.path ?? "", {
          limit: a.limit ?? 100,
          offset: a.offset ?? 0,
          search: a.search,
          sortBy: { column: "name", order: "asc" },
        });
        if (error) throw new Error(`storage ${a.bucket}: ${error.message}`);
        return capped({
          bucket: a.bucket,
          path: a.path ?? "",
          files: (data ?? []).map((f: any) => ({
            name: f.name,
            folder: f.id === null,
            size: f.metadata?.size ?? null,
            mimetype: f.metadata?.mimetype ?? null,
            updated_at: f.updated_at ?? null,
          })),
        });
      }
      if (!a.path) throw new Error("Podaj path pliku.");
      const { data, error } = await bucket.createSignedUrl(a.path, a.expires_in ?? 3600);
      if (error) throw new Error(`storage ${a.bucket}/${a.path}: ${error.message}`);
      return ok({ bucket: a.bucket, path: a.path, signed_url: data?.signedUrl ?? null });
    }),
});

export const supabaseInvokeFunction = defineTool({
  name: "supabase_invoke_function",
  title: "Supabase: invoke edge function",
  description:
    "Wywołuje edge function Supabase (np. `rcn-proxy`, `tpay-proxy`) z ciałem JSON i kluczem serwisowym. Funkcja może działać na zewnątrz (płatności, rejestry) — tylko na wyraźne polecenie użytkownika. Tylko administrator.",
  inputSchema: {
    name: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9][a-z0-9_-]*$/),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
    body: z.record(z.string(), z.unknown()).optional(),
  },
  annotations: { ...DESTRUCTIVE, openWorldHint: true },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const db = await admin(ctx);
      const { data, error } = await db.functions.invoke(a.name, {
        method: a.method ?? "POST",
        body: a.body,
      });
      if (error) throw new Error(`function ${a.name}: ${error.message}`);
      return capped({ function: a.name, result: data ?? null });
    }),
});

export const supabaseTools = [
  supabaseListTables,
  supabaseSelect,
  supabaseInsert,
  supabaseUpdate,
  supabaseDelete,
  supabaseRpc,
  supabaseStorage,
  supabaseInvokeFunction,
];
