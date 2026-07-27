import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Receipt,
  Building2,
  FileCheck,
  ShieldCheck,
  Wallet,
  Send,
  Clock,
  AlertTriangle,
  Users,
  FileText,
} from "lucide-react";
import { formatPLN } from "@/lib/labels";
import { getAccountingStats } from "@/lib/accounting/functions";

export const Route = createFileRoute("/admin/ksiegowosc/")({
  component: KsiegowoscIndex,
});

function KsiegowoscIndex() {
  const fn = useServerFn(getAccountingStats);
  const q = useQuery({ queryKey: ["accounting-stats"], queryFn: () => fn() });
  const s = (q.data as any) ?? null;

  const tiles = s
    ? [
        {
          label: "Faktury razem",
          value: String(s.count),
          sub: formatPLN(s.grossTotal),
          icon: Receipt,
          color: "text-slate-700",
        },
        { label: "Robocze", value: String(s.draft), icon: Clock, color: "text-amber-600" },
        { label: "Wystawione", value: String(s.issued), icon: Send, color: "text-blue-600" },
        {
          label: "Opłacone",
          value: String(s.paid),
          sub: formatPLN(s.grossPaid),
          icon: Wallet,
          color: "text-emerald-600",
        },
        {
          label: "KSeF zaakceptowane",
          value: String(s.ksefAccepted),
          icon: ShieldCheck,
          color: "text-emerald-600",
        },
        {
          label: "KSeF oczekuje",
          value: String(s.ksefPending),
          icon: Clock,
          color: "text-amber-600",
        },
        {
          label: "KSeF błędy",
          value: String(s.ksefError),
          icon: AlertTriangle,
          color: "text-rose-600",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Receipt className="h-6 w-6" /> Księgowość
        </h1>
        <p className="text-sm text-muted-foreground">
          Faktury sprzedaży, dwa podmioty gospodarcze i integracja z KSeF. Faktury wystawiane
          automatycznie po wpłatach.
        </p>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Faktury są wystawiane automatycznie po zaksięgowanej wpłacie z domyślnego podmiotu.
          Podmiot dla konkretnej faktury możesz zmienić w zakładce <b>Faktury</b> (dopóki faktura
          jest robocza).
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {q.isLoading ? (
          <p className="text-muted-foreground col-span-full">Ładowanie…</p>
        ) : (
          tiles.map((t) => (
            <Card key={t.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t.label}</span>
                  <t.icon className={`h-4 w-4 ${t.color}`} />
                </div>
                <div className={`text-xl font-bold mt-1 ${t.color}`}>{t.value}</div>
                {t.sub && <div className="text-xs text-muted-foreground">{t.sub}</div>}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-3 border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Dokumenty księgowe (KSeF)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Jeden rejestr wszystkich faktur — sprzedaż i koszty, ze wszystkich podmiotów.
              Automatyczna synchronizacja z KSeF.
            </p>
            <Button asChild size="sm">
              <Link to="/admin/ksiegowosc/dokumenty">Otwórz rejestr FV</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" /> Faktury sprzedaży
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Lista faktur, wystawianie ręczne, status KSeF, eksport.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/ksiegowosc/faktury">Przejdź do faktur</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Podmioty gospodarcze
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Dwa podmioty, podmiot domyślny, konfiguracja KSeF.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/ksiegowosc/podmioty">Zarządzaj podmiotami</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Rejestr sprzedaży OF
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sprzedaż dla osób fizycznych — faktura wystawiana tylko na żądanie po uzupełnieniu
              adresu.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/ksiegowosc/rejestr-of">Otwórz rejestr</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="h-4 w-4" /> Rozliczenia partnerów
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Faktury B2B partnerów i ewidencja działalności nierejestrowanej.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/program-posrednikow/rozliczenia">Rozliczenia programu</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
