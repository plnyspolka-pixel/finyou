// Publiczny endpoint czatu dla inwestorów instytucjonalnych (/dla-inwestora).
// Kanał komunikacji "chat_inwestor" — osobny od kanałów pożyczkobiorcy, żeby
// rozmowy i historia nie mieszały się z botem klienckim. Odpowiada ten sam
// silnik (runAgentTurn) w wariancie "inwestor": własny prompt (text_agent_settings
// id=2), tools kwalifikacji B2B, RAG filtrowany po audience.
//
// GET  ?sessionId=... → historia rozmowy (do przywrócenia widgetu po odświeżeniu)
// POST { sessionId, message, name?, email?, phone? } → odpowiedź agenta
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { upsertLeadFromSource, logLeadCommunication } from "@/lib/lead-comms.server";
import { runAgentTurn } from "@/lib/elevenlabs-text-agent.server";
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

/** Znajdź leada powiązanego z tą sesją czatu inwestorskiego. */
async function findLeadBySession(sessionId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("application_data->>investor_chat_session_id", sessionId)
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
    .eq("channel", "chat_inwestor")
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []).map((m) => {
    const meta = (m.metadata ?? {}) as Record<string, any>;
    const role = m.direction === "inbound" ? "user" : meta.sent_by ? "staff" : "assistant";
    return { id: m.id, role, content: m.content ?? "", created_at: m.created_at };
  });
}

export const Route = createFileRoute("/api/public/investor-chat-widget")({
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
          console.error("[investor-chat-widget] GET error", e);
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

          // 1) Lead: znajdź po sesji lub utwórz nowego (źródło "chat_inwestor").
          let leadId = await findLeadBySession(data.sessionId);
          if (!leadId) {
            const parts = (data.name ?? "").trim().split(/\s+/).filter(Boolean);
            const { normalized } = normalizePolishPhone(data.phone ?? null);
            leadId = await upsertLeadFromSource({
              source: data.source ?? "chat_inwestor",
              firstName: parts[0] ?? null,
              lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
              email: data.email ?? null,
              phoneRaw: data.phone ?? null,
              phoneNormalized: normalized,
              applicationData: { investor_chat_session_id: data.sessionId },
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
              if (appData.investor_chat_session_id !== data.sessionId) {
                await supabaseAdmin
                  .from("leads")
                  .update({
                    application_data: {
                      ...appData,
                      investor_chat_session_id: data.sessionId,
                    },
                  })
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
            channel: "chat_inwestor",
            direction: "inbound",
            content: data.message,
            status: "received",
            metadata: {
              investor_chat_session_id: data.sessionId,
              source: data.source ?? "dla-inwestora",
            },
          });

          // 3) Odpowiedź agenta w wariancie inwestorskim. Bez enrichLeadFromInbound
          //    — ekstrakcja danych wniosku pożyczkowego nie dotyczy inwestora.
          const agent = await runAgentTurn({
            leadId,
            channel: "chat_inwestor",
            userMessage: data.message,
            variant: "inwestor",
          });

          // 4) Log odpowiedzi (kanał "chat_inwestor")
          await logLeadCommunication({
            leadId,
            channel: "chat_inwestor",
            direction: "outbound",
            content: agent.reply,
            status: "sent",
            metadata: { investor_chat_session_id: data.sessionId, tool_calls: agent.toolCalls },
            agentId: process.env.ELEVENLABS_TEXT_AGENT_ID ?? null,
          });

          return new Response(
            JSON.stringify({ ok: true, reply: agent.reply, sessionId: data.sessionId }),
            { status: 200, headers: corsHeaders },
          );
        } catch (e) {
          if (e instanceof z.ZodError) {
            return new Response(
              JSON.stringify({ ok: false, error: "Nieprawidłowe dane.", issues: e.issues }),
              { status: 400, headers: corsHeaders },
            );
          }
          console.error("[investor-chat-widget] POST error", e);
          return new Response(
            JSON.stringify({ ok: false, error: "Wystąpił błąd. Spróbuj ponownie później." }),
            { status: 500, headers: corsHeaders },
          );
        }
      },
    },
  },
});
