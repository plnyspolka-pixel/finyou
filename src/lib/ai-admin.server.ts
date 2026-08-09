// Server-only helpers for AI Administrator (Claude/Anthropic)
import { promises as fs } from "node:fs";
import path from "node:path";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Project root (works in dev sandbox + Worker bundle that includes src/)
const PROJECT_ROOT = process.cwd();

const FORBIDDEN_SQL =
  /\b(alter\s+role|alter\s+system|create\s+role|drop\s+role|create\s+user|drop\s+user)\b/i;

function isSelectOnly(sql: string): boolean {
  const trimmed = sql
    .trim()
    .replace(/^with\s+[^;]+;/i, "")
    .trim();
  return (
    /^(select|with\s)/i.test(trimmed) &&
    !/;\s*(insert|update|delete|alter|drop|create|truncate)/i.test(sql)
  );
}

export type ToolCall = {
  name: string;
  input: Record<string, unknown>;
};

/** Rodzaje wpisów pamięci — muszą odpowiadać CHECK-owi na `ai_admin_memory.kind`. */
export const MEMORY_KINDS = ["preferencja", "proces", "fakt", "slownik", "projekt"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** Ekranuje znaki wieloznaczne wzorca `ilike` (wartość filtra). */
function escapeLikePattern(s: string): string {
  return s.replace(/[%_\\]/g, (m) => `\\${m}`);
}

/**
 * Wzorzec do wnętrza `.or("a.ilike.%x%,b.ilike.%x%")` — tam przecinki i nawiasy
 * są składnią filtra, więc zamieniamy je na spacje.
 */
function escapeOrPattern(s: string): string {
  return escapeLikePattern(s).replace(/[,()]/g, " ");
}

/**
 * Zapisuje wpis pamięci „po tytule": istniejący (nieskasowany) tytuł jest
 * aktualizowany, nowy — dodawany. Wpisów `pinned` (dopisanych ręcznie w panelu)
 * automat nie nadpisuje.
 */
export async function upsertMemoryEntry(args: {
  kind: string;
  title: string;
  content: string;
  weight?: number;
  userId?: string;
  conversationId?: string;
  pinned?: boolean;
  /**
   * Czy wolno wskrzesić wpis zarchiwizowany (domyślnie tak — świadome
   * `remember` / wpis z panelu). Destylacja ustawia `false`, żeby raz
   * „zapomniana" wiedza nie wracała sama przy każdej kolejnej rozmowie.
   */
  allowRevive?: boolean;
}): Promise<{
  id: string;
  action: "created" | "updated" | "skipped_pinned" | "skipped_archived";
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing } = await supabaseAdmin
    .from("ai_admin_memory")
    .select("id, pinned, weight, archived")
    .ilike("title", escapeLikePattern(args.title))
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (existing.pinned && !args.pinned) return { id: existing.id, action: "skipped_pinned" };
    if (existing.archived && args.allowRevive === false)
      return { id: existing.id, action: "skipped_archived" };
    const { error } = await supabaseAdmin
      .from("ai_admin_memory")
      .update({
        kind: args.kind,
        content: args.content,
        weight: args.weight ?? existing.weight,
        archived: false,
        ...(args.pinned === undefined ? {} : { pinned: args.pinned }),
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { id: existing.id, action: "updated" };
  }

  const { data, error } = await supabaseAdmin
    .from("ai_admin_memory")
    .insert({
      kind: args.kind,
      title: args.title,
      content: args.content,
      weight: args.weight ?? 0,
      pinned: args.pinned ?? false,
      created_by: args.userId ?? null,
      source_conversation_id: args.conversationId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id, action: "created" };
}

/**
 * Blok pamięci długotrwałej doklejany do promptu systemowego. Zwraca też liczbę
 * wpisów — przy okazji podbijamy licznik użyć, żeby było widać, co faktycznie
 * pracuje (kolumny `uses` / `last_used_at`).
 */
export async function buildMemoryBlock(limit: number): Promise<{ text: string; count: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("ai_admin_memory")
    .select("id, kind, title, content")
    .eq("archived", false)
    .order("weight", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(200, limit)));
  if (error || !data || data.length === 0) return { text: "", count: 0 };

  const lines = data.map((m) => `- [${m.kind}] ${m.title}: ${m.content} (id: ${m.id})`);
  const ids = data.map((m) => `'${m.id}'`).join(",");
  // PostgREST nie umie `uses = uses + 1`, więc jednym SQL-em przez RPC.
  await supabaseAdmin
    .rpc("exec_admin_any" as never, {
      _sql: `UPDATE public.ai_admin_memory SET uses = uses + 1, last_used_at = now() WHERE id IN (${ids})`,
    } as never)
    .then(
      () => undefined,
      () => undefined, // licznik jest statystyką — jego błąd nie może psuć rozmowy
    );

  return {
    text: `\n--- PAMIĘĆ DŁUGOTRWAŁA (wiedza z poprzednich rozmów; traktuj jak ustalenia administratora) ---\n${lines.join("\n")}\n--- KONIEC PAMIĘCI ---`,
    count: data.length,
  };
}

export const ANTHROPIC_TOOLS = [
  {
    name: "query_database",
    description:
      "Wykonaj zapytanie SELECT na bazie Postgres. Tylko odczyt. Zwraca do 200 wierszy. Schema 'public'.",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "Zapytanie SELECT (tylko odczyt)." },
        limit: { type: "number", description: "Limit wierszy, max 200.", default: 50 },
      },
      required: ["sql"],
    },
  },
  {
    name: "mutate_database",
    description:
      "Wykonaj INSERT/UPDATE/DELETE na bazie. UŻYWAJ TYLKO gdy administrator wyraźnie poprosił o zmianę danych. Operacja jest nieodwracalna. Schema 'public'.",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "Zapytanie INSERT/UPDATE/DELETE." },
        reason: {
          type: "string",
          description: "Krótkie uzasadnienie zmiany (zapisywane w audicie).",
        },
      },
      required: ["sql", "reason"],
    },
  },
  {
    name: "list_project_files",
    description:
      "Lista plików w katalogu projektu (relatywnie do roota). Domyślnie 'src'. Wynik to maksymalnie 300 ścieżek.",
    input_schema: {
      type: "object",
      properties: {
        dir: { type: "string", description: "Katalog względem roota.", default: "src" },
      },
    },
  },
  {
    name: "read_project_file",
    description:
      "Przeczytaj zawartość pliku tekstowego projektu (max 200 KB). Tylko src/**, supabase/migrations/**, public/**, package.json, vite.config.ts.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Ścieżka pliku względem roota." },
      },
      required: ["path"],
    },
  },
  {
    name: "list_database_tables",
    description: "Zwraca listę tabel w schemie public z liczbą kolumn.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "write_project_file",
    description:
      "Zapisz/utwórz plik tekstowy w projekcie (max 500 KB). Nadpisuje istniejący plik. Tworzy też brakujące katalogi. Pliki z sekretami (.env*) są zablokowane.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Ścieżka pliku względem roota projektu." },
        content: { type: "string", description: "Pełna nowa zawartość pliku." },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "delete_project_file",
    description: "Usuń plik z projektu. Pliki z sekretami (.env*) są zablokowane.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Ścieżka pliku względem roota projektu." },
      },
      required: ["path"],
    },
  },
  {
    name: "describe_table",
    description:
      "Opisz tabelę ze schemy 'public': kolumny (typ, NULL, default) + polityki RLS. Używaj zanim napiszesz zapytanie na nieznanej tabeli — zamiast zgadywać nazwy kolumn.",
    input_schema: {
      type: "object",
      properties: {
        table: { type: "string", description: "Nazwa tabeli w schemie public." },
      },
      required: ["table"],
    },
  },
  {
    name: "search_project_files",
    description:
      "Wyszukaj tekst w plikach projektu (grep). Zwraca ścieżki + numery i treść pasujących linii, max 120 trafień. Przydatne, by znaleźć miejsce w kodzie odpowiedzialne za funkcję panelu.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Szukany tekst lub wyrażenie regularne." },
        dir: { type: "string", description: "Katalog startowy względem roota.", default: "src" },
        regex: { type: "boolean", description: "Traktuj query jako regex.", default: false },
        extensions: {
          type: "array",
          items: { type: "string" },
          description: "Ogranicz do rozszerzeń, np. ['ts','tsx','sql'].",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "remember",
    description:
      "Zapisz trwały wpis do pamięci długotrwałej (baza wiedzy dostępna w KAŻDEJ przyszłej rozmowie). Używaj, gdy administrator ustala sposób pracy, tłumaczy proces, nazwę własną albo prosi „zapamiętaj”. Wpis o istniejącym tytule zostaje zaktualizowany, nie zduplikowany. Nie zapisuj rzeczy jednorazowych ani danych, które można w każdej chwili odpytać z bazy.",
    input_schema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["preferencja", "proces", "fakt", "slownik", "projekt"],
          description:
            "preferencja = jak mam pracować; proces = jak przebiega czynność w firmie; fakt = trwały fakt o firmie/danych; slownik = nazwa własna lub skrót; projekt = kontekst bieżącej roboty.",
        },
        title: { type: "string", description: "Krótka etykieta, max 120 znaków (klucz wpisu)." },
        content: { type: "string", description: "Treść wpisu — zwięźle, konkretnie." },
        weight: {
          type: "number",
          description: "Priorytet 0–100; wyżej = ważniejsze w prompcie.",
          default: 0,
        },
      },
      required: ["kind", "title", "content"],
    },
  },
  {
    name: "recall_memory",
    description:
      "Przeszukaj pamięć długotrwałą. Najważniejsze wpisy i tak masz w prompcie — używaj, gdy szukasz czegoś spoza tego zestawu.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Fraza (tytuł lub treść). Pomiń, by dostać listę.",
        },
        kind: { type: "string", description: "Filtr rodzaju wpisu." },
      },
    },
  },
  {
    name: "forget",
    description:
      "Archiwizuj wpis pamięci (po id lub tytule) — gdy administrator mówi, że coś jest nieaktualne lub błędne.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Id wpisu (uuid)." },
        title: { type: "string", description: "Albo dokładny tytuł wpisu." },
      },
    },
  },
  {
    name: "search_conversations",
    description:
      "Szukaj po treści WSZYSTKICH dotychczasowych rozmów z asystentem (także innych wątków). Używaj, gdy administrator odwołuje się do czegoś, co ustalaliście wcześniej („jak wtedy robiliśmy”, „to co ci mówiłem o…”).",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Szukana fraza." },
        limit: {
          type: "number",
          description: "Max trafień, domyślnie 20 (max 50).",
          default: 20,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "list_admin_pages",
    description:
      "Zwraca mapę panelu /admin: sekcje, ścieżki, opisy. Używaj, żeby wskazać administratorowi właściwą stronę — ścieżki podawaj w odpowiedzi jako linki markdown, np. [Klienci](/admin/klienci).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "execute_sql",
    description:
      "Wykonaj DOWOLNE zapytanie SQL na bazie (SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, CREATE POLICY, GRANT itp.). Pełen dostęp administratora. Nie używaj do zmian ról i ustawień systemu (alter role/system, create/drop role). Zawsze najpierw rozważ skutki.",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "Dowolne zapytanie SQL." },
        reason: { type: "string", description: "Krótkie uzasadnienie (audit log)." },
      },
      required: ["sql", "reason"],
    },
  },
];

// Blokujemy tylko pliki z sekretami; reszta projektu dostępna do odczytu.
const FORBIDDEN_FILE = /(^|\/)(\.env(\..*)?|\.git\/|node_modules\/)/i;

function safeFilePath(rel: string): string | null {
  const normalized = path.normalize(rel).replace(/^[/\\]+/, "");
  if (normalized.includes("..")) return null;
  if (FORBIDDEN_FILE.test(normalized.replace(/\\/g, "/"))) return null;
  return path.join(PROJECT_ROOT, normalized);
}

export async function runTool(
  call: ToolCall,
  opts: {
    enableDbRead: boolean;
    enableDbWrite: boolean;
    enableFileRead: boolean;
    enableFileWrite: boolean;
    /** Pamięć długotrwała (`remember` / `recall_memory` / `forget`). */
    enableMemory?: boolean;
    /** Autor wpisów pamięci — administrator prowadzący rozmowę. */
    userId?: string;
    /** Rozmowa, z której pochodzi wywołanie (źródło wpisu pamięci). */
    conversationId?: string;
  },
): Promise<{ ok: boolean; output: unknown; error?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  try {
    if (call.name === "query_database") {
      if (!opts.enableDbRead) return { ok: false, output: null, error: "Odczyt bazy wyłączony." };
      const sql = String(call.input.sql ?? "");
      const limit = Math.min(Number(call.input.limit ?? 50) || 50, 200);
      if (!isSelectOnly(sql))
        return { ok: false, output: null, error: "Tylko SELECT/WITH są dozwolone tutaj." };
      if (FORBIDDEN_SQL.test(sql))
        return { ok: false, output: null, error: "Zapytanie zawiera zabronione operacje." };
      const wrapped = `SELECT * FROM (${sql.replace(/;\s*$/, "")}) _q LIMIT ${limit}`;
      const { data, error } = await supabaseAdmin.rpc(
        "exec_admin_select" as never,
        { _sql: wrapped } as never,
      );
      if (error) {
        // Fallback: direct via PostgREST not possible for arbitrary SQL — return error
        return { ok: false, output: null, error: `DB: ${error.message}` };
      }
      return { ok: true, output: data };
    }

    if (call.name === "mutate_database") {
      if (!opts.enableDbWrite) return { ok: false, output: null, error: "Zapis bazy wyłączony." };
      const sql = String(call.input.sql ?? "");
      if (isSelectOnly(sql))
        return { ok: false, output: null, error: "To jest SELECT — użyj query_database." };
      if (FORBIDDEN_SQL.test(sql))
        return { ok: false, output: null, error: "Zapytanie zawiera zabronione operacje." };
      if (!/\b(insert|update|delete)\b/i.test(sql))
        return { ok: false, output: null, error: "Dozwolone: INSERT/UPDATE/DELETE." };
      const { data, error } = await supabaseAdmin.rpc(
        "exec_admin_write" as never,
        { _sql: sql } as never,
      );
      if (error) return { ok: false, output: null, error: `DB: ${error.message}` };
      return { ok: true, output: data ?? { ok: true } };
    }

    if (call.name === "list_database_tables") {
      if (!opts.enableDbRead) return { ok: false, output: null, error: "Odczyt bazy wyłączony." };
      const { data, error } = await supabaseAdmin.rpc(
        "exec_admin_select" as never,
        {
          _sql: `SELECT table_name, (SELECT count(*) FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name = t.table_name) AS cols FROM information_schema.tables t WHERE table_schema='public' ORDER BY table_name`,
        } as never,
      );
      if (error) return { ok: false, output: null, error: error.message };
      return { ok: true, output: data };
    }

    if (call.name === "list_project_files") {
      if (!opts.enableFileRead)
        return { ok: false, output: null, error: "Odczyt plików wyłączony." };
      const rel = String(call.input.dir ?? "src");
      const safe = safeFilePath(rel);
      if (!safe) return { ok: false, output: null, error: "Ścieżka niedozwolona." };
      const out: string[] = [];
      async function walk(p: string) {
        if (out.length >= 300) return;
        let entries: { name: string; isDirectory: () => boolean }[] = [];
        try {
          entries = (await fs.readdir(p, { withFileTypes: true })) as never;
        } catch {
          return;
        }
        for (const e of entries) {
          if (out.length >= 300) return;
          if (e.name.startsWith(".") || e.name === "node_modules") continue;
          const full = path.join(p, e.name);
          if (e.isDirectory()) await walk(full);
          else out.push(path.relative(PROJECT_ROOT, full));
        }
      }
      await walk(safe);
      return { ok: true, output: out };
    }

    if (call.name === "read_project_file") {
      if (!opts.enableFileRead)
        return { ok: false, output: null, error: "Odczyt plików wyłączony." };
      const rel = String(call.input.path ?? "");
      const safe = safeFilePath(rel);
      if (!safe)
        return {
          ok: false,
          output: null,
          error: "Ścieżka niedozwolona (pliki z sekretami są zablokowane).",
        };
      const stat = await fs.stat(safe).catch(() => null);
      if (!stat || !stat.isFile()) return { ok: false, output: null, error: "Plik nie istnieje." };
      if (stat.size > 1024 * 1024)
        return { ok: false, output: null, error: "Plik za duży (>1 MB)." };
      const content = await fs.readFile(safe, "utf8");
      return { ok: true, output: { path: rel, size: stat.size, content } };
    }

    if (call.name === "write_project_file") {
      if (!opts.enableFileWrite)
        return { ok: false, output: null, error: "Zapis plików wyłączony." };
      const rel = String(call.input.path ?? "");
      const content = String(call.input.content ?? "");
      const safe = safeFilePath(rel);
      if (!safe)
        return {
          ok: false,
          output: null,
          error: "Ścieżka niedozwolona (pliki z sekretami są zablokowane).",
        };
      if (content.length > 500 * 1024)
        return { ok: false, output: null, error: "Zawartość za duża (>500 KB)." };
      await fs.mkdir(path.dirname(safe), { recursive: true });
      await fs.writeFile(safe, content, "utf8");
      return { ok: true, output: { path: rel, bytes: content.length, action: "written" } };
    }

    if (call.name === "delete_project_file") {
      if (!opts.enableFileWrite)
        return { ok: false, output: null, error: "Zapis plików wyłączony." };
      const rel = String(call.input.path ?? "");
      const safe = safeFilePath(rel);
      if (!safe) return { ok: false, output: null, error: "Ścieżka niedozwolona." };
      await fs.unlink(safe).catch((e) => {
        throw new Error(e instanceof Error ? e.message : String(e));
      });
      return { ok: true, output: { path: rel, action: "deleted" } };
    }

    if (call.name === "describe_table") {
      if (!opts.enableDbRead) return { ok: false, output: null, error: "Odczyt bazy wyłączony." };
      const table = String(call.input.table ?? "").trim();
      if (!/^[a-z_][a-z0-9_]*$/i.test(table))
        return { ok: false, output: null, error: "Niepoprawna nazwa tabeli." };
      const lit = `'${table.replace(/'/g, "''")}'`;
      const sql = `SELECT
  (SELECT jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type, 'nullable', is_nullable, 'default', column_default) ORDER BY ordinal_position)
     FROM information_schema.columns WHERE table_schema='public' AND table_name=${lit}) AS columns,
  (SELECT jsonb_agg(jsonb_build_object('policy', policyname, 'cmd', cmd, 'using', qual, 'check', with_check))
     FROM pg_policies WHERE schemaname='public' AND tablename=${lit}) AS policies`;
      const { data, error } = await supabaseAdmin.rpc(
        "exec_admin_select" as never,
        { _sql: sql } as never,
      );
      if (error) return { ok: false, output: null, error: `DB: ${error.message}` };
      const rows = data as Array<{ columns: unknown; policies: unknown }> | null;
      if (!rows || rows.length === 0 || !rows[0].columns)
        return { ok: false, output: null, error: `Tabela public.${table} nie istnieje.` };
      return { ok: true, output: { table, ...rows[0] } };
    }

    if (call.name === "search_project_files") {
      if (!opts.enableFileRead)
        return { ok: false, output: null, error: "Odczyt plików wyłączony." };
      const query = String(call.input.query ?? "");
      if (!query.trim()) return { ok: false, output: null, error: "Puste zapytanie." };
      const useRegex = call.input.regex === true;
      const exts = Array.isArray(call.input.extensions)
        ? (call.input.extensions as unknown[]).map((e) =>
            String(e).replace(/^\./, "").toLowerCase(),
          )
        : null;
      const safe = safeFilePath(String(call.input.dir ?? "src"));
      if (!safe) return { ok: false, output: null, error: "Ścieżka niedozwolona." };

      let matcher: RegExp;
      try {
        matcher = new RegExp(useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      } catch (e) {
        return {
          ok: false,
          output: null,
          error: `Niepoprawny regex: ${e instanceof Error ? e.message : String(e)}`,
        };
      }

      const hits: Array<{ path: string; line: number; text: string }> = [];
      let scanned = 0;
      async function walk(p: string) {
        if (hits.length >= 120 || scanned >= 3000) return;
        let entries: { name: string; isDirectory: () => boolean }[] = [];
        try {
          entries = (await fs.readdir(p, { withFileTypes: true })) as never;
        } catch {
          return;
        }
        for (const e of entries) {
          if (hits.length >= 120 || scanned >= 3000) return;
          if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist") continue;
          const full = path.join(p, e.name);
          if (e.isDirectory()) {
            await walk(full);
            continue;
          }
          const ext = path.extname(e.name).replace(/^\./, "").toLowerCase();
          if (exts && !exts.includes(ext)) continue;
          if (!exts && !/^(ts|tsx|js|jsx|sql|json|md|css|toml|yml|yaml|html)$/.test(ext)) continue;
          const stat = await fs.stat(full).catch(() => null);
          if (!stat || stat.size > 512 * 1024) continue;
          scanned++;
          let content = "";
          try {
            content = await fs.readFile(full, "utf8");
          } catch {
            continue;
          }
          if (!matcher.test(content)) continue;
          const rel = path.relative(PROJECT_ROOT, full);
          const lines = content.split("\n");
          for (let i = 0; i < lines.length && hits.length < 120; i++) {
            if (matcher.test(lines[i]))
              hits.push({ path: rel, line: i + 1, text: lines[i].trim().slice(0, 300) });
          }
        }
      }
      await walk(safe);
      return {
        ok: true,
        output: {
          query,
          files_scanned: scanned,
          truncated: hits.length >= 120,
          matches: hits,
        },
      };
    }

    if (call.name === "remember") {
      if (opts.enableMemory === false)
        return { ok: false, output: null, error: "Pamięć długotrwała wyłączona." };
      const kind = String(call.input.kind ?? "fakt");
      const title = String(call.input.title ?? "").trim();
      const content = String(call.input.content ?? "").trim();
      if (!MEMORY_KINDS.includes(kind as (typeof MEMORY_KINDS)[number]))
        return { ok: false, output: null, error: `Nieznany rodzaj wpisu: ${kind}` };
      if (!title || !content)
        return { ok: false, output: null, error: "Tytuł i treść są wymagane." };
      if (title.length > 120)
        return { ok: false, output: null, error: "Tytuł max 120 znaków." };
      const weight = Math.max(0, Math.min(100, Number(call.input.weight ?? 0) || 0));
      const saved = await upsertMemoryEntry({
        kind,
        title,
        content,
        weight,
        userId: opts.userId,
        conversationId: opts.conversationId,
      });
      return { ok: true, output: saved };
    }

    if (call.name === "recall_memory") {
      if (opts.enableMemory === false)
        return { ok: false, output: null, error: "Pamięć długotrwała wyłączona." };
      const query = String(call.input.query ?? "").trim();
      const kind = String(call.input.kind ?? "").trim();
      let q = supabaseAdmin
        .from("ai_admin_memory")
        .select("id, kind, title, content, weight, updated_at")
        .eq("archived", false)
        .order("weight", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(60);
      if (kind) q = q.eq("kind", kind);
      if (query) {
        const esc = escapeOrPattern(query);
        q = q.or(`title.ilike.%${esc}%,content.ilike.%${esc}%`);
      }
      const { data, error } = await q;
      if (error) return { ok: false, output: null, error: error.message };
      return { ok: true, output: data ?? [] };
    }

    if (call.name === "forget") {
      if (opts.enableMemory === false)
        return { ok: false, output: null, error: "Pamięć długotrwała wyłączona." };
      const id = String(call.input.id ?? "").trim();
      const title = String(call.input.title ?? "").trim();
      if (!id && !title) return { ok: false, output: null, error: "Podaj id albo tytuł wpisu." };
      const base = supabaseAdmin.from("ai_admin_memory").update({ archived: true });
      const { data, error } = id
        ? await base.eq("id", id).select("id, title")
        : await base.ilike("title", escapeLikePattern(title)).select("id, title");
      if (error) return { ok: false, output: null, error: error.message };
      if (!data || data.length === 0)
        return { ok: false, output: null, error: "Nie znalazłem takiego wpisu pamięci." };
      return { ok: true, output: { archived: data } };
    }

    if (call.name === "search_conversations") {
      const query = String(call.input.query ?? "").trim();
      if (!query) return { ok: false, output: null, error: "Puste zapytanie." };
      const limit = Math.min(Number(call.input.limit ?? 20) || 20, 50);

      // Szukamy tylko po wątkach tego administratora (service role widziałby
      // wszystkie). Tytuły bierzemy z tego samego zapytania — bez embedów.
      const titles = new Map<string, string>();
      let ownIds: string[] = [];
      if (opts.userId) {
        const { data: convs, error: cErr } = await supabaseAdmin
          .from("ai_admin_conversations")
          .select("id, title")
          .eq("user_id", opts.userId)
          .order("updated_at", { ascending: false })
          .limit(500);
        if (cErr) return { ok: false, output: null, error: cErr.message };
        for (const c of convs ?? []) titles.set(c.id, c.title);
        ownIds = [...titles.keys()];
        if (ownIds.length === 0) return { ok: true, output: [] };
      }

      let mq = supabaseAdmin
        .from("ai_admin_messages")
        .select("id, role, content, created_at, conversation_id")
        .ilike("content", `%${escapeLikePattern(query)}%`)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (ownIds.length > 0) mq = mq.in("conversation_id", ownIds);
      const { data, error } = await mq;
      if (error) return { ok: false, output: null, error: error.message };
      const rows = data ?? [];
      const needle = query.toLowerCase();
      return {
        ok: true,
        output: rows.map((m) => {
          const content = String(m.content ?? "");
          const at = content.toLowerCase().indexOf(needle);
          const from = at < 0 ? 0 : Math.max(0, at - 120);
          return {
            conversation_id: m.conversation_id,
            conversation_title: titles.get(m.conversation_id) ?? null,
            role: m.role,
            created_at: m.created_at,
            snippet: (from > 0 ? "…" : "") + content.slice(from, from + 320),
          };
        }),
      };
    }

    if (call.name === "list_admin_pages") {
      const { allAdminNavItems } = await import("@/lib/admin-nav");
      return {
        ok: true,
        output: allAdminNavItems.map((i) => ({
          path: i.to,
          label: i.label,
          section: i.sectionLabel,
          description: i.description,
        })),
      };
    }

    if (call.name === "execute_sql") {
      if (!opts.enableDbRead && !opts.enableDbWrite)
        return { ok: false, output: null, error: "Dostęp do bazy wyłączony." };
      const sql = String(call.input.sql ?? "");
      if (!sql.trim()) return { ok: false, output: null, error: "Puste zapytanie." };
      if (FORBIDDEN_SQL.test(sql))
        return {
          ok: false,
          output: null,
          error: "Zablokowane: operacje na rolach / ustawieniach systemu.",
        };
      const { data, error } = await supabaseAdmin.rpc(
        "exec_admin_any" as never,
        { _sql: sql } as never,
      );
      if (error) return { ok: false, output: null, error: `DB: ${error.message}` };
      return { ok: true, output: data };
    }

    return { ok: false, output: null, error: `Nieznane narzędzie: ${call.name}` };
  } catch (e) {
    return { ok: false, output: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export type AnthropicMessage = {
  role: "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
        | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
        | {
            type: "image";
            source: { type: "base64"; media_type: string; data: string };
          }
        | {
            type: "document";
            source: { type: "base64"; media_type: "application/pdf"; data: string };
            title?: string;
          }
      >;
};

/**
 * Doklejane do promptu z bazy — reguły wynikające z tego, JAK bot jest osadzony
 * (czat w panelu, markdown, linki nawigujące w aplikacji). Prompt merytoryczny
 * administrator edytuje w ustawieniach asystenta, ta część jest stała.
 */
const RUNTIME_SYSTEM_SUFFIX = `
--- KONTEKST URUCHOMIENIA ---
Działasz jako tekstowy asystent wewnątrz panelu /admin aplikacji (czat na pulpicie i pływający na każdej podstronie). Rozmawia z Tobą administrator.
Zasady odpowiedzi:
- Odpowiadaj po polsku, zwięźle. Formatuj markdownem (listy, tabele) — jest renderowany.
- Gdy kierujesz administratora do miejsca w panelu, podaj link markdown ze ścieżką aplikacji, np. [Klienci](/admin/klienci) — kliknięcie nawiguje bez przeładowania. Ścieżki potwierdzaj narzędziem list_admin_pages, nie wymyślaj ich.
- Zanim odpytasz nieznaną tabelę, sprawdź jej kolumny narzędziem describe_table.
- Zmiany w danych i plikach wykonuj po jasnym poleceniu; najpierw krótko napisz, co zmienisz i na ilu wierszach. Nieodwracalne operacje (DELETE/DROP bez WHERE, kasowanie plików) potwierdzaj zawsze.
- Po wykonaniu zmiany napisz konkretnie, co się stało (np. „zaktualizowano 3 wiersze w loan_applications”).
- Gdy narzędzie zwróci błąd, pokaż jego treść i zaproponuj następny krok — nie udawaj, że operacja się udała.
Pamięć i kontekst:
- Blok „PAMIĘĆ DŁUGOTRWAŁA" w tym prompcie to wiedza z poprzednich rozmów — traktuj ją jak ustalenia administratora i stosuj bez pytania. Jeśli coś w niej jest sprzeczne z tym, co administrator mówi teraz, wierz temu, co mówi teraz, i popraw wpis ("remember" z tym samym tytułem albo "forget").
- Gdy administrator tłumaczy, jak chce pracować, jak przebiega proces w firmie, co znaczy używana przez niego nazwa albo mówi „zapamiętaj" — zapisz to narzędziem "remember". Rób to z własnej inicjatywy, krótko potwierdzając w odpowiedzi („zapamiętałem: …"). Nie zapisuj rzeczy jednorazowych ani danych, które można odpytać z bazy.
- Gdy administrator odwołuje się do wcześniejszych rozmów, użyj "search_conversations" (szuka po wszystkich wątkach) lub "recall_memory".
- Wszystkie rozmowy są zapisywane; jeśli administrator pyta „o czym rozmawialiśmy", szukaj zamiast zgadywać.`;

export async function callAnthropic(args: {
  model: string;
  system: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  temperature: number;
}): Promise<{
  stop_reason: string;
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >;
  usage: { input_tokens: number; output_tokens: number };
}> {
  return (await postAnthropic({
    model: args.model,
    system: `${args.system}\n${RUNTIME_SYSTEM_SUFFIX}`,
    messages: args.messages,
    max_tokens: args.max_tokens,
    temperature: args.temperature,
    tools: ANTHROPIC_TOOLS,
  })) as never;
}

async function postAnthropic(body: Record<string, unknown>): Promise<unknown> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t}`);
  }
  return await res.json();
}

/** Model destylacji — tani, bez narzędzi; działa w tle po każdej turze. */
const DISTILL_MODEL = "claude-haiku-4-5";

const DISTILL_SYSTEM = `Jesteś modułem pamięci asystenta administratora aplikacji Finance You (pożyczki pod nieruchomość, inwestowanie w wierzytelności).
Dostajesz fragment rozmowy administratora z asystentem oraz listę tytułów już zapisanych wpisów pamięci.
Twoje zadanie: wyciągnąć z rozmowy TRWAŁĄ wiedzę, która przyda się w każdej przyszłej rozmowie — czyli jak administrator pracuje, jak w firmie przebiegają procesy, co znaczą używane przez niego nazwy i na czym aktualnie pracuje.

Zasady:
- Zapisuj tylko rzeczy trwałe. NIE zapisuj: wyników zapytań, liczb, które zmienią się jutro, jednorazowych poleceń, treści, które w każdej chwili można odpytać z bazy.
- Jeśli rozmowa uzupełnia albo koryguje istniejący wpis, użyj DOKŁADNIE jego tytułu — zostanie nadpisany.
- Tytuł: max 120 znaków, rzeczownikowy, jednoznaczny (np. "Format raportów tygodniowych", "Proces: kwalifikacja leada z kalkulatora").
- Treść: 1–4 zdania, konkretnie, bez lania wody.
- Rodzaje: preferencja (jak mam pracować), proces (jak przebiega czynność), fakt (trwały fakt o firmie/danych), slownik (nazwa własna, skrót), projekt (na czym teraz pracujemy).
- weight: 0 domyślnie, 10–30 dla rzeczy powtarzalnych i ważnych, 50+ tylko dla twardych zasad pracy.
- Jeśli rozmowa nie wniosła nic trwałego, zwróć puste "memories".
- "summary": zwięzłe streszczenie CAŁEJ rozmowy (max 900 znaków) — do przywołania kontekstu bez czytania historii.
- "title": tytuł wątku, max 60 znaków.

Odpowiadasz WYŁĄCZNIE surowym JSON-em, bez komentarzy i bez bloków kodu:
{"title":"…","summary":"…","memories":[{"kind":"preferencja","title":"…","content":"…","weight":0}]}`;

function parseJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Destylacja rozmowy: streszczenie wątku + wpisy do pamięci długotrwałej.
 * Wołana po zakończonej turze (osobne wywołanie z klienta, żeby nie wydłużać
 * odpowiedzi czatu). Idempotentna: pracuje tylko na wiadomościach, które
 * pojawiły się od ostatniej destylacji.
 */
export async function distillConversation(args: {
  conversationId: string;
  userId: string;
}): Promise<{
  ok: boolean;
  reason?: string;
  saved?: Array<{ title: string; action: string }>;
  summarized?: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: conv, error: cErr } = await supabaseAdmin
    .from("ai_admin_conversations")
    .select("id, title, summary, summarized_message_count")
    .eq("id", args.conversationId)
    // Destylujemy tylko własne wątki — supabaseAdmin omija RLS, więc filtr tutaj.
    .eq("user_id", args.userId)
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  if (!conv) return { ok: false, reason: "Rozmowa nie istnieje" };

  const { data: msgs, error: mErr } = await supabaseAdmin
    .from("ai_admin_messages")
    .select("role, content, created_at")
    .eq("conversation_id", args.conversationId)
    .order("created_at", { ascending: true });
  if (mErr) throw new Error(mErr.message);

  const all = msgs ?? [];
  // Wiadomości narzędziowe pomijamy — ich treść to surowe dane, nie wiedza.
  const relevant = all.filter((m) => m.role !== "tool" && String(m.content ?? "").trim());
  if (relevant.length === 0) return { ok: false, reason: "Brak treści do destylacji" };
  if (all.length <= conv.summarized_message_count) return { ok: false, reason: "Bez nowych zmian" };

  const transcript = relevant
    .slice(-40)
    .map((m) => `${m.role === "user" ? "ADMIN" : "ASYSTENT"}: ${String(m.content).slice(0, 2000)}`)
    .join("\n\n");

  const { data: known } = await supabaseAdmin
    .from("ai_admin_memory")
    .select("title")
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(200);
  const titles = (known ?? []).map((k) => `- ${k.title}`).join("\n");
  const knownTitles = titles || "(pamięć jest pusta)";

  const userText = `ISTNIEJĄCE WPISY PAMIĘCI (tytuły):\n${knownTitles}\n\nDOTYCHCZASOWE STRESZCZENIE WĄTKU:\n${
    conv.summary ?? "(brak)"
  }\n\nFRAGMENT ROZMOWY:\n${transcript}`;

  const raw = (await postAnthropic({
    model: DISTILL_MODEL,
    system: DISTILL_SYSTEM,
    messages: [{ role: "user", content: userText }],
    max_tokens: 2000,
    temperature: 0,
  })) as { content?: Array<{ type: string; text?: string }> };

  const text = (raw.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
  const parsed = parseJsonObject(text);
  if (!parsed) return { ok: false, reason: "Nie udało się sparsować odpowiedzi destylacji" };

  const saved: Array<{ title: string; action: string }> = [];
  const memories = Array.isArray(parsed.memories) ? parsed.memories.slice(0, 8) : [];
  for (const entry of memories) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const title = String(e.title ?? "").trim().slice(0, 120);
    const content = String(e.content ?? "").trim().slice(0, 2000);
    const kind = MEMORY_KINDS.includes(String(e.kind) as MemoryKind) ? String(e.kind) : "fakt";
    if (!title || !content) continue;
    try {
      const r = await upsertMemoryEntry({
        kind,
        title,
        content,
        weight: Math.max(0, Math.min(100, Number(e.weight ?? 0) || 0)),
        userId: args.userId,
        conversationId: args.conversationId,
        allowRevive: false,
      });
      saved.push({ title, action: r.action });
    } catch {
      // Jeden nieudany wpis nie może przerwać destylacji pozostałych.
    }
  }

  const summary = String(parsed.summary ?? "").trim().slice(0, 2000);
  const newTitle = String(parsed.title ?? "").trim().slice(0, 60);
  await supabaseAdmin
    .from("ai_admin_conversations")
    .update({
      ...(summary ? { summary } : {}),
      ...(newTitle ? { title: newTitle } : {}),
      summarized_message_count: all.length,
      summarized_at: new Date().toISOString(),
    })
    .eq("id", args.conversationId);

  return { ok: true, saved, summarized: all.length };
}
