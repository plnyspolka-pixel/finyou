// Karty pakietów dostępu (30/365 dni) — wspólne dla inwestora i pośrednika.
// Ceny pochodzą z katalogu serwera (access_products); UI niczego nie wylicza
// poza prezentacją oszczędności pakietu rocznego.
// Wersja "premium": pakiet roczny w ciemnym navy ze złotą, animowaną obwódką
// (w duchu FancyShell), miesięczny w jasnej, srebrnej oprawie.
import { Button } from "@/components/ui/button";
import { Check, Crown, Sparkles } from "lucide-react";
import { formatGroszPln, yearlySavingsGrosz, type AccessProduct } from "@/lib/access/core";

interface Props {
  products: AccessProduct[];
  hasActiveAccess: boolean;
  onSelect: (product: AccessProduct) => void;
  featuresByDuration?: Record<number, string[]>;
}

export function AccessPlanCards({
  products,
  hasActiveAccess,
  onSelect,
  featuresByDuration,
}: Props) {
  const monthly = products.find((p) => p.duration_days === 30);
  const yearly = products.find((p) => p.duration_days === 365);
  const savings =
    monthly && yearly ? yearlySavingsGrosz(monthly.amount_grosz, yearly.amount_grosz) : 0;

  return (
    <div className="grid items-stretch gap-4 md:grid-cols-2">
      {products.map((p) => {
        const isYearly = p.duration_days === 365;
        const features = featuresByDuration?.[p.duration_days] ?? [];
        const cta = hasActiveAccess
          ? `Przedłuż o ${p.duration_days} dni`
          : isYearly
            ? "Wykup dostęp na rok"
            : "Wykup dostęp";

        if (isYearly) {
          return (
            <div
              key={p.code}
              className="relative overflow-hidden rounded-3xl p-[2px] shadow-[0_18px_60px_-18px_oklch(0.55_0.18_75/0.6)]"
            >
              <span
                aria-hidden
                className="absolute left-1/2 top-1/2 aspect-square w-[220%] -translate-x-1/2 -translate-y-1/2"
                style={{
                  background:
                    "conic-gradient(from 0deg, oklch(0.85 0.16 90), oklch(0.62 0.15 55), oklch(0.78 0.18 80), oklch(0.55 0.14 50), oklch(0.90 0.14 95), oklch(0.85 0.16 90))",
                  animation: "fy-plan-spin 7s linear infinite",
                }}
              />
              <div className="relative flex h-full flex-col overflow-hidden rounded-[22px] p-6 text-white">
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(120% 140% at 0% 0%, oklch(0.30 0.10 265) 0%, oklch(0.18 0.05 265) 55%, oklch(0.12 0.03 265) 100%)",
                  }}
                />
                <span
                  aria-hidden
                  className="absolute -right-10 -top-10 h-40 w-40 rounded-full blur-2xl"
                  style={{
                    background:
                      "radial-gradient(circle, oklch(0.80 0.18 85 / 0.35), transparent 70%)",
                  }}
                />
                <div className="relative flex h-full flex-col">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-200/90">
                      Pełny dostęp · {p.duration_days} dni
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-300 to-yellow-500 px-2.5 py-1 text-[11px] font-bold text-slate-900 shadow">
                      <Crown className="h-3 w-3" /> Najlepsza oferta
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-4xl font-extrabold tracking-tight">
                      {formatGroszPln(p.amount_grosz)}
                    </span>
                    <span className="text-sm text-white/60">brutto</span>
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    Płatność jednorazowa · dokładnie {p.duration_days} dni dostępu · bez
                    automatycznych odnowień
                  </div>
                  {savings > 0 && (
                    <div className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full border border-emerald-300/30 bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                      <Sparkles className="h-3.5 w-3.5" />
                      Oszczędzasz {formatGroszPln(savings)} względem 12 zakupów miesięcznych
                    </div>
                  )}
                  {features.length > 0 && (
                    <ul className="mt-4 space-y-2.5">
                      {features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-sm text-white/85">
                          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-300/20">
                            <Check className="h-3 w-3 text-amber-300" />
                          </span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-auto pt-5">
                    <Button
                      className="h-11 w-full rounded-xl bg-gradient-to-r from-amber-300 to-yellow-500 text-[15px] font-bold text-slate-900 shadow-[0_10px_30px_-10px_oklch(0.75_0.15_85/0.9)] transition-all hover:brightness-105 hover:shadow-[0_14px_40px_-10px_oklch(0.75_0.15_85)]"
                      onClick={() => onSelect(p)}
                    >
                      {cta}
                    </Button>
                  </div>
                </div>
              </div>
              <style>{`
                @keyframes fy-plan-spin { to { transform: translate(-50%, -50%) rotate(360deg); } }
              `}</style>
            </div>
          );
        }

        return (
          <div
            key={p.code}
            className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_12px_45px_-18px_oklch(0.55_0.02_265/0.4)] transition-shadow hover:shadow-[0_16px_55px_-18px_oklch(0.55_0.02_265/0.55)]"
          >
            <span
              aria-hidden
              className="absolute -right-12 -top-12 h-40 w-40 rounded-full blur-2xl"
              style={{
                background: "radial-gradient(circle, oklch(0.90 0.03 250 / 0.9), transparent 70%)",
              }}
            />
            <div className="relative flex h-full flex-col">
              <div className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">
                Pełny dostęp · {p.duration_days} dni
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold tracking-tight text-slate-900">
                  {formatGroszPln(p.amount_grosz)}
                </span>
                <span className="text-sm text-slate-500">brutto</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Płatność jednorazowa · dokładnie {p.duration_days} dni dostępu · bez automatycznych
                odnowień
              </div>
              {features.length > 0 && (
                <ul className="mt-4 space-y-2.5">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-100">
                        <Check className="h-3 w-3 text-sky-600" />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-auto pt-5">
                <Button
                  variant="outline"
                  className="h-11 w-full rounded-xl border-slate-300 text-[15px] font-semibold hover:border-slate-400"
                  onClick={() => onSelect(p)}
                >
                  {cta}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
