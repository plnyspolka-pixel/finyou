/* eslint-disable @typescript-eslint/no-explicit-any */
// Dane Finance You sp. z o.o. jako Pożyczkodawcy — z src/lib/company.ts.
import { COMPANY_DATA } from "@/lib/company";

export const FINANCE_YOU = {
  nip: COMPANY_DATA.nip,
  krs: COMPANY_DATA.krs,
  /** Rachunek do spłaty pożyczek udzielanych przez Finance You (§ 2 — spłata). */
  rachunekSplaty: COMPANY_DATA.bank.repayment,
  /** Rachunek na Prowizję Klientowską potrącaną z wypłaty (Zał. 6 / Zał. 4). */
  rachunekProwizji: COMPANY_DATA.bank.commission,
} as const;

/** Czy strona to Finance You (po NIP albo KRS). */
export function jestFinanceYou(strona: any): boolean {
  const nip = String(strona?.nip ?? "").replace(/\D/g, "");
  const krs = String(strona?.krs ?? "").replace(/\D/g, "");
  return nip === FINANCE_YOU.nip || krs === FINANCE_YOU.krs;
}
