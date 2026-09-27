import { describe, it, expect } from "vitest";
import {
  byLeastUsed,
  keywordsFrom,
  MATCH_THRESHOLD,
  orientationRank,
  scoreAsset,
} from "./studio-broll-match";

const asset = (over: Partial<{ tags: string[]; title: string; source_query: string }> = {}) => ({
  tags: [],
  title: "",
  source_query: "",
  ...over,
});

describe("keywordsFrom", () => {
  it("tnie frazę na słowa-klucze bez szumu i interpunkcji", () => {
    expect(keywordsFrom("Signing the mortgage contract!")).toEqual([
      "signing",
      "mortgage",
      "contract",
    ]);
  });

  it("radzi sobie z polskimi znakami i myślnikami", () => {
    expect(keywordsFrom("Umowa pod nieruchomość — biuro-notarialne")).toEqual([
      "umowa",
      "pod",
      "nieruchomość",
      "biuro",
      "notarialne",
    ]);
  });

  it("nie dubluje słów i zwraca pustą listę dla śmieci", () => {
    expect(keywordsFrom("keys keys KEYS")).toEqual(["keys"]);
    expect(keywordsFrom("!!! ??")).toEqual([]);
  });
});

describe("scoreAsset", () => {
  it("liczy pokrycie słów frazy przez tagi materiału", () => {
    const a = asset({ tags: ["signing", "mortgage", "contract"] });
    expect(scoreAsset(a, "signing mortgage contract")).toBe(1);
    expect(scoreAsset(a, "signing mortgage documents")).toBeCloseTo(2 / 3);
  });

  it("bierze pod uwagę tytuł i frazę źródłową, nie tylko tagi", () => {
    expect(scoreAsset(asset({ title: "Klucze do mieszkania" }), "klucze")).toBe(1);
    expect(scoreAsset(asset({ source_query: "house keys handover" }), "house keys")).toBe(1);
  });

  it("zwraca zero dla materiału bez związku z frazą", () => {
    const a = asset({ tags: ["skyline", "city"] });
    expect(scoreAsset(a, "signing mortgage contract")).toBe(0);
    expect(scoreAsset(a, "signing mortgage contract")).toBeLessThan(MATCH_THRESHOLD);
  });

  it("pusta fraza nie dopasowuje niczego (zamiast dopasować wszystko)", () => {
    expect(scoreAsset(asset({ tags: ["keys"] }), "   ")).toBe(0);
  });
});

describe("kolejność doboru", () => {
  it("stawia pion przed kwadratem i resztą (kadr 9:16)", () => {
    expect(
      [null, "landscape", "square", "portrait"].sort(
        (a, b) => orientationRank(a) - orientationRank(b),
      ),
    ).toEqual(["portrait", "square", null, "landscape"]);
  });

  it("najdawniej użyte idzie pierwsze, nieużywane przed wszystkim", () => {
    const nowy = { last_used_at: null, use_count: 0 };
    const stary = { last_used_at: "2026-01-01T00:00:00Z", use_count: 3 };
    const swiezy = { last_used_at: "2026-09-01T00:00:00Z", use_count: 1 };
    expect([swiezy, stary, nowy].sort(byLeastUsed)).toEqual([nowy, stary, swiezy]);
  });

  it("przy równym czasie rozstrzyga licznik użyć", () => {
    const a = { last_used_at: "2026-05-05T00:00:00Z", use_count: 5 };
    const b = { last_used_at: "2026-05-05T00:00:00Z", use_count: 2 };
    expect([a, b].sort(byLeastUsed)).toEqual([b, a]);
  });
});
