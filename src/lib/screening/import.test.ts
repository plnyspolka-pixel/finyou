// Testy integracyjne runnera importu na zapisanych próbkach odpowiedzi źródeł
// (fetch podmieniony na fixtures, baza in-memory z src/test/fake-supabase.ts).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFakeDb, type FakeDbImpl } from "@/test/fake-supabase";

// Moduły serwerowe zapamiętują klienta przy imporcie — jedna instancja, czyszczona przed testem.
const db: FakeDbImpl = vi.hoisted(() => ({}) as FakeDbImpl);
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

const fx = (name: string) => readFileSync(join(__dirname, "sources", "__fixtures__", name), "utf8");
let responses: Record<string, () => Response>;

beforeEach(() => {
  const fresh = createFakeDb();
  Object.setPrototypeOf(db, Object.getPrototypeOf(fresh));
  Object.assign(db, fresh);
  db.tables.screening_settings = [
    {
      id: 1,
      sources: {
        eu_fsf: { enabled: true, url: "https://eu.test/fsf" },
        sejm_api: { enabled: true, base_url: "https://sejm.test", terms_back: 1 },
        kprm: { enabled: true, url: "https://kprm.test" },
      },
    },
  ];
  db.tables.screening_audit_log = [];
  const enqueued: unknown[] = [];
  db.rpcHandlers.screening_enqueue_portfolio = (p) => {
    enqueued.push(p);
    return 7;
  };
  (db as unknown as { enqueued: unknown[] }).enqueued = enqueued;
  responses = {
    "https://eu.test/fsf": () => new Response(fx("eu_fsf_sample.xml")),
    "https://sejm.test/term": () =>
      new Response(JSON.stringify([{ num: 10, from: "2023-11-13", current: true }])),
    "https://sejm.test/term10/MP": () => new Response(fx("sejm_term10_mp_sample.json")),
    "https://kprm.test": () => new Response(fx("kprm_sample.html")),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const key = String(url).split("?")[0];
      const r = responses[key];
      return r ? r() : new Response("not found", { status: 404 });
    }),
  );
});

describe("import listy sankcyjnej UE", () => {
  it("zapisuje rekordy, indeks nazw, sumę kontrolną i log audytowy", async () => {
    const { importSanctions } = await import("./import.server");
    const r = await importSanctions("eu_fsf");
    expect(r.status).toBe("success");
    expect(r.recordCount).toBe(4);
    expect(db.tables.sanctions_reference_entries).toHaveLength(4);
    expect(db.tables.screening_name_index.length).toBeGreaterThan(4);
    const imp = db.tables.screening_source_imports[0];
    expect(imp.status).toBe("success");
    expect(imp.file_checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(db.tables.screening_audit_log.some((a) => a.event_type === "import.success")).toBe(true);
    // Pierwszy import nie uruchamia rescreeningu (brak wcześniejszej wersji listy).
    expect((db as unknown as { enqueued: unknown[] }).enqueued).toHaveLength(0);
  });

  it("jest idempotentny: ta sama treść → status „bez zmian”", async () => {
    const { importSanctions } = await import("./import.server");
    await importSanctions("eu_fsf");
    const r = await importSanctions("eu_fsf");
    expect(r.status).toBe("unchanged");
    expect(db.tables.sanctions_reference_entries).toHaveLength(4);
  });

  it("nie nadpisuje danych pustym wynikiem", async () => {
    const { importSanctions } = await import("./import.server");
    await importSanctions("eu_fsf");
    responses["https://eu.test/fsf"] = () => new Response('<?xml version="1.0"?><export></export>');
    const r = await importSanctions("eu_fsf");
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/0 rekordów/);
    expect(db.tables.sanctions_reference_entries.filter((e) => e.is_active)).toHaveLength(4);
  });

  it("zmiana listy: dezaktywuje usunięte wpisy i uruchamia rescreening sankcyjny", async () => {
    const { importSanctions } = await import("./import.server");
    await importSanctions("eu_fsf");
    const xml = fx("eu_fsf_sample.xml");
    const firstEntity = xml.match(/<sanctionEntity[\s\S]*?<\/sanctionEntity>/)![0];
    responses["https://eu.test/fsf"] = () => new Response(xml.replace(firstEntity, ""));
    const r = await importSanctions("eu_fsf");
    expect(r.status).toBe("success");
    expect(r.deactivated).toBe(1);
    expect(db.tables.sanctions_reference_entries.filter((e) => e.is_active)).toHaveLength(3);
    expect((db as unknown as { enqueued: unknown[] }).enqueued).toEqual([
      { p_scope: "sanctions", p_trigger: "list_change" },
    ]);
  });

  it("ponawia pobieranie po błędzie 503", async () => {
    const { importSanctions } = await import("./import.server");
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0;
    }) as unknown as typeof setTimeout);
    let calls = 0;
    responses["https://eu.test/fsf"] = () => {
      calls++;
      return calls < 2
        ? new Response("busy", { status: 503 })
        : new Response(fx("eu_fsf_sample.xml"));
    };
    const r = await importSanctions("eu_fsf");
    vi.restoreAllMocks();
    expect(r.status).toBe("success");
    expect(calls).toBe(2);
  });
});

describe("import PEP", () => {
  it("API Sejmu: posłowie z datą urodzenia i stanowiskiem z katalogu", async () => {
    const { importSejm } = await import("./import.server");
    const r = await importSejm();
    expect(r.status).toBe("success");
    const rows = db.tables.pep_reference_persons;
    expect(rows).toHaveLength(3);
    expect(rows.every((p) => p.source === "sejm_api" && p.birth_date)).toBe(true);
    expect(rows[0].positions[0].catalogCode).toBe("PL-007");
  });

  it("KPRM: osoba, która zniknęła ze składu, dostaje datę końca i zostaje w bazie", async () => {
    const { importKprm } = await import("./import.server");
    await importKprm();
    expect(db.tables.pep_reference_persons).toHaveLength(5);
    const html = fx("kprm_sample.html");
    const items = html.match(/<li>[\s\S]*?<\/li>/g)!;
    responses["https://kprm.test"] = () => new Response(html.replace(items[4], ""));
    // Kolejny import musi mieć późniejszy znacznik czasu startu.
    await new Promise((r) => setTimeout(r, 5));
    const r = await importKprm();
    expect(r.status).toBe("success");
    expect(r.deactivated).toBe(1);
    const gone = db.tables.pep_reference_persons.find((p) => !p.is_current)!;
    expect(gone).toBeDefined();
    expect(gone.latest_position_end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(gone.positions[0].to).toBe(gone.latest_position_end);
    expect(db.tables.pep_reference_persons).toHaveLength(5);
  });
});

describe("status czasowy PEP", () => {
  it("12 miesięcy karencji po zakończeniu funkcji", async () => {
    const { pepTimeStatus } = await import("./import.server");
    const now = new Date("2026-10-09T00:00:00Z");
    expect(pepTimeStatus({ is_current: true, latest_position_end: null }, 12, now)).toBe("current");
    expect(pepTimeStatus({ is_current: false, latest_position_end: "2026-01-01" }, 12, now)).toBe(
      "within_grace",
    );
    expect(pepTimeStatus({ is_current: false, latest_position_end: "2024-01-01" }, 12, now)).toBe(
      "former",
    );
  });
});
