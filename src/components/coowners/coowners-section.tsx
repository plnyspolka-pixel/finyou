import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  Users,
  Briefcase,
  Landmark,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { runCoOwnersCheck, getCoOwnersCheck } from "@/lib/coowners/coowners.functions";
import type { CoOwnersAnalysis, CoOwnerRegistryCheck } from "@/lib/coowners/types";
import { ensureKwReady } from "@/lib/kw-ensure";

export function CoOwnersSection({ applicationId }: { applicationId: string }) {
  const fetchCheck = useServerFn(getCoOwnersCheck);
  const runCheck = useServerFn(runCoOwnersCheck);
  const [result, setResult] = useState<CoOwnersAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchCheck({ data: { applicationId } });
      setResult(r);
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

  const run = async () => {
    setRunning(true);
    setStage("Pobieranie treści księgi wieczystej…");
    try {
      const kw = await ensureKwReady(applicationId, {
        onStatus: (s) => {
          if (s === "processing") setStage("Pobieranie treści księgi wieczystej…");
          else if (s === "ready") setStage("KW pobrana — sprawdzanie rejestrów…");
        },
      });
      if (!kw.ok) {
        toast.error("Sprawdzenie przerwane — brak poprawnie pobranej KW", {
          description: kw.message,
        });
        return;
      }
      setStage("Sprawdzanie współwłaścicieli w CEIDG i KRS…");
      const computed = await runCheck({ data: { applicationId } });
      setResult(computed);
      toast.success("Sprawdzenie współwłaścicieli zakończone");
    } catch (e: any) {
      toast.error("Błąd sprawdzenia współwłaścicieli", { description: e?.message ?? String(e) });
    } finally {
      setStage(null);
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" /> Współwłaściciele — CEIDG i KRS
          </h3>
          <p className="text-xs text-muted-foreground">
            Osoby fizyczne z działu II księgi wieczystej (identyfikacja po PESEL z KW): działalność
            gospodarcza w CEIDG oraz obecność w KRS (weryfikacja oficjalnym odpisem po PESEL).
          </p>
        </div>
        <Button onClick={run} disabled={running} size="sm">
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {result ? "Sprawdź ponownie" : "Uruchom sprawdzenie"}
        </Button>
      </div>

      {running && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>
            {stage ?? "Trwa sprawdzanie rejestrów."} To może potrwać do minuty (KW Engine + CEIDG +
            KRS).
          </AlertDescription>
        </Alert>
      )}

      {!result && !running && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Brak wyników. Uruchom sprawdzenie, aby dla każdego współwłaściciela z działu II KW
            zweryfikować działalność gospodarczą (CEIDG) i obecność w KRS. Warunkiem startu jest
            poprawnie pobrana treść księgi wieczystej.
          </CardContent>
        </Card>
      )}

      {result && (
        <>
          {!result.available && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{result.summary}</AlertDescription>
            </Alert>
          )}

          {result.available && (
            <Card>
              <CardContent className="py-4 text-sm">
                <p>{result.summary}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  KW {result.kwNumber ?? "—"} · sprawdzono{" "}
                  {new Date(result.generatedAt).toLocaleString("pl-PL")}
                </p>
              </CardContent>
            </Card>
          )}

          {result.warnings.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc pl-5 space-y-1">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {result.checked.map((c, i) => (
            <CoOwnerCard key={i} owner={c} />
          ))}
        </>
      )}
    </div>
  );
}

function confidenceLabel(c: "high" | "medium" | "none"): string {
  if (c === "high") return "dopasowanie pewne (PESEL z KW zgodny z odpisem)";
  if (c === "medium") return "dopasowanie po imieniu i nazwisku";
  return "";
}

function CoOwnerCard({ owner }: { owner: CoOwnerRegistryCheck }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <UserRound className="h-4 w-4" />
          {owner.fullName ?? "Osoba nierozpoznana"}
          {owner.isPrimaryClient && <Badge variant="secondary">wnioskodawca</Badge>}
        </CardTitle>
        <CardDescription>
          {owner.peselMasked ? (
            <>
              PESEL (z działu II KW): {owner.peselMasked} {owner.peselValid ? "✓" : "✗ niepoprawny"}
              {owner.age != null && (
                <>
                  {" "}
                  · wiek {owner.age} {owner.sex ? `(${owner.sex})` : ""}
                </>
              )}
            </>
          ) : (
            "Brak numeru PESEL w dziale II KW"
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        {/* CEIDG */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Działalność gospodarcza (CEIDG):</span>
            {owner.ceidg.isEntrepreneur ? (
              <Badge variant="default">
                aktywna
                {owner.ceidg.company?.startDate ? ` od ${owner.ceidg.company.startDate}` : ""}
              </Badge>
            ) : owner.ceidg.available ? (
              <Badge variant="outline">
                {owner.ceidg.status === "brak" ? "brak wpisu" : owner.ceidg.status}
              </Badge>
            ) : (
              <span className="text-muted-foreground">nie sprawdzono</span>
            )}
            {owner.ceidg.available && owner.ceidg.matchConfidence !== "none" && (
              <span className="text-xs text-muted-foreground">
                (pewność dopasowania: {owner.ceidg.matchConfidence})
              </span>
            )}
          </div>
          {owner.ceidg.company && (
            <div className="text-xs text-muted-foreground pl-6">
              {[
                owner.ceidg.company.name,
                owner.ceidg.company.nip ? `NIP ${owner.ceidg.company.nip}` : null,
                owner.ceidg.company.pkdMain ? `PKD ${owner.ceidg.company.pkdMain}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
          {!owner.ceidg.isEntrepreneur && owner.ceidg.note && (
            <div className="text-xs text-muted-foreground pl-6">{owner.ceidg.note}</div>
          )}
        </div>

        {/* KRS */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Obecność w KRS:</span>
            {owner.krs.found ? (
              <Badge variant={owner.krs.matchConfidence === "high" ? "default" : "secondary"}>
                znaleziono ({owner.krs.hits.length})
              </Badge>
            ) : owner.krs.available ? (
              <Badge variant="outline">nie znaleziono</Badge>
            ) : (
              <span className="text-muted-foreground">nie sprawdzono</span>
            )}
            {owner.krs.found && (
              <span className="text-xs text-muted-foreground">
                {confidenceLabel(owner.krs.matchConfidence)}
              </span>
            )}
          </div>
          {owner.krs.hits.map((h, i) => (
            <div key={i} className="pl-6 text-xs flex items-center gap-2 flex-wrap">
              <a
                href={`https://wyszukiwarka-krs.ms.gov.pl/?searchType=numer&numer=${h.krs}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                KRS {h.krs}
              </a>
              <span className="font-medium">{h.companyName}</span>
              {h.role && <Badge variant="outline">{h.role}</Badge>}
              <Badge
                variant={
                  h.flags.bankruptcy || h.flags.liquidation
                    ? "destructive"
                    : h.companyStatus === "Aktywny"
                      ? "default"
                      : "secondary"
                }
              >
                {h.companyStatus}
              </Badge>
              {h.peselMatched && (
                <Badge variant="default" className="text-[10px]">
                  PESEL ✓
                </Badge>
              )}
            </div>
          ))}
          {!owner.krs.found && owner.krs.note && (
            <div className="text-xs text-muted-foreground pl-6">{owner.krs.note}</div>
          )}
        </div>

        {owner.notes.length > 0 && (
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            {owner.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
