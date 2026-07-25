/**
 * Serializacja wyrenderowanego dokumentu silnika (`Dokument`) do pliku .docx.
 *
 * Zamiast wypełniać placeholdery w gotowym wzorze Worda, składamy dokument
 * WprocessingML deterministycznie z ustępów zwróconych przez `renderuj()`. To
 * domyka punkt 3.4: treść umowy pochodzi wprost z biblioteki klauzul (renumeracja
 * §/ustępów, klauzule warunkowe), a nie z ręcznego szablonu z lukami.
 *
 * Harmonogram spłat trafia jako prawdziwa TABELA Worda (Załącznik nr 1) —
 * reużywamy `buildScheduleTableXml` z generatora windykacyjnego.
 *
 * Funkcje budujące XML są czyste; pakowanie do .docx (`buildUmowaDocx`) korzysta
 * z `pizzip` (dostępny również po stronie serwera).
 */
import type { Dokument, Strona, Sekcja } from "./renderer";
import { buildScheduleTableXml, type ScheduleRow } from "../schedule-table-docx";
import { parseKwota } from "./schedule";

function xmlEsc(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── akapity WordprocessingML ───────────────────────────────────

interface RunOpts {
  bold?: boolean;
  italic?: boolean;
  size?: number; // pół-punkty (half-points), np. 28 = 14 pt
}

function run(text: string, o: RunOpts = {}): string {
  const rpr: string[] = [];
  if (o.bold) rpr.push("<w:b/>");
  if (o.italic) rpr.push("<w:i/>");
  if (o.size) rpr.push(`<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>`);
  const rprXml = rpr.length ? `<w:rPr>${rpr.join("")}</w:rPr>` : "";
  return `<w:r>${rprXml}<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`;
}

interface ParaOpts {
  align?: "center" | "both" | "left";
  bold?: boolean;
  size?: number;
  spaceBefore?: number; // twips
  spaceAfter?: number;
  indentLeft?: number;
  hanging?: number;
}

function para(runs: string, o: ParaOpts = {}): string {
  const ppr: string[] = [];
  if (o.align) ppr.push(`<w:jc w:val="${o.align}"/>`);
  if (o.indentLeft || o.hanging) {
    const left = o.indentLeft ? ` w:left="${o.indentLeft}"` : "";
    const hang = o.hanging ? ` w:hanging="${o.hanging}"` : "";
    ppr.push(`<w:ind${left}${hang}/>`);
  }
  if (o.spaceBefore != null || o.spaceAfter != null) {
    const b = o.spaceBefore != null ? ` w:before="${o.spaceBefore}"` : "";
    const a = o.spaceAfter != null ? ` w:after="${o.spaceAfter}"` : "";
    ppr.push(`<w:spacing${b}${a}/>`);
  }
  const pprXml = ppr.length ? `<w:pPr>${ppr.join("")}</w:pPr>` : "";
  return `<w:p>${pprXml}${runs}</w:p>`;
}

/** Pusty akapit — odstęp. */
function pusty(): string {
  return "<w:p/>";
}

// ── serializacja treści ────────────────────────────────────────

const MIANOWNIK: Record<string, string> = {
  Pożyczkobiorcą: "Pożyczkobiorca",
  Poręczycielem: "Poręczyciel",
  "Właścicielem nieruchomości": "Właściciel nieruchomości",
  Pożyczkodawcą: "Pożyczkodawca",
};

function etykietaPodpisu(s: Strona): { rola: string; nazwa: string } {
  let rola = MIANOWNIK[s.rola] ?? s.rola;
  if (s.grupa === "pozyczkobiorca" && rola.endsWith("ami")) rola = "Pożyczkobiorca";
  const nazwa = s.opis.split(",")[0].trim();
  return { rola, nazwa };
}

function sekcjaParas(sek: Sekcja): string {
  const out: string[] = [];
  out.push(
    para(run(`§ ${sek.numer} – ${sek.tytul}`, { bold: true, size: 24 }), {
      align: "left",
      spaceBefore: 240,
      spaceAfter: 120,
    }),
  );
  for (const u of sek.ustepy) {
    if (u.poziom === "ustep") {
      out.push(
        para(run(`${u.numer}. `, { bold: true }) + run(u.tekst), {
          align: "both",
          spaceAfter: 80,
          indentLeft: 360,
          hanging: 360,
        }),
      );
    } else {
      out.push(
        para(run(`${u.litera ?? "-"} `) + run(u.tekst), {
          align: "both",
          spaceAfter: 60,
          indentLeft: 720,
          hanging: 360,
        }),
      );
    }
  }
  return out.join("");
}

/**
 * Buduje body dokumentu (bez tabeli harmonogramu w tym miejscu — tabela idzie po
 * ZAŁĄCZNIKACH). Przyjmuje wiersze harmonogramu jawnie, bo `Dokument` ich nie niesie.
 */
export function buildUmowaDocumentXml(doc: Dokument, harmonogram: ScheduleRow[]): string {
  const body: string[] = [];

  // Tytuł
  body.push(para(run("UMOWA POŻYCZKI", { bold: true, size: 32 }), { align: "center", spaceAfter: 120 }));
  if (doc.meta?.numer_umowy)
    body.push(para(run(`nr ${doc.meta.numer_umowy}`, { size: 24 }), { align: "center", spaceAfter: 120 }));

  // Komparycja
  const k = doc.komparycja;
  body.push(para(run(`zawarta dnia ${k.data} w ${k.miejscowosc} pomiędzy:`), { align: "both", spaceAfter: 120 }));
  k.strony.forEach((s, i) => {
    const kon = i < k.strony.length - 1 ? "," : ".";
    body.push(
      para(run(`${s.opis}, zwanym/ą dalej „${s.rola}"${kon}`), { align: "both", spaceAfter: 120 }),
    );
  });

  // Sekcje
  for (const sek of doc.sekcje) body.push(sekcjaParas(sek));

  // Załączniki
  body.push(para(run("ZAŁĄCZNIKI", { bold: true }), { align: "left", spaceBefore: 240, spaceAfter: 120 }));
  for (const z of doc.zalaczniki)
    body.push(para(run(`Załącznik nr ${z.nr} — ${z.tytul}`), { indentLeft: 360, spaceAfter: 40 }));

  // Podpisy
  body.push(para(run("PODPISY", { bold: true }), { align: "left", spaceBefore: 360, spaceAfter: 240 }));
  for (const s of k.strony) {
    const { rola, nazwa } = etykietaPodpisu(s);
    body.push(para(run("........................................................"), { spaceAfter: 20 }));
    body.push(para(run(`${rola}${s.grupa ? " — " + nazwa : ""}`, { bold: true }), { spaceAfter: 200 }));
  }

  // Załącznik nr 1 — harmonogram jako tabela
  if (harmonogram.length) {
    body.push(
      para(run("Załącznik nr 1 — Harmonogram spłat", { bold: true, size: 24 }), {
        align: "left",
        spaceBefore: 360,
        spaceAfter: 120,
      }),
    );
    body.push(buildScheduleTableXml(harmonogram));
  }

  const sectPr =
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body.join("")}${sectPr}</w:body></w:document>`
  );
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  "</Types>";

const RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>";

/**
 * Pakuje wyrenderowany dokument do bajtów .docx.
 * @param doc wynik `renderuj()`
 * @param harmonogram wiersze harmonogramu (z `warunki.harmonogram.raty` lub payloadu)
 */
export async function buildUmowaDocx(doc: Dokument, harmonogram: ScheduleRow[]): Promise<Uint8Array> {
  const { default: PizZip } = await import("pizzip");
  const zip = new PizZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file("word/document.xml", buildUmowaDocumentXml(doc, harmonogram));
  return zip.generate({ type: "uint8array", compression: "DEFLATE" });
}

/** Pomocnik: wyciąga wiersze harmonogramu z danych umowy (`warunki.harmonogram.raty`). */
export function harmonogramZUmowy(umowa: any): ScheduleRow[] {
  const raty: any[] = umowa?.warunki?.harmonogram?.raty ?? [];
  return raty.map((r: any) => ({
    idx: Number(r.nr) || 0,
    date: String(r.termin ?? ""),
    rata: parseKwota(r.rata_razem),
    kap: parseKwota(r.kapital),
    ods: parseKwota(r.odsetki),
    saldo: parseKwota(r.saldo),
  }));
}
