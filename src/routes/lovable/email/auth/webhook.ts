import * as React from "react";
import { render } from "react-email";
import { parseEmailWebhookPayload } from "@lovable.dev/email-js";
import { WebhookError, verifyWebhookRequest } from "@lovable.dev/webhooks-js";
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

// Template mapping
const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
};

// Configuration
const SITE_NAME = "Finance You";
const ROOT_DOMAIN = "financeyou.pl";

function redactEmail(email: string | null | undefined): string {
  if (!email) return "***";
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "***";
  return `${localPart[0]}***@${domain}`;
}

export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;

        if (!apiKey) {
          console.error("LOVABLE_API_KEY not configured");
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        // Verify signature + timestamp, then parse payload.
        let payload: any;
        let run_id = "";
        try {
          const verified = await verifyWebhookRequest({
            req: request,
            secret: apiKey,
            parser: parseEmailWebhookPayload,
          });
          payload = verified.payload;
          run_id = payload.run_id;
        } catch (error) {
          if (error instanceof WebhookError) {
            switch (error.code) {
              case "invalid_signature":
              case "missing_timestamp":
              case "invalid_timestamp":
              case "stale_timestamp":
                console.error("Invalid webhook signature", { error: error.message });
                return Response.json({ error: "Invalid signature" }, { status: 401 });
              case "invalid_payload":
              case "invalid_json":
                console.error("Invalid webhook payload", { error: error.message });
                return Response.json({ error: "Invalid webhook payload" }, { status: 400 });
            }
          }

          console.error("Webhook verification failed", { error });
          return Response.json({ error: "Invalid webhook payload" }, { status: 400 });
        }

        if (!run_id) {
          console.error("Webhook payload missing run_id");
          return Response.json({ error: "Invalid webhook payload" }, { status: 400 });
        }

        if (payload.version !== "1") {
          console.error("Unsupported payload version", { version: payload.version, run_id });
          return Response.json(
            { error: `Unsupported payload version: ${payload.version}` },
            { status: 400 },
          );
        }

        // The email action type is in payload.data.action_type (e.g., "signup", "recovery")
        // payload.type is the hook event type ("auth")
        const emailType = payload.data.action_type;
        console.log("Received auth event", {
          emailType,
          email_redacted: redactEmail(payload.data.email),
          run_id,
        });

        const EmailTemplate = EMAIL_TEMPLATES[emailType];
        if (!EmailTemplate) {
          console.error("Unknown email type", { emailType, run_id });
          return Response.json({ error: `Unknown email type: ${emailType}` }, { status: 400 });
        }

        // Build template props from payload.data (HookData structure)
        const templateProps = {
          siteName: SITE_NAME,
          siteUrl: `https://${ROOT_DOMAIN}`,
          recipient: payload.data.email,
          confirmationUrl: payload.data.url,
          token: payload.data.token,
          email: payload.data.email,
          oldEmail: payload.data.old_email,
          newEmail: payload.data.new_email,
        };

        // Render React Email to HTML and plain text
        const element = React.createElement(EmailTemplate, templateProps);
        const html = await render(element);
        const text = await render(element, { plainText: true });

        // Wysyłka bezpośrednio przez działającą bramkę Resend (ten sam tor co
        // sendResendEmail w całej aplikacji). Kolejka pgmq (RPC enqueue_email
        // + cron process-email-queue) nie istnieje w produkcyjnej bazie — każde
        // wywołanie kończyło się „Failed to enqueue email" i link logowania
        // nigdy nie wychodził. Tak samo obeszliśmy to już w mailing.server.ts.
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
          console.error("Missing Supabase environment variables");
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const messageId = crypto.randomUUID();

        // Log pending BEFORE sending so we have a record even if the send crashes
        await supabase.from("email_send_log").insert({
          message_id: messageId,
          template_name: emailType,
          recipient_email: payload.data.email,
          status: "pending",
        });

        const { sendResendEmail } = await import("@/lib/resend-send.server");
        let send: { ok: boolean; id?: string; error?: string };
        try {
          send = await sendResendEmail({
            to: payload.data.email,
            subject: EMAIL_SUBJECTS[emailType] || "Notification",
            text,
            html,
            fromName: SITE_NAME,
            // Szablon React Email jest już kompletny — bez drugiej ramki.
            noBranding: true,
            // Klient sam poprosił o link — zwykły wypis z marketingu go nie blokuje.
            category: "transactional",
          });
        } catch (error) {
          send = { ok: false, error: error instanceof Error ? error.message : String(error) };
        }

        await supabase.from("email_send_log").insert({
          message_id: messageId,
          template_name: emailType,
          recipient_email: payload.data.email,
          // Twarda blokada strażnika (bounce/skarga/RODO) to nie awaria wysyłki.
          status: send.ok ? "sent" : send.error?.startsWith("blocked:") ? "suppressed" : "failed",
          error_message: send.ok ? null : (send.error ?? "send_failed").slice(0, 1000),
          metadata: send.id ? { provider: "resend", provider_id: send.id, run_id } : { run_id },
        });

        if (!send.ok) {
          console.error("Failed to send auth email", { error: send.error, run_id, emailType });
          return Response.json({ error: "Failed to send email" }, { status: 500 });
        }

        console.log("Auth email sent", {
          emailType,
          email_redacted: redactEmail(payload.data.email),
          run_id,
        });

        return Response.json({ success: true, queued: false });
      },
    },
  },
});
