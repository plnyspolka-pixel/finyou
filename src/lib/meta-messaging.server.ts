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
import { enrichLeadFromInbound } from "@/lib/lead-enrichment.server";
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
      // Best-effort: imię/nazwisko z profilu Graph — żeby skrzynka nie
      // pokazywała „Nieznany klient" dla każdego DM-a.
      void enrichLeadNameFromGraph(id, opts.senderId, opts.platform).catch(() => {});
    }
    return id;
  });
}

/** Pobiera first_name/last_name nadawcy z Graph API i uzupełnia lead (jeśli puste). */
async function enrichLeadNameFromGraph(
  leadId: string,
  senderId: string,
  platform: "messenger" | "instagram",
): Promise<void> {
  const token =
    (platform === "instagram" ? process.env.META_IG_PAGE_ACCESS_TOKEN : undefined) ??
    process.env.META_PAGE_ACCESS_TOKEN ??
    process.env.META_ACCESS_TOKEN;
  if (!token) return;
  const fields = platform === "instagram" ? "name,username" : "first_name,last_name";
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(senderId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`,
  );
  if (!res.ok) return;
  const p: any = await res.json().catch(() => null);
  if (!p) return;
  const first = p.first_name ?? (p.name ? String(p.name).split(/\s+/)[0] : null) ?? p.username ?? null;
  const last = p.last_name ?? (p.name ? String(p.name).split(/\s+/).slice(1).join(" ") || null : null);
  if (!first && !last) return;
  const { data: lead } = await supabaseAdmin
    .from("leads").select("first_name, last_name").eq("id", leadId).maybeSingle();
  const patch: { first_name?: string; last_name?: string } = {};
  if (first && !lead?.first_name) patch.first_name = first;
  if (last && !lead?.last_name) patch.last_name = last;
  if (Object.keys(patch).length > 0) {
    await supabaseAdmin.from("leads").update(patch).eq("id", leadId);
  }
}

/** Czy zdarzenie o tym external_id już przetworzyliśmy? (Meta ponawia webhooki
 *  po timeout/5xx — bez tej blokady klient dostawał zdublowane odpowiedzi bota.) */
async function alreadyProcessed(externalId: string | null | undefined): Promise<boolean> {
  if (!externalId) return false;
  const { data } = await supabaseAdmin
    .from("lead_communications")
    .select("id")
    .eq("external_id", externalId)
    .eq("direction", "inbound")
    .limit(1)
    .maybeSingle();
  return !!data?.id;
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

  // Idempotencja: Meta ponawia dostarczenie webhooka, gdy nie zdążymy z 200.
  if (await alreadyProcessed(msg.mid)) return;

  const leadId = await findOrCreateLeadByPsid({ senderId, platform });
  if (!leadId) return;

  // 1) Załączniki — pobieramy bajty z fbcdn i trwale hostujemy w Storage
  //    (URL-e fbcdn wygasają). MIME bierzemy z nagłówka odpowiedzi.
  const stored: any[] = [];
  for (const att of msg.attachments ?? []) {
    const url = att.payload?.url;
    if (!url) continue;
    const s = await downloadAndStore({
      leadId,
      url,
      filename: att.payload?.title ?? undefined,
    });
    if (s) stored.push({ ...s, source_type: att.type });
    else console.error("[messenger] attachment download failed", { leadId, type: att.type });
  }

  const userText = (msg.text ?? "").trim();
  const attachmentsSummary = stored.length
    ? stored.map((a) => `- ${a.source_type ?? "file"}: ${a.name}`).join("\n")
    : null;

  // 2) Log inbound — załączniki zapisane od razu przy insercie (wcześniej był
  //    kruchy UPDATE po external_id, który przy pustym `mid` psuł cudze wiersze).
  await logLeadCommunication({
    leadId,
    channel: platform,
    direction: "inbound",
    content: userText || (attachmentsSummary ? "[załącznik]" : ""),
    externalId: msg.mid ?? null,
    attachments: stored.length ? stored : null,
    metadata: { platform, sender_id: senderId },
    status: "received",
  });
  if (stored.length) {
    try {
      await attachStoredToClientDocuments({ leadId, stored, sourceLabel: platform });
    } catch (e) { console.error("[messenger] attach to client docs", e); }
  }
  try {
    await enrichLeadFromInbound({ leadId, text: userText, hasAttachments: stored.length > 0 });
  } catch (e) { console.error("[messenger] enrichment error", e); }

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
    channel: platform,
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
  if (pageId && fromId === pageId) return;
  // Idempotencja przy ponowionych dostarczeniach webhooka.
  if (await alreadyProcessed(commentId)) return;

  const leadId = await findOrCreateLeadByPsid({ senderId: fromId, platform: "messenger" });
  if (!leadId) return;

  if (fromName) {
    const { data: existing } = await supabaseAdmin
      .from("leads").select("first_name").eq("id", leadId).maybeSingle();
    if (!existing?.first_name) {
      const first = fromName.split(/\s+/)[0];
      await supabaseAdmin.from("leads").update({ first_name: first }).eq("id", leadId);
    }
  }

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
