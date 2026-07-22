// Panel admina — zakładka „Użytkownicy i aplikacje": przegląd aplikacji,
// decyzje, podgląd KYC (Didit) i screeningu (Dilisense), ręczna analiza trafień,
// aktywacja/zawieszanie/cofnięcie dostępu, akceptacje dokumentów.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminListModuleUsers,
  adminGetModuleUser,
  adminDecideApplication,
  adminReviewScreening,
  adminActivateAccess,
  adminSetAccessState,
} from "@/lib/projects/admin.functions";
import { MODULE_KYC_STATUS_LABELS, type ModuleKycStatus } from "@/lib/projects/module-types";
import { AccessBadge, ApplicationBadge, ScreeningBadge, fmtDateTime } from "./shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export function UsersTab() {
  const listFn = useServerFn(adminListModuleUsers);
  const q = useQuery({ queryKey: ["admin-projects-users"], queryFn: () => listFn() });
  const [selected, setSelected] = useState<string | null>(null);

  const data = q.data as { access: Row[]; applications: Row[] } | undefined;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aplikacje o dostęp</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Użytkownik</TableHead>
                <TableHead>Status aplikacji</TableHead>
                <TableHead>Kapitał</TableHead>
                <TableHead>Złożono</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.applications ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.user?.name ?? a.user_id}</TableCell>
                  <TableCell>
                    <ApplicationBadge status={a.status} />
                  </TableCell>
                  <TableCell>{a.declared_capital ? `${a.declared_capital} zł` : "—"}</TableCell>
                  <TableCell>{fmtDateTime(a.created_at)}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setSelected(a.user_id)}>
                      Szczegóły
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!q.isLoading && (data?.applications ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Brak aplikacji.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dostęp użytkowników</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Użytkownik</TableHead>
                <TableHead>Status modułu</TableHead>
                <TableHead>KYC</TableHead>
                <TableHead>Screening</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.access ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.user?.name ?? a.user_id}</TableCell>
                  <TableCell>
                    <AccessBadge status={a.status} />
                  </TableCell>
                  <TableCell className="text-xs">
                    {MODULE_KYC_STATUS_LABELS[a.kyc_status as ModuleKycStatus] ?? a.kyc_status}
                  </TableCell>
                  <TableCell>
                    <ScreeningBadge result={a.screening_result} />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setSelected(a.user_id)}>
                      Zarządzaj
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selected && (
        <UserDetailDialog
          userId={selected}
          onClose={() => setSelected(null)}
          onChanged={() => q.refetch()}
        />
      )}
    </div>
  );
}

function UserDetailDialog({
  userId,
  onClose,
  onChanged,
}: {
  userId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const getFn = useServerFn(adminGetModuleUser);
  const decideFn = useServerFn(adminDecideApplication);
  const reviewFn = useServerFn(adminReviewScreening);
  const activateFn = useServerFn(adminActivateAccess);
  const stateFn = useServerFn(adminSetAccessState);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin-projects-user", userId],
    queryFn: () => getFn({ data: { userId } }),
  });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    void q.refetch();
    onChanged();
    void qc.invalidateQueries({ queryKey: ["admin-projects-audit"] });
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    if (!reason.trim() && ok !== "screening") {
      toast.error("Podaj powód / uzasadnienie.");
      return;
    }
    setBusy(true);
    try {
      await fn();
      toast.success("Zapisano.");
      setReason("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operacja nie powiodła się.");
    } finally {
      setBusy(false);
    }
  };

  const data = q.data as
    | {
        user: { name: string } | null;
        access: Row | null;
        applications: Row[];
        screenings: Row[];
        acceptances: Row[];
        kycSession: Row | null;
      }
    | undefined;
  const access = data?.access;
  const latestApp = data?.applications?.[0];
  const latestScreening = data?.screenings?.[0];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.user?.name ?? "Użytkownik"}</DialogTitle>
          <DialogDescription>
            Zarządzanie dostępem, weryfikacją i decyzjami w module projektów.
          </DialogDescription>
        </DialogHeader>

        {q.isLoading ? (
          <p className="text-muted-foreground">Ładowanie…</p>
        ) : (
          <div className="space-y-5">
            {/* Aplikacja */}
            {latestApp && (
              <section className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Aplikacja</span>
                  <ApplicationBadge status={latestApp.status} />
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <Info label="Kapitał" value={`${latestApp.declared_capital ?? "—"} zł`} />
                  <Info
                    label="Kwoty inwestycji"
                    value={`${latestApp.min_investment ?? "—"}–${latestApp.max_investment ?? "—"} zł`}
                  />
                  <Info label="Max LTV" value={`${latestApp.max_ltv_percent ?? "—"}%`} />
                  <Info label="Rentowność" value={`${latestApp.expected_return_percent ?? "—"}%`} />
                  <Info label="Typy" value={(latestApp.property_types ?? []).join(", ") || "—"} />
                  <Info label="Lokalizacje" value={(latestApp.locations ?? []).join(", ") || "—"} />
                  <Info
                    label="Zabezpieczenia"
                    value={(latestApp.accepted_securities ?? []).join(", ") || "—"}
                  />
                  <Info label="Ryzyko" value={latestApp.risk_appetite ?? "—"} />
                </dl>
                {latestApp.experience && (
                  <p className="text-xs text-muted-foreground">
                    Doświadczenie: {latestApp.experience}
                  </p>
                )}
                {latestApp.status === "pending" ||
                latestApp.status === "needs_more_info" ||
                latestApp.status === "additional_review" ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            decideFn({
                              data: {
                                applicationId: latestApp.id,
                                decision: "conditionally_qualified",
                                reason,
                              },
                            }),
                          "app",
                        )
                      }
                    >
                      Zakwalifikuj warunkowo (start KYC)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            decideFn({
                              data: {
                                applicationId: latestApp.id,
                                decision: "needs_more_info",
                                reason,
                              },
                            }),
                          "app",
                        )
                      }
                    >
                      Poproś o uzupełnienie
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            decideFn({
                              data: {
                                applicationId: latestApp.id,
                                decision: "additional_review",
                                reason,
                              },
                            }),
                          "app",
                        )
                      }
                    >
                      Dodatkowa analiza
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            decideFn({
                              data: { applicationId: latestApp.id, decision: "rejected", reason },
                            }),
                          "app",
                        )
                      }
                    >
                      Odrzuć
                    </Button>
                  </div>
                ) : null}
              </section>
            )}

            {/* KYC */}
            <section className="space-y-1 rounded-md border p-3">
              <span className="text-sm font-semibold">KYC (Didit)</span>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <Info
                  label="Status"
                  value={
                    access
                      ? (MODULE_KYC_STATUS_LABELS[access.kyc_status as ModuleKycStatus] ??
                        access.kyc_status)
                      : "—"
                  }
                />
                <Info label="Rozpoczęto" value={fmtDateTime(access?.kyc_started_at)} />
                <Info label="Zakończono" value={fmtDateTime(access?.kyc_completed_at)} />
                <Info label="Sesja" value={access?.kyc_session_id ?? "—"} />
              </dl>
              {data?.kycSession?.status && (
                <p className="text-xs text-muted-foreground">Didit: {data.kycSession.status}</p>
              )}
            </section>

            {/* Screening */}
            <section className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Screening (Dilisense)</span>
                <ScreeningBadge result={access?.screening_result ?? null} />
              </div>
              {latestScreening ? (
                <>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <Info label="Podmiot" value={latestScreening.subject_name} />
                    <Info label="Trafienia" value={String(latestScreening.total_hits)} />
                    <Info
                      label="Sprawdzone listy"
                      value={(latestScreening.sources_checked ?? []).join(", ")}
                    />
                  </dl>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[180px] flex-1">
                      <ScreeningReview
                        screeningId={latestScreening.id}
                        onReview={(result, note) =>
                          void run(
                            () =>
                              reviewFn({ data: { screeningId: latestScreening.id, result, note } }),
                            "screening",
                          )
                        }
                        busy={busy}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Potwierdzone trafienie sankcyjne blokuje dostęp. Status PEP kieruje do analizy,
                    nie odrzuca automatycznie.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Brak wyniku screeningu.</p>
              )}
            </section>

            {/* Dokumenty */}
            <section className="space-y-1 rounded-md border p-3">
              <span className="text-sm font-semibold">Zaakceptowane dokumenty</span>
              {(data?.acceptances ?? []).length ? (
                <ul className="text-xs text-muted-foreground">
                  {data!.acceptances.map((d: Row) => (
                    <li key={`${d.kind}-${d.version}`}>
                      {d.kind} · wersja {d.version} · {fmtDateTime(d.accepted_at)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Brak akceptacji.</p>
              )}
            </section>

            {/* Powód + akcje dostępu */}
            <section className="space-y-2 rounded-md border p-3">
              <span className="text-sm font-semibold">Decyzja o dostępie</span>
              <Textarea
                placeholder="Powód / podstawa decyzji (wymagane, zapisywane w logu audytowym)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void run(() => activateFn({ data: { userId, reason } }), "access")}
                >
                  Aktywuj dostęp (approved_investor)
                </Button>
                {access?.status === "approved_investor" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => stateFn({ data: { userId, action: "suspend", reason } }),
                        "access",
                      )
                    }
                  >
                    Zawieś
                  </Button>
                )}
                {access?.status === "access_suspended" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => stateFn({ data: { userId, action: "reinstate", reason } }),
                        "access",
                      )
                    }
                  >
                    Przywróć
                  </Button>
                )}
                {["approved_investor", "access_suspended"].includes(access?.status ?? "") && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => stateFn({ data: { userId, action: "revoke", reason } }),
                        "access",
                      )
                    }
                  >
                    Cofnij dostęp
                  </Button>
                )}
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Zamknij
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScreeningReview({
  onReview,
  busy,
}: {
  screeningId: string;
  onReview: (result: string, note: string) => void;
  busy: boolean;
}) {
  const [result, setResult] = useState("clear");
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select value={result} onValueChange={setResult}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="clear">clear (czysty)</SelectItem>
            <SelectItem value="possible_match">possible_match</SelectItem>
            <SelectItem value="manual_review">manual_review</SelectItem>
            <SelectItem value="pep_review_required">pep_review_required</SelectItem>
            <SelectItem value="confirmed_sanctions_match">
              confirmed_sanctions_match (blokuje)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Input
        className="h-8 text-xs"
        placeholder="Notatka z analizy"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={busy || note.trim().length < 2}
        onClick={() => onReview(result, note)}
      >
        Zapisz wynik analizy
      </Button>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
