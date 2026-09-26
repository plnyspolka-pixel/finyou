import { describe, it, expect } from "vitest";
import {
  MIN_CHUNK_BYTES,
  TARGET_CHUNK_BYTES,
  TITLE_MAX,
  pickPrivacyLevel,
  planChunks,
  tiktokTitle,
} from "./tiktok-upload";

const MB = 1024 * 1024;

// Niezmiennik walidacji TikToka: total_chunk_count musi być równe
// floor(video_size / chunk_size), a chunki muszą pokryć plik bez dziur.
function assertPlanIsValid(total: number) {
  const plan = planChunks(total);
  expect(plan.ranges).toHaveLength(plan.totalChunkCount);
  if (total >= MIN_CHUNK_BYTES) {
    expect(plan.totalChunkCount).toBe(Math.floor(total / plan.chunkSize));
  }
  expect(plan.ranges[0].start).toBe(0);
  expect(plan.ranges[plan.ranges.length - 1].end).toBe(total - 1);
  for (let i = 1; i < plan.ranges.length; i++) {
    expect(plan.ranges[i].start).toBe(plan.ranges[i - 1].end + 1);
  }
  const covered = plan.ranges.reduce((n, r) => n + (r.end - r.start + 1), 0);
  expect(covered).toBe(total);
  return plan;
}

describe("planChunks", () => {
  it("wysyła plik poniżej 5 MB jako jeden chunk", () => {
    const plan = assertPlanIsValid(3 * MB);
    expect(plan.totalChunkCount).toBe(1);
    expect(plan.chunkSize).toBe(3 * MB);
    expect(plan.ranges).toEqual([{ start: 0, end: 3 * MB - 1 }]);
  });

  it("dzieli plik podzielny bez reszty na równe chunki", () => {
    const plan = assertPlanIsValid(30 * MB);
    expect(plan.chunkSize).toBe(TARGET_CHUNK_BYTES);
    expect(plan.totalChunkCount).toBe(3);
  });

  // Sedno odstępstwa od specyfikacji: ceil(25/10)=3 dałoby błąd invalid_params,
  // bo TikTok liczy floor(25/10)=2 i oczekuje, że ostatni chunk weźmie resztę.
  it("używa floor, nie ceil — ostatni chunk pochłania resztę", () => {
    const plan = assertPlanIsValid(25 * MB);
    expect(plan.totalChunkCount).toBe(2);
    expect(plan.ranges[1].end - plan.ranges[1].start + 1).toBe(15 * MB);
  });

  it("trzyma niezmienniki dla rozmiarów nieokrągłych", () => {
    for (const total of [MIN_CHUNK_BYTES, 5 * MB + 1, 10 * MB + 1, 17_345_678, 99 * MB]) {
      assertPlanIsValid(total);
    }
  });

  it("nie przekracza limitu 1000 chunków", () => {
    const plan = assertPlanIsValid(20 * 1024 * MB); // 20 GB
    expect(plan.totalChunkCount).toBeLessThanOrEqual(1000);
  });

  it("odrzuca pusty plik", () => {
    expect(() => planChunks(0)).toThrow();
    expect(() => planChunks(-1)).toThrow();
  });
});

describe("tiktokTitle", () => {
  it("normalizuje białe znaki", () => {
    expect(tiktokTitle("  Pożyczka   pod\n nieruchomość  ")).toBe("Pożyczka pod nieruchomość");
  });

  it("skraca do limitu znaków", () => {
    const long = "a".repeat(400);
    const out = tiktokTitle(long);
    expect(out).toHaveLength(TITLE_MAX);
    expect(out.endsWith("…")).toBe(true);
  });

  it("zostawia krótki tytuł bez zmian i znosi brak wartości", () => {
    expect(tiktokTitle("Krótki tytuł")).toBe("Krótki tytuł");
    expect(tiktokTitle(null)).toBe("");
    expect(tiktokTitle(undefined)).toBe("");
  });
});

describe("pickPrivacyLevel", () => {
  it("preferuje PUBLIC_TO_EVERYONE, gdy jest dostępne", () => {
    expect(pickPrivacyLevel(["FOLLOWER_OF_CREATOR", "PUBLIC_TO_EVERYONE", "SELF_ONLY"])).toBe(
      "PUBLIC_TO_EVERYONE",
    );
  });

  it("bierze pierwszą dostępną opcję, gdy publicznej nie ma", () => {
    expect(pickPrivacyLevel(["SELF_ONLY", "MUTUAL_FOLLOW_FRIENDS"])).toBe("SELF_ONLY");
  });

  it("nie hardkoduje poziomu przy pustej liście — rzuca", () => {
    expect(() => pickPrivacyLevel([])).toThrow(/privacy_level_options/);
  });
});
