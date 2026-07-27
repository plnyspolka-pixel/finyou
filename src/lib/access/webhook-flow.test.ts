// Testy integracyjne przepływu webhooka Tpay (rdzeń płatności za dostęp).
// Baza danych jest emulowana in-memory (src/test/fake-supabase.ts) z RPC
// `process_access_payment_paid` wiernym kontraktowi SQL. API Tpay i wysyłka
// e-maili są mockowane; faktury/afiliacja przechodzą przez PRAWDZIWE moduły
// (auto-invoice, issue, affiliate engine) na sztucznej bazie.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, fakeUuid, type FakeDbImpl } from "@/test/fake-supabase";

const holder = vi.hoisted(() => ({ db: null as any }));
const tpayState = vi.hoisted(() => ({ tx: {} as Record<string, any> }));
const emails = vi.hoisted(() => ({ sent: [] as any[] }));

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

vi.mock("@/lib/tpay.server", () => ({
  getTpayTransaction: async (id: string) => {
    const tx = tpayState.tx[id];
    if (!tx) throw new Error(`no tx ${id}`);
    return tx;
  },
  createTpayTransaction: async () => {
    throw new Error("createTpayTransaction should not be called from webhook");
  },
}));

vi.mock("@/lib/resend-send.server", () => ({
  sendResendEmail: async (opts: any) => {
    emails.sent.push(opts);
    return { ok: true, id: "mock-email" };
  },
}));

vi.mock("@/lib/access/urls.server", () => ({
  resolveAppBaseUrl: () => "https://app.test",
  requestClientMeta: () => ({ ip: null, userAgent: null }),
}));

import { handleTpayNotification } from "./webhook-core.server";
import { ensureInvoiceForAccessPayment } from "./invoice.server";
import { runAccessExpiryReminders } from "./reminders.server";

const USER = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-08-01T12:00:00.000Z");

function db(): FakeDbImpl {
  return holder.db;
}

function seedCatalog() {
  db().tables.access_products = [
    {
      id: "p30",
      code: "investor_access_30d",
      audience: "investor",
      label: "Pełny dostęp inwestora — 30 dni",
      duration_days: 30,
      amount_grosz: 99900,
      currency: "PLN",
      active: true,
    },
    {
      id: "p365",
      code: "investor_access_365d",
      audience: "investor",
      label: "Pełny dostęp inwestora — 365 dni",
      duration_days: 365,
      amount_grosz: 599900,
      currency: "PLN",
      active: true,
    },
    {
      id: "b30",
      code: "broker_access_30d",
      audience: "broker",
      label: "Pełny dostęp pośrednika — 30 dni",
      duration_days: 30,
      amount_grosz: 49900,
      currency: "PLN",
      active: true,
    },
    {
      id: "b365",
      code: "broker_access_365d",
      audience: "broker",
      label: "Pełny dostęp pośrednika — 365 dni",
      duration_days: 365,
      amount_grosz: 299900,
      currency: "PLN",
      active: true,
    },
  ];
}

function seedEntity() {
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
  const id = fakeUuid();
  db().tables.access_payments = db().tables.access_payments ?? [];
  db().tables.access_payments.push({
    id,
    provider: "tpay",
    provider_transaction_id: overrides.provider_transaction_id ?? `tr_${id.slice(-6)}`,
    user_id: USER,
    product_id: "p30",
    audience: "investor",
    status: "pending",
    expected_amount_grosz: 99900,
    currency: "PLN",
    buyer_type: "person",
    buyer_name: "Jan Kowalski",
    buyer_email: "jan@example.com",
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

function tpayCorrect(trId: string, crc: string, amountPln: number) {
  tpayState.tx[trId] = {
    transactionId: trId,
    status: "correct",
    amount: amountPln,
    hiddenDescription: crc,
  };
}

beforeEach(() => {
  holder.db = createFakeDb();
  db().setNow(NOW);
  tpayState.tx = {};
  emails.sent = [];
  seedCatalog();
  seedEntity();
});

describe("webhook Tpay — aktywacja dostępu", () => {
  it("inwestor kupuje 30 dni za 999 zł: dostęp + faktura imienna z adresem, bez NIP", async () => {
    const paymentId = seedPayment({ provider_transaction_id: "tr_A" });
    tpayCorrect("tr_A", paymentId, 999);

    const res = await handleTpayNotification({ tr_id: "tr_A" });
    expect(res).toBe("TRUE");

    const payment = db().tables.access_payments[0];
    expect(payment.status).toBe("paid");
    expect(payment.paid_amount_grosz).toBe(99900);
    expect(payment.granted_until).toBe("2026-08-31T12:00:00.000Z");

    const ent = db().tables.access_entitlements[0];
    expect(ent.user_id).toBe(USER);
    expect(ent.audience).toBe("investor");
    expect(ent.active_until).toBe("2026-08-31T12:00:00.000Z");

    // Faktura imienna: automatyczna, z pełnym adresem, bez NIP.
    const invoice = db().tables.sales_invoices[0];
    expect(invoice).toBeTruthy();
    expect(invoice.buyer_nip).toBeNull();
    expect(invoice.buyer_name).toBe("Jan Kowalski");
    expect(invoice.buyer_street).toBe("ul. Prosta 1");
    expect(invoice.buyer_postal_code).toBe("00-001");
    expect(invoice.buyer_city).toBe("Warszawa");
    expect(invoice.buyer_user_id).toBe(USER);
    expect(invoice.source_type).toBe("tpay_payment");
    expect(invoice.invoice_number).toBe("FY/2026/0001");
    expect(invoice.status).toBe("issued");
    expect(payment.invoice_id).toBe(invoice.id);

    // Rejestr sprzedaży osób fizycznych powiązany z fakturą (bez „na żądanie").
    const reg = db().tables.individual_sales_register[0];
    expect(reg.transaction_id).toBe("tr_A");
    expect(reg.invoice_id).toBe(invoice.id);

    // E-maile: potwierdzenie płatności + faktura.
    expect(emails.sent.length).toBe(2);
    expect(emails.sent.map((e) => e.subject).join(" ")).toMatch(/Płatność potwierdzona/);
  });

  it("inwestor kupuje 365 dni za 5 999 zł; pośrednik 30/365 — kwoty i okresy z katalogu", async () => {
    const cases = [
      { product: "p365", audience: "investor", amount: 5999, days: 365 },
      { product: "b30", audience: "broker", amount: 499, days: 30 },
      { product: "b365", audience: "broker", amount: 2999, days: 365 },
    ] as const;
    for (const [i, c] of cases.entries()) {
      const user = `22222222-2222-4222-8222-${String(i).padStart(12, "0")}`;
      const paymentId = seedPayment({
        product_id: c.product,
        audience: c.audience,
        user_id: user,
        expected_amount_grosz: c.amount * 100,
        provider_transaction_id: `tr_case_${i}`,
      });
      tpayCorrect(`tr_case_${i}`, paymentId, c.amount);
      await handleTpayNotification({ tr_id: `tr_case_${i}` });
      const ent = db().tables.access_entitlements.find((e: any) => e.user_id === user)!;
      expect(ent).toBeTruthy();
      expect(ent.audience).toBe(c.audience);
      expect(new Date(ent.active_until).getTime() - NOW.getTime()).toBe(c.days * 24 * 3600 * 1000);
    }
  });

  it("firma otrzymuje automatyczną fakturę VAT z NIP", async () => {
    const paymentId = seedPayment({
      buyer_type: "company",
      buyer_name: "Firma Sp. z o.o.",
      buyer_nip: "5260250274",
      provider_transaction_id: "tr_company",
    });
    tpayCorrect("tr_company", paymentId, 999);
    await handleTpayNotification({ tr_id: "tr_company" });

    const invoice = db().tables.sales_invoices[0];
    expect(invoice.buyer_nip).toBe("5260250274");
    expect(invoice.buyer_name).toBe("Firma Sp. z o.o.");
    expect(invoice.status).toBe("issued");
    // Firma nie trafia do rejestru sprzedaży osób fizycznych.
    expect(db().tables.individual_sales_register ?? []).toHaveLength(0);
  });

  it("webhook z nieprawidłową kwotą NIE aktywuje dostępu ani nie wystawia faktury", async () => {
    const paymentId = seedPayment({ provider_transaction_id: "tr_bad" });
    tpayCorrect("tr_bad", paymentId, 1); // 1 zł zamiast 999 zł

    const res = await handleTpayNotification({ tr_id: "tr_bad" });
    expect(res).toBe("TRUE");

    const payment = db().tables.access_payments[0];
    expect(payment.status).toBe("pending");
    expect(payment.failure_reason).toMatch(/amount_mismatch/);
    expect(payment.needs_review).toBe(true);
    expect(db().tables.access_entitlements ?? []).toHaveLength(0);
    expect(db().tables.sales_invoices ?? []).toHaveLength(0);
  });

  it("podwójny webhook: bez podwójnego przedłużenia, drugiej faktury i e-maili", async () => {
    const paymentId = seedPayment({ provider_transaction_id: "tr_dup" });
    tpayCorrect("tr_dup", paymentId, 999);

    await handleTpayNotification({ tr_id: "tr_dup" });
    const untilAfterFirst = db().tables.access_entitlements[0].active_until;
    const emailsAfterFirst = emails.sent.length;

    await handleTpayNotification({ tr_id: "tr_dup" });

    expect(db().tables.access_entitlements).toHaveLength(1);
    expect(db().tables.access_entitlements[0].active_until).toBe(untilAfterFirst);
    expect(db().tables.sales_invoices).toHaveLength(1);
    expect(emails.sent.length).toBe(emailsAfterFirst);
  });

  it("przedłużenie aktywnego dostępu liczy od dotychczasowego active_until", async () => {
    db().tables.access_entitlements = [
      {
        id: fakeUuid(),
        user_id: USER,
        audience: "investor",
        active_from: "2026-07-16T12:00:00.000Z",
        active_until: "2026-08-15T12:00:00.000Z",
      },
    ];
    const paymentId = seedPayment({ provider_transaction_id: "tr_ext" });
    tpayCorrect("tr_ext", paymentId, 999);
    await handleTpayNotification({ tr_id: "tr_ext" });

    const ent = db().tables.access_entitlements[0];
    expect(ent.active_until).toBe("2026-09-14T12:00:00.000Z"); // 15.08 + 30 dni
    // active_from nie jest nadpisywane przy przedłużeniu aktywnego dostępu
    expect(ent.active_from).toBe("2026-07-16T12:00:00.000Z");
  });

  it("zakup po wygaśnięciu liczy od chwili płatności", async () => {
    db().tables.access_entitlements = [
      {
        id: fakeUuid(),
        user_id: USER,
        audience: "investor",
        active_from: "2026-05-01T00:00:00.000Z",
        active_until: "2026-06-01T00:00:00.000Z",
      },
    ];
    const paymentId = seedPayment({ provider_transaction_id: "tr_exp" });
    tpayCorrect("tr_exp", paymentId, 999);
    await handleTpayNotification({ tr_id: "tr_exp" });

    const ent = db().tables.access_entitlements[0];
    expect(ent.active_until).toBe("2026-08-31T12:00:00.000Z"); // NOW + 30 dni
    expect(ent.active_from).toBe(NOW.toISOString());
  });

  it("awaria wystawiania faktury nie blokuje opłaconego dostępu; ponowienie nie tworzy duplikatu", async () => {
    db().tables.accounting_entities = []; // brak podmiotu → faktura się nie uda
    const paymentId = seedPayment({ provider_transaction_id: "tr_noent" });
    tpayCorrect("tr_noent", paymentId, 999);
    await handleTpayNotification({ tr_id: "tr_noent" });

    const payment = db().tables.access_payments[0];
    expect(payment.status).toBe("paid"); // dostęp przyznany mimo błędu faktury
    expect(db().tables.access_entitlements).toHaveLength(1);
    expect(payment.invoice_id).toBeNull();
    expect(payment.invoice_error).toMatch(/podmiotu/);

    // Administrator konfiguruje podmiot i ponawia wystawienie.
    seedEntity();
    const retry1 = await ensureInvoiceForAccessPayment(paymentId);
    expect(retry1.ok).toBe(true);
    const retry2 = await ensureInvoiceForAccessPayment(paymentId);
    expect(retry2.deduped).toBe(true);
    expect(db().tables.sales_invoices).toHaveLength(1);
    expect(db().tables.access_payments[0].invoice_error).toBeNull();
  });
});

describe("webhook Tpay — program partnerski", () => {
  function seedAffiliate() {
    db().tables.affiliate_partners = [
      {
        id: "partner1",
        user_id: "33333333-3333-4333-8333-333333333333",
        status: "active",
        settlement_type: "b2b",
        sponsor_partner_id: null,
        bank_account_encrypted: "x",
      },
    ];
    db().tables.profiles = [{ id: fakeUuid(), user_id: USER, referred_by_partner_id: "partner1" }];
    db().tables.affiliate_commission_rules = [
      {
        id: "rule1",
        name: "inwestor L1",
        active: true,
        event_type: "investor_account_paid",
        network_level: 1,
        settlement_type_filter: null,
        product_id: null,
        basis_type: "fixed_amount",
        fixed_amount: 100,
        percent_rate: null,
        requires_admin_approval: true,
        refund_window_days: 14,
      },
    ];
  }

  it("zdarzenie afiliacyjne powstaje raz (dedup po external_ref), z kwotami brutto/netto", async () => {
    seedAffiliate();
    const paymentId = seedPayment({ provider_transaction_id: "tr_aff" });
    tpayCorrect("tr_aff", paymentId, 999);

    await handleTpayNotification({ tr_id: "tr_aff" });
    await handleTpayNotification({ tr_id: "tr_aff" }); // duplikat

    const events = db().tables.affiliate_commission_events ?? [];
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe("investor_account_paid");
    expect(events[0].external_ref).toBe("tpay:tr_aff");
    expect(Number(events[0].gross_payment_amount)).toBe(999);
    expect(Number(events[0].net_revenue_amount)).toBeCloseTo(812.2, 1);
    expect(db().tables.access_payments[0].affiliate_event_id).toBe(events[0].id);

    // Prowizja naliczona raz.
    expect((db().tables.affiliate_commissions ?? []).length).toBe(1);
  });

  it("bez zapisanego partnera polecającego zdarzenie nie powstaje", async () => {
    const paymentId = seedPayment({ provider_transaction_id: "tr_noaff" });
    tpayCorrect("tr_noaff", paymentId, 999);
    await handleTpayNotification({ tr_id: "tr_noaff" });
    expect(db().tables.affiliate_commission_events ?? []).toHaveLength(0);
  });
});

describe("webhook Tpay — zwroty i finalność płatności", () => {
  it("po zwrocie ponowne powiadomienie 'correct' nie przywraca dostępu ani statusu paid", async () => {
    const paymentId = seedPayment({ provider_transaction_id: "tr_ref" });
    tpayCorrect("tr_ref", paymentId, 999);
    await handleTpayNotification({ tr_id: "tr_ref" });
    const untilAfterPaid = db().tables.access_entitlements[0].active_until;

    // Zwrot środków.
    tpayState.tx["tr_ref"] = {
      transactionId: "tr_ref",
      status: "refund",
      amount: 999,
      hiddenDescription: paymentId,
    };
    await handleTpayNotification({ tr_id: "tr_ref" });
    expect(db().tables.access_payments[0].status).toBe("refunded");

    // Ręcznie ponowione powiadomienie z panelu Tpay (API znów raportuje correct).
    tpayCorrect("tr_ref", paymentId, 999);
    await handleTpayNotification({ tr_id: "tr_ref" });

    expect(db().tables.access_payments[0].status).toBe("refunded"); // finalny
    expect(db().tables.access_entitlements[0].active_until).toBe(untilAfterPaid); // bez drugiego przedłużenia
  });
});

describe("webhook Tpay — transakcje legacy (userId|plan)", () => {
  it("transakcja rozliczona przez STARY webhook przed wdrożeniem nie jest przetwarzana ponownie", async () => {
    // Ślad starego przepływu: wpis rejestru osób fizycznych dla tej transakcji.
    db().tables.individual_sales_register = [
      {
        id: fakeUuid(),
        transaction_id: "tr_old",
        user_id: USER,
        description: "x",
        gross_amount: 399,
      },
    ];
    tpayState.tx["tr_old"] = {
      transactionId: "tr_old",
      status: "correct",
      amount: 399,
      hiddenDescription: `${USER}|investor_access_1m`,
    };
    await handleTpayNotification({ tr_id: "tr_old" });
    expect(db().tables.access_entitlements ?? []).toHaveLength(0);
    expect(db().tables.access_payments ?? []).toHaveLength(0);
  });

  it("rozpoczęta wcześniej transakcja investor_access_1m aktywuje 30 dni i jest idempotentna", async () => {
    tpayState.tx["tr_legacy"] = {
      transactionId: "tr_legacy",
      status: "correct",
      amount: 399,
      hiddenDescription: `${USER}|investor_access_1m`,
    };
    db().tables.investors = [{ id: fakeUuid(), user_id: USER, investor_type: "indywidualny" }];

    await handleTpayNotification({ tr_id: "tr_legacy" });
    const ent = db().tables.access_entitlements[0];
    expect(new Date(ent.active_until).getTime() - NOW.getTime()).toBe(30 * 24 * 3600 * 1000);

    await handleTpayNotification({ tr_id: "tr_legacy" });
    expect(db().tables.access_entitlements).toHaveLength(1);
    expect(db().tables.access_entitlements[0].active_until).toBe(ent.active_until);
    expect(db().tables.access_payments).toHaveLength(1);
  });
});

describe("przypomnienia o końcu dostępu", () => {
  it("wysyła przypomnienie raz dla danego okresu (dedup)", async () => {
    db().userEmails[USER] = "jan@example.com";
    // runAccessExpiryReminders używa zegara rzeczywistego — okres względem new Date().
    const realNow = new Date();
    db().tables.access_entitlements = [
      {
        id: fakeUuid(),
        user_id: USER,
        audience: "investor",
        active_from: realNow.toISOString(),
        active_until: new Date(realNow.getTime() + 2 * 24 * 3600 * 1000).toISOString(), // za 2 dni → d3
      },
    ];
    const r1 = await runAccessExpiryReminders();
    expect(r1.sent).toBe(1);
    const r2 = await runAccessExpiryReminders();
    expect(r2.sent).toBe(0);
    expect(emails.sent).toHaveLength(1);
    expect(emails.sent[0].subject).toMatch(/wygasa/);
  });
});
