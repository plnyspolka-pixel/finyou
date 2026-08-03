// Panel Digital PR (moduł 4 promptu SEO): okazje medialne z monitoringu RSS,
// drafty komentarzy eksperckich (AI) i RĘCZNE zatwierdzanie wysyłki przez
// Resend. Wysyłka wyłącznie przyciskiem „Zatwierdź i wyślij" (administrator).
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listPrOpportunities,
  listPrOutreachLog,
  generatePrOpportunityDraft,
  updatePrOpportunity,
  sendPrOutreach,
  type PrOpportunity,
  type PrOutreachLogItem,
} from "@/lib/pr.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ExternalLink, Loader2, Send, Sparkles, X } from "lucide-react";

export const Route = createFileRoute("/admin/pr-media")({
  component: PrMediaPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{(error as Error).message}</div>
  ),
});

const STATUS_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  new: { label: "Nowa", variant: "secondary" },
  drafted: { label: "Draft gotowy", variant: "outline" },
  approved: { label: "Zatwierdzona", variant: "default" },
  sent: { label: "Wysłano", variant: "default" },
  rejected: { label: "Odrzucona", variant: "destructive" },
};

function OpportunityCard({ opp }: { opp: PrOpportunity }) {
  const qc = useQueryClient();
  const draftFn = useServerFn(generatePrOpportunityDraft);
  const updateFn = useServerFn(updatePrOpportunity);
  const sendFn = useServerFn(sendPrOutreach);

  const [subject, setSubject] = useState(opp.draft_subject ?? "");
  const [body, setBody] = useState(opp.draft_body ?? "");
  const [email, setEmail] = useState(opp.recipient_email ?? "");
  const [expanded, setExpanded] = useState(false);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["pr-opportunities"] });
    void qc.invalidateQueries({ queryKey: ["pr-outreach-log"] });
  };

  const draftMut = useMutation({
    mutationFn: () => draftFn({ data: { id: opp.id } }),
    onSuccess: (r: { subject?: string; body?: string }) => {
      setSubject(r.subject ?? "");
      setBody(r.body ?? "");
      setExpanded(true);
      toast.success("Draft wygenerowany — przeczytaj i uzupełnij placeholdery");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: { id: opp.id, draft_subject: subject, draft_body: body, recipient_email: email },
      }),
    onSuccess: () => {
      toast.success("Zapisano zmiany");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: () => updateFn({ data: { id: opp.id, status: "rejected" } }),
    onSuccess: () => {
      toast.success("Okazja odrzucona");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      await updateFn({
        data: { id: opp.id, draft_subject: subject, draft_body: body, recipient_email: email },
      });
      return sendFn({ data: { id: opp.id } });
    },
    onSuccess: () => {
      toast.success("Wysłano outreach");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const badge = STATUS_BADGE[opp.status] ?? STATUS_BADGE.new;
  const hasPlaceholder = body.includes("[DO UZUPEŁNIENIA]");

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm leading-snug">{opp.topic}</CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={badge.variant}>{badge.label}</Badge>
              <span>{opp.source}</span>
              {opp.article_published_at && (
                <span>{new Date(opp.article_published_at).toLocaleDateString("pl-PL")}</span>
              )}
              <a
                href={opp.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-accent hover:underline"
              >
                artykuł <ExternalLink size={12} />
              </a>
            </div>
            {opp.matched_phrases?.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {opp.matched_phrases.map((p) => (
                  <span
                    key={p}
                    className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
          {opp.status !== "sent" && (
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => draftMut.mutate()}
                disabled={draftMut.isPending}
              >
                {draftMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {opp.draft_body ? "Nowy draft" : "Generuj draft"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => rejectMut.mutate()}
                disabled={rejectMut.isPending}
              >
                <X className="h-4 w-4" /> Odrzuć
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      {(opp.draft_body || expanded) && opp.status !== "sent" && (
        <CardContent className="space-y-2 pt-0">
          {!expanded ? (
            <Button size="sm" variant="link" className="px-0" onClick={() => setExpanded(true)}>
              Pokaż draft
            </Button>
          ) : (
            <>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Temat maila"
              />
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                placeholder="Treść maila (draft AI — przeczytaj przed wysyłką)"
              />
              {hasPlaceholder && (
                <p className="text-xs text-destructive">
                  Draft zawiera [DO UZUPEŁNIENIA] — uzupełnij dane przed wysyłką.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-mail dziennikarza/redakcji"
                  className="max-w-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => saveMut.mutate()}
                  disabled={saveMut.isPending}
                >
                  Zapisz
                </Button>
                <Button
                  size="sm"
                  onClick={() => sendMut.mutate()}
                  disabled={sendMut.isPending || !email || !subject || !body || hasPlaceholder}
                  title={
                    hasPlaceholder
                      ? "Najpierw uzupełnij placeholdery [DO UZUPEŁNIENIA]"
                      : "Wyślij przez Resend"
                  }
                >
                  {sendMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Zatwierdź i wyślij
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function PrMediaPage() {
  const listFn = useServerFn(listPrOpportunities);
  const logFn = useServerFn(listPrOutreachLog);

  const { data: oppsData, isLoading } = useQuery({
    queryKey: ["pr-opportunities"],
    queryFn: () => listFn(),
  });
  const { data: logData } = useQuery({
    queryKey: ["pr-outreach-log"],
    queryFn: () => logFn(),
  });

  const opportunities = (oppsData?.opportunities ?? []) as PrOpportunity[];
  const log = (logData?.log ?? []) as PrOutreachLogItem[];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Digital PR — media i dziennikarze</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitoring publikacji (co 6 h) pod frazami: „pożyczka pod zastaw", „pożyczki prywatne",
          „rynek nieruchomości". Draft przygotowuje AI, ale{" "}
          <strong>wysyłka następuje wyłącznie po Twoim kliknięciu</strong>. Liczby spoza naszych
          danych = [DO UZUPEŁNIENIA].
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
        </div>
      ) : opportunities.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Brak okazji medialnych — monitoring uzupełni listę po najbliższym przebiegu (co 6 h).
        </p>
      ) : (
        <div className="space-y-3">
          {opportunities.map((o) => (
            <OpportunityCard key={o.id} opp={o} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log wysyłek i odpowiedzi</CardTitle>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">Jeszcze nic nie wysłano.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Data</th>
                    <th className="p-2">Odbiorca</th>
                    <th className="p-2">Temat</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Otwarto</th>
                    <th className="p-2">Klik</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((l) => (
                    <tr key={l.id} className="border-b">
                      <td className="p-2 whitespace-nowrap">
                        {new Date(l.sent_at).toLocaleString("pl-PL")}
                      </td>
                      <td className="p-2">{l.recipient_email}</td>
                      <td className="p-2 max-w-[16rem] truncate">{l.subject}</td>
                      <td className="p-2">
                        {l.error ? <span className="text-destructive">{l.status}</span> : l.status}
                      </td>
                      <td className="p-2">{l.opened_at ? "✓" : "—"}</td>
                      <td className="p-2">{l.clicked_at ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
