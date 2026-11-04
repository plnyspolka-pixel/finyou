// Przykładowy raport nieruchomości (Analityk AI) do pobrania ze strony —
// public/marketing/przykladowy-raport-nieruchomosci.pdf. Dane FIKCYJNE
// (bez numeru KW, właściciela i adresu), ale układ, sekcje i skala A–E takie
// same jak w raporcie z panelu (lib/investor-analytics/report-pdf.ts).
//
//   bun scripts/przykladowy-raport-nieruchomosci.ts
//
// Uruchom ponownie po zmianie układu raportu albo skali ocen.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  renderInvestorReportPdf,
  type InvestorReportModel,
  type ReportBlock,
} from "../src/lib/investor-analytics/report-pdf";
import { GRADE_BANDS } from "../src/lib/risk-assessment/grade-bands";

const B = GRADE_BANDS.find((b) => b.grade === "B")!;

const blocks: ReportBlock[] = [
  {
    t: "note",
    tone: "info",
    text:
      "Przykładowy raport na fikcyjnych danych. Pokazuje, co inwestor dostaje z Analityka AI " +
      "w ok. 15 minut: stan prawny księgi, właścicieli w rejestrach, wycenę z cen " +
      "transakcyjnych, płynność, ryzyko powodzi i klasę A–E. Numer KW, adres i dane " +
      "właściciela w prawdziwym raporcie widzi tylko inwestor.",
  },
  { t: "heading", text: "Podsumowanie dla inwestora" },
  {
    t: "tiles",
    items: [
      { label: "Klasa ryzyka", value: "B · 74 pkt", accent: true },
      { label: "Wycena (średnia)", value: "612 000 zł" },
      { label: "Bezpieczny pułap LTV", value: "55 % · 336 000 zł" },
      { label: "Wnioskowana kwota", value: "250 000 zł" },
      { label: "LTV wniosku", value: "41 %" },
      { label: "Płynność", value: "71 / 100" },
    ],
  },
  {
    t: "bullets",
    items: [
      "Mieszkanie 58,4 m², 3 pokoje, 4. piętro w budynku z 2009 r., miasto wojewódzkie — dzielnica z dobrą infrastrukturą.",
      "Księga wieczysta: jeden właściciel (osoba fizyczna), dział III bez wpisów, dział IV — jedna hipoteka umowna banku (saldo wg zaświadczenia 118 400 zł) do spłaty z pożyczki.",
      "Trzy największe atuty: wysoka płynność lokalu, LTV wniosku 41 %, czysty dział III.",
      "Trzy główne ryzyka: hipoteka banku na 1. miejscu do czasu spłaty, brak świadectwa energetycznego w dokumentach, wiek właściciela 71 lat (ryzyko sukcesji).",
    ],
  },
  { t: "heading", text: "Ocena inwestycyjna A–E" },
  {
    t: "score",
    label: "Wynik oceny inwestycyjnej",
    value: 74,
    color: B.color,
    caption: `klasa B — ${B.label.toLowerCase()}`,
  },
  { t: "gradeScale", grade: "B" },
  {
    t: "paragraph",
    text: `Klasa B — ${B.label}. ${B.description}`,
  },
  {
    t: "compare",
    barName: "Ocena składowej",
    rows: [
      { label: "Łatwość sprzedaży (30 %)", value: 24, max: 30, valueLabel: "24 / 30" },
      { label: "Stan prawny KW (20 %)", value: 15, max: 20, valueLabel: "15 / 20" },
      { label: "Zabezpieczenie (18 %)", value: 16, max: 18, valueLabel: "16 / 18" },
      { label: "Pewność wyceny (10 %)", value: 8, max: 10, valueLabel: "8 / 10" },
      { label: "Wiek właścicieli (9 %)", value: 4, max: 9, valueLabel: "4 / 9" },
      { label: "Sygnały z korespondencji (7 %)", value: 5, max: 7, valueLabel: "5 / 7" },
      { label: "Dokumenty (6 %)", value: 2, max: 6, valueLabel: "2 / 6" },
    ],
  },
  { t: "heading", text: "Stan prawny — księga wieczysta" },
  {
    t: "keyValues",
    rows: [
      ["Typ księgi", "lokal stanowiący odrębną nieruchomość"],
      ["Dział I-O", "lokal mieszkalny 58,40 m², udział 584/41200 w nieruchomości wspólnej"],
      ["Dział II", "1 właściciel — osoba fizyczna (zgodna z dokumentem tożsamości klienta)"],
      ["Dział III", "brak wpisów (brak służebności, roszczeń, egzekucji)"],
      ["Dział IV", "hipoteka umowna 210 000 zł na rzecz banku — do spłaty z pożyczki"],
      ["Wzmianki", "brak aktywnych wzmianek"],
      ["Miejsce Twojej hipoteki", "1. po spłacie i wykreśleniu hipoteki banku (warunek wypłaty)"],
    ],
  },
  {
    t: "table",
    columns: [
      { label: "Ustalenie", width: 5 },
      { label: "Status", width: 2 },
      { label: "Co to znaczy dla inwestora", width: 6 },
    ],
    rows: [
      [
        "Hipoteka banku w dziale IV",
        "UWAGA",
        "Wypłatę pożyczki kierujesz w części na spłatę banku; wykreślenie potwierdzasz odpisem KW.",
      ],
      [
        "Zgodność właściciela z KW",
        "OK",
        "Dane właściciela zgadzają się z dokumentem i CEIDG/KRS (brak działalności).",
      ],
      ["Egzekucja / upadłość", "OK", "Brak wpisów komorniczych i ogłoszeń w KRZ."],
      [
        "Wiek właściciela 71 lat",
        "UWAGA",
        "Rozważ krótszy okres albo dodatkowe zabezpieczenie (poręczenie, cesja).",
      ],
    ],
  },
  { t: "heading", text: "Wycena i zapas bezpieczeństwa" },
  {
    t: "paragraph",
    text:
      "Wycena liczona z 14 transakcji i 23 ofert z promienia 1,2 km (ostatnie 12 miesięcy), " +
      "po korekcie na piętro, rok budowy i standard. Widełki: minimum 548 000 zł, średnia " +
      "612 000 zł, maksimum 671 000 zł (10 480 zł/m²).",
  },
  {
    t: "bars",
    max: 700000,
    rows: [
      { label: "Wycena maksymalna", value: 671000, valueLabel: "671 000 zł" },
      { label: "Wycena średnia", value: 612000, valueLabel: "612 000 zł" },
      { label: "Wycena minimalna", value: 548000, valueLabel: "548 000 zł" },
      { label: "Bezpieczny pułap LTV 55 %", value: 336600, valueLabel: "336 600 zł" },
      { label: "I licytacja komornicza (¾)", value: 411000, valueLabel: "411 000 zł" },
      { label: "II licytacja komornicza (⅔)", value: 365000, valueLabel: "365 000 zł" },
      { label: "Wnioskowana kwota", value: 250000, valueLabel: "250 000 zł" },
    ],
  },
  {
    t: "note",
    tone: "info",
    text:
      "Nawet przy sprzedaży na II licytacji komorniczej zabezpieczenie pokrywa kwotę pożyczki " +
      "z odsetkami i kosztami. Wycena nie jest operatem szacunkowym.",
  },
  { t: "heading", text: "Płynność i lokalizacja" },
  {
    t: "keyValues",
    rows: [
      ["Wskaźnik płynności", "71 / 100 — nieruchomość łatwa do sprzedania"],
      ["Ludność gminy / trend 5 lat", "ok. 340 000 · +1,4 %"],
      ["Odległość do centrum", "3,1 km"],
      ["Cena ofertowa za m² w okolicy", "10 100–11 300 zł"],
      ["Ryzyko powodzi (ISOK)", "niskie — poza strefą 1 % i 10 %"],
    ],
  },
  {
    t: "distances",
    maxM: 1500,
    rows: [
      { label: "Przystanek komunikacji", distanceM: 180, thresholdM: 500, alert: false },
      { label: "Szkoła podstawowa", distanceM: 420, thresholdM: 1000, alert: false },
      { label: "Sklep spożywczy", distanceM: 150, thresholdM: 500, alert: false },
      { label: "Przychodnia", distanceM: 900, thresholdM: 1500, alert: false },
      { label: "Tereny przemysłowe", distanceM: 1350, thresholdM: 300, alert: false },
    ],
  },
  { t: "heading", text: "Co dalej" },
  {
    t: "bullets",
    items: [
      "Warunek wypłaty: spłata hipoteki banku z pożyczki i wniosek o jej wykreślenie.",
      "Do umowy: aktualny odpis KW, zaświadczenie banku o saldzie, dokument tożsamości, zgoda współmałżonka (jeśli dotyczy).",
      "Propozycję finansową przygotuj w kalkulatorze compliance, a komplet dokumentów wygeneruj w Kancelarii AI i wyślij do e-podpisu.",
    ],
  },
  {
    t: "paragraph",
    muted: true,
    text:
      "Raport ma charakter informacyjny i nie jest poradą inwestycyjną; wycena nie jest operatem " +
      "szacunkowym. Decyzję podejmujesz samodzielnie — zalecamy weryfikację u rzeczoznawcy " +
      "majątkowego i radcy prawnego. Inwestowanie wiąże się z ryzykiem utraty części lub całości kapitału.",
  },
];

const model: InvestorReportModel = {
  kind: "analityka",
  title: "Raport analityczny — przykład",
  subtitle: "Mieszkanie 58 m², miasto wojewódzkie · pożyczka 250 000 zł pod hipotekę",
  kwNumber: null,
  projectRef: null,
  teaser: true,
  stepsDone: 4,
  blocks,
};

// Poza Vite importy `?inline` czcionek nie działają — podajemy pliki TTF wprost.
const fontDir = join(process.cwd(), "src", "lib", "legal", "fonts");
const bytes = await renderInvestorReportPdf(model, {
  preparedFor: "przykład dla inwestora",
  generatedAt: new Date("2026-11-04T10:00:00+01:00"),
  fonts: {
    regular: new Uint8Array(readFileSync(join(fontDir, "LiberationSans-Regular.ttf"))),
    bold: new Uint8Array(readFileSync(join(fontDir, "LiberationSans-Bold.ttf"))),
  },
});
const out = join(process.cwd(), "public", "marketing", "przykladowy-raport-nieruchomosci.pdf");
writeFileSync(out, bytes);
console.log(`Zapisano ${out} (${Math.round(bytes.length / 1024)} KB)`);
