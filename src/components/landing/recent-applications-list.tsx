import { useMemo, useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  MapPin,
  ArrowRight,
  Home,
  Building2,
  Trees,
  Store,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPLN, monthlyPayment } from "@/lib/loan-math";
import { PROPERTY_TYPE_LABELS } from "@/lib/property-documents";
import { FancyShell } from "@/components/landing/fancy-shell";
import { LANDING_OFFER_PHOTOS } from "@/assets/landing-offer-photos";

// Używamy WYŁĄCZNIE zdjęć dostarczonych przez klienta (LANDING_OFFER_PHOTOS).
const PROPERTY_VISUAL: Record<string, { Icon: typeof Home; gradient: string }> = {
  apartment: { Icon: Building2, gradient: "from-sky-500/15 via-sky-500/5 to-transparent" },
  house: { Icon: Home, gradient: "from-emerald-500/15 via-emerald-500/5 to-transparent" },
  plot_building: { Icon: Trees, gradient: "from-amber-500/15 via-amber-500/5 to-transparent" },
  commercial: { Icon: Store, gradient: "from-violet-500/15 via-violet-500/5 to-transparent" },
};

// ---- Calculator-equivalent math (mirrors offer-calculator-panel.tsx) -------
type ScheduleRow = {
  n: number | "balon";
  payment: number;
  interest: number;
  principal: number;
  balance: number;
};
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

function computeOfferFigures(
  amount: number,
  months: number,
  annualRatePercent: number,
): OfferFigures {
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
  business_legal_form: "jdg" | "sp_zoo" | "sa";
  is_startup: boolean;
  nip_verified: boolean;
  has_income_docs: boolean;
  has_bik: boolean;
  phone_verified: boolean;
  bank_verified: boolean;
  photo_url: string;
};

const FIRST_NAMES = [
  "Filip",
  "Andrzej",
  "Małgorzata",
  "Katarzyna",
  "Piotr",
  "Tomasz",
  "Anna",
  "Marek",
  "Joanna",
  "Krzysztof",
  "Magdalena",
  "Łukasz",
  "Ewa",
  "Paweł",
  "Agnieszka",
  "Michał",
  "Dorota",
  "Robert",
  "Beata",
  "Adam",
  "Wojciech",
  "Iwona",
  "Sławomir",
  "Halina",
  "Janusz",
];

// Mniejsze miejscowości — powiatowe i mniejsze
const CITIES = [
  "Mińsk Mazowiecki",
  "Sochaczew",
  "Otwock",
  "Płońsk",
  "Kutno",
  "Konin",
  "Piła",
  "Inowrocław",
  "Słupsk",
  "Tczew",
  "Malbork",
  "Ełk",
  "Suwałki",
  "Zamość",
  "Chełm",
  "Mielec",
  "Stalowa Wola",
  "Nysa",
  "Brzeg",
  "Bolesławiec",
  "Świdnica",
  "Sanok",
  "Krosno",
  "Jasło",
  "Ciechanów",
  "Skierniewice",
  "Łowicz",
  "Sieradz",
  "Wieluń",
  "Bełchatów",
  "Tomaszów Mazowiecki",
  "Pabianice",
  "Grudziądz",
  "Lębork",
  "Kościerzyna",
  "Starogard Gdański",
  "Ostrów Wielkopolski",
  "Jarosław",
  "Przemyśl",
  "Zgorzelec",
];

const PROPERTY_TYPES: (keyof typeof PROPERTY_TYPE_LABELS)[] = [
  "apartment",
  "house",
  "plot_building",
  "commercial",
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
  // Zdjęcia: tasujemy pulę i bierzemy po jednym — nigdy dwa razy to samo zdjęcie.
  const photoPool = [...LANDING_OFFER_PHOTOS];
  for (let i = photoPool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [photoPool[i], photoPool[j]] = [photoPool[j]!, photoPool[i]!];
  }
  const maxCount = Math.min(count, photoPool.length);
  const now = Date.now();
  const items: RecentLoanApplicationItem[] = [];
  for (let i = 0; i < maxCount; i++) {
    // Kwoty: większość ≤ 200k, sporadycznie ~500k, 1–2 sztuki ~800–900k.
    // Sloty: index 0 → 800–900k, index 1 → 500k (czasem też 800–900k), reszta ≤ 200k.
    let amount: number;
    if (i === 0) {
      amount = Math.round((800_000 + rand() * 100_000) / 10_000) * 10_000; // 800–900k
    } else if (i === 1 && rand() < 0.5) {
      amount = Math.round((800_000 + rand() * 100_000) / 10_000) * 10_000; // czasem druga duża
    } else if (i < 4) {
      amount = Math.round((450_000 + rand() * 100_000) / 10_000) * 10_000; // 450–550k
    } else {
      amount = Math.round((40_000 + rand() * 160_000) / 5_000) * 5_000; // 40–200k
    }
    // Dłuższe okresy bardziej prawdopodobne → niższe raty (bliżej minimum)
    const period =
      amount > 400_000
        ? pick([24, 30, 36]) // powyżej 400k max 36 mies.
        : pick([36, 48, 60, 60, 72, 72]); // do 400k preferujemy długie okresy
    // Stopa zwrotu w okolicy minimum z kalkulatora
    const rate =
      period <= 36
        ? Math.round((24 + rand() * 2) * 2) / 2 // 24% – 26%
        : Math.round((15 + rand() * 3) * 2) / 2; // 15% – 18%
    const figures = computeOfferFigures(amount, period, rate);
    const minutesAgo = i < 3 ? Math.floor(rand() * 180) + 3 : Math.floor(rand() * 60 * 24 * 7) + 60;
    const formRoll = rand();
    const business_legal_form: "jdg" | "sp_zoo" | "sa" =
      formRoll < 0.7 ? "jdg" : formRoll < 0.92 ? "sp_zoo" : "sa";
    const is_startup = rand() < 0.35;
    const property_type = pick(PROPERTY_TYPES);
    const photo_url = photoPool[i]!;
    items.push({
      id: `gen-${seed}-${i}`,
      first_name: pick(FIRST_NAMES),
      created_at: new Date(now - minutesAgo * 60_000).toISOString(),
      property_type,
      city: pick(CITIES),
      loan_amount: amount,
      preferred_period_months: period,
      annual_investor_rate: rate,
      wants_extension_option: rand() < 0.55,
      figures,
      business_legal_form,
      is_startup,
      nip_verified: rand() < 0.8,
      has_income_docs: rand() < 0.65,
      has_bik: rand() < 0.7,
      phone_verified: rand() < 0.9,
      bank_verified: rand() < 0.55,
      photo_url,
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

// Deterministyczny seed dzienny — codziennie inna pula ofert (≥3 świeże każdego dnia).
function dailySeed(): number {
  const d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

export function RecentApplicationsList(_props: { initial?: RecentLoanApplicationItem[] } = {}) {
  const [seed, setSeed] = useState<number | null>(null);
  useEffect(() => {
    setSeed(dailySeed());
  }, []);

  const allItems = useMemo(() => (seed == null ? [] : generateOffers(seed, 28)), [seed]);

  // ---- Wyszukiwarka / filtry --------------------------------------------
  const [q, setQ] = useState("");
  const [propType, setPropType] = useState<keyof typeof PROPERTY_TYPE_LABELS | "all">("all");
  const [amountMax, setAmountMax] = useState<number>(900_000);
  const [periodMax, setPeriodMax] = useState<number>(72);
  const [minRate, setMinRate] = useState<number>(15);

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allItems.filter(
      (it) =>
        (needle === "" ||
          it.city.toLowerCase().includes(needle) ||
          it.first_name.toLowerCase().includes(needle)) &&
        (propType === "all" || it.property_type === propType) &&
        it.loan_amount <= amountMax &&
        it.preferred_period_months <= periodMax &&
        it.annual_investor_rate >= minRate,
    );
  }, [allItems, q, propType, amountMax, periodMax, minRate]);

  const filtersActive =
    q !== "" || propType !== "all" || amountMax !== 900_000 || periodMax !== 72 || minRate !== 15;
  const resetFilters = () => {
    setQ("");
    setPropType("all");
    setAmountMax(900_000);
    setPeriodMax(72);
    setMinRate(15);
  };

  return (
    <section id="ostatnie-oferty" className="border-t border-border bg-secondary/30 scroll-mt-20">
      <div className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16">
        <FancyShell>
          <p className="text-xs font-bold uppercase tracking-widest text-white/80">
            Ostatnie oferty
          </p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white md:text-3xl">
            Oferty pożyczek pod zastaw nieruchomości
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-white/85">
            Wnioski klientów po przejściu kalkulatora — wybrane warunki czekają na inwestora.
          </p>
        </FancyShell>

        {/* Wyszukiwarka */}
        <div className="mt-6 rounded-2xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Szukaj po mieście lub imieniu klienta…"
                className="pl-9"
              />
            </div>
            {filtersActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="self-end md:self-auto"
              >
                <X className="mr-1 h-3.5 w-3.5" /> Wyczyść
              </Button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              onClick={() => setPropType("all")}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${propType === "all" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary/60 text-foreground hover:bg-secondary"}`}
            >
              Wszystkie typy
            </button>
            {PROPERTY_TYPES.map((pt) => {
              const v = PROPERTY_VISUAL[pt] ?? PROPERTY_VISUAL.house;
              const Icon = v.Icon;
              const active = propType === pt;
              return (
                <button
                  key={pt}
                  onClick={() => setPropType(pt)}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary/60 text-foreground hover:bg-secondary"}`}
                >
                  <Icon className="h-3 w-3" /> {PROPERTY_TYPE_LABELS[pt]}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">
                Maks. kwota: <b className="text-foreground tabular-nums">{formatPLN(amountMax)}</b>
              </span>
              <input
                type="range"
                min={40_000}
                max={900_000}
                step={10_000}
                value={amountMax}
                onChange={(e) => setAmountMax(Number(e.target.value))}
                className="accent-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">
                Maks. okres: <b className="text-foreground tabular-nums">{periodMax} mies.</b>
              </span>
              <input
                type="range"
                min={12}
                max={72}
                step={6}
                value={periodMax}
                onChange={(e) => setPeriodMax(Number(e.target.value))}
                className="accent-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">
                Min. stopa zwrotu: <b className="text-emerald-600 tabular-nums">{minRate}%</b>
              </span>
              <input
                type="range"
                min={15}
                max={36}
                step={0.5}
                value={minRate}
                onChange={(e) => setMinRate(Number(e.target.value))}
                className="accent-primary"
              />
            </label>
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            Znaleziono <b className="text-foreground tabular-nums">{items.length}</b> z{" "}
            {allItems.length} ofert
          </div>
        </div>

        {items.length === 0 && allItems.length > 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
            Żadna oferta nie spełnia filtrów. Rozluźnij kryteria lub{" "}
            <button
              onClick={resetFilters}
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              wyczyść filtry
            </button>
            .
          </div>
        )}

        {items.length > 0 && (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {items.map((it) => {
              const f = it.figures;
              return (
                <li
                  key={it.id}
                  className="relative flex flex-col overflow-hidden rounded-2xl text-white shadow-[0_12px_45px_-15px_oklch(0.40_0.25_268/0.55)] ring-1 ring-white/10"
                  style={{
                    background:
                      "radial-gradient(120% 140% at 0% 0%, oklch(0.32 0.16 265) 0%, oklch(0.18 0.06 265) 55%, oklch(0.13 0.04 265) 100%)",
                  }}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -left-10 top-24 h-40 w-40 rounded-full blur-3xl"
                    style={{
                      background:
                        "radial-gradient(circle, oklch(0.55 0.22 268 / 0.55), transparent 70%)",
                    }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-12 bottom-10 h-44 w-44 rounded-full blur-3xl"
                    style={{
                      background:
                        "radial-gradient(circle, oklch(0.68 0.16 235 / 0.45), transparent 70%)",
                    }}
                  />
                  {(() => {
                    const v = PROPERTY_VISUAL[it.property_type] ?? PROPERTY_VISUAL.house;
                    const Icon = v.Icon;
                    return (
                      <div className="relative h-40 w-full overflow-hidden">
                        <img
                          src={it.photo_url}
                          alt={`${PROPERTY_TYPE_LABELS[it.property_type]} — ${it.city}`}
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                        <div
                          aria-hidden
                          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/30"
                        />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-4 pb-3 pt-6">
                          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur-sm">
                            <Icon className="h-3.5 w-3.5 text-accent" />
                            {PROPERTY_TYPE_LABELS[it.property_type]}
                          </div>
                          <div className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur-sm">
                            <MapPin className="h-3 w-3" /> {it.city}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="relative flex flex-1 flex-col p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-semibold text-white">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                        {it.first_name}
                      </div>
                      <span className="text-xs text-white/70">{timeAgo(it.created_at)}</span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-white/60">
                          Kwota
                        </div>
                        <div className="tabular-nums font-bold text-white">
                          {formatPLN(it.loan_amount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-white/60">
                          Okres
                        </div>
                        <div className="tabular-nums font-bold text-white">
                          {it.preferred_period_months} mies.
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-white/60">
                          Rata
                        </div>
                        <div className="tabular-nums font-bold text-white">
                          {formatPLN(f.monthly)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button asChild size="sm" className="bg-white text-primary hover:bg-white/90">
                        <Link to="/auth" search={{ next: "/inwestor" } as never}>
                          Inwestuję <ArrowRight className="ml-1 h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                      >
                        <Link
                          to="/negocjuj"
                          search={
                            {
                              app: it.id,
                              client: it.first_name,
                              amount: it.loan_amount,
                              months: it.preferred_period_months,
                              rate: it.annual_investor_rate,
                            } as never
                          }
                        >
                          Negocjuję
                        </Link>
                      </Button>
                    </div>
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
