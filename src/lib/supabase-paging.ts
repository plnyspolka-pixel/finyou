// Supabase/PostgREST zwraca maksymalnie 1000 wierszy na zapytanie — także
// wtedy, gdy .limit() prosi o więcej. Bez paginacji wyniki są PO CICHU
// ucinane: tak właśnie lista wniosków „gubiła" dokumenty (1500+ rekordów
// documents przy limicie 1000) i pokazywała „brak plików" przy wnioskach,
// które pliki mają.
//
// Builder MUSI nakładać stabilne sortowanie (np. .order("id")) i przekazany
// zakres przez .range(from, to) — inaczej strony mogą się nakładać/pomijać.

export async function fetchAllRows<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
  opts?: { pageSize?: number; maxPages?: number },
): Promise<T[]> {
  const pageSize = opts?.pageSize ?? 1000;
  const maxPages = opts?.maxPages ?? 50;
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) {
      console.error("[fetchAllRows] page error", error.message ?? error);
      break;
    }
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}
