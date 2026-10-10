// Studio publikacji — narzędzia robota do ELEMENTÓW DYNAMICZNYCH rolki
// (katalog komponentów Remotion, projekt AI, własny projekt) i BANKU B-ROLLI
// (lista, dodanie z URL-a z opisem AI, włącz/wyłącz, usuń). Te same funkcje
// co panel Studia; asystent panelu dostaje je przez most MCP.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  DESTRUCTIVE,
  WRITE,
  WRITE_IDEMPOTENT,
  actorId,
  fail,
  handle,
  ok,
  oneOf,
  requireTeam,
  requireTeamAdmin,
} from "../_helpers";

const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

type JobRow = import("@/lib/studio-video-queue.server").StudioJobRow;

/** Projekt + podgląd czasów z SRT joba (co faktycznie wejdzie do renderu). */
async function motionPreview(job: JobRow, elements: unknown) {
  const { sanitizeMotionDesign, motionWithCueTiming } = await import("@/lib/motion-catalog");
  const design = sanitizeMotionDesign(elements);
  let timeline: { component: string; zone: string; start: number; end: number }[] | null = null;
  let note: string | null = null;
  try {
    const { loadJobCues } = await import("@/lib/studio-video-queue.server");
    const timed = motionWithCueTiming(design, await loadJobCues(job));
    timeline = timed.map((m) => ({
      component: m.component,
      zone: m.zone,
      start: Math.round(m.start * 10) / 10,
      end: Math.round(m.end * 10) / 10,
    }));
    const dropped = design.length - timed.length;
    if (dropped > 0) {
      note = `${dropped} element(y) nie wejdą do renderu: kotwica sync nie występuje dosłownie w nagraniu albo element jest za blisko poprzedniego (min. ${(await import("@/lib/motion-catalog")).MOTION_LIMITS.minDuration} s).`;
    }
  } catch (e) {
    note = `Bez podglądu czasów: ${errMsg(e)}`;
  }
  return { design, timeline, note };
}

export const getMotionCatalog = defineTool({
  name: "get_motion_catalog",
  title: "Get Remotion motion component catalog",
  description:
    "Katalog komponentów elementów dynamicznych rolki Studia (silnik Remotion): stat, range, threshold, versus, checklist, steps, keyword, mythFact, alert, cta — opis, kiedy użyć, propsy i limity znaków, strefy kadru, zasady kotwic czasu (sync = DOSŁOWNY fragment lektora). Zacznij od niego przed `set_studio_motion`.",
  inputSchema: {},
  annotations: READ,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const m = await import("@/lib/motion-catalog");
      return ok({
        components: m.MOTION_COMPONENTS,
        zones: m.MOTION_ZONES,
        limits: m.MOTION_LIMITS,
        catalog: m.MOTION_CATALOG_PROMPT,
        element_shape: {
          component: "jeden z components",
          zone: "top (nad awatarem, karty z treścią) | center (na awatarze, tylko krótki keyword)",
          sync: "dosłowny fragment lektora (3–10 słów), przy którym element wchodzi",
          endSync: "dosłowny fragment, po którym znika, albo null",
          itemSync: "tylko checklist/steps: fragment dla każdej pozycji albo null",
          props: "wg katalogu",
        },
      });
    }),
});

export const designStudioMotion = defineTool({
  name: "design_studio_motion",
  title: "Design dynamic elements for a studio reel (Claude)",
  description:
    "Projektuje elementy dynamiczne rolki Studia modelem Claude (scenariusz + czasy z SRT + katalog komponentów) i ZAPISUJE projekt przy zadaniu (`motion_design`) — wejdzie przy najbliższym wykończeniu Remotion (render, `retry_studio_job`, `restyle_studio_job_captions`). Zwraca projekt i podgląd osi czasu. Nie renderuje. Wymaga pliku SRT zadania (po renderze lektora) i ANTHROPIC_API_KEY. Tylko administrator/operator.",
  inputSchema: { id: z.string().uuid() },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const job = await oneOf<JobRow>(
        s.from("studio_video_jobs").select("*").eq("id", a.id),
        "studio_video_jobs",
      );
      if (!job) return fail("Nie znaleziono zadania.");
      const { designAndSaveMotion } = await import("@/lib/studio-video-queue.server");
      let elements;
      try {
        elements = await designAndSaveMotion(job);
      } catch (e) {
        return fail(errMsg(e));
      }
      const preview = await motionPreview(job, elements);
      return ok({
        ok: true,
        job_id: job.id,
        ...preview,
        hint: "Popraw projekt `set_studio_motion` (np. inna treść, komponent, kotwica); wypal na nowo `restyle_studio_job_captions` (gotowa rolka) albo `retry_studio_job` (nieudana) — bez kredytów HeyGen.",
        actor: actorId(ctx),
      });
    }),
});

export const setStudioMotion = defineTool({
  name: "set_studio_motion",
  title: "Set dynamic elements of a studio reel",
  description:
    "Zapisuje WŁASNY projekt elementów dynamicznych rolki (lista elementów z `get_motion_catalog`) przy zadaniu — zastępuje projekt AI przy wykończeniu Remotion. Walidacja jak dla AI: element z za długim tekstem, złymi propsami albo nieznanym komponentem odpada (wynik pokazuje, ile przeszło i oś czasu z SRT). `elements: []` = rolka bez elementów (zostaną zwykłe karty); `elements: null` = wyczyść, przy wykończeniu zaprojektuje AI. Potem `restyle_studio_job_captions` / `retry_studio_job`. Tylko administrator/operator.",
  inputSchema: {
    id: z.string().uuid(),
    elements: z
      .array(z.record(z.unknown()))
      .nullable()
      .describe(
        "Elementy: {component, zone, sync, endSync, itemSync, props} — wg get_motion_catalog.",
      ),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const job = await oneOf<JobRow>(
        s.from("studio_video_jobs").select("*").eq("id", a.id),
        "studio_video_jobs",
      );
      if (!job) return fail("Nie znaleziono zadania.");
      const { saveMotionDesign } = await import("@/lib/studio-video-queue.server");
      if (a.elements === null) {
        await saveMotionDesign(job.id, null);
        return ok({ ok: true, job_id: job.id, cleared: true, actor: actorId(ctx) });
      }
      const preview = await motionPreview(job, a.elements);
      const rejected = a.elements.length - preview.design.length;
      if (a.elements.length && !preview.design.length) {
        return fail(
          "Żaden element nie przeszedł walidacji (sprawdź komponent, propsy i limity znaków w get_motion_catalog). Nic nie zapisano.",
        );
      }
      await saveMotionDesign(job.id, preview.design);
      return ok({
        ok: true,
        job_id: job.id,
        saved: preview.design.length,
        rejected,
        ...preview,
        actor: actorId(ctx),
      });
    }),
});

// ── Bank B-rolli ────────────────────────────────────────────────────────────

export const listBrollAssets = defineTool({
  name: "list_broll_assets",
  title: "List B-roll bank",
  description:
    "Bank przebitek (B-roll) Studia: grafiki dobierane do rolek po tagach do frazy planera (rotacja: najdawniej użyte). Zwraca id, tytuł, tagi, URL, źródło, orientację, aktywność i licznik użyć. Szukaj po tytule/tagach (`search`).",
  inputSchema: {
    search: z.string().optional(),
    include_inactive: z.boolean().default(false),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const { listBrollAssets: list } = await import("@/lib/studio-broll.server");
      const items = await list({
        search: a.search,
        includeInactive: a.include_inactive,
        limit: 2000,
      });
      return ok({
        total: items.length,
        items: items.slice(0, a.limit).map(({ storage_path: _p, ...rest }) => rest),
      });
    }),
});

export const addBrollAsset = defineTool({
  name: "add_broll_asset",
  title: "Add image to B-roll bank",
  description:
    "Dodaje grafikę do banku przebitek z publicznego URL-a (http/https; JPG/PNG/WEBP, do 15 MB) — plik kopiujemy do naszego Storage. Bez `tags` grafikę opisuje AI (Claude patrzy na obraz: tytuł sceny po angielsku, tagi EN/PL, orientacja), żeby planer ją dobierał. Tytuł najlepiej jak fraza stockowa po angielsku. Tylko administrator/operator.",
  inputSchema: {
    url: z.string().url(),
    title: z.string().max(160).optional(),
    tags: z.array(z.string().max(40)).max(24).optional(),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { addBrollFromUrl } = await import("@/lib/studio-broll.server");
      const tags = (a.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
      try {
        const asset = await addBrollFromUrl({
          url: a.url,
          title: a.title,
          tags,
          source: "url",
          sourceQuery: a.title ?? "",
          userId: ctx.getUserId() ?? null,
          autoDescribe: !tags.length,
        });
        const { storage_path: _p, ...rest } = asset;
        return ok({ ok: true, asset: rest, actor: actorId(ctx) });
      } catch (e) {
        return fail(errMsg(e));
      }
    }),
});

export const setBrollAssetActive = defineTool({
  name: "set_broll_asset_active",
  title: "Enable or disable a B-roll asset",
  description:
    "Włącza albo wyłącza przebitkę w banku — wyłączona nie wchodzi do doboru (np. nietrafiony kadr). Tylko administrator/operator.",
  inputSchema: { id: z.string().uuid(), active: z.boolean() },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { setBrollActive } = await import("@/lib/studio-broll.server");
      await setBrollActive(a.id, a.active);
      return ok({ ok: true, id: a.id, active: a.active, actor: actorId(ctx) });
    }),
});

export const deleteBrollAsset = defineTool({
  name: "delete_broll_asset",
  title: "Delete a B-roll asset",
  description:
    "Usuwa przebitkę z banku razem z plikiem w Storage (nieodwracalne). Do ukrycia kadru wystarczy `set_broll_asset_active`. Tylko administrator/operator.",
  inputSchema: { id: z.string().uuid() },
  annotations: DESTRUCTIVE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { deleteBrollAsset: del } = await import("@/lib/studio-broll.server");
      await del(a.id);
      return ok({ ok: true, id: a.id, deleted: true, actor: actorId(ctx) });
    }),
});

export const studioMotionTools = [
  getMotionCatalog,
  designStudioMotion,
  setStudioMotion,
  listBrollAssets,
  addBrollAsset,
  setBrollAssetActive,
  deleteBrollAsset,
];
