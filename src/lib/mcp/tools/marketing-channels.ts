// Sterowanie kanałami marketingu przez MCP: posty social (moduł Social),
// mailing (kampanie, odbiorcy, segmenty, subskrybenci, wysyłka), landing
// page'e (pełny schemat), linki UTM (/r/<kod>) i ustawienia pikseli.
// Logika wspólna z panelem: mailing.server.ts, email-marketing.server.ts,
// landing-pages-schema.ts, marketing-tracking.server.ts.
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
  insertOne,
  isoDate,
  ok,
  oneOf,
  patchOf,
  requireTeamAdmin,
  rowsOf,
  updateOne,
} from "../_helpers";
import { defineListTool, search } from "../_list-tool";
import { landingSchema } from "@/lib/landing-pages-schema";
import { PUBLIC_SITE_ORIGIN } from "@/lib/short-link.server";

const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;

// ── Posty social (moduł /admin/marketing/social) ─────────────────────────────

const SOCIAL_PLATFORMS = ["facebook", "instagram", "linkedin", "x", "tiktok", "threads"] as const;
const SOCIAL_STATUSES = ["draft", "scheduled", "published", "failed"] as const;

export const updateSocialPost = defineTool({
  name: "update_social_post",
  title: "Update social post",
  description:
    "Edytuje post w module Social: treść, hashtagi, obraz, link, kampania, termin, status (draft / scheduled / published / failed). Podanie `scheduled_at` bez statusu ustawia scheduled. Ten moduł nie publikuje automatycznie — do realnej publikacji służy `queue_social_publication`. Tylko administrator/operator.",
  inputSchema: {
    post_id: z.string().uuid(),
    platform: z.enum(SOCIAL_PLATFORMS).optional(),
    content: z.string().min(1).max(5000).optional(),
    hashtags: z.array(z.string().max(60)).max(30).optional(),
    image_url: z.string().url().nullable().optional(),
    link_url: z.string().url().nullable().optional(),
    campaign: z.string().max(120).nullable().optional(),
    scheduled_at: z.string().nullable().optional(),
    status: z.enum(SOCIAL_STATUSES).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const patch = patchOf(a, [
        "platform",
        "content",
        "hashtags",
        "image_url",
        "link_url",
        "campaign",
        "status",
      ]);
      if (a.scheduled_at !== undefined) {
        patch.scheduled_at =
          a.scheduled_at === null ? null : isoDate(a.scheduled_at, "scheduled_at");
        if (a.scheduled_at && !a.status) patch.status = "scheduled";
      }
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const row = await updateOne(
        s,
        "social_posts",
        a.post_id,
        patch,
        "id, platform, status, content, hashtags, image_url, link_url, campaign, scheduled_at, updated_at",
      );
      return ok({ ok: true, post: row });
    }),
});

export const deleteSocialPost = defineTool({
  name: "delete_social_post",
  title: "Delete social post",
  description:
    "Usuwa post z modułu Social (szkic / zaplanowany / archiwalny). Tylko administrator/operator.",
  inputSchema: { post_id: z.string().uuid() },
  annotations: DESTRUCTIVE,
  handler: ({ post_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { data, error } = await s
        .from("social_posts")
        .delete()
        .eq("id", post_id)
        .select("id, platform, status");
      if (error) throw new Error(`social_posts: ${error.message}`);
      if (!data?.length) return fail("Nie znaleziono posta.");
      return ok({ ok: true, deleted: data[0] });
    }),
});

export const generateSocialPostCopy = defineTool({
  name: "generate_social_post_copy",
  title: "Generate social post copy (AI)",
  description:
    "Pisze treść posta pod platformę (facebook, instagram, linkedin, x, tiktok, threads) z briefu: treść, hashtagi i prompt na grafikę (po angielsku, do `generate_studio_image`). Nic nie zapisuje — zapis przez `create_social_post` albo publikacja przez `queue_social_publication`. Tylko administrator/operator.",
  inputSchema: {
    platform: z.enum(SOCIAL_PLATFORMS),
    brief: z.string().min(10).max(4000),
    campaign: z.string().max(120).optional(),
    tone: z.string().max(200).optional(),
  },
  annotations: { ...READ, openWorldHint: true },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { generateSocialContent } = await import("@/lib/social-posts.server");
      return ok({ ok: true, platform: a.platform, ...(await generateSocialContent(a)) });
    }),
});

// ── Mailing ──────────────────────────────────────────────────────────────────

const AUDIENCE_TYPES = ["leady", "klienci", "inwestorzy", "wszyscy", "segment"] as const;
const CAMPAIGN_EDITABLE = ["szkic", "anulowana"];

export const updateEmailCampaign = defineTool({
  name: "update_email_campaign",
  title: "Update e-mail campaign draft",
  description:
    "Edytuje kampanię mailową (tylko szkic albo anulowana): nazwa, temat, preheader, treść HTML / tekst, nadawca, reply-to, grupa odbiorców (leady / klienci / inwestorzy / wszyscy) albo `segment` z `segment_id`, filtr, termin. Anulowana kampania wraca do szkicu. Nic nie wysyła. Tylko administrator/operator.",
  inputSchema: {
    campaign_id: z.string().uuid(),
    name: z.string().min(1).max(200).optional(),
    subject: z.string().min(1).max(300).optional(),
    preview_text: z.string().max(300).nullable().optional(),
    html_body: z.string().min(1).max(200000).optional(),
    text_body: z.string().max(200000).nullable().optional(),
    from_email: z.string().email().optional(),
    from_name: z.string().max(200).optional(),
    reply_to: z.string().email().nullable().optional(),
    audience_type: z.enum(AUDIENCE_TYPES).optional(),
    audience_filter: z.record(z.string(), z.unknown()).optional(),
    segment_id: z.string().uuid().nullable().optional(),
    scheduled_at: z.string().nullable().optional().describe("Termin wysyłki (ISO 8601)."),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const current = await oneOf(
        s.from("email_campaigns").select("id, status").eq("id", a.campaign_id),
        "email_campaigns",
      );
      if (!current) return fail("Nie znaleziono kampanii.");
      if (!CAMPAIGN_EDITABLE.includes(current.status))
        return fail(`Kampanię w stanie „${current.status}” można tylko anulować albo usunąć.`);
      const patch = patchOf(a, [
        "name",
        "subject",
        "preview_text",
        "html_body",
        "text_body",
        "from_email",
        "from_name",
        "reply_to",
        "audience_type",
        "audience_filter",
        "segment_id",
      ]);
      if (a.segment_id) {
        patch.audience_type = "segment";
        patch.audience_filter = { ...(a.audience_filter ?? {}), segment_id: a.segment_id };
      }
      if (a.scheduled_at !== undefined)
        patch.scheduled_at =
          a.scheduled_at === null ? null : isoDate(a.scheduled_at, "scheduled_at");
      if (current.status === "anulowana") patch.status = "szkic";
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const row = await updateOne(
        s,
        "email_campaigns",
        a.campaign_id,
        patch,
        "id, name, subject, status, audience_type, segment_id, scheduled_at, updated_at",
      );
      return ok({ ok: true, campaign: row });
    }),
});

export const previewEmailCampaignAudience = defineTool({
  name: "preview_email_campaign_audience",
  title: "Preview e-mail campaign audience",
  description:
    "Liczba odbiorców i próbka 10 adresów dla grupy (leady / klienci / inwestorzy / wszyscy — z poszanowaniem zgód marketingowych) albo segmentu subskrybentów (`segment` + `segment_id`; bez segment_id — wszyscy aktywni subskrybenci). Podaj `campaign_id`, żeby sprawdzić odbiorców istniejącej kampanii. Tylko administrator/operator.",
  inputSchema: {
    campaign_id: z.string().uuid().optional(),
    audience_type: z.enum(AUDIENCE_TYPES).optional(),
    segment_id: z.string().uuid().optional(),
    audience_filter: z.record(z.string(), z.unknown()).optional(),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      let type = a.audience_type;
      let filter: Record<string, unknown> = { ...(a.audience_filter ?? {}) };
      if (a.segment_id) {
        type = "segment";
        filter.segment_id = a.segment_id;
      }
      if (a.campaign_id) {
        const c = await oneOf(
          s
            .from("email_campaigns")
            .select("audience_type, audience_filter, segment_id")
            .eq("id", a.campaign_id),
          "email_campaigns",
        );
        if (!c) return fail("Nie znaleziono kampanii.");
        type = c.audience_type;
        filter = { ...((c.audience_filter as Record<string, unknown>) ?? {}) };
        if (c.segment_id) filter.segment_id = c.segment_id;
      }
      if (!type) return fail("Podaj audience_type, segment_id albo campaign_id.");
      const { fetchCampaignAudience } = await import("@/lib/mailing.server");
      const list = await fetchCampaignAudience(type, filter);
      return ok({ audience_type: type, count: list.length, sample: list.slice(0, 10) });
    }),
});

export const sendEmailCampaignTest = defineTool({
  name: "send_email_campaign_test",
  title: "Send e-mail campaign test",
  description:
    "Wysyła jeden mail testowy kampanii (temat z prefiksem [TEST], podstawione zmienne) na wskazany adres. Tylko administrator/operator.",
  inputSchema: { campaign_id: z.string().uuid(), to_email: z.string().email() },
  annotations: SENDS,
  handler: ({ campaign_id, to_email }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { sendCampaignTest } = await import("@/lib/mailing.server");
      await sendCampaignTest(campaign_id, to_email);
      return ok({ ok: true, campaign_id, to_email });
    }),
});

export const scheduleEmailCampaign = defineTool({
  name: "schedule_email_campaign",
  title: "Schedule / send e-mail campaign",
  description:
    "Zamraża listę odbiorców kampanii (szkic) i planuje wysyłkę: na `scheduled_at`, na termin zapisany w kampanii albo — z `send_now` — od razu. Cron wysyła zaplanowane kampanie w kolejnych minutach (`run_email_campaign_dispatch` startuje od ręki). To realna wysyłka do ludzi: przed wywołaniem pokaż użytkownikowi temat, treść i liczbę odbiorców (`preview_email_campaign_audience`). Tylko administrator/operator.",
  inputSchema: {
    campaign_id: z.string().uuid(),
    send_now: z.boolean().default(false),
    scheduled_at: z.string().optional().describe("Termin wysyłki (ISO 8601)."),
  },
  annotations: SENDS,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { scheduleCampaignSend } = await import("@/lib/mailing.server");
      const r = await scheduleCampaignSend(a.campaign_id, {
        sendNow: a.send_now,
        scheduledAt: isoDate(a.scheduled_at, "scheduled_at") ?? null,
      });
      return ok({
        ok: true,
        campaign_id: a.campaign_id,
        recipients: r.count,
        scheduled_at: r.scheduled_at,
        note: a.send_now
          ? "Kampania zaplanowana na teraz — cron wysyła w ciągu kilku minut; `run_email_campaign_dispatch` startuje od ręki."
          : "Cron wyśle po terminie. `cancel_email_campaign` cofa, dopóki wysyłka nie ruszy.",
      });
    }),
});

export const cancelEmailCampaign = defineTool({
  name: "cancel_email_campaign",
  title: "Cancel scheduled e-mail campaign",
  description:
    "Anuluje zaplanowaną kampanię, zanim ruszy wysyłka (status zaplanowana → anulowana). Tylko administrator/operator.",
  inputSchema: { campaign_id: z.string().uuid() },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ campaign_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { data, error } = await s
        .from("email_campaigns")
        .update({ status: "anulowana" })
        .eq("id", campaign_id)
        .eq("status", "zaplanowana")
        .select("id, name, status")
        .maybeSingle();
      if (error) throw new Error(`email_campaigns: ${error.message}`);
      if (!data) return fail("Kampania nie istnieje albo nie jest zaplanowana.");
      return ok({ ok: true, campaign: data });
    }),
});

export const deleteEmailCampaign = defineTool({
  name: "delete_email_campaign",
  title: "Delete e-mail campaign",
  description:
    "Usuwa kampanię mailową (szkic, anulowaną albo zakończoną — nie w trakcie wysyłki ani zaplanowaną). Tylko administrator/operator.",
  inputSchema: { campaign_id: z.string().uuid() },
  annotations: DESTRUCTIVE,
  handler: ({ campaign_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { data, error } = await s
        .from("email_campaigns")
        .delete()
        .eq("id", campaign_id)
        .not("status", "in", "(zaplanowana,wysylana,wysylanie)")
        .select("id, name, status");
      if (error) throw new Error(`email_campaigns: ${error.message}`);
      if (!data?.length)
        return fail(
          "Kampania nie istnieje albo jest zaplanowana / w trakcie wysyłki — najpierw anuluj.",
        );
      return ok({ ok: true, deleted: data[0] });
    }),
});

export const runEmailCampaignDispatch = defineTool({
  name: "run_email_campaign_dispatch",
  title: "Dispatch due e-mail campaigns now",
  description:
    "Uruchamia od razu wysyłkę zaplanowanych kampanii, których termin minął (to, co cron robi cyklicznie): do `max_per_run` maili na kampanię w tym przebiegu; resztę dosyła kolejny przebieg. Realne maile. Tylko administrator/operator.",
  inputSchema: {
    max_per_run: z.number().int().min(1).max(500).default(100),
  },
  annotations: SENDS,
  handler: ({ max_per_run }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { dispatchScheduledCampaigns } = await import("@/lib/mailing.server");
      return ok({ ok: true, ...(await dispatchScheduledCampaigns(max_per_run)) });
    }),
});

export const generateEmailCampaignCopy = defineTool({
  name: "generate_email_campaign_copy",
  title: "Generate e-mail campaign copy (AI)",
  description:
    "Pisze z briefu temat, preheader i prostą treść HTML maila (z linkiem wypisu). Nic nie zapisuje — kampanię zakłada `create_email_campaign_draft`. Tylko administrator/operator.",
  inputSchema: { brief: z.string().min(10).max(4000) },
  annotations: { ...READ, openWorldHint: true },
  handler: ({ brief }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { generateEmailCopy } = await import("@/lib/email-marketing.server");
      return ok({ ok: true, ...(await generateEmailCopy(brief)) });
    }),
});

export const listEmailSegments = defineListTool({
  name: "list_email_segments",
  title: "List e-mail segments",
  description:
    "Segmenty subskrybentów newslettera: nazwa, opis, filtry (tagi, źródła, statusy, daty zapisu), liczba odbiorców. Tylko administrator/operator.",
  table: "email_segments",
  columns: "id, name, description, filters, subscriber_count, created_at, updated_at",
  resultKey: "segments",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: { query: search(["name", "description"], "Fraza w nazwie lub opisie.") },
});

const segmentFiltersSchema = z.object({
  tags: z.array(z.string().min(1)).max(30).optional(),
  sources: z.array(z.string().min(1)).max(30).optional(),
  status: z.array(z.string().min(1)).max(10).optional(),
  createdFrom: z.string().optional().describe("Zapisani od (ISO 8601 / YYYY-MM-DD)."),
  createdTo: z.string().optional().describe("Zapisani do (ISO 8601 / YYYY-MM-DD)."),
});

export const saveEmailSegment = defineTool({
  name: "save_email_segment",
  title: "Create / update e-mail segment",
  description:
    "Tworzy albo (z `segment_id`) aktualizuje segment subskrybentów: nazwa, opis, filtry (tagi, źródła, statusy, zakres dat zapisu). Przelicza liczbę odbiorców. Tylko administrator/operator.",
  inputSchema: {
    segment_id: z.string().uuid().optional(),
    name: z.string().min(1).max(120),
    description: z.string().max(500).nullable().optional(),
    filters: segmentFiltersSchema.default({}),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { resolveSegmentRecipients } = await import("@/lib/email-marketing.server");
      const filters = {
        ...a.filters,
        createdFrom: isoDate(a.filters.createdFrom, "createdFrom"),
        createdTo: isoDate(a.filters.createdTo, "createdTo"),
      };
      const count = (await resolveSegmentRecipients(filters)).length;
      const row = {
        name: a.name,
        description: a.description ?? null,
        filters,
        subscriber_count: count,
      };
      const saved = a.segment_id
        ? await updateOne(
            s,
            "email_segments",
            a.segment_id,
            row,
            "id, name, subscriber_count, updated_at",
          )
        : await insertOne(s, "email_segments", row, "id, name, subscriber_count, created_at");
      return ok({ ok: true, segment: saved });
    }),
});

export const deleteEmailSegment = defineTool({
  name: "delete_email_segment",
  title: "Delete e-mail segment",
  description:
    "Usuwa segment subskrybentów (kampanie zachowują zamrożoną listę). Tylko administrator/operator.",
  inputSchema: { segment_id: z.string().uuid() },
  annotations: DESTRUCTIVE,
  handler: ({ segment_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { data, error } = await s
        .from("email_segments")
        .delete()
        .eq("id", segment_id)
        .select("id, name");
      if (error) throw new Error(`email_segments: ${error.message}`);
      if (!data?.length) return fail("Nie znaleziono segmentu.");
      return ok({ ok: true, deleted: data[0] });
    }),
});

export const updateEmailSubscriber = defineTool({
  name: "update_email_subscriber",
  title: "Update e-mail subscriber",
  description:
    "Zmienia dane subskrybenta (po id albo adresie): imię, nazwisko, tagi, status (active / unsubscribed / bounced). Wypisanie z blokadą wszystkich wysyłek robi `unsubscribe_email`. Tylko administrator/operator.",
  inputSchema: {
    subscriber_id: z.string().uuid().optional(),
    email: z.string().email().optional().describe("Alternatywnie do subscriber_id."),
    first_name: z.string().max(120).nullable().optional(),
    last_name: z.string().max(120).nullable().optional(),
    tags: z.array(z.string().min(1)).max(30).optional(),
    status: z.enum(["active", "unsubscribed", "bounced"]).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const patch = patchOf(a, ["first_name", "last_name", "tags", "status"]);
      if (a.status === "unsubscribed") patch.unsubscribed_at = new Date().toISOString();
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      let id = a.subscriber_id;
      if (!id) {
        if (!a.email) return fail("Podaj subscriber_id albo email.");
        const row = await oneOf(
          s.from("email_subscribers").select("id").eq("email", a.email.trim().toLowerCase()),
          "email_subscribers",
        );
        if (!row) return fail("Nie znaleziono subskrybenta.");
        id = row.id;
      }
      const row = await updateOne(
        s,
        "email_subscribers",
        id!,
        patch,
        "id, email, first_name, last_name, status, tags",
      );
      return ok({ ok: true, subscriber: row });
    }),
});

export const deleteEmailSubscriber = defineTool({
  name: "delete_email_subscriber",
  title: "Delete e-mail subscriber",
  description:
    "Usuwa subskrybenta z listy (po id albo adresie). Nie dodaje blokady — jeśli osoba prosi o wypis, użyj `unsubscribe_email`. Tylko administrator/operator.",
  inputSchema: {
    subscriber_id: z.string().uuid().optional(),
    email: z.string().email().optional(),
  },
  annotations: DESTRUCTIVE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      let q = s.from("email_subscribers").delete();
      if (a.subscriber_id) q = q.eq("id", a.subscriber_id);
      else if (a.email) q = q.eq("email", a.email.trim().toLowerCase());
      else return fail("Podaj subscriber_id albo email.");
      const { data, error } = await q.select("id, email");
      if (error) throw new Error(`email_subscribers: ${error.message}`);
      if (!data?.length) return fail("Nie znaleziono subskrybenta.");
      return ok({ ok: true, deleted: data[0] });
    }),
});

// ── Landing page'e ───────────────────────────────────────────────────────────

const landingUrl = (slug: string) => `${PUBLIC_SITE_ORIGIN}/l/${slug}`;
const landingBody = landingSchema.omit({ id: true });

export const listAllLandingPages = defineListTool({
  name: "list_all_landing_pages",
  title: "List landing pages (including drafts)",
  description:
    "Wszystkie landing page'e z panelu (także nieopublikowane) z licznikami wizyt i konwersji. Pełną treść (sekcje, formularz, motyw) daje `get_landing_page`; publiczne tylko `list_landing_pages`. Tylko administrator/operator.",
  table: "landing_pages",
  columns:
    "id, slug, title, headline, published, view_count, conversion_count, meta_description, created_at, updated_at",
  resultKey: "landing_pages",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    query: search(["title", "slug", "headline"], "Fraza w tytule, slugu lub nagłówku."),
  },
  map: (r) => ({
    ...r,
    url: r.published ? landingUrl(r.slug) : null,
    conversion_rate:
      r.view_count > 0 ? Math.round(((r.conversion_count ?? 0) / r.view_count) * 1000) / 10 : null,
  }),
});

export const getLandingPage = defineTool({
  name: "get_landing_page",
  title: "Get landing page",
  description:
    "Pełna treść landing page'a (po id albo slugu): nagłówki, CTA, sekcje, pola formularza, motyw, meta, obrazy, podziękowanie, przekierowanie, liczniki. Tylko administrator/operator.",
  inputSchema: {
    landing_page_id: z.string().uuid().optional(),
    slug: z.string().max(80).optional(),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      if (!a.landing_page_id && !a.slug) return fail("Podaj landing_page_id albo slug.");
      let q = s.from("landing_pages").select("*");
      q = a.landing_page_id ? q.eq("id", a.landing_page_id) : q.eq("slug", a.slug!);
      const row = await oneOf(q, "landing_pages");
      if (!row) return fail("Nie znaleziono landing page'a.");
      return ok({ landing_page: { ...row, url: row.published ? landingUrl(row.slug) : null } });
    }),
});

export const createLandingPage = defineTool({
  name: "create_landing_page",
  title: "Create landing page",
  description:
    "Tworzy landing page (ten sam schemat co panel): slug, tytuł, nagłówek, podtytuł, CTA, obrazy, meta opis, sekcje (text / features / testimonial / stats / cta), pola formularza (1–15), podziękowanie, przekierowanie, motyw, `published`. Treść z briefu podpowie `generate_landing_copy`. Publiczny adres: /l/<slug>. Tylko administrator/operator.",
  inputSchema: landingBody.shape,
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { landingRowFromInput } = await import("@/lib/landing-pages-schema");
      const row = await insertOne(
        s,
        "landing_pages",
        { ...landingRowFromInput(landingBody.parse(a)), created_by: actorId(ctx) },
        "id, slug, title, published, created_at",
      );
      return ok({
        ok: true,
        landing_page: { ...row, url: row.published ? landingUrl(row.slug) : null },
      });
    }),
});

export const updateLandingPage = defineTool({
  name: "update_landing_page",
  title: "Update landing page",
  description:
    "Edytuje dowolne pola landing page'a (te same co przy tworzeniu) i/lub publikuje / zdejmuje (`published`). Publikacja jest widoczna od razu. Tylko administrator/operator.",
  inputSchema: {
    landing_page_id: z.string().uuid(),
    ...landingBody.partial().shape,
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { landing_page_id, ...rest } = a;
      const provided = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined),
      ) as Record<string, unknown>;
      if (Object.keys(provided).length === 0) return fail("Brak pól do zmiany.");
      // Walidacja jak w panelu — tylko podanych pól (schemat częściowy).
      const parsed = landingBody.partial().parse(provided) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const k of Object.keys(provided)) {
        const v = parsed[k];
        patch[k] = ["hero_image_url", "og_image_url", "redirect_url"].includes(k) ? v || null : v;
      }
      const row = await updateOne(
        s,
        "landing_pages",
        landing_page_id,
        patch,
        "id, slug, title, published, updated_at",
      );
      return ok({
        ok: true,
        landing_page: { ...row, url: row.published ? landingUrl(row.slug) : null },
      });
    }),
});

export const deleteLandingPage = defineTool({
  name: "delete_landing_page",
  title: "Delete landing page",
  description:
    "Usuwa landing page razem ze zgłoszeniami z jego formularza. Tylko administrator/operator.",
  inputSchema: { landing_page_id: z.string().uuid() },
  annotations: DESTRUCTIVE,
  handler: ({ landing_page_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { data, error } = await s
        .from("landing_pages")
        .delete()
        .eq("id", landing_page_id)
        .select("id, slug, title");
      if (error) throw new Error(`landing_pages: ${error.message}`);
      if (!data?.length) return fail("Nie znaleziono landing page'a.");
      return ok({ ok: true, deleted: data[0] });
    }),
});

export const generateLandingCopy = defineTool({
  name: "generate_landing_copy",
  title: "Generate landing page copy (AI)",
  description:
    "Pisze z briefu nagłówek, podtytuł, CTA, meta opis i sekcje landing page'a w formacie gotowym do `create_landing_page`. Nic nie zapisuje. Tylko administrator/operator.",
  inputSchema: { brief: z.string().min(10).max(4000) },
  annotations: { ...READ, openWorldHint: true },
  handler: ({ brief }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { generateLandingContent } = await import("@/lib/landing-pages.server");
      return ok({ ok: true, ...(await generateLandingContent(brief)) });
    }),
});

// ── Linki UTM (kampanie śledzące, /r/<kod>) ──────────────────────────────────

const trackingUrl = (code: string) => `${PUBLIC_SITE_ORIGIN}/r/${code}`;

export const createTrackingLink = defineTool({
  name: "create_tracking_link",
  title: "Create tracking link (UTM campaign)",
  description:
    "Tworzy kampanię śledzącą: krótki link financeyou.pl/r/<kod> → adres docelowy z parametrami UTM (source, medium, campaign — domyślnie slug nazwy, term, content), z kosztem i notatką. Kliknięcia i przypisane leady liczy `list_tracking_links` / `get_tracking_link_stats`. Tylko administrator/operator.",
  inputSchema: {
    name: z.string().min(1).max(120),
    target_url: z.string().url(),
    utm_source: z.string().max(60).optional(),
    utm_medium: z.string().max(60).optional(),
    utm_campaign: z.string().max(80).optional(),
    utm_term: z.string().max(80).optional(),
    utm_content: z.string().max(120).optional(),
    cost: z.number().min(0).default(0),
    notes: z.string().max(2000).optional(),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { createTrackingCampaign } = await import("@/lib/marketing-tracking.server");
      const row = await createTrackingCampaign(s, actorId(ctx), a);
      return ok({ ok: true, campaign: { ...row, short_url: trackingUrl(row.short_code) } });
    }),
});

export const updateTrackingLink = defineTool({
  name: "update_tracking_link",
  title: "Update tracking link",
  description:
    "Włącza / wyłącza kampanię śledzącą (wyłączony link przestaje przekierowywać), aktualizuje koszt i notatkę. Tylko administrator/operator.",
  inputSchema: {
    tracking_link_id: z.string().uuid(),
    is_active: z.boolean().optional(),
    cost: z.number().min(0).optional(),
    notes: z.string().max(2000).nullable().optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const patch = patchOf(a, ["is_active", "cost", "notes"]);
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const row = await updateOne(
        s,
        "marketing_campaigns",
        a.tracking_link_id,
        patch,
        "id, name, short_code, is_active, cost, notes, updated_at",
      );
      return ok({ ok: true, campaign: { ...row, short_url: trackingUrl(row.short_code) } });
    }),
});

export const deleteTrackingLink = defineTool({
  name: "delete_tracking_link",
  title: "Delete tracking link",
  description:
    "Usuwa kampanię śledzącą (link /r/<kod> przestaje działać). Tylko administrator/operator.",
  inputSchema: { tracking_link_id: z.string().uuid() },
  annotations: DESTRUCTIVE,
  handler: ({ tracking_link_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { data, error } = await s
        .from("marketing_campaigns")
        .delete()
        .eq("id", tracking_link_id)
        .select("id, name, short_code");
      if (error) throw new Error(`marketing_campaigns: ${error.message}`);
      if (!data?.length) return fail("Nie znaleziono kampanii.");
      return ok({ ok: true, deleted: data[0] });
    }),
});

export const getTrackingLinkStats = defineTool({
  name: "get_tracking_link_stats",
  title: "Get tracking link stats",
  description:
    "Statystyki kampanii śledzącej za ostatnie N dni: kliknięcia i leady dzień po dniu, kraje, urządzenia, źródła odesłań, koszt na lead. Tylko administrator/operator.",
  inputSchema: {
    tracking_link_id: z.string().uuid(),
    days: z.number().int().min(1).max(365).default(30),
  },
  annotations: READ,
  handler: ({ tracking_link_id, days }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const campaign = await oneOf(
        s
          .from("marketing_campaigns")
          .select("id, name, short_code, target_url, utm_campaign, is_active, cost")
          .eq("id", tracking_link_id),
        "marketing_campaigns",
      );
      if (!campaign) return fail("Nie znaleziono kampanii.");
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const [clicks, attrs] = await Promise.all([
        rowsOf(
          s
            .from("campaign_clicks")
            .select("created_at, country, device, referrer")
            .eq("campaign_id", tracking_link_id)
            .gte("created_at", since)
            .limit(20000),
          "campaign_clicks",
        ),
        rowsOf(
          s
            .from("lead_attributions")
            .select("created_at, utm_source")
            .eq("campaign_id", tracking_link_id)
            .gte("created_at", since)
            .limit(20000),
          "lead_attributions",
        ),
      ]);
      const series: Record<string, { clicks: number; leads: number }> = {};
      for (let i = days - 1; i >= 0; i--) {
        series[new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)] = {
          clicks: 0,
          leads: 0,
        };
      }
      for (const c of clicks) {
        const d = String(c.created_at).slice(0, 10);
        if (series[d]) series[d].clicks++;
      }
      for (const a of attrs) {
        const d = String(a.created_at).slice(0, 10);
        if (series[d]) series[d].leads++;
      }
      const cost = Number(campaign.cost) || 0;
      return ok({
        campaign: { ...campaign, short_url: trackingUrl(campaign.short_code) },
        days,
        total_clicks: clicks.length,
        total_leads: attrs.length,
        cost_per_lead: attrs.length && cost ? Math.round((cost / attrs.length) * 100) / 100 : null,
        by_country: countBy(clicks, "country"),
        by_device: countBy(clicks, "device"),
        by_referrer: countBy(clicks, "referrer"),
        series: Object.entries(series).map(([date, v]) => ({ date, ...v })),
      });
    }),
});

// ── Piksele i tagi (ustawienia śledzenia) ────────────────────────────────────

const TRACKING_FIELDS = [
  "client_pixel_id",
  "investor_pixel_id",
  "track_lead",
  "track_registration",
  "track_subscribe",
  "track_contact",
  "ga4_measurement_id",
  "gtm_container_id",
  "google_ads_conversion_id",
  "google_ads_label_registration",
  "google_ads_label_lead",
  "google_ads_label_submit",
  "google_ads_label_subscribe",
] as const;

export const getTrackingSettings = defineTool({
  name: "get_tracking_settings",
  title: "Get pixel / tag settings",
  description:
    "Ustawienia śledzenia strony (/admin/pixele): piksele Meta (klient / inwestor), które zdarzenia wysyłać, GA4, GTM, Google Ads (id konwersji i etykiety), id grup odbiorców Meta. Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const row = await oneOf(
        s.from("tracking_settings").select("*").eq("id", 1),
        "tracking_settings",
      );
      return ok({ settings: row });
    }),
});

export const updateTrackingSettings = defineTool({
  name: "update_tracking_settings",
  title: "Update pixel / tag settings",
  description:
    "Zmienia ustawienia śledzenia strony: id pikseli Meta, przełączniki zdarzeń (lead, rejestracja, zapis, kontakt), GA4, GTM, Google Ads. Działa od razu na stronie publicznej. Tylko administrator/operator.",
  inputSchema: {
    client_pixel_id: z.string().max(40).nullable().optional(),
    investor_pixel_id: z.string().max(40).nullable().optional(),
    track_lead: z.boolean().optional(),
    track_registration: z.boolean().optional(),
    track_subscribe: z.boolean().optional(),
    track_contact: z.boolean().optional(),
    ga4_measurement_id: z.string().max(40).nullable().optional(),
    gtm_container_id: z.string().max(40).nullable().optional(),
    google_ads_conversion_id: z.string().max(40).nullable().optional(),
    google_ads_label_registration: z.string().max(80).nullable().optional(),
    google_ads_label_lead: z.string().max(80).nullable().optional(),
    google_ads_label_submit: z.string().max(80).nullable().optional(),
    google_ads_label_subscribe: z.string().max(80).nullable().optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const patch = patchOf(a, TRACKING_FIELDS);
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const row = await updateOne(s, "tracking_settings", "1", patch, "*");
      return ok({ ok: true, settings: row });
    }),
});

export const marketingChannelTools = [
  updateSocialPost,
  deleteSocialPost,
  generateSocialPostCopy,
  updateEmailCampaign,
  previewEmailCampaignAudience,
  sendEmailCampaignTest,
  scheduleEmailCampaign,
  cancelEmailCampaign,
  deleteEmailCampaign,
  runEmailCampaignDispatch,
  generateEmailCampaignCopy,
  listEmailSegments,
  saveEmailSegment,
  deleteEmailSegment,
  updateEmailSubscriber,
  deleteEmailSubscriber,
  listAllLandingPages,
  getLandingPage,
  createLandingPage,
  updateLandingPage,
  deleteLandingPage,
  generateLandingCopy,
  createTrackingLink,
  updateTrackingLink,
  deleteTrackingLink,
  getTrackingLinkStats,
  getTrackingSettings,
  updateTrackingSettings,
];
