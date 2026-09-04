// Panel administratora — pakiet umów inwestora (FY-LEGAL-2026-09-04).
// Rejestr dokumentów z hashami i aktywacją po przeglądzie kancelarii,
// dziennik akceptacji (Zał. 5) oraz decyzje o Zleceniach (Zał. 7, SLA 2 dni).
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Lock, Unlock } from "lucide-react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  getLegalPackAdminState,
  setLegalPackActive,
  decideInvestorOrder,
} from "@/lib/investor-agreements/legal-pack.functions";

export const Route = createFileRoute("/admin/umowy-inwestorow")({
  component: AdminUmowyPage,
});

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Wystąpił błąd";
}

function AdminUmowyPage() {
  const qc = useQueryClient();
  const fetchState = useServerFn(getLegalPackAdminState);
  const { data: state, isLoading } = useQuery({
    queryKey: ["legal-pack-admin"],
    queryFn: () => fetchState(),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["legal-pack-admin"] });

  if (isLoading || !state) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wczytywanie…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Dokumenty"
        title="Umowy inwestorów"
        subtitle="Pakiet FY-LEGAL-2026-09-04 — dokumenty kanoniczne, dziennik akceptacji i decyzje o Zleceniach."
      />
      <DocumentsCard state={state} onDone={refresh} />
      <OrdersCard state={state} onDone={refresh} />
      <AcceptancesCard state={state} />
    </div>
  );
}

function DocumentsCard({ state, onDone }: { state: any; onDone: () => void }) {
  const setActive = useServerFn(setLegalPackActive);
  const docs = state.documents ?? [];
  const anyActive = docs.some((d: any) => d.active);
  const mut = useMutation({
    mutationFn: (active: boolean) => setActive({ data: { active } }),
    onSuccess: (_r, active) => {
      toast.success(active ? "Pakiet aktywowany" : "Pakiet uśpiony");
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Dokumenty kanoniczne</CardTitle>
        <Button
          size="sm"
          variant={anyActive ? "outline" : "default"}
          disabled={mut.isPending}
          onClick={() => {
            if (
              !anyActive &&
              !window.confirm(
                "Aktywować pakiet? Rób to wyłącznie po potwierdzeniu przeglądu przez kancelarię.",
              )
            )
              return;
            mut.mutate(!anyActive);
          }}
        >
          {mut.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : anyActive ? (
            <Lock className="mr-2 h-4 w-4" />
          ) : (
            <Unlock className="mr-2 h-4 w-4" />
          )}
          {anyActive ? "Uśpij pakiet" : "Aktywuj pakiet (po przeglądzie kancelarii)"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {!anyActive ? (
          <p className="text-xs text-amber-700">
            Pakiet jest uśpiony — inwestorzy widzą komunikat „w przygotowaniu". Aktywuj dopiero po
            przeglądzie kancelarii (w szczególności: sekwencyjne przedstawianie Projektu i Kara
            Obejściowa wobec Konsumenta).
          </p>
        ) : null}
        {docs.map((d: any) => (
          <div
            key={d.code}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
          >
            <div>
              <div className="font-medium">
                {d.title} <span className="text-muted-foreground">({d.version})</span>
              </div>
              <div className="font-mono text-[11px] text-muted-foreground break-all">
                SHA-256: {d.sha256}
              </div>
            </div>
            <Badge className={d.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}>
              {d.active ? "aktywny" : "uśpiony"}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const ORDER_STATUS_TONES: Record<string, string> = {
  zlozone: "bg-amber-100 text-amber-800",
  przyjete: "bg-emerald-100 text-emerald-800",
  wykonane: "bg-blue-100 text-blue-800",
  wygasle: "bg-slate-100 text-slate-600",
  cofniete: "bg-slate-100 text-slate-600",
  odmowa: "bg-red-100 text-red-700",
};

function OrdersCard({ state, onDone }: { state: any; onDone: () => void }) {
  const decide = useServerFn(decideInvestorOrder);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const mut = useMutation({
    mutationFn: (input: { orderId: string; decision: "przyjmij" | "odmow"; reason?: string }) =>
      decide({ data: input }),
    onSuccess: () => {
      toast.success("Decyzja zapisana");
      onDone();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const orders = state.orders ?? [];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Zlecenia inwestorów{" "}
          <span className="text-sm font-normal text-muted-foreground">
            (decyzja w 2 dni robocze; limit 3 przyjętych na inwestora)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak Zleceń.</p>
        ) : (
          orders.map((o: any) => (
            <div key={o.id} className="space-y-2 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">FY-Z-{o.order_seq}</span> ·{" "}
                  {Number(o.amount_pln).toLocaleString("pl-PL")} zł ± 15% · maks.{" "}
                  {o.max_period_months} mies. · min. {o.min_annual_yield}% · ważność{" "}
                  {o.validity_days} dni
                  <div className="text-xs text-muted-foreground">
                    złożone {new Date(o.submitted_at).toLocaleString("pl-PL")} · user{" "}
                    {String(o.user_id).slice(0, 8)}…
                    {o.consumer_choice !== "nie_dotyczy"
                      ? ` · Konsument: ${o.consumer_choice === "zadanie_startu_przed_14" ? "żąda startu przed 14 dniami" : "start po 14 dniach"}`
                      : ""}
                    {o.expires_at
                      ? ` · ważne do ${new Date(o.expires_at).toLocaleDateString("pl-PL")}`
                      : ""}
                  </div>
                </div>
                <Badge className={ORDER_STATUS_TONES[o.status] ?? "bg-slate-100"}>{o.status}</Badge>
              </div>
              {o.status === "zlozone" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={mut.isPending}
                    onClick={() => mut.mutate({ orderId: o.id, decision: "przyjmij" })}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Przyjmij
                  </Button>
                  <Input
                    className="h-8 w-64 text-xs"
                    placeholder="Powód odmowy (opcjonalnie)"
                    value={reasons[o.id] ?? ""}
                    onChange={(e) => setReasons((p) => ({ ...p, [o.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mut.isPending}
                    onClick={() =>
                      mut.mutate({ orderId: o.id, decision: "odmow", reason: reasons[o.id] })
                    }
                  >
                    Odmów
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function AcceptancesCard({ state }: { state: any }) {
  const acceptances = state.acceptances ?? [];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Dziennik akceptacji{" "}
          <span className="text-sm font-normal text-muted-foreground">
            (Załącznik nr 5 — wersja, skrót, czas UTC, IP, metoda uwierzytelnienia)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {acceptances.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak akceptacji.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-3">Czas (UTC)</th>
                  <th className="py-1.5 pr-3">Użytkownik</th>
                  <th className="py-1.5 pr-3">Dokument</th>
                  <th className="py-1.5 pr-3">Wersja</th>
                  <th className="py-1.5 pr-3">Wariant</th>
                  <th className="py-1.5 pr-3">Konsument</th>
                  <th className="py-1.5 pr-3">IP</th>
                  <th className="py-1.5">SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {acceptances.map((a: any) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {new Date(a.accepted_at).toISOString().replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="py-1.5 pr-3 font-mono">
                      {a.personal_data_snapshot?.investor?.email ??
                        `${String(a.user_id).slice(0, 8)}…`}
                    </td>
                    <td className="py-1.5 pr-3">{a.document_code}</td>
                    <td className="py-1.5 pr-3">{a.version}</td>
                    <td className="py-1.5 pr-3">{a.entity_variant}</td>
                    <td className="py-1.5 pr-3">{a.is_consumer ? "tak" : "nie"}</td>
                    <td className="py-1.5 pr-3 font-mono">{a.ip ?? "—"}</td>
                    <td className="py-1.5 font-mono">{String(a.sha256).slice(0, 12)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
