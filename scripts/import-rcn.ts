// Import transakcji RCN z publicznego zbioru GML (CC0 deweloperuch/rejestr-cen-nieruchomosci)
// do tabeli `rcn_transactions`. Zastępuje odpytywanie Geoportal WMS na żywo.
//
// PRZYGOTOWANIE DANYCH (jednorazowo, w środowisku z dostępem do repo/danych):
//   git clone https://github.com/deweloperuch/rejestr-cen-nieruchomosci.git
//   # w repo: data/<miasto>/<miasto>_rcn.zip
//
// URUCHOMIENIE:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     bun run scripts/import-rcn.ts --dir /ścieżka/do/rejestr-cen-nieruchomosci/data
//
//   Flagi:
//     --dir <path>   katalog z danymi (podkatalogi miast z .zip lub .gml)  [wymagane]
//     --dry-run      tylko parsuj i wypisz statystyki (bez zapisu do bazy)
//     --limit <n>    ogranicz liczbę wczytanych plików GML (debug)
//
// UWAGA: mapowanie pól GML jest defensywne (patrz src/lib/property-analysis/rcn-gml.ts).
// Zweryfikuj wynik `--dry-run` na realnych plikach i w razie potrzeby dostrój parser.

import { readdirSync, statSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join, basename, extname, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { parseRcnGml, type RcnGmlRecord } from "../src/lib/property-analysis/rcn-gml";

const SOURCE = "deweloperuch/rejestr-cen-nieruchomosci";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const DRY_RUN = process.argv.includes("--dry-run");
const DIR = arg("--dir");
const LIMIT = Number(arg("--limit") ?? "0") || 0;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function cityOf(path: string): string {
  // .../data/<miasto>/plik.gml  → <miasto>
  return (basename(dirname(path)) || "unknown").toLowerCase();
}

// Stabilny hash (djb2) do syntezy external_id, gdy GML nie ma identyfikatora.
function stableId(city: string, r: RcnGmlRecord): string {
  const s = `${city}|${r.lat}|${r.lng}|${r.pricePln}|${r.txDate}|${r.propertyKind}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `${city}-${h.toString(36)}`;
}

interface GmlFile {
  file: string;
  city: string;
}

function collectGmlFiles(root: string): GmlFile[] {
  const all = walk(root);
  const out: GmlFile[] = all
    .filter((p) => extname(p).toLowerCase() === ".gml")
    .map((file) => ({ file, city: cityOf(file) }));

  for (const zip of all.filter((p) => extname(p).toLowerCase() === ".zip")) {
    const city = (basename(dirname(zip)) || basename(zip, ".zip")).toLowerCase();
    const dest = mkdtempSync(join(tmpdir(), "rcn-"));
    try {
      execFileSync("unzip", ["-o", "-q", zip, "-d", dest]);
      for (const g of walk(dest).filter((p) => extname(p).toLowerCase() === ".gml")) {
        out.push({ file: g, city });
      }
    } catch (e: any) {
      console.error(`[import-rcn] nie udało się rozpakować ${zip}: ${e?.message ?? e}`);
    }
  }
  return out;
}

async function main() {
  if (!DIR || !existsSync(DIR)) {
    console.error("Podaj istniejący katalog danych: --dir <ścieżka do .../data>");
    process.exit(1);
  }

  let files = collectGmlFiles(DIR);
  if (LIMIT > 0) files = files.slice(0, LIMIT);
  if (files.length === 0) {
    console.error("Nie znaleziono plików .gml ani .zip w podanym katalogu.");
    process.exit(1);
  }
  console.log(`[import-rcn] plików GML do przetworzenia: ${files.length}`);

  const supabase = DRY_RUN
    ? null
    : (() => {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
          console.error("Brak SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY w środowisku.");
          process.exit(1);
        }
        return createClient(url, key, { auth: { persistSession: false } });
      })();

  let totalParsed = 0;
  let totalUpserted = 0;
  let withPrice = 0;
  const kindCounts: Record<string, number> = {};

  for (const { file, city } of files) {
    let xml: string;
    try {
      xml = readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    const records = parseRcnGml(xml);
    totalParsed += records.length;
    for (const r of records) {
      kindCounts[r.propertyKind] = (kindCounts[r.propertyKind] ?? 0) + 1;
      if (r.pricePln != null) withPrice++;
    }

    if (DRY_RUN || !supabase) continue;

    const rows = records.map((r) => ({
      source: SOURCE,
      city,
      external_id: r.externalId ? `${city}:${r.externalId}` : stableId(city, r),
      property_kind: r.propertyKind,
      lat: r.lat,
      lng: r.lng,
      tx_date: r.txDate,
      price_pln: r.pricePln,
      area_m2: r.areaM2,
      area_ha: r.areaHa,
      price_per_m2: r.pricePerM2 != null ? Math.round(r.pricePerM2) : null,
      price_per_ha: r.pricePerHa != null ? Math.round(r.pricePerHa) : null,
      land_use: r.landUse,
    }));

    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await supabase
        .from("rcn_transactions")
        .upsert(batch, { onConflict: "source,external_id" });
      if (error) console.error(`[import-rcn] upsert ${basename(file)} [${i}]: ${error.message}`);
      else totalUpserted += batch.length;
    }
  }

  console.log(`[import-rcn] sparsowano rekordów: ${totalParsed} (z ceną: ${withPrice})`);
  console.log(`[import-rcn] wg rodzaju:`, kindCounts);
  if (DRY_RUN) console.log("[import-rcn] DRY-RUN — nic nie zapisano.");
  else console.log(`[import-rcn] zapisano/zaktualizowano: ${totalUpserted}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
