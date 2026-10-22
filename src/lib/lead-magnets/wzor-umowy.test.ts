// Wzór umowy pożyczki (lead magnet UMOWA): powstaje z silnika klauzul bez
// błędów walidacji, dane stron są zamaskowane (brak PESEL, NIP, numeru KW,
// rachunków), spis załączników zostaje w treści, PDF składa się w całości.
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { checkHardRules } from "@/lib/autopilot/compliance-rules";
import { umowaSchema } from "@/lib/contract-engine/schema";
import { LIBERATION_SERIF } from "@/lib/legal/legal-fonts";
import { znakiPozaFontem } from "@/lib/legal/pdf-z-tekstu";
import { catalogBySlug } from "./catalog";
import { renderWzorUmowyPdf, tekstOpakowania } from "./wzor-umowy-pdf";
import {
  MASKA_KW,
  MASKA_PESEL,
  MASKA_RACHUNKU,
  WZOR_PRZYKLAD,
  czesciPakietu,
  wzorCzesciPakietu,
  wzorNumerKw,
  wzorUmowy,
  wzorUmowyTekst,
  tekstBlokow,
} from "./wzor-umowy";

const DATE = new Date(Date.UTC(2026, 9, 21, 10, 0, 0));
const m = catalogBySlug("wzor-umowy-pozyczki")!;

describe("wzór umowy — silnik klauzul", () => {
  it("szkic przechodzi uzupełnienie i walidację silnika; dane po przetworzeniu są zgodne ze schematem", () => {
    const w = wzorUmowy();
    expect(w.problemy.filter((p) => p.poziom === "BLAD")).toEqual([]);
    expect(umowaSchema.safeParse(w.umowa).success).toBe(true);
    expect(w.wersjaBiblioteki).toMatch(/^\d+\.\d+/);
    expect(w.zalaczniki.map((z) => z.nr)).toEqual([1, 2, 3, 4]);
    expect(czesciPakietu()[0]).toMatch(/^Wniosek/);
  });

  it("treść: komparycja, paragrafy, spis załączników, podpisy — i przykładowe warunki", () => {
    const t = wzorUmowyTekst();
    expect(t).toContain("UMOWA POŻYCZKI");
    expect(t).toContain("§ 1 – PRZEDMIOT UMOWY");
    expect(t).toContain("§ 3 – ZABEZPIECZENIA");
    expect(t).toContain("WYPOWIEDZENIE UMOWY");
    expect(t).toContain("art. 777");
    expect(t).toContain("ZAŁĄCZNIKI");
    expect(t).toContain("Załącznik nr 1 — Harmonogram spłat");
    expect(t).toContain("Załącznik nr 4");
    expect(t).toContain(`${WZOR_PRZYKLAD.kwota} zł`);
    expect(t).toContain(`${WZOR_PRZYKLAD.hipoteka} zł`);
    expect(t).toContain("ANNA INWESTORSKA");
    expect(t).toContain("JAN PRZYKŁADOWY");
    expect(t).toContain("zwaną dalej „Pożyczkodawcą”"); // rodzaj żeński z silnika
    expect(t).toContain(`PESEL ${MASKA_PESEL}`);
    expect(t).toContain(`księgę wieczystą nr ${MASKA_KW}`);
    expect(t).toContain(MASKA_RACHUNKU);
  });

  it("brak wartowników i danych identyfikujących (PESEL, NIP, KW, rachunki)", () => {
    const t = wzorUmowyTekst();
    expect(t).not.toMatch(/\d{11}/);
    // 10 cyfr poza KRS Finance You (klauzula o Prowizji od Pożyczkobiorcy) = NIP / KRS strony.
    expect(t.replace(/KRS \d{10}/g, "KRS")).not.toMatch(/\d{10}/);
    expect(t).not.toContain(wzorNumerKw());
    expect(t).not.toContain("WZ9R");
    expect(t).not.toMatch(/\d{2} \d{4} \d{4} \d{4}/); // numer rachunku
    const osobowe = checkHardRules(t, { kind: "lead_magnet", track: "inwestor" }).filter((h) =>
      ["pesel", "numer_kw", "telefon", "email"].includes(h.code),
    );
    expect(osobowe).toEqual([]);
  });

  it("tekst umowy i opakowania mieści się w foncie serif", async () => {
    expect(await znakiPozaFontem(wzorUmowyTekst(), LIBERATION_SERIF)).toEqual([]);
    expect(await znakiPozaFontem(tekstOpakowania(m), LIBERATION_SERIF)).toEqual([]);
  });

  it("zajawki: załączniki 1–4 i wniosek z układem prawdziwych części, bez danych", () => {
    const czesci = wzorCzesciPakietu();
    expect(czesci.map((c) => c.tytul)).toEqual([
      "Załącznik nr 1 — Harmonogram spłat",
      "Załącznik nr 2 — Protokół z negocjacji indywidualnych",
      "Załącznik nr 3 — Tabela opłat windykacyjnych",
      "Załącznik nr 4 — Dyspozycja wypłaty i klauzula Prowizji od Pożyczkobiorcy (Zał. nr 6 do Umowy ramowej Finance You)",
      "Wniosek o udzielenie pożyczki pieniężnej",
    ]);
    for (const c of czesci) {
      expect(c.bloki.length).toBeGreaterThan(3);
      const t = tekstBlokow(c.bloki);
      expect(t).not.toMatch(/\d{11}/);
      expect(t).not.toContain(wzorNumerKw());
    }
    // Harmonogram ma tabelę rat (12 rat przykładu).
    expect(czesci[0].bloki.some((b) => b.t === "tabela")).toBe(true);
    const t = tekstOpakowania(m);
    expect(t).toContain("Dostępny w pełnym komplecie dokumentów");
    expect(t).toContain("Załączniki i wniosek – w pakiecie dokumentów");
    expect(t).toContain("KRS 0000635207");
  });

  it("PDF: wielostronicowy, z metadanymi i wersją biblioteki", async () => {
    const bytes = await renderWzorUmowyPdf(m, { generatedAt: DATE });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(12);
    expect(doc.getPageCount()).toBeLessThanOrEqual(22);
    expect(doc.getTitle()).toBe(m.title);
    expect(doc.getSubject()).toContain("klauzule");
    expect(doc.getCreator()).toContain("Wzór umowy");
  });
});
