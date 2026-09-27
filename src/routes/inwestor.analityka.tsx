// Moduł „Analityka" panelu inwestora: pipeline analityczny (pobranie KW →
// właściciele → analiza KW → analiza ryzyka) — ten sam, którym posługuje się
// zespół Finance You w panelu admina — dla okazji i wniosków inwestora.
// Lewa kolumna: lista z postępem czterech kroków; prawa: szczegóły wybranego
// wniosku krok po kroku oraz uruchomienie przebiegu na żądanie.
// Zakres: wyłącznie wnioski wybrane dla inwestora (nie cała pula). Druga
// zakładka to szybka analiza KW własnego wniosku spoza Finance You.
import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Loader2, RefreshCw, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accent } from "@/components/inwestor/analytics-steps";
import {
  AnalyticsDetailPanel,
  itemTitle,
  SOURCE_TONE,
  StepDots,
} from "@/components/inwestor/analytics-detail-panel";
import { ExternalKwChecks } from "@/components/inwestor/external-kw-checks";
import { formatPLN, propertyTypeLabels } from "@/lib/labels";
import { listMyAnalyticsApplications } from "@/lib/investor-analytics/analytics.functions";
import {
  ANALYTICS_SOURCE_LABELS,
  ANALYTICS_STEPS,
  analyticsDoneCount,
  type AnalyticsListItem,
  type AnalyticsSource,
} from "@/lib/investor-analytics/types";

type AnalitykaTab = "wybrane" | "wlasny";

export const Route = createFileRoute("/inwestor/analityka")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { app?: string; tab?: AnalitykaTab; check?: string } => ({
    app: typeof search.app === "string" ? search.app : undefined,
    tab: search.tab === "wlasny" ? "wlasny" : undefined,
    check: typeof search.check === "string" ? search.check : undefined,
  }),
  component: AnalitykaPage,
});

// ── Strona ──────────────────────────────────────────────────────────────────

function AnalitykaPage() {
  const { tab, check } = useSearch({ from: "/inwestor/analityka" });
  const navigate = useNavigate();
  const tabs = (
    <div className="flex flex-wrap gap-1.5" role="tablist">
      {(
        [
          ["wybrane", "Wnioski wybrane dla Ciebie"],
          ["wlasny", "Własny wniosek — analiza KW"],
        ] as const
      ).map(([key, label]) => {
        const active = (tab ?? "wybrane") === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() =>
              void navigate({
                to: "/inwestor/analityka",
                search: key === "wlasny" ? { tab: "wlasny" } : {},
                replace: true,
              })
            }
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
              active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  if (tab !== "wlasny") return <SelectedApplications tabs={tabs} />;
  return (
    <div className="space-y-5">
      <FancyPageHeader
        eyebrow="Analityka"
        title="Analiza własnego wniosku"
        subtitle="Temat spoza Finance You? Podaj numer księgi wieczystej i rodzaj nieruchomości, a automat wykona cały pipeline: pobranie KW, właściciele w CEIDG/KRS, analizę KW silnikiem reguł i pełną ocenę ryzyka z wyceną rynkową. Sprawdzenia widzisz tylko Ty."
      />
      {tabs}
      <ExternalKwChecks
        selectedId={check ?? null}
        onSelect={(id) =>
          void navigate({
            to: "/inwestor/analityka",
            search: { tab: "wlasny", check: id },
            replace: true,
          })
        }
      />
    </div>
  );
}

/** Zakładka „Wnioski wybrane dla Ciebie": okazje, oferty, przekazania. */
function SelectedApplications({ tabs }: { tabs: ReactNode }) {
  const { app } = useSearch({ from: "/inwestor/analityka" });
  const navigate = useNavigate();
  const listFn = useServerFn(listMyAnalyticsApplications);
  const listQ = useQuery({
    queryKey: ["investor-analytics-list"],
    queryFn: () => listFn(),
    // Trwający przebieg dokańcza cron (co 15 min) — odświeżamy listę co pół minuty.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((i) => i.run?.status === "running") ? 30_000 : false,
  });
  const items = useMemo(() => listQ.data ?? [], [listQ.data]);

  const [filter, setFilter] = useState<"all" | AnalyticsSource>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (filter !== "all" && i.source !== filter) return false;
      if (!needle) return true;
      const hay = [
        i.city,
        i.voivodeship,
        i.kwNumber,
        i.projectRef,
        i.propertyType ? propertyTypeLabels[i.propertyType] : null,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [items, filter, q]);

  const selectedId =
    app && items.some((i) => i.id === app) ? app : (filtered[0]?.id ?? items[0]?.id ?? null);

  const select = (id: string) =>
    void navigate({ to: "/inwestor/analityka", search: { app: id }, replace: true });

  const stats = useMemo(() => {
    const ready = items.filter((i) => analyticsDoneCount(i) === ANALYTICS_STEPS.length).length;
    const running = items.filter((i) => i.run?.status === "running").length;
    const partial = items.filter((i) => {
      const n = analyticsDoneCount(i);
      return n > 0 && n < ANALYTICS_STEPS.length && i.run?.status !== "running";
    }).length;
    return {
      total: items.length,
      ready,
      running,
      partial,
      none: items.length - ready - running - partial,
    };
  }, [items]);

  const counts = useMemo(() => {
    const c: Record<"all" | AnalyticsSource, number> = {
      all: items.length,
      okazja: 0,
      oferta: 0,
      przekazany: 0,
    };
    for (const i of items) c[i.source] += 1;
    return c;
  }, [items]);

  return (
    <div className="space-y-5">
      <FancyPageHeader
        eyebrow="Analityka"
        title="Pipeline analityczny"
        subtitle="Cztery kroki, które przechodzi każda okazja u zespołu Finance You: pobranie księgi wieczystej, właściciele w rejestrach, analiza KW silnikiem reguł i analiza ryzyka z prognozą wartości. Tu masz je wyłącznie dla wniosków wybranych dla Ciebie: okazji z Twoich Zleceń, wniosków z Twoją ofertą i wniosków przekazanych Ci przez zespół — z możliwością uruchomienia na żądanie."
        actions={
          <Button
            size="sm"
            variant="secondary"
            className="bg-white/15 text-white hover:bg-white/25 border-white/20"
            disabled={listQ.isFetching}
            onClick={() => void listQ.refetch()}
          >
            {listQ.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Odśwież
          </Button>
        }
      />
      {tabs}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="W zasięgu" value={stats.total} hue={262} />
        <StatTile label="Komplet analiz" value={stats.ready} hue={160} />
        <StatTile label="Przebieg w toku" value={stats.running} hue={48} />
        <StatTile label="Częściowo / bez analiz" value={stats.partial + stats.none} hue={217} />
      </div>

      {listQ.isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wczytywanie analityki…
        </div>
      ) : listQ.isError ? (
        <Card>
          <CardContent className="space-y-2 py-8 text-center">
            <p className="text-destructive">Nie udało się pobrać listy wniosków.</p>
            <Button variant="outline" onClick={() => void listQ.refetch()}>
              Spróbuj ponownie
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardHeader className="items-center text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted">
              <BarChart3 className="h-7 w-7 text-muted-foreground" />
            </div>
            <CardTitle>Brak wniosków do analizy</CardTitle>
            <CardDescription>
              Analityka obejmuje tylko wnioski wybrane dla Ciebie: okazje ujawnione w wykonaniu
              Twoich Zleceń, wnioski, do których złożyłeś ofertę, oraz wnioski przekazane Ci przez
              zespół Finance You. Złóż Zlecenie poszukiwania okazji — analizy pojawią się tu
              automatycznie.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild>
              <Link to="/inwestor/umowy">Przejdź do okazji inwestycyjnych</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="h-fit lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            <CardHeader className="space-y-3 pb-3">
              <CardTitle className="text-base">Okazje i wnioski</CardTitle>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Miasto, KW, numer projektu…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {q && (
                  <button
                    type="button"
                    aria-label="Wyczyść"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setQ("")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["all", "Wszystkie"],
                    ["okazja", "Okazje"],
                    ["oferta", "Oferty"],
                    ["przekazany", "Przekazane"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                      filter === key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-muted",
                    )}
                  >
                    {label} <span className="opacity-70">{counts[key]}</span>
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {filtered.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Brak wniosków spełniających filtr.
                </p>
              )}
              {filtered.map((item) => (
                <ListRow
                  key={item.id}
                  item={item}
                  active={item.id === selectedId}
                  onSelect={() => select(item.id)}
                />
              ))}
            </CardContent>
          </Card>

          {selectedId ? (
            <AnalyticsDetailPanel key={selectedId} applicationId={selectedId} />
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Wybierz wniosek z listy.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, hue }: { label: string; value: number; hue: number }) {
  return (
    <div
      className="rounded-2xl border bg-card p-4 shadow-sm"
      style={{ borderColor: accent(hue, 0.62, 0.16, 0.35) }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-black tabular-nums"
        style={{ color: accent(hue, 0.45, 0.16) }}
      >
        {value}
      </div>
    </div>
  );
}

// ── Lista ───────────────────────────────────────────────────────────────────

function ListRow({
  item,
  active,
  onSelect,
}: {
  item: AnalyticsListItem;
  active: boolean;
  onSelect: () => void;
}) {
  const done = analyticsDoneCount(item);
  const running = item.run?.status === "running";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border p-3 text-left transition",
        active
          ? "border-primary bg-primary/5 shadow-sm"
          : "hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{itemTitle(item)}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.voivodeship ? `${item.voivodeship} · ` : ""}
            {item.kwNumber ? <span className="font-mono">{item.kwNumber}</span> : "brak numeru KW"}
          </div>
        </div>
        <div className="shrink-0 text-right text-sm font-bold tabular-nums">
          {formatPLN(item.loanAmount)}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
            SOURCE_TONE[item.source],
          )}
        >
          {item.source === "okazja" && item.projectRef
            ? `Okazja ${item.projectRef}`
            : ANALYTICS_SOURCE_LABELS[item.source]}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <StepDots item={item} />
          {running ? (
            <span className="flex items-center gap-1 text-amber-700">
              <Loader2 className="h-3 w-3 animate-spin" /> w toku
            </span>
          ) : (
            <span>
              {done}/{ANALYTICS_STEPS.length}
            </span>
          )}
        </span>
      </div>
    </button>
  );
}
