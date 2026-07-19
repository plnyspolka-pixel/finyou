import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, RefreshCw, Mail, FileText, ScrollText, ShieldAlert } from "lucide-react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import {
  adminListAccessPayments,
  adminRetryAccessInvoice,
  adminResendAccessInvoiceEmail,
  adminAdjustUserAccess,
  adminSetPaymentReviewFlag,
  adminListWebhookLogs,
  adminListPartnerOperatorAudit,
} from "@/lib/access/admin.functions";
import { formatGroszPln, formatWarsawDate } from "@/lib/access/core";

export const Route = createFileRoute("/admin/platnosci-dostep")({
  component: AdminAccessPayments,
});

const STATUSES = [
  "",
  "created",
  "pending",
  "paid",
  "failed",
  "cancelled",
  "refunded",
  "chargeback",
];

function AdminAccessPayments() {
  const listFn = useServerFn(adminListAccessPayments);
  const retryInvoiceFn = useServerFn(adminRetryAccessInvoice);
  const resendEmailFn = useServerFn(adminResendAccessInvoiceEmail);
  const adjustFn = useServerFn(adminAdjustUserAccess);
  const reviewFn = useServerFn(adminSetPaymentReviewFlag);
  const logsFn = useServerFn(adminListWebhookLogs);
  const auditFn = useServerFn(adminListPartnerOperatorAudit);

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [audience, setAudience] = useState<"all" | "investor" | "broker">("all");
  const [search, setSearch] = useState("");
  const [needsReview, setNeedsReview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [logsFor, setLogsFor] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [adjustFor, setAdjustFor] = useState<any | null>(null);
  const [adjustUntil, setAdjustUntil] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [audit, setAudit] = useState<any[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listFn({ data: { status, audience, search, needsReview } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd pobierania płatności");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, audience, search, needsReview]);

  useEffect(() => {
    void load();
  }, [load]);

  const action = async (id: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(id);
    try {
      await fn();
      toast.success(okMsg);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd operacji");
    } finally {
      setBusy(null);
    }
  };

  const openLogs = async (transactionId: string | null) => {
    setLogsFor(transactionId ?? "wszystkie");
    setLogs(await logsFn({ data: { transactionId: transactionId ?? "" } }));
  };

  const submitAdjust = async (revoke: boolean) => {
    if (!adjustFor) return;
    if (!adjustReason.trim()) return toast.error("Podaj powód zmiany (audyt)");
    if (!revoke && !adjustUntil) return toast.error("Podaj nową datę końca dostępu");
    try {
      await adjustFn({
        data: {
          userId: adjustFor.user_id,
          audience: adjustFor.audience,
          newUntil: revoke ? null : new Date(adjustUntil).toISOString(),
          reason: adjustReason.trim(),
        },
      });
      toast.success(revoke ? "Dostęp cofnięty" : "Dostęp przedłużony");
      setAdjustFor(null);
      setAdjustReason("");
      setAdjustUntil("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd zmiany dostępu");
    }
  };

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Płatności"
        title="Płatności za dostęp (Tpay)"
        subtitle="Rejestr płatności za czasowy dostęp inwestorów i pośredników, faktury, dostęp i log webhooków."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void openLogs(null)}>
              <ScrollText className="mr-2 h-4 w-4" /> Log webhooków
            </Button>
            <Button variant="outline" onClick={async () => setAudit(await auditFn())}>
              <ShieldAlert className="mr-2 h-4 w-4" /> Partnerzy z rolą operator
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Label className="text-xs">Status</Label>
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s || "all"} value={s || "all"}>
                  {s || "Wszystkie"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <Label className="text-xs">Grupa</Label>
          <Select value={audience} onValueChange={(v) => setAudience(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszyscy</SelectItem>
              <SelectItem value="investor">Inwestorzy</SelectItem>
              <SelectItem value="broker">Pośrednicy</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-52">
          <Label className="text-xs">Szukaj (nabywca, e-mail, NIP, ID transakcji)</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <Checkbox checked={needsReview} onCheckedChange={(v) => setNeedsReview(v === true)} />
          Do wyjaśnienia
        </label>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-muted-foreground">Ładowanie…</div>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => (
            <Card key={p.id} className={p.needs_review ? "border-amber-400" : ""}>
              <CardContent className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <b>{p.product?.label ?? p.product_id}</b>
                      <Badge
                        variant={
                          p.status === "paid"
                            ? "default"
                            : ["refunded", "chargeback", "failed"].includes(p.status)
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {p.status}
                      </Badge>
                      <Badge variant="outline">
                        {p.audience === "investor" ? "Inwestor" : "Pośrednik"}
                      </Badge>
                      <Badge variant="outline">
                        {p.buyer_type === "company" ? "Firma" : "Osoba prywatna"}
                      </Badge>
                      {p.needs_review && <Badge variant="destructive">Do wyjaśnienia</Badge>}
                    </div>
                    <div className="text-muted-foreground">
                      {p.buyer_name} · {p.buyer_email} {p.buyer_nip ? `· NIP ${p.buyer_nip}` : ""}
                    </div>
                    <div className="text-muted-foreground">
                      Kwota:{" "}
                      <b className="text-foreground">
                        {formatGroszPln(Number(p.paid_amount_grosz ?? p.expected_amount_grosz))}
                      </b>
                      {" · "}Utworzona: {formatWarsawDate(p.created_at, true)}
                      {" · "}Tpay ID:{" "}
                      <span className="font-mono">{p.provider_transaction_id ?? "—"}</span>
                    </div>
                    {p.granted_until && (
                      <div className="text-muted-foreground">
                        Przyznany okres: {formatWarsawDate(p.granted_from)} –{" "}
                        {formatWarsawDate(p.granted_until)}
                      </div>
                    )}
                    <div className="text-muted-foreground">
                      Faktura:{" "}
                      {p.invoice?.invoice_number ??
                        (p.status === "paid" ? "w przygotowaniu / błąd" : "—")}
                      {p.invoice &&
                        ` · status: ${p.invoice.status} · KSeF: ${p.invoice.ksef_status}`}
                    </div>
                    {(p.invoice_error || p.failure_reason || p.invoice?.error_message) && (
                      <div className="text-red-600">
                        Błąd: {p.invoice_error ?? p.failure_reason ?? p.invoice?.error_message}
                      </div>
                    )}
                    {p.affiliateEvent && (
                      <div className="text-muted-foreground">
                        Zdarzenie afiliacyjne: {p.affiliateEvent.event_type} (
                        {p.affiliateEvent.event_status}) ·{" "}
                        <span className="font-mono">{p.affiliateEvent.external_ref}</span>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      Użytkownik: <span className="font-mono">{p.user_id}</span> · role:{" "}
                      {(p.userRoles ?? []).join(", ") || "—"}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {p.invoice_id ? (
                      <>
                        <Button asChild size="sm" variant="outline">
                          <Link to="/faktura/$id" params={{ id: p.invoice_id }}>
                            <FileText className="mr-1 h-4 w-4" /> Otwórz fakturę
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === p.id}
                          onClick={() =>
                            void action(
                              p.id,
                              () => resendEmailFn({ data: { paymentId: p.id } }),
                              "Faktura wysłana ponownie",
                            )
                          }
                        >
                          <Mail className="mr-1 h-4 w-4" /> Wyślij fakturę ponownie
                        </Button>
                      </>
                    ) : (
                      p.status === "paid" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === p.id}
                          onClick={() =>
                            void action(
                              p.id,
                              () => retryInvoiceFn({ data: { paymentId: p.id } }),
                              "Ponowiono wystawienie faktury",
                            )
                          }
                        >
                          {busy === p.id ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="mr-1 h-4 w-4" />
                          )}
                          Ponów wystawienie faktury
                        </Button>
                      )
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAdjustFor(p);
                        setAdjustUntil("");
                      }}
                    >
                      Zmień dostęp ręcznie
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void openLogs(p.provider_transaction_id)}
                    >
                      <ScrollText className="mr-1 h-4 w-4" /> Log webhooków
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === p.id}
                      onClick={() =>
                        void action(
                          p.id,
                          () =>
                            reviewFn({ data: { paymentId: p.id, needsReview: !p.needs_review } }),
                          "Zapisano",
                        )
                      }
                    >
                      {p.needs_review ? "Zdejmij oznaczenie" : "Oznacz do wyjaśnienia"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {rows.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Brak płatności dla wybranych filtrów.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Ręczna zmiana dostępu (audytowana) */}
      <Dialog open={Boolean(adjustFor)} onOpenChange={(o) => !o && setAdjustFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ręczna zmiana dostępu</DialogTitle>
            <DialogDescription>
              Użytkownik <span className="font-mono">{adjustFor?.user_id}</span> · grupa:{" "}
              {adjustFor?.audience === "investor" ? "inwestor" : "pośrednik"}. Zmiana zostanie
              zapisana w audycie.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nowa data końca dostępu</Label>
              <Input
                type="datetime-local"
                value={adjustUntil}
                onChange={(e) => setAdjustUntil(e.target.value)}
              />
            </div>
            <div>
              <Label>Powód (wymagany)</Label>
              <Input
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="np. rekompensata za awarię"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="destructive" onClick={() => void submitAdjust(true)}>
                Cofnij dostęp
              </Button>
              <Button onClick={() => void submitAdjust(false)}>Przedłuż dostęp</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Log webhooków */}
      <Dialog open={Boolean(logsFor)} onOpenChange={(o) => !o && setLogsFor(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Log webhooków Tpay {logsFor !== "wszystkie" ? `· ${logsFor}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto text-xs">
            {logs.map((l) => (
              <div key={l.id} className="rounded border p-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{l.result}</Badge>
                  <span className="font-mono">{l.provider_transaction_id ?? "—"}</span>
                  <span className="text-muted-foreground">
                    {formatWarsawDate(l.created_at, true)}
                  </span>
                </div>
                {l.error && <div className="mt-1 text-red-600">{l.error}</div>}
              </div>
            ))}
            {logs.length === 0 && (
              <div className="py-6 text-center text-muted-foreground">Brak wpisów.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Audyt: partnerzy z historyczną rolą operator */}
      <Dialog open={audit !== null} onOpenChange={(o) => !o && setAudit(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Konta partnerskie z historyczną rolą „operator”</DialogTitle>
            <DialogDescription>
              Te konta podlegają już zasadom pośrednika (darmowy/płatny), ale nadal mają rolę
              pracowniczą. Zweryfikuj i odbierz rolę w „Role użytkowników”.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto text-sm">
            {(audit ?? []).map((a: any) => (
              <div key={a.partner_id} className="rounded border p-2">
                <div className="font-medium">
                  {[a.first_name, a.last_name].filter(Boolean).join(" ") ||
                    a.company_name ||
                    a.email}
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.email} · status partnera: {a.partner_status} · rola posrednik:{" "}
                  {a.has_posrednik_role ? "tak" : "nie"} · user:{" "}
                  <span className="font-mono">{a.user_id}</span>
                </div>
              </div>
            ))}
            {(audit ?? []).length === 0 && (
              <div className="py-6 text-center text-muted-foreground">
                Brak kont do przeglądu. 🎉
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Uwaga</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Tworzenie i zmiany statusów płatności wykonuje wyłącznie serwer (webhook Tpay). Ręczne
          przedłużenie lub cofnięcie dostępu jest audytowane w access_audit_logs.
        </CardContent>
      </Card>
    </div>
  );
}
