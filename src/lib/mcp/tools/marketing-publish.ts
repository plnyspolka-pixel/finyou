// Sterowanie publikacją przez MCP: biblioteka materiałów marketingowych
// (podgląd, opis, publikacja, import z URL, usuwanie), kolejki publikacji
// Meta / TikTok / X / YouTube (publikuj teraz, anuluj, ponów, usuń, tick),
// dane twórcy TikToka i przegląd całego marketingu w jednym wywołaniu.
//
// Ta sama logika co w panelu: publikacja materiału robi publiczną kopię
// pliku w studio-media i wstawia wpisy przez studio-enqueue.server.ts, a
// „publikuj teraz" woła te same procesory co przycisk w Studiu.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  DESTRUCTIVE,
  SENDS,
  WRITE,
  WRITE_IDEMPOTENT,
  actorId,
  countBy,
  fail,
  handle,
  isoDate,
  linkBlock,
  ok,
  okWith,
  oneOf,
  patchOf,
  requireTeam,
  requireTeamAdmin,
  rowsOf,
  section,
  updateOne,
} from "../_helpers";
import { defineListTool, search, text } from "../_list-tool";
import {
  AUDIENCE_ENUM,
  PLATFORM_ENUM,
  PRIVACY_ENUM,
  processQueuedNow,
  publishedUrl,
  tiktokPostOptionsSchema,
} from "../_publish";
import {
  MATERIALS_BUCKET,
  PUBLIC_MEDIA_BUCKET,
  defaultPublishText,
  materialPlatformsError,
  publicCopyPath,
  publicationsForMaterial,
} from "@/lib/marketing-material-publish";
import { PLATFORM_LABELS, platformsForMediaType } from "@/lib/studio-platforms";
import {
  channelReadiness,
  summarizeQueue,
  youtubeRowToQueueRow,
  type QueueRowLike,
} from "@/lib/marketing-overview";

const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;

const SOCIAL_QUEUE_COLUMNS =
  "id, platform, video_url, image_url, status, scheduled_at, published_at, last_error, external_post_id";
const YT_QUEUE_COLUMNS =
  "id, source_video_url, status, scheduled_at, published_at, last_error, youtube_video_id";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

// ── Materiały marketingowe ───────────────────────────────────────────────────

export const listMarketingMaterialsAdmin = defineListTool({
  name: "list_marketing_materials_admin",
  title: "List marketing materials (with filters)",
  description:
    "Biblioteka materiałów marketingowych (/admin/materialy) z filtrami: kategoria (klient / inwestor / posrednik), typ (image / video), fraza w tytule lub opisie. Zwraca opis ręczny i opis AI; link do pliku i stan publikacji daje `get_marketing_material`. Tylko administrator/operator.",
  table: "marketing_materials",
  columns:
    "id, title, description, ai_description, audience, media_type, storage_path, mime_type, file_size, created_at, updated_at",
  resultKey: "materials",
  access: "team",
  filters: {
    audience: text("audience", "Kategoria: klient / inwestor / posrednik."),
    media_type: text("media_type", "Typ pliku: image / video."),
    query: search(["title", "description", "ai_description"], "Fraza w tytule lub opisie."),
  },
  map: (r) => ({ ...r, allowed_platforms: platformsForMediaType(r.media_type) }),
});

export const getMarketingMaterial = defineTool({
  name: "get_marketing_material",
  title: "Get marketing material",
  description:
    "Jeden materiał z biblioteki: tytuł, opisy (ręczny i AI), kategoria, typ, podpisany link do pliku (ważny godzinę), dozwolone platformy i wszystkie wpisy kolejek publikacji tego pliku (status, termin, link do posta). `preview=true` pokazuje grafikę w czacie. Tylko administrator/operator.",
  inputSchema: {
    material_id: z.string().uuid(),
    preview: z.boolean().default(false).describe("Pokaż grafikę inline (tylko image)."),
  },
  annotations: READ,
  handler: ({ material_id, preview }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const m = await oneOf(
        s.from("marketing_materials").select("*").eq("id", material_id),
        "marketing_materials",
      );
      if (!m) return fail("Nie znaleziono materiału.");
      const { signedUrlFor, fetchImageBlocks } = await import("@/lib/media-storage.server");
      const url = await signedUrlFor(MATERIALS_BUCKET, m.storage_path).catch(() => null);
      const publicUrl = s.storage.from(PUBLIC_MEDIA_BUCKET).getPublicUrl(publicCopyPath(m as never))
        .data.publicUrl;
      const [social, youtube] = await Promise.all([
        rowsOf(
          s
            .from("social_publish_queue")
            .select(SOCIAL_QUEUE_COLUMNS)
            .order("created_at", { ascending: false })
            .limit(300),
          "social_publish_queue",
        ),
        rowsOf(
          s
            .from("youtube_publish_queue")
            .select(YT_QUEUE_COLUMNS)
            .order("created_at", { ascending: false })
            .limit(200),
          "youtube_publish_queue",
        ),
      ]);
      const publications = publicationsForMaterial(publicUrl, social as never, youtube as never);
      const extra = preview && m.media_type === "image" && url ? await fetchImageBlocks([url]) : [];
      return okWith(
        {
          material: {
            ...m,
            url,
            public_copy_url: publications.length ? publicUrl : null,
            allowed_platforms: platformsForMediaType(m.media_type),
            suggested_text: defaultPublishText(m as never),
          },
          publications: publications.map((p) => ({
            ...p,
            platform_label: PLATFORM_LABELS[p.platform] ?? p.platform,
          })),
        },
        [...extra, ...linkBlock(url, m.title, m.mime_type ?? undefined)],
      );
    }),
});

export const updateMarketingMaterial = defineTool({
  name: "update_marketing_material",
  title: "Update marketing material",
  description:
    "Zmienia tytuł, opis (używany przy publikacji) albo kategorię materiału. Tylko administrator/operator.",
  inputSchema: {
    material_id: z.string().uuid(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    audience: AUDIENCE_ENUM.optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const patch = patchOf(a, ["title", "description", "audience"]);
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const row = await updateOne(
        s,
        "marketing_materials",
        a.material_id,
        patch,
        "id, title, description, audience, media_type, updated_at",
      );
      return ok({ ok: true, material: row });
    }),
});

export const generateMaterialDescription = defineTool({
  name: "generate_material_description",
  title: "Generate AI description for a material",
  description:
    "Pisze krótki opis (do 280 znaków, po polsku, z CTA) pod publikację materiału w social media — na podstawie tytułu, kategorii i opcjonalnego kontekstu. Domyślnie zapisuje go jako `ai_description` materiału (jak przycisk w panelu). Tylko administrator/operator.",
  inputSchema: {
    material_id: z.string().uuid(),
    context: z.string().max(2000).optional().describe("Wskazówki dla copywritera AI."),
    save: z.boolean().default(true).describe("Zapisz jako ai_description materiału."),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ material_id, context: hint, save }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const m = await oneOf(
        s
          .from("marketing_materials")
          .select("id, title, description, audience")
          .eq("id", material_id),
        "marketing_materials",
      );
      if (!m) return fail("Nie znaleziono materiału.");
      const { generateMaterialDescriptionText } =
        await import("@/lib/marketing-materials-ai.server");
      const text = await generateMaterialDescriptionText({
        audience: m.audience,
        title: m.title,
        userDescription: hint ?? m.description,
      });
      if (save) {
        const { error } = await s
          .from("marketing_materials")
          .update({ ai_description: text })
          .eq("id", material_id);
        if (error) throw new Error(`marketing_materials: ${error.message}`);
      }
      return ok({ ok: true, material_id, ai_description: text, saved: save });
    }),
});

export const publishMarketingMaterial = defineTool({
  name: "publish_marketing_material",
  title: "Publish marketing material to social channels",
  description:
    "Publikuje materiał z biblioteki (grafikę albo film) na wybranych platformach — to, co robi przycisk „Publikuj” w /admin/materialy. Grafika: facebook_post, x. Film: youtube (Short), instagram_reels, facebook_reels, tiktok, facebook_post, x. Bez `title`/`message` bierze tytuł i opis materiału (ręczny, a gdy go brak — AI). Serwer robi publiczną kopię pliku i wstawia wpisy do kolejek; domyślnie publikuje je tick (co 10 min) albo o `scheduled_at`; `publish_now=true` publikuje od razu i zwraca wynik per platforma. TikTok wymaga `tiktok_post_options` (prywatność z `get_tiktok_creator_info`, wybór użytkownika). Realna publikacja na profilach firmy — potwierdź z użytkownikiem tytuł, treść i kanały. Tylko administrator/operator.",
  inputSchema: {
    material_id: z.string().uuid(),
    platforms: z.array(PLATFORM_ENUM).min(1),
    title: z.string().max(200).optional().describe("Domyślnie tytuł materiału."),
    message: z.string().max(5000).optional().describe("Domyślnie opis materiału (albo opis AI)."),
    scheduled_at: z
      .string()
      .optional()
      .describe("Termin publikacji (ISO 8601); puste = najbliższy tick."),
    privacy_status: PRIVACY_ENUM.default("public").describe("Widoczność na YouTube."),
    tiktok_post_options: tiktokPostOptionsSchema,
    save_to_material: z
      .boolean()
      .default(false)
      .describe("Zapisz podany tytuł i treść także w materiale."),
    publish_now: z
      .boolean()
      .default(false)
      .describe("Publikuj od razu zamiast czekać na tick (nie łącz z scheduled_at)."),
  },
  annotations: SENDS,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      if (a.publish_now && a.scheduled_at)
        return fail("publish_now nie łączy się z scheduled_at — wybierz jedno.");
      const { loadMaterial, ensureMaterialPublicUrl } =
        await import("@/lib/marketing-material-publish.server");
      const m = await loadMaterial(a.material_id);
      const platformsErr = materialPlatformsError(m.media_type, a.platforms);
      if (platformsErr) return fail(platformsErr);
      const defaults = defaultPublishText(m);
      const title = (a.title ?? defaults.title).trim();
      const message = (a.message ?? defaults.message).trim();
      if (a.save_to_material) {
        const { error } = await s
          .from("marketing_materials")
          .update({ title: title || m.title, description: message || null })
          .eq("id", m.id);
        if (error) throw new Error(`marketing_materials: ${error.message}`);
      }
      const mediaUrl = await ensureMaterialPublicUrl(m);
      const { enqueuePublication } = await import("@/lib/studio-enqueue.server");
      const result = await enqueuePublication({
        platforms: a.platforms,
        title: title || m.title,
        message,
        video_url: m.media_type === "video" ? mediaUrl : undefined,
        image_url: m.media_type === "image" ? mediaUrl : undefined,
        privacy_status: a.privacy_status,
        scheduled_at: isoDate(a.scheduled_at, "scheduled_at"),
        tiktok_post_options: a.tiktok_post_options,
        userId: actorId(ctx),
      });
      const published_now = a.publish_now ? await processQueuedNow(result) : null;
      return ok({
        ok: true,
        material_id: m.id,
        media_url: mediaUrl,
        queued: result,
        published_now: published_now?.map((o) => ({
          ...o,
          platform_label: PLATFORM_LABELS[o.platform] ?? o.platform,
          url: publishedUrl(o.platform, o.external_id),
        })),
        note: a.publish_now
          ? "Nieudane wpisy zostały w kolejce z błędem — `retry_social_queue_item` / `retry_youtube_queue_item` ponawia."
          : "Wpisy czekają w kolejce; tick publikuje co 10 minut (`run_publish_tick` od ręki). Stan: `list_publish_queue`, `list_youtube_queue`.",
      });
    }),
});

export const addMarketingMaterialFromUrl = defineTool({
  name: "add_marketing_material_from_url",
  title: "Add marketing material from URL",
  description:
    "Dodaje do biblioteki materiałów grafikę albo film pobrany spod publicznego adresu https (np. grafika ze Studia, film z HeyGen) — do 60 MB. Zapisuje plik w Storage i wpis z tytułem, opisem i kategorią. Tylko administrator/operator.",
  inputSchema: {
    url: z.string().url(),
    title: z.string().min(1).max(200),
    audience: AUDIENCE_ENUM,
    description: z.string().max(5000).optional(),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { fetchBytes } = await import("@/lib/media-storage.server");
      const { bytes, contentType } = await fetchBytes(a.url, 60 * 1024 * 1024);
      let mime = contentType.split(";")[0].trim().toLowerCase();
      const urlExt = /\.([a-z0-9]{2,5})(?:$|\?)/i.exec(a.url)?.[1]?.toLowerCase();
      if (!mime.startsWith("image/") && !mime.startsWith("video/")) {
        const guess: Record<string, string> = {
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          png: "image/png",
          webp: "image/webp",
          gif: "image/gif",
          mp4: "video/mp4",
          mov: "video/quicktime",
          webm: "video/webm",
        };
        mime = (urlExt && guess[urlExt]) || "";
        if (!mime) return fail(`To nie jest grafika ani film (${contentType || "nieznany typ"}).`);
      }
      const media_type = mime.startsWith("video/") ? "video" : "image";
      const ext = EXT_BY_MIME[mime] ?? urlExt ?? "bin";
      const path = `${a.audience}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await s.storage
        .from(MATERIALS_BUCKET)
        .upload(path, new Uint8Array(bytes), { contentType: mime, upsert: false });
      if (upErr) throw new Error(`Storage (${MATERIALS_BUCKET}): ${upErr.message}`);
      const { data: row, error } = await s
        .from("marketing_materials")
        .insert({
          title: a.title.trim(),
          description: a.description?.trim() || null,
          audience: a.audience,
          media_type,
          storage_path: path,
          mime_type: mime,
          file_size: bytes.byteLength,
          uploaded_by: actorId(ctx),
        })
        .select("id, title, audience, media_type, storage_path, mime_type, file_size, created_at")
        .single();
      if (error) throw new Error(`marketing_materials: ${error.message}`);
      return ok({ ok: true, material: row, allowed_platforms: platformsForMediaType(media_type) });
    }),
});

export const deleteMarketingMaterial = defineTool({
  name: "delete_marketing_material",
  title: "Delete marketing material",
  description:
    "Usuwa materiał z biblioteki (plik w Storage i wpis). Publiczna kopia użyta w kolejkach zostaje, żeby zaplanowane publikacje nie straciły źródła. Tylko administrator/operator.",
  inputSchema: { material_id: z.string().uuid() },
  annotations: DESTRUCTIVE,
  handler: ({ material_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const m = await oneOf(
        s.from("marketing_materials").select("id, title, storage_path").eq("id", material_id),
        "marketing_materials",
      );
      if (!m) return fail("Nie znaleziono materiału.");
      const { error: stErr } = await s.storage.from(MATERIALS_BUCKET).remove([m.storage_path]);
      if (stErr) throw new Error(`Storage: ${stErr.message}`);
      const { error } = await s.from("marketing_materials").delete().eq("id", material_id);
      if (error) throw new Error(`marketing_materials: ${error.message}`);
      return ok({ ok: true, deleted: { id: m.id, title: m.title } });
    }),
});

// ── Kolejki publikacji ───────────────────────────────────────────────────────

export const publishSocialQueueItemNow = defineTool({
  name: "publish_social_queue_item_now",
  title: "Publish queued social item now",
  description:
    "Publikuje wpis z kolejki social (facebook_post, facebook_reels, instagram_reels, tiktok, x) od razu, zamiast czekać na termin i tick. Realna publikacja. Wpis w stanie `processing` oznacza, że platforma jeszcze przetwarza plik — tick domknie. Tylko administrator/operator.",
  inputSchema: { queue_id: z.string().uuid() },
  annotations: SENDS,
  handler: ({ queue_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const row = await oneOf(
        s.from("social_publish_queue").select("id, platform").eq("id", queue_id),
        "social_publish_queue",
      );
      if (!row) return fail("Nie znaleziono wpisu w kolejce.");
      const [outcome] = await processQueuedNow({
        queued: 1,
        social: [{ id: row.id, platform: row.platform }],
        youtube: [],
      });
      if (!outcome.ok) return fail(outcome.error ?? "Publikacja nieudana.");
      return ok({
        ...outcome,
        platform_label: PLATFORM_LABELS[outcome.platform] ?? outcome.platform,
        url: publishedUrl(outcome.platform, outcome.external_id),
      });
    }),
});

export const cancelSocialQueueItem = defineTool({
  name: "cancel_social_queue_item",
  title: "Cancel queued social item",
  description:
    "Anuluje wpis w kolejce social, który jeszcze czeka (status pending). Tylko administrator/operator.",
  inputSchema: { queue_id: z.string().uuid() },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ queue_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { data, error } = await s
        .from("social_publish_queue")
        .update({ status: "cancelled" })
        .eq("id", queue_id)
        .eq("status", "pending")
        .select("id, platform, title, status")
        .maybeSingle();
      if (error) throw new Error(`social_publish_queue: ${error.message}`);
      if (!data) return fail("Wpis nie istnieje albo nie jest już do anulowania.");
      return ok({ ok: true, item: data });
    }),
});

export const retrySocialQueueItem = defineTool({
  name: "retry_social_queue_item",
  title: "Retry failed / cancelled social item",
  description:
    "Wraca wpis (failed, cancelled albo zawieszony w processing) do kolejki od razu: zeruje licznik prób i identyfikatory uploadu TikToka / X. Tick opublikuje w najbliższym przebiegu (albo `publish_social_queue_item_now`). Tylko administrator/operator.",
  inputSchema: { queue_id: z.string().uuid() },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ queue_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { data, error } = await s
        .from("social_publish_queue")
        .update({
          status: "pending",
          last_error: null,
          attempt_count: 0,
          scheduled_at: new Date().toISOString(),
          tiktok_publish_id: null,
          tiktok_status: null,
          tiktok_fail_reason: null,
          tiktok_upload_at: null,
          x_media_id: null,
          x_media_status: null,
          x_media_at: null,
        })
        .eq("id", queue_id)
        .in("status", ["failed", "cancelled", "processing"])
        .select("id, platform, title, status, scheduled_at")
        .maybeSingle();
      if (error) throw new Error(`social_publish_queue: ${error.message}`);
      if (!data)
        return fail("Wpis nie istnieje albo nie jest w stanie failed / cancelled / processing.");
      return ok({ ok: true, item: data });
    }),
});

export const deleteSocialQueueItem = defineTool({
  name: "delete_social_queue_item",
  title: "Delete social queue item",
  description:
    "Usuwa wpis z kolejki social (poza publikowanym / przetwarzanym). Nie kasuje już opublikowanego posta na platformie. Tylko administrator/operator.",
  inputSchema: { queue_id: z.string().uuid() },
  annotations: DESTRUCTIVE,
  handler: ({ queue_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { data, error } = await s
        .from("social_publish_queue")
        .delete()
        .eq("id", queue_id)
        .not("status", "in", "(publishing,processing)")
        .select("id, platform, title, status");
      if (error) throw new Error(`social_publish_queue: ${error.message}`);
      if (!data?.length) return fail("Wpis nie istnieje albo jest w trakcie publikacji.");
      return ok({ ok: true, deleted: data[0] });
    }),
});

export const retryYoutubeQueueItem = defineTool({
  name: "retry_youtube_queue_item",
  title: "Retry failed / cancelled Short",
  description:
    "Wraca wpis kolejki YouTube (failed albo cancelled) do stanu pending z terminem „teraz”. Tylko administrator/operator.",
  inputSchema: { queue_id: z.string().uuid() },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ queue_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { data, error } = await s
        .from("youtube_publish_queue")
        .update({ status: "pending", last_error: null, scheduled_at: new Date().toISOString() })
        .eq("id", queue_id)
        .in("status", ["failed", "cancelled"])
        .select("id, title, status, scheduled_at")
        .maybeSingle();
      if (error) throw new Error(`youtube_publish_queue: ${error.message}`);
      if (!data) return fail("Wpis nie istnieje albo nie jest w stanie failed / cancelled.");
      return ok({ ok: true, item: data });
    }),
});

export const deleteYoutubeQueueItem = defineTool({
  name: "delete_youtube_queue_item",
  title: "Delete YouTube queue item",
  description:
    "Usuwa wpis z kolejki YouTube (poza trwającym uploadem). Nie kasuje filmu z kanału — do tego `delete_youtube_video`. Tylko administrator/operator.",
  inputSchema: { queue_id: z.string().uuid() },
  annotations: DESTRUCTIVE,
  handler: ({ queue_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { data, error } = await s
        .from("youtube_publish_queue")
        .delete()
        .eq("id", queue_id)
        .neq("status", "uploading")
        .select("id, title, status");
      if (error) throw new Error(`youtube_publish_queue: ${error.message}`);
      if (!data?.length) return fail("Wpis nie istnieje albo jest w trakcie uploadu.");
      return ok({ ok: true, deleted: data[0] });
    }),
});

export const runPublishTick = defineTool({
  name: "run_publish_tick",
  title: "Run publish tick now",
  description:
    "Uruchamia od razu to, co cron robi co 10 minut: publikuje wymagalne wpisy z kolejek Meta (FB / IG), TikToka, X i YouTube, domyka publikacje w toku (kontenery IG, uploady TikToka / X) i odświeża tokeny. Realne publikacje. Tylko administrator/operator.",
  inputSchema: {},
  annotations: SENDS,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const errors: string[] = [];
      // Sekwencyjnie jak w cronie: każdy tor ma własne API i limity.
      const meta = await section(errors, "meta", async () =>
        (await import("@/lib/studio-publishing.server")).runSocialPublishTick(),
      );
      const tiktok = await section(errors, "tiktok", async () =>
        (await import("@/lib/tiktok.server")).runTiktokPublishTick(),
      );
      const x = await section(errors, "x", async () =>
        (await import("@/lib/x.server")).runXPublishTick(),
      );
      const youtube = await section(errors, "youtube", async () =>
        (await import("@/lib/youtube-shorts.server")).runYoutubeShortsTick(),
      );
      return ok({ ok: errors.length === 0, meta, tiktok, x, youtube, errors });
    }),
});

export const getTiktokCreatorInfo = defineTool({
  name: "get_tiktok_creator_info",
  title: "Get TikTok creator info (privacy options)",
  description:
    "Dane połączonego konta TikTok: nick, dozwolone poziomy prywatności (`privacyOptions` — z nich użytkownik wybiera `privacyLevel` do `tiktok_post_options`), czy konto blokuje komentarze / duet / stitch, maksymalna długość filmu. Wymagane przed publikacją na TikToku (audyt Content Posting API). Tylko administrator/operator.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const { getAccessToken, queryCreatorInfo } = await import("@/lib/tiktok.server");
      const token = await getAccessToken();
      return ok({ creator: await queryCreatorInfo(token) });
    }),
});

// ── Przegląd marketingu ──────────────────────────────────────────────────────

export const getMarketingOverview = defineTool({
  name: "get_marketing_overview",
  title: "Get marketing overview",
  description:
    "Cały marketing w jednym wywołaniu — zacznij od niego, gdy użytkownik pyta „co z marketingiem” albo chce coś zaplanować: gotowość kanałów (YouTube, Facebook, Instagram, TikTok, X, HeyGen, ElevenLabs, AI) z instrukcją, co połączyć; kolejki publikacji (nadchodzące, w toku, nieudane, ostatnio opublikowane); zadania wideo Studia; biblioteka materiałów (po kategorii i typie); posty social (draft / scheduled); kampanie mailowe; Meta Ads (aktywne, wydatki, leady); landing page'e; linki UTM; dziennik silnika wzrostu z ostatnich dni. Tylko administrator/operator.",
  inputSchema: {
    days: z
      .number()
      .int()
      .min(1)
      .max(90)
      .default(7)
      .describe("Okres dla dziennika działań i ostatnich publikacji (dni)."),
  },
  annotations: READ,
  handler: ({ days }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const errors: string[] = [];
      const [
        channels,
        socialQueue,
        ytQueue,
        studioJobs,
        materials,
        socialPosts,
        emailCampaigns,
        metaCampaigns,
        landingPages,
        trackingLinks,
        growth,
      ] = await Promise.all([
        section(errors, "channels", async () => {
          const { collectStudioStatus } = await import("@/lib/studio-status.server");
          const status = await collectStudioStatus();
          return { ...channelReadiness(status), status };
        }),
        section(errors, "social_publish_queue", () =>
          rowsOf(
            s
              .from("social_publish_queue")
              .select("id, platform, title, status, scheduled_at, published_at, last_error")
              .order("created_at", { ascending: false })
              .limit(300),
            "social_publish_queue",
          ),
        ),
        section(errors, "youtube_publish_queue", () =>
          rowsOf(
            s
              .from("youtube_publish_queue")
              .select("id, title, status, scheduled_at, published_at, last_error")
              .order("created_at", { ascending: false })
              .limit(200),
            "youtube_publish_queue",
          ),
        ),
        section(errors, "studio_video_jobs", async () => {
          const rows = await rowsOf(
            s
              .from("studio_video_jobs")
              .select("id, status, publish_title, prompt, last_error, updated_at")
              .order("updated_at", { ascending: false })
              .limit(200),
            "studio_video_jobs",
          );
          return {
            by_status: countBy(rows, "status"),
            failed: rows.filter((r) => r.status === "failed").slice(0, 5),
            ready_unpublished: rows.filter((r) => r.status === "ready").slice(0, 5),
          };
        }),
        section(errors, "marketing_materials", async () => {
          const rows = await rowsOf(
            s.from("marketing_materials").select("audience, media_type").limit(2000),
            "marketing_materials",
          );
          return {
            total: rows.length,
            by_audience: countBy(rows, "audience"),
            by_media_type: countBy(rows, "media_type"),
          };
        }),
        section(errors, "social_posts", async () => {
          const rows = await rowsOf(
            s
              .from("social_posts")
              .select("id, platform, status, content, scheduled_at")
              .order("created_at", { ascending: false })
              .limit(500),
            "social_posts",
          );
          return {
            by_status: countBy(rows, "status"),
            by_platform: countBy(rows, "platform"),
            scheduled: rows
              .filter((r) => r.status === "scheduled")
              .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""))
              .slice(0, 10)
              .map((r) => ({ ...r, content: String(r.content ?? "").slice(0, 120) })),
          };
        }),
        section(errors, "email_campaigns", async () => {
          const rows = await rowsOf(
            s
              .from("email_campaigns")
              .select(
                "id, name, status, audience_type, segment_id, recipients_total, sent_count, opened_count, clicked_count, scheduled_at, finished_at, created_at",
              )
              .order("created_at", { ascending: false })
              .limit(10),
            "email_campaigns",
          );
          return { by_status: countBy(rows, "status"), recent: rows };
        }),
        section(errors, "meta_campaigns", async () => {
          const rows = await rowsOf(
            s
              .from("meta_campaigns")
              .select(
                "id, name, status, spend, leads_count, cost_per_lead, daily_budget, last_synced_at",
              )
              .order("spend", { ascending: false })
              .limit(100),
            "meta_campaigns",
          );
          const active = rows.filter((r) => String(r.status).toUpperCase() === "ACTIVE");
          const sum = (xs: Record<string, any>[], k: string) =>
            xs.reduce((acc, r) => acc + (Number(r[k]) || 0), 0);
          return {
            total: rows.length,
            active: active.length,
            spend_total: sum(rows, "spend"),
            leads_total: sum(rows, "leads_count"),
            top_active: active.slice(0, 5),
            last_synced_at:
              rows
                .map((r) => r.last_synced_at)
                .sort()
                .at(-1) ?? null,
          };
        }),
        section(errors, "landing_pages", async () => {
          const rows = await rowsOf(
            s
              .from("landing_pages")
              .select("id, slug, title, published, view_count, conversion_count")
              .limit(200),
            "landing_pages",
          );
          const published = rows.filter((r) => r.published);
          return {
            total: rows.length,
            published: published.length,
            views: published.reduce((a, r) => a + (r.view_count ?? 0), 0),
            conversions: published.reduce((a, r) => a + (r.conversion_count ?? 0), 0),
            top: [...published]
              .sort((a, b) => (b.conversion_count ?? 0) - (a.conversion_count ?? 0))
              .slice(0, 5)
              .map((r) => ({ ...r, url: `https://financeyou.pl/l/${r.slug}` })),
          };
        }),
        section(errors, "marketing_campaigns", async () => {
          const rows = await rowsOf(
            s.from("marketing_campaigns").select("id, name, is_active, short_code").limit(500),
            "marketing_campaigns",
          );
          return { total: rows.length, active: rows.filter((r) => r.is_active).length };
        }),
        section(errors, "ai_growth_action_log", async () => {
          const rows = await rowsOf(
            s
              .from("ai_growth_action_log")
              .select("module, action, status, summary, created_at")
              .gte("created_at", since)
              .order("created_at", { ascending: false })
              .limit(300),
            "ai_growth_action_log",
          );
          return {
            total: rows.length,
            by_module: countBy(rows, "module"),
            by_status: countBy(rows, "status"),
            recent: rows.slice(0, 10),
          };
        }),
      ]);

      const socialRows = (socialQueue ?? []) as unknown as QueueRowLike[];
      const ytRows = (
        (ytQueue ?? []) as unknown as Parameters<typeof youtubeRowToQueueRow>[0][]
      ).map(youtubeRowToQueueRow);
      const publishQueue = summarizeQueue([...socialRows, ...ytRows]);
      const publishedSince = publishQueue.recently_published.filter(
        (r) => (r.published_at ?? "") >= since,
      );
      return ok({
        period_days: days,
        channels,
        publish_queue: {
          ...publishQueue,
          published_in_period: publishedSince.length,
          upcoming: publishQueue.upcoming.map((r) => ({
            ...r,
            platform_label: PLATFORM_LABELS[r.platform as never] ?? r.platform,
          })),
        },
        studio_video_jobs: studioJobs,
        materials,
        social_posts: socialPosts,
        email_campaigns: emailCampaigns,
        meta_ads: metaCampaigns,
        landing_pages: landingPages,
        tracking_links: trackingLinks,
        growth_engine: growth,
        errors,
        next_tools: {
          publish_material: "publish_marketing_material",
          publish_url: "queue_social_publication",
          queue: ["list_publish_queue", "list_youtube_queue", "run_publish_tick"],
          mailing: ["list_email_campaigns", "schedule_email_campaign"],
          ads: ["get_meta_campaigns_live", "get_meta_ads_insights"],
        },
      });
    }),
});

export const marketingPublishTools = [
  getMarketingOverview,
  listMarketingMaterialsAdmin,
  getMarketingMaterial,
  updateMarketingMaterial,
  generateMaterialDescription,
  publishMarketingMaterial,
  addMarketingMaterialFromUrl,
  deleteMarketingMaterial,
  publishSocialQueueItemNow,
  cancelSocialQueueItem,
  retrySocialQueueItem,
  deleteSocialQueueItem,
  retryYoutubeQueueItem,
  deleteYoutubeQueueItem,
  runPublishTick,
  getTiktokCreatorInfo,
];
