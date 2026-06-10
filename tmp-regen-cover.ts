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
      model: "google/gemini-2.5-flash-image-preview",
      prompt,
      n: 1,
      size: "1536x1024",
      response_format: "url",
    }),
  });
  if (!res.ok) throw new Error(`gen ${res.status}: ${await res.text()}`);
  const j: any = await res.json();
  const item = j.data?.[0];
  if (item.url) return item.url;
  return `data:image/png;base64,${item.b64_json}`;
}

async function buf(src: string): Promise<Buffer> {
  if (src.startsWith("data:")) return Buffer.from(src.split(",", 2)[1], "base64");
  const r = await fetch(src);
  return Buffer.from(await r.arrayBuffer());
}

const rawSrc = await gen();
const [baseBuf, markBuf] = await Promise.all([buf(rawSrc), buf(WORDMARK_URL)]);
const base = await Jimp.read(baseBuf);
const mark = await Jimp.read(markBuf);
const targetW = Math.round(base.bitmap.width * 0.22);
const scale = targetW / mark.bitmap.width;
mark.resize({ w: targetW, h: Math.round(mark.bitmap.height * scale) });
mark.opacity(0.92);
const pad = Math.round(base.bitmap.width * 0.025);
base.composite(mark, base.bitmap.width - mark.bitmap.width - pad, base.bitmap.height - mark.bitmap.height - pad);
const out = await base.getBuffer("image/jpeg", { quality: 88 });
await Bun.write("/tmp/cover-koszty-mieszkania.jpg", out);
console.log("ok", out.length);
