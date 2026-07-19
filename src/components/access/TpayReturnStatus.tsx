// Status po powrocie z Tpay. Nie ufamy parametrowi `?tpay=success` —
// odpytujemy własny rekord płatności i pokazujemy potwierdzenie dopiero,
// gdy webhook Tpay zmieni status na 'paid'.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import { getAccessPaymentStatus } from "@/lib/access/checkout.functions";
import { formatWarsawDate } from "@/lib/access/core";

interface Props {
  paymentId: string;
  tpayParam: string; // "success" | "error" (tylko wskazówka UI)
  onPaid?: () => void;
}

type PaymentView = Awaited<ReturnType<typeof getAccessPaymentStatus>>;

export function TpayReturnStatus({ paymentId, tpayParam, onPaid }: Props) {
  const statusFn = useServerFn(getAccessPaymentStatus);
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [attempts, setAttempts] = useState(0);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async (attempt: number) => {
      try {
        const res = await statusFn({ data: { paymentId } });
        if (cancelled) return;
        setPayment(res);
        setAttempts(attempt);
        if (res.status === "paid") {
          onPaidRef.current?.();
          // Faktura może się jeszcze przetwarzać — dopytuj chwilę, potem stop.
          if (!res.invoice && attempt < 20) timer = setTimeout(() => poll(attempt + 1), 3000);
          return;
        }
        if (["failed", "cancelled", "refunded", "chargeback"].includes(res.status)) return;
        if (attempt < 48) timer = setTimeout(() => poll(attempt + 1), 2500);
      } catch {
        if (!cancelled && attempt < 48) timer = setTimeout(() => poll(attempt + 1), 4000);
      }
    };
    void poll(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);

  if (
    tpayParam === "error" &&
    (!payment || ["created", "pending", "cancelled", "failed"].includes(payment.status))
  ) {
    return (
      <Card className="border-red-300 bg-red-50">
        <CardContent className="flex items-center gap-3 py-4 text-red-900">
          <XCircle className="h-5 w-5 shrink-0" />
          <div className="text-sm">
            Płatność nie została ukończona. Dostęp nie został aktywowany.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!payment || payment.status === "created" || payment.status === "pending") {
    return (
      <Card className="border-amber-300 bg-amber-50">
        <CardContent className="flex items-center gap-3 py-4 text-amber-900">
          {attempts >= 48 ? (
            <Clock className="h-5 w-5 shrink-0" />
          ) : (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
          )}
          <div className="text-sm">
            Płatność została przekazana do weryfikacji. Oczekujemy na potwierdzenie Tpay.
            {attempts >= 48 &&
              " Potwierdzenie może chwilę potrwać — status znajdziesz w zakładce „Płatności i faktury”."}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (payment.status === "paid") {
    return (
      <Card className="border-emerald-300 bg-emerald-50">
        <CardContent className="flex items-start gap-3 py-4 text-emerald-900">
          <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <div>
              Płatność potwierdzona. Twój dostęp jest aktywny do:{" "}
              <b>{formatWarsawDate(payment.grantedUntil, true)}</b>.
            </div>
            {payment.invoice ? (
              <div>
                Faktura{" "}
                {payment.invoice.invoice_number ? <b>{payment.invoice.invoice_number}</b> : null}{" "}
                została wystawiona i wysłana na adres: <b>{payment.buyerEmail}</b>.
              </div>
            ) : (
              <div>Dostęp jest już aktywny. Faktura jest w trakcie przygotowania.</div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-red-300 bg-red-50">
      <CardContent className="flex items-center gap-3 py-4 text-red-900">
        <XCircle className="h-5 w-5 shrink-0" />
        <div className="text-sm">Płatność nie została ukończona. Dostęp nie został aktywowany.</div>
      </CardContent>
    </Card>
  );
}
