// Widok beneficjentów rzeczywistych z CRBR + przycisk odświeżenia.
// Dane pochodzą z oficjalnego API Ministerstwa Finansów (SOAP 1.2, publiczne).
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { getCrbrForCompany, refreshCrbrForCompany } from "@/lib/crbr.functions";

type Beneficiary = {
  firstName: string;
  lastName: string;
  pesel?: string | null;
  dateOfBirth?: string | null;
  citizenships?: string[];
  countryOfResidence?: string | null;
  role?: string | null;
  sharePercent?: number | null;
};

type Representative = {
  firstName: string;
  lastName: string;
  function?: string | null;
  citizenships?: string[];
};

type CrbrData =
  | {
      status: "ok";
      cached: boolean;
      fetchedAt: string;
      expiresAt: string;
      requestId?: string | null;
      requestDate?: string | null;
      company: any;
      beneficialOwners: Beneficiary[];
      representatives: Representative[];
    }
  | { status: "not_found"; cached: boolean; fetchedAt: string; message: string }
  | { status: "multiple"; matches: any[]; message: string }
  | { status: "invalid_input"; code: string; message: string }
  | { status: "error"; code: string; message: string }
  | null;

export function CrbrBeneficiariesCard({
  nip,
  canRefresh = false,
  initialData,
}: {
  nip: string;
  canRefresh?: boolean;
  initialData?: CrbrData;
}) {
  const getFn = useServerFn(getCrbrForCompany);
  const refreshFn = useServerFn(refreshCrbrForCompany);
  const [data, setData] = useState<CrbrData>(initialData ?? null);
  const [busy, setBusy] = useState(false);

  const load = async (force = false) => {
    if (!nip) return;
    setBusy(true);
    try {
      const res = force ? await refreshFn({ data: { nip } }) : await getFn({ data: { nip } });
      setData(res as CrbrData);
      if (force) toast.success("Odświeżono CRBR");
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd CRBR");
    } finally {
      setBusy(false);
    }
  };

  if (!data && !busy) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" /> CRBR — beneficjenci rzeczywiści
          </span>
          <Button size="sm" variant="secondary" onClick={() => void load(false)} disabled={!nip}>
            Sprawdź CRBR
          </Button>
        </div>
      </div>
    );
  }

  if (busy && !data) {
    return (
      <div className="rounded-lg border p-3 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Sprawdzam CRBR…
      </div>
    );
  }

  if (!data) return null;

  const badge =
    data.status === "ok" ? (
      <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
        <ShieldCheck className="h-3 w-3" /> CRBR OK
      </Badge>
    ) : data.status === "not_found" ? (
      <Badge variant="secondary" className="gap-1">
        <ShieldAlert className="h-3 w-3" /> Brak wpisu w CRBR
      </Badge>
    ) : (
      <Badge variant="destructive" className="gap-1">
        <ShieldAlert className="h-3 w-3" /> Błąd CRBR
      </Badge>
    );

  return (
    <div className="rounded-lg border p-3 text-sm space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 flex-wrap">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">CRBR — beneficjenci rzeczywiści</span>
          {badge}
        </div>
        {canRefresh && data.status !== "invalid_input" && (
          <Button size="sm" variant="ghost" onClick={() => void load(true)} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {data.status === "ok" && (
        <>
          {data.beneficialOwners.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Brak zgłoszonych beneficjentów w aktualnym wpisie.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.beneficialOwners.map((b, i) => (
                <li key={i} className="rounded-md bg-muted/40 px-2 py-1.5">
                  <div className="font-medium">
                    {b.firstName} {b.lastName}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                    {b.role && <span>{b.role}</span>}
                    {typeof b.sharePercent === "number" && <span>Udział: {b.sharePercent}%</span>}
                    {b.citizenships?.length ? (
                      <span>Obywatelstwa: {b.citizenships.join(", ")}</span>
                    ) : null}
                    {b.countryOfResidence && <span>Kraj zam.: {b.countryOfResidence}</span>}
                    {b.dateOfBirth && <span>Ur.: {b.dateOfBirth}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data.representatives?.length ? (
            <div className="pt-1">
              <div className="text-[11px] font-medium text-muted-foreground mb-1">Zgłaszający</div>
              <ul className="text-[11px] text-muted-foreground space-y-0.5">
                {data.representatives.map((r, i) => (
                  <li key={i}>
                    {r.firstName} {r.lastName}
                    {r.function ? ` — ${r.function}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-[10px] text-muted-foreground">
            Źródło: CRBR Ministerstwa Finansów · cache 90 dni · pobrano{" "}
            {new Date(data.fetchedAt).toLocaleDateString("pl-PL")}
            {data.cached ? " (z cache)" : ""}
          </p>
        </>
      )}

      {data.status === "not_found" && (
        <p className="text-xs text-muted-foreground">{data.message}</p>
      )}

      {data.status === "multiple" && (
        <p className="text-xs text-muted-foreground">{data.message}</p>
      )}

      {(data.status === "error" || data.status === "invalid_input") && (
        <p className="text-xs text-destructive">
          {data.code}: {data.message}
        </p>
      )}
    </div>
  );
}
