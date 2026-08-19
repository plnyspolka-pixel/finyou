// Studio publikacji — helpery AI (Lovable AI gateway):
//   * scenariusz wideo HeyGen z promptu (tekst mówiony dla lektora),
//   * generator promptów (wideo / grafika / post social),
//   * generowanie grafiki z promptu + zapis do Supabase Storage
//     (gateway zwraca data-URL base64; Meta/YouTube potrzebują trwałego https).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MIN_SCENES_FOR_BROLL, type SceneDecision } from "./studio-scenes";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const STORAGE_BUCKET = "studio-media";

function lovableKey(): string {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY missing");
  return k;
}

async function chatJson(system: string, user: string): Promise<Record<string, unknown>> {
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey()}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  return JSON.parse(body.choices?.[0]?.message?.content ?? "{}");
}

const BRAND_CONTEXT =
  "Firma: Finance You — pożyczki pod nieruchomość i inwestowanie w wierzytelności. " +
  "Język polski, bez clickbaitu, konkret + korzyść + CTA.";

// Scenariusz mówiony dla awatara HeyGen: 30-60 s tekstu ciągłego (bez didaskaliów),
// bo trafia 1:1 do ElevenLabs TTS.
export async function generateVideoScript(prompt: string): Promise<{
  script: string;
  title: string;
  description: string;
  hashtags: string[];
}> {
  const parsed = await chatJson(
    `Jesteś scenarzystą krótkich pionowych wideo (Shorts/Reels) firmy finansowej. ${BRAND_CONTEXT}
Napisz tekst MÓWIONY dla lektora: 60-140 słów, hook w pierwszym zdaniu, prosty język, zero didaskaliów, zero emoji — tekst idzie prosto do syntezy mowy.
Zwracaj WYŁĄCZNIE JSON: {"script":"...","title":"tytuł do 90 znaków","description":"opis 1-3 zdania","hashtags":["#tag1","#tag2","#tag3"]}`,
    prompt,
  );
  const script = typeof parsed.script === "string" ? parsed.script.trim() : "";
  if (!script) throw new Error("AI nie zwróciło scenariusza.");
  return {
    script,
    title: typeof parsed.title === "string" ? parsed.title : "",
    description: typeof parsed.description === "string" ? parsed.description : "",
    hashtags: Array.isArray(parsed.hashtags)
      ? parsed.hashtags.filter((h: unknown): h is string => typeof h === "string")
      : [],
  };
}

// Scenariusze dla pytań z paczki 250 NIE przechodzą przez AI — składa je
// deterministycznie buildShortsScript (src/lib/shorts-script.ts) z gotowej,
// sprawdzonej treści pliku źródłowego.

// Plan scen: AI NIE dostaje scenariusza do przepisania — dostaje gotowe,
// ponumerowane segmenty (podzielone deterministycznie po zdaniach) i decyduje
// tylko, które z nich zilustrować pełnoekranową grafiką i czym. Dzięki temu
// lektor zawsze mówi dokładnie to, co zatwierdzono w panelu.
export async function planVideoScenes(args: {
  segments: string[];
  topic: string;
}): Promise<SceneDecision[]> {
  if (args.segments.length < MIN_SCENES_FOR_BROLL) return [];
  const numbered = args.segments.map((s, i) => `${i}. ${s}`).join("\n");
  const last = args.segments.length - 1;

  const parsed = await chatJson(
    `Jesteś montażystą krótkich pionowych wideo (Shorts/Reels) firmy finansowej. ${BRAND_CONTEXT}
Dostajesz ponumerowane segmenty tekstu lektora. Dla każdego decydujesz, czy w tym miejscu pokazać pełnoekranową grafikę ilustracyjną (przebitka), czy zostawić mówiącego awatara.

ZASADY:
- Przebitka ma ILUSTROWAĆ to, co w danym segmencie mówi lektor (dokument, nieruchomość, podpis, kalkulacja, klucze) — nigdy dekoracja bez związku.
- Segment 0 i segment ${last} zawsze zostają z awatarem (hook i CTA mówi twarz) — nie proponuj ich.
- Nie proponuj dwóch przebitek pod rząd.
- Przebitek ma być MAŁO: przy ${args.segments.length} segmentach maksymalnie ${Math.max(1, Math.floor((args.segments.length - 2) / 2))}.
- Jeśli żaden segment nie nadaje się na sensowną ilustrację, zwróć pustą listę — nuda jest lepsza niż przypadkowy obrazek.
- "query" to fraza do biblioteki stocku po ANGIELSKU, 2-4 słowa, konkret (np. "signing mortgage contract", "apartment building exterior"), bez nazw marek i bez ludzi z twarzą w kadrze.

Zwracaj WYŁĄCZNIE JSON: {"scenes":[{"index":1,"query":"signing mortgage contract"}]}`,
    `Temat odcinka: ${args.topic}\n\nSegmenty:\n${numbered}`,
  );

  const raw = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  const out: SceneDecision[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as { index?: unknown; query?: unknown };
    const index = typeof e.index === "number" ? e.index : Number.NaN;
    const query = typeof e.query === "string" ? e.query.trim() : "";
    if (!Number.isInteger(index) || index < 0 || index >= args.segments.length) continue;
    if (!query) continue;
    out.push({ index, broll: true, query });
  }
  return out;
}

export type StudioPromptKind = "video" | "image" | "social";

export async function generatePromptIdeas(args: {
  topic: string;
  kind: StudioPromptKind;
  count?: number;
}): Promise<string[]> {
  const count = Math.min(Math.max(args.count ?? 5, 1), 10);
  const kindGuide: Record<StudioPromptKind, string> = {
    video:
      "prompty na krótkie pionowe wideo (Shorts/Reels) z awatarem AI — każdy prompt opisuje temat, hook i przekaz odcinka, po polsku",
    image:
      "prompty do generatora grafik AI — każdy po angielsku, fotorealistyczny lub nowoczesny flat design, opis sceny/kompozycji/kolorów, do 300 znaków, bez tekstu na grafice",
    social:
      "prompty/briefy na posty social media — każdy po polsku: temat, kąt, grupa docelowa i CTA",
  };
  const parsed = await chatJson(
    `Jesteś kreatywnym strategiem contentu firmy finansowej. ${BRAND_CONTEXT}
Wygeneruj ${count} różnorodnych promptów: ${kindGuide[args.kind]}.
Zwracaj WYŁĄCZNIE JSON: {"prompts":["...","..."]}`,
    args.topic,
  );
  const prompts = Array.isArray(parsed.prompts)
    ? parsed.prompts.filter((p: unknown): p is string => typeof p === "string" && p.trim() !== "")
    : [];
  if (!prompts.length) throw new Error("AI nie zwróciło promptów.");
  return prompts.slice(0, count);
}

// Grafika z promptu → trwały publiczny URL w buckecie studio-media.
export async function generateStudioImage(
  prompt: string,
  userId: string | null,
): Promise<{ id: string; image_url: string }> {
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey()}` },
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
  const dataUrl = body.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!dataUrl) throw new Error("Brak obrazu w odpowiedzi AI");

  const match = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new Error("Nieoczekiwany format obrazu z AI (spodziewano data-URL).");
  const [, mime, b64] = match;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ext = mime === "image/jpeg" ? "jpg" : (mime.split("/")[1] ?? "png");
  const path = `images/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (upErr) throw new Error(`Zapis grafiki do Storage: ${upErr.message}`);

  const { data: pub } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  const imageUrl = pub.publicUrl;

  const { data: row, error: insErr } = await supabaseAdmin
    .from("studio_images")
    .insert({ prompt, storage_path: path, image_url: imageUrl, created_by: userId })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);
  return { id: row.id, image_url: imageUrl };
}
