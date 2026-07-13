import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

// Osadzenie na zewnętrznej stronie (iframe) — jedno-krokowy wniosek:
// suwaki kwota + okres, dane kontaktowe, typ nieruchomości, KW, zdjęcia.
// Bez kalkulatora i bez raty. Po wysłaniu klient trafia do /klient.
const EmbedApplicationForm = lazy(() =>
  import("@/components/landing/embed-application-form").then((m) => ({
    default: m.EmbedApplicationForm,
  })),
);

export const Route = createFileRoute("/embed/wniosek")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: EmbedWniosek,
});

function EmbedWniosek() {
  return (
    <>
      <style>{`
        html,body,#root,#app{background:transparent !important;}
        html,body{margin:0 !important;padding:0 !important;}
      `}</style>
      <div className="bg-transparent p-3 sm:p-4">
        <Suspense fallback={<div className="text-sm text-white/70 p-4">Ładowanie wniosku…</div>}>
          <EmbedApplicationForm />
        </Suspense>
      </div>
    </>
  );
}
