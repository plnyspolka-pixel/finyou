import { beforeAll, describe, expect, it } from "vitest";
import type { ToolContext } from "@lovable.dev/mcp-js";
import scenariusz from "@/lib/contract-engine/fixtures/scenariusz_01_podstawowy.json";
import { contractTools, draftContract, getContractSchema } from "./contracts";

const ctx = {
  isAuthenticated: () => true,
  getToken: () => "test-token",
  getUserId: () => "00000000-0000-0000-0000-000000000001",
  getUserEmail: () => "test@example.com",
} as unknown as ToolContext;

type Result = { isError?: boolean; structuredContent?: Record<string, any> };
const call = async (tool: any, args: Record<string, unknown>) =>
  (await tool.handler(args, ctx)) as Result;

beforeAll(() => {
  process.env.SUPABASE_URL ??= "http://localhost:54321";
  process.env.SUPABASE_PUBLISHABLE_KEY ??= "test-key";
});

describe("draft_contract", () => {
  it("kompletny szkic przechodzi walidację i daje podgląd", async () => {
    const r = await call(draftContract, {
      umowa: structuredClone(scenariusz),
      preview: true,
    });
    expect(r.isError).toBeFalsy();
    const out = r.structuredContent!;
    expect(out.problemy.bledy).toEqual([]);
    expect(out.blocked).toBe(false);
    expect(out.preview_text).toContain("UMOWA");
    // podgląd obejmuje cały komplet — ten sam tekst co plik .docx
    for (const czesc of [
      "WNIOSEK O UDZIELENIE POŻYCZKI PIENIĘŻNEJ",
      "UMOWA POŻYCZKI",
      "ZAŁĄCZNIK NR 1 DO UMOWY POŻYCZKI",
      "ZAŁĄCZNIK NR 2 DO UMOWY POŻYCZKI",
      "ZAŁĄCZNIK NR 3 DO UMOWY POŻYCZKI",
    ])
      expect(out.preview_text).toContain(czesc);
  });

  it("numer KW bez zer jest normalizowany, błędna cyfra kontrolna blokuje", async () => {
    const dane: any = structuredClone(scenariusz);
    const nr = dane.nieruchomosci[0].nr_kw as string;
    const [sad, num, cyfra] = nr.split("/");
    dane.nieruchomosci[0].nr_kw = `${sad}/${String(Number(num))}/${cyfra}`;
    const ok = (await call(draftContract, { umowa: dane, preview: false })).structuredContent!;
    expect(ok.umowa.nieruchomosci[0].nr_kw).toBe(nr);
    dane.nieruchomosci[0].nr_kw = `${sad}/${num}/${(Number(cyfra) + 1) % 10}`;
    const zly = (await call(draftContract, { umowa: dane, preview: false })).structuredContent!;
    expect(zly.blocked).toBe(true);
    expect(zly.problemy.bledy.map((b: any) => b.sciezka)).toContain("nieruchomosci[0].nr_kw");
  });

  it("łatka usuwająca kwotę blokuje umowę i nie daje podglądu", async () => {
    const r = await call(draftContract, {
      umowa: structuredClone(scenariusz),
      patch: { warunki: { kwota_pozyczki: null } },
    });
    const out = r.structuredContent!;
    expect(out.blocked).toBe(true);
    expect(out.problemy.bledy.length).toBeGreaterThan(0);
    expect(out.preview_text).toBeNull();
  });
});

describe("get_contract_schema", () => {
  it("zwraca schemat, zasady i listę klauzul", async () => {
    const r = await call(getContractSchema, { include_clauses: true });
    const out = r.structuredContent!;
    expect(out.schema).toContain("KORZEŃ");
    expect(out.rules.length).toBeGreaterThan(3);
    expect(out.clauses.length).toBeGreaterThan(10);
  });
});

describe("get_generated_document_text", () => {
  it("jest zarejestrowane wśród narzędzi umów", () => {
    const t = contractTools.find((x: any) => x.name === "get_generated_document_text") as any;
    expect(t).toBeTruthy();
    expect(t.annotations.readOnlyHint).toBe(true);
  });
});
