// Nasza prowizja doliczana do finansowania, per instytucja.
//
// Reguła NOVINA S.A. (właściciel, 09.09.2026): do finansowania w przedziale
// 50 tys. – 1 mln zł doliczamy prowizję wg skali malejącej od kwoty, nie mniej
// niż 5 000 zł, zaokrągloną W GÓRĘ do pełnych tysięcy (na naszą korzyść).
// Kwota, o którą prosi klient, to wypłata DO RĘKI — prowizja idzie ponad nią i
// podnosi kwotę pożyczki. Koszt notariusza dokłada NOVINA po swojej stronie,
// w kwocie pożyczki powiększonej o koszty — my go nie liczymy.
//
// Progi skali i stawki zmienia się TUTAJ, w jednym miejscu.

export interface CommissionBracket {
  /** Górna granica wypłaty (włącznie) dla tej stawki; null = bez górnej granicy. */
  upTo: number | null;
  percent: number;
}

export interface InstitutionPricingRule {
  /** Dopasowanie po nazwie instytucji z bazy (company_name). */
  match: RegExp;
  label: string;
  /** Zakres wypłaty, w którym reguła obowiązuje. */
  minPayout: number;
  maxPayout: number;
  brackets: CommissionBracket[];
  minCommission: number;
  /** Zaokrąglenie prowizji w górę do wielokrotności tej kwoty. */
  roundCommissionUpTo: number;
  /** Kto dolicza koszt notariusza. */
  notaryBy: "instytucja" | "my";
  note: string;
}

export const INSTITUTION_PRICING_RULES: InstitutionPricingRule[] = [
  {
    match: /novina/i,
    label: "NOVINA S.A.",
    minPayout: 50_000,
    maxPayout: 1_000_000,
    brackets: [
      { upTo: 100_000, percent: 7 },
      { upTo: 500_000, percent: 5 },
      { upTo: null, percent: 3 },
    ],
    minCommission: 5_000,
    roundCommissionUpTo: 1_000,
    notaryBy: "instytucja",
    note: "Prowizja doliczona ponad wypłatę i wpisana w koszty pożyczki. Koszt notariusza dolicza NOVINA w kwocie pożyczki powiększonej o koszty.",
  },
];

export function pricingRuleForInstitution(
  name: string | null | undefined,
): InstitutionPricingRule | null {
  if (!name) return null;
  return INSTITUTION_PRICING_RULES.find((r) => r.match.test(name)) ?? null;
}

export interface CommissionResult {
  ok: boolean;
  /** Zastosowana stawka (%) — null, gdy reguła nie ma zastosowania. */
  percent: number | null;
  /** Prowizja po zaokrągleniu w górę i po minimum. */
  commission: number | null;
  /** Kwota pożyczki: wypłata + nasza prowizja (bez notariusza — dolicza go instytucja). */
  financing: number | null;
  /** Prowizja przed zaokrągleniem — do pokazania „skąd ta kwota". */
  rawCommission: number | null;
  reason: string;
}

/** Prowizja i kwota finansowania dla wypłaty, jakiej oczekuje klient. */
export function commissionFor(
  rule: InstitutionPricingRule,
  payout: number | null | undefined,
): CommissionResult {
  const none = (reason: string): CommissionResult => ({
    ok: false,
    percent: null,
    commission: null,
    financing: null,
    rawCommission: null,
    reason,
  });
  if (payout == null || !Number.isFinite(payout) || payout <= 0)
    return none("Brak kwoty wnioskowanej — nie ma od czego liczyć prowizji.");
  if (payout < rule.minPayout)
    return none(`Kwota poniżej progu reguły (${fmtPln(rule.minPayout)}) — prowizję ustal ręcznie.`);
  if (payout > rule.maxPayout)
    return none(`Kwota powyżej progu reguły (${fmtPln(rule.maxPayout)}) — prowizję ustal ręcznie.`);

  const bracket = rule.brackets.find((b) => b.upTo == null || payout <= b.upTo);
  if (!bracket) return none("Brak stawki dla tej kwoty w skali prowizji.");

  const raw = (payout * bracket.percent) / 100;
  const rounded = Math.ceil(raw / rule.roundCommissionUpTo) * rule.roundCommissionUpTo;
  const commission = Math.max(rounded, rule.minCommission);
  return {
    ok: true,
    percent: bracket.percent,
    commission,
    financing: payout + commission,
    rawCommission: raw,
    // O minimum decyduje kwota PRZED zaokrągleniem — inaczej przypadek, w
    // którym zaokrąglenie samo trafia w 5 000 zł, tłumaczyłby się błędnie.
    reason:
      raw < rule.minCommission
        ? `minimum ${fmtPln(rule.minCommission)} (${bracket.percent}% dałoby ${fmtPln(raw)})`
        : `${bracket.percent}% z ${fmtPln(payout)} = ${fmtPln(raw)}, w górę do pełnego tysiąca`,
  };
}

function fmtPln(v: number): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(v);
}

/** Jednolinijkowe podsumowanie do panelu i do treści maila. */
export function commissionSummary(rule: InstitutionPricingRule, payout: number | null): string {
  const r = commissionFor(rule, payout);
  if (!r.ok) return `${rule.label}: ${r.reason}`;
  const notary =
    rule.notaryBy === "instytucja"
      ? " + koszt notariusza po stronie instytucji"
      : " + koszt notariusza po naszej stronie";
  return (
    `${rule.label}: wypłata ${fmtPln(payout ?? 0)} + prowizja ${fmtPln(r.commission!)} ` +
    `(${r.percent}%) = kwota pożyczki ${fmtPln(r.financing!)}${notary}`
  );
}
