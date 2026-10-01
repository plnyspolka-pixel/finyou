import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTubapayTransaction,
  getTubapayInstallmentOptions,
  mapTubapayAgreementStatus,
  parseInstallmentOptions,
  signTubapayCallback,
  splitFullName,
  verifyTubapayCallback,
} from "./tubapay.server";
import { normalizePlPhone, validateTubapayCheckout } from "./access/tubapay-checkout";

describe("TubaPay — pomocnicze", () => {
  it("dzieli imię i nazwisko", () => {
    expect(splitFullName("Jan Kowalski")).toEqual({ firstName: "Jan", lastName: "Kowalski" });
    expect(splitFullName("  Anna  Maria   Nowak ")).toEqual({
      firstName: "Anna Maria",
      lastName: "Nowak",
    });
    expect(splitFullName("Jan")).toEqual({ firstName: "Jan", lastName: "" });
  });

  it("normalizuje polski numer telefonu do 9 cyfr", () => {
    expect(normalizePlPhone("500 600 700")).toBe("500600700");
    expect(normalizePlPhone("+48 500-600-700")).toBe("500600700");
    expect(normalizePlPhone("0048500600700")).toBe("500600700");
    expect(normalizePlPhone("12345")).toBeNull();
    expect(normalizePlPhone(null)).toBeNull();
  });

  it("odczytuje dostępne liczby rat z oferty", () => {
    const json = {
      result: {
        response: {
          offer: {
            offerItems: [{ installmentsNumber: 12 }, { installmentsNumber: 4 }, { x: 1 }],
          },
        },
      },
    };
    expect(parseInstallmentOptions(json)).toEqual([4, 12]);
    expect(parseInstallmentOptions({})).toEqual([]);
  });

  it("mapuje statusy umowy", () => {
    expect(mapTubapayAgreementStatus("accepted")).toBe("paid");
    expect(mapTubapayAgreementStatus("rejected")).toBe("cancel");
    expect(mapTubapayAgreementStatus("canceled")).toBe("cancel");
    expect(mapTubapayAgreementStatus("withdrew")).toBe("review");
    expect(mapTubapayAgreementStatus("terminatedBySystem")).toBe("review");
    expect(mapTubapayAgreementStatus("registered")).toBe("ignore");
    expect(mapTubapayAgreementStatus("signed")).toBe("ignore");
  });

  it("podpis callbacku weryfikuje się tylko dla tej samej płatności i klucza", async () => {
    const sig = await signTubapayCallback("p1", "k1");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyTubapayCallback("p1", sig, "k1")).toBe(true);
    expect(await verifyTubapayCallback("p2", sig, "k1")).toBe(false);
    expect(await verifyTubapayCallback("p1", sig, "k2")).toBe(false);
    expect(await verifyTubapayCallback("p1", "zly", "k1")).toBe(false);
  });

  it("walidacja checkoutu TubaPay", () => {
    const base = {
      paymentMethod: "tubapay" as const,
      buyerType: "person",
      buyerName: "Jan Kowalski",
      buyerPhone: "+48 500 600 700",
      installments: 12,
      consents: { tubapay: true },
    };
    const ok = { ...base };
    expect(validateTubapayCheckout(ok)).toBeNull();
    expect(ok.buyerPhone).toBe("500600700");
    expect(validateTubapayCheckout({ ...base, buyerType: "company" })).toMatch(/osoby prywatnej/);
    expect(validateTubapayCheckout({ ...base, buyerName: "Jan" })).toMatch(/imię i nazwisko/);
    expect(validateTubapayCheckout({ ...base, buyerPhone: "1" })).toMatch(/telefonu/);
    expect(validateTubapayCheckout({ ...base, installments: null })).toMatch(/liczbę/);
    expect(validateTubapayCheckout({ ...base, consents: { tubapay: false } })).toMatch(/zgodę/);
    expect(validateTubapayCheckout({ ...base, paymentMethod: "tpay", buyerPhone: "" })).toBeNull();
  });
});

describe("TubaPay — klient API", () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];

  beforeEach(() => {
    process.env.TUBAPAY_PARTNER_ID = "TP9462747637";
    process.env.TUBAPAY_API_KEY = "secret";
    calls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        if (url.endsWith("/api/v1/partner/auth/token")) {
          return new Response(
            JSON.stringify({ token: "tok", refreshToken: "r", expires: "2099-01-01T00:00:00" }),
            { status: 200 },
          );
        }
        if (url.endsWith("/create-offer")) {
          return new Response(
            JSON.stringify({
              result: {
                response: {
                  offer: { offerItems: [{ installmentsNumber: 6 }, { installmentsNumber: 12 }] },
                },
              },
            }),
            { status: 200 },
          );
        }
        if (url.endsWith("/api/v1/external/transaction/create")) {
          return new Response(
            JSON.stringify({
              result: {
                response: { transaction: { transactionLink: "https://tubapay.pl/t/abc" } },
              },
            }),
            { status: 200 },
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("autoryzuje się danymi partnera i pobiera ofertę rat", async () => {
    const opts = await getTubapayInstallmentOptions(7000);
    expect(opts).toEqual([6, 12]);
    const auth = calls.find((c) => c.url.endsWith("/auth/token"))!;
    expect(auth.url).toBe("https://tubapay.pl/api/v1/partner/auth/token");
    expect(JSON.parse(String(auth.init.body))).toEqual({
      grantType: "PARTNER_CLIENT_CREDENTIALS",
      clientId: "TP9462747637",
      clientSecret: "secret",
    });
    const offer = calls.find((c) => c.url.endsWith("/create-offer"))!;
    expect((offer.init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(offer.init.body))).toEqual({ totalValue: 7000, type: "client" });
  });

  it("tworzy transakcję w formacie wtyczki i zwraca link", async () => {
    const res = await createTubapayTransaction({
      customer: {
        firstName: "Jan",
        lastName: "Kowalski",
        street: "ul. Prosta 1",
        zipCode: "00-001",
        town: "Warszawa",
        phone: "500600700",
        email: "jan@example.com",
      },
      itemName: "Abonament inwestora — 365 dni",
      brand: "Finance You",
      amountPln: 7000,
      installments: 12,
      externalRef: "pay-1",
      callbackUrl: "https://app.test/api/public/payments/tubapay-webhook?payment=pay-1&sig=x",
      returnUrl: "https://app.test/inwestor/abonament?tpay=success&payment=pay-1",
      rodoConsent: true,
    });
    expect(res.transactionLink).toBe("https://tubapay.pl/t/abc");
    const create = calls.find((c) => c.url.endsWith("/transaction/create"))!;
    const body = JSON.parse(String(create.init.body));
    expect(body.customer.phone).toBe("500600700");
    expect(body.order.item).toEqual({
      name: "Abonament inwestora — 365 dni",
      brand: "Finance You",
      description: "",
      totalValue: 7000,
    });
    expect(body.order.externalRef).toBe("pay-1");
    expect(body.order.acceptedConsents).toEqual(["RODO_BP"]);
    expect(body.offer).toEqual({ installmentsNumber: 12 });
  });
});
