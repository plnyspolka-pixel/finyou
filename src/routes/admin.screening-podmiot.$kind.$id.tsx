import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScreeningOwnerCard } from "@/components/screening/owner-card";

export const Route = createFileRoute("/admin/screening-podmiot/$kind/$id")({
  component: ScreeningOwnerPage,
});

function ScreeningOwnerPage() {
  const { kind, id } = Route.useParams();
  const k = kind === "investor" ? "investor" : "client";
  return (
    <div className="space-y-4">
      <Link to="/admin/screening">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-1 h-4 w-4" /> Screening PEP i sankcji
        </Button>
      </Link>
      <h1 className="text-2xl font-bold">
        Karta screeningu {k === "client" ? "klienta" : "inwestora"}
      </h1>
      <ScreeningOwnerCard kind={k} id={id} />
    </div>
  );
}
