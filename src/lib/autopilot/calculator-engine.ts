// Silnik kalkulatorów-lead-magnetów (brief 5.4 p.2): narzędzie budowane
// z KONFIGURACJI (JSON: pola, walidacja, wyniki), a obliczenia wyłącznie
// z biblioteki zweryfikowanych funkcji systemu (fees.ts, loan-math.ts).
// Agent tworzy nowe narzędzia, pisząc konfigurację – nigdy kod w runtime.
//
// Część wyników jest widoczna od razu, reszta (`gated: true`) dopiero po
// zapisie na listę (pełny raport mailem) – cel nadrzędny: opt-in.
// Czysty moduł – bez I/O.
import { z } from "zod";
import {
  LTV_MAX,
  fyCommission,
  kwotaNaReke,
  ltvPercent,
  maxLoanAtLtv,
} from "@/lib/contract-engine/fees";
import { monthlyPayment } from "@/lib/loan-math";
import { TRACKS } from "./types";

// ── biblioteka funkcji (whitelist) ───────────────────────────────────────────

type Num = number;
type Inputs = Record<string, Num | string>;
type Outputs = Record<string, Num | string | null>;

function n(v: Num | string | undefined): number {
  return typeof v === "number" ? v : Number(v);
}

export const CALCULATOR_FUNCTIONS = {
  /** LTV i bufor bezpieczeństwa do limitu systemu. */
  ltv_buffer(i: Inputs): Outputs {
    const value = n(i.property_value);
    const loan = n(i.loan_amount);
    const enc = n(i.encumbrances ?? 0);
    const ltv = ltvPercent(loan, value, enc);
    const maxLoan = maxLoanAtLtv(value, enc, LTV_MAX);
    return {
      ltv_pct: ltv,
      limit_pct: LTV_MAX,
      buffer_pct: ltv == null ? null : Math.round((LTV_MAX - ltv) * 100) / 100,
      max_loan_pln: maxLoan,
      // Spadek wartości, który „zjada” bufor do 100% LTV.
      value_drop_to_100_pct:
        ltv == null || ltv <= 0 ? null : Math.round((1 - ltv / 100) * 10000) / 100,
    };
  },
  /** Ile można uzyskać pod nieruchomość (orientacyjnie, przy limicie LTV). */
  max_amount(i: Inputs): Outputs {
    const value = n(i.property_value);
    const enc = n(i.encumbrances ?? 0);
    const max = maxLoanAtLtv(value, enc, LTV_MAX);
    return {
      max_loan_pln: max,
      fy_fee_pln: max > 0 ? fyCommission(max) : 0,
      net_pln: kwotaNaReke(max),
      limit_pct: LTV_MAX,
    };
  },
  /** Rata annuitetowa przy założonym oprocentowaniu (założenie widza, nie oferta). */
  installment(i: Inputs): Outputs {
    const amount = n(i.loan_amount);
    const months = n(i.months);
    const rate = n(i.annual_rate_pct);
    const pay = monthlyPayment(amount, rate, months);
    const total = pay * months;
    return {
      monthly_pln: Math.round(pay * 100) / 100,
      total_pln: Math.round(total * 100) / 100,
      interest_pln: Math.round((total - amount) * 100) / 100,
      fy_fee_pln: amount > 0 ? fyCommission(amount) : 0,
    };
  },
} as const;

export type CalculatorFunctionId = keyof typeof CALCULATOR_FUNCTIONS;
const FUNCTION_IDS = Object.keys(CALCULATOR_FUNCTIONS) as [
  CalculatorFunctionId,
  ...CalculatorFunctionId[],
];

// ── konfiguracja ─────────────────────────────────────────────────────────────

const fieldSchema = z.object({
  key: z.string().regex(/^[a-z_]+$/),
  label: z.string().min(2),
  type: z.enum(["number", "select"]),
  unit: z.enum(["pln", "pct", "months"]).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  default: z.union([z.number(), z.string()]).optional(),
  required: z.boolean().default(true),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  help: z.string().optional(),
});

const outputSchema = z.object({
  key: z.string().regex(/^[a-z_0-9]+$/),
  label: z.string().min(2),
  format: z.enum(["pln", "pct", "months", "number"]),
  /** Widoczne po zapisie na listę (pełny wynik w mailu / PDF). */
  gated: z.boolean().default(false),
});

export const calculatorConfigSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  track: z.enum(TRACKS),
  keyword: z.string().min(2).max(20),
  title: z.string().min(5),
  promise: z.string().min(10),
  fn: z.enum(FUNCTION_IDS),
  fields: z.array(fieldSchema).min(1).max(8),
  outputs: z.array(outputSchema).min(1).max(10),
  /** Założenia pokazywane jawnie przy wyniku (brief: bez obietnicy zysku). */
  assumptions: z.array(z.string().min(5)).min(1),
  /** Przypadki testowe sprawdzane przed publikacją (kontrola jakości). */
  testCases: z
    .array(
      z.object({
        input: z.record(z.string(), z.union([z.number(), z.string()])),
        expect: z.record(z.string(), z.number()),
      }),
    )
    .min(1),
});
export type CalculatorConfig = z.infer<typeof calculatorConfigSchema>;

export interface CalculatorRun {
  ok: boolean;
  errors: Record<string, string>;
  visible: Array<{ key: string; label: string; value: string }>;
  gated: Array<{ key: string; label: string; value: string }>;
  raw: Outputs;
}

const PLN = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 });
const PCT = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });

export function formatOutput(
  v: Num | string | null,
  format: z.infer<typeof outputSchema>["format"],
): string {
  if (v == null || (typeof v === "number" && !Number.isFinite(v))) return "–";
  if (typeof v === "string") return v;
  switch (format) {
    case "pln":
      return `${PLN.format(Math.round(v))} zł`;
    case "pct":
      return `${PCT.format(v)}%`;
    case "months":
      return `${Math.round(v)} mies.`;
    default:
      return PCT.format(v);
  }
}

export function validateInputs(
  cfg: CalculatorConfig,
  input: Record<string, unknown>,
): {
  values: Inputs;
  errors: Record<string, string>;
} {
  const values: Inputs = {};
  const errors: Record<string, string> = {};
  for (const f of cfg.fields) {
    const raw = input[f.key] ?? f.default;
    if (raw == null || raw === "") {
      if (f.required) errors[f.key] = "Pole wymagane.";
      continue;
    }
    if (f.type === "select") {
      const s = String(raw);
      if (f.options && !f.options.some((o) => o.value === s))
        errors[f.key] = "Nieprawidłowa opcja.";
      else values[f.key] = s;
      continue;
    }
    const num =
      typeof raw === "number" ? raw : Number(String(raw).replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(num)) errors[f.key] = "Podaj liczbę.";
    else if (f.min != null && num < f.min) errors[f.key] = `Minimum ${f.min}.`;
    else if (f.max != null && num > f.max) errors[f.key] = `Maksimum ${f.max}.`;
    else values[f.key] = num;
  }
  return { values, errors };
}

export function runCalculator(
  cfg: CalculatorConfig,
  input: Record<string, unknown>,
  opts: { unlocked?: boolean } = {},
): CalculatorRun {
  const { values, errors } = validateInputs(cfg, input);
  if (Object.keys(errors).length) return { ok: false, errors, visible: [], gated: [], raw: {} };
  const raw = CALCULATOR_FUNCTIONS[cfg.fn](values);
  const visible: CalculatorRun["visible"] = [];
  const gated: CalculatorRun["gated"] = [];
  for (const o of cfg.outputs) {
    const item = { key: o.key, label: o.label, value: formatOutput(raw[o.key] ?? null, o.format) };
    if (o.gated && !opts.unlocked) gated.push({ ...item, value: "🔒 po zapisie" });
    else visible.push(item);
  }
  return { ok: true, errors: {}, visible, gated, raw };
}

/** Kontrola jakości przed publikacją: przypadki testowe + istniejące klucze wyników. */
export function verifyCalculator(cfg: CalculatorConfig): string[] {
  const problems: string[] = [];
  const parsed = calculatorConfigSchema.safeParse(cfg);
  if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  for (const [idx, tc] of cfg.testCases.entries()) {
    const r = runCalculator(cfg, tc.input, { unlocked: true });
    if (!r.ok) {
      problems.push(`test ${idx + 1}: błędy wejścia ${JSON.stringify(r.errors)}`);
      continue;
    }
    for (const [k, want] of Object.entries(tc.expect)) {
      const got = r.raw[k];
      if (typeof got !== "number" || Math.abs(got - want) > Math.max(0.01, Math.abs(want) * 1e-6))
        problems.push(`test ${idx + 1}: ${k} = ${String(got)}, oczekiwano ${want}`);
    }
  }
  for (const o of cfg.outputs) {
    const sample = runCalculator(cfg, cfg.testCases[0].input, { unlocked: true });
    if (!(o.key in sample.raw)) problems.push(`wynik ${o.key} nie istnieje w funkcji ${cfg.fn}`);
  }
  return problems;
}
