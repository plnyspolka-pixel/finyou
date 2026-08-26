// Klient EasyMKW (mkw.monitoringdanych.io) — zbudowany dokładnie na kontrakcie
// OpenAPI 3.1 dostarczonym przez CMD (docs_1.yaml, security: httpAuth = Basic).
//
// UWAGA: to warstwa dostępu. Nic tutaj nie jest jeszcze podłączone pod
// dotychczasowy silnik KW Engine (src/lib/kw-fetch.server.ts) — przełączenie
// nastąpi po pozytywnej weryfikacji uwierzytelnienia i jednym kontrolnym
// pobraniu (2 kredyty).
//
// Koszt: pobranie jednej KW w jednym formacie (pdf/json/xlsx) = 2 kredyty.
// Dlatego każde zamówienie tworzymy z DOKŁADNIE jednym formatem i bez raportów
// oraz bez wycen (`reports: []`, `valuations: []`).

const DEFAULT_BASE = "https://mkw.monitoringdanych.io";

export type EasyMkwFormat = "json" | "pdf" | "xlsx";

export type EasyMkwJobStatus = "PLANNED" | "STARTED" | "FINISHED" | "ERROR" | "CANCELED" | string;

export type EasyMkwJob = {
  id: string;
  orderId: string;
  orderName: string;
  stepNumber: number;
  status: EasyMkwJobStatus;
  kw: string;
  startDate?: string;
  endDate?: string;
  json?: string;
  pdf?: string;
  xlsx?: string;
  result?: unknown;
};

export function easyMkwBaseUrl(): string {
  const raw = (process.env["EASYMKW_BASE_URL"] ?? DEFAULT_BASE).replace(/\/+$/, "");
  return raw.replace(/\/(docs|swagger|swagger-ui|openapi)(\/.*)?$/i, "");
}

export function hasEasyMkwConfig(): boolean {
  return Boolean(process.env["EASYMKW_API_USER"] && process.env["EASYMKW_API_PASSWORD"]);
}

function authHeader(): string {
  const u = process.env["EASYMKW_API_USER"] ?? "";
  const p = process.env["EASYMKW_API_PASSWORD"] ?? "";
  return "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
}

export type EasyMkwCall<T> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  billIn?: number;
  billOut?: number;
};

async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown; raw?: boolean },
): Promise<EasyMkwCall<T>> {
  if (!hasEasyMkwConfig()) {
    return {
      ok: false,
      status: 0,
      error: "Brak konfiguracji EasyMKW (EASYMKW_API_USER / EASYMKW_API_PASSWORD).",
    };
  }
  const res = await fetch(`${easyMkwBaseUrl()}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: authHeader(),
      Accept: init?.raw ? "*/*" : "application/json",
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const billIn = Number(res.headers.get("x-bill-in") ?? "0") || undefined;
  const billOut = Number(res.headers.get("x-bill-out") ?? "0") || undefined;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      status: res.status,
      error: text?.slice(0, 400) || `HTTP ${res.status}`,
      billIn,
      billOut,
    };
  }
  if (init?.raw) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true, status: res.status, data: buf as unknown as T, billIn, billOut };
  }
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* zostaw tekst */
  }
  return { ok: true, status: res.status, data: data as T, billIn, billOut };
}

/** GET /v1/users/login — weryfikacja danych Basic (nie kosztuje kredytów). */
export function easyMkwWhoAmI() {
  return call<{ id: string }>("/v1/users/login");
}

/** GET /v1/users/credits/balance — stan kredytów (nie kosztuje kredytów). */
export function easyMkwCreditsBalance() {
  return call<number>("/v1/users/credits/balance");
}

/**
 * POST /v1/orders — zamawia treść jednej księgi w jednym formacie (2 kredyty).
 * Świadomie bez raportów i wycen, żeby nie mnożyć kosztu.
 */
export function easyMkwOrderContent(
  kw: string,
  format: EasyMkwFormat = "json",
  opts?: { name?: string },
) {
  const today = new Date().toISOString().slice(0, 10);
  return call<unknown>("/v1/orders", {
    method: "POST",
    body: {
      name: opts?.name ?? `FY treść KW ${kw}`,
      kws: [kw],
      // Jednorazowe pobranie (API oczekuje okresu w formacie ISO; "P1X" = raz).
      period: "P1X",
      reports: [],
      valuations: [],
      contents: [{ name: format, price: 2 }],
      startDate: today,
      endDate: today,
    },
  });
}

/** GET /v1/jobs?kw_number_eq=… — status zadań dla danej księgi. */
export function easyMkwJobsForKw(kw: string) {
  return call<{ jobs: EasyMkwJob[]; totalRowCount: number }>(
    `/v1/jobs?kw_number_eq=${encodeURIComponent(kw)}&page_number=0&page_size=50`,
  );
}

/** GET /v1/users/jobs/{jobId}/json — wynik w JSON. */
export function easyMkwJobJson(jobId: string) {
  return call<unknown>(`/v1/users/jobs/${encodeURIComponent(jobId)}/json`);
}

/** GET /v1/users/jobs/{jobId}/pdf — wynik w PDF (bufor binarny). */
export function easyMkwJobPdf(jobId: string) {
  return call<Buffer>(`/v1/users/jobs/${encodeURIComponent(jobId)}/pdf`, { raw: true });
}

/** POST /v1/jobs/cancel/{jobId} — anulowanie zadania. */
export function easyMkwCancelJob(jobId: string) {
  return call<unknown>(`/v1/jobs/cancel/${encodeURIComponent(jobId)}`, { method: "POST" });
}
