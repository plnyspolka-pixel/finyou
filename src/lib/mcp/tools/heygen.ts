// HeyGen — awatary i głosy, limit kredytów, filmy (lista, status, zapis do
// Storage, usuwanie), generowanie wideo awatara (tekst → ElevenLabs → HeyGen,
// głos HeyGen, gotowe audio), szablony, tłumaczenie wideo, stock, assety,
// ogólne wywołanie API oraz Studio publikacji Finance You (zadania wideo,
// scenariusze AI, grafiki, publikacja do kolejek) i Awatar FAQ (Filip).
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  DESTRUCTIVE,
  WRITE,
  WRITE_IDEMPOTENT,
  actorId,
  clampLimit,
  countBy,
  fail,
  handle,
  insertOne,
  linkBlock,
  ok,
  okWith,
  oneOf,
  patchOf,
  requireRolesAdmin,
  requireTeam,
  requireTeamAdmin,
  rowsOf,
  snippet,
  updateOne,
} from "../_helpers";
import { defineListTool, flag, search, text } from "../_list-tool";

const ADMIN_ONLY = ["administrator"] as const;
const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: true } as const;

const PLATFORMS = [
  "youtube",
  "facebook_post",
  "facebook_reels",
  "instagram_reels",
  "tiktok",
] as const;
const PRIVACY = ["public", "unlisted", "private"] as const;
const ASPECT = ["9:16", "16:9", "1:1"] as const;
const RESOLUTION = ["720p", "1080p"] as const;
const CAPTIONS = ["burned", "sidecar", "off"] as const;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Bloki podglądu do wyniku: miniatura (obraz), animowany GIF gotowego filmu
 * (HeyGen v1) i link do pliku wideo. Klient bez obsługi obrazów zobaczy sam
 * tekst z linkami — podgląd nigdy nie psuje wyniku.
 */
async function previewBlocks(
  enabled: boolean,
  v: {
    videoId: string | null;
    completed: boolean;
    thumbnailUrl: string | null;
    gifUrl: string | null;
    videoUrl: string | null;
    name: string;
  },
) {
  const blocks = linkBlock(
    v.videoUrl,
    `${v.name}.mp4`,
    "video/mp4",
    "Gotowy film — otwórz w przeglądarce.",
  );
  if (!enabled) return blocks;
  const { fetchImageBlock } = await import("@/lib/media-storage.server");
  const thumb = await fetchImageBlock(v.thumbnailUrl);
  if (thumb) blocks.push(thumb);
  if (v.completed && v.videoId) {
    let gifUrl = v.gifUrl;
    if (!gifUrl) {
      const hg = await import("@/lib/heygen-api.server");
      gifUrl = await hg.getVideoGif(v.videoId);
    }
    const gif = await fetchImageBlock(gifUrl, 6 * 1024 * 1024);
    if (gif) blocks.push(gif);
  }
  return blocks;
}

async function defaults() {
  const { HEYGEN_AVATARS, FILIP_VOICE_ID } = await import("@/lib/heygen-avatars");
  return {
    avatarId: HEYGEN_AVATARS[0].id,
    avatarName: HEYGEN_AVATARS[0].name,
    voiceId: FILIP_VOICE_ID,
  };
}

// ── Status ──────────────────────────────────────────────────────────────────

export const heygenStatus = defineTool({
  name: "heygen_status",
  title: "HeyGen status",
  description:
    "Stan integracji HeyGen: klucz API, pozostałe kredyty, liczba awatarów (moje / publiczne / ze zdjęcia), domyślny awatar i głos (Filip), zadania Studia po statusach z ostatnim błędem, filmy Awatar FAQ. Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const hg = await import("@/lib/heygen-api.server");
      const d = await defaults();
      const out: Record<string, unknown> = {
        api_key_configured: hg.hasHeygenApiKey(),
        elevenlabs_configured: Boolean(process.env.ELEVENLABS_API_KEY),
        ai_configured: Boolean(process.env.LOVABLE_API_KEY),
        default_avatar: { id: d.avatarId, name: d.avatarName },
        default_elevenlabs_voice_id: d.voiceId,
      };
      if (hg.hasHeygenApiKey()) {
        try {
          out.quota = await hg.getRemainingQuota();
        } catch (e) {
          out.quota_error = errMsg(e);
        }
        try {
          const { listHeygenCatalog } = await import("@/lib/heygen-catalog.server");
          const cat = await listHeygenCatalog();
          out.avatars = {
            total: cat.length,
            mine: cat.filter((c) => c.mine).length,
            talking_photos: cat.filter((c) => c.kind === "talking_photo").length,
            my_avatars: cat
              .filter((c) => c.mine)
              .slice(0, 20)
              .map((c) => ({ id: c.id, name: c.name, kind: c.kind, group: c.group ?? null })),
          };
        } catch (e) {
          out.avatars_error = errMsg(e);
        }
      }
      const jobs = await rowsOf(
        s
          .from("studio_video_jobs")
          .select("id, status, publish_title, last_error, updated_at")
          .order("updated_at", { ascending: false })
          .limit(500),
        "studio_video_jobs",
      );
      const failed = jobs.find((j) => j.status === "failed");
      out.studio_jobs = {
        total: jobs.length,
        by_status: countBy(jobs, "status"),
        last_failed: failed
          ? {
              id: failed.id,
              title: failed.publish_title,
              error: snippet(failed.last_error, 300),
              updated_at: failed.updated_at,
            }
          : null,
      };
      const faqs = await rowsOf(
        s.from("avatar_faqs").select("is_published, video_status"),
        "avatar_faqs",
      );
      out.avatar_faqs = {
        total: faqs.length,
        published: faqs.filter((f) => f.is_published).length,
        by_video_status: countBy(faqs, "video_status"),
      };
      return ok(out);
    }),
});

// ── Awatary, głosy, stock ───────────────────────────────────────────────────

export const listHeygenAvatars = defineTool({
  name: "list_heygen_avatars",
  title: "List HeyGen avatars",
  description:
    "Awatary dostępne na koncie HeyGen: własne (digital twin Filipa, grupy, awatary ze zdjęć) i publiczne — id, nazwa, rodzaj, podgląd. Domyślnie tylko własne; `mine_only=false` dodaje publiczne (kilkaset). Tylko administrator/operator.",
  inputSchema: {
    mine_only: z.boolean().default(true),
    kind: z.enum(["avatar", "talking_photo"]).optional(),
    search: z.string().min(1).optional().describe("Fraza w nazwie / grupie."),
    limit: z.number().int().min(1).max(500).default(50),
    preview: z
      .boolean()
      .default(false)
      .describe("Pokaż w czacie podglądy (obrazy) pierwszych 6 awatarów z wyniku."),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const { listHeygenCatalog } = await import("@/lib/heygen-catalog.server");
      const d = await defaults();
      let items = await listHeygenCatalog();
      items = items.map((i) => (i.id === d.avatarId ? { ...i, mine: true } : i));
      if (a.mine_only) items = items.filter((i) => i.mine);
      if (a.kind) items = items.filter((i) => i.kind === a.kind);
      if (a.search) {
        const q = a.search.toLowerCase();
        items = items.filter(
          (i) => i.name.toLowerCase().includes(q) || (i.group ?? "").toLowerCase().includes(q),
        );
      }
      const avatars = items.slice(0, a.limit);
      const payload = { total: items.length, default_avatar_id: d.avatarId, avatars };
      if (!a.preview) return ok(payload);
      const { fetchImageBlocks } = await import("@/lib/media-storage.server");
      const images = await fetchImageBlocks(
        avatars.map((i) => i.preview),
        { max: 6 },
      );
      return okWith(
        { ...payload, preview_of: avatars.slice(0, 6).map((i) => `${i.name} (${i.id})`) },
        images,
      );
    }),
});

export const listHeygenVoices = defineTool({
  name: "list_heygen_voices",
  title: "List HeyGen voices",
  description:
    "Głosy wbudowane HeyGen (do `generate_avatar_video` z `heygen_voice_id`): id, nazwa, język, płeć, próbka. Domyślny lektor Finance You to głos ElevenLabs (Filip) — tych głosów używa się, gdy tekst ma czytać HeyGen. Filtr `language` np. `Polish`. Tylko administrator/operator.",
  inputSchema: {
    language: z.string().min(2).optional(),
    gender: z.enum(["male", "female"]).optional(),
    search: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(500).default(50),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const hg = await import("@/lib/heygen-api.server");
      let voices = await hg.listVoices();
      if (a.language)
        voices = voices.filter((v) =>
          (v.language ?? "").toLowerCase().includes(a.language!.toLowerCase()),
        );
      if (a.gender) voices = voices.filter((v) => (v.gender ?? "").toLowerCase() === a.gender);
      if (a.search)
        voices = voices.filter((v) => v.name.toLowerCase().includes(a.search!.toLowerCase()));
      return ok({ total: voices.length, voices: voices.slice(0, a.limit) });
    }),
});

export const searchHeygenStock = defineTool({
  name: "search_heygen_stock",
  title: "Search HeyGen stock library",
  description:
    "Szuka w bibliotece stocku HeyGen (grafiki, ikony, klipy) po frazie po angielsku — do przebitek i teł. Zwraca adresy plików. Tylko administrator/operator.",
  inputSchema: {
    query: z.string().min(2).max(100),
    type: z.enum(["image", "video", "icon"]).default("image"),
    limit: z.number().int().min(1).max(50).default(20),
    preview: z.boolean().default(false).describe("Pokaż w czacie pierwsze 4 grafiki z wyniku."),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const hg = await import("@/lib/heygen-api.server");
      const items = await hg.searchStock(a.query, { type: a.type, limit: a.limit });
      if (!a.preview) return ok({ total: items.length, items });
      const { fetchImageBlocks } = await import("@/lib/media-storage.server");
      const images = await fetchImageBlocks(
        items.map((i) => i.thumbnail_url ?? (a.type === "image" ? i.url : null)),
        { max: 4 },
      );
      return okWith({ total: items.length, items }, images);
    }),
});

// ── Filmy ───────────────────────────────────────────────────────────────────

export const listHeygenVideos = defineTool({
  name: "list_heygen_videos",
  title: "List HeyGen videos",
  description:
    "Filmy na koncie HeyGen (wszystkie, także spoza Studia): id, status, tytuł, typ, data, miniatura. Stronicowanie `token`. Powiązanie z zadaniami Studia: kolumna heygen_video_id w `list_studio_jobs`. Tylko administrator/operator.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(25),
    token: z.string().optional().describe("`next_token` z poprzedniej strony."),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const hg = await import("@/lib/heygen-api.server");
      return ok(await hg.listVideos({ limit: a.limit, token: a.token }));
    }),
});

export const getHeygenVideo = defineTool({
  name: "get_heygen_video",
  title: "Get HeyGen video status",
  description:
    "Status i pliki jednego filmu HeyGen: status (pending / processing / completed / failed), link do wideo (czysty master i wersja z wypalonymi napisami), miniatura, napisy SRT, długość, błąd. Linki HeyGen wygasają po ~7 dniach — `store=true` kopiuje gotowy plik do Storage (trwały publiczny link, np. do `queue_youtube_publication`). Tylko administrator/operator.",
  inputSchema: {
    video_id: z.string().min(5),
    store: z.boolean().default(false),
    variant: z
      .enum(["captioned", "clean"])
      .default("captioned")
      .describe("Który plik skopiować: z napisami (jeśli jest) czy czysty."),
    preview: z
      .boolean()
      .default(true)
      .describe("Pokaż w czacie miniaturę i animowany podgląd GIF gotowego filmu."),
  },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const hg = await import("@/lib/heygen-api.server");
      const v = await hg.getVideo(a.video_id);
      const { raw: _raw, ...video } = v;
      const blocks = await previewBlocks(a.preview, {
        videoId: v.video_id,
        completed: v.status === "completed",
        thumbnailUrl: v.thumbnail_url,
        gifUrl: v.gif_url,
        videoUrl: v.captioned_video_url ?? v.video_url,
        name: v.title ?? v.video_id,
      });
      if (!a.store) return okWith({ ...video }, blocks);
      if (v.status !== "completed")
        return okWith(
          {
            ...video,
            stored: null,
            note: "Film nie jest jeszcze gotowy — zapis do Storage dopiero przy status=completed.",
          },
          blocks,
        );
      const url = (a.variant === "captioned" ? v.captioned_video_url : null) ?? v.video_url;
      if (!url) return fail("HeyGen nie zwrócił adresu pliku.");
      const { fetchBytes, storeMedia } = await import("@/lib/media-storage.server");
      const file = await fetchBytes(url, 250 * 1024 * 1024);
      const stored = await storeMedia(file.bytes, {
        contentType: file.contentType.startsWith("video/") ? file.contentType : "video/mp4",
        visibility: "public",
        prefix: "heygen",
        name: v.title ?? v.video_id,
        ext: "mp4",
      });
      return okWith(
        {
          ...video,
          stored,
          stored_variant: url === v.captioned_video_url ? "captioned" : "clean",
        },
        blocks,
      );
    }),
});

export const syncLandingInvestorVideoTool = defineTool({
  name: "sync_landing_investor_video",
  title: "Sync landing investor video",
  description:
    "Kopiuje gotowy film HeyGen „Twoja droga do prywatnego finansowania nieruchomości” do naszego Storage (publiczny bucket studio-media, stała ścieżka) — landing /dla-inwestora odtwarza go wtedy z naszego pliku zamiast z HeyGen. Ponowne wywołanie nadpisuje kopię. Tylko administrator/operator.",
  inputSchema: {
    variant: z
      .enum(["captioned", "clean"])
      .default("captioned")
      .describe("Który plik skopiować: z wypalonymi napisami (jeśli jest) czy czysty."),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const { syncLandingInvestorVideo } = await import("@/lib/landing-video.server");
      return ok(await syncLandingInvestorVideo({ variant: a.variant }));
    }),
});

export const deleteHeygenVideo = defineTool({
  name: "delete_heygen_video",
  title: "Delete HeyGen video",
  description:
    "Usuwa film z konta HeyGen — nieodwracalnie (kopie w Storage i w kolejkach publikacji zostają). Tylko administrator.",
  inputSchema: { video_id: z.string().min(5) },
  annotations: DESTRUCTIVE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const hg = await import("@/lib/heygen-api.server");
      await hg.deleteVideo(a.video_id);
      return ok({ ok: true, deleted: a.video_id, actor: actorId(ctx) });
    }),
});

// ── Generowanie ─────────────────────────────────────────────────────────────

export const generateAvatarVideo = defineTool({
  name: "generate_avatar_video",
  title: "Generate avatar video (HeyGen)",
  description:
    "Zleca HeyGen film z awatarem poza kolejką Studia. Źródło lektora: `script` (tekst → głos ElevenLabs, domyślnie Filip; z `heygen_voice_id` czyta HeyGen), `audio_url` (gotowe MP3/WAV https) albo `audio_asset_id`. Awatar domyślnie digital twin Filipa, kadr 9:16 720p, napisy jako plik SRT (`captions=burned` wypala w obrazie — do rolek). Zwraca video_id do `get_heygen_video` (render trwa kilka minut). Zużywa kredyty HeyGen. Tylko administrator/operator.",
  inputSchema: {
    script: z.string().min(1).max(5000).optional(),
    audio_url: z.string().url().optional(),
    audio_asset_id: z.string().optional(),
    avatar_id: z.string().optional().describe("Domyślnie awatar Filipa."),
    voice_id: z.string().optional().describe("Głos ElevenLabs dla `script` (domyślnie Filip)."),
    heygen_voice_id: z
      .string()
      .optional()
      .describe("Głos HeyGen — wtedy tekst czyta HeyGen zamiast ElevenLabs."),
    character_kind: z.enum(["avatar", "talking_photo"]).default("avatar"),
    aspect_ratio: z.enum(ASPECT).default("9:16"),
    resolution: z.enum(RESOLUTION).default("720p"),
    captions: z.enum(CAPTIONS).default("sidecar"),
    background_color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#101728"),
    background_image_url: z.string().url().optional().describe("Tylko z `heygen_voice_id`."),
    background_video_url: z.string().url().optional().describe("Tylko z `heygen_voice_id`."),
    title: z.string().max(120).optional(),
    speed: z.number().min(0.5).max(1.5).optional(),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      if (!a.script && !a.audio_url && !a.audio_asset_id)
        return fail("Podaj `script`, `audio_url` albo `audio_asset_id`.");
      if (a.heygen_voice_id && !a.script) return fail("`heygen_voice_id` wymaga `script`.");
      const hg = await import("@/lib/heygen-api.server");
      const d = await defaults();
      const r = await hg.createAvatarVideo({
        avatarId: a.avatar_id ?? d.avatarId,
        script: a.script,
        elevenVoiceId: a.voice_id,
        heygenVoiceId: a.heygen_voice_id,
        audioAssetId: a.audio_asset_id,
        audioUrl: a.audio_url,
        aspectRatio: a.aspect_ratio,
        resolution: a.resolution,
        backgroundColor: a.background_color,
        backgroundImageUrl: a.background_image_url,
        backgroundVideoUrl: a.background_video_url,
        captions: a.captions,
        title: a.title,
        characterKind: a.character_kind,
        speed: a.speed,
      });
      return ok({
        ok: true,
        ...r,
        avatar_id: a.avatar_id ?? d.avatarId,
        actor: actorId(ctx),
        next: "Sprawdź `get_heygen_video` z tym video_id za 2–5 minut; gotowy plik skopiuj `store=true`.",
      });
    }),
});

export const uploadHeygenAsset = defineTool({
  name: "upload_heygen_asset",
  title: "Upload asset to HeyGen",
  description:
    "Wgrywa plik spod adresu https (audio, obraz, wideo; do 100 MB) do biblioteki HeyGen i zwraca asset_id — do `generate_avatar_video` (`audio_asset_id`) albo `heygen_api_request`. Tylko administrator/operator.",
  inputSchema: { url: z.string().url(), filename: z.string().max(120).optional() },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const hg = await import("@/lib/heygen-api.server");
      const { raw: _raw, ...asset } = await hg.uploadAssetFromUrl(a.url, { filename: a.filename });
      return ok({ ok: true, ...asset });
    }),
});

export const listHeygenTemplates = defineTool({
  name: "list_heygen_templates",
  title: "List HeyGen templates",
  description:
    "Szablony wideo na koncie HeyGen (id, nazwa, miniatura) — do `generate_heygen_template_video`. Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const hg = await import("@/lib/heygen-api.server");
      const templates = await hg.listTemplates();
      return ok({ total: templates.length, templates });
    }),
});

export const getHeygenTemplate = defineTool({
  name: "get_heygen_template",
  title: "Get HeyGen template",
  description:
    "Szczegóły szablonu HeyGen wraz ze zmiennymi (teksty, obrazy, wideo, awatary), które można podstawić przy generowaniu. Tylko administrator/operator.",
  inputSchema: { template_id: z.string().min(5) },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const hg = await import("@/lib/heygen-api.server");
      return ok(await hg.getTemplate(a.template_id));
    }),
});

export const generateHeygenTemplateVideo = defineTool({
  name: "generate_heygen_template_video",
  title: "Generate video from HeyGen template",
  description:
    "Generuje film z szablonu HeyGen z podstawionymi zmiennymi (`variables` w formacie z `get_heygen_template`). Zwraca video_id do `get_heygen_video`. Zużywa kredyty. Tylko administrator/operator.",
  inputSchema: {
    template_id: z.string().min(5),
    variables: z.record(z.string(), z.any()).default({}),
    title: z.string().max(120).optional(),
    caption: z.boolean().default(false),
    aspect_ratio: z.enum(ASPECT).optional(),
    resolution: z.enum(RESOLUTION).default("720p"),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const hg = await import("@/lib/heygen-api.server");
      const r = await hg.generateFromTemplate(a.template_id, {
        title: a.title,
        variables: a.variables,
        caption: a.caption,
        aspectRatio: a.aspect_ratio,
        resolution: a.resolution,
      });
      return ok({ ok: true, ...r, actor: actorId(ctx) });
    }),
});

export const listHeygenTranslateLanguages = defineTool({
  name: "list_heygen_translate_languages",
  title: "List HeyGen translation languages",
  description:
    "Języki docelowe tłumaczenia wideo HeyGen (do `translate_heygen_video`). Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const hg = await import("@/lib/heygen-api.server");
      const languages = await hg.listTranslateLanguages();
      return ok({ total: languages.length, languages });
    }),
});

export const translateHeygenVideo = defineTool({
  name: "translate_heygen_video",
  title: "Translate video (HeyGen)",
  description:
    "Zleca HeyGen tłumaczenie filmu spod adresu https na inny język (dubbing z synchronizacją ust; `translate_audio_only=true` tylko ścieżka audio). Zwraca video_translate_id do `get_heygen_translation`. Zużywa kredyty. Tylko administrator/operator.",
  inputSchema: {
    video_url: z.string().url(),
    output_language: z
      .string()
      .min(2)
      .describe("Nazwa języka z `list_heygen_translate_languages`, np. `English`."),
    title: z.string().max(120).optional(),
    translate_audio_only: z.boolean().default(false),
    speaker_num: z.number().int().min(1).max(10).optional(),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const hg = await import("@/lib/heygen-api.server");
      const r = await hg.translateVideo({
        videoUrl: a.video_url,
        outputLanguage: a.output_language,
        title: a.title,
        translateAudioOnly: a.translate_audio_only,
        speakerNum: a.speaker_num,
      });
      return ok({ ok: true, ...r, actor: actorId(ctx) });
    }),
});

export const getHeygenTranslation = defineTool({
  name: "get_heygen_translation",
  title: "Get HeyGen translation status",
  description:
    "Status tłumaczenia wideo HeyGen i link do gotowego pliku. `store=true` kopiuje gotowy plik do Storage. Tylko administrator/operator.",
  inputSchema: { translate_id: z.string().min(5), store: z.boolean().default(false) },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const hg = await import("@/lib/heygen-api.server");
      const { raw: _raw, ...t } = await hg.getTranslation(a.translate_id);
      if (!a.store || !t.url) return ok(t);
      const { fetchBytes, storeMedia } = await import("@/lib/media-storage.server");
      const file = await fetchBytes(t.url, 250 * 1024 * 1024);
      const stored = await storeMedia(file.bytes, {
        contentType: file.contentType.startsWith("video/") ? file.contentType : "video/mp4",
        visibility: "public",
        prefix: "heygen-translate",
        name: t.title ?? t.video_translate_id,
        ext: "mp4",
      });
      return ok({ ...t, stored });
    }),
});

// ── Studio publikacji — zadania wideo ───────────────────────────────────────

export const getStudioJob = defineTool({
  name: "get_studio_job",
  title: "Get studio video job",
  description:
    "Pełne dane zadania Studia: prompt, scenariusz, awatar, głos, status, plan scen, wideo (czyste i z napisami), miniatura, napisy, auto-publikacja, błąd. Przy statusie rendering dokłada aktualny status z HeyGen (`live`). Tylko administrator/operator.",
  inputSchema: {
    id: z.string().uuid(),
    preview: z
      .boolean()
      .default(true)
      .describe("Pokaż w czacie miniaturę i animowany podgląd gotowego filmu (do akceptacji)."),
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
      let live: Record<string, any> | null = null;
      if (job.heygen_video_id && ["rendering", "uploading"].includes(job.status)) {
        try {
          const hg = await import("@/lib/heygen-api.server");
          const { raw: _raw, ...v } = await hg.getVideo(job.heygen_video_id);
          live = v;
        } catch (e) {
          live = { error: errMsg(e) };
        }
      }
      const blocks = await previewBlocks(a.preview, {
        videoId: job.heygen_video_id,
        completed: job.status === "ready" || live?.status === "completed",
        thumbnailUrl: job.thumbnail_url ?? live?.thumbnail_url ?? null,
        gifUrl: live?.gif_url ?? null,
        videoUrl: job.video_url ?? live?.captioned_video_url ?? live?.video_url ?? null,
        name: job.publish_title || job.prompt.slice(0, 80),
      });
      return okWith({ job, live }, blocks);
    }),
});

export const generateStudioScript = defineTool({
  name: "generate_studio_script",
  title: "Generate studio script (AI)",
  description:
    "Pisze scenariusz mówiony (60–140 słów, hook, bez didaskaliów) dla krótkiego wideo z awatarem z promptu — plus tytuł, opis i hashtagi do publikacji. `question_id` z bazy 250 pytań Shorts daje gotowy, sprawdzony scenariusz bez AI. Nic nie zapisuje — wynik możesz przekazać do `create_studio_video_job`. Tylko administrator/operator.",
  inputSchema: {
    prompt: z.string().min(3).max(2000).optional(),
    question_id: z.number().int().min(1).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      if (a.question_id != null) {
        const { findShortsQuestion, shortsPromptForQuestion } =
          await import("@/lib/shorts-question-bank");
        const q = findShortsQuestion(a.question_id);
        if (!q) return fail(`Nie znaleziono pytania #${a.question_id} w bazie.`);
        const { buildShortsScript } = await import("@/lib/shorts-script");
        return ok({
          source: "question_bank",
          question: q.question,
          prompt: shortsPromptForQuestion(q),
          ...buildShortsScript(q),
        });
      }
      if (!a.prompt) return fail("Podaj `prompt` albo `question_id`.");
      const { generateVideoScript } = await import("@/lib/studio-ai.server");
      return ok({ source: "ai", prompt: a.prompt, ...(await generateVideoScript(a.prompt)) });
    }),
});

export const generateStudioPrompts = defineTool({
  name: "generate_studio_prompts",
  title: "Generate studio prompt ideas (AI)",
  description:
    "Generuje pomysły (prompty) na wideo z awatarem, grafiki albo posty social na zadany temat. Tylko administrator/operator.",
  inputSchema: {
    topic: z.string().min(3).max(500),
    kind: z.enum(["video", "image", "social"]).default("video"),
    count: z.number().int().min(1).max(10).default(5),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const { generatePromptIdeas } = await import("@/lib/studio-ai.server");
      const prompts = await generatePromptIdeas({ topic: a.topic, kind: a.kind, count: a.count });
      return ok({ kind: a.kind, prompts });
    }),
});

export const generateStudioImage = defineTool({
  name: "generate_studio_image",
  title: "Generate studio image (AI)",
  description:
    "Generuje grafikę AI z promptu (po angielsku działa najlepiej), zapisuje ją w Storage i w galerii Studia (`list_studio_images`); zwraca publiczny link — np. na tło, do posta albo `publish_facebook_post`. Tylko administrator/operator.",
  inputSchema: { prompt: z.string().min(3).max(1000) },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const { generateStudioImage: gen } = await import("@/lib/studio-ai.server");
      const r = await gen(a.prompt, actorId(ctx));
      const { fetchImageBlock } = await import("@/lib/media-storage.server");
      const img = await fetchImageBlock(r.image_url);
      return okWith({ ok: true, ...r }, img ? [img] : []);
    }),
});

export const createStudioVideoJob = defineTool({
  name: "create_studio_video_job",
  title: "Create studio video job",
  description:
    "Zakłada zadanie wideo w Studiu publikacji (awatar HeyGen + głos ElevenLabs Filipa, pion 9:16, napisy wypalone): `prompt` (temat) i opcjonalnie gotowy `script` — bez scenariusza napisze go AI; `question_id` bierze pytanie z bazy 250 Shorts. Domyślnie trafia do kolejki (tick co 10 min), `start_now=true` renderuje od razu. `auto_publish_platforms` publikuje gotowy film automatycznie (YouTube, Facebook, Instagram, TikTok) — bez tego film czeka na `publish_studio_job`. Zużywa kredyty HeyGen. Tylko administrator/operator.",
  inputSchema: {
    prompt: z.string().min(3).max(2000).optional().describe("Temat / brief odcinka."),
    script: z.string().max(5000).optional().describe("Gotowy tekst lektora; pusty = AI."),
    question_id: z.number().int().min(1).optional(),
    avatar_id: z.string().optional(),
    voice_id: z.string().optional().describe("Głos ElevenLabs; domyślnie Filip."),
    captions: z.boolean().default(true),
    dynamic_scenes: z
      .boolean()
      .default(false)
      .describe("Przebitki ze stocku między ujęciami awatara."),
    auto_publish_platforms: z.array(z.enum(PLATFORMS)).default([]),
    publish_privacy: z.enum(PRIVACY).default("public"),
    publish_title: z.string().max(100).optional(),
    publish_description: z.string().max(5000).optional(),
    start_now: z.boolean().default(false),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const d = await defaults();
      let prompt = a.prompt?.trim() ?? "";
      let script = a.script?.trim() ?? "";
      let title = a.publish_title?.trim() ?? "";
      let description = a.publish_description?.trim() ?? "";
      if (a.question_id != null) {
        const { findShortsQuestion, shortsPromptForQuestion } =
          await import("@/lib/shorts-question-bank");
        const q = findShortsQuestion(a.question_id);
        if (!q) return fail(`Nie znaleziono pytania #${a.question_id} w bazie.`);
        prompt = shortsPromptForQuestion(q);
        if (!title) title = q.question.slice(0, 92);
        if (!script && a.start_now) {
          const { buildShortsScript } = await import("@/lib/shorts-script");
          const gen = buildShortsScript(q);
          script = gen.script;
          if (!description)
            description = [gen.description, gen.hashtags.join(" ")].filter(Boolean).join("\n\n");
        }
      }
      if (!prompt) return fail("Podaj `prompt` albo `question_id`.");
      if (!script && a.start_now) {
        const { generateVideoScript } = await import("@/lib/studio-ai.server");
        const gen = await generateVideoScript(prompt);
        script = gen.script;
        if (!title) title = gen.title;
        if (!description)
          description = [gen.description, gen.hashtags.join(" ")].filter(Boolean).join("\n\n");
      }
      const row = {
        prompt,
        script,
        avatar_id: a.avatar_id ?? d.avatarId,
        voice_id: a.voice_id ?? d.voiceId,
        status: a.start_now ? "generating_audio" : "queued",
        captions: a.captions,
        dynamic_scenes: a.dynamic_scenes,
        auto_publish_platforms: a.auto_publish_platforms,
        publish_privacy: a.publish_privacy,
        publish_title: title,
        publish_description: description,
        created_by: actorId(ctx),
      };
      const job = await insertOne(
        s,
        "studio_video_jobs",
        row,
        "id, status, prompt, publish_title, auto_publish_platforms",
      );
      if (!a.start_now) {
        return ok({
          ok: true,
          job,
          note: "Zadanie w kolejce — tick Studia (co 10 min) napisze scenariusz, nagra głos i zleci render; `run_studio_video_tick` przyspiesza.",
        });
      }
      try {
        await s.from("studio_video_jobs").update({ status: "uploading" }).eq("id", job.id);
        const { renderStudioVideo } = await import("@/lib/studio-render.server");
        const rendered = await renderStudioVideo({
          script,
          topic: prompt,
          avatarId: row.avatar_id,
          voiceId: row.voice_id,
          captions: a.captions,
          dynamicScenes: a.dynamic_scenes,
        });
        const updated = await updateOne(
          s,
          "studio_video_jobs",
          job.id,
          {
            heygen_video_id: rendered.videoId,
            status: "rendering",
            captions: rendered.captionMode === "burned",
            caption_wait_since: null,
            scene_plan: rendered.scenePlan,
            last_error: rendered.note,
          },
          "id, status, heygen_video_id, publish_title, auto_publish_platforms, last_error",
        );
        return ok({
          ok: true,
          job: updated,
          note: "Render trwa kilka minut — `get_studio_job` pokaże postęp, `poll_studio_jobs` domyka gotowe.",
        });
      } catch (e) {
        await s
          .from("studio_video_jobs")
          .update({ status: "failed", last_error: errMsg(e) })
          .eq("id", job.id);
        return fail(`Render nieudany (zadanie ${job.id} ma status failed): ${errMsg(e)}`);
      }
    }),
});

export const updateStudioJob = defineTool({
  name: "update_studio_job",
  title: "Update studio video job",
  description:
    "Zmienia zadanie Studia: scenariusz, awatar, głos, napisy i przebitki — tylko gdy zadanie czeka (queued) albo padło (failed); tytuł, opis, prywatność i platformy auto-publikacji — dopóki film nie został wysłany do kolejek. Tylko administrator/operator.",
  inputSchema: {
    id: z.string().uuid(),
    script: z.string().max(5000).optional(),
    avatar_id: z.string().optional(),
    voice_id: z.string().optional(),
    captions: z.boolean().optional(),
    dynamic_scenes: z.boolean().optional(),
    publish_title: z.string().max(100).optional(),
    publish_description: z.string().max(5000).optional(),
    publish_privacy: z.enum(PRIVACY).optional(),
    auto_publish_platforms: z.array(z.enum(PLATFORMS)).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const job = await oneOf(
        s.from("studio_video_jobs").select("id, status, auto_published_at").eq("id", a.id),
        "studio_video_jobs",
      );
      if (!job) return fail("Nie znaleziono zadania.");
      const renderPatch = patchOf(a, [
        "script",
        "avatar_id",
        "voice_id",
        "captions",
        "dynamic_scenes",
      ]);
      if (Object.keys(renderPatch).length && !["queued", "failed"].includes(job.status)) {
        return fail(
          `Scenariusz / awatar / głos można zmieniać tylko w statusie queued albo failed (teraz: ${job.status}).`,
        );
      }
      const publishPatch = patchOf(a, [
        "publish_title",
        "publish_description",
        "publish_privacy",
        "auto_publish_platforms",
      ]);
      if (Object.keys(publishPatch).length && job.auto_published_at) {
        return fail(
          "Film już trafił do kolejek publikacji — zmień wpisy w `list_youtube_queue` / kolejce social.",
        );
      }
      const patch = { ...renderPatch, ...publishPatch };
      if (!Object.keys(patch).length) return fail("Brak pól do zmiany.");
      const updated = await updateOne(
        s,
        "studio_video_jobs",
        a.id,
        patch,
        "id, status, publish_title, publish_privacy, auto_publish_platforms, captions, dynamic_scenes, avatar_id, voice_id",
      );
      return ok({ ok: true, job: updated, actor: actorId(ctx) });
    }),
});

export const retryStudioJob = defineTool({
  name: "retry_studio_job",
  title: "Retry failed studio job",
  description:
    "Wraca nieudane zadanie Studia (failed) do kolejki: czyści błąd i poprzedni render, tick lub `run_studio_video_tick` przetworzy je ponownie. Tylko administrator/operator.",
  inputSchema: { id: z.string().uuid() },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { data, error } = await s
        .from("studio_video_jobs")
        .update({
          status: "queued",
          last_error: null,
          heygen_video_id: null,
          video_url: null,
          video_url_clean: null,
          thumbnail_url: null,
          subtitle_url: null,
          caption_wait_since: null,
          scene_plan: null,
        })
        .eq("id", a.id)
        .eq("status", "failed")
        .select("id, status, publish_title");
      if (error) throw new Error(`studio_video_jobs: ${error.message}`);
      if (!data?.length) return fail("Zadanie nie istnieje albo nie ma statusu failed.");
      return ok({ ok: true, job: data[0], actor: actorId(ctx) });
    }),
});

export const deleteStudioJob = defineTool({
  name: "delete_studio_job",
  title: "Delete studio video job",
  description:
    "Usuwa zadanie Studia z panelu (film w HeyGen i wpisy w kolejkach publikacji zostają). Tylko administrator.",
  inputSchema: { id: z.string().uuid() },
  annotations: DESTRUCTIVE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      const { data, error } = await s
        .from("studio_video_jobs")
        .delete()
        .eq("id", a.id)
        .select("id, publish_title, status");
      if (error) throw new Error(`studio_video_jobs: ${error.message}`);
      if (!data?.length) return fail("Nie znaleziono zadania.");
      return ok({ ok: true, deleted: data[0], actor: actorId(ctx) });
    }),
});

export const publishStudioJob = defineTool({
  name: "publish_studio_job",
  title: "Publish studio video to channels",
  description:
    "Wysyła gotowy film ze Studia (status ready) do kolejek publikacji: YouTube Shorts i/lub Facebook (post, rolka) i Instagram (rolka) — tick opublikuje je zaraz potem bez dalszego udziału człowieka. To realna publikacja; użyj po potwierdzeniu tytułu, opisu i kanałów. Tylko administrator/operator.",
  inputSchema: {
    id: z.string().uuid(),
    platforms: z.array(z.enum(PLATFORMS)).min(1),
    publish_privacy: z.enum(PRIVACY).optional().describe("Prywatność na YouTube."),
    publish_title: z.string().max(100).optional(),
    publish_description: z.string().max(5000).optional(),
  },
  annotations: {
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: false,
    openWorldHint: true,
  },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const job = await oneOf(
        s.from("studio_video_jobs").select("*").eq("id", a.id),
        "studio_video_jobs",
      );
      if (!job) return fail("Nie znaleziono zadania.");
      if (job.status !== "ready" || !job.video_url)
        return fail(`Film nie jest gotowy (status: ${job.status}).`);
      if (job.auto_published_at)
        return fail(
          `Film już wysłano do kolejek ${job.auto_published_at} — kolejne publikacje zleć przez queue_youtube_publication / queue_social_publication z video_url: ${job.video_url}`,
        );
      const patch = {
        auto_publish_platforms: a.platforms,
        ...patchOf(a, ["publish_privacy", "publish_title", "publish_description"]),
      };
      const updated = await updateOne(s, "studio_video_jobs", a.id, patch, "*");
      const { maybeAutoPublishJob } = await import("@/lib/studio-video-queue.server");
      const published = await maybeAutoPublishJob(updated as any);
      const after = await oneOf(
        s
          .from("studio_video_jobs")
          .select(
            "id, status, auto_publish_platforms, auto_published_at, last_error, publish_title",
          )
          .eq("id", a.id),
        "studio_video_jobs",
      );
      return ok({
        ok: published,
        job: after,
        actor: actorId(ctx),
        note: published
          ? "Wpisy w kolejkach — sprawdź `list_youtube_queue` i `list_social_publish_queue`."
          : (after?.last_error ?? "Publikacja nie została zakolejkowana."),
      });
    }),
});

export const pollStudioJobs = defineTool({
  name: "poll_studio_jobs",
  title: "Poll rendering studio jobs",
  description:
    "Odpytuje HeyGen o wszystkie zadania Studia w statusie rendering i domyka gotowe (zapis linków, auto-publikacja jeśli ustawiona) albo nieudane. To, co robi tick co 10 min — bez czekania. Tylko administrator/operator.",
  inputSchema: {},
  annotations: WRITE_IDEMPOTENT,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const { pollStudioRenderingJobs } = await import("@/lib/studio-video-queue.server");
      return ok({ ok: true, ...(await pollStudioRenderingJobs()) });
    }),
});

export const runStudioVideoTick = defineTool({
  name: "run_studio_video_tick",
  title: "Run studio video tick now",
  description:
    "Uruchamia od razu pełny przebieg ticka Studia: przetwarza do 2 zadań z kolejki (scenariusz AI → głos → render HeyGen; zużywa kredyty) i domyka rendery. Tylko administrator/operator.",
  inputSchema: {},
  annotations: WRITE,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const { runStudioVideoTick: run } = await import("@/lib/studio-video-queue.server");
      return ok({ ok: true, ...(await run()) });
    }),
});

export const listStudioImages = defineListTool({
  name: "list_studio_images",
  title: "List studio images",
  description:
    "Galeria grafik AI ze Studia: prompt, publiczny link, autor, data. Tylko administrator/operator.",
  table: "studio_images",
  columns: "id, prompt, image_url, created_by, created_at",
  resultKey: "images",
  access: "team",
  order: { column: "created_at", ascending: false },
  preview: { column: "image_url", max: 4 },
  filters: { search: search(["prompt"], "Fraza w prompcie.") },
});

// ── Awatar FAQ (Filip na landing page) ──────────────────────────────────────

export const listAvatarFaqs = defineListTool({
  name: "list_avatar_faqs",
  title: "List avatar FAQ entries",
  description:
    "Pytania Awatara FAQ (Filip na stronie): pytanie, odpowiedź czytana przez awatara, kolejność, intro, publikacja, status filmu HeyGen, linki. Tylko administrator/operator.",
  table: "avatar_faqs",
  columns:
    "id, question, answer_text, sort_order, is_intro, is_published, avatar_id, voice_id, video_id, video_status, video_url, thumbnail_url, last_error, updated_at",
  resultKey: "faqs",
  access: "team",
  order: { column: "sort_order", ascending: true },
  preview: { column: "thumbnail_url", max: 4 },
  defaultLimit: 50,
  maxLimit: 200,
  filters: {
    published: flag("is_published", "Tylko opublikowane / nieopublikowane."),
    video_status: text(
      "video_status",
      "Status filmu (idle, generating_audio, uploading, rendering, ready, failed).",
    ),
    search: search(["question", "answer_text"], "Fraza w pytaniu lub odpowiedzi."),
  },
});

export const createAvatarFaq = defineTool({
  name: "create_avatar_faq",
  title: "Create avatar FAQ entry",
  description:
    "Dodaje pytanie do Awatara FAQ (bez filmu; nieopublikowane, dopóki nie ustawisz `is_published`). Film generuje `generate_avatar_faq_video`. Tylko administrator.",
  inputSchema: {
    question: z.string().min(3).max(300),
    answer_text: z.string().min(3).max(3000).describe("Tekst, który czyta awatar."),
    sort_order: z.number().int().min(0).optional(),
    is_intro: z.boolean().default(false),
    is_published: z.boolean().default(false),
    avatar_id: z.string().optional(),
    voice_id: z.string().optional(),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      const row = {
        question: a.question.trim(),
        answer_text: a.answer_text.trim(),
        is_intro: a.is_intro,
        is_published: a.is_published,
        ...patchOf(a, ["sort_order", "avatar_id", "voice_id"]),
      };
      const faq = await insertOne(
        s,
        "avatar_faqs",
        row,
        "id, question, sort_order, is_intro, is_published, video_status",
      );
      return ok({ ok: true, faq, actor: actorId(ctx) });
    }),
});

export const updateAvatarFaq = defineTool({
  name: "update_avatar_faq",
  title: "Update avatar FAQ entry",
  description:
    "Zmienia pytanie Awatara FAQ: treść, odpowiedź (po zmianie odpowiedzi wygeneruj film ponownie), kolejność, intro, publikację, awatar, głos. Tylko administrator.",
  inputSchema: {
    id: z.string().uuid(),
    question: z.string().min(3).max(300).optional(),
    answer_text: z.string().min(3).max(3000).optional(),
    sort_order: z.number().int().min(0).optional(),
    is_intro: z.boolean().optional(),
    is_published: z.boolean().optional(),
    avatar_id: z.string().optional(),
    voice_id: z.string().optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      const patch = patchOf(a, [
        "question",
        "answer_text",
        "sort_order",
        "is_intro",
        "is_published",
        "avatar_id",
        "voice_id",
      ]);
      if (!Object.keys(patch).length) return fail("Brak pól do zmiany.");
      const faq = await updateOne(
        s,
        "avatar_faqs",
        a.id,
        patch,
        "id, question, sort_order, is_intro, is_published, video_status, video_url",
      );
      return ok({ ok: true, faq, actor: actorId(ctx) });
    }),
});

export const generateAvatarFaqVideo = defineTool({
  name: "generate_avatar_faq_video",
  title: "Generate avatar FAQ video",
  description:
    "Generuje film Awatara FAQ dla wpisu: odpowiedź → głos ElevenLabs → HeyGen (awatar i głos z wpisu). Status śledzi `poll_avatar_faq_video`; gotowy film pojawia się na stronie po opublikowaniu wpisu. Zużywa kredyty. Tylko administrator.",
  inputSchema: { faq_id: z.string().uuid() },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      const row = await oneOf(
        s
          .from("avatar_faqs")
          .select("id, question, answer_text, avatar_id, voice_id")
          .eq("id", a.faq_id),
        "avatar_faqs",
      );
      if (!row) return fail("Nie znaleziono wpisu FAQ.");
      await s
        .from("avatar_faqs")
        .update({ video_status: "generating_audio", last_error: null })
        .eq("id", a.faq_id);
      try {
        const { ttsElevenLabs, uploadAudioToHeygen, createHeygenVideoFromAudio } =
          await import("@/lib/avatar-faq.server");
        const audio = await ttsElevenLabs({ text: row.answer_text, voiceId: row.voice_id });
        await s.from("avatar_faqs").update({ video_status: "uploading" }).eq("id", a.faq_id);
        const assetId = await uploadAudioToHeygen(audio);
        const { videoId } = await createHeygenVideoFromAudio({
          avatarId: row.avatar_id,
          audioAssetId: assetId,
          captions: "sidecar",
        });
        await s
          .from("avatar_faqs")
          .update({ video_id: videoId, video_status: "rendering" })
          .eq("id", a.faq_id);
        return ok({
          ok: true,
          faq_id: a.faq_id,
          question: row.question,
          video_id: videoId,
          status: "rendering",
          actor: actorId(ctx),
        });
      } catch (e) {
        await s
          .from("avatar_faqs")
          .update({ video_status: "failed", last_error: errMsg(e) })
          .eq("id", a.faq_id);
        return fail(`Generowanie nieudane: ${errMsg(e)}`);
      }
    }),
});

export const pollAvatarFaqVideo = defineTool({
  name: "poll_avatar_faq_video",
  title: "Poll avatar FAQ video",
  description:
    "Sprawdza w HeyGen status filmu wpisu Awatara FAQ i zapisuje gotowy link / błąd we wpisie. Tylko administrator.",
  inputSchema: { faq_id: z.string().uuid() },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      const row = await oneOf(
        s.from("avatar_faqs").select("id, video_id, video_status").eq("id", a.faq_id),
        "avatar_faqs",
      );
      if (!row) return fail("Nie znaleziono wpisu FAQ.");
      if (!row.video_id)
        return ok({ faq_id: a.faq_id, status: "no_video", video_status: row.video_status });
      const { getHeygenVideoStatus } = await import("@/lib/avatar-faq.server");
      const st = await getHeygenVideoStatus(row.video_id);
      const update: Record<string, unknown> = {};
      if (st.status === "completed" && st.video_url) {
        update.video_status = "ready";
        update.video_url = st.video_url;
        update.thumbnail_url = st.thumbnail_url ?? null;
      } else if (st.status === "failed") {
        update.video_status = "failed";
        update.last_error =
          typeof st.error === "string" ? st.error : JSON.stringify(st.error ?? {});
      } else {
        update.video_status = st.status === "processing" ? "rendering" : st.status;
      }
      await s.from("avatar_faqs").update(update).eq("id", a.faq_id);
      return ok({
        faq_id: a.faq_id,
        heygen_status: st.status,
        video_url: st.video_url ?? null,
        thumbnail_url: st.thumbnail_url ?? null,
        error: st.error ?? null,
        ...update,
      });
    }),
});

export const deleteAvatarFaq = defineTool({
  name: "delete_avatar_faq",
  title: "Delete avatar FAQ entry",
  description: "Usuwa wpis Awatara FAQ (znika ze strony). Tylko administrator.",
  inputSchema: { id: z.string().uuid() },
  annotations: DESTRUCTIVE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      const { data, error } = await s
        .from("avatar_faqs")
        .delete()
        .eq("id", a.id)
        .select("id, question");
      if (error) throw new Error(`avatar_faqs: ${error.message}`);
      if (!data?.length) return fail("Nie znaleziono wpisu.");
      return ok({ ok: true, deleted: data[0], actor: actorId(ctx) });
    }),
});

// ── Ogólne wywołanie ────────────────────────────────────────────────────────

export const heygenApiRequest = defineTool({
  name: "heygen_api_request",
  title: "Raw HeyGen API request",
  description:
    "Dowolne wywołanie API HeyGen (ścieżka /v1/…, /v2/… albo /v3/…; GET/POST/PUT/DELETE; parametry zapytania; body JSON) — do funkcji bez dedykowanego narzędzia (Avatar IV, grupy awatarów, webhooki, foldery). `host=upload` kieruje na upload.heygen.com. Odpowiedź binarna trafia do Storage jako podpisany link. Tylko administrator.",
  inputSchema: {
    path: z.string().regex(/^\/v[123]\//),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
    query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    json: z.any().optional(),
    host: z.enum(["api", "upload"]).default("api"),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: true },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const hg = await import("@/lib/heygen-api.server");
      const r = await hg.heygenRequest(a.path, {
        method: a.method,
        query: a.query,
        json: a.json,
        host: a.host,
        timeoutMs: 120_000,
      });
      if (r.bytes) {
        const { storeMedia } = await import("@/lib/media-storage.server");
        const stored = await storeMedia(r.bytes, {
          contentType: r.contentType || "application/octet-stream",
          visibility: "private",
          prefix: "heygen-raw",
          name: a.path.split("/").pop(),
        });
        return ok({ status: r.status, content_type: r.contentType, stored });
      }
      return ok({ status: r.status, body: r.json ?? r.text ?? null });
    }),
});

export const heygenTools = [
  heygenStatus,
  listHeygenAvatars,
  listHeygenVoices,
  searchHeygenStock,
  listHeygenVideos,
  getHeygenVideo,
  syncLandingInvestorVideoTool,
  generateAvatarVideo,
  uploadHeygenAsset,
  listHeygenTemplates,
  getHeygenTemplate,
  generateHeygenTemplateVideo,
  listHeygenTranslateLanguages,
  translateHeygenVideo,
  getHeygenTranslation,
  deleteHeygenVideo,
  getStudioJob,
  generateStudioScript,
  generateStudioPrompts,
  generateStudioImage,
  listStudioImages,
  createStudioVideoJob,
  updateStudioJob,
  retryStudioJob,
  deleteStudioJob,
  publishStudioJob,
  pollStudioJobs,
  runStudioVideoTick,
  listAvatarFaqs,
  createAvatarFaq,
  updateAvatarFaq,
  generateAvatarFaqVideo,
  pollAvatarFaqVideo,
  deleteAvatarFaq,
  heygenApiRequest,
];
