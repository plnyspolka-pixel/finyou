import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Users, Search, CheckCircle2, Eye } from "lucide-react";
import { toast } from "sonner";
import { formatPLN, formatDate } from "@/lib/labels";
import {
  settlementTypeLabels,
  partnerStatusLabels,
  partnerStatusColors,
  commissionStatusLabels,
  commissionStatusColors,
} from "@/lib/affiliate/labels";
import {
  adminListPartners,
  adminGetPartner,
  adminApprovePartner,
  adminSetPartnerStatus,
  adminAssignSponsor,
} from "@/lib/affiliate/admin.functions";

export const Route = createFileRoute("/admin/program-posrednikow/partnerzy")({
  component: PartnerzyPage,
});

const STATUS_OPTIONS = [
  "pending_approval",
  "active",
  "suspended",
  "rejected",
  "missing_billing_data",
  "requires_accounting_review",
  "requires_business_registration",
  "terminated",
];

function partnerName(p: any): string {
  return p.company_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}

function PartnerzyPage() {
  const listFn = useServerFn(adminListPartners);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin-affiliate-partners", status, search],
    queryFn: () =>
      listFn({
        data: { status: status === "all" ? undefined : status, search: search || undefined },
      }),
  });
  const rows = (q.data as any[]) ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" /> Partnerzy
        </h1>
        <p className="text-sm text-muted-foreground">
          Lista pośredników, akceptacja, zmiana statusu i przypisanie sponsora.
        </p>
      </div>

      <Card className="p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Szukaj: imię, firma, e-mail, NIP, kod…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-10 w-full sm:w-64">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie statusy</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {partnerStatusLabels[s] ?? s}
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
                <TableHead>Partner</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Kod</TableHead>
                <TableHead>Rachunek</TableHead>
                <TableHead>Dołączył</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="p-6 text-center text-muted-foreground">
                    Ładowanie…
                  </TableCell>
                </TableRow>
              )}
              {!q.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="p-6 text-center text-muted-foreground">
                    Brak partnerów.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{partnerName(p)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.email ?? "—"}
                      {p.nip ? ` · NIP ${p.nip}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {settlementTypeLabels[p.settlement_type] ?? p.settlement_type}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={partnerStatusColors[p.status] ?? "bg-slate-100"}
                      variant="secondary"
                    >
                      {partnerStatusLabels[p.status] ?? p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{p.referral_code}</TableCell>
                  <TableCell className="text-xs">
                    {p.has_bank_account ? (
                      <Badge variant="outline" className="text-emerald-700">
                        Jest
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Brak</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(p.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setOpenId(p.id)}>
                      <Eye className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">Szczegóły</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {openId && <PartnerDialog id={openId} allPartners={rows} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function PartnerDialog({
  id,
  allPartners,
  onClose,
}: {
  id: string;
  allPartners: any[];
  onClose: () => void;
}) {
  const getFn = useServerFn(adminGetPartner);
  const approveFn = useServerFn(adminApprovePartner);
  const setStatusFn = useServerFn(adminSetPartnerStatus);
  const assignFn = useServerFn(adminAssignSponsor);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin-affiliate-partner", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const p = q.data as any;

  const [newStatus, setNewStatus] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [sponsorId, setSponsorId] = useState("none");
  const [sponsorNote, setSponsorNote] = useState("");
  const [busy, setBusy] = useState(false);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-affiliate-partners"] });
    void qc.invalidateQueries({ queryKey: ["admin-affiliate-partner", id] });
  };

  async function doApprove() {
    setBusy(true);
    try {
      await approveFn({ data: { id } });
      toast.success("Partner zaakceptowany");
      invalidate();
    } catch (e) {
      toast.error("Nie udało się zaakceptować", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function doSetStatus() {
    if (!newStatus) return toast.error("Wybierz status");
    setBusy(true);
    try {
      await setStatusFn({
        data: { id, status: newStatus as any, reason: statusReason || undefined },
      });
      toast.success("Status zmieniony");
      setNewStatus("");
      setStatusReason("");
      invalidate();
    } catch (e) {
      toast.error("Nie udało się zmienić statusu", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function doAssignSponsor() {
    if (!sponsorNote.trim()) return toast.error("Uzasadnienie jest wymagane");
    setBusy(true);
    try {
      await assignFn({
        data: {
          partnerId: id,
          sponsorId: sponsorId === "none" ? null : sponsorId,
          note: sponsorNote,
        },
      });
      toast.success("Sponsor zaktualizowany");
      setSponsorNote("");
      invalidate();
    } catch (e) {
      toast.error("Nie udało się przypisać sponsora", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const sponsorOptions = allPartners.filter((o) => o.id !== id);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{p ? partnerName(p) : "Partner"}</DialogTitle>
          <DialogDescription>
            Dane rozliczeniowe (zamaskowane), prowizje i akcje administracyjne.
          </DialogDescription>
        </DialogHeader>

        {q.isLoading || !p ? (
          <p className="text-muted-foreground py-6">Ładowanie…</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Forma rozliczenia</div>
                <div>{settlementTypeLabels[p.settlement_type] ?? p.settlement_type}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                <Badge
                  className={partnerStatusColors[p.status] ?? "bg-slate-100"}
                  variant="secondary"
                >
                  {partnerStatusLabels[p.status] ?? p.status}
                </Badge>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Kod polecający</div>
                <div className="font-mono">{p.referral_code}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">E-mail</div>
                <div className="break-all">{p.email ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Telefon</div>
                <div>{p.phone ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">NIP</div>
                <div>{p.nip ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">PESEL</div>
                <div className="font-mono">{p.pesel_masked ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Rachunek bankowy</div>
                <div className="font-mono">{p.bank_account_masked ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Dołączył</div>
                <div>{formatDate(p.created_at)}</div>
              </div>
            </div>

            {p.status === "pending_approval" && (
              <Button onClick={doApprove} disabled={busy} className="w-full sm:w-auto">
                <CheckCircle2 className="mr-2 h-4 w-4" /> Zaakceptuj partnera
              </Button>
            )}

            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-sm font-semibold">Zmień status</div>
              <div className="grid sm:grid-cols-2 gap-2">
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {partnerStatusLabels[s] ?? s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Powód (opcjonalnie)"
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={doSetStatus} disabled={busy}>
                Zapisz status
              </Button>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-sm font-semibold">Sponsor (struktura sieci)</div>
              <Select value={sponsorId} onValueChange={setSponsorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz sponsora" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Brak sponsora (korzeń)</SelectItem>
                  {sponsorOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {partnerName(o)} ({o.referral_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="space-y-1">
                <Label className="text-xs">Uzasadnienie (wymagane)</Label>
                <Textarea
                  value={sponsorNote}
                  onChange={(e) => setSponsorNote(e.target.value)}
                  placeholder="Powód zmiany sponsora — zapisywany w audycie."
                  rows={2}
                />
              </div>
              <Button variant="outline" size="sm" onClick={doAssignSponsor} disabled={busy}>
                Przypisz sponsora
              </Button>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">
                Prowizje partnera ({(p.commissions ?? []).length})
              </div>
              {(p.commissions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak prowizji.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Poziom</TableHead>
                        <TableHead>Forma</TableHead>
                        <TableHead className="text-right">Kwota</TableHead>
                        <TableHead>Okres</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(p.commissions as any[]).map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs">{formatDate(c.created_at)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">P{c.network_level}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {settlementTypeLabels[c.settlement_type] ?? c.settlement_type}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {formatPLN(c.gross_amount)}
                          </TableCell>
                          <TableCell className="text-xs">
                            Q{c.tax_quarter} {c.tax_year}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={commissionStatusColors[c.status] ?? "bg-slate-100"}
                              variant="secondary"
                            >
                              {commissionStatusLabels[c.status] ?? c.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
