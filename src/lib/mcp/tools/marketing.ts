// Marketing i treści: blog SEO, pozycje w Google, kampanie mailowe,
// subskrybenci, social media, Meta Ads, landing pages, linki śledzące,
// PR, silnik wzrostu, lejek, strony lokalizacyjne, studio wideo, YouTube.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { clampLimit, countBy, fail, handle, ok, oneOf, requireTeam, rowsOf } from "../_helpers";
import { defineListTool, search, since, text, uuid } from "../_list-tool";

export const listSeoArticles = defineListTool({
  name: "list_seo_articles",
  title: "List SEO articles (all statuses)",
  description:
    "Artykuły bloga we wszystkich stanach (szkice, zaplanowane, opublikowane) z audience, słowem kluczowym, długością i terminami. Publiczne treści daje `search_blog` / `get_blog_article`. Tylko administrator/operator.",
  table: "ai_seo_articles",
  columns:
    "id, title, slug, status, audience, primary_keyword, keywords, word_count, reading_minutes, scheduled_for, published_at, content_refreshed_at, source, topic_id, created_at, updated_at",
  resultKey: "articles",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    status: text("status", "Status (np. draft, scheduled, published)."),
    audience: text("audience", "Grupa docelowa (borrower / investor)."),
    query: search(["title", "primary_keyword", "slug"], "Fraza: tytuł, słowo kluczowe, slug."),
    since: since("created_at"),
  },
  map: (r) => ({ ...r, url: r.status === "published" ? `/blog/${r.slug}` : null }),
});

export const addBlogTopic = defineTool({
  name: "add_blog_topic",
  title: "Add blog topic to queue",
  description:
    "Dodaje temat do kolejki SEO bloga (autopilot pisze artykuły z kolejki naprzemiennie dla klientów i inwestorów). Nie publikuje nic od razu. Tylko administrator/operator.",
  inputSchema: {
    title: z.string().min(5).max(200),
    primary_keyword: z.string().min(2).max(120).optional(),
    secondary_keywords: z.array(z.string().min(2)).max(15).optional(),
    search_intent: z
      .string()
      .max(60)
      .optional()
      .describe("Intencja (np. informacyjna, transakcyjna)."),
    priority: z
      .number()
      .int()
      .min(0)
      .max(100)
      .optional()
      .describe("Priorytet (wyższy = wcześniej)."),
    notes: z.string().max(2000).optional().describe("Wskazówki dla autora AI."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const { data, error } = await s
        .from("ai_seo_topics")
        .insert({
          title: a.title.trim(),
          primary_keyword: a.primary_keyword?.trim() ?? null,
          secondary_keywords: a.secondary_keywords ?? null,
          search_intent: a.search_intent ?? null,
          priority: a.priority ?? 50,
          notes: a.notes ?? null,
          created_by: ctx.getUserId(),
        })
        .select("id, title, status, priority, created_at")
        .maybeSingle();
      if (error) throw new Error(`ai_seo_topics: ${error.message}`);
      return ok({ ok: true, topic: data });
    }),
});

export const listSerpKeywords = defineTool({
  name: "list_serp_keywords",
  title: "List tracked keywords with positions",
  description:
    "Śledzone frazy Google z ostatnią pozycją, poprzednią pozycją, adresem w wynikach, wolumenem i trudnością. Tylko administrator/operator.",
  inputSchema: {
    query: z.string().min(2).optional().describe("Fraza w słowie kluczowym."),
    active_only: z.boolean().default(true),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ query, active_only, limit }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      let q = s
        .from("ai_serp_keywords")
        .select(
          "id, keyword, location, language, intent, search_volume, difficulty, is_active, target_url, tags, updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(clampLimit(limit, 50, 200));
      if (active_only) q = q.eq("is_active", true);
      if (query) q = q.ilike("keyword", `%${query.replace(/[%_,()]/g, " ").trim()}%`);
      const keywords = await rowsOf<Record<string, any>>(q, "ai_serp_keywords");
      const ids = keywords.map((k) => k.id);
      const latest = new Map<string, Record<string, any>>();
      if (ids.length) {
        const rankings = await rowsOf<Record<string, any>>(
          s
            .from("ai_serp_rankings")
            .select("keyword_id, position, previous_position, url, serp_features, checked_at")
            .in("keyword_id", ids)
            .order("checked_at", { ascending: false })
            .limit(ids.length * 3),
          "ai_serp_rankings",
        );
        for (const r of rankings) if (!latest.has(r.keyword_id)) latest.set(r.keyword_id, r);
      }
      return ok({
        keywords: keywords.map((k) => ({ ...k, latest_ranking: latest.get(k.id) ?? null })),
      });
    }),
});

export const listEmailCampaigns = defineListTool({
  name: "list_email_campaigns",
  title: "List email campaigns",
  description:
    "Kampanie mailowe: nazwa, temat, status, grupa, liczby (odbiorcy, wysłane, dostarczone, otwarcia, kliknięcia, odbicia, skargi, wypisy), terminy. Tylko administrator/operator.",
  table: "email_campaigns",
  columns:
    "id, name, subject, status, audience_type, segment_id, recipients_total, sent_count, delivered_count, opened_count, clicked_count, bounced_count, complained_count, unsubscribed_count, failed_count, scheduled_at, started_at, finished_at, error_message, created_at",
  resultKey: "campaigns",
  access: "team",
  filters: {
    status: text("status", "Status kampanii (np. draft, scheduled, sending, sent)."),
    query: search(["name", "subject"], "Fraza: nazwa lub temat."),
    since: since("created_at"),
  },
});

export const getEmailCampaign = defineTool({
  name: "get_email_campaign",
  title: "Get email campaign",
  description:
    "Kampania mailowa ze statystykami odbiorców (rozkład statusów, otwarcia, kliknięcia) i opcjonalnie treścią HTML/tekstową. Tylko administrator/operator.",
  inputSchema: {
    id: z.string().uuid(),
    include_body: z.boolean().default(false).describe("Dołączyć treść HTML i tekstową."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ id, include_body }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const campaign = await oneOf(
        s.from("email_campaigns").select("*").eq("id", id),
        "email_campaigns",
      );
      if (!campaign) return fail("Nie znaleziono kampanii.");
      const recipients = await rowsOf<Record<string, any>>(
        s
          .from("email_campaign_recipients")
          .select("status, opened_at, clicked_at, bounced_at, complained_at, error_message")
          .eq("campaign_id", id)
          .limit(5000),
        "email_campaign_recipients",
      );
      if (!include_body) {
        delete campaign.html_body;
        delete campaign.text_body;
      }
      return ok({
        campaign,
        recipients: {
          sampled: recipients.length,
          by_status: countBy(recipients, "status"),
          opened: recipients.filter((r) => r.opened_at).length,
          clicked: recipients.filter((r) => r.clicked_at).length,
          bounced: recipients.filter((r) => r.bounced_at).length,
          complained: recipients.filter((r) => r.complained_at).length,
        },
      });
    }),
});

export const listEmailSubscribers = defineListTool({
  name: "list_email_subscribers",
  title: "List email subscribers",
  description:
    "Subskrybenci newslettera/mailingu: e-mail, imię, status, źródło, tagi, UTM, data wypisu. Tylko administrator/operator.",
  table: "email_subscribers",
  columns:
    "id, email, first_name, last_name, status, source, source_id, tags, utm_source, utm_medium, utm_campaign, unsubscribed_at, bounced_at, created_at",
  resultKey: "subscribers",
  access: "team",
  filters: {
    status: text("status", "Status (np. active, unsubscribed, bounced)."),
    source: text("source", "Źródło zapisu."),
    query: search(["email", "first_name", "last_name"], "Fraza: e-mail lub imię."),
    since: since("created_at"),
  },
});

export const listSocialPosts = defineListTool({
  name: "list_social_posts",
  title: "List social posts",
  description:
    "Posty social media (Facebook, Instagram, LinkedIn…): platforma, status, treść, hashtagi, obraz, link, kampania, terminy. Tylko administrator/operator.",
  table: "social_posts",
  columns:
    "id, platform, status, content, hashtags, image_url, link_url, campaign, scheduled_at, published_at, created_at",
  resultKey: "posts",
  access: "team",
  filters: {
    platform: text("platform", "Platforma."),
    status: text("status", "Status posta."),
    query: search(["content", "campaign"], "Fraza w treści lub nazwie kampanii."),
    since: since("created_at"),
  },
});

export const listPublishQueue = defineListTool({
  name: "list_publish_queue",
  title: "List social publish queue",
  description:
    "Kolejka automatycznej publikacji w social media: platforma, tytuł, termin, status, próby, błąd, id opublikowanego posta. Tylko administrator/operator.",
  table: "social_publish_queue",
  columns:
    "id, platform, status, title, message, image_url, video_url, scheduled_at, published_at, attempt_count, last_error, external_post_id, created_at",
  resultKey: "queue",
  access: "team",
  order: { column: "scheduled_at", ascending: false },
  filters: {
    platform: text("platform", "Platforma."),
    status: text("status", "Status wpisu w kolejce."),
  },
});

export const listMetaCampaigns = defineListTool({
  name: "list_meta_campaigns",
  title: "List Meta Ads campaigns",
  description:
    "Kampanie Meta Ads z synchronizacji: nazwa, cel, status, budżety, wydatki, wyświetlenia, kliknięcia, CTR, CPC, liczba leadów, koszt leada, terminy. Tylko administrator/operator.",
  table: "meta_campaigns",
  columns:
    "id, meta_campaign_id, ad_account_id, name, objective, status, daily_budget, lifetime_budget, spend, impressions, clicks, ctr, cpc, leads_count, cost_per_lead, start_time, stop_time, last_synced_at",
  resultKey: "campaigns",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    status: text("status", "Status kampanii w Meta."),
    query: search(["name"], "Fraza w nazwie."),
  },
});

export const listMetaLeads = defineListTool({
  name: "list_meta_leads",
  title: "List Meta lead-form leads",
  description:
    "Leady z formularzy Meta (Lead Ads): dane kontaktowe, kampania, formularz, pola, powiązany wniosek, czas otrzymania. Tylko administrator/operator.",
  table: "meta_leads",
  columns:
    "id, meta_lead_id, full_name, email, phone, meta_campaign_id, meta_form_id, field_data, lead_application_id, received_at, created_at",
  resultKey: "leads",
  access: "team",
  order: { column: "received_at", ascending: false },
  filters: {
    meta_campaign_id: text("meta_campaign_id", "Id kampanii Meta."),
    query: search(["full_name", "email", "phone"], "Fraza: imię, e-mail, telefon."),
    since: since("received_at", "otrzymania"),
    until: since("received_at", "otrzymania"),
  },
});

export const listLandingLeads = defineListTool({
  name: "list_landing_leads",
  title: "List landing page leads",
  description:
    "Zgłoszenia z landing page'y (formularze): dane, źródło, UTM, pola własne — z tytułem i slugiem landinga. Tylko administrator/operator.",
  table: "landing_leads",
  columns: "id, landing_page_id, name, email, phone, source, utm, custom_fields, created_at",
  resultKey: "leads",
  access: "team",
  filters: {
    landing_page_id: uuid("landing_page_id", "Tylko z tego landinga."),
    query: search(["name", "email", "phone"], "Fraza: imię, e-mail, telefon."),
    since: since("created_at"),
  },
  attach: [
    {
      key: "landing_page_id",
      table: "landing_pages",
      columns: "id, title, slug",
      as: "landing_page",
    },
  ],
});

export const listTrackingLinks = defineTool({
  name: "list_tracking_links",
  title: "List tracking campaigns (UTM links)",
  description:
    "Kampanie śledzące (linki z UTM i kodem skróconym): cel, parametry UTM, koszt, aktywność oraz liczba kliknięć. Tylko administrator/operator.",
  inputSchema: {
    query: z.string().min(2).optional().describe("Fraza: nazwa, slug, utm_campaign."),
    active_only: z.boolean().default(false),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ query, active_only, limit }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      let q = s
        .from("marketing_campaigns")
        .select(
          "id, name, slug, short_code, target_url, utm_source, utm_medium, utm_campaign, utm_content, utm_term, is_active, cost, notes, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(clampLimit(limit, 50, 200));
      if (active_only) q = q.eq("is_active", true);
      if (query) {
        const v = query.replace(/[%_,()]/g, " ").trim();
        q = q.or(`name.ilike.%${v}%,slug.ilike.%${v}%,utm_campaign.ilike.%${v}%`);
      }
      const campaigns = await rowsOf<Record<string, any>>(q, "marketing_campaigns");
      const ids = campaigns.map((c) => c.id);
      const clicks = ids.length
        ? await rowsOf<{ campaign_id: string }>(
            s.from("campaign_clicks").select("campaign_id").in("campaign_id", ids).limit(20000),
            "campaign_clicks",
          )
        : [];
      const byCampaign = countBy(clicks, "campaign_id");
      return ok({
        campaigns: campaigns.map((c) => ({ ...c, clicks: byCampaign[c.id] ?? 0 })),
        clicks_sampled: clicks.length,
      });
    }),
});

export const listShortLinks = defineListTool({
  name: "list_short_links",
  title: "List short links",
  description:
    "Linki skrócone wysyłane klientom (SMS, mail): kod, cel, źródło, powiązany lead/klient/wniosek, liczba kliknięć, ostatnie kliknięcie, ważność. Tylko administrator/operator.",
  table: "short_links",
  columns:
    "id, code, target_url, source, lead_id, client_id, loan_application_id, click_count, last_clicked_at, expires_at, created_at",
  resultKey: "links",
  access: "team",
  filters: {
    source: text("source", "Źródło linku."),
    lead_id: uuid("lead_id", "Tylko dla tego leada."),
    loan_application_id: uuid("loan_application_id", "Tylko dla tego wniosku."),
    since: since("created_at"),
  },
});

export const listPrOpportunities = defineListTool({
  name: "list_pr_opportunities",
  title: "List PR opportunities",
  description:
    "Okazje PR znalezione przez monitoring mediów: źródło, temat, fragment, dopasowane frazy, termin, status, szkic odpowiedzi, adresat. Tylko administrator/operator.",
  table: "pr_opportunities",
  columns:
    "id, source, url, topic, snippet, matched_phrases, article_published_at, deadline, status, recipient_email, draft_subject, draft_generated_at, notes, created_at, updated_at",
  resultKey: "opportunities",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    status: text("status", "Status okazji."),
    query: search(["topic", "snippet", "source"], "Fraza: temat, treść, źródło."),
    since: since("created_at"),
  },
});

export const listGrowthActions = defineListTool({
  name: "list_growth_actions",
  title: "List growth engine actions",
  description:
    "Dziennik silnika wzrostu AI (SEO, linkbuilding, outreach, landing optimization…): moduł, akcja, status, podsumowanie, koszt, kto uruchomił. Tylko administrator/operator.",
  table: "ai_growth_action_log",
  columns: "id, module, action, status, summary, cost_pln, actor, created_at",
  resultKey: "actions",
  access: "team",
  filters: {
    module: text("module", "Moduł silnika wzrostu."),
    status: text("status", "Status akcji."),
    since: since("created_at"),
  },
});

export const getFunnelInsights = defineListTool({
  name: "get_funnel_insights",
  title: "Get funnel insights",
  description:
    "Ostatnie analizy lejka AI: okres, podsumowanie, wąskie gardła, rekomendacje, metryki (opcjonalnie dla konkretnego landinga). Tylko administrator/operator.",
  table: "ai_funnel_insights",
  columns:
    "id, landing_id, period_from, period_to, summary, bottlenecks, recommendations, metrics, created_at",
  resultKey: "insights",
  access: "team",
  defaultLimit: 3,
  maxLimit: 20,
  filters: {
    landing_id: uuid("landing_id", "Tylko dla tego landinga."),
  },
});

export const listSeoLocationPages = defineListTool({
  name: "list_seo_location_pages",
  title: "List SEO location pages",
  description:
    "Strony lokalizacyjne SEO (pożyczki pod nieruchomość w mieście X): slug, nazwa, TERYT, status, meta, kiedy wygenerowano i opublikowano. Tylko administrator/operator.",
  table: "seo_location_pages",
  columns:
    "id, slug, name, teryt, status, meta_title, meta_description, generated_at, published_at, updated_at",
  resultKey: "pages",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    status: text("status", "Status strony."),
    query: search(["name", "slug"], "Fraza: nazwa miejscowości lub slug."),
  },
});

export const listStudioJobs = defineListTool({
  name: "list_studio_jobs",
  title: "List studio video jobs",
  description:
    "Zadania studia wideo (awatar HeyGen + głos): status, tytuł publikacji, prompt, wideo, miniatura, platformy auto-publikacji, błąd. Tylko administrator/operator.",
  table: "studio_video_jobs",
  columns:
    "id, status, publish_title, publish_privacy, prompt, avatar_id, voice_id, captions, video_url, thumbnail_url, auto_publish_platforms, auto_published_at, last_error, created_at, updated_at",
  resultKey: "jobs",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    status: text("status", "Status zadania."),
  },
});

export const listYoutubeQueue = defineListTool({
  name: "list_youtube_queue",
  title: "List YouTube publish queue",
  description:
    "Kolejka publikacji na YouTube (shorts): tytuł, prywatność, termin, status, próby, błąd, id opublikowanego wideo. Tylko administrator/operator.",
  table: "youtube_publish_queue",
  columns:
    "id, title, privacy_status, scheduled_at, published_at, status, attempt_count, last_error, youtube_video_id, tags, created_at",
  resultKey: "queue",
  access: "team",
  order: { column: "scheduled_at", ascending: false },
  filters: {
    status: text("status", "Status wpisu w kolejce."),
  },
});

export const marketingTools = [
  listSeoArticles,
  addBlogTopic,
  listSerpKeywords,
  listEmailCampaigns,
  getEmailCampaign,
  listEmailSubscribers,
  listSocialPosts,
  listPublishQueue,
  listMetaCampaigns,
  listMetaLeads,
  listLandingLeads,
  listTrackingLinks,
  listShortLinks,
  listPrOpportunities,
  listGrowthActions,
  getFunnelInsights,
  listSeoLocationPages,
  listStudioJobs,
  listYoutubeQueue,
];
