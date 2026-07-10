import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { FilePlus2 } from "lucide-react";

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
    <div className="space-y-3 max-w-3xl">
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
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FilePlus2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold leading-tight">Nowy wniosek klienta</h1>
          <p className="text-xs text-muted-foreground">Wniosek zostanie przypisany do Ciebie.</p>
        </div>
      </div>

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
