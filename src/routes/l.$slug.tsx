import { createFileRoute, notFound } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AiLandingView } from "@/components/ai-landing-view";

export const Route = createFileRoute("/l/$slug")({
  loader: async ({ params }) => {
    const { data } = await supabase.from("ai_landings").select("*").eq("slug", params.slug).eq("status", "published").maybeSingle();
    if (!data) throw notFound();
    return { landing: data };
  },
  head: ({ loaderData }) => ({
    meta: loaderData?.landing ? [
      { title: loaderData.landing.meta_title || loaderData.landing.title },
      { name: "description", content: loaderData.landing.meta_description || "" },
      { property: "og:title", content: loaderData.landing.meta_title || loaderData.landing.title },
      { property: "og:description", content: loaderData.landing.meta_description || "" },
    ] : [],
  }),
  component: LandingPage,
  notFoundComponent: () => <div className="grid min-h-screen place-items-center text-muted-foreground">Landing nie istnieje.</div>,
  errorComponent: ({ error }) => <div className="grid min-h-screen place-items-center text-destructive">{error.message}</div>,
});

function LandingPage() {
  const { landing } = Route.useLoaderData();
  return <AiLandingView landing={landing} />;
}
