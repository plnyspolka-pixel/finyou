// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDbImpl } from "@/test/fake-supabase";
import type { KsefResult } from "@/lib/ksef/client";

const ksef = vi.hoisted(() => ({
  submit: [] as Array<KsefResult | Error>,
  check: [] as KsefResult[],
  sentXml: [] as string[],
  checks: 0,
}));

vi.mock("./db", () => ({ logAccountingAudit: async () => undefined }));
vi.mock("@/lib/ksef/client", () => ({
  effectiveKsef: (e: any) =>
    e.ksef_token_encrypted === "none" ? null : { environment: "prod", token: "t" },
  ksefSubmitInvoice: async (_e: unknown, xml: string) => {
    ksef.sentXml.push(xml);
    const r = ksef.submit.shift();
    if (!r) throw new Error("nieoczekiwana wysyłka do KSeF");
    if (r instanceof Error) throw r;
    return r;
  },
  ksefCheckInvoice: async () => {
    ksef.checks += 1;
    return ksef.check.shift() ?? { status: "pending", statusCode: 150 };
  },
}));

import { issueSalesInvoice, refreshKsefStatus } from "./issue";

const XSD = path.resolve(__dirname, "../ksef/__fixtures__/xsd/schemat_FA(3)_v1-0E.xsd");
const hasXmllint = spawnSync("xmllint", ["--version"]).status === 0;
/** Wysłany XML przechodzi oficjalny XSD FA(3) (pomijane bez xmllint). */
function expectValidFa3(xml: string) {
  if (!hasXmllint) return;
  const file = path.join(mkdtempSync(path.join(tmpdir(), "fa3-")), "fa.xml");
  writeFileSync(file, xml, "utf8");
  expect(() =>
    execFileSync("xmllint", ["--noout", "--schema", XSD, file], { stdio: "pipe" }),
  ).not.toThrow();
}

let db: FakeDbImpl;
const YEAR = new Date().getFullYear();

const FY = {
  id: "fy",
  name: "Finance You Sp. z o.o.",
  legal_name: "Finance You Sp. z o.o.",
  nip: "7010611803",
  ksef_nip: "7010611803",
  regon: "365350668",
  address_street: "ul. Nowogrodzka 31",
  address_postal_code: "00-511",
  address_city: "Warszawa",
  bank_account: "96109026880000000166528680",
  invoice_prefix: "FY",
  invoice_next_number: 3,
  vat_payer: true,
  default_vat_rate: "zw",
  vat_exemption_basis: "art. 43 ust. 1 pkt 38 ustawy o VAT",
  provider: "ksef",
  ksef_environment: "prod",
  active: true,
};
const FUNDACJA = {
  ...FY,
  id: "fund",
  name: "Fundacja im. Pieczaka",
  legal_name: "Fundacja im. Pieczaka",
  nip: "9462747637",
  ksef_nip: "9462747637",
  regon: null,
  address_street: null,
  address_postal_code: null,
  address_city: null,
  bank_account: null,
  invoice_prefix: "FV",
  invoice_next_number: 1,
  vat_payer: false,
  vat_exemption_basis: "art. 113 ust. 1 ustawy o VAT",
  vat_exempt_limit: 200000,
};

function invoice(over: Record<string, any> = {}) {
  const row = {
    id: `inv${db.tables.sales_invoices.length + 1}`,
    entity_id: "fy",
    invoice_number: null,
    status: "draft",
    ksef_status: "not_sent",
    issue_date: null,
    sale_date: `${YEAR}-09-20`,
    due_date: `${YEAR}-10-05`,
    currency: "PLN",
    buyer_name: "FK Sp. z o.o.",
    buyer_nip: "7123335894",
    buyer_street: "ul. Poznańska 61",
    buyer_postal_code: "20-001",
    buyer_city: "Lublin",
    net_amount: 2400,
    vat_amount: 0,
    gross_amount: 2400,
    vat_rate: "zw",
    items: [
      {
        name: "Usługa pośrednictwa finansowego",
        quantity: 1,
        unit: "szt.",
        unitNet: 2400,
        vatRate: "zw",
      },
    ],
    source_type: "manual",
    ...over,
  };
  db.tables.sales_invoices.push(row);
  return row;
}
const inv = (id: string) => db.tables.sales_invoices.find((r) => r.id === id)!;
const accepted = (n = "7010611803-20260925-ABCDEF-123456-7A"): KsefResult => ({
  status: "accepted",
  statusCode: 200,
  referenceNumber: n,
  sessionReference: "S1",
  invoiceReference: "I1",
  sent: true,
  upoXml: "<UPO/>",
});

beforeEach(() => {
  db = createFakeDb();
  db.tables.accounting_entities = [{ ...FY }, { ...FUNDACJA }];
  db.tables.sales_invoices = [];
  db.tables.accounting_documents = [];
  ksef.submit = [];
  ksef.check = [];
  ksef.sentXml = [];
  ksef.checks = 0;
});

describe("issueSalesInvoice — Finance You (zwolnienie przedmiotowe)", () => {
  it("nadaje numer, wysyła FA(3) z podstawą zwolnienia i zapisuje numer KSeF", async () => {
    const i = invoice();
    ksef.submit.push(accepted());
    const r = await issueSalesInvoice(db as any, i.id, "user1");
    expect(r).toMatchObject({ ok: true, status: "accepted" });
    const row = inv(i.id);
    expect(row).toMatchObject({
      invoice_number: `FY/${YEAR}/0003`,
      status: "issued",
      ksef_status: "accepted",
      ksef_reference_number: "7010611803-20260925-ABCDEF-123456-7A",
      ksef_session_reference: "S1",
      ksef_invoice_reference: "I1",
      ksef_upo_xml: "<UPO/>",
      error_message: null,
    });
    expect(row.issue_date).toBe(new Date().toISOString().slice(0, 10));
    expect(row.ksef_xml).toBe(ksef.sentXml[0]);
    expect(ksef.sentXml[0]).toContain(`<P_2>FY/${YEAR}/0003</P_2>`);
    expect(ksef.sentXml[0]).toContain("<P_19A>art. 43 ust. 1 pkt 38 ustawy o VAT</P_19A>");
    expect(ksef.sentXml[0]).toContain("<P_13_7>2400.00</P_13_7>");
    expect(db.tables.accounting_entities[0].invoice_next_number).toBe(4);
    expectValidFa3(ksef.sentXml[0]);
  });

  it("przyjętej faktury nie wysyła drugi raz", async () => {
    const i = invoice();
    ksef.submit.push(accepted());
    await issueSalesInvoice(db as any, i.id);
    const r = await issueSalesInvoice(db as any, i.id);
    expect(r.status).toBe("accepted");
    expect(ksef.sentXml).toHaveLength(1);
  });

  it("wysyła fakturę wystawioną wcześniej bez KSeF, zachowując numer i datę", async () => {
    const i = invoice({
      invoice_number: "FY/2026/0002",
      issue_date: "2026-09-23",
      status: "issued",
      ksef_status: "not_sent",
    });
    ksef.submit.push(accepted());
    await issueSalesInvoice(db as any, i.id);
    expect(inv(i.id)).toMatchObject({
      invoice_number: "FY/2026/0002",
      issue_date: "2026-09-23",
      status: "issued",
    });
    expect(ksef.sentXml[0]).toContain("<P_1>2026-09-23</P_1>");
    expect(db.tables.accounting_entities[0].invoice_next_number).toBe(3);
  });

  it("w toku: nie wysyła ponownie, tylko sprawdza status; potem przyjmuje z UPO", async () => {
    const i = invoice();
    ksef.submit.push({
      status: "pending",
      statusCode: 150,
      sessionReference: "S1",
      invoiceReference: "I1",
      sent: true,
    });
    expect((await issueSalesInvoice(db as any, i.id)).status).toBe("pending");
    expect(inv(i.id)).toMatchObject({ status: "issued", ksef_status: "pending" });

    ksef.check.push({ status: "pending", statusCode: 150 });
    await issueSalesInvoice(db as any, i.id); // ponowne „Wystaw” = odświeżenie
    expect(ksef.sentXml).toHaveLength(1);
    expect(ksef.checks).toBe(1);

    ksef.check.push(accepted("K-2"));
    const r = await refreshKsefStatus(db as any, i.id);
    expect(r.status).toBe("accepted");
    expect(inv(i.id)).toMatchObject({
      ksef_status: "accepted",
      ksef_reference_number: "K-2",
      ksef_upo_xml: "<UPO/>",
    });
  });

  it("odrzucona: wraca do szkicu z tym samym numerem i powodem; poprawiona idzie z tym numerem", async () => {
    const i = invoice();
    ksef.submit.push({
      status: "rejected",
      statusCode: 450,
      message: "KSeF odrzucił fakturę (450): P_15",
      sent: true,
      sessionReference: "S1",
      invoiceReference: "I1",
    });
    const r = await issueSalesInvoice(db as any, i.id);
    expect(r).toMatchObject({ ok: false, status: "rejected" });
    expect(inv(i.id)).toMatchObject({
      status: "draft",
      ksef_status: "rejected",
      invoice_number: `FY/${YEAR}/0003`,
    });
    expect(inv(i.id).error_message).toMatch(/450/);

    ksef.submit.push(accepted());
    await issueSalesInvoice(db as any, i.id);
    expect(inv(i.id)).toMatchObject({ status: "issued", invoice_number: `FY/${YEAR}/0003` });
    expect(db.tables.accounting_entities[0].invoice_next_number).toBe(4);
  });

  it("duplikat (440) po wcześniejszej wysyłce = faktura już jest w KSeF", async () => {
    const i = invoice();
    ksef.submit.push({ status: "error", sent: true, message: "timeout" }); // wysłana, brak odpowiedzi
    await issueSalesInvoice(db as any, i.id);
    expect(inv(i.id).ksef_status).toBe("error");
    ksef.submit.push({
      status: "rejected",
      statusCode: 440,
      referenceNumber: "ORIG-1",
      sent: true,
    });
    const r = await issueSalesInvoice(db as any, i.id);
    expect(r.status).toBe("accepted");
    expect(inv(i.id)).toMatchObject({
      ksef_status: "accepted",
      ksef_reference_number: "ORIG-1",
      status: "issued",
    });
  });

  it("brak tokenu KSeF blokuje przed nadaniem numeru", async () => {
    db.tables.accounting_entities[0].ksef_token_encrypted = "none";
    const i = invoice();
    const r = await issueSalesInvoice(db as any, i.id);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/tokenu KSeF/);
    expect(inv(i.id)).toMatchObject({ status: "draft", invoice_number: null });
    expect(ksef.sentXml).toHaveLength(0);
  });
});

describe("issueSalesInvoice — Fundacja (zwolnienie podmiotowe)", () => {
  it("bez adresu podmiotu: blokada przed nadaniem numeru", async () => {
    const i = invoice({ entity_id: "fund" });
    const r = await issueSalesInvoice(db as any, i.id);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/adres/);
    expect(inv(i.id)).toMatchObject({ status: "draft", invoice_number: null });
    expect(db.tables.accounting_entities[1].invoice_next_number).toBe(1);
    expect(ksef.sentXml).toHaveLength(0);
  });

  const withAddress = () =>
    Object.assign(db.tables.accounting_entities[1], {
      address_street: "ul. Testowa 1",
      address_postal_code: "20-001",
      address_city: "Lublin",
    });

  it("z adresem: wysyła z podstawą art. 113", async () => {
    withAddress();
    const i = invoice({ entity_id: "fund" });
    ksef.submit.push(accepted());
    await issueSalesInvoice(db as any, i.id);
    expect(inv(i.id).invoice_number).toBe(`FV/${YEAR}/0001`);
    expect(ksef.sentXml[0]).toContain("<P_19A>art. 113 ust. 1 ustawy o VAT</P_19A>");
    expect(ksef.sentXml[0]).toContain("<NIP>9462747637</NIP>");
    expectValidFa3(ksef.sentXml[0]);
  });

  it("pozycja z VAT 23% jest niedozwolona", async () => {
    withAddress();
    const i = invoice({
      entity_id: "fund",
      vat_rate: "23",
      net_amount: 100,
      vat_amount: 23,
      gross_amount: 123,
      items: [{ name: "X", quantity: 1, unitNet: 100, vatRate: "23" }],
    });
    const r = await issueSalesInvoice(db as any, i.id);
    expect(r.message).toMatch(/zwolniony podmiotowo/);
    expect(inv(i.id).invoice_number).toBeNull();
  });

  it("blokuje fakturę przekraczającą limit 200 000 zł w roku", async () => {
    withAddress();
    invoice({
      entity_id: "fund",
      status: "issued",
      invoice_number: "FV/X/1",
      issue_date: `${YEAR}-03-01`,
      gross_amount: 150000,
    });
    db.tables.accounting_documents.push({
      entity_id: "fund",
      direction: "sales",
      source: "fakturowo",
      issue_date: `${YEAR}-04-01`,
      gross_amount: 45000,
    });
    const ok = invoice({ entity_id: "fund", gross_amount: 5000, net_amount: 5000 });
    const over = invoice({ entity_id: "fund", gross_amount: 5000.01, net_amount: 5000.01 });

    const r1 = await issueSalesInvoice(db as any, over.id);
    expect(r1.ok).toBe(false);
    expect(r1.message).toMatch(/limit zwolnienia podmiotowego/);

    ksef.submit.push(accepted());
    const r2 = await issueSalesInvoice(db as any, ok.id);
    expect(r2.ok).toBe(true); // dokładnie 200 000,00 — jeszcze w limicie
  });
});
