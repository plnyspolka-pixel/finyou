// Silnik wzrostu przez MCP: SEO (plan tematów, artykuły z AI, pozycje w
// Google), landingi AI z A/B i lejkiem, outreach i link building,
// monitoring konkurencji, Microsoft Clarity, kreatory Google Ads i Meta Ads
// (szkice → publikacja), PR (szkice i wysyłka).
//
// Każde narzędzie woła TĘ SAMĄ funkcję co panel (moduły *.server.ts wyniesione
// z server functions), więc statusy, logi w ai_growth_action_log i błędy są
// identyczne. Schematy wejścia są współdzielone z panelem (*-schema.ts).
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  DESTRUCTIVE,
  SENDS,
  WRITE,
  WRITE_IDEMPOTENT,
  actorId,
  fail,
  handle,
  ok,
  oneOf,
  requireRolesAdmin,
  requireTeamAdmin,
} from "../_helpers";
import { defineListTool, flag, search, since, text, uuid } from "../_list-tool";
import * as seoSchema from "@/lib/ai-seo-schema";
import * as serpSchema from "@/lib/ai-serp-schema";
import * as growthSchema from "@/lib/ai-growth-schema";
import * as funnelSchema from "@/lib/ai-funnel-schema";
import * as outreachSchema from "@/lib/ai-outreach-schema";
import * as lbSchema from "@/lib/ai-linkbuilding-schema";
import * as competitorSchema from "@/lib/ai-competitor-schema";
import * as claritySchema from "@/lib/clarity-schema";
import * as googleAdsSchema from "@/lib/google-ads-schema";
import * as metaAdsSchema from "@/lib/meta-ads-creator-schema";
import * as prSchema from "@/lib/pr-schema";

const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;
/** Odczyt, który woła zewnętrzne API / AI (nic nie zapisuje). */
const READ_EXTERNAL = { readOnlyHint: true, idempotentHint: false, openWorldHint: true } as const;
/** Zapis z wywołaniem AI (zużywa kredyty). */
const WRITE_AI = { ...WRITE, openWorldHint: true } as const;

type Client = SupabaseClient<Database>;
type Annotations =
  | typeof READ
  | typeof READ_EXTERNAL
  | typeof WRITE
  | typeof WRITE_AI
  | typeof WRITE_IDEMPOTENT
  | typeof DESTRUCTIVE
  | typeof SENDS;

/**
 * Narzędzie delegujące do funkcji panelu: sprawdza rolę zespołu, przekazuje
 * klienta serwisowego i id użytkownika, zwraca wynik 1:1. `schema` daje
 * jednocześnie inputSchema i walidację — jedna definicja z panelem.
 */
function delegate(opts: {
  name: string;
  title: string;
  description: string;
  schema?: z.ZodObject<z.ZodRawShape>;
  annotations: Annotations;
  /** Domyślnie administrator/operator. */
  roles?: readonly string[];
  // `input: any`: każda funkcja panelu ma własny typ wejścia (z *-schema.ts),
  // a walidację robi tu `schema.parse` — ten sam schemat, co inputValidator.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  load: () => Promise<(client: Client, userId: string, input: any) => Promise<unknown>>;
  /** Ostatnie przekształcenie wyniku (np. dołożenie URL-i). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map?: (result: any, input: Record<string, unknown>) => unknown;
}) {
  const inputSchema: z.ZodRawShape = opts.schema?.shape ?? {};
  return defineTool({
    name: opts.name,
    title: opts.title,
    description: opts.description,
    inputSchema,
    annotations: opts.annotations,
    handler: (args: Record<string, unknown>, ctx: ToolContext) =>
      handle(async () => {
        const client = (opts.roles
          ? await requireRolesAdmin(ctx, opts.roles)
          : await requireTeamAdmin(ctx)) as unknown as Client;
        const input = opts.schema ? opts.schema.parse(args) : {};
        const fn = await opts.load();
        const result = await fn(client, actorId(ctx), input);
        return ok(opts.map ? opts.map(result, input) : (result ?? { ok: true }));
      }),
  });
}

const aiLandingUrl = (slug: string) => `https://financeyou.pl/embed/l/${slug}`;

// ── SEO: plan tematów, artykuły AI, status ───────────────────────────────────

export const planSeoTopics = delegate({
  name: "plan_seo_topics",
  title: "Plan SEO blog topics (AI)",
  description:
    "AI planuje `count` (3–20) tematów blogowych pod hasło / obszar `seed` (tytuł, słowo kluczowe, frazy dodatkowe, intencja, trudność, priorytet) i dodaje je do kolejki tematów SEO. Autopilot pisze z kolejki; jeden temat od ręki: `generate_seo_article`. Zużywa kredyty AI. Tylko administrator/operator.",
  schema: seoSchema.planSeoTopicsSchema,
  annotations: WRITE_AI,
  load: async () => (await import("@/lib/ai-seo-engine.server")).planSeoTopics,
});

export const generateSeoArticle = delegate({
  name: "generate_seo_article",
  title: "Generate SEO article from topic (AI)",
  description:
    "AI pisze pełny artykuł (800–1500 słów, markdown, FAQ, CTA do wniosku) z tematu z kolejki (`topicId` z `list_blog_topics`), nadaje unikalny slug i zapisuje jako szkic; `autoPublish=true` publikuje od razu na blogu. Zużywa kredyty AI. Tylko administrator/operator.",
  schema: seoSchema.generateSeoArticleSchema,
  annotations: WRITE_AI,
  load: async () => (await import("@/lib/ai-seo-engine.server")).generateSeoArticle,
  map: (r) => ({
    ...r,
    url: r?.article?.status === "published" ? `https://financeyou.pl/blog/${r.article.slug}` : null,
  }),
});

export const setSeoArticleStatus = delegate({
  name: "set_seo_article_status",
  title: "Set SEO article status",
  description:
    "Zmienia status artykułu bloga jak w panelu AI SEO: draft / published / archived (bez wymogu okładki — `update_seo_article` go wymaga). Publikacja jest publiczna od razu. Tylko administrator/operator.",
  schema: seoSchema.setArticleStatusSchema,
  annotations: WRITE_IDEMPOTENT,
  load: async () => (await import("@/lib/ai-seo-engine.server")).setArticleStatus,
});

export const deleteSeoArticle = delegate({
  name: "delete_seo_article",
  title: "Delete SEO article",
  description:
    "Usuwa artykuł bloga (także opublikowany — znika ze strony). Tylko administrator/operator.",
  schema: seoSchema.deleteSeoArticleSchema,
  annotations: DESTRUCTIVE,
  load: async () => (await import("@/lib/ai-seo-engine.server")).deleteSeoArticle,
});

// ── SERP: pozycje w Google ───────────────────────────────────────────────────

export const updateSerpKeyword = delegate({
  name: "update_serp_keyword",
  title: "Update tracked keyword",
  description:
    "Edytuje śledzoną frazę: treść, docelowy URL, aktywność, tagi, wolumen, trudność. Tylko administrator/operator.",
  schema: serpSchema.updateKeywordSchema,
  annotations: WRITE_IDEMPOTENT,
  load: async () => (await import("@/lib/ai-serp.server")).updateKeyword,
});

export const deleteSerpKeyword = delegate({
  name: "delete_serp_keyword",
  title: "Delete tracked keyword",
  description: "Usuwa frazę ze śledzenia razem z historią pozycji. Tylko administrator/operator.",
  schema: serpSchema.deleteKeywordSchema,
  annotations: DESTRUCTIVE,
  load: async () => (await import("@/lib/ai-serp.server")).deleteKeyword,
});

export const checkSerpRanking = delegate({
  name: "check_serp_ranking",
  title: "Check Google ranking for one keyword",
  description:
    "Sprawdza od ręki pozycję docelowej domeny w Google dla jednej frazy (`keyword_id` z `list_serp_keywords`), zapisuje pomiar z poprzednią pozycją i cechami SERP; zwraca też TOP 10 wyników. Tylko administrator/operator.",
  schema: serpSchema.checkKeywordRankingSchema,
  annotations: WRITE_AI,
  load: async () => (await import("@/lib/ai-serp.server")).checkKeywordRanking,
});

export const checkAllSerpRankings = delegate({
  name: "check_all_serp_rankings",
  title: "Check Google rankings for all active keywords",
  description:
    "Sprawdza pozycje wszystkich aktywnych fraz (jedna po drugiej, z odstępem) i zapisuje pomiary. Przy wielu frazach trwa minuty. Tylko administrator/operator.",
  annotations: WRITE_AI,
  load: async () => (await import("@/lib/ai-serp.server")).checkAllRankings,
});

export const listSerpRankings = defineListTool({
  name: "list_serp_rankings",
  title: "List ranking history",
  description:
    "Historia pomiarów pozycji (najnowsze pierwsze): fraza, pozycja, poprzednia, adres w wynikach, cechy SERP, czas. Filtr po `keyword_id`. Tylko administrator/operator.",
  table: "ai_serp_rankings",
  columns: "id, keyword_id, position, previous_position, url, serp_features, checked_at",
  resultKey: "rankings",
  access: "team",
  order: { column: "checked_at", ascending: false },
  filters: {
    keyword_id: uuid("keyword_id", "Tylko ta fraza."),
    since: since("checked_at", "pomiaru"),
  },
  attach: [
    {
      key: "keyword_id",
      table: "ai_serp_keywords",
      columns: "id, keyword, target_url",
      as: "keyword",
    },
  ],
});

// ── Landingi AI (silnik wzrostu) ─────────────────────────────────────────────

export const listAiLandings = defineListTool({
  name: "list_ai_landings",
  title: "List AI landings",
  description:
    "Landingi wygenerowane przez silnik wzrostu (/admin/ai-growth-engine): slug, tytuł, status (draft / published / archived), cel, grupa, słowa kluczowe, nagłówek, CTA. Publiczny adres: /embed/l/<slug>. Tylko administrator/operator.",
  table: "ai_landings",
  columns:
    "id, slug, title, status, goal, audience, keywords, hero_headline, cta_label, cta_url, source, published_at, created_at, updated_at",
  resultKey: "landings",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    status: text("status", "Status: draft / published / archived."),
    query: search(["title", "slug", "goal"], "Fraza: tytuł, slug, cel."),
  },
  map: (r) => ({ ...r, url: r.status === "published" ? aiLandingUrl(r.slug) : null }),
});

export const getAiLanding = defineTool({
  name: "get_ai_landing",
  title: "Get AI landing",
  description:
    "Pełna treść landingu AI (po id albo slugu): meta, hero, CTA, sekcje, brief, słowa kluczowe. Tylko administrator/operator.",
  inputSchema: { landing_id: z.string().uuid().optional(), slug: z.string().max(80).optional() },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      if (!a.landing_id && !a.slug) return fail("Podaj landing_id albo slug.");
      let q = s.from("ai_landings").select("*");
      q = a.landing_id ? q.eq("id", a.landing_id) : q.eq("slug", a.slug!);
      const row = await oneOf(q, "ai_landings");
      if (!row) return fail("Nie znaleziono landingu.");
      return ok({
        landing: { ...row, url: row.status === "published" ? aiLandingUrl(row.slug) : null },
      });
    }),
});

export const generateAiLanding = delegate({
  name: "generate_ai_landing",
  title: "Generate AI landing (growth engine)",
  description:
    "AI generuje kompletny landing (meta, hero, CTA, 3–8 sekcji: korzyści, jak to działa, dowód społeczny, FAQ, CTA) z celu kampanii, grupy docelowej, słów kluczowych i briefu; `ctaUrl` domyślnie z ustawień silnika. Zapisuje jako szkic; `autoPublish=true` publikuje pod /embed/l/<slug>. Zużywa kredyty AI. Tylko administrator/operator.",
  schema: growthSchema.generateAiLandingSchema,
  annotations: WRITE_AI,
  load: async () => (await import("@/lib/ai-growth.server")).generateAiLanding,
  map: (r) => ({
    ...r,
    url: r?.landing?.status === "published" ? aiLandingUrl(r.landing.slug) : null,
  }),
});

export const setAiLandingStatus = delegate({
  name: "set_ai_landing_status",
  title: "Publish / archive AI landing",
  description:
    "Zmienia status landingu AI: draft / published / archived (publikacja widoczna od razu). Tylko administrator/operator.",
  schema: growthSchema.setLandingStatusSchema,
  annotations: WRITE_IDEMPOTENT,
  load: async () => (await import("@/lib/ai-growth.server")).setLandingStatus,
});

export const deleteAiLanding = delegate({
  name: "delete_ai_landing",
  title: "Delete AI landing",
  description: "Usuwa landing AI razem z wariantami i zdarzeniami. Tylko administrator/operator.",
  schema: growthSchema.deleteLandingSchema,
  annotations: DESTRUCTIVE,
  load: async () => (await import("@/lib/ai-growth.server")).deleteLanding,
});

export const getGrowthSettings = defineTool({
  name: "get_growth_settings",
  title: "Get growth engine settings",
  description:
    "Ustawienia silnika wzrostu: tryb automatyzacji (off / manual_review / semi_auto / full_autopilot), dzienny budżet AI, marka i jej opis, grupa docelowa, główny URL CTA, domyślny model. Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const row = await oneOf(
        s.from("ai_growth_settings").select("*").limit(1),
        "ai_growth_settings",
      );
      return ok({ settings: row });
    }),
});

export const updateGrowthSettings = delegate({
  name: "update_growth_settings",
  title: "Update growth engine settings",
  description:
    "Zmienia ustawienia silnika wzrostu (tryb automatyzacji, budżet AI, marka, grupa docelowa, CTA, model). Tryb full_autopilot pozwala silnikowi publikować bez przeglądu. Tylko administrator/operator.",
  schema: growthSchema.updateGrowthSettingsSchema,
  annotations: WRITE_IDEMPOTENT,
  load: async () => (await import("@/lib/ai-growth.server")).updateGrowthSettings,
});

// ── Lejek ────────────────────────────────────────────────────────────────────

export const getFunnelStats = delegate({
  name: "get_funnel_stats",
  title: "Get funnel stats",
  description:
    "Statystyki lejka za N dni (opcjonalnie dla jednego landingu AI): kroki z konwersją i odpadem, źródła pierwszego kontaktu, urządzenia, sumy. Tylko administrator/operator.",
  schema: funnelSchema.getFunnelStatsSchema,
  annotations: READ,
  load: async () => (await import("@/lib/ai-funnel.server")).getFunnelStats,
});

export const generateFunnelInsights = delegate({
  name: "generate_funnel_insights",
  title: "Generate funnel insights (AI)",
  description:
    "AI analizuje lejek za N dni (wąskie gardła, rekomendacje) i zapisuje wynik (`get_funnel_insights` czyta zapisane). Zużywa kredyty AI. Tylko administrator/operator.",
  schema: funnelSchema.generateFunnelInsightsSchema,
  annotations: WRITE_AI,
  load: async () => (await import("@/lib/ai-funnel.server")).generateFunnelInsights,
});

// ── Outreach ─────────────────────────────────────────────────────────────────

export const listOutreachTargets = defineListTool({
  name: "list_outreach_targets",
  title: "List outreach targets",
  description:
    "Cele outreachu (portale, blogi, partnerzy): domena, kontakt, nisza, priorytet, status (new / queued / contacted / responded / won / rejected / blacklist), źródło, notatki. Tylko administrator/operator.",
  table: "ai_outreach_targets",
  columns:
    "id, domain, url, contact_name, contact_email, niche, priority, status, source, notes, created_at, updated_at",
  resultKey: "targets",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    status: text("status", "Status celu."),
    niche: text("niche", "Nisza."),
    query: search(["domain", "contact_name", "contact_email", "niche"], "Fraza."),
  },
});

export const listOutreachMessages = defineListTool({
  name: "list_outreach_messages",
  title: "List outreach messages",
  description:
    "Wiadomości outreachu (sekwencje kroków 1–5): temat, treść, status (draft / approved / sent / replied / bounced), cel, kąt, wysłano, fragment odpowiedzi. Filtr po `target_id`. Tylko administrator/operator.",
  table: "ai_outreach_messages",
  columns:
    "id, target_id, step, parent_id, subject, body, status, goal, angle, sent_at, reply_excerpt, created_at, updated_at",
  resultKey: "messages",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    target_id: uuid("target_id", "Tylko ten cel."),
    status: text("status", "Status wiadomości."),
  },
  attach: [
    {
      key: "target_id",
      table: "ai_outreach_targets",
      columns: "id, domain, contact_email",
      as: "target",
    },
  ],
});

export const discoverOutreachTargets = delegate({
  name: "discover_outreach_targets",
  title: "Discover outreach targets (AI)",
  description:
    "AI proponuje do `count` (1–20) celów outreachu w niszy (domena, kontakt, uzasadnienie) i dodaje je jako cele ze źródłem ai_discovery. Zużywa kredyty AI. Tylko administrator/operator.",
  schema: outreachSchema.discoverOutreachTargetsSchema,
  annotations: WRITE_AI,
  load: async () => (await import("@/lib/ai-outreach.server")).discoverOutreachTargets,
});

export const addOutreachTarget = delegate({
  name: "add_outreach_target",
  title: "Add outreach target",
  description:
    "Dodaje cel outreachu ręcznie: domena, URL, kontakt, nisza, priorytet, notatki. Tylko administrator/operator.",
  schema: outreachSchema.addOutreachTargetSchema,
  annotations: WRITE,
  load: async () => (await import("@/lib/ai-outreach.server")).addOutreachTarget,
});

export const updateOutreachTarget = delegate({
  name: "update_outreach_target",
  title: "Update outreach target",
  description:
    "Edytuje cel outreachu: kontakt, nisza, priorytet, status (new / queued / contacted / responded / won / rejected / blacklist), notatki. Tylko administrator/operator.",
  schema: outreachSchema.updateOutreachTargetSchema,
  annotations: WRITE_IDEMPOTENT,
  load: async () => (await import("@/lib/ai-outreach.server")).updateOutreachTarget,
});

export const deleteOutreachTarget = delegate({
  name: "delete_outreach_target",
  title: "Delete outreach target",
  description: "Usuwa cel outreachu razem z wiadomościami. Tylko administrator/operator.",
  schema: outreachSchema.deleteOutreachTargetSchema,
  annotations: DESTRUCTIVE,
  load: async () => (await import("@/lib/ai-outreach.server")).deleteOutreachTarget,
});

export const generateOutreachMessage = delegate({
  name: "generate_outreach_message",
  title: "Generate outreach message (AI)",
  description:
    "AI pisze wiadomość outreachu do celu (`target_id`): cel rozmowy, kąt, krok sekwencji 1–5 (`parent_id` = poprzednia wiadomość przy follow-upie). Zapisuje jako szkic — nic nie wysyła; treść kopiuje się do własnej skrzynki, a `update_outreach_message` z `mark_sent` odnotowuje wysyłkę. Zużywa kredyty AI. Tylko administrator/operator.",
  schema: outreachSchema.generateOutreachMessageSchema,
  annotations: WRITE_AI,
  load: async () => (await import("@/lib/ai-outreach.server")).generateOutreachMessage,
});

export const updateOutreachMessage = delegate({
  name: "update_outreach_message",
  title: "Update outreach message",
  description:
    "Edytuje wiadomość outreachu (temat, treść, status), `mark_sent=true` odnotowuje wysyłkę (cel → contacted), `reply_excerpt` + status replied zapisuje odpowiedź. Tylko administrator/operator.",
  schema: outreachSchema.updateOutreachMessageSchema,
  annotations: WRITE_IDEMPOTENT,
  load: async () => (await import("@/lib/ai-outreach.server")).updateOutreachMessage,
});

export const deleteOutreachMessage = delegate({
  name: "delete_outreach_message",
  title: "Delete outreach message",
  description: "Usuwa wiadomość outreachu. Tylko administrator/operator.",
  schema: outreachSchema.deleteOutreachMessageSchema,
  annotations: DESTRUCTIVE,
  load: async () => (await import("@/lib/ai-outreach.server")).deleteOutreachMessage,
});

// ── Link building ────────────────────────────────────────────────────────────

export const listBacklinks = defineListTool({
  name: "list_backlinks",
  title: "List backlinks",
  description:
    "Backlinki: strona źródłowa, domena, cel, anchor, typ (editorial / guest_post / directory / forum / comment / partnership / other), dofollow, DA, status (live / lost / pending / rejected), ostatnie sprawdzenie. Tylko administrator/operator.",
  table: "ai_backlinks",
  columns:
    "id, source_url, source_domain, target_url, anchor_text, link_type, dofollow, domain_authority, status, outreach_target_id, first_seen_at, last_checked_at, notes, created_at",
  resultKey: "backlinks",
  access: "team",
  order: { column: "created_at", ascending: false },
  filters: {
    status: text("status", "Status linku."),
    link_type: text("link_type", "Typ linku."),
    dofollow: flag("dofollow", "Tylko dofollow / nofollow."),
    query: search(["source_domain", "source_url", "target_url", "anchor_text"], "Fraza."),
  },
});

export const addBacklink = delegate({
  name: "add_backlink",
  title: "Add backlink",
  description:
    "Rejestruje backlink (źródło, cel, anchor, typ, dofollow, DA, notatki, powiązany cel outreachu) ze statusem live. Tylko administrator/operator.",
  schema: lbSchema.addBacklinkSchema,
  annotations: WRITE,
  load: async () => (await import("@/lib/ai-linkbuilding.server")).addBacklink,
});

export const updateBacklink = delegate({
  name: "update_backlink",
  title: "Update backlink",
  description:
    "Edytuje backlink: status, dofollow, DA, notatki, data sprawdzenia. Tylko administrator/operator.",
  schema: lbSchema.updateBacklinkSchema,
  annotations: WRITE_IDEMPOTENT,
  load: async () => (await import("@/lib/ai-linkbuilding.server")).updateBacklink,
});

export const deleteBacklink = delegate({
  name: "delete_backlink",
  title: "Delete backlink",
  description: "Usuwa backlink z rejestru. Tylko administrator/operator.",
  schema: lbSchema.deleteBacklinkSchema,
  annotations: DESTRUCTIVE,
  load: async () => (await import("@/lib/ai-linkbuilding.server")).deleteBacklink,
});

export const listLinkbuildingSuggestions = defineListTool({
  name: "list_linkbuilding_suggestions",
  title: "List link building suggestions",
  description:
    "Propozycje AI miejsc na linki: domena, wskazówka kontaktu, strategia, uzasadnienie, priorytet 1–5, oczekiwane DA, status (new / in_progress / won / rejected / archived). Tylko administrator/operator.",
  table: "ai_linkbuilding_suggestions",
  columns:
    "id, target_domain, contact_hint, strategy, rationale, priority, expected_da, status, created_at, updated_at",
  resultKey: "suggestions",
  access: "team",
  order: { column: "priority", ascending: true },
  filters: {
    status: text("status", "Status propozycji."),
    query: search(["target_domain", "strategy", "rationale"], "Fraza."),
  },
});

export const generateLinkbuildingSuggestions = delegate({
  name: "generate_linkbuilding_suggestions",
  title: "Generate link building suggestions (AI)",
  description:
    "AI proponuje miejsca na linki w niszy (domeny, strategia, uzasadnienie, priorytet) i zapisuje je jako propozycje; `promote_suggestion_to_outreach` robi z propozycji cel outreachu. Zużywa kredyty AI. Tylko administrator/operator.",
  schema: lbSchema.generateLinkBuildingSuggestionsSchema,
  annotations: WRITE_AI,
  load: async () => (await import("@/lib/ai-linkbuilding.server")).generateLinkBuildingSuggestions,
});

export const updateLinkbuildingSuggestion = delegate({
  name: "update_linkbuilding_suggestion",
  title: "Update link building suggestion",
  description:
    "Zmienia status (new / in_progress / won / rejected / archived) albo priorytet propozycji. Tylko administrator/operator.",
  schema: lbSchema.updateLbSuggestionSchema,
  annotations: WRITE_IDEMPOTENT,
  load: async () => (await import("@/lib/ai-linkbuilding.server")).updateLbSuggestion,
});

export const promoteSuggestionToOutreach = delegate({
  name: "promote_suggestion_to_outreach",
  title: "Promote suggestion to outreach target",
  description:
    "Zamienia propozycję link buildingu w cel outreachu (propozycja → in_progress). Tylko administrator/operator.",
  schema: lbSchema.promoteSuggestionToOutreachSchema,
  annotations: WRITE,
  load: async () => (await import("@/lib/ai-linkbuilding.server")).promoteSuggestionToOutreach,
});

// ── Konkurencja ──────────────────────────────────────────────────────────────

export const listCompetitors = defineListTool({
  name: "list_competitors",
  title: "List monitored competitors",
  description:
    "Monitorowani konkurenci: nazwa, domena, śledzone URL-e, tagi, aktywność, ostatnie sprawdzenie. Tylko administrator/operator.",
  table: "ai_competitors",
  columns:
    "id, name, domain, urls, tags, notes, is_active, last_checked_at, created_at, updated_at",
  resultKey: "competitors",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    is_active: flag("is_active", "Tylko aktywni / nieaktywni."),
    query: search(["name", "domain"], "Fraza: nazwa lub domena."),
  },
});

export const listCompetitorSnapshots = defineListTool({
  name: "list_competitor_snapshots",
  title: "List competitor snapshots (change feed)",
  description:
    "Zrzuty stron konkurencji z każdego skanu: URL, tytuł, opis, czy treść się zmieniła, streszczenie zmiany i analiza AI. `changed=true` daje sam feed zmian. Tylko administrator/operator.",
  table: "ai_competitor_snapshots",
  columns:
    "id, competitor_id, url, title, description, changed, change_summary, ai_analysis, checked_at",
  resultKey: "snapshots",
  access: "team",
  order: { column: "checked_at", ascending: false },
  filters: {
    competitor_id: uuid("competitor_id", "Tylko ten konkurent."),
    changed: flag("changed", "Tylko zrzuty ze zmianą."),
    since: since("checked_at", "skanu"),
  },
  attach: [
    {
      key: "competitor_id",
      table: "ai_competitors",
      columns: "id, name, domain",
      as: "competitor",
    },
  ],
});

export const addCompetitor = delegate({
  name: "add_competitor",
  title: "Add competitor to monitoring",
  description:
    "Dodaje konkurenta: nazwa, domena, 1–20 URL-i do śledzenia, notatki, tagi. Tylko administrator/operator.",
  schema: competitorSchema.addCompetitorSchema,
  annotations: WRITE,
  load: async () => (await import("@/lib/ai-competitor.server")).addCompetitor,
});

export const updateCompetitor = delegate({
  name: "update_competitor",
  title: "Update competitor",
  description:
    "Edytuje konkurenta: nazwa, URL-e, notatki, tagi, aktywność. Tylko administrator/operator.",
  schema: competitorSchema.updateCompetitorSchema,
  annotations: WRITE_IDEMPOTENT,
  load: async () => (await import("@/lib/ai-competitor.server")).updateCompetitor,
});

export const deleteCompetitor = delegate({
  name: "delete_competitor",
  title: "Delete competitor",
  description: "Usuwa konkurenta razem z historią zrzutów. Tylko administrator/operator.",
  schema: competitorSchema.deleteCompetitorSchema,
  annotations: DESTRUCTIVE,
  load: async () => (await import("@/lib/ai-competitor.server")).deleteCompetitor,
});

export const scanCompetitor = delegate({
  name: "scan_competitor",
  title: "Scan competitor now",
  description:
    "Pobiera śledzone strony konkurenta, porównuje z poprzednim zrzutem i przy zmianie prosi AI o streszczenie i analizę; zapisuje zrzuty. Zużywa kredyty AI przy zmianach. Tylko administrator/operator.",
  schema: competitorSchema.scanCompetitorSchema,
  annotations: WRITE_AI,
  load: async () => (await import("@/lib/ai-competitor.server")).scanCompetitor,
});

// ── Microsoft Clarity ────────────────────────────────────────────────────────

export const getClarityMetrics = delegate({
  name: "get_clarity_metrics",
  title: "Get Microsoft Clarity metrics",
  description:
    "Metryki Clarity z ostatnich 1–3 dni (URL / urządzenie / źródło, medium, kraj / przeglądarka / system): sesje, rage clicks, dead clicks, scroll depth. Limit Clarity: 10 wywołań eksportu dziennie (każde tu zużywa 3). Wymaga CLARITY_API_TOKEN. Tylko administrator/operator.",
  schema: claritySchema.fetchClarityMetricsSchema,
  annotations: READ_EXTERNAL,
  load: async () => (await import("@/lib/clarity.server")).fetchClarityMetrics,
});

export const analyzeClarityMetrics = delegate({
  name: "analyze_clarity_metrics",
  title: "Analyze Clarity metrics (AI)",
  description:
    "AI analizuje przekazane metryki Clarity (z `get_clarity_metrics`) i odpowiada na pytanie — domyślnie TOP 5 problemów UX z rekomendacjami. Nic nie zapisuje. Tylko administrator/operator.",
  schema: claritySchema.analyzeClarityMetricsSchema,
  annotations: READ_EXTERNAL,
  load: async () => (await import("@/lib/clarity.server")).analyzeClarityMetrics,
});

// ── Google Ads (kreator szkiców + eksport CSV) ───────────────────────────────

export const listGoogleAdDrafts = defineListTool({
  name: "list_google_ad_drafts",
  title: "List Google Ads drafts",
  description:
    "Szkice kampanii Google Ads z kreatora: nazwa, typ (SEARCH / DISPLAY), budżet dzienny, status, URL docelowy, lokalizacje, języki, liczba nagłówków i słów. Google Ads nie ma integracji API — wynik to plik CSV do Google Ads Editor (`export_google_ad_csv`). Tylko administrator/operator.",
  table: "google_ad_drafts",
  columns:
    "id, name, campaign_type, daily_budget_pln, status, final_url, keywords, negative_keywords, headlines, descriptions, target_locations, target_languages, notes, published_at, publish_error, created_at, updated_at",
  resultKey: "drafts",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    status: text("status", "Status szkicu."),
    query: search(["name", "final_url"], "Fraza."),
  },
});

export const saveGoogleAdDraft = delegate({
  name: "save_google_ad_draft",
  title: "Create / update Google Ads draft",
  description:
    "Tworzy (bez `id`) albo aktualizuje szkic kampanii Google Ads: nazwa, typ SEARCH / DISPLAY, budżet dzienny PLN, słowa kluczowe i wykluczające, 3–15 nagłówków (≤30 znaków), 2–4 opisy (≤90), URL docelowy, ścieżki wyświetlane, lokalizacje, języki, notatki. Tylko administrator/operator.",
  schema: googleAdsSchema.saveGoogleAdDraftSchema,
  annotations: WRITE_IDEMPOTENT,
  load: async () => (await import("@/lib/google-ads.server")).saveGoogleAdDraft,
});

export const getGoogleAdDraft = delegate({
  name: "get_google_ad_draft",
  title: "Get Google Ads draft",
  description: "Pełny szkic kampanii Google Ads. Tylko administrator/operator.",
  schema: googleAdsSchema.getGoogleAdDraftSchema,
  annotations: READ,
  load: async () => (await import("@/lib/google-ads.server")).getGoogleAdDraft,
});

export const deleteGoogleAdDraft = delegate({
  name: "delete_google_ad_draft",
  title: "Delete Google Ads draft",
  description: "Usuwa szkic kampanii Google Ads. Tylko administrator/operator.",
  schema: googleAdsSchema.deleteGoogleAdDraftSchema,
  annotations: DESTRUCTIVE,
  load: async () => (await import("@/lib/google-ads.server")).deleteGoogleAdDraft,
});

export const exportGoogleAdCsv = delegate({
  name: "export_google_ad_csv",
  title: "Export Google Ads draft to CSV",
  description:
    "Generuje plik CSV kampanii do importu w Google Ads Editor (zwraca treść i nazwę pliku) i oznacza szkic jako eksportowany. Tylko administrator/operator.",
  schema: googleAdsSchema.exportGoogleAdCsvSchema,
  annotations: WRITE_IDEMPOTENT,
  load: async () => (await import("@/lib/google-ads.server")).exportGoogleAdCsv,
});

// ── Meta Ads (kreator kampanii → publikacja przez Graph API) ─────────────────

export const listMetaAdDrafts = defineListTool({
  name: "list_meta_ad_drafts",
  title: "List Meta Ads drafts",
  description:
    "Szkice kampanii Meta Ads z kreatora (/admin/fb-ads/kreator): nazwa, konto, strona, budżet dzienny, status (szkic / opublikowana / blad), terminy, id obiektów po publikacji, błąd. Pełne targetowanie i kreację daje `get_meta_ad_draft`. Tylko administrator/operator.",
  table: "meta_ad_drafts",
  columns:
    "id, name, status, ad_account_id, page_id, page_name, objective, daily_budget, start_time, end_time, meta_campaign_id, meta_adset_id, meta_ad_id, meta_form_id, published_at, error_message, created_at, updated_at",
  resultKey: "drafts",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    status: text("status", "Status szkicu."),
    query: search(["name", "page_name"], "Fraza."),
  },
});

export const getMetaAdDraft = delegate({
  name: "get_meta_ad_draft",
  title: "Get Meta Ads draft",
  description:
    "Pełny szkic kampanii Meta Ads: targetowanie, kreacja, formularz leadów, terminy, wynik publikacji. Tylko administrator/operator.",
  schema: metaAdsSchema.getAdDraftSchema,
  annotations: READ,
  load: async () => (await import("@/lib/meta-ads-creator.server")).getAdDraft,
});

export const saveMetaAdDraft = delegate({
  name: "save_meta_ad_draft",
  title: "Create / update Meta Ads draft",
  description:
    "Tworzy (bez `id`) albo aktualizuje szkic kampanii Meta Ads: nazwa, konto reklamowe (uuid z `list_meta_ad_accounts` / panelu), strona FB (`list_facebook_pages`), budżet dzienny (≥5), terminy, `targeting` (geo_locations, cities, age_min/max, genders, interests[], umiejscowienia, poszerzanie_grupy, remarketing…), `creative` (headline, primary_text, description, image_url, cta_type, cel: formularz_fb | strona_www, landing_url, pixel_id, wlacz_od_razu), `lead_form` (name, questions, privacy_policy, thank_you_page). Nic nie publikuje. Tylko administrator/operator.",
  schema: metaAdsSchema.saveAdDraftSchema,
  annotations: WRITE_IDEMPOTENT,
  load: async () => (await import("@/lib/meta-ads-creator.server")).saveAdDraft,
});

export const deleteMetaAdDraft = delegate({
  name: "delete_meta_ad_draft",
  title: "Delete Meta Ads draft",
  description:
    "Usuwa szkic kampanii Meta Ads (nie usuwa kampanii już utworzonej w Meta). Tylko administrator/operator.",
  schema: metaAdsSchema.deleteAdDraftSchema,
  annotations: DESTRUCTIVE,
  load: async () => (await import("@/lib/meta-ads-creator.server")).deleteAdDraft,
});

export const publishMetaAdDraft = delegate({
  name: "publish_meta_ad_draft",
  title: "Publish Meta Ads draft to Meta",
  description:
    "Tworzy w Meta kampanię → zestaw reklam → (formularz leadów) → kreację → reklamę ze szkicu; kampania zostaje WSTRZYMANA, chyba że kreacja ma `wlacz_od_razu`. To realna kampania z budżetem — pokaż użytkownikowi szkic i poczekaj na potwierdzenie. Wynik i błędy zapisują się w szkicu. Tylko administrator/operator.",
  schema: metaAdsSchema.publishAdDraftSchema,
  annotations: SENDS,
  load: async () => (await import("@/lib/meta-ads-creator.server")).publishAdDraft,
});

export const listFacebookPages = delegate({
  name: "list_facebook_pages",
  title: "List Facebook pages of the ad account user",
  description:
    "Strony FB dostępne dla tokena reklamowego (id, nazwa) — do `page_id` szkicu. Tylko administrator/operator.",
  annotations: READ_EXTERNAL,
  load: async () => (await import("@/lib/meta-ads-creator.server")).listFbPages,
});

export const searchMetaTargeting = delegate({
  name: "search_meta_targeting",
  title: "Search Meta targeting (locations / interests)",
  description:
    "Szuka w Meta lokalizacji (`adgeolocation`) albo zainteresowań (`adinterest`) po frazie — wyniki do `targeting` szkicu. Tylko administrator/operator.",
  schema: metaAdsSchema.searchTargetingSchema,
  annotations: READ_EXTERNAL,
  load: async () => (await import("@/lib/meta-ads-creator.server")).searchTargeting,
});

export const suggestMetaTargeting = delegate({
  name: "suggest_meta_targeting",
  title: "Suggest Meta targeting presets",
  description:
    "Gotowe zestawy targetowania Finance You (np. Lublin 100 km, „buduje się”) do wstawienia w szkic. Tylko administrator/operator.",
  schema: metaAdsSchema.suggestTargetingSchema,
  annotations: READ,
  load: async () => (await import("@/lib/meta-ads-creator.server")).suggestTargeting,
});

export const listMetaPixels = delegate({
  name: "list_meta_pixels",
  title: "List Meta pixels of an ad account",
  description:
    "Piksele konta reklamowego (`ad_account_id` = uuid z bazy) — do `creative.pixel_id`. Tylko administrator/operator.",
  schema: metaAdsSchema.listAdPixelsSchema,
  annotations: READ_EXTERNAL,
  load: async () => (await import("@/lib/meta-ads-creator.server")).listAdPixels,
});

export const createMetaPixel = delegate({
  name: "create_meta_pixel",
  title: "Create Meta pixel",
  description: "Tworzy nowy piksel na koncie reklamowym Meta. Tylko administrator/operator.",
  schema: metaAdsSchema.createAdPixelSchema,
  annotations: WRITE,
  load: async () => (await import("@/lib/meta-ads-creator.server")).createAdPixel,
});

// ── PR ───────────────────────────────────────────────────────────────────────

export const listPrOutreachLog = delegate({
  name: "list_pr_outreach_log",
  title: "List PR outreach log",
  description:
    "Dziennik wysłanych pitchy PR: adresat, temat, status, wysłano / dostarczono / otwarto / kliknięto / odpowiedziano, błąd. Tylko administrator/operator.",
  annotations: READ,
  load: async () => (await import("@/lib/pr/panel.server")).listPrOutreachLog,
});

export const generatePrDraft = delegate({
  name: "generate_pr_draft",
  title: "Generate PR pitch draft (AI)",
  description:
    "AI pisze szkic odpowiedzi (temat + treść) na okazję PR z monitoringu mediów i zapisuje go w okazji (`list_pr_opportunities`). Nic nie wysyła. Zużywa kredyty AI. Tylko administrator/operator.",
  schema: prSchema.generatePrOpportunityDraftSchema,
  annotations: WRITE_AI,
  load: async () => (await import("@/lib/pr/panel.server")).generatePrOpportunityDraft,
});

export const sendPrOutreach = delegate({
  name: "send_pr_outreach",
  title: "Send PR pitch",
  description:
    "Wysyła zatwierdzony szkic pitcha PR mailem do adresata okazji (status → sent, wpis w dzienniku). Realny mail do dziennikarza — moduł PR zakłada, że wysyłkę zawsze zatwierdza człowiek: pokaż temat, treść i adresata, poczekaj na wyraźne „wyślij”. Tylko administrator.",
  schema: prSchema.sendPrOutreachSchema,
  annotations: SENDS,
  roles: ["administrator"],
  load: async () => (await import("@/lib/pr/panel.server")).sendPrOutreach,
});

export const marketingGrowthTools = [
  planSeoTopics,
  generateSeoArticle,
  setSeoArticleStatus,
  deleteSeoArticle,
  updateSerpKeyword,
  deleteSerpKeyword,
  checkSerpRanking,
  checkAllSerpRankings,
  listSerpRankings,
  listAiLandings,
  getAiLanding,
  generateAiLanding,
  setAiLandingStatus,
  deleteAiLanding,
  getGrowthSettings,
  updateGrowthSettings,
  getFunnelStats,
  generateFunnelInsights,
  listOutreachTargets,
  listOutreachMessages,
  discoverOutreachTargets,
  addOutreachTarget,
  updateOutreachTarget,
  deleteOutreachTarget,
  generateOutreachMessage,
  updateOutreachMessage,
  deleteOutreachMessage,
  listBacklinks,
  addBacklink,
  updateBacklink,
  deleteBacklink,
  listLinkbuildingSuggestions,
  generateLinkbuildingSuggestions,
  updateLinkbuildingSuggestion,
  promoteSuggestionToOutreach,
  listCompetitors,
  listCompetitorSnapshots,
  addCompetitor,
  updateCompetitor,
  deleteCompetitor,
  scanCompetitor,
  getClarityMetrics,
  analyzeClarityMetrics,
  listGoogleAdDrafts,
  saveGoogleAdDraft,
  getGoogleAdDraft,
  deleteGoogleAdDraft,
  exportGoogleAdCsv,
  listMetaAdDrafts,
  getMetaAdDraft,
  saveMetaAdDraft,
  deleteMetaAdDraft,
  publishMetaAdDraft,
  listFacebookPages,
  searchMetaTargeting,
  suggestMetaTargeting,
  listMetaPixels,
  createMetaPixel,
  listPrOutreachLog,
  generatePrDraft,
  sendPrOutreach,
];
