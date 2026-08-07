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
import { fetchMetaUserProfile } from "@/lib/meta-profile.server";
import { ocrLeadAttachmentsAndEnrich, fillLeadNameFromKw } from "@/lib/lead-doc-intel.server";
import { shouldSkipMessengerAutoReply } from "@/lib/bot-loop-guard.server";
import { captureReferralFromEvent } from "@/lib/messenger-attribution.server";

async function findOrCreateLeadByPsid(opts: {
  senderId: string;
  platform: "messenger" | "instagram";
}): Promise<string | null> {
  const col = opts.platform === "messenger" ? "messenger_psid" : "instagram_igsid";
  // 1) Istniejący lead z tym PSID/IGSID
  const { data: existing } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq(col, opts.senderId)
    .maybeSingle();
  if (existing?.id) return existing.id;

  // 2) Spróbuj scalić z istniejącym leadem po imieniu i nazwisku (np. Meta ad
  //    lead ma first_name+last_name, ale jeszcze bez PSID). Dzięki temu
  //    rozmowa z Messengera trafia do tego samego leada co reklama, a nie
  //    tworzy osobnego duplikatu.
  try {
    const profile = await fetchMetaUserProfile({ userId: opts.senderId, platform: opts.platform });
    const fn = profile?.firstName?.trim();
    const ln = profile?.lastName?.trim();
    if (fn && ln) {
      const { data: match } = await supabaseAdmin
        .from("leads")
        .select("id")
        .is(col, null)
        .ilike("first_name", fn)
        .ilike("last_name", ln)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (match?.id) {
        const patch =
          col === "messenger_psid"
            ? { messenger_psid: opts.senderId }
            : { instagram_igsid: opts.senderId };
        await supabaseAdmin
          .from("leads")
          .update(patch as any)
          .eq("id", match.id);
        return match.id;
      }
    }
  } catch (e) {
    console.warn("[meta-messaging] profile merge lookup failed", e);
  }

  // 3) Fallback: utwórz nowego leada z tym PSID
  return await upsertLeadFromSource({
    source: opts.platform === "messenger" ? "messenger" : "instagram",
    applicationData: { [col]: opts.senderId },
  }).then(async (id) => {
    if (id) {
      const patch =
        col === "messenger_psid"
          ? { messenger_psid: opts.senderId }
          : { instagram_igsid: opts.senderId };
      await supabaseAdmin.from("leads").update(patch).eq("id", id);
    }
    return id;
  });
}

/**
 * Uzupełnia brakujące imię/nazwisko leada danymi z profilu Meta (Graph API
 * zwraca stronie imię i nazwisko rozmówcy po PSID/IGSID). Dzięki temu
 * rozmowa w skrzynce od razu jest podpisana klientem, a nie "Nieznany klient".
 */
async function ensureLeadNameFromMetaProfile(opts: {
  leadId: string;
  senderId: string;
  platform: "messenger" | "instagram";
}): Promise<void> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("first_name, last_name")
    .eq("id", opts.leadId)
    .maybeSingle();
  if (lead?.first_name && lead?.last_name) return;

  const profile = await fetchMetaUserProfile({ userId: opts.senderId, platform: opts.platform });
  if (!profile) return;

  const patch: Record<string, string> = {};
  if (profile.firstName && !lead?.first_name) patch.first_name = profile.firstName;
  if (profile.lastName && !lead?.last_name) patch.last_name = profile.lastName;
  if (Object.keys(patch).length > 0) {
    await supabaseAdmin
      .from("leads")
      .update(patch as any)
      .eq("id", opts.leadId);
  }
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
      // Atrybucja reklama→PSID PRZED obsługą wiadomości: zdarzenie `referral`
      // (klik w reklamę click-to-Messenger) przychodzi też BEZ `message`, a
      // handleMessagingEvent takie zdarzenia pomija.
      try {
        await captureReferralFromEvent(ev, platform);
      } catch (e) {
        console.error("[meta-messaging] referral capture error", e);
      }
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

  // 0) Imię i nazwisko z profilu Meta — od razu podpisujemy leada klientem
  try {
    await ensureLeadNameFromMetaProfile({ leadId, senderId, platform });
  } catch (e) {
    console.error("[messenger] profile name error", e);
  }

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
  const commId = await logLeadCommunication({
    leadId,
    channel: platform === "messenger" ? "messenger" : "messenger",
    direction: "inbound",
    content: userText || (attachmentsSummary ? "[załącznik]" : ""),
    externalId: msg.mid ?? null,
    metadata: { platform, sender_id: senderId },
    status: "received",
  });
  if (stored.length) {
    // Aktualizacja po id wstawionego rekordu — update po external_id gubił
    // załączniki, gdy Meta nie przysłała `mid`.
    if (commId) {
      await supabaseAdmin
        .from("lead_communications")
        .update({ attachments: stored as any })
        .eq("id", commId);
    } else if (msg.mid) {
      await supabaseAdmin
        .from("lead_communications")
        .update({ attachments: stored as any })
        .eq("external_id", msg.mid);
    }
    try {
      await attachStoredToClientDocuments({ leadId, stored, sourceLabel: platform });
    } catch (e) {
      console.error("[messenger] attach to client docs", e);
    }
  }
  try {
    await enrichLeadFromInbound({ leadId, text: userText, hasAttachments: stored.length > 0 });
  } catch (e) {
    console.error("[messenger] enrichment error", e);
  }

  if (!userText && !stored.length) return;

  // 2.5) OCHRONA PRZED PĘTLAMI BOT-BOT — wiadomość jest już zalogowana
  //      (operator widzi ją w skrzynce), ale agent nie odpowiada automatowi.
  const guard = await shouldSkipMessengerAutoReply({
    leadId,
    senderId,
    platform,
    text: userText,
  });
  if (guard.skip) {
    console.warn(`[messenger] skip auto-reply: ${guard.reason} (psid=${senderId})`);
    return;
  }

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

  // 4) Po odpowiedzi (żeby nie opóźniać repliki): OCR świeżych załączników
  //    oraz imię/nazwisko właściciela z KW — tu tylko z cache kw_documents,
  //    płatne pobranie z CMD zleca dopiero backfill/cron.
  if (stored.length) {
    try {
      await ocrLeadAttachmentsAndEnrich({ leadId, attachments: stored });
    } catch (e) {
      console.error("[messenger] attachment ocr error", e);
    }
  }
  try {
    await fillLeadNameFromKw({ leadId, allowOrder: false });
  } catch (e) {
    console.error("[messenger] kw name error", e);
  }
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

  const leadId = await findOrCreateLeadByPsid({ senderId: fromId, platform: "messenger" });
  if (!leadId) return;

  if (fromName) {
    const { data: existing } = await supabaseAdmin
      .from("leads")
      .select("first_name, last_name")
      .eq("id", leadId)
      .maybeSingle();
    const parts = fromName.trim().split(/\s+/);
    const patch: Record<string, string> = {};
    if (!existing?.first_name && parts[0]) patch.first_name = parts[0];
    if (!existing?.last_name && parts.length > 1) patch.last_name = parts.slice(1).join(" ");
    if (Object.keys(patch).length > 0) {
      await supabaseAdmin
        .from("leads")
        .update(patch as any)
        .eq("id", leadId);
    }
  }

  await logLeadCommunication({
    leadId,
    channel: "messenger",
    direction: "inbound",
    content: text || "[pusty komentarz]",
    externalId: commentId,
    metadata: {
      platform: "messenger",
      kind: "fb_comment",
      comment_id: commentId,
      post_id: postId,
      from_id: fromId,
      from_name: fromName,
    },
    status: "received",
  });

  if (!text) return;

  // OCHRONA PRZED PĘTLAMI — komentujący bot (albo inna strona-automat) nie
  // powinien dostawać publicznej odpowiedzi + PM za każdym razem.
  const guard = await shouldSkipMessengerAutoReply({
    leadId,
    senderId: fromId,
    platform: "messenger",
    text,
  });
  if (guard.skip) {
    console.warn(`[fb-comment] skip auto-reply: ${guard.reason} (from=${fromId})`);
    return;
  }

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
    metadata: {
      platform: "messenger",
      kind: "fb_comment_reply",
      comment_id: commentId,
      post_id: postId,
    },
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
    metadata: {
      platform: "messenger",
      kind: "fb_comment_private_reply",
      comment_id: commentId,
      post_id: postId,
      tool_calls: agent.toolCalls,
    },
    status: pm.ok ? "sent" : "error",
    errorMessage: pm.ok ? null : pm.error,
    agentId: process.env.ELEVENLABS_TEXT_AGENT_ID ?? null,
  });
}
