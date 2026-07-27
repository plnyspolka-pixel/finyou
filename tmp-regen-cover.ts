import { Jimp } from "jimp";

const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY!;
const IMAGE_URL = "https://ai.gateway.lovable.dev/v1/images/generations";
const WORDMARK_URL =
  "https://financeyou.pl/__l5e/assets-v1/78c589be-8669-4bdf-a471-ff97875e8d7a/financeyou-wordmark.png";

const prompt = `Editorial finance magazine cover photograph, photorealistic, soft natural light, Polish/European context. Scene: Modern Polish apartment building exterior with keys, calculator and Polish 200 PLN banknotes arranged on a wooden table in foreground; warm cinematic mood, depth of field. 16:9 cinematic composition. Absolutely NO text, NO letters, NO words, NO logos, NO watermarks, NO UI elements anywhere in the image — pure photograph only. Leave the bottom-right area visually calm (uncluttered background) so a small logo can be overlaid later.`;

async function gen() {
  const res = await fetch(IMAGE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-pro-image-preview",
      prompt,
      n: 1,
      size: "1536x1024",
      response_format: "url",
    }),
  });
  if (!res.ok) throw new Error(`gen ${res.status}: ${await res.text()}`);
  const j: any = await res.json();
  console.error("KEYS:", JSON.stringify(j).slice(0, 800));
  const item = j.data?.[0];
  if (item?.url) return item.url;
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  throw new Error("no image");
}
console.log(await gen());
