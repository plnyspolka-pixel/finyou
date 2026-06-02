// Server-only helpers for landing pages (AI copy generation)

export async function generateLandingContent(brief: string): Promise<{
  headline: string;
  subheadline: string;
  cta_text: string;
  sections: Array<{
    type: "text" | "features" | "stats" | "testimonial" | "cta";
    title?: string;
    content?: string;
    items?: Array<{ title?: string; description?: string; label?: string; value?: string }>;
    author?: string;
    role?: string;
  }>;
  meta_description: string;
}> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");

  const sys = `Jesteś copywriterem konwersji w branży finansowej (pożyczki pod nieruchomość, inwestowanie w wierzytelności w Polsce). Twórz mocne, konkretne treści po polsku, bez clickbaitu i bez ogólników.
Zwracaj WYŁĄCZNIE JSON o schemacie:
{
  "headline": "krótki, do 90 znaków, główna obietnica",
  "subheadline": "1-2 zdania uzupełniające, do 200 znaków",
  "cta_text": "do 30 znaków, czasownik w trybie rozkazującym",
  "meta_description": "do 160 znaków, SEO opis",
  "sections": [
    {"type":"features","title":"...","items":[{"title":"...","description":"..."}]},
    {"type":"stats","title":"...","items":[{"label":"...","value":"..."}]},
    {"type":"text","title":"...","content":"..."},
    {"type":"testimonial","content":"...","author":"...","role":"..."},
    {"type":"cta","title":"...","content":"..."}
  ]
}
Dawaj 3-5 sekcji. Nie wymyślaj cyfr, których nie da się obronić.`;

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
  const parsed = JSON.parse(content);
  return {
    headline: parsed.headline ?? "",
    subheadline: parsed.subheadline ?? "",
    cta_text: parsed.cta_text ?? "Zapisz się",
    meta_description: parsed.meta_description ?? "",
    sections: Array.isArray(parsed.sections) ? parsed.sections : [],
  };
}
