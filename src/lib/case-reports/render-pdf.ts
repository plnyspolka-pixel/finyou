// PDF „Raport sprawy FY-R-0X” — jeden szablon w szacie materiałów Finance You
// (ReportWriter: granat + akcent, logo w nagłówku), ikona 3D typu
// nieruchomości na okładce. Treść WYŁĄCZNIE z zanonimizowanego CaseReport.
import { COMPANY_DATA } from "@/lib/company";
import { ReportWriter, type ReportFonts } from "@/lib/pdf/report-writer";
import type { CaseReport } from "./anonymize";

export const CASE_REPORTS_VERSION = "1.0";

export async function renderCaseReportPdf(
  r: CaseReport,
  opts: {
    iconPng?: Uint8Array;
    photosJpg?: Uint8Array[];
    fonts?: ReportFonts;
    generatedAt?: Date;
  } = {},
): Promise<Uint8Array> {
  const w = await ReportWriter.create({
    title: `Raport sprawy ${r.ref}`,
    subject: `Przykładowy raport analizy sprawy · wersja ${CASE_REPORTS_VERSION}`,
    preparedFor: "inwestorów prywatnych",
    brand: "Finance You · Przykładowy raport sprawy",
    // Bez daty w stopce — raport nie zawiera żadnych dat.
    footerLeft: "Przykładowy raport sprawy · dane zanonimizowane",
    generatedAt: opts.generatedAt,
    fonts: opts.fonts,
  });
  const icon = opts.iconPng ? await w.embedPng(opts.iconPng) : undefined;

  w.cover({
    eyebrow: `Raport sprawy ${r.ref} · ocena ${r.grade}`,
    title: r.title,
    subtitle: `${r.verdict}. ${r.why}`,
    items: [
      "Wycena i widełki wartości nieruchomości",
      "LTV i ceny wywołania licytacji",
      "Zbywalność, lokalizacja i ryzyko powodziowe",
      "Obciążenia w księdze wieczystej",
      "Mocne strony, ryzyka i rekomendacja",
    ],
    itemsLabel: "W raporcie",
    meta: [
      `${COMPANY_DATA.legalName} · KRS ${COMPANY_DATA.krs} · ${COMPANY_DATA.website}`,
      "Sprawa prawdziwa, dane zanonimizowane: bez danych osobowych, adresu i numeru księgi wieczystej.",
      "Kwoty zaokrąglone do 5 000 zł. Wycena automatyczna — wskaźnik analityczny, nie operat szacunkowy.",
    ],
    icon,
  });

  w.heading("Ocena i rekomendacja");
  w.gradeScale(r.grade);
  w.highlights([
    { label: "Ocena", value: `${r.grade} · ${r.score}/100`, accent: true },
    { label: "Rekomendacja", value: r.verdict },
  ]);
  w.note(r.why, { tone: r.verdictTone === "positive" ? "info" : "warning", size: 9 });

  w.heading("Nieruchomość i zabezpieczenie");
  w.keyValues(r.facts, { labelWidth: 175, size: 9 });

  if (r.bars.length) {
    w.subheading("Oceny cząstkowe");
    for (const b of r.bars) w.scoreBar(b.label, b.value);
  }

  if (r.strengths.length) {
    w.heading("Mocne strony");
    w.bullets(r.strengths, { size: 9.2 });
  }
  if (r.risks.length) {
    w.heading(r.verdictTone === "negative" ? "Dlaczego nie — ryzyka" : "Ryzyka");
    w.bullets(r.risks, { size: 9.2 });
  }

  if (opts.photosJpg?.length) {
    w.heading("Zdjęcia nieruchomości");
    for (const jpg of opts.photosJpg) {
      await w.image(jpg, { format: "jpg", maxHeight: 230, align: "center" });
    }
  }

  w.heading("Jak czytać ten raport");
  w.paragraph(
    "Tak oceniamy każdą sprawę, zanim trafi do inwestora: najpierw zabezpieczenie i stan prawny, potem płynność wyjścia, na końcu dane klienta. Część spraw odpada — pokazujemy też takie, żeby było widać, dlaczego.",
    { size: 9, after: 6 },
  );
  w.note(
    "Raport ma charakter edukacyjny i nie jest ofertą ani rekomendacją inwestycyjną. Hipoteka ogranicza ryzyko, ale go nie eliminuje. Wyniki historycznych spraw nie gwarantują wyników przyszłych.",
    { tone: "warning", size: 8.4 },
  );
  return w.save();
}
