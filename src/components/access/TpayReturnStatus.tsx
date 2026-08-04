// Status po powrocie z Tpay. Nie ufamy parametrowi `?tpay=success` —
// odpytujemy własny rekord płatności i pokazujemy potwierdzenie dopiero,
// gdy webhook Tpay zmieni status na 'paid'.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import { getAccessPaymentStatus } from "@/lib/access/checkout.functions";
import { formatWarsawDate } from "@/lib/access/core";

// Baner statusu w "fancy" oprawie: delikatny gradient tła + ikona w pierścieniu.
function StatusBanner({
  tone,
  icon,
  children,
}: {
  tone: "success" | "pending" | "error";
  icon: ReactNode;
  children: ReactNode;
}) {
  const styles = {
    success: {
      wrap: "border-emerald-300/60 text-emerald-950",
      bg: "linear-gradient(120% 140% at 0% 0%, oklch(0.96 0.05 160) 0%, oklch(0.99 0.01 160) 100%)",
      ring: "bg-emerald-500/15 text-emerald-600",
    },
    pending: {
      wrap: "border-amber-300/60 text-amber-950",
      bg: "linear-gradient(120% 140% at 0% 0%, oklch(0.96 0.06 85) 0%, oklch(0.99 0.01 85) 100%)",
      ring: "bg-amber-500/15 text-amber-600",
    },
    error: {
      wrap: "border-red-300/60 text-red-950",
      bg: "linear-gradient(120% 140% at 0% 0%, oklch(0.95 0.05 25) 0%, oklch(0.99 0.01 25) 100%)",
      ring: "bg-red-500/15 text-red-600",
    },
  }[tone];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border shadow-sm ${styles.wrap}`}
      style={{ background: styles.bg }}
    >
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${styles.ring}`}>
          {icon}
        </span>
        <div className="min-w-0 self-center text-sm">{children}</div>
      </div>
    </div>
  );
}

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
      <StatusBanner tone="error" icon={<XCircle className="h-5 w-5" />}>
        <span className="font-semibold">Płatność nie została ukończona.</span> Dostęp nie został
        aktywowany.
      </StatusBanner>
    );
  }

  if (!payment || payment.status === "created" || payment.status === "pending") {
    return (
      <StatusBanner
        tone="pending"
        icon={
          attempts >= 48 ? (
            <Clock className="h-5 w-5" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin" />
          )
        }
      >
        <span className="font-semibold">Płatność została przekazana do weryfikacji.</span>{" "}
        Oczekujemy na potwierdzenie Tpay.
        {attempts >= 48 &&
          " Potwierdzenie może chwilę potrwać — status znajdziesz w zakładce „Płatności i faktury”."}
      </StatusBanner>
    );
  }

  if (payment.status === "paid") {
    return (
      <StatusBanner tone="success" icon={<CheckCircle2 className="h-5 w-5" />}>
        <div className="space-y-1">
          <div>
            <span className="font-semibold">Płatność potwierdzona.</span> Twój dostęp jest aktywny
            do: <b>{formatWarsawDate(payment.grantedUntil, true)}</b>.
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
      </StatusBanner>
    );
  }

  return (
    <StatusBanner tone="error" icon={<XCircle className="h-5 w-5" />}>
      <span className="font-semibold">Płatność nie została ukończona.</span> Dostęp nie został
      aktywowany.
    </StatusBanner>
  );
}
