// Kreator Google Ads (szkice, eksport CSV) — logika wyniesiona z google-ads.functions.ts: wspólna dla
// server functions panelu (cienkie delegaty) i narzędzi MCP. Zachowanie 1:1.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import {
  schema,
  saveGoogleAdDraftSchema,
  getGoogleAdDraftSchema,
  deleteGoogleAdDraftSchema,
  exportGoogleAdCsvSchema,
  SaveGoogleAdDraftInput,
  GetGoogleAdDraftInput,
  DeleteGoogleAdDraftInput,
  ExportGoogleAdCsvInput,
} from "./google-ads-schema";

async function assertStaff(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("administrator") && !roles.includes("operator"))
    throw new Error("Brak uprawnień");
}

function csvEscape(s: string) {
  if (s == null) return "";
  const needs = /[",\n]/.test(s);
  const v = String(s).replace(/"/g, '""');
  return needs ? `"${v}"` : v;
}

export async function saveGoogleAdDraft(
  _supabase: SupabaseClient<Database>,
  userId: string,
  data: SaveGoogleAdDraftInput,
) {
  await assertStaff(userId);
  if (data.id) {
    const { id, ...rest } = data;
    await supabaseAdmin.from("google_ad_drafts").update(rest).eq("id", id!);
    return { id: id! };
  }
  const { data: row, error } = await supabaseAdmin
    .from("google_ad_drafts")
    .insert({ ...data, created_by: userId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: row!.id };
}

export async function listGoogleAdDrafts(_supabase: SupabaseClient<Database>, userId: string) {
  await assertStaff(userId);
  const { data } = await supabaseAdmin
    .from("google_ad_drafts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  return { drafts: data ?? [] };
}

export async function getGoogleAdDraft(
  _supabase: SupabaseClient<Database>,
  userId: string,
  data: GetGoogleAdDraftInput,
) {
  await assertStaff(userId);
  const { data: draft } = await supabaseAdmin
    .from("google_ad_drafts")
    .select("*")
    .eq("id", data.id)
    .single();
  return { draft };
}

export async function deleteGoogleAdDraft(
  _supabase: SupabaseClient<Database>,
  userId: string,
  data: DeleteGoogleAdDraftInput,
) {
  await assertStaff(userId);
  await supabaseAdmin.from("google_ad_drafts").delete().eq("id", data.id);
  return { ok: true };
}

export async function exportGoogleAdCsv(
  _supabase: SupabaseClient<Database>,
  userId: string,
  data: ExportGoogleAdCsvInput,
) {
  await assertStaff(userId);
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
  await supabaseAdmin.from("google_ad_drafts").update({ status: "eksportowana" }).eq("id", data.id);
  return { csv, filename: `${d.name.replace(/[^\w-]+/g, "_")}_google-ads-editor.csv` };
}
