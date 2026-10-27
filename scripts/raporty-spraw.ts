// Zanonimizowane raporty spraw (lead magnet „raporty-spraw”) — narzędzie
// lokalne, wynik do przeglądu przez właściciela. NIC nie publikuje.
//
//   bun scripts/raporty-spraw.ts decide <input.json> <katalog>
//      → <katalog>/decyzje.json (automatyczna selekcja zdjęć)
//   python3 scripts/raporty-spraw-zdjecia.py <katalog>
//      → <katalog>/zdjecia/* (bez EXIF, ≤1600 px) + arkusz-kontrolny-zdjec.pdf
//   bun scripts/raporty-spraw.ts render <input.json> <katalog>
//      → <katalog>/Raport-sprawy-FY-R-0X.pdf
//
// input.json: { cases: [{ input: CaseInput, photos: [{ fileName, localPath, ocr }] }] }
// — wyłącznie pola dozwolone (bez właściciela, KW, adresu, dat, nazw
// wierzycieli); ścieżki zdjęć względem katalogu input.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  buildCaseReport,
  decidePhoto,
  type CaseInput,
  type PhotoCandidate,
} from "../src/lib/case-reports/anonymize";
import { renderCaseReportPdf } from "../src/lib/case-reports/render-pdf";
import { icon3dFile } from "../src/components/marketing/icon-3d";

type Input = {
  cases: Array<{
    input: CaseInput;
    photos: Array<PhotoCandidate & { localPath: string | null; unavailable?: string }>;
  }>;
};

const [, , cmd, inputPath, outDir] = process.argv;
if (!cmd || !inputPath || !outDir) {
  console.error("Użycie: bun scripts/raporty-spraw.ts decide|render <input.json> <katalog>");
  process.exit(1);
}
const input = JSON.parse(readFileSync(inputPath, "utf8")) as Input;
const base = dirname(resolve(inputPath));
mkdirSync(outDir, { recursive: true });

if (cmd === "decide") {
  const decisions = input.cases.map((c) => {
    const bigCity = (c.input.cityPopulation ?? 0) > 100_000;
    return {
      ref: c.input.ref,
      photos: c.photos.map((p) => {
        const d = p.unavailable
          ? { accept: false, reason: p.unavailable, interior: null }
          : decidePhoto(p, bigCity);
        return {
          fileName: p.fileName,
          source: p.localPath ? join(base, p.localPath) : null,
          ...d,
        };
      }),
    };
  });
  writeFileSync(join(outDir, "decyzje.json"), JSON.stringify(decisions, null, 2));
  for (const d of decisions)
    console.log(
      `${d.ref}: ${d.photos.filter((p) => p.accept).length}/${d.photos.length} zdjęć przyjętych`,
    );
} else if (cmd === "render") {
  const fontDir = new URL("../src/lib/legal/fonts/", import.meta.url);
  const ttf = (name: string) => new Uint8Array(readFileSync(new URL(name, fontDir)));
  const fonts = {
    regular: ttf("LiberationSans-Regular.ttf"),
    bold: ttf("LiberationSans-Bold.ttf"),
  };
  const decisions = JSON.parse(readFileSync(join(outDir, "decyzje.json"), "utf8")) as Array<{
    ref: string;
    photos: Array<{ fileName: string; accept: boolean; reviewed?: "ok" | "odrzucone" }>;
  }>;
  for (const c of input.cases) {
    const report = buildCaseReport(c.input);
    const iconFile = new URL(
      `../public/marketing/icons-3d/${icon3dFile(report.icon)}`,
      import.meta.url,
    );
    // Do PDF trafiają tylko zdjęcia przyjęte przez automat i niewycofane
    // w ręcznym przeglądzie (pole `reviewed` w decyzje.json).
    const accepted = (decisions.find((d) => d.ref === c.input.ref)?.photos ?? []).filter(
      (p) => p.accept && p.reviewed !== "odrzucone",
    );
    const photosJpg = accepted
      .map((p) => join(outDir, "zdjecia", c.input.ref, p.fileName.replace(/\.\w+$/, ".jpg")))
      .filter((f) => existsSync(f))
      .map((f) => new Uint8Array(readFileSync(f)));
    const bytes = await renderCaseReportPdf(report, {
      iconPng: new Uint8Array(readFileSync(iconFile)),
      photosJpg,
      fonts,
    });
    const file = join(outDir, `Raport-sprawy-${c.input.ref}.pdf`);
    writeFileSync(file, bytes);
    console.log(`${file}  ${(bytes.byteLength / 1024).toFixed(0)} KB, zdjęć: ${photosJpg.length}`);
  }
} else {
  console.error(`Nieznane polecenie: ${cmd}`);
  process.exit(1);
}
