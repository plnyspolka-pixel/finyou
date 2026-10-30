// Webhook narzędzi Ani: A3 (weryfikacja SMS, stan konta) i A2P (oddzwonienie).
// Wywołuje wyłącznie ElevenLabs — nagłówek x-agent-tools-secret (AGENT_TOOLS_SECRET).
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

const json = (b: unknown, status = 200) =>
  Response.json(b, { status, headers: { "cache-control": "no-store" } });

function secretOk(provided: string | null): boolean {
  const secret = process.env.AGENT_TOOLS_SECRET;
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");

async function isE2eConversation(conversationId: string): Promise<boolean> {
  try {
    const { getConversation } = await import("@/lib/elevenlabs-api.server");
    const { isE2eThread } = await import("@/lib/e2e-sandbox");
    const conv: any = await getConversation(conversationId);
    return isE2eThread(conv?.conversation_initiation_client_data?.dynamic_variables?.thread_key);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/ania-investor-tools")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!secretOk(request.headers.get("x-agent-tools-secret"))) {
          return json({ ok: false, error: "unauthorized" }, 401);
        }
        let body: any;
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "invalid_json" }, 400);
        }
        const tool = str(body?.tool, 64);
        const conversationId = str(body?.conversation_id, 128);
        const accessToken = str(body?.investor_access_token, 128) || null;
        // Rozmowa testowa (run_ania_e2e): SMS z kodem i prawdziwy telefon
        // zwrotny tylko się notują. Test rozpoznajemy po numerze testowym
        // albo po `thread_key` rozmowy.
        const { isE2ePhone } = await import("@/lib/e2e-sandbox");
        if (
          (tool === "send_investor_verification_code" || tool === "schedule_investor_callback") &&
          (isE2ePhone(str(body?.phone, 32)) ||
            (conversationId !== "" && (await isE2eConversation(conversationId))))
        ) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("automation_events").insert({
            automation_type: "e2e_tool_call",
            status: "skipped",
            sent_payload: { conversation_id: conversationId, tool, reason: str(body?.reason, 300) },
          });
          return json({ ok: true, test: true, scheduled_at_local: str(body?.requested_at, 64) });
        }
        const t = await import("@/lib/ania-investor-tools.server");
        let result: Record<string, unknown>;
        try {
          if (tool === "send_investor_verification_code") {
            result = await t.sendInvestorVerificationCode(conversationId);
          } else if (tool === "verify_investor_identity") {
            result = await t.verifyInvestorIdentity(conversationId, str(body?.code, 16));
          } else if (tool === "get_investor_account_state") {
            result = await t.getInvestorAccountStateTool(conversationId, accessToken);
          } else if (tool === "schedule_investor_callback") {
            result = await t.scheduleInvestorCallback({
              conversationId,
              phoneVar: str(body?.phone, 32) || null,
              requestedAt: str(body?.requested_at, 64),
              reason: str(body?.reason, 300),
              agentId: str(body?.agent_id, 64),
            });
          } else {
            return json({ ok: false, error: "unknown_tool" }, 400);
          }
        } catch (e) {
          console.error("[ania-investor-tools] error", tool, e);
          result = { ok: false, error: "internal_error" };
        }
        // Audyt bez treści konta i bez kodów.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("automation_events").insert({
            automation_type: "ania_investor_tool",
            status: (result as any).ok ? "sent" : "error",
            sent_payload: { tool, conversation_id: conversationId, panel: Boolean(accessToken) },
            error_message: (result as any).ok ? null : String((result as any).error ?? ""),
          });
        } catch {
          /* noop */
        }
        return json(result);
      },
    },
  },
});
