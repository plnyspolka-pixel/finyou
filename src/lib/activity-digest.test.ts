import { describe, expect, it } from "vitest";
import {
  collectActivitySince,
  renderActivityDigestText,
  summarizeActivity,
  type ActivityUpdates,
} from "./activity-digest.server";

type Row = Record<string, any>;

/**
 * Minimalny, in-memory odpowiednik klienta PostgREST na potrzeby
 * `collectActivitySince`: select(count) + gte/lt/eq/neq/in/is + order/limit.
 */
function fakeDb(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let orderBy: { col: string; asc: boolean } | null = null;
    let limitN: number | null = null;
    const q: any = {
      select() {
        return q;
      },
      gte(col: string, v: string) {
        filters.push((r) => r[col] !== null && r[col] !== undefined && r[col] >= v);
        return q;
      },
      lt(col: string, v: string) {
        filters.push((r) => r[col] !== null && r[col] !== undefined && r[col] < v);
        return q;
      },
      eq(col: string, v: unknown) {
        filters.push((r) => r[col] === v);
        return q;
      },
      neq(col: string, v: unknown) {
        filters.push((r) => r[col] !== v);
        return q;
      },
      in(col: string, vs: unknown[]) {
        filters.push((r) => vs.includes(r[col]));
        return q;
      },
      is(col: string, v: unknown) {
        filters.push((r) => (v === null ? r[col] === null || r[col] === undefined : r[col] === v));
        return q;
      },
      order(col: string, o?: { ascending?: boolean }) {
        orderBy = { col, asc: o?.ascending !== false };
        return q;
      },
      limit(n: number) {
        limitN = n;
        return q;
      },
      then(resolve: (v: any) => void) {
        let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        const count = rows.length;
        if (orderBy) {
          const { col, asc } = orderBy;
          rows = [...rows].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0));
          if (!asc) rows.reverse();
        }
        if (limitN !== null) rows = rows.slice(0, limitN);
        resolve({ data: rows, error: null, count });
      },
    };
    return q;
  };
  return { from, tables };
}

const SINCE = "2026-09-21T08:00:00.000Z";
const UNTIL = "2026-09-21T08:30:00.000Z";

function sampleTables(): Record<string, Row[]> {
  return {
    leads: [
      {
        id: "l1",
        first_name: "Jan",
        last_name: "Kowalski",
        email: "jan@example.com",
        phone_raw: "600100200",
        type: "klient",
        status: "nowy",
        source: "landing",
        created_at: "2026-09-21T08:10:00.000Z",
      },
      {
        id: "l0",
        first_name: "Stary",
        last_name: "Lead",
        email: null,
        phone_raw: null,
        type: "klient",
        status: "nowy",
        source: null,
        created_at: "2026-09-21T07:00:00.000Z",
      },
    ],
    loan_applications: [
      {
        id: "a1",
        status: "nowy_lead",
        loan_amount: 250000,
        preferred_period_months: 24,
        completeness_percent: 40,
        source: "landing",
        created_at: "2026-09-21T08:12:00.000Z",
        deleted_at: null,
      },
      {
        id: "a2",
        status: "nowy_lead",
        loan_amount: 1,
        preferred_period_months: 1,
        completeness_percent: 0,
        source: null,
        created_at: "2026-09-21T08:13:00.000Z",
        deleted_at: "2026-09-21T08:14:00.000Z",
      },
    ],
    lead_communications: [
      {
        id: "c1",
        lead_id: "l1",
        channel: "email",
        direction: "inbound",
        subject: "Pytanie o ratę",
        content: "Dzień dobry,   ile wyniesie rata?",
        email: "jan@example.com",
        phone_normalized: null,
        created_at: "2026-09-21T08:20:00.000Z",
      },
      {
        id: "c2",
        lead_id: "l1",
        channel: "email",
        direction: "outbound",
        subject: "Re: Pytanie",
        content: "Odpowiedź",
        email: "jan@example.com",
        phone_normalized: null,
        created_at: "2026-09-21T08:21:00.000Z",
      },
      {
        id: "c3",
        lead_id: null,
        channel: "voicebot_call",
        direction: "inbound",
        subject: null,
        content: "Rozmowa telefoniczna",
        email: null,
        phone_normalized: "+48600300400",
        created_at: "2026-09-21T08:22:00.000Z",
      },
      {
        id: "c4",
        lead_id: "l1",
        channel: "note",
        direction: "inbound",
        subject: null,
        content: "log techniczny",
        email: null,
        phone_normalized: null,
        created_at: "2026-09-21T08:23:00.000Z",
      },
    ],
    investor_offers: [
      {
        id: "o1",
        loan_application_id: "a1",
        investor_id: "i1",
        offer_status: "zlozona",
        proposed_amount: 200000,
        period_months: 24,
        created_at: "2026-09-21T08:25:00.000Z",
      },
      {
        id: "o2",
        loan_application_id: "a1",
        investor_id: "i2",
        offer_status: "szkic",
        proposed_amount: 1,
        period_months: 1,
        created_at: "2026-09-21T08:26:00.000Z",
      },
    ],
    offer_distribution_messages: [
      {
        id: "m1",
        loan_application_id: "a1",
        direction: "inbound",
        from_email: "oferty@instytucja.pl",
        subject: "Re: Oferta",
        content: "Jesteśmy zainteresowani",
        created_at: "2026-09-21T08:26:00.000Z",
      },
    ],
    access_payments: [
      {
        id: "p1",
        audience: "investor",
        product_id: "investor_pro",
        buyer_email: "inwestor@example.com",
        paid_amount_grosz: 19900,
        currency: "PLN",
        status: "paid",
        processed_at: "2026-09-21T08:27:00.000Z",
      },
      {
        id: "p2",
        audience: "investor",
        product_id: "investor_pro",
        buyer_email: "x@example.com",
        paid_amount_grosz: null,
        currency: "PLN",
        status: "pending",
        processed_at: null,
      },
    ],
  };
}

describe("collectActivitySince", () => {
  it("zbiera tylko zdarzenia z okna; pomija outbound, logi techniczne, usunięte wnioski, szkice ofert i nieopłacone płatności", async () => {
    const db = fakeDb(sampleTables());
    const u = await collectActivitySince({ since: SINCE, until: UNTIL }, db);
    expect(u.errors).toEqual([]);
    expect(u.counts).toEqual({
      leads: 1,
      applications: 1,
      inbound_messages: 2,
      investor_offers: 1,
      institution_replies: 1,
      payments: 1,
    });
    expect(u.total).toBe(7);
    expect(u.leads[0]).toMatchObject({ id: "l1", who: "Jan Kowalski", url: "/operator/leady/l1" });
    expect(u.applications[0]).toMatchObject({ id: "a1", url: "/operator/wnioski/a1" });
    const byId = Object.fromEntries(u.inbound_messages.map((m) => [m.id, m]));
    expect(byId.c1).toMatchObject({
      who: "Jan Kowalski",
      channel: "email",
      snippet: "Dzień dobry, ile wyniesie rata?",
      url: "/operator/skrzynka",
    });
    expect(byId.c3).toMatchObject({ who: "+48600300400", url: "/operator/leady" });
    expect(u.investor_offers[0].id).toBe("o1");
    expect(u.payments[0]).toMatchObject({ id: "p1", paid_amount_grosz: 19900 });
  });

  it("ucina listy do limitu, ale liczniki zostają pełne", async () => {
    const tables = sampleTables();
    tables.leads = Array.from({ length: 5 }, (_, i) => ({
      id: `L${i}`,
      first_name: `Lead${i}`,
      last_name: null,
      email: null,
      phone_raw: null,
      type: "klient",
      status: "nowy",
      source: null,
      created_at: `2026-09-21T08:0${i}:00.000Z`,
    }));
    const db = fakeDb(tables);
    const u = await collectActivitySince({ since: SINCE, until: UNTIL, limitPerSection: 2 }, db);
    expect(u.counts.leads).toBe(5);
    expect(u.leads).toHaveLength(2);
    expect(u.leads[0].id).toBe("L4");
    expect(u.truncated).toContain("leads");
  });

  it("odrzuca okno o zerowej lub ujemnej długości", async () => {
    const db = fakeDb(sampleTables());
    await expect(collectActivitySince({ since: UNTIL, until: SINCE }, db)).rejects.toThrow();
  });

  it("błąd jednej tabeli nie wywraca raportu", async () => {
    const db = fakeDb(sampleTables());
    const origFrom = db.from;
    (db as any).from = (t: string) => {
      if (t === "access_payments") {
        const q: any = { then: (r: any) => r({ data: null, error: { message: "boom" } }) };
        for (const m of ["select", "gte", "lt", "eq", "neq", "in", "is", "order", "limit"])
          q[m] = () => q;
        return q;
      }
      return origFrom(t);
    };
    const u = await collectActivitySince({ since: SINCE, until: UNTIL }, db);
    expect(u.errors).toEqual(["access_payments: boom"]);
    expect(u.counts.payments).toBe(0);
    expect(u.counts.leads).toBe(1);
  });
});

describe("summarizeActivity / renderActivityDigestText", () => {
  it("odmienia liczebniki po polsku", () => {
    const base: ActivityUpdates = {
      since: SINCE,
      until: UNTIL,
      total: 0,
      counts: {
        leads: 1,
        applications: 2,
        inbound_messages: 5,
        investor_offers: 22,
        institution_replies: 0,
        payments: 0,
      },
      truncated: [],
      errors: [],
      leads: [],
      applications: [],
      inbound_messages: [],
      investor_offers: [],
      institution_replies: [],
      payments: [],
    };
    expect(summarizeActivity(base)).toBe(
      "1 nowy lead, 2 nowe wnioski, 5 wiadomości przychodzących, 22 oferty inwestorów",
    );
    expect(
      summarizeActivity({
        ...base,
        counts: {
          ...base.counts,
          leads: 0,
          applications: 0,
          inbound_messages: 0,
          investor_offers: 0,
        },
      }),
    ).toBe("brak nowych zdarzeń");
  });

  it("renderuje raport tekstowy z linkami do panelu", async () => {
    const db = fakeDb(sampleTables());
    const u = await collectActivitySince({ since: SINCE, until: UNTIL }, db);
    const text = renderActivityDigestText(u, "https://financeyou.pl");
    expect(text).toContain("Co nowego na Finance You:");
    expect(text).toContain("Jan Kowalski");
    expect(text).toContain("→ https://financeyou.pl/operator/leady/l1");
    expect(text).toContain(
      "[e-mail] Jan Kowalski: Pytanie o ratę: Dzień dobry, ile wyniesie rata?",
    );
    expect(text).toContain("199.00 PLN");
  });
});
