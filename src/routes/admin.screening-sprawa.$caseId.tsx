import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScreeningCaseView } from "@/components/screening/case-view";

export const Route = createFileRoute("/admin/screening-sprawa/$caseId")({
  component: ScreeningCasePage,
});

function ScreeningCasePage() {
  const { caseId } = Route.useParams();
  return (
    <div className="space-y-4">
      <Link to="/admin/screening">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-1 h-4 w-4" /> Kolejka spraw
        </Button>
      </Link>
      <ScreeningCaseView caseId={caseId} />
    </div>
  );
}
