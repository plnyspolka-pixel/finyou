import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function genCode() {
  return Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 4);
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Per-campaign metrics
    const ids = (data ?? []).map((c: any) => c.id);
    const clicks: Record<string, number> = {};
    const leads: Record<string, number> = {};
    if (ids.length) {
      const { data: c } = await supabase
        .from("campaign_clicks")
        .select("campaign_id")
        .in("campaign_id", ids);
      for (const r of c ?? []) clicks[r.campaign_id] = (clicks[r.campaign_id] || 0) + 1;
      const { data: a } = await supabase
        .from("lead_attributions")
        .select("campaign_id")
        .in("campaign_id", ids);
      for (const r of a ?? [])
        if (r.campaign_id) leads[r.campaign_id] = (leads[r.campaign_id] || 0) + 1;
    }
    return {
      campaigns: (data ?? []).map((c: any) => ({
        ...c,
        clicks: clicks[c.id] || 0,
        leads: leads[c.id] || 0,
      })),
    };
  });

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        name: z.string().min(1).max(120),
        target_url: z.string().url(),
        utm_source: z.string().max(60).optional().nullable(),
        utm_medium: z.string().max(60).optional().nullable(),
        utm_campaign: z.string().max(80).optional().nullable(),
        utm_term: z.string().max(80).optional().nullable(),
        utm_content: z.string().max(120).optional().nullable(),
        cost: z.number().min(0).default(0),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const baseSlug = slugify(data.name) || "kampania";
    let slug = baseSlug;
    let attempts = 0;
    while (attempts < 5) {
      const { data: existing } = await supabase
        .from("marketing_campaigns")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) break;
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 5)}`;
      attempts++;
    }
    let short_code = genCode();
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await supabase
        .from("marketing_campaigns")
        .select("id")
        .eq("short_code", short_code)
        .maybeSingle();
      if (!existing) break;
      short_code = genCode();
    }

    const { data: row, error } = await supabase
      .from("marketing_campaigns")
      .insert({
        name: data.name,
        slug,
        short_code,
        target_url: data.target_url,
        utm_source: data.utm_source ?? null,
        utm_medium: data.utm_medium ?? null,
        utm_campaign: data.utm_campaign ?? slug,
        utm_term: data.utm_term ?? null,
        utm_content: data.utm_content ?? null,
        cost: data.cost,
        notes: data.notes ?? null,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { campaign: row };
  });

export const updateCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        is_active: z.boolean().optional(),
        cost: z.number().min(0).optional(),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...patch } = data;
    const { error } = await supabase.from("marketing_campaigns").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("marketing_campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCampaignStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: clicks }, { data: attrs }] = await Promise.all([
      supabase
        .from("campaign_clicks")
        .select("created_at, country, device, referrer")
        .eq("campaign_id", data.id)
        .gte("created_at", since),
      supabase
        .from("lead_attributions")
        .select("created_at, utm_source")
        .eq("campaign_id", data.id)
        .gte("created_at", since),
    ]);
    // Daily series
    const days: Record<string, { clicks: number; leads: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      days[d] = { clicks: 0, leads: 0 };
    }
    for (const c of clicks ?? []) {
      const d = c.created_at.slice(0, 10);
      if (days[d]) days[d].clicks++;
    }
    for (const a of attrs ?? []) {
      const d = a.created_at.slice(0, 10);
      if (days[d]) days[d].leads++;
    }
    return {
      total_clicks: (clicks ?? []).length,
      total_leads: (attrs ?? []).length,
      series: Object.entries(days).map(([date, v]) => ({ date, ...v })),
    };
  });
