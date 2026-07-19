// „Płatności i faktury" — historia własnych płatności za dostęp z fakturami.
// Użytkownik widzi wyłącznie swoje dane (wymuszone także w RLS).
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  listMyAccessPayments,
  resendMyInvoiceEmail,
  type AccessPaymentHistoryRow,
} from "@/lib/access/history.functions";
import { formatGroszPln, formatWarsawDate } from "@/lib/access/core";

const STATUS_LABELS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  created: { label: "Utworzona", variant: "secondary" },
  pending: { label: "Oczekuje na płatność", variant: "secondary" },
  paid: { label: "Opłacona", variant: "default" },
  failed: { label: "Nieudana", variant: "destructive" },
  cancelled: { label: "Anulowana", variant: "outline" },
  refunded: { label: "Zwrócona", variant: "destructive" },
  chargeback: { label: "Chargeback", variant: "destructive" },
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Szkic",
  issued: "Wystawiona",
  sent: "Wysłana",
  paid: "Opłacona",
  cancelled: "Anulowana",
};

export function PaymentsAndInvoices() {
  const listFn = useServerFn(listMyAccessPayments);
  const resendFn = useServerFn(resendMyInvoiceEmail);
  const [rows, setRows] = useState<AccessPaymentHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setRows(await listFn());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się pobrać płatności");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resend = async (paymentId: string) => {
    setResending(paymentId);
    try {
      await resendFn({ data: { paymentId } });
      toast.success("Faktura została ponownie wysłana na e-mail");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się wysłać faktury");
    } finally {
      setResending(null);
    }
  };

  if (loading) {
    return <div className="py-10 text-center text-muted-foreground">Ładowanie płatności…</div>;
  }
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Nie masz jeszcze żadnych płatności.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const st = STATUS_LABELS[r.status] ?? { label: r.status, variant: "secondary" as const };
        return (
          <Card key={r.id}>
            <CardContent className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.productLabel}</span>
                    <Badge variant={st.variant}>{st.label}</Badge>
                    <Badge variant="outline">
                      {r.buyerType === "company" ? "Firma" : "Osoba prywatna"}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Data płatności: {formatWarsawDate(r.createdAt, true)} · Kwota:{" "}
                    <b className="text-foreground">{formatGroszPln(r.amountGrosz)}</b>
                  </div>
                  {r.grantedFrom && r.grantedUntil && (
                    <div className="text-sm text-muted-foreground">
                      Okres dostępu: {formatWarsawDate(r.grantedFrom)} –{" "}
                      {formatWarsawDate(r.grantedUntil)}
                    </div>
                  )}
                  <div className="text-sm text-muted-foreground">
                    Faktura:{" "}
                    {r.invoiceNumber ? (
                      <>
                        <b className="text-foreground">{r.invoiceNumber}</b>
                        {r.invoiceStatus &&
                          ` · ${INVOICE_STATUS_LABELS[r.invoiceStatus] ?? r.invoiceStatus}`}
                      </>
                    ) : r.invoicePending ? (
                      "w przygotowaniu…"
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {r.invoiceId && (
                    <>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/faktura/$id" params={{ id: r.invoiceId }}>
                          <Download className="mr-1 h-4 w-4" /> Pobierz fakturę
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => resend(r.id)}
                        disabled={resending === r.id}
                      >
                        {resending === r.id ? (
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        ) : (
                          <Mail className="mr-1 h-4 w-4" />
                        )}
                        Wyślij ponownie na e-mail
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
