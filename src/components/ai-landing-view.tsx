import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Section = { kind: string; heading: string; body?: string; items?: { title: string; text?: string }[] };

export function AiLandingView({ landing, embedded = false }: { landing: any; embedded?: boolean }) {
  const recorded = useRef(false);

  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    void supabase.from("ai_landing_events").insert({
      landing_id: landing.id,
      event_type: "view",
      source: embedded ? "embed" : "direct",
    });
  }, [landing.id, embedded]);

  const onCtaClick = () => {
    void supabase.from("ai_landing_events").insert({
      landing_id: landing.id, event_type: "cta_click", source: embedded ? "embed" : "direct",
    });
  };

  const cta = landing.cta_url || "https://app.financeyou.pl/embed/wniosek";
  const sections: Section[] = Array.isArray(landing.sections) ? landing.sections : [];

  return (
    <article className={embedded ? "p-4" : "min-h-screen bg-background"}>
      <div className={`mx-auto max-w-3xl ${embedded ? "" : "px-4 py-12"}`}>
        <header className="space-y-4 text-center">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{landing.hero_headline}</h1>
          <p className="text-lg text-muted-foreground">{landing.hero_subheadline}</p>
          <Button size="lg" asChild onClick={onCtaClick}>
            <a href={cta} target={embedded ? "_top" : "_self"} rel="noopener">{landing.cta_label || "Złóż wniosek"}</a>
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
                      {it.text && <div className="text-sm text-muted-foreground mt-1 whitespace-pre-line">{it.text}</div>}
                    </li>
                  ))}
                </ul>
              )}
              {s.kind === "cta" && (
                <div className="pt-2">
                  <Button asChild onClick={onCtaClick}>
                    <a href={cta} target={embedded ? "_top" : "_self"} rel="noopener">{landing.cta_label || "Złóż wniosek"}</a>
                  </Button>
                </div>
              )}
            </section>
          ))}
        </div>

        {!embedded && (
          <footer className="mt-16 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Finance You. Treść wygenerowana przez AI.
          </footer>
        )}
      </div>
    </article>
  );
}
