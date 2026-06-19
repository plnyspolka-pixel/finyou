// Publiczna odpowiedź pod komentarzem + Private Reply (Messenger) na komentarz.
const GRAPH = "https://graph.facebook.com/v21.0";

export async function replyToCommentPublic(opts: {
  commentId: string;
  text: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) return { ok: false, error: "META_PAGE_ACCESS_TOKEN missing" };
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

export async function sendPrivateReplyToComment(opts: {
  commentId: string;
  text: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) return { ok: false, error: "META_PAGE_ACCESS_TOKEN missing" };
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
