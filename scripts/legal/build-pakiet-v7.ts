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
 *   supabase/migrations/20260929155000_etap5_pakiet_inwestor_v7.sql
 * Lustro drizzle (drizzle/migrations/0016_…) tworzy się osobno, bajt w bajt.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildPakietV7, migracjaSqlV7 } from "../../src/lib/legal/build-v7";

const OUT = join(process.cwd(), "docs", "legal", "paczka-inwestor-v7");
const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260929155000_etap5_pakiet_inwestor_v7.sql",
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
- Pakiet trafia do bazy jako aktywny (\`active = true\`) — aktywację
  zatwierdził właściciel 2026-09-29. Wyłączenie: /admin/umowy-inwestorow.

| kod | wersja | plik | SHA-256 treści | SHA-256 .docx |
|---|---|---|---|---|
${readme.join("\n")}
`,
    "utf8",
  );
  writeFileSync(MIGRATION, migracjaSqlV7(docs), "utf8");
  for (const d of docs) {
    console.log(`${d.code} ${d.version}  content ${d.sha256}  docx ${d.docx_sha256}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
