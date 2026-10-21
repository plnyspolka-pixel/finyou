// Studio publikacji — narzędzia robota do HOOKA WIZUALNEGO rolki (podgląd,
// generowanie zasobów, bank klipów hooka `clip_bank`) i KADROWANIA AWATARÓW
// (orientacja zdjęcia, punkt kadru). Te same funkcje co kolejka Studia (studio-hook.server.ts).
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  WRITE,
  WRITE_IDEMPOTENT,
  actorId,
  fail,
  handle,
  ok,
  okWith,
  requireTeamAdmin,
} from "../_helpers";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;

const HOOK_FIELDS = {
  visual_prompt: z.string().max(700).optional(),
  text: z.string().max(60).optional(),
  highlight: z.string().max(40).nullable().optional(),
  sfx_prompt: z.string().max(220).optional(),
  source: z
    .enum(["auto", "clip_bank", "studio_image", "broll", "flows_video", "flows_image"])
    .optional(),
  music_prompt: z.string().max(220).nullable().optional(),
  clip_slug: z
    .string()
    .max(80)
    .nullable()
    .optional()
    .describe(
      "Przypięty klip z banku klipów hooka (slug z `list_hook_clips`) — pomija dopasowanie do treści i idzie pierwszy niezależnie od `source`. Musi istnieć w banku. `null` = odpięcie (znów dopasowanie do treści).",
    ),
};

export const previewStudioHook = defineTool({
  name: "preview_studio_hook",
  title: "Preview the visual hook of a studio reel",
  description:
    "Podgląd hooka wizualnego rolki Studia (0–2,5 s: pełny kadr w ruchu nad pierwszym zdaniem lektora, efekt dźwiękowy, duży tekst 1–4 słowa ze słowem w złocie). Z `id` bierze zadanie (jego hook albo planuje nowy z generatora — warianty A/B), bez `id` — ze `script` / `topic` / `track`. Pola hooka nadpisują plan. `generate_assets=true` (domyślnie) robi obraz i dźwięk: bank klipów hooka (`clip_bank` — gotowy klip ~5 s DOBRANY DO TREŚCI rolki: AI porównuje scenariusz i tekst hooka z opisami i tagami konceptów klipów i bierze koncept tylko przy wyraźnym dopasowaniu, bez AI — słowa kluczowe; gdy nic nie pasuje, klipu nie ma i hook schodzi na kolejne źródło — nigdy losowo; `clip_slug` przypina konkretny klip; klip gra w całości bez efektów i kończy się na ścianie z logo za pionowymi awatarami e0db8779828f484a8311fd427e815abe / 65ef986081bc48ed890c742cfa73d42e, więc rolka z takim hookiem powinna zaczynać się od jednego z nich — twarde cięcie) → grafika z naszego generatora → bank przebitek (animacja w Remotion) + efekt dźwiękowy ElevenLabs. ElevenLabs Flows tylko przy fladze STUDIO_HOOK_FLOWS=1 (wynik `pending` odbierze wtedy kolejka przy wykończeniu). `save=true` (z `id`) zapisuje hook przy zadaniu; gotową rolkę wykończ potem `restyle_studio_job_captions` (bez kredytów HeyGen). Zużywa kredyty AI i ElevenLabs (dźwięk). Tylko administrator/operator.",
  inputSchema: {
    id: z.string().uuid().optional(),
    script: z.string().max(5000).optional(),
    topic: z.string().max(2000).optional(),
    track: z.enum(["pozyczkobiorca", "inwestor"]).optional(),
    ...HOOK_FIELDS,
    hook_variant: z.enum(["A", "B", "C"]).optional(),
    generate_assets: z.boolean().default(true),
    save: z.boolean().default(true),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const hookLib = await import("@/lib/studio-hook");
      const srv = await import("@/lib/studio-hook.server");
      const patch = Object.fromEntries(
        Object.keys(HOOK_FIELDS).flatMap((k) =>
          (a as Record<string, unknown>)[k] !== undefined
            ? [[k, (a as Record<string, unknown>)[k]]]
            : [],
        ),
      );
      let job: Record<string, any> | null = null;
      if (a.id) {
        const { data } = await s
          .from("studio_video_jobs")
          .select(
            "id, prompt, script, hook, hook_variant, track, material_audience, publish_title, status",
          )
          .eq("id", a.id)
          .maybeSingle();
        if (!data) return fail("Nie znaleziono zadania.");
        job = data;
        if (job.status === "captioning") {
          return fail(
            "Wykończenie rolki jest w toku (captioning) — podgląd hooka po jego zakończeniu.",
          );
        }
      }
      const script = (a.script ?? job?.script ?? "").trim();
      const topic = (a.topic ?? job?.prompt ?? script).trim();
      const track = a.track ?? (job ? srv.trackOfJob(job) : null);
      let hook = job ? hookLib.sanitizeHook(job.hook) : null;
      let note: string | null = null;
      if (!hook) {
        if (!script && !patch.text) {
          return fail(
            "Podaj `script` (albo `id` zadania ze scenariuszem) albo pola hooka (`text`, `visual_prompt`).",
          );
        }
        if (script) {
          const gen = await srv.generateHookSpecs({ script, topic, track });
          note = gen.note;
          hook = {
            ...gen.specs[0],
            ...(gen.specs.length > 1 ? { variants: gen.specs.slice(0, 2) } : {}),
            variant: null,
            assets: null,
          };
        }
      }
      if (Object.keys(patch).length) {
        hook = hookLib.mergeHookPatch(hook, patch);
        if (!hook) return fail("Hook: pole `text` (1–4 słowa) jest wymagane.");
      }
      if (!hook) return fail("Nie udało się zaplanować hooka.");
      if (hook.clip_slug) {
        const bank = await import("@/lib/studio-hook-clips.server");
        if (!(await bank.getHookClipBySlug(hook.clip_slug))) {
          return fail(`Nie ma klipu „${hook.clip_slug}” w banku klipów hooka (list_hook_clips).`);
        }
      } else if (typeof a.clip_slug === "string" && a.clip_slug.trim()) {
        return fail("Nieprawidłowy `clip_slug` (małe litery, cyfry, _ i -).");
      }
      const key = hookLib.chooseHookVariant(
        hook,
        job?.id ?? "podglad",
        a.hook_variant ?? job?.hook_variant ?? null,
      );
      hook = hookLib.applyHookVariant(hook, key);
      if (a.generate_assets && hook.assets?.status !== "ready") {
        try {
          const name = job?.publish_title || topic || "hook";
          const ctxClip = { track, script, topic };
          const started = hook.assets
            ? (await srv.advanceHookAssets(hook, name, new Date(), ctxClip)).assets
            : await srv.startHookAssets(hook, name, ctxClip);
          hook = { ...hook, assets: started };
        } catch (e) {
          note = [note, `Zasoby hooka nieudane: ${errMsg(e)}`].filter(Boolean).join(" ");
        }
      }
      if (job && a.save) {
        const { error } = await s
          .from("studio_video_jobs")
          .update({ hook, hook_variant: key } as never)
          .eq("id", job.id);
        if (error) return fail(`studio_video_jobs: ${error.message}`);
      }
      const layout = hookLib.layoutHookText(hook.text, hook.highlight);
      const result = {
        ok: true,
        job_id: job?.id ?? null,
        saved: Boolean(job && a.save),
        hook_variant: key,
        hook,
        on_screen: {
          lines: layout.lines.map((l) =>
            l.map((w) => (w.accent ? `[${w.text}]` : w.text)).join(" "),
          ),
          font_px_720x1280: layout.fontSize,
          text_height_share:
            Math.round(((layout.fontSize * layout.lines.length) / 1280) * 100) / 100,
          seconds: hookLib.buildReelHook(hook)?.end ?? hookLib.HOOK_SECONDS,
        },
        pro_plan_required: hook.assets?.pro_plan_required === true,
        note,
        hint:
          hook.assets?.status === "pending"
            ? "Klip w toku — kolejka odbierze go przy wykończeniu (albo wywołaj ponownie)."
            : "Hook rysuje silnik Remotion. Gotową rolkę wykończ `restyle_studio_job_captions` — bez kredytów HeyGen.",
        actor: actorId(ctx),
      };
      if (hook.assets?.kind === "image" && hook.assets.url) {
        const { fetchImageBlock } = await import("@/lib/media-storage.server");
        const img = await fetchImageBlock(hook.assets.url).catch(() => null);
        return okWith(result, img ? [img] : []);
      }
      return ok(result);
    }),
});

export const setStudioAvatarFraming = defineTool({
  name: "set_studio_avatar_framing",
  title: "Set avatar orientation / framing for studio reels",
  description:
    "Orientacja zdjęcia awatara HeyGen i punkt kadru dla Remotion. Studio wykrywa orientację samo (z podglądu awatara); poziome zdjęcie nie prowadzi rolki (pionowy z zestawu przejmuje hook), a jego ujęcia Remotion kadruje „cover” do pełnego pionu. Tu poprawisz wynik: `orientation`, `focus_x` / `focus_y` (0–1, punkt zdjęcia, który zostaje w kadrze; domyślnie 0,5 / 0,35 — środek, górna część z twarzą). `detect=true` wykrywa od nowa z podglądu. Tylko administrator/operator.",
  inputSchema: {
    avatar_id: z.string().min(1),
    orientation: z.enum(["portrait", "landscape", "square"]).optional(),
    focus_x: z.number().min(0).max(1).optional(),
    focus_y: z.number().min(0).max(1).optional(),
    detect: z.boolean().default(false),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const o = await import("@/lib/studio-avatar-orientation.server");
      const framing = await import("@/lib/studio-avatar-framing");
      try {
        if (a.detect) {
          const { listHeygenCatalog } = await import("@/lib/heygen-catalog.server");
          const item = (await listHeygenCatalog()).find((i) => i.id === a.avatar_id);
          if (!item?.preview)
            return fail("Awatar bez podglądu w katalogu HeyGen — podaj `orientation`.");
          await o.detectAvatarOrientation(a.avatar_id, item.preview);
        }
        const info =
          a.orientation || a.focus_x !== undefined || a.focus_y !== undefined
            ? await o.setAvatarFraming({
                avatarId: a.avatar_id,
                orientation: a.orientation,
                focusX: a.focus_x,
                focusY: a.focus_y,
              })
            : ((await o.ensureAvatarOrientations([a.avatar_id])).get(a.avatar_id) ?? null);
        if (!info)
          return fail("Nie udało się ustalić orientacji (brak podglądu) — podaj `orientation`.");
        return ok({
          ok: true,
          avatar_id: a.avatar_id,
          ...info,
          lead_ok: framing.isLeadSafe(info.orientation),
          cover: framing.coverTransform(info),
          actor: actorId(ctx),
        });
      } catch (e) {
        return fail(errMsg(e));
      }
    }),
});

// ── Bank klipów hooka (`clip_bank`) ─────────────────────────────────────────

const CLIP_TRACK = z.enum(["pozyczkobiorca", "inwestor", "both"]);

const publicClip = <T extends { storage_path?: unknown }>({ storage_path: _p, ...rest }: T) => rest;

export const importHookClips = defineTool({
  name: "import_hook_clips",
  title: "Import clips into the studio hook clip bank",
  description:
    "Import gotowych klipów hooka (mp4 9:16, ~5 s) do banku `clip_bank`. Klip trafia do rolki tylko wtedy, gdy pasuje do jej TREŚCI — dlatego podawaj `description` (po polsku: co klip znaczy, jaki problem widza ilustruje) i `tags` (frazy, którymi mówi o tym lektor); klipy jednego `concept` (ta sama metafora z różnych modeli) dobieramy razem, w koncepcie wygrywa najwyższy `rating`. Każdy klip zaczyna się mocnym ujęciem i KOŃCZY nieruchomą klatką białej ściany biura z logo 3D financeyou.pl — tym samym tłem co pionowe awatary HeyGen e0db8779828f484a8311fd427e815abe i 65ef986081bc48ed890c742cfa73d42e, więc rolka z takim hookiem powinna zaczynać się od jednego z nich (klip gra w całości i tnie się na twardo do awatara). Plik jest pobierany spod `source_url` (do 60 MB, tylko wideo) i kopiowany do naszego Storage (linki fal.media wygasają). Import po kolei, upsert po `slug`; slug już zaimportowany (z plikiem) aktualizuje tylko metadane bez pobierania, chyba że `force=true`. Zwraca wynik dla każdej pozycji i liczniki. Tylko administrator/operator.",
  inputSchema: {
    items: z
      .array(
        z.object({
          slug: z.string().min(1).max(80),
          concept: z.string().max(80).optional(),
          title: z.string().max(160).optional(),
          track: CLIP_TRACK,
          model: z.string().max(40).optional(),
          rating: z.number().int().min(1).max(5).optional(),
          description: z.string().max(500).optional(),
          tags: z.array(z.string().max(60)).max(24).optional(),
          source_url: z.string().url(),
        }),
      )
      .min(1)
      .max(80),
    force: z.boolean().default(false),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const bank = await import("@/lib/studio-hook-clips.server");
      const results: Array<Record<string, unknown>> = [];
      const counts = { imported: 0, updated: 0, skipped: 0, failed: 0 };
      for (const item of a.items) {
        try {
          const r = await bank.importHookClip(item, { force: a.force });
          counts[r.status]++;
          results.push({
            slug: r.slug,
            ok: true,
            status: r.status,
            id: r.clip.id,
            media_url: r.clip.media_url,
            duration_s: r.clip.duration_s,
          });
        } catch (e) {
          counts.failed++;
          results.push({ slug: item.slug, ok: false, error: errMsg(e).slice(0, 300) });
        }
      }
      return ok({ ok: counts.failed === 0, counts, results, actor: actorId(ctx) });
    }),
});

export const listHookClips = defineTool({
  name: "list_hook_clips",
  title: "List studio hook clip bank",
  description:
    "Lista banku klipów hooka (`clip_bank`): slug, koncept, tytuł, opis, tagi, tor, model, ocena, długość, aktywność, liczba użyć i ostatnie użycie. Klip do rolki dobiera się po treści (opis + tagi konceptu); slug przypniesz polem hooka `clip_slug`. Filtry: `track` (pozyczkobiorca | inwestor | both — dokładnie ten tor), `active`. Tylko administrator/operator.",
  inputSchema: {
    track: CLIP_TRACK.optional(),
    active: z.boolean().optional(),
    limit: z.number().int().min(1).max(500).default(100),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const bank = await import("@/lib/studio-hook-clips.server");
      const items = await bank.listHookClips({
        track: a.track ?? null,
        active: a.active ?? null,
        limit: a.limit,
      });
      return ok({ total: items.length, items: items.map(publicClip) });
    }),
});

export const setHookClipActive = defineTool({
  name: "set_hook_clip_active",
  title: "Enable or disable a hook clip",
  description:
    "Włącza albo wyłącza klip w banku klipów hooka — wyłączony nie wchodzi do doboru (np. nietrafione ujęcie). Tylko administrator/operator.",
  inputSchema: { id: z.string().uuid(), active: z.boolean() },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const bank = await import("@/lib/studio-hook-clips.server");
      const clip = await bank.setHookClipActive(a.id, a.active);
      if (!clip) return fail("Nie znaleziono klipu.");
      return ok({ ok: true, clip: publicClip(clip), actor: actorId(ctx) });
    }),
});

export const studioHookTools = [
  previewStudioHook,
  setStudioAvatarFraming,
  importHookClips,
  listHookClips,
  setHookClipActive,
];
