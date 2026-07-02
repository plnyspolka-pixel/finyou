// Wspólna logika obsługi zdarzeń Meta dla Messengera / Instagram Direct
// oraz komentarzy pod postami fanpage'a (feed). Wydzielone z webhooka, aby
// oba endpointy Meta (meta-messenger-webhook i meta-leads-webhook) mogły
// obsłużyć te same zdarzenia — Facebook dostarcza wszystko na JEDEN URL,
// więc niezależnie od tego, który webhook jest skonfigurowany, bot zadziała.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { upsertLeadFromSource, logLeadCommunication } from "@/lib/lead-comms.server";
import { runAgentTurn } from "@/lib/elevenlabs-text-agent.server";
import { sendMetaMessage } from "@/lib/meta-send.server";
import { downloadAndStore, attachStoredToClientDocuments } from "@/lib/inbound-attachments.server";
import { replyToCommentPublic, sendPrivateReplyToComment } from "@/lib/meta-comments.server";

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

/**
 * Przetwarza całe body webhooka Meta i obsługuje zdarzenia wiadomości
 * (entry.messaging) oraz komentarzy (entry.changes[].field === "feed").
 * Leadgen (entry.changes[].field === "leadgen") jest ignorowany tutaj —
 * obsługuje go meta-leads-webhook. Dzięki temu można wywołać tę funkcję
 * z obu endpointów bez podwójnego przetwarzania leadów.
 */
export async function handleMetaMessagingBody(body: any): Promise<void> {
  const platform: "messenger" | "instagram" =
    body?.object === "instagram" ? "instagram" : "messenger";
  for (const entry of body?.entry ?? []) {
    const pageId: string | undefined = entry.id;
    for (const ev of entry.messaging ?? []) {
      try {
        await handleMessagingEvent(ev, platform);
      } catch (e) {
        console.error("[meta-messaging] event error", e);
      }
    }
    for (const change of entry.changes ?? []) {
      try {
        if (change.field === "feed") {
          await handleFeedChange(change.value, pageId);
        }
      } catch (e) {
        console.error("[meta-messaging] feed change error", e);
      }
    }
  }
}

export async function handleMessagingEvent(ev: any, platform: "messenger" | "instagram") {
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
    try {
      await attachStoredToClientDocuments({ leadId, stored, sourceLabel: platform });
    } catch (e) { console.error("[messenger] attach to client docs", e); }
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

// Obsługa komentarzy pod postami fanpage'a (event: changes[].field === "feed").
export async function handleFeedChange(value: any, pageId: string | undefined) {
  if (!value) return;
  if (value.item !== "comment" || value.verb !== "add") return;

  const commentId: string | undefined = value.comment_id;
  const fromId: string | undefined = value.from?.id;
  const fromName: string | undefined = value.from?.name;
  const text: string = (value.message ?? "").trim();
  const postId: string | undefined = value.post_id;

  if (!commentId || !fromId) return;
  // Skip własne komentarze strony, żeby uniknąć pętli
  if (pageId && fromId === pageId) return;

  // Lead po PSID (komentujący ma page-scoped ID = ten sam co PSID Messenger)
  const leadId = await findOrCreateLeadByPsid({ senderId: fromId, platform: "messenger" });
  if (!leadId) return;

  // Uzupełnij imię jeśli brak
  if (fromName) {
    const { data: existing } = await supabaseAdmin
      .from("leads").select("first_name").eq("id", leadId).maybeSingle();
    if (!existing?.first_name) {
      const first = fromName.split(/\s+/)[0];
      await supabaseAdmin.from("leads").update({ first_name: first }).eq("id", leadId);
    }
  }

  // Log inbound komentarza
  await logLeadCommunication({
    leadId,
    channel: "messenger",
    direction: "inbound",
    content: text || "[pusty komentarz]",
    externalId: commentId,
    metadata: { platform: "messenger", kind: "fb_comment", comment_id: commentId, post_id: postId, from_id: fromId, from_name: fromName },
    status: "received",
  });

  if (!text) return;

  // Wygeneruj odpowiedź agenta
  const agent = await runAgentTurn({
    leadId,
    channel: "messenger",
    userMessage: text,
    attachmentsSummary: null,
  });

  let fullReply = agent.reply;
  const linkCall = agent.toolCalls.find((c) => c.name === "send_application_link");
  if (linkCall?.result?.link && !fullReply.includes(linkCall.result.link)) {
    fullReply += `\n\nLink do dokończenia wniosku: ${linkCall.result.link}`;
  }

  // 1) Publiczna krótka odpowiedź pod komentarzem
  const firstName = fromName?.split(/\s+/)[0];
  const publicAck = `${firstName ? `Cześć ${firstName}! ` : "Cześć! "}Napisałem do Ciebie w wiadomości prywatnej 👋`;
  const pub = await replyToCommentPublic({ commentId, text: publicAck });
  await logLeadCommunication({
    leadId,
    channel: "messenger",
    direction: "outbound",
    content: publicAck,
    externalId: pub.id ?? null,
    metadata: { platform: "messenger", kind: "fb_comment_reply", comment_id: commentId, post_id: postId },
    status: pub.ok ? "sent" : "error",
    errorMessage: pub.ok ? null : pub.error,
  });

  // 2) Pełna odpowiedź w prywatnej wiadomości (Private Reply)
  const pm = await sendPrivateReplyToComment({ commentId, text: fullReply });
  await logLeadCommunication({
    leadId,
    channel: "messenger",
    direction: "outbound",
    content: fullReply,
    externalId: pm.messageId ?? null,
    metadata: { platform: "messenger", kind: "fb_comment_private_reply", comment_id: commentId, post_id: postId, tool_calls: agent.toolCalls },
    status: pm.ok ? "sent" : "error",
    errorMessage: pm.ok ? null : pm.error,
    agentId: process.env.ELEVENLABS_TEXT_AGENT_ID ?? null,
  });
}
