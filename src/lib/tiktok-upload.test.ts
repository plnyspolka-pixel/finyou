import { describe, it, expect } from "vitest";
import {
  MIN_CHUNK_BYTES,
  TARGET_CHUNK_BYTES,
  TITLE_MAX,
  applyCreatorConstraints,
  parseTiktokPostOptions,
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

describe("parseTiktokPostOptions", () => {
  const base = {
    privacyLevel: "PUBLIC_TO_EVERYONE",
    disableComment: false,
    disableDuet: true,
    disableStitch: true,
    brandOrganic: false,
    brandedContent: false,
  };

  it("przyjmuje komplet ustawień twórcy", () => {
    expect(parseTiktokPostOptions(base)).toEqual(base);
  });

  it("wymaga wybranego poziomu prywatności — nie podstawia domyślnego", () => {
    expect(() => parseTiktokPostOptions({ ...base, privacyLevel: "" })).toThrow(/prywatności/);
    expect(() => parseTiktokPostOptions({ ...base, privacyLevel: "   " })).toThrow(/prywatności/);
    expect(() => parseTiktokPostOptions(null)).toThrow(/ustawień publikacji/);
    expect(() => parseTiktokPostOptions(undefined)).toThrow(/ustawień publikacji/);
  });

  it("odrzuca prywatność, na którą konto twórcy już nie pozwala", () => {
    expect(() => parseTiktokPostOptions(base, ["SELF_ONLY"])).toThrow(/nie pozwala już/);
    expect(parseTiktokPostOptions(base, ["SELF_ONLY", "PUBLIC_TO_EVERYONE"])).toEqual(base);
  });

  // Reguła TikToka: treść brandowana nie może być prywatna. Zgłaszamy błąd,
  // zamiast po cichu zmieniać którykolwiek z wyborów twórcy.
  it("nie dopuszcza treści brandowanej przy prywatności tylko-ja", () => {
    expect(() =>
      parseTiktokPostOptions({ ...base, privacyLevel: "SELF_ONLY", brandedContent: true }),
    ).toThrow(/Branded content/);
  });

  it("pozwala na własną markę przy prywatności tylko-ja", () => {
    const out = parseTiktokPostOptions({
      ...base,
      privacyLevel: "SELF_ONLY",
      brandOrganic: true,
    });
    expect(out.brandOrganic).toBe(true);
    expect(out.privacyLevel).toBe("SELF_ONLY");
  });

  it("traktuje brakujące przełączniki jako wyłączone", () => {
    const out = parseTiktokPostOptions({ privacyLevel: "SELF_ONLY" });
    expect(out).toEqual({
      privacyLevel: "SELF_ONLY",
      disableComment: false,
      disableDuet: false,
      disableStitch: false,
      brandOrganic: false,
      brandedContent: false,
    });
  });
});

describe("applyCreatorConstraints", () => {
  const options = {
    privacyLevel: "PUBLIC_TO_EVERYONE",
    disableComment: false,
    disableDuet: false,
    disableStitch: false,
    brandOrganic: false,
    brandedContent: false,
  };

  it("wyłącza interakcje zablokowane na koncie twórcy", () => {
    const out = applyCreatorConstraints(options, {
      commentDisabled: true,
      duetDisabled: false,
      stitchDisabled: true,
    });
    expect(out.disableComment).toBe(true);
    expect(out.disableStitch).toBe(true);
    expect(out.disableDuet).toBe(false);
  });

  // Iloczyn, nie nadpisanie: konto pozwalające na duet nie może włączyć go
  // z powrotem, jeśli twórca sam go wyłączył.
  it("nie włącza z powrotem tego, co twórca wyłączył", () => {
    const out = applyCreatorConstraints(
      { ...options, disableDuet: true, disableComment: true },
      { commentDisabled: false, duetDisabled: false, stitchDisabled: false },
    );
    expect(out.disableDuet).toBe(true);
    expect(out.disableComment).toBe(true);
  });

  it("nie rusza prywatności ani oznaczeń komercyjnych", () => {
    const out = applyCreatorConstraints(
      { ...options, brandOrganic: true },
      { commentDisabled: true, duetDisabled: true, stitchDisabled: true },
    );
    expect(out.privacyLevel).toBe("PUBLIC_TO_EVERYONE");
    expect(out.brandOrganic).toBe(true);
    expect(out.brandedContent).toBe(false);
  });
});
