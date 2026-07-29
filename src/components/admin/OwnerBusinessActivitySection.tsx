import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BriefcaseBusiness, CheckCircle2, Loader2, RefreshCw, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getOwnerBusinessCheck,
  refreshOwnerBusinessCheck,
} from "@/lib/owner-business-check.functions";
import type { CeidgActivity } from "@/lib/risk-assessment/types";
import type { OwnerBusinessCheckPayload } from "@/lib/owner-business-check.types";

const NO_ACTIVITY_DATA: CeidgActivity = {
  available: false,
  queried: "none",
  isEntrepreneur: false,
  status: "nieznany",
  matchConfidence: "none",
  activeCount: 0,
  company: null,
  note: "Brak danych — odśwież sprawdzenie.",
};

function queriedLabel(value: string) {
  if (value === "nip") return "NIP";
  if (value === "name") return "imię i nazwisko";
  return "brak zapytania";
}

function confidenceLabel(value: string) {
  if (value === "high") return "wysoka";
  if (value === "medium") return "średnia";
  if (value === "low") return "niska";
  return "brak";
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pl-PL");
}

export function OwnerBusinessActivitySection({ applicationId }: { applicationId: string }) {
  const fetchCheck = useServerFn(getOwnerBusinessCheck);
  const runCheck = useServerFn(refreshOwnerBusinessCheck);
  const [result, setResult] = useState<OwnerBusinessCheckPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const refresh = async (auto = false) => {
    setRunning(true);
    try {
      const fresh = (await runCheck({ data: { applicationId } })) as OwnerBusinessCheckPayload;
      setResult(fresh);
      if (!auto) toast.success("Sprawdzenie działalności odświeżone");
    } catch (e) {
      if (!auto) {
        toast.error("Nie udało się sprawdzić działalności", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    } finally {
      setRunning(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const cached = (await fetchCheck({
        data: { applicationId },
      })) as OwnerBusinessCheckPayload | null;
      setResult(cached);
      if (!cached || cached.stale) void refresh(!cached);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie sprawdzenia działalności…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <BriefcaseBusiness className="h-5 w-5" /> Działalność gospodarcza właścicieli
          </h3>
          <p className="text-xs text-muted-foreground">
            Osobne sprawdzenie właścicieli z działu II KW, niezależne od zakładki Analiza KW.
          </p>
        </div>
        <Button onClick={() => refresh()} disabled={running} size="sm">
          {running ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {result ? "Odśwież" : "Sprawdź"}
        </Button>
      </div>

      {!result ? (
        <Alert>
          <ShieldQuestion className="h-4 w-4" />
          <AlertDescription>
            Brak zapisanego wyniku. Kliknij „Sprawdź" po pobraniu treści KW.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Wynik sprawdzenia</CardTitle>
              <CardDescription>
                Ostatnie sprawdzenie: {formatDate(result.checkedAt)} · cache do:{" "}
                {formatDate(result.cacheUntil)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(result.owners ?? []).length === 0 ? (
                <p className="text-muted-foreground">Nie rozpoznano właścicieli do sprawdzenia.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {(result.owners ?? []).map((owner) => {
                    // Starsze wpisy cache mogą nie mieć pola activity — bez tego
                    // fallbacku render wywalał cały widok (undefined.isEntrepreneur).
                    const activity = owner.activity ?? NO_ACTIVITY_DATA;
                    return (
                      <div key={owner.fullName} className="rounded-md border p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <b>{owner.fullName}</b>
                          {activity.isEntrepreneur ? (
                            <Badge>
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> przedsiębiorca
                            </Badge>
                          ) : activity.available ? (
                            <Badge variant="outline">brak aktywnej działalności</Badge>
                          ) : (
                            <Badge variant="secondary">nie sprawdzono</Badge>
                          )}
                        </div>
                        {activity.company && (
                          <div className="rounded-md bg-muted/40 p-2 text-xs">
                            <div className="font-medium">{activity.company.name ?? "Firma"}</div>
                            <div className="text-muted-foreground">
                              Status: {activity.status} · od: {activity.company.startDate ?? "—"} ·
                              REGON: {activity.company.regon ?? "—"}
                            </div>
                            {activity.company.pkdMain && (
                              <div className="text-muted-foreground">
                                PKD: {activity.company.pkdMain}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>Zapytanie: {queriedLabel(activity.queried)}</span>
                          <span>Pewność: {confidenceLabel(activity.matchConfidence)}</span>
                          <span>Aktywne wpisy: {activity.activeCount}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{activity.note}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {(result.notes ?? []).length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {(result.notes ?? []).map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Alert>
            <ShieldQuestion className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {(result.limitations ?? []).join(" ")}
            </AlertDescription>
          </Alert>
        </>
      )}
    </div>
  );
}
