// Meta webhook: Messenger (page messages) + Instagram Direct.
// GET = handshake (hub.verify_token), POST = wiadomości + załączniki.
// Weryfikacja HMAC X-Hub-Signature-256 (META_APP_SECRET).
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { upsertLeadFromSource, logLeadCommunication } from "@/lib/lead-comms.server";
import { runAgentTurn } from "@/lib/elevenlabs-text-agent.server";
import { sendMetaMessage } from "@/lib/meta-send.server";
import { downloadAndStore } from "@/lib/inbound-attachments.server";
import { replyToCommentPublic, sendPrivateReplyToComment } from "@/lib/meta-comments.server";

function verifySig(body: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = process.env.META_APP_SECRET;
  if (!secret) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}

async function findOrCreateLeadByPsid(opts: {
  senderId: string;
  platform: "messenger" | "instagram";
}): Promise<string | null> {
  const col = opts.platform === "messenger" ? "messenger_psid" : "instagram_igsid";
  const { data: existing } = await supabaseAdmin
    .from("leads").select("id").eq(col, opts.senderId).maybeSingle();
  if (existing?.id) return existing.id;
  return await upsertLeadFromSource({
    source: opts.platform === "messenger" ? "messenger" : "instagram",
    applicationData: { [col]: opts.senderId },
  }).then(async (id) => {
    if (id) {
      const patch = (col === "messenger_psid"
        ? { messenger_psid: opts.senderId }
        : { instagram_igsid: opts.senderId });
      await supabaseAdmin.from("leads").update(patch).eq("id", id);
    }
    return id;
  });
}

export const Route = createFileRoute("/api/public/meta-messenger-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.META_WEBHOOK_VERIFY_TOKEN ?? process.env.META_APP_SECRET;
        if (mode === "subscribe" && token === expected && challenge) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const raw = await request.text();
        const sig = request.headers.get("x-hub-signature-256");
        if (!verifySig(raw, sig)) {
          console.warn("[meta-messenger-webhook] invalid signature");
          return new Response("Forbidden", { status: 403 });
        }
        let body: any;
        try { body = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }

        for (const entry of body.entry ?? []) {
          const platform: "messenger" | "instagram" =
            body.object === "instagram" ? "instagram" : "messenger";
          const pageId: string | undefined = entry.id;
          for (const ev of entry.messaging ?? []) {
            try {
              await handleMessagingEvent(ev, platform);
            } catch (e) {
              console.error("[meta-messenger-webhook] event error", e);
            }
          }
          for (const change of entry.changes ?? []) {
            try {
              if (change.field === "feed") {
                await handleFeedChange(change.value, pageId);
              }
            } catch (e) {
              console.error("[meta-messenger-webhook] feed change error", e);
            }
          }
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});

async function handleMessagingEvent(ev: any, platform: "messenger" | "instagram") {
  const senderId: string | undefined = ev.sender?.id;
  const msg = ev.message;
  if (!senderId || !msg || msg.is_echo) return;

  const leadId = await findOrCreateLeadByPsid({ senderId, platform });
  if (!leadId) return;

  // 1) Załączniki
  const stored: any[] = [];
  for (const att of msg.attachments ?? []) {
    const url = att.payload?.url;
    if (!url) continue;
    const s = await downloadAndStore({
      leadId,
      url,
      filename: att.payload?.title ?? undefined,
      mime: att.type === "image" ? "image/jpeg" : undefined,
    });
    if (s) stored.push({ ...s, source_type: att.type });
  }

  const userText = (msg.text ?? "").trim();
  const attachmentsSummary = stored.length
    ? stored.map((a) => `- ${a.source_type ?? "file"}: ${a.name}`).join("\n")
    : null;

  // 2) Log inbound
  await logLeadCommunication({
    leadId,
    channel: platform === "messenger" ? "messenger" : "messenger", // schemat dopuszcza 'messenger'
    direction: "inbound",
    content: userText || (attachmentsSummary ? "[załącznik]" : ""),
    externalId: msg.mid ?? null,
    metadata: { platform, sender_id: senderId },
    status: "received",
  });
  if (stored.length) {
    await supabaseAdmin.from("lead_communications").update({ attachments: stored as any })
      .eq("external_id", msg.mid ?? "");
  }

  if (!userText && !stored.length) return;

  // 3) Odpowiedź agenta
  const agent = await runAgentTurn({
    leadId,
    channel: platform,
    userMessage: userText || "[Klient przesłał załącznik]",
    attachmentsSummary,
  });

  let replyText = agent.reply;
  const linkCall = agent.toolCalls.find((c) => c.name === "send_application_link");
  if (linkCall?.result?.link && !replyText.includes(linkCall.result.link)) {
    replyText += `\n\nLink do dokończenia wniosku: ${linkCall.result.link}`;
  }

  const send = await sendMetaMessage({ recipientId: senderId, text: replyText, platform });

  await logLeadCommunication({
    leadId,
    channel: "messenger",
    direction: "outbound",
    content: replyText,
    externalId: send.messageId ?? null,
    metadata: { platform, sender_id: senderId, tool_calls: agent.toolCalls },
    status: send.ok ? "sent" : "error",
    errorMessage: send.ok ? null : send.error,
    agentId: process.env.ELEVENLABS_TEXT_AGENT_ID ?? null,
  });
}
