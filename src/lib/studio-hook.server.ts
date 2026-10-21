// Hook wizualny rolki Studia — planowanie (AI + zapas bez AI), zasoby
// (obraz z naszego generatora / bank przebitek + animacja Remotion, efekt
// dźwiękowy, opcjonalna muzyka) i wejście dla Remotion. Czyste reguły:
// studio-hook.ts.
//
// Decyzja właściciela 21.10.2026: obrazu hooka NIE generujemy w ElevenLabs
// (bez planu Pro). Źródło klipu (pole `source`, domyślnie `auto`):
//   (1) `clip_bank` — bank gotowych klipów hooka (`studio_hook_clips`,
//       studio-hook-clips.server.ts): klip ~5 s dobrany po torze rolki
//       (wyżej oceniane, rotacja „najdawniej użyte”), gra w całości i kończy
//       się na ścianie z logo za pionowymi awatarami e0db…/65ef… — rolka
//       z klipem powinna zaczynać się od jednego z nich (twarde cięcie),
//   (2) grafika Studia (`generate_studio_image`) + animacja w Remotion,
//   (3) bank przebitek + ta sama animacja.
// ElevenLabs: tylko głos, efekty dźwiękowe i muzyka. Ścieżka ElevenLabs
// Flows (`flows_video` / `flows_image`) zostaje w kodzie za flagą
// `STUDIO_HOOK_FLOWS=1` (domyślnie wyłączona) — bez flagi te źródła są
// pomijane. `STUDIO_VISUAL_HOOK=0` wyłącza hook.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FLOWS_PRO_NOTE, isFlowsPlanError } from "./elevenlabs-flows";
import {
  applyHookVariant,
  chooseHookVariant,
  fallbackHookSpec,
  hookSfxPrompt,
  hookVisualPrompt,
  sanitizeHook,
  type HookAssets,
  type HookSource,
  type HookSpec,
  type StudioHook,
} from "./studio-hook";
import type { ReelFramingInput } from "./studio-reel-plan";
import type { Track } from "./autopilot/types";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Ile czekać na klip Flows przy wykończeniu, zanim zejdziemy na obraz. */
export const HOOK_VIDEO_WAIT_MS = 15 * 60_000;
/** Ile czekać na obraz Flows w jednym wywołaniu (potem odbiór przy wykończeniu). */
const FLOWS_IMAGE_INLINE_WAIT_MS = 40_000;

const isOn = (v: string | undefined) =>
  ["1", "true", "on", "yes", "tak"].includes((v ?? "").trim().toLowerCase());

/** ElevenLabs Flows (wideo/obraz) jako źródło hooka — domyślnie wyłączone. */
export function isFlowsHookEnabled(): boolean {
  return isOn(process.env.STUDIO_HOOK_FLOWS);
}

export function isVisualHookEnabled(): boolean {
  const v = (process.env.STUDIO_VISUAL_HOOK ?? "").trim().toLowerCase();
  return !["0", "false", "off", "no", "nie"].includes(v);
}

type HookJob = {
  id: string;
  prompt: string;
  script: string;
  hook?: unknown;
  hook_variant?: string | null;
  track?: string | null;
  material_audience?: string | null;
  publish_title?: string;
};

export function trackOfJob(job: Pick<HookJob, "track" | "material_audience">): Track | null {
  if (job.track === "pozyczkobiorca" || job.track === "inwestor") return job.track;
  if (job.material_audience === "inwestor") return "inwestor";
  if (job.material_audience === "klient") return "pozyczkobiorca";
  return null;
}

/**
 * Warianty hooka dla scenariusza: AI (3 propozycje) → odsiew compliance →
 * ranking `scoreHook`; bez AI — motyw zapasowy z pierwszego zdania.
 */
export async function generateHookSpecs(input: {
  script: string;
  topic: string;
  track: Track | null;
}): Promise<{ specs: HookSpec[]; note: string | null }> {
  const { pickHooks } = await import("./autopilot/idea-scoring");
  const { checkHardRules } = await import("./autopilot/compliance-rules");
  const { overstressesB2b } = await import("./autopilot/track-voice");
  const track = input.track ?? "pozyczkobiorca";
  let ideas: HookSpec[] = [];
  let note: string | null = null;
  try {
    const { generateHookIdeas } = await import("./studio-ai.server");
    ideas = await generateHookIdeas({ ...input, count: 3 });
  } catch (e) {
    note = `Hook z motywu zapasowego (AI nie odpowiedziało: ${errMsg(e)}).`;
  }
  const allowed = ideas.filter(
    (h) =>
      !checkHardRules(`${h.text}\n${h.visual_prompt}`, { kind: "script", track }).some(
        (x) => x.severity === "block",
      ) && !(track === "pozyczkobiorca" && overstressesB2b(h.text)),
  );
  const { ranked } = pickHooks(
    allowed.map((h) => ({ text: h.text })),
    track,
  );
  const ordered = ranked
    .map((r) => allowed.find((h) => h.text === r.text))
    .filter((h): h is HookSpec => Boolean(h));
  if (!ordered.length) return { specs: [fallbackHookSpec(input.script, input.track)], note };
  return { specs: ordered, note };
}

async function saveHook(jobId: string, hook: StudioHook, variant?: string | null): Promise<void> {
  const { error } = await supabaseAdmin
    .from("studio_video_jobs")
    .update({ hook: hook as never, ...(variant ? { hook_variant: variant } : {}) } as never)
    .eq("id", jobId);
  if (error) throw new Error(`studio_video_jobs: ${error.message}`);
}

/**
 * Hook zadania: zapisany (ręczny z MCP albo wcześniej wygenerowany) albo
 * nowy z generatora. Wariant A/B wg `hook_variant` (przydział, gdy pusty).
 */
export async function planHookForJob(job: HookJob): Promise<StudioHook | null> {
  if (!isVisualHookEnabled()) return null;
  let hook = sanitizeHook(job.hook);
  let note: string | null = null;
  if (!hook) {
    const script = job.script?.trim();
    if (!script) return null;
    const gen = await generateHookSpecs({ script, topic: job.prompt, track: trackOfJob(job) });
    note = gen.note;
    const [first] = gen.specs;
    const variants = gen.specs.slice(0, 2);
    hook = { ...first, ...(variants.length > 1 ? { variants } : {}), variant: null, assets: null };
  }
  const key = chooseHookVariant(hook, job.id, job.hook_variant ?? null);
  const chosen = applyHookVariant(hook, key);
  if (note) chosen.assets = { ...emptyAssets(), notes: [note] };
  await saveHook(job.id, chosen, key);
  job.hook = chosen;
  job.hook_variant = key;
  return chosen;
}

const emptyAssets = (): HookAssets => ({
  status: "pending",
  kind: null,
  url: null,
  source_used: null,
  sfx_url: null,
  music_url: null,
  notes: [],
});

type ClipSource = Exclude<HookSource, "auto">;

const CHAIN: Record<HookSource, ClipSource[]> = {
  auto: ["clip_bank", "flows_video", "flows_image", "studio_image", "broll"],
  clip_bank: ["clip_bank", "studio_image", "broll"],
  flows_video: ["flows_video", "flows_image", "studio_image", "broll"],
  flows_image: ["flows_image", "studio_image", "broll"],
  studio_image: ["studio_image", "broll"],
  broll: ["broll"],
};

/** Łańcuch źródeł dla hooka — bez flagi Flows źródła ElevenLabs odpadają. */
export function hookSourceChain(source: HookSource, flows = isFlowsHookEnabled()): ClipSource[] {
  return CHAIN[source].filter((s) => flows || (s !== "flows_video" && s !== "flows_image"));
}

const addNote = (a: HookAssets, n: string) => {
  if (!a.notes.includes(n)) a.notes = [...a.notes, n].slice(-12);
};

/**
 * Próbuje kolejnych źródeł od `from`. Flows wideo kończy się stanem
 * `pending` (odbiór przy wykończeniu); reszta daje gotowy plik od razu.
 */
async function acquireClip(
  hook: StudioHook,
  assets: HookAssets,
  sources: Array<Exclude<HookSource, "auto">>,
  name: string,
  track: Track | null = null,
): Promise<HookAssets> {
  const prompt = hookVisualPrompt(hook);
  for (const source of sources) {
    try {
      if (source === "flows_video") {
        const { startFlowsVideo } = await import("./elevenlabs-flows.server");
        const gen = await startFlowsVideo({ prompt, durationSeconds: 4, resolution: "720p" });
        if (!gen.id) throw new Error("brak id generacji");
        return {
          ...assets,
          status: "pending",
          video_generation_id: gen.id,
          started_at: new Date().toISOString(),
          source_used: null,
        };
      }
      if (source === "flows_image") {
        const flows = await import("./elevenlabs-flows.server");
        let gen = await flows.startFlowsImage({ prompt });
        const until = Date.now() + FLOWS_IMAGE_INLINE_WAIT_MS;
        while (gen.id && (gen.status === "pending" || gen.status === "generating")) {
          if (Date.now() > until) {
            return {
              ...assets,
              status: "pending",
              image_generation_id: gen.id,
              started_at: new Date().toISOString(),
            };
          }
          await new Promise((r) => setTimeout(r, 3000));
          gen = await flows.getFlowsGeneration("image", gen.id);
        }
        if (gen.status !== "completed") throw new Error(gen.failure ?? `status ${gen.status}`);
        const stored = await flows.storeFlowsResult(gen, `${name}-hook`);
        return ready(assets, "image", stored.url, "flows_image");
      }
      if (source === "clip_bank") {
        // Bank gotowych klipów hooka: tor rolki (albo `both`), wyżej oceniane
        // z rotacją. Pusty bank → kolejne źródło z łańcucha.
        const bank = await import("./studio-hook-clips.server");
        const clip = await bank.pickHookClip(track);
        if (!clip) {
          addNote(assets, "clip_bank: brak aktywnego klipu dla toru");
          continue;
        }
        await bank.markHookClipUsed(clip.id).catch(() => {});
        return {
          ...ready(assets, "video", clip.media_url, "clip_bank"),
          clip_id: clip.id,
          clip_duration: clip.duration_s ?? null,
        };
      }
      if (source === "studio_image") {
        const { generateStudioImage } = await import("./studio-ai.server");
        const img = await generateStudioImage(prompt, null);
        return ready(assets, "image", img.image_url, "studio_image");
      }
      // broll — bank przebitek po słowach z opisu, a bez trafienia najdawniej użyta
      const bank = await import("./studio-broll.server");
      const asset =
        (await bank.pickBrollFromBank(hook.visual_prompt)) ?? (await bank.pickLeastUsedFromBank());
      if (!asset) throw new Error("bank przebitek jest pusty");
      await bank.markBrollUsed([asset.id]).catch(() => {});
      return ready(
        assets,
        asset.media_type === "video" ? "video" : "image",
        asset.media_url,
        "broll",
      );
    } catch (e) {
      if (isFlowsPlanError(e)) {
        assets = { ...assets, pro_plan_required: true };
        addNote(assets, FLOWS_PRO_NOTE);
      } else {
        addNote(assets, `${source}: ${errMsg(e).slice(0, 160)}`);
      }
    }
  }
  return { ...assets, status: "failed" };
}

function ready(
  assets: HookAssets,
  kind: "video" | "image",
  url: string,
  source: Exclude<HookSource, "auto">,
): HookAssets {
  return {
    ...assets,
    status: "ready",
    kind,
    url,
    source_used: source,
    video_generation_id: null,
    image_generation_id: null,
    clip_id: null,
    clip_duration: null,
  };
}

/** Efekt dźwiękowy uderzenia (ElevenLabs Sound Effects) i opcjonalna muzyka. */
async function acquireAudio(
  hook: StudioHook,
  assets: HookAssets,
  name: string,
): Promise<HookAssets> {
  const out = { ...assets };
  const el = await import("./elevenlabs-api.server");
  const { storeMedia } = await import("./media-storage.server");
  if (!out.sfx_url) {
    try {
      const sfx = await el.generateSoundEffect({
        text: hookSfxPrompt(hook),
        durationSeconds: 2.5,
        promptInfluence: 0.7,
      });
      const stored = await storeMedia(sfx.bytes, {
        contentType: sfx.contentType || "audio/mpeg",
        visibility: "public",
        prefix: "studio-hook",
        name: `${name}-sfx`,
      });
      out.sfx_url = stored.url;
    } catch (e) {
      addNote(out, `efekt dźwiękowy: ${errMsg(e).slice(0, 160)}`);
    }
  }
  if (hook.music_prompt && !out.music_url) {
    try {
      const music = await el.composeMusic({ prompt: hook.music_prompt, lengthMs: 45_000 });
      const stored = await storeMedia(music.bytes, {
        contentType: music.contentType || "audio/mpeg",
        visibility: "public",
        prefix: "studio-hook",
        name: `${name}-muzyka`,
      });
      out.music_url = stored.url;
    } catch (e) {
      addNote(out, `muzyka: ${errMsg(e).slice(0, 160)}`);
    }
  }
  return out;
}

/** Zlecenie zasobów hooka (start: przy renderze HeyGena albo podgląd z MCP). */
export async function startHookAssets(
  hook: StudioHook,
  name: string,
  track: Track | null = null,
): Promise<HookAssets> {
  const base: HookAssets = { ...emptyAssets(), notes: hook.assets?.notes ?? [] };
  const clip = await acquireClip(hook, base, hookSourceChain(hook.source), name, track);
  return acquireAudio(hook, clip, name);
}

/**
 * Odbiór zleceń Flows w toku. `waiting` = klip jeszcze się generuje i jest
 * czas — wykończenie poczeka do następnego ticka. Po porażce / limicie
 * czasu: kolejne źródło z łańcucha (obraz).
 */
export async function advanceHookAssets(
  hook: StudioHook,
  name: string,
  now = new Date(),
  track: Track | null = null,
): Promise<{ assets: HookAssets; waiting: boolean }> {
  let assets = hook.assets ?? (await startHookAssets(hook, name, track));
  if (assets.status !== "pending") return { assets, waiting: false };
  const kind = assets.video_generation_id ? "video" : assets.image_generation_id ? "image" : null;
  const id = assets.video_generation_id ?? assets.image_generation_id;
  const nextSources = (from: "flows_video" | "flows_image") => {
    const chain = hookSourceChain(hook.source);
    return chain.slice(chain.indexOf(from) + 1);
  };
  if (!kind || !id) {
    assets = await acquireClip(hook, assets, hookSourceChain(hook.source), name, track);
    return { assets, waiting: assets.status === "pending" };
  }
  const flows = await import("./elevenlabs-flows.server");
  try {
    const gen = await flows.getFlowsGeneration(kind, id);
    if (gen.status === "completed") {
      const stored = await flows.storeFlowsResult(gen, `${name}-hook`);
      return {
        assets: ready(assets, kind, stored.url, kind === "video" ? "flows_video" : "flows_image"),
        waiting: false,
      };
    }
    if (gen.status === "failed") throw new Error(gen.failure ?? "generacja nieudana");
    const age = now.getTime() - new Date(assets.started_at ?? now.toISOString()).getTime();
    if (age < (kind === "video" ? HOOK_VIDEO_WAIT_MS : 5 * 60_000)) {
      return { assets, waiting: true };
    }
    addNote(assets, `flows_${kind}: przekroczony czas generacji`);
  } catch (e) {
    addNote(assets, `flows_${kind}: ${errMsg(e).slice(0, 160)}`);
  }
  assets = await acquireClip(
    hook,
    { ...assets, video_generation_id: null, image_generation_id: null },
    nextSources(kind === "video" ? "flows_video" : "flows_image"),
    name,
    track,
  );
  return { assets, waiting: assets.status === "pending" };
}

async function freshHookJob(jobId: string): Promise<HookJob | null> {
  const { data } = await supabaseAdmin
    .from("studio_video_jobs")
    .select("id, prompt, script, hook, hook_variant, track, material_audience, publish_title")
    .eq("id", jobId)
    .maybeSingle();
  return (data as HookJob | null) ?? null;
}

/**
 * Start hooka po zleceniu renderu HeyGena (kolejka, panel, MCP): plan +
 * zasoby, żeby klip Flows generował się równolegle z awatarem. Nigdy nie
 * rzuca — hook nie może zatrzymać rolki.
 */
export async function prepareHookForJob(jobId: string): Promise<void> {
  if (!isVisualHookEnabled()) return;
  try {
    const job = await freshHookJob(jobId);
    if (!job) return;
    const hook = await planHookForJob(job);
    if (!hook) return;
    if (hook.assets?.status === "ready" || hook.assets?.video_generation_id) return;
    const assets = await startHookAssets(hook, job.publish_title || job.prompt, trackOfJob(job));
    await saveHook(jobId, { ...hook, assets });
  } catch (e) {
    console.warn(`[Studio] hook wizualny (${jobId}) nieudany: ${errMsg(e)}`);
  }
}

/**
 * Hook przy wykończeniu: dokończenie zasobów (odbiór Flows, zejście na
 * obraz). `waiting` = poczekaj z wykończeniem (klip Flows w toku).
 */
export async function hookForFinish(
  jobId: string,
  now = new Date(),
): Promise<{ hook: StudioHook | null; waiting: boolean }> {
  if (!isVisualHookEnabled()) return { hook: null, waiting: false };
  try {
    const job = await freshHookJob(jobId);
    if (!job) return { hook: null, waiting: false };
    const hook = await planHookForJob(job);
    if (!hook) return { hook: null, waiting: false };
    if (hook.assets?.status === "ready") return { hook, waiting: false };
    const { assets, waiting } = await advanceHookAssets(
      hook,
      job.publish_title || job.prompt,
      now,
      trackOfJob(job),
    );
    const withAudio = assets.status === "ready" ? await acquireAudio(hook, assets, jobId) : assets;
    const next = { ...hook, assets: withAudio };
    await saveHook(jobId, next);
    return { hook: next, waiting };
  } catch (e) {
    console.warn(`[Studio] hook przy wykończeniu (${jobId}) nieudany: ${errMsg(e)}`);
    return { hook: null, waiting: false };
  }
}

/**
 * Dodatki planu Remotion dla zadania: gotowy hook (bez generowania) i
 * kadrowanie ujęć poziomych awatarów. Brak danych = brak dodatku.
 */
export async function reelExtrasForJob(jobId: string): Promise<{
  hook: StudioHook | null;
  framing: ReelFramingInput | null;
}> {
  const { data } = await supabaseAdmin
    .from("studio_video_jobs")
    .select("hook, scene_plan, avatar_id")
    .eq("id", jobId)
    .maybeSingle();
  const row = data as { hook?: unknown; scene_plan?: unknown; avatar_id?: string } | null;
  if (!row) return { hook: null, framing: null };
  const hook = isVisualHookEnabled() ? sanitizeHook(row.hook) : null;
  const scenes = Array.isArray(row.scene_plan)
    ? (row.scene_plan as Array<Record<string, unknown>>).map((s) => ({
        kind: s.kind === "broll" ? ("broll" as const) : ("avatar" as const),
        text: typeof s.text === "string" ? s.text : "",
        avatarId: typeof s.avatarId === "string" ? s.avatarId : null,
      }))
    : null;
  const lead = row.avatar_id ?? "";
  const ids = [lead, ...(scenes ?? []).map((s) => s.avatarId ?? "")].filter(Boolean);
  let framing: ReelFramingInput | null = null;
  try {
    const { ensureAvatarOrientations } = await import("./studio-avatar-orientation.server");
    const infos = await ensureAvatarOrientations(ids);
    if (infos.size) framing = { scenes, leadAvatarId: lead, infos: Object.fromEntries(infos) };
  } catch (e) {
    console.warn(`[Studio] kadrowanie awatarów (${jobId}): ${errMsg(e)}`);
  }
  return { hook: hook?.assets?.status === "ready" ? hook : null, framing };
}
