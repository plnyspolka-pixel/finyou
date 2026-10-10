/* eslint-disable @typescript-eslint/no-explicit-any */
// Dane Finance You sp. z o.o. jako Pożyczkodawcy — z src/lib/company.ts.
import { COMPANY_DATA } from "@/lib/company";

export const FINANCE_YOU = {
  nip: COMPANY_DATA.nip,
  krs: COMPANY_DATA.krs,
  /** Jedyny rachunek Finance You — spłaty pożyczek FY (§ 2) i prowizja. */
  rachunek: COMPANY_DATA.bankAccount,
  /** Rachunek do spłaty pożyczek udzielanych przez Finance You (§ 2 — spłata). */
  rachunekSplaty: COMPANY_DATA.bankAccount,
  /** Rachunek na Prowizję od Pożyczkobiorcy potrącaną z wypłaty (§ 2 umowy pożyczki, KWO_03e). */
  rachunekProwizji: COMPANY_DATA.bankAccount,
} as const;

/** Czy strona to Finance You (po NIP albo KRS). */
export function jestFinanceYou(strona: any): boolean {
  const nip = String(strona?.nip ?? "").replace(/\D/g, "");
  const krs = String(strona?.krs ?? "").replace(/\D/g, "");
  return nip === FINANCE_YOU.nip || krs === FINANCE_YOU.krs;
}
