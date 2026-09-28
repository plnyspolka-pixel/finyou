// Kampanie śledzące (linki UTM z kodem skróconym /r/<code>) — logika
// tworzenia wspólna dla panelu (marketing-tracking.functions.ts) i MCP
// (create_tracking_link). Klient przekazany z zewnątrz: panel pisze tokenem
// użytkownika (RLS), MCP klientem serwisowym po sprawdzeniu roli.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type TrackingCampaignRow = Database["public"]["Tables"]["marketing_campaigns"]["Row"];

export function genTrackingCode() {
  return Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 4);
}

export function slugifyCampaign(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export type TrackingCampaignInput = {
  name: string;
  target_url: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  cost?: number;
  notes?: string | null;
};

export async function createTrackingCampaign(
  client: SupabaseClient,
  userId: string,
  data: TrackingCampaignInput,
): Promise<TrackingCampaignRow> {
  const baseSlug = slugifyCampaign(data.name) || "kampania";
  let slug = baseSlug;
  let attempts = 0;
  while (attempts < 5) {
    const { data: existing } = await client
      .from("marketing_campaigns")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 5)}`;
    attempts++;
  }
  let short_code = genTrackingCode();
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await client
      .from("marketing_campaigns")
      .select("id")
      .eq("short_code", short_code)
      .maybeSingle();
    if (!existing) break;
    short_code = genTrackingCode();
  }

  const { data: row, error } = await client
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
      cost: data.cost ?? 0,
      notes: data.notes ?? null,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return row as TrackingCampaignRow;
}
