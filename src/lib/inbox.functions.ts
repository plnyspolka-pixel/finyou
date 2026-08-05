import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";

/** Wysyła maila ze skrzynki (nowy lub odpowiedź). Dostępne dla admin / operator. */
export const sendInboxEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        to: z.string().min(3),
        subject: z.string().min(1).max(300),
        body: z.string().min(1).max(50000),
        replyToCommunicationId: z.string().uuid().optional().nullable(),
        attachments: z
          .array(
            z.object({
              name: z.string().min(1).max(200),
              path: z.string().max(1000).optional().nullable(),
              bucket: z.string().max(100).optional().nullable(),
              url: z.string().max(2000).optional().nullable(),
              mime: z.string().max(150).optional().nullable(),
              size: z.number().int().nonnegative().optional().nullable(),
            }),
          )
          .max(15)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Skrzynka to narzędzie premium: personel wewnętrzny albo pośrednik
    // z aktywnym płatnym pakietem.
    const { brokerHasPaidAccess } = await import("@/lib/access/guards.server");
    if (!(await brokerHasPaidAccess(context.userId))) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pobierz kontekst wątku (jeśli odpowiedź)
    let leadId: string | null = null;
    let threadId: string | null = null;
    let inReplyTo: string | null = null;
    let references: string | null = null;
    if (data.replyToCommunicationId) {
      const { data: parent } = await supabaseAdmin
        .from("lead_communications")
        .select("id, lead_id, thread_external_id, external_id, metadata")
        .eq("id", data.replyToCommunicationId)
        .maybeSingle();
      if (parent) {
        leadId = parent.lead_id ?? null;
        threadId = parent.thread_external_id ?? null;
        const meta = (parent.metadata ?? {}) as Record<string, any>;
        inReplyTo = meta.message_id_header ?? parent.external_id ?? null;
        references = meta.references ?? inReplyTo;
      }
    }

    const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;white-space:pre-wrap">${data.body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</div>`;

    const emails = data.to
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = emails.filter((e) => !emailRe.test(e));
    if (!emails.length) throw new Error("Brak odbiorców");
    if (invalid.length) throw new Error(`Nieprawidłowe adresy: ${invalid.join(", ")}`);

    const { sendResendEmail } = await import("./resend-send.server");
    const { logLeadCommunication } = await import("./lead-comms.server");

    // Załączniki: pobierz pliki raz (Storage/URL → base64) i dołącz je do maila
    // jako prawdziwe pliki. Jeśli któregoś nie da się pobrać — nie wysyłaj
    // "po cichu" maila bez załącznika, tylko zgłoś błąd nadawcy.
    let resolvedAttachments: Array<{ filename: string; content: string; contentType?: string }> =
      [];
    const attachmentRefs = data.attachments ?? [];
    if (attachmentRefs.length) {
      const { resolveOutboundAttachments } = await import("./outbound-attachments.server");
      const { attachments, errors } = await resolveOutboundAttachments(attachmentRefs);
      if (errors.length) throw new Error(errors.join(" "));
      resolvedAttachments = attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      }));
    }

    const results: Array<{ email: string; ok: boolean; id?: string; error?: string }> = [];
    for (const to of emails) {
      const res = await sendResendEmail({
        to,
        subject: data.subject,
        text: data.body,
        html,
        inReplyTo,
        references,
        replyTo: "kontakt@financeyou.pl",
        showReplyHint: true,
        attachments: resolvedAttachments.length ? resolvedAttachments : undefined,
      });
      results.push({ email: to, ok: res.ok, id: res.id, error: res.error });
      try {
        await logLeadCommunication({
          leadId,
          email: to,
          channel: "email",
          direction: "outbound",
          status: res.ok ? "sent" : "failed",
          subject: data.subject,
          content: data.body,
          externalId: res.id ?? null,
          metadata: {
            source: "inbox_manual",
            sent_by: context.userId,
            thread_id: threadId,
            in_reply_to: inReplyTo,
          },
          attachments: attachmentRefs.length
            ? attachmentRefs.map((a) => ({
                name: a.name,
                path: a.path ?? null,
                url: a.url ?? null,
                mime: a.mime ?? null,
                size: a.size ?? null,
              }))
            : null,
        });
      } catch (e) {
        console.error("[sendInboxEmail] log comm error", e);
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    if (okCount === 0) throw new Error(results[0]?.error ?? "send_failed");
    return { ok: true, sent: okCount, total: results.length, results };
  });

/** Zwraca tymczasowy podpisany URL do pliku w buckecie `pliki-klienta`. Dostępne dla admin / operator. */
export const getCommAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ path: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    // Skrzynka to narzędzie premium: personel wewnętrzny albo pośrednik
    // z aktywnym płatnym pakietem.
    const { brokerHasPaidAccess } = await import("@/lib/access/guards.server");
    if (!(await brokerHasPaidAccess(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Podpisujemy WYŁĄCZNIE ścieżki będące faktycznym załącznikiem korespondencji
    // z lead-a — inaczej dowolny płatny pośrednik mógłby podpisać URL do dowolnego
    // pliku klienta (skany dowodów, KW) spoza puli leadów.
    const { data: refRow } = await supabaseAdmin
      .from("lead_communications")
      .select("id")
      .contains("attachments", [{ path: data.path }])
      .limit(1)
      .maybeSingle();
    if (!refRow) throw new Error("Forbidden");
    // Załączniki mogą leżeć w "pliki-klienta" (nowe) lub "documents" (legacy).
    const buckets = [CLIENT_FILES_BUCKET, "documents"];
    for (const bucket of buckets) {
      const { data: signed, error } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(data.path, 3600);
      if (!error && signed?.signedUrl) return { url: signed.signedUrl };
    }
    return { url: null as string | null, missing: true };
  });

/**
 * Pobiera treść wiadomości inbound z Resend API i aktualizuje wiersz
 * lead_communications, jeśli `metadata.email_id` jest dostępne.
 */
export const refetchInboundEmailBody = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "administrator",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("lead_communications")
      .select("id, metadata, external_id, content, subject")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Wiadomość nie istnieje");

    const meta = (row.metadata ?? {}) as Record<string, any>;
    const emailId: string | null = meta.email_id ?? null;
    if (!emailId) {
      throw new Error(
        "Brak email_id w metadanych (stara wiadomość) — nie można pobrać treści z Resend.",
      );
    }

    const GATEWAY = "https://connector-gateway.lovable.dev/resend";
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      throw new Error("Brak konfiguracji Resend (LOVABLE_API_KEY / RESEND_API_KEY)");
    }

    const r = await fetch(`${GATEWAY}/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      if (r.status === 401 && /restricted_api_key|restricted to only send/i.test(errText)) {
        throw new Error(
          "Klucz RESEND_API_KEY ma uprawnienia tylko do wysyłki maili. Aby pobierać treść wiadomości przychodzących, wygeneruj w panelu Resend klucz z pełnym dostępem (Full access) i zaktualizuj sekret RESEND_API_KEY.",
        );
      }
      throw new Error(`Resend API ${r.status}: ${errText}`);
    }
    const body: any = await r.json();

    let html: string | null = typeof body.html === "string" ? body.html : null;
    if (html && (body.html_format === "data_uri" || html.startsWith("data:"))) {
      const m = html.match(/^data:([^;,]+)(;base64)?,(.*)$/);
      if (m) {
        const isB64 = !!m[2];
        html = isB64 ? Buffer.from(m[3], "base64").toString("utf8") : decodeURIComponent(m[3]);
      }
    }
    let text: string = typeof body.text === "string" ? body.text : "";
    if (!text && html) {
      text = html
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 8000);
    }

    const updatedMeta = {
      ...meta,
      html: html ?? meta.html ?? null,
      refetched_at: new Date().toISOString(),
    };
    const { error: upErr } = await supabaseAdmin
      .from("lead_communications")
      .update({ content: text || row.content || "", metadata: updatedMeta as any })
      .eq("id", row.id);
    if (upErr) throw upErr;

    return { ok: true, hasHtml: !!html, contentLength: text.length };
  });
