// Testy przepływu webhooka TubaPay (płatność podzielona za dostęp).
// Baza emulowana in-memory (src/test/fake-supabase.ts) z RPC
// `process_access_payment_paid`; e-maile i zakładanie kont są mockowane,
// faktury przechodzą przez prawdziwe moduły — jak w webhook-flow.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, fakeUuid, type FakeDbImpl } from "@/test/fake-supabase";

const holder = vi.hoisted(() => ({ db: null as any }));
const emails = vi.hoisted(() => ({ sent: [] as any[] }));

vi.hoisted(() => {
  process.env.TUBAPAY_API_KEY = "test-api-key";
  process.env.TUBAPAY_PARTNER_ID = "TP0000000000";
});

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: new Proxy(
    {},
    {
      get: (_t, prop) => {
        const v = holder.db[prop];
        return typeof v === "function" ? v.bind(holder.db) : v;
      },
    },
  ),
}));

vi.mock("@/lib/resend-send.server", () => ({
  sendResendEmail: async (opts: any) => {
    emails.sent.push(opts);
    return { ok: true, id: "mock-email" };
  },
}));

const authUsers = vi.hoisted(() => ({ byEmail: {} as Record<string, string> }));
vi.mock("@/lib/auth-users.server", () => ({
  ensureAuthUser: async (p: { email: string }) => {
    const existing = authUsers.byEmail[p.email];
    if (existing) return { userId: existing, created: false };
    const id = "33333333-3333-4333-8333-333333333333";
    authUsers.byEmail[p.email] = id;
    return { userId: id, created: true };
  },
}));

vi.mock("@/lib/access/urls.server", () => ({
  resolveAppBaseUrl: () => "https://app.test",
  requestClientMeta: () => ({ ip: null, userAgent: null }),
}));

import { handleTubapayNotification } from "./webhook-core.server";
import { signTubapayCallback } from "@/lib/tubapay.server";

const USER = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-01T12:00:00.000Z");

function db(): FakeDbImpl {
  return holder.db;
}

function seed() {
  db().tables.access_products = [
    {
      id: "p365",
      code: "investor_access_365d",
      audience: "investor",
      label: "Abonament inwestora — 365 dni",
      duration_days: 365,
      amount_grosz: 700000,
      currency: "PLN",
      active: true,
    },
  ];
  db().tables.accounting_entities = [
    {
      id: "ent1",
      name: "FY",
      legal_name: "Finance You Sp. z o.o.",
      is_default: true,
      active: true,
      invoice_prefix: "FY",
      invoice_next_number: 1,
      default_vat_rate: "23",
      provider: "manual",
      ksef_environment: "disabled",
    },
  ];
}

function seedPayment(overrides: Record<string, any> = {}): string {
  const id = overrides.id ?? fakeUuid();
  db().tables.access_payments = db().tables.access_payments ?? [];
  db().tables.access_payments.push({
    id,
    provider: "tubapay",
    provider_transaction_id: `tubapay-${id}`,
    user_id: USER,
    product_id: "p365",
    audience: "investor",
    status: "pending",
    expected_amount_grosz: 700000,
    currency: "PLN",
    buyer_type: "person",
    buyer_name: "Anna Nowak",
    buyer_email: "anna@example.com",
    buyer_nip: null,
    buyer_street: "ul. Prosta 1",
    buyer_postal_code: "00-001",
    buyer_city: "Warszawa",
    buyer_country: "PL",
    consents: {},
    needs_review: false,
    invoice_id: null,
    ...overrides,
  });
  return id;
}

function statusBody(externalRef: string, agreementStatus: string) {
  return {
    metaData: { commandType: "TRANSACTION_STATUS_CHANGED" },
    payload: { transaction: { externalRef, agreementStatus, agreementNumber: 12345 } },
  };
}

async function notify(paymentId: string, agreementStatus: string, sig?: string) {
  return handleTubapayNotification({
    paymentId,
    signature: sig ?? (await signTubapayCallback(paymentId)),
    body: statusBody(paymentId, agreementStatus),
  });
}

beforeEach(() => {
  holder.db = createFakeDb();
  db().setNow(NOW);
  emails.sent = [];
  authUsers.byEmail = {};
  db().auth.admin.generateLink = async () => ({
    data: { properties: { action_link: "https://login.test/magic" } },
    error: null,
  });
  seed();
});

describe("webhook TubaPay", () => {
  it("accepted z poprawnym podpisem: dostęp na 365 dni + faktura za pełną kwotę", async () => {
    const paymentId = seedPayment();
    const res = await notify(paymentId, "accepted");
    expect(res.status).toBe(200);

    const payment = db().tables.access_payments[0];
    expect(payment.status).toBe("paid");
    expect(payment.paid_amount_grosz).toBe(700000);
    expect(payment.provider_transaction_id).toBe(`tubapay-${paymentId}`);

    const ent = db().tables.access_entitlements[0];
    expect(ent.user_id).toBe(USER);
    expect(new Date(ent.active_until).getTime() - NOW.getTime()).toBe(365 * 24 * 3600 * 1000);

    const invoice = db().tables.sales_invoices[0];
    expect(invoice).toBeTruthy();
    expect(payment.invoice_id).toBe(invoice.id);

    const logs = db().tables.access_webhook_logs;
    expect(logs.some((l: any) => l.provider === "tubapay" && l.result === "paid")).toBe(true);
  });

  it("ponowione accepted nie przedłuża dostępu drugi raz", async () => {
    const paymentId = seedPayment();
    await notify(paymentId, "accepted");
    const until = db().tables.access_entitlements[0].active_until;
    await notify(paymentId, "accepted");
    expect(db().tables.access_entitlements).toHaveLength(1);
    expect(db().tables.access_entitlements[0].active_until).toBe(until);
  });

  it("brak/zły podpis: 400, bez dostępu, płatność oznaczona do wyjaśnienia", async () => {
    const paymentId = seedPayment();
    const res = await notify(paymentId, "accepted", "0".repeat(64));
    expect(res.status).toBe(400);
    expect(db().tables.access_entitlements ?? []).toHaveLength(0);
    const payment = db().tables.access_payments[0];
    expect(payment.status).toBe("pending");
    expect(payment.needs_review).toBe(true);

    const noSig = await handleTubapayNotification({
      paymentId: null,
      signature: null,
      body: statusBody(paymentId, "accepted"),
    });
    expect(noSig.status).toBe(400);
    expect(db().tables.access_entitlements ?? []).toHaveLength(0);
  });

  it("podpis innej płatności (externalRef ≠ payment) jest odrzucany", async () => {
    const a = seedPayment();
    const b = seedPayment();
    const res = await handleTubapayNotification({
      paymentId: a,
      signature: await signTubapayCallback(a),
      body: statusBody(b, "accepted"),
    });
    expect(res.status).toBe(400);
    expect(db().tables.access_entitlements ?? []).toHaveLength(0);
  });

  it("rejected anuluje oczekującą płatność", async () => {
    const paymentId = seedPayment();
    const res = await notify(paymentId, "rejected");
    expect(res.status).toBe(200);
    const payment = db().tables.access_payments[0];
    expect(payment.status).toBe("cancelled");
    expect(payment.failure_reason).toBe("tubapay_status:cancelled");
  });

  it("withdrew po opłaceniu: dostęp zostaje, płatność do decyzji administratora", async () => {
    const paymentId = seedPayment();
    await notify(paymentId, "accepted");
    await notify(paymentId, "withdrew");
    const payment = db().tables.access_payments[0];
    expect(payment.status).toBe("paid");
    expect(payment.needs_review).toBe(true);
    expect(payment.failure_reason).toBe("tubapay_withdrew");
    expect(db().tables.access_entitlements).toHaveLength(1);
  });

  it("statusy pośrednie (registered, signed) nic nie zmieniają", async () => {
    const paymentId = seedPayment();
    for (const st of ["registered", "signed"]) {
      const res = await notify(paymentId, st);
      expect(res.status).toBe(200);
    }
    expect(db().tables.access_payments[0].status).toBe("pending");
  });

  it("zakup bez konta: accepted zakłada konto inwestora i przyznaje dostęp", async () => {
    const paymentId = seedPayment({ user_id: null, consents: { guestCheckout: true } });
    const res = await notify(paymentId, "accepted");
    expect(res.status).toBe(200);
    const payment = db().tables.access_payments[0];
    expect(payment.user_id).toBe("33333333-3333-4333-8333-333333333333");
    expect(payment.status).toBe("paid");
  });

  it("inne komendy (CUSTOMER_RECURRING_ORDER_REQUEST) są ignorowane", async () => {
    const paymentId = seedPayment();
    const res = await handleTubapayNotification({
      paymentId,
      signature: await signTubapayCallback(paymentId),
      body: { metaData: { commandType: "CUSTOMER_RECURRING_ORDER_REQUEST" }, payload: {} },
    });
    expect(res.status).toBe(200);
    expect(db().tables.access_payments[0].status).toBe("pending");
  });
});
