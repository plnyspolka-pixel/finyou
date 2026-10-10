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
  /** Rachunek na Prowizję od Pożyczkobiorcy potrącaną z wypłaty (Zał. 6 / Zał. 4). */
  rachunekProwizji: COMPANY_DATA.bankAccount,
} as const;

/** Tekst bez znaków diakrytycznych, spacji i interpunkcji, małymi literami. */
function uprosc(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]/g, "");
}

/** Czy nazwa strony to Finance You (np. „Finance You sp. z o.o."). */
export function jestFinanceYouNazwa(nazwa: unknown): boolean {
  const n = uprosc(nazwa);
  return n !== "" && n.includes("financeyou");
}

/**
 * Czy strona umowy to Finance You — po NIP, KRS albo nazwie. Nazwa liczy się
 * dlatego, że w kreatorze umowy Pożyczkodawca bywa wpisany samą nazwą
 * (identyfikatory dochodzą później), a od tej odpowiedzi zależy, czy w umowie
 * w ogóle pojawia się Prowizja od Pożyczkobiorcy (pośrednictwo FY).
 */
export function jestFinanceYou(strona: any): boolean {
  const nip = String(strona?.nip ?? "").replace(/\D/g, "");
  const krs = String(strona?.krs ?? "").replace(/\D/g, "");
  if (nip === FINANCE_YOU.nip || krs === FINANCE_YOU.krs) return true;
  return (
    jestFinanceYouNazwa(strona?.nazwa) ||
    jestFinanceYouNazwa(strona?.firma) ||
    jestFinanceYouNazwa(strona?.imie_nazwisko)
  );
}

/**
 * To samo pytanie dla danych inwestora z profilu klienta (`InvestorData`)
 * albo wiersza `investors`: czy Pożyczkodawcą jest sama Finance You.
 * Gdy tak — pożyczki ze środków FY nie obciąża prowizja FY (nie ma
 * pośrednictwa: Finance You nie pobiera prowizji od własnej pożyczki).
 */
export function jestFinanceYouInwestor(inv: any): boolean {
  if (!inv || typeof inv !== "object") return false;
  return jestFinanceYou({
    nip: inv.nip,
    krs: inv.krs,
    nazwa: inv.companyName ?? inv.company_name,
    imie_nazwisko: inv.fullName ?? inv.imie_nazwisko,
  });
}
