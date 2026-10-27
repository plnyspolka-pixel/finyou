import { describe, expect, it } from "vitest";
import {
  buildCaseReport,
  creditorKind,
  decidePhoto,
  locationLabel,
  round5k,
  roundArea,
  type CaseInput,
} from "./anonymize";

// Dane syntetyczne — wtręty „wrażliwe” w surowych opisach muszą zniknąć.
const base: CaseInput = {
  ref: "FY-R-99",
  grade: "D",
  score: 49,
  recommendation: "do_weryfikacji",
  propertyType: "dom",
  voivodeship: "Mazowieckie",
  city: "Kozia Wólka",
  cityPopulation: 1200,
  powiat: "Testowy",
  usableAreaM2: 143.7,
  landAreaM2: 900,
  valueLowPln: 412_345,
  valueHighPln: 498_765,
  loanAmountPln: 123_456,
  ltvPercent: 27.4,
  auction1Pln: 333_333,
  auction2Pln: 296_296,
  likelyAuction: "druga_licytacja",
  residentialAuctionBlock: false,
  saleability: { score: 41, band: "umiarkowana", days: 180 },
  flood: "unknown",
  infrastructure: "slaba",
  mortgages: [
    { amountPln: 171_100, creditorText: "GMINA MIASTO TESTOWO", forced: false },
    { amountPln: 2_041, creditorText: "Skarb Państwa (nazwa", forced: true },
  ],
  servitude: true,
  coOwners: 2,
  riskTexts: [
    "Istotna niezgodność osoby wnioskującej z właścicielem ujawnionym w dziale II KW (NIEZGODNY) — Jan Kowalski, PESEL 80010112345.",
    "Niespójność: Wiadomość [29] sugeruje ofertę 200 000 PLN; KW WA1M/00012345/6, ul. Lipowa 7/3.",
    "Korespondencja (fakt): Klient pisał 2026-07-18 o zawieszonej działalności.",
    "Miejscowość poniżej 20 tys. mieszkańców — rynek trudny.",
  ],
  components: { collateral: 68, legal: 72, exitLiquidity: 46, documentCompleteness: 30 },
};

describe("raporty spraw — anonimizacja", () => {
  it("zaokrągla kwoty do 5 000 zł i powierzchnię", () => {
    expect(round5k(123_456)).toBe(125_000);
    expect(round5k(412_345, "down")).toBe(410_000);
    expect(round5k(498_765, "up")).toBe(500_000);
    expect(roundArea(53.2)).toBe(55);
    expect(roundArea(143.7)).toBe(140);
    expect(roundArea(2_345)).toBe(2_300);
  });

  it("miasto tylko > 100 tys.; powiat grodzki ukryty; inaczej województwo", () => {
    expect(
      locationLabel({
        city: "Kraków",
        cityPopulation: 804_237,
        powiat: null,
        voivodeship: "Małopolskie",
      }),
    ).toBe("Kraków, woj. małopolskie");
    expect(
      locationLabel({
        city: "Mysłowice",
        cityPopulation: 74_000,
        powiat: "M. Mysłowice",
        voivodeship: "Śląskie",
      }),
    ).toBe("woj. śląskie");
    expect(
      locationLabel({
        city: "Bierutów",
        cityPopulation: 5_000,
        powiat: "Oleśnicki",
        voivodeship: null,
      }),
    ).toBe("powiat oleśnicki");
  });

  it("wierzyciele opisowo, bez nazw", () => {
    expect(creditorKind("PKO BANK POLSKI SA")).toBe("bank");
    expect(creditorKind("GMINA MIASTO ŁÓDŹ")).toBe("podmiot publiczny");
    expect(creditorKind("XYZ SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ")).toBe(
      "podmiot prywatny (spółka)",
    );
    expect(creditorKind(null)).toBe("wierzyciel nieodczytany automatycznie");
  });

  it("raport nie zawiera danych osobowych ani surowych opisów", () => {
    const r = buildCaseReport(base);
    const txt = JSON.stringify(r);
    for (const banned of [
      "Kowalski",
      "Kozia Wólka",
      "Testowo",
      "TESTOWO",
      "Lipowa",
      "Wiadomość",
      "Skarb Państwa",
      "GMINA",
      "171 100",
      "123 456",
      "143,7",
    ])
      expect(txt).not.toContain(banned);
    expect(txt).not.toMatch(/\d{11}/); // PESEL
    expect(txt).not.toMatch(/[A-Z]{2}\d[A-Z]\/\d{8}\/\d/); // numer KW
    expect(txt).not.toMatch(/\d{4}-\d{2}-\d{2}/); // daty
    expect(r.title).toBe("Dom — powiat testowy, woj. mazowieckie");
    expect(r.verdictTone).toBe("negative");
    expect(r.why).toMatch(/^Ocena D \(49\/100\)\. Dlaczego nie:/);
    expect(r.risks).toContain(
      "Nie potwierdzono, że osoba wnioskująca jest właścicielem z księgi wieczystej.",
    );
    const obc = r.facts.find(([k]) => k === "Obciążenia w księdze wieczystej")?.[1];
    expect(obc).toContain("2 hipoteki (w tym przymusowe: 1) — podmiot publiczny");
    expect(obc).toContain("łącznie ok. 175 000 zł");
  });
});

describe("raporty spraw — selekcja zdjęć", () => {
  const ocr = (o: Partial<NonNullable<Parameters<typeof decidePhoto>[0]["ocr"]>>) => ({
    docKind: "inne",
    rawTextSnippet: "",
    ownerNames: [],
    keyFindings: [],
    ...o,
  });
  it("przyjmuje wnętrze bez tekstu", () => {
    expect(
      decidePhoto(
        { fileName: "IMG_1.jpg", ocr: ocr({ keyFindings: ["Obraz przedstawia zdjęcie kuchni."] }) },
        false,
      ).accept,
    ).toBe(true);
    expect(
      decidePhoto(
        {
          fileName: "IMG_2.jpg",
          ocr: ocr({
            rawTextSnippet: "Brak tekstu do analizy.",
            keyFindings: ["zdjęcie sypialni"],
          }),
        },
        false,
      ).accept,
    ).toBe(true);
  });
  it("odrzuca tekst, dane osobowe, zrzuty ekranu, brak OCR i zewnątrz w małej miejscowości", () => {
    expect(
      decidePhoto({ fileName: "a.jpg", ocr: ocr({ rawTextSnippet: "Jan Nowak\nOdpowiedz" }) }, true)
        .accept,
    ).toBe(false);
    expect(
      decidePhoto({ fileName: "a.jpg", ocr: ocr({ ownerNames: ["Jan Nowak"] }) }, true).accept,
    ).toBe(false);
    expect(
      decidePhoto(
        { fileName: "a.jpg", ocr: ocr({ keyFindings: ["To zrzut ekranu z komunikatora"] }) },
        true,
      ).accept,
    ).toBe(false);
    expect(decidePhoto({ fileName: "a.jpg", ocr: null }, true).accept).toBe(false);
    expect(decidePhoto({ fileName: "skan.pdf", ocr: ocr({}) }, true).accept).toBe(false);
    expect(
      decidePhoto(
        { fileName: "a.jpg", ocr: ocr({ keyFindings: ["Elewacja budynku z zewnątrz"] }) },
        false,
      ).accept,
    ).toBe(false);
    expect(
      decidePhoto(
        { fileName: "a.jpg", ocr: ocr({ keyFindings: ["Elewacja budynku z zewnątrz"] }) },
        true,
      ).accept,
    ).toBe(true);
  });
});
