/**
 * Buduje dane dokumentów prawnych 1.0 z plików w docs/legal.
 *
 *   npx tsx scripts/legal/build-dokumenty.ts
 *
 * Wejście: docs/legal/klient/regulamin-klienta.md, polityka-prywatnosci.md,
 *          docs/legal/pakiet-inwestora/*.txt i *.docx
 * Wynik:   docs/legal/pakiet-inwestora/CONTENT.sha256, MANIFEST.sha256 oraz
 *          src/lib/legal/dokumenty-1-0.dane.ts (treść dla narzędzia
 *          apply_legal_documents_1_0, które wgrywa dokumenty do bazy).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PAKIET_PLIKI, sha256Hex, type KodPakietu } from "../../src/lib/legal/dokumenty-1-0";

const ROOT = process.cwd();
const KLIENT = join(ROOT, "docs", "legal", "klient");
const PAKIET = join(ROOT, "docs", "legal", "pakiet-inwestora");
const DANE = join(ROOT, "src", "lib", "legal", "dokumenty-1-0.dane.ts");

const kody = Object.keys(PAKIET_PLIKI) as KodPakietu[];
const pakiet = kody.map((code) => ({
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

const dane = {
  regulamin: readFileSync(join(KLIENT, "regulamin-klienta.md"), "utf8"),
  polityka: readFileSync(join(KLIENT, "polityka-prywatnosci.md"), "utf8"),
  pakiet: Object.fromEntries(
    pakiet.map((d) => [
      d.code,
      { content_text: d.content_text, docx_base64: Buffer.from(d.docx).toString("base64") },
    ]),
  ),
};
writeFileSync(
  DANE,
  `// Plik wygenerowany: npx tsx scripts/legal/build-dokumenty.ts — nie edytować ręcznie.
// Treść dokumentów prawnych 1.0 z docs/legal (tylko po stronie serwera).
/* eslint-disable */
// prettier-ignore
import type { DaneDokumentow } from "./dokumenty-1-0";

// prettier-ignore
export const DANE_DOKUMENTOW_1_0: DaneDokumentow = ${JSON.stringify(dane)};
`,
  "utf8",
);
console.log("dane:", JSON.stringify(dane).length, "znaków");
