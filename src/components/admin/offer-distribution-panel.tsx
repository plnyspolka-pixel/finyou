// Panel dystrybucji oferty do inwestorów instytucjonalnych:
// wysyłka e-mailem do wszystkich lub zaznaczonych instytucji + podgląd
// wątków (nasze maile i odpowiedzi instytucji spływające inbound webhookiem).
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Send, Loader2, Mail, Reply, ExternalLink, RefreshCw, CornerUpLeft } from "lucide-react";
import {
  listInstitutionalInvestors,
  sendOfferDistribution,
  getDistributionThreads,
  replyToDistribution,
} from "@/lib/offer-distribution.functions";
import { distributionStatusLabels, formatDateTime } from "@/lib/labels";
import { signStoragePath } from "@/lib/property-photos";

type Investor = {
  id: string;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  subscription_status?: string | null;
};

function investorName(i: {
  company_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  return (
    i.company_name || [i.first_name, i.last_name].filter(Boolean).join(" ").trim() || "Inwestor"
  );
}

type ThreadAttachment = { name?: string | null; path?: string | null };

type ThreadMsg = {
  id: string;
  distribution_id: string | null;
  direction: string;
  subject: string | null;
  content: string | null;
  from_email: string | null;
  to_email: string | null;
  attachments: unknown;
  created_at: string;
};

type DistributionRow = {
  id: string;
  investor?: {
    company_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
};

const PREVIEW_LIMIT = 700;
const QUOTE_LIMIT = 1500;

/** Pojedyncza wiadomość w wątku — nasza po prawej, instytucji po lewej. */
function ThreadMessage({ m }: { m: ThreadMsg }) {
  const [expanded, setExpanded] = useState(false);
  const isInbound = m.direction === "inbound";
  const text = (m.content ?? "").trim();
  const isLong = text.length > PREVIEW_LIMIT;
  const shown = isLong && !expanded ? text.slice(0, PREVIEW_LIMIT) + "…" : text;
  const attachments = Array.isArray(m.attachments) ? (m.attachments as ThreadAttachment[]) : [];

  return (
    <div
      className={`rounded-md border p-2 text-sm ${
        isInbound ? "bg-accent/50" : "bg-primary/5 border-primary/30"
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {isInbound ? (
          <Reply className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Send className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">{isInbound ? m.from_email : `My → ${m.to_email ?? "—"}`}</span>
        <span className="ml-auto whitespace-nowrap">{formatDateTime(m.created_at)}</span>
      </div>
      {m.subject && <div className="font-medium mt-1 break-words">{m.subject}</div>}
      {text && (
        <div className="whitespace-pre-wrap break-words mt-1 text-muted-foreground">{shown}</div>
      )}
      {isLong && (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 mt-1 text-xs"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Zwiń" : "Pokaż całość"}
        </Button>
      )}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {attachments.map((a, idx) => (
            <Button
              key={idx}
              size="sm"
              variant="outline"
              className="max-w-full"
              onClick={async () => {
                const url = a?.path ? await signStoragePath(a.path, 3600) : null;
                if (url) window.open(url, "_blank", "noopener");
              }}
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{a?.name ?? `załącznik ${idx + 1}`}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export function OfferDistributionPanel({ applicationId }: { applicationId: string }) {
  const fetchInvestors = useServerFn(listInstitutionalInvestors);
  const doSend = useServerFn(sendOfferDistribution);
  const fetchThreads = useServerFn(getDistributionThreads);
  const doReply = useServerFn(replyToDistribution);

  const [investors, setInvestors] = useState<Investor[]>([]);
  const [sendToAll, setSendToAll] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [threads, setThreads] = useState<{ distributions: any[]; messages: any[] }>({
    distributions: [],
    messages: [],
  });

  // Odpowiedź w wątku konkretnej instytucji
  const [reply, setReply] = useState<{
    distributionId: string;
    investorName: string;
    email: string;
    subject: string;
    body: string;
  } | null>(null);
  const [replying, setReplying] = useState(false);

  const loadThreads = async () => {
    try {
      const t = await fetchThreads({ data: { applicationId } });
      setThreads(t as any);
    } catch {
      /* noop */
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const inv = await fetchInvestors();
        setInvestors((inv as Investor[]) ?? []);
      } catch (e: any) {
        toast.error("Nie udało się pobrać inwestorów", { description: e?.message });
      }
      await loadThreads();
    })();
  }, [applicationId]);

  const send = async () => {
    const investorIds = sendToAll ? undefined : Array.from(selected);
    if (!sendToAll && (investorIds?.length ?? 0) === 0) {
      toast.error("Zaznacz co najmniej jednego inwestora albo włącz wysyłkę do wszystkich");
      return;
    }
    setSending(true);
    try {
      const res = await doSend({ data: { applicationId, investorIds, note: note || undefined } });
      if (res.sent.length > 0) {
        toast.success(`Wysłano do ${res.sent.length} instytucji`, {
          description: res.sent.join(", "),
        });
      }
      if (res.skipped.length > 0) {
        toast.info(`Pominięto ${res.skipped.length} (już otrzymali ten temat)`, {
          description: res.skipped.join(", "),
        });
      }
      for (const f of res.failed) toast.error("Błąd wysyłki", { description: f.error });
      setSelected(new Set());
      setNote("");
      await loadThreads();
    } catch (e: any) {
      toast.error("Wysyłka nie powiodła się", { description: e?.message ?? String(e) });
    } finally {
      setSending(false);
    }
  };

  /** Otwiera okno odpowiedzi z tematem i zacytowaną ostatnią wiadomością wątku. */
  const openReply = (d: DistributionRow, msgs: ThreadMsg[]) => {
    const email = d.investor?.email;
    if (!email) {
      toast.error("Ta instytucja nie ma zapisanego adresu e-mail");
      return;
    }
    const last =
      [...msgs].reverse().find((m) => m.direction === "inbound") ?? msgs[msgs.length - 1];
    const base = last?.subject?.trim() || "Temat pożyczkowy pod zabezpieczenie hipoteczne";
    const quoted = last
      ? `\n\n---\nW dniu ${formatDateTime(last.created_at)} ${last.from_email ?? ""} napisał(a):\n` +
        (last.content ?? "")
          .slice(0, QUOTE_LIMIT)
          .split("\n")
          .map((l) => "> " + l)
          .join("\n")
      : "";
    setReply({
      distributionId: d.id,
      investorName: investorName(d.investor ?? {}),
      email,
      subject: /^re:/i.test(base) ? base : `Re: ${base}`,
      body: quoted,
    });
  };

  const sendReply = async () => {
    if (!reply) return;
    const body = reply.body.trim();
    const subject = reply.subject.trim();
    if (!subject || !body) {
      toast.error("Uzupełnij temat i treść wiadomości");
      return;
    }
    setReplying(true);
    try {
      await doReply({ data: { distributionId: reply.distributionId, subject, body } });
      toast.success(`Odpowiedź wysłana do ${reply.investorName}`, { description: reply.email });
      setReply(null);
      await loadThreads();
    } catch (e) {
      toast.error("Nie udało się wysłać odpowiedzi", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setReplying(false);
    }
  };

  const messagesByDistribution = new Map<string, any[]>();
  for (const m of threads.messages) {
    const key = m.distribution_id ?? "";
    if (!messagesByDistribution.has(key)) messagesByDistribution.set(key, []);
    messagesByDistribution.get(key)!.push(m);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" /> Wyślij ofertę do inwestorów instytucjonalnych
          </CardTitle>
          <CardDescription>
            Każdy mail zawiera link do Karty oferty. Odpowiedzi instytucji wracają automatycznie na
            tę kartę wniosku (dedykowany adres zwrotny).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch id="send-all" checked={sendToAll} onCheckedChange={setSendToAll} />
            <Label htmlFor="send-all">
              Wyślij do <b>wszystkich</b> aktywnych inwestorów instytucjonalnych ({investors.length}
              )
            </Label>
          </div>

          {!sendToAll && (
            <div className="space-y-2 max-h-72 overflow-y-auto border rounded-md p-2">
              {investors.length === 0 && (
                <p className="text-sm text-muted-foreground p-2">
                  Brak aktywnych inwestorów instytucjonalnych.
                </p>
              )}
              {investors.map((i) => {
                const checked = selected.has(i.id);
                return (
                  <label
                    key={i.id}
                    className="flex items-center gap-2 text-sm border rounded-md px-3 py-2 cursor-pointer hover:bg-accent"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setSelected((s) => {
                          const n = new Set(s);
                          if (v) n.add(i.id);
                          else n.delete(i.id);
                          return n;
                        });
                      }}
                    />
                    <span className="flex-1">{investorName(i)}</span>
                    <span className="text-xs text-muted-foreground">
                      {i.email ?? "brak e-mail"}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="space-y-1">
            <Label>Dodatkowa wiadomość (opcjonalnie)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Treść dopisana do maila z ofertą…"
            />
          </div>

          <Button onClick={() => void send()} disabled={sending}>
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Wyślij e-mailem {sendToAll ? `(${investors.length})` : `(${selected.size})`}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" /> Wysłane dystrybucje i odpowiedzi (
                {threads.distributions.length})
              </CardTitle>
              <CardDescription>
                Odpowiedzi instytucji finansujących pojawiają się tutaj automatycznie.
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => void loadThreads()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {threads.distributions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Oferta nie została jeszcze rozesłana do inwestorów.
            </p>
          )}
          {threads.distributions.map((d) => {
            const msgs = (messagesByDistribution.get(d.id) ?? []) as ThreadMsg[];
            const inboundCount = msgs.filter((m) => m.direction === "inbound").length;
            return (
              <div key={d.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="font-medium">{investorName(d.investor ?? {})}</span>
                  <span className="text-xs text-muted-foreground break-all">
                    {d.investor?.email}
                  </span>
                  <Badge
                    variant={
                      d.distribution_status === "odpowiedz_otrzymana" ? "default" : "secondary"
                    }
                  >
                    {distributionStatusLabels[d.distribution_status] ?? d.distribution_status}
                  </Badge>
                  {d.email_status === "error" && (
                    <Badge variant="destructive" title={d.email_error ?? undefined}>
                      Błąd wysyłki
                    </Badge>
                  )}
                  {inboundCount > 0 && <Badge variant="outline">{inboundCount} odpowiedzi</Badge>}
                  <span className="text-xs text-muted-foreground sm:ml-auto">
                    {d.sent_at ? `Wysłano: ${formatDateTime(d.sent_at)}` : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => openReply(d, msgs)}
                    disabled={!d.investor?.email}
                  >
                    <CornerUpLeft className="mr-1 h-3.5 w-3.5" />
                    Odpowiedz
                  </Button>
                </div>
                {msgs.length > 0 && (
                  <div className="space-y-2">
                    {msgs.map((m) => (
                      <ThreadMessage key={m.id} m={m} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={!!reply} onOpenChange={(o) => !o && !replying && setReply(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Odpowiedz w wątku</DialogTitle>
            <DialogDescription className="break-all">
              {reply ? `${reply.investorName} · ${reply.email}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reply-subject">Temat</Label>
              <Input
                id="reply-subject"
                value={reply?.subject ?? ""}
                onChange={(e) => setReply((r) => (r ? { ...r, subject: e.target.value } : r))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reply-body">Treść</Label>
              <Textarea
                id="reply-body"
                rows={12}
                value={reply?.body ?? ""}
                onChange={(e) => setReply((r) => (r ? { ...r, body: e.target.value } : r))}
                placeholder="Napisz odpowiedź…"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Mail wyjdzie z adresu zwrotnego tej dystrybucji — kolejna odpowiedź instytucji wróci
              automatycznie na ten wątek.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReply(null)} disabled={replying}>
              Anuluj
            </Button>
            <Button onClick={() => void sendReply()} disabled={replying}>
              {replying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Wyślij
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
