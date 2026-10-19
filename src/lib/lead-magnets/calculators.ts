// Silnik kalkulatorów-lead-magnetów (brief 5.4 p. 2) — narzędzie budowane
// z KONFIGURACJI (JSON: pola, walidacja, wyniki), a obliczenia wyłącznie
// z biblioteki zweryfikowanych funkcji systemu (contract-engine/fees,
// loan-math). Agent tworzy nowe kalkulatory, wypełniając konfigurację —
// nigdy nie generuje ani nie wdraża kodu w runtime.
//
// Wynik dzieli się na część widoczną od razu (`teaser`) i pełną, wysyłaną
// mailem po zapisie na listę (cel nadrzędny: opt-in). Czysta logika, testy:
// calculators.test.ts.
import { z } from "zod";
import {
  LTV_MAX,
  fyCommission,
  kwotaNaReke,
  ltvPercent,
  maxLoanAtLtv,
  validateAnnualRate,
} from "@/lib/contract-engine/fees";
import { monthlyPayment } from "@/lib/loan-math";

// ── Biblioteka funkcji (jedyne dozwolone obliczenia) ──────────────────────

type Fn = { args: number; run: (a: number[]) => number | null; describe: string };

const round2 = (v: number) => Math.round(v * 100) / 100;

export const CALC_FUNCTIONS = {
  ltv_percent: {
    args: 3,
    run: ([loan, value, enc]) => ltvPercent(loan, value, enc),
    describe: "LTV w % = (kwota + obciążenia) / wartość × 100",
  },
  ltv_buffer_percent: {
    args: 3,
    // O ile % może spaść wartość nieruchomości, zanim dług ją przekroczy.
    run: ([loan, value, enc]) => {
      const ltv = ltvPercent(loan, value, enc);
      return ltv == null ? null : round2(Math.max(0, 100 - ltv));
    },
    describe: "Bufor bezpieczeństwa = 100% − LTV",
  },
  max_loan_at_ltv: {
    args: 3,
    // Limit LTV z konfiguracji nigdy nie przekracza progu systemu (LTV_MAX).
    run: ([value, enc, limit]) => maxLoanAtLtv(value, enc, Math.min(limit || LTV_MAX, LTV_MAX)),
    describe: `Maksymalna kwota przy LTV ≤ ${LTV_MAX}% po odjęciu obciążeń`,
  },
  monthly_payment: {
    args: 3,
    run: ([amount, rate, months]) => {
      if (validateAnnualRate(rate)) return null;
      return round2(monthlyPayment(amount, rate, months));
    },
    describe: "Rata annuitetowa (oprocentowanie ≤ odsetki maksymalne)",
  },
  fy_commission: {
    args: 1,
    run: ([amount]) => fyCommission(amount),
    describe: "Prowizja Finance You od Kwoty Udzielonej",
  },
  net_payout: {
    args: 1,
    run: ([amount]) => kwotaNaReke(amount),
    describe: "Kwota na rękę po potrąceniu prowizji Finance You",
  },
} satisfies Record<string, Fn>;

export type CalcFunctionName = keyof typeof CALC_FUNCTIONS;
const FN_NAMES = Object.keys(CALC_FUNCTIONS) as [CalcFunctionName, ...CalcFunctionName[]];

// ── Konfiguracja ──────────────────────────────────────────────────────────

const fieldSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  label: z.string().min(2).max(120),
  type: z.enum(["pln", "percent", "months", "number"]),
  min: z.number(),
  max: z.number(),
  default: z.number().optional(),
  help: z.string().max(300).optional(),
});

/** Argument: id pola, id WCZEŚNIEJSZEGO wyniku albo stała liczbowa. */
const argSchema = z.union([z.string().regex(/^[a-z][a-z0-9_]{1,40}$/), z.number()]);

const outputSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  label: z.string().min(2).max(120),
  fn: z.enum(FN_NAMES),
  args: z.array(argSchema).max(4),
  format: z.enum(["pln", "percent", "number"]),
  /** Widoczne od razu (część wyniku przed zapisem). */
  teaser: z.boolean().default(false),
});

export const calculatorConfigSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]{3,60}$/),
    track: z.enum(["pozyczkobiorca", "inwestor"]),
    title: z.string().min(5).max(120),
    intro: z.string().max(600),
    fields: z.array(fieldSchema).min(1).max(8),
    outputs: z.array(outputSchema).min(1).max(8),
    /** Jawne założenia (brief: „z założeniami jawnie pokazanymi”). */
    assumptions: z.array(z.string().min(5).max(300)).min(1).max(8),
    /** Przypadki testowe sprawdzane przed publikacją (kontrola jakości formuł). */
    tests: z
      .array(
        z.object({
          inputs: z.record(z.string(), z.number()),
          expect: z.record(z.string(), z.number().nullable()),
        }),
      )
      .min(1)
      .max(10),
  })
  .superRefine((cfg, ctx) => {
    const known = new Set(cfg.fields.map((f) => f.id));
    for (const o of cfg.outputs) {
      const fn = CALC_FUNCTIONS[o.fn];
      if (o.args.length !== fn.args) {
        ctx.addIssue({ code: "custom", message: `${o.id}: ${o.fn} wymaga ${fn.args} argumentów` });
      }
      for (const a of o.args) {
        if (typeof a === "string" && !known.has(a)) {
          ctx.addIssue({ code: "custom", message: `${o.id}: nieznane pole lub wynik „${a}”` });
        }
      }
      if (known.has(o.id))
        ctx.addIssue({ code: "custom", message: `${o.id}: zdublowany identyfikator` });
      known.add(o.id);
    }
    if (!cfg.outputs.some((o) => o.teaser)) {
      ctx.addIssue({
        code: "custom",
        message: "Co najmniej jeden wynik musi być widoczny od razu (teaser).",
      });
    }
    if (cfg.outputs.every((o) => o.teaser)) {
      ctx.addIssue({ code: "custom", message: "Pełny wynik musi mieć część wysyłaną po zapisie." });
    }
    for (const f of cfg.fields) {
      if (f.min > f.max) ctx.addIssue({ code: "custom", message: `${f.id}: min > max` });
    }
  });

export type CalculatorConfig = z.infer<typeof calculatorConfigSchema>;

export type CalcResult = {
  ok: boolean;
  errors: Record<string, string>;
  teaser: { id: string; label: string; value: number | null; formatted: string }[];
  gated: { id: string; label: string; value: number | null; formatted: string }[];
};

export function formatValue(v: number | null, format: "pln" | "percent" | "number"): string {
  if (v == null) return "—";
  if (format === "pln")
    return `${v.toLocaleString("pl-PL", { maximumFractionDigits: 0 }).replace(/[\u00a0\u202f]/g, " ")} zł`;
  if (format === "percent") return `${v.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%`;
  return v.toLocaleString("pl-PL", { maximumFractionDigits: 2 }).replace(/[\u00a0\u202f]/g, " ");
}

export function evaluateCalculator(
  cfg: CalculatorConfig,
  raw: Record<string, unknown>,
): CalcResult {
  const errors: Record<string, string> = {};
  const values: Record<string, number> = {};
  for (const f of cfg.fields) {
    const v = raw[f.id] ?? f.default;
    const n =
      typeof v === "number"
        ? v
        : Number(
            String(v ?? "")
              .replace(/\s/g, "")
              .replace(",", "."),
          );
    if (!Number.isFinite(n)) errors[f.id] = "Podaj liczbę.";
    else if (n < f.min || n > f.max) errors[f.id] = `Wartość od ${f.min} do ${f.max}.`;
    else values[f.id] = n;
  }
  const ok = Object.keys(errors).length === 0;
  const teaser: CalcResult["teaser"] = [];
  const gated: CalcResult["gated"] = [];
  for (const o of cfg.outputs) {
    let value: number | null = null;
    if (ok) {
      const args = o.args.map((a) => (typeof a === "number" ? a : values[a]));
      value = args.every((x) => Number.isFinite(x)) ? CALC_FUNCTIONS[o.fn].run(args) : null;
      if (value != null) values[o.id] = value;
    }
    const row = { id: o.id, label: o.label, value, formatted: formatValue(value, o.format) };
    (o.teaser ? teaser : gated).push(row);
  }
  return { ok, errors, teaser, gated };
}

/** Kontrola jakości formuł: przypadki testowe z konfiguracji (tolerancja 1 zł / 0,01 p.p.). */
export function runCalculatorTests(cfg: CalculatorConfig): string[] {
  const failures: string[] = [];
  cfg.tests.forEach((t, i) => {
    const r = evaluateCalculator(cfg, t.inputs);
    const all = [...r.teaser, ...r.gated];
    for (const [id, expected] of Object.entries(t.expect)) {
      const got = all.find((x) => x.id === id)?.value ?? null;
      const okv = expected == null ? got == null : got != null && Math.abs(got - expected) <= 1;
      if (!okv) failures.push(`test ${i + 1}: ${id} = ${got}, oczekiwano ${expected}`);
    }
  });
  return failures;
}

/** Walidacja + testy w jednym — warunek publikacji narzędzia. */
export function validateCalculator(
  input: unknown,
): { ok: true; config: CalculatorConfig } | { ok: false; errors: string[] } {
  const parsed = calculatorConfigSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  const failures = runCalculatorTests(parsed.data);
  return failures.length ? { ok: false, errors: failures } : { ok: true, config: parsed.data };
}

// ── Startowe kalkulatory (brief 5.4: ILE, LTV) ────────────────────────────

export const STARTER_CALCULATORS: CalculatorConfig[] = [
  {
    slug: "ile-pod-nieruchomosc",
    track: "pozyczkobiorca",
    title: "Ile Twoja firma może uzyskać pod nieruchomość?",
    intro:
      "Wpisz orientacyjną wartość nieruchomości i obecne obciążenia hipoteczne. Pokażemy maksymalną kwotę przy bezpiecznym LTV, a pełne wyliczenie wyślemy mailem.",
    fields: [
      {
        id: "wartosc",
        label: "Wartość nieruchomości",
        type: "pln",
        min: 100000,
        max: 50000000,
        default: 1000000,
      },
      {
        id: "obciazenia",
        label: "Obecne obciążenia hipoteczne",
        type: "pln",
        min: 0,
        max: 50000000,
        default: 0,
      },
    ],
    outputs: [
      {
        id: "max_kwota",
        label: "Maksymalna kwota pożyczki",
        fn: "max_loan_at_ltv",
        args: ["wartosc", "obciazenia", LTV_MAX],
        format: "pln",
        teaser: true,
      },
      {
        id: "kwota_ostrozna",
        label: "Kwota przy ostrożnym LTV 50%",
        fn: "max_loan_at_ltv",
        args: ["wartosc", "obciazenia", 50],
        format: "pln",
        teaser: false,
      },
      {
        id: "ltv_ostrozne",
        label: "LTV przy kwocie ostrożnej",
        fn: "ltv_percent",
        args: ["kwota_ostrozna", "wartosc", "obciazenia"],
        format: "percent",
        teaser: false,
      },
    ],
    assumptions: [
      `Maksymalne LTV ${LTV_MAX}% wartości nieruchomości po odjęciu obecnych obciążeń.`,
      "Wartość nieruchomości jest orientacyjna — ostateczną określa wycena.",
      "Finansowanie wyłącznie dla przedsiębiorców, na cel związany z działalnością gospodarczą.",
      "Decyzja o finansowaniu należy do finansujących.",
    ],
    tests: [
      {
        inputs: { wartosc: 1000000, obciazenia: 100000 },
        expect: { max_kwota: 500000, kwota_ostrozna: 400000, ltv_ostrozne: 50 },
      },
    ],
  },
  {
    slug: "bufor-ltv-inwestora",
    track: "inwestor",
    title: "Jaki bufor bezpieczeństwa daje zabezpieczenie?",
    intro:
      "Sprawdź LTV pożyczki i o ile może spaść wartość nieruchomości, zanim dług przekroczy zabezpieczenie. Pełny raport z założeniami wyślemy mailem.",
    fields: [
      {
        id: "kwota",
        label: "Kwota pożyczki",
        type: "pln",
        min: 10000,
        max: 20000000,
        default: 300000,
      },
      {
        id: "wartosc",
        label: "Wartość nieruchomości",
        type: "pln",
        min: 50000,
        max: 50000000,
        default: 1000000,
      },
      {
        id: "obciazenia",
        label: "Wcześniejsze hipoteki",
        type: "pln",
        min: 0,
        max: 50000000,
        default: 0,
      },
    ],
    outputs: [
      {
        id: "ltv",
        label: "LTV",
        fn: "ltv_percent",
        args: ["kwota", "wartosc", "obciazenia"],
        format: "percent",
        teaser: true,
      },
      {
        id: "bufor",
        label: "Bufor bezpieczeństwa",
        fn: "ltv_buffer_percent",
        args: ["kwota", "wartosc", "obciazenia"],
        format: "percent",
        teaser: false,
      },
    ],
    assumptions: [
      "LTV liczone z wcześniejszymi hipotekami (wyższe miejsce w kolejności = mniejsze ryzyko).",
      "Bufor nie uwzględnia kosztów egzekucji i czasu sprzedaży — realny zapas jest mniejszy.",
      "Inwestowanie wiąże się z ryzykiem, w tym utraty części lub całości kapitału.",
    ],
    tests: [
      {
        inputs: { kwota: 300000, wartosc: 1000000, obciazenia: 100000 },
        expect: { ltv: 40, bufor: 60 },
      },
    ],
  },
];
