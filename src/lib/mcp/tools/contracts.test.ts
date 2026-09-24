import { beforeAll, describe, expect, it } from "vitest";
import type { ToolContext } from "@lovable.dev/mcp-js";
import scenariusz from "@/lib/contract-engine/fixtures/scenariusz_01_podstawowy.json";
import { draftContract, getContractSchema } from "./contracts";

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
