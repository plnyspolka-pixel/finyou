/**
 * Buduje pakiet inwestora v7 (umowa ramowa v7, NDA v6, RODO v5).
 *
 *   npx tsx scripts/legal/build-pakiet-v7.ts
 *
 * Wynik (deterministyczny — ponowne uruchomienie daje te same bajty):
 *   docs/legal/paczka-inwestor-v7/*.docx       — pliki dokumentów
 *   docs/legal/paczka-inwestor-v7/*.txt        — content_text (to, co akceptuje Inwestor)
 *   docs/legal/paczka-inwestor-v7/MANIFEST.sha256 — SHA-256 plików .docx (format sha256sum)
 *   docs/legal/paczka-inwestor-v7/CONTENT.sha256  — SHA-256 content_text = legal_documents.sha256
 *   supabase/migrations/20260930190000_prowizja_od_pozyczkobiorcy.sql — sekcja
 *     „PAKIET v7” (UPDATE treści umowy ramowej v7 i NDA v6) + lustro drizzle 0024.
 * Migracji 20260929155000 (pierwotne wgranie v7) i 20260930140000 (drizzle
 * 0023, Opłata Abonamentowa) już nie zmieniamy — są wgrane na produkcji.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  PAKIET_SEKCJA_KONIEC,
  PAKIET_SEKCJA_START,
  aktualizacjaPakietuV7Sql,
  buildPakietV7,
  wstawSekcje,
} from "../../src/lib/legal/build-v7";

const OUT = join(process.cwd(), "docs", "legal", "paczka-inwestor-v7");
const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260930190000_prowizja_od_pozyczkobiorcy.sql",
);
const MIGRATION_DRIZZLE = join(
  process.cwd(),
  "drizzle",
  "migrations",
  "0024_prowizja_od_pozyczkobiorcy.sql",
);

async function main() {
  const docs = await buildPakietV7();
  mkdirSync(OUT, { recursive: true });
  const manifest: string[] = [];
  const content: string[] = [];
  const readme: string[] = [];
  for (const d of docs.slice().sort((a, b) => a.sort_order - b.sort_order)) {
    writeFileSync(join(OUT, d.docx_filename), d.docx);
    const txt = d.docx_filename.replace(/\.docx$/, ".txt");
    writeFileSync(join(OUT, txt), d.content_text, "utf8");
    manifest.push(`${d.docx_sha256}  ${d.docx_filename}`);
    content.push(`${d.sha256}  ${txt}`);
    readme.push(
      `| ${d.code} | ${d.version} | ${d.docx_filename} | \`${d.sha256}\` | \`${d.docx_sha256}\` |`,
    );
  }
  writeFileSync(join(OUT, "MANIFEST.sha256"), manifest.join("\n") + "\n", "utf8");
  writeFileSync(join(OUT, "CONTENT.sha256"), content.join("\n") + "\n", "utf8");
  writeFileSync(
    join(OUT, "README.md"),
    `# Pakiet inwestora ${docs[0].package_id}

Wygenerowano skryptem \`npx tsx scripts/legal/build-pakiet-v7.ts\` z treści v6/v5/v4
(migracje SQL) przez podmiany w \`src/lib/legal/pakiet-v7.ts\`. Nie edytować ręcznie.

- \`CONTENT.sha256\` — SHA-256 treści (\`content_text\`, UTF-8) = \`legal_documents.sha256\`;
  ta wartość trafia do akceptacji Inwestora (code:version:sha256).
- \`MANIFEST.sha256\` — SHA-256 plików .docx (kontrola: \`sha256sum -c MANIFEST.sha256\`).
- Pakiet wgrała do bazy jako aktywny migracja \`20260929155000\` (aktywację
  zatwierdził właściciel 2026-09-29). 30 września 2026 r., przed pierwszą
  akceptacją, umowa ramowa v7 dostała Opłatę Abonamentową zamiast
  nieodpłatności — nową treść wgrywa migracja \`20260930140000_abonament_inwestora\`
  (UPDATE wiersza v7, \`allows_investor_fees = true\`). Tego samego dnia, nadal przed
  pierwszą akceptacją, „Prowizja Klientowska” w umowie ramowej v7 i NDA v6 dostała nazwę
  „Prowizja od Pożyczkobiorcy” — migracja \`20260930190000_prowizja_od_pozyczkobiorcy\`.
  Wyłączenie: /admin/umowy-inwestorow.

| kod | wersja | plik | SHA-256 treści | SHA-256 .docx |
|---|---|---|---|---|
${readme.join("\n")}
`,
    "utf8",
  );
  const sql = wstawSekcje(
    readFileSync(MIGRATION, "utf8"),
    PAKIET_SEKCJA_START,
    PAKIET_SEKCJA_KONIEC,
    aktualizacjaPakietuV7Sql(docs),
  );
  writeFileSync(MIGRATION, sql, "utf8");
  writeFileSync(MIGRATION_DRIZZLE, sql, "utf8");
  for (const d of docs) {
    console.log(`${d.code} ${d.version}  content ${d.sha256}  docx ${d.docx_sha256}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
