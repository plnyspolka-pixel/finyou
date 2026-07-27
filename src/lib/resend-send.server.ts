// Wysyłka maili wychodzących przez Resend (przez Lovable connector gateway).
// Każdy mail jest automatycznie obrandowany (logo + wordmark + linki),
// chyba że html ma marker data-fy-branded lub przekazano noBranding=true.
import { wrapBrandedEmail, isAlreadyBranded } from "./email-branding.server";

const GATEWAY = "https://connector-gateway.lovable.dev/resend";

const FROM_DOMAIN = process.env.RESEND_FROM_DOMAIN ?? "financeyou.pl";
const FROM_ADDR = process.env.RESEND_FROM_ADDRESS ?? `kontakt@financeyou.pl`;

export async function sendResendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string | null;
  references?: string | null;
  fromName?: string;
  replyTo?: string;
  noBranding?: boolean;
  unsubscribeUrl?: string;
  showReplyHint?: boolean;
  /** Prawdziwe załączniki maila (base64) — a nie linki w treści. */
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.RESEND_API_KEY;
  if (!lovableKey || !connKey) {
    return { ok: false, error: "Resend env missing (LOVABLE_API_KEY / RESEND_API_KEY)" };
  }
  const subject = (opts.subject ?? "").trim();
  if (!subject) {
    console.warn("[resend-send] refuse to send email without subject", { to: opts.to });
    return { ok: false, error: "missing_subject" };
  }

  // Ochrona przed pętlami: nie wysyłaj do adresów na liście suppressed_emails
  try {
    const { isSuppressed } = await import("./email-guard.server");
    if (await isSuppressed(opts.to)) {
      console.warn(`[resend-send] skip suppressed recipient: ${opts.to}`);
      return { ok: false, error: "recipient_suppressed" };
    }
  } catch (e) {
    console.error("[resend-send] suppression check failed", e);
  }

  const headers: Record<string, string> = {};
  if (opts.inReplyTo) headers["In-Reply-To"] = opts.inReplyTo;
  if (opts.references) headers["References"] = opts.references;

  // Automatyczne brandowanie
  let finalHtml = opts.html;
  if (!opts.noBranding && !isAlreadyBranded(finalHtml)) {
    finalHtml = wrapBrandedEmail({
      innerHtml: opts.html, // jeśli nie ma html, wrapper użyje text
      text: opts.html ? undefined : opts.text,
      unsubscribeUrl: opts.unsubscribeUrl,
      showReplyHint: opts.showReplyHint,
    });
  }

  const body: Record<string, any> = {
    from: `${opts.fromName ?? "Finance You"} <${FROM_ADDR}>`,
    to: [opts.to],
    subject,
    text: opts.text,
    html: finalHtml,
  };
  if (opts.replyTo) body.reply_to = opts.replyTo;
  if (Object.keys(headers).length) body.headers = headers;
  if (opts.attachments?.length) {
    body.attachments = opts.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      ...(a.contentType ? { content_type: a.contentType } : {}),
    }));
  }

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

  // Loguj każdą wysyłkę do email_send_log (widoczność w dashboardzie / debug)
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const messageId = json?.id ?? `resend-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "resend-direct",
      recipient_email: opts.to,
      status: res.ok ? "sent" : "failed",
      error_message: res.ok ? null : `${res.status}: ${JSON.stringify(json).slice(0, 500)}`,
      metadata: {
        subject: opts.subject,
        from_name: opts.fromName ?? null,
        reply_to: opts.replyTo ?? null,
        attachments: opts.attachments?.map((a) => a.filename) ?? null,
      },
    });
  } catch (logErr) {
    console.error("[resend-send] failed to log email_send_log", logErr);
  }

  if (!res.ok) {
    console.error(
      `[resend-send] FAILED to ${opts.to}: ${res.status}`,
      JSON.stringify(json).slice(0, 300),
    );
    return { ok: false, error: `${res.status}: ${JSON.stringify(json).slice(0, 300)}` };
  }
  return { ok: true, id: json?.id };
}
