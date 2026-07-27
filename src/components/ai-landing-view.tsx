import { useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useLandingEngagement } from "@/hooks/use-landing-engagement";

type Section = {
  kind: string;
  heading: string;
  body?: string;
  items?: { title: string; text?: string }[];
};
type Variant = { id: string; label: string; weight: number; is_active: boolean; overrides: any };

function pickVariant(landingId: string, variants: Variant[]): Variant | null {
  const active = variants.filter((v) => v.is_active && v.weight > 0);
  if (active.length === 0) return null;
  const key = `ai_ab_${landingId}`;
  if (typeof window !== "undefined") {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const hit = active.find((v) => v.id === cached);
      if (hit) return hit;
    }
  }
  const total = active.reduce((s, v) => s + v.weight, 0);
  let r = Math.random() * total;
  let chosen = active[0];
  for (const v of active) {
    if (r < v.weight) {
      chosen = v;
      break;
    }
    r -= v.weight;
  }
  if (typeof window !== "undefined") sessionStorage.setItem(key, chosen.id);
  return chosen;
}

export function AiLandingView({
  landing,
  variants = [],
  embedded = false,
}: {
  landing: any;
  variants?: Variant[];
  embedded?: boolean;
}) {
  const recorded = useRef(false);
  const variant = useMemo(() => pickVariant(landing.id, variants), [landing.id, variants]);
  const source = embedded ? "embed" : "direct";

  useLandingEngagement({ landingId: landing.id, variantId: variant?.id ?? null, source });

  const ov = variant?.overrides ?? {};
  const heroHeadline = ov.hero_headline ?? landing.hero_headline;
  const heroSub = ov.hero_subheadline ?? landing.hero_subheadline;
  const ctaLabel = ov.cta_label ?? landing.cta_label ?? "Złóż wniosek";
  const cta = ov.cta_url ?? landing.cta_url ?? "https://app.financeyou.pl/embed/wniosek";
  const sections: Section[] = Array.isArray(ov.sections)
    ? ov.sections
    : Array.isArray(landing.sections)
      ? landing.sections
      : [];

  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    void supabase.from("ai_landing_events").insert({
      landing_id: landing.id,
      variant_id: variant?.id ?? null,
      event_type: "view",
      source,
    });
  }, [landing.id, source, variant?.id]);

  const onCtaClick = () => {
    void supabase.from("ai_landing_events").insert({
      landing_id: landing.id,
      variant_id: variant?.id ?? null,
      event_type: "cta_click",
      source,
    });
  };

  return (
    <article className={embedded ? "p-4" : "min-h-screen bg-background"}>
      <div className={`mx-auto max-w-3xl ${embedded ? "" : "px-4 py-12"}`}>
        <header className="space-y-4 text-center">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{heroHeadline}</h1>
          <p className="text-lg text-muted-foreground">{heroSub}</p>
          <Button size="lg" asChild onClick={onCtaClick} data-track="hero_cta">
            <a href={cta} target={embedded ? "_top" : "_self"} rel="noopener">
              {ctaLabel}
            </a>
          </Button>
        </header>

        <div className="mt-12 space-y-10">
          {sections.map((s, i) => (
            <section key={i} className="space-y-3">
              <h2 className="text-2xl font-semibold">{s.heading}</h2>
              {s.body && <p className="text-muted-foreground whitespace-pre-line">{s.body}</p>}
              {s.items && s.items.length > 0 && (
                <ul className={s.kind === "faq" ? "space-y-3" : "grid gap-3 md:grid-cols-2"}>
                  {s.items.map((it, j) => (
                    <li key={j} className="rounded-lg border bg-card p-4">
                      <div className="font-medium">{it.title}</div>
                      {it.text && (
                        <div className="text-sm text-muted-foreground mt-1 whitespace-pre-line">
                          {it.text}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {s.kind === "cta" && (
                <div className="pt-2">
                  <Button asChild onClick={onCtaClick} data-track={`section_cta_${i}`}>
                    <a href={cta} target={embedded ? "_top" : "_self"} rel="noopener">
                      {ctaLabel}
                    </a>
                  </Button>
                </div>
              )}
            </section>
          ))}
        </div>

        {!embedded && (
          <footer className="mt-16 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Finance You. Treść wygenerowana przez AI.
            {variant && <span className="ml-2 opacity-60">· wariant: {variant.label}</span>}
          </footer>
        )}
      </div>
    </article>
  );
}
