// Stronicowane czytanie dużych zbiorów (kampanie mailowe, segmenty).
//
// Powód: pojedyncze `.limit(5000)` / `.limit(10000)` to jedno wielkie zapytanie,
// które przy rosnącej bazie wpada w `statement timeout` (57014) i wywraca całą
// wysyłkę — a przy okazji dokłada się do obciążenia widocznego jako 504 na
// logowaniu. Kilka mniejszych stron kosztuje tyle samo w sumie, ale żadna z nich
// nie zbliża się do limitu czasu.
//
// Zapytanie MUSI mieć deterministyczne sortowanie (np. `.order("id")`),
// inaczej kolejne strony mogą się nakładać albo gubić wiersze.

export type PagedResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAllPaged<T>(
  makeQuery: (from: number, to: number) => PromiseLike<PagedResult<T>>,
  opts: { pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 1000;
  const maxRows = opts.maxRows ?? 50_000;
  const out: T[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize, maxRows) - 1;
    const { data, error } = await makeQuery(from, to);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < to - from + 1) break; // ostatnia strona
  }

  return out;
}
