// Resend Inbound webhook: odbiera maile (JSON) z załącznikami jako URL-e.
// Konfiguracja w panelu Resend:
//   Domains → app.financeyou.pl → dodaj MX records do odbioru
//   Webhooks → Add Endpoint → URL: https://app.financeyou.pl/api/public/resend-inbound-webhook
//     event: email.inbound (Svix-signed) → skopiuj signing secret do RESEND_INBOUND_WEBHOOK_SECRET (whsec_...).
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { upsertLeadFromSource, logLeadCommunication, findLeadId } from "@/lib/lead-comms.server";
import { runAgentTurn } from "@/lib/elevenlabs-text-agent.server";
import { sendResendEmail } from "@/lib/resend-send.server";
import { downloadAndStore } from "@/lib/inbound-attachments.server";

// Svix signature: header `svix-signature` = "v1,<base64sig> v1,<base64sig> ..."
// signed payload: `${svix-id}.${svix-timestamp}.${body}` with HMAC-SHA256 key = base64-decoded secret after `whsec_`.
function verifySvix(req: Request, body: string): boolean {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) return false;
  const id = req.headers.get("svix-id") ?? req.headers.get("webhook-id");
  const ts = req.headers.get("svix-timestamp") ?? req.headers.get("webhook-timestamp");
  const sigHeader = req.headers.get("svix-signature") ?? req.headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) return false;
  const keyB64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBuf: Buffer;
  try { keyBuf = Buffer.from(keyB64, "base64"); } catch { return false; }
  const signed = `${id}.${ts}.${body}`;
  const expected = createHmac("sha256", keyBuf).update(signed).digest("base64");
  for (const part of sigHeader.split(" ")) {
    const [, sig] = part.split(",");
    if (!sig) continue;
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch { /* noop */ }
  }
  return false;
}

function parseAddr(s: string): { email: string | null; name: string | null } {
  if (!s) return { email: null, name: null };
  const m = s.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  if (s.includes("@")) return { email: s.trim().toLowerCase(), name: null };
  return { email: null, name: s.trim() };
}

function pickFirstAddr(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : (v[0]?.email ?? "");
  if (typeof v === "object" && v && "email" in (v as any)) return (v as any).email ?? "";
  return "";
}

export const Route = createFileRoute("/api/public/resend-inbound-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (!verifySvix(request, raw)) {
          return new Response("Forbidden", { status: 403 });
        }
        let evt: any;
        try { evt = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
        if (evt?.type && !["email.received", "email.inbound", "inbound.email.received"].includes(evt.type)) {
          return new Response("ignored", { status: 200 });
        }
        const data = evt?.data ?? evt;

        const fromHdr = pickFirstAddr(data.from ?? data.From);
        const { email: fromEmail, name } = parseAddr(fromHdr);
        const subject = String(data.subject ?? data.Subject ?? "(bez tematu)");
        const text = String(data.text ?? data.stripped_text ?? data.plain ?? "");
        const html = typeof data.html === "string" ? data.html : null;
        const messageId = String(data.message_id ?? data.messageId ?? data["Message-Id"] ?? "");
        const inReplyTo = String(data.in_reply_to ?? data["In-Reply-To"] ?? "") || null;
        const references = String(data.references ?? data.References ?? "") || null;

        if (!fromEmail) return new Response("no sender", { status: 200 });

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

        // Załączniki — Resend Inbound przekazuje listę z URL-ami (i czasem `content` base64).
        const stored: any[] = [];
        const atts: any[] = Array.isArray(data.attachments) ? data.attachments : [];
        for (const a of atts) {
          const filename = a?.filename ?? a?.name ?? `file-${Date.now()}`;
          const mime = a?.content_type ?? a?.contentType ?? a?.mime ?? "application/octet-stream";
          if (a?.url) {
            const s = await downloadAndStore({ leadId, url: a.url, filename, mime });
            if (s) stored.push(s);
          } else if (typeof a?.content === "string") {
            try {
              const buf = Buffer.from(a.content, "base64");
              const safeName = String(filename).replace(/[^\w.\-]+/g, "_");
              const path = `leads/${leadId}/${Date.now()}-${safeName}`;
              const { error } = await supabaseAdmin.storage.from("documents")
                .upload(path, buf, { contentType: mime, upsert: false });
              if (!error) stored.push({ name: safeName, mime, size: buf.byteLength, path });
            } catch { /* noop */ }
          }
        }

        const inboundLogId = await logLeadCommunication({
          leadId,
          channel: "email",
          direction: "inbound",
          subject,
          content: text || (html ? html.replace(/<[^>]+>/g, " ").slice(0, 4000) : ""),
          externalId: messageId || null,
          email: fromEmail,
          status: "received",
          metadata: { from_name: name, in_reply_to: inReplyTo, references, provider: "resend" },
        });
        if (stored.length && inboundLogId) {
          await supabaseAdmin.from("lead_communications").update({ attachments: stored as any }).eq("id", inboundLogId);
        }

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
          metadata: { tool_calls: agent.toolCalls, provider: "resend" },
          agentId: process.env.ELEVENLABS_TEXT_AGENT_ID ?? null,
        });

        return new Response("ok", { status: 200 });
      },
    },
  },
});
