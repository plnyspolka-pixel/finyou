// Auto-wzbogacanie zamaskowanych danych osobowych z KRS o pełne imiona/nazwiska
// znalezione w internecie. Używa Perplexity Sonar (web search + LLM).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type EnrichmentResult = {
  success: true;
  originalValue: string;
  enriched: boolean;
  displayValue: string;
  fullName: string | null;
  function: string | null;
};

const PL_LOWER = (s: string) => s.toLocaleLowerCase("pl-PL");

/** Czy wartość zawiera typowy wzorzec zamaskowania (gwiazdki w środku słowa). */
export function isMasked(value: string): boolean {
  if (!value) return false;
  return /\*/.test(value);
}

/** Wyciąga "kawałki" (segmenty słów) z zamaskowanego ciągu, np. "F**** R***** B*****" -> ["F","R","B"] inicjały. */
function extractMaskedInitials(masked: string): string[] {
  // Dla każdego segmentu zawierającego litery i gwiazdki bierzemy pierwszą literę.
  return masked
    .split(/[\s,;]+/)
    .map((seg) => seg.trim())
    .filter((seg) => /\*/.test(seg) && /[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/.test(seg))
    .map((seg) => {
      const m = seg.match(/[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/);
      return m ? PL_LOWER(m[0]) : "";
    })
    .filter(Boolean);
}

/**
 * Porównuje inicjały zamaskowanego wzoru z kandydatem pełnego imienia i nazwiska.
 * Obsługuje drugie imię, polskie znaki, ignoruje wielkość liter.
 */
export function matchesMaskedPerson(maskedValue: string, candidateFullName: string): boolean {
  const maskedInitials = extractMaskedInitials(maskedValue);
  if (maskedInitials.length < 2) return false;

  const candidateTokens = candidateFullName
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}-]/gu, ""))
    .filter(Boolean);
  if (candidateTokens.length < maskedInitials.length) return false;

  const candidateInitials = candidateTokens.map((t) => PL_LOWER(t.charAt(0)));

  // Wzór musi być prefiksem inicjałów kandydata (dopuszczamy dodatkowe segmenty kandydata na końcu).
  for (let i = 0; i < maskedInitials.length; i++) {
    if (maskedInitials[i] !== candidateInitials[i]) return false;
  }
  return true;
}

const InputSchema = z.object({
  companyName: z.string().trim().max(255).optional().default(""),
  nip: z.string().trim().max(20).optional().default(""),
  regon: z.string().trim().max(20).optional().default(""),
  krs: z.string().trim().max(20).optional().default(""),
  maskedPerson: z.string().trim().min(1).max(255),
  function: z.string().trim().max(255).optional().default(""),
  representationMethodRaw: z.string().trim().max(2000).optional().default(""),
});

type CandidateFromAI = {
  fullName: string;
  function?: string;
  confidence?: number;
  source?: string;
};

function buildCacheKey(d: z.infer<typeof InputSchema>) {
  return [d.krs || "", d.nip || "", d.companyName || "", d.maskedPerson, d.function || ""]
    .map((x) => x.replace(/\s+/g, " ").trim().toLowerCase())
    .join("|");
}

async function askPerplexity(input: z.infer<typeof InputSchema>): Promise<CandidateFromAI[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return [];

  const companyHint =
    input.companyName || (input.krs ? `KRS ${input.krs}` : input.nip ? `NIP ${input.nip}` : "");
  const fnHint = input.function ? ` pełniąca funkcję "${input.function}"` : "";

  const prompt =
    `Szukam pełnego imienia i nazwiska osoby z polskiej spółki "${companyHint}"` +
    (input.krs ? ` (KRS ${input.krs})` : "") +
    (input.nip ? ` (NIP ${input.nip})` : "") +
    `${fnHint}. Z rejestru KRS znana jest tylko zamaskowana wersja: "${input.maskedPerson}". ` +
    `Znajdź w wiarygodnych źródłach (strona spółki, BIP, prasa branżowa, wpisy KRS w bazach komercyjnych, LinkedIn) ` +
    `pełną wersję imienia i nazwiska tej osoby. ` +
    `Zwróć WYŁĄCZNIE poprawny JSON o strukturze: ` +
    `{"candidates":[{"fullName":"Imię (Drugie) Nazwisko","function":"PREZES ZARZĄDU","confidence":0.0-1.0,"source":"krótko skąd"}]}. ` +
    `Maksymalnie 5 kandydatów. Jeżeli nie znajdziesz nic wiarygodnego, zwróć {"candidates":[]}.`;

  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        {
          role: "system",
          content:
            "Jesteś analitykiem danych rejestrowych w Polsce. Odpowiadaj zwięźle, tylko JSON-em.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "candidates",
          schema: {
            type: "object",
            properties: {
              candidates: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    fullName: { type: "string" },
                    function: { type: "string" },
                    confidence: { type: "number" },
                    source: { type: "string" },
                  },
                  required: ["fullName"],
                },
              },
            },
            required: ["candidates"],
          },
        },
      },
    }),
  });

  if (!res.ok) {
    console.error(
      "[krs-enrichment] perplexity error",
      res.status,
      await res.text().catch(() => ""),
    );
    return [];
  }
  const json: any = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(content);
    const arr = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    return arr
      .filter((c: any) => typeof c?.fullName === "string" && c.fullName.trim().length > 2)
      .map((c: any) => ({
        fullName: String(c.fullName).trim(),
        function: c.function ? String(c.function).trim() : undefined,
        confidence: typeof c.confidence === "number" ? c.confidence : undefined,
        source: c.source ? String(c.source).trim() : undefined,
      }));
  } catch {
    return [];
  }
}

/** Wybiera najlepszego kandydata albo null jeżeli wynik jest niejednoznaczny. */
export function selectBestRepresentationCandidate(
  results: CandidateFromAI[],
  maskedPerson: string,
  functionName: string,
): CandidateFromAI | null {
  if (!results.length) return null;

  // 1) zostaw tylko zgodne z inicjałami
  const matching = results.filter((r) => matchesMaskedPerson(maskedPerson, r.fullName));
  if (!matching.length) return null;

  // 2) policz wystąpienia (zwijając po znormalizowanej pełnej nazwie)
  const norm = (s: string) => PL_LOWER(s).replace(/\s+/g, " ").trim();
  const counts = new Map<string, { c: CandidateFromAI; n: number; score: number }>();
  for (const c of matching) {
    const key = norm(c.fullName);
    const prev = counts.get(key);
    let score = 0;
    if (
      c.function &&
      functionName &&
      PL_LOWER(c.function).includes(PL_LOWER(functionName).slice(0, 6))
    )
      score += 2;
    if (typeof c.confidence === "number") score += c.confidence;
    if (prev) {
      prev.n += 1;
      prev.score += score + 1; // bonus za powtórzenie
    } else {
      counts.set(key, { c, n: 1, score });
    }
  }

  const ranked = [...counts.values()].sort((a, b) => b.score + b.n - (a.score + a.n));
  const top = ranked[0];
  if (!top) return null;

  // 3) sprzeczność: dwóch różnych kandydatów ze zbliżonym wynikiem
  if (ranked.length > 1) {
    const second = ranked[1];
    const topScore = top.score + top.n;
    const secScore = second.score + second.n;
    if (secScore >= topScore * 0.8 && norm(top.c.fullName) !== norm(second.c.fullName)) {
      return null;
    }
  }
  return top.c;
}

export const companyRepresentationAutoEnrichment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<EnrichmentResult> => {
    const fn = data.function || "";
    const originalValue = data.maskedPerson + (fn ? ` — ${fn}` : "");

    // Jeśli niezamaskowane — nie ruszamy.
    if (!isMasked(data.maskedPerson)) {
      return {
        success: true,
        originalValue,
        enriched: false,
        displayValue: originalValue,
        fullName: data.maskedPerson,
        function: fn || null,
      };
    }

    const cacheKey = buildCacheKey(data);

    // Cache lookup
    const { data: cached } = await supabaseAdmin
      .from("representation_web_enrichment_cache")
      .select("final_display_value, full_name, was_auto_enriched, expires_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
      return {
        success: true,
        originalValue,
        enriched: !!cached.was_auto_enriched,
        displayValue: cached.final_display_value,
        fullName: cached.full_name ?? null,
        function: fn || null,
      };
    }

    let displayValue = originalValue;
    let fullName: string | null = null;
    let wasEnriched = false;
    let rawResults: CandidateFromAI[] = [];

    try {
      rawResults = await askPerplexity(data);
      const best = selectBestRepresentationCandidate(rawResults, data.maskedPerson, fn);
      if (best) {
        fullName = best.fullName;
        displayValue = fullName + (fn ? ` — ${fn}` : "");
        wasEnriched = true;
      }
    } catch (e) {
      console.error("[krs-enrichment] failure", (e as Error).message);
    }

    // Zapis do cache (na 7 dni); ignorujemy konflikt
    await supabaseAdmin.from("representation_web_enrichment_cache").upsert(
      {
        cache_key: cacheKey,
        company_name: data.companyName || null,
        nip: data.nip || null,
        krs: data.krs || null,
        masked_person: data.maskedPerson,
        function: fn || null,
        original_value: originalValue,
        final_display_value: displayValue,
        full_name: fullName,
        was_auto_enriched: wasEnriched,
        raw_internal_results: rawResults as any,
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "cache_key" },
    );

    return {
      success: true,
      originalValue,
      enriched: wasEnriched,
      displayValue,
      fullName,
      function: fn || null,
    };
  });
