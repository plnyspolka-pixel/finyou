import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";

const SinglePageApplicationForm = lazy(() =>
  import("@/components/landing/single-page-application-form").then((m) => ({
    default: m.SinglePageApplicationForm,
  })),
);

export const Route = createFileRoute("/operator/wniosek")({
  component: OperatorNewApplication,
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

function OperatorNewApplication() {
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
              redirectTo: "/operator/wnioski",
              sourceLabel: "operator_panel",
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
