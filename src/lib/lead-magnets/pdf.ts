// Render PDF lead magnetu z katalogu (blueprint → ReportWriter z pdf-lib).
// Czysty JS: działa na serwerze (trasa /pobierz-plik), w podglądzie panelu
// i w testach. Układ z brief 5.4: okładka, sekcje (nagłówki, akapity, listy,
// checklisty, kroki, ramki „Ważne” / „Ryzyko”, tabele, kafelki), strona
// końcowa z następnymi krokami, kontaktem i stopką compliance (ryzyko,
// nadawca z KRS, oznaczenie AI, wersja).
import { COMPANY_DATA } from "@/lib/company";
import { ReportWriter, type ReportFonts } from "@/lib/pdf/report-writer";
import type { FontyPdf } from "@/lib/legal/pdf-z-tekstu";
import {
  CATALOG_VERSION,
  catalogFooterLines,
  type LeadMagnetBlueprint,
  type PdfBlock,
} from "./catalog";

export const PDF_BRAND = "Finance You · Materiał edukacyjny";

export async function renderLeadMagnetPdf(
  m: LeadMagnetBlueprint,
  opts: { generatedAt?: Date; fonts?: ReportFonts; serifFonts?: FontyPdf } = {},
): Promise<Uint8Array> {
  if (m.custom_pdf === "wzor-umowy") {
    // Wzór umowy: treść z silnika klauzul, skład ReportWriter w serifie (jak .docx umowy),
    // znak wodny WZÓR i strony-zajawki załączników.
    const { renderWzorUmowyPdf } = await import("./wzor-umowy-pdf");
    return renderWzorUmowyPdf(m, { generatedAt: opts.generatedAt, fonts: opts.serifFonts });
  }
  const w = await ReportWriter.create({
    title: m.title,
    subject: `${m.slug} · wersja ${CATALOG_VERSION}`,
    preparedFor: m.track === "inwestor" ? "inwestorów prywatnych" : "przedsiębiorców",
    brand: PDF_BRAND,
    generatedAt: opts.generatedAt,
    // Domyślnie Liberation Sans z legal-fonts (Vite `?inline`); skrypt lokalny podaje bajty z dysku.
    fonts: opts.fonts,
  });

  w.cover({
    eyebrow: m.pdf.eyebrow,
    title: m.title,
    subtitle: m.pdf.subtitle,
    items: m.benefits,
    itemsLabel: "W środku",
    meta: [
      `${COMPANY_DATA.legalName} · KRS ${COMPANY_DATA.krs} · ${COMPANY_DATA.website}`,
      `Wersja ${CATALOG_VERSION} · materiał bezpłatny, do użytku własnego`,
      "Przygotowano z użyciem AI i zweryfikowano przez zespół Finance You.",
    ],
  });

  for (const s of m.pdf.sections) {
    w.heading(s.heading);
    for (const b of s.blocks) renderBlock(w, b);
  }

  w.pageBreak();
  w.heading(m.pdf.closing.heading);
  w.paragraph(m.pdf.closing.text, { size: 9.6, after: 6 });
  w.subheading("Następne kroki");
  w.bullets(
    m.pdf.closing.actions.map((a) => `${a.label}: ${a.url}`),
    { size: 9 },
  );
  w.subheading("Kontakt");
  w.keyValues(
    [
      ["Firma", COMPANY_DATA.legalName],
      ["Adres", COMPANY_DATA.addressFull],
      ["Rejestr", `KRS ${COMPANY_DATA.krs} · NIP ${COMPANY_DATA.nip}`],
      ["E-mail", COMPANY_DATA.email],
      ["Telefon", COMPANY_DATA.phone.display],
      ["Strona", COMPANY_DATA.website],
    ],
    { labelWidth: 90, size: 8.8 },
  );
  w.subheading("Ważne informacje");
  const [risk, ...rest] = catalogFooterLines(m);
  w.note(risk, { tone: "warning" });
  for (const line of rest) w.paragraph(line, { size: 7.8, muted: true, after: 2 });
  return w.save();
}

export function renderBlock(w: ReportWriter, b: PdfBlock): void {
  switch (b.type) {
    case "lead":
      w.paragraph(b.text, { size: 9.8, after: 6 });
      return;
    case "p":
      w.paragraph(b.text, { size: 9, after: 4 });
      return;
    case "subheading":
      w.subheading(b.text);
      return;
    case "bullets":
      w.bullets(b.items, { size: 9 });
      return;
    case "checklist":
      w.checklist(b.items, { size: 9 });
      return;
    case "steps":
      w.steps(b.items, { size: 9 });
      return;
    case "important":
      w.note(`Ważne: ${b.text}`, { tone: "info", size: 8.8 });
      return;
    case "risk":
      w.note(`Ryzyko: ${b.text}`, { tone: "warning", size: 8.8 });
      return;
    case "table":
      w.table(b.columns, b.rows, { size: 8.4 });
      return;
    case "keyValues":
      w.keyValues(b.rows, { size: 8.8, labelWidth: 140 });
      return;
    case "highlights":
      w.highlights(b.items);
      return;
  }
}
