import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Phone, MessageSquare, Mail, FileText } from "lucide-react";
import { LeadDetailView } from "@/components/admin/LeadDetailView";
import { getLead } from "@/lib/leads-admin.functions";
import { usePanelBase } from "@/lib/panel-base";

export const Route = createFileRoute("/posrednik/leady/$id")({
  component: OperatorLeadDetail,
});

export function OperatorLeadDetail() {
  const { id } = useParams({ strict: false }) as { id: string };
  const base = usePanelBase();
  const fn = useServerFn(getLead);
  const q = useQuery({
    queryKey: ["operator-lead-quickactions", id],
    queryFn: () => fn({ data: { id } }),
  });
  const lead = (q.data as any)?.lead;
  const phone = lead?.phone_normalized as string | undefined;
  const email = lead?.email as string | undefined;
  const loanId = lead?.loan_application_id as string | undefined;

  return (
    <div className="space-y-4">
      <Link
        to={`${base}/leady` as any}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
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
              <Link to={`${base}/wnioski/${loanId}` as any}>
                <Button size="sm" variant="outline">
                  <FileText className="mr-2 h-4 w-4" /> Wniosek
                </Button>
              </Link>
            )}
            <Link to={`${base}/kreator-dokumentow` as any}>
              <Button size="sm" variant="secondary">
                <FileText className="mr-2 h-4 w-4" /> Wygeneruj dokument
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <LeadDetailView id={id} hideAdvancedTabs />
    </div>
  );
}
