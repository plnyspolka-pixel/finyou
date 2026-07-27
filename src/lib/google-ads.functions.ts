import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

async function assertStaff(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("administrator") && !roles.includes("operator"))
    throw new Error("Brak uprawnień");
}

const schema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  campaign_type: z.enum(["SEARCH", "DISPLAY"]),
  daily_budget_pln: z.number().min(1).max(100000),
  keywords: z.array(z.string().min(1).max(80)).max(200),
  negative_keywords: z.array(z.string().min(1).max(80)).max(200),
  headlines: z.array(z.string().min(1).max(30)).min(3).max(15),
  descriptions: z.array(z.string().min(1).max(90)).min(2).max(4),
  final_url: z.string().url().max(500),
  display_path1: z.string().max(15).optional().nullable(),
  display_path2: z.string().max(15).optional().nullable(),
  target_locations: z.array(z.string().min(1).max(100)).min(1).max(50),
  target_languages: z.array(z.string().min(1).max(10)).min(1).max(20),
  notes: z.string().max(2000).optional().nullable(),
});

export const saveGoogleAdDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    if (data.id) {
      const { id, ...rest } = data;
      await supabaseAdmin.from("google_ad_drafts").update(rest).eq("id", id!);
      return { id: id! };
    }
    const { data: row, error } = await supabaseAdmin
      .from("google_ad_drafts")
      .insert({ ...data, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const listGoogleAdDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data } = await supabaseAdmin
      .from("google_ad_drafts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    return { drafts: data ?? [] };
  });

export const getGoogleAdDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: draft } = await supabaseAdmin
      .from("google_ad_drafts")
      .select("*")
      .eq("id", data.id)
      .single();
    return { draft };
  });

export const deleteGoogleAdDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    await supabaseAdmin.from("google_ad_drafts").delete().eq("id", data.id);
    return { ok: true };
  });

function csvEscape(s: string) {
  if (s == null) return "";
  const needs = /[",\n]/.test(s);
  const v = String(s).replace(/"/g, '""');
  return needs ? `"${v}"` : v;
}

export const exportGoogleAdCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: d } = await supabaseAdmin
      .from("google_ad_drafts")
      .select("*")
      .eq("id", data.id)
      .single();
    if (!d) throw new Error("Szkic nie istnieje");

    // Google Ads Editor compatible CSV (simplified bulk format)
    const rows: string[][] = [];
    rows.push([
      "Campaign",
      "Budget",
      "Campaign type",
      "Status",
      "Networks",
      "Languages",
      "Locations",
    ]);
    rows.push([
      d.name,
      String(d.daily_budget_pln),
      d.campaign_type,
      "Paused",
      d.campaign_type === "SEARCH" ? "Google search" : "Display Network",
      (d.target_languages ?? []).join(";"),
      (d.target_locations ?? []).join(";"),
    ]);
    rows.push([]);
    rows.push(["Campaign", "Ad group", "Status"]);
    rows.push([d.name, `${d.name} - grupa 1`, "Paused"]);
    rows.push([]);
    rows.push(["Campaign", "Ad group", "Keyword", "Match type"]);
    for (const kw of d.keywords ?? []) rows.push([d.name, `${d.name} - grupa 1`, kw, "Broad"]);
    rows.push([]);
    rows.push(["Campaign", "Negative keyword", "Match type"]);
    for (const kw of d.negative_keywords ?? []) rows.push([d.name, kw, "Broad"]);
    rows.push([]);
    rows.push([
      "Campaign",
      "Ad group",
      "Ad type",
      "Final URL",
      "Path 1",
      "Path 2",
      ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
      ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
    ]);
    const hs = [...(d.headlines ?? []), ...Array(15).fill("")].slice(0, 15);
    const ds = [...(d.descriptions ?? []), ...Array(4).fill("")].slice(0, 4);
    rows.push([
      d.name,
      `${d.name} - grupa 1`,
      "Responsive search ad",
      d.final_url ?? "",
      d.display_path1 ?? "",
      d.display_path2 ?? "",
      ...hs,
      ...ds,
    ]);

    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    await supabaseAdmin
      .from("google_ad_drafts")
      .update({ status: "eksportowana" })
      .eq("id", data.id);
    return { csv, filename: `${d.name.replace(/[^\w-]+/g, "_")}_google-ads-editor.csv` };
  });
