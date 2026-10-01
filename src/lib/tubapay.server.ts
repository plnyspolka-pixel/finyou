// TubaPay Partner API client (płatności podzielone / raty). Internal use only.
//
// Kontrakt API odtworzony z oficjalnej wtyczki WooCommerce „tubapay-v2"
// (classes/Gateway/RestApi.php, classes/Core/NotificationHandler.php):
//  - POST /api/v1/partner/auth/token  {grantType, clientId, clientSecret}
//      → {token, refreshToken, expires}
//  - POST /api/v1/external/transaction/create-offer {totalValue, type:"client"}
//      → result.response.offer.offerItems[].installmentsNumber
//  - POST /api/v1/external/transaction/create {customer, order, offer}
//      → result.response.transaction.transactionLink
//  - webhook (POST JSON na order.callbackUrl):
//      {metaData:{commandType:"TRANSACTION_STATUS_CHANGED"},
//       payload:{transaction:{externalRef, agreementStatus, agreementNumber}}}
//
// TubaPay nie udostępnia endpointu do odczytu statusu transakcji ani podpisu
// powiadomień, dlatego callbackUrl każdej transakcji zawiera nasz podpis
// HMAC-SHA256(paymentId) — webhook bez poprawnego podpisu nie zmienia stanu.
//
// Sekrety: TUBAPAY_PARTNER_ID (Identyfikator partnera API) i TUBAPAY_API_KEY
// (Klucz API) z Panelu Partnera. TUBAPAY_API_BASE — opcjonalnie środowisko
// testowe (https://tubapay-test.bacca.pl).
const TUBAPAY_API_BASE = (process.env.TUBAPAY_API_BASE || "https://tubapay.pl").replace(/\/+$/, "");

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

export function isTubapayConfigured(): boolean {
  return Boolean(process.env.TUBAPAY_PARTNER_ID && process.env.TUBAPAY_API_KEY);
}

let cachedToken: { token: string; exp: number } | null = null;

const COMMON_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "Cache-Control": "no-cache",
};

async function getAccessToken(force = false): Promise<string> {
  if (!force && cachedToken && cachedToken.exp > Date.now() + 30_000) return cachedToken.token;
  const res = await fetch(`${TUBAPAY_API_BASE}/api/v1/partner/auth/token`, {
    method: "POST",
    headers: COMMON_HEADERS,
    body: JSON.stringify({
      grantType: "PARTNER_CLIENT_CREDENTIALS",
      clientId: getEnv("TUBAPAY_PARTNER_ID"),
      clientSecret: getEnv("TUBAPAY_API_KEY"),
    }),
  });
  const text = await res.text();
  let data: { token?: string; expires?: string } = {};
  try {
    data = JSON.parse(text);
  } catch {
    // obsłużone niżej
  }
  if (!res.ok || !data.token) {
    cachedToken = null;
    throw new Error(`TubaPay auth failed: ${res.status} ${text.slice(0, 300)}`);
  }
  // `expires` to znacznik czasu ISO; gdy brak/nieczytelny — 10 minut.
  const parsed = data.expires ? Date.parse(String(data.expires).slice(0, 19) + "Z") : NaN;
  cachedToken = {
    token: data.token,
    exp: Number.isFinite(parsed) ? parsed : Date.now() + 10 * 60_000,
  };
  return data.token;
}

async function callApi(path: string, body: unknown): Promise<any> {
  const doCall = async (token: string) =>
    fetch(`${TUBAPAY_API_BASE}${path}`, {
      method: "POST",
      headers: { ...COMMON_HEADERS, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

  let res = await doCall(await getAccessToken());
  if (res.status === 401) {
    // Token unieważniony przed czasem — jedna ponowna autoryzacja (jak wtyczka).
    res = await doCall(await getAccessToken(true));
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // obsłużone niżej
  }
  if (!res.ok || !json) {
    throw new Error(`TubaPay ${path} failed: ${res.status} ${text.slice(0, 500)}`);
  }
  return json;
}

/** Dostępne liczby płatności miesięcznych dla kwoty (rosnąco). */
export async function getTubapayInstallmentOptions(amountPln: number): Promise<number[]> {
  const json = await callApi("/api/v1/external/transaction/create-offer", {
    totalValue: Number(amountPln.toFixed(2)),
    type: "client",
  });
  return parseInstallmentOptions(json);
}

export function parseInstallmentOptions(json: any): number[] {
  const items = json?.result?.response?.offer?.offerItems;
  if (!Array.isArray(items)) return [];
  const out = new Set<number>();
  for (const it of items) {
    const n = Number(it?.installmentsNumber);
    if (Number.isInteger(n) && n > 0) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

export type TubapayCustomer = {
  firstName: string;
  lastName: string;
  street: string;
  zipCode: string;
  town: string;
  /** 9 cyfr, bez prefiksu kraju. */
  phone: string;
  email: string;
};

export type TubapayCreateInput = {
  customer: TubapayCustomer;
  /** Przedmiot zakupu wpisywany do umowy Klienta z TubaPay. */
  itemName: string;
  brand: string;
  amountPln: number;
  installments: number;
  /** Wewnętrzny UUID płatności (access_payments.id). */
  externalRef: string;
  callbackUrl: string;
  returnUrl: string;
  /** Zgoda RODO_BP (przetwarzanie danych przez TubaPay) — wymagana przez wtyczkę. */
  rodoConsent: boolean;
};

export async function createTubapayTransaction(
  input: TubapayCreateInput,
): Promise<{ transactionLink: string; raw: unknown }> {
  const json = await callApi("/api/v1/external/transaction/create", {
    customer: input.customer,
    order: {
      item: {
        name: input.itemName,
        brand: input.brand,
        description: "",
        totalValue: Number(input.amountPln.toFixed(2)),
      },
      externalRef: input.externalRef,
      callbackUrl: input.callbackUrl,
      returnUrl: input.returnUrl,
      acceptedConsents: input.rodoConsent ? ["RODO_BP"] : [],
    },
    offer: { installmentsNumber: input.installments },
  });
  const link = json?.result?.response?.transaction?.transactionLink;
  if (typeof link !== "string" || !/^https:\/\//i.test(link)) {
    throw new Error(`TubaPay create: brak transactionLink — ${JSON.stringify(json).slice(0, 500)}`);
  }
  return { transactionLink: link, raw: json };
}

// ── Pomocnicze (czyste, testowalne) ─────────────────────────────────────────

/** "Jan Maria Kowalski" → {firstName:"Jan Maria", lastName:"Kowalski"}. */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Podpis callbacku: HMAC-SHA256(paymentId) kluczem API TubaPay. */
export async function signTubapayCallback(paymentId: string, secret?: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret ?? getEnv("TUBAPAY_API_KEY")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`tubapay:${paymentId}`),
  );
  return toHex(sig);
}

export async function verifyTubapayCallback(
  paymentId: string,
  signature: string,
  secret?: string,
): Promise<boolean> {
  if (!paymentId || !/^[0-9a-f]{64}$/i.test(signature || "")) return false;
  const expected = await signTubapayCallback(paymentId, secret);
  // Porównanie w stałym czasie.
  const a = expected.toLowerCase();
  const b = signature.toLowerCase();
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Sposób obsługi statusu umowy TubaPay (agreementStatus) w płatności za dostęp. */
export type TubapayStatusAction = "paid" | "cancel" | "review" | "ignore";

export function mapTubapayAgreementStatus(status: string): TubapayStatusAction {
  switch (status) {
    // Pozytywna weryfikacja Klienta — TubaPay finansuje zakup i rozlicza się
    // z partnerem; dla nas to opłacony dostęp.
    case "accepted":
      return "paid";
    case "rejected":
    case "canceled":
      return "cancel";
    // Odstąpienie Klienta od umowy / wypowiedzenie przez TubaPay po
    // przyznaniu dostępu — decyzja administratora (jak zwrot w Tpay).
    case "withdrew":
    case "terminated":
    case "terminatedBySystem":
      return "review";
    // registered / signed / repaid / closed — etapy pośrednie lub końcowe bez
    // wpływu na dostęp.
    default:
      return "ignore";
  }
}
