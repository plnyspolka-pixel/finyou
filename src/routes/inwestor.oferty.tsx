import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileSignature, FileDown } from "lucide-react";
import { toast } from "sonner";
import { formatPLN, offerStatusLabels, formatDate } from "@/lib/labels";
import { downloadOfferPdf } from "@/lib/offer-pdf";
import { ApplicationInfoBadges } from "@/components/application-info-badges";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";

export const Route = createFileRoute("/inwestor/oferty")({
  component: InwestorOferty,
});

function InwestorOferty() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [offers, setOffers] = useState<any[]>([]);
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: inv } = await supabase
        .from("investors")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!inv) return;
      const { data } = await supabase
        .from("investor_offers")
        .select(
          "*, loan_application:loan_applications(id, is_startup, startup_funding_dependency, business_status, business_legal_form, nip, business_nip_verified_at, investor_purpose, client:clients(bik_report_uploaded_at, bank_account_verified_at, phone_verified_at))",
        )
        .eq("investor_id", inv.id)
        .order("created_at", { ascending: false });
      setOffers(data ?? []);
    })();
  }, [user]);
  const accepted = offers.filter((o) => o.offer_status === "zaakceptowana_przez_klienta");
  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Twoje portfolio"
        title={`Moje oferty (${offers.length})`}
        subtitle="Oferty wysłane do klientów — śledź statusy i podpisuj umowy."
      />
      {accepted.length > 0 && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="pt-6 text-sm space-y-3">
            <div>
              <p className="font-medium text-emerald-700 dark:text-emerald-300">
                {accepted.length === 1
                  ? "Klient zaakceptował Twoją ofertę — uzupełnij dane do umowy."
                  : `Klienci zaakceptowali ${accepted.length} Twoich ofert — uzupełnij dane do umów.`}
              </p>
              <p className="text-muted-foreground mt-1">
                Uzupełnij swoje dane (adres, rachunek bankowy, reprezentacja). Klient uzupełnia
                swoje pola równolegle. Gdy obie strony skończą — umowa będzie gotowa do podpisu.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {accepted.map((o) => (
                <Button
                  key={o.id}
                  size="sm"
                  variant="default"
                  onClick={() =>
                    void navigate({ to: "/inwestor/umowa/$offerId", params: { offerId: o.id } })
                  }
                >
                  <FileSignature className="mr-2 h-4 w-4" />
                  Umowa {formatPLN(o.proposed_amount)}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Kwota</TableHead>
                  <TableHead>Okres</TableHead>
                  <TableHead>Zysk</TableHead>
                  <TableHead>Rata</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((o) => (
                  <Fragment key={o.id}>
                    <TableRow>
                      <TableCell>{formatDate(o.created_at)}</TableCell>
                      <TableCell>{formatPLN(o.proposed_amount)}</TableCell>
                      <TableCell>{o.period_months} mies.</TableCell>
                      <TableCell>{o.expected_yearly_yield ?? "—"}%</TableCell>
                      <TableCell>{formatPLN(o.estimated_monthly_payment)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            o.offer_status === "zaakceptowana_przez_klienta"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {offerStatusLabels[o.offer_status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            title="Pobierz PDF oferty z pełnym harmonogramem spłat"
                            onClick={() => {
                              if (!downloadOfferPdf(o)) {
                                toast.error("Oferta nie ma kompletu danych do wygenerowania PDF.");
                              }
                            }}
                          >
                            <FileDown className="mr-1 h-3.5 w-3.5" />
                            PDF
                          </Button>
                          {o.offer_status === "zaakceptowana_przez_klienta" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void navigate({
                                  to: "/inwestor/umowa/$offerId",
                                  params: { offerId: o.id },
                                })
                              }
                            >
                              <FileSignature className="mr-1 h-3.5 w-3.5" />
                              Umowa
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {o.loan_application && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={7} className="pt-0 pb-3">
                          <ApplicationInfoBadges
                            app={o.loan_application}
                            client={o.loan_application.client}
                            loanApplicationId={o.loan_application.id}
                            variant="compact"
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
