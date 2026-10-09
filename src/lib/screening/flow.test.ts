// Test przepływu end-to-end (baza in-memory, źródła z zapisanych próbek):
// import → klient → trafienie → sprawa → decyzja → pamięć fałszywego trafienia
// → zmiana danych → oświadczenie „tak” → trafienie sankcyjne → wstrzymanie.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFakeDb, type FakeDbImpl } from "@/test/fake-supabase";

const db: FakeDbImpl = vi.hoisted(() => ({}) as FakeDbImpl);
const emails = vi.hoisted(() => [] as Array<{ to: string; subject: string; text: string }>);
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));
vi.mock("@/lib/resend-send.server", () => ({
  sendResendEmail: vi.fn(async (m: { to: string; subject: string; text: string }) => {
    emails.push(m);
    return { ok: true };
  }),
}));

const fx = (name: string) => readFileSync(join(__dirname, "sources", "__fixtures__", name), "utf8");

// PESEL z prawidłową cyfrą kontrolną (data urodzenia 1959-01-04 / 1959-01-05).
const PESEL_1959_01_04 = "59010412347";
const PESEL_1959_01_05 = "59010512344";

beforeEach(() => {
  const fresh = createFakeDb();
  Object.setPrototypeOf(db, Object.getPrototypeOf(fresh));
  Object.assign(db, fresh);
  emails.length = 0;
  db.tables.screening_settings = [
    {
      id: 1,
      aml_officer_emails: ["aml@financeyou.test"],
      board_emails: ["zarzad@financeyou.test"],
      sources: {
        eu_fsf: { enabled: true, url: "https://eu.test/fsf" },
        sejm_api: { enabled: true, base_url: "https://sejm.test", terms_back: 1 },
      },
    },
  ];
  db.tables.screening_audit_log = [];
  // Wstępna selekcja: w bazie robi to pg_trgm; tu zwracamy wszystkie aktywne klucze (scoring decyduje).
  db.rpcHandlers.screening_find_candidates = (p) => {
    const seen = new Set<string>();
    return (db.tables.screening_name_index ?? [])
      .filter((r) => r.is_active && (p.p_reference_types as string[]).includes(r.reference_type))
      .filter((r) => !seen.has(r.reference_id) && seen.add(r.reference_id))
      .map((r) => ({
        reference_type: r.reference_type,
        reference_id: r.reference_id,
        best_similarity: 1,
      }));
  };
  db.rpcHandlers.screening_enqueue_portfolio = () => 0;
  const responses: Record<string, () => Response> = {
    "https://eu.test/fsf": () => new Response(fx("eu_fsf_sample.xml")),
    "https://sejm.test/term": () =>
      new Response(JSON.stringify([{ num: 10, from: "2023-11-13", current: true }])),
    "https://sejm.test/term10/MP": () => new Response(fx("sejm_term10_mp_sample.json")),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      (responses[String(url).split("?")[0]] ?? (() => new Response("", { status: 404 })))(),
    ),
  );
});

async function loadSources() {
  const { importSejm, importSanctions } = await import("./import.server");
  expect((await importSejm()).status).toBe("success");
  expect((await importSanctions("eu_fsf")).status).toBe("success");
}

const queueItem = (table: "clients" | "pep_declarations", id: string, trigger = "onboarding") =>
  ({ id: 0, source_table: table, source_id: id, trigger, scope: "all", attempts: 0 }) as never;

describe("przepływ screeningu", () => {
  it("silne trafienie PEP → sprawa z wstrzymaniem → fałszywe trafienie zapamiętane do zmiany danych", async () => {
    await loadSources();
    const { processQueueItem } = await import("./queue.server");
    const { decideCase } = await import("./decisions.server");
    db.tables.clients = [
      {
        id: "c1",
        first_name: "Andrzej",
        last_name: "Adamczyk",
        pesel: PESEL_1959_01_04,
        country: "PL",
      },
    ];
    db.tables.loan_applications = [{ id: "l1", client_id: "c1", status: "nowy_lead" }];

    const [r1] = await processQueueItem(queueItem("clients", "c1"));
    expect(r1.result).toBe("strong_match");
    const [case1] = db.tables.screening_cases;
    expect(case1).toMatchObject({ case_type: "pep", priority: "high", application_hold: true });
    expect(db.tables.loan_applications[0].aml_status).toBe("wstrzymany_screening");
    // Powiadomienie bez danych osobowych klienta (RODO: tylko nr sprawy i link).
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe("aml@financeyou.test");
    expect(emails[0].text).not.toMatch(/Adamczyk/);

    // Decyzja bez uzasadnienia jest odrzucana; z uzasadnieniem — zapisana i ostateczna.
    await expect(
      decideCase({
        caseId: case1.id,
        decision: "false_positive",
        justification: "nie",
        actorId: "u1",
      }),
    ).rejects.toThrow(/Uzasadnienie/);
    await decideCase({
      caseId: case1.id,
      decision: "false_positive",
      justification: "Inny poseł — sprawdzono dowód osobisty klienta.",
      actorId: "u1",
    });
    expect(db.tables.screening_false_positives).toHaveLength(1);
    expect(db.tables.loan_applications[0].aml_status).toBe("zweryfikowany_screening");
    await expect(
      decideCase({
        caseId: case1.id,
        decision: "confirmed_pep",
        justification: "zmiana zdania po fakcie",
        actorId: "u1",
      }),
    ).rejects.toThrow(/ostateczna/);

    // Rescreening: ta sama para nie tworzy nowej sprawy.
    const [r2] = await processQueueItem(queueItem("clients", "c1", "rescreening"));
    expect(r2.result).toBe("no_hits");
    expect(db.tables.screening_cases).toHaveLength(1);
    expect(db.tables.screening_hits.some((h) => h.status === "suppressed_false_positive")).toBe(
      true,
    );
    expect(db.tables.screening_subject_status[0].pep_status).toBe("none");

    // Zmiana danych klienta (inny PESEL → inna data) → para wraca do weryfikacji.
    db.tables.clients[0].pesel = PESEL_1959_01_05;
    const [r3] = await processQueueItem(queueItem("clients", "c1", "data_change"));
    expect(r3.result).toBe("possible_match");
    expect(db.tables.screening_cases).toHaveLength(2);
    expect(db.tables.screening_cases[1]).toMatchObject({
      application_hold: false,
      priority: "normal",
    });
  });

  it("brak trafień i oświadczenie „nie” → zamknięcie automatem z wpisem w logu", async () => {
    await loadSources();
    const { processQueueItem } = await import("./queue.server");
    db.tables.clients = [
      {
        id: "c2",
        first_name: "Bożena",
        last_name: "Testowa-Przykładowa",
        pesel: null,
        country: "PL",
      },
    ];
    db.tables.pep_declarations = [
      {
        id: "d0",
        subject_type: "client",
        subject_id: "c2",
        any_yes: false,
        signed_at: "2026-10-09T10:00:00Z",
        related_persons: [],
      },
    ];
    const [r] = await processQueueItem(queueItem("clients", "c2"));
    expect(r.result).toBe("no_hits");
    expect(db.tables.screening_cases ?? []).toHaveLength(0);
    expect(db.tables.screening_subject_status[0]).toMatchObject({
      pep_status: "none",
      sanctions_status: "none",
    });
    expect(
      db.tables.screening_audit_log.some(
        (a) => a.event_type === "run.finished" && a.details.result === "no_hits",
      ),
    ).toBe(true);
  });

  it("oświadczenie „tak” tworzy sprawę niezależnie od automatu, a osoba wskazana przechodzi screening", async () => {
    await loadSources();
    const { processQueueItem } = await import("./queue.server");
    db.tables.clients = [
      {
        id: "c3",
        first_name: "Celina",
        last_name: "Nowakowska-Testowa",
        pesel: null,
        country: "PL",
      },
    ];
    db.tables.pep_declarations = [
      {
        id: "d1",
        subject_type: "client",
        subject_id: "c3",
        any_yes: true,
        signed_at: "2026-10-09T10:00:00Z",
        related_persons: [
          {
            relation: "family",
            family_relation: "parent",
            first_name: "Andrzej",
            last_name: "Adamczyk",
            position: "poseł",
          },
        ],
      },
    ];
    const results = await processQueueItem(queueItem("pep_declarations", "d1", "declaration"));
    expect(results.map((r) => r.result).sort()).toEqual(["declaration_yes", "possible_match"]);
    const types = db.tables.screening_cases.map((c) => c.case_type).sort();
    expect(types).toEqual(["declaration", "pep"]);
    const related = db.tables.screening_subjects.find((s) => s.subject_type === "related_person");
    expect(related).toMatchObject({ full_name: "Andrzej Adamczyk", relation: "family:parent" });
    // Ponowny screening nie duplikuje sprawy z tego samego oświadczenia.
    await processQueueItem(queueItem("clients", "c3", "rescreening"));
    expect(db.tables.screening_cases.filter((c) => c.case_type === "declaration")).toHaveLength(1);
  });

  it("trafienie sankcyjne: priorytet krytyczny, a potwierdzenie wstrzymuje operacje i powiadamia AML i zarząd", async () => {
    await loadSources();
    const { processQueueItem } = await import("./queue.server");
    const { decideCase } = await import("./decisions.server");
    db.tables.clients = [
      {
        id: "c4",
        first_name: "Saddam",
        last_name: "Hussein Al-Tikriti",
        pesel: null,
        country: "IQ",
      },
    ];
    const [r] = await processQueueItem(queueItem("clients", "c4"));
    // Klient bez daty urodzenia → wynik ograniczony do „do weryfikacji”, ale przy identycznej nazwie
    // na liście sankcyjnej sprawa ma priorytet krytyczny i wstrzymuje wniosek.
    expect(r.result).toBe("possible_match");
    const c = db.tables.screening_cases.find((x) => x.case_type === "sanctions")!;
    expect(c).toMatchObject({ priority: "critical", application_hold: true });
    emails.length = 0;
    await decideCase({
      caseId: c.id,
      decision: "sanctions_hit",
      justification: "Zgodność z wpisem EU.27.28 potwierdzona dokumentem.",
      actorId: "u2",
    });
    const st = db.tables.screening_subject_status.find((s) => s.subject_id === c.subject_id)!;
    expect(st).toMatchObject({ sanctions_status: "hit", operations_hold: true });
    expect(emails.map((e) => e.to).sort()).toEqual([
      "aml@financeyou.test",
      "zarzad@financeyou.test",
    ]);
    expect(emails[0].text).toMatch(/GIIF/);
  });

  it("potwierdzony PEP wymaga akceptacji zarządu ze źródłem majątku i załącznikiem", async () => {
    await loadSources();
    const { processQueueItem } = await import("./queue.server");
    const { decideCase, approveBoard, saveSourceOfWealth } = await import("./decisions.server");
    db.tables.clients = [
      {
        id: "c5",
        first_name: "Andrzej",
        last_name: "Adamczyk",
        pesel: PESEL_1959_01_04,
        country: "PL",
      },
    ];
    await processQueueItem(queueItem("clients", "c5"));
    const c = db.tables.screening_cases[0];
    await decideCase({
      caseId: c.id,
      decision: "confirmed_pep",
      justification: "Potwierdzona tożsamość posła (data urodzenia, PESEL).",
      actorId: "u1",
    });
    const st = () => db.tables.screening_subject_status.find((s) => s.subject_id === c.subject_id)!;
    expect(st()).toMatchObject({
      pep_status: "pep",
      enhanced_monitoring: true,
      board_approval_required: true,
      operations_hold: true,
    });
    await expect(
      approveBoard({
        subjectId: c.subject_id,
        note: "Akceptuję relację z klientem.",
        actorId: "board",
      }),
    ).rejects.toThrow(/źródło majątku/);
    await saveSourceOfWealth({
      subjectId: c.subject_id,
      sourceOfWealth: "Wynagrodzenie, nieruchomości",
      sourceOfFunds: "Sprzedaż mieszkania",
      actorId: "u1",
    });
    await expect(
      approveBoard({
        subjectId: c.subject_id,
        note: "Akceptuję relację z klientem.",
        actorId: "board",
      }),
    ).rejects.toThrow(/dokument/);
    st().sow_attachments = [{ path: "x/y.pdf", name: "akt.pdf" }];
    await approveBoard({
      subjectId: c.subject_id,
      note: "Akceptuję relację z klientem.",
      actorId: "board",
    });
    expect(st()).toMatchObject({ operations_hold: false, board_approved_by: "board" });
  });
});
