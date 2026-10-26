import { it, expect, vi } from "vitest";
const rows = vi.hoisted(() => [
  { slug: "bank-odmowil-co-dalej", audience: "klient", published: true, title: "PDF", headline: "PDF", benefits: [] },
  { slug: "ile-pod-nieruchomosc", audience: "klient", published: true, title: "ILE", headline: "ILE", benefits: [] },
  { slug: "checklista-dokumentow", audience: "klient", published: false, title: "Hidden", headline: "Hidden", benefits: [] },
  { slug: "kalkulator-raty", audience: "klient", published: false, title: "Hidden tool", headline: "Hidden", benefits: [] },
]);
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => {
  let filtered = [...rows];
  const query = { select: () => query, eq: (key: string, value: unknown) => { filtered = filtered.filter((r) => r[key as keyof typeof r] === value); return query; }, order: () => query, limit: async () => ({ data: filtered, error: null }) };
  return query;
} } }));
import { listFreeMaterials } from "./free-materials.server";
it("lists only published client PDF and tool", async () => {
  const result = await listFreeMaterials("klient");
  expect(result.materials.map((m) => m.slug)).toEqual(["bank-odmowil-co-dalej"]);
  expect(result.tools.map((t) => t.slug)).toEqual(["ile-pod-nieruchomosc"]);
});