// Panel weryfikacji tożsamości Didit (KYC/KYB) dla klienta AML.
// Uzupełnia screening Dilisense o realną weryfikację tożsamości: dokument +
// liveness + face match + AML (osoba fizyczna) lub KYB (firma). Sesję tworzy
// backend, link otwieramy w nowej karcie; wynik dostarcza webhook Didit.
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  startDiditVerification,
  listDiditVerifications,
  refreshDiditDecision,
} from "@/lib/didit.functions";
import { diditStatusLabel, diditStatusTone, type DiditStatusTone } from "@/lib/didit-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, RefreshCw, ExternalLink, Copy } from "lucide-react";

const TONE_CLASS: Record<DiditStatusTone, string> = {
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  muted: "bg-muted text-muted-foreground",
};

function DiditStatusBadge({ status }: { status: string }) {
  return <Badge className={TONE_CLASS[diditStatusTone(status)]}>{diditStatusLabel(status)}</Badge>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rekordy poza wygenerowanymi typami Database
type Verification = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rekord klienta AML (poza typami)
type Customer = Record<string, any>;

export function DiditKycPanel({ customer }: { customer: Customer }) {
  const start = useServerFn(startDiditVerification);
  const list = useServerFn(listDiditVerifications);
  const refresh = useServerFn(refreshDiditDecision);

  const [rows, setRows] = useState<Verification[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const isCompany = customer.entity_type === "firma";
  const kindLabel = isCompany ? "KYB" : "KYC";

  const reload = useCallback(async () => {
    try {
      const res = await list({ data: { customerId: customer.id } });
      setRows(res.verifications as Verification[]);
      setConfigured(res.configured);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd wczytywania weryfikacji Didit");
    } finally {
      setLoading(false);
    }
  }, [list, customer.id]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  const beginVerification = async () => {
    setBusy("start");
    try {
      const base = typeof window !== "undefined" ? window.location.origin : undefined;
      const res = await start({ data: { customerId: customer.id, callbackBase: base } });
      if (res.status === "not_configured") {
        setConfigured(false);
        toast.warning("Integracja Didit nie jest skonfigurowana (brak klucza/workflow).");
        return;
      }
      if (res.status === "ok") {
        window.open(res.url, "_blank", "noopener,noreferrer");
        toast.success(`Sesja ${kindLabel} utworzona — otwarto link weryfikacji`);
        await reload();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd tworzenia sesji Didit");
    } finally {
      setBusy(null);
    }
  };

  const refreshOne = async (sessionId: string) => {
    setBusy(`refresh-${sessionId}`);
    try {
      const res = await refresh({ data: { sessionId } });
      if (res.status === "ok") {
        toast.success(`Status: ${diditStatusLabel(res.sessionStatus)}`);
        await reload();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd odświeżania decyzji");
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Skopiowano link weryfikacji");
    } catch {
      toast.error("Nie udało się skopiować linku");
    }
  };

  return (
    <div className="border rounded-md p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Weryfikacja tożsamości Didit ({kindLabel})
        </div>
        <Button size="sm" disabled={busy === "start"} onClick={() => void beginVerification()}>
          {busy === "start" ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <ShieldCheck className="h-3 w-3 mr-1" />
          )}
          Rozpocznij weryfikację
        </Button>
      </div>

      {!configured && (
        <p className="text-xs text-amber-600">
          Integracja Didit nie jest skonfigurowana. Ustaw sekrety środowiska{" "}
          <code>DIDIT_API_KEY</code>, <code>DIDIT_WORKFLOW_ID_KYC</code>,{" "}
          <code>DIDIT_WORKFLOW_ID_KYB</code> oraz <code>DIDIT_WEBHOOK_SECRET</code>, aby uruchomić
          realną weryfikację.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Brak sesji weryfikacji. Rozpocznij weryfikację {kindLabel}, aby potwierdzić tożsamość
          {isCompany ? " firmy" : " klienta"} przed zawarciem umowy.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((v) => (
            <div
              key={v.id}
              className="flex flex-wrap items-center gap-2 text-xs border-b last:border-b-0 pb-2 last:pb-0"
            >
              <DiditStatusBadge status={v.status} />
              <span className="uppercase text-muted-foreground">{v.workflow_type ?? "kyc"}</span>
              <span className="text-muted-foreground">
                {v.created_at ? new Date(v.created_at).toLocaleString("pl-PL") : ""}
              </span>
              <span className="flex-1" />
              {v.verification_url && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => window.open(v.verification_url, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" /> Otwórz
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => void copyLink(v.verification_url)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                disabled={busy === `refresh-${v.session_id}`}
                onClick={() => void refreshOne(v.session_id)}
              >
                {busy === `refresh-${v.session_id}` ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
