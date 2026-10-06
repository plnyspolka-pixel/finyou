// Studio publikacji — jakość i pochodzenie rolek: czym powstała rolka
// (raport etap po etapie, Remotion tak/nie), orientacja i silnik awatarów
// przed zamówieniem, pomiar gotowego pliku (wymiary, bitrate, pasy w kadrze).
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fail, handle, ok, okWith, oneOf, requireTeam } from "../_helpers";
import { ttsModelLabel } from "@/lib/studio-tts-models";
import {
  letterboxedAvatars,
  type AvatarQuality,
  type RenderMeta,
  type StudioQualitySettings,
} from "@/lib/studio-quality";
import type { VideoProbeResult } from "@/lib/caption-burner.server";

const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: true } as const;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const REMOTION_NOTE =
  "Remotion NIE bierze udziału w rolkach Studia. W repozytorium jest projekt services/remotion (Remotion Lambda na AWS), ale ma tylko testową kompozycję HelloFinanceYou i nie jest podłączony do Studia ani do kolejki. Obraz rolki składa HeyGen (API v3), napisy/znaczek/nakładki wypala nasza usługa caption-burner (FFmpeg + libass).";
const RENDER_ENGINE_NOTE =
  "Kolumna `render_engine` (wartość domyślna z bazy, np. „auto”) nie jest czytana ani zapisywana przez kod Studia — nie wskazuje silnika. Silnik i parametry renderu są w `render_meta` (od tej wersji) i w tym raporcie.";

function settingsPayload(s: StudioQualitySettings) {
  return {
    video_resolution: s.resolution,
    avatar_engine: s.avatarEngine,
    landscape_avatars: s.landscapePolicy,
    note: "Zmienia `update_studio_settings`. 1080p = najwyższa natywna rozdzielczość awatarów HeyGen; `best` = Avatar V tam, gdzie look go obsługuje; `block` = rolka ze scenami nie rusza z poziomym lookiem (pasy), zanim pójdą kredyty.",
  };
}

// ── Pomiar pliku ────────────────────────────────────────────────────────────

type ProbeOutcome =
  | { status: "done"; probe_id: string; url: string; result: VideoProbeResult | null }
  | { status: "pending"; probe_id: string; url: string; note: string }
  | { status: "failed"; probe_id: string | null; url: string; error: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForProbe(
  probeId: string,
  url: string,
  waitSeconds: number,
): Promise<ProbeOutcome> {
  const { getVideoProbe } = await import("@/lib/caption-burner.server");
  const deadline = Date.now() + waitSeconds * 1000;
  for (;;) {
    const p = await getVideoProbe(probeId);
    if (p.status === "done") return { status: "done", probe_id: probeId, url, result: p.result };
    if (p.status === "failed" || p.status === "missing") {
      return { status: "failed", probe_id: probeId, url, error: p.error ?? p.status };
    }
    if (Date.now() + 4000 > deadline) {
      return {
        status: "pending",
        probe_id: probeId,
        url,
        note: "Pomiar trwa (usługa na darmowym planie bywa uśpiona i wolna) — wywołaj `inspect_video_file` z tym `probe_id` za minutę.",
      };
    }
    await sleep(4000);
  }
}

async function startProbe(url: string, samples: number, waitSeconds: number, name: string) {
  try {
    const { submitVideoProbe } = await import("@/lib/caption-burner.server");
    const id = await submitVideoProbe({ videoUrl: url, samples, name });
    return await waitForProbe(id, url, waitSeconds);
  } catch (e) {
    return { status: "failed" as const, probe_id: null, url, error: errMsg(e) };
  }
}

function probeVerdict(r: VideoProbeResult | null): string[] {
  if (!r) return [];
  const out: string[] = [];
  if (r.width && r.height) {
    const vertical = r.height > r.width;
    out.push(
      `${r.width}×${r.height}${vertical ? " (pion)" : " (NIE pion)"}${
        r.height >= 1920 || r.width >= 1920 ? " — Full HD" : r.height >= 1280 ? " — 720p" : ""
      }`,
    );
  }
  if (r.bit_rate_kbps) out.push(`bitrate ${r.bit_rate_kbps} kb/s`);
  if (r.fps) out.push(`${r.fps} kl/s`);
  if (r.frame_check) {
    const fc = r.frame_check;
    out.push(
      fc.has_bars
        ? `PASY: ${fc.verdict} (letterbox w ${fc.letterbox_at.join(", ") || "—"} s; pillarbox w ${fc.pillarbox_at.join(", ") || "—"} s)`
        : fc.verdict,
    );
  }
  return out;
}

export const inspectVideoFile = defineTool({
  name: "inspect_video_file",
  title: "Inspect video file (resolution, bitrate, black bars)",
  description:
    "Mierzy gotowy plik wideo usługą FFmpeg (caption-burner): rzeczywista rozdzielczość, orientacja, kl/s, bitrate, kodeki i kontrola kadru — czy są pasy u góry/u dołu (letterbox) albo po bokach (pillarbox), z chwilami, w których wystąpiły. Wykrywa jednolite pasy tła (także granatowe tło HeyGena, którego zwykłe wykrywanie czerni nie łapie). Podaj `url` (https), `job_id` zadania Studia (mierzy czysty master HeyGena — napisy i znaczek „AI” nie zakłócają kontroli pasów — oraz plik finalny) albo `probe_id` z poprzedniego wywołania, gdy pomiar jeszcze trwał. Nic nie zmienia. Tylko administrator/operator.",
  inputSchema: {
    url: z.string().url().optional(),
    job_id: z.string().uuid().optional(),
    probe_id: z.string().min(8).optional().describe("Id pomiaru z poprzedniego wyniku `pending`."),
    samples: z.number().int().min(1).max(24).default(8).describe("Ile klatek sprawdzić."),
    wait_seconds: z.number().int().min(0).max(110).default(45),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      if (a.probe_id) {
        const p = await waitForProbe(a.probe_id, a.url ?? "", a.wait_seconds);
        return ok({ ...p, summary: p.status === "done" ? probeVerdict(p.result) : [] });
      }
      const targets: Array<{ label: string; url: string }> = [];
      if (a.url) targets.push({ label: "plik", url: a.url });
      if (a.job_id) {
        const job = await oneOf(
          s
            .from("studio_video_jobs")
            .select("id, status, video_url, video_url_clean, publish_title")
            .eq("id", a.job_id),
          "studio_video_jobs",
        );
        if (!job) return fail("Nie znaleziono zadania.");
        if (job.video_url_clean)
          targets.push({ label: "master HeyGen (bez napisów)", url: job.video_url_clean });
        if (job.video_url && job.video_url !== job.video_url_clean)
          targets.push({ label: "plik finalny (z napisami)", url: job.video_url });
        if (!targets.length) return fail(`Zadanie ma status ${job.status} — nie ma jeszcze pliku.`);
      }
      if (!targets.length) return fail("Podaj `url`, `job_id` albo `probe_id`.");
      const results = [];
      for (const t of targets) {
        const p = await startProbe(t.url, a.samples, a.wait_seconds, "pomiar");
        results.push({
          label: t.label,
          ...p,
          summary: p.status === "done" ? probeVerdict(p.result) : [],
        });
      }
      return ok({
        results,
        note: "Kontrola pasów patrzy na płaskość brzegów kadru. Na pliku z napisami/znaczkiem „AI” nakładka przy krawędzi może zamaskować pas — rozstrzyga pomiar czystego mastera.",
      });
    }),
});

// ── Awatary przed zamówieniem ───────────────────────────────────────────────

export const checkStudioAvatars = defineTool({
  name: "check_studio_avatars",
  title: "Check studio avatars quality (orientation, engine)",
  description:
    "Sprawdza awatary PRZED zamówieniem rolki: orientacja i natywne piksele looka z HeyGen v3 (pionowy wypełnia kadr 9:16; POZIOMY w rolce ze scenami b-roll daje pasy u góry i u dołu, bo HeyGen nie przycina scen), obsługiwane silniki i ten, którym pójdzie render (Avatar V przy ustawieniu `best`). Bez `avatar_ids` sprawdza zestaw domyślnych z panelu Studia (pozycja 1 = prowadzący, mówi hook i CTA). `alternatives=true` dokłada pionowe looki z konta jako zamienniki. Pokazuje też ustawienia jakości Studia. Nic nie zmienia, nie zużywa kredytów. Tylko administrator/operator.",
  inputSchema: {
    avatar_ids: z.array(z.string().min(1)).max(12).optional(),
    alternatives: z.boolean().default(true),
    include_public: z
      .boolean()
      .default(false)
      .describe("Zamienniki także z publicznych awatarów HeyGen (dłużej)."),
    preview: z.boolean().default(false).describe("Podglądy (obrazy) sprawdzanych awatarów."),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const q = await import("@/lib/studio-quality.server");
      const settings = await q.getStudioQualitySettings();
      const { listDefaultAvatars } = await import("@/lib/studio-avatars.server");
      const defaultsSet = await listDefaultAvatars();
      const ids = a.avatar_ids?.length ? a.avatar_ids : defaultsSet.map((d) => d.avatar_id);
      if (!ids.length) return fail("Brak zestawu domyślnych w panelu Studia — podaj `avatar_ids`.");
      const assessed = await q.assessAvatars(ids, settings);
      const nameOf = new Map(defaultsSet.map((d) => [d.avatar_id, d.name]));
      const avatars = assessed.map((x, i) => ({
        position: i + 1,
        role: i === 0 ? "prowadzący (hook i CTA)" : "a-roll (rotacja)",
        ...x,
        name: x.name ?? nameOf.get(x.id) ?? null,
        panel_name: nameOf.get(x.id) ?? null,
      }));
      const bad = letterboxedAvatars(assessed);
      const payload: Record<string, unknown> = {
        settings: settingsPayload(settings),
        avatars,
        reel_with_broll: bad.length
          ? {
              ok: false,
              verdict: `Pasy w ujęciach: ${bad.map((b) => b.name ?? b.id).join(", ")}.`,
              blocked: settings.landscapePolicy === "block",
            }
          : { ok: true, verdict: "Wszystkie looki pionowe (albo nieznane) — pełny kadr." },
        single_shot: {
          verdict:
            "Pojedyncze ujęcie (`reel_structure=false`) zamawiane jest z `fit: cover` — kadr zawsze pełny; poziomy look ma wtedy przycięte boki.",
        },
      };
      if (a.alternatives && bad.length) {
        try {
          const alts = await q.listPortraitLooks({ includePublic: a.include_public, limit: 15 });
          payload.portrait_alternatives = alts.map((l) => ({
            id: l.id,
            name: l.name,
            size: l.width && l.height ? `${l.width}×${l.height}` : null,
            avatar_type: l.avatarType,
            supported_engines: l.engines,
          }));
        } catch (e) {
          payload.portrait_alternatives_error = errMsg(e);
        }
      }
      if (!a.preview) return ok(payload);
      const { fetchImageBlocks } = await import("@/lib/media-storage.server");
      const looks = await Promise.all(ids.slice(0, 6).map((id) => q.getHeygenLook(id)));
      const images = await fetchImageBlocks(
        looks.map((l) => l?.previewImageUrl ?? null),
        { max: 6 },
      );
      return okWith(payload, images);
    }),
});

// ── Raport pochodzenia rolki ────────────────────────────────────────────────

export const getStudioRenderReport = defineTool({
  name: "get_studio_render_report",
  title: "Studio reel render report (engines, quality)",
  description:
    "Raport „czym i jak zrobiono rolkę” dla zadania Studia, etap po etapie: lektor (ElevenLabs + model), obraz awatarów i montaż scen (HeyGen API v3: sklejka `studio` albo pojedyncze ujęcie, rozdzielczość, kadrowanie, silnik Avatar V/IV per awatar), przebitki b-roll, napisy/znaczek/nakładki (caption-burner, FFmpeg), oraz wprost: czy użyto Remotion (nie) i co znaczy kolumna `render_engine`. Dla każdej sceny: kto mówi, orientacja looka i czy da pasy. `measure=true` (domyślnie) mierzy też pliki usługą FFmpeg: rzeczywista rozdzielczość, bitrate, pasy w kadrze. Rolki sprzed metryki renderu dostają dane odtworzone z kodu tamtej wersji (oznaczone `reconstructed`). Nic nie zmienia. Tylko administrator/operator.",
  inputSchema: {
    id: z.string().uuid(),
    measure: z.boolean().default(true),
    wait_seconds: z.number().int().min(0).max(100).default(40),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const job = await oneOf(
        s.from("studio_video_jobs").select("*").eq("id", a.id),
        "studio_video_jobs",
      );
      if (!job) return fail("Nie znaleziono zadania.");
      const q = await import("@/lib/studio-quality.server");
      const settings = await q.getStudioQualitySettings();
      const meta = (
        job.render_meta && typeof job.render_meta === "object" && "compositor" in job.render_meta
          ? job.render_meta
          : null
      ) as RenderMeta | null;

      const plan = (Array.isArray(job.scene_plan) ? job.scene_plan : []) as Array<{
        kind?: string;
        text?: string;
        query?: string | null;
        avatarId?: string | null;
      }>;
      const sceneAvatarIds = plan
        .filter((p) => p.kind === "avatar")
        .map((p) => p.avatarId || job.avatar_id);
      const avatarIds = plan.length ? sceneAvatarIds : [job.avatar_id];
      // Ocena „na dziś” — orientacja looka się nie zmienia, silnik pokazujemy z metryki.
      const assessedNow = await q.assessAvatars(avatarIds, settings);
      const byId = new Map<string, AvatarQuality>(
        (meta?.avatars ?? assessedNow).map((x) => [x.id, x]),
      );
      for (const x of assessedNow) if (!byId.has(x.id)) byId.set(x.id, x);
      const { listDefaultAvatars } = await import("@/lib/studio-avatars.server");
      const names = new Map((await listDefaultAvatars()).map((d) => [d.avatar_id, d.name]));
      const label = (id: string) => byId.get(id)?.name ?? names.get(id) ?? id;

      const multiScene = plan.length > 0;
      const reconstructed = !meta;
      const videoType = meta?.heygen.video_type ?? (multiScene ? "studio" : "avatar");
      const resolution = meta?.heygen.resolution ?? "720p";
      const scenes = plan.map((p, i) => {
        if (p.kind !== "avatar") {
          return { n: i + 1, kind: "b-roll (grafika)", query: p.query ?? null, text: p.text };
        }
        const id = p.avatarId || job.avatar_id;
        const x = byId.get(id);
        return {
          n: i + 1,
          kind: i === 0 ? "awatar — hook" : i === plan.length - 1 ? "awatar — CTA" : "awatar",
          avatar_id: id,
          avatar: label(id),
          orientation: x?.orientation ?? "unknown",
          size: x?.width && x?.height ? `${x.width}×${x.height}` : null,
          bars_in_frame: videoType === "studio" ? (x?.letterbox_in_reel ?? null) : false,
          text: p.text,
        };
      });

      const captionsBurned = job.captions !== false && Boolean(job.video_url_clean);
      const pipeline = [
        {
          stage: "lektor",
          engine: "ElevenLabs (text-to-speech z czasami znaków)",
          model: job.tts_model_id ?? meta?.tts.model ?? null,
          model_label: job.tts_model_id ? ttsModelLabel(job.tts_model_id) : null,
        },
        {
          stage: "obraz awatarów i montaż scen",
          engine: "HeyGen API v3",
          heygen_video_id: job.heygen_video_id,
          video_type:
            videoType === "studio"
              ? "studio — sklejka scen (awatary + grafiki b-roll)"
              : "avatar — pojedyncze ujęcie",
          resolution,
          aspect_ratio: "9:16",
          framing:
            videoType === "studio"
              ? "HeyGen wpasowuje każdą scenę w kadr bez przycinania — poziomy look = pasy w tle #101728"
              : meta
                ? "fit: cover — kadr wypełniony"
                : "bez `fit` (wybór HeyGena)",
          avatar_engines: [...new Set(avatarIds)].map((id) => ({
            avatar: label(id),
            engine: meta
              ? (byId.get(id)?.engine ?? "avatar_iv (domyślny)")
              : "avatar_iv (domyślny — wersja sprzed wyboru silnika)",
          })),
          engine_fallback: meta?.heygen.engine_fallback ?? null,
        },
        {
          stage: "przebitki b-roll",
          engine: "bank b-rolli Finance You + stock HeyGen (grafiki statyczne, scena `image`)",
          scenes: plan.filter((p) => p.kind !== "avatar").length,
        },
        {
          stage: "napisy, znaczek „AI”, nakładki",
          engine: "caption-burner (FFmpeg + libass, usługa na Render.com)",
          burned: captionsBurned,
          caption_style: job.caption_style,
          srt: job.subtitle_url,
        },
        { stage: "Remotion", used: false, note: REMOTION_NOTE },
      ];

      const warnings: string[] = [...(meta?.warnings ?? [])];
      if (reconstructed) {
        warnings.push(
          "Rolka sprzed metryki renderu — parametry odtworzone z kodu tamtej wersji: 720p, domyślny silnik Avatar IV, bez kadrowania `cover`.",
        );
        const bad = scenes.filter((sc) => "bars_in_frame" in sc && sc.bars_in_frame === true);
        for (const sc of bad)
          warnings.push(
            `Scena ${sc.n} (${"avatar" in sc ? sc.avatar : ""}): poziomy look — pasy w kadrze.`,
          );
      }
      if (job.avatar_id && names.size && ![...names.keys()].slice(0, 1).includes(job.avatar_id)) {
        warnings.push(
          `Prowadzący (${label(job.avatar_id)}) nie jest pozycją 1 obecnego zestawu domyślnych (${[...names.values()][0]}).`,
        );
      }

      const report: Record<string, unknown> = {
        job: {
          id: job.id,
          title: job.publish_title || job.prompt.slice(0, 80),
          status: job.status,
          created_at: job.created_at,
          video_url: job.video_url,
          video_url_clean: job.video_url_clean,
        },
        answer: {
          remotion_used: false,
          compositor: videoType === "studio" ? "HeyGen studio (v3)" : "HeyGen avatar (v3)",
          render_engine_column: job.render_engine ?? null,
          render_engine_note: RENDER_ENGINE_NOTE,
        },
        pipeline,
        lead_avatar: { id: job.avatar_id, name: label(job.avatar_id) },
        scenes,
        warnings,
        current_settings: settingsPayload(settings),
        render_meta: meta ?? null,
        reconstructed,
      };

      if (a.measure) {
        const measurements: Record<string, unknown> = {};
        if (job.video_url_clean) {
          const p = await startProbe(job.video_url_clean, 8, a.wait_seconds, "master");
          measurements.master = {
            ...p,
            summary: p.status === "done" ? probeVerdict(p.result) : [],
          };
        }
        if (job.video_url && job.video_url !== job.video_url_clean) {
          const p = await startProbe(job.video_url, 4, Math.min(a.wait_seconds, 30), "final");
          measurements.final = { ...p, summary: p.status === "done" ? probeVerdict(p.result) : [] };
        }
        report.measurements = Object.keys(measurements).length
          ? measurements
          : { note: "Brak pliku do pomiaru (render nie skończony)." };
      }
      return ok(report);
    }),
});

export const studioQualityTools = [getStudioRenderReport, checkStudioAvatars, inspectVideoFile];
