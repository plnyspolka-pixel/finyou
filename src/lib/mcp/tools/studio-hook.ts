// Studio publikacji — narzędzia robota do HOOKA WIZUALNEGO rolki (podgląd,
// generowanie zasobów) i KADROWANIA AWATARÓW (orientacja zdjęcia, punkt
// kadru). Te same funkcje co kolejka Studia (studio-hook.server.ts).
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

const HOOK_FIELDS = {
  visual_prompt: z.string().max(700).optional(),
  text: z.string().max(60).optional(),
  highlight: z.string().max(40).nullable().optional(),
  sfx_prompt: z.string().max(220).optional(),
  source: z.enum(["auto", "flows_video", "flows_image", "studio_image", "broll"]).optional(),
  music_prompt: z.string().max(220).nullable().optional(),
};

export const previewStudioHook = defineTool({
  name: "preview_studio_hook",
  title: "Preview the visual hook of a studio reel",
  description:
    "Podgląd hooka wizualnego rolki Studia (0–2,5 s: pełny kadr w ruchu nad pierwszym zdaniem lektora, efekt dźwiękowy, duży tekst 1–4 słowa ze słowem w złocie). Z `id` bierze zadanie (jego hook albo planuje nowy z generatora — warianty A/B), bez `id` — ze `script` / `topic` / `track`. Pola hooka nadpisują plan. `generate_assets=true` (domyślnie) robi klip i dźwięk: ElevenLabs Flows wideo (Veo) → Flows obraz → grafika Studia → bank przebitek; brak planu Pro (402) zgłasza i schodzi niżej sam. Klip Flows wideo generuje się kilka minut — wynik `pending` odbierze kolejka przy wykończeniu. `save=true` (z `id`) zapisuje hook przy zadaniu; gotową rolkę wykończ potem `restyle_studio_job_captions` (bez kredytów HeyGen). Zużywa kredyty ElevenLabs / AI. Tylko administrator/operator.",
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
      const key = hookLib.chooseHookVariant(
        hook,
        job?.id ?? "podglad",
        a.hook_variant ?? job?.hook_variant ?? null,
      );
      hook = hookLib.applyHookVariant(hook, key);
      if (a.generate_assets && hook.assets?.status !== "ready") {
        try {
          const name = job?.publish_title || topic || "hook";
          const started = hook.assets
            ? (await srv.advanceHookAssets(hook, name)).assets
            : await srv.startHookAssets(hook, name);
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
          seconds: hookLib.HOOK_SECONDS,
        },
        pro_plan_required: hook.assets?.pro_plan_required === true,
        note,
        hint:
          hook.assets?.status === "pending"
            ? "Klip Flows w toku — kolejka odbierze go przy wykończeniu (albo wywołaj ponownie)."
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

export const studioHookTools = [previewStudioHook, setStudioAvatarFraming];
