// Panel admina — zakładki operacyjne: aktywne przypisania (anulowanie,
// wyjątkowe przedłużenie), propozycje (review/negocjacje/kontrpropozycja),
// pytania inwestorów, log audytowy, statystyki i ustawienia modułu.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminListAssignments,
  adminCancelAssignment,
  adminExtendAssignment,
  adminListProposals,
  adminSetProposalStatus,
  adminListInfoRequests,
  adminAnswerInfoRequest,
  adminListAuditLog,
  adminGetModuleSettings,
  adminUpdateModuleSettings,
} from "@/lib/projects/admin.functions";
import { formatPLN } from "@/lib/labels";
import { AssignmentBadge, ProposalBadge, fmtDateTime } from "./shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export function AssignmentsTab() {
  const listFn = useServerFn(adminListAssignments);
  const cancelFn = useServerFn(adminCancelAssignment);
  const extendFn = useServerFn(adminExtendAssignment);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-projects-assignments"], queryFn: () => listFn() });
  const [extendFor, setExtendFor] = useState<string | null>(null);
  const [hours, setHours] = useState(12);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = ((q.data as { assignments?: Row[] } | undefined)?.assignments ?? []).filter(
    (a: Row) => ["created", "opened", "extended", "interested"].includes(a.status),
  );

  const refresh = () => {
    void q.refetch();
    void qc.invalidateQueries({ queryKey: ["admin-projects-audit"] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Aktywne przypisania</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Inwestor</TableHead>
              <TableHead>Projekt</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Wygasa</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a: Row) => (
              <TableRow key={a.id}>
                <TableCell>{a.investor?.name ?? a.investor_id}</TableCell>
                <TableCell className="text-xs">
                  {a.project ? `${a.project.city} · ${formatPLN(Number(a.project.amount))}` : "—"}
                </TableCell>
                <TableCell>
                  <AssignmentBadge status={a.status} />
                </TableCell>
                <TableCell className="text-xs">
                  {fmtDateTime(a.status === "interested" ? a.proposal_deadline_at : a.expires_at)}
                </TableCell>
                <TableCell className="space-x-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setExtendFor(a.id);
                      setReason("");
                    }}
                  >
                    Przedłuż
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={async () => {
                      const r = window.prompt("Powód anulowania przypisania:");
                      if (!r) return;
                      setBusy(true);
                      try {
                        await cancelFn({ data: { assignmentId: a.id, reason: r } });
                        toast.success("Anulowano.");
                        refresh();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Błąd.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Anuluj
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!q.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Brak aktywnych przypisań.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={Boolean(extendFor)} onOpenChange={(o) => !o && setExtendFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Wyjątkowe przedłużenie</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Liczba godzin</Label>
              <Input
                type="number"
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Powód (wymagany)</Label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <Button
              className="w-full"
              disabled={busy || !reason.trim() || hours <= 0}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await extendFn({ data: { assignmentId: extendFor!, hours, reason } });
                  if (res.ok) {
                    toast.success("Przedłużono.");
                    setExtendFor(null);
                    refresh();
                  } else {
                    toast.error("Nie udało się przedłużyć.");
                  }
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Błąd.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Przedłuż
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function ProposalsTab() {
  const listFn = useServerFn(adminListProposals);
  const statusFn = useServerFn(adminSetProposalStatus);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-projects-proposals"], queryFn: () => listFn() });
  const [selected, setSelected] = useState<Row | null>(null);
  const rows = (q.data as { proposals?: Row[] } | undefined)?.proposals ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Propozycje finansowania</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Inwestor</TableHead>
              <TableHead>Projekt</TableHead>
              <TableHead>Kwota / okres</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p: Row) => (
              <TableRow key={p.id}>
                <TableCell>{p.investor?.name ?? p.investor_id}</TableCell>
                <TableCell className="text-xs">
                  {p.project
                    ? `${p.project.city} (oczek. ${formatPLN(Number(p.project.amount))})`
                    : "—"}
                </TableCell>
                <TableCell className="text-xs">
                  {formatPLN(Number(p.params?.amount ?? 0))} / {p.params?.periodMonths ?? "—"} mies.
                </TableCell>
                <TableCell>
                  <ProposalBadge status={p.status} />
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => setSelected(p)}>
                    Otwórz
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!q.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Brak propozycji.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      {selected && (
        <ProposalDialog
          proposal={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            void q.refetch();
            void qc.invalidateQueries({ queryKey: ["admin-projects-audit"] });
          }}
          setStatus={statusFn}
        />
      )}
    </Card>
  );
}

function ProposalDialog({
  proposal,
  onClose,
  onChanged,
  setStatus,
}: {
  proposal: Row;
  onClose: () => void;
  onChanged: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setStatus: any;
}) {
  const [reason, setReason] = useState("");
  const [status, setStatusVal] = useState("under_review");
  const [counter, setCounter] = useState("");
  const [busy, setBusy] = useState(false);
  const c = proposal.computed ?? {};
  const p = proposal.params ?? {};

  const apply = async () => {
    if (!reason.trim()) {
      toast.error("Podaj uzasadnienie decyzji.");
      return;
    }
    let counteroffer: Record<string, unknown> | undefined;
    if (status === "counteroffer") {
      try {
        counteroffer = counter.trim() ? JSON.parse(counter) : undefined;
      } catch {
        toast.error("Kontrpropozycja musi być poprawnym JSON-em.");
        return;
      }
      if (!counteroffer) {
        toast.error("Podaj parametry kontrpropozycji.");
        return;
      }
    }
    setBusy(true);
    try {
      await setStatus({ data: { proposalId: proposal.id, status, reason, counteroffer } });
      toast.success("Zapisano decyzję.");
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Propozycja — {proposal.investor?.name ?? ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Fact label="Proponowana kwota" value={formatPLN(Number(p.amount ?? 0))} />
            <Fact
              label="Oczekiwana (projekt)"
              value={formatPLN(Number(proposal.project?.amount ?? 0))}
            />
            <Fact label="Okres" value={`${p.periodMonths ?? "—"} mies.`} />
            <Fact label="Oprocentowanie" value={`${p.interestRatePercent ?? "—"}%`} />
            <Fact label="Rata miesięczna" value={formatPLN(Number(c.monthlyPayment ?? 0))} />
            <Fact label="Rata końcowa" value={formatPLN(Number(c.finalPayment ?? 0))} />
            <Fact label="LTV" value={c.ltvPercent != null ? `${c.ltvPercent}%` : "—"} />
            <Fact label="Całkowita spłata" value={formatPLN(Number(c.totalToRepay ?? 0))} />
            <Fact
              label="Różnica vs oczekiwana"
              value={formatPLN(Number(c.amountDifference ?? 0))}
            />
            <Fact label="Wersja projektu" value={`${proposal.project_version}`} />
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <Label className="text-sm">Decyzja</Label>
            <Select value={status} onValueChange={setStatusVal}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="under_review">W analizie</SelectItem>
                <SelectItem value="additional_information_required">
                  Wymaga dodatkowych informacji
                </SelectItem>
                <SelectItem value="presented_to_borrower">Przedstawiona pożyczkobiorcy</SelectItem>
                <SelectItem value="accepted_for_negotiation">Do negocjacji</SelectItem>
                <SelectItem value="counteroffer">Kontrpropozycja</SelectItem>
                <SelectItem value="accepted">Zaakceptowana</SelectItem>
                <SelectItem value="converted_to_transaction">Przekształć w transakcję</SelectItem>
                <SelectItem value="rejected">Odrzuć</SelectItem>
              </SelectContent>
            </Select>
            {status === "counteroffer" && (
              <Textarea
                rows={4}
                placeholder='Parametry kontrpropozycji jako JSON, np. {"amount":120000,"interestRatePercent":15}'
                value={counter}
                onChange={(e) => setCounter(e.target.value)}
              />
            )}
            <Textarea
              rows={2}
              placeholder="Uzasadnienie decyzji (zapisywane w logu audytowym)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button className="w-full" disabled={busy} onClick={() => void apply()}>
              Zapisz decyzję
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function InfoRequestsTab() {
  const listFn = useServerFn(adminListInfoRequests);
  const answerFn = useServerFn(adminAnswerInfoRequest);
  const q = useQuery({ queryKey: ["admin-projects-info"], queryFn: () => listFn() });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const rows = (q.data as { requests?: Row[] } | undefined)?.requests ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pytania inwestorów</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r: Row) => (
          <div key={r.id} className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{r.investor?.name ?? r.investor_id}</span>
              <span className="text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</span>
            </div>
            <p className="text-sm">{r.question}</p>
            {r.status === "answered" ? (
              <p className="text-sm text-muted-foreground">Odpowiedź: {r.answer}</p>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={answers[r.id] ?? ""}
                  onChange={(e) => setAnswers((p) => ({ ...p, [r.id]: e.target.value }))}
                  placeholder="Odpowiedź…"
                />
                <Button
                  size="sm"
                  disabled={busy === r.id || (answers[r.id] ?? "").trim().length < 2}
                  onClick={async () => {
                    setBusy(r.id);
                    try {
                      await answerFn({ data: { requestId: r.id, answer: answers[r.id] } });
                      toast.success("Odpowiedziano.");
                      void q.refetch();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Błąd.");
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  Wyślij
                </Button>
              </div>
            )}
          </div>
        ))}
        {!q.isLoading && rows.length === 0 && <p className="text-muted-foreground">Brak pytań.</p>}
      </CardContent>
    </Card>
  );
}

export function AuditTab() {
  const listFn = useServerFn(adminListAuditLog);
  const q = useQuery({ queryKey: ["admin-projects-audit"], queryFn: () => listFn({ data: {} }) });
  const rows = (q.data as { entries?: Row[] } | undefined)?.entries ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Log audytowy</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kiedy</TableHead>
              <TableHead>Obszar</TableHead>
              <TableHead>Akcja</TableHead>
              <TableHead>Zmiana</TableHead>
              <TableHead>Powód</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e: Row) => (
              <TableRow key={e.id}>
                <TableCell className="text-xs">{fmtDateTime(e.created_at)}</TableCell>
                <TableCell className="text-xs">{e.entity_type}</TableCell>
                <TableCell className="text-xs">{e.action}</TableCell>
                <TableCell className="text-xs">
                  {e.previous_status || e.new_status
                    ? `${e.previous_status ?? "—"} → ${e.new_status ?? "—"}`
                    : "—"}
                </TableCell>
                <TableCell className="max-w-[220px] truncate text-xs" title={e.reason ?? ""}>
                  {e.reason ?? "—"}
                </TableCell>
              </TableRow>
            ))}
            {!q.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Brak wpisów.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function SettingsTab() {
  const getFn = useServerFn(adminGetModuleSettings);
  const saveFn = useServerFn(adminUpdateModuleSettings);
  const q = useQuery({ queryKey: ["admin-projects-settings"], queryFn: () => getFn() });
  const s = (q.data as { settings?: Row } | undefined)?.settings;
  const [form, setForm] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const cur = form ?? s;

  if (q.isLoading || !cur) return <p className="text-muted-foreground">Ładowanie…</p>;
  const set = (k: string, v: unknown) => setForm({ ...cur, [k]: v });
  const setBand = (k: string, v: number) =>
    setForm({ ...cur, ltv_bands: { ...cur.ltv_bands, [k]: v } });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ustawienia modułu</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Num
          label="Maks. aktywnych kart"
          value={cur.max_active_assignments}
          onChange={(v) => set("max_active_assignments", v)}
        />
        <Num
          label="Maks. przedłużonych projektów"
          value={cur.max_extended_assignments}
          onChange={(v) => set("max_extended_assignments", v)}
        />
        <Num
          label="Ważność przypisania (godz.)"
          value={cur.assignment_hours}
          onChange={(v) => set("assignment_hours", v)}
        />
        <Num
          label="Przedłużenie (godz.)"
          value={cur.extension_hours}
          onChange={(v) => set("extension_hours", v)}
        />
        <Num
          label="Termin na propozycję (godz.)"
          value={cur.proposal_hours}
          onChange={(v) => set("proposal_hours", v)}
        />
        <Num
          label="Próg odrzuceń → przegląd"
          value={cur.rejection_review_threshold}
          onChange={(v) => set("rejection_review_threshold", v)}
        />
        <Num
          label="LTV: bardzo konserwatywne do (%)"
          value={cur.ltv_bands.conservative}
          onChange={(v) => setBand("conservative", v)}
        />
        <Num
          label="LTV: akceptowalne do (%)"
          value={cur.ltv_bands.acceptable}
          onChange={(v) => setBand("acceptable", v)}
        />
        <Num
          label="LTV: podwyższone do (%)"
          value={cur.ltv_bands.elevated}
          onChange={(v) => setBand("elevated", v)}
        />
        <Num
          label="Okres min (mies.)"
          value={cur.min_period_months}
          onChange={(v) => set("min_period_months", v)}
        />
        <Num
          label="Okres max (mies.)"
          value={cur.max_period_months}
          onChange={(v) => set("max_period_months", v)}
        />
        <Num
          label="Maks. LTV (%)"
          value={cur.max_ltv_percent}
          onChange={(v) => set("max_ltv_percent", v)}
        />
        <div className="sm:col-span-2">
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await saveFn({
                  data: {
                    maxActiveAssignments: cur.max_active_assignments,
                    maxExtendedAssignments: cur.max_extended_assignments,
                    assignmentHours: cur.assignment_hours,
                    extensionHours: cur.extension_hours,
                    proposalHours: cur.proposal_hours,
                    rejectionReviewThreshold: cur.rejection_review_threshold,
                    ltvBands: cur.ltv_bands,
                    minPeriodMonths: cur.min_period_months,
                    maxPeriodMonths: cur.max_period_months,
                    maxLtvPercent: cur.max_ltv_percent,
                  },
                });
                toast.success("Zapisano ustawienia.");
                void q.refetch();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Błąd.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Zapisz ustawienia
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
