/**
 * Finance You Resend Receiving API — internal staff only.
 *
 * GET /api/admin/resend-inbox?mode=list&limit=30&after=<resend-email-id>
 * GET /api/admin/resend-inbox?mode=read&id=<resend-email-id>
 * POST /api/admin/resend-inbox
 *   {"after":null,"pageSize":20,"maxPages":1,"senderFilter":"funduszkorona.pl"}
 *
 * Authentication: Authorization: Bearer <logged-in staff Supabase access token>.
 * There is NO public API-key or cron-secret bypass. Never expose Resend keys.
 * This API only receives/reads/imports messages; it cannot send emails.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isInternalStaff } from "@/lib/access/guards.server";
import {
  getReceivedEmail,
  listReceivedEmails,
  ResendReceivingError,
} from "@/lib/resend-receiving.server";
import { synchronizeResendReceived } from "@/lib/resend-received-sync.server";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function authenticate(request: Request): Promise<Response | null> {
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!bearer) return json({ ok: false, error: "Missing staff bearer token" }, 401);

  // Verify the real Supabase access token, not a JWT string decoded locally.
  const { data, error } = await supabaseAdmin.auth.getUser(bearer[1]);
  if (error || !data?.user?.id) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!(await isInternalStaff(data.user.id))) {
    return json({ ok: false, error: "Forbidden — Finance You staff only" }, 403);
  }
  return null;
}

function errorReply(e: unknown) {
  if (e instanceof ResendReceivingError) {
    return json({ ok: false, error: e.message }, e.httpStatus);
  }
  console.error("[resend-inbox-api] error", e instanceof Error ? e.message : "unknown");
  return json({ ok: false, error: "Błąd serwera podczas pobierania poczty Resend." }, 500);
}

export const Route = createFileRoute("/api/admin/resend-inbox")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await authenticate(request);
        if (denied) return denied;
        try {
          const url = new URL(request.url);
          const mode = url.searchParams.get("mode") ?? "list";
          if (mode === "read") {
            const id = url.searchParams.get("id") ?? "";
            return json({ ok: true, email: await getReceivedEmail(id) });
          }
          if (mode !== "list") return json({ ok: false, error: "Unknown mode" }, 400);
          const page = await listReceivedEmails({
            limit: Number(url.searchParams.get("limit") ?? 30),
            after: url.searchParams.get("after") || undefined,
          });
          return json({ ok: true, ...page });
        } catch (e) {
          return errorReply(e);
        }
      },
      POST: async ({ request }) => {
        const denied = await authenticate(request);
        if (denied) return denied;
        try {
          const raw: unknown = await request.json();
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            return json({ ok: false, error: "Expected JSON object" }, 400);
          }
          const body = raw as Record<string, unknown>;
          const after = body.after;
          const pageSize = body.pageSize;
          const maxPages = body.maxPages;
          const senderFilter = body.senderFilter;
          if (after !== undefined && after !== null && typeof after !== "string" ||
              pageSize !== undefined && (typeof pageSize !== "number" || !Number.isInteger(pageSize)) ||
              maxPages !== undefined && (typeof maxPages !== "number" || !Number.isInteger(maxPages)) ||
              senderFilter !== undefined && typeof senderFilter !== "string" ||
              body.dryRun !== undefined && typeof body.dryRun !== "boolean") {
            return json({ ok: false, error: "Invalid request fields" }, 400);
          }
          const result = await synchronizeResendReceived({
            after: typeof after === "string" ? after : undefined,
            pageSize: pageSize as number | undefined,
            maxPages: maxPages as number | undefined,
            senderFilter: senderFilter as string | undefined,
            dryRun: body.dryRun === true,
          });
          return json({ ok: true, ...result });
        } catch (e) {
          return errorReply(e);
        }
      },
    },
  },
});
