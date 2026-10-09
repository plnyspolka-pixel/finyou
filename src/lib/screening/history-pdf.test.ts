import { describe, it, expect } from "vitest";
import { buildHistoryPdf, bytesToBase64 } from "./history-pdf.server";

describe("eksport PDF historii screeningu", () => {
  it("tworzy wielostronicowy PDF z polskimi znakami", async () => {
    const lines = Array.from(
      { length: 120 },
      (_, i) => `Przebieg ${i}: Żółć Gęślą Jaźń — wynik 42, źródła: sejm_api=2026-10-09`,
    );
    const bytes = await buildHistoryPdf({
      title: "Historia screeningu — Łukasz Żółkiewski",
      generatedAt: new Date("2026-10-09T12:00:00Z"),
      generatedBy: "Compliance",
      sections: [{ heading: "Przebiegi screeningu", lines }],
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(5000);
    expect(bytesToBase64(bytes).length).toBeGreaterThan(bytes.length);
  });
});
