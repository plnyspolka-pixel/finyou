// Wysyłka maili wychodzących przez Mailgun (przez Lovable connector gateway).
const GATEWAY = "https://connector-gateway.lovable.dev/mailgun";

export async function sendMailgunEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string | null;
  references?: string | null;
  fromName?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  if (!lovableKey || !connKey || !domain) {
    return {
      ok: false,
      error: "Mailgun env missing (LOVABLE_API_KEY / MAILGUN_API_KEY / MAILGUN_DOMAIN)",
    };
  }
  const subject = (opts.subject ?? "").trim();
  if (!subject) {
    console.warn("[mailgun-send] refuse to send email without subject", { to: opts.to });
    return { ok: false, error: "missing_subject" };
  }
  const form = new URLSearchParams();
  form.set("from", `${opts.fromName ?? "Finance You"} <kontakt@${domain}>`);
  form.set("to", opts.to);
  form.set("subject", subject);
  form.set("text", opts.text);
  if (opts.html) form.set("html", opts.html);
  if (opts.inReplyTo) form.set("h:In-Reply-To", opts.inReplyTo);
  if (opts.references) form.set("h:References", opts.references);

  const res = await fetch(`${GATEWAY}/${encodeURIComponent(domain)}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
    },
    body: form.toString(),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `${res.status}: ${JSON.stringify(json).slice(0, 300)}` };
  return { ok: true, id: json?.id };
}
