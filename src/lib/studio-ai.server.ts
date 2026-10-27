// Studio publikacji — helpery AI (Lovable AI gateway):
//   * scenariusz wideo HeyGen z promptu (tekst mówiony dla lektora),
//   * generator promptów (wideo / grafika / post social),
//   * generowanie grafiki z promptu + zapis do Supabase Storage
//     (gateway zwraca data-URL base64; Meta/YouTube potrzebują trwałego https).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitizeOverlayCards, type OverlayCard } from "./caption-style";
import { MIN_SCENES_FOR_BROLL, type SceneDecision } from "./studio-scenes";
import { HOOK_RULES, sanitizeHookSpec, type HookSpec } from "./studio-hook";
import {
  TRACK_HOOK_EXAMPLES,
  TRACK_SCRIPT_RULES,
  b2bMentions,
  overstressesB2b,
} from "./autopilot/track-voice";
import { acceptCondensedScript, countWarnings, overWarns } from "./autopilot/script-warnings";
import type { Track } from "./autopilot/types";

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
// bo trafia 1:1 do ElevenLabs TTS. Z torem (autopilot / material_audience)
// dostaje zasady toru (track-voice.ts) — w torze pożyczkobiorcy bez akcentu
// „tylko dla firm”; tekst z więcej niż jedną taką wzmianką idzie raz do poprawki.
export async function generateVideoScript(
  prompt: string,
  opts: { track?: Track | null } = {},
): Promise<{
  script: string;
  title: string;
  description: string;
  hashtags: string[];
}> {
  const trackRules = opts.track ? `\n${TRACK_SCRIPT_RULES[opts.track]}` : "";
  const system = `Jesteś scenarzystą krótkich pionowych wideo (Shorts/Reels) firmy finansowej. ${BRAND_CONTEXT}${trackRules}
Napisz tekst MÓWIONY dla lektora: 60-140 słów, hook w pierwszym zdaniu (teza albo pytanie, nie zagadka), prosty język, zero didaskaliów, zero emoji — tekst idzie prosto do syntezy mowy.
To rolka SPRZEDAŻOWA: przedstaw fakty, mechanizm i korzyść, bez oceniania i bez myślenia za widza. ŻADNYCH zdań o ryzyku, koszcie („droższe niż bank”, „wyższy koszt”), możliwej stracie kapitału czy majątku, braku spłaty ani zastrzeżeń i formułek prawnych („nie stanowi oferty/porady”, „zwrot nie jest gwarantowany”, „wynik szacunkowy”, „materiał poglądowy”, zastrzeżenie przy CTA). Widz to wie, a linia o ryzyku jest w stopce opisu publikacji. Nadal bez obietnic zysku, gwarancji i procentów zwrotu.
Zwracaj WYŁĄCZNIE JSON: {"script":"...","title":"tytuł do 90 znaków","description":"opis 1-3 zdania","hashtags":["#tag1","#tag2","#tag3"]}`;
  let parsed = await chatJson(system, prompt);
  let script = typeof parsed.script === "string" ? parsed.script.trim() : "";
  if (
    script &&
    opts.track === "pozyczkobiorca" &&
    overstressesB2b(`${script} ${parsed.title ?? ""}`)
  ) {
    try {
      const again = await chatJson(
        system,
        `${prompt}\n\nPoprzednia wersja za mocno akcentowała, że oferta jest dla firm (${b2bMentions(script).join(", ")}). Napisz ją jeszcze raz: o pożyczce pod zastaw nieruchomości po prostu, słowa „firma/przedsiębiorca/działalność” najwyżej raz.\n\nPOPRZEDNIA WERSJA:\n${script}`,
      );
      const s2 = typeof again.script === "string" ? again.script.trim() : "";
      if (s2 && b2bMentions(s2).length < b2bMentions(script).length) {
        parsed = again;
        script = s2;
      }
    } catch {
      // zostaje pierwsza wersja — bramka compliance i tak ją sprawdzi
    }
  }
  // Zabezpieczenie: model mimo zakazu dopisał ostrzeżenie → jedna próba jego
  // usunięcia; nieudana zostawia tekst, produkcja ma drugą szansę po bramce.
  if (script && overWarns(script)) {
    try {
      const slim = await condenseScriptWarnings(script, { track: opts.track });
      if (slim) script = slim;
    } catch {
      // zostaje wersja z nadmiarem zastrzeżeń
    }
  }
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

/**
 * Usunięcie zastrzeżeń (decyzja właściciela 27.10.2026: rolki sprzedażowe bez
 * zdań o ryzyku, koszcie i stracie). Zabezpieczenie po generacji — główny zakaz
 * jest w poleceniu scenarzysty. Wynik przyjmujemy tylko, gdy zastrzeżeń ubyło
 * do zera, hasło CTA i długość się zgadzają, a reguły twarde nie zgłaszają
 * nowych blokad (acceptCondensedScript); inaczej zostaje oryginał.
 * Zwraca null, gdy nie ma czego usuwać albo wynik się nie nadaje.
 */
export async function condenseScriptWarnings(
  script: string,
  opts: { track?: Track | null } = {},
): Promise<string | null> {
  if (!overWarns(script)) return null;
  const parsed = await chatJson(
    `Jesteś redaktorem scenariuszy krótkich pionowych wideo (Shorts/Reels) firmy finansowej. ${BRAND_CONTEXT}
Dostajesz gotowy tekst mówiony lektora rolki SPRZEDAŻOWEJ, w którym są zdania-ostrzeżenia (${countWarnings(script)}). Rolka ma przedstawiać fakty i mechanizm bez oceniania ryzyka za widza — widz wie, że finansowanie kosztuje, a inwestycja może przynieść stratę.
Zadanie: usuń W CAŁOŚCI każde zdanie albo fragment o ryzyku, koszcie („wyższy koszt niż w banku”, „bywa droższe”), możliwej stracie kapitału czy majątku, braku spłaty i egzekucji, a także formułki: „nie stanowi oferty/porady/rekomendacji”, „nie gwarantuje”, „zwrot/wynik nie jest gwarantowany”, „wynik szacunkowy/orientacyjny”, „materiał poglądowy/informacyjny”, „nie zastępuje analizy prawnej”, „decyzja zależy od oceny/finansującego”.
ZASADY:
- Nie zmieniaj hooka (pierwszego zdania), kolejności treści ani sensu; możesz wygładzić przejście w miejscu usuniętego zdania, ale nie dopisuj nowych treści.
- Nie dodawaj obietnic, gwarancji, superlatywów ani procentów zwrotu — usunięte zastrzeżenie nie może zostać zastąpione obietnicą.
- CTA na końcu zostaje w całości (hasło WIELKIMI LITERAMI bez zmian), ale bez doklejonego zastrzeżenia.
- Zero didaskaliów, zero emoji — tekst idzie prosto do syntezy mowy.
Zwracaj WYŁĄCZNIE JSON: {"script":"..."}`,
    script,
  );
  const out = typeof parsed.script === "string" ? parsed.script.trim() : "";
  const verdict = acceptCondensedScript(script, out, { kind: "script", track: opts.track ?? null });
  return verdict.ok ? out : null;
}

/**
 * Warianty hooka wizualnego (3) dla gotowego scenariusza — obraz-metafora,
 * 2–4 słowa na ekran, słowo w złocie, dźwięk uderzenia. Ranking i wybór
 * robi studio-hook.server.ts (scoreHook + compliance).
 */
export async function generateHookIdeas(input: {
  script: string;
  topic: string;
  track?: Track | null;
  count?: number;
}): Promise<HookSpec[]> {
  const count = Math.min(Math.max(input.count ?? 3, 1), 5);
  const track = input.track ?? null;
  const parsed = await chatJson(
    `Jesteś reżyserem pierwszych sekund krótkich pionowych wideo (Shorts/Reels) firmy finansowej. ${BRAND_CONTEXT}
${track ? TRACK_SCRIPT_RULES[track] : ""}
${HOOK_RULES}
Hook ma pasować do PIERWSZEGO ZDANIA lektora (widz słyszy je pod obrazem) i do problemu widza.${track ? ` Przykładowe pierwsze zdania tego toru: ${TRACK_HOOK_EXAMPLES[track].map((e) => `„${e}”`).join(" ")}` : ""}
Podaj ${count} RÓŻNE warianty (różne metafory).
Zwracaj WYŁĄCZNIE JSON: {"hooks":[{"visual_prompt":"...","text":"...","highlight":"...","sfx_prompt":"..."}]}`,
    `Temat: ${input.topic}\n\nScenariusz lektora:\n${input.script}`,
  );
  const raw = Array.isArray(parsed.hooks) ? parsed.hooks : [];
  return raw
    .map((h) => sanitizeHookSpec({ ...(h as object), source: "auto" }))
    .filter((h): h is HookSpec => h !== null && Boolean(h.visual_prompt))
    .slice(0, count);
}

// Dobór klipu z banku klipów hooka do TREŚCI rolki: AI dostaje scenariusz,
// tekst hooka i ponumerowaną listę konceptów (tytuł, opis, tagi) i wskazuje
// JEDEN koncept z wynikiem 0–100. Próg i walidacja odpowiedzi:
// acceptAiClipMatch (studio-hook-clips.ts) — słabe dopasowanie = brak klipu.
export async function matchHookClipConcept(input: {
  script: string;
  topic: string;
  hookText: string;
  visualPrompt: string;
  conceptList: string;
}): Promise<Record<string, unknown>> {
  return chatJson(
    `Dobierasz klip otwierający (pierwsze sekundy) krótkiego pionowego wideo firmy finansowej. ${BRAND_CONTEXT}
Dostajesz scenariusz lektora, tekst hooka na ekranie i ponumerowaną listę konceptów klipów (metafora wizualna: tytuł, znaczenie, tagi).
Wybierz JEDEN koncept, który znaczeniowo najlepiej ilustruje PIERWSZE ZDANIE lektora i tekst hooka (problem widza). Oceń dopasowanie 0–100: 80+ = metafora mówi dokładnie o tym samym; 55–79 = wyraźnie pasuje; poniżej 55 = luźny związek albo brak — wtedy daj niski wynik, NIE naciągaj.
Zwracaj WYŁĄCZNIE JSON: {"concept":"<klucz konceptu z nawiasu kwadratowego>","score":0-100,"reason":"krótko po polsku, dlaczego"}`,
    `Tekst hooka: ${input.hookText || "(brak)"}
Temat: ${input.topic || "(brak)"}
Opis obrazu hooka: ${input.visualPrompt || "(brak)"}

Scenariusz lektora:
${input.script.slice(0, 2000) || "(brak)"}

Koncepty klipów:
${input.conceptList}`,
  );
}

// Scenariusze dla pytań z paczki 250 NIE przechodzą przez AI — składa je
// deterministycznie buildShortsScript (src/lib/shorts-script.ts) z gotowej,
// sprawdzonej treści pliku źródłowego.

// Karty ekranowe (tabelki/checklisty nakładane na obraz) z TEKSTU scenariusza:
// AI nie pisze treści od siebie — wyciąga z tekstu lektora wyliczenia, kroki
// i liczby, które da się pokazać jako 1-4 krótkie wiersze, oraz dokładny
// mówiony fragment ("sync"), przy którym karta ma wejść. Czas liczy potem
// overlaysWithCueTiming z SRT; karta, której sync nie pada w nagraniu,
// wypada. Walidacja (sanitizeOverlayCards) jest czysta i testowana osobno.
export async function generateOverlayCards(script: string): Promise<OverlayCard[]> {
  const parsed = await chatJson(
    `Planujesz TEKSTY EKRANOWE krótkiego pionowego wideo firmy finansowej (napisy-nakładki na obrazie mówiącego lektora). ${BRAND_CONTEXT}
Dostajesz dokładny tekst mówiony przez lektora. Wybierz co najwyżej 2 miejsca, w których na ekranie warto pokazać kartę: wyliczenie, kroki, warunki albo liczby, które lektor wymienia.

ZASADY:
- Treść kart WYŁĄCZNIE z tekstu lektora — niczego nie dopisuj i nie interpretuj.
- Karta: opcjonalny "title" (WIELKIMI LITERAMI, do 24 znaków), 1-4 wiersze; wiersz: "text" do 26 znaków (skrót tego, co mówi lektor), opcjonalnie "value" (liczba/kwota/procent z tekstu, do 10 znaków), "icon": "check" (warunek/krok spełniony) albo "dot" (punkt wyliczenia).
- "sync" to DOSŁOWNY, ciągły fragment tekstu lektora (5-12 słów, skopiowany znak w znak), w którym zaczyna on mówić o treści karty.
- Gdy tekst nie zawiera nic, co sensownie układa się w kartę — zwróć pustą listę. Brak karty jest lepszy niż karta na siłę.

Zwracaj WYŁĄCZNIE JSON: {"cards":[{"title":"...","rows":[{"icon":"dot","text":"...","value":"..."}],"sync":"..."}]}`,
    script,
  );
  return sanitizeOverlayCards(parsed.cards);
}

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

// Tryb „struktura rolki": miejsca cięć są z góry ustalone (ujęcie →
// przebitka → a-roll innego awatara), więc AI nie decyduje już GDZIE
// ciąć — dostaje konkretne indeksy segmentów i oddaje wyłącznie frazę
// wyszukiwania dla każdego z nich. Brak odpowiedzi nie psuje montażu: render
// weźmie wtedy materiał z banku po prostu najdawniej użyty.
export async function planBrollQueries(args: {
  segments: string[];
  indices: number[];
  topic: string;
}): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!args.indices.length) return out;
  const numbered = args.segments.map((s, i) => `${i}. ${s}`).join("\n");

  const parsed = await chatJson(
    `Jesteś montażystą krótkich pionowych wideo (Shorts/Reels) firmy finansowej. ${BRAND_CONTEXT}
Dostajesz ponumerowane segmenty tekstu lektora oraz listę indeksów, w których montaż WYMAGA przebitki (decyzja jest już podjęta — nie oceniasz jej).
Dla KAŻDEGO wskazanego indeksu podaj frazę do biblioteki materiałów po ANGIELSKU: 2-4 słowa, konkret ilustrujący to, co lektor mówi w tym segmencie (np. "signing mortgage contract", "apartment building exterior"), bez nazw marek i bez twarzy w kadrze.

Zwracaj WYŁĄCZNIE JSON: {"scenes":[{"index":1,"query":"signing mortgage contract"}]}`,
    `Temat odcinka: ${args.topic}\n\nSegmenty:\n${numbered}\n\nIndeksy do zilustrowania: ${args.indices.join(", ")}`,
  );

  const raw = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  const wanted = new Set(args.indices);
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as { index?: unknown; query?: unknown };
    const index = typeof e.index === "number" ? e.index : Number.NaN;
    const query = typeof e.query === "string" ? e.query.trim() : "";
    if (!Number.isInteger(index) || !wanted.has(index) || !query) continue;
    out.set(index, query);
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
