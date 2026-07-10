import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const KW_REGEX = /^[A-Z]{2}\d[A-Z0-9]\/?\d{8}\/?\d$/i;

function normalizeKw(raw: string): string | null {
  const v = (raw || "").trim().toUpperCase().replace(/\s+/g, "");
  // Accept formats with or without slashes
  const compact = v.replace(/\//g, "");
  if (!/^[A-Z]{2}\d[A-Z0-9]\d{8}\d$/.test(compact)) return null;
  return compact; // CMD API uses compact 13-char form
}

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

async function resolveKwForApplication(loanApplicationId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("land_register_number")
    .eq("loan_application_id", loanApplicationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.land_register_number) return null;
  return normalizeKw(data.land_register_number);
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
  if (res.status === 404) return { ok: false, status: 404, error: "Księga nie znaleziona w bazie EKW" };
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


async function pollResults(kw: string, maxMs = 45000): Promise<"processed" | "not_found" | "etl_error" | "timeout"> {
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

/** Read cached KW content for a loan application. Returns null when not yet fetched. */
export const getKwForApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ loanApplicationId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const kw = await resolveKwForApplication(data.loanApplicationId);
    if (!kw) return { hasKw: false as const };
    const { data: row, error } = await supabaseAdmin
      .from("kw_documents")
      .select("status, okladka, dzial_1o, dzial_1s, dzial_2, dzial_3, dzial_4, fetched_at, last_error, ordered_at")
      .eq("kw_number", kw)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { hasKw: true as const, document: row };
  });

/** Admin/operator only. Orders KW download from CMD, polls, fetches HTML, stores in cache. */
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

    if (!process.env.CMD_KW_USER || !process.env.CMD_KW_PASSWORD) {
      throw new Error("Brak konfiguracji CMD KW Engine (CMD_KW_USER / CMD_KW_PASSWORD).");
    }

    const kw = await resolveKwForApplication(data.loanApplicationId);
    if (!kw) throw new Error("Wniosek nie ma poprawnego numeru KW na nieruchomości.");

    // Check cache
    const { data: cached } = await supabaseAdmin
      .from("kw_documents")
      .select("status, fetched_at")
      .eq("kw_number", kw)
      .maybeSingle();
    if (cached && cached.status === "ready" && !data.force) {
      return { ok: true, kwNumber: kw, status: "ready", cached: true };
    }

    // Mark/insert as processing
    await supabaseAdmin.from("kw_documents").upsert(
      {
        kw_number: kw,
        status: "processing",
        ordered_at: new Date().toISOString(),
        ordered_by: userId,
        last_error: null,
      },
      { onConflict: "kw_number" },
    );

    // Try direct HTML first — might already be downloaded earlier.
    // NOTE: 404 z /v3/html oznacza "brak w cache CMD" (nie: brak w EKW),
    // więc też zlecamy pobranie przez /v4/order.
    let res = await fetchKwHtml(kw);
    if (!res.ok) {
      const ord = await orderKw(kw);
      if (ord.status === "NOT_ENQUEUED") {
        await supabaseAdmin
          .from("kw_documents")
          .update({ status: "error", last_error: ord.reason ?? "Nie udało się zlecić pobrania KW" })
          .eq("kw_number", kw);
        throw new Error(ord.reason ?? "Nie udało się zlecić pobrania KW");
      }
      const result = await pollResults(kw);
      if (result === "not_found") {
        await supabaseAdmin
          .from("kw_documents")
          .update({ status: "not_found", last_error: "Księga nie znaleziona w EKW" })
          .eq("kw_number", kw);
        throw new Error("Księga wieczysta nie została odnaleziona w EKW.");
      }
      if (result === "etl_error") {
        await supabaseAdmin
          .from("kw_documents")
          .update({ status: "error", last_error: "Błąd przetwarzania po stronie CMD" })
          .eq("kw_number", kw);
        throw new Error("Błąd przetwarzania KW po stronie CMD KW Engine.");
      }
      if (result === "timeout") {
        return { ok: false, kwNumber: kw, status: "processing", cached: false };
      }
      res = await fetchKwHtml(kw);
    }

    if (res.status === 404) {
      await supabaseAdmin
        .from("kw_documents")
        .update({ status: "not_found", last_error: "404 not found" })
        .eq("kw_number", kw);
      throw new Error("Księga wieczysta nie została odnaleziona w EKW.");
    }
    if (!res.ok || !res.html) {
      await supabaseAdmin
        .from("kw_documents")
        .update({ status: "error", last_error: res.error ?? "Nieznany błąd" })
        .eq("kw_number", kw);
      throw new Error(res.error ?? "Nie udało się pobrać treści KW.");
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

    return { ok: true, kwNumber: kw, status: "ready", cached: false };
  });
