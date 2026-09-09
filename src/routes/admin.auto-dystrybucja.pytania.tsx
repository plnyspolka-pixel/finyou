// Auto-dystrybucja → Pytania instytucji do klientów (poziom 2).
// Pełny widok pętli: pytania scalone z maili instytucji → wiadomość do
// klienta → odpowiedź → odesłanie do wszystkich pytających. Pokazuje realny
// stan (a nie samą kolumnę `status`), powód, gdy wysyłka się nie udała, oraz
// pytania, na które odpowiada biuro, a nie klient.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, RefreshCw, Send, Check, AlertTriangle, PauseCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ClientFilesButton } from "@/components/admin/ClientFilesButton";
import { propertyPhotos } from "@/lib/property-photos";
import {
  getInstitutionMailSettings,
  setInstitutionMailOutboundPaused,
  listInstitutionQaThreads,
  sendQaThreadNow,
  closeQaThread,
  setOfficeQuestionHandled,
  runInstitutionMailAgentNow,
} from "@/lib/institution-mail-agent/institution-mail.functions";
import type { QaThreadStateKey } from "@/lib/institution-mail-agent/qa-questions";

export const Route = createFileRoute("/admin/auto-dystrybucja/pytania")({
  component: PytaniaPage,
});

const STATE_TONE: Record<QaThreadStateKey, "default" | "secondary" | "destructive" | "outline"> = {
  zablokowane: "destructive",
  do_wyslania: "default",
  czeka: "default",
  czesciowo: "secondary",
  przekazane: "secondary",
  zamkniete: "outline",
};

/** Kolejność pracy: najpierw to, co stoi, na końcu to, co zamknięte. */
const STATE_ORDER: QaThreadStateKey[] = [
  "zablokowane",
  "do_wyslania",
  "czesciowo",
  "czeka",
  "przekazane",
  "zamkniete",
];

const CHANNEL_LABELS: Record<string, string> = {
  email: "e-mail",
  messenger: "Messenger",
};

function fmt(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleString("pl-PL") : "—";
}

function daysAgo(d: string | null | undefined): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

function clientName(t: any): string {
  const c = t.loan?.client;
  const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : "";
  return name || "Wniosek bez danych klienta";
}

function PytaniaPage() {
  const qc = useQueryClient();
  const fetchThreads = useServerFn(listInstitutionQaThreads);
  const runAgent = useServerFn(runInstitutionMailAgentNow);
  const { data: threads, isLoading } = useQuery({
    queryKey: ["institution-qa-threads"],
    queryFn: () => fetchThreads(),
  });
  const [running, setRunning] = useState(false);

  const rows = ((threads ?? []) as any[])
    .slice()
    .sort(
      (a, b) =>
        STATE_ORDER.indexOf(a.state?.key) - STATE_ORDER.indexOf(b.state?.key) ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  const blocked = rows.filter((t) => t.state?.needsAttention);

  const onRun = async () => {
    setRunning(true);
    try {
      const res: any = await runAgent();
      toast.success(
        `Maile: ${res.inbox.classified} sklasyfikowanych · do klientów: ${res.outreach.sent} ` +
          `(przypomnienia: ${res.outreach.reminders}) · odpowiedzi przekazane: ${res.forwarding.forwarded}` +
          (res.outreach.blocked + res.forwarding.blocked > 0
            ? ` · zablokowane: ${res.outreach.blocked + res.forwarding.blocked}`
            : "") +
          (res.outreach.paused + res.forwarding.paused > 0
            ? ` · czeka na zatwierdzenie: ${res.outreach.paused + res.forwarding.paused}`
            : ""),
      );
      void qc.invalidateQueries({ queryKey: ["institution-qa-threads"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 h-7 px-2">
            <Link to="/admin/auto-dystrybucja">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Auto-dystrybucja
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Pytania instytucji do klientów</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Agent scala pytania z maili instytucji — jeden temat to jedno pytanie, nawet gdy pyta o
            nie kilka instytucji. Pytania, na które odpowiedź mamy u siebie (treść KW, status
            wniosku), zostają w biurze. Do klienta idzie jedna zbiorcza wiadomość na dobę, po trzech
            dniach ciszy jedno przypomnienie. Odpowiedź wraca do wszystkich pytających.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRun} disabled={running}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
          {running ? "Przetwarzam…" : "Uruchom agenta teraz"}
        </Button>
      </div>

      <OutboundGateCard pausedThreads={rows.filter((t) => t.state?.key === "do_wyslania").length} />

      {blocked.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Nie dotarło do klienta ({blocked.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {blocked.map((t) => (
              <div key={t.id}>
                <span className="font-medium">{clientName(t)}</span>{" "}
                <span className="text-muted-foreground">— {t.blocked_reason}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Wczytuję wątki…</p>}
      {!isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Brak wątków pytań. Agent sprawdza skrzynkę instytucji co 15 minut.
          </CardContent>
        </Card>
      )}

      {rows.map((t) => (
        <ThreadCard key={t.id} thread={t} />
      ))}
    </div>
  );
}

/**
 * Stop-klatka: dopóki jest włączona, agent zbiera i przygotowuje pytania, ale
 * nic nie wychodzi bez kliknięcia operatora. Decyzje operatora są materiałem
 * do nauki modelu, który ma później przejąć proces.
 */
function OutboundGateCard({ pausedThreads }: { pausedThreads: number }) {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getInstitutionMailSettings);
  const setPaused = useServerFn(setInstitutionMailOutboundPaused);
  const { data: settings } = useQuery({
    queryKey: ["institution-mail-settings"],
    queryFn: () => fetchSettings(),
  });
  const [busy, setBusy] = useState(false);
  const paused = settings?.outbound_paused ?? true;

  return (
    <Card className={paused ? "border-amber-400/60 bg-amber-50/40 dark:bg-amber-500/5" : undefined}>
      <CardContent className="flex flex-wrap items-center gap-3 py-3 text-sm">
        <PauseCircle
          className={`h-4 w-4 ${paused ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
        />
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {paused
              ? "Wysyłka automatyczna wstrzymana — wysyłasz Ty"
              : "Wysyłka automatyczna włączona — agent wysyła sam"}
          </div>
          <div className="text-xs text-muted-foreground">
            {paused
              ? `Agent zbiera maile instytucji, scala pytania i przygotowuje treści; nic nie idzie ` +
                `do klienta ani do instytucji bez Twojego „Wyślij teraz". ` +
                (pausedThreads > 0 ? `Czeka na Ciebie: ${pausedThreads}.` : "Nic nie czeka.")
              : "Agent wysyła zbiorcze pytania (maks. raz na dobę) i odsyła odpowiedzi instytucjom bez pytania Cię o zdanie."}
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <Switch
            checked={!paused}
            disabled={busy}
            onCheckedChange={async (next) => {
              setBusy(true);
              try {
                await setPaused({ data: { paused: !next } });
                toast.success(next ? "Automat włączony" : "Automat wstrzymany");
                void qc.invalidateQueries({ queryKey: ["institution-mail-settings"] });
              } catch (e: any) {
                toast.error(e?.message ?? "Błąd");
              } finally {
                setBusy(false);
              }
            }}
          />
          Automat
        </label>
      </CardContent>
    </Card>
  );
}

function ThreadCard({ thread }: { thread: any }) {
  const qc = useQueryClient();
  const sendNow = useServerFn(sendQaThreadNow);
  const close = useServerFn(closeQaThread);
  const setHandled = useServerFn(setOfficeQuestionHandled);
  const [busy, setBusy] = useState(false);

  const state = thread.state ?? { key: "czeka", label: thread.status, needsAttention: false };
  const questions = (thread.questions ?? []) as any[];
  const office = (thread.office_questions ?? []) as any[];
  const officeOpen = office.filter((q) => !q.handled_at);
  const sentDays = daysAgo(thread.last_sent_to_client_at);
  const isFinal = thread.status === "przekazane" || thread.status === "zamkniete";

  const refresh = () => void qc.invalidateQueries({ queryKey: ["institution-qa-threads"] });

  const onSend = async () => {
    setBusy(true);
    try {
      const res: any = await sendNow({ data: { threadId: thread.id } });
      if (res?.ok)
        toast.success(
          res.reminder
            ? `Przypomnienie wysłane (${CHANNEL_LABELS[res.channel] ?? res.channel})`
            : `Pytania wysłane (${CHANNEL_LABELS[res.channel] ?? res.channel})`,
        );
      else toast.error(res?.error ?? "Nie udało się wysłać");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd");
    } finally {
      setBusy(false);
    }
  };

  const onClose = async () => {
    setBusy(true);
    try {
      await close({ data: { threadId: thread.id } });
      toast.success("Wątek zamknięty");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATE_TONE[state.key as QaThreadStateKey] ?? "outline"}>
            {state.label}
          </Badge>
          <CardTitle className="text-base">{clientName(thread)}</CardTitle>
          {thread.client_channel && (
            <span className="text-xs text-muted-foreground">
              kanał: {CHANNEL_LABELS[thread.client_channel] ?? thread.client_channel}
            </span>
          )}
          <Link
            to="/admin/wnioski/$id"
            params={{ id: thread.loan_application_id }}
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            karta wniosku
          </Link>
          <span className="ml-auto text-xs text-muted-foreground">
            pytania z {fmt(thread.created_at)}
          </span>
          <ClientFilesButton
            loanApplicationId={thread.loan_application_id}
            clientId={thread.loan?.client?.id ?? null}
            photoPaths={propertyPhotos(thread.loan)}
            title={clientName(thread)}
          />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            wysłano do klienta: {fmt(thread.last_sent_to_client_at)}
            {sentDays != null && sentDays > 0 ? ` (${sentDays} dni temu)` : ""}
          </span>
          {thread.reminder_count > 0 && (
            <span>
              przypomnienia: {thread.reminder_count} (ostatnie {fmt(thread.last_reminder_at)})
            </span>
          )}
          {thread.forwarded_at && <span>przekazano instytucjom: {fmt(thread.forwarded_at)}</span>}
          {thread.attempt_count > 0 && !thread.blocked_reason && (
            <span>nieudane próby wcześniej: {thread.attempt_count}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {thread.blocked_reason && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-sm text-destructive">
            {thread.blocked_reason}
            {thread.last_attempt_at && (
              <span className="ml-1 text-xs opacity-80">
                (ostatnia próba: {fmt(thread.last_attempt_at)})
              </span>
            )}
          </div>
        )}

        <div>
          <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
            Do klienta ({questions.length})
          </div>
          <ul className="space-y-1 text-sm">
            {questions.map((q: any) => (
              <li key={q.key ?? q.text} className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={
                    q.answered_at ? "text-muted-foreground line-through" : "text-foreground"
                  }
                >
                  {q.text}
                </span>
                <span className="text-xs text-muted-foreground">({(q.from ?? []).join(", ")})</span>
                {q.answered_at ? (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    odpowiedziane
                  </Badge>
                ) : q.asked_client_at ? (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                    wysłane
                  </Badge>
                ) : (
                  <Badge className="h-5 px-1.5 text-[10px]">niewysłane</Badge>
                )}
              </li>
            ))}
            {questions.length === 0 && (
              <li className="text-sm text-muted-foreground">Brak pytań do klienta.</li>
            )}
          </ul>
        </div>

        {office.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              Do odpowiedzi przez biuro ({officeOpen.length} otwartych)
            </div>
            <ul className="space-y-1 text-sm">
              {office.map((q: any) => (
                <li key={q.key ?? q.text} className="flex items-start gap-2">
                  <Checkbox
                    className="mt-0.5"
                    checked={!!q.handled_at}
                    disabled={busy}
                    onCheckedChange={async (checked) => {
                      setBusy(true);
                      try {
                        await setHandled({
                          data: { threadId: thread.id, key: q.key, handled: checked === true },
                        });
                        refresh();
                      } catch (e: any) {
                        toast.error(e?.message ?? "Błąd");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                  <span className={q.handled_at ? "text-muted-foreground line-through" : ""}>
                    {q.text}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({(q.from ?? []).join(", ")})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {thread.client_answer && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              Odpowiedź klienta
            </div>
            <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2.5 text-sm">
              {thread.client_answer}
            </p>
          </div>
        )}

        {!isFinal && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onSend} disabled={busy}>
              <Send className="mr-1.5 h-3.5 w-3.5" />
              {busy ? "Wysyłam…" : "Wyślij teraz"}
            </Button>
            <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Zamknij wątek
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
