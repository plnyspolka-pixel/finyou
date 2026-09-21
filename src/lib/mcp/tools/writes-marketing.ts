// ZAPIS — marketing i treści: blog SEO, tematy, social, mailing,
// subskrybenci, frazy, PR, linki, landing pages.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  DESTRUCTIVE,
  WRITE,
  WRITE_IDEMPOTENT,
  actorId,
  fail,
  handle,
  insertOne,
  isoDate,
  ok,
  oneOf,
  patchOf,
  requireTeamAdmin,
  updateOne,
} from "../_helpers";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ą/g, "a")
    .replace(/ć/g, "c")
    .replace(/ę/g, "e")
    .replace(/ł/g, "l")
    .replace(/ń/g, "n")
    .replace(/ó/g, "o")
    .replace(/ś/g, "s")
    .replace(/[żź]/g, "z")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function wordCount(md: string): number {
  return md.split(/\s+/).filter(Boolean).length;
}

async function logGrowth(
  s: Awaited<ReturnType<typeof requireTeamAdmin>>,
  action: string,
  summary: string,
  payload: Record<string, unknown>,
  actor: string,
) {
  await s
    .from("ai_growth_action_log")
    .insert({ module: "seo_content_engine", action, status: "ok", summary, payload, actor });
}

export const createSeoArticleDraft = defineTool({
  name: "create_seo_article_draft",
  title: "Create blog article draft",
  description:
    "Zakłada szkic artykułu bloga (markdown) dla grupy borrower albo investor z meta danymi i słowami kluczowymi. Nie publikuje. Publikacja przez `update_seo_article` wymaga własnej okładki (`cover_image_url`) — zasada bloga Finance You. Tylko administrator/operator.",
  inputSchema: {
    title: z.string().min(5).max(200),
    content_md: z.string().min(50).max(200000),
    audience: z.enum(["borrower", "investor"]),
    slug: z.string().max(90).optional().describe("Domyślnie z tytułu."),
    excerpt: z.string().max(500).optional(),
    meta_title: z.string().max(120).optional(),
    meta_description: z.string().max(320).optional(),
    primary_keyword: z.string().max(120).optional(),
    keywords: z.array(z.string().min(2)).max(20).optional(),
    cta_label: z.string().max(80).optional(),
    cta_url: z.string().max(300).optional(),
    scheduled_for: z.string().optional().describe("Planowana data publikacji (ISO 8601)."),
    topic_id: z
      .string()
      .uuid()
      .optional()
      .describe("Temat z kolejki, który ten artykuł realizuje."),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const words = wordCount(a.content_md);
      const row = await insertOne(
        s,
        "ai_seo_articles",
        {
          title: a.title.trim(),
          slug: (a.slug ?? slugify(a.title)) || `artykul-${Date.now()}`,
          content_md: a.content_md,
          audience: a.audience,
          excerpt: a.excerpt ?? null,
          meta_title: a.meta_title ?? a.title.slice(0, 120),
          meta_description: a.meta_description ?? a.excerpt?.slice(0, 320) ?? null,
          primary_keyword: a.primary_keyword ?? null,
          keywords: a.keywords ?? [],
          cta_label: a.cta_label ?? null,
          cta_url: a.cta_url ?? null,
          scheduled_for: isoDate(a.scheduled_for, "scheduled_for") ?? null,
          topic_id: a.topic_id ?? null,
          word_count: words,
          reading_minutes: Math.max(1, Math.round(words / 200)),
          status: "draft",
          source: "mcp",
          created_by: actorId(ctx),
        },
        "id, title, slug, status, audience, word_count, created_at",
      );
      await logGrowth(
        s,
        "create_draft_mcp",
        `Szkic: ${row.title}`,
        { article_id: row.id, slug: row.slug },
        actorId(ctx),
      );
      return ok({
        ok: true,
        article: row,
        note: "Przed publikacją dodaj własną okładkę (cover_image_url).",
      });
    }),
});

export const updateSeoArticle = defineTool({
  name: "update_seo_article",
  title: "Update / publish blog article",
  description:
    "Edytuje artykuł bloga (tytuł, treść, meta, słowa kluczowe, CTA, okładka, termin) i zmienia status: draft, scheduled (z `scheduled_for`), published (ustawia datę publikacji; wymaga okładki), archived (zdejmuje ze strony). Publikacja jest publiczna od razu. Tylko administrator/operator.",
  inputSchema: {
    article_id: z.string().uuid(),
    title: z.string().min(5).max(200).optional(),
    content_md: z.string().min(50).max(200000).optional(),
    excerpt: z.string().max(500).optional(),
    meta_title: z.string().max(120).optional(),
    meta_description: z.string().max(320).optional(),
    keywords: z.array(z.string().min(2)).max(20).optional(),
    primary_keyword: z.string().max(120).optional(),
    cta_label: z.string().max(80).optional(),
    cta_url: z.string().max(300).optional(),
    cover_image_url: z.string().url().optional(),
    cover_image_alt: z.string().max(200).optional(),
    scheduled_for: z.string().nullable().optional(),
    status: z.enum(["draft", "scheduled", "published", "archived"]).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const current = await oneOf(
        s
          .from("ai_seo_articles")
          .select("id, title, status, cover_image_url, published_at")
          .eq("id", a.article_id),
        "ai_seo_articles",
      );
      if (!current) return fail("Nie znaleziono artykułu.");
      const patch = patchOf(a, [
        "title",
        "content_md",
        "excerpt",
        "meta_title",
        "meta_description",
        "keywords",
        "primary_keyword",
        "cta_label",
        "cta_url",
        "cover_image_url",
        "cover_image_alt",
      ]);
      if (a.content_md) {
        const words = wordCount(a.content_md);
        patch.word_count = words;
        patch.reading_minutes = Math.max(1, Math.round(words / 200));
      }
      if (a.scheduled_for !== undefined)
        patch.scheduled_for =
          a.scheduled_for === null ? null : isoDate(a.scheduled_for, "scheduled_for");
      if (a.status) {
        if (a.status === "published" && !(a.cover_image_url ?? current.cover_image_url)) {
          return fail("Publikacja wymaga własnej okładki artykułu (cover_image_url).");
        }
        if (a.status === "scheduled" && !(patch.scheduled_for ?? a.scheduled_for)) {
          return fail("Status scheduled wymaga scheduled_for.");
        }
        patch.status = a.status;
        if (a.status === "published")
          patch.published_at = current.published_at ?? new Date().toISOString();
      }
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const row = await updateOne(
        s,
        "ai_seo_articles",
        a.article_id,
        patch,
        "id, title, slug, status, audience, cover_image_url, scheduled_for, published_at, updated_at",
      );
      if (a.status)
        await logGrowth(
          s,
          `status_${a.status}`,
          `Status artykułu → ${a.status} (MCP)`,
          { article_id: row.id },
          actorId(ctx),
        );
      return ok({
        ok: true,
        article: { ...row, url: row.status === "published" ? `/blog/${row.slug}` : null },
      });
    }),
});

export const updateBlogTopic = defineTool({
  name: "update_blog_topic",
  title: "Update blog topic",
  description:
    "Edytuje temat w kolejce SEO: tytuł, słowo kluczowe, frazy dodatkowe, priorytet, notatki, status. Tylko administrator/operator.",
  inputSchema: {
    topic_id: z.string().uuid(),
    title: z.string().min(5).max(200).optional(),
    primary_keyword: z.string().max(120).optional(),
    secondary_keywords: z.array(z.string().min(2)).max(15).optional(),
    priority: z.number().int().min(0).max(100).optional(),
    notes: z.string().max(2000).optional(),
    status: z.string().max(40).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const patch = patchOf(a, [
        "title",
        "primary_keyword",
        "secondary_keywords",
        "priority",
        "notes",
        "status",
      ]);
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const row = await updateOne(
        s,
        "ai_seo_topics",
        a.topic_id,
        patch,
        "id, title, primary_keyword, priority, status, updated_at",
      );
      return ok({ ok: true, topic: row });
    }),
});

export const deleteBlogTopic = defineTool({
  name: "delete_blog_topic",
  title: "Delete blog topic",
  description:
    "Usuwa temat z kolejki SEO (nie dotyczy tematów w trakcie generowania). Tylko administrator/operator.",
  inputSchema: { topic_id: z.string().uuid() },
  annotations: DESTRUCTIVE,
  handler: ({ topic_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { data, error } = await s
        .from("ai_seo_topics")
        .delete()
        .eq("id", topic_id)
        .neq("status", "generating")
        .select("id, title");
      if (error) throw new Error(`ai_seo_topics: ${error.message}`);
      if (!data?.length) return fail("Nie znaleziono tematu albo jest w trakcie generowania.");
      return ok({ ok: true, deleted: data[0] });
    }),
});

export const createSocialPost = defineTool({
  name: "create_social_post",
  title: "Create social post (draft / scheduled)",
  description:
    "Tworzy post w module Social (facebook, instagram, linkedin, x, tiktok, threads): treść, hashtagi, obraz, link, kampania. Z `scheduled_at` dostaje status scheduled, bez — draft. Publikacja postów z tego modułu odbywa się z panelu. Tylko administrator/operator.",
  inputSchema: {
    platform: z.enum(["facebook", "instagram", "linkedin", "x", "tiktok", "threads"]),
    content: z.string().min(1).max(5000),
    hashtags: z.array(z.string().min(1)).max(30).optional(),
    image_url: z.string().url().optional(),
    link_url: z.string().url().optional(),
    campaign: z.string().max(120).optional(),
    scheduled_at: z.string().optional(),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const scheduled = isoDate(a.scheduled_at, "scheduled_at") ?? null;
      const row = await insertOne(
        s,
        "social_posts",
        {
          platform: a.platform,
          content: a.content,
          hashtags: a.hashtags ?? null,
          image_url: a.image_url ?? null,
          link_url: a.link_url ?? null,
          campaign: a.campaign ?? null,
          scheduled_at: scheduled,
          status: scheduled ? "scheduled" : "draft",
          created_by: actorId(ctx),
        },
        "id, platform, status, scheduled_at, created_at",
      );
      return ok({ ok: true, post: row });
    }),
});

export const queueSocialPublication = defineTool({
  name: "queue_social_publication",
  title: "Queue automatic publication (Facebook / Instagram)",
  description:
    "Dodaje wpis do kolejki automatycznej publikacji (facebook_post, facebook_reels, instagram_reels) — tick opublikuje go o zadanej porze bez dalszego udziału człowieka. To realna publikacja na profilu firmy. Tylko administrator/operator.",
  inputSchema: {
    platform: z.enum(["facebook_post", "facebook_reels", "instagram_reels"]),
    title: z.string().min(1).max(200),
    message: z.string().min(1).max(5000),
    image_url: z.string().url().optional().describe("Wymagane dla facebook_post bez wideo."),
    video_url: z.string().url().optional().describe("Wymagane dla reels."),
    scheduled_at: z.string().describe("Kiedy opublikować (ISO 8601)."),
  },
  annotations: { ...WRITE, openWorldHint: true },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      if (a.platform !== "facebook_post" && !a.video_url) return fail("Reels wymagają video_url.");
      if (a.platform === "facebook_post" && !a.image_url && !a.video_url)
        return fail("Post na Facebooku wymaga image_url albo video_url.");
      const row = await insertOne(
        s,
        "social_publish_queue",
        {
          platform: a.platform,
          title: a.title,
          message: a.message,
          image_url: a.platform === "facebook_post" ? (a.image_url ?? null) : null,
          video_url: a.video_url ?? null,
          scheduled_at: isoDate(a.scheduled_at, "scheduled_at"),
          created_by: actorId(ctx),
        },
        "id, platform, title, status, scheduled_at",
      );
      return ok({ ok: true, queued: row });
    }),
});

export const createEmailCampaignDraft = defineTool({
  name: "create_email_campaign_draft",
  title: "Create e-mail campaign draft",
  description:
    "Zakłada szkic kampanii mailowej (nazwa, temat, treść HTML lub tekst, nadawca, grupa: leady / klienci / inwestorzy / wszyscy, filtr odbiorców). Nic nie wysyła — wysyłkę uruchamia się z panelu Mailing po podglądzie. Tylko administrator/operator.",
  inputSchema: {
    name: z.string().min(1).max(200),
    subject: z.string().min(1).max(300),
    html_body: z.string().max(200000).optional(),
    text_body: z.string().max(200000).optional(),
    from_email: z.string().email().default("kontakt@financeyou.pl"),
    from_name: z.string().max(200).default("Finance You"),
    audience_type: z.enum(["leady", "klienci", "inwestorzy", "wszyscy"]),
    audience_filter: z.record(z.string(), z.unknown()).optional(),
    preview_text: z.string().max(300).optional(),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      if (!a.html_body && !a.text_body) return fail("Podaj html_body albo text_body.");
      const html =
        a.html_body ??
        `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6">${(
          a.text_body ?? ""
        )
          .split(/\n{2,}/)
          .map(
            (p) =>
              `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>`,
          )
          .join("")}</div>`;
      const row = await insertOne(
        s,
        "email_campaigns",
        {
          name: a.name,
          subject: a.subject,
          html_body: html,
          text_body: a.text_body ?? null,
          from_email: a.from_email,
          from_name: a.from_name,
          audience_type: a.audience_type,
          audience_filter: a.audience_filter ?? {},
          preview_text: a.preview_text ?? null,
          status: "szkic",
          created_by: actorId(ctx),
        },
        "id, name, subject, status, audience_type, created_at",
      );
      return ok({ ok: true, campaign: { ...row, url: "/admin/mailing" } });
    }),
});

export const addEmailSubscriber = defineTool({
  name: "add_email_subscriber",
  title: "Add e-mail subscriber",
  description:
    "Dodaje adres do listy mailingowej (status active) z imieniem, tagami i źródłem. Nie wysyła maila. Tylko administrator/operator.",
  inputSchema: {
    email: z.string().email(),
    first_name: z.string().max(120).optional(),
    last_name: z.string().max(120).optional(),
    tags: z.array(z.string().min(1)).max(20).optional(),
    source: z.string().max(80).default("mcp"),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const row = await insertOne(
        s,
        "email_subscribers",
        {
          email: a.email.trim().toLowerCase(),
          first_name: a.first_name ?? null,
          last_name: a.last_name ?? null,
          tags: a.tags ?? [],
          source: a.source,
          status: "active",
        },
        "id, email, status, tags, created_at",
      );
      return ok({ ok: true, subscriber: row });
    }),
});

export const unsubscribeEmail = defineTool({
  name: "unsubscribe_email",
  title: "Unsubscribe e-mail address",
  description:
    "Wypisuje adres ze wszystkich automatycznych wysyłek Finance You (strażnik „dość to dość”): dodaje do listy blokad i oznacza subskrybenta jako wypisanego. Tylko administrator/operator.",
  inputSchema: {
    email: z.string().email(),
    reason: z.string().max(300).default("wypis przez MCP"),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ email, reason }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { addSuppression } = await import("@/lib/email-guard.server");
      const normalized = email.trim().toLowerCase();
      await addSuppression(normalized, reason, { source: "mcp", actor: actorId(ctx) });
      const { data } = await s
        .from("email_subscribers")
        .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
        .eq("email", normalized)
        .select("id");
      return ok({
        ok: true,
        email: normalized,
        suppressed: true,
        subscribers_updated: (data ?? []).length,
      });
    }),
});

export const addSerpKeyword = defineTool({
  name: "add_serp_keyword",
  title: "Add tracked keyword",
  description:
    "Dodaje frazę do śledzenia pozycji w Google (lokalizacja, język, intencja, docelowy URL, tagi). Tylko administrator/operator.",
  inputSchema: {
    keyword: z.string().min(2).max(200),
    location: z.string().max(80).default("Poland"),
    language: z.string().max(10).default("pl"),
    intent: z.string().max(40).optional(),
    target_url: z.string().url().optional(),
    tags: z.array(z.string().min(1)).max(20).optional(),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const row = await insertOne(
        s,
        "ai_serp_keywords",
        {
          keyword: a.keyword.trim(),
          location: a.location,
          language: a.language,
          intent: a.intent ?? null,
          target_url: a.target_url ?? null,
          tags: a.tags ?? null,
          is_active: true,
          user_id: actorId(ctx),
        },
        "id, keyword, location, language, is_active, created_at",
      );
      return ok({ ok: true, keyword: row });
    }),
});

export const setSerpKeywordActive = defineTool({
  name: "set_serp_keyword_active",
  title: "Enable / disable tracked keyword",
  description: "Włącza lub wyłącza śledzenie frazy. Tylko administrator/operator.",
  inputSchema: { keyword_id: z.string().uuid(), is_active: z.boolean() },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ keyword_id, is_active }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const row = await updateOne(
        s,
        "ai_serp_keywords",
        keyword_id,
        { is_active },
        "id, keyword, is_active",
      );
      return ok({ ok: true, keyword: row });
    }),
});

export const updatePrOpportunity = defineTool({
  name: "update_pr_opportunity",
  title: "Update PR opportunity",
  description:
    "Aktualizuje okazję PR: status, notatki, szkic odpowiedzi (temat, treść), adresat. Nic nie wysyła. Tylko administrator/operator.",
  inputSchema: {
    opportunity_id: z.string().uuid(),
    status: z.string().max(40).optional(),
    notes: z.string().max(4000).optional(),
    draft_subject: z.string().max(300).optional(),
    draft_body: z.string().max(20000).optional(),
    recipient_email: z.string().email().nullable().optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const patch = patchOf(a, [
        "status",
        "notes",
        "draft_subject",
        "draft_body",
        "recipient_email",
      ]);
      if (a.draft_body !== undefined || a.draft_subject !== undefined)
        patch.draft_generated_at = new Date().toISOString();
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const row = await updateOne(
        s,
        "pr_opportunities",
        a.opportunity_id,
        patch,
        "id, topic, status, recipient_email, draft_subject, updated_at",
      );
      return ok({ ok: true, opportunity: row });
    }),
});

export const createShortLinkTool = defineTool({
  name: "create_short_link",
  title: "Create short link",
  description:
    "Tworzy krótki link financeyou.pl (do SMS-a, maila, posta) do dowolnego adresu, opcjonalnie powiązany z leadem / klientem / wnioskiem i z datą ważności. Zwraca kod i pełny URL; kliknięcia liczą się w `list_short_links`. Tylko administrator/operator.",
  inputSchema: {
    target_url: z.string().url(),
    lead_id: z.string().uuid().optional(),
    client_id: z.string().uuid().optional(),
    loan_application_id: z.string().uuid().optional(),
    source: z.string().max(60).default("mcp"),
    expires_in_days: z.number().int().min(1).max(365).optional(),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { createShortLink } = await import("@/lib/short-link.server");
      const link = await createShortLink({
        targetUrl: a.target_url,
        leadId: a.lead_id ?? null,
        clientId: a.client_id ?? null,
        loanApplicationId: a.loan_application_id ?? null,
        source: a.source,
        expiresAt: a.expires_in_days ? new Date(Date.now() + a.expires_in_days * 86_400_000) : null,
      });
      if (!link) return fail("Nie udało się utworzyć linku.");
      return ok({ ok: true, ...link });
    }),
});

export const setLandingPagePublished = defineTool({
  name: "set_landing_page_published",
  title: "Publish / unpublish landing page",
  description:
    "Publikuje albo zdejmuje landing page (`published`). Publikacja jest widoczna publicznie od razu. Tylko administrator/operator.",
  inputSchema: { landing_page_id: z.string().uuid(), published: z.boolean() },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ landing_page_id, published }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const row = await updateOne(
        s,
        "landing_pages",
        landing_page_id,
        { published },
        "id, title, slug, published, updated_at",
      );
      return ok({
        ok: true,
        landing_page: { ...row, url: row.published ? `/lp/${row.slug}` : null },
      });
    }),
});

export const writesMarketingTools = [
  createSeoArticleDraft,
  updateSeoArticle,
  updateBlogTopic,
  deleteBlogTopic,
  createSocialPost,
  queueSocialPublication,
  createEmailCampaignDraft,
  addEmailSubscriber,
  unsubscribeEmail,
  addSerpKeyword,
  setSerpKeywordActive,
  updatePrOpportunity,
  createShortLinkTool,
  setLandingPagePublished,
];
