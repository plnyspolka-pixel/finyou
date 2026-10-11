// Testy narzędzi inwestorskich na atrapie Supabase (emulator PostgREST w
// pamięci: select z projekcją kolumn, eq/in/like, order, limit, insert,
// update, upsert + rpc). Sprawdzamy nie tylko odpowiedź, ale też to, CO
// trafia do leada, sesji i automation_events. lead-comms i nadawca SMS są
// zastąpione atrapami — ich własne testy żyją obok nich.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext, ToolSession } from "./types";
import {
  ACCESS_PRESENTATION,
  SUBSCRIPTION_PAYMENT_SENTENCE,
  SUBSCRIPTION_PRICE_SENTENCE,
  plnLabel,
} from "@/lib/investor-plan/plans";

type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
const writes: Array<{ table: string; op: string; values: Row }> = [];
/** Odpowiedzi RPC: funkcja albo błąd. */
const rpcs: Record<string, (args: Row | undefined) => { data: unknown; error: { message: string } | null }> = {};
/** Tabele, których odczyt ma zwrócić błąd (np. brak tabeli). */
const failingTables = new Set<string>();

const table = (name: string): Row[] => (db[name] ??= []);

function likeToRegex(pattern: string): RegExp {
  const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${esc}$`);
}

function builder(name: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let cols: string[] | null = null;
  let ord: { col: string; asc: boolean } | null = null;
  let lim: number | null = null;
  let single = false;
  let op: "select" | "insert" | "update" | "upsert" = "select";
  let payload: Row | Row[] | null = null;
  let onConflict = "id";
  const api: any = {};
  const chain = (fn: () => void) => {
    fn();
    return api;
  };
  api.select = (c?: string) =>
    chain(() => {
      if (op === "select" && c && c.trim() !== "*") cols = c.split(",").map((x) => x.trim());
    });
  api.eq = (col: string, v: unknown) => chain(() => filters.push((r) => r[col] === v));
  api.in = (col: string, vals: unknown[]) => chain(() => filters.push((r) => vals.includes(r[col])));
  api.like = (col: string, p: string) => chain(() => filters.push((r) => likeToRegex(p).test(String(r[col] ?? ""))));
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
  api.insert = (v: Row | Row[]) =>
    chain(() => {
      op = "insert";
      payload = v;
    });
  api.update = (v: Row) =>
    chain(() => {
      op = "update";
      payload = v;
    });
  api.upsert = (v: Row, o?: { onConflict?: string }) =>
    chain(() => {
      op = "upsert";
      payload = v;
      onConflict = o?.onConflict ?? "id";
    });
  const exec = () => {
    if (op === "insert") {
      const list = Array.isArray(payload) ? payload : [payload as Row];
      for (const v of list) {
        table(name).push({ ...v });
        writes.push({ table: name, op, values: v });
      }
      return { data: null, error: null };
    }
    if (op === "update") {
      for (const r of table(name).filter((x) => filters.every((f) => f(x)))) Object.assign(r, payload);
      writes.push({ table: name, op, values: payload as Row });
      return { data: null, error: null };
    }
    if (op === "upsert") {
      const v = payload as Row;
      const rowsT = table(name);
      const idx = rowsT.findIndex((r) => r[onConflict] === v[onConflict]);
      if (idx >= 0) Object.assign(rowsT[idx], v);
      else rowsT.push({ ...v });
      writes.push({ table: name, op, values: v });
      return { data: null, error: null };
    }
    if (failingTables.has(name)) return { data: null, error: { message: `relation "${name}" does not exist` } };
    let out = table(name).filter((r) => filters.every((f) => f(r)));
    if (ord) {
      const { col, asc } = ord;
      out = [...out].sort((a, b) => (asc ? 1 : -1) * String(a[col] ?? "").localeCompare(String(b[col] ?? "")));
    }
    if (lim != null) out = out.slice(0, lim);
    // Projekcja kolumn — handler dostaje tylko to, o co poprosił (jak PostgREST).
    const project = (r: Row) => (cols ? Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]])) : { ...r });
    const data = single ? (out[0] ? project(out[0]) : null) : out.map(project);
    return { data, error: null };
  };
  api.then = (resolve: any, reject?: any) => {
    try {
      return Promise.resolve(exec()).then(resolve, reject);
    } catch (e) {
      return Promise.reject(e).then(resolve, reject);
    }
  };
  return api;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (t: string) => builder(t),
    rpc: async (fn: string, args?: Row) => {
      const impl = rpcs[fn];
      if (!impl) return { data: null, error: { message: `function ${fn} does not exist` } };
      return impl(args);
    },
  },
}));

const mocks = vi.hoisted(() => ({
  findLeadId: vi.fn(),
  upsertLeadFromSource: vi.fn(),
  sendSmsInternal: vi.fn(),
}));

vi.mock("@/lib/lead-comms.server", () => ({
  findLeadId: mocks.findLeadId,
  upsertLeadFromSource: mocks.upsertLeadFromSource,
}));

vi.mock("@/lib/voicebot.functions", () => ({
  sendSmsInternal: mocks.sendSmsInternal,
}));

import {
  INVESTOR_REGISTRATION_URL,
  CALLBACK_SAY,
  TOOLS,
  anonymizeTeaser,
  deriveNextStep,
  parseSpokenNumber,
  pricingSummary,
  productsFromRows,
  qualifyInvestor,
  safeCity,
} from "./tools-investor.server";

const PHONE = "+48600100200";
const PESEL = "80010112345";
const UID = "u-inv-1";
const NOW = new Date("2026-10-11T10:00:00Z");

function session(over: Partial<ToolSession> = {}): ToolSession {
  return {
    conversation_id: "conv_inv",
    agent_key: "inwestor_presale",
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

function ctxFor(over: Partial<ToolContext> = {}): ToolContext {
  return {
    tool: "test",
    body: {},
    args: {},
    session: session(),
    callerPhone: null,
    callerEmail: null,
    now: NOW,
    redactions: [],
    ...over,
  };
}

const verifiedInvestor = () =>
  session({
    agent_key: "inwestor_panel",
    identity_verified: true,
    identity_method: "investor_phone",
    subject_kind: "investor",
    subject_id: "i1",
    investor_user_id: UID,
  });

const run = (name: string, ctx: ToolContext) => {
  const spec = TOOLS.find((t) => t.name === name);
  if (!spec) throw new Error(`brak narzędzia ${name}`);
  return spec.handler(ctx);
};

const result = async (name: string, ctx: ToolContext): Promise<Row> => {
  const out = await run(name, ctx);
  if (!out.ok) throw new Error(`oczekiwano ok, dostano błąd: ${out.error}`);
  return out.result as Row;
};

const sessionRow = () => table("agent_tool_sessions").find((r) => r.conversation_id === "conv_inv");
const events = (type: string) => table("automation_events").filter((e) => e.automation_type === type);

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  for (const k of Object.keys(rpcs)) delete rpcs[k];
  writes.length = 0;
  failingTables.clear();
  mocks.findLeadId.mockReset().mockResolvedValue(null);
  mocks.upsertLeadFromSource.mockReset().mockImplementation(async (opts: Row) => {
    const id = `lead_new_${table("leads").length + 1}`;
    table("leads").push({
      id,
      type: opts.type,
      source: opts.source,
      status: "nowy",
      notes: null,
      email: opts.email ?? null,
      phone_normalized: opts.phoneNormalized ?? null,
      application_data: opts.applicationData ?? {},
    });
    return id;
  });
  mocks.sendSmsInternal.mockReset().mockResolvedValue({ ok: true, sid: "SM1" });

  db.access_products = [
    { id: "p1", code: "investor_access_30d", audience: "investor", label: "Abonament — 30 dni", duration_days: 30, amount_grosz: 150000, currency: "PLN", active: true, sort_order: 1 },
    { id: "p2", code: "investor_access_365d", audience: "investor", label: "Abonament — 365 dni", duration_days: 365, amount_grosz: 700000, currency: "PLN", active: true, sort_order: 2 },
    // Historyczny, nieaktywny — nie może trafić do cennika.
    { id: "p3", code: "investor_pro_180d", audience: "investor", label: "Pakiet PRO", duration_days: 180, amount_grosz: 990000, currency: "PLN", active: false, sort_order: 3 },
    // Pośrednik — inna publiczność.
    { id: "p4", code: "broker_access_30d", audience: "broker", label: "Pośrednik", duration_days: 30, amount_grosz: 50000, currency: "PLN", active: true, sort_order: 4 },
  ];
  db.investors = [
    {
      id: "i1",
      user_id: UID,
      investor_type: "prywatny",
      entity_type: "osoba_fizyczna",
      company_name: null,
      first_name: "Anna",
      last_name: "Nowak",
      email: "anna@example.com",
      phone: PHONE,
      pesel: PESEL,
      nip: "1234563218",
      bank_account: "PL61109010140000071219812874",
      is_active: true,
      subscription_plan: "rocznie",
      subscription_status: "aktywny",
      subscription_active_until: "2027-01-01T00:00:00Z",
      screening_result: "clear",
      created_at: "2026-09-01T00:00:00Z",
    },
  ];
  db.investor_distribution_criteria = [
    { investor_id: "i1", min_amount: 100000, max_amount: 500000, auto_send_enabled: true, accepting_applications: true, paused_until: null, updated_at: "2026-10-01" },
  ];
  db.investor_orders = [];
  db.leads = [];
  db.agent_tool_sessions = [];
  db.automation_events = [];
});

describe("TOOLS — rejestr", () => {
  it("sześć narzędzi z agentami, tożsamością, zapisem i limitami wg specyfikacji", () => {
    const by = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
    expect(Object.keys(by).sort()).toEqual([
      "get_investor_state",
      "get_offer_teasers",
      "get_pricing",
      "request_investor_callback",
      "save_investor_needs",
      "send_investor_registration_link",
    ]);
    const invest = ["inwestor_presale", "inwestor_panel", "recepcja"];
    for (const n of ["get_pricing", "get_offer_teasers", "get_investor_state", "save_investor_needs", "send_investor_registration_link"]) {
      expect([...by[n].agents].sort()).toEqual([...invest].sort());
    }
    expect([...by.request_investor_callback.agents].sort()).toEqual(["inwestor_panel", "inwestor_presale"]);
    expect(by.get_pricing.rateLimit).toEqual({ perConversation: 4, windowMinutes: 10 });
    expect(by.get_offer_teasers.rateLimit).toEqual({ perConversation: 4, windowMinutes: 10 });
    expect(by.get_investor_state.rateLimit).toEqual({ perConversation: 4, windowMinutes: 10 });
    expect(by.save_investor_needs.rateLimit).toEqual({ perConversation: 10, windowMinutes: 30 });
    expect(by.request_investor_callback.rateLimit).toEqual({ perConversation: 2, windowMinutes: 30 });
    expect(by.send_investor_registration_link.rateLimit).toEqual({ perConversation: 1, windowMinutes: 30 });
    expect(TOOLS.filter((t) => t.requiresIdentity).map((t) => t.name)).toEqual(["get_investor_state"]);
    expect(TOOLS.filter((t) => t.writes).map((t) => t.name).sort()).toEqual([
      "request_investor_callback",
      "save_investor_needs",
      "send_investor_registration_link",
    ]);
  });
});

describe("get_pricing", () => {
  it("ceny z access_products: tylko aktywne produkty inwestora, zdanie o cenie jak w plans.ts", async () => {
    const r = await result("get_pricing", ctxFor());
    expect(r.source).toBe("access_products");
    expect(r.products).toEqual([
      { code: "investor_access_30d", label: "Abonament — 30 dni", duration_days: 30, price_pln: 1500, price_label: plnLabel(1500) },
      { code: "investor_access_365d", label: "Abonament — 365 dni", duration_days: 365, price_pln: 7000, price_label: plnLabel(7000) },
    ]);
    expect(r.price_sentence).toBe(SUBSCRIPTION_PRICE_SENTENCE);
    expect(r.discount).toEqual({ yearly_discount_pct: 61, yearly_savings_pln: 11000 });
    expect(r.payment_sentence).toBe(SUBSCRIPTION_PAYMENT_SENTENCE);
    expect(r.client_commission).toContain("5%");
    expect(r.client_commission).toContain(plnLabel(5000));
    expect(r.client_commission).toMatch(/bez VAT/);
    expect(r.client_commission).toMatch(/potrącan/);
    expect(r.seller.name).toBe("Fundacja Krzewienia Edukacji Finansowej im. Pieczaka");
    expect(r.what_is_included).toHaveLength(ACCESS_PRESENTATION.bullets.length);
    for (const b of r.what_is_included) expect(typeof b).toBe("string");
    expect(r.what_is_included[0]).toContain(ACCESS_PRESENTATION.bullets[0].cecha);
    // Kolejność wejścia: abonament → umowy → moduł ofert.
    const order = (r.onboarding_order as string[]).join(" | ");
    expect(order.indexOf("Abonament")).toBeLessThan(order.indexOf("Umowę ramową"));
    expect(order.indexOf("Umowę ramową")).toBeLessThan(order.indexOf("Moduł ofert"));
    expect(order).toMatch(/NDA/);
    expect(order).toMatch(/RODO/);
    expect(r.limits).toMatchObject({ max_annual_rate_pct: 14.5, ltv_max_pct: 60 });
    expect(r.say).toContain(SUBSCRIPTION_PRICE_SENTENCE);
  });

  it("zmiana ceny w bazie zmienia zdanie i rabat bez zmiany kodu", async () => {
    db.access_products[0].amount_grosz = 160000; // 1 600 zł / mies.
    const r = await result("get_pricing", ctxFor());
    expect(r.source).toBe("access_products");
    expect(r.price_sentence).toContain(plnLabel(1600));
    // 12 × 1 600 = 19 200; oszczędność 12 200 → 63,5% → w dół 63%.
    expect(r.discount).toEqual({ yearly_discount_pct: 63, yearly_savings_pln: 12200 });
    expect(r.price_sentence).toContain("63% taniej");
    expect(r.price_sentence).not.toBe(SUBSCRIPTION_PRICE_SENTENCE);
  });

  it("pusty katalog → zaplecze z plans.ts z flagą źródła", async () => {
    db.access_products = [];
    const r = await result("get_pricing", ctxFor());
    expect(r.source).toBe("plans.ts");
    expect(r.products.map((p: Row) => [p.code, p.price_pln, p.duration_days])).toEqual([
      ["investor_access_30d", 1500, 30],
      ["investor_access_365d", 7000, 365],
    ]);
    expect(r.price_sentence).toBe(SUBSCRIPTION_PRICE_SENTENCE);
    expect(r.discount.yearly_discount_pct).toBe(61);
  });

  it("błąd odczytu katalogu → też zaplecze z plans.ts", async () => {
    failingTables.add("access_products");
    const r = await result("get_pricing", ctxFor());
    expect(r.source).toBe("plans.ts");
    expect(r.price_sentence).toBe(SUBSCRIPTION_PRICE_SENTENCE);
  });

  it("productsFromRows / pricingSummary — filtr kodu i jeden produkt", () => {
    const ps = productsFromRows([
      { code: "investorXaccess", audience: "investor", amount_grosz: 100, active: true },
      { code: "investor_access_30d", audience: "investor", amount_grosz: "abc", active: true },
      { code: "investor_access_30d", audience: "investor", amount_grosz: 150000, duration_days: 30, active: true, label: "Miesiąc" },
    ]);
    expect(ps).toHaveLength(1);
    expect(pricingSummary(ps)).toEqual({ price_sentence: `${plnLabel(1500)} za 30 dni`, yearly_discount_pct: null, yearly_savings_pln: null });
  });
});

describe("get_offer_teasers", () => {
  const teaserRow = (i: number, over: Row = {}): Row => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    match_id: `match-${i}`,
    order_id: `order-${i}`,
    project_ref: `FY-P-${i}`,
    match_status: "teaser",
    created_at: `2026-10-0${i}T10:00:00Z`,
    loan_amount: 100000 + i * 1000,
    preferred_period_months: 12,
    annual_investor_rate: 13.5,
    estimated_ltv: 45.25,
    property_type: "mieszkanie",
    city: "Lublin",
    voivodeship: "lubelskie",
    estimated_value: 400000,
    area_sqm: 52.3,
    ...over,
  });

  it("maks. 5 anonimowych teaserów + count_total; bez id, nazw, adresu i numeru KW", async () => {
    const list = [
      teaserRow(1, { city: "Kraków, ul. Długa 5", client_name: "Jan Kowalski" }),
      teaserRow(2, { city: "WA1M/00012345/6 Warszawa ul. Prosta 7" }),
      teaserRow(3, { city: "00-511 Warszawa" }),
      teaserRow(4),
      teaserRow(5),
      teaserRow(6),
      teaserRow(7, { property_type: "dom" }),
    ];
    rpcs.investor_offer_teasers = () => ({ data: list, error: null });
    const r = await result("get_offer_teasers", ctxFor());
    expect(r.available).toBe(true);
    expect(r.count_total).toBe(7);
    expect(r.teasers).toHaveLength(5);
    // Najnowsze pierwsze.
    expect(r.teasers[0]).toEqual({
      amount_pln: 107000,
      period_months: 12,
      property_type: "Dom",
      city: "Lublin",
      ltv_pct: 45.3,
      annual_rate_pct: 13.5,
    });
    for (const t of r.teasers) {
      expect(Object.keys(t).sort()).toEqual(["amount_pln", "annual_rate_pct", "city", "ltv_pct", "period_months", "property_type"]);
    }
    const json = JSON.stringify(r);
    for (const secret of ["00000000-0000", "match-", "order-", "FY-P-", "Kowalski", "Długa", "Prosta", "WA1M", "00012345", "lubelskie", "400000", "52.3"]) {
      expect(json).not.toContain(secret);
    }
    expect(typeof r.say).toBe("string");
  });

  it("anonymizeTeaser / safeCity — sam tekst miasta", () => {
    expect(safeCity("Kraków, ul. Długa 5")).toBe("Kraków");
    expect(safeCity("WA1M/00012345/6 Warszawa ul. Prosta 7")).toBe("Warszawa");
    expect(safeCity("00-511 Warszawa")).toBe("Warszawa");
    expect(safeCity("Bielsko-Biała")).toBe("Bielsko-Biała");
    expect(safeCity("12345")).toBeNull();
    expect(anonymizeTeaser({ id: "x", loan_amount: null, city: null })).toEqual({
      amount_pln: null,
      period_months: null,
      property_type: null,
      city: null,
      ltv_pct: null,
      annual_rate_pct: null,
    });
  });

  it("brak przykładów → available=true, pusta lista i uczciwe `say`", async () => {
    rpcs.investor_offer_teasers = () => ({ data: [], error: null });
    const r = await result("get_offer_teasers", ctxFor());
    expect(r).toMatchObject({ available: true, count_total: 0, teasers: [] });
    expect(r.say).toMatch(/Zlecenia/);
  });

  it("błąd RPC → available=false z `say`", async () => {
    rpcs.investor_offer_teasers = () => ({ data: null, error: { message: "permission denied" } });
    const r = await result("get_offer_teasers", ctxFor());
    expect(r.available).toBe(false);
    expect(typeof r.say).toBe("string");
    expect(r.teasers).toBeUndefined();
  });
});

describe("get_investor_state", () => {
  const access = (state: Row) => {
    rpcs.get_access_state = (args) => {
      expect(args).toEqual({ _audience: "investor", _user_id: UID });
      return { data: state, error: null };
    };
  };
  const legal = (v: boolean) => {
    rpcs.investor_legal_pack_complete = (args) => {
      expect(args).toEqual({ _user_id: UID });
      return { data: v, error: null };
    };
  };

  it("bez abonamentu → wykup_abonament; bez danych wrażliwych w wyniku", async () => {
    access({ hasPaidAccess: false, isBypass: false, hasModuleAccess: false, activeUntil: null, daysLeft: 0 });
    legal(false);
    const r = await result("get_investor_state", ctxFor({ session: verifiedInvestor() }));
    expect(r.next_step).toBe("wykup_abonament");
    expect(r.access).toMatchObject({ source: "get_access_state", has_access: false });
    expect(r.criteria).toMatchObject({ min_amount: 100000, max_amount: 500000, auto_send_enabled: true });
    expect(r.investor).toMatchObject({ subscription_status: "aktywny", screening_result: "clear" });
    const json = JSON.stringify(r);
    for (const secret of [PESEL, "1234563218", "PL61109010140000071219812874", "anna@example.com", "Nowak", PHONE]) {
      expect(json).not.toContain(secret);
    }
    // Zapytanie nawet nie prosi o wrażliwe kolumny.
    expect(r.say).toMatch(/Dostęp i płatności/);
  });

  it("abonament bez kompletu umów → zaakceptuj_umowy", async () => {
    access({ hasPaidAccess: true, activeUntil: "2027-01-01", daysLeft: 82 });
    legal(false);
    const r = await result("get_investor_state", ctxFor({ session: verifiedInvestor() }));
    expect(r.next_step).toBe("zaakceptuj_umowy");
    expect(r.legal_pack_complete).toBe(false);
    expect(r.say).toMatch(/Umowę ramową, NDA i umowę RODO/);
  });

  it("komplet bez Zlecenia → zloz_zlecenie; z otwartym Zleceniem → sprawdz_oferty (wygasłe się nie liczy)", async () => {
    access({ hasPaidAccess: false, hasModuleAccess: true });
    legal(true);
    db.investor_orders = [
      { id: "o1", user_id: UID, status: "przyjete", expires_at: "2026-10-01T00:00:00Z" }, // po terminie
      { id: "o2", user_id: UID, status: "odrzucone", expires_at: null },
      { id: "o3", user_id: "ktos-inny", status: "zlozone", expires_at: null },
    ];
    let r = await result("get_investor_state", ctxFor({ session: verifiedInvestor() }));
    expect(r.open_orders).toBe(0);
    expect(r.next_step).toBe("zloz_zlecenie");

    db.investor_orders.push({ id: "o4", user_id: UID, status: "zlozone", expires_at: null });
    r = await result("get_investor_state", ctxFor({ session: verifiedInvestor() }));
    expect(r.open_orders).toBe(1);
    expect(r.next_step).toBe("sprawdz_oferty");
  });

  it("RPC get_access_state niedostępne → abonament z kolumn investors", async () => {
    legal(true);
    const r = await result("get_investor_state", ctxFor({ session: verifiedInvestor() }));
    expect(r.access).toMatchObject({ source: "investors", has_access: true, active_until: "2027-01-01T00:00:00Z" });
    expect(r.next_step).toBe("zloz_zlecenie");

    db.investors[0].subscription_active_until = "2026-10-01T00:00:00Z"; // wygasł
    const r2 = await result("get_investor_state", ctxFor({ session: verifiedInvestor() }));
    expect(r2.access.has_access).toBe(false);
    expect(r2.next_step).toBe("wykup_abonament");
  });

  it("bez potwierdzonego inwestora w sesji → odmowa (także kandydat po weryfikacji jako klient)", async () => {
    const noUser = await run("get_investor_state", ctxFor({ session: session() }));
    expect(noUser.ok).toBe(false);
    const asClient = await run(
      "get_investor_state",
      ctxFor({ session: session({ identity_verified: true, subject_kind: "client", subject_id: "k1", investor_user_id: UID }) }),
    );
    expect(asClient.ok).toBe(false);
  });

  it("deriveNextStep — kolejność bramek", () => {
    const base = { hasInvestor: true, hasAccess: true, legalPackComplete: true, openOrders: 0 };
    expect(deriveNextStep({ ...base, hasInvestor: false }).next_step).toBe("dokoncz_rejestracje");
    expect(deriveNextStep({ ...base, hasAccess: false, legalPackComplete: true }).next_step).toBe("wykup_abonament");
    expect(deriveNextStep({ ...base, legalPackComplete: false }).next_step).toBe("zaakceptuj_umowy");
    expect(deriveNextStep(base).next_step).toBe("zloz_zlecenie");
    expect(deriveNextStep({ ...base, openOrders: 2 }).next_step).toBe("sprawdz_oferty");
  });
});

describe("save_investor_needs — kwalifikacja", () => {
  it("A: decydent, 250 tys., w tym kwartale → nowy lead inwestorski bez e-maila w upsercie, potrzeby na leadzie i w sesji", async () => {
    const out = await result(
      "save_investor_needs",
      ctxFor({
        callerPhone: PHONE,
        callerEmail: "inwestor@example.com",
        args: {
          ticket_pln: "250 tys. zł",
          horizon_months: 24,
          min_yield_pct: "12,5%",
          property_types: ["mieszkanie", "lokal"],
          regions: ["Mazowsze"],
          decision_role: "Decydent",
          experience: "kilka",
          objections: ["ryzyko"],
          timeline: "kwartał",
          wants_callback: true,
          summary: "Szuka zabezpieczonych hipoteką pożyczek dla firm.",
        },
      }),
    );
    expect(out).toMatchObject({ saved: true, qualification: "A", lead_id: "lead_new_1", saved_on_lead: true });
    expect(out.say).toBe("Dziękuję, zanotowane.");
    expect(out.agent_note).toMatch(/request_investor_callback/);

    // Lead: typ inwestorski, e-mail NIE w upsercie (helper zakładałby stub wniosku pożyczkowego).
    expect(mocks.upsertLeadFromSource).toHaveBeenCalledTimes(1);
    const opts = mocks.upsertLeadFromSource.mock.calls[0][0];
    expect(opts).toMatchObject({ type: "inwestorski", phoneNormalized: PHONE });
    expect(opts.email).toBeUndefined();
    const lead = table("leads")[0];
    expect(lead.email).toBe("inwestor@example.com");
    expect(lead.application_data.qualification).toBe("A");
    expect(lead.application_data.investor_needs).toMatchObject({
      ticket_pln: 250000,
      horizon_months: 24,
      min_yield_pct: 12.5,
      decision_role: "decydent",
      timeline: "kwartal",
      experience: "kilka",
      property_types: ["mieszkanie", "lokal"],
    });

    const s = sessionRow();
    expect(s?.lead_id).toBe("lead_new_1");
    expect(s?.needs).toMatchObject({ investor_qualification: "A", investor_ticket_pln: 250000, decision_role: "decydent", timeline: "kwartal" });
    expect(events("investor_needs_recognized")).toHaveLength(1);
    expect(events("investor_needs_recognized")[0].sent_payload).toMatchObject({ qualification: "A", lead_id: "lead_new_1", agent_key: "inwestor_presale" });
  });

  it("B: 60 000 zł bez pośpiechu; B: mała kwota, ale „teraz”", async () => {
    const b1 = await result(
      "save_investor_needs",
      ctxFor({ args: { ticket_pln: 60000, decision_role: "rekomenduje", timeline: "kiedyś" } }),
    );
    expect(b1.qualification).toBe("B");
    const b2 = await result("save_investor_needs", ctxFor({ args: { ticket_pln: 10000, decision_role: "szuka info", timeline: "teraz" } }));
    expect(b2.qualification).toBe("B");
  });

  it("C: 20 000 zł, szuka informacji, kiedyś — bez kontaktu nie zakłada leada", async () => {
    const c = await result("save_investor_needs", ctxFor({ args: { ticket_pln: 20000, decision_role: "szuka_info", timeline: "kiedys" } }));
    expect(c).toMatchObject({ saved: true, qualification: "C", lead_id: null, saved_on_lead: false });
    expect(mocks.upsertLeadFromSource).not.toHaveBeenCalled();
    expect(sessionRow()?.needs.investor_qualification).toBe("C");
  });

  it("lead z sesji: bez szukania i bez upsertu, scalenie application_data", async () => {
    db.leads = [{ id: "lead_s", status: "nowy", notes: null, email: null, phone_normalized: PHONE, application_data: { lead_magnet: "poradnik" } }];
    const r = await result(
      "save_investor_needs",
      ctxFor({ session: session({ lead_id: "lead_s" }), callerPhone: PHONE, args: { ticket_pln: 300000, decision_role: "decydent", timeline: "teraz" } }),
    );
    expect(r).toMatchObject({ qualification: "A", lead_id: "lead_s" });
    expect(mocks.findLeadId).not.toHaveBeenCalled();
    expect(mocks.upsertLeadFromSource).not.toHaveBeenCalled();
    expect(db.leads[0].application_data).toMatchObject({ lead_magnet: "poradnik", qualification: "A" });
  });

  it("istniejący lead po telefonie nie idzie przez upsert (typ i źródło zostają)", async () => {
    db.leads = [{ id: "lead_old", type: "pozyczkowy", source: "meta", status: "w_kontakcie", email: null, phone_normalized: PHONE, application_data: {} }];
    mocks.findLeadId.mockResolvedValue("lead_old");
    const r = await result("save_investor_needs", ctxFor({ callerPhone: PHONE, args: { ticket_pln: 100000 } }));
    expect(r.lead_id).toBe("lead_old");
    expect(mocks.upsertLeadFromSource).not.toHaveBeenCalled();
    expect(db.leads[0]).toMatchObject({ type: "pozyczkowy", source: "meta" });
  });

  it("qualifyInvestor — progi", () => {
    expect(qualifyInvestor({ ticket_pln: 200000, decision_role: "decydent", timeline: "teraz" })).toBe("A");
    expect(qualifyInvestor({ ticket_pln: 199999, decision_role: "decydent", timeline: "teraz" })).toBe("B");
    expect(qualifyInvestor({ ticket_pln: 500000, decision_role: "rekomenduje", timeline: "kwartal" })).toBe("B");
    expect(qualifyInvestor({ ticket_pln: 500000, decision_role: "decydent", timeline: "kiedys" })).toBe("B");
    expect(qualifyInvestor({ ticket_pln: 50000, decision_role: null, timeline: null })).toBe("B");
    expect(qualifyInvestor({ ticket_pln: 49999, decision_role: "decydent", timeline: "kiedys" })).toBe("C");
    expect(qualifyInvestor({ ticket_pln: null, decision_role: null, timeline: null })).toBe("C");
  });
});

describe("save_investor_needs — walidacja liczb i tekstu", () => {
  it.each([
    ["ujemna kwota", { ticket_pln: -5 }],
    ["kwota tekstem bez liczby", { ticket_pln: "dużo" }],
    ["nieskończoność", { ticket_pln: Number.POSITIVE_INFINITY }],
    ["NaN", { ticket_pln: Number.NaN }],
    ["ponad 1 mld zł", { ticket_pln: 2_000_000_000 }],
    ["ponad 1 mld zł słownie", { ticket_pln: "1,5 mld" }],
    ["ujemny horyzont", { ticket_pln: 100000, horizon_months: -1 }],
    ["rentowność nie-liczba", { ticket_pln: 100000, min_yield_pct: "wysoka" }],
  ])("%s → odmowa bez zapisu", async (_label, args) => {
    const out = await run("save_investor_needs", ctxFor({ callerPhone: PHONE, args }));
    expect(out.ok).toBe(false);
    expect((out as { error: string }).error).toMatch(/dopytaj/);
    expect(writes).toHaveLength(0);
    expect(mocks.upsertLeadFromSource).not.toHaveBeenCalled();
  });

  it("wartości skrajne przycinane: horyzont do 600 mies., rentowność do 100% z flagą odsetek maksymalnych", async () => {
    const r = await result("save_investor_needs", ctxFor({ args: { ticket_pln: "1 000 000 000", horizon_months: 9999, min_yield_pct: 150 } }));
    const needs = sessionRow()?.needs.investor_needs;
    expect(needs).toMatchObject({ ticket_pln: 1_000_000_000, horizon_months: 600, min_yield_pct: 100 });
    expect(r.flags).toEqual(expect.arrayContaining(["horizon_clamped", "min_yield_clamped", "min_yield_above_statutory_max"]));
    expect(r.say).toMatch(/14,5% rocznie/);
  });

  it("teksty do 500 znaków, listy do 10 pozycji, PESEL zamaskowany; nieznane wartości słownika → null", async () => {
    const long = "x".repeat(800);
    await result(
      "save_investor_needs",
      ctxFor({
        args: {
          ticket_pln: 100000,
          summary: `${long} pesel ${PESEL}`,
          objections: Array.from({ length: 15 }, (_, i) => `obiekcja ${i}`),
          regions: "Śląsk",
          decision_role: "prezes",
          experience: "ekspert",
        },
      }),
    );
    const needs = sessionRow()?.needs.investor_needs;
    expect(needs.summary.length).toBeLessThanOrEqual(500);
    expect(needs.objections).toHaveLength(10);
    expect(needs.regions).toEqual(["Śląsk"]);
    expect(needs.decision_role).toBeNull();
    expect(needs.experience).toBeNull();
    const short = await result("save_investor_needs", ctxFor({ args: { summary: `mój pesel ${PESEL}` } }));
    expect(short.saved).toBe(true);
    expect(JSON.stringify(table("agent_tool_sessions"))).not.toContain(PESEL);
    expect(JSON.stringify(table("automation_events"))).not.toContain(PESEL);
  });

  it("puste args → odmowa", async () => {
    const out = await run("save_investor_needs", ctxFor({ args: {} }));
    expect(out.ok).toBe(false);
  });

  it("parseSpokenNumber — zapisy mówione", () => {
    expect(parseSpokenNumber("250 tys.")).toBe(250000);
    expect(parseSpokenNumber("250zł")).toBe(250);
    expect(parseSpokenNumber("1,5 mln zł")).toBe(1_500_000);
    expect(parseSpokenNumber("200k")).toBe(200000);
    expect(parseSpokenNumber("200 000 PLN")).toBe(200000);
    expect(parseSpokenNumber("8,5%")).toBe(8.5);
    expect(parseSpokenNumber("")).toBeUndefined();
    expect(parseSpokenNumber(null)).toBeUndefined();
    expect(parseSpokenNumber("abc")).toBeNull();
    expect(parseSpokenNumber(Number.NaN)).toBeNull();
    expect(parseSpokenNumber({})).toBeNull();
  });
});

describe("request_investor_callback", () => {
  it("bez telefonu i e-maila → odmowa z prośbą o kontakt", async () => {
    const out = await run("request_investor_callback", ctxFor({ args: {} }));
    expect(out.ok).toBe(false);
    expect((out as { error: string }).error).toMatch(/telefonu|e-mail/);
  });

  it("zapis na leadzie: notatka dopisana, status „nowy” → „wymaga_kontaktu”, `say` bez obietnicy terminu", async () => {
    db.leads = [{ id: "lead_s", status: "nowy", notes: "stara notatka", email: null, phone_normalized: PHONE, application_data: {} }];
    const r = await result(
      "request_investor_callback",
      ctxFor({
        session: session({ lead_id: "lead_s" }),
        callerPhone: PHONE,
        args: { preferred_time: "po 16", topic: `pytania o umowę, pesel ${PESEL}` },
      }),
    );
    expect(r).toMatchObject({ saved: true, lead_id: "lead_s", saved_on_lead: true, phone_hint: "…02 00" });
    expect(r.say).toBe(CALLBACK_SAY);
    expect(r.say).toBe(
      "Zapisuję prośbę o kontakt. Nie obiecuję terminu — jeśli opiekun inwestorów uzna, że może pomóc, odezwie się bezpośrednio.",
    );
    const lead = db.leads[0];
    expect(lead.status).toBe("wymaga_kontaktu");
    expect(lead.notes).toMatch(/^stara notatka\n\[AI .*\] Prośba o kontakt opiekuna inwestorów/);
    expect(lead.notes).toContain("po 16");
    expect(lead.notes).not.toContain(PESEL);
    expect(events("investor_callback_requested")).toHaveLength(1);
    expect(JSON.stringify(events("investor_callback_requested"))).not.toContain(PHONE);
    expect(sessionRow()?.needs.wants_callback).toBe(true);
  });

  it("lead dalej w lejku — status zostaje, notatka dopisana; e-mail z args trafia w puste pole", async () => {
    db.leads = [{ id: "lead_s", status: "wniosek_zlozony", notes: null, email: null, phone_normalized: null, application_data: {} }];
    await result(
      "request_investor_callback",
      ctxFor({ session: session({ lead_id: "lead_s" }), args: { email: "Inwestor@Example.com" } }),
    );
    expect(db.leads[0].status).toBe("wniosek_zlozony");
    expect(db.leads[0].email).toBe("inwestor@example.com");
    expect(db.leads[0].notes).toContain("Prośba o kontakt opiekuna inwestorów");
  });
});

describe("send_investor_registration_link", () => {
  it("telefon rozmowy → SMS tym samym nadawcą co agent głosowy (źródło elevenlabs_agent)", async () => {
    const r = await result("send_investor_registration_link", ctxFor({ callerPhone: PHONE }));
    expect(r).toMatchObject({ sent: true, channel: "sms", link: INVESTOR_REGISTRATION_URL });
    expect(INVESTOR_REGISTRATION_URL).toBe("https://financeyou.pl/rejestracja?role=inwestor");
    expect(mocks.sendSmsInternal).toHaveBeenCalledTimes(1);
    const call = mocks.sendSmsInternal.mock.calls[0][0];
    expect(call).toMatchObject({ phone: PHONE, source: "elevenlabs_agent" });
    expect(call.body).toContain(INVESTOR_REGISTRATION_URL);
    expect(JSON.stringify(r)).not.toContain(PHONE);
  });

  it("hamulec SMS (np. STOP / do_not_sms) → bez SMS-a, link do podania słownie", async () => {
    mocks.sendSmsInternal.mockResolvedValue({ ok: false, skipped: true, reason: "opt_out", error: "SMS pominięty" });
    const r = await result("send_investor_registration_link", ctxFor({ callerPhone: PHONE }));
    expect(r).toMatchObject({ sent: false, reason: "opt_out", link: INVESTOR_REGISTRATION_URL });
    expect(r.say).toMatch(/financeyou\.pl\/rejestracja/);
  });

  it("brak telefonu (czat) → link do wpisania, bez SMS-a", async () => {
    const r = await result("send_investor_registration_link", ctxFor({ session: session({ channel: "chat" }) }));
    expect(r).toMatchObject({ sent: false, channel: "agent", link: INVESTOR_REGISTRATION_URL });
    expect(r.say).toContain(INVESTOR_REGISTRATION_URL);
    expect(mocks.sendSmsInternal).not.toHaveBeenCalled();
  });

  it("sprzeciw wobec kontaktu w sesji → bez SMS-a", async () => {
    const r = await result("send_investor_registration_link", ctxFor({ callerPhone: PHONE, session: session({ do_not_contact: true }) }));
    expect(r).toMatchObject({ sent: false, reason: "do_not_contact" });
    expect(mocks.sendSmsInternal).not.toHaveBeenCalled();
  });
});
