// Wysyłka maili wychodzących przez Mailgun (przez Lovable connector gateway).
// Ten sam strażnik wypisu i ta sama stopka co w torze Resend — inaczej wypisany
// klient dalej dostawałby maile z zapasowego kanału.
import { wrapBrandedEmail, isAlreadyBranded } from "./email-branding.server";
import {
  canSendEmail,
  unsubscribeUrlFor,
  unsubscribeHeaders,
  type EmailCategory,
} from "./email-unsubscribe.server";

const GATEWAY = "https://connector-gateway.lovable.dev/mailgun";

export async function sendMailgunEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string | null;
  references?: string | null;
  fromName?: string;
  noBranding?: boolean;
  category?: EmailCategory;
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
  const category: EmailCategory = opts.category ?? "automated";
  try {
    const decision = await canSendEmail(opts.to, category);
    if (!decision.allowed) {
      console.warn(`[mailgun-send] blocked recipient: ${opts.to} (${decision.reason})`);
      return { ok: false, error: `blocked:${decision.reason}` };
    }
  } catch (e) {
    console.error("[mailgun-send] send guard failed", e);
  }

  let unsubscribeUrl: string | undefined;
  let listHeaders: Record<string, string> = {};
  try {
    unsubscribeUrl = (await unsubscribeUrlFor(opts.to)) ?? undefined;
    listHeaders = await unsubscribeHeaders(opts.to);
  } catch (e) {
    console.error("[mailgun-send] unsubscribe link failed", e);
  }

  let html = opts.html;
  if (!opts.noBranding && !isAlreadyBranded(html)) {
    html = wrapBrandedEmail({
      innerHtml: opts.html,
      text: opts.html ? undefined : opts.text,
      unsubscribeUrl,
    });
  }

  const form = new URLSearchParams();
  form.set("from", `${opts.fromName ?? "Finance You"} <kontakt@${domain}>`);
  form.set("to", opts.to);
  form.set("subject", subject);
  form.set("text", opts.text);
  if (html) form.set("html", html);
  if (opts.inReplyTo) form.set("h:In-Reply-To", opts.inReplyTo);
  if (opts.references) form.set("h:References", opts.references);
  for (const [k, v] of Object.entries(listHeaders)) form.set(`h:${k}`, v);

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
