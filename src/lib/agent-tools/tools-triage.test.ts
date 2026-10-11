// Testy narzędzi triage: rozpoznanie rozmówcy wyłącznie po kontakcie
// z kanału, dowód tożsamości w kodzie (numer umowy + nazwisko, kod SMS,
// kontakt + nazwisko tylko dla leada), blokady (3 próby w rozmowie, limit per
// podmiot) i odmowa odczytu tabeli spoza allow-listy. Osobny blok odtwarza
// ataki z przeglądu bezpieczeństwa (cudzy e-mail / numer, dziedziczenie
// sprawy po weryfikacji jako lead). Supabase zastąpione prostym emulatorem
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
  const get = (r: Row, col: string) => {
    const [base, key] = col.split("->>");
    return key ? (r[base] ?? {})[key] : r[col];
  };
  api.eq = (col: string, v: unknown) => chain(() => filters.push((r) => get(r, col) === v));
  api.gte = (col: string, v: unknown) =>
    chain(() => filters.push((r) => String(r[col] ?? "") >= String(v)));
  api.in = (col: string, vals: unknown[]) =>
    chain(() => filters.push((r) => vals.includes(r[col])));
  api.is = (col: string, v: unknown) =>
    chain(() => filters.push((r) => (v === null ? r[col] == null : r[col] === v)));
  // ilike jak w PostgREST: `%` to dowolny ciąg, reszta dosłownie, bez wielkości liter.
  api.ilike = (col: string, v: string) =>
    chain(() => {
      const re = new RegExp(
        `^${String(v)
          .split("%")
          .map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join(".*")}$`,
        "i",
      );
      filters.push((r) => re.test(String(r[col] ?? "")));
    });
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
        table(name).push(...list.map((v) => ({ created_at: new Date().toISOString(), ...v })));
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

const sms = vi.hoisted(() => ({
  sent: [] as Array<{ phone: string; body: string; source: string }>,
}));
vi.mock("@/lib/voicebot.functions", () => ({
  sendSmsInternal: async (o: { phone: string; body: string; source: string }) => {
    sms.sent.push(o);
    return { ok: true, sid: "SM1" };
  },
}));

import { TOOLS } from "./tools-triage.server";

const PHONE = "+48600100200";
const PESEL = "44051401458"; // poprawna suma kontrolna — redakcja maskuje tylko prawdziwe numery

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
  sms.sent.length = 0;
  process.env.AGENT_TOOLS_SECRET = "test-secret-1234567890";
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
    {
      id: "l1",
      borrower_id: "b1",
      investor_user_id: "u-inv",
      numer_umowy: "UM/2024/01",
      status: "w_zwloce",
      kwota_pozyczki: 150000,
    },
  ];
  db.wind_collection_cases = [
    {
      id: "c1",
      loan_id: "l1",
      investor_user_id: "u-inv",
      data_otwarcia: "2026-09-01",
      data_zamkniecia: null,
      kwota_zalegla: 12000,
    },
  ];
  db.leads = [];
  db.clients = [];
  db.investors = [];
  db.loan_applications = [];
  db.access_entitlements = [];
  db.agent_tool_sessions = [];
  db.automation_events = [];
  db.agent_identity_failures = [];
});

describe("TOOLS — rejestr", () => {
  it("eksportuje sześć narzędzi triage z limitami wg specyfikacji", () => {
    const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual([
      "describe_data",
      "identify_caller",
      "lookup",
      "save_needs",
      "send_verification_code",
      "verify_identity",
    ]);
    expect(byName.identify_caller.rateLimit).toEqual({ perConversation: 6, windowMinutes: 10 });
    expect(byName.verify_identity.rateLimit).toEqual({ perConversation: 5, windowMinutes: 10 });
    expect(byName.send_verification_code.rateLimit).toEqual({
      perConversation: 2,
      windowMinutes: 30,
    });
    expect(byName.save_needs.rateLimit).toEqual({ perConversation: 20, windowMinutes: 30 });
    expect(byName.describe_data.rateLimit).toEqual({ perConversation: 3, windowMinutes: 10 });
    expect(byName.lookup.rateLimit).toEqual({ perConversation: 30, windowMinutes: 10 });
    expect(byName.verify_identity.writes).toBe(true);
    expect(byName.send_verification_code.writes).toBe(true);
    expect(byName.save_needs.writes).toBe(true);
    // Kod SMS tylko dla agentów, którzy otwierają akta / konto.
    expect(byName.send_verification_code.agents).not.toContain("recepcja");
    for (const t of TOOLS) expect(t.requiresIdentity).toBe(false);
  });
});

describe("identify_caller", () => {
  it("caller-id pożyczkobiorcy → trasa windykacja, kandydat w sesji, zero danych osobowych", async () => {
    const out = await run("identify_caller", voiceCtx("identify_caller"));
    expect(out.ok).toBe(true);
    const r = (out as any).result;
    expect(r.known_contact).toBe(true);
    expect(r.suggested_route).toBe("windykacja");
    expect(typeof r.say).toBe("string");
    // Ani imienia, ani ról, ani flag sprawy — tylko trasa.
    for (const k of [
      "first_name",
      "roles",
      "has_open_collection_case",
      "application_stage",
      "is_investor",
      "phone_hint",
    ]) {
      expect(r).not.toHaveProperty(k);
    }
    const json = JSON.stringify(r);
    for (const secret of ["UM/2024/01", "12000", "150000", PESEL, "Kowalski", "Jan"])
      expect(json).not.toContain(secret);

    // Kandydat podmiotu zapisany, ale tożsamość NIE podniesiona.
    const s = sessionRow();
    expect(s).toMatchObject({
      subject_kind: "borrower",
      subject_id: "b1",
      case_id: "c1",
      loan_id: "l1",
    });
    expect(s?.identity_verified).not.toBe(true);
    expect(s?.investor_user_id ?? null).toBeNull(); // wierzyciel sprawy to nie rozmówca
  });

  it("nieznany numer → known_contact=false, trasa unknown", async () => {
    const out = await run(
      "identify_caller",
      ctxFor("identify_caller", { body: { phone: "+48111222333" }, callerPhone: "+48111222333" }),
    );
    expect(out.ok).toBe(true);
    expect((out as any).result).toMatchObject({ known_contact: false, suggested_route: "unknown" });
  });

  it("caller-id inwestora → inwestor_panel bez imienia; po weryfikacji nie podmienia podmiotu", async () => {
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
    const ctx = ctxFor("identify_caller", {
      body: { phone: "+48700800900" },
      callerPhone: "+48700800900",
    });
    const r = ((await run("identify_caller", ctx)) as any).result;
    expect(r.suggested_route).toBe("inwestor_panel");
    expect(JSON.stringify(r)).not.toContain("Anna");
    expect(sessionRow()).toMatchObject({
      subject_kind: "investor",
      subject_id: "i1",
      investor_user_id: "u-i1",
    });

    // Sesja już zweryfikowana jako klient — identify nie może nadpisać podmiotu.
    db.agent_tool_sessions = [
      {
        conversation_id: "conv_1",
        subject_kind: "client",
        subject_id: "k9",
        identity_verified: true,
      },
    ];
    await run(
      "identify_caller",
      ctxFor("identify_caller", {
        body: { phone: "+48700800900" },
        callerPhone: "+48700800900",
        session: session({ identity_verified: true, subject_kind: "client", subject_id: "k9" }),
      }),
    );
    expect(sessionRow()).toMatchObject({
      subject_kind: "client",
      subject_id: "k9",
      identity_verified: true,
    });
  });
});

describe("verify_identity", () => {
  it("numer umowy (luźny zapis) + imię i nazwisko → borrower, silny dowód, sprawa w sesji — z dowolnego telefonu", async () => {
    const out = await run(
      "verify_identity",
      ctxFor("verify_identity", {
        body: { phone: "+48111222333" },
        callerPhone: "+48111222333",
        args: { numer_umowy: " um 2024/01 ", full_name: "Jan Kowalski", recording_consent: true },
      }),
    );
    expect(out.ok).toBe(true);
    const r = (out as any).result;
    expect(r).toMatchObject({
      verified: true,
      method: "contract_number",
      subject_kind: "borrower",
      strong: true,
      first_name: "Jan",
      forma: "Pan",
    });
    expect(JSON.stringify(r)).not.toContain(PESEL);
    expect(sessionRow()).toMatchObject({
      identity_verified: true,
      identity_method: "contract_number",
      subject_kind: "borrower",
      subject_id: "b1",
      case_id: "c1",
      loan_id: "l1",
      recording_consent: true,
    });
  });

  it("sam numer umowy (bez nazwiska) → prośba o komplet, bez weryfikacji i bez zliczania próby", async () => {
    const out = await run(
      "verify_identity",
      voiceCtx("verify_identity", { args: { numer_umowy: "UM/2024/01" } }),
    );
    const r = (out as any).result;
    expect(r.verified).toBe(false);
    expect(r.locked).toBe(false);
    expect(sessionRow()?.identity_verified).not.toBe(true);
    expect(sessionRow()?.identity_attempts ?? 0).toBe(0);
  });

  it("numer umowy + złe nazwisko → odmowa i wpis w liczniku per pożyczka; po 5 takich — blokada nawet z dobrym nazwiskiem", async () => {
    const r = (
      (await run(
        "verify_identity",
        voiceCtx("verify_identity", {
          args: { numer_umowy: "UM/2024/01", full_name: "Adam Nowak" },
        }),
      )) as any
    ).result;
    expect(r.verified).toBe(false);
    expect(table("agent_identity_failures").map((f) => f.subject_ref)).toEqual(["loan:l1"]);
    for (let i = 0; i < 4; i++)
      table("agent_identity_failures").push({
        subject_ref: "loan:l1",
        created_at: new Date().toISOString(),
      });
    const locked = (
      (await run(
        "verify_identity",
        ctxFor("verify_identity", {
          conversation: "x",
          args: { numer_umowy: "UM/2024/01", full_name: "Jan Kowalski" },
        } as any),
      )) as any
    ).result;
    expect(locked).toMatchObject({ verified: false, locked: true });
  });

  it("caller-id + imię i nazwisko pożyczkobiorcy → NIE otwiera akt; proponuje kod SMS bez zliczania próby", async () => {
    const out = await run(
      "verify_identity",
      voiceCtx("verify_identity", { args: { full_name: "pan Jan Kowalsky" } }),
    );
    const r = (out as any).result;
    expect(r).toMatchObject({ verified: false, need_code: true });
    expect(sessionRow()?.identity_verified).not.toBe(true);
    expect(sessionRow()?.identity_attempts ?? 0).toBe(0);
  });

  it("caller-id + imię i nazwisko leada → phone_match (dane wniosku, nie akta)", async () => {
    db.leads = [
      {
        id: "ld1",
        type: "pozyczkowy",
        first_name: "Ewa",
        last_name: "Zielińska",
        phone_normalized: "+48500600700",
        created_at: "2026-01-01",
      },
    ];
    const out = await run(
      "verify_identity",
      ctxFor("verify_identity", {
        body: { phone: "+48500600700" },
        callerPhone: "+48500600700",
        args: { full_name: "Ewa Zielinska" },
      }),
    );
    expect((out as any).result).toMatchObject({
      verified: true,
      method: "phone_match",
      subject_kind: "lead",
      strong: false,
    });
    expect(sessionRow()).toMatchObject({
      subject_kind: "lead",
      lead_id: "ld1",
      case_id: null,
      loan_id: null,
    });
  });

  it("telefon podany tylko w rozmowie (czat, bez caller-id) nie jest dowodem", async () => {
    const out = await run(
      "verify_identity",
      ctxFor("verify_identity", {
        body: {},
        callerPhone: null,
        args: { phone: PHONE, full_name: "Jan Kowalski" },
      }),
    );
    expect((out as any).result.verified).toBe(false);
  });

  it("firma: numer umowy + nazwa firmy bez zgodnego kontaktu z kanału → kod SMS (nazwa jest jawna w KRS)", async () => {
    db.wind_borrowers.push({
      id: "b2",
      imie_nazwisko: "Budex Sp. z o.o.",
      typ: "firma",
      telefon: "+48 601 000 111",
      email: null,
    });
    db.wind_loans.push({
      id: "l2",
      borrower_id: "b2",
      numer_umowy: "UM/2024/02",
      status: "w_zwloce",
    });
    const r = (
      (await run(
        "verify_identity",
        ctxFor("verify_identity", {
          body: {},
          callerPhone: null,
          args: { numer_umowy: "UM/2024/02", full_name: "Budex spółka z o.o." },
        }),
      )) as any
    ).result;
    expect(r).toMatchObject({ verified: false, need_code: true });
  });

  it("trzy nieudane próby → locked, czwarta nie dotyka bazy i nie zdradza, co się nie zgadza", async () => {
    const results: any[] = [];
    for (let i = 0; i < 3; i++) {
      const attempts = sessionRow()?.identity_attempts ?? 0;
      const out = await run(
        "verify_identity",
        voiceCtx("verify_identity", {
          args: { full_name: "Adam Nowak" },
          session: session({ identity_attempts: attempts }),
        }),
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
      voiceCtx("verify_identity", {
        args: { full_name: "Jan Kowalski" },
        session: session({ identity_attempts: 3 }),
      }),
    );
    const r4 = (fourth as any).result;
    expect(r4).toMatchObject({ verified: false, locked: true });
    expect(writes.length).toBe(before); // blokada bez kolejnego zapisu
    // Odmowa nie wskazuje, która część dowodu zawiodła.
    for (const r of [...results, r4]) {
      expect(r.say).not.toMatch(
        /numer umowy się nie zgadza|nazwisko się nie zgadza|nie ma takiego numeru/i,
      );
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
        session: session({
          identity_verified: true,
          identity_method: "contract_number",
          subject_kind: "borrower",
          subject_id: "b1",
        }),
      }),
    );
    expect((out as any).result).toMatchObject({
      verified: true,
      method: "contract_number",
      first_name: "Jan",
      forma: "Pan",
    });
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
      voiceCtx("lookup", {
        args: { table: "wind_loans" },
        session: session({ agent_key: "windykacja", case_id: "c1", loan_id: "l1" }),
      }),
    );
    expect(out.ok).toBe(false);
    expect((out as any).error).toMatch(/verify_identity/);
  });

  it("płaski filtr where_column/where_value zawęża wiersze w obrębie sprawy rozmówcy", async () => {
    // ElevenLabs wycina pola obiektu spoza schematu, więc filtr idzie płasko.
    db.wind_events = [
      {
        id: "e1",
        case_id: "c1",
        typ: "wplata",
        tytul: "Wpłata",
        data_zdarzenia: "2026-10-01",
        metadata: { x: 1 },
      },
      { id: "e2", case_id: "c1", typ: "wezwanie", tytul: "Wezwanie", data_zdarzenia: "2026-10-02" },
      {
        id: "e3",
        case_id: "c2",
        typ: "wplata",
        tytul: "Cudza wpłata",
        data_zdarzenia: "2026-10-03",
      },
    ];
    const verified = session({
      agent_key: "windykacja",
      case_id: "c1",
      identity_verified: true,
      identity_method: "contract_number",
      subject_kind: "borrower",
      subject_id: "b1",
    });
    const out = await run(
      "lookup",
      voiceCtx("lookup", {
        args: { table: "wind_events", where_column: "typ", where_value: "wplata" },
        session: verified,
      }),
    );
    expect(out.ok).toBe(true);
    const rows = (out as any).result.rows;
    expect(rows.map((r: Row) => r.id)).toEqual(["e1"]);
    expect(rows[0]).not.toHaveProperty("metadata");

    const denied = await run(
      "lookup",
      voiceCtx("lookup", {
        args: { table: "wind_events", where_column: "case_id", where_value: "c2" },
        session: verified,
      }),
    );
    expect(denied.ok).toBe(false);
    expect((denied as any).error).toMatch(/Filtr/);
  });

  it("brak `table` → czytelny błąd", async () => {
    const out = await run("lookup", voiceCtx("lookup", { args: {} }));
    expect(out.ok).toBe(false);
  });

  it("describe_data zwraca tylko tabele danego agenta i instrukcję po polsku", async () => {
    const out = await run(
      "describe_data",
      voiceCtx("describe_data", { session: session({ agent_key: "windykacja" }) }),
    );
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
        args: {
          needs: {
            amount_pln: "250 000",
            property_city: "Kraków",
            objections: ["za drogo", "długo trwa"],
            free_text: `mój pesel ${PESEL}`,
            pesel: PESEL,
          },
        },
      }),
    );
    expect(out.ok).toBe(true);
    const r = (out as any).result;
    expect(r.saved).toBe(true);
    expect(r.needs).toMatchObject({
      intent: "pozyczka",
      amount_pln: 250000,
      property_city: "Kraków",
    });
    expect(r.needs.objections).toEqual(["za drogo", "długo trwa"]);
    expect(r.needs.pesel).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain(PESEL);

    expect(sessionRow()?.needs).toMatchObject({ amount_pln: 250000 });
    const ev = table("automation_events").find(
      (e) => e.automation_type === "agent_needs_recognized",
    );
    expect(ev?.sent_payload).toMatchObject({ conversation_id: "conv_1", agent_key: "recepcja" });
    expect(JSON.stringify(ev)).not.toContain(PESEL);
  });

  it("puste args → błąd zamiast pustego zapisu", async () => {
    const out = await run("save_needs", voiceCtx("save_needs", { args: { needs: {} } }));
    expect(out.ok).toBe(false);
  });
});

describe("kod SMS (send_verification_code → verify_identity z kodem)", () => {
  it("kod idzie na numer Z UMOWY, w wyniku i sesji nie ma kodu; zły kod liczy się per podmiot, dobry otwiera akta", async () => {
    const sent = await run(
      "send_verification_code",
      ctxFor("send_verification_code", {
        body: {},
        callerPhone: null,
        args: { numer_umowy: "UM/2024/01" },
        session: session({ agent_key: "windykacja_tekst" }),
      }),
    );
    expect((sent as any).result).toMatchObject({ sent: true });
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0].phone).toBe("+48600100200");
    expect(sms.sent[0].source).toBe("phone_verification");
    const code = sms.sent[0].body.match(/\d{6}/)![0];
    expect(JSON.stringify((sent as any).result)).not.toContain(code);
    const row = sessionRow()!;
    expect(row.otp_hash).toBeTruthy();
    expect(row.otp_hash).not.toContain(code);
    expect(row.otp_subject).toMatchObject({
      kind: "borrower",
      id: "b1",
      loan_id: "l1",
      case_id: "c1",
    });

    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
    const bad = await run(
      "verify_identity",
      ctxFor("verify_identity", {
        body: {},
        callerPhone: null,
        args: { kod: wrong },
        session: session({ ...row }),
      }),
    );
    expect((bad as any).result).toMatchObject({ verified: false, attempts_left: 2 });
    expect(table("agent_identity_failures").map((f) => f.subject_ref)).toEqual(["borrower:b1"]);

    const good = await run(
      "verify_identity",
      ctxFor("verify_identity", {
        body: {},
        callerPhone: null,
        args: { kod: code },
        session: session({ ...sessionRow()! }),
      }),
    );
    expect((good as any).result).toMatchObject({
      verified: true,
      method: "otp_sms",
      subject_kind: "borrower",
    });
    expect(sessionRow()).toMatchObject({
      identity_verified: true,
      identity_method: "otp_sms",
      case_id: "c1",
      loan_id: "l1",
      otp_hash: null,
    });
  });

  it("bez numeru umowy i bez kandydata z kanału → nie wysyła (nigdy na numer podany w rozmowie)", async () => {
    const out = await run(
      "send_verification_code",
      ctxFor("send_verification_code", {
        body: {},
        callerPhone: null,
        args: { phone: "+48999888777" },
      }),
    );
    expect(out.ok).toBe(false);
    expect(sms.sent).toHaveLength(0);
  });

  it("kod po terminie ważności → expired, bez weryfikacji", async () => {
    const out = await run(
      "verify_identity",
      ctxFor("verify_identity", {
        args: { kod: "123456" },
        session: session({
          otp_hash: "x",
          otp_expires_at: "2026-10-11T09:00:00Z",
          otp_subject: { kind: "borrower", id: "b1" },
        }),
      }),
    );
    expect((out as any).result).toMatchObject({ verified: false, expired: true });
  });
});

describe("ataki z przeglądu bezpieczeństwa (regresja)", () => {
  it("LEAK-1/AUTH-6: numer ofiary podany na czacie nie zwraca nic o niej i nie ustawia kandydata", async () => {
    const out = await run(
      "identify_caller",
      ctxFor("identify_caller", {
        body: {},
        callerPhone: null,
        args: { phone: PHONE, email: "jan@example.com" },
      }),
    );
    const r = (out as any).result;
    expect(r).toMatchObject({ known_contact: false, suggested_route: "unknown" });
    expect(JSON.stringify(r)).not.toMatch(/Jan|Kowalski|windykacja/);
    expect(sessionRow()?.subject_id ?? null).toBeNull();
    expect(sessionRow()?.case_id ?? null).toBeNull();
  });

  it("AUTH-1: kandydat-ofiara w sesji + weryfikacja jako własny lead → sprawa ofiary NIE zostaje w sesji", async () => {
    db.leads = [
      {
        id: "ld-att",
        type: "pozyczkowy",
        first_name: "Piotr",
        last_name: "Atakujący",
        phone_normalized: "+48500000001",
        created_at: "2026-01-01",
      },
    ];
    const victimCandidate = session({
      agent_key: "windykacja",
      subject_kind: "borrower",
      subject_id: "b1",
      case_id: "c1",
      loan_id: "l1",
    });
    db.agent_tool_sessions = [{ ...victimCandidate }];
    const out = await run(
      "verify_identity",
      ctxFor("verify_identity", {
        body: { phone: "+48500000001" },
        callerPhone: "+48500000001",
        args: { full_name: "Piotr Atakujący" },
        session: victimCandidate,
      }),
    );
    expect((out as any).result).toMatchObject({ verified: true, subject_kind: "lead" });
    expect(sessionRow()).toMatchObject({
      subject_kind: "lead",
      subject_id: "ld-att",
      case_id: null,
      loan_id: null,
      investor_user_id: null,
    });
  });

  it("AUTH-4: numer umowy z koperty + numer ofiary podany w rozmowie, bez nazwiska → brak weryfikacji", async () => {
    await run(
      "identify_caller",
      ctxFor("identify_caller", { body: {}, callerPhone: null, args: { phone: PHONE } }),
    );
    const out = await run(
      "verify_identity",
      ctxFor("verify_identity", {
        body: {},
        callerPhone: null,
        args: { numer_umowy: "UM/2024/01" },
      }),
    );
    expect((out as any).result.verified).toBe(false);
    expect(sessionRow()?.identity_verified).not.toBe(true);
  });
});
