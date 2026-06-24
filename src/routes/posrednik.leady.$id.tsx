import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Phone, MessageSquare, Mail, FileText } from "lucide-react";
import { LeadDetailView } from "@/components/admin/LeadDetailView";
import { getLead } from "@/lib/leads-admin.functions";

export const Route = createFileRoute("/posrednik/leady/$id")({
  component: OperatorLeadDetail,
});

function OperatorLeadDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getLead);
  const q = useQuery({ queryKey: ["operator-lead-quickactions", id], queryFn: () => fn({ data: { id } }) });
  const lead = (q.data as any)?.lead;
  const phone = lead?.phone_normalized as string | undefined;
  const email = lead?.email as string | undefined;
  const loanId = lead?.loan_application_id as string | undefined;

  return (
    <div className="space-y-4">
      <Link to="/posrednik/leady" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" /> Wróć do listy
      </Link>

      {lead && (phone || email || loanId) && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium mr-2">Szybkie akcje:</span>
            {phone && (
              <>
                <a href={`tel:${phone}`}>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                    <Phone className="mr-2 h-4 w-4" /> Zadzwoń {phone}
                  </Button>
                </a>
                <a href={`sms:${phone}`}>
                  <Button size="sm" variant="outline">
                    <MessageSquare className="mr-2 h-4 w-4" /> SMS
                  </Button>
                </a>
              </>
            )}
            {email && (
              <a href={`mailto:${email}`}>
                <Button size="sm" variant="outline">
                  <Mail className="mr-2 h-4 w-4" /> E-mail
                </Button>
              </a>
            )}
            {loanId && (
              <Link to="/admin/wnioski/$id" params={{ id: loanId }}>
                <Button size="sm" variant="outline">
                  <FileText className="mr-2 h-4 w-4" /> Wniosek
                </Button>
              </Link>
            )}
            <Link to="/posrednik/kreator-dokumentow">
              <Button size="sm" variant="secondary">
                <FileText className="mr-2 h-4 w-4" /> Wygeneruj dokument
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <LeadDetailView id={id} />
    </div>
  );
}
