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
- Gdy narzędzie zwróci błąd, pokaż jego treść i zaproponuj następny krok — nie udawaj, że operacja się udała.`;

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
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      system: `${args.system}\n${RUNTIME_SYSTEM_SUFFIX}`,
      messages: args.messages,
      max_tokens: args.max_tokens,
      temperature: args.temperature,
      tools: ANTHROPIC_TOOLS,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t}`);
  }
  return (await res.json()) as never;
}
