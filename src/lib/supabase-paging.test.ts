import { describe, it, expect } from "vitest";
import { fetchAllPaged } from "./supabase-paging.server";

/**
 * Stronicowanie dużych odczytów. Kluczowe: wczytać komplet, nie zapętlić się
 * i nie połknąć błędu (bo cicho przycięta lista = cicho przycięta wysyłka).
 */

function zrodlo(wiersze: number[]) {
  const wywolania: [number, number][] = [];
  const makeQuery = async (from: number, to: number) => {
    wywolania.push([from, to]);
    return { data: wiersze.slice(from, to + 1), error: null };
  };
  return { makeQuery, wywolania };
}

describe("fetchAllPaged", () => {
  it("skleja wszystkie strony po kolei", async () => {
    const dane = Array.from({ length: 25 }, (_, i) => i);
    const { makeQuery, wywolania } = zrodlo(dane);

    const out = await fetchAllPaged(makeQuery, { pageSize: 10 });

    expect(out).toEqual(dane);
    expect(wywolania).toEqual([
      [0, 9],
      [10, 19],
      [20, 29],
    ]);
  });

  it("kończy na niepełnej stronie, bez dodatkowego zapytania", async () => {
    const { makeQuery, wywolania } = zrodlo([1, 2, 3]);
    const out = await fetchAllPaged(makeQuery, { pageSize: 10 });

    expect(out).toEqual([1, 2, 3]);
    expect(wywolania).toHaveLength(1);
  });

  it("pusty zbiór to jedno zapytanie i pusta lista", async () => {
    const { makeQuery, wywolania } = zrodlo([]);
    expect(await fetchAllPaged(makeQuery, { pageSize: 10 })).toEqual([]);
    expect(wywolania).toHaveLength(1);
  });

  it("nie przekracza maxRows, nawet gdy danych jest więcej", async () => {
    const dane = Array.from({ length: 100 }, (_, i) => i);
    const { makeQuery, wywolania } = zrodlo(dane);

    const out = await fetchAllPaged(makeQuery, { pageSize: 10, maxRows: 30 });

    expect(out).toHaveLength(30);
    expect(wywolania).toHaveLength(3);
  });

  it("błąd zapytania wychodzi na wierzch", async () => {
    const makeQuery = async () => ({ data: null, error: { message: "statement timeout" } });
    await expect(fetchAllPaged(makeQuery, { pageSize: 10 })).rejects.toThrow("statement timeout");
  });
});
