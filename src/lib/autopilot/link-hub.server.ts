// Link-hub z bio (brief 5.3): stały adres /start z wyborem toru
// „Potrzebuję finansowania” / „Chcę inwestować”. Treść składa system:
// CTA z profili torów + opublikowane lead magnety toru (najlepsze wg zapisów).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadAutopilotConfig } from "./state.server";
import { STARTER_CALCULATORS } from "./calculators";
import { TRACKS, TRACK_TO_AUDIENCE, type Track } from "./types";

export interface LinkHubTrack {
  track: Track;
  heading: string;
  sub: string;
  ctaLabel: string;
  ctaUrl: string;
  magnets: Array<{ slug: string; title: string; headline: string | null }>;
  tools: Array<{ slug: string; title: string; keyword: string }>;
}

const COPY: Record<Track, { heading: string; sub: string }> = {
  pozyczkobiorca: {
    heading: "Potrzebuję finansowania",
    sub: "Dla firm – finansowanie na cel gospodarczy pod zastaw nieruchomości.",
  },
  inwestor: {
    heading: "Chcę inwestować",
    sub: "Zarabiaj na nieruchomościach bez kupowania, budowania i remontowania – z uczciwym podejściem do ryzyka.",
  },
};

export async function getLinkHubData(): Promise<{ tracks: LinkHubTrack[] }> {
  const cfg = await loadAutopilotConfig().catch(() => null);
  const { data } = await supabaseAdmin
    .from("lead_magnets")
    .select("slug, title, headline, audience, signup_count")
    .eq("published", true)
    .order("signup_count", { ascending: false })
    .limit(30);
  const rows = (data ?? []) as Array<{
    slug: string;
    title: string;
    headline: string | null;
    audience: string | null;
  }>;
  return {
    tracks: TRACKS.map((t) => {
      const profile = cfg?.profiles[t];
      return {
        track: t,
        ...COPY[t],
        ctaLabel:
          profile?.ctaLabel ??
          (t === "inwestor" ? "Zobacz, jak to działa" : "Złóż bezpłatny wniosek"),
        ctaUrl:
          profile?.ctaUrl ??
          (t === "inwestor"
            ? "https://financeyou.pl/dla-inwestora"
            : "https://app.financeyou.pl/embed/wniosek"),
        magnets: rows
          .filter((r) => r.audience === TRACK_TO_AUDIENCE[t])
          .slice(0, 3)
          .map((r) => ({ slug: r.slug, title: r.title, headline: r.headline })),
        tools: STARTER_CALCULATORS.filter((c) => c.track === t).map((c) => ({
          slug: c.slug,
          title: c.title,
          keyword: c.keyword,
        })),
      };
    }),
  };
}
