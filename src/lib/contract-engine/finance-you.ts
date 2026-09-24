/* eslint-disable @typescript-eslint/no-explicit-any */
// Dane Finance You sp. z o.o. jako Pożyczkodawcy — jedno miejsce w silniku umów.

export const FINANCE_YOU = {
  nip: "7010611803",
  krs: "0000635207",
  /** Rachunek do spłaty pożyczek udzielanych przez Finance You (§ 2 — spłata). */
  rachunekSplaty: "56 1090 2590 0000 0001 5708 1371",
} as const;

/** Czy strona to Finance You (po NIP albo KRS). */
export function jestFinanceYou(strona: any): boolean {
  const nip = String(strona?.nip ?? "").replace(/\D/g, "");
  const krs = String(strona?.krs ?? "").replace(/\D/g, "");
  return nip === FINANCE_YOU.nip || krs === FINANCE_YOU.krs;
}
