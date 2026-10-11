// Testy narzędzi triage: rozpoznanie rozmówcy po numerze, dowód tożsamości
// w kodzie (numer umowy / telefon + nazwisko), blokada po 3 próbach i odmowa
// odczytu tabeli spoza allow-listy. Supabase zastąpione prostym emulatorem
// PostgREST w pamięci (filtry eq/in/is/ilike, order, limit, insert, upsert),
// żeby sprawdzać także to, CO trafia do sesji i audytu — nie tylko odpowiedź.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext, ToolSession } from "./types";

type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
const writes: Array<{ table: string; op: string; values: Row }> = [];

const table = (name: string): Row[] => (db[name] ??= []);

function builder(name: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let ord: { col: string; asc: boolean } | null = null;
  let lim: number | null = null;
  let single = false;
  let write: (() => void) | null = null;
  const api: any = {};
  const chain = (fn: () => void) => {
    fn();
    return api;
  };
  api.select = () => api;
  api.eq = (col: string, v: unknown) => chain(() => filters.push((r) => r[col] === v));
  api.in = (col: string, vals: unknown[]) => chain(() => filters.push((r) => vals.includes(r[col])));
  api.is = (col: string, v: unknown) => chain(() => filters.push((r) => (v === null ? r[col] == null : r[col] === v)));
  api.ilike = (col: string, v: string) =>
    chain(() => filters.push((r) => String(r[col] ?? "").toLowerCase() === String(v).toLowerCase()));
  api.order = (col: string, o?: { ascending?: boolean }) =>
    chain(() => {
      ord = { col, asc: o?.ascending !== false };
    });
  api.limit = (n: number) =>
    chain(() => {
      lim = n;
    });
  api.maybeSingle = () =>
    chain(() => {
      single = true;
    });
  api.insert = (values: Row | Row[]) =>
    chain(() => {
      write = () => {
        const list = Array.isArray(values) ? values : [values];
        table(name).push(...list.map((v) => ({ ...v })));
        for (const v of list) writes.push({ table: name, op: "insert", values: v });
      };
    });
  api.upsert = (values: Row, opts?: { onConflict?: string }) =>
    chain(() => {
      write = () => {
        const key = opts?.onConflict ?? "id";
        const rows = table(name);
        const idx = rows.findIndex((r) => r[key] === values[key]);
        if (idx >= 0) Object.assign(rows[idx], values);
        else rows.push({ ...values });
        writes.push({ table: name, op: "upsert", values });
      };
    });
  api.then = (resolve: any, reject?: any) => {
    try {
      if (write) {
        write();
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      }
      let out = table(name).filter((r) => filters.every((f) => f(r)));
      if (ord) {
        const { col, asc } = ord;
        out = [...out].sort((a, b) => {
          const x = String(a[col] ?? "");
          const y = String(b[col] ?? "");
          return asc ? x.localeCompare(y) : y.localeCompare(x);
        });
      }
      if (lim != null) out = out.slice(0, lim);
      const data = single ? (out[0] ? { ...out[0] } : null) : out.map((r) => ({ ...r }));
      return Promise.resolve({ data, error: null, count: out.length }).then(resolve, reject);
    } catch (e) {
      return Promise.reject(e).then(resolve, reject);
    }
  };
  return api;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => builder(t) },
}));

import { TOOLS } from "./tools-triage.server";

const PHONE = "+48600100200";
const PESEL = "80010112345";

function session(over: Partial<ToolSession> = {}): ToolSession {
  return {
    conversation_id: "conv_1",
    agent_key: "recepcja",
    channel: "voice_phone",
    subject_kind: "unknown",
    subject_id: null,
    lead_id: null,
    case_id: null,
    loan_id: null,
    investor_user_id: null,
    identity_verified: false,
    identity_method: null,
    identity_verified_at: null,
    identity_attempts: 0,
    recording_consent: null,
    do_not_contact: false,
    needs: {},
    ...over,
  };
}

function ctxFor(tool: string, over: Partial<ToolContext> = {}): ToolContext {
  return {
    tool,
    body: {},
    args: {},
    session: session(),
    callerPhone: null,
    callerEmail: null,
    now: new Date("2026-10-11T10:00:00Z"),
    redactions: [],
    ...over,
  };
}

/** Kontekst rozmowy telefonicznej z caller-id z systemu (body.phone). */
const voiceCtx = (tool: string, over: Partial<ToolContext> = {}) =>
  ctxFor(tool, { body: { phone: PHONE }, callerPhone: PHONE, ...over });

const run = (name: string, ctx: ToolContext) => {
  const spec = TOOLS.find((t) => t.name === name);
  if (!spec) throw new Error(`brak narzędzia ${name}`);
  return spec.handler(ctx);
};

const sessionRow = () => table("agent_tool_sessions").find((r) => r.conversation_id === "conv_1");

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  writes.length = 0;
  // Pożyczkobiorca z otwartą sprawą; wiersz niesie PESEL i kwoty, których
  // narzędzia NIE mogą wypuścić przed/po weryfikacji.
  db.wind_borrowers = [
    {
      id: "b1",
      investor_user_id: "u-inv",
      imie_nazwisko: "Jan Kowalski",
      typ: "osoba_fizyczna",
      telefon: "600 100 200",
      email: null,
      pesel: PESEL,
    },
  ];
  db.wind_loans = [
    { id: "l1", borrower_id: "b1", investor_user_id: "u-inv", numer_umowy: "UM/2024/01", status: "w_zwloce", kwota_pozyczki: 150000 },
  ];
  db.wind_collection_cases = [
    { id: "c1", loan_id: "l1", investor_user_id: "u-inv", data_otwarcia: "2026-09-01", data_zamkniecia: null, kwota_zalegla: 12000 },
  ];
  db.leads = [];
  db.clients = [];
  db.investors = [];
  db.loan_applications = [];
  db.access_entitlements = [];
  db.agent_tool_sessions = [];
  db.automation_events = [];
});

describe("TOOLS — rejestr", () => {
  it("eksportuje pięć narzędzi triage z limitami wg specyfikacji", () => {
    const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual(["describe_data", "identify_caller", "lookup", "save_needs", "verify_identity"]);
    expect(byName.identify_caller.rateLimit).toEqual({ perConversation: 6, windowMinutes: 10 });
    expect(byName.verify_identity.rateLimit).toEqual({ perConversation: 5, windowMinutes: 10 });
    expect(byName.save_needs.rateLimit).toEqual({ perConversation: 20, windowMinutes: 30 });
    expect(byName.describe_data.rateLimit).toEqual({ perConversation: 3, windowMinutes: 10 });
    expect(byName.lookup.rateLimit).toEqual({ perConversation: 30, windowMinutes: 10 });
    expect(byName.verify_identity.writes).toBe(true);
    expect(byName.save_needs.writes).toBe(true);
    for (const t of TOOLS) expect(t.requiresIdentity).toBe(false);
  });
});

describe("identify_caller", () => {
  it("numer pożyczkobiorcy z otwartą sprawą → trasa windykacja, kandydat w sesji, zero danych sprawy", async () => {
    const out = await run("identify_caller", voiceCtx("identify_caller"));
    expect(out.ok).toBe(true);
    const r = (out as any).result;
    expect(r.found).toBe(true);
    expect(r.roles).toContain("borrower");
    expect(r.first_name).toBe("Jan");
    expect(r.has_open_collection_case).toBe(true);
    expect(r.suggested_route).toBe("windykacja");
    expect(r.phone_hint).toBe("…02 00");
    expect(typeof r.say).toBe("string");

    // Nic z akt przed weryfikacją: numer umowy, kwoty, PESEL.
    const json = JSON.stringify(r);
    expect(json).not.toContain("UM/2024/01");
    expect(json).not.toContain("12000");
    expect(json).not.toContain("150000");
    expect(json).not.toContain(PESEL);
    expect(json).not.toContain("Kowalski");

    // Kandydat podmiotu zapisany, ale tożsamość NIE podniesiona.
    const s = sessionRow();
    expect(s).toMatchObject({ subject_kind: "borrower", subject_id: "b1", case_id: "c1", loan_id: "l1" });
    expect(s?.identity_verified).not.toBe(true);
    expect(s?.investor_user_id ?? null).toBeNull(); // wierzyciel sprawy to nie rozmówca
  });

  it("nieznany numer → found=false, trasa unknown", async () => {
    const out = await run("identify_caller", ctxFor("identify_caller", { body: { phone: "+48111222333" }, callerPhone: "+48111222333" }));
    expect(out.ok).toBe(true);
    const r = (out as any).result;
    expect(r).toMatchObject({ found: false, roles: [], suggested_route: "unknown", has_open_collection_case: false });
  });

  it("inwestor z aktywnym abonamentem bez intencji → inwestor_panel; po weryfikacji nie podmienia podmiotu", async () => {
    db.investors = [
      {
        id: "i1",
        user_id: "u-i1",
        first_name: "Anna",
        last_name: "Nowak",
        company_name: null,
        email: "anna@example.com",
        phone: "+48 700 800 900",
        is_active: true,
        subscription_status: "aktywny",
        subscription_active_until: "2027-01-01T00:00:00Z",
      },
    ];
    const ctx = ctxFor("identify_caller", { body: { phone: "+48700800900" }, callerPhone: "+48700800900" });
    const out = await run("identify_caller", ctx);
    const r = (out as any).result;
    expect(r).toMatchObject({ is_investor: true, investor_subscription_active: true, suggested_route: "inwestor_panel", first_name: "Anna" });
    expect(sessionRow()).toMatchObject({ subject_kind: "investor", subject_id: "i1", investor_user_id: "u-i1" });

    // Sesja już zweryfikowana jako klient — identify nie może nadpisać podmiotu.
    db.agent_tool_sessions = [{ conversation_id: "conv_1", subject_kind: "client", subject_id: "k9", identity_verified: true }];
    await run(
      "identify_caller",
      ctxFor("identify_caller", {
        body: { phone: "+48700800900" },
        callerPhone: "+48700800900",
        session: session({ identity_verified: true, subject_kind: "client", subject_id: "k9" }),
      }),
    );
    expect(sessionRow()).toMatchObject({ subject_kind: "client", subject_id: "k9", identity_verified: true });
  });
});

describe("verify_identity", () => {
  it("numer umowy (luźny zapis) z telefonu pożyczkobiorcy → potwierdzone jako borrower, forma Pan", async () => {
    const out = await run("verify_identity", voiceCtx("verify_identity", { args: { numer_umowy: " um 2024/01 ", recording_consent: true } }));
    expect(out.ok).toBe(true);
    const r = (out as any).result;
    expect(r).toMatchObject({ verified: true, method: "contract_number", subject_kind: "borrower", first_name: "Jan", forma: "Pan" });
    expect(JSON.stringify(r)).not.toContain(PESEL);

    const s = sessionRow();
    expect(s).toMatchObject({
      identity_verified: true,
      identity_method: "contract_number",
      subject_kind: "borrower",
      subject_id: "b1",
      case_id: "c1",
      loan_id: "l1",
      recording_consent: true,
    });
  });

  it("numer umowy z obcego telefonu i bez kandydata w sesji → NIE potwierdza (zlicza próbę)", async () => {
    const out = await run(
      "verify_identity",
      ctxFor("verify_identity", { body: { phone: "+48111222333" }, callerPhone: "+48111222333", args: { numer_umowy: "UM/2024/01" } }),
    );
    const r = (out as any).result;
    expect(r.verified).toBe(false);
    expect(r.locked).toBe(false);
    expect(sessionRow()?.identity_attempts).toBe(1);
    expect(sessionRow()?.identity_verified).not.toBe(true);
  });

  it("telefon z systemu + imię i nazwisko (literówka z rozpoznawania mowy) → phone_match", async () => {
    const out = await run("verify_identity", voiceCtx("verify_identity", { args: { full_name: "pan Jan Kowalsky" } }));
    const r = (out as any).result;
    expect(r).toMatchObject({ verified: true, method: "phone_match", subject_kind: "borrower", first_name: "Jan", forma: "Pan" });
    expect(sessionRow()).toMatchObject({ identity_verified: true, case_id: "c1", loan_id: "l1" });
  });

  it("telefon podany tylko w args (czat) nie jest dowodem", async () => {
    const out = await run(
      "verify_identity",
      ctxFor("verify_identity", { body: {}, callerPhone: PHONE, args: { phone: PHONE, full_name: "Jan Kowalski" } }),
    );
    expect((out as any).result.verified).toBe(false);
  });

  it("trzy nieudane próby → locked, czwarta nie dotyka bazy i nie zdradza, co się nie zgadza", async () => {
    const results: any[] = [];
    for (let i = 0; i < 3; i++) {
      const attempts = sessionRow()?.identity_attempts ?? 0;
      const out = await run(
        "verify_identity",
        voiceCtx("verify_identity", { args: { full_name: "Adam Nowak" }, session: session({ identity_attempts: attempts }) }),
      );
      results.push((out as any).result);
    }
    expect(results.map((r) => r.verified)).toEqual([false, false, false]);
    expect(results.map((r) => r.locked)).toEqual([false, false, true]);
    expect(results.map((r) => r.attempts_left)).toEqual([2, 1, 0]);
    expect(sessionRow()?.identity_attempts).toBe(3);
    expect(sessionRow()?.identity_verified).not.toBe(true);

    const before = writes.length;
    const fourth = await run(
      "verify_identity",
      voiceCtx("verify_identity", { args: { full_name: "Jan Kowalski" }, session: session({ identity_attempts: 3 }) }),
    );
    const r4 = (fourth as any).result;
    expect(r4).toMatchObject({ verified: false, locked: true });
    expect(writes.length).toBe(before); // blokada bez kolejnego zapisu
    // Odmowa nie wskazuje, która część dowodu zawiodła.
    for (const r of [...results, r4]) {
      expect(r.say).not.toMatch(/numer umowy się nie zgadza|nazwisko się nie zgadza|nie ma takiego numeru/i);
    }
  });

  it("brak dowodu w args → prośba o dane bez zliczania próby", async () => {
    const out = await run("verify_identity", voiceCtx("verify_identity", { args: {} }));
    const r = (out as any).result;
    expect(r.verified).toBe(false);
    expect(r.locked).toBe(false);
    expect(sessionRow()?.identity_attempts ?? 0).toBe(0);
  });

  it("tożsamość już potwierdzona → odpowiedź idempotentna z imieniem", async () => {
    const out = await run(
      "verify_identity",
      voiceCtx("verify_identity", {
        args: { full_name: "ktokolwiek" },
        session: session({ identity_verified: true, identity_method: "contract_number", subject_kind: "borrower", subject_id: "b1" }),
      }),
    );
    expect((out as any).result).toMatchObject({ verified: true, method: "contract_number", first_name: "Jan", forma: "Pan" });
  });
});

describe("lookup / describe_data", () => {
  it("tabela spoza allow-listy → odmowa", async () => {
    const out = await run("lookup", voiceCtx("lookup", { args: { table: "clients" } }));
    expect(out.ok).toBe(false);
    expect((out as any).error).toMatch(/nie jest dostępna/);
  });

  it("tabela sprawy bez potwierdzonej tożsamości → odmowa z odesłaniem do verify_identity", async () => {
    const out = await run(
      "lookup",
      voiceCtx("lookup", { args: { table: "wind_loans" }, session: session({ agent_key: "windykacja", case_id: "c1", loan_id: "l1" }) }),
    );
    expect(out.ok).toBe(false);
    expect((out as any).error).toMatch(/verify_identity/);
  });

  it("brak `table` → czytelny błąd", async () => {
    const out = await run("lookup", voiceCtx("lookup", { args: {} }));
    expect(out.ok).toBe(false);
  });

  it("describe_data zwraca tylko tabele danego agenta i instrukcję po polsku", async () => {
    const out = await run("describe_data", voiceCtx("describe_data", { session: session({ agent_key: "windykacja" }) }));
    expect(out.ok).toBe(true);
    const r = (out as any).result;
    const names = r.tables.map((t: any) => t.table);
    expect(names).toContain("wind_loans");
    expect(names).not.toContain("access_products");
    expect(r.instruction).toMatch(/lookup/);
  });
});

describe("save_needs", () => {
  it("scala potrzeby z sesją, redaguje PESEL i zapisuje automation_events", async () => {
    const out = await run(
      "save_needs",
      voiceCtx("save_needs", {
        session: session({ needs: { intent: "pozyczka", objections: ["za drogo"] } }),
        args: { needs: { amount_pln: "250 000", property_city: "Kraków", objections: ["za drogo", "długo trwa"], free_text: `mój pesel ${PESEL}`, pesel: PESEL } },
      }),
    );
    expect(out.ok).toBe(true);
    const r = (out as any).result;
    expect(r.saved).toBe(true);
    expect(r.needs).toMatchObject({ intent: "pozyczka", amount_pln: 250000, property_city: "Kraków" });
    expect(r.needs.objections).toEqual(["za drogo", "długo trwa"]);
    expect(r.needs.pesel).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain(PESEL);

    expect(sessionRow()?.needs).toMatchObject({ amount_pln: 250000 });
    const ev = table("automation_events").find((e) => e.automation_type === "agent_needs_recognized");
    expect(ev?.sent_payload).toMatchObject({ conversation_id: "conv_1", agent_key: "recepcja" });
    expect(JSON.stringify(ev)).not.toContain(PESEL);
  });

  it("puste args → błąd zamiast pustego zapisu", async () => {
    const out = await run("save_needs", voiceCtx("save_needs", { args: { needs: {} } }));
    expect(out.ok).toBe(false);
  });
});
