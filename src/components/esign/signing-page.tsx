// Strona podpisującego (bez logowania): dokument → tożsamość (Didit) →
// w czyim imieniu → oświadczenia + kod jednorazowy → „Podpisuję”.
// Jedno źródło stanu: getSigningSession (odświeżane po każdej akcji).
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  PenLine,
  ShieldCheck,
  Smartphone,
  User,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  chooseSigningCapacity,
  confirmSignature,
  getSigningDocument,
  getSigningSession,
  rejectSigning,
  refreshSignerIdentity,
  requestSigningOtp,
  startSignerIdentity,
  type SigningSession,
} from "@/lib/esign/esign-public.functions";
import {
  capacityLabel,
  formatSignedAt,
  pagesLabel,
  requiredStatements,
  SIGNER_STATUS_LABELS,
  type SignedCapacity,
  type StatementKey,
} from "@/lib/esign/esign-core";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Wystąpił błąd";
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

function FyMark() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-lg bg-[oklch(0.28_0.12_265)] text-sm font-black tracking-tight text-white shadow">
      FY
    </span>
  );
}

export function SigningPage({ token }: { token: string }) {
  const qc = useQueryClient();
  const fetchSession = useServerFn(getSigningSession);
  const refreshIdentity = useServerFn(refreshSignerIdentity);
  const session = useQuery({
    queryKey: ["esign-session", token],
    queryFn: () => fetchSession({ data: { token } }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["esign-session", token] });

  // Powrót z Didit (?didit=return) i odpytywanie w trakcie weryfikacji.
  const diditReturn = useMemo(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("didit") === "return",
    [],
  );
  const polledRef = useRef(0);
  const status = session.data?.signer.status;
  useEffect(() => {
    if (!session.data) return;
    if (diditReturn && polledRef.current === 0) {
      polledRef.current = 1;
      void refreshIdentity({ data: { token } }).then(() => invalidate());
    }
    if (status !== "weryfikacja") return;
    const id = window.setInterval(() => {
      polledRef.current += 1;
      if (polledRef.current > 150) return window.clearInterval(id);
      void refreshIdentity({ data: { token } }).then((r) => {
        if (r.signer.status !== "weryfikacja") invalidate();
      });
    }, 6000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, diditReturn, session.data?.signer.id]);

  if (session.isLoading) {
    return (
      <Shell>
        <div className="grid min-h-[50vh] place-items-center text-muted-foreground">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Wczytywanie dokumentu…
          </div>
        </div>
      </Shell>
    );
  }
  if (session.isError || !session.data) {
    return (
      <Shell>
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" /> Link nieaktywny
            </CardTitle>
            <CardDescription>{errMsg(session.error)}</CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    );
  }

  const data = session.data;
  return (
    <Shell>
      <Header data={data} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <DocumentViewer token={token} data={data} />
        <div className="space-y-4">
          <SigningSteps token={token} data={data} onChanged={invalidate} />
          <OthersCard data={data} />
          <LegalNote data={data} />
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(120%_80%_at_50%_-10%,oklch(0.93_0.03_265),transparent_60%)]">
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-10">{children}</div>
    </div>
  );
}

function Header({ data }: { data: SigningSession }) {
  const e = data.envelope;
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <FyMark />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Finance You · Podpis dokumentowy
          </p>
          <h1 className="text-xl font-bold leading-tight md:text-2xl">{e.title}</h1>
          <p className="text-sm text-muted-foreground">
            ID {e.publicId} · nadawca: {e.senderName ?? e.senderEmail ?? "Finance You"} ·{" "}
            {pagesLabel(e.pageCount)}
          </p>
        </div>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        <div className="flex items-center justify-end gap-1">
          <Clock className="h-3.5 w-3.5" /> ważne do {formatSignedAt(e.expiresAt).split(" (")[0]}
        </div>
        <StatusBadge status={data.signer.status} envelopeStatus={e.status} />
      </div>
    </header>
  );
}

function StatusBadge({ status, envelopeStatus }: { status: string; envelopeStatus: string }) {
  if (envelopeStatus === "zakonczona")
    return (
      <Badge className="mt-1 bg-emerald-100 text-emerald-800">
        Dokument podpisany przez wszystkich
      </Badge>
    );
  if (envelopeStatus === "anulowana")
    return (
      <Badge variant="secondary" className="mt-1">
        Anulowany przez nadawcę
      </Badge>
    );
  if (envelopeStatus === "wygasla")
    return (
      <Badge variant="secondary" className="mt-1">
        Termin minął
      </Badge>
    );
  if (envelopeStatus === "odrzucona")
    return (
      <Badge variant="destructive" className="mt-1">
        Odrzucony
      </Badge>
    );
  const label = SIGNER_STATUS_LABELS[status as keyof typeof SIGNER_STATUS_LABELS] ?? status;
  return (
    <Badge variant="outline" className="mt-1">
      {label}
    </Badge>
  );
}

function DocumentViewer({ token, data }: { token: string; data: SigningSession }) {
  const fetchDoc = useServerFn(getSigningDocument);
  const signedReady = data.envelope.status === "zakonczona" && data.envelope.finalAvailable;
  const which = signedReady ? "podpisany" : "zrodlo";
  const doc = useQuery({
    queryKey: ["esign-doc", token, which],
    queryFn: () => fetchDoc({ data: { token, which } }),
    staleTime: Infinity,
    retry: false,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!doc.data) return;
    const u = URL.createObjectURL(base64ToBlob(doc.data.base64, doc.data.contentType));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [doc.data]);

  const download = () => {
    if (!url || !doc.data) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.data.filename;
    a.click();
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />{" "}
            {signedReady ? "Podpisany dokument" : "Dokument do podpisu"}
          </CardTitle>
          <CardDescription className="truncate">
            {doc.data?.filename ?? data.envelope.sourceFilename}
            {doc.data?.sha256 ? ` · SHA-256 ${doc.data.sha256.slice(0, 16)}…` : ""}
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!url}
            onClick={() => url && window.open(url, "_blank", "noopener")}
          >
            <ExternalLink className="mr-1 h-4 w-4" /> Otwórz
          </Button>
          <Button size="sm" variant="outline" disabled={!url} onClick={download}>
            <Download className="mr-1 h-4 w-4" /> Pobierz
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {doc.isLoading ? (
          <div className="grid h-[60vh] place-items-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : doc.isError ? (
          <div className="p-6 text-sm text-destructive">{errMsg(doc.error)}</div>
        ) : url ? (
          <iframe
            title="Dokument"
            src={`${url}#toolbar=0&view=FitH`}
            className="h-[70vh] w-full bg-muted/40 lg:h-[78vh]"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── kroki ──────────────────────────────────────────────────────────────────

function StepHeader({
  n,
  title,
  done,
  active,
}: {
  n: number;
  title: string;
  done?: boolean;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={
          "grid h-6 w-6 place-items-center rounded-full text-xs font-bold " +
          (done
            ? "bg-emerald-600 text-white"
            : active
              ? "bg-[oklch(0.28_0.12_265)] text-white"
              : "bg-muted text-muted-foreground")
        }
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : n}
      </span>
      <h3 className="font-semibold">{title}</h3>
    </div>
  );
}

function SigningSteps({
  token,
  data,
  onChanged,
}: {
  token: string;
  data: SigningSession;
  onChanged: () => void;
}) {
  const s = data.signer;
  const e = data.envelope;
  const closed = e.status !== "wyslana";

  if (s.status === "podpisany") return <SignedCard data={data} token={token} />;
  if (s.status === "odrzucony") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <XCircle className="h-5 w-5 text-destructive" /> Odmówiłeś(-aś) podpisu
          </CardTitle>
          <CardDescription>{s.rejectionReason}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (closed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dokument nie jest już dostępny do podpisu</CardTitle>
          <CardDescription>
            {e.status === "anulowana"
              ? "Nadawca anulował ten dokument."
              : e.status === "wygasla"
                ? "Minął termin podpisania. Poproś nadawcę o nową wysyłkę."
                : e.status === "odrzucona"
                  ? "Jedna ze stron odmówiła podpisu — dokument został zamknięty."
                  : "Skontaktuj się z nadawcą."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (!s.turnActive) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Jeszcze nie Twoja kolej</CardTitle>
          <CardDescription>
            Dokument jest podpisywany kolejno. Dostaniesz e-mail, gdy przyjdzie Twoja kolej — ten
            link będzie wtedy aktywny.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const identityDone = s.status === "zweryfikowany";
  const needsCapacity = s.capacityMode === "wybor";
  const capacityDone = !needsCapacity || Boolean(s.signedCapacity);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <PenLine className="h-4 w-4" /> Podpisz dokument
        </CardTitle>
        <CardDescription>
          Podpisujesz jako <strong>{s.fullName}</strong>
          {s.roleLabel ? ` (${s.roleLabel})` : ""}. Nie musisz zakładać konta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <IdentityStep token={token} data={data} onChanged={onChanged} />
        {identityDone && needsCapacity ? (
          <CapacityStep token={token} data={data} onChanged={onChanged} />
        ) : null}
        {identityDone && !needsCapacity ? <CapacityInfo data={data} /> : null}
        {identityDone && capacityDone ? (
          <SignStep token={token} data={data} onChanged={onChanged} />
        ) : null}
        <RejectLink token={token} onChanged={onChanged} />
      </CardContent>
    </Card>
  );
}

function IdentityStep({
  token,
  data,
  onChanged,
}: {
  token: string;
  data: SigningSession;
  onChanged: () => void;
}) {
  const s = data.signer;
  const start = useServerFn(startSignerIdentity);
  const refresh = useServerFn(refreshSignerIdentity);
  const startMut = useMutation({
    mutationFn: () => start({ data: { token } }),
    onSuccess: (res) => {
      if (res.status === "not_configured") {
        toast.error("Weryfikacja tożsamości nie jest skonfigurowana — skontaktuj się z nadawcą.");
        return;
      }
      if (res.status === "already") {
        onChanged();
        return;
      }
      // Ten sam ekran: po zakończeniu Didit wraca pod ?didit=return.
      window.location.href = res.url;
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const refreshMut = useMutation({
    mutationFn: () => refresh({ data: { token } }),
    onSuccess: (res) => {
      if (res.signer.status === "zweryfikowany") toast.success("Tożsamość potwierdzona.");
      else if (res.signer.status === "niezgodnosc")
        toast.warning("Dane z dokumentu różnią się od danych nadawcy.");
      else toast.info("Weryfikacja jeszcze trwa.");
      onChanged();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const done = s.status === "zweryfikowany";
  return (
    <section className="space-y-3">
      <StepHeader n={1} title="Potwierdź tożsamość" done={done} active={!done} />
      {done && s.identity ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-emerald-900">
            <ShieldCheck className="h-4 w-4" /> {s.identity.fullName ?? s.fullName}
          </div>
          <p className="mt-1 text-emerald-900/80">{s.identityDescription}</p>
          {s.identityMismatchNote ? (
            <p className="mt-1 text-xs text-emerald-900/70">{s.identityMismatchNote}</p>
          ) : null}
        </div>
      ) : s.status === "niezgodnosc" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" /> Dane nie zgadzają się z dokumentem tożsamości
          </div>
          <p className="mt-1">
            Nadawca wskazał „{s.fullName}”, a dokument tożsamości: „{s.identity?.fullName ?? "—"}”.
            Nadawca został powiadomiony i rozstrzygnie różnicę (np. drugie nazwisko). Odśwież tę
            stronę za chwilę.
          </p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => onChanged()}>
            Odśwież
          </Button>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Zrobisz zdjęcie dokumentu tożsamości i krótkie selfie (Didit). Trwa to ok. 2 minuty,
            najwygodniej na telefonie. Dane z dokumentu posłużą wyłącznie do ustalenia osoby
            składającej podpis (art. 77² KC).
          </p>
          {s.diditStatus === "Declined" ? (
            <p className="text-destructive">
              Poprzednia próba została odrzucona (np. nieczytelne zdjęcie). Spróbuj ponownie.
            </p>
          ) : null}
          {s.diditStatus === "In Review" ? (
            <p className="text-amber-700">
              Weryfikacja trafiła do ręcznej analizy — zwykle trwa to do kilkunastu minut.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => startMut.mutate()}
              disabled={startMut.isPending || !data.diditConfigured}
            >
              {startMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              {s.status === "weryfikacja" ? "Wróć do weryfikacji" : "Potwierdź tożsamość (Didit)"}
            </Button>
            {s.diditSessionId ? (
              <Button
                variant="ghost"
                onClick={() => refreshMut.mutate()}
                disabled={refreshMut.isPending}
              >
                {refreshMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sprawdź status
              </Button>
            ) : null}
          </div>
          {!data.diditConfigured ? (
            <p className="text-xs text-destructive">
              Weryfikacja tożsamości jest chwilowo niedostępna.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function CapacityInfo({ data }: { data: SigningSession }) {
  const s = data.signer;
  const cap: SignedCapacity =
    s.capacityMode === "firma"
      ? { mode: "firma", company: s.company ?? null }
      : { mode: "osoba", company: null };
  return (
    <section className="space-y-2">
      <StepHeader n={2} title="W czyim imieniu" done />
      <p className="flex items-start gap-2 text-sm">
        {cap.mode === "firma" ? (
          <Building2 className="mt-0.5 h-4 w-4" />
        ) : (
          <User className="mt-0.5 h-4 w-4" />
        )}
        <span>
          {cap.mode === "firma"
            ? capacityLabel(s.fullName, cap)
            : `${s.fullName} — we własnym imieniu`}
        </span>
      </p>
    </section>
  );
}

function CapacityStep({
  token,
  data,
  onChanged,
}: {
  token: string;
  data: SigningSession;
  onChanged: () => void;
}) {
  const s = data.signer;
  const choose = useServerFn(chooseSigningCapacity);
  const mut = useMutation({
    mutationFn: (mode: "osoba" | "firma") => choose({ data: { token, mode } }),
    onSuccess: () => onChanged(),
    onError: (e) => toast.error(errMsg(e)),
  });
  const company = data.capacityOptions.company;
  const current = s.signedCapacity?.mode ?? "";
  return (
    <section className="space-y-3">
      <StepHeader
        n={2}
        title="W czyim imieniu podpisujesz?"
        done={Boolean(current)}
        active={!current}
      />
      <RadioGroup
        value={current}
        onValueChange={(v) => mut.mutate(v as "osoba" | "firma")}
        className="gap-2"
      >
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-[[data-state=checked]]:border-primary">
          <RadioGroupItem value="osoba" className="mt-0.5" />
          <span>
            <span className="flex items-center gap-1 font-medium">
              <User className="h-4 w-4" /> We własnym imieniu
            </span>
            <span className="text-muted-foreground">{s.fullName} — jako osoba fizyczna</span>
          </span>
        </label>
        {company ? (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-[[data-state=checked]]:border-primary">
            <RadioGroupItem value="firma" className="mt-0.5" />
            <span>
              <span className="flex items-center gap-1 font-medium">
                <Building2 className="h-4 w-4" /> W imieniu: {company.name}
              </span>
              <span className="text-muted-foreground">
                {[
                  company.nip ? `NIP ${company.nip}` : null,
                  company.krs ? `KRS ${company.krs}` : null,
                  company.role,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </label>
        ) : null}
      </RadioGroup>
      {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
    </section>
  );
}

function SignStep({
  token,
  data,
  onChanged,
}: {
  token: string;
  data: SigningSession;
  onChanged: () => void;
}) {
  const s = data.signer;
  const requestOtp = useServerFn(requestSigningOtp);
  const confirm = useServerFn(confirmSignature);
  const capacity: SignedCapacity | null =
    s.capacityMode === "wybor"
      ? (s.signedCapacity as SignedCapacity | null)
      : s.capacityMode === "firma"
        ? { mode: "firma", company: s.company ?? null }
        : { mode: "osoba", company: null };
  const required = requiredStatements(capacity);
  // § 15 ust. 7 — checkboxy startują PUSTE.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [code, setCode] = useState("");
  const [channel, setChannel] = useState<"sms" | "email">(s.hasPhone ? "sms" : "email");
  const allChecked = required.every((k) => checked[k]);

  const otpMut = useMutation({
    mutationFn: () => requestOtp({ data: { token, channel } }),
    onSuccess: (r) => {
      toast.success(
        r.channel === "sms"
          ? `Kod wysłany SMS-em na ${r.target}`
          : `Kod wysłany e-mailem na ${r.target}`,
      );
      onChanged();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const signMut = useMutation({
    mutationFn: () => confirm({ data: { token, code, statements: checked } }),
    onSuccess: (r) => {
      toast.success("Dokument podpisany.");
      if (r.finalized) toast.info("Wszyscy podpisali — podpisany plik został wysłany e-mailem.");
      onChanged();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const otpSent = Boolean(s.otp?.sentAt);
  return (
    <section className="space-y-4">
      <StepHeader n={3} title="Oświadczenia i podpis" active />
      <div className="space-y-2">
        {required.map((k: StatementKey) => (
          <label key={k} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
            <Checkbox
              checked={Boolean(checked[k])}
              onCheckedChange={(v) => setChecked((c) => ({ ...c, [k]: v === true }))}
              className="mt-0.5"
            />
            <span>{s.statements[k]}</span>
          </label>
        ))}
      </div>

      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-sm font-medium">Kod jednorazowy</p>
        <p className="text-xs text-muted-foreground">
          Potwierdza, że to Ty kontrolujesz wskazany kanał kontaktu. Kod jest ważny 10 minut.
        </p>
        {s.hasPhone ? (
          <RadioGroup
            value={channel}
            onValueChange={(v) => setChannel(v as "sms" | "email")}
            className="mt-2 flex gap-4"
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="sms" /> <Smartphone className="h-4 w-4" /> SMS ({s.phoneMasked}
              )
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="email" /> <Mail className="h-4 w-4" /> e-mail
            </label>
          </RadioGroup>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            variant={otpSent ? "outline" : "default"}
            size="sm"
            onClick={() => otpMut.mutate()}
            disabled={otpMut.isPending || !allChecked}
          >
            {otpMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {otpSent ? "Wyślij kod ponownie" : "Wyślij kod"}
          </Button>
          {otpSent && s.otp ? (
            <span className="text-xs text-muted-foreground">
              Wysłano {s.otp.channel === "sms" ? "SMS-em" : "e-mailem"} na {s.otp.target}
            </span>
          ) : null}
        </div>
        {!allChecked ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Najpierw zaznacz wszystkie oświadczenia.
          </p>
        ) : null}
        {otpSent ? (
          <div className="mt-3">
            <Label className="text-xs">Wpisz 6-cyfrowy kod</Label>
            <InputOTP maxLength={6} value={code} onChange={setCode} containerClassName="mt-1">
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
        ) : null}
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={!allChecked || code.length !== 6 || signMut.isPending}
        onClick={() => signMut.mutate()}
      >
        {signMut.isPending ? (
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        ) : (
          <PenLine className="mr-2 h-5 w-5" />
        )}
        Podpisuję
      </Button>
      <p className="text-xs text-muted-foreground">
        Kliknięcie „Podpisuję” składa oświadczenie woli w formie dokumentowej. Zapiszemy czas (UTC),
        adres IP, przeglądarkę, dane z weryfikacji tożsamości oraz treść oświadczeń — znajdziesz je
        w Karcie podpisów dołączonej do podpisanego pliku.
      </p>
    </section>
  );
}

function RejectLink({ token, onChanged }: { token: string; onChanged: () => void }) {
  const reject = useServerFn(rejectSigning);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const mut = useMutation({
    mutationFn: () => reject({ data: { token, reason } }),
    onSuccess: () => {
      toast.success("Przekazaliśmy odmowę nadawcy.");
      setOpen(false);
      onChanged();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <>
      <button
        type="button"
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
      >
        Nie zgadzam się z treścią — odmawiam podpisu
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Odmowa podpisu</DialogTitle>
            <DialogDescription>
              Nadawca dostanie Twoją odpowiedź, a dokument zostanie zamknięty. Po poprawkach nadawca
              wyśle nową wersję.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Powód (wymagany)"
            rows={4}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Wróć
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3 || mut.isPending}
              onClick={() => mut.mutate()}
            >
              {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Odmawiam podpisu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SignedCard({ data, token }: { data: SigningSession; token: string }) {
  const s = data.signer;
  const e = data.envelope;
  const fetchDoc = useServerFn(getSigningDocument);
  const dl = useMutation({
    mutationFn: () => fetchDoc({ data: { token, which: "podpisany" } }),
    onSuccess: (d) => {
      const u = URL.createObjectURL(base64ToBlob(d.base64, d.contentType));
      const a = document.createElement("a");
      a.href = u;
      a.download = d.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 10_000);
    },
    onError: (err) => toast.error(errMsg(err)),
  });
  return (
    <Card className="border-emerald-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-emerald-800">
          <CheckCircle2 className="h-5 w-5" /> Twój podpis został złożony
        </CardTitle>
        <CardDescription>
          {formatSignedAt(s.signedAt)}
          {s.signedCapacity
            ? ` · ${capacityLabel(s.identity?.fullName ?? s.fullName, s.signedCapacity)}`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {e.status === "zakonczona" ? (
          <>
            <p>
              Wszystkie strony podpisały dokument. Podpisany plik (ze znacznikami na każdej stronie
              i Kartą podpisów) został wysłany na Twój e-mail.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => dl.mutate()} disabled={dl.isPending || !e.finalAvailable}>
                {dl.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Pobierz podpisany dokument
              </Button>
              <Button variant="outline" asChild>
                <a href={e.verifyUrl} target="_blank" rel="noreferrer">
                  <ShieldCheck className="mr-2 h-4 w-4" /> Strona weryfikacji
                </a>
              </Button>
            </div>
            {e.finalSha256 ? (
              <p className="break-all text-xs text-muted-foreground">
                SHA-256 podpisanego pliku: {e.finalSha256}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground">
            Czekamy na podpisy pozostałych osób. Gdy wszyscy podpiszą, dostaniesz e-mail z
            podpisanym plikiem.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function OthersCard({ data }: { data: SigningSession }) {
  if (data.others.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Pozostali podpisujący</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {data.others.map((o, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span>
              {o.fullName}
              {o.roleLabel ? <span className="text-muted-foreground"> · {o.roleLabel}</span> : null}
            </span>
            <span className="text-xs text-muted-foreground">
              {o.status === "podpisany"
                ? `podpisał(a) ${formatSignedAt(o.signedAt).split(" (")[0]}`
                : (SIGNER_STATUS_LABELS[o.status as keyof typeof SIGNER_STATUS_LABELS] ?? o.status)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function LegalNote({ data }: { data: SigningSession }) {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      Podpis składany w tym module jest podpisem elektronicznym (art. 3 pkt 10 eIDAS) w formie
      dokumentowej (art. 77² KC). Tożsamość potwierdza zdalna weryfikacja dokumentu tożsamości
      (Didit), a kontrolę kanału — kod jednorazowy. Każda strona otrzyma podpisany plik e-mailem;
      autentyczność sprawdzisz pod adresem{" "}
      <a className="underline" href={data.envelope.verifyUrl} target="_blank" rel="noreferrer">
        {data.envelope.verifyUrl.replace(/^https?:\/\//, "")}
      </a>
      . Operator: {data.envelope.operatorName}.
    </p>
  );
}
