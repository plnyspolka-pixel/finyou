import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";

const KW_REGEX = /\b[A-Z]{2}\d[A-Z0-9]\/\d{8}\/\d\b/g;

/**
 * Scans documents attached to a loan application and tries to extract
 * księga wieczysta numbers via Lovable AI (vision model).
 */
export const detectKwNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        loanApplicationId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("Brak konfiguracji AI (LOVABLE_API_KEY).");
    }

    const { data: docs, error: docsErr } = await supabase
      .from("documents")
      .select("id, file_path, file_name, document_type")
      .eq("loan_application_id", data.loanApplicationId);
    if (docsErr) throw new Error(docsErr.message);

    const candidates = (docs ?? []).filter((d) => {
      const n = (d.file_name ?? "").toLowerCase();
      return /\.(jpe?g|png|webp|heic|heif|pdf)$/.test(n);
    });

    const detected = new Set<string>();

    for (const d of candidates.slice(0, 8)) {
      try {
        const { data: signed, error: se } = await supabase.storage
          .from(CLIENT_FILES_BUCKET)
          .createSignedUrl(d.file_path ?? "", 300);
        if (se || !signed?.signedUrl) continue;
        if (/\.pdf$/i.test(d.file_name ?? "")) continue;

        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content:
                  "Wyodrębnij z obrazu wszystkie numery ksiąg wieczystych w formacie AA1A/00000000/0. Zwróć WYŁĄCZNIE listę numerów, każdy w osobnej linii.",
              },
              {
                role: "user",
                content: [
                  { type: "text", text: "Znajdź numery KW." },
                  { type: "image_url", image_url: { url: signed.signedUrl } },
                ],
              },
            ],
          }),
        });
        if (!resp.ok) continue;
        const json = await resp.json();
        const text: string = json?.choices?.[0]?.message?.content ?? "";
        const matches = text.toUpperCase().match(KW_REGEX) ?? [];
        for (const m of matches) detected.add(m);
      } catch {
        // ignore
      }
    }

    return { detected: Array.from(detected) };
  });

/**
 * Quick OCR on an uploaded document (base64 data URL) to find a KW number.
 * Used directly in the loan application step 6 — no storage required.
 */
export const extractKwFromUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        dataUrl: z.string().min(20).max(15_000_000), // ~11MB base64
        mimeType: z.string().min(3).max(100),
        fileName: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Brak konfiguracji AI.");

    const isPdf = data.mimeType === "application/pdf" || /\.pdf$/i.test(data.fileName ?? "");
    const isImage = data.mimeType.startsWith("image/");
    if (!isPdf && !isImage) {
      return { found: false, numbers: [] as string[], reason: "unsupported" as const };
    }

    const userContent: unknown[] = [
      {
        type: "text",
        text: "Wyodrębnij z dokumentu wszystkie numery ksiąg wieczystych w polskim formacie AA1A/00000000/0 (np. WA1M/00012345/6). Zwróć WYŁĄCZNIE listę numerów, każdy w osobnej linii. Jeśli nie ma żadnego, zwróć pusty tekst.",
      },
    ];
    if (isImage) {
      userContent.push({ type: "image_url", image_url: { url: data.dataUrl } });
    } else {
      userContent.push({
        type: "file",
        file: {
          filename: data.fileName ?? "document.pdf",
          file_data: data.dataUrl,
        },
      });
    }

    let text = "";
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "Jesteś asystentem OCR specjalizującym się w polskich dokumentach nieruchomościowych.",
            },
            { role: "user", content: userContent },
          ],
        }),
      });
      if (resp.status === 429)
        return { found: false, numbers: [], reason: "rate_limited" as const };
      if (resp.status === 402) return { found: false, numbers: [], reason: "ai_quota" as const };
      if (!resp.ok) return { found: false, numbers: [], reason: "ai_error" as const };
      const json = await resp.json();
      text = json?.choices?.[0]?.message?.content ?? "";
    } catch {
      return { found: false, numbers: [], reason: "ai_error" as const };
    }

    const matches = Array.from(new Set(text.toUpperCase().match(KW_REGEX) ?? []));
    if (matches.length === 0) {
      return { found: false, numbers: [], reason: "not_found" as const };
    }
    return { found: true, numbers: matches, reason: "ok" as const };
  });
