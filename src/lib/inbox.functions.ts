import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      throw new Error(`Resend API ${r.status}: ${await r.text().catch(() => "")}`);
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
