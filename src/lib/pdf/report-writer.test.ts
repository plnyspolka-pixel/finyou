import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  ReportWriter,
  charsOutsideFont,
  formatWarsawDateTime,
  warsawDateStamp,
} from "./report-writer";

const DATE = new Date(Date.UTC(2026, 9, 10, 22, 30, 0));
// Znaki niewidoczne w źródle — jawnie, przez kod znaku.
const NBSP = String.fromCodePoint(0x00a0);
const NNBSP = String.fromCodePoint(0x202f);
const VS16 = String.fromCodePoint(0xfe0f);

describe("ReportWriter", () => {
  it("składa wielostronicowy A4 z tabelą, paskami wyniku i skalą A–E", async () => {
    const w = await ReportWriter.create({
      title: "Raport testowy — zażółć gęślą jaźń",
      subject: "test",
      preparedFor: "Łukasz Żółkiewski",
      generatedAt: DATE,
    });
    w.title("Raport testowy", "Mieszkanie · Słupsk");
    w.heading("Ocena inwestycyjna A–E");
    w.scoreBar("Wynik oceny", 76, { color: "#10b981", caption: "klasa B" });
    w.gradeScale("B");
    w.keyValues([
      ["Bardzo długa etykieta, która musi się złamać na dwa wiersze", "wartość ".repeat(40)],
      ["Kwota", `1${NBSP}250${NBSP}000${NBSP}zł`],
    ]);
    w.bullets(["✓ zgodne", "✗ niezgodne", `⚠${VS16} uwaga`, "★ wyróżnienie"]);
    w.note("Wersja przed rezerwacją — dane identyfikujące ukryte.", { tone: "warning" });
    // 160 wierszy (część kilkuwierszowych) — tabela przechodzi przez kilka stron.
    w.table(
      [
        { label: "Nr", width: 0.6 },
        { label: "Opis", width: 6 },
        { label: "Kwota", width: 2, align: "right" },
      ],
      Array.from({ length: 160 }, (_, i) => [
        String(i + 1),
        `Pozycja ${i + 1} — ${"tekst ".repeat(i % 7 === 0 ? 30 : 3)}`,
        `${(i + 1) * 1000} zł`,
      ]),
    );
    const bytes = await w.save();
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(4);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
    expect(doc.getTitle()).toBe("Raport testowy — zażółć gęślą jaźń");
    expect(doc.getAuthor()).toBe("Finance You");
    expect(doc.getCreationDate()?.toISOString()).toBe(DATE.toISOString());
  });

  it("znaki spoza fontu mają czytelne zamienniki", async () => {
    const text = `✓ ✗ ⚠${VS16} ★ a${NNBSP}b${NBSP}c — „cytat” · ≤ ≥ m² 952¹`;
    expect(await charsOutsideFont(text)).toEqual([]);
    expect(await charsOutsideFont("emoji 😀")).toEqual(["😀"]);
  });

  it("daty w czasie polskim, niezależnie od strefy środowiska", () => {
    // 22:30 UTC 10 października = 00:30 11 października w Warszawie (CEST).
    expect(formatWarsawDateTime(DATE)).toMatch(/11 października 2026.*00:30/);
    expect(warsawDateStamp(DATE)).toBe("2026-10-11");
    expect(formatWarsawDateTime(null)).toBe("—");
  });
});

describe("ReportWriter — bloki lead magnetów", () => {
  it("okładka kończy stronę, checklista i kroki rysują się bez błędów", async () => {
    const w = await ReportWriter.create({
      title: "Materiał testowy",
      preparedFor: "czytelników",
      generatedAt: DATE,
      brand: "Finance You · Materiał edukacyjny",
    });
    w.cover({
      eyebrow: "Checklista · test",
      title: "Tytuł okładki z polskimi znakami: zażółć gęślą jaźń",
      subtitle: "Podtytuł",
      items: ["Punkt pierwszy", "Punkt drugi"],
      meta: ["Wersja 1", "Finance You"],
    });
    w.heading("Sekcja");
    w.checklist(Array.from({ length: 40 }, (_, i) => `Pozycja ${i + 1} ${"tekst ".repeat(8)}`));
    w.steps([
      { title: "Krok pierwszy", text: "Opis kroku pierwszego." },
      { title: "Krok drugi bez opisu" },
    ]);
    w.pageBreak();
    w.pageBreak(); // pusta strona nie dubluje się
    w.paragraph("Koniec");
    const bytes = await w.save();
    const doc = await PDFDocument.load(bytes);
    // okładka + sekcja (checklista przechodzi na 2. stronę) + strona po łamaniu
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(doc.getCreator()).toBe("Finance You · Materiał edukacyjny");
  });
});
