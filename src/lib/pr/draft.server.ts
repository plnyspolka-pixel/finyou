// Digital PR — generowanie draftu komentarza eksperckiego dla okazji
// medialnej (Lovable AI gateway). Twarde zasady promptu SEO §MODUŁ 4:
//  * draft NIE zawiera żadnych danych liczbowych, których nie mamy w tabelach
//    referencyjnych — potrzebna liczba spoza danych = [DO UZUPEŁNIENIA],
//  * podpis: Filip Bielak, Prezes Zarządu Finance You,
//  * po polsku, ton profesjonalny, zero obietnic niezgodnych z prawem.
// Wysyłką zajmuje się WYŁĄCZNIE człowiek w panelu (pr.functions.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = process.env.PR_DRAFT_MODEL ?? "google/gemini-2.5-flash";

const db = supabaseAdmin as unknown as SupabaseClient;

const SYSTEM_PROMPT = `Jesteś specjalistą PR firmy Finance You sp. z o.o. (pożyczki prywatne pod zastaw nieruchomości, rynek polski). Piszesz draft maila do dziennikarza/redakcji z propozycją komentarza eksperckiego do ich publikacji.

ZASADY BEZWZGLĘDNE:
1. Pisz po polsku, profesjonalnie i zwięźle (mail maks. ~200 słów + komentarz ekspercki 3-5 zdań).
2. NIE WOLNO podawać ŻADNYCH danych liczbowych (statystyk, procentów, kwot, dat rynkowych) — jeżeli liczba wzmocniłaby komentarz, wstaw w jej miejsce dokładnie: [DO UZUPEŁNIENIA]. Jedyny wyjątek: parametry produktu Finance You (finansowanie do 1 mln zł, decyzja w 24 h).
3. Zero obietnic niezgodnych z prawem: żadnych "gwarantowana pożyczka", "bez weryfikacji", "pewny zysk".
4. Komentarz podpisany: Filip Bielak, Prezes Zarządu Finance You.
5. Struktura maila: krótkie nawiązanie do artykułu, propozycja gotowego komentarza eksperckiego (cytat), oferta rozszerzenia/rozmowy, stopka z podpisem i adresem https://financeyou.pl.
6. Nie wymyślaj faktów o artykule — korzystaj tylko z przekazanego tytułu i opisu.`;

export async function generatePrDraft(opportunityId: string): Promise<{
  ok: boolean;
  subject?: string;
  body?: string;
  error?: string;
}> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { ok: false, error: "LOVABLE_API_KEY missing" };

  const { data: opp, error } = await db
    .from("pr_opportunities")
    .select("id, source, url, topic, snippet, matched_phrases, status")
    .eq("id", opportunityId)
    .maybeSingle();
  if (error || !opp) return { ok: false, error: error?.message ?? "Okazja nie istnieje" };

  const user = [
    `Artykuł/okazja medialna:`,
    `Tytuł: ${opp.topic}`,
    `Źródło: ${opp.source}`,
    `URL: ${opp.url}`,
    opp.snippet ? `Opis: ${opp.snippet}` : null,
    `Monitorowane frazy: ${(opp.matched_phrases ?? []).join(", ")}`,
    ``,
    `Przygotuj draft maila outreach z komentarzem eksperckim.`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "save_draft",
            description: "Zapisz draft maila outreach",
            parameters: {
              type: "object",
              properties: {
                subject: { type: "string", description: "Temat maila (po polsku, konkretny)" },
                body: {
                  type: "string",
                  description: "Pełna treść maila (plain text) z komentarzem eksperckim i podpisem",
                },
              },
              required: ["subject", "body"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "save_draft" } },
    }),
  });
  if (res.status === 429)
    return { ok: false, error: "Zbyt wiele zapytań do AI. Spróbuj za chwilę." };
  if (res.status === 402) return { ok: false, error: "Wyczerpany limit AI (Lovable Cloud)." };
  if (!res.ok) return { ok: false, error: `AI gateway: ${res.status}` };

  const json = (await res.json()) as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  };
  let subject = "";
  let body = "";
  try {
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    const args = JSON.parse(call?.function?.arguments ?? "{}");
    subject = String(args.subject ?? "").trim();
    body = String(args.body ?? "").trim();
  } catch {
    return { ok: false, error: "Nieparsowalna odpowiedź AI" };
  }
  if (!subject || !body) return { ok: false, error: "AI nie zwróciło kompletnego draftu" };

  // Pas bezpieczeństwa po stronie kodu: liczby inne niż parametry produktu
  // (1 mln zł / 24 h) i przypisy [DO UZUPEŁNIENIA] są podejrzane — nie
  // blokujemy (człowiek i tak czyta draft przed wysyłką), ale oznaczamy.
  const suspicious = /\b\d{2,}([ .,]\d{3})*\s*(%|zł|pln|mld|tys)/i.test(
    body.replace(/1\s*(mln|000\s*000)\s*zł/gi, "").replace(/24\s*h/gi, ""),
  );
  const finalBody = suspicious
    ? `${body}\n\n[UWAGA DLA ZATWIERDZAJĄCEGO: draft zawiera dane liczbowe — zweryfikuj je przed wysyłką lub zastąp placeholderem [DO UZUPEŁNIENIA].]`
    : body;

  const { error: upErr } = await db
    .from("pr_opportunities")
    .update({
      draft_subject: subject,
      draft_body: finalBody,
      draft_generated_at: new Date().toISOString(),
      status: "drafted",
    })
    .eq("id", opportunityId);
  if (upErr) return { ok: false, error: upErr.message };

  return { ok: true, subject, body: finalBody };
}
