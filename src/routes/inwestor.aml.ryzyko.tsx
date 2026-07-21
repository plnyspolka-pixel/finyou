// Oceny ryzyka — system proponuje poziom, inwestor podejmuje ostateczną
// decyzję; każda ręczna zmiana wymaga uzasadnienia.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listAmlCustomers,
  proposeAmlRisk,
  decideAmlRisk,
  listAmlRiskAssessments,
} from "@/lib/aml/aml-customers.functions";
import { RISK_LEVEL_LABELS, type AmlRiskLevel } from "@/lib/aml/aml-types";
import type { RiskProposal } from "@/lib/aml/risk-proposal";
import { RiskBadge, AmlEmptyState, amlCustomerLabel } from "@/components/aml/aml-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Scale } from "lucide-react";

export const Route = createFileRoute("/inwestor/aml/ryzyko")({
  component: AmlRiskScreen,
});

function AmlRiskScreen() {
  const fetchCustomers = useServerFn(listAmlCustomers);
  const propose = useServerFn(proposeAmlRisk);
  const decide = useServerFn(decideAmlRisk);
  const fetchAssessments = useServerFn(listAmlRiskAssessments);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
  const [customers, setCustomers] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
  const [assessments, setAssessments] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [proposal, setProposal] = useState<RiskProposal | null>(null);
  const [finalLevel, setFinalLevel] = useState<AmlRiskLevel | "">("");
  const [justification, setJustification] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([fetchCustomers(), fetchAssessments()]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
      setCustomers(c.customers as any[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
      setAssessments(a.assessments as any[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd wczytywania");
    } finally {
      setLoading(false);
    }
  }, [fetchCustomers, fetchAssessments]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const runProposal = async () => {
    if (!customerId) {
      toast.error("Wybierz klienta");
      return;
    }
    setBusy(true);
    try {
      const res = await propose({ data: { customerId } });
      setProposal(res.proposal);
      setFinalLevel(res.proposal.level);
      setJustification("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd propozycji ryzyka");
    } finally {
      setBusy(false);
    }
  };

  const saveDecision = async () => {
    if (!proposal || !finalLevel) return;
    if (finalLevel !== proposal.level && !justification.trim()) {
      toast.error("Ręczna zmiana poziomu ryzyka wymaga uzasadnienia");
      return;
    }
    setBusy(true);
    try {
      await decide({
        data: {
          customerId,
          proposedLevel: proposal.level,
          proposedFactors: proposal.factors,
          finalLevel,
          overrideJustification: justification.trim() || undefined,
        },
      });
      toast.success("Ocena ryzyka zapisana");
      setProposal(null);
      setFinalLevel("");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd zapisu oceny");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Scale className="h-5 w-5" /> Oceny ryzyka
      </h2>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Nowa ocena</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="w-72">
              <Label>Klient</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz klienta…" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {amlCustomerLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => void runProposal()} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Zaproponuj ocenę
            </Button>
          </div>

          {proposal && (
            <div className="border rounded-md p-3 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span>Propozycja systemu:</span>
                <RiskBadge level={proposal.level} />
                <span className="text-muted-foreground">({proposal.score} pkt)</span>
              </div>
              {proposal.factors.length > 0 ? (
                <ul className="list-disc ml-5 text-muted-foreground">
                  {proposal.factors.map((f) => (
                    <li key={f.factor}>
                      {f.factor} (+{f.weight}){f.note ? ` — ${f.note}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Brak czynników podwyższających ryzyko.</p>
              )}
              <div className="flex flex-wrap gap-2 items-end">
                <div className="w-56">
                  <Label>Ostateczna decyzja inwestora</Label>
                  <Select
                    value={finalLevel}
                    onValueChange={(v) => setFinalLevel(v as AmlRiskLevel)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(RISK_LEVEL_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {finalLevel && proposal.level !== finalLevel && (
                  <div className="flex-1 min-w-64">
                    <Label>Uzasadnienie zmiany (wymagane)</Label>
                    <Textarea
                      rows={2}
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                    />
                  </div>
                )}
                <Button onClick={() => void saveDecision()} disabled={busy}>
                  Zapisz ocenę
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Historia ocen</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : assessments.length === 0 ? (
            <AmlEmptyState>Brak ocen ryzyka.</AmlEmptyState>
          ) : (
            <div className="space-y-2 text-sm">
              {assessments.map((a) => (
                <div key={a.id} className="border rounded-md p-2 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{amlCustomerLabel(a.aml_customers)}</span>
                  <span className="text-muted-foreground">propozycja:</span>
                  <RiskBadge level={a.proposed_level} />
                  <span className="text-muted-foreground">decyzja:</span>
                  <RiskBadge level={a.final_level} />
                  {a.override_justification && (
                    <span className="text-muted-foreground">— {a.override_justification}</span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("pl-PL")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
