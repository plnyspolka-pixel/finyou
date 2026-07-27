import { Card } from "@/components/ui/card";
import { Phone, PhoneCall, Clock, Coins } from "lucide-react";

export function VoicebotStats({ rows }: { rows: any[] }) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const today = rows.filter((r) => now - new Date(r.created_at).getTime() < dayMs);
  const week = rows.filter((r) => now - new Date(r.created_at).getTime() < 7 * dayMs);

  function calc(set: any[]) {
    const total = set.length;
    const answered = set.filter((r) => r.call_outcome === "answered").length;
    const withDur = set.filter((r) => typeof r.duration_seconds === "number");
    const avgDur = withDur.length
      ? Math.round(withDur.reduce((a, r) => a + (r.duration_seconds ?? 0), 0) / withDur.length)
      : null;
    const cost = set.reduce(
      (a, r) => a + (typeof r.cost_credits === "number" ? r.cost_credits : 0),
      0,
    );
    const pctAnswered = total ? Math.round((answered / total) * 100) : 0;
    return { total, answered, pctAnswered, avgDur, cost };
  }

  const t = calc(today);
  const w = calc(week);

  function fmtDur(secs: number | null) {
    if (secs == null) return "—";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  function fmtCost(c: number) {
    if (!c) return "—";
    if (c >= 1000) return `${Math.round(c / 100) / 10}k kr.`;
    return `${Math.round(c)} kr.`;
  }

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Stat icon={<Phone className="h-4 w-4" />} label="Rozmowy" today={t.total} week={w.total} />
      <Stat
        icon={<PhoneCall className="h-4 w-4" />}
        label="% odebranych"
        today={`${t.pctAnswered}%`}
        week={`${w.pctAnswered}%`}
      />
      <Stat
        icon={<Clock className="h-4 w-4" />}
        label="Średni czas"
        today={fmtDur(t.avgDur)}
        week={fmtDur(w.avgDur)}
      />
      <Stat
        icon={<Coins className="h-4 w-4" />}
        label="Koszt łącznie"
        today={fmtCost(t.cost)}
        week={fmtCost(w.cost)}
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  today,
  week,
}: {
  icon: React.ReactNode;
  label: string;
  today: React.ReactNode;
  week: React.ReactNode;
}) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-semibold">{today}</span>
        <span className="text-xs text-muted-foreground">dziś</span>
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">7 dni: {week}</div>
    </Card>
  );
}
