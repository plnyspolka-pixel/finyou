// LEGACY: stare plany dostępu inwestora.
//
// Te identyfikatory są obsługiwane WYŁĄCZNIE przez webhook Tpay dla
// transakcji rozpoczętych przed wdrożeniem katalogu `access_products`
// (src/lib/access/*). Nie wolno tworzyć dla nich nowych płatności —
// dawna funkcja `createInvestorAccessCheckout` została zastąpiona przez
// `createAccessCheckout` (src/lib/access/checkout.functions.ts), która
// pobiera cenę/czas trwania z zaufanego katalogu po stronie serwera.
export const TPAY_PLANS = {
  investor_access_1d: { amount: 99, days: 1, label: "Dostęp inwestora — 1 dzień" },
  investor_access_1m: { amount: 399, days: 30, label: "Dostęp inwestora — 1 miesiąc" },
  investor_access_1y: { amount: 2999, days: 365, label: "Dostęp inwestora — 1 rok" },
} as const;

export type TpayPlanId = keyof typeof TPAY_PLANS;

export type BuyerType = "person" | "company";
