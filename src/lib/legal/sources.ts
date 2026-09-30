/**
 * Odczyt treści poprzednich wersji dokumentów pakietu inwestora z migracji
 * SQL (jedyne miejsce w repozytorium, gdzie te teksty są zapisane).
 * Używane przez skrypt budujący pakiet v7 i testy — tylko po stronie Node.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface LegalSourceDoc {
  code: string;
  package_id: string;
  version: string;
  title: string;
  sha256: string;
  content_text: string;
  docx_base64: string;
  docx_filename: string;
}

/** Tokenizuje literały SQL w apostrofach ('' = apostrof w treści), pomija komentarze --. */
export function sqlStringLiterals(sql: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    if (ch === "'") {
      let j = i + 1;
      let buf = "";
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            buf += "'";
            j += 2;
            continue;
          }
          break;
        }
        buf += sql[j];
        j += 1;
      }
      out.push(buf);
      i = j + 1;
    } else if (ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl < 0 ? n : nl + 1;
    } else {
      i += 1;
    }
  }
  return out;
}

/** Wyciąga wiersz `legal_documents` o danym kodzie z pliku migracji. */
export function extractLegalDoc(sqlPath: string, code: string): LegalSourceDoc {
  const strs = sqlStringLiterals(readFileSync(sqlPath, "utf8"));
  for (let k = 0; k + 7 < strs.length; k += 1) {
    if (strs[k] === code && strs[k + 1].startsWith("FY-LEGAL")) {
      return {
        code,
        package_id: strs[k + 1],
        version: strs[k + 2],
        title: strs[k + 3],
        sha256: strs[k + 4],
        content_text: strs[k + 5],
        docx_base64: strs[k + 6],
        docx_filename: strs[k + 7],
      };
    }
  }
  throw new Error(`Nie znaleziono dokumentu ${code} w ${sqlPath}`);
}

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
export const SOURCE_MIGRATIONS = {
  umowa_ramowa: join(MIGRATIONS, "20260921130000_umowa_ramowa_v6_oplaty_inwestora.sql"),
  nda: join(MIGRATIONS, "20260904120000_investor_legal_pack.sql"),
  rodo: join(MIGRATIONS, "20260904120000_investor_legal_pack.sql"),
} as const;

export function readLegalSources(): Record<"umowa_ramowa" | "nda" | "rodo", LegalSourceDoc> {
  return {
    umowa_ramowa: extractLegalDoc(SOURCE_MIGRATIONS.umowa_ramowa, "umowa_ramowa"),
    nda: extractLegalDoc(SOURCE_MIGRATIONS.nda, "nda"),
    rodo: extractLegalDoc(SOURCE_MIGRATIONS.rodo, "rodo"),
  };
}
