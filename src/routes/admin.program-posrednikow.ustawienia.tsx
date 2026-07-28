import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatPLN } from "@/lib/labels";
import { eventTypeLabels, basisTypeLabels, settlementTypeLabels } from "@/lib/affiliate/labels";
import {
  adminListRules,
  adminUpsertRule,
  adminDeleteRule,
  adminListLimits,
  adminUpsertLimit,
} from "@/lib/affiliate/admin.functions";

export const Route = createFileRoute("/admin/program-posrednikow/ustawienia")({
  component: UstawieniaPage,
});

const EVENT_TYPES = ["investor_account_paid", "broker_account_paid", "client_funds_disbursed"];
const BASIS_TYPES = [
  "fixed_amount",
  "percent_of_net_revenue",
  "percent_of_gross_payment",
  "percent_of_loan_amount",
  "percent_of_finance_you_fee",
  "manual",
];

function UstawieniaPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" /> Ustawienia programu
        </h1>
        <p className="text-sm text-muted-foreground">
          Reguły prowizji oraz limity działalności nierejestrowanej. Stawki są w pełni
          konfigurowalne — brak wartości zaszytych w kodzie.
        </p>
      </div>

      <Tabs defaultValue="reguly" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger value="reguly" className="whitespace-normal leading-tight">
            Reguły prowizji
          </TabsTrigger>
          <TabsTrigger value="limity" className="whitespace-normal leading-tight">
            Limity nierejestrowanej
          </TabsTrigger>
        </TabsList>
        <TabsContent value="reguly" className="mt-0">
          <RulesTab />
        </TabsContent>
        <TabsContent value="limity" className="mt-0">
          <LimitsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function rateText(r: any): string {
  if (r.basis_type === "fixed_amount")
    return r.fixed_amount != null ? formatPLN(r.fixed_amount) : "—";
  if (r.basis_type === "manual") return "ręcznie";
  return r.percent_rate != null ? `${r.percent_rate}%` : "—";
}

function RulesTab() {
  const listFn = useServerFn(adminListRules);
  const deleteFn = useServerFn(adminDeleteRule);
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["admin-affiliate-rules"], queryFn: () => listFn() });
  const rows = (q.data as any[]) ?? [];
  const [edit, setEdit] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  async function doDelete(id: string) {
    if (!confirm("Usunąć regułę prowizji?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Reguła usunięta");
      void qc.invalidateQueries({ queryKey: ["admin-affiliate-rules"] });
    } catch (e) {
      toast.error("Nie udało się usunąć", { description: (e as Error).message });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Reguły naliczania prowizji wg typu zdarzenia i poziomu sieci.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nowa reguła
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa</TableHead>
                <TableHead>Zdarzenie</TableHead>
                <TableHead>Poziom</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead>Podstawa</TableHead>
                <TableHead className="text-right">Stawka</TableHead>
                <TableHead className="text-right">Min / Maks</TableHead>
                <TableHead>Okno zwrotu</TableHead>
                <TableHead>Aktywna</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && (
                <TableRow>
                  <TableCell colSpan={10} className="p-6 text-center text-muted-foreground">
                    Ładowanie…
                  </TableCell>
                </TableRow>
              )}
              {!q.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="p-6 text-center text-muted-foreground">
                    Brak reguł. Dodaj pierwszą regułę, aby naliczać prowizje.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-xs">
                    {eventTypeLabels[r.event_type] ?? r.event_type}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">P{r.network_level}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.settlement_type_filter
                      ? (settlementTypeLabels[r.settlement_type_filter] ?? r.settlement_type_filter)
                      : "wszystkie"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {basisTypeLabels[r.basis_type] ?? r.basis_type}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{rateText(r)}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {r.min_commission != null ? formatPLN(r.min_commission) : "—"} /{" "}
                    {r.max_commission != null ? formatPLN(r.max_commission) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{r.refund_window_days} dni</TableCell>
                  <TableCell>
                    {r.active ? (
                      <Badge className="bg-emerald-100 text-emerald-800" variant="secondary">
                        Tak
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Nie</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => setEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-rose-700"
                        onClick={() => doDelete(r.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {(creating || edit) && (
        <RuleDialog
          rule={edit}
          onClose={() => {
            setCreating(false);
            setEdit(null);
          }}
        />
      )}
    </div>
  );
}

function RuleDialog({ rule, onClose }: { rule: any | null; onClose: () => void }) {
  const upsertFn = useServerFn(adminUpsertRule);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState(rule?.name ?? "");
  const [active, setActive] = useState<boolean>(rule?.active ?? true);
  const [eventType, setEventType] = useState(rule?.event_type ?? "investor_account_paid");
  const [networkLevel, setNetworkLevel] = useState(String(rule?.network_level ?? 1));
  const [settlementFilter, setSettlementFilter] = useState(rule?.settlement_type_filter ?? "all");
  const [basisType, setBasisType] = useState(rule?.basis_type ?? "fixed_amount");
  const [fixedAmount, setFixedAmount] = useState(
    rule?.fixed_amount != null ? String(rule.fixed_amount) : "",
  );
  const [percentRate, setPercentRate] = useState(
    rule?.percent_rate != null ? String(rule.percent_rate) : "",
  );
  const [minCommission, setMinCommission] = useState(
    rule?.min_commission != null ? String(rule.min_commission) : "",
  );
  const [maxCommission, setMaxCommission] = useState(
    rule?.max_commission != null ? String(rule.max_commission) : "",
  );
  const [requiresApproval, setRequiresApproval] = useState<boolean>(
    rule?.requires_admin_approval ?? true,
  );
  const [refundWindow, setRefundWindow] = useState(String(rule?.refund_window_days ?? 14));

  const num = (v: string) => (v === "" ? null : Number(v));
  const isFixed = basisType === "fixed_amount";
  const isPercent = basisType.startsWith("percent_");

  async function submit() {
    if (!name.trim()) return toast.error("Podaj nazwę reguły");
    setBusy(true);
    try {
      await upsertFn({
        data: {
          id: rule?.id,
          name,
          active,
          event_type: eventType as any,
          network_level: Number(networkLevel),
          settlement_type_filter: settlementFilter === "all" ? null : (settlementFilter as any),
          basis_type: basisType as any,
          fixed_amount: isFixed ? num(fixedAmount) : null,
          percent_rate: isPercent ? num(percentRate) : null,
          min_commission: num(minCommission),
          max_commission: num(maxCommission),
          requires_admin_approval: requiresApproval,
          refund_window_days: Number(refundWindow),
        },
      });
      toast.success(rule ? "Reguła zaktualizowana" : "Reguła utworzona");
      void qc.invalidateQueries({ queryKey: ["admin-affiliate-rules"] });
      onClose();
    } catch (e) {
      toast.error("Nie udało się zapisać reguły", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "Edytuj regułę prowizji" : "Nowa reguła prowizji"}</DialogTitle>
          <DialogDescription>
            Stawki konfigurowane administracyjnie — żadne wartości nie są zaszyte w kodzie.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nazwa</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Typ zdarzenia</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {eventTypeLabels[t] ?? t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Poziom sieci</Label>
              <Select value={networkLevel} onValueChange={setNetworkLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Poziom 1</SelectItem>
                  <SelectItem value="2">Poziom 2</SelectItem>
                  <SelectItem value="3">Poziom 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Filtr formy rozliczenia</Label>
              <Select value={settlementFilter} onValueChange={setSettlementFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  <SelectItem value="b2b">{settlementTypeLabels.b2b}</SelectItem>
                  <SelectItem value="unregistered_activity">
                    {settlementTypeLabels.unregistered_activity}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Podstawa naliczenia</Label>
              <Select value={basisType} onValueChange={setBasisType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BASIS_TYPES.map((b) => (
                    <SelectItem key={b} value={b}>
                      {basisTypeLabels[b] ?? b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {isFixed && (
              <div className="space-y-1">
                <Label>Kwota stała (zł)</Label>
                <Input
                  type="number"
                  value={fixedAmount}
                  onChange={(e) => setFixedAmount(e.target.value)}
                />
              </div>
            )}
            {isPercent && (
              <div className="space-y-1">
                <Label>Stawka (%)</Label>
                <Input
                  type="number"
                  value={percentRate}
                  onChange={(e) => setPercentRate(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label>Okno zwrotu (dni)</Label>
              <Input
                type="number"
                value={refundWindow}
                onChange={(e) => setRefundWindow(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Min. prowizja (zł)</Label>
              <Input
                type="number"
                value={minCommission}
                onChange={(e) => setMinCommission(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Maks. prowizja (zł)</Label>
              <Input
                type="number"
                value={maxCommission}
                onChange={(e) => setMaxCommission(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="req-approval"
              checked={requiresApproval}
              onCheckedChange={(v) => setRequiresApproval(Boolean(v))}
            />
            <Label htmlFor="req-approval" className="font-normal">
              Wymaga zatwierdzenia administratora
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="rule-active"
              checked={active}
              onCheckedChange={(v) => setActive(Boolean(v))}
            />
            <Label htmlFor="rule-active" className="font-normal">
              Reguła aktywna
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Zapisywanie…" : "Zapisz regułę"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LimitsTab() {
  const listFn = useServerFn(adminListLimits);
  const q = useQuery({ queryKey: ["admin-affiliate-limits"], queryFn: () => listFn() });
  const rows = (q.data as any[]) ?? [];
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Kwartalne limity przychodów dla rozliczenia w formie działalności nierejestrowanej.
        </p>
        <LimitDialog open={open} setOpen={setOpen} />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rok</TableHead>
                <TableHead>Kwartał</TableHead>
                <TableHead className="text-right">Limit</TableHead>
                <TableHead>Źródło</TableHead>
                <TableHead>Aktywny</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="p-6 text-center text-muted-foreground">
                    Ładowanie…
                  </TableCell>
                </TableRow>
              )}
              {!q.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="p-6 text-center text-muted-foreground">
                    Brak zdefiniowanych limitów.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.year}</TableCell>
                  <TableCell>Q{l.quarter}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatPLN(l.limit_amount)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.source_note ?? "—"}
                  </TableCell>
                  <TableCell>
                    {l.active ? (
                      <Badge className="bg-emerald-100 text-emerald-800" variant="secondary">
                        Tak
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Nie</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function LimitDialog({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const upsertFn = useServerFn(adminUpsertLimit);
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [quarter, setQuarter] = useState(String(Math.floor(now.getMonth() / 3) + 1));
  const [limitAmount, setLimitAmount] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!limitAmount) return toast.error("Podaj kwotę limitu");
    setBusy(true);
    try {
      await upsertFn({
        data: {
          year: Number(year),
          quarter: Number(quarter),
          limit_amount: Number(limitAmount),
          source_note: sourceNote || undefined,
          active,
        },
      });
      toast.success("Limit zapisany");
      void qc.invalidateQueries({ queryKey: ["admin-affiliate-limits"] });
      setOpen(false);
      setLimitAmount("");
      setSourceNote("");
    } catch (e) {
      toast.error("Nie udało się zapisać limitu", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" /> Dodaj / zmień limit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Limit działalności nierejestrowanej</DialogTitle>
          <DialogDescription>
            Limit jest aktualizowany na podstawie roku i kwartału (nadpisuje istniejący).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Rok</Label>
              <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Kwartał</Label>
              <Select value={quarter} onValueChange={setQuarter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Q1</SelectItem>
                  <SelectItem value="2">Q2</SelectItem>
                  <SelectItem value="3">Q3</SelectItem>
                  <SelectItem value="4">Q4</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Kwota limitu (zł)</Label>
            <Input
              type="number"
              value={limitAmount}
              onChange={(e) => setLimitAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Źródło / notatka</Label>
            <Input
              value={sourceNote}
              onChange={(e) => setSourceNote(e.target.value)}
              placeholder="np. podstawa prawna, data aktualizacji"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="limit-active"
              checked={active}
              onCheckedChange={(v) => setActive(Boolean(v))}
            />
            <Label htmlFor="limit-active" className="font-normal">
              Limit aktywny
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Zapisywanie…" : "Zapisz limit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
