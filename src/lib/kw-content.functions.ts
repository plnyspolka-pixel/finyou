import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extractKwNumbers, kwToCompact, normalizeKwNumber } from "@/lib/kw-number";

function authHeader(): string {
  const u = process.env.CMD_KW_USER ?? "";
  const p = process.env.CMD_KW_PASSWORD ?? "";
  return "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
}

function baseUrl(): string {
  const raw = (process.env.CMD_KW_BASE_URL ?? "https://dev.monitoringdanych.io:4444").replace(/\/+$/, "");
  // Strip accidental Swagger/docs suffix — API root should not include /docs.
  return raw.replace(/\/(docs|swagger|swagger-ui|openapi)(\/.*)?$/i, "");
}

export function kwEngineConfigured(): boolean {
  return !!process.env.CMD_KW_USER && !!process.env.CMD_KW_PASSWORD;
}

function decodeMaybeBase64(v: unknown): string | null {
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

/**
 * Zwraca WSZYSTKIE numery KW wniosku (kanoniczne `XXXX/DDDDDDDD/C`):
 * - ze wszystkich nieruchomości wniosku (nie tylko pierwszej),
 * - z pola głównego `land_register_number` (także z zanieczyszczonych,
 *   sklejonych wartości historycznych — extractKwNumbers),
 * - z tablicy `additional_land_register_numbers`.
 */
export async function resolveKwsForApplication(loanApplicationId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("land_register_number, additional_land_register_numbers")
    .eq("loan_application_id", loanApplicationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const out: string[] = [];
  for (const row of data ?? []) {
    for (const kw of extractKwNumbers(row.land_register_number)) {
      if (!out.includes(kw)) out.push(kw);
    }
    for (const extra of (row.additional_land_register_numbers as string[] | null) ?? []) {
      const norm = normalizeKwNumber(extra) ?? extractKwNumbers(extra)[0] ?? null;
      if (norm && !out.includes(norm)) out.push(norm);
    }
  }
  return out;
}

async function fetchKwHtml(kwCompact: string): Promise<{
  ok: boolean;
  status: number;
  html?: any;
  billIn?: number;
  billOut?: number;
  error?: string;
}> {
  const res = await fetch(`${baseUrl()}/v3/html/${encodeURIComponent(kwCompact)}?odpis=aktualny`, {
    headers: { Authorization: authHeader() },
  });
  const billIn = Number(res.headers.get("x-bill-in") ?? "0") || undefined;
  const billOut = Number(res.headers.get("x-bill-out") ?? "0") || undefined;
  if (res.status === 200) {
    const html = await res.json();
    return { ok: true, status: 200, html, billIn, billOut };
  }
  if (res.status === 404) return { ok: false, status: 404, error: "Księga nie znaleziona w bazie EKW" };
  const text = await res.text().catch(() => "");
  return { ok: false, status: res.status, error: text || `HTTP ${res.status}` };
}

async function orderKw(kwCompact: string): Promise<{ status: string; reason?: string }> {
  const url = `${baseUrl()}/v4/order?crawlingType=ONLY_CURRENT_VIEW`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "text/plain",
      Accept: "application/json",
    },
    body: kwCompact,
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

async function pollResults(kwCompact: string, maxMs = 45000): Promise<"processed" | "not_found" | "etl_error" | "timeout"> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 4000));
    const res = await fetch(`${baseUrl()}/v4/results?crawlingType=ONLY_CURRENT_VIEW`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "text/plain" },
      body: kwCompact,
    });
    if (!res.ok) continue;
    const j: any = await res.json();
    if (j?.processed?.includes(kwCompact) || j?.downloaded?.includes(kwCompact)) return "processed";
    if (j?.notFound?.includes(kwCompact)) return "not_found";
    if (j?.etlError?.includes(kwCompact)) return "etl_error";
  }
  return "timeout";
}

export type KwFetchOutcome = {
  kwNumber: string;
  ok: boolean;
  status: "ready" | "processing" | "not_found" | "error";
  cached?: boolean;
  error?: string;
};

/**
 * Rdzeń pobierania treści JEDNEJ księgi (kanoniczny numer z ukośnikami).
 * Używany przez przycisk w panelu (fetchKwForApplication) oraz automat
 * (hook kw-autofetch). `poll=false` — tryb asynchroniczny: zleca pobranie
 * i wraca (kolejny tick crona odbierze gotowy HTML), bez blokowania na 45 s.
 */
export async function fetchKwByNumberCore(
  kwCanonical: string,
  opts?: { orderedBy?: string | null; force?: boolean; poll?: boolean },
): Promise<KwFetchOutcome> {
  const kw = normalizeKwNumber(kwCanonical);
  const compact = kw ? kwToCompact(kw) : null;
  if (!kw || !compact) {
    return { kwNumber: kwCanonical, ok: false, status: "error", error: "Nieprawidłowy numer KW" };
  }
  const poll = opts?.poll !== false;

  // Cache — dokumenty mogły historycznie być zapisane w formie zwartej.
  const { data: cached } = await supabaseAdmin
    .from("kw_documents")
    .select("kw_number, status, fetched_at, ordered_at")
    .in("kw_number", [kw, compact])
    .order("fetched_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (cached && cached.status === "ready" && !opts?.force) {
    return { kwNumber: kw, ok: true, status: "ready", cached: true };
  }
  // Świeżo zlecone i wciąż w toku — nie dublujemy zlecenia (i kosztów).
  if (
    cached &&
    cached.status === "processing" &&
    !opts?.force &&
    cached.ordered_at &&
    Date.now() - new Date(cached.ordered_at).getTime() < 24 * 3600_000
  ) {
    // Spróbuj tylko odebrać gotowy HTML (mogło się już pobrać po stronie CMD).
    const ready = await fetchKwHtml(compact);
    if (!ready.ok) return { kwNumber: kw, ok: false, status: "processing" };
    return storeKwHtml(kw, ready);
  }

  // Mark/insert as processing (kanoniczny numer jako klucz).
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
  let res = await fetchKwHtml(compact);
  if (!res.ok) {
    const ord = await orderKw(compact);
    if (ord.status === "NOT_ENQUEUED") {
      const msg = ord.reason ?? "Nie udało się zlecić pobrania KW";
      await supabaseAdmin
        .from("kw_documents")
        .update({ status: "error", last_error: msg })
        .eq("kw_number", kw);
      return { kwNumber: kw, ok: false, status: "error", error: msg };
    }
    if (!poll) {
      // Tryb asynchroniczny (cron): zlecone, odbiór przy kolejnym ticku.
      return { kwNumber: kw, ok: false, status: "processing" };
    }
    const result = await pollResults(compact);
    if (result === "not_found") {
      await supabaseAdmin
        .from("kw_documents")
        .update({ status: "not_found", last_error: "Księga nie znaleziona w EKW" })
        .eq("kw_number", kw);
      return { kwNumber: kw, ok: false, status: "not_found", error: "Księga wieczysta nie została odnaleziona w EKW." };
    }
    if (result === "etl_error") {
      await supabaseAdmin
        .from("kw_documents")
        .update({ status: "error", last_error: "Błąd przetwarzania po stronie CMD" })
        .eq("kw_number", kw);
      return { kwNumber: kw, ok: false, status: "error", error: "Błąd przetwarzania KW po stronie CMD KW Engine." };
    }
    if (result === "timeout") {
      return { kwNumber: kw, ok: false, status: "processing" };
    }
    res = await fetchKwHtml(compact);
  }

  if (res.status === 404) {
    await supabaseAdmin
      .from("kw_documents")
      .update({ status: "not_found", last_error: "404 not found" })
      .eq("kw_number", kw);
    return { kwNumber: kw, ok: false, status: "not_found", error: "Księga wieczysta nie została odnaleziona w EKW." };
  }
  if (!res.ok || !res.html) {
    const msg = res.error ?? "Nie udało się pobrać treści KW.";
    await supabaseAdmin
      .from("kw_documents")
      .update({ status: "error", last_error: msg })
      .eq("kw_number", kw);
    return { kwNumber: kw, ok: false, status: "error", error: msg };
  }
  return storeKwHtml(kw, res);
}

async function storeKwHtml(
  kw: string,
  res: { html?: any; billIn?: number; billOut?: number },
): Promise<KwFetchOutcome> {
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
  return { kwNumber: kw, ok: true, status: "ready", cached: false };
}

export type KwDocumentView = {
  kwNumber: string;
  status: string | null;
  okladka: string | null;
  dzial_1o: string | null;
  dzial_1s: string | null;
  dzial_2: string | null;
  dzial_3: string | null;
  dzial_4: string | null;
  fetched_at: string | null;
  last_error: string | null;
  ordered_at: string | null;
};

/** Read cached KW content for a loan application — WSZYSTKIE księgi wniosku. */
export const getKwForApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ loanApplicationId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const kws = await resolveKwsForApplication(data.loanApplicationId);
    if (kws.length === 0) return { hasKw: false as const, documents: [] as KwDocumentView[] };
    // Dokumenty mogły historycznie być zapisane w formie zwartej — szukamy obu.
    const keys = kws.flatMap((k) => [k, kwToCompact(k)!]);
    const { data: rows, error } = await supabaseAdmin
      .from("kw_documents")
      .select("kw_number, status, okladka, dzial_1o, dzial_1s, dzial_2, dzial_3, dzial_4, fetched_at, last_error, ordered_at")
      .in("kw_number", keys);
    if (error) throw new Error(error.message);
    const byKw = new Map<string, any>();
    for (const r of rows ?? []) {
      const norm = normalizeKwNumber(r.kw_number) ?? r.kw_number;
      const prev = byKw.get(norm);
      if (!prev || (r.fetched_at && (!prev.fetched_at || r.fetched_at > prev.fetched_at))) byKw.set(norm, r);
    }
    const documents: KwDocumentView[] = kws.map((kw) => {
      const row = byKw.get(kw);
      if (!row) {
        return {
          kwNumber: kw, status: null, okladka: null, dzial_1o: null, dzial_1s: null,
          dzial_2: null, dzial_3: null, dzial_4: null, fetched_at: null, last_error: null, ordered_at: null,
        };
      }
      return {
        kwNumber: kw,
        status: row.status,
        okladka: decodeMaybeBase64(row.okladka),
        dzial_1o: decodeMaybeBase64(row.dzial_1o),
        dzial_1s: decodeMaybeBase64(row.dzial_1s),
        dzial_2: decodeMaybeBase64(row.dzial_2),
        dzial_3: decodeMaybeBase64(row.dzial_3),
        dzial_4: decodeMaybeBase64(row.dzial_4),
        fetched_at: row.fetched_at,
        last_error: row.last_error,
        ordered_at: row.ordered_at,
      };
    });
    return { hasKw: true as const, documents };
  });

/** Admin/operator only. Pobiera treść WSZYSTKICH ksiąg wniosku z CMD. */
export const fetchKwForApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      loanApplicationId: z.string().uuid(),
      force: z.boolean().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Role check
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
    const allowed = (roles ?? []).some((r) => r.role === "administrator" || r.role === "operator");
    if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator/operator).");

    if (!kwEngineConfigured()) {
      throw new Error("Brak konfiguracji CMD KW Engine (CMD_KW_USER / CMD_KW_PASSWORD).");
    }

    const kws = await resolveKwsForApplication(data.loanApplicationId);
    if (kws.length === 0) throw new Error("Wniosek nie ma poprawnego numeru KW na nieruchomości.");

    const results: KwFetchOutcome[] = [];
    for (const kw of kws) {
      results.push(await fetchKwByNumberCore(kw, { orderedBy: userId, force: data.force }));
    }
    const okAll = results.every((r) => r.ok);
    const firstErr = results.find((r) => !r.ok && r.error)?.error;
    return { ok: okAll, results, error: okAll ? undefined : firstErr };
  });
