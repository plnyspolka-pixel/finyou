import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronUp, FilePlus2, RefreshCw } from "lucide-react";
import { formatPLN, formatDateTime, loanStatusLabels } from "@/lib/labels";
import { getMyInvestorReactions, type ApplicationReactions } from "@/lib/broker-crm.functions";
import { InvestorReactionsList } from "@/components/broker/investor-reactions";

export const Route = createFileRoute("/posrednik/reakcje")({
  component: ReakcjeInwestorow,
});

type Filter = "all" | "interested" | "waiting";

function ReakcjeInwestorow() {
  const fn = useServerFn(getMyInvestorReactions);
  const q = useQuery({
    queryKey: ["broker-investor-reactions"],
    queryFn: () => fn({ data: {} }),
  });
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const apps = (q.data ?? []) as ApplicationReactions[];

  const totals = useMemo(
    () => ({
      offers: apps.length,
      investors: apps.reduce((s, a) => s + a.summary.investors, 0),
      interested: apps.reduce((s, a) => s + a.summary.interested, 0),
      proposals: apps.reduce((s, a) => s + a.summary.proposals, 0),
    }),
    [apps],
  );

  const visible = apps.filter((a) =>
    filter === "interested"
      ? a.summary.interested > 0
      : filter === "waiting"
        ? a.reactions.length === 0
        : true,
  );

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="CRM"
        title="Reakcje inwestorów"
        subtitle="Jak inwestorzy reagują na Twoje oferty: otwarcia, odpowiedzi, zainteresowanie i propozycje finansowania."
        actions={
          <Button variant="outline" onClick={() => void q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
            Odśwież
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Twoje oferty", value: totals.offers },
          { label: "Inwestorzy, którzy reagowali", value: totals.investors },
          { label: "Zainteresowani", value: totals.interested },
          { label: "Propozycje finansowania", value: totals.proposals },
        ].map((t) => (
          <Card key={t.label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{t.label}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{t.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "Wszystkie"],
            ["interested", "Z zainteresowaniem"],
            ["waiting", "Bez reakcji"],
          ] as const
        ).map(([k, label]) => (
          <Button
            key={k}
            size="sm"
            variant={filter === k ? "default" : "outline"}
            onClick={() => setFilter(k)}
          >
            {label}
          </Button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : q.isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Nie udało się wczytać reakcji: {(q.error as Error)?.message}
          </CardContent>
        </Card>
      ) : apps.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-6 text-sm">
            <p>Nie masz jeszcze ofert. Wprowadź wniosek klienta — przedstawimy go inwestorom.</p>
            <Button asChild>
              <Link to="/posrednik/wniosek">
                <FilePlus2 className="mr-2 h-4 w-4" /> Wprowadź wniosek
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Brak ofert dla wybranego filtra.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((a) => {
            const expanded = open[a.applicationId] ?? false;
            return (
              <Card key={a.applicationId}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base">
                        <Link
                          to="/posrednik/wnioski/$id"
                          params={{ id: a.applicationId }}
                          className="hover:underline"
                        >
                          {a.clientName}
                        </Link>
                      </CardTitle>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {[a.loanAmount != null ? formatPLN(a.loanAmount) : null, a.city]
                          .filter(Boolean)
                          .join(" · ")}
                        {" · "}
                        {loanStatusLabels[a.status] ?? a.status}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary">Inwestorzy: {a.summary.investors}</Badge>
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                        Zainteresowani: {a.summary.interested}
                      </Badge>
                      <Badge variant="secondary">Propozycje: {a.summary.proposals}</Badge>
                      {a.summary.rejected > 0 && (
                        <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">
                          Odmowy: {a.summary.rejected}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {a.reactions[0] ? (
                    <div className="text-sm">
                      Ostatnio: <b>{a.reactions[0].investor}</b> — {a.reactions[0].label}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({formatDateTime(a.reactions[0].at)})
                      </span>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Brak reakcji inwestorów.</div>
                  )}
                  {a.reactions.length > 0 && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => setOpen((o) => ({ ...o, [a.applicationId]: !expanded }))}
                      >
                        {expanded ? (
                          <ChevronUp className="mr-1 h-4 w-4" />
                        ) : (
                          <ChevronDown className="mr-1 h-4 w-4" />
                        )}
                        {expanded ? "Zwiń historię" : `Pokaż historię (${a.reactions.length})`}
                      </Button>
                      {expanded && <InvestorReactionsList reactions={a.reactions} />}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Dane inwestorów są anonimowe — ich tożsamość ujawnia Finance You na etapie transakcji.
      </p>
    </div>
  );
}
