/**
 * Buduje Regulamin klienta v2 i Politykę prywatności v2.
 *
 *   npx tsx scripts/legal/build-zgody-v2.ts
 *
 * Wejście: docs/legal/klient/{regulamin-klienta,polityka-prywatnosci}-v1.md
 * Wynik:   docs/legal/klient/*-v2.md oraz
 *          supabase/migrations/20260929156000_etap5_zgody_v2.sql
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  migracjaZgodV2,
  poprawkaCookiesPolitykaV2,
  transformPolitykaV2,
  transformRegulaminV2,
} from "../../src/lib/legal/zgody-v2";

const DIR = join(process.cwd(), "docs", "legal", "klient");
const rd = (f: string) => readFileSync(join(DIR, f), "utf8");

const regulamin = transformRegulaminV2(rd("regulamin-klienta-v1.md"));
const polityka = transformPolitykaV2(rd("polityka-prywatnosci-v1.md"));
writeFileSync(join(DIR, "regulamin-klienta-v2.md"), regulamin, "utf8");
// Plik .md pokazuje aktualną treść (z poprawką cookies); migracja v2 — treść
// z chwili publikacji (poprawka idzie osobną migracją).
writeFileSync(join(DIR, "polityka-prywatnosci-v2.md"), poprawkaCookiesPolitykaV2(polityka), "utf8");
writeFileSync(
  join(process.cwd(), "supabase", "migrations", "20260929156000_etap5_zgody_v2.sql"),
  migracjaZgodV2([
    { kind: "terms", title: "Akceptuję regulamin klienta", content: regulamin },
    { kind: "privacy", title: "Akceptuję politykę prywatności", content: polityka },
  ]),
  "utf8",
);
console.log("regulamin v2:", regulamin.length, "znaków; polityka v2:", polityka.length, "znaków");
