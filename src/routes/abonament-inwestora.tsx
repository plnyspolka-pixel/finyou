// Publiczny zakup abonamentu inwestora — cel przycisku „Załóż konto
// inwestora". Klient wybiera okres, podaje dane nabywcy i płaci w Tpay;
// konto inwestora zakłada webhook Tpay z tych danych po zaksięgowaniu wpłaty
// i wysyła na podany e-mail link do logowania.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SiteHeader, SiteFooter } from "@/components/marketing/shell";
import { MktBadge } from "@/components/marketing/primitives";
import { PeriodSlider } from "@/components/marketing/investor-pricing";
import { TpayAccessCheckoutForm } from "@/components/access/TpayAccessCheckoutForm";
import { listAccessProducts } from "@/lib/access/state.functions";
import { getGuestPaymentStatus } from "@/lib/access/guest-checkout.functions";
import { formatWarsawDate, type AccessProduct } from "@/lib/access/core";
import {
  SUBSCRIPTION_OPTIONS,
  SUBSCRIPTION_PAYMENT_SENTENCE,
  type BillingPeriod,
} from "@/lib/investor-plan/plans";

const searchSchema = z.object({
  okres: z.enum(["miesiecznie", "rocznie"]).optional().catch(undefined),
  tpay: z.enum(["success", "error"]).optional().catch(undefined),
  payment: z.string().uuid().optional().catch(undefined),
});

async function loadInvestorProducts(): Promise<AccessProduct[]> {
  try {
    return await listAccessProducts({ data: { audience: "investor" } });
  } catch {
    return [];
  }
}

export const Route = createFileRoute("/abonament-inwestora")({
  validateSearch: (s) => searchSchema.parse(s),
  loader: async () => ({ products: await loadInvestorProducts() }),
  head: () => ({
    meta: [
      { title: "Finance You — Załóż konto inwestora" },
      {
        name: "description",
        content:
          "Opłać abonament inwestora przez Tpay — konto inwestora założymy automatycznie na podstawie danych płatności.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvestorCheckoutPage,
});

function InvestorCheckoutPage() {
  const search = Route.useSearch();
  const { products } = Route.useLoaderData();
  const navigate = useNavigate({ from: "/abonament-inwestora" });
  const [period, setPeriod] = useState<BillingPeriod>(search.okres ?? "rocznie");
  const product = (products as AccessProduct[]).find(
    (p) => p.code === SUBSCRIPTION_OPTIONS[period].productCode,
  );
  const returned = Boolean(search.tpay && search.payment);

  const changePeriod = (p: BillingPeriod) => {
    setPeriod(p);
    void navigate({ search: { okres: p }, replace: true });
  };

  return (
    <div className="fy-marketing">
      <SiteHeader page="inwestor" />

      <section className="fy-hero" style={{ color: "#fff" }}>
        <div aria-hidden className="fy-hero-fx" />
        <div
          style={{
            position: "relative",
            maxWidth: "48rem",
            margin: "0 auto",
            padding: "3rem 1rem 2rem",
            textAlign: "center",
          }}
        >
          <MktBadge variant="secondary">Inwestor</MktBadge>
          <h1
            style={{
              marginTop: "0.8rem",
              fontSize: "clamp(1.8rem, 3.4vw, 2.5rem)",
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            Załóż konto inwestora
          </h1>
          <p
            style={{
              marginTop: "0.7rem",
              fontSize: "1rem",
              color: "rgba(255,255,255,.8)",
              maxWidth: "34rem",
              marginInline: "auto",
            }}
          >
            Wybierz okres abonamentu i zapłać przez Tpay. Konto inwestora założymy automatycznie na
            podstawie danych płatności — link do logowania wyślemy na podany e-mail.
          </p>
          {!returned && (
            <div style={{ marginTop: "1.2rem" }}>
              <PeriodSlider value={period} onChange={changePeriod} />
            </div>
          )}
        </div>
      </section>

      <div
        style={{
          maxWidth: "42rem",
          margin: "-1.5rem auto 0",
          padding: "0 1rem 4rem",
          position: "relative",
          zIndex: 2,
        }}
      >
        <Card className="border-border shadow-2xl">
          <CardContent className="space-y-6 p-6 md:p-8">
            {returned ? (
              <GuestReturnStatus paymentId={search.payment!} tpayParam={search.tpay!} />
            ) : product ? (
              <>
                <p className="text-xs text-muted-foreground">{SUBSCRIPTION_PAYMENT_SENTENCE}</p>
                <TpayAccessCheckoutForm key={product.code} product={product} guestPeriod={period} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Płatności są chwilowo niedostępne. Odśwież stronę za chwilę albo napisz na
                kontakt@financeyou.pl.
              </p>
            )}
            <p className="text-center text-sm text-muted-foreground">
              Masz już konto?{" "}
              <Link to="/logowanie" className="underline">
                Zaloguj się
              </Link>{" "}
              i opłać abonament w panelu inwestora.
            </p>
          </CardContent>
        </Card>
      </div>

      <SiteFooter />
    </div>
  );
}

// Po powrocie z Tpay nie ufamy `?tpay=success` — odpytujemy status płatności,
// aż webhook potwierdzi wpłatę i założy konto.
function GuestReturnStatus({ paymentId, tpayParam }: { paymentId: string; tpayParam: string }) {
  const statusFn = useServerFn(getGuestPaymentStatus);
  const [view, setView] = useState<Awaited<ReturnType<typeof getGuestPaymentStatus>> | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async (attempt: number) => {
      try {
        const res = await statusFn({ data: { paymentId } });
        if (cancelled) return;
        setView(res);
        if (["paid", "cancelled", "failed", "not_found"].includes(res.status)) return;
      } catch {
        // chwilowy błąd sieci — spróbuj ponownie
      }
      if (attempt >= 40) {
        setGaveUp(true);
        return;
      }
      timer = setTimeout(() => poll(attempt + 1), 3000);
    };
    void poll(1);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [paymentId, statusFn]);

  if (view?.status === "paid") {
    return (
      <div className="flex gap-3">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-green-600" />
        <div className="space-y-1 text-sm">
          <p className="font-semibold">Płatność zaksięgowana — konto inwestora jest gotowe</p>
          <p className="text-muted-foreground">
            Na adres {view.email} wysłaliśmy link do logowania.
            {view.grantedUntil
              ? ` Abonament jest aktywny do ${formatWarsawDate(view.grantedUntil, true)}.`
              : ""}{" "}
            Jeśli nie widzisz wiadomości, sprawdź spam albo{" "}
            <Link to="/logowanie" className="underline">
              zaloguj się
            </Link>{" "}
            podając ten adres e-mail.
          </p>
        </div>
      </div>
    );
  }

  if (
    view?.status === "cancelled" ||
    view?.status === "failed" ||
    view?.status === "not_found" ||
    (tpayParam === "error" && view && view.status !== "pending")
  ) {
    return (
      <div className="flex gap-3">
        <XCircle className="h-6 w-6 shrink-0 text-destructive" />
        <div className="space-y-1 text-sm">
          <p className="font-semibold">Płatność nie została zrealizowana</p>
          <p className="text-muted-foreground">
            Konto nie zostało założone.{" "}
            <Link to="/abonament-inwestora" className="underline">
              Spróbuj ponownie
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      {gaveUp ? (
        <Clock className="h-6 w-6 shrink-0 text-amber-600" />
      ) : (
        <Loader2 className="h-6 w-6 shrink-0 animate-spin text-muted-foreground" />
      )}
      <div className="space-y-1 text-sm">
        <p className="font-semibold">Czekamy na potwierdzenie płatności z Tpay…</p>
        <p className="text-muted-foreground">
          {gaveUp
            ? "Potwierdzenie jeszcze nie dotarło (przelew może księgować się dłużej). Gdy tylko wpłata zostanie zaksięgowana, założymy konto i wyślemy link do logowania na podany e-mail — możesz zamknąć tę stronę."
            : "Zaraz po zaksięgowaniu wpłaty założymy Twoje konto inwestora i wyślemy link do logowania."}
        </p>
      </div>
    </div>
  );
}
