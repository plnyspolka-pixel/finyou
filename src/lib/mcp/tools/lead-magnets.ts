// Lead magnety przez MCP: materiał za e-mail (/pobierz/<slug>) dla klienta
// pożyczkowego albo inwestora + automat odpowiedzi na komentarze pod postami
// FB / IG / YouTube. Logika wspólna z panelem: src/lib/lead-magnets/*.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  DESTRUCTIVE,
  SENDS,
  WRITE,
  WRITE_IDEMPOTENT,
  actorId,
  fail,
  handle,
  insertOne,
  ok,
  oneOf,
  requireTeamAdmin,
  rowsOf,
  updateOne,
} from "../_helpers";
import { defineListTool, enumOf, flag, search, uuid } from "../_list-tool";
import {
  leadMagnetBaseSchema,
  leadMagnetCrossChecks,
  leadMagnetPostSchema,
  leadMagnetRowFromInput,
  leadMagnetSchema,
} from "@/lib/lead-magnets/schema";
import {
  LEAD_MAGNET_AUDIENCES,
  LEAD_MAGNET_PLATFORMS,
  leadMagnetUrl,
  suggestedCaption,
} from "@/lib/lead-magnets/core";

const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;

const withUrl = (r: Record<string, any>) => ({
  ...r,
  url: r.published ? leadMagnetUrl(r.slug) : null,
  conversion_rate:
    r.view_count > 0 ? Math.round(((r.signup_count ?? 0) / r.view_count) * 1000) / 10 : null,
});

export const listLeadMagnets = defineListTool({
  name: "list_lead_magnets",
  title: "List lead magnets",
  description:
    "Lead magnety (materiał do pobrania za e-mail — osobno dla klienta pożyczkowego i inwestora) z licznikami: odsłony strony /pobierz/<slug>, zapisy, pobrania, komentarze z hasłem. Pełną treść i powiązane posty daje `get_lead_magnet`. Tylko administrator/operator.",
  table: "lead_magnets",
  columns:
    "id, slug, title, audience, published, trigger_keywords, match_any_post, file_name, file_url, view_count, signup_count, download_count, trigger_count, created_at, updated_at",
  resultKey: "lead_magnets",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    query: search(["title", "slug", "headline"], "Fraza w tytule, slugu lub nagłówku."),
    audience: enumOf("audience", LEAD_MAGNET_AUDIENCES, "Grupa: klient albo inwestor."),
    published: flag("published", "Tylko opublikowane (true) albo szkice (false)."),
  },
  map: withUrl,
});

export const getLeadMagnet = defineTool({
  name: "get_lead_magnet",
  title: "Get lead magnet",
  description:
    "Pełna treść lead magnetu (po id albo slugu): strona (nagłówki, korzyści, CTA, okładka), plik, mail, hasła i szablony odpowiedzi, powiązane posty, liczniki. Tylko administrator/operator.",
  inputSchema: {
    lead_magnet_id: z.string().uuid().optional(),
    slug: z.string().max(80).optional(),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      if (!a.lead_magnet_id && !a.slug) return fail("Podaj lead_magnet_id albo slug.");
      let q = s.from("lead_magnets").select("*");
      q = a.lead_magnet_id ? q.eq("id", a.lead_magnet_id) : q.eq("slug", a.slug!);
      const row = await oneOf(q, "lead_magnets");
      if (!row) return fail("Nie znaleziono lead magnetu.");
      const posts = await rowsOf(
        s
          .from("lead_magnet_posts")
          .select("id, platform, external_post_id, label, post_url, linked_at")
          .eq("lead_magnet_id", row.id)
          .order("linked_at", { ascending: false }),
        "lead_magnet_posts",
      );
      return ok({ lead_magnet: withUrl(row), posts });
    }),
});

const createBody = leadMagnetBaseSchema.omit({ id: true });

export const createLeadMagnet = defineTool({
  name: "create_lead_magnet",
  title: "Create lead magnet",
  description:
    "Tworzy lead magnet (ten sam schemat co panel): slug, tytuł, `audience` (klient / inwestor), nagłówki, `benefits` (co jest w środku), CTA, okładka, plik (`file_path` w buckecie lead-magnets — wgrany w panelu) albo `file_url`, mail z linkiem ({imie}, {tytul}, {link}, {strona}), hasła `trigger_keywords` (np. PRZEWODNIK), `match_any_post`, szablony odpowiedzi ({imie}, {tytul}, {link}), `posts` (powiązane posty FB / IG / YouTube), `published`. Treść z briefu podpowie `generate_lead_magnet_copy`. Strona: /pobierz/<slug>. Tylko administrator/operator.",
  inputSchema: createBody.shape,
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const input = leadMagnetSchema.parse(a);
      const row = await insertOne(
        s,
        "lead_magnets",
        { ...leadMagnetRowFromInput(input), created_by: actorId(ctx) },
        "id, slug, title, audience, published, created_at",
      );
      for (const p of input.posts) {
        const { error } = await s.from("lead_magnet_posts").insert({
          lead_magnet_id: row.id,
          platform: p.platform,
          external_post_id: p.external_post_id,
          label: p.label ?? null,
          post_url: p.post_url || null,
        });
        if (error) {
          return fail(
            error.code === "23505"
              ? `Lead magnet utworzony (${row.id}), ale post ${p.external_post_id} jest już powiązany z innym lead magnetem.`
              : error.message,
          );
        }
      }
      return ok({ ok: true, lead_magnet: withUrl(row), posts_linked: input.posts.length });
    }),
});

const updateBody = leadMagnetBaseSchema.omit({ id: true, posts: true }).partial();

export const updateLeadMagnet = defineTool({
  name: "update_lead_magnet",
  title: "Update lead magnet",
  description:
    "Edytuje dowolne pola lead magnetu (te same co przy tworzeniu, bez `posts` — do postów służą `link_lead_magnet_post` / `unlink_lead_magnet_post`) i/lub publikuje / zdejmuje (`published`). Publikacja wymaga pliku albo adresu materiału. Tylko administrator/operator.",
  inputSchema: { lead_magnet_id: z.string().uuid(), ...updateBody.shape },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { lead_magnet_id, ...rest } = a;
      const provided = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined),
      ) as Record<string, unknown>;
      if (Object.keys(provided).length === 0) return fail("Brak pól do zmiany.");
      const current = await oneOf(
        s.from("lead_magnets").select("*").eq("id", lead_magnet_id),
        "lead_magnets",
      );
      if (!current) return fail("Nie znaleziono lead magnetu.");
      const parsed = updateBody.parse(provided);
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v === undefined) continue;
        patch[k] = typeof v === "string" && v === "" ? null : v;
      }
      const merged = { ...current, ...patch } as Record<string, any>;
      const problem = leadMagnetCrossChecks({
        match_any_post: Boolean(merged.match_any_post),
        trigger_keywords: (merged.trigger_keywords ?? []) as string[],
        published: Boolean(merged.published),
        file_path: merged.file_path,
        file_url: merged.file_url,
        reply_private_template: String(merged.reply_private_template ?? ""),
        reply_fallback_template: String(merged.reply_fallback_template ?? ""),
        email_body: String(merged.email_body ?? ""),
      });
      if (problem) return fail(problem);
      const row = await updateOne(
        s,
        "lead_magnets",
        lead_magnet_id,
        patch,
        "id, slug, title, audience, published, updated_at",
      );
      return ok({ ok: true, lead_magnet: withUrl(row), changed: Object.keys(patch) });
    }),
});

export const deleteLeadMagnet = defineTool({
  name: "delete_lead_magnet",
  title: "Delete lead magnet",
  description:
    "Usuwa lead magnet razem z zapisami, dziennikiem komentarzy i powiązaniami postów (plik w Storage zostaje — usuń go `supabase_storage`, jeśli trzeba). Nieodwracalne. Tylko administrator/operator.",
  inputSchema: { lead_magnet_id: z.string().uuid() },
  annotations: DESTRUCTIVE,
  handler: ({ lead_magnet_id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const { data, error } = await s
        .from("lead_magnets")
        .delete()
        .eq("id", lead_magnet_id)
        .select("id, slug, title");
      if (error) return fail(error.message);
      if (!data?.length) return fail("Nie znaleziono lead magnetu.");
      return ok({ ok: true, deleted: data[0] });
    }),
});

export const linkLeadMagnetPost = defineTool({
  name: "link_lead_magnet_post",
  title: "Link social post to lead magnet",
  description:
    "Powiązuje post z lead magnetem: komentarz pod tym postem z hasłem (albo każdy, gdy lead magnet nie ma haseł) dostaje link do /pobierz/<slug>. `external_post_id`: Facebook — id posta strony (np. 1234_5678, z `list_facebook_posts` albo `external_post_id` kolejki publikacji), Instagram — id mediów (`list_instagram_media`), YouTube — id filmu. Jeden post może promować tylko jeden lead magnet. Tylko administrator/operator.",
  inputSchema: { lead_magnet_id: z.string().uuid(), ...leadMagnetPostSchema.shape },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const p = leadMagnetPostSchema.parse(a);
      const { data, error } = await s
        .from("lead_magnet_posts")
        .insert({
          lead_magnet_id: a.lead_magnet_id,
          platform: p.platform,
          external_post_id: p.external_post_id,
          label: p.label ?? null,
          post_url: p.post_url || null,
        })
        .select("id, platform, external_post_id, label, linked_at")
        .single();
      if (error) {
        return fail(
          error.code === "23505"
            ? `Post ${p.external_post_id} jest już powiązany z innym lead magnetem (odłącz go najpierw).`
            : error.code === "23503"
              ? "Nie znaleziono lead magnetu."
              : error.message,
        );
      }
      return ok({ ok: true, post: data });
    }),
});

export const unlinkLeadMagnetPost = defineTool({
  name: "unlink_lead_magnet_post",
  title: "Unlink social post from lead magnet",
  description:
    "Odłącza post od lead magnetu (po id powiązania albo platforma + id posta). Komentarze pod nim przestają dostawać link. Tylko administrator/operator.",
  inputSchema: {
    post_link_id: z.string().uuid().optional(),
    platform: z.enum(LEAD_MAGNET_PLATFORMS).optional(),
    external_post_id: z.string().max(120).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      let q = s.from("lead_magnet_posts").delete();
      if (a.post_link_id) q = q.eq("id", a.post_link_id);
      else if (a.platform && a.external_post_id)
        q = q.eq("platform", a.platform).eq("external_post_id", a.external_post_id.trim());
      else return fail("Podaj post_link_id albo platform + external_post_id.");
      const { data, error } = await q.select("id, platform, external_post_id");
      if (error) return fail(error.message);
      return ok({ ok: true, removed: data ?? [] });
    }),
});

export const listLeadMagnetSignups = defineListTool({
  name: "list_lead_magnet_signups",
  title: "List lead magnet signups",
  description:
    "Zapisy na lead magnety (e-mail za materiał): kto, kiedy, skąd (page / facebook / instagram / youtube), ile razy pobrał, czy mail z linkiem doszedł. Tylko administrator/operator.",
  table: "lead_magnet_signups",
  columns:
    "id, lead_magnet_id, email, first_name, source, source_ref, utm, download_count, first_downloaded_at, email_sent_at, email_error, lead_id, created_at",
  resultKey: "signups",
  access: "team",
  order: { column: "created_at", ascending: false },
  filters: {
    lead_magnet_id: uuid("lead_magnet_id", "Tylko zapisy tego lead magnetu."),
    query: search(["email", "first_name"], "Fraza w e-mailu lub imieniu."),
    source: enumOf(
      "source",
      ["page", "facebook", "instagram", "youtube"],
      "Źródło: strona, komentarz FB / IG / YouTube.",
    ),
  },
});

export const listLeadMagnetTriggers = defineListTool({
  name: "list_lead_magnet_triggers",
  title: "List lead magnet comment triggers",
  description:
    "Dziennik automatu social: komentarze (i polubienia) pod postami lead magnetów — kto, co napisał, czy pasowało hasło i co poszło w odpowiedzi (sent_both = DM + komentarz, sent_private, sent_public = link publicznie, failed, skipped = bez hasła, not_possible = polubienie). Tylko administrator/operator.",
  table: "lead_magnet_triggers",
  columns:
    "id, lead_magnet_id, platform, kind, external_post_id, external_comment_id, author_name, comment_text, matched, reply_status, reply_error, created_at",
  resultKey: "triggers",
  access: "team",
  order: { column: "created_at", ascending: false },
  filters: {
    lead_magnet_id: uuid("lead_magnet_id", "Tylko ten lead magnet."),
    platform: enumOf("platform", LEAD_MAGNET_PLATFORMS, "Kanał: facebook / instagram / youtube."),
    matched: flag("matched", "Tylko dopasowane (true) albo pominięte (false)."),
  },
});

export const checkLeadMagnetYoutubeComments = defineTool({
  name: "check_lead_magnet_youtube_comments",
  title: "Check YouTube comments for lead magnets now",
  description:
    "Uruchamia od razu to, co tick robi co 10 minut: czyta nowe komentarze pod filmami YouTube powiązanymi z opublikowanymi lead magnetami i odpowiada linkiem na te z hasłem (realna publikacja odpowiedzi). Facebook i Instagram obsługuje webhook na bieżąco. Tylko administrator/operator.",
  inputSchema: {},
  annotations: SENDS,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { runLeadMagnetYoutubeTick } = await import("@/lib/lead-magnets/lead-magnets.server");
      const r = await runLeadMagnetYoutubeTick();
      return r.ok ? ok(r) : fail(r.error ?? "Sprawdzenie YouTube nie powiodło się.");
    }),
});

export const generateLeadMagnetCopy = defineTool({
  name: "generate_lead_magnet_copy",
  title: "Generate lead magnet copy from brief",
  description:
    "Z briefu (co jest w materiale, dla kogo) generuje tytuł, nagłówek, podnagłówek, listę korzyści, CTA, meta opis, hasła do komentarza i treść posta social. Nic nie zapisuje — wynik przekaż do `create_lead_magnet` / `update_lead_magnet`. Tylko administrator/operator.",
  inputSchema: {
    brief: z.string().min(10).max(4000),
    audience: z.enum(LEAD_MAGNET_AUDIENCES),
    platform: z.enum(LEAD_MAGNET_PLATFORMS).default("facebook"),
  },
  annotations: { ...READ, openWorldHint: true },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { generateLeadMagnetContent } = await import("@/lib/lead-magnets/lead-magnets.server");
      const r = await generateLeadMagnetContent(a.brief, a.audience);
      const caption_template = suggestedCaption({
        title: r.title || "nasz materiał",
        keyword: r.trigger_keywords[0] ?? null,
        audience: a.audience,
        platform: a.platform,
      });
      return ok({ ...r, caption_template });
    }),
});

export const leadMagnetTools = [
  listLeadMagnets,
  getLeadMagnet,
  createLeadMagnet,
  updateLeadMagnet,
  deleteLeadMagnet,
  linkLeadMagnetPost,
  unlinkLeadMagnetPost,
  listLeadMagnetSignups,
  listLeadMagnetTriggers,
  checkLeadMagnetYoutubeComments,
  generateLeadMagnetCopy,
];
