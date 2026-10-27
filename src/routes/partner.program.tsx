import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Network,
  Wallet,
  CheckCircle2,
  Clock,
  BanknoteIcon,
  Copy,
  UserCheck,
  AlertTriangle,
  Info,
} from "lucide-react";
import { formatPLN } from "@/lib/labels";
import { INVESTOR_COMMISSION_PLN } from "@/lib/affiliate/engine-pure";
import { partnerStatusLabels, partnerStatusColors } from "@/lib/affiliate/labels";
import { ComplianceNotice } from "@/components/affiliate/compliance-notice";
import { getAffiliateDashboard, getMyAffiliatePartner } from "@/lib/affiliate/partner.functions";

export const Route = createFileRoute("/partner/program")({
  component: ProgramDashboard,
});

const SITE_ORIGIN = "https://financeyou.pl";

function ProgramDashboard() {
  const dashFn = useServerFn(getAffiliateDashboard);
  const meFn = useServerFn(getMyAffiliatePartner);
  const dashQ = useQuery({ queryKey: ["affiliate-dashboard"], queryFn: () => dashFn() });
  const meQ = useQuery({ queryKey: ["affiliate-me"], queryFn: () => meFn() });
  const [copied, setCopied] = useState(false);

  if (dashQ.isLoading) return <p className="text-muted-foreground">Ładowanie…</p>;

  const me = meQ.data as any;
  const dash = dashQ.data as any;

  if (!dash || !me) {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Network className="h-6 w-6" /> Program partnerski
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>Nie jesteś jeszcze w programie partnerskim</CardTitle>
            <CardDescription>
              Zarejestruj się, aby otrzymać link polecający dla inwestorów.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/program-partnerski/rejestracja" search={{ ref: "" }}>
                Dołącz do programu partnerskiego
              </Link>
            </Button>
          </CardContent>
        </Card>
        <ComplianceNotice kind="partner" />
      </div>
    );
  }

  // Polecenie trafia na stronę dla inwestora; kod ?ref= zapisuje się na koncie
  // inwestora po rejestracji (ReferralCapture), a prowizja nalicza się przy
  // jego pierwszym opłaconym dostępie.
  const refLink = `${SITE_ORIGIN}/dla-inwestora?ref=${me.referral_code}`;
  const b = dash.balances;
  const progPct = Math.min(100, Math.round((b.dostepne / b.prog) * 100));

  const tiles = [
    { label: "Saldo naliczone", value: b.naliczone, icon: Clock, color: "text-amber-600" },
    {
      label: "Saldo zatwierdzone",
      value: b.zatwierdzone,
      icon: CheckCircle2,
      color: "text-blue-600",
    },
    { label: "Dostępne do wypłaty", value: b.dostepne, icon: Wallet, color: "text-indigo-600" },
    {
      label: "Wypłacone (suma)",
      value: b.wyplacone,
      icon: BanknoteIcon,
      color: "text-emerald-600",
    },
  ];

  const counts = [
    { label: "Polecenia inwestorów", value: dash.counts.inwestorzy, icon: UserCheck },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Network className="h-6 w-6" /> Program partnerski
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatPLN(INVESTOR_COMMISSION_PLN)} za każdego nowego inwestora, który kupi abonament.
          </p>
        </div>
        <Badge className={partnerStatusColors[me.status] ?? "bg-slate-100"} variant="secondary">
          {partnerStatusLabels[me.status] ?? me.status}
        </Badge>
      </div>

      {dash.alerts?.map((a: any, i: number) => (
        <Alert
          key={i}
          variant={a.level === "danger" ? "destructive" : undefined}
          className={
            a.level === "warning" ? "border-amber-300 bg-amber-50 text-amber-900" : undefined
          }
        >
          {a.level === "danger" ? (
            <AlertTriangle className="h-4 w-4" />
          ) : a.level === "warning" ? (
            <AlertTriangle className="h-4 w-4 !text-amber-600" />
          ) : (
            <Info className="h-4 w-4" />
          )}
          <AlertDescription>{a.message}</AlertDescription>
        </Alert>
      ))}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Twój link polecający dla inwestorów</CardTitle>
          <CardDescription>
            Wyślij go inwestorowi. Gdy założy konto z tego linku i kupi abonament, otrzymasz{" "}
            {formatPLN(INVESTOR_COMMISSION_PLN)} prowizji. Kod: <b>{me.referral_code}</b>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2">
          <code className="flex-1 rounded-md border bg-muted/40 px-3 py-2 text-sm break-all">
            {refLink}
          </code>
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(refLink);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Copy className="mr-2 h-4 w-4" /> {copied ? "Skopiowano" : "Kopiuj"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t.label}</span>
                <t.icon className={`h-4 w-4 ${t.color}`} />
              </div>
              <div className={`text-xl font-bold mt-1 ${t.color}`}>{formatPLN(t.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Próg wypłaty 500 zł</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={progPct} />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Dostępne: <b className="text-foreground">{formatPLN(b.dostepne)}</b>
            </span>
            {b.brakujaceDoProgu > 0 ? (
              <span className="text-muted-foreground">
                Do progu brakuje: <b className="text-foreground">{formatPLN(b.brakujaceDoProgu)}</b>
              </span>
            ) : (
              <span className="text-emerald-600 font-medium">Próg osiągnięty</span>
            )}
          </div>
          {b.dostepne < b.prog && (
            <p className="text-xs text-muted-foreground">
              Twoje saldo nie osiągnęło jeszcze minimalnego progu wypłaty 500 zł.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Polecenia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {counts.map((c) => (
              <div key={c.label} className="flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <c.icon className="h-4 w-4 text-muted-foreground" /> {c.label}
                </span>
                <b className="tabular-nums">{c.value}</b>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {dash.limitInfo && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Limit działalności nierejestrowanej — Q{dash.limitInfo.quarter} {dash.limitInfo.year}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={Math.min(100, Math.round((dash.limitInfo.ratio || 0) * 100))} />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Wykorzystano:{" "}
                <b className="text-foreground">{formatPLN(dash.limitInfo.quarterSum)}</b> z{" "}
                {formatPLN(dash.limitInfo.limitAmount)}
              </span>
              <span className="text-muted-foreground">
                Pozostało: <b className="text-foreground">{formatPLN(dash.limitInfo.remaining)}</b>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <ComplianceNotice kind="partner" />
    </div>
  );
}
