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
import { downloadAndStore, attachStoredToClientDocuments } from "@/lib/inbound-attachments.server";
import { enrichLeadFromInbound } from "@/lib/lead-enrichment.server";
import { shouldSkipAutoReply, normalizeHeaders } from "@/lib/email-guard.server";

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
  try {
    keyBuf = Buffer.from(keyB64, "base64");
  } catch {
    return false;
  }
  const signed = `${id}.${ts}.${body}`;
  const expected = createHmac("sha256", keyBuf).update(signed).digest("base64");
  for (const part of sigHeader.split(" ")) {
    const [, sig] = part.split(",");
    if (!sig) continue;
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      /* noop */
    }
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
        try {
          evt = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }
        if (
          evt?.type &&
          !["email.received", "email.inbound", "inbound.email.received"].includes(evt.type)
        ) {
          return new Response("ignored", { status: 200 });
        }
        const meta = evt?.data ?? evt;
        const emailId = String(meta?.email_id ?? meta?.id ?? "");

        // Webhook zawiera TYLKO metadane — body i załączniki trzeba dociągnąć przez Resend API.
        const GATEWAY = "https://connector-gateway.lovable.dev/resend";
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        const resendHeaders: Record<string, string> = {
          Authorization: `Bearer ${LOVABLE_API_KEY ?? ""}`,
          "X-Connection-Api-Key": RESEND_API_KEY ?? "",
        };

        let data: any = meta;
        if (emailId && LOVABLE_API_KEY && RESEND_API_KEY) {
          try {
            const r = await fetch(`${GATEWAY}/emails/receiving/${emailId}`, {
              headers: resendHeaders,
            });
            if (r.ok) data = { ...meta, ...(await r.json()) };
            else
              console.error(
                "[resend-inbound] fetch email failed",
                r.status,
                await r.text().catch(() => ""),
              );
          } catch (e) {
            console.error("[resend-inbound] fetch email error", e);
          }
        }

        const fromHdr = pickFirstAddr(data.from ?? data.From);
        const { email: fromEmail, name } = parseAddr(fromHdr);
        const subject = String(data.subject ?? data.Subject ?? "(bez tematu)");
        let text = String(data.text ?? "");
        let html: string | null = typeof data.html === "string" ? data.html : null;
        // html_format=data_uri → dekoduj
        if (html && (data.html_format === "data_uri" || html.startsWith("data:"))) {
          try {
            const m = html.match(/^data:([^;,]+)(;base64)?,(.*)$/);
            if (m) {
              const isB64 = !!m[2];
              const body = isB64
                ? Buffer.from(m[3], "base64").toString("utf8")
                : decodeURIComponent(m[3]);
              html = body;
            }
          } catch {
            /* noop */
          }
        }
        if (!text && html)
          text = html
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 8000);
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

        // Załączniki: pobierz listę z signed download_url przez Resend API
        const stored: any[] = [];
        if (emailId && LOVABLE_API_KEY && RESEND_API_KEY) {
          try {
            const r = await fetch(`${GATEWAY}/emails/receiving/${emailId}/attachments`, {
              headers: resendHeaders,
            });
            if (r.ok) {
              const list = await r.json();
              const items: any[] = Array.isArray(list?.data) ? list.data : [];
              for (const a of items) {
                const filename = a?.filename ?? `file-${a?.id ?? Date.now()}`;
                const mime = a?.content_type ?? "application/octet-stream";
                if (a?.download_url) {
                  const s = await downloadAndStore({ leadId, url: a.download_url, filename, mime });
                  if (s) stored.push(s);
                }
              }
            } else {
              console.error(
                "[resend-inbound] fetch attachments failed",
                r.status,
                await r.text().catch(() => ""),
              );
            }
          } catch (e) {
            console.error("[resend-inbound] fetch attachments error", e);
          }
        }

        const plainFromHtml = html
          ? html
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
          : "";
        const finalText = text || plainFromHtml.slice(0, 8000);
        const inboundLogId = await logLeadCommunication({
          leadId,
          channel: "email",
          direction: "inbound",
          subject,
          content: finalText,
          externalId: messageId || null,
          email: fromEmail,
          status: "received",
          metadata: {
            from_name: name,
            in_reply_to: inReplyTo,
            references,
            provider: "resend",
            email_id: emailId || null,
            html: html ?? null,
          },
        });
        if (stored.length && inboundLogId) {
          await supabaseAdmin
            .from("lead_communications")
            .update({ attachments: stored as any })
            .eq("id", inboundLogId);
          try {
            await attachStoredToClientDocuments({ leadId, stored, sourceLabel: "email" });
          } catch (e) {
            console.error("[resend-inbound] attach to client docs", e);
          }
        }

        try {
          const enrichText = [subject, finalText].filter(Boolean).join("\n");
          await enrichLeadFromInbound({
            leadId,
            text: enrichText,
            hasAttachments: stored.length > 0,
          });
        } catch (e) {
          console.error("[resend-inbound] enrichment error", e);
        }

        // OCHRONA PRZED PĘTLAMI — sprawdź zanim auto-agent odpowie
        const inboundHeaders = normalizeHeaders(data.headers ?? data.Headers);
        const skip = await shouldSkipAutoReply({
          leadId,
          fromEmail,
          headers: inboundHeaders,
          threadIds: [messageId, inReplyTo, references].filter(Boolean) as string[],
          subject,
          bodyText: finalText,
        });
        if (skip.skip) {
          console.warn(`[resend-inbound] skip auto-reply: ${skip.reason} (${fromEmail})`);
          return new Response(`skipped:${skip.reason}`, { status: 200 });
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
