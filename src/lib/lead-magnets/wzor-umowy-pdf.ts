// PDF lead magnetu „wzór umowy pożyczki”: okładka i wprowadzenie z katalogu,
// treść umowy z silnika klauzul (wzor-umowy.ts), strona „Załączniki — w
// pakiecie dokumentów” i zakończenie ze stopką compliance. Skład przez
// pdfZBlokow (Liberation Serif, układ jak w .docx umowy) — jeden dokument,
// jedna numeracja stron. Czysty JS, działa na serwerze i w testach.
import { COMPANY_DATA } from "@/lib/company";
import { INVESTOR_PAGE_URL } from "@/lib/autopilot/profiles";
import type { Blok, Komorka, Run } from "@/lib/contract-engine/umowa-docx";
import { pdfZBlokow, type FontyPdf } from "@/lib/legal/pdf-z-tekstu";
import {
  CATALOG_VERSION,
  catalogFooterLines,
  type LeadMagnetBlueprint,
  type PdfBlock,
  type PdfSection,
} from "./catalog";
import { ZALACZNIKI_OPIS, czesciPakietu, wzorUmowy } from "./wzor-umowy";

const r = (tekst: string, o: Omit<Run, "tekst"> = {}): Run => ({ tekst, ...o });
const akapit = (tekst: string | Run[], o: Partial<Extract<Blok, { t: "akapit" }>> = {}): Blok => ({
  t: "akapit",
  runs: typeof tekst === "string" ? [r(tekst)] : tekst,
  ...o,
});
const lista = (tekst: string | Run[]): Blok => akapit(tekst, { wciecie: "lista", etykieta: "–" });
const kom = (tekst: string | Run[], o: Partial<Komorka> = {}): Komorka => ({ tekst, ...o });

/** Szerokości kolumn w dxa (A4 minus marginesy = 9638). */
const SZER = 9638;
const kolumny = (wagi: number[]): number[] => {
  const suma = wagi.reduce((a, b) => a + b, 0);
  return wagi.map((w) => Math.round((w / suma) * SZER));
};

/** Bloki katalogu (sekcje treści) → bloki dokumentu pdfZBlokow. */
export function blokiZSekcji(sections: PdfSection[]): Blok[] {
  const out: Blok[] = [];
  for (const s of sections) {
    out.push({ t: "naglowek", tekst: s.heading });
    for (const b of s.blocks) out.push(...blokiZBloku(b));
  }
  return out;
}

function blokiZBloku(b: PdfBlock): Blok[] {
  switch (b.type) {
    case "lead":
      return [akapit([r(b.text, { bold: true })])];
    case "p":
      return [akapit(b.text)];
    case "subheading":
      return [akapit([r(b.text, { bold: true })])];
    case "bullets":
    case "checklist":
      return b.items.map((i) => lista(b.type === "checklist" ? `☐ ${i}` : i));
    case "steps":
      return b.items.map((s, i) =>
        akapit([r(`${i + 1}. ${s.title}`, { bold: true }), ...(s.text ? [r(` ${s.text}`)] : [])], {
          wciecie: "ustep",
        }),
      );
    case "important":
      return [akapit([r("Ważne: ", { bold: true }), r(b.text)])];
    case "risk":
      return [akapit([r("Ryzyko: ", { bold: true }), r(b.text)])];
    case "table":
      return [
        {
          t: "tabela",
          szerokosci: kolumny(b.columns.map((c) => c.width)),
          wiersze: [
            { komorki: b.columns.map((c) => kom(c.label, { bold: true })), naglowek: true },
            ...b.rows.map((row) => ({
              komorki: row.map((cell, i) => kom(cell, { align: b.columns[i]?.align ?? "left" })),
            })),
          ],
        },
      ];
    case "keyValues":
      return b.rows.map(([k, v]) => akapit([r(`${k}: `, { bold: true }), r(v)]));
    case "highlights":
      return [akapit(b.items.map((h) => `${h.label}: ${h.value}`).join(" · "))];
  }
}

function okladka(m: LeadMagnetBlueprint, wersjaBiblioteki: string): Blok[] {
  return [
    { t: "tytul", tekst: m.title.toUpperCase() },
    { t: "podtytul", tekst: m.pdf.eyebrow },
    akapit(m.pdf.subtitle, { align: "center" }),
    akapit(
      `${COMPANY_DATA.legalName} · KRS ${COMPANY_DATA.krs} · wersja materiału ${CATALOG_VERSION} · biblioteka klauzul ${wersjaBiblioteki}`,
      { align: "center" },
    ),
  ];
}

function stronaZalacznikow(zalaczniki: Array<{ nr: number; tytul: string }>): Blok[] {
  const wniosek = czesciPakietu().find((c) => c.startsWith("Wniosek")) ?? null;
  const wiersze = [
    {
      komorki: [
        kom("Część", { bold: true }),
        kom("Co zawiera", { bold: true }),
        kom("Gdzie", { bold: true }),
      ],
      naglowek: true,
    },
    ...(wniosek
      ? [
          {
            komorki: [
              kom(wniosek),
              kom(
                "Dane firmy i nieruchomości, cel, oświadczenia (aktywna działalność, PEP) — składany razem z umową.",
              ),
              kom("pakiet dokumentów"),
            ],
          },
        ]
      : []),
    ...zalaczniki.map((z) => ({
      komorki: [
        kom(`Załącznik nr ${z.nr} — ${z.tytul}`),
        kom(ZALACZNIKI_OPIS[z.nr] ?? ""),
        kom("pakiet dokumentów"),
      ],
    })),
  ];
  return [
    { t: "tytul", tekst: "ZAŁĄCZNIKI DO UMOWY", nowaStrona: true },
    { t: "podtytul", tekst: "czego nie ma w tym wzorze i gdzie to jest" },
    akapit(
      "Umowa wymienia cztery załączniki, a komplet do podpisu zaczyna się od wniosku o udzielenie pożyczki. Tych części celowo nie ma w bezpłatnym wzorze: harmonogram jest liczony do grosza dla konkretnej kwoty, oprocentowania i terminów, protokół z negocjacji dokumentuje ustalenia konkretnych stron, a tabela opłat i dyspozycja wypłaty wynikają z aktualnych parametrów systemu. Wszystkie składa generator umowy w pakiecie dokumentów programu dla inwestorów — razem z umową, w jednym pliku .docx i w wersji PDF do e-podpisu.",
    ),
    { t: "tabela", szerokosci: kolumny([3, 5, 1.6]), wiersze },
    { t: "naglowek", tekst: "Jak otrzymać komplet" },
    lista(
      "Program dla inwestorów Finance You: generator umowy składa wniosek, umowę i załączniki 1–4 z tej samej biblioteki klauzul, z harmonogramem liczonym silnikiem (autonaprawa zaokrągleń w racie końcowej) i audytem każdej generacji (SHA-256 treści, wersja biblioteki).",
    ),
    lista(
      "Do tego: raport o inwestycji z analizą księgi wieczystej, harmonogram zaakceptowany przez klienta, obsługa spłat i windykacji, e-podpis dokumentów.",
    ),
    lista(`Szczegóły i warunki dostępu: ${INVESTOR_PAGE_URL}`),
  ];
}

function zakonczenie(m: LeadMagnetBlueprint): Blok[] {
  const [risk, ...rest] = catalogFooterLines(m);
  return [
    { t: "naglowek", tekst: m.pdf.closing.heading },
    akapit(m.pdf.closing.text),
    ...m.pdf.closing.actions.map((a) => lista(`${a.label}: ${a.url}`)),
    { t: "naglowek", tekst: "Ważne informacje" },
    akapit([r("Ryzyko: ", { bold: true }), r(risk)]),
    akapit(
      "Treść umowy pochodzi z biblioteki klauzul silnika umów Finance You, z której składane są prawdziwe umowy — nie została napisana przez AI. Okładkę, wprowadzenie i opis załączników przygotowano z użyciem AI i zweryfikowano w zespole Finance You. Wzór ma charakter edukacyjny: przed użyciem we własnej transakcji skonsultuj treść z własną kancelarią; każda umowa wymaga dopasowania do stron, nieruchomości i warunków.",
    ),
    ...rest.map((line) => akapit(line)),
  ];
}

/** Cały PDF wzoru umowy (okładka → wprowadzenie → umowa → załączniki → zakończenie). */
export async function renderWzorUmowyPdf(
  m: LeadMagnetBlueprint,
  opts: { generatedAt?: Date; fonts?: FontyPdf } = {},
): Promise<Uint8Array> {
  const w = wzorUmowy();
  const umowa = w.bloki.map((b, i) =>
    i === 0 && b.t === "tytul" ? { ...b, nowaStrona: true } : b,
  );
  const bloki: Blok[] = [
    ...okladka(m, w.wersjaBiblioteki),
    ...blokiZSekcji(m.pdf.sections),
    ...umowa,
    ...stronaZalacznikow(w.zalaczniki),
    ...zakonczenie(m),
  ];
  return pdfZBlokow({
    bloki,
    title: m.title,
    version: `${CATALOG_VERSION} · klauzule ${w.wersjaBiblioteki}`,
    date: opts.generatedAt,
    fonts: opts.fonts,
    creator: "Finance You — wzór umowy (materiał edukacyjny)",
  });
}

/** Tekst okładki, wprowadzenia, strony załączników i zakończenia (bez treści umowy) — do testów fontu. */
export function tekstOpakowania(m: LeadMagnetBlueprint): string {
  const w = wzorUmowy();
  const bloki = [
    ...okladka(m, w.wersjaBiblioteki),
    ...blokiZSekcji(m.pdf.sections),
    ...stronaZalacznikow(w.zalaczniki),
    ...zakonczenie(m),
  ];
  const out: string[] = [];
  for (const b of bloki) {
    if (b.t === "akapit") out.push(b.runs.map((x) => x.tekst).join(""));
    else if (b.t === "tabela")
      for (const wi of b.wiersze)
        out.push(
          wi.komorki
            .map((k) =>
              typeof k.tekst === "string" ? k.tekst : k.tekst.map((x) => x.tekst).join(""),
            )
            .join(" | "),
        );
    else if (b.t !== "podpisy") out.push(b.tekst);
  }
  return out.join("\n");
}
