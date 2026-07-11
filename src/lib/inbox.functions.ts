import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Wysyła maila ze skrzynki (nowy lub odpowiedź). Dostępne dla admin / operator. */
export const sendInboxEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      to: z.string().min(3),
      subject: z.string().min(1).max(300),
      body: z.string().min(1).max(50000),
      replyToCommunicationId: z.string().uuid().optional().nullable(),
      /** Wniosek, którego dotyczy wiadomość (np. oferta do inwestorów) —
       *  odpowiedzi będą automatycznie mapowane z powrotem do wniosku. */
      loanApplicationId: z.string().uuid().optional().nullable(),
    }).parse(input),

  )
  .handler(async ({ data, context }) => {
    const [{ data: isAdmin }, { data: isOperator }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "administrator" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operator" }),
    ]);
    if (!isAdmin && !isOperator) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pobierz kontekst wątku (jeśli odpowiedź)
    let leadId: string | null = null;
    let threadId: string | null = null;
    let inReplyTo: string | null = null;
    let references: string | null = null;
    let loanApplicationId: string | null = data.loanApplicationId ?? null;
    if (data.replyToCommunicationId) {
      const { data: parent } = await supabaseAdmin
        .from("lead_communications")
        .select("id, lead_id, loan_application_id, thread_external_id, external_id, metadata")
        .eq("id", data.replyToCommunicationId)
        .maybeSingle();
      if (parent) {
        leadId = parent.lead_id ?? null;
        threadId = parent.thread_external_id ?? null;
        loanApplicationId = loanApplicationId ?? (parent as any).loan_application_id ?? null;
        const meta = (parent.metadata ?? {}) as Record<string, any>;
        inReplyTo = meta.message_id_header ?? parent.external_id ?? null;
        references = meta.references ?? inReplyTo;
      }
    }

    const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#0f172a;white-space:pre-wrap">${
      data.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    }</div>`;

    const emails = data.to.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = emails.filter((e) => !emailRe.test(e));
    if (!emails.length) throw new Error("Brak odbiorców");
    if (invalid.length) throw new Error(`Nieprawidłowe adresy: ${invalid.join(", ")}`);

    const { sendResendEmail } = await import("./resend-send.server");
    const { logLeadCommunication } = await import("./lead-comms.server");

    // Rozpoznaj odbiorców będących inwestorami — ich odpowiedzi mają być
    // mapowane do inwestora i wniosku, a nie traktowane jak nowe leady.
    const investorByEmail = new Map<string, string>();
    {
      const { data: invs } = await supabaseAdmin
        .from("investors")
        .select("id, email")
        .in("email", emails);
      for (const inv of invs ?? []) {
        if (inv.email) investorByEmail.set(String(inv.email).toLowerCase(), inv.id);
      }
    }

    // Adres zwrotny z tagiem wniosku (plus-addressing): odpowiedź instytucji
    // wraca na kontakt+la-<id>@financeyou.pl i webhook odbiorczy mapuje ją
    // deterministycznie do wniosku — nawet gdy nagłówki wątku się pogubią.
    const replyTo = loanApplicationId
      ? `kontakt+la-${loanApplicationId.replace(/-/g, "")}@financeyou.pl`
      : "kontakt@financeyou.pl";

    const results: Array<{ email: string; ok: boolean; id?: string; error?: string }> = [];
    for (const to of emails) {
      const res = await sendResendEmail({
        to,
        subject: data.subject,
        text: data.body,
        html,
        inReplyTo,
        references,
        replyTo,
        showReplyHint: true,
      });
      results.push({ email: to, ok: res.ok, id: res.id, error: res.error });
      try {
        const investorId = investorByEmail.get(to.toLowerCase()) ?? null;
        await logLeadCommunication({
          leadId,
          loanApplicationId,
          investorId,
          email: to,
          channel: "email",
          direction: "outbound",
          status: res.ok ? "sent" : "failed",
          subject: data.subject,
          content: data.body,
          externalId: res.id ?? null,
          threadExternalId: threadId ?? res.id ?? null,
          metadata: {
            source: "inbox_manual",
            sent_by: context.userId,
            thread_id: threadId,
            in_reply_to: inReplyTo,
            ...(investorId ? { investor_id: investorId } : {}),
            ...(loanApplicationId ? { loan_application_id: loanApplicationId } : {}),
          },
        });
      } catch (e) {
        console.error("[sendInboxEmail] log comm error", e);
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    if (okCount === 0) throw new Error(results[0]?.error ?? "send_failed");
    return { ok: true, sent: okCount, total: results.length, results };
  });



/** Zwraca tymczasowy podpisany URL do pliku w buckecie `documents`. */
export const getCommAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { path: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "administrator",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("documents")
      .createSignedUrl(data.path, 3600);
    if (error) throw error;
    return { url: signed.signedUrl };
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

    let html: string | null =
      typeof body.html === "string" ? body.html : null;
    if (html && (body.html_format === "data_uri" || html.startsWith("data:"))) {
      const m = html.match(/^data:([^;,]+)(;base64)?,(.*)$/);
      if (m) {
        const isB64 = !!m[2];
        html = isB64
          ? Buffer.from(m[3], "base64").toString("utf8")
          : decodeURIComponent(m[3]);
      }
    }
    let text: string = typeof body.text === "string" ? body.text : "";
    if (!text && html) {
      text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);
    }

    const updatedMeta = { ...meta, html: html ?? meta.html ?? null, refetched_at: new Date().toISOString() };
    const { error: upErr } = await supabaseAdmin
      .from("lead_communications")
      .update({ content: text || row.content || "", metadata: updatedMeta as any })
      .eq("id", row.id);
    if (upErr) throw upErr;

    return { ok: true, hasHtml: !!html, contentLength: text.length };
  });
