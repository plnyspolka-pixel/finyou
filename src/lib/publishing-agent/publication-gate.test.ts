import { describe, expect, it } from "vitest";
import { decidePublicationGate, isAiGeneratedMedia } from "./publication-gate";

const STUDIO = "https://x.supabase.co/storage/v1/object/public/studio-media/mcp/studio-napisy/2026-10/a.mp4";
const MATERIAL = "https://x.supabase.co/storage/v1/object/public/studio-media/marketing-materials/1.mp4";

describe("isAiGeneratedMedia", () => {
  it("rozpoznaje rolki Studia, nie kopie materiałów ludzi", () => {
    expect(isAiGeneratedMedia({ videoUrl: STUDIO })).toBe(true);
    expect(isAiGeneratedMedia({ videoUrl: MATERIAL })).toBe(false);
    expect(isAiGeneratedMedia({ videoUrl: MATERIAL, origin: "agent" })).toBe(true);
  });
});

describe("decidePublicationGate", () => {
  it("prawdziwy wpis z kolejki (FB Reel 6.10) przechodzi po dopisaniu AI i KRS", () => {
    const body =
      "Pożyczasz 1,1 mln zł pod nieruchomość wartą 1 mln zł? Nawet sprzedaż za pełną wycenę nie pokryje długu, zabraknie 100 tys. zł. Dlatego przed wpłatą zawsze patrz na LTV: im niższe, tym większy zapas bezpieczeństwa.\n\n👉 Obserwuj po więcej ciekawostek dla inwestorów | financeyou.pl\n\nMateriał edukacyjny, nie stanowi oferty ani rekomendacji inwestycyjnej. Inwestowanie wiąże się z ryzykiem utraty kapitału.";
    const r = decidePublicationGate({
      platform: "facebook_reels",
      title: "LTV powyżej 100%: najprostszy sposób, żeby stracić na pożyczce pod hipotekę 😳",
      body,
      videoUrl: STUDIO,
    });
    expect(r.decision).toBe("fixed");
    expect(r.added).toEqual(["ai_disclosure", "sender_identification"]);
    expect(r.body.startsWith(body)).toBe(true);
    expect(r.body).toContain("KRS 0000635207");
  });

  it("odrzuca obietnicę zysku z powodem", () => {
    const r = decidePublicationGate({
      platform: "instagram_reels",
      title: "Stabilne zyski i minimalne ryzyko",
      body: "Zainwestuj w stabilność!",
      videoUrl: STUDIO,
    });
    expect(r.decision).toBe("reject");
    expect(r.reason).toMatch(/Bramka compliance/);
  });

  it("post tekstowy człowieka bez naruszeń przechodzi bez zmian", () => {
    const r = decidePublicationGate({ platform: "facebook_post", title: "", body: "Zapraszamy na webinar o LTV." });
    expect(r).toMatchObject({ decision: "pass", body: "Zapraszamy na webinar o LTV." });
  });

  it("X: za długi opis do dopisania oznaczeń → odrzucenie", () => {
    const r = decidePublicationGate({ platform: "x", title: "", body: "a".repeat(279), videoUrl: STUDIO });
    expect(r.decision).toBe("reject");
  });

  it("cena w opisie rolki jest blokowana", () => {
    const r = decidePublicationGate({
      platform: "youtube",
      title: "Jak zarabiać na pożyczkach",
      body: "Abonament inwestora 1500 zł / mies. Ryzyko istnieje.",
      videoUrl: STUDIO,
      track: "inwestor",
    });
    expect(r.decision).toBe("reject");
    expect(r.violations.map((v) => v.ruleId)).toContain("price_in_video");
  });
});
