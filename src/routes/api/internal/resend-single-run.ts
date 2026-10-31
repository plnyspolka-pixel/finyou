/**
 * Single-use service-to-service Resend backfill trigger.
 *
 * This exists to run an OWNER-AUTHORIZED task without obtaining a user's
 * Supabase access token in the assistant session. Jobs are created in
 * integration_settings by a trusted DB administrator only (RLS: administrator).
 * The raw 256-bit token is NEVER stored in the DB; only its SHA-256 digest is.
 *
 * POST body: { job_id: "<UUID>", token: "<64 hex chars>" }
 * A successful request consumes the job before fetching from Resend.
 * Returns no mailbox contents; full results are stored for the owner in DB.
 * No email sending, public search, continuous cron, or general automation.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { synchronizeResendReceived } from "@/lib/resend-received-sync.server";

const db = supabaseAdmin as any;
const JOB_PREFIX = "__resend_single_run__:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[0-9a-f]{64}$/i;

function noStore(status: number): Response {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function executeJob(request: Request): Promise<Response> {
  // Fail closed without ever disclosing a job, token, mailbox contents or key.
  if (Number(request.headers.get("content-length") ?? "0") > 1024) return noStore(413);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore(400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return noStore(400);
  const { job_id: jobId, token } = body as Record<string, unknown>;
  if (typeof jobId !== "string" || !UUID.test(jobId) ||
      typeof token !== "string" || !TOKEN.test(token)) return noStore(400);

  const calculated = createHash("sha256").update(token, "utf8").digest("hex");

  const { data: job, error: readError } = await db
    .from("integration_settings")
    .select("id, integration_name, configuration, is_enabled")
    .eq("id", jobId)
    .maybeSingle();

  if (readError || !job || !String(job.integration_name).startsWith(JOB_PREFIX) ||
      job.is_enabled !== false) return noStore(404);

  const config = job.configuration as Record<string, unknown> | null;
  const expected = String(config?.token_sha256 ?? "");
  const state = config?.state;
  if (!/^[a-f0-9]{64}$/i.test(expected) ||
      !timingSafeEqual(Buffer.from(calculated, "hex"), Buffer.from(expected, "hex")) ||
      state !== "pending") return noStore(404);

  const filter = config?.sender_filter;
  const after = config?.after;
  const pageSize = config?.page_size ?? 30;
  const maxPages = config?.max_pages ?? 5;
  if ((filter !== "" && filter !== "funduszkorona.pl") ||
      (after !== null && after !== undefined &&
        (typeof after !== "string" || !UUID.test(after))) ||
      !Number.isInteger(pageSize) || Number(pageSize) < 1 || Number(pageSize) > 30 ||
      !Number.isInteger(maxPages) || Number(maxPages) < 1 || Number(maxPages) > 5) {
    return noStore(400);
  }

  // Atomic single use; concurrent or repeated requests cannot claim same job.
  const { data: claimed, error: claimError } = await db
    .from("integration_settings")
    .update({
      configuration: { ...config, state: "running", started_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .contains("configuration", { token_sha256: expected, state: "pending" })
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) return noStore(409);

  try {
    const result = await synchronizeResendReceived({
      senderFilter: filter as string,
      after: typeof after === "string" ? after : undefined,
      pageSize: pageSize as number,
      maxPages: maxPages as number,
    });
    const finalState = result.errors.length ? "partial" : "completed";
    const { error: saveError } = await db.from("integration_settings").update({
      configuration: {
        ...config,
        state: finalState,
        finished_at: new Date().toISOString(),
        report: result,
      },
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    if (saveError) {
      console.error("[resend-single-run] Could not persist result", saveError.message);
      return noStore(500);
    }
    return noStore(204);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    await db.from("integration_settings").update({
      configuration: {
        ...config,
        state: "failed",
        finished_at: new Date().toISOString(),
        error: reason.slice(0, 400),
      },
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    return noStore(502);
  }
}

export const Route = createFileRoute("/api/internal/resend-single-run")({
  server: { handlers: { POST: ({ request }) => executeJob(request) } },
});
