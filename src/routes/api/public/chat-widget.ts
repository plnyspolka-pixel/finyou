// Publiczny endpoint czatu na stronie (landing). Kanał komunikacji
// przychodzącej "chat" — traktowany identycznie jak Messenger / e-mail:
// tworzy/łączy leada, loguje wiadomość w lead_communications i odpowiada
// tym samym agentem (runAgentTurn) co pozostałe kanały DM.
//
// GET  ?sessionId=... → historia rozmowy (do przywrócenia widgetu po odświeżeniu)
// POST { sessionId, message, name?, email?, phone? } → odpowiedź agenta
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { upsertLeadFromSource, logLeadCommunication } from "@/lib/lead-comms.server";
import { runAgentTurn } from "@/lib/elevenlabs-text-agent.server";
import { enrichLeadFromInbound } from "@/lib/lead-enrichment.server";
import { normalizePolishPhone } from "@/lib/phone";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const PostSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(4000),
  name: z.string().max(200).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  source: z.string().max(120).optional().nullable(),
});

/** Znajdź leada powiązanego z tą sesją czatu (klucz w application_data). */
async function findLeadBySession(sessionId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("application_data->>chat_session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function loadHistory(sessionId: string) {
  const leadId = await findLeadBySession(sessionId);
  if (!leadId) return [];
  const { data } = await supabaseAdmin
    .from("lead_communications")
    .select("id, direction, content, created_at, metadata")
    .eq("lead_id", leadId)
    .eq("channel", "chat")
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []).map((m) => {
    const meta = (m.metadata ?? {}) as Record<string, any>;
    const role =
      m.direction === "inbound" ? "user" : meta.sent_by ? "staff" : "assistant";
    return { id: m.id, role, content: m.content ?? "", created_at: m.created_at };
  });
}

export const Route = createFileRoute("/api/public/chat-widget")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const sessionId = url.searchParams.get("sessionId") ?? "";
          if (!z.string().uuid().safeParse(sessionId).success) {
            return new Response(JSON.stringify({ ok: true, messages: [] }), {
              status: 200,
              headers: corsHeaders,
            });
          }
          const messages = await loadHistory(sessionId);
          return new Response(JSON.stringify({ ok: true, messages }), {
            status: 200,
            headers: corsHeaders,
          });
        } catch (e) {
          console.error("[chat-widget] GET error", e);
          return new Response(JSON.stringify({ ok: false, messages: [] }), {
            status: 500,
            headers: corsHeaders,
          });
        }
      },

      POST: async ({ request }) => {
        try {
          const json = await request.json();
          const data = PostSchema.parse(json);

          // 1) Lead: znajdź po sesji lub utwórz nowego (kanał "chat").
          let leadId = await findLeadBySession(data.sessionId);
          if (!leadId) {
            const parts = (data.name ?? "").trim().split(/\s+/).filter(Boolean);
            const { normalized } = normalizePolishPhone(data.phone ?? null);
            leadId = await upsertLeadFromSource({
              source: data.source ?? "chat",
              firstName: parts[0] ?? null,
              lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
              email: data.email ?? null,
              phoneRaw: data.phone ?? null,
              phoneNormalized: normalized,
              applicationData: { chat_session_id: data.sessionId },
            });
            // upsertLeadFromSource mógł dopasować istniejącego leada po e-mailu/telefonie
            // — dopisz mu identyfikator sesji, żeby kolejne wiadomości trafiały tam.
            if (leadId) {
              const { data: lead } = await supabaseAdmin
                .from("leads")
                .select("application_data")
                .eq("id", leadId)
                .maybeSingle();
              const appData = (lead?.application_data ?? {}) as Record<string, any>;
              if (appData.chat_session_id !== data.sessionId) {
                await supabaseAdmin
                  .from("leads")
                  .update({ application_data: { ...appData, chat_session_id: data.sessionId } })
                  .eq("id", leadId);
              }
            }
          }
          if (!leadId) {
            return new Response(
              JSON.stringify({ ok: false, error: "Nie udało się rozpocząć rozmowy." }),
              { status: 500, headers: corsHeaders },
            );
          }

          // 2) Log wiadomości przychodzącej
          await logLeadCommunication({
            leadId,
            channel: "chat",
            direction: "inbound",
            content: data.message,
            status: "received",
            metadata: { chat_session_id: data.sessionId, source: data.source ?? "landing" },
          });

          try {
            await enrichLeadFromInbound({ leadId, text: data.message, hasAttachments: false });
          } catch (e) {
            console.error("[chat-widget] enrichment error", e);
          }

          // 3) Odpowiedź agenta (ten sam prompt co Messenger/IG/email)
          const agent = await runAgentTurn({
            leadId,
            channel: "chat",
            userMessage: data.message,
          });

          let replyText = agent.reply;
          const linkCall = agent.toolCalls.find((c) => c.name === "send_application_link");
          if (linkCall?.result?.link && !replyText.includes(linkCall.result.link)) {
            replyText += `\n\nLink do dokończenia wniosku: ${linkCall.result.link}`;
          }

          // 4) Log odpowiedzi (kanał "chat")
          await logLeadCommunication({
            leadId,
            channel: "chat",
            direction: "outbound",
            content: replyText,
            status: "sent",
            metadata: { chat_session_id: data.sessionId, tool_calls: agent.toolCalls },
            agentId: process.env.ELEVENLABS_TEXT_AGENT_ID ?? null,
          });

          return new Response(
            JSON.stringify({ ok: true, reply: replyText, sessionId: data.sessionId }),
            { status: 200, headers: corsHeaders },
          );
        } catch (e) {
          if (e instanceof z.ZodError) {
            return new Response(
              JSON.stringify({ ok: false, error: "Nieprawidłowe dane.", issues: e.issues }),
              { status: 400, headers: corsHeaders },
            );
          }
          console.error("[chat-widget] POST error", e);
          return new Response(
            JSON.stringify({ ok: false, error: "Wystąpił błąd. Spróbuj ponownie później." }),
            { status: 500, headers: corsHeaders },
          );
        }
      },
    },
  },
});
