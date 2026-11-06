import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KRZ_ANALYSIS_SCHEMA, detailToPrompt } from "./analyze.server";
import { parseNoticeXml } from "./parse";

const fx = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf8");

describe("detailToPrompt", () => {
  it("zawiera metrykę, podmiot i treść; nie zawiera PESEL", () => {
    const d = parseNoticeXml(fx("osoba.xml"), "x");
    const p = detailToPrompt(d);
    expect(p).toContain("PL1P/GU/535/2026");
    expect(p).toContain("Jan Testowy");
    expect(p).toContain("nie prowadzi działalności");
    expect(p).toContain("Treść obwieszczenia:");
    expect(p).not.toMatch(/\b\d{11}\b/);
  });
  it("spółka: KRS i NIP w prompcie", () => {
    const p = detailToPrompt(parseNoticeXml(fx("spolka.xml"), "y"));
    expect(p).toContain("KRS: 0000859953");
    expect(p).toContain("NIP: 8992885588");
  });
});

describe("KRZ_ANALYSIS_SCHEMA", () => {
  it("wszystkie wymagane pola mają definicję", () => {
    for (const k of KRZ_ANALYSIS_SCHEMA.required) {
      expect(KRZ_ANALYSIS_SCHEMA.properties).toHaveProperty(k);
    }
  });
});
