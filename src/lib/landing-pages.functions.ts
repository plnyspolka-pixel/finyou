import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const formFieldSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z_][a-z0-9_]*$/i),
  label: z.string().min(1).max(120),
  type: z.enum(["text", "email", "tel", "textarea", "select"]),
  required: z.boolean().default(false),
  placeholder: z.string().max(200).optional(),
  options: z.array(z.string().max(120)).max(20).optional(),
});

const sectionSchema = z.object({
  type: z.enum(["text", "features", "testimonial", "stats", "cta"]),
  title: z.string().max(200).optional(),
  content: z.string().max(5000).optional(),
  items: z
    .array(
      z.object({
        title: z.string().max(200).optional(),
        description: z.string().max(1000).optional(),
        label: z.string().max(120).optional(),
        value: z.string().max(120).optional(),
        icon: z.string().max(60).optional(),
      }),
    )
    .max(20)
    .optional(),
  author: z.string().max(120).optional(),
  role: z.string().max(120).optional(),
});

const landingSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "tylko małe litery, cyfry i myślniki"),
  title: z.string().min(1).max(200),
  headline: z.string().min(1).max(300),
  subheadline: z.string().max(500).optional(),
  cta_text: z.string().min(1).max(80).default("Zapisz się"),
  hero_image_url: z.string().url().optional().or(z.literal("")),
  og_image_url: z.string().url().optional().or(z.literal("")),
  meta_description: z.string().max(300).optional(),
  sections: z.array(sectionSchema).max(30).default([]),
  form_fields: z.array(formFieldSchema).min(1).max(15),
  thank_you_message: z.string().min(1).max(500),
  redirect_url: z.string().url().optional().or(z.literal("")),
  theme: z
    .object({
      primary: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default("#0ea5e9"),
      background: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default("#ffffff"),
    })
    .default({ primary: "#0ea5e9", background: "#ffffff" }),
  published: z.boolean().default(false),
});

export const listLandingPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("landing_pages")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { pages: data ?? [] };
  });

export const saveLandingPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => landingSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...row } = data;
    const payload = {
      ...row,
      hero_image_url: row.hero_image_url || null,
      og_image_url: row.og_image_url || null,
      redirect_url: row.redirect_url || null,
    };
    if (id) {
      const { error } = await context.supabase.from("landing_pages").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: ins, error } = await context.supabase
      .from("landing_pages")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteLandingPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("landing_pages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listLandingLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ landing_page_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("landing_leads")
      .select("*")
      .eq("landing_page_id", data.landing_page_id)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    return { leads: rows ?? [] };
  });

export const generateLandingCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brief: z.string().min(10).max(4000) }).parse(d))
  .handler(async ({ data }) => {
    const { generateLandingContent } = await import("./landing-pages.server");
    return await generateLandingContent(data.brief);
  });

// Public — fetch by slug (anonymous-safe, RLS allows published)
export const getPublicLandingPage = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: page, error } = await supabaseAdmin
      .from("landing_pages")
      .select(
        "id,slug,title,headline,subheadline,cta_text,hero_image_url,og_image_url,meta_description,sections,form_fields,thank_you_message,redirect_url,theme,published",
      )
      .eq("slug", data.slug)
      .eq("published", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!page) return { page: null };
    // increment view count (fire-and-forget)
    try {
      await supabaseAdmin
        .from("landing_pages")
        .update({ view_count: ((page as { view_count?: number }).view_count ?? 0) + 1 } as never)
        .eq("id", page.id);
    } catch {
      /* ignore */
    }
    return { page };
  });

// Public — submit a lead (no auth)
export const submitLandingLead = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        landing_page_id: z.string().uuid(),
        email: z.string().email().max(255),
        name: z.string().max(200).optional(),
        phone: z.string().max(40).optional(),
        custom_fields: z.record(z.string(), z.string().max(2000)).default({}),
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getRequestHeader } = await import("@tanstack/react-start/server");

    // Verify page exists & published
    const { data: page, error: pErr } = await supabaseAdmin
      .from("landing_pages")
      .select("id,published,redirect_url,thank_you_message")
      .eq("id", data.landing_page_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!page || !page.published) throw new Error("Strona niedostępna");

    const ip =
      getRequestHeader("cf-connecting-ip") ||
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const ua = getRequestHeader("user-agent") || null;

    const { error } = await supabaseAdmin.from("landing_leads").insert({
      landing_page_id: data.landing_page_id,
      email: data.email.toLowerCase().trim(),
      name: data.name ?? null,
      phone: data.phone ?? null,
      custom_fields: data.custom_fields,
      utm: data.utm ?? null,
      source: "landing",
      ip_address: ip,
      user_agent: ua,
    });
    if (error) throw new Error(error.message);

    // Also push into email_subscribers if table exists
    try {
      const parts = (data.name ?? "").trim().split(/\s+/);
      await supabaseAdmin.from("email_subscribers").upsert(
        {
          email: data.email.toLowerCase().trim(),
          first_name: parts[0] || null,
          last_name: parts.slice(1).join(" ") || null,
          source: "landing",
          source_id: data.landing_page_id,
          tags: ["landing"],
        },
        { onConflict: "email", ignoreDuplicates: true },
      );
    } catch {
      /* ignore — email_subscribers may not exist */
    }

    // Increment conversion_count
    try {
      const { data: cur } = await supabaseAdmin
        .from("landing_pages")
        .select("conversion_count")
        .eq("id", data.landing_page_id)
        .maybeSingle();
      await supabaseAdmin
        .from("landing_pages")
        .update({
          conversion_count:
            ((cur as { conversion_count?: number } | null)?.conversion_count ?? 0) + 1,
        } as never)
        .eq("id", data.landing_page_id);
    } catch {
      /* ignore */
    }

    return {
      ok: true,
      thank_you_message: page.thank_you_message,
      redirect_url: page.redirect_url,
    };
  });
