// Mailgun inbound webhook: odbiera maile (multipart/form-data) z załącznikami.
// Konfiguracja w Mailgunie: Receiving → Routes → Match: match_recipient(".*@mg.financeyou.pl")
// → Forward: https://app.financeyou.pl/api/public/mailgun-inbound-webhook
// Mailgun podpisuje payload (timestamp + token) — weryfikujemy MAILGUN_WEBHOOK_SIGNING_KEY.
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { upsertLeadFromSource, logLeadCommunication, findLeadId } from "@/lib/lead-comms.server";
import { runAgentTurn } from "@/lib/elevenlabs-text-agent.server";
import { sendResendEmail } from "@/lib/resend-send.server";
import { downloadAndStore, attachStoredToClientDocuments } from "@/lib/inbound-attachments.server";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { enrichLeadFromInbound } from "@/lib/lead-enrichment.server";
import { shouldSkipAutoReply } from "@/lib/email-guard.server";

function verifyMailgun(timestamp: string, token: string, signature: string): boolean {
  const key = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!key) return false;
  const expected = createHmac("sha256", key).update(timestamp + token).digest("hex");
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}

function parseFromHeader(from: string): { email: string | null; name: string | null } {
  if (!from) return { email: null, name: null };
  const m = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  if (from.includes("@")) return { email: from.trim().toLowerCase(), name: null };
  return { email: null, name: from.trim() };
}

export const Route = createFileRoute("/api/public/mailgun-inbound-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData();
        const timestamp = String(form.get("timestamp") ?? "");
        const token = String(form.get("token") ?? "");
        const signature = String(form.get("signature") ?? "");
        if (!verifyMailgun(timestamp, token, signature)) {
          return new Response("Forbidden", { status: 403 });
        }

        const fromHdr = String(form.get("from") ?? form.get("From") ?? "");
        const { email: fromEmail, name } = parseFromHeader(fromHdr);
        const subject = String(form.get("subject") ?? form.get("Subject") ?? "(bez tematu)");
        const text = String(form.get("stripped-text") ?? form.get("body-plain") ?? "");
        const messageId = String(form.get("Message-Id") ?? form.get("Message-ID") ?? "");
        const inReplyTo = String(form.get("In-Reply-To") ?? "") || null;
        const references = String(form.get("References") ?? "") || null;

        if (!fromEmail) return new Response("no sender", { status: 200 });

        // Nadawca może być INWESTOREM — nie traktujemy maila jak leada klienta
        // i nie odpowiadamy botem onboardingowym; przypisujemy do wniosku.
        const { findInvestorByEmail, recordInvestorReply } = await import("@/lib/investor-inbound.server");
        const investor = await findInvestorByEmail(fromEmail);
        if (investor) {
          const invAttachmentCount = parseInt(String(form.get("attachment-count") ?? "0"), 10);
          const invStored: any[] = [];
          for (let i = 1; i <= invAttachmentCount; i++) {
            const file = form.get(`attachment-${i}`);
            if (file && typeof (file as any).arrayBuffer === "function") {
              const f = file as File;
              const buf = new Uint8Array(await f.arrayBuffer());
              const safeName = f.name.replace(/[^\w.\-]+/g, "_");
              const path = `investors/${investor.id}/${Date.now()}-${safeName}`;
              const { error } = await supabaseAdmin.storage.from(CLIENT_FILES_BUCKET)
                .upload(path, buf, { contentType: f.type || "application/octet-stream", upsert: false });
              if (!error) invStored.push({ name: safeName, mime: f.type, size: buf.byteLength, path });
            }
          }
          await recordInvestorReply({
            investor,
            fromEmail,
            fromName: name,
            subject,
            content: text,
            messageId: messageId || null,
            inReplyTo,
            references,
            attachments: invStored,
          });
          return new Response("ok:investor", { status: 200 });
        }

        // Match leada po emailu, w razie czego utwórz
        let leadId = await findLeadId({ email: fromEmail });
        if (!leadId) {
          const parts = (name ?? "").trim().split(/\s+/);
          leadId = await upsertLeadFromSource({
            source: "email_inbound",
            firstName: parts[0] ?? null,
            lastName: parts.slice(1).join(" ") || null,
            email: fromEmail,
            applicationData: { inbound_subject: subject },
          });
        }
        if (!leadId) return new Response("no lead", { status: 200 });

        // Załączniki
        const attachmentCount = parseInt(String(form.get("attachment-count") ?? "0"), 10);
        const stored: any[] = [];
        for (let i = 1; i <= attachmentCount; i++) {
          const file = form.get(`attachment-${i}`);
          if (file && typeof (file as any).arrayBuffer === "function") {
            const f = file as File;
            const buf = new Uint8Array(await f.arrayBuffer());
            const safeName = f.name.replace(/[^\w.\-]+/g, "_");
            const path = `leads/${leadId}/${Date.now()}-${safeName}`;
            const { error } = await supabaseAdmin.storage.from(CLIENT_FILES_BUCKET)
              .upload(path, buf, { contentType: f.type || "application/octet-stream", upsert: false });
            if (!error) stored.push({ name: safeName, mime: f.type, size: buf.byteLength, path });
          }
        }
        // Mailgun czasem podaje też JSON z URLami w `attachments` (gdy storage notify)
        const attachmentsJson = form.get("attachments");
        if (typeof attachmentsJson === "string" && attachmentsJson.startsWith("[")) {
          try {
            const arr = JSON.parse(attachmentsJson);
            for (const a of arr) {
              if (!a?.url) continue;
              const apiKey = process.env.MAILGUN_API_KEY;
              const s = await downloadAndStore({
                leadId,
                url: a.url,
                filename: a.name,
                mime: a["content-type"],
                authHeader: apiKey ? { Authorization: "Basic " + Buffer.from(`api:${apiKey}`).toString("base64") } : undefined,
              });
              if (s) stored.push(s);
            }
          } catch { /* noop */ }
        }

        // Log inbound
        const inboundLogId = await logLeadCommunication({
          leadId,
          channel: "email",
          direction: "inbound",
          subject,
          content: text,
          externalId: messageId || null,
          email: fromEmail,
          status: "received",
          metadata: { from_name: name, in_reply_to: inReplyTo, references },
        });
        if (stored.length && inboundLogId) {
          await supabaseAdmin.from("lead_communications").update({ attachments: stored as any }).eq("id", inboundLogId);
          try {
            await attachStoredToClientDocuments({ leadId, stored, sourceLabel: "email" });
          } catch (e) { console.error("[mailgun-inbound] attach to client docs", e); }
        }

        // Wyciągnij KW/kwotę z treści maila i (jeśli komplet) awansuj do wniosku
        try {
          const enrichText = [subject, text].filter(Boolean).join("\n");
          await enrichLeadFromInbound({ leadId, text: enrichText, hasAttachments: stored.length > 0 });
        } catch (e) { console.error("[mailgun-inbound] enrichment error", e); }

        // OCHRONA PRZED PĘTLAMI — sprawdź nagłówki/suppression/rate-limit/pętle
        const mgHeaders: Record<string, string> = {
          "auto-submitted": String(form.get("Auto-Submitted") ?? form.get("auto-submitted") ?? ""),
          "x-auto-response-suppress": String(form.get("X-Auto-Response-Suppress") ?? ""),
          "x-autoreply": String(form.get("X-Autoreply") ?? ""),
          "x-autorespond": String(form.get("X-Autorespond") ?? ""),
          precedence: String(form.get("Precedence") ?? form.get("precedence") ?? ""),
          "list-unsubscribe": String(form.get("List-Unsubscribe") ?? ""),
          "list-id": String(form.get("List-Id") ?? ""),
        };
        const skip = await shouldSkipAutoReply({
          leadId,
          fromEmail,
          headers: mgHeaders,
          threadIds: [messageId, inReplyTo, references].filter(Boolean) as string[],
        });
        if (skip.skip) {
          console.warn(`[mailgun-inbound] skip auto-reply: ${skip.reason} (${fromEmail})`);
          return new Response(`skipped:${skip.reason}`, { status: 200 });
        }

        // Agent
        const attachmentsSummary = stored.length
          ? stored.map((a) => `- ${a.name} (${a.mime})`).join("\n")
          : null;
        const agent = await runAgentTurn({
          leadId,
          channel: "email",
          userMessage: text || "[Klient przesłał same załączniki]",
          attachmentsSummary,
        });

        let replyText = agent.reply;
        const linkCall = agent.toolCalls.find((c) => c.name === "send_application_link");
        if (linkCall?.result?.link && !replyText.includes(linkCall.result.link)) {
          replyText += `\n\nLink do dokończenia wniosku: ${linkCall.result.link}`;
        }

        const replySubject = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
        const send = await sendResendEmail({
          to: fromEmail,
          subject: replySubject,
          text: replyText,
          inReplyTo: messageId || null,
          references: [references, messageId].filter(Boolean).join(" ") || null,
        });

        await logLeadCommunication({
          leadId,
          channel: "email",
          direction: "outbound",
          subject: replySubject,
          content: replyText,
          externalId: send.id ?? null,
          email: fromEmail,
          status: send.ok ? "sent" : "error",
          errorMessage: send.ok ? null : send.error,
          metadata: { tool_calls: agent.toolCalls },
          agentId: process.env.ELEVENLABS_TEXT_AGENT_ID ?? null,
        });

        return new Response("ok", { status: 200 });
      },
    },
  },
});
