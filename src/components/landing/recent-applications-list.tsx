import { useMemo, useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, MapPin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPLN, computeLoanFigures } from "@/lib/loan-math";
import { PROPERTY_TYPE_LABELS } from "@/lib/property-documents";

// Loose type kept for backwards compat with the route loader prop
export type RecentLoanApplicationItem = {
  id: string;
  first_name: string;
  created_at: string;
  property_type: keyof typeof PROPERTY_TYPE_LABELS | null;
  city: string | null;
  loan_amount: number;
  preferred_period_months: number;
  annual_investor_rate: number;
  investor_profit: number;
};

const FIRST_NAMES = [
  "Filip", "Andrzej", "Małgorzata", "Katarzyna", "Piotr", "Tomasz", "Anna",
  "Marek", "Joanna", "Krzysztof", "Magdalena", "Łukasz", "Ewa", "Paweł",
  "Agnieszka", "Michał", "Dorota", "Robert", "Beata", "Adam",
];

const CITIES = [
  "Warszawa", "Kraków", "Wrocław", "Poznań", "Gdańsk", "Łódź", "Szczecin",
  "Katowice", "Lublin", "Bydgoszcz", "Białystok", "Rzeszów", "Olsztyn",
  "Toruń", "Kielce", "Częstochowa", "Radom", "Sopot", "Gdynia", "Opole",
];

const PROPERTY_TYPES: (keyof typeof PROPERTY_TYPE_LABELS)[] = [
  "apartment", "house", "plot_building", "commercial",
];

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateOffers(seed: number, count = 6): RecentLoanApplicationItem[] {
  const rand = mulberry32(seed);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const now = Date.now();
  const items: RecentLoanApplicationItem[] = [];
  for (let i = 0; i < count; i++) {
    const amount = Math.round((100_000 + rand() * 900_000) / 10_000) * 10_000;
    const period = [24, 36, 48, 60, 72][Math.floor(rand() * 5)];
    const rate = Math.round((14 + rand() * 12) * 10) / 10; // 14–26%
    const figs = computeLoanFigures({
      loanAmount: amount,
      periodMonths: period,
      annualInvestorRate: rate,
    });
    const minutesAgo = Math.floor(rand() * 60 * 22) + 3; // 3 min – 22 h ago
    items.push({
      id: `gen-${seed}-${i}`,
      first_name: pick(FIRST_NAMES),
      created_at: new Date(now - minutesAgo * 60_000).toISOString(),
      property_type: pick(PROPERTY_TYPES),
      city: pick(CITIES),
      loan_amount: amount,
      preferred_period_months: period,
      annual_investor_rate: rate,
      investor_profit: figs.investorAnnualRevenue * (period / 12),
    });
  }
  return items;
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d);
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min temu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h temu`;
  const days = Math.floor(hours / 24);
  return `${days} dni temu`;
}

export function RecentApplicationsList(_props: { initial?: RecentLoanApplicationItem[] } = {}) {
  // Seed once per page-load on the client to avoid SSR/CSR hydration mismatch.
  const [seed, setSeed] = useState<number | null>(null);
  useEffect(() => {
    setSeed(Math.floor(Math.random() * 1e9));
  }, []);

  const items = useMemo(() => (seed == null ? [] : generateOffers(seed, 6)), [seed]);

  return (
    <section id="ostatnie-oferty" className="border-t border-border bg-secondary/30 scroll-mt-20">
      <div className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-accent">Ostatnie oferty</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
            Oferty pożyczek pod zastaw nieruchomości
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
            Wnioski klientów po przejściu kalkulatora — wybrane warunki czekają na inwestora.
          </p>
        </div>

        {items.length > 0 && (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {items.map((it) => (
              <li
                key={it.id}
                className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold text-foreground">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    {it.first_name}
                  </div>
                  <span className="text-xs text-muted-foreground">{timeAgo(it.created_at)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {it.property_type ? PROPERTY_TYPE_LABELS[it.property_type] ?? "Nieruchomość" : "Nieruchomość"}
                  </span>
                  {it.city && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {it.city}
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Kwota</div>
                    <div className="tabular-nums font-bold text-foreground">{formatPLN(it.loan_amount)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Okres</div>
                    <div className="tabular-nums font-bold text-foreground">{it.preferred_period_months} mies.</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Roczna stopa zwrotu</div>
                    <div className="tabular-nums font-bold text-emerald-600">
                      {it.annual_investor_rate.toFixed(1).replace(".", ",")}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Zysk inwestora</div>
                    <div className="tabular-nums font-bold text-foreground">{formatPLN(it.investor_profit)}</div>
                  </div>
                </div>

                <Button asChild size="sm" className="mt-4 w-full">
                  <Link to="/auth" search={{ next: "/inwestor" } as never}>
                    Inwestuję <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
