import { useEffect, type CSSProperties, type MutableRefObject, type ReactNode } from "react";
import { Check, ChevronRight, Lock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { computeLoanFigures, formatPLN } from "@/lib/loan-math";
import { buildEngineSchedule } from "@/lib/contract-engine/loan-schedule";

/**
 * SHARED OFFER CALCULATOR — used by:
 *  - landing single-page application form (step 3)
 *  - landing wizard form (step 4 "Oferta")
 *  - /klient dashboard (InvestorProposalCalculator)
 *
 * This is a controlled, presentational component — all state is owned by parent.
 * Do NOT inline a copy elsewhere; reuse this component to keep behavior identical.
 *
 * Matematyka: kanoniczny silnik `buildEngineSchedule` (jedno źródło prawdy dla
 * całej matematyki pożyczkowej — to samo, co generator umowy). Balon jest
 * OSTATNIĄ z N rat, nie osobnym wierszem; odsetki liczone od salda.
 *
 * Szata: Finance You Design System (navy glass + złoto + niebieskie linie).
 * Kolory podane wprost (nie przez zmienne `.fy-marketing`), bo panel renderuje
 * się też w jasnym panelu klienta — ma wyglądać identycznie w obu miejscach.
 */

const FY = {
  bg: "radial-gradient(120% 140% at 0% 0%, #10193f 0%, #0a1030 55%, #070b22 100%)",
  panel: "rgba(16, 25, 58, 0.72)",
  panelSolid: "#0d1638",
  line: "rgba(84, 124, 214, 0.38)",
  lineSoft: "rgba(84, 124, 214, 0.2)",
  ink: "#e8eefc",
  muted: "#aeb9db",
  faint: "#7d88ac",
  cyan: "oklch(0.82 0.12 192)",
  gold: "oklch(0.82 0.13 85)",
  goldSoft: "oklch(0.82 0.13 85 / 0.5)",
  goldLine: "oklch(0.82 0.13 85 / 0.35)",
} as const;

const SUB_PANEL: CSSProperties = {
  borderRadius: "1rem",
  border: `1px solid ${FY.lineSoft}`,
  background: FY.panel,
};

function CalcRow({
  label,
  value,
  children,
  minLabel,
  maxLabel,
  hint,
}: {
  label: string;
  value: ReactNode;
  children: ReactNode;
  minLabel: ReactNode;
  maxLabel: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Label className="text-sm font-semibold" style={{ color: FY.ink }}>
          {label}
        </Label>
        <span
          className="whitespace-nowrap text-2xl font-extrabold tabular-nums"
          style={{ color: FY.gold }}
        >
          {value}
        </span>
      </div>
      {children}
      <div className="flex justify-between text-xs" style={{ color: FY.faint }}>
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
      {hint ? (
        <p className="text-xs" style={{ color: FY.muted }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export type OfferCalculatorPanelProps = {
  amount: number;
  setAmount: (v: number) => void;
  months: number;
  setMonths: (v: number) => void;
  maxMonths: number;
  annualRate: number;
  setAnnualRate: (v: number) => void;
  rateTouchedRef: MutableRefObject<boolean>;
  maxPayment: number;
  setMaxPayment: (v: number) => void;
  headerLabel?: string;
  shellVariant?: "navy" | "silver" | "gold";
  locked?: boolean;
  lockedMessage?: string;
};

export function OfferCalculatorPanel({
  amount,
  setAmount,
  months,
  setMonths,
  maxMonths,
  annualRate,
  setAnnualRate,
  rateTouchedRef,
  maxPayment,
  setMaxPayment,
  headerLabel = "Wniosek przyjęty",
  shellVariant = "navy",
  locked = false,
  lockedMessage = "Uzupełnij powyższe pola, żeby odblokować kalkulator.",
}: OfferCalculatorPanelProps) {
  // Kapitał pożyczki = kwota, o którą wnioskuje klient. Prowizja Finance You jest kosztem
  // INWESTORA (wykłada ją na wejściu operatorowi) — nie jest kredytowana do kapitału klienta
  // i nie powiększa jego rat. Spójne z kalkulatorem inwestora i kreatorem dokumentów.
  const grossPrincipal = amount;

  // Reguły kosztu:
  // - minimalne wynagrodzenie inwestora: 1,79% miesięcznie (21,48% rocznie)
  // - okres ≤ 36 mies. → klient może płacić tylko odsetki (rata balonowa dopuszczalna)
  // - okres > 36 mies. → klient musi płacić pełną ratę kapitałowo-odsetkową
  const minMonthlyRate = 1.79;
  const minAnnualRate = minMonthlyRate * 12;
  const allowBalloon = months <= 36;

  useEffect(() => {
    if (annualRate < minAnnualRate) setAnnualRate(minAnnualRate);
  }, [minAnnualRate, annualRate, setAnnualRate]);

  const r = annualRate / 100 / 12;
  const nominalFig = computeLoanFigures({
    amount: grossPrincipal,
    annualRatePercent: annualRate,
    months,
  });
  // Minimalna rata musi w pełni pokryć odsetki miesiąca (ceil, nie round —
  // inaczej pułap nie pokrywa odsetek i silnik zgłasza ostrzeżenie).
  const interestOnly = Math.ceil(grossPrincipal * r);
  const minCap = allowBalloon ? Math.max(1, interestOnly) : Math.ceil(nominalFig.nominal);
  const maxCap = Math.max(minCap, Math.ceil(nominalFig.nominal));
  const sliderTouched = maxPayment > 0;
  const chosenPayment = allowBalloon
    ? sliderTouched
      ? Math.min(Math.max(maxPayment, minCap), maxCap)
      : minCap
    : maxCap;

  // Gdy zmiana kwoty/okresu sklampuje wybraną ratę, zapisz ją z powrotem do stanu
  // rodzica — inaczej autozapis i snapshot akceptacji utrwalałyby nieaktualną wartość
  // (np. 900 zł) inną niż widoczna dla klienta. Nie ruszamy sentinela 0 (suwak nietknięty).
  useEffect(() => {
    if (sliderTouched && chosenPayment !== maxPayment) setMaxPayment(chosenPayment);
  }, [sliderTouched, chosenPayment, maxPayment, setMaxPayment]);

  const eng = buildEngineSchedule({
    kwotaPozyczki: grossPrincipal,
    prowizja: 0,
    annualRatePercent: annualRate,
    months,
    maxMonthlyPayment: chosenPayment,
  });
  const balloon = eng.balloon;
  const regularMonths = balloon > 0 ? months - 1 : months;

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        borderRadius: "clamp(20px, 2.4vw, 30px)",
        border: `1px solid ${shellVariant === "gold" ? FY.goldLine : FY.line}`,
        background: FY.bg,
        boxShadow: "0 30px 90px -50px rgba(8, 16, 48, 0.9), 0 0 30px rgba(33, 120, 220, 0.22)",
        color: FY.ink,
      }}
    >
      <div className="space-y-6 p-5 md:p-6">
        <div
          className="flex items-center gap-3 text-[0.72rem] font-extrabold uppercase"
          style={{ letterSpacing: "0.24em", color: FY.cyan }}
        >
          <span
            aria-hidden
            style={{ width: 30, height: 2, background: FY.gold, borderRadius: 2 }}
          />
          <span className="inline-flex items-center gap-2">
            {locked ? <Lock className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            {locked ? "Kalkulator raty — zablokowany" : headerLabel}
          </span>
        </div>

        {locked && (
          <div className="flex items-start gap-3 p-4 text-sm" style={SUB_PANEL}>
            <Lock className="mt-0.5 h-5 w-5 shrink-0" style={{ color: FY.gold }} />
            <span>{lockedMessage}</span>
          </div>
        )}

        <div
          className={locked ? "pointer-events-none select-none opacity-50" : ""}
          aria-hidden={locked}
        >
          <div className="space-y-6">
            <CalcRow
              label="Kwota pożyczki"
              value={formatPLN(amount)}
              minLabel="20 000 zł"
              maxLabel="1 000 000 zł"
            >
              <Slider
                gradient="brand"
                value={[amount]}
                min={20_000}
                max={1_000_000}
                step={5_000}
                onValueChange={(v) => setAmount(v[0] ?? amount)}
              />
            </CalcRow>

            <CalcRow
              label="Proponowany okres spłaty"
              value={`${months} mies.`}
              minLabel="12 mies."
              maxLabel={`${maxMonths} mies.`}
            >
              <Slider
                gradient="brand"
                value={[Math.min(Math.max(months, 12), maxMonths)]}
                min={12}
                max={maxMonths}
                step={1}
                onValueChange={(v) => setMonths(v[0] ?? months)}
              />
            </CalcRow>

            <CalcRow
              label="Proponowane wynagrodzenie inwestora (miesięcznie)"
              value={`${(annualRate / 12).toFixed(2)}%`}
              minLabel={`${minMonthlyRate.toFixed(2)}% / mies.`}
              maxLabel={`${(50 / 12).toFixed(2)}% / mies.`}
              hint={
                allowBalloon
                  ? `Minimalne wynagrodzenie inwestora to ${minMonthlyRate.toFixed(2)}% miesięcznie.`
                  : `Minimalne wynagrodzenie inwestora to ${minMonthlyRate.toFixed(2)}% miesięcznie. Powyżej 36 miesięcy spłacasz pełną ratę kapitałowo-odsetkową.`
              }
            >
              <Slider
                gradient="brand"
                value={[annualRate / 12]}
                min={minAnnualRate / 12}
                max={50 / 12}
                step={0.05}
                onValueChange={(v) => {
                  rateTouchedRef.current = true;
                  setAnnualRate((v[0] ?? annualRate / 12) * 12);
                }}
              />
            </CalcRow>

            {allowBalloon ? (
              <CalcRow
                label="Maksymalna rata miesięczna"
                value={formatPLN(chosenPayment)}
                minLabel={
                  <>
                    min. {formatPLN(minCap)}{" "}
                    <span style={{ color: FY.faint, opacity: 0.8 }}>(same odsetki)</span>
                  </>
                }
                maxLabel="pełna rata"
                hint="Ustaw niżej, jeśli chcesz mniejszą ratę miesięczną. Niespłacony kapitał dopłacisz w ostatniej, balonowej racie."
              >
                <Slider
                  gradient="brand"
                  value={[chosenPayment]}
                  min={minCap}
                  max={maxCap}
                  step={50}
                  onValueChange={(v) => setMaxPayment(v[0] ?? 0)}
                />
              </CalcRow>
            ) : (
              <div className="p-4 text-xs" style={{ ...SUB_PANEL, color: FY.muted }}>
                Przy okresie powyżej 36 miesięcy spłacasz{" "}
                <span className="font-semibold" style={{ color: FY.ink }}>
                  pełną ratę kapitałowo-odsetkową
                </span>{" "}
                — bez raty balonowej na końcu.
              </div>
            )}

            <div
              className="p-5"
              style={{
                borderRadius: "1rem",
                border: `1px solid ${FY.goldLine}`,
                background: `linear-gradient(160deg, ${FY.panelSolid}, oklch(0.82 0.13 85 / 0.07))`,
                boxShadow: "0 0 24px rgba(30, 90, 200, 0.25), inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
            >
              <p
                className="text-[0.68rem] font-extrabold uppercase"
                style={{ letterSpacing: "0.2em", color: FY.cyan }}
              >
                Twoja miesięczna rata
              </p>
              <p
                className="mt-1 text-4xl font-black tabular-nums md:text-5xl"
                style={{
                  background: `linear-gradient(100deg, ${FY.ink}, ${FY.gold} 70%, oklch(0.92 0.09 88))`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {formatPLN(chosenPayment)}
              </p>
              <p className="mt-1 text-xs" style={{ color: FY.muted }}>
                {balloon > 0 ? (
                  <>
                    przez {regularMonths} mies. — ostatnia rata (balonowa): {formatPLN(balloon)}
                  </>
                ) : (
                  <>przez {months} mies. — bez raty balonowej</>
                )}
              </p>

              <div
                className="mt-4 grid gap-3 pt-4 sm:grid-cols-2"
                style={{ borderTop: `1px solid ${FY.lineSoft}` }}
              >
                <div>
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: FY.faint }}
                  >
                    Kwota pożyczki
                  </p>
                  <p className="mt-0.5 text-lg font-extrabold tabular-nums">{formatPLN(amount)}</p>
                </div>
                <div>
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: FY.faint }}
                  >
                    Okres
                  </p>
                  <p className="mt-0.5 text-lg font-extrabold tabular-nums">{months} mies.</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: "rgba(84, 124, 214, 0.12)" }}>
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: FY.faint }}
                  >
                    Łączna spłata
                  </p>
                  <p className="mt-0.5 text-xl font-extrabold tabular-nums">
                    {formatPLN(eng.totalToRepay)}
                  </p>
                </div>
                <div
                  className="rounded-xl p-3"
                  style={{ background: "oklch(0.82 0.13 85 / 0.10)" }}
                >
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: FY.faint }}
                  >
                    Wynagrodzenie inwestora
                  </p>
                  <p
                    className="mt-0.5 text-xl font-extrabold tabular-nums"
                    style={{ color: FY.gold }}
                  >
                    {formatPLN(eng.totalInterest)}
                  </p>
                </div>
              </div>
            </div>

            <details className="group overflow-hidden" style={SUB_PANEL}>
              <summary
                className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold hover:bg-[rgba(84,124,214,0.12)]"
                style={{ color: FY.ink }}
              >
                <span>Harmonogram spłat ({months} rat)</span>
                <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
              </summary>
              <div
                className="max-h-80 overflow-auto"
                style={{ borderTop: `1px solid ${FY.lineSoft}` }}
              >
                <table className="w-full min-w-[430px] text-right text-xs tabular-nums">
                  <thead
                    className="sticky top-0 text-[11px] uppercase tracking-wider"
                    style={{ background: FY.panelSolid, color: FY.muted }}
                  >
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">#</th>
                      <th className="whitespace-nowrap px-3 py-2 font-semibold">Rata</th>
                      <th className="whitespace-nowrap px-3 py-2 font-semibold">Odsetki</th>
                      <th className="whitespace-nowrap px-3 py-2 font-semibold">Kapitał</th>
                      <th className="whitespace-nowrap px-3 py-2 font-semibold">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eng.rows.map((row) => (
                      <tr
                        key={row.nr}
                        style={{
                          borderTop: `1px solid ${FY.lineSoft}`,
                          background: row.isBalloon ? "oklch(0.82 0.13 85 / 0.10)" : undefined,
                          fontWeight: row.isBalloon ? 600 : undefined,
                        }}
                      >
                        <td className="px-3 py-1.5 text-left whitespace-nowrap">
                          {row.nr}
                          {row.isBalloon ? <span style={{ color: FY.gold }}> · balon</span> : ""}
                        </td>
                        <td className="px-3 py-1.5 font-semibold">{formatPLN(row.rata_razem)}</td>
                        <td className="px-3 py-1.5" style={{ color: FY.muted }}>
                          {formatPLN(row.odsetki)}
                        </td>
                        <td className="px-3 py-1.5" style={{ color: FY.muted }}>
                          {formatPLN(row.kapital)}
                        </td>
                        <td className="px-3 py-1.5">{formatPLN(row.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-3 text-[11px]" style={{ color: FY.faint }}>
                Kapitał pożyczki: {formatPLN(grossPrincipal)} — odsetki liczone są wyłącznie od
                kapitału pozostającego do spłaty. Prowizja Finance You obciąża inwestora i nie jest
                doliczana do Twojej spłaty.
              </p>
            </details>

            <p className="text-[11px]" style={{ color: FY.faint }}>
              Wyliczenia poglądowe przy wynagrodzeniu inwestora {annualRate}% rocznie. Ostateczne
              warunki ustalisz indywidualnie z inwestorem.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
