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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Send, Loader2, Mail, Reply, ExternalLink, RefreshCw } from "lucide-react";
import {
  listInstitutionalInvestors,
  sendOfferDistribution,
  getDistributionThreads,
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

export function OfferDistributionPanel({ applicationId }: { applicationId: string }) {
  const fetchInvestors = useServerFn(listInstitutionalInvestors);
  const doSend = useServerFn(sendOfferDistribution);
  const fetchThreads = useServerFn(getDistributionThreads);

  const [investors, setInvestors] = useState<Investor[]>([]);
  const [sendToAll, setSendToAll] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [threads, setThreads] = useState<{ distributions: any[]; messages: any[] }>({
    distributions: [],
    messages: [],
  });

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
            const msgs = messagesByDistribution.get(d.id) ?? [];
            const inbound = msgs.filter((m) => m.direction === "inbound");
            return (
              <div key={d.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="font-medium">{investorName(d.investor ?? {})}</span>
                  <span className="text-xs text-muted-foreground">{d.investor?.email}</span>
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
                  <span className="text-xs text-muted-foreground ml-auto">
                    {d.sent_at ? `Wysłano: ${formatDateTime(d.sent_at)}` : ""}
                  </span>
                </div>
                {inbound.length > 0 && (
                  <div className="space-y-2">
                    {inbound.map((m) => (
                      <div key={m.id} className="rounded-md bg-accent/50 border p-2 text-sm">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Reply className="h-3.5 w-3.5" />
                          <span>{m.from_email}</span>
                          <span className="ml-auto">{formatDateTime(m.created_at)}</span>
                        </div>
                        {m.subject && <div className="font-medium mt-1">{m.subject}</div>}
                        {m.content && (
                          <div className="whitespace-pre-wrap mt-1 text-muted-foreground">
                            {m.content}
                          </div>
                        )}
                        {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {m.attachments.map((a: any, idx: number) => (
                              <Button
                                key={idx}
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  const url = a?.path ? await signStoragePath(a.path, 3600) : null;
                                  if (url) window.open(url, "_blank", "noopener");
                                }}
                              >
                                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                                {a?.name ?? `załącznik ${idx + 1}`}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
