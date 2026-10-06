import { ensureMetaTokens } from "@/lib/meta-tokens.server";
// Publiczna odpowiedź pod komentarzem + Private Reply (Messenger) na komentarz.
const GRAPH = "https://graph.facebook.com/v21.0";

export async function replyToCommentPublic(opts: {
  commentId: string;
  text: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  await ensureMetaTokens();
  const token = process.env.META_PAGE_ACCESS_TOKEN ?? process.env.META_ACCESS_TOKEN;
  if (!token) return { ok: false, error: "META_PAGE_ACCESS_TOKEN / META_ACCESS_TOKEN missing" };
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(opts.commentId)}/comments?access_token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: opts.text.slice(0, 7000) }),
    },
  );
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `${res.status}: ${JSON.stringify(json).slice(0, 300)}` };
  return { ok: true, id: json?.id };
}

/**
 * Instagram: wiadomość prywatna do autora komentarza (Private Reply przez
 * Messenger Platform, `POST /{ig-user-id}/messages` z `recipient.comment_id`).
 * Wymaga instagram_manage_comments + instagram_manage_messages; działa do
 * 7 dni od komentarza i tylko pod mediami naszego konta.
 */
export async function sendIgPrivateReplyToComment(opts: {
  commentId: string;
  text: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  await ensureMetaTokens();
  const igUserId = process.env.META_IG_USER_ID;
  const token =
    process.env.META_IG_PAGE_ACCESS_TOKEN ??
    process.env.META_PAGE_ACCESS_TOKEN ??
    process.env.META_ACCESS_TOKEN;
  if (!igUserId) return { ok: false, error: "META_IG_USER_ID missing" };
  if (!token)
    return { ok: false, error: "META_IG_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN missing" };
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(igUserId)}/messages?access_token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { comment_id: opts.commentId },
        message: { text: opts.text.slice(0, 990) },
      }),
    },
  );
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `${res.status}: ${JSON.stringify(json).slice(0, 300)}` };
  return { ok: true, messageId: json?.message_id };
}

export async function sendPrivateReplyToComment(opts: {
  commentId: string;
  text: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  await ensureMetaTokens();
  const token = process.env.META_PAGE_ACCESS_TOKEN ?? process.env.META_ACCESS_TOKEN;
  if (!token) return { ok: false, error: "META_PAGE_ACCESS_TOKEN / META_ACCESS_TOKEN missing" };
  const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { comment_id: opts.commentId },
      message: { text: opts.text.slice(0, 1990) },
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `${res.status}: ${JSON.stringify(json).slice(0, 300)}` };
  return { ok: true, messageId: json?.message_id };
}
