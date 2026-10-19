import { createServerFn } from "@tanstack/react-start";
// Link-hub w bio (brief 5.3): /start — dwa tory i aktywne lead magnety.
// Lista generuje się z bazy, więc agent zmienia treść huba, publikując albo
// wycofując lead magnety — adres w bio zostaje stały.

export type HubMagnet = { slug: string; title: string; headline: string; audience: string };

export const listHubLeadMagnetsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("lead_magnets")
    .select("slug,title,headline,audience,signup_count")
    .eq("published", true)
    .order("signup_count", { ascending: false })
    .limit(24);
  return { magnets: (data ?? []).map(({ signup_count: _s, ...m }) => m) as HubMagnet[] };
});
