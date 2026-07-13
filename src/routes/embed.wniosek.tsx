import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

// Osadzenie na zewnętrznej stronie (iframe) — sam formularz wniosku,
// bez nagłówka, logo i paska telefonu. Tło transparentne, żeby wpasować
// się w dowolną stronę hostującą.
const SinglePageApplicationForm = lazy(() =>
  import("@/components/landing/single-page-application-form").then((m) => ({
    default: m.SinglePageApplicationForm,
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
      <style>{`html,body{background:transparent !important;}`}</style>
      <div className="min-h-screen bg-transparent p-3 sm:p-4">
        <Suspense fallback={<div className="text-sm text-white/70 p-4">Ładowanie wniosku…</div>}>
          <SinglePageApplicationForm />
        </Suspense>
      </div>
    </>
  );
}
