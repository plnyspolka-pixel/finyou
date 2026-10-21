import { describe, expect, it } from "vitest";
import { checkHardRules, RISK_LINES } from "./compliance-rules";
import { defaultProfiles } from "./profiles";
import { seriesForTrack } from "./series";
import {
  BORROWER_MAX_B2B_MENTIONS,
  TRACK_HOOK_EXAMPLES,
  TRACK_SCRIPT_RULES,
  b2bMentions,
  overstressesB2b,
} from "./track-voice";

describe("tor pożyczkobiorcy — bez akcentu „tylko dla firm” w rolkach", () => {
  it("liczy wzmianki o firmie/przedsiębiorcy/działalności (odmiany)", () => {
    expect(
      b2bMentions("Twoja firma, przedsiębiorcy, działalności gospodarczej i biznesu"),
    ).toHaveLength(4);
    expect(overstressesB2b("Prowadzisz firmę? Pożyczka pod nieruchomość.")).toBe(false);
    expect(overstressesB2b("Bank odmówił firmie? Dla przedsiębiorców mamy pożyczkę.")).toBe(true);
    expect(BORROWER_MAX_B2B_MENTIONS).toBe(1);
  });

  it("zasady scenarzysty: pożyczka pod zastaw po prostu, maks. raz, bez konsumentów", () => {
    const r = TRACK_SCRIPT_RULES.pozyczkobiorca;
    expect(r).toMatch(/NIE akcentuj, że oferta jest tylko dla firm/);
    expect(r).toMatch(/najwyżej RAZ/);
    expect(r).toMatch(/na dowolny cel/);
  });

  it("przykłady hooków i beaty serii nie mówią o firmach", () => {
    for (const h of TRACK_HOOK_EXAMPLES.pozyczkobiorca) expect(b2bMentions(h)).toHaveLength(0);
    for (const s of seriesForTrack("pozyczkobiorca")) {
      expect(b2bMentions(s.beats.join(" ")).length, s.slug).toBe(0);
    }
  });

  it("profil domyślny toru: bez „(firma)”, ton bez powtarzania słów B2B", () => {
    const p = defaultProfiles().pozyczkobiorca;
    expect(p.label).toBe("Pożyczkobiorca");
    expect(p.targetGroup).toMatch(/NIE akcentujemy/);
    expect(p.tone).toMatch(/maksymalnie raz/);
  });

  it("reguła „konsument” i linia o celu gospodarczym w stopce zostają", () => {
    for (const t of ["Pożyczka na dowolny cel", "Kasa na wakacje", "Oferta dla osób prywatnych"]) {
      expect(
        checkHardRules(t, { kind: "script", track: "pozyczkobiorca" }).map((h) => h.code),
      ).toContain("konsument");
    }
    expect(RISK_LINES.pozyczkobiorca).toMatch(/cel gospodarczy/);
    // Rolka bez słowa „firma” przechodzi reguły twarde toru.
    expect(
      checkHardRules("Bank powiedział nie? Twoja nieruchomość może powiedzieć tak. Złóż wniosek.", {
        kind: "script",
        track: "pozyczkobiorca",
      }),
    ).toEqual([]);
  });
});

describe("raport autopilota — produkcja rolek", () => {
  it("zejście na Remotion trafia do raportu; bez sekcji o planie Pro ElevenLabs", async () => {
    const { buildReportText } = await import("./metrics");
    const text = buildReportText({
      periodLabel: "21.10",
      tracks: [],
      outliers: 0,
      changes: [],
      alarms: [],
      paused: false,
      production: ["caption-burner nie odpowiada — rolki wykańcza automatycznie Remotion"],
    });
    expect(text).toMatch(/Produkcja: caption-burner nie odpowiada/);
    expect(text).not.toMatch(/plan Pro/);
  });
});
