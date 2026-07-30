import { describe, it, expect } from "vitest";
import { buildMissingInfoBrief, briefHash, type BriefKwFinding } from "./brief";

const kwFinding = (over: Partial<BriefKwFinding> = {}): BriefKwFinding => ({
  id: "f-1",
  ruleId: "R-CLTV",
  status: "WSTRZYMANE",
  title: "Hipoteka w dziale IV",
  clientMessage:
    "W dziale IV widnieje hipoteka. Prześlij zaświadczenie wierzyciela o aktualnym saldzie zadłużenia.",
  expectedFromClient: "Zaświadczenie o saldzie.",
  requestedDocuments: [
    { code: "PAYOFF_TERMS", label: "Zaświadczenie o saldzie i warunkach spłaty" },
  ],
  ...over,
});

const emptyInput = {
  core: { complete: true, missing: [] as any[] },
  progress: null,
  kwFindings: [] as BriefKwFinding[],
  kwResolutionByFindingId: {},
};

describe("buildMissingInfoBrief", () => {
  it("mapuje braki podstawowe na pytania w kanonicznej kolejności", () => {
    const brief = buildMissingInfoBrief({
      ...emptyInput,
      core: { complete: false, missing: ["amount", "kw"] },
    });
    expect(brief.items.map((i) => i.key)).toEqual(["core:amount", "core:kw"]);
    expect(brief.items[0].question).toContain("kwoty");
  });

  it("dodaje pytania z otwartych znalezisk KW (dług na hipotece)", () => {
    const brief = buildMissingInfoBrief({
      ...emptyInput,
      kwFindings: [kwFinding()],
    });
    expect(brief.items).toHaveLength(1);
    expect(brief.items[0].kind).toBe("kw");
    expect(brief.items[0].question).toContain("saldzie");
    expect(brief.items[0].documents).toEqual(["Zaświadczenie o saldzie i warunkach spłaty"]);
  });

  it("pomija znaleziska rozwiązane (VERIFIED/OVERRIDDEN) i informacyjne", () => {
    const brief = buildMissingInfoBrief({
      ...emptyInput,
      kwFindings: [
        kwFinding({ id: "f-1" }),
        kwFinding({ id: "f-2", status: "INFORMACYJNE" }),
        kwFinding({ id: "f-3", status: "STOP" }),
      ],
      kwResolutionByFindingId: { "f-1": "VERIFIED", "f-3": "OVERRIDDEN" },
    });
    expect(brief.items).toHaveLength(0);
  });

  it("zostawia znaleziska w stanie DOCUMENTS_REQUESTED (wciąż czekamy na klienta)", () => {
    const brief = buildMissingInfoBrief({
      ...emptyInput,
      kwFindings: [kwFinding()],
      kwResolutionByFindingId: { "f-1": "DOCUMENTS_REQUESTED" },
    });
    expect(brief.items).toHaveLength(1);
  });

  it("sortuje znaleziska KW po wadze statusu (STOP przed WARUNKOWO)", () => {
    const brief = buildMissingInfoBrief({
      ...emptyInput,
      kwFindings: [
        kwFinding({ id: "a", status: "WARUNKOWO_DOPUSZCZALNE" }),
        kwFinding({ id: "b", status: "STOP" }),
      ],
    });
    expect(brief.items.map((i) => i.key)).toEqual(["kw:R-CLTV:b", "kw:R-CLTV:a"]);
  });

  it("dodaje fallback zgody współwłaścicieli tylko bez reguły R-COOWNERS", () => {
    const withFallback = buildMissingInfoBrief({ ...emptyInput, coownersTotalInKw: 2 });
    expect(withFallback.items.map((i) => i.key)).toEqual(["coowners:consent"]);
    expect(withFallback.items[0].question).toContain("WSZYSTKICH współwłaścicieli");

    const covered = buildMissingInfoBrief({
      ...emptyInput,
      coownersTotalInKw: 2,
      kwFindings: [kwFinding({ ruleId: "R-COOWNERS", id: "c-1" })],
    });
    expect(covered.items.some((i) => i.key === "coowners:consent")).toBe(false);
    expect(covered.items.some((i) => i.key.startsWith("kw:R-COOWNERS"))).toBe(true);
  });

  it("dodaje brakujące dokumenty z postępu wniosku", () => {
    const brief = buildMissingInfoBrief({
      ...emptyInput,
      progress: { missing_documents: ["Wypis z MPZP", "Zdjęcia z zewnątrz"] },
    });
    expect(brief.items.map((i) => i.key)).toEqual(["doc:Wypis z MPZP", "doc:Zdjęcia z zewnątrz"]);
  });

  it("hash jest stabilny względem kolejności i zmienia się przy zmianie zestawu", () => {
    expect(briefHash(["a", "b"])).toBe(briefHash(["b", "a"]));
    expect(briefHash(["a", "b"])).not.toBe(briefHash(["a", "c"]));

    const b1 = buildMissingInfoBrief({
      ...emptyInput,
      core: { complete: false, missing: ["amount"] },
    });
    const b2 = buildMissingInfoBrief({
      ...emptyInput,
      core: { complete: false, missing: ["amount", "kw"] },
    });
    expect(b1.hash).not.toBe(b2.hash);
  });

  it("pusty wniosek bez braków daje pusty brief", () => {
    const brief = buildMissingInfoBrief(emptyInput);
    expect(brief.items).toHaveLength(0);
  });
});
