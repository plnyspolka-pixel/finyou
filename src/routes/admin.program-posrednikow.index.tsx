import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Network,
  Users,
  UserCheck,
  Clock,
  Coins,
  CheckCircle2,
  BanknoteIcon,
  Ban,
  ShieldCheck,
  Activity,
} from "lucide-react";
import { formatPLN } from "@/lib/labels";
import { getAffiliateProgramStats } from "@/lib/affiliate/admin.functions";

export const Route = createFileRoute("/admin/program-posrednikow/")({
  component: ProgramDashboard,
});

function Tile({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: any;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          {Icon ? <Icon className={`h-4 w-4 ${color ?? "text-muted-foreground"}`} /> : null}
        </div>
        <div className={`text-xl font-bold mt-1 ${color ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ProgramDashboard() {
  const fn = useServerFn(getAffiliateProgramStats);
  const q = useQuery({ queryKey: ["admin-affiliate-stats"], queryFn: () => fn() });
  const s = q.data as any;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Network className="h-6 w-6" /> Program pośredników
        </h1>
        <p className="text-sm text-muted-foreground">
          Przegląd partnerów, prowizji, zdarzeń gospodarczych i wypłat.
        </p>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription className="text-xs leading-relaxed">
          Prowizje wyłącznie od realnych zdarzeń gospodarczych. Program nie przewiduje wynagrodzenia
          za samo zapraszanie osób.
        </AlertDescription>
      </Alert>

      {q.isLoading || !s ? (
        <p className="text-muted-foreground">Ładowanie…</p>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Partnerzy
            </h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
              <Tile label="Wszyscy partnerzy" value={s.partners.total} icon={Users} />
              <Tile
                label="Aktywni"
                value={s.partners.active}
                icon={UserCheck}
                color="text-emerald-600"
              />
              <Tile
                label="Oczekujący"
                value={s.partners.pending}
                icon={Clock}
                color="text-amber-600"
              />
              <Tile label="B2B (faktura)" value={s.partners.b2b} icon={Users} />
              <Tile label="Działalność nierej." value={s.partners.unregistered} icon={Users} />
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Prowizje
            </h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Tile
                label="Do zatwierdzenia"
                value={formatPLN(s.commissions.pendingApproval)}
                icon={Clock}
                color="text-amber-600"
              />
              <Tile
                label="Zatwierdzone"
                value={formatPLN(s.commissions.approved)}
                icon={CheckCircle2}
                color="text-blue-600"
              />
              <Tile
                label="Wypłacone"
                value={formatPLN(s.commissions.paid)}
                icon={BanknoteIcon}
                color="text-emerald-600"
              />
              <Tile
                label="Zablokowane"
                value={formatPLN(s.commissions.blocked)}
                icon={Ban}
                color="text-rose-600"
              />
            </div>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
              <Tile
                label="Poziom 1 (bezpośrednie)"
                value={formatPLN(s.commissions.level1)}
                icon={Coins}
              />
              <Tile label="Poziom 2" value={formatPLN(s.commissions.level2)} icon={Coins} />
              <Tile label="Poziom 3" value={formatPLN(s.commissions.level3)} icon={Coins} />
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Zdarzenia gospodarcze
            </h2>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
              <Tile label="Wszystkie" value={s.events.total} icon={Activity} />
              <Tile
                label="Potwierdzone"
                value={s.events.confirmed}
                icon={CheckCircle2}
                color="text-emerald-600"
              />
              <Tile label="Konta inwestorów" value={s.events.investor} icon={Activity} />
              <Tile label="Konta pośredników" value={s.events.broker} icon={Activity} />
              <Tile label="Wypłaty klientom" value={s.events.client} icon={Activity} />
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Wypłaty
            </h2>
            <div className="grid gap-3 grid-cols-2">
              <Tile label="Paczki wypłat" value={s.payouts.batches} icon={BanknoteIcon} />
              <Tile
                label="Wypłacono łącznie"
                value={formatPLN(s.payouts.paidTotal)}
                icon={BanknoteIcon}
                color="text-emerald-600"
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
