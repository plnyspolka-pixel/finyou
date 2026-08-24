// Pełna karta projektu — dostępna WYŁĄCZNIE po „Interesuje mnie" (aktywne
// przypisanie w statusie `interested`). Trzy sekcje: szczegóły projektu,
// analiza ryzyka, kalkulator propozycji. Dostępność egzekwuje server function
// getFullProjectCard (właściciel + status + termin + wersja projektu).
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, FileText, ImageOff, MessageCircleQuestion, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getFullProjectCard,
  createInfoRequest,
  getProjectDocumentUrl,
} from "@/lib/projects/proposals.functions";
import type { RiskAnalysis } from "@/lib/projects/module-types";
import { RiskSection } from "@/components/projects/risk-section";
import { ProposalCalculator } from "@/components/projects/proposal-calculator";
import {
  ProposalScheduleTable,
  type ProposalScheduleRow,
} from "@/components/projects/proposal-schedule";
import { AssignmentCountdown } from "@/components/projects/countdown";
import { formatPLN } from "@/lib/labels";

export const Route = createFileRoute("/inwestor/projekty/oferta/$assignmentId")({
  component: FullProjectCard,
});

function FullProjectCard() {
  const { assignmentId } = Route.useParams();
  const navigate = useNavigate();
  const cardFn = useServerFn(getFullProjectCard);
  const infoFn = useServerFn(createInfoRequest);
  const docFn = useServerFn(getProjectDocumentUrl);

  const q = useQuery({
    queryKey: ["projects-full-card", assignmentId],
    queryFn: () => cardFn({ data: { assignmentId } }),
    retry: false,
  });

  const [infoOpen, setInfoOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);

  if (q.isLoading) return <p className="text-muted-foreground">Ładowanie…</p>;

  if (q.isError) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader className="items-center text-center">
          <ImageOff className="mx-auto h-8 w-8 text-muted-foreground" />
          <CardTitle className="text-lg">Projekt nie jest dostępny</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">
            {q.error instanceof Error ? q.error.message : "Nie udało się otworzyć projektu."}
          </p>
          <Button asChild variant="outline">
            <Link to="/inwestor/projekty">
              <ArrowLeft className="mr-2 h-4 w-4" /> Wróć do projektów
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const data = q.data as {
    serverNow: string;
    assignment: { id: string; status: string; proposalDeadlineAt: string | null };
    header: {
      photoUrl: string | null;
      amount: number;
      propertyTypeLabel: string;
      city: string;
      statusLabel: string;
    };
    details: Record<string, unknown> & { documents: { label: string; path: string }[] };
    risk: RiskAnalysis;
    calculator: {
      expectedAmount: number;
      defaultPeriodMonths: number;
      defaultInterestRatePercent: number;
      minPeriodMonths: number;
      maxPeriodMonths: number;
      maxLtvPercent: number;
      propertyValue: number | null;
    };
    proposals: {
      id: string;
      status: string;
      version: number;
      params: { amount?: number; periodMonths?: number; interestRatePercent?: number } | null;
      computed: {
        totalToRepay?: number;
        totalInterest?: number;
        totalCommission?: number;
        schedule?: ProposalScheduleRow[];
      } | null;
    }[];
    watermark: { name: string; accountId: string; date: string };
  };

  const d = data.details;
  const activeProposal = data.proposals.find(
    (p) => !["draft", "withdrawn", "rejected", "expired"].includes(p.status),
  );
  const submitted = Boolean(activeProposal);

  const openDoc = async (path: string) => {
    try {
      const res = await docFn({ data: { assignmentId, path } });
      window.open(res.url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się otworzyć dokumentu.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Nagłówek */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void navigate({ to: "/inwestor/projekty" })}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Do pozostałych kart
        </Button>
        {data.assignment.proposalDeadlineAt && !submitted && (
          <AssignmentCountdown
            expiresAt={data.assignment.proposalDeadlineAt}
            serverNow={data.serverNow}
            prefix="Na propozycję:"
          />
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="relative h-48 w-full sm:h-56">
          {data.header.photoUrl ? (
            <img
              src={data.header.photoUrl}
              alt="Nieruchomość"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-muted text-muted-foreground">
              <ImageOff className="h-8 w-8" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-white">
            <div className="text-3xl font-extrabold">{formatPLN(data.header.amount)}</div>
            <div className="text-sm">
              {data.header.propertyTypeLabel} · {data.header.city}
            </div>
          </div>
          <Badge className="absolute right-3 top-3">{data.header.statusLabel}</Badge>
        </div>
        <CardContent className="pt-4">
          <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Wyrażenie zainteresowania nie jest zobowiązaniem do udzielenia finansowania.
              Przeanalizuj projekt i przygotuj własną propozycję.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Sekcja 1: Szczegóły projektu */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Szczegóły projektu
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Detail label="Oczekiwana kwota finansowania" value={formatPLN(Number(d.amount))} />
            <Detail label="Cel finansowania" value={str(d.financingPurpose)} />
            <Detail
              label="Proponowany okres"
              value={d.periodMonths ? `${d.periodMonths} mies.` : "—"}
            />
            <Detail label="Rodzaj nieruchomości" value={data.header.propertyTypeLabel} />
            <Detail
              label="Miejscowość i region"
              value={[d.city, d.voivodeship].filter(Boolean).join(", ")}
            />
            <Detail
              label="Wartość nieruchomości"
              value={d.propertyValue != null ? formatPLN(Number(d.propertyValue)) : "—"}
            />
            <Detail label="Źródło wyceny" value={str(d.valuationSource)} />
            <Detail
              label="Proponowane LTV"
              value={d.ltvPercent != null ? `${d.ltvPercent}%` : "—"}
            />
            <Detail label="Rodzaj zabezpieczenia" value={str(d.securityType)} />
            <Detail label="Proponowane miejsce hipoteki" value={str(d.mortgagePosition)} />
            <Detail label="Inne obciążenia" value={str(d.otherEncumbrances)} />
            <Detail label="Forma działalności pożyczkobiorcy" value={str(d.borrowerBusinessForm)} />
            <Detail
              label="Oprocentowanie"
              value={d.interestRatePercent != null ? `${d.interestRatePercent}%` : "—"}
            />
            <Detail
              label="Status dokumentów"
              value={
                d.docsComplete ? "Kompletne" : str(d.docsCompletenessNote) || "Wymaga uzupełnienia"
              }
            />
          </dl>

          {data.details.documents.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-sm font-semibold">Dostępne dokumenty i raporty</div>
              <div className="flex flex-wrap gap-2">
                {data.details.documents.map((doc) => (
                  <Button
                    key={doc.path}
                    variant="outline"
                    size="sm"
                    onClick={() => void openDoc(doc.path)}
                  >
                    <FileText className="mr-1 h-4 w-4" /> {doc.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Dokumenty są poufne, oznaczone znakiem wodnym ({data.watermark.name}) i logowane.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sekcja 2: Analiza ryzyka */}
      <RiskSection risk={data.risk} />

      {/* „Poproś o dodatkowe informacje" */}
      <div>
        <Button variant="outline" onClick={() => setInfoOpen(true)}>
          <MessageCircleQuestion className="mr-2 h-4 w-4" /> Poproś o dodatkowe informacje
        </Button>
      </div>

      {/* Sekcja 3: Kalkulator propozycji */}
      {submitted ? (
        <Card>
          <CardHeader>
            <CardTitle>Propozycja złożona</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Twoja propozycja została przekazana do analizy. Nie jest to jeszcze zawarcie umowy
              pożyczki. Finance You skontaktuje się z Tobą po jej rozpatrzeniu.
            </p>
            {activeProposal?.computed?.schedule && activeProposal.computed.schedule.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Detail
                    label="Proponowana kwota"
                    value={formatPLN(activeProposal.params?.amount ?? 0)}
                  />
                  <Detail
                    label="Okres"
                    value={`${activeProposal.params?.periodMonths ?? "—"} mies.`}
                  />
                  <Detail
                    label="Suma odsetek"
                    value={formatPLN(activeProposal.computed.totalInterest ?? 0)}
                  />
                  <Detail
                    label="Całkowita spłata"
                    value={formatPLN(activeProposal.computed.totalToRepay ?? 0)}
                  />
                </div>
                <div className="text-sm font-semibold">Harmonogram spłat</div>
                <ProposalScheduleTable schedule={activeProposal.computed.schedule} />
              </div>
            )}
            <Button asChild variant="outline">
              <Link to="/inwestor/projekty/propozycje">Zobacz status w „Moje propozycje”</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ProposalCalculator
          assignmentId={assignmentId}
          ctx={data.calculator}
          disabled={false}
          onSubmitted={() => void q.refetch()}
        />
      )}

      {/* Modal pytania */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Poproś o dodatkowe informacje</DialogTitle>
            <DialogDescription>
              Twoje pytanie trafi do obsługi Finance You. Nie ujawniamy na tym etapie danych
              kontaktowych pożyczkobiorcy.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            placeholder="Czego jeszcze potrzebujesz do oceny projektu?"
          />
          <Button
            disabled={question.trim().length < 5 || sending}
            onClick={async () => {
              setSending(true);
              try {
                await infoFn({ data: { assignmentId, question: question.trim() } });
                toast.success("Pytanie zostało przekazane.");
                setQuestion("");
                setInfoOpen(false);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Nie udało się wysłać pytania.");
              } finally {
                setSending(false);
              }
            }}
          >
            Wyślij pytanie
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function str(v: unknown): string {
  return v == null || v === "" ? "—" : String(v);
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
