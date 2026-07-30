import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { LeadDetailView } from "@/components/admin/LeadDetailView";

export const Route = createFileRoute("/admin/klienci/$id")({
  component: LeadDetailPage,
});

function LeadDetailPage() {
  const { id } = Route.useParams();
  return (
    <div className="space-y-4">
      <Link to="/admin/klienci">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Wróć do listy
        </Button>
      </Link>
      <LeadDetailView id={id} />
    </div>
  );
}
