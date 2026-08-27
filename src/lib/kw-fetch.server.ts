// Silnik pobierania treści KW z CMD KW Engine — wspólny dla server functions
// (kw-content.functions.ts, panel admina) oraz automatycznego wzbogacania
// leadów (lead-doc-intel.server.ts). Wyniki lądują w cache kw_documents.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function normalizeKwNumber(raw: string): string | null {
  const v = (raw || "").toUpperCase().replace(/\s+/g, "");
  // Try to extract a KW pattern from anywhere in the string (tolerates trailing garbage).
  // 7-digit numbers (older paper registers) are zero-padded to 8, like EKW does.
  const m =
    v.match(/([A-Z]{2}\d[A-Z0-9])\/?(\d{8})\/?(\d)/) ??
    v.match(/([A-Z]{2}\d[A-Z0-9])\/(\d{7})\/(\d)/);
  if (!m) return null;
  return `${m[1]}${m[2].padStart(8, "0")}${m[3]}`; // CMD API uses compact 13-char form
}

export function hasCmdConfig(): boolean {
  return Boolean(process.env.CMD_KW_USER && process.env.CMD_KW_PASSWORD);
}

// Limity CMD są grupowe (współdzielone przez całe konto) i odnawiają się po
// stronie CMD — ponawianie zleceń tylko je dalej zużywa (każdy /v4/order to
// bilingowany request TECH_IN_ORDER, nawet gdy kończy się 403).
export function isCmdQuotaError(msg: string | null | undefined): boolean {
  return /limit exceeded|usage type|wyczerpany limit/i.test(msg ?? "");
}

function quotaErrorMessage(detail: string): string {
  const d = detail.replace(/\s+/g, " ").trim().slice(0, 200);
  return (
    "Wyczerpany limit zapytań CMD KW Engine (limit grupowy konta). " +
    "Automatyczne ponawianie wstrzymane — limit odnawia się po stronie CMD; " +
    "w razie potrzeby poproś CMD o zwiększenie limitu grupy. " +
    (d ? `Odpowiedź API: ${d}` : "")
  ).trim();
}

// Po wykrytym wyczerpaniu limitu nie odpytujemy CMD z automatów przez 6 h
// (best-effort, per instancja). Ręczne pobranie (force) zawsze próbuje.
const QUOTA_COOLDOWN_MS = 6 * 3600_000;
let quotaBlockedUntil = 0;

// Backoff ponowień per KW (wpis w kw_documents ze statusem "error"):
// zwykły błąd — 6 h, wyczerpany limit — 24 h. force pomija backoff.
const ERROR_RETRY_MS = 6 * 3600_000;
const QUOTA_RETRY_MS = 24 * 3600_000;

function authHeader(): string {
  const u = process.env.CMD_KW_USER ?? "";
  const p = process.env.CMD_KW_PASSWORD ?? "";
  return "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
}

function baseUrl(): string {
  const raw = (process.env.CMD_KW_BASE_URL ?? "https://dev.monitoringdanych.io:4444").replace(
    /\/+$/,
    "",
  );
  // Strip accidental Swagger/docs suffix — API root should not include /docs.
  return raw.replace(/\/(docs|swagger|swagger-ui|openapi)(\/.*)?$/i, "");
}

export function decodeMaybeBase64(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  // If it already looks like HTML, return as-is.
  if (/<\w+[\s>]/.test(s)) return s;
  // Try base64 decode (CMD v3 zwraca HTML zakodowany w base64).
  try {
    const cleaned = s.replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/=]+$/.test(cleaned)) return s;
    const decoded = Buffer.from(cleaned, "base64").toString("utf-8");
    if (/<\w+[\s>]/.test(decoded)) return decoded;
    return decoded || s;
  } catch {
    return s;
  }
}

async function fetchKwHtml(kw: string): Promise<{
  ok: boolean;
  status: number;
  html?: any;
  billIn?: number;
  billOut?: number;
  error?: string;
}> {
  const res = await fetch(`${baseUrl()}/v3/html/${encodeURIComponent(kw)}?odpis=aktualny`, {
    headers: { Authorization: authHeader() },
  });
  const billIn = Number(res.headers.get("x-bill-in") ?? "0") || undefined;
  const billOut = Number(res.headers.get("x-bill-out") ?? "0") || undefined;
  if (res.status === 200) {
    const html = await res.json();
    return { ok: true, status: 200, html, billIn, billOut };
  }
  if (res.status === 404)
    return { ok: false, status: 404, error: "Księga nie znaleziona w bazie EKW" };
  const text = await res.text().catch(() => "");
  return { ok: false, status: res.status, error: text || `HTTP ${res.status}` };
}

async function orderKw(kw: string): Promise<{ status: string; reason?: string }> {
  const url = `${baseUrl()}/v4/order?crawlingType=ONLY_CURRENT_VIEW`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "text/plain",
      Accept: "application/json",
    },
    body: kw,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("[kw] orderKw failed", { url, status: res.status, body: t.slice(0, 300) });
    return { status: "NOT_ENQUEUED", reason: `HTTP ${res.status}: ${t || res.statusText}` };
  }
  const json: any = await res.json();
  if (json?.notEnqueued?.length) {
    return { status: "NOT_ENQUEUED", reason: json.notEnqueued[0]?.reason };
  }
  return { status: json?.status ?? "ENQUEUED" };
}

async function pollResults(
  kw: string,
  maxMs = 45000,
): Promise<"processed" | "not_found" | "etl_error" | "timeout"> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 4000));
    const res = await fetch(`${baseUrl()}/v4/results?crawlingType=ONLY_CURRENT_VIEW`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "text/plain" },
      body: kw,
    });
    if (!res.ok) continue;
    const j: any = await res.json();
    if (j?.processed?.includes(kw) || j?.downloaded?.includes(kw)) return "processed";
    if (j?.notFound?.includes(kw)) return "not_found";
    if (j?.etlError?.includes(kw)) return "etl_error";
  }
  return "timeout";
}

export type KwFetchOutcome = {
  ok: boolean;
  status: "ready" | "processing" | "not_found" | "error";
  cached: boolean;
  error?: string;
};

/**
 * Zleca pobranie KW z CMD (order → poll → html) i zapisuje działy w
 * kw_documents. Zwraca status zamiast rzucać — wołający decyduje, czy
 * błąd jest fatalny (server fn rzuca, pipeline leadów tylko loguje).
 */
export async function fetchAndStoreKw(
  kw: string,
  opts?: { orderedBy?: string | null; force?: boolean; pollMaxMs?: number },
): Promise<KwFetchOutcome> {
  if (!hasCmdConfig()) {
    return {
      ok: false,
      status: "error",
      cached: false,
      error: "Brak konfiguracji CMD KW Engine (CMD_KW_USER / CMD_KW_PASSWORD).",
    };
  }

  // Check cache
  const { data: cached } = await supabaseAdmin
    .from("kw_documents")
    .select("status, fetched_at, ordered_at, last_error")
    .eq("kw_number", kw)
    .maybeSingle();
  if (cached && cached.status === "ready" && !opts?.force) {
    return { ok: true, status: "ready", cached: true };
  }

  // Backoff po błędzie — nie odpytuj CMD w kółko o tę samą księgę
  // (backfill leadów wraca do nieudanych KW przy każdym przebiegu).
  if (cached?.status === "error" && !opts?.force && cached.ordered_at) {
    const age = Date.now() - Date.parse(cached.ordered_at);
    const wait = isCmdQuotaError(cached.last_error) ? QUOTA_RETRY_MS : ERROR_RETRY_MS;
    if (Number.isFinite(age) && age < wait) {
      return {
        ok: false,
        status: "error",
        cached: true,
        error: cached.last_error ?? "Poprzednia próba pobrania KW nie powiodła się.",
      };
    }
  }

  // Globalna blokada po wyczerpaniu limitu CMD (automaty; force próbuje mimo to).
  if (!opts?.force && Date.now() < quotaBlockedUntil) {
    return {
      ok: false,
      status: "error",
      cached: false,
      error: quotaErrorMessage(""),
    };
  }

  // Świeżo zlecone pobranie (inne wywołanie już zamówiło tę księgę) — nie
  // duplikuj /v4/order, tylko doczekaj wyniku; duplikaty biją w limit TECH_IN_ORDER.
  const recentlyOrdered =
    cached?.status === "processing" &&
    !!cached.ordered_at &&
    Date.now() - Date.parse(cached.ordered_at) < 10 * 60_000;

  // Mark/insert as processing
  await supabaseAdmin.from("kw_documents").upsert(
    {
      kw_number: kw,
      status: "processing",
      ordered_at: new Date().toISOString(),
      ordered_by: opts?.orderedBy ?? null,
      last_error: null,
    },
    { onConflict: "kw_number" },
  );

  // Try direct HTML first — might already be downloaded earlier.
  // NOTE: 404 z /v3/html oznacza "brak w cache CMD" (nie: brak w EKW),
  // więc też zlecamy pobranie przez /v4/order.
  let res = await fetchKwHtml(kw);
  if (!res.ok) {
    if (res.status === 403 && isCmdQuotaError(res.error)) {
      quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
      const msg = quotaErrorMessage(res.error ?? "");
      await supabaseAdmin
        .from("kw_documents")
        .update({ status: "error", last_error: msg })
        .eq("kw_number", kw);
      return { ok: false, status: "error", cached: false, error: msg };
    }
    if (!recentlyOrdered) {
      const ord = await orderKw(kw);
      if (ord.status === "NOT_ENQUEUED") {
        let reason = ord.reason ?? "Nie udało się zlecić pobrania KW";
        if (isCmdQuotaError(reason)) {
          quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
          reason = quotaErrorMessage(reason);
        }
        await supabaseAdmin
          .from("kw_documents")
          .update({ status: "error", last_error: reason })
          .eq("kw_number", kw);
        return { ok: false, status: "error", cached: false, error: reason };
      }
    }
    const result = await pollResults(kw, opts?.pollMaxMs);
    if (result === "not_found") {
      await supabaseAdmin
        .from("kw_documents")
        .update({ status: "not_found", last_error: "Księga nie znaleziona w EKW" })
        .eq("kw_number", kw);
      return {
        ok: false,
        status: "not_found",
        cached: false,
        error: "Księga wieczysta nie została odnaleziona w EKW.",
      };
    }
    if (result === "etl_error") {
      await supabaseAdmin
        .from("kw_documents")
        .update({ status: "error", last_error: "Błąd przetwarzania po stronie CMD" })
        .eq("kw_number", kw);
      return {
        ok: false,
        status: "error",
        cached: false,
        error: "Błąd przetwarzania KW po stronie CMD KW Engine.",
      };
    }
    if (result === "timeout") {
      return { ok: false, status: "processing", cached: false };
    }
    res = await fetchKwHtml(kw);
  }

  if (res.status === 404) {
    await supabaseAdmin
      .from("kw_documents")
      .update({ status: "not_found", last_error: "404 not found" })
      .eq("kw_number", kw);
    return {
      ok: false,
      status: "not_found",
      cached: false,
      error: "Księga wieczysta nie została odnaleziona w EKW.",
    };
  }
  if (!res.ok || !res.html) {
    let err = res.error ?? "Nie udało się pobrać treści KW.";
    if (res.status === 403 && isCmdQuotaError(res.error)) {
      quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
      err = quotaErrorMessage(res.error ?? "");
    }
    await supabaseAdmin
      .from("kw_documents")
      .update({ status: "error", last_error: err })
      .eq("kw_number", kw);
    return { ok: false, status: "error", cached: false, error: err };
  }

  const h = res.html;
  await supabaseAdmin
    .from("kw_documents")
    .update({
      status: "ready",
      okladka: decodeMaybeBase64(h.okladka),
      dzial_1o: decodeMaybeBase64(h.dzial1o),
      dzial_1s: decodeMaybeBase64(h.dzial1s),
      dzial_2: decodeMaybeBase64(h.dzial2),
      dzial_3: decodeMaybeBase64(h.dzial3),
      dzial_4: decodeMaybeBase64(h.dzial4),
      fetched_at: new Date().toISOString(),
      bill_in: res.billIn ?? null,
      bill_out: res.billOut ?? null,
      last_error: null,
    })
    .eq("kw_number", kw);

  return { ok: true, status: "ready", cached: false };
}
