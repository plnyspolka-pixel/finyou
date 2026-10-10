import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { FileSignature, FileDown, FilePen, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { formatPLN, offerStatusLabels, formatDate, propertyTypeLabels } from "@/lib/labels";
import { buildOfferPdfPayload, downloadOfferPdf } from "@/lib/offer-pdf";
import { saveCalcHandoff } from "@/lib/loan-calc-handoff";
import {
  getOfferContractContext,
  type OfferContractContext,
} from "@/lib/offer-contract-handoff.functions";
import { ApplicationInfoBadges } from "@/components/application-info-badges";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import {
  ProjectPhotoGallery,
  ProjectPhotoThumbs,
} from "@/components/inwestor/project-photo-gallery";
import {
  getMyInvestorOffers,
  type MyOfferRow,
} from "@/lib/investor-agreements/order-projects.functions";

export const Route = createFileRoute("/inwestor/oferty")({
  component: InwestorOferty,
});

function InwestorOferty() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Przez serwer: prowizja, dane Projektu i podpisane zdjęcia (także dla ofert
  // złożonych z „Moich zleceń" bez abonamentu).
  const fetchOffers = useServerFn(getMyInvestorOffers);
  const offersQ = useQuery({
    queryKey: ["my-investor-offers", user?.id],
    queryFn: () => fetchOffers(),
    enabled: !!user,
  });
  const offers: MyOfferRow[] = offersQ.data ?? [];

  // „Stwórz umowę": pełne dane klienta + KW + złożona oferta → kreator umowy.
  const fetchContractCtx = useServerFn(getOfferContractContext);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const createContract = async (offerId: string) => {
    setCreatingFor(offerId);
    try {
      const ctx = await fetchContractCtx({ data: { offerId } });
      const payload = buildOfferPdfPayload(ctx.offer);
      if (!payload) {
        toast.error("Oferta nie ma kompletu parametrów do umowy.");
        return;
      }
      payload.clientName = ctx.client.fullName || null;
      saveCalcHandoff(payload, contractContextText(ctx));
      void navigate({ to: "/inwestor/dokumenty", hash: "kreator-umowy" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się przygotować umowy.");
    } finally {
      setCreatingFor(null);
    }
  };
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
                  <TableHead>Prowizja</TableHead>
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
                        <Commission amount={o.proposed_amount} commission={o.commission} />
                      </TableCell>
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
                              title="Otwórz kreator umowy z danymi klienta, KW i parametrami tej oferty"
                              disabled={creatingFor === o.id}
                              onClick={() => void createContract(o.id)}
                            >
                              {creatingFor === o.id ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <FilePen className="mr-1 h-3.5 w-3.5" />
                              )}
                              Stwórz umowę
                            </Button>
                          )}
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
                        <TableCell colSpan={8} className="pt-0 pb-4">
                          {o.project ? <OfferProject project={o.project} /> : null}
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

function Commission({ amount, commission }: { amount: number | null; commission: number | null }) {
  if (commission == null) return <span className="text-muted-foreground">—</span>;
  const pct = amount ? (Number(commission) / Number(amount)) * 100 : null;
  return (
    <span>
      {formatPLN(commission)}
      {pct != null && Number.isFinite(pct) ? (
        <span className="text-muted-foreground"> ({pct.toFixed(1).replace(".", ",")}%)</span>
      ) : null}
    </span>
  );
}

// Dane Projektu jak w „Moich zleceniach" — bez danych identyfikujących właściciela.
function OfferProject({ project: p }: { project: NonNullable<MyOfferRow["project"]> }) {
  const [idx, setIdx] = useState(0);
  const location = [p.city, p.voivodeship].filter(Boolean).join(", ");
  const typeLabel = p.propertyType ? (propertyTypeLabels[p.propertyType] ?? p.propertyType) : null;
  return (
    <div className="mb-3 grid gap-4 rounded-md border bg-muted/20 p-3 sm:grid-cols-[140px_1fr]">
      <ProjectPhotoGallery photos={p.photos} index={idx} onIndexChange={setIdx} />
      <div className="space-y-1.5 text-sm">
        <div className="font-medium">
          Projekt{typeLabel ? <span className="text-muted-foreground"> · {typeLabel}</span> : null}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span>
            <span className="text-muted-foreground">Wnioskowana kwota: </span>
            <b>{formatPLN(p.loanAmount)}</b>
          </span>
          {p.estimatedValue ? (
            <span>
              <span className="text-muted-foreground">Wartość nieruchomości: </span>
              <b>{formatPLN(p.estimatedValue)}</b>
            </span>
          ) : null}
          {p.areaSqm ? (
            <span>
              <span className="text-muted-foreground">Powierzchnia: </span>
              <b>{p.areaSqm} m²</b>
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {location}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> KW: {p.kwMasked ?? "brak"}
          </span>
        </div>
        {p.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
        ) : null}
        <ProjectPhotoThumbs photos={p.photos} index={idx} onIndexChange={setIdx} />
      </div>
    </div>
  );
}

/** Blok danych stron i nieruchomości do pierwszej wiadomości agenta umowy. */
function contractContextText(ctx: OfferContractContext): string {
  const c = ctx.client;
  const p = ctx.property;
  const line = (k: string, v: string | number | null | undefined) =>
    v != null && String(v).trim() !== "" ? `• ${k}: ${v}` : null;
  const lines = [
    "Dane pożyczkobiorcy (z wniosku):",
    line("Imię i nazwisko", c.fullName),
    line("PESEL", c.pesel),
    line("Adres", c.address),
    line("Telefon", c.phone),
    line("E-mail", c.email),
    line("Firma", c.companyName),
    line("NIP", c.nip),
    line("REGON", c.regon),
    line("KRS", c.krs),
    line("Rachunek bankowy", c.bankAccount),
  ];
  if (p) {
    lines.push(
      "",
      "Nieruchomość (zabezpieczenie):",
      line("Numer(y) KW", p.landRegisterNumbers.join(", ")),
      line("Adres", p.address),
      line("Rodzaj", p.type ? (propertyTypeLabels[p.type] ?? p.type) : null),
      line("Powierzchnia", p.areaSqm ? `${p.areaSqm} m²` : null),
      line("Szacowana wartość", p.estimatedValue ? formatPLN(p.estimatedValue) : null),
      p.hasMortgage != null ? `• Obciążona hipoteką: ${p.hasMortgage ? "tak" : "nie"}` : null,
      p.hasCoOwners != null ? `• Współwłaściciele: ${p.hasCoOwners ? "tak" : "nie"}` : null,
    );
  }
  return lines.filter((l): l is string => l !== null).join("\n");
}
