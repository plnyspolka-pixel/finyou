import { describe, expect, it } from "vitest";
import { applyFilters, capped, supabaseTools } from "./supabase";

/** Zapisuje wywołania metod zapytania PostgREST zamiast je wykonywać. */
function recorder() {
  const calls: unknown[][] = [];
  const q: any = new Proxy(
    {},
    {
      get:
        (_, prop: string) =>
        (...args: unknown[]) => {
          calls.push([prop, ...args]);
          return q;
        },
    },
  );
  return { q, calls };
}

describe("applyFilters", () => {
  it("mapuje operatory na metody zapytania", () => {
    const { q, calls } = recorder();
    applyFilters(q, [
      { column: "status", op: "eq", value: "new" },
      { column: "amount", op: "gte", value: 1000 },
      { column: "id", op: "in", value: ["a", "b"] },
      { column: "deleted_at", op: "is", value: null },
      { column: "email", op: "ilike", value: "%@example.com" },
    ]);
    expect(calls).toEqual([
      ["eq", "status", "new"],
      ["gte", "amount", 1000],
      ["in", "id", ["a", "b"]],
      ["is", "deleted_at", null],
      ["ilike", "email", "%@example.com"],
    ]);
  });

  it("odrzuca błędne wartości", () => {
    const { q } = recorder();
    expect(() => applyFilters(q, [{ column: "id", op: "in", value: "a" }])).toThrow(/tablicą/);
    expect(() => applyFilters(q, [{ column: "x", op: "is", value: "null" }])).toThrow(/null/);
    expect(() => applyFilters(q, [{ column: "x", op: "eq" }])).toThrow(/brak value/);
  });
});

describe("capped", () => {
  it("przycina duże wyniki", () => {
    const big = { rows: Array.from({ length: 5000 }, (_, i) => ({ i, pad: "x".repeat(20) })) };
    const r = capped(big);
    expect(r.structuredContent).toMatchObject({ truncated: true });
    expect(capped({ rows: [1] }).structuredContent).toEqual({ rows: [1] });
  });
});

describe("supabase tools", () => {
  it("mają unikalne nazwy z prefiksem supabase_", () => {
    const names = supabaseTools.map((t: any) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^supabase_/);
  });

  it("wymagają logowania", async () => {
    const ctx = { isAuthenticated: () => false } as any;
    for (const t of supabaseTools as any[]) {
      const r = await t.handler({ table: "leads", filters: [] }, ctx);
      expect(r.isError).toBe(true);
    }
  });
});
