// Pipeline zlecenia poszukiwania okazji osadzony w sklepie (/sklep#siecsprzedazy).
// Inwestor przechodzi cały proces bez przechodzenia do /inwestor:
//   0. abonament (Tpay; nowy inwestor — konto zakładamy z danych płatności),
//   1–10. ten sam komponent co w panelu (InvestorOrderPipeline): dane stron,
//   rachunek, KYC, screening, źródło środków, doręczenie, umowy, Zlecenie.
// Twarde bramki zostają po stronie serwera (submitInvestorOrder, RLS).
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAccessState } from "@/hooks/use-access";
import { InvestorOrderPipeline } from "@/components/inwestor/order-pipeline";
import { TpayAccessCheckoutForm } from "@/components/access/TpayAccessCheckoutForm";
import { TpayReturnStatus } from "@/components/access/TpayReturnStatus";
import { listAccessProducts } from "@/lib/access/state.functions";
import type { AccessProduct } from "@/lib/access/core";
import {
  SUBSCRIPTION_OPTIONS,
  SUBSCRIPTION_PAYMENT_SENTENCE,
  SUBSCRIPTION_PRICE_SENTENCE,
} from "@/lib/investor-plan/plans";

const STEPS = [
  "Abonament inwestora",
  "Dane pożyczkodawcy",
  "Rachunek do spłaty",
  "KYC (Didit)",
  "Screening PEP / sankcje",
  "Źródło środków",
  "Doręczenie pakietu",
  "Umowa ramowa, NDA, RODO",
  "Zlecenie poszukiwania okazji",
];

function fallbackProduct(): AccessProduct {
  const o = SUBSCRIPTION_OPTIONS.rocznie;
  return {
    id: o.productCode, code: o.productCode, audience: "investor",
    label: `Abonament inwestora — ${o.days} dni`, duration_days: o.days,
    amount_grosz: o.pricePln * 100, currency: "PLN", active: true, sort_order: 0,
    kind: "access", tier: "podstawowy", success_fee_bps: 0,
  };
}

function useSubscriptionProduct(): AccessProduct {
  const fetchProducts = useServerFn(listAccessProducts);
  const [product, setProduct] = useState<AccessProduct>(fallbackProduct);
  useEffect(() => {
    let alive = true;
    fetchProducts({ data: { audience: "investor" } })
      .then((list) => {
        const p = list.find((x) => x.active && x.code === SUBSCRIPTION_OPTIONS.rocznie.productCode);
        if (alive && p) setProduct(p);
      })
      .catch(() => { /* fallback do wyświetlenia; cenę i tak liczy serwer */ });
    return () => { alive = false; };
  }, [fetchProducts]);
  return product;
}

export function ShopPipelineSteps({ current }: { current: number }) {
  return (
    <ol className="fy-shop-steps" aria-label="Kroki zlecenia">
      {STEPS.map((label, i) => (
        <li key={label} className={i < current ? "done" : i === current ? "current" : ""}>
          <span>{i}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

export function ShopOrderPipeline({ tpay, payment }: { tpay?: string; payment?: string }) {
  const { user, loading: authLoading } = useAuth();
  const access = useAccessState("investor");
  const product = useSubscriptionProduct();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  if (authLoading || (user && access.loading)) {
    return (
      <div className="fy-shop-pipeline-box" aria-live="polite">
        <Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> Wczytywanie Twojego zlecenia…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fy-shop-pipeline-box">
        <ShopPipelineSteps current={0} />
        <div className="fy-shop-pipeline-paths">
          <div>
            <h3><UserPlus size={20} /> Nowy inwestor</h3>
            <p>
              {SUBSCRIPTION_PRICE_SENTENCE}. Opłać abonament tutaj — konto inwestora założymy
              automatycznie z danych płatności, a link do logowania wyślemy e-mailem. Po zalogowaniu
              wrócisz do tej sekcji i przejdziesz kolejne kroki na tej stronie.
            </p>
            <button type="button" className="fy-store-add" onClick={() => setCheckoutOpen((v) => !v)}>
              {checkoutOpen ? "Ukryj formularz płatności" : "Opłać abonament i zacznij"}
            </button>
          </div>
          <div>
            <h3><LogIn size={20} /> Masz już konto?</h3>
            <p>Zaloguj się — po powrocie zobaczysz tu swój postęp i dokończysz zlecenie bez przechodzenia do panelu.</p>
            <a className="fy-store-add fy-shop-link-btn" href="/logowanie?role=inwestor&next=%2Fsklep">Zaloguj się</a>
          </div>
        </div>
        {checkoutOpen && (
          <div className="fy-shop-checkout">
            <p className="text-xs text-muted-foreground">{SUBSCRIPTION_PAYMENT_SENTENCE}</p>
            <TpayAccessCheckoutForm key={product.code} product={product} guestPeriod="rocznie" />
          </div>
        )}
      </div>
    );
  }

  if (!access.hasFullAccess) {
    return (
      <div className="fy-shop-pipeline-box">
        <ShopPipelineSteps current={0} />
        {tpay && payment ? (
          <TpayReturnStatus paymentId={payment} tpayParam={tpay} onPaid={() => void access.refresh()} />
        ) : null}
        <div className="fy-shop-pipeline-note">
          <ShieldCheck size={20} />
          <span>
            Krok 0: abonament inwestora ({SUBSCRIPTION_PRICE_SENTENCE.toLowerCase()}). Po zaksięgowaniu
            płatności w tym miejscu otworzą się kroki 1–8: dane, KYC, screening, źródło środków, umowy i
            formularz Zlecenia.
          </span>
        </div>
        <div className="fy-shop-checkout">
          <p className="text-xs text-muted-foreground">{SUBSCRIPTION_PAYMENT_SENTENCE}</p>
          <TpayAccessCheckoutForm key={product.code} product={product} returnTo="sklep" />
        </div>
      </div>
    );
  }

  return (
    <div className="fy-shop-pipeline-box fy-shop-pipeline-live">
      <InvestorOrderPipeline tpay={tpay} payment={payment} returnTo="sklep" hideHeader />
    </div>
  );
}
