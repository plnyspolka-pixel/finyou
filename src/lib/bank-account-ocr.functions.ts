import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const IBAN_REGEX = /(?:PL)?\s*\d{2}(?:[\s-]?\d{4}){6}/gi;

function normalizeIban(s: string): string {
  return s.replace(/[\s-]/g, "").toUpperCase().replace(/^PL/, "");
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Weryfikuje rachunek bankowy klienta na podstawie wgranego dokumentu bankowego.
 * Sprawdza, czy w dokumencie znajduje się jego IBAN oraz imię/nazwisko lub nazwa firmy.
 */
export const verifyBankAccountDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        dataUrl: z.string().min(20).max(15_000_000),
        mimeType: z.string().min(3).max(100),
        fileName: z.string().max(200).optional(),
        expectedIban: z.string().min(10).max(40),
        expectedHolder: z.string().min(2).max(300),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Brak konfiguracji AI.");

    const isPdf = data.mimeType === "application/pdf" || /\.pdf$/i.test(data.fileName ?? "");
    const isImage = data.mimeType.startsWith("image/");
    if (!isPdf && !isImage) {
      return {
        ok: false,
        reason: "unsupported" as const,
        ibanMatch: false,
        holderMatch: false,
        foundIbans: [] as string[],
        foundHolder: "",
      };
    }

    const userContent: unknown[] = [
      {
        type: "text",
        text: 'To jest dokument bankowy (potwierdzenie konta, wyciąg, umowa, blankiet przelewu). Wyodrębnij: 1) wszystkie numery rachunków bankowych (IBAN, 26 cyfr lub format PL + 26 cyfr), 2) pełne imię i nazwisko właściciela rachunku lub nazwę firmy (posiadacza konta). Zwróć WYŁĄCZNIE JSON w formacie: {"ibans":["..."],"holder":"..."}. Bez komentarzy.',
      },
    ];
    if (isImage) userContent.push({ type: "image_url", image_url: { url: data.dataUrl } });
    else
      userContent.push({
        type: "file",
        file: { filename: data.fileName ?? "document.pdf", file_data: data.dataUrl },
      });

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
                "Jesteś asystentem OCR specjalizującym się w polskich dokumentach bankowych. Odpowiadasz wyłącznie poprawnym JSON-em.",
            },
            { role: "user", content: userContent },
          ],
        }),
      });
      if (resp.status === 429)
        return {
          ok: false,
          reason: "rate_limited" as const,
          ibanMatch: false,
          holderMatch: false,
          foundIbans: [],
          foundHolder: "",
        };
      if (resp.status === 402)
        return {
          ok: false,
          reason: "ai_quota" as const,
          ibanMatch: false,
          holderMatch: false,
          foundIbans: [],
          foundHolder: "",
        };
      if (!resp.ok)
        return {
          ok: false,
          reason: "ai_error" as const,
          ibanMatch: false,
          holderMatch: false,
          foundIbans: [],
          foundHolder: "",
        };
      const json = await resp.json();
      text = json?.choices?.[0]?.message?.content ?? "";
    } catch {
      return {
        ok: false,
        reason: "ai_error" as const,
        ibanMatch: false,
        holderMatch: false,
        foundIbans: [],
        foundHolder: "",
      };
    }

    let ibans: string[] = [];
    let holder = "";
    try {
      const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
      const parsed = JSON.parse(cleaned);
      ibans = Array.isArray(parsed?.ibans) ? parsed.ibans.map(String) : [];
      holder = typeof parsed?.holder === "string" ? parsed.holder : "";
    } catch {
      const matches = text.match(IBAN_REGEX) ?? [];
      ibans = matches.map(String);
    }

    // Dodatkowo skanuj cały tekst regexem
    const extra = text.match(IBAN_REGEX) ?? [];
    for (const e of extra) if (!ibans.includes(e)) ibans.push(e);

    const expectedIban = normalizeIban(data.expectedIban);
    const normalizedFound = ibans.map(normalizeIban);
    const ibanMatch = normalizedFound.some(
      (i) => i.endsWith(expectedIban.slice(-20)) || i === expectedIban,
    );

    const expectedTokens = normalizeName(data.expectedHolder)
      .split(" ")
      .filter((t) => t.length >= 3);
    const holderNorm = normalizeName(holder + " " + text);
    const matchedTokens = expectedTokens.filter((t) => holderNorm.includes(t));
    const holderMatch =
      expectedTokens.length > 0 && matchedTokens.length >= Math.min(2, expectedTokens.length);

    const ok = ibanMatch && holderMatch;

    // Zapisz status, jeśli OK
    if (ok) {
      const { supabase, userId } = context;
      await supabase
        .from("clients")
        .update({
          bank_account_verified_at: new Date().toISOString(),
          bank_account_holder_ocr: holder || null,
        })
        .eq("user_id", userId);
    }

    return {
      ok,
      reason: ok ? ("ok" as const) : ("mismatch" as const),
      ibanMatch,
      holderMatch,
      foundIbans: ibans,
      foundHolder: holder,
    };
  });
