// Katalog lead magnetów — narzędzie lokalne:
//   bun scripts/lead-magnets-catalog.ts render [katalog_wyjściowy]  → PDF-y do podglądu
//   bun scripts/lead-magnets-catalog.ts dump                          → JSON wierszy lead_magnets
// Bez bazy: czysta treść z src/lib/lead-magnets/catalog.ts i render z pdf.ts.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CATALOG_VERSION,
  LEAD_MAGNET_CATALOG,
  catalogMagnetRow,
} from "../src/lib/lead-magnets/catalog";
import { renderLeadMagnetPdf } from "../src/lib/lead-magnets/pdf";

const [, , cmd = "render", outDir = "tmp/lead-magnets"] = process.argv;

if (cmd === "dump") {
  const rows = LEAD_MAGNET_CATALOG.map((m) => ({
    ...catalogMagnetRow(m, false),
    keyword: m.keyword,
    stage: m.stage,
    series: m.series,
    next: m.next,
  }));
  console.log(JSON.stringify({ version: CATALOG_VERSION, rows }, null, 2));
} else if (cmd === "render") {
  // Poza Vite import `?inline` nie działa — fonty czytamy z dysku.
  const fontDir = new URL("../src/lib/legal/fonts/", import.meta.url);
  const fonts = {
    regular: new Uint8Array(readFileSync(new URL("LiberationSans-Regular.ttf", fontDir))),
    bold: new Uint8Array(readFileSync(new URL("LiberationSans-Bold.ttf", fontDir))),
  };
  mkdirSync(outDir, { recursive: true });
  for (const m of LEAD_MAGNET_CATALOG) {
    const bytes = await renderLeadMagnetPdf(m, { fonts });
    const file = join(outDir, m.file_name);
    writeFileSync(file, bytes);
    console.log(`${file}  ${(bytes.byteLength / 1024).toFixed(0)} KB`);
  }
} else {
  console.error("Użycie: bun scripts/lead-magnets-catalog.ts render [katalog] | dump");
  process.exit(1);
}
