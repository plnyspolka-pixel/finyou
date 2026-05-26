import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KNOWN_PLACEHOLDERS = [
  "klient.imie", "klient.nazwisko", "klient.pelne_imie", "klient.email", "klient.telefon",
  "klient.pesel", "klient.adres",
  "wniosek.kwota", "wniosek.okres_miesiace", "wniosek.oprocentowanie",
  "wniosek.miesięczna_rata", "wniosek.cel",
  "nieruchomosc.adres", "nieruchomosc.miasto", "nieruchomosc.kw",
  "nieruchomosc.powierzchnia", "nieruchomosc.wartosc",
  "dzisiejsza_data", "firma.nazwa", "firma.nip",
];

export const suggestPlaceholders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ content: z.string().min(1).max(50000) }).parse(input)
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false, error: "LOVABLE_API_KEY nieskonfigurowany", placeholders: [] };

    const systemPrompt = `Jesteś asystentem, który analizuje treść szablonu dokumentu prawnego/finansowego po polsku.
Twoje zadanie: znajdź miejsca w tekście, gdzie powinny być placeholdery na zmienne dane (imię klienta, kwota pożyczki, adres nieruchomości itp.) i zaproponuj zamianę.

Dostępne klucze placeholderów (używaj WYŁĄCZNIE tych):
${KNOWN_PLACEHOLDERS.map((p) => "- {{" + p + "}}").join("\n")}

Zwróć JSON z listą propozycji. Każda propozycja zawiera:
- "original": dokładny fragment tekstu do zamiany (max 100 znaków)
- "placeholder": klucz placeholdera z listy powyżej w formacie {{klucz}}
- "reason": krótkie uzasadnienie (max 80 znaków)`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Treść szablonu:\n\n${data.content}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_placeholders",
            description: "Zwraca listę proponowanych placeholderów",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      original: { type: "string" },
                      placeholder: { type: "string" },
                      reason: { type: "string" },
                    },
                    required: ["original", "placeholder", "reason"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["suggestions"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_placeholders" } },
      }),
    });

    if (!res.ok) {
      if (res.status === 429) return { ok: false, error: "Za dużo zapytań, spróbuj za chwilę", placeholders: [] };
      if (res.status === 402) return { ok: false, error: "Brak kredytów Lovable AI — dodaj środki w Ustawieniach", placeholders: [] };
      return { ok: false, error: `AI error ${res.status}`, placeholders: [] };
    }
    const json: any = await res.json();
    try {
      const args = JSON.parse(json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");
      return { ok: true, placeholders: (args.suggestions ?? []) as Array<{ original: string; placeholder: string; reason: string }> };
    } catch {
      return { ok: false, error: "Nie udało się sparsować odpowiedzi AI", placeholders: [] };
    }
  });
