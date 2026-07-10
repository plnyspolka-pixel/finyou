import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy — formularz jest ciężki (819 linii), więc ładujemy go dopiero po wejściu na stronę.
const SinglePageApplicationForm = lazy(() =>
  import("@/components/landing/single-page-application-form").then((m) => ({
    default: m.SinglePageApplicationForm,
  })),
);

export const Route = createFileRoute("/posrednik/wniosek")({
  component: BrokerNewApplication,
});

function FormSkeleton() {
  return (
    <div className="space-y-3 max-w-5xl">
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}

export function BrokerNewApplication() {
  const { user, loading } = useAuth();

  return (
    <div className="space-y-6 max-w-5xl">
      {loading || !user ? (
        <FormSkeleton />
      ) : (
        <Suspense fallback={<FormSkeleton />}>
          <SinglePageApplicationForm
            brokerMode={{
              assignedOperatorId: user.id,
              redirectTo: "/posrednik/wnioski",
              sourceLabel: "posrednik_panel",
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
