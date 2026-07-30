import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ListChecks, Pause, Play, Send, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  listMissingInfoFollowUps,
  listMissingInfoSends,
  setMissingInfoPaused,
  previewMissingInfoMessages,
  sendMissingInfoNow,
} from "@/lib/missing-info-follow-up/missing-info-follow-up.functions";
import { loanStatusLabel } from "@/lib/loan-status";

export const Route = createFileRoute("/admin/follow-up-braki")({
  component: FollowUpBrakiPage,
});

type StatusFilter = "active" | "complete" | "stopped" | "all";

const KIND_LABELS: Record<string, string> = {
  core: "dane",
  kw: "KW",
  coowners: "współwłaściciele",
  document: "dokument",
};

const KIND_CLASSES: Record<string, string> = {
  core: "bg-amber-100 text-amber-900 border-amber-200",
  kw: "bg-red-100 text-red-900 border-red-200",
  coowners: "bg-purple-100 text-purple-900 border-purple-200",
  document: "bg-sky-100 text-sky-900 border-sky-200",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

function FollowUpBrakiPage() {
  const [filter, setFilter] = useState<StatusFilter>("active");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const qc = useQueryClient();

  const list = useServerFn(listMissingInfoFollowUps);
  const pauseFn = useServerFn(setMissingInfoPaused);
  const sendNowFn = useServerFn(sendMissingInfoNow);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["missing-info-follow-ups", filter],
    queryFn: () => list({ data: { status: filter } }),
    refetchInterval: 60_000,
  });

  const pauseMut = useMutation({
    mutationFn: (vars: { loanApplicationId: string; paused: boolean }) => pauseFn({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(vars.paused ? "Follow-up wstrzymany." : "Follow-up wznowiony.");
      qc.invalidateQueries({ queryKey: ["missing-info-follow-ups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: (vars: { loanApplicationId: string }) => sendNowFn({ data: vars }),
    onSuccess: (r: any) => {
      if (r?.ok) toast.success(`Wysłano (${r.channel}).`);
      else toast.warning(`Nie wysłano: ${r?.skipped ?? r?.error ?? "nieznany powód"}`);
      qc.invalidateQueries({ queryKey: ["missing-info-follow-ups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ListChecks className="h-6 w-6" /> Follow-up braków
        </h1>
        <p className="text-sm text-muted-foreground">
          Celowane dopytywanie klientów z niekompletnym wnioskiem lub wnioskiem do korekty o
          konkretne braki: dane podstawowe, dokumenty wg typu nieruchomości oraz otwarte pytania z
          analizy KW (m.in. wysokość długu na hipotece i zgody wszystkich współwłaścicieli). Kanały:
          e-mail, SMS i Messenger (w oknie 24h Meta). Wysyłka automatyczna co 30 min w oknie
          7:00–21:00 pon–sob.
        </p>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
        <TabsList>
          <TabsTrigger value="active">Aktywne</TabsTrigger>
          <TabsTrigger value="complete">Uzupełnione</TabsTrigger>
          <TabsTrigger value="stopped">Zatrzymane</TabsTrigger>
          <TabsTrigger value="all">Wszystkie</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Ładowanie…</p>
      ) : !rows?.length ? (
        <p className="text-sm text-muted-foreground">Brak wpisów w tym widoku.</p>
      ) : (
        <div className="space-y-3">
          {(rows as any[]).map((r) => {
            const client = r.loan?.client;
            const name =
              [client?.first_name, client?.last_name].filter(Boolean).join(" ") || "(bez nazwiska)";
            const items: any[] = r.brief_json?.items ?? [];
            return (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{name}</span>
                        <Badge variant="outline">{loanStatusLabel(r.loan?.status)}</Badge>
                        {r.paused && <Badge variant="destructive">pauza</Badge>}
                        {r.status === "complete" && (
                          <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200">
                            uzupełnione
                          </Badge>
                        )}
                        {r.status === "stopped" && <Badge variant="secondary">zatrzymane</Badge>}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {client?.email ?? "brak e-maila"} · {client?.phone ?? "brak telefonu"} ·
                        próby: {r.attempt_count}
                        {r.last_channel ? ` · ostatnio: ${r.last_channel}` : ""} · ostatnia wysyłka:{" "}
                        {fmtDate(r.last_sent_at)} · następna: {fmtDate(r.next_send_at)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {items.slice(0, 8).map((it) => (
                          <Badge
                            key={it.key}
                            variant="outline"
                            className={KIND_CLASSES[it.kind] ?? ""}
                            title={it.question}
                          >
                            {KIND_LABELS[it.kind] ?? it.kind}: {it.label}
                          </Badge>
                        ))}
                        {items.length > 8 && (
                          <Badge variant="secondary">+{items.length - 8} dalszych</Badge>
                        )}
                      </div>
                      {r.last_error && (
                        <div className="mt-1 text-xs text-red-600">Błąd: {r.last_error}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDetailsId(r.loan_application_id)}
                      >
                        <Eye className="mr-1 h-4 w-4" /> Podgląd
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pauseMut.isPending}
                        onClick={() =>
                          pauseMut.mutate({
                            loanApplicationId: r.loan_application_id,
                            paused: !r.paused,
                          })
                        }
                      >
                        {r.paused ? (
                          <>
                            <Play className="mr-1 h-4 w-4" /> Wznów
                          </>
                        ) : (
                          <>
                            <Pause className="mr-1 h-4 w-4" /> Pauza
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        disabled={sendMut.isPending || r.status === "complete"}
                        onClick={() => sendMut.mutate({ loanApplicationId: r.loan_application_id })}
                      >
                        <Send className="mr-1 h-4 w-4" /> Wyślij teraz
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DetailsDialog loanApplicationId={detailsId} onClose={() => setDetailsId(null)} />
    </div>
  );
}

function DetailsDialog({
  loanApplicationId,
  onClose,
}: {
  loanApplicationId: string | null;
  onClose: () => void;
}) {
  const previewFn = useServerFn(previewMissingInfoMessages);
  const sendsFn = useServerFn(listMissingInfoSends);

  const { data: preview } = useQuery({
    queryKey: ["missing-info-preview", loanApplicationId],
    queryFn: () => previewFn({ data: { loanApplicationId: loanApplicationId! } }),
    enabled: !!loanApplicationId,
  });
  const { data: sends } = useQuery({
    queryKey: ["missing-info-sends", loanApplicationId],
    queryFn: () => sendsFn({ data: { loanApplicationId: loanApplicationId! } }),
    enabled: !!loanApplicationId,
  });

  return (
    <Dialog open={!!loanApplicationId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Podgląd follow-upu braków</DialogTitle>
          <DialogDescription>
            Treści, które zobaczy klient (pierwsza próba), oraz historia wysyłek.
          </DialogDescription>
        </DialogHeader>
        {preview ? (
          <div className="space-y-4 text-sm">
            <div>
              <h3 className="mb-1 font-semibold">E-mail</h3>
              <p className="text-xs text-muted-foreground">
                Temat: {(preview as any).email.subject}
              </p>
              <pre className="mt-1 whitespace-pre-wrap rounded bg-muted p-3 text-xs">
                {(preview as any).email.text}
              </pre>
            </div>
            <div>
              <h3 className="mb-1 font-semibold">SMS</h3>
              <pre className="whitespace-pre-wrap rounded bg-muted p-3 text-xs">
                {(preview as any).sms}
              </pre>
            </div>
            <div>
              <h3 className="mb-1 font-semibold">Messenger</h3>
              <pre className="whitespace-pre-wrap rounded bg-muted p-3 text-xs">
                {(preview as any).messenger}
              </pre>
            </div>
            <div>
              <h3 className="mb-1 font-semibold">Historia wysyłek</h3>
              {!(sends as any[])?.length ? (
                <p className="text-xs text-muted-foreground">Jeszcze nic nie wysłano.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {(sends as any[]).map((sd) => (
                    <li key={sd.id} className="rounded border p-2">
                      <span className="font-medium">{sd.channel}</span> · próba {sd.attempt_number}{" "}
                      · {sd.status} · {fmtDate(sd.created_at)}
                      {sd.error_message ? ` · ${sd.error_message}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ładowanie…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
