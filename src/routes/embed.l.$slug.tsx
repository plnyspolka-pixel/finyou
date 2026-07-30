import { createFileRoute, notFound } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AiLandingView } from "@/components/ai-landing-view";

export const Route = createFileRoute("/embed/l/$slug")({
  loader: async ({ params }) => {
    const { data } = await supabase
      .from("ai_landings")
      .select("*")
      .eq("slug", params.slug)
      .eq("status", "published")
      .maybeSingle();
    if (!data) throw notFound();
    const { data: variants } = await supabase
      .from("ai_landing_variants")
      .select("*")
      .eq("landing_id", data.id)
      .eq("is_active", true);
    return { landing: data, variants: variants ?? [] };
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: EmbedLanding,
  notFoundComponent: () => (
    <div className="p-6 text-sm text-muted-foreground">Landing nie istnieje.</div>
  ),
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{error.message}</div>
  ),
});

function EmbedLanding() {
  const { landing, variants } = Route.useLoaderData();
  return <AiLandingView landing={landing} variants={variants} embedded />;
}
