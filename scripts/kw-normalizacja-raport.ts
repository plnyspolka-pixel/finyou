// Raport normalizacji numerów KW w nieruchomościach — PODGLĄD bez zapisu.
//
// Pokazuje, co zmieni migracja 20260924130000_kw_normalizacja_i_legacy_umowy
// (dopełnienie numeru do 8 cyfr: KR1P/610770/2 → KR1P/00610770/2) i które
// numery mają błędną cyfrę kontrolną (do ręcznej weryfikacji — migracja ich
// nie poprawia). Te same funkcje co wejścia platformy: src/lib/kw.ts.
//
// URUCHOMIENIE (klucz z sekretów środowiska, nigdy z repo):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     bun run scripts/kw-normalizacja-raport.ts [--csv raport.csv]

import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { kwCheckDigitError, normalizeKwNumbersInText, validateKwNumber } from "../src/lib/kw";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Ustaw SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

interface Wiersz {
  id: string;
  pole: string;
  przed: string;
  po: string;
  blad: string;
}

const KW_RE = /\b[A-Z]{2}\d[A-Z0-9]\s*\/\s*\d{1,8}\s*\/\s*\d\b/gi;

async function main() {
  const wiersze: Wiersz[] = [];
  const PAGE = 1000;
  for (let od = 0; ; od += PAGE) {
    const { data, error } = await supabase
      .from("properties")
      .select("id, land_register_number, additional_land_register_numbers")
      .range(od, od + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const p of data ?? []) {
      const pola: [string, string | null][] = [
        ["land_register_number", p.land_register_number],
        ...((p.additional_land_register_numbers ?? []) as string[]).map(
          (v, i) => [`additional_land_register_numbers[${i}]`, v] as [string, string],
        ),
      ];
      for (const [pole, przed] of pola) {
        if (!przed || !KW_RE.test(przed)) continue;
        KW_RE.lastIndex = 0;
        const po = normalizeKwNumbersInText(przed) ?? przed;
        const blad = kwCheckDigitError(po) ?? "";
        if (po !== przed || blad) wiersze.push({ id: p.id, pole, przed, po, blad });
      }
    }
    if (!data || data.length < PAGE) break;
  }

  const zmiany = wiersze.filter((w) => w.przed !== w.po);
  const bledne = wiersze.filter((w) => w.blad);
  console.log(`Pola do normalizacji: ${zmiany.length}`);
  console.log(`Pola z błędną cyfrą kontrolną: ${bledne.length}`);
  for (const w of wiersze) {
    console.log(
      `${w.id}  ${w.pole}\n  przed: ${w.przed}\n  po:    ${w.po}${w.blad ? `\n  BŁĄD:  ${w.blad}` : ""}`,
    );
  }

  const csv = arg("--csv");
  if (csv) {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    writeFileSync(
      csv,
      [
        "id,pole,przed,po,blad",
        ...wiersze.map((w) => [w.id, w.pole, w.przed, w.po, w.blad].map(esc).join(",")),
      ].join("\n"),
    );
    console.log(`CSV: ${csv}`);
  }
  // Sanity: przykład ze zlecenia
  const przyklad = validateKwNumber("KR1P/610770/2");
  if (!przyklad.ok || przyklad.value !== "KR1P/00610770/2")
    throw new Error("Normalizacja KW niespójna");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
