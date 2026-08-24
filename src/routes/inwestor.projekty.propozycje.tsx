// „Moje propozycje" — statusy propozycji finansowania złożonych przez
// inwestora w zamkniętym module projektów.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CalendarRange, FileText, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ProposalScheduleTable,
  type ProposalScheduleRow,
} from "@/components/projects/proposal-schedule";
import { listMyProposals, withdrawProposal } from "@/lib/projects/proposals.functions";
import { PROPOSAL_STATUS_LABELS, type ProposalStatus } from "@/lib/projects/module-types";
import { formatPLN } from "@/lib/labels";

export const Route = createFileRoute("/inwestor/projekty/propozycje")({
  component: MyProposals,
});

const WITHDRAWABLE: ProposalStatus[] = [
  "submitted",
  "under_review",
  "additional_information_required",
  "counteroffer",
];

function statusTone(status: ProposalStatus): "default" | "secondary" | "destructive" | "outline" {
  if (["accepted", "converted_to_transaction", "accepted_for_negotiation"].includes(status)) {
    return "default";
  }
  if (["rejected", "expired", "withdrawn"].includes(status)) return "destructive";
  return "secondary";
}

function MyProposals() {
  const listFn = useServerFn(listMyProposals);
  const withdrawFn = useServerFn(withdrawProposal);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["projects-my-proposals"], queryFn: () => listFn() });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scheduleOpenId, setScheduleOpenId] = useState<string | null>(null);

  const proposals = ((q.data as { proposals?: unknown[] } | undefined)?.proposals ?? []) as {
    id: string;
    assignment_id: string;
    version: number;
    status: ProposalStatus;
    params: { amount?: number; periodMonths?: number; interestRatePercent?: number };
    computed: {
      totalToRepay?: number;
      investorAnnualReturnPercent?: number;
      schedule?: ProposalScheduleRow[];
    };
    submitted_at: string | null;
    valid_until: string | null;
    decision_reason: string | null;
    counteroffer: Record<string, unknown> | null;
    created_at: string;
    project: { amount: number; propertyTypeLabel: string; city: string } | null;
  }[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Moje propozycje</h1>
          <p className="text-sm text-muted-foreground">
            Propozycja nie jest umową pożyczki — o dalszych krokach poinformuje Cię Finance You.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/inwestor/projekty">
            <ArrowLeft className="mr-2 h-4 w-4" /> Projekty
          </Link>
        </Button>
      </div>

      {q.isLoading ? (
        <p className="text-muted-foreground">Ładowanie…</p>
      ) : proposals.length === 0 ? (
        <Card>
          <CardHeader className="items-center text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
            <CardTitle className="text-lg">Nie złożyłeś jeszcze żadnej propozycji</CardTitle>
            <CardDescription>
              Po wyrażeniu zainteresowania projektem przygotujesz propozycję w pełnej karcie
              projektu.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {p.project
                      ? `${p.project.propertyTypeLabel}, ${p.project.city}`
                      : "Projekt inwestycyjny"}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      wersja {p.version}
                    </span>
                  </CardTitle>
                  <Badge variant={statusTone(p.status)}>
                    {PROPOSAL_STATUS_LABELS[p.status] ?? p.status}
                  </Badge>
                </div>
                {p.decision_reason && (
                  <CardDescription>Uwagi Finance You: {p.decision_reason}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Fact label="Proponowana kwota" value={formatPLN(p.params?.amount ?? 0)} />
                  <Fact label="Okres" value={`${p.params?.periodMonths ?? "—"} mies.`} />
                  <Fact label="Oprocentowanie" value={`${p.params?.interestRatePercent ?? "—"}%`} />
                  <Fact
                    label="Orient. stopa zwrotu"
                    value={
                      p.computed?.investorAnnualReturnPercent != null
                        ? `${p.computed.investorAnnualReturnPercent}% rocznie`
                        : "—"
                    }
                  />
                </div>
                {p.status === "counteroffer" && p.counteroffer && (
                  <div className="rounded-md border border-amber-300/50 bg-amber-500/10 p-3 text-sm">
                    <div className="font-medium">Kontrpropozycja Finance You</div>
                    <pre className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                      {JSON.stringify(p.counteroffer, null, 2)}
                    </pre>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Aby odpowiedzieć, wycofaj obecną propozycję i złóż nową wersję w pełnej karcie
                      projektu.
                    </p>
                  </div>
                )}
                {scheduleOpenId === p.id &&
                  p.computed?.schedule &&
                  p.computed.schedule.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-semibold">Harmonogram spłat</div>
                      <ProposalScheduleTable schedule={p.computed.schedule} />
                    </div>
                  )}
                <div className="flex flex-wrap gap-2">
                  {(p.computed?.schedule?.length ?? 0) > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setScheduleOpenId((cur) => (cur === p.id ? null : p.id))}
                    >
                      <CalendarRange className="mr-1 h-4 w-4" />
                      {scheduleOpenId === p.id ? "Ukryj harmonogram" : "Harmonogram spłat"}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      to="/inwestor/projekty/oferta/$assignmentId"
                      params={{ assignmentId: p.assignment_id }}
                    >
                      Otwórz pełną kartę
                    </Link>
                  </Button>
                  {WITHDRAWABLE.includes(p.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === p.id}
                      onClick={async () => {
                        setBusyId(p.id);
                        try {
                          await withdrawFn({ data: { proposalId: p.id } });
                          toast.success("Propozycja wycofana.");
                          void qc.invalidateQueries({ queryKey: ["projects-my-proposals"] });
                        } catch (e) {
                          toast.error(
                            e instanceof Error ? e.message : "Nie udało się wycofać propozycji.",
                          );
                        } finally {
                          setBusyId(null);
                        }
                      }}
                    >
                      <Undo2 className="mr-1 h-4 w-4" /> Wycofaj
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
