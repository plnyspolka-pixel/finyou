// Supabase Auth „Send Email Hook” (HTTP): zamiast domyślnych szablonów Supabase wysyłamy
// własne, brandowane maile Auth (potwierdzenie rejestracji, link logowania, reset hasła,
// zmiana e-maila, zaproszenie, kod ponownej weryfikacji) przez Resend.
//
// Konfiguracja w projekcie Supabase: Authentication → Hooks → Send Email → HTTP,
// adres: https://app.financeyou.pl/lovable/email/auth/webhook, sekret → env SEND_EMAIL_HOOK_SECRET
// (w formacie `v1,whsec_<base64>`, jak pokazuje panel). Podpis weryfikowany wg Standard Webhooks.
// Ścieżka trasy zachowana po poprzedniej integracji (Lovable), żeby nie ruszać routeTree.
import * as React from "react";
import { render } from "react-email";
import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { SignupEmail } from "@/lib/email-templates/signup";
import { InviteEmail } from "@/lib/email-templates/invite";
import { MagicLinkEmail } from "@/lib/email-templates/magic-link";
import { RecoveryEmail } from "@/lib/email-templates/recovery";
import { EmailChangeEmail } from "@/lib/email-templates/email-change";
import { ReauthenticationEmail } from "@/lib/email-templates/reauthentication";

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: "Potwierdź swój adres e-mail",
  invite: "Zaproszenie do Finance You",
  magiclink: "Twój link do logowania",
  recovery: "Resetowanie hasła",
  email_change: "Potwierdź zmianę adresu e-mail",
  reauthentication: "Twój kod weryfikacyjny",
};

const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
};

const SITE_NAME = "Finance You";
const ROOT_DOMAIN = "financeyou.pl";
const MAX_SKEW_SEC = 5 * 60;

function redactEmail(email: string | null | undefined): string {
  if (!email) return "***";
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "***";
  return `${localPart[0]}***@${domain}`;
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

/** Weryfikacja podpisu Standard Webhooks (nagłówki webhook-id / webhook-timestamp / webhook-signature). */
async function verifyStandardWebhook(req: Request, rawBody: string, secret: string): Promise<boolean> {
  const id = req.headers.get("webhook-id");
  const ts = req.headers.get("webhook-timestamp");
  const sigHeader = req.headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Math.floor(Date.now() / 1000) - tsNum) > MAX_SKEW_SEC) return false;
  const secretB64 = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  const key = await crypto.subtle.importKey("raw", base64ToBytes(secretB64), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${rawBody}`));
  const expected = bytesToBase64(mac);
  return sigHeader
    .split(/\s+/)
    .map((p) => p.split(",")[1] ?? "")
    .some((sig) => sig.length === expected.length && sig === expected);
}

export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const hookSecret = process.env.SEND_EMAIL_HOOK_SECRET;
        if (!hookSecret) {
          console.error("SEND_EMAIL_HOOK_SECRET not configured");
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }
        const rawBody = await request.text();
        if (!(await verifyStandardWebhook(request, rawBody, hookSecret))) {
          console.error("Invalid auth hook signature");
          return Response.json({ error: "Invalid signature" }, { status: 401 });
        }
        let payload: any;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return Response.json({ error: "Invalid webhook payload" }, { status: 400 });
        }

        const user = payload?.user ?? {};
        const emailData = payload?.email_data ?? {};
        const emailType: string = emailData.email_action_type ?? "";
        const recipient: string = emailType === "email_change" && user.new_email ? user.new_email : user.email;
        const EmailTemplate = EMAIL_TEMPLATES[emailType];
        if (!EmailTemplate || !recipient) {
          console.error("Unknown email type or missing recipient", { emailType });
          return Response.json({ error: `Unknown email type: ${emailType}` }, { status: 400 });
        }

        const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !supabaseServiceKey) {
          console.error("Missing Supabase environment variables");
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        // Link potwierdzający: endpoint verify Supabase Auth z token_hash (jak w domyślnych szablonach).
        const verify = new URL(`${supabaseUrl}/auth/v1/verify`);
        verify.searchParams.set("token", emailData.token_hash ?? "");
        verify.searchParams.set("type", emailType);
        if (emailData.redirect_to) verify.searchParams.set("redirect_to", emailData.redirect_to);

        const templateProps = {
          siteName: SITE_NAME,
          siteUrl: emailData.site_url || `https://${ROOT_DOMAIN}`,
          recipient,
          confirmationUrl: verify.toString(),
          token: emailData.token,
          email: recipient,
          oldEmail: user.email,
          newEmail: user.new_email ?? emailData.new_email,
        };

        const element = React.createElement(EmailTemplate, templateProps);
        const html = await render(element);
        const text = await render(element, { plainText: true });

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const messageId = crypto.randomUUID();
        await supabase.from("email_send_log").insert({
          message_id: messageId,
          template_name: emailType,
          recipient_email: recipient,
          status: "pending",
        });

        const { sendResendEmail } = await import("@/lib/resend-send.server");
        let send: { ok: boolean; id?: string; error?: string };
        try {
          send = await sendResendEmail({
            to: recipient,
            subject: EMAIL_SUBJECTS[emailType] || "Powiadomienie",
            text,
            html,
            fromName: SITE_NAME,
            noBranding: true,
            category: "transactional",
          });
        } catch (error) {
          send = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }

        await supabase.from("email_send_log").insert({
          message_id: messageId,
          template_name: emailType,
          recipient_email: recipient,
          status: send.ok ? "sent" : send.error?.startsWith("blocked:") ? "suppressed" : "failed",
          error_message: send.ok ? null : (send.error ?? "send_failed").slice(0, 1000),
          metadata: send.id ? { provider: "resend", provider_id: send.id, user_id: user.id } : { user_id: user.id },
        });

        if (!send.ok) {
          console.error("Failed to send auth email", { error: send.error, emailType });
          return Response.json({ error: "Failed to send email" }, { status: 500 });
        }
        console.log("Auth email sent", { emailType, email_redacted: redactEmail(recipient) });
        return Response.json({});
      },
    },
  },
});
