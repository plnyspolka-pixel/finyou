// Opis materiału marketingowego pisany przez AI — wspólne dla server function
// panelu (generateMaterialDescription) i narzędzia MCP generate_material_description.
const SYS = `Jesteś copywriterem Finance You. Twórz krótkie (max 280 znaków), konkretne opisy materiałów marketingowych do publikacji w social media (FB/IG/LinkedIn). Po polsku, bez clickbaitu, z naturalnym CTA. Zwracaj sam tekst, bez cudzysłowów.`;

export function audienceLabel(audience: string): string {
  return audience === "klient"
    ? "klient indywidualny szukający pożyczki pod nieruchomość"
    : audience === "inwestor"
      ? "inwestor lokujący kapitał w pożyczki pod hipotekę"
      : "pośrednik / partner sprzedaży";
}

/** Generuje opis (bez zapisu) — Lovable AI gateway, model Gemini Flash. */
export async function generateMaterialDescriptionText(input: {
  audience: string;
  title: string;
  userDescription?: string | null;
}): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const userPrompt = `Materiał dla: ${audienceLabel(input.audience)}. Tytuł: "${input.title}". ${
    input.userDescription ? `Kontekst od admina: ${input.userDescription}.` : ""
  } Napisz opis pod ten materiał (zdjęcie/film) do publikacji w social media.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  return (body.choices?.[0]?.message?.content ?? "").trim();
}
