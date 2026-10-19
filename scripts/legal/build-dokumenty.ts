/**
 * Buduje migrację dokumentów prawnych w wersji 1.0 z plików w docs/legal.
 *
 *   npx tsx scripts/legal/build-dokumenty.ts
 *
 * Wejście: docs/legal/klient/regulamin-klienta.md, polityka-prywatnosci.md,
 *          docs/legal/pakiet-inwestora/*.txt i *.docx
 * Wynik:   docs/legal/pakiet-inwestora/CONTENT.sha256, MANIFEST.sha256 oraz
 *          migracja 20261019120000 (+ lustro drizzle 0034).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  PAKIET_PLIKI,
  migracjaDokumentow,
  sha256Hex,
  type DokumentPakietu,
  type KodPakietu,
} from "../../src/lib/legal/dokumenty-1-0";

const ROOT = process.cwd();
const KLIENT = join(ROOT, "docs", "legal", "klient");
const PAKIET = join(ROOT, "docs", "legal", "pakiet-inwestora");
const MIGRATION = join(ROOT, "supabase", "migrations", "20261019120000_dokumenty_prawne_1_0.sql");
const MIGRATION_DRIZZLE = join(ROOT, "drizzle", "migrations", "0034_dokumenty_prawne_1_0.sql");

const pakiet: DokumentPakietu[] = (Object.keys(PAKIET_PLIKI) as KodPakietu[]).map((code) => ({
  code,
  content_text: readFileSync(join(PAKIET, `${PAKIET_PLIKI[code]}.txt`), "utf8"),
  docx: readFileSync(join(PAKIET, `${PAKIET_PLIKI[code]}.docx`)),
}));
writeFileSync(
  join(PAKIET, "CONTENT.sha256"),
  pakiet.map((d) => `${sha256Hex(d.content_text)}  ${PAKIET_PLIKI[d.code]}.txt`).join("\n") + "\n",
);
writeFileSync(
  join(PAKIET, "MANIFEST.sha256"),
  pakiet.map((d) => `${sha256Hex(d.docx)}  ${PAKIET_PLIKI[d.code]}.docx`).join("\n") + "\n",
);
const sql = migracjaDokumentow(
  readFileSync(join(KLIENT, "regulamin-klienta.md"), "utf8"),
  readFileSync(join(KLIENT, "polityka-prywatnosci.md"), "utf8"),
  pakiet,
);
writeFileSync(MIGRATION, sql, "utf8");
writeFileSync(MIGRATION_DRIZZLE, sql, "utf8");
console.log("migracja:", sql.length, "znaków");
