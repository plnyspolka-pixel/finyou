// Server functions lead magnetów: panel (/admin/marketing/lead-magnety —
// RLS: administrator/operator) i strona publiczna (/pobierz/<slug> — rola
// serwisowa, tylko opublikowane).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { leadMagnetSchema, leadMagnetRowFromInput } from "./schema";
import { LEAD_MAGNET_AUDIENCES, LEAD_MAGNET_PLATFORMS } from "./core";

const BUCKET = "lead-magnets";

// ── Panel ────────────────────────────────────────────────────────────────────

export const listLeadMagnets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: magnets, error } = await context.supabase
      .from("lead_magnets")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: posts, error: pErr } = await context.supabase
      .from("lead_magnet_posts")
      .select("*")
      .order("linked_at", { ascending: false });
    if (pErr) throw new Error(pErr.message);
    return { magnets: magnets ?? [], posts: posts ?? [] };
  });

export const saveLeadMagnet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => leadMagnetSchema.parse(d))
  .handler(async ({ data, context }) => {
    const row = leadMagnetRowFromInput(data);
    let id = data.id;
    if (id) {
      const { error } = await context.supabase.from("lead_magnets").update(row).eq("id", id);
      if (error) throw new Error(friendlyDbError(error.message));
    } else {
      const { data: ins, error } = await context.supabase
        .from("lead_magnets")
        .insert({ ...row, created_by: context.userId })
        .select("id")
        .single();
      if (error) throw new Error(friendlyDbError(error.message));
      id = ins.id;
    }

    // Powiązane posty: zastępujemy listę, ale zachowujemy `linked_at` postów,
    // które już były (tick YouTube odpowiada tylko na komentarze nowsze niż
    // powiązanie — ponowny zapis nie może „odmłodzić” starych komentarzy).
    const { data: existing } = await context.supabase
      .from("lead_magnet_posts")
      .select("id, platform, external_post_id")
      .eq("lead_magnet_id", id);
    const keyOf = (p: { platform: string; external_post_id: string }) =>
      `${p.platform}:${p.external_post_id.trim()}`;
    const wanted = new Map(data.posts.map((p) => [keyOf(p), p]));
    const stale = (existing ?? []).filter((p) => !wanted.has(keyOf(p)));
    if (stale.length) {
      const { error } = await context.supabase
        .from("lead_magnet_posts")
        .delete()
        .in(
          "id",
          stale.map((p) => p.id),
        );
      if (error) throw new Error(error.message);
    }
    for (const p of data.posts) {
      const prev = (existing ?? []).find((e) => keyOf(e) === keyOf(p));
      const patch = {
        label: p.label?.trim() || null,
        post_url: p.post_url || null,
      };
      if (prev) {
        const { error } = await context.supabase
          .from("lead_magnet_posts")
          .update(patch)
          .eq("id", prev.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await context.supabase.from("lead_magnet_posts").insert({
          lead_magnet_id: id,
          platform: p.platform,
          external_post_id: p.external_post_id.trim(),
          ...patch,
        });
        if (error) {
          throw new Error(
            error.code === "23505"
              ? `Post ${p.external_post_id} jest już powiązany z innym lead magnetem.`
              : error.message,
          );
        }
      }
    }
    return { id };
  });

function friendlyDbError(message: string): string {
  if (/lead_magnets_slug_key/.test(message)) return "Ten slug jest już zajęty.";
  return message;
}

export const deleteLeadMagnet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("lead_magnets")
      .select("file_path")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase.from("lead_magnets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (row?.file_path) {
      await context.supabase.storage
        .from(BUCKET)
        .remove([row.file_path])
        .catch(() => null);
    }
    return { ok: true };
  });

export const listLeadMagnetSignups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ lead_magnet_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("lead_magnet_signups")
      .select("*")
      .eq("lead_magnet_id", data.lead_magnet_id)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    return { signups: rows ?? [] };
  });

export const listLeadMagnetTriggers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        lead_magnet_id: z.string().uuid(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("lead_magnet_triggers")
      .select("*")
      .eq("lead_magnet_id", data.lead_magnet_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { triggers: rows ?? [] };
  });

/** Podgląd pliku w panelu (podpisany link na godzinę; RLS bucketa: zespół). */
export const getLeadMagnetFileUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("lead_magnets")
      .select("file_path, file_url")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Nie znaleziono lead magnetu.");
    if (row.file_path) {
      const { data: s, error: sErr } = await context.supabase.storage
        .from(BUCKET)
        .createSignedUrl(row.file_path, 3600);
      if (sErr) throw new Error(sErr.message);
      return { url: s?.signedUrl ?? null };
    }
    return { url: row.file_url ?? null };
  });

export const generateLeadMagnetCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ brief: z.string().min(10).max(4000), audience: z.enum(LEAD_MAGNET_AUDIENCES) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { generateLeadMagnetContent } = await import("./lead-magnets.server");
    return await generateLeadMagnetContent(data.brief, data.audience);
  });

/** Ręczne sprawdzenie komentarzy YouTube (to samo, co tick co 10 minut). */
export const runLeadMagnetYoutubeCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Tick działa rolą serwisową, więc rolę sprawdzamy sami (RLS tu nie pomoże).
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "administrator",
    });
    const { data: isOperator } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "operator",
    });
    if (!isAdmin && !isOperator) throw new Error("Wymagane uprawnienia administrator/operator");
    const { runLeadMagnetYoutubeTick } = await import("./lead-magnets.server");
    return await runLeadMagnetYoutubeTick();
  });

// ── Strona publiczna ─────────────────────────────────────────────────────────

export const getPublicLeadMagnetFn = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { getPublicLeadMagnet } = await import("./lead-magnets.server");
    return { magnet: await getPublicLeadMagnet(data.slug) };
  });

export const submitLeadMagnetSignup = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        slug: z.string().min(1).max(80),
        email: z.string().trim().email().max(255),
        first_name: z.string().trim().max(80).optional(),
        consent: z.literal(true, { errorMap: () => ({ message: "Zaznacz zgodę." }) }),
        /** Pułapka na boty — pole ukryte, człowiek go nie wypełnia. */
        website: z.string().max(200).optional(),
        ref: z.string().max(120).optional(),
        utm: z
          .object({
            source: z.string().max(200).optional(),
            medium: z.string().max(200).optional(),
            campaign: z.string().max(200).optional(),
            term: z.string().max(200).optional(),
            content: z.string().max(200).optional(),
          })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (data.website) {
      // Bot wypełnił pułapkę: udajemy sukces, nic nie zapisujemy.
      return {
        ok: true as const,
        thank_you_message: "Dziękujemy!",
        download_url: null,
        email_sent: false,
        already_subscribed: false,
      };
    }
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const ip =
      getRequestHeader("cf-connecting-ip") ||
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const ua = getRequestHeader("user-agent") || null;
    const { registerLeadMagnetSignup } = await import("./lead-magnets.server");
    const { signup_id: _signupId, ...result } = await registerLeadMagnetSignup({
      slug: data.slug,
      email: data.email,
      first_name: data.first_name ?? null,
      utm: data.utm && Object.values(data.utm).some(Boolean) ? data.utm : null,
      ref: data.ref ?? null,
      ip,
      userAgent: ua,
    });
    return result;
  });

export const LEAD_MAGNET_PLATFORM_OPTIONS = LEAD_MAGNET_PLATFORMS;
