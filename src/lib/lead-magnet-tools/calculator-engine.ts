/**
 * Silnik kalkulatorów-lead-magnetów (brief 5.4 p. 2).
 *
 * Kalkulator to KONFIGURACJA (JSON: pola, walidacja, wyniki), a nie kod.
 * Wyniki liczą się wyłącznie funkcjami z białej listy `FORMULAS`, opartymi
 * na zweryfikowanych funkcjach systemu (`contract-engine/fees.ts`,
 * `loan-math.ts` — te same co MCP `calculate_ltv` / `calculate_loan_installment`).
 * Agent może tworzyć nowe konfiguracje, ale nie może wprowadzić nowej formuły
 * ani wykonać dowolnego kodu w runtime — `validateCalculatorConfig` to egzekwuje.
 *
 * Cel lead magnetu = zapis na listę: wyniki `teaser` są widoczne od razu,
 * pełny wynik (raport PDF z obliczeniami) idzie mailem po zapisie.
 */
import { z } from "zod";
import { LTV_MAX, ltvPercent, maxLoanAtLtv } from "@/lib/contract-engine/fees";
import { monthlyPayment } from "@/lib/loan-math";

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Biała lista formuł. Argumenty to liczby (wartości pól lub wcześniejszych wyników). */
export const FORMULAS = {
  /** Maks. kwota pod nieruchomość przy limicie LTV (domyślnie 60%). */
  maxLoanAtLtv: (value: number, encumbrances = 0, limit = LTV_MAX) =>
    maxLoanAtLtv(value, encumbrances, limit),
  /** LTV w % (kwota + obciążenia) / wartość. */
  ltvPercent: (amount: number, value: number, encumbrances = 0) =>
    ltvPercent(amount, value, encumbrances) ?? NaN,
  /** Bufor bezpieczeństwa w %: o ile może spaść wartość, zanim dług przewyższy zabezpieczenie. */
  safetyBufferPct: (value: number, debt: number) =>
    value > 0 ? round2(Math.max(0, (1 - debt / value) * 100)) : NaN,
  /** Rata annuitetowa (nominalna) dla stopy podanej przez UŻYTKOWNIKA. */
  monthlyPayment: (amount: number, annualRatePercent: number, months: number) =>
    round2(monthlyPayment(amount, annualRatePercent, months)),
  /** Suma rat. */
  totalRepayment: (installment: number, months: number) => round2(installment * months),
  /** Suma dwóch kwot (np. całe zadłużenie = pożyczka + wcześniejsze hipoteki). */
  sum: (a: number, b = 0) => round2(a + b),
  /** Kwota pomniejszona o wartość (np. wolna wartość nieruchomości). */
  subtract: (a: number, b: number) => round2(a - b),
} as const satisfies Record<string, (...args: number[]) => number>;

export type FormulaName = keyof typeof FORMULAS;

const fieldSchema = z.object({
  id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  label: z.string().min(2),
  type: z.enum(["money", "percent", "months", "number"]),
  min: z.number().optional(),
  max: z.number().optional(),
  required: z.boolean().default(true),
  default: z.number().optional(),
  help: z.string().optional(),
});

const outputSchema = z.object({
  id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  label: z.string().min(2),
  fn: z.enum(Object.keys(FORMULAS) as [FormulaName, ...FormulaName[]]),
  /** Nazwy pól / wcześniejszych wyników albo stałe liczbowe. */
  args: z.array(z.union([z.string(), z.number()])).max(4),
  format: z.enum(["money", "percent", "months", "number"]),
  /** Widoczny przed zapisem na listę. */
  teaser: z.boolean().default(false),
  explain: z.string().optional(),
});

export const calculatorConfigSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,60}$/),
  version: z.number().int().min(1),
  track: z.enum(["pozyczkobiorca", "inwestor"]),
  keyword: z.string().regex(/^[A-ZĄĆĘŁŃÓŚŹŻ0-9]{2,20}$/u),
  title: z.string().min(5),
  promise: z.string().min(10),
  fields: z.array(fieldSchema).min(1).max(8),
  outputs: z.array(outputSchema).min(1).max(8),
  /** Założenia pokazywane jawnie przy wyniku (brief: bez obietnic, założenia jawne). */
  assumptions: z.array(z.string().min(5)).min(1),
  disclaimer: z.string().min(20),
  testCases: z
    .array(
      z.object({
        input: z.record(z.number()),
        expect: z.record(z.number()),
      }),
    )
    .min(1),
});

export type CalculatorConfig = z.infer<typeof calculatorConfigSchema>;

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Walidacja konfiguracji: schemat, referencje argumentów, przypadki testowe. */
export function validateCalculatorConfig(raw: unknown): {
  ok: boolean;
  config?: CalculatorConfig;
  issues: ValidationIssue[];
} {
  const parsed = calculatorConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }
  const cfg = parsed.data;
  const issues: ValidationIssue[] = [];
  const known = new Set(cfg.fields.map((f) => f.id));
  cfg.outputs.forEach((o, i) => {
    for (const a of o.args) {
      if (typeof a === "string" && !known.has(a)) {
        issues.push({ path: `outputs.${i}.args`, message: `Nieznany argument „${a}”.` });
      }
    }
    if (known.has(o.id))
      issues.push({ path: `outputs.${i}.id`, message: `Duplikat id „${o.id}”.` });
    known.add(o.id);
  });
  if (!cfg.outputs.some((o) => o.teaser)) {
    issues.push({
      path: "outputs",
      message: "Co najmniej jeden wynik musi być widoczny przed zapisem (teaser).",
    });
  }
  if (issues.length === 0) {
    cfg.testCases.forEach((tc, i) => {
      const r = evaluateCalculator(cfg, tc.input);
      if (!r.ok) {
        issues.push({ path: `testCases.${i}`, message: r.errors.join("; ") });
        return;
      }
      for (const [k, v] of Object.entries(tc.expect)) {
        const got = r.values[k];
        if (got == null || Math.abs(got - v) > 0.01) {
          issues.push({ path: `testCases.${i}.${k}`, message: `Oczekiwano ${v}, wyszło ${got}.` });
        }
      }
    });
  }
  return { ok: issues.length === 0, config: cfg, issues };
}

export interface CalculatorResult {
  ok: boolean;
  errors: string[];
  values: Record<string, number>;
  /** Wyniki do pokazania od razu (przed zapisem). */
  teaser: Array<{ id: string; label: string; value: number; format: string }>;
  /** Pełny wynik (po zapisie: mail + PDF). */
  full: Array<{ id: string; label: string; value: number; format: string; explain?: string }>;
}

export function evaluateCalculator(
  cfg: CalculatorConfig,
  input: Record<string, number | null | undefined>,
): CalculatorResult {
  const errors: string[] = [];
  const values: Record<string, number> = {};
  for (const f of cfg.fields) {
    const raw = input[f.id] ?? f.default;
    if (raw == null || Number.isNaN(Number(raw))) {
      if (f.required) errors.push(`Uzupełnij: ${f.label}.`);
      else values[f.id] = 0;
      continue;
    }
    const v = Number(raw);
    if (f.min != null && v < f.min) errors.push(`${f.label}: minimum ${f.min}.`);
    if (f.max != null && v > f.max) errors.push(`${f.label}: maksimum ${f.max}.`);
    values[f.id] = v;
  }
  if (errors.length) return { ok: false, errors, values, teaser: [], full: [] };

  const full: CalculatorResult["full"] = [];
  for (const o of cfg.outputs) {
    const args = o.args.map((a) => (typeof a === "number" ? a : values[a]));
    const fn = FORMULAS[o.fn] as (...a: number[]) => number;
    const value = fn(...args);
    if (!Number.isFinite(value)) {
      errors.push(`Nie da się policzyć: ${o.label}.`);
      continue;
    }
    values[o.id] = value;
    full.push({ id: o.id, label: o.label, value, format: o.format, explain: o.explain });
  }
  const teaserIds = new Set(cfg.outputs.filter((o) => o.teaser).map((o) => o.id));
  return {
    ok: errors.length === 0,
    errors,
    values,
    teaser: full.filter((r) => teaserIds.has(r.id)).map(({ explain: _e, ...r }) => r),
    full,
  };
}

export function formatCalculatorValue(value: number, format: string): string {
  switch (format) {
    case "money":
      return `${Math.round(value).toLocaleString("pl-PL")} zł`;
    case "percent":
      return `${value.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%`;
    case "months":
      return `${Math.round(value)} mies.`;
    default:
      return value.toLocaleString("pl-PL", { maximumFractionDigits: 2 });
  }
}
