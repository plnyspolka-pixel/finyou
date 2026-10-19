// Dyspozytor narzędzi agentów i jego wpięcie w /api/public/agent-tools.
// Sprawdzamy kolejność bramek (narzędzie → sekret → agent → tożsamość →
// limit → handler → redakcja), to, że KAŻDA decyzja zostawia wiersz
// w agent_tool_calls, oraz że trasa publiczna nie psuje żywych narzędzi
// legacy (fy_*), a nowe narzędzia bez sekretu kończą na 401 przed handlerem.
// Supabase to atrapa w pamięci (sesje, wywołania, automation_events);
// moduły domenowe są wyłączone (TOOLS: []), a rejestr dostaje sztuczne
// narzędzia przez registerTools — test nie zależy od treści handlerów.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolSpec } from "./types";

type Row = Record<string, any>;

const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

vi.mock("@/integrations/supabase/client.server", () => {
  const table = (name: string): Row[] => (db.tables[name] ??= []);
  const builder = (name: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "insert" | "upsert" = "select";
    let payload: Row | Row[] | null = null;
    let conflictKey = "id";
    let head = false;
    const run = (single: boolean) => {
      if (op === "insert") {
        const list = Array.isArray(payload) ? payload : [payload ?? {}];
        for (const v of list) {
          table(name).push({
            id: `${name}_${table(name).length + 1}`,
            created_at: new Date().toISOString(),
            ...v,
          });
        }
        return { data: null, error: null };
      }
      if (op === "upsert") {
        const v = payload as Row;
        const rows = table(name);
        const idx = rows.findIndex((r) => r[conflictKey] === v[conflictKey]);
        if (idx >= 0) Object.assign(rows[idx], v);
        else rows.push({ ...v });
        return { data: null, error: null };
      }
      const matched = table(name).filter((r) => filters.every((f) => f(r)));
      if (head) return { data: null, count: matched.length, error: null };
      return single
        ? { data: matched[0] ?? null, error: null }
        : { data: matched, count: matched.length, error: null };
    };
    const api: any = {
      select: (_cols?: string, opts?: { head?: boolean }) => {
        head = Boolean(opts?.head);
        return api;
      },
      eq: (c: string, v: unknown) => {
        filters.push((r) => r[c] === v);
        return api;
      },
      gte: (c: string, v: string) => {
        filters.push((r) => String(r[c] ?? "") >= v);
        return api;
      },
      order: () => api,
      limit: () => api,
      insert: (p: Row | Row[]) => {
        op = "insert";
        payload = p;
        return api;
      },
      upsert: (p: Row, o?: { onConflict?: string }) => {
        op = "upsert";
        payload = p;
        conflictKey = o?.onConflict ?? "id";
        return api;
      },
      maybeSingle: async () => run(true),
      single: async () => run(true),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve()
          .then(() => run(false))
          .then(res, rej),
    };
    return api;
  };
  return { supabaseAdmin: { from: builder } };
});

// Moduły domenowe wyłączone — rejestr zawiera wyłącznie sztuczne narzędzia.
vi.mock("./tools-triage.server", () => ({ TOOLS: [] }));
vi.mock("./tools-collections.server", () => ({ TOOLS: [] }));
vi.mock("./tools-investor.server", () => ({ TOOLS: [] }));
vi.mock("./tools-knowledge.server", () => ({ TOOLS: [] }));

import { dispatchTool, registerTools } from "./registry.server";
import { Route } from "@/routes/api/public/agent-tools";

const SECRET = "test-secret-0123456789abcdef";
const BASE = "https://app.test/api/public/agent-tools";
const PESEL = "44051401359";
const IBAN = "PL61 1090 1014 0000 0712 1981 2874";

/** Ile razy wykonał się każdy handler — dowód, że odmowa zapada PRZED nim. */
const handled: Record<string, number> = {};
let readResult: unknown = { hello: "świat" };

const bump = (name: string) => {
  handled[name] = (handled[name] ?? 0) + 1;
};

const SPECS: ToolSpec[] = [
  {
    name: "test_read",
    agents: ["recepcja", "intake"],
    requiresIdentity: false,
    writes: false,
    rateLimit: { perConversation: 2, windowMinutes: 10 },
    description: "Odczyt nisko-wrażliwy (wolno ?token=).",
    handler: async () => {
      bump("test_read");
      return { ok: true, result: readResult, rows: 1 };
    },
  },
  {
    name: "test_write",
    agents: [],
    requiresIdentity: false,
    writes: true,
    rateLimit: { perConversation: 50, windowMinutes: 10 },
    description: "Zapis — wyłącznie nagłówek.",
    handler: async () => {
      bump("test_write");
      return { ok: true, result: { saved: true } };
    },
  },
  {
    name: "test_identity",
    agents: ["windykacja"],
    requiresIdentity: true,
    writes: false,
    rateLimit: { perConversation: 50, windowMinutes: 10 },
    description: "Dane podmiotu — po weryfikacji tożsamości.",
    handler: async (ctx) => {
      bump("test_identity");
      return { ok: true, result: { case_id: ctx.session.case_id } };
    },
  },
  {
    name: "test_boom",
    agents: [],
    requiresIdentity: false,
    writes: false,
    rateLimit: { perConversation: 50, windowMinutes: 10 },
    description: "Handler rzuca.",
    handler: async () => {
      bump("test_boom");
      throw new Error(`connection refused: postgres://admin:hunter2@db PESEL ${PESEL}`);
    },
  },
  {
    name: "test_refuse",
    agents: [],
    requiresIdentity: false,
    writes: false,
    rateLimit: { perConversation: 50, windowMinutes: 10 },
    description: "Handler odmawia merytorycznie.",
    handler: async () => {
      bump("test_refuse");
      return { ok: false, error: "Brak sprawy dla tego rozmówcy.", status: 404 };
    },
  },
];

let convSeq = 0;
/** Unikalny, poprawny (A-Za-z0-9_:-) identyfikator rozmowy na wywołanie testu. */
const conv = () => `conv_reg_${++convSeq}`;

function req(
  opts: { header?: string | null; token?: string; body?: unknown; raw?: string } = {},
): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const header = opts.header === undefined ? SECRET : opts.header;
  if (header) headers["x-agent-tools-secret"] = header;
  const url = opts.token ? `${BASE}?token=${encodeURIComponent(opts.token)}` : BASE;
  return new Request(url, {
    method: "POST",
    headers,
    body: opts.raw ?? JSON.stringify(opts.body ?? {}),
  });
}

const calls = () => db.tables.agent_tool_calls ?? [];
const events = () => db.tables.automation_events ?? [];
const lastCall = () => calls()[calls().length - 1];

beforeAll(() => {
  registerTools(SPECS);
});

const prevSecret = process.env.AGENT_TOOLS_SECRET;
beforeEach(() => {
  db.tables = {};
  for (const k of Object.keys(handled)) delete handled[k];
  readResult = { hello: "świat" };
  process.env.AGENT_TOOLS_SECRET = SECRET;
});
afterEach(() => {
  if (prevSecret === undefined) delete process.env.AGENT_TOOLS_SECRET;
  else process.env.AGENT_TOOLS_SECRET = prevSecret;
  vi.restoreAllMocks();
});

describe("dispatchTool — bramki", () => {
  it("nieznane narzędzie → 400 i wpis w audycie", async () => {
    const out = await dispatchTool(req(), {
      tool: "nie_ma_takiego",
      agent_key: "recepcja",
      conversation_id: conv(),
    });
    expect(out.status).toBe(400);
    expect(out.body.ok).toBe(false);
    expect(out.body.error).toContain("Nieznane narzędzie");
    expect(lastCall()).toMatchObject({
      tool: "nie_ma_takiego",
      decision: "denied",
      reason: "unknown_tool",
    });
  });

  it("prefiks fy_ jest zdejmowany — fy_test_read trafia do test_read", async () => {
    const out = await dispatchTool(req(), {
      tool: "fy_test_read",
      agent_key: "recepcja",
      conversation_id: conv(),
    });
    expect(out.status).toBe(200);
    expect(handled.test_read).toBe(1);
  });

  it("brak sekretu → 401, handler się nie wykonuje", async () => {
    const out = await dispatchTool(req({ header: null }), {
      tool: "test_read",
      agent_key: "recepcja",
      conversation_id: conv(),
    });
    expect(out.status).toBe(401);
    expect(out.body).toEqual({ ok: false, error: "unauthorized" });
    expect(handled.test_read).toBeUndefined();
    // Bez sekretu nic nie trafia do bazy — anonim nie zapycha audytu.
    expect(calls()).toHaveLength(0);
    expect(events()).toHaveLength(0);
  });

  it("zły sekret (inna i ta sama długość) → 401", async () => {
    for (const bad of ["zly", SECRET.replace(/.$/, "X")]) {
      const out = await dispatchTool(req({ header: bad }), {
        tool: "test_read",
        agent_key: "recepcja",
        conversation_id: conv(),
      });
      expect(out.status).toBe(401);
    }
    expect(calls()).toHaveLength(0);
    expect(handled.test_read).toBeUndefined();
  });

  it("sekret nieskonfigurowany na serwerze → 401 nawet z nagłówkiem (fail-closed)", async () => {
    delete process.env.AGENT_TOOLS_SECRET;
    const out = await dispatchTool(req(), {
      tool: "test_read",
      agent_key: "recepcja",
      conversation_id: conv(),
    });
    expect(out.status).toBe(401);
    expect(calls()).toHaveLength(0);
    expect(handled.test_read).toBeUndefined();
  });

  it("?token= odrzucony dla narzędzia zapisu (tylko nagłówek)", async () => {
    const out = await dispatchTool(req({ header: null, token: SECRET }), {
      tool: "test_write",
      agent_key: "intake",
      conversation_id: conv(),
    });
    expect(out.status).toBe(401);
    expect(handled.test_write).toBeUndefined();
    expect(lastCall()).toMatchObject({
      tool: "test_write",
      decision: "denied",
      reason: "missing_secret",
    });

    const viaHeader = await dispatchTool(req(), {
      tool: "test_write",
      agent_key: "intake",
      conversation_id: conv(),
    });
    expect(viaHeader.status).toBe(200);
    expect(handled.test_write).toBe(1);
  });

  it("?token= odrzucony dla narzędzia z danymi podmiotu (requiresIdentity)", async () => {
    const out = await dispatchTool(req({ header: null, token: SECRET }), {
      tool: "test_identity",
      agent_key: "windykacja",
      conversation_id: conv(),
    });
    expect(out.status).toBe(401);
    expect(handled.test_identity).toBeUndefined();
  });

  it("?token= przyjęty dla odczytu nisko-wrażliwego (zgodność wstecz)", async () => {
    const out = await dispatchTool(req({ header: null, token: SECRET }), {
      tool: "test_read",
      agent_key: "recepcja",
      conversation_id: conv(),
    });
    expect(out.status).toBe(200);
    expect(handled.test_read).toBe(1);
  });

  it("brak agent_key → 403", async () => {
    const out = await dispatchTool(req(), { tool: "test_read", conversation_id: conv() });
    expect(out.status).toBe(403);
    expect(out.body.error).toContain("agent_key");
    expect(handled.test_read).toBeUndefined();
    expect(lastCall()).toMatchObject({
      agent_key: "unknown",
      decision: "denied",
      reason: "unknown_agent",
    });
  });

  it("nieznany agent_key traktowany jak brak → 403", async () => {
    const out = await dispatchTool(req(), {
      tool: "test_write",
      agent_key: "admin",
      conversation_id: conv(),
    });
    expect(out.status).toBe(403);
    expect(lastCall()).toMatchObject({ reason: "unknown_agent" });
    expect(handled.test_write).toBeUndefined();
  });

  it("agent spoza listy narzędzia → 403", async () => {
    const out = await dispatchTool(req(), {
      tool: "test_read",
      agent_key: "windykacja",
      conversation_id: conv(),
    });
    expect(out.status).toBe(403);
    expect(out.body.error).toContain("windykacja");
    expect(handled.test_read).toBeUndefined();
    expect(lastCall()).toMatchObject({
      agent_key: "windykacja",
      decision: "denied",
      reason: "agent_not_allowed",
    });
  });

  it("requiresIdentity przy niezweryfikowanej sesji → 403; po weryfikacji w sesji → 200", async () => {
    const id = conv();
    const out = await dispatchTool(req(), {
      tool: "test_identity",
      agent_key: "windykacja",
      conversation_id: id,
    });
    expect(out.status).toBe(403);
    expect(out.body.error).toContain("verify_identity");
    expect(handled.test_identity).toBeUndefined();
    expect(lastCall()).toMatchObject({ decision: "denied", reason: "identity_required" });

    // Weryfikacja żyje w sesji rozmowy (zapisuje ją tylko handler verify_identity).
    const session = db.tables.agent_tool_sessions.find((s) => s.conversation_id === id)!;
    Object.assign(session, {
      identity_verified: true,
      identity_method: "contract_number",
      identity_verified_at: new Date().toISOString(),
      subject_kind: "borrower",
      case_id: "case-1",
    });

    const ok = await dispatchTool(req(), {
      tool: "test_identity",
      agent_key: "windykacja",
      conversation_id: id,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.result).toEqual({ case_id: "case-1" });

    // Potwierdzenie wygasa (rozmowa: 2 h) — potem znowu 403, a sprawa znika z sesji.
    Object.assign(session, {
      identity_verified_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    });
    const expired = await dispatchTool(req(), {
      tool: "test_identity",
      agent_key: "windykacja",
      conversation_id: id,
    });
    expect(expired.status).toBe(403);
  });

  it("numer / e-mail z args nie staje się kontaktem z kanału (callerPhone / callerEmail)", async () => {
    let seen: { phone: string | null; email: string | null } | null = null;
    registerTools([
      {
        name: "test_contact",
        agents: ["recepcja"],
        requiresIdentity: false,
        writes: false,
        rateLimit: { perConversation: 5, windowMinutes: 10 },
        description: "",
        handler: async (ctx) => {
          seen = { phone: ctx.callerPhone, email: ctx.callerEmail };
          return { ok: true, result: {} };
        },
      },
    ]);
    await dispatchTool(req(), {
      tool: "test_contact",
      agent_key: "recepcja",
      conversation_id: conv(),
      args: { phone: "+48600100200", email: "x@y.pl" },
    });
    expect(seen).toEqual({ phone: null, email: null });
    await dispatchTool(req(), {
      tool: "test_contact",
      agent_key: "recepcja",
      conversation_id: conv(),
      phone: "+48600100200",
    });
    expect(seen).toEqual({ phone: "+48600100200", email: null });
  });

  it("twierdzenia z body nie zastępują sesji — case_id z body nie odblokowuje danych", async () => {
    const out = await dispatchTool(req(), {
      tool: "test_identity",
      agent_key: "windykacja",
      conversation_id: conv(),
      case_id: "case-cudza",
      args: { identity_verified: true },
    } as any);
    expect(out.status).toBe(403);
    expect(handled.test_identity).toBeUndefined();
  });

  it("limit: po N udanych wywołaniach w rozmowie → 429; inna rozmowa ma własny licznik", async () => {
    const id = conv();
    const body = { tool: "test_read", agent_key: "recepcja", conversation_id: id };
    expect((await dispatchTool(req(), body)).status).toBe(200);
    expect((await dispatchTool(req(), body)).status).toBe(200);
    const third = await dispatchTool(req(), body);
    expect(third.status).toBe(429);
    expect(handled.test_read).toBe(2);
    expect(lastCall()).toMatchObject({ decision: "denied", reason: "rate_limited" });

    const other = await dispatchTool(req(), { ...body, conversation_id: conv() });
    expect(other.status).toBe(200);
  });

  it("odmowy nie zjadają limitu — liczą się tylko decyzje ok", async () => {
    const id = conv();
    const body = { tool: "test_read", agent_key: "recepcja", conversation_id: id };
    await dispatchTool(req({ header: null }), body);
    await dispatchTool(req({ header: "zly" }), body);
    expect((await dispatchTool(req(), body)).status).toBe(200);
    expect((await dispatchTool(req(), body)).status).toBe(200);
  });
});

describe("dispatchTool — wynik i błędy", () => {
  it("redakcja: klucz pesel i iban usunięte, PESEL w tekście zamaskowany", async () => {
    readResult = { pesel: PESEL, note: `PESEL ${PESEL}`, iban: IBAN, ok: "x" };
    const out = await dispatchTool(req(), {
      tool: "test_read",
      agent_key: "recepcja",
      conversation_id: conv(),
    });
    expect(out.status).toBe(200);
    const result = out.body.result as Row;
    expect(result).not.toHaveProperty("pesel");
    // Klucz `iban` jest na liście kluczy zakazanych — znika w całości (mocniej niż maska).
    expect(result).not.toHaveProperty("iban");
    expect(result.note).toBe("PESEL [PESEL ukryty]");
    expect(result.ok).toBe("x");
    const json = JSON.stringify(out.body);
    expect(json).not.toContain(PESEL);
    expect(json).not.toContain("0712 1981");

    const row = lastCall();
    expect(row.decision).toBe("ok");
    expect(row.redactions).toEqual(
      expect.arrayContaining(["key:pesel@$", "pesel@note", "key:iban@$"]),
    );
  });

  it("redakcja: numer rachunku pod niewinnym kluczem maskowany do ostatnich 4 cyfr", async () => {
    readResult = { opis: `Wpłać na ${IBAN}`, lista: [{ konto: IBAN }] };
    const out = await dispatchTool(req(), {
      tool: "test_read",
      agent_key: "recepcja",
      conversation_id: conv(),
    });
    const result = out.body.result as Row;
    expect(result.opis).toBe("Wpłać na …2874");
    expect(result.lista[0].konto).toBe("…2874");
    expect(JSON.stringify(result)).not.toContain("1090 1014");
  });

  it("handler rzuca → 500 z ogólnym komunikatem po polsku, bez treści wyjątku", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await dispatchTool(req(), {
      tool: "test_boom",
      agent_key: "intake",
      conversation_id: conv(),
    });
    expect(out.status).toBe(500);
    expect(out.body).toEqual({
      ok: false,
      error: "Narzędzie zgłosiło błąd — powiedz rozmówcy, że sprawdzisz to inaczej.",
    });
    const json = JSON.stringify(out.body);
    expect(json).not.toContain("hunter2");
    expect(json).not.toContain(PESEL);
    expect(lastCall()).toMatchObject({ tool: "test_boom", decision: "error" });
  });

  it("odmowa merytoryczna handlera → status handlera i wpis denied", async () => {
    const out = await dispatchTool(req(), {
      tool: "test_refuse",
      agent_key: "intake",
      conversation_id: conv(),
    });
    expect(out.status).toBe(404);
    expect(out.body).toEqual({ ok: false, error: "Brak sprawy dla tego rozmówcy." });
    expect(lastCall()).toMatchObject({
      decision: "denied",
      reason: "Brak sprawy dla tego rozmówcy.",
    });
  });

  it("każda decyzja uwierzytelnionego żądania zostawia wiersz w agent_tool_calls; odmowy i błędy także w automation_events", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const id = conv();
    const steps: Array<[Request, Record<string, unknown>, number]> = [
      [req(), { tool: "brak_narzedzia", agent_key: "recepcja", conversation_id: id }, 400],
      [req(), { tool: "test_read", conversation_id: id }, 403],
      [req(), { tool: "test_read", agent_key: "windykacja", conversation_id: id }, 403],
      [req(), { tool: "test_identity", agent_key: "windykacja", conversation_id: id }, 403],
      [
        req(),
        {
          tool: "test_read",
          agent_key: "recepcja",
          conversation_id: id,
          args: { pesel: PESEL, kwota: 5 },
        },
        200,
      ],
      [req(), { tool: "test_read", agent_key: "recepcja", conversation_id: id }, 200],
      [req(), { tool: "test_read", agent_key: "recepcja", conversation_id: id }, 429],
      [req(), { tool: "test_boom", agent_key: "recepcja", conversation_id: id }, 500],
      [req(), { tool: "test_refuse", agent_key: "recepcja", conversation_id: id }, 404],
    ];
    for (const [r, b, status] of steps) {
      expect((await dispatchTool(r, b)).status).toBe(status);
    }
    expect(calls()).toHaveLength(steps.length);
    expect(calls().map((c) => [c.decision, c.reason])).toEqual([
      ["denied", "unknown_tool"],
      ["denied", "unknown_agent"],
      ["denied", "agent_not_allowed"],
      ["denied", "identity_required"],
      ["ok", null],
      ["ok", null],
      ["denied", "rate_limited"],
      ["error", expect.stringContaining("connection refused")],
      ["denied", "Brak sprawy dla tego rozmówcy."],
    ]);
    for (const c of calls()) {
      expect(c.conversation_id).toBe(id);
      expect(typeof c.duration_ms).toBe("number");
    }
    // Audyt nie przechowuje treści argumentów — tylko kształt; PESEL wcale.
    expect(calls()[4].args_digest).toEqual({ pesel: "<redacted>", kwota: "5" });
    expect(JSON.stringify(calls()[4])).not.toContain(PESEL);
    expect(events()).toHaveLength(7);
    expect(events().every((e) => e.automation_type === "agent_tool_denied")).toBe(true);
  });
});

// ── Trasa publiczna: dwie ścieżki ────────────────────────────────────────────

const POST = (Route as any).options.server.handlers.POST as (a: {
  request: Request;
}) => Promise<Response>;

async function post(r: Request): Promise<{ status: number; body: any }> {
  const res = await POST({ request: r });
  return { status: res.status, body: await res.json() };
}

describe("POST /api/public/agent-tools", () => {
  it("nowe narzędzie bez sekretu → 401 z rejestru, handler nietknięty", async () => {
    const out = await post(
      req({
        header: null,
        body: { tool: "test_write", agent_key: "intake", conversation_id: conv() },
      }),
    );
    expect(out.status).toBe(401);
    expect(out.body).toEqual({ ok: false, error: "unauthorized" });
    expect(handled.test_write).toBeUndefined();
    // Odmowa w dispatchTool przed jakimkolwiek zapisem — bez wpisu audytu.
    expect(calls()).toHaveLength(0);
  });

  it("nowe narzędzie zapisu z ?token= → 401; z nagłówkiem → 200", async () => {
    const body = { tool: "test_write", agent_key: "intake", conversation_id: conv() };
    expect((await post(req({ header: null, token: SECRET, body }))).status).toBe(401);
    expect(handled.test_write).toBeUndefined();
    const ok = await post(req({ body }));
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true, result: { saved: true } });
  });

  it("wynik przez trasę też jest zredagowany", async () => {
    readResult = { pesel: PESEL, note: `PESEL ${PESEL}`, iban: IBAN, ok: "x" };
    const out = await post(
      req({ body: { tool: "test_read", agent_key: "recepcja", conversation_id: conv() } }),
    );
    expect(out.status).toBe(200);
    expect(out.body.result).toEqual({ note: "PESEL [PESEL ukryty]", ok: "x" });
  });

  it("nieznane narzędzie z sekretem → 400 z rejestru", async () => {
    const out = await post(req({ body: { tool: "cos_nowego" } }));
    expect(out.status).toBe(400);
    expect(out.body.error).toContain("Nieznane narzędzie");
  });

  it("narzędzie legacy z ?token= idzie starą ścieżką (bez rejestru i audytu)", async () => {
    const out = await post(
      req({ header: null, token: SECRET, body: { tool: "get_application_status" } }),
    );
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ ok: true, result: { has_application: false } });
    expect(calls()).toHaveLength(0);
  });

  it("narzędzie legacy bez sekretu → 401 jak dotąd", async () => {
    const out = await post(req({ header: null, body: { tool: "get_application_status" } }));
    expect(out.status).toBe(401);
    expect(out.body).toEqual({ ok: false, error: "unauthorized" });
    expect(calls()).toHaveLength(0);
  });

  it("agent_key przy nazwie legacy kieruje do rejestru — brak zejścia do ?token=", async () => {
    const out = await post(
      req({
        header: null,
        token: SECRET,
        body: { tool: "update_lead_data", agent_key: "intake", lead_id: "cudzy" },
      }),
    );
    expect(out.status).toBe(400);
    expect(out.body.error).toContain("Nieznane narzędzie");
    expect(lastCall()).toMatchObject({ tool: "update_lead_data", reason: "unknown_tool" });
  });

  it("pusty agent_key nie przejmuje narzędzia legacy", async () => {
    const out = await post(req({ body: { tool: "get_application_status", agent_key: "" } }));
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ ok: true, result: { has_application: false } });
    expect(calls()).toHaveLength(0);
  });

  it("nieparsowalny JSON: bez sekretu 401, z sekretem 400 invalid_json (jak dotąd)", async () => {
    const noSecret = await post(req({ header: null, raw: "{nie json" }));
    expect(noSecret.status).toBe(401);
    const withSecret = await post(req({ raw: "{nie json" }));
    expect(withSecret.status).toBe(400);
    expect(withSecret.body).toEqual({ ok: false, error: "invalid_json" });
    expect(calls()).toHaveLength(0);
  });

  it("body niebędące obiektem trafia do rejestru jako puste → 400", async () => {
    const out = await post(req({ raw: "[1,2,3]" }));
    expect(out.status).toBe(400);
    expect(lastCall()).toMatchObject({ reason: "unknown_tool" });
  });
});

// Na końcu pliku: resetuje moduły, więc nie może poprzedzać testów powyżej.
describe("ensureToolsLoaded — zimny start", () => {
  it("równoległe pierwsze wywołania czekają na moduły domenowe (bez pustego rejestru)", async () => {
    vi.resetModules();
    vi.doMock("./tools-knowledge.server", async () => {
      // Opóźniony import modułu domenowego — okno na wyścig przy zimnym starcie.
      await new Promise((r) => setTimeout(r, 20));
      const slow: ToolSpec = {
        name: "slow_tool",
        agents: [],
        requiresIdentity: false,
        writes: false,
        rateLimit: { perConversation: 10, windowMinutes: 10 },
        description: "Narzędzie z wolno ładowanego modułu.",
        handler: async () => ({ ok: true, result: { loaded: true } }),
      };
      return { TOOLS: [slow] };
    });
    try {
      const fresh = await import("./registry.server");
      const outs = await Promise.all(
        [conv(), conv(), conv()].map((id) =>
          fresh.dispatchTool(req(), {
            tool: "slow_tool",
            agent_key: "recepcja",
            conversation_id: id,
          }),
        ),
      );
      expect(outs.map((o) => o.status)).toEqual([200, 200, 200]);
      expect(fresh.hasTool("slow_tool")).toBe(true);
    } finally {
      vi.doMock("./tools-knowledge.server", () => ({ TOOLS: [] }));
    }
  });
});
