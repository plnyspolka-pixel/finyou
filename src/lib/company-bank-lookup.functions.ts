// Wyszukuje publicznie dostępny numer rachunku bankowego firmy w internecie (Perplexity Sonar).
// Zwraca znormalizowany NRB/IBAN i źródła. NIE używać wyniku bez ręcznej weryfikacji.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { detectPolishBankAccount } from "@/lib/polish-bank";

const InputSchema = z.object({
  companyName: z.string().trim().max(255).optional().default(""),
  nip: z.string().trim().max(20).optional().default(""),
  krs: z.string().trim().max(20).optional().default(""),
  regon: z.string().trim().max(20).optional().default(""),
});

export type CompanyBankLookupResult = {
  success: boolean;
  account: string | null;
  normalized: string | null;
  bankName: string | null;
  sources: string[];
  rationale: string;
  message?: string;
};

function extractAccountCandidates(text: string): string[] {
  // Łapiemy ciągi cyfr (z opcjonalnymi spacjami) zawierające 26 cyfr, opcjonalnie z prefiksem PL.
  const out = new Set<string>();
  const re = /(PL\s?)?(\d[\d\s]{30,40}\d)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = (m[1] ?? "") + m[2];
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 26 || (digits.length === 28 && raw.toUpperCase().startsWith("PL"))) {
      out.add(raw.replace(/\s+/g, " ").trim());
    }
  }
  return [...out];
}

export const companyBankAccountLookup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<CompanyBankLookupResult> => {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        account: null,
        normalized: null,
        bankName: null,
        sources: [],
        rationale: "",
        message: "Brak PERPLEXITY_API_KEY.",
      };
    }
    const companyHint =
      data.companyName || (data.krs ? `KRS ${data.krs}` : data.nip ? `NIP ${data.nip}` : "");
    if (!companyHint) {
      return {
        success: false,
        account: null,
        normalized: null,
        bankName: null,
        sources: [],
        rationale: "",
        message: "Brak danych identyfikujących firmę.",
      };
    }

    const prompt =
      `Znajdź publicznie podany numer rachunku bankowego (NRB / IBAN) polskiej firmy "${companyHint}"` +
      (data.nip ? ` (NIP ${data.nip})` : "") +
      (data.krs ? ` (KRS ${data.krs})` : "") +
      `. Przeszukaj WYŁĄCZNIE wiarygodne źródła: oficjalna strona firmy (stopka, kontakt, dane do przelewu), Biała Lista podatników VAT (whitelist.mf.gov.pl), faktury pro forma w PDF udostępnione publicznie, BIP. ` +
      `Pomiń fora, social media, ogłoszenia. Jeżeli znajdziesz kilka różnych numerów, wybierz ten, który jest najczęściej publikowany jako oficjalny rachunek rozliczeniowy w PLN. ` +
      `Odpowiedz WYŁĄCZNIE poprawnym JSON-em: ` +
      `{"account":"PL00 0000 0000 0000 0000 0000 0000 lub null","bankName":"nazwa banku lub null","sources":["url1","url2"],"rationale":"krótko skąd"}. ` +
      `Jeżeli nie znajdziesz rachunku w wiarygodnych źródłach, zwróć {"account":null,"bankName":null,"sources":[],"rationale":"…"}.`;

    try {
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            {
              role: "system",
              content:
                "Jesteś analitykiem danych rejestrowych w Polsce. Odpowiadasz wyłącznie poprawnym JSON-em.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
          search_domain_filter: ["whitelist.mf.gov.pl", "podatki.gov.pl", "gov.pl"],
        }),
      });
      if (!res.ok) {
        return {
          success: false,
          account: null,
          normalized: null,
          bankName: null,
          sources: [],
          rationale: "",
          message: `Perplexity HTTP ${res.status}`,
        };
      }
      const json: any = await res.json();
      const content: string = json?.choices?.[0]?.message?.content ?? "";
      const citations: string[] = Array.isArray(json?.citations) ? json.citations : [];

      let parsed: any = null;
      try {
        const m = content.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : null;
      } catch {
        parsed = null;
      }

      let candidate: string | null = parsed?.account ? String(parsed.account) : null;
      if (!candidate) {
        // fallback: szukamy w treści
        const cand = extractAccountCandidates(content);
        if (cand.length === 1) candidate = cand[0];
      }
      if (!candidate) {
        return {
          success: false,
          account: null,
          normalized: null,
          bankName: null,
          sources: citations.slice(0, 5),
          rationale: String(parsed?.rationale ?? "").slice(0, 500),
          message: "Nie znaleziono numeru rachunku.",
        };
      }

      const detected = detectPolishBankAccount(candidate);
      if (!detected.success) {
        return {
          success: false,
          account: candidate,
          normalized: null,
          bankName: null,
          sources: (Array.isArray(parsed?.sources) ? parsed.sources : citations).slice(0, 5),
          rationale: String(parsed?.rationale ?? "").slice(0, 500),
          message: "Znaleziony numer nie przeszedł walidacji NRB.",
        };
      }

      return {
        success: true,
        account: candidate,
        normalized: detected.normalized,
        bankName: detected.bankName ?? (parsed?.bankName ? String(parsed.bankName) : null),
        sources: (Array.isArray(parsed?.sources) && parsed.sources.length
          ? parsed.sources
          : citations
        ).slice(0, 5),
        rationale: String(parsed?.rationale ?? "").slice(0, 500),
      };
    } catch (e: any) {
      return {
        success: false,
        account: null,
        normalized: null,
        bankName: null,
        sources: [],
        rationale: "",
        message: e?.message ?? "Błąd Perplexity.",
      };
    }
  });
