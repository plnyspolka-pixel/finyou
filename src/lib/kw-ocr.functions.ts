import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KW_REGEX = /\b[A-Z]{2}\d[A-Z]\/\d{8}\/\d\b/g;

/**
 * Scans documents attached to a loan application and tries to extract
 * księga wieczysta numbers via Lovable AI (vision model).
 * Returns a de-duplicated list of detected KW numbers.
 */
export const detectKwNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      loanApplicationId: z.string().uuid(),
    }).parse(input),
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
          .from("documents")
          .createSignedUrl(d.file_path, 300);
        if (se || !signed?.signedUrl) continue;

        const isPdf = /\.pdf$/i.test(d.file_name ?? "");
        // Vision models accept image_url; skip PDF (Gemini handles via url too, but keep simple)
        if (isPdf) continue;

        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content:
                  "Wyodrębnij z obrazu wszystkie numery ksiąg wieczystych w formacie AA1A/00000000/0 (np. WA1M/00012345/6). Zwróć WYŁĄCZNIE listę numerów, każdy w osobnej linii. Bez komentarzy.",
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
        // ignore single doc failures
      }
    }

    return { detected: Array.from(detected) };
  });
