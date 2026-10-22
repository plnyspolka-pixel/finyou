// PDF lead magnetu „wzór umowy pożyczki” — prezentacja jak we wzorcu
// właściciela: nagłówek z marką, znak wodny WZÓR, umowa z silnika klauzul
// na przykładowych stronach, a załączniki 1–4 i wniosek jako strony-zajawki
// (układ prawdziwej treści narysowany paskami + plakietka „Dostępny w pełnym
// komplecie dokumentów”). Skład: ReportWriter w serifie (jak .docx umowy),
// jedna numeracja stron. Czysty JS — serwer i testy.
import { COMPANY_DATA } from "@/lib/company";
import type { Blok } from "@/lib/contract-engine/umowa-docx";
import { LIBERATION_SERIF } from "@/lib/legal/legal-fonts";
import { ReportWriter, type ReportFonts } from "@/lib/pdf/report-writer";
import { CATALOG_VERSION, catalogFooterLines, type LeadMagnetBlueprint } from "./catalog";
import { renderBlock } from "./pdf";
import { ZALACZNIKI_OPIS, wzorCzesciPakietu, wzorUmowy, type CzescPakietu } from "./wzor-umowy";

export const WZOR_BADGE_SUBTITLE = "Dostępny w pełnym komplecie dokumentów · financeyou.pl";
export const WZOR_BRAND = "Finance You · Wzór umowy pożyczki";

const tekstRunow = (b: Extract<Blok, { t: "akapit" }>) => b.runs.map((r) => r.tekst).join("");
const tekstKomorki = (k: { tekst: string | Array<{ tekst: string }> }) =>
  typeof k.tekst === "string" ? k.tekst : k.tekst.map((r) => r.tekst).join("");

/** Blok umowy (silnik) → ReportWriter: tytuły na środku, ustępy z wysuniętą numeracją. */
function rysujBlokUmowy(w: ReportWriter, b: Blok): void {
  switch (b.t) {
    case "tytul":
      if (b.nowaStrona) w.pageBreak();
      w.space(8);
      w.paragraph(b.tekst, { size: 14, bold: true, align: "center", after: 2 });
      return;
    case "podtytul":
      w.paragraph(b.tekst, { size: 11, bold: true, align: "center", after: 4 });
      return;
    case "naglowek":
      w.space(6);
      w.paragraph(b.tekst, { size: 10, bold: true, after: 3 });
      return;
    case "akapit": {
      const text = tekstRunow(b);
      const common = { size: 9.4, lineHeight: 1.36, after: 2.5 } as const;
      if (b.wciecie === "ustep") {
        w.paragraph(text, { ...common, label: b.etykieta ?? "", labelWidth: 18 });
      } else if (b.wciecie === "podpunkt") {
        w.paragraph(text, { ...common, indent: 18, label: b.etykieta ?? "–", labelWidth: 16 });
      } else if (b.wciecie === "lista") {
        w.paragraph(text, { ...common, indent: 8, label: b.etykieta ?? "–", labelWidth: 12 });
      } else {
        w.paragraph(text, { ...common, align: b.align === "center" ? "center" : "left" });
      }
      return;
    }
    case "tabela": {
      const [pierwszy, ...reszta] = b.wiersze;
      const naglowek = pierwszy?.naglowek ? pierwszy : null;
      const wiersze = naglowek ? reszta : b.wiersze;
      const columns = b.szerokosci.map((width, i) => ({
        label: naglowek ? tekstKomorki(naglowek.komorki[i] ?? { tekst: "" }) : "",
        width,
        align: wiersze[0]?.komorki[i]?.align === "right" ? ("right" as const) : ("left" as const),
      }));
      w.table(
        columns,
        wiersze.map((wi) => wi.komorki.map((k) => tekstKomorki(k))),
        { size: 8.4 },
      );
      return;
    }
    case "podpisy":
      w.signatures(
        b.osoby.map((o) => ({ rola: o.rola, nazwa: o.nazwa ?? o.wImieniu?.join(", ") ?? null })),
        { size: 8.8 },
      );
      return;
  }
}

/** Bloki części pakietu → elementy strony-zajawki (paski zamiast tekstu). */
function elementyZajawki(bloki: Blok[]) {
  const out: Array<{
    type: "title" | "subtitle" | "paragraph" | "row";
    text?: string;
    cells?: string[];
    indent?: number;
  }> = [];
  for (const b of bloki) {
    if (out.length >= 80) break;
    switch (b.t) {
      case "tytul":
        out.push({ type: "title", text: b.tekst });
        break;
      case "podtytul":
      case "naglowek":
        out.push({ type: "subtitle", text: b.tekst });
        break;
      case "akapit":
        out.push({ type: "paragraph", text: tekstRunow(b), indent: b.wciecie ? 14 : 0 });
        break;
      case "tabela":
        for (const wi of b.wiersze) out.push({ type: "row", cells: wi.komorki.map(tekstKomorki) });
        break;
      case "podpisy":
        break;
    }
  }
  return out;
}

function stronaPakietu(w: ReportWriter, m: LeadMagnetBlueprint, czesci: CzescPakietu[]): void {
  w.pageBreak();
  w.heading("Załączniki i wniosek – w pakiecie dokumentów");
  w.paragraph(
    "Strony oznaczone plakietką to zajawki: układ prawdziwych dokumentów bez treści. Harmonogram jest liczony do grosza dla konkretnej kwoty, oprocentowania i terminów, protokół z negocjacji dokumentuje ustalenia konkretnych stron, a tabela opłat, dyspozycja wypłaty i wniosek wynikają z aktualnych parametrów systemu. Wszystkie składa generator umowy w pakiecie dokumentów programu dla inwestorów – razem z umową, w jednym pliku .docx i w wersji PDF do e-podpisu.",
    { size: 9.2, after: 6 },
  );
  w.keyValues(
    czesci.map((c, i) => {
      const nr = i + 1;
      const opis = c.tytul.startsWith("Wniosek")
        ? "Dane firmy i nieruchomości, cel, oświadczenia (aktywna działalność, PEP) – składany razem z umową."
        : (ZALACZNIKI_OPIS[nr] ?? "");
      return [c.tytul, opis] as [string, string];
    }),
    { labelWidth: 170, size: 8.8 },
  );
  w.subheading("Jak otrzymać komplet");
  w.bullets(
    [
      "Program dla inwestorów Finance You: generator umowy składa wniosek, umowę i załączniki 1–4 z tej samej biblioteki klauzul, z harmonogramem liczonym silnikiem (autonaprawa zaokrągleń w racie końcowej) i audytem każdej generacji (SHA-256 treści, wersja biblioteki).",
      "Do tego: raport o inwestycji z analizą księgi wieczystej, harmonogram zaakceptowany przez klienta, obsługa spłat i windykacji, e-podpis dokumentów.",
    ],
    { size: 9 },
  );
  w.heading(m.pdf.closing.heading);
  w.paragraph(m.pdf.closing.text, { size: 9.4, after: 6 });
  w.bullets(
    m.pdf.closing.actions.map((a) => `${a.label}: ${a.url}`),
    { size: 9 },
  );
  w.subheading("Ważne informacje");
  const [risk, ...rest] = catalogFooterLines(m);
  w.note(risk, { tone: "warning" });
  w.paragraph(
    "Treść umowy pochodzi z biblioteki klauzul silnika umów Finance You, z której składane są prawdziwe umowy – nie została napisana przez AI. Okładkę, wprowadzenie i strony-zajawki przygotowano z użyciem AI i zweryfikowano w zespole Finance You. Wzór ma charakter edukacyjny: przed użyciem we własnej transakcji skonsultuj treść z własną kancelarią; każda umowa wymaga dopasowania do stron, nieruchomości i warunków.",
    { size: 7.8, muted: true, after: 2 },
  );
  for (const line of rest) w.paragraph(line, { size: 7.8, muted: true, after: 2 });
}

/** Cały PDF wzoru umowy: okładka → wprowadzenie → umowa → zajawki → pakiet i stopka. */
export async function renderWzorUmowyPdf(
  m: LeadMagnetBlueprint,
  opts: { generatedAt?: Date; fonts?: ReportFonts } = {},
): Promise<Uint8Array> {
  const wz = wzorUmowy();
  const czesci = wzorCzesciPakietu();
  const w = await ReportWriter.create({
    title: m.title,
    subject: `${m.slug} · wersja ${CATALOG_VERSION} · klauzule ${wz.wersjaBiblioteki}`,
    preparedFor: "inwestorów prywatnych",
    brand: WZOR_BRAND,
    footerLeft: `${COMPANY_DATA.legalName} · ${COMPANY_DATA.addressFull} · financeyou.pl · wersja ${CATALOG_VERSION}`,
    watermark: "WZÓR",
    generatedAt: opts.generatedAt,
    fonts: opts.fonts ?? LIBERATION_SERIF,
  });

  w.cover({
    eyebrow: m.pdf.eyebrow,
    title: m.title,
    subtitle: m.pdf.subtitle,
    items: m.benefits,
    itemsLabel: "W środku",
    meta: [
      `${COMPANY_DATA.legalName} · KRS ${COMPANY_DATA.krs} · ${COMPANY_DATA.website}`,
      `Wersja ${CATALOG_VERSION} · biblioteka klauzul ${wz.wersjaBiblioteki} · materiał bezpłatny, do użytku własnego`,
      "Treść umowy z silnika umów Finance You; okładka i opisy przygotowane z użyciem AI i zweryfikowane przez zespół.",
    ],
  });
  for (const s of m.pdf.sections) {
    w.heading(s.heading);
    for (const b of s.blocks) renderBlock(w, b);
  }

  w.pageBreak();
  for (const b of wz.bloki) rysujBlokUmowy(w, b);

  for (const c of czesci) {
    w.teaser({
      badgeTitle: c.tytul,
      badgeSubtitle: WZOR_BADGE_SUBTITLE,
      items: elementyZajawki(c.bloki),
    });
  }

  stronaPakietu(w, m, czesci);
  return w.save();
}

/** Tekst okładki, wprowadzenia i strony pakietu (bez umowy) — do testów fontu. */
export function tekstOpakowania(m: LeadMagnetBlueprint): string {
  const czesci = wzorCzesciPakietu();
  const out: string[] = [m.pdf.eyebrow, m.title, m.pdf.subtitle, ...m.benefits];
  for (const s of m.pdf.sections) {
    out.push(s.heading);
    for (const b of s.blocks) {
      if ("text" in b && typeof b.text === "string") out.push(b.text);
      if ("items" in b && Array.isArray(b.items))
        out.push(...b.items.map((i) => (typeof i === "string" ? i : JSON.stringify(i))));
      if (b.type === "keyValues") out.push(...b.rows.map(([k, v]) => `${k}: ${v}`));
    }
  }
  out.push(
    WZOR_BADGE_SUBTITLE,
    ...czesci.map((c) => c.tytul),
    "Załączniki i wniosek – w pakiecie dokumentów",
  );
  out.push(m.pdf.closing.heading, m.pdf.closing.text, ...catalogFooterLines(m));
  return out.join("\n");
}
