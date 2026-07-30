// Server-only helpers for Social Media & AI Content

const PLATFORM_GUIDE: Record<string, string> = {
  facebook: "ton: rzeczowy, zaangażowany, do 80 słów, 2-3 emoji, 3-5 hashtagów na końcu",
  instagram:
    "ton: lifestyle/visual storytelling, krótkie akapity, emoji w treści, 8-15 hashtagów na końcu",
  linkedin: "ton: ekspercki B2B, 100-200 słów, bez emoji albo bardzo oszczędnie, 3-5 hashtagów",
  x: "do 270 znaków, mocny hook, 1-2 hashtagi, bez clickbaitu",
  tiktok: "ton: konwersacyjny, hook w 1. zdaniu, 5-8 hashtagów (#fyp opcjonalnie)",
  threads: "ton: konwersacyjny, krótko, max 400 znaków, 0-2 hashtagi",
};

export async function generateSocialContent(args: {
  platform: string;
  brief: string;
  campaign?: string;
  tone?: string;
}): Promise<{ content: string; hashtags: string[]; image_prompt: string }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");

  const guide = PLATFORM_GUIDE[args.platform] ?? "";
  const sys = `Jesteś social media managerem firmy finansowej Finance You (pożyczki pod nieruchomość, inwestowanie w wierzytelności). Piszesz po polsku, bez clickbaitu, bez ogólników. Konkret, korzyść, CTA.
Platforma: ${args.platform}. Wytyczne: ${guide}.
${args.tone ? `Dodatkowy ton: ${args.tone}.` : ""}
${args.campaign ? `Kampania: ${args.campaign}.` : ""}
Zwracaj WYŁĄCZNIE JSON: {"content":"...","hashtags":["#tag1","#tag2"],"image_prompt":"opis grafiki w jęz. angielskim, fotorealistyczny styl, do 200 znaków"}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: args.brief },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "{}");
  return {
    content: typeof parsed.content === "string" ? parsed.content : "",
    hashtags: Array.isArray(parsed.hashtags)
      ? parsed.hashtags.filter((h: unknown) => typeof h === "string")
      : [],
    image_prompt: typeof parsed.image_prompt === "string" ? parsed.image_prompt : "",
  };
}

export async function generateSocialImage(prompt: string): Promise<{ image_url: string }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) throw new Error(`AI image ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as {
    choices: { message: { images?: { image_url: { url: string } }[] } }[];
  };
  const url = body.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error("Brak obrazu w odpowiedzi AI");
  return { image_url: url };
}
