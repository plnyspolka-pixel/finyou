// Minimalny Supabase w pamięci do testów modułów serwerowych: from(t)
// .select / .update / .insert z .eq / .is / .in, .maybeSingle / .single,
// .order / .limit (bez znaczenia). Wystarcza tam, gdzie test sprawdza
// kolejność zapisów i warunki (np. „zapisz tylko, gdy kolumna jest NULL").
type Row = Record<string, unknown>;

export type FakeDb = {
  tables: Record<string, Row[]>;
  /** Log zapisów: [tabela, patch]. */
  updates: Array<[string, Row]>;
  inserts: Array<[string, Row]>;
  from: (table: string) => any;
};

export function createFakeSupabase(tables: Record<string, Row[]> = {}): FakeDb {
  const db: FakeDb = {
    tables,
    updates: [],
    inserts: [],
    from(table: string) {
      const rows = (db.tables[table] ??= []);
      const filters: Array<(r: Row) => boolean> = [];
      let mode: "select" | "update" | "insert" = "select";
      let patch: Row = {};
      let inserted: Row[] = [];
      const run = () => {
        if (mode === "insert") return { data: inserted, error: null };
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (mode === "update") {
          for (const r of hit) Object.assign(r, patch);
          db.updates.push([table, patch]);
        }
        return { data: hit.map((r) => ({ ...r })), error: null };
      };
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
        is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
        order: () => q,
        limit: () => q,
        update: (p: Row) => ((mode = "update"), (patch = p), q),
        insert: (p: Row | Row[]) => {
          mode = "insert";
          inserted = Array.isArray(p) ? p : [p];
          for (const r of inserted) {
            rows.push({ ...r });
            db.inserts.push([table, r]);
          }
          return q;
        },
        maybeSingle: async () => {
          const r = run();
          return { data: r.data[0] ?? null, error: null };
        },
        single: async () => {
          const r = run();
          return r.data[0]
            ? { data: r.data[0], error: null }
            : { data: null, error: { message: "not found" } };
        },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(run()).then(res, rej),
      };
      return q;
    },
  };
  return db;
}
