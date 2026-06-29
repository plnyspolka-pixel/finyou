// Tpay Open API client (PRODUCTION). Internal use only.
// Correct base for Tpay Open API is openapi.tpay.com (production)
// / openapi.sandbox.tpay.com (sandbox). api.tpay.com nie istnieje jako publiczne API
// i potrafi zwracać linki płatności prowadzące do secure.tpay.com, który odrzuca połączenie.
const TPAY_API_BASE = process.env.TPAY_API_BASE || "https://openapi.tpay.com";

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

let cachedToken: { token: string; exp: number } | null = null;

const COMMON_HEADERS = {
  "User-Agent": "FinanceYou/1.0 (+https://financeyou.pl)",
  Accept: "application/json",
};

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 30_000) return cachedToken.token;
  const res = await fetch(`${TPAY_API_BASE}/oauth/auth`, {
    method: "POST",
    headers: { ...COMMON_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: getEnv("TPAY_CLIENT_ID"),
      client_secret: getEnv("TPAY_CLIENT_SECRET"),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Tpay OAuth failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    exp: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}


export type TpayCreateInput = {
  amount: number;            // PLN
  description: string;
  email: string;
  name: string;
  crc: string;               // own correlation id (we'll encode `${userId}|${plan}`)
  notifyUrl: string;
  successUrl: string;
  errorUrl: string;
};

export type TpayCreatedTransaction = {
  transactionId: string;
  transactionPaymentUrl: string;
  title: string;
};

export async function createTpayTransaction(input: TpayCreateInput): Promise<TpayCreatedTransaction> {
  const token = await getAccessToken();
  const res = await fetch(`${TPAY_API_BASE}/transactions`, {
    method: "POST",
    headers: {
      ...COMMON_HEADERS,
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      amount: Number(input.amount.toFixed(2)),
      description: input.description,
      hiddenDescription: input.crc,
      payer: {
        email: input.email,
        name: input.name,
      },
      callbacks: {
        payerUrls: {
          success: input.successUrl,
          error: input.errorUrl,
        },
        notification: {
          url: input.notifyUrl,
          email: null,
        },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Tpay createTransaction failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    transactionId: string;
    transactionPaymentUrl: string;
    title: string;
  };
  return data;
}

export type TpayTransactionStatus = {
  transactionId: string;
  status: string;        // "correct" when paid
  amount: number;
  hiddenDescription?: string;
  payer?: { email?: string; name?: string };
};

export async function getTpayTransaction(transactionId: string): Promise<TpayTransactionStatus> {
  const token = await getAccessToken();
  const res = await fetch(`${TPAY_API_BASE}/transactions/${encodeURIComponent(transactionId)}`, {
    headers: { ...COMMON_HEADERS, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Tpay getTransaction failed: ${res.status} ${body}`);
  }
  return (await res.json()) as TpayTransactionStatus;
}
