// Ścieżka użytkownika PRZED aktywnym dostępem do modułu projektów:
// zablokowana karta + „Aplikuj o dostęp" → formularz → statusy aplikacji →
// KYC (Didit) → analiza compliance + akceptacja dokumentów → decyzja
// Finance You. Zakup szkolenia nie jest zakupem dostępu do projektów.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Lock,
  ShieldCheck,
  FileSignature,
  Clock,
  XCircle,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  submitModuleApplication,
  acceptModuleDocuments,
  startModuleKyc,
  refreshModuleKyc,
} from "@/lib/projects/module-access.functions";
import {
  MODULE_KYC_STATUS_LABELS,
  type ModuleKycStatus,
  type AcceptanceKind,
} from "@/lib/projects/module-types";
import { ModuleApplicationForm } from "./module-forms";

export interface ModuleStateView {
  status: string;
  kycStatus: ModuleKycStatus;
  screeningResult: string | null;
  suspendedReason: string | null;
  revokedReason: string | null;
  application: {
    id: string;
    status: string;
    adminNote: string | null;
    decisionReason: string | null;
  } | null;
  requiredDocuments: { kind: AcceptanceKind; label: string; version: string; accepted: boolean }[];
  allDocumentsAccepted: boolean;
}

export function ModuleGate({
  state,
  onChanged,
}: {
  state: ModuleStateView;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const submitFn = useServerFn(submitModuleApplication);
  const [submitting, setSubmitting] = useState(false);

  if (state.status === "course_user" || state.status === "module_application_rejected") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        {state.status === "module_application_rejected" && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <XCircle className="h-5 w-5 text-destructive" /> Aplikacja odrzucona
              </CardTitle>
              <CardDescription>
                {state.application?.decisionReason ||
                  "Twoja aplikacja o dostęp do modułu została odrzucona."}{" "}
                Możesz złożyć nową aplikację, jeżeli Twoja sytuacja się zmieniła.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
        <Card>
          <CardHeader className="items-center text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted">
              <Lock className="h-7 w-7 text-muted-foreground" />
            </div>
            <CardTitle>Zamknięty moduł projektów</CardTitle>
            <CardDescription>
              Dostęp do projektów pożyczkowych mają wyłącznie imiennie zweryfikowani i indywidualnie
              zatwierdzeni inwestorzy. Zakup szkolenia nie daje dostępu do modułu projektów —
              wymagane są: aplikacja, weryfikacja tożsamości (KYC), screening sankcyjny/PEP,
              akceptacja umowy dostępu, NDA i ostrzeżeń o ryzyku oraz ostateczna decyzja Finance
              You.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {showForm ? (
              <ModuleApplicationForm
                submitting={submitting}
                onSubmit={async (values) => {
                  setSubmitting(true);
                  try {
                    await submitFn({ data: values });
                    toast.success("Aplikacja została złożona.");
                    onChanged();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Nie udało się złożyć aplikacji.");
                  } finally {
                    setSubmitting(false);
                  }
                }}
              />
            ) : (
              <Button className="w-full" onClick={() => setShowForm(true)}>
                Aplikuj o dostęp
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.status === "module_application_pending") {
    const appStatus = state.application?.status;
    return (
      <StatusCard
        icon={<Clock className="h-7 w-7 text-amber-500" />}
        title="Aplikacja w trakcie oceny"
        description={
          appStatus === "needs_more_info"
            ? `Prosimy o uzupełnienie informacji: ${state.application?.decisionReason ?? state.application?.adminNote ?? "sprawdź wiadomość e-mail."}`
            : appStatus === "additional_review"
              ? "Twoja aplikacja została skierowana do dodatkowej analizy. Odezwiemy się po jej zakończeniu."
              : "Twoja aplikacja czeka na przegląd przez Finance You. Złożenie aplikacji nie gwarantuje dostępu."
        }
      />
    );
  }

  if (state.status === "kyc_pending") {
    return <KycStep state={state} onChanged={onChanged} />;
  }

  if (state.status === "compliance_review") {
    return <ComplianceStep state={state} onChanged={onChanged} />;
  }

  if (state.status === "access_suspended") {
    return (
      <StatusCard
        icon={<Lock className="h-7 w-7 text-amber-500" />}
        title="Dostęp czasowo zawieszony"
        description={
          state.suspendedReason ||
          "Twój dostęp do modułu został czasowo zawieszony. Skontaktuj się z Finance You."
        }
      />
    );
  }

  if (state.status === "access_revoked") {
    return (
      <StatusCard
        icon={<XCircle className="h-7 w-7 text-destructive" />}
        title="Dostęp cofnięty"
        description={
          state.revokedReason ||
          "Twój dostęp do modułu został cofnięty. Skontaktuj się z Finance You."
        }
      />
    );
  }

  return null;
}

function StatusCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader className="items-center text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted">
            {icon}
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {children && <CardContent className="space-y-4">{children}</CardContent>}
      </Card>
    </div>
  );
}

function KycStep({ state, onChanged }: { state: ModuleStateView; onChanged: () => void }) {
  const startFn = useServerFn(startModuleKyc);
  const refreshFn = useServerFn(refreshModuleKyc);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const res = await startFn({ data: { callbackBase: window.location.origin } });
      if (res.status === "not_configured") {
        toast.error(
          "Integracja Didit nie jest jeszcze skonfigurowana. Skontaktuj się z Finance You.",
        );
      } else if (res.status === "ok" && res.url) {
        window.open(res.url, "_blank", "noopener");
        toast.success("Otwarto weryfikację Didit w nowej karcie.");
      }
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się rozpocząć weryfikacji.");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      await refreshFn({});
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się odświeżyć statusu.");
    } finally {
      setBusy(false);
    }
  };

  const blocked = ["rejected", "expired"].includes(state.kycStatus);
  return (
    <StatusCard
      icon={<ShieldCheck className="h-7 w-7 text-primary" />}
      title="Weryfikacja tożsamości (KYC)"
      description={
        blocked
          ? "Weryfikacja zakończyła się negatywnie albo wygasła — dalsza aktywacja jest zablokowana. Skontaktuj się z Finance You."
          : "Twoja aplikacja została warunkowo zakwalifikowana. Kolejnym krokiem jest imienna weryfikacja tożsamości przez Didit (dokument + zdjęcie). Zapisujemy wyłącznie minimalny zakres danych weryfikacyjnych."
      }
    >
      <div className="flex items-center justify-center gap-2">
        <Badge variant="secondary">Status: {MODULE_KYC_STATUS_LABELS[state.kycStatus]}</Badge>
      </div>
      {!blocked && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={() => void start()} disabled={busy}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {state.kycStatus === "not_started" ? "Rozpocznij weryfikację" : "Kontynuuj weryfikację"}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => void refresh()}
            disabled={busy}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Odśwież status
          </Button>
        </div>
      )}
    </StatusCard>
  );
}

function ComplianceStep({ state, onChanged }: { state: ModuleStateView; onChanged: () => void }) {
  const acceptFn = useServerFn(acceptModuleDocuments);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const missing = state.requiredDocuments.filter((d) => !d.accepted);
  const allChecked = missing.every((d) => checked[d.kind]);

  const accept = async () => {
    setBusy(true);
    try {
      await acceptFn({ data: { kinds: missing.map((d) => d.kind) } });
      toast.success("Dokumenty zostały zaakceptowane.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać akceptacji.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <StatusCard
      icon={<FileSignature className="h-7 w-7 text-primary" />}
      title="Analiza compliance i dokumenty dostępu"
      description="Weryfikacja tożsamości zakończona. Trwa analiza wyników (screening sankcyjny i PEP). W międzyczasie zaakceptuj dokumenty wymagane do aktywacji — ostateczną decyzję o dostępie podejmuje Finance You; pozytywne KYC nie przyznaje dostępu automatycznie."
    >
      {state.allDocumentsAccepted ? (
        <div className="flex items-center justify-center gap-2 rounded-md border border-emerald-300/50 bg-emerald-500/10 p-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          Komplet dokumentów zaakceptowany. Czekamy na decyzję Finance You.
        </div>
      ) : (
        <div className="space-y-2">
          {missing.map((d) => (
            <label key={d.kind} className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <Checkbox
                checked={Boolean(checked[d.kind])}
                onCheckedChange={(c) => setChecked((p) => ({ ...p, [d.kind]: Boolean(c) }))}
              />
              <span>
                {d.label}{" "}
                <span className="text-xs text-muted-foreground">(wersja {d.version})</span>
              </span>
            </label>
          ))}
          <Button className="w-full" disabled={!allChecked || busy} onClick={() => void accept()}>
            Akceptuję powyższe dokumenty
          </Button>
        </div>
      )}
    </StatusCard>
  );
}
