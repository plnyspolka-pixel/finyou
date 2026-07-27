// Server-only helpers for email marketing (Resend + AI + segments)
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { wrapBrandedEmail, isAlreadyBranded } from "./email-branding.server";

const RESEND_GATEWAY = "https://connector-gateway.lovable.dev/resend";

export type SegmentFilters = {
  tags?: string[];
  sources?: string[];
  status?: string[];
  createdFrom?: string;
  createdTo?: string;
};

export async function resolveSegmentRecipients(
  filters: SegmentFilters,
): Promise<
  Array<{ id: string; email: string; first_name: string | null; last_name: string | null }>
> {
  let q = supabaseAdmin
    .from("email_subscribers")
    .select("id,email,first_name,last_name")
    .eq("status", "active");

  if (filters.status?.length) q = q.in("status", filters.status);
  if (filters.tags?.length) q = q.overlaps("tags", filters.tags);
  if (filters.sources?.length) q = q.in("source", filters.sources);
  if (filters.createdFrom) q = q.gte("created_at", filters.createdFrom);
  if (filters.createdTo) q = q.lte("created_at", filters.createdTo);

  const { data, error } = await q.limit(10000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function sendViaResend(payload: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  reply_to?: string;
  tags?: { name: string; value: string }[];
  headers?: Record<string, string>;
}): Promise<{ id: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");
  if (!resendKey) throw new Error("RESEND_API_KEY missing");

  const brandedHtml = isAlreadyBranded(payload.html)
    ? payload.html
    : wrapBrandedEmail({ innerHtml: payload.html });

  const res = await fetch(`${RESEND_GATEWAY}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": resendKey,
    },
    body: JSON.stringify({
      from: payload.from,
      to: [payload.to],
      subject: payload.subject,
      html: brandedHtml,
      text: payload.text,
      reply_to: payload.reply_to,
      tags: payload.tags,
      headers: payload.headers,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(body)}`);
  return { id: (body as { id: string }).id };
}

export async function generateEmailCopy(brief: string): Promise<{
  subject: string;
  preview_text: string;
  html: string;
}> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");

  const sys = `Jesteś copywriterem email marketingu w branży finansowej (pożyczki pod nieruchomość, inwestowanie w wierzytelności). Pisz po polsku, konkretnie, bez clickbaitu. Zwracaj WYŁĄCZNIE JSON: {"subject": "...", "preview_text": "...", "html": "<treść HTML>"}. HTML ma być prosty: <p>, <h2>, <ul>, <a href>, bez stylów inline, bez obrazków. Maks 300 słów. Na końcu dodaj <p style="font-size:12px;color:#888">Otrzymałeś tego maila bo zapisałeś się na newsletter FinanceYou. <a href="{{unsubscribe_url}}">Wypisz się</a>.</p>`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: brief },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  const content = body.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as { subject?: string; preview_text?: string; html?: string };
  return {
    subject: parsed.subject ?? "",
    preview_text: parsed.preview_text ?? "",
    html: parsed.html ?? "",
  };
}
