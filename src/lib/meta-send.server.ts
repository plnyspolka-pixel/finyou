// Wysyłka wiadomości przez Meta Graph API (Messenger + Instagram Direct).
const GRAPH = "https://graph.facebook.com/v21.0";

export async function sendMetaMessage(opts: {
  recipientId: string; // PSID (Messenger) lub IGSID (Instagram)
  text: string;
  platform: "messenger" | "instagram";
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  // Send API wymaga tokenu Page. Preferuj dedykowany META_PAGE_ACCESS_TOKEN,
  // ale gdy nie ustawiony — użyj wspólnego META_ACCESS_TOKEN (którym skonfigurowana
  // jest reszta integracji Meta), żeby wysyłka działała bez dodatkowej zmiennej.
  const token = process.env.META_PAGE_ACCESS_TOKEN ?? process.env.META_ACCESS_TOKEN;
  if (!token) return { ok: false, error: "META_PAGE_ACCESS_TOKEN / META_ACCESS_TOKEN missing" };
  const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_type: "RESPONSE",
      recipient: { id: opts.recipientId },
      message: { text: opts.text.slice(0, 1990) },
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `${res.status}: ${JSON.stringify(json).slice(0, 300)}` };
  return { ok: true, messageId: json?.message_id };
}
