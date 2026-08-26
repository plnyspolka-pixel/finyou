// Silnik pobierania treści KW z EasyMKW (mkw.monitoringdanych.io).
//
// EasyMKW działa asynchronicznie: POST /v1/orders zakłada zamówienie i tworzy
// zadania (jobs), które crawler realizuje przez kilka minut. Dlatego:
//  • zamówienie składamy DOKŁADNIE raz na księgę (RPC kw_claim_order pilnuje
//    limitu prób i blokad limitu),
//  • krótko dopytujemy o wynik w tym samym wywołaniu (best effort),
//  • resztę dowozi cron /api/public/hooks/kw-easymkw-poll.
//
// Koszt: 2 kredyty za jedną księgę w jednym formacie (pobieramy tylko `json`).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  easyMkwJobJson,
  easyMkwJobsForKw,
  easyMkwOrderContent,
  hasEasyMkwConfig,
  type EasyMkwJob,
} from "@/lib/easymkw.server";
import type { KwFetchOutcome } from "@/lib/kw-fetch.server";

const CONTENT_STEP = 0;

function pickContentJob(jobs: EasyMkwJob[]): EasyMkwJob | null {
  if (!jobs.length) return null;
  const sorted = [...jobs].sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  return sorted.find((j) => j.stepNumber === CONTENT_STEP) ?? sorted[0] ?? null;
}

/** Zapisuje wynik JSON w cache kw_documents i oznacza księgę jako gotową. */
async function storeJson(kw: string, jobId: string, json: unknown) {
  await supabaseAdmin
    .from("kw_documents")
    .update({
      status: "ready",
      provider: "easymkw",
      easymkw_job_id: jobId,
      easymkw_json: json as never,
      fetched_at: new Date().toISOString(),
      credits_spent: 2,
      last_error: null,
    })
    .eq("kw_number", kw);
}

async function markError(kw: string, message: string) {
  await supabaseAdmin
    .from("kw_documents")
    .update({ status: "error", provider: "easymkw", last_error: message })
    .eq("kw_number", kw);
}

/** Sprawdza stan zadania w EasyMKW i — gdy skończone — dociąga JSON do cache. */
export async function syncEasyMkwJob(kw: string): Promise<KwFetchOutcome> {
  const jobsRes = await easyMkwJobsForKw(kw);
  if (!jobsRes.ok) {
    return {
      ok: false,
      status: "processing",
      cached: false,
      error: jobsRes.error ?? "EasyMKW: nie udało się odczytać statusu zadania.",
    };
  }
  const job = pickContentJob(jobsRes.data?.jobs ?? []);
  if (!job) return { ok: false, status: "processing", cached: false };

  await supabaseAdmin
    .from("kw_documents")
    .update({ provider: "easymkw", easymkw_job_id: job.id, easymkw_order_id: job.orderId ?? null })
    .eq("kw_number", kw);

  if (job.status === "FINISHED") {
    const json = await easyMkwJobJson(job.id);
    if (!json.ok || json.data == null) {
      return {
        ok: false,
        status: "processing",
        cached: false,
        error: json.error ?? "EasyMKW: wynik jeszcze niedostępny.",
      };
    }
    await storeJson(kw, job.id, json.data);
    return { ok: true, status: "ready", cached: false };
  }

  if (job.status === "ERROR" || job.status === "CANCELED") {
    const msg =
      job.status === "CANCELED"
        ? "EasyMKW: zadanie anulowane."
        : "EasyMKW: błąd pobierania księgi (możliwe, że numer KW nie istnieje w EKW).";
    await markError(kw, msg);
    return { ok: false, status: "error", cached: false, error: msg };
  }

  return { ok: false, status: "processing", cached: false };
}

/**
 * Zamawia i (best effort) dowozi treść KW z EasyMKW.
 * Zwraca status zamiast rzucać — wołający decyduje, czy błąd jest fatalny.
 */
export async function fetchAndStoreKwEasyMkw(
  kw: string,
  opts?: { orderedBy?: string | null; force?: boolean; pollMaxMs?: number },
): Promise<KwFetchOutcome> {
  if (!hasEasyMkwConfig()) {
    return {
      ok: false,
      status: "error",
      cached: false,
      error: "Brak konfiguracji EasyMKW (EASYMKW_API_USER / EASYMKW_API_PASSWORD).",
    };
  }

  const { data: cached } = await supabaseAdmin
    .from("kw_documents")
    .select("status, easymkw_job_id, last_error")
    .eq("kw_number", kw)
    .maybeSingle();

  if (cached?.status === "ready" && !opts?.force) {
    return { ok: true, status: "ready", cached: true };
  }

  // Zadanie już zlecone — nie zamawiaj ponownie, tylko dociągnij wynik.
  if (cached?.easymkw_job_id && !opts?.force) {
    const synced = await syncEasyMkwJob(kw);
    if (synced.status !== "processing") return synced;
  }

  const claim = await supabaseAdmin.rpc("kw_claim_order", { _kw: kw, _max_attempts: 2 });
  const grant = (claim.data ?? {}) as {
    granted?: boolean;
    reason?: string;
    block_reason?: string;
    blocked_until?: string;
  };
  if (!grant.granted) {
    if (grant.reason === "ready") return { ok: true, status: "ready", cached: true };
    if (grant.reason === "in_progress") return await syncEasyMkwJob(kw);
    return {
      ok: false,
      status: "error",
      cached: true,
      error:
        grant.block_reason ??
        (grant.reason === "quota_cooldown"
          ? "Wstrzymane zamawianie KW (limit dostawcy) — spróbuj później."
          : (cached?.last_error ?? "Zamawianie tej księgi zostało zablokowane.")),
    };
  }

  const order = await easyMkwOrderContent(kw, "json");
  if (!order.ok) {
    const msg = order.error ?? "EasyMKW: nie udało się złożyć zamówienia.";
    await markError(kw, msg);
    return { ok: false, status: "error", cached: false, error: msg };
  }
  const orderId = (order.data as { id?: string } | null)?.id ?? null;
  await supabaseAdmin
    .from("kw_documents")
    .update({ provider: "easymkw", easymkw_order_id: orderId })
    .eq("kw_number", kw);

  // Krótkie dopytanie w tym samym wywołaniu — resztę dowiezie cron.
  const deadline = Date.now() + (opts?.pollMaxMs ?? 30_000);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const synced = await syncEasyMkwJob(kw);
    if (synced.status !== "processing") return synced;
  }
  return { ok: false, status: "processing", cached: false };
}

/** Cron: dociąga wyniki wszystkich zamówień EasyMKW będących w toku. */
export async function pollPendingEasyMkwJobs(limit = 25) {
  const { data: rows } = await supabaseAdmin
    .from("kw_documents")
    .select("kw_number")
    .eq("status", "processing")
    .eq("provider", "easymkw")
    .order("ordered_at", { ascending: true })
    .limit(limit);

  let ready = 0;
  let pending = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    const out = await syncEasyMkwJob(row.kw_number);
    if (out.status === "ready") ready += 1;
    else if (out.status === "processing") pending += 1;
    else failed += 1;
  }
  return { checked: rows?.length ?? 0, ready, pending, failed };
}
