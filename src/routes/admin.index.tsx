import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loanStatusLabels } from "@/lib/labels";
import { leadSourceLabel } from "@/lib/lead-source";
import { FOLLOW_UP_ENGINES, type FollowUpChannel } from "@/lib/follow-up-config";
import {
  Users,
  FileText,
  Mic,
  Bell,
  Mail,
  MessageSquare,
  Phone,
  ArrowRight,
  Clock,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

// Lejek pogrupowany w fazy — żeby od razu było widać, gdzie są sprawy.
const PHASES: { label: string; statuses: string[] }[] = [
  { label: "Pozyskanie", statuses: ["nowy_lead", "brak_kontaktu", "kontakt"] },
  { label: "Wniosek", statuses: ["kompletowanie_danych"] },
  { label: "U inwestorów", statuses: ["szukamy_inwestora"] },
  {
    label: "Umowa",
    statuses: ["warunki_zaakceptowane", "dokumenty_przygotowanie_umowy", "notariusz"],
  },
  { label: "Zamknięte", statuses: ["zamkniete"] },
];

// Najważniejsze liczby — to, na co admin patrzy najpierw.
const HEADLINE: { key: string; label: string; href: string }[] = [
  { key: "nowy_lead", label: "Nowe leady", href: "/admin/klienci" },
  { key: "brak_kontaktu", label: "Brak kontaktu", href: "/admin/klienci" },
  {
    key: "kompletowanie_danych",
    label: "Kompletowanie danych",
    href: "/admin/wnioski-niekompletne",
  },
  { key: "szukamy_inwestora", label: "Szukamy inwestora", href: "/admin/dystrybucja" },
  { key: "warunki_zaakceptowane", label: "Warunki zaakceptowane", href: "/admin/klienci" },
];

const QUICK_LINKS: { to: string; label: string; icon: typeof Users }[] = [
  { to: "/admin/klienci", label: "Klienci", icon: Users },
  { to: "/admin/wnioski-niekompletne", label: "Wnioski", icon: FileText },
  { to: "/admin/voicebot", label: "Voicebot", icon: Mic },
  { to: "/admin/przypomnienia", label: "Przypomnienia", icon: Bell },
];

const CHANNEL_META: Record<FollowUpChannel, { label: string; icon: typeof Mail }> = {
  email: { label: "E-mail", icon: Mail },
  sms: { label: "SMS", icon: MessageSquare },
  call: { label: "Telefon", icon: Phone },
};

function AdminDashboard() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [bySource, setBySource] = useState<Record<string, number>>({});
  const [byChannel, setByChannel] = useState<Record<string, number>>({});
  const [engineCounts, setEngineCounts] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [{ data: apps }, { data: contacts }] = await Promise.all([
        supabase.from("loan_applications").select("status, source"),
        supabase.from("contact_events").select("channel"),
      ]);
      const c: Record<string, number> = {};
      const src: Record<string, number> = {};
      (apps ?? []).forEach((a) => {
        c[a.status] = (c[a.status] ?? 0) + 1;
        // Grupuj po ujednoliconej etykiecie kanału — "messenger" i
        // "inbound_enrichment:messenger" to ten sam kanał wejścia.
        const k = leadSourceLabel(a.source);
        src[k] = (src[k] ?? 0) + 1;
      });
      const ch: Record<string, number> = {};
      (contacts ?? []).forEach((e) => {
        ch[e.channel] = (ch[e.channel] ?? 0) + 1;
      });
      setCounts(c);
      setBySource(src);
      setByChannel(ch);
      setLoading(false);

      // Live liczniki kolejek follow-up — best effort (gdy RLS nie pozwoli, zostaje „—").
      let leadPending: number | null = null;
      let callsPending: number | null = null;
      try {
        const { count } = await supabase
          .from("lead_follow_up_schedule")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");
        leadPending = count ?? null;
      } catch {
        /* brak dostępu — zostaje „—" */
      }
      try {
        const { count } = await supabase
          .from("call_queue")
          .select("id", { count: "exact", head: true })
          .in("status", ["oczekuje", "w_trakcie"]);
        callsPending = count ?? null;
      } catch {
        /* noop */
      }
      setEngineCounts({ "lead-nurture": leadPending, "calculator-call": callsPending });
    })();
  }, []);

  const phaseTotal = (statuses: string[]) => statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pulpit</h1>
          <p className="text-sm text-muted-foreground">
            Lejek sprzedaży i automatyzacje follow-up w jednym widoku.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_LINKS.map((q) => (
            <Button key={q.to} asChild variant="outline" size="sm">
              <Link to={q.to}>
                <q.icon className="mr-2 h-4 w-4" />
                {q.label}
              </Link>
            </Button>
          ))}
        </div>
      </div>

      {/* Najważniejsze liczby */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {HEADLINE.map((k) => (
          <Link key={k.key} to={k.href} className="group">
            <Card className="h-full transition-colors group-hover:border-accent/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  {k.label}
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold tabular-nums text-foreground">
                  {loading ? "…" : (counts[k.key] ?? 0)}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Lejek sprzedaży wg faz */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Lejek sprzedaży
        </h2>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {PHASES.map((phase) => (
            <Card key={phase.label}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{phase.label}</span>
                  <span className="text-xl font-bold tabular-nums">
                    {loading ? "…" : phaseTotal(phase.statuses)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                {phase.statuses.map((s) => (
                  <div key={s} className="flex items-center justify-between gap-2">
                    <span className="truncate text-muted-foreground">
                      {loanStatusLabels[s] ?? s}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{counts[s] ?? 0}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Automatyzacje follow-up — jedno źródło prawdy (follow-up-config.ts) */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Automatyzacje follow-up
          </h2>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {FOLLOW_UP_ENGINES.map((e) => {
            const live = engineCounts[e.key];
            return (
              <Card key={e.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>{e.name}</span>
                    {live != null && (
                      <Badge variant="secondary" className="font-normal">
                        {live} w kolejce
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{e.purpose}</p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-1.5">
                    {e.channels.map((ch) => {
                      const Icon = CHANNEL_META[ch].icon;
                      return (
                        <Badge key={ch} variant="outline" className="gap-1 font-normal">
                          <Icon className="h-3 w-3" />
                          {CHANNEL_META[ch].label}
                        </Badge>
                      );
                    })}
                  </div>
                  <InfoRow label="Wyzwalacz" value={e.trigger} />
                  <InfoRow label="Rytm" value={e.cadence} />
                  <InfoRow label="Okno" value={e.window} icon={Clock} />
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <code className="truncate text-[11px] text-muted-foreground">{e.table}</code>
                    <Button asChild variant="ghost" size="sm" className="h-7 shrink-0">
                      <Link to={e.manageHref}>
                        Zarządzaj <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Rozkłady pomocnicze */}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leady wg źródła</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {Object.entries(bySource).length === 0 ? (
              <p className="text-muted-foreground">{loading ? "Ładowanie…" : "Brak danych."}</p>
            ) : (
              Object.entries(bySource)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium tabular-nums">{v}</span>
                  </div>
                ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kontakty wg kanału</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {Object.entries(byChannel).length === 0 ? (
              <p className="text-muted-foreground">{loading ? "Ładowanie…" : "Brak danych."}</p>
            ) : (
              Object.entries(byChannel)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="capitalize text-muted-foreground">{k}</span>
                    <span className="font-medium tabular-nums">{v}</span>
                  </div>
                ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function InfoRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof Clock;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
