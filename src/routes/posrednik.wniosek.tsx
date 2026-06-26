import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { SinglePageApplicationForm } from "@/components/landing/single-page-application-form";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/posrednik/wniosek")({
  component: BrokerNewApplication,
});

function BrokerNewApplication() {
  const { user, loading } = useAuth();

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Nowy wniosek"
        title="Wprowadź wniosek klienta"
        subtitle="Wypełnij dane klienta i parametry oferty — wniosek zostanie przypisany do Ciebie jako pośrednika."
      />
      {loading || !user ? (
        <Skeleton className="h-96 w-full max-w-5xl rounded-2xl" />
      ) : (
        <div className="max-w-5xl">
          <SinglePageApplicationForm
            brokerMode={{
              assignedOperatorId: user.id,
              redirectTo: "/posrednik/wnioski",
              sourceLabel: "posrednik_panel",
            }}
          />
        </div>
      )}
    </div>
  );
}
