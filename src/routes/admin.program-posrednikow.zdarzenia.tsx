import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Activity, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatPLN, formatDateTime } from "@/lib/labels";
import { eventTypeLabels, eventStatusLabels } from "@/lib/affiliate/labels";
import {
  adminListEvents,
  adminCreateEvent,
  adminSetEventStatus,
  adminListPartners,
} from "@/lib/affiliate/admin.functions";

export const Route = createFileRoute("/admin/program-posrednikow/zdarzenia")({
  component: ZdarzeniaPage,
});

const EVENT_TYPES = ["investor_account_paid", "broker_account_paid", "client_funds_disbursed"];
const EVENT_STATUSES = [
  "pending",
  "confirmed",
  "refund_window",
  "eligible",
  "cancelled",
  "refunded",
  "chargeback",
  "fraud",
  "manually_blocked",
];
const CORRECTION_STATUSES = ["refunded", "chargeback", "fraud"];

function ZdarzeniaPage() {
  const listFn = useServerFn(adminListEvents);
  const partnersFn = useServerFn(adminListPartners);
  const [eventType, setEventType] = useState("all");
  const [status, setStatus] = useState("all");

  const q = useQuery({
    queryKey: ["admin-affiliate-events", eventType, status],
    queryFn: () =>
      listFn({
        data: {
          eventType: eventType === "all" ? undefined : eventType,
          status: status === "all" ? undefined : status,
        },
      }),
  });
  const partnersQ = useQuery({
    queryKey: ["admin-affiliate-partners-min"],
    queryFn: () => partnersFn({ data: {} }),
  });

  const rows = (q.data as any[]) ?? [];
  const partners = (partnersQ.data as any[]) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" /> Zdarzenia gospodarcze
          </h1>
          <p className="text-sm text-muted-foreground">
            Realne zdarzenia będące podstawą naliczania prowizji. Korekta statusu może uruchomić
            korektę prowizji.
          </p>
        </div>
        <CreateEventDialog partners={partners} />
      </div>

      <Card className="p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger>
              <SelectValue placeholder="Typ zdarzenia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie typy</SelectItem>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {eventTypeLabels[t] ?? t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie statusy</SelectItem>
              {EVENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {eventStatusLabels[s] ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Typ</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead className="text-right">Wynagr. FY</TableHead>
                <TableHead className="text-right">Brutto</TableHead>
                <TableHead className="text-right">Przychód netto</TableHead>
                <TableHead className="text-right">Pożyczka</TableHead>
                <TableHead>Wystąpiło</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && (
                <TableRow>
                  <TableCell colSpan={9} className="p-6 text-center text-muted-foreground">
                    Ładowanie…
                  </TableCell>
                </TableRow>
              )}
              {!q.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="p-6 text-center text-muted-foreground">
                    Brak zdarzeń.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">
                    {eventTypeLabels[e.event_type] ?? e.event_type}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {eventStatusLabels[e.event_status] ?? e.event_status}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className="text-[11px] font-mono text-muted-foreground"
                    title={e.direct_partner_id}
                  >
                    {e.direct_partner_id ? String(e.direct_partner_id).slice(0, 8) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {e.finance_you_fee_amount != null ? formatPLN(e.finance_you_fee_amount) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {e.gross_payment_amount != null ? formatPLN(e.gross_payment_amount) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {e.net_revenue_amount != null ? formatPLN(e.net_revenue_amount) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {e.loan_amount != null ? formatPLN(e.loan_amount) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(e.occurred_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <EventStatusDialog event={e} />
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

function CreateEventDialog({ partners }: { partners: any[] }) {
  const createFn = useServerFn(adminCreateEvent);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [eventType, setEventType] = useState("investor_account_paid");
  const [directPartnerId, setDirectPartnerId] = useState("");
  const [financeYouFeeAmount, setFee] = useState("");
  const [grossPaymentAmount, setGross] = useState("");
  const [netRevenueAmount, setNet] = useState("");
  const [loanAmount, setLoan] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [busy, setBusy] = useState(false);

  const name = (p: any) =>
    p.company_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.referral_code;
  const num = (v: string) => (v === "" ? undefined : Number(v));

  async function submit() {
    if (!directPartnerId) return toast.error("Wybierz partnera bezpośredniego");
    setBusy(true);
    try {
      const res: any = await createFn({
        data: {
          eventType: eventType as any,
          directPartnerId,
          financeYouFeeAmount: num(financeYouFeeAmount),
          grossPaymentAmount: num(grossPaymentAmount),
          netRevenueAmount: num(netRevenueAmount),
          loanAmount: num(loanAmount),
          occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        },
      });
      if (res?.skipped) toast.info("Zdarzenie już istniało (pominięto duplikat).");
      else toast.success("Zdarzenie utworzone");
      void qc.invalidateQueries({ queryKey: ["admin-affiliate-events"] });
      setOpen(false);
      setDirectPartnerId("");
      setFee("");
      setGross("");
      setNet("");
      setLoan("");
      setOccurredAt("");
    } catch (e) {
      toast.error("Nie udało się utworzyć zdarzenia", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Dodaj zdarzenie
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nowe zdarzenie gospodarcze</DialogTitle>
          <DialogDescription>
            Rejestruje realne zdarzenie, które stanowi podstawę naliczenia prowizji.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
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
            <Label>Partner bezpośredni</Label>
            <Select value={directPartnerId} onValueChange={setDirectPartnerId}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz partnera" />
              </SelectTrigger>
              <SelectContent>
                {partners.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {name(p)} ({p.referral_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Wynagrodzenie Finance You</Label>
              <Input
                type="number"
                value={financeYouFeeAmount}
                onChange={(e) => setFee(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Płatność brutto</Label>
              <Input
                type="number"
                value={grossPaymentAmount}
                onChange={(e) => setGross(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Przychód netto</Label>
              <Input
                type="number"
                value={netRevenueAmount}
                onChange={(e) => setNet(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kwota pożyczki</Label>
              <Input type="number" value={loanAmount} onChange={(e) => setLoan(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data wystąpienia</Label>
            <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Tworzenie…" : "Utwórz zdarzenie"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EventStatusDialog({ event }: { event: any }) {
  const setStatusFn = useServerFn(adminSetEventStatus);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(event.event_status ?? "pending");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await setStatusFn({
        data: { eventId: event.id, status: status as any, reason: reason || undefined },
      });
      toast.success("Status zdarzenia zmieniony");
      void qc.invalidateQueries({ queryKey: ["admin-affiliate-events"] });
      void qc.invalidateQueries({ queryKey: ["admin-affiliate-commissions"] });
      setOpen(false);
    } catch (e) {
      toast.error("Nie udało się zmienić statusu", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Status
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Zmień status zdarzenia</DialogTitle>
          <DialogDescription>
            Statusy zwrot/chargeback/nadużycie uruchamiają korektę (clawback) powiązanych prowizji.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {eventStatusLabels[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {CORRECTION_STATUSES.includes(status) && (
            <p className="text-xs text-amber-700">
              Uwaga: ten status wywoła korektę prowizji naliczonych z tego zdarzenia.
            </p>
          )}
          <div className="space-y-1">
            <Label>Powód</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Opcjonalny powód — zapisywany w audycie."
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Zapisywanie…" : "Zapisz"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
