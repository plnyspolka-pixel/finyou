// Wysyłka maili wychodzących przez Resend (przez Lovable connector gateway).
const GATEWAY = "https://connector-gateway.lovable.dev/resend";

const FROM_DOMAIN = process.env.RESEND_FROM_DOMAIN ?? "app.financeyou.pl";
const FROM_ADDR = process.env.RESEND_FROM_ADDRESS ?? `kontakt@${FROM_DOMAIN}`;

export async function sendResendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string | null;
  references?: string | null;
  fromName?: string;
  replyTo?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.RESEND_API_KEY;
  if (!lovableKey || !connKey) {
    return { ok: false, error: "Resend env missing (LOVABLE_API_KEY / RESEND_API_KEY)" };
  }

  const headers: Record<string, string> = {};
  if (opts.inReplyTo) headers["In-Reply-To"] = opts.inReplyTo;
  if (opts.references) headers["References"] = opts.references;

  const body: Record<string, any> = {
    from: `${opts.fromName ?? "Finance You"} <${FROM_ADDR}>`,
    to: [opts.to],
    subject: opts.subject,
    text: opts.text,
  };
  if (opts.html) body.html = opts.html;
  if (opts.replyTo) body.reply_to = opts.replyTo;
  if (Object.keys(headers).length) body.headers = headers;

  const res = await fetch(`${GATEWAY}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
    },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `${res.status}: ${JSON.stringify(json).slice(0, 300)}` };
  return { ok: true, id: json?.id };
}
