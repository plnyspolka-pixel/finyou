import { useMemo, useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, MapPin, ArrowRight, ChevronRight, Home, Building2, Trees, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPLN, monthlyPayment } from "@/lib/loan-math";
import { PROPERTY_TYPE_LABELS } from "@/lib/property-documents";

// Bez zdjęć — na landingu nie pokazujemy żadnych materiałów klientów (KW, dokumenty, fotki nieruchomości).
const PROPERTY_VISUAL: Record<string, { Icon: typeof Home; gradient: string }> = {
  apartment: { Icon: Building2, gradient: "from-sky-500/15 via-sky-500/5 to-transparent" },
  house: { Icon: Home, gradient: "from-emerald-500/15 via-emerald-500/5 to-transparent" },
  plot_building: { Icon: Trees, gradient: "from-amber-500/15 via-amber-500/5 to-transparent" },
  commercial: { Icon: Store, gradient: "from-violet-500/15 via-violet-500/5 to-transparent" },
};


// ---- Calculator-equivalent math (mirrors offer-calculator-panel.tsx) -------
type ScheduleRow = { n: number | "balon"; payment: number; interest: number; principal: number; balance: number };
type OfferFigures = {
  feePct: number;
  fee: number;
  grossPrincipal: number;
  monthly: number;
  balloon: number;
  total: number;
  investorCompensation: number;
  schedule: ScheduleRow[];
};

function computeOfferFigures(amount: number, months: number, annualRatePercent: number): OfferFigures {
  const feeT = Math.min(1, Math.max(0, (amount - 20_000) / (1_000_000 - 20_000)));
  const FY_FEE_PCT = Math.round((10 - feeT * 6) * 10) / 10;
  const fee = Math.round((amount * FY_FEE_PCT) / 100);
  const grossPrincipal = amount + fee;
  const r = annualRatePercent / 100 / 12;
  const allowBalloon = months <= 36;
  const nominal = monthlyPayment(grossPrincipal, annualRatePercent, months);
  const paymentExact = allowBalloon ? grossPrincipal * r : nominal;

  const schedule: ScheduleRow[] = [];
  let balance = grossPrincipal;
  let totalPaid = 0;
  let totalInterest = 0;
  for (let n = 1; n <= months; n++) {
    const interest = balance * r;
    const principalPart = Math.max(0, Math.min(paymentExact - interest, balance));
    const payment = interest + principalPart;
    balance = Math.max(0, balance - principalPart);
    totalPaid += payment;
    totalInterest += interest;
    schedule.push({ n, payment, interest, principal: principalPart, balance });
  }
  let balloon = 0;
  if (balance > 0.5) {
    balloon = balance;
    totalPaid += balance;
    schedule.push({ n: "balon", payment: balance, interest: 0, principal: balance, balance: 0 });
  }
  return {
    feePct: FY_FEE_PCT,
    fee,
    grossPrincipal,
    monthly: paymentExact,
    balloon,
    total: totalPaid,
    investorCompensation: totalInterest,
    schedule,
  };
}

// ---- Generator config -----------------------------------------------------
export type RecentLoanApplicationItem = {
  id: string;
  first_name: string;
  created_at: string;
  property_type: keyof typeof PROPERTY_TYPE_LABELS;
  city: string;
  loan_amount: number;
  preferred_period_months: number;
  annual_investor_rate: number;
  wants_extension_option: boolean;
  figures: OfferFigures;
};


const FIRST_NAMES = [
  "Filip", "Andrzej", "Małgorzata", "Katarzyna", "Piotr", "Tomasz", "Anna",
  "Marek", "Joanna", "Krzysztof", "Magdalena", "Łukasz", "Ewa", "Paweł",
  "Agnieszka", "Michał", "Dorota", "Robert", "Beata", "Adam", "Wojciech",
  "Iwona", "Sławomir", "Halina", "Janusz",
];

// Mniejsze miejscowości — powiatowe i mniejsze
const CITIES = [
  "Mińsk Mazowiecki", "Sochaczew", "Otwock", "Płońsk", "Kutno", "Konin",
  "Piła", "Inowrocław", "Słupsk", "Tczew", "Malbork", "Ełk", "Suwałki",
  "Zamość", "Chełm", "Mielec", "Stalowa Wola", "Nysa", "Brzeg", "Bolesławiec",
  "Świdnica", "Sanok", "Krosno", "Jasło", "Ciechanów", "Skierniewice",
  "Łowicz", "Sieradz", "Wieluń", "Bełchatów", "Tomaszów Mazowiecki",
  "Pabianice", "Grudziądz", "Lębork", "Kościerzyna", "Starogard Gdański",
  "Ostrów Wielkopolski", "Jarosław", "Przemyśl", "Zgorzelec",
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
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)] as T;
  const now = Date.now();
  const items: RecentLoanApplicationItem[] = [];
  for (let i = 0; i < count; i++) {
    // Mniejsze kwoty: 30k – 250k, krok 5k
    const amount = Math.round((30_000 + rand() * 220_000) / 5_000) * 5_000;
    // Krótsze okresy → balon i wyższe stopy
    const period = pick([24, 24, 36, 36, 36, 48, 60]);
    // Wyższe wynagrodzenie inwestora — zgodnie z regułami kalkulatora
    const rate = period <= 36
      ? Math.round((28 + rand() * 8) * 2) / 2   // 28% – 36% step 0.5
      : Math.round((22 + rand() * 8) * 2) / 2;  // 22% – 30% step 0.5
    const figures = computeOfferFigures(amount, period, rate);
    const minutesAgo = Math.floor(rand() * 60 * 22) + 3;
    items.push({
      id: `gen-${seed}-${i}`,
      first_name: pick(FIRST_NAMES),
      created_at: new Date(now - minutesAgo * 60_000).toISOString(),
      property_type: pick(PROPERTY_TYPES),
      city: pick(CITIES),
      loan_amount: amount,
      preferred_period_months: period,
      annual_investor_rate: rate,
      wants_extension_option: rand() < 0.55,
      figures,
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
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {items.map((it) => {
              const f = it.figures;
              return (
                <li
                  key={it.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                >
                  {(() => {
                    const v = PROPERTY_VISUAL[it.property_type] ?? PROPERTY_VISUAL.house;
                    const Icon = v.Icon;
                    return (
                      <div className={`relative flex h-24 w-full items-center justify-between overflow-hidden bg-gradient-to-br ${v.gradient} px-4`}>
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Icon className="h-5 w-5 text-accent" />
                          {PROPERTY_TYPE_LABELS[it.property_type]}
                        </div>
                        <div className="inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur-sm">
                          <MapPin className="h-3 w-3" /> {it.city}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-semibold text-foreground">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        {it.first_name}
                      </div>
                      <span className="text-xs text-muted-foreground">{timeAgo(it.created_at)}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Wniosek złożony po przejściu kalkulatora
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
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Rata miesięczna</div>
                        <div className="tabular-nums font-bold text-foreground">{formatPLN(f.monthly)}</div>
                        {f.balloon > 0 && (
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            + balon {formatPLN(f.balloon)}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Roczna stopa zwrotu</div>
                        <div className="tabular-nums font-bold text-emerald-600">
                          {it.annual_investor_rate.toFixed(1).replace(".", ",")}%
                        </div>
                      </div>
                      <div className="col-span-2 rounded-xl bg-secondary/60 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Zysk inwestora (całość)
                        </div>
                        <div className="tabular-nums text-lg font-extrabold text-foreground">
                          {formatPLN(f.investorCompensation)}
                      </div>
                    </div>

                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2 text-[11px]">
                      <span
                        className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          it.wants_extension_option
                            ? "bg-emerald-500/15 text-emerald-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {it.wants_extension_option ? "✓" : "—"}
                      </span>
                      <span className="text-foreground">
                        {it.wants_extension_option
                          ? "Klient wnioskuje o możliwość przedłużenia okresu pożyczki"
                          : "Klient nie wnioskuje o opcję przedłużenia"}
                      </span>
                    </div>
                    </div>

                    <details className="group mt-3 rounded-xl border border-border bg-secondary/40">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary/70">
                        <span>Harmonogram spłat ({it.preferred_period_months} rat{f.balloon > 0 ? " + balon" : ""})</span>
                        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                      </summary>
                      <div className="max-h-72 overflow-auto border-t border-border">
                        <table className="w-full text-right text-[11px] tabular-nums">
                          <thead className="sticky top-0 bg-secondary text-[10px] uppercase tracking-wider text-muted-foreground">
                            <tr>
                              <th className="px-2 py-1.5 text-left font-semibold">#</th>
                              <th className="px-2 py-1.5 font-semibold">Rata</th>
                              <th className="px-2 py-1.5 font-semibold">Odsetki</th>
                              <th className="px-2 py-1.5 font-semibold">Kapitał</th>
                              <th className="px-2 py-1.5 font-semibold">Saldo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {f.schedule.map((row, idx) => (
                              <tr
                                key={idx}
                                className={`border-t border-border/60 ${row.n === "balon" ? "bg-accent/10 font-semibold" : ""}`}
                              >
                                <td className="px-2 py-1 text-left text-foreground">
                                  {row.n === "balon" ? "Balon" : row.n}
                                </td>
                                <td className="px-2 py-1 font-semibold text-foreground">{formatPLN(row.payment)}</td>
                                <td className="px-2 py-1 text-muted-foreground">{formatPLN(row.interest)}</td>
                                <td className="px-2 py-1 text-muted-foreground">{formatPLN(row.principal)}</td>
                                <td className="px-2 py-1 text-foreground">{formatPLN(row.balance)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="px-3 py-2 text-[10px] text-muted-foreground">
                        Kapitał startowy: {formatPLN(f.grossPrincipal)} = kwota pożyczki {formatPLN(it.loan_amount)} + prowizja Finance You {formatPLN(f.fee)} ({f.feePct}%).
                      </p>
                    </details>

                    <Button asChild size="sm" className="mt-4 w-full">
                      <Link to="/auth" search={{ next: "/inwestor" } as never}>
                        Inwestuję <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
