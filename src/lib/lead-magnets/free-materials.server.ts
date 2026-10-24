// Dane działu „Darmowe materiały” (rola serwisowa, tylko opublikowane).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { STARTER_CALCULATORS } from "@/lib/autopilot/calculators";
import { TRACK_TO_AUDIENCE, TRACKS } from "@/lib/autopilot/types";
import type { LeadMagnetAudience } from "./core";
import {
  EMPTY_FREE_MATERIALS,
  orderFreeMaterials,
  type FreeMaterialRow,
  type FreeMaterials,
} from "./free-materials";

export async function listFreeMaterials(audience: LeadMagnetAudience): Promise<FreeMaterials> {
  const track = TRACKS.find((t) => TRACK_TO_AUDIENCE[t] === audience) ?? null;
  const tools = STARTER_CALCULATORS.filter((c) => c.track === track).map((c) => ({
    slug: c.slug,
    title: c.title,
    promise: c.promise,
    keyword: c.keyword,
    url: `/narzedzie/${c.slug}`,
  }));
  try {
    const { data, error } = await supabaseAdmin
      .from("lead_magnets")
      .select("slug,title,headline,subheadline,benefits,cta_text,file_name,audience,signup_count")
      .eq("published", true)
      .eq("audience", audience)
      .order("signup_count", { ascending: false })
      .limit(40);
    if (error) throw new Error(error.message);
    return {
      audience,
      materials: orderFreeMaterials((data ?? []) as FreeMaterialRow[], {
        audience,
        toolSlugs: STARTER_CALCULATORS.map((c) => c.slug),
      }),
      tools,
    };
  } catch (e) {
    // Dział jest dodatkiem do landingu – brak bazy w SSR nie może wywrócić strony.
    console.error("[free-materials] nie udało się pobrać lead magnetów", e);
    return { ...EMPTY_FREE_MATERIALS(audience), tools };
  }
}
