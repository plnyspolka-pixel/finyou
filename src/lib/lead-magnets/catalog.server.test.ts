// Provisioning katalogu z plikami w Storage: decyzje o wgraniu / odświeżeniu /
// pozostawieniu pliku i o rekordzie — na atrapie Supabase (bez sieci). PDF
// jest składany naprawdę (kontrola jakości), dlatego test ogranicza się do
// jednego materiału na przypadek.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { id: string; slug: string };
type Query = {
  table: string;
  op: "select" | "update" | "insert";
  filters: Record<string, unknown>;
  payload?: unknown;
};

const fake = vi.hoisted(() => {
  const state = {
    rows: [] as Row[],
    queries: [] as Query[],
    uploads: [] as Array<{ bucket: string; path: string; size: number; opts: unknown }>,
    removed: [] as string[][],
    uploadError: null as string | null,
    updateError: null as string | null,
  };
  function exec(q: Query) {
    state.queries.push(q);
    if (q.table === "user_roles") return { data: { user_id: "admin-1" }, error: null };
    if (q.table !== "lead_magnets") return { data: null, error: null };
    if (q.op === "select") {
      // Jak prawdziwy klient: świeży obiekt, nie referencja do „bazy”.
      const r = state.rows.find((r) => r.slug === q.filters.slug);
      return { data: r ? { ...r } : null, error: null };
    }
    if (q.op === "update") {
      if (state.updateError) return { data: null, error: { message: state.updateError } };
      const r = state.rows.find((r) => r.id === q.filters.id);
      if (r) Object.assign(r, q.payload as object);
      return { data: null, error: null };
    }
    const id = `id-${state.rows.length + 1}`;
    state.rows.push({ id, ...(q.payload as object) } as Row);
    return { data: null, error: null };
  }
  function builder(table: string) {
    const q: Query = { table, op: "select", filters: {} };
    const b = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        q.filters[col] = val;
        return b;
      },
      limit: () => b,
      maybeSingle: () => b,
      update: (p: unknown) => {
        q.op = "update";
        q.payload = p;
        return b;
      },
      insert: (p: unknown) => {
        q.op = "insert";
        q.payload = p;
        return b;
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(exec(q)).then(res, rej),
    };
    return b;
  }
  const supabaseAdmin = {
    from: builder,
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, bytes: Uint8Array, opts: unknown) => {
          state.uploads.push({ bucket, path, size: bytes.byteLength, opts });
          return state.uploadError
            ? { data: null, error: { message: state.uploadError } }
            : { data: { path }, error: null };
        },
        remove: async (paths: string[]) => {
          state.removed.push(paths);
          return { data: null, error: null };
        },
      }),
    },
  };
  return { state, supabaseAdmin };
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: fake.supabaseAdmin }));
vi.mock("@/lib/autopilot/state.server", () => ({ logAutopilot: vi.fn(async () => null) }));

import { ensureCatalogMagnets } from "./catalog.server";
import { CATALOG_VERSION, catalogBySlug, catalogFilePath } from "./catalog";

const SLUG = "checklista-dokumentow";
const m = catalogBySlug(SLUG)!;
const PATH = catalogFilePath(m);
const OLD_PATH = `katalog/${SLUG}/2000-01-01.1/${m.file_name}`;

function reset(rows: Row[] = []) {
  fake.state.rows = rows;
  fake.state.queries = [];
  fake.state.uploads = [];
  fake.state.removed = [];
  fake.state.uploadError = null;
  fake.state.updateError = null;
}

describe("ensureCatalogMagnets — pliki w Storage", () => {
  beforeEach(() => reset());

  it("nowy rekord: PDF wgrany pod ścieżkę z wersją, rekord z file_path i rozmiarem, opublikowany", async () => {
    const [r] = await ensureCatalogMagnets({ publish: true, slugs: [SLUG], actor: "u1" });
    expect(r.problems).toEqual([]);
    expect(r.action).toBe("utworzono i opublikowano");
    expect(r.file).toBe("wgrany");
    expect(r.file_path).toBe(PATH);
    expect(PATH).toContain(`/${CATALOG_VERSION}/`);
    expect(fake.state.uploads).toHaveLength(1);
    expect(fake.state.uploads[0]).toMatchObject({
      bucket: "lead-magnets",
      path: PATH,
      opts: { contentType: "application/pdf", upsert: true },
    });
    expect(fake.state.uploads[0].size).toBeGreaterThan(2000);
    const row = fake.state.rows[0];
    expect(row).toMatchObject({
      slug: SLUG,
      published: true,
      file_path: PATH,
      file_name: m.file_name,
      file_size: fake.state.uploads[0].size,
      mime_type: "application/pdf",
      file_url: null,
      created_by: "u1",
    });
  });

  it("rekord bez pliku: dostaje plik (bez ruszania copy), rekord z plikiem ze starej wersji: nowy plik, stary usunięty", async () => {
    reset([
      { id: "a", slug: SLUG, published: true, file_path: null, file_url: null, file_name: null },
    ]);
    let [r] = await ensureCatalogMagnets({ publish: false, slugs: [SLUG], actor: "u1" });
    expect(r.action).toBe("wgrano PDF");
    expect(r.file).toBe("wgrany");
    expect(r.published).toBe(true);
    const patch = fake.state.queries.find((q) => q.op === "update")!.payload as Record<
      string,
      unknown
    >;
    expect(Object.keys(patch).sort()).toEqual(
      ["file_name", "file_path", "file_size", "file_url", "mime_type"].sort(),
    );
    expect(patch.file_path).toBe(PATH);
    expect(fake.state.removed).toEqual([]);

    reset([
      {
        id: "a",
        slug: SLUG,
        published: true,
        file_path: OLD_PATH,
        file_url: null,
        file_name: m.file_name,
      },
    ]);
    [r] = await ensureCatalogMagnets({ publish: true, slugs: [SLUG], actor: "u1" });
    expect(r.action).toBe("wgrano PDF");
    expect(r.file_path).toBe(PATH);
    expect(fake.state.uploads.map((u) => u.path)).toEqual([PATH]);
    expect(fake.state.removed).toEqual([[OLD_PATH]]);
    expect(fake.state.rows[0].file_path).toBe(PATH);
  });

  it("plik aktualny: bez uploadu i bez zmian; refreshFiles składa ponownie pod tą samą ścieżką", async () => {
    const row = {
      id: "a",
      slug: SLUG,
      published: true,
      file_path: PATH,
      file_url: null,
      file_name: m.file_name,
    };
    reset([{ ...row }]);
    let [r] = await ensureCatalogMagnets({ publish: true, slugs: [SLUG], actor: "u1" });
    expect(r.action).toBe("bez zmian");
    expect(r.file).toBe("aktualny");
    expect(fake.state.uploads).toEqual([]);
    expect(fake.state.queries.some((q) => q.op === "update")).toBe(false);

    reset([{ ...row }]);
    [r] = await ensureCatalogMagnets({
      publish: false,
      refreshFiles: true,
      slugs: [SLUG],
      actor: "u1",
    });
    expect(r.action).toBe("odświeżono PDF");
    expect(r.file).toBe("odświeżony");
    expect(fake.state.uploads.map((u) => u.path)).toEqual([PATH]);
    expect(fake.state.removed).toEqual([]);
  });

  it("własny plik albo adres zespołu: provisioning go nie rusza (także przy overwrite)", async () => {
    reset([
      {
        id: "a",
        slug: SLUG,
        published: false,
        file_path: "klient/abc.pdf",
        file_url: null,
        file_name: "moj.pdf",
      },
    ]);
    let [r] = await ensureCatalogMagnets({
      publish: true,
      overwrite: true,
      slugs: [SLUG],
      actor: "u1",
    });
    expect(r.file).toBe("własny");
    expect(r.file_path).toBe("klient/abc.pdf");
    expect(fake.state.uploads).toEqual([]);
    const patch = fake.state.queries.find((q) => q.op === "update")!.payload as Record<
      string,
      unknown
    >;
    expect(patch.published).toBe(true);
    expect(patch.title).toBe(m.title);
    for (const k of ["file_path", "file_url", "file_name", "file_size", "mime_type"])
      expect(k in patch).toBe(false);
    expect(fake.state.rows[0]).toMatchObject({ file_path: "klient/abc.pdf", file_name: "moj.pdf" });

    reset([
      {
        id: "a",
        slug: SLUG,
        published: true,
        file_path: null,
        file_url: "https://cdn.test/x.pdf",
        file_name: "x.pdf",
      },
    ]);
    [r] = await ensureCatalogMagnets({ publish: true, slugs: [SLUG], actor: "u1" });
    expect(r.file).toBe("własny");
    expect(r.action).toBe("bez zmian");
    expect(fake.state.uploads).toEqual([]);
  });

  it("błąd Storage: problem w raporcie, rekord bez pliku (pobranie składa PDF w locie)", async () => {
    fake.state.uploadError = "Bucket not found";
    const [r] = await ensureCatalogMagnets({ publish: true, slugs: [SLUG], actor: "u1" });
    expect(r.file).toBe("błąd");
    expect(r.problems).toEqual(["storage: Bucket not found"]);
    expect(r.action).toBe("utworzono i opublikowano");
    expect(fake.state.rows[0]).toMatchObject({
      file_path: null,
      file_name: m.file_name,
      published: true,
    });
  });

  it("dry run: tylko raport stanu pliku, bez uploadu i zapisu", async () => {
    reset([
      {
        id: "a",
        slug: SLUG,
        published: true,
        file_path: OLD_PATH,
        file_url: null,
        file_name: m.file_name,
      },
    ]);
    const [r] = await ensureCatalogMagnets({ publish: true, dryRun: true, slugs: [SLUG] });
    expect(r.action).toBe("istnieje (opublikowany)");
    expect(r.file).toBe("nieaktualny");
    expect(r.file_path).toBe(OLD_PATH);
    expect(fake.state.uploads).toEqual([]);
    expect(fake.state.queries.every((q) => q.op === "select")).toBe(true);

    reset();
    const [n] = await ensureCatalogMagnets({ publish: true, dryRun: true, slugs: [SLUG] });
    expect(n).toMatchObject({ action: "brak", file: "brak", file_path: null, published: false });
  });
});
