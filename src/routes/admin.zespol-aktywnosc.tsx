import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getTeamMembers,
  getTeamActivity,
  type TeamMember,
  type TeamActivityRow,
} from "@/lib/team-activity.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  FileText,
  MessageSquare,
  Phone,
  StickyNote,
  UserCog,
  ClipboardList,
  Bot,
  Info,
} from "lucide-react";

export const Route = createFileRoute("/admin/zespol-aktywnosc")({
  component: TeamActivityPage,
});

const ROLE_LABELS: Record<string, string> = {
  administrator: "Administrator",
  operator: "Operator",
  operator_wewnetrzny: "Operator wewnętrzny",
  posrednik: "Pośrednik",
};

type RoleFilter = "all" | "operator" | "posrednik" | "administrator";

const FILTERS: { key: RoleFilter; label: string }[] = [
  { key: "all", label: "Wszyscy" },
  { key: "operator", label: "Operatorzy" },
  { key: "posrednik", label: "Pośrednicy" },
  { key: "administrator", label: "Administratorzy" },
];

function matchesFilter(role: string | null | undefined, filter: RoleFilter) {
  if (filter === "all") return true;
  if (!role) return false;
  if (filter === "operator") return role === "operator" || role === "operator_wewnetrzny";
  return role === filter;
}

function eventIcon(row: TeamActivityRow) {
  if (!row.user_id) return Bot;
  switch (row.event_type) {
    case "komunikacja":
      return row.title.includes("Rozmowa") ? Phone : MessageSquare;
    case "dokument":
      return FileText;
    case "lead":
      return StickyNote;
    case "wniosek":
      return ClipboardList;
    default:
      return UserCog;
  }
}

function formatRelative(iso: string | null) {
  if (!iso) return "nigdy";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return "dziś";
  if (days === 1) return "wczoraj";
  if (days < 30) return `${days} dni temu`;
  return new Date(iso).toLocaleDateString("pl-PL");
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Dziś";
  if (sameDay(d, yesterday)) return "Wczoraj";
  return d.toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function TeamActivityPage() {
  const membersFn = useServerFn(getTeamMembers);
  const activityFn = useServerFn(getTeamActivity);
  const [filter, setFilter] = useState<RoleFilter>("all");

  const membersQ = useQuery({ queryKey: ["team-members"], queryFn: () => membersFn() });
  const activityQ = useQuery({
    queryKey: ["team-activity"],
    queryFn: () => activityFn({ data: { limit: 500 } }),
  });

  const members = (membersQ.data ?? []) as TeamMember[];
  const rows = (activityQ.data ?? []) as TeamActivityRow[];

  const filteredMembers = members.filter((m) =>
    filter === "all" ? true : m.roles.some((r) => matchesFilter(r, filter)),
  );
  const filteredRows = rows.filter((r) =>
    filter === "all" ? true : matchesFilter(r.user_role, filter),
  );

  const hasBrokers = members.some((m) => m.roles.includes("posrednik"));

  // Grupowanie feedu po dniach.
  const groups: { label: string; items: TeamActivityRow[] }[] = [];
  for (const r of filteredRows) {
    const label = dayLabel(r.happened_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(r);
    else groups.push({ label, items: [r] });
  }

  const error = membersQ.error || activityQ.error;
  const loading = membersQ.isLoading || activityQ.isLoading;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Eye className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Zespół i aktywność</h1>
          <p className="text-sm text-muted-foreground">
            Kto pracuje w systemie i co ostatnio robił — logowania, kontakty z leadami, dokumenty,
            zmiany statusów wniosków i leadów.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Zdarzenia pochodzą z dziennika systemowego oraz z realnych działań w aplikacji (notatki,
          telefony, podgląd danych leada, wgrane dokumenty, decyzje). Zmiany statusów wniosków i
          leadów są rejestrowane automatycznie od momentu włączenia tej wersji strony — starsze
          zmiany nie były zapisywane, więc historia zaczyna się od teraz. Wpisy „System /
          automatyzacja" to działania botów i automatów, nie ludzi.
        </p>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Nie udało się pobrać danych: {(error as Error).message}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-md px-3 py-1.5 text-sm border ${
              filter === f.key
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-accent"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zespół ({filteredMembers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Ładowanie…</p>
          ) : filteredMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {filter === "posrednik"
                ? "W systemie nie ma jeszcze żadnego konta z rolą pośrednika. Konta pośredników powstają po rejestracji w programie pośredników — do tego czasu ta zakładka będzie pusta."
                : "Brak kont w tej kategorii."}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMembers.map((m) => (
                <div key={m.user_id} className="rounded-md border p-3 text-sm">
                  <div className="font-medium">{m.name || m.email || m.user_id.slice(0, 8)}</div>
                  {m.email && m.name ? (
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.roles.map((r) => (
                      <Badge key={r} variant="outline">
                        {ROLE_LABELS[r] ?? r}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    <div>Ostatnie logowanie: {formatRelative(m.last_sign_in_at)}</div>
                    <div>Ostatnie działanie: {formatRelative(m.last_action_at)}</div>
                    <div>Działań (30 dni): {m.actions_30d}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zdarzenia ({filteredRows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Ładowanie…</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {filter === "posrednik" && !hasBrokers
                ? "Brak zdarzeń, bo w systemie nie ma jeszcze kont pośredników."
                : "Brak zarejestrowanych zdarzeń dla tego filtra. Zdarzenia pojawiają się przy realnych działaniach: kontakcie z leadem, wgraniu dokumentu, zmianie statusu wniosku lub leada."}
            </p>
          ) : (
            <div className="space-y-5">
              {groups.map((g) => (
                <div key={g.label}>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.label}
                  </div>
                  <div className="space-y-2">
                    {g.items.map((r) => {
                      const Icon = eventIcon(r);
                      return (
                        <div key={r.id} className="flex gap-3 rounded-md border p-3 text-sm">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{r.title}</span>
                              {r.user_role ? (
                                <Badge variant="outline">
                                  {ROLE_LABELS[r.user_role] ?? r.user_role}
                                </Badge>
                              ) : null}
                              <span className="ml-auto text-xs text-muted-foreground">
                                {new Date(r.happened_at).toLocaleTimeString("pl-PL", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            {r.details ? (
                              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                {r.details}
                              </div>
                            ) : null}
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {r.user_name ||
                                r.user_email ||
                                (r.user_id ? r.user_id.slice(0, 8) : "System / automatyzacja")}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
