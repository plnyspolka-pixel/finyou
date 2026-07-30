// Generatory dokumentów: wniosek, umowa, harmonogram (zał. 1),
// protokół negocjacji (zał. 2). Wszystko jako tekst — proste do skopiowania,
// pobrania jako .txt albo wydruku.

import type { ClientProfile, ScheduleData } from "./client-profile-types";
import {
  borrowerTypeLabels,
  propertyTypeLabels,
  idDocumentTypeLabels,
} from "./client-profile-types";
import {
  borrowerDisplayName,
  formatDate,
  formatPLN,
  recommendSecurity,
} from "./client-profile-math";

function line(label: string, value: string | number | undefined | null): string {
  return `${label}: ${value === undefined || value === null || value === "" ? "—" : value}`;
}

function header(t: string) {
  return `\n${t}\n${"─".repeat(t.length)}\n`;
}

export function generateApplicationDoc(p: ClientProfile): string {
  const b = p.borrowerData;
  return [
    `WNIOSEK O UDZIELENIE POŻYCZKI ZABEZPIECZONEJ HIPOTEKĄ`,
    `Data sporządzenia: ${new Date().toLocaleDateString("pl-PL")}`,
    header("Dane pożyczkobiorcy"),
    line("Typ pożyczkobiorcy", borrowerTypeLabels[p.borrowerType]),
    line("Imię i nazwisko / nazwa", borrowerDisplayName(p)),
    line("NIP", b.nip),
    line("REGON", b.regon),
    line("KRS", b.krs),
    line("PESEL", b.pesel),
    line("Adres", b.businessAddress || b.registeredAddress),
    line("Telefon", b.phone),
    line("E-mail", b.email),
    header("Cel pożyczki"),
    b.loanPurpose || "—",
    header("Warunki finansowe wnioskowane"),
    line("Kwota wypłacana klientowi", formatPLN(p.offerData.netAmountToClient)),
    line("Okres", p.offerData.loanTermMonths ? `${p.offerData.loanTermMonths} mies.` : "—"),
    line(
      "Maksymalna miesięczna rata akceptowana przez klienta",
      formatPLN(p.offerData.maxMonthlyPaymentByClient),
    ),
    line("Planowana data wypłaty", formatDate(p.offerData.payoutDate)),
    header("Nieruchomość zabezpieczająca"),
    line("Typ", p.propertyData.type ? propertyTypeLabels[p.propertyData.type] : undefined),
    line("Numer KW", p.propertyData.landRegisterNumber),
    line("Adres", p.propertyData.address),
    line("Szacunkowa wartość", formatPLN(p.propertyData.estimatedValue)),
    line("Istniejąca hipoteka", p.propertyData.hasExistingMortgage ? "TAK" : "NIE"),
    line("Kwota istniejącego zadłużenia", formatPLN(p.propertyData.existingDebtAmount)),
  ].join("\n");
}

export function generateContractDoc(p: ClientProfile, schedule: ScheduleData | null): string {
  const b = p.borrowerData;
  const inv = p.investorData;
  const sec = p.securityData;
  const o = p.offerData;
  const rep = p.representativeData;
  const firstInstallment = schedule?.rows[0];
  const lastDate = schedule?.rows[schedule.rows.length - 1]?.date;

  return [
    `UMOWA POŻYCZKI`,
    `Zawarta w dniu ${formatDate(o.agreementDate)} pomiędzy:`,
    ``,
    `POŻYCZKODAWCĄ:`,
    line("  Imię i nazwisko / nazwa", inv.fullName || inv.companyName),
    line("  NIP", inv.nip),
    line("  Adres", inv.address),
    line("  Rachunek do spłat", inv.bankAccount),
    ``,
    `POŻYCZKOBIORCĄ:`,
    line("  Typ", borrowerTypeLabels[p.borrowerType]),
    line("  Nazwa / imię i nazwisko", borrowerDisplayName(p)),
    line("  NIP", b.nip),
    line("  REGON", b.regon),
    line("  KRS", b.krs),
    line("  Adres", b.businessAddress || b.registeredAddress),
    p.borrowerType !== "JDG"
      ? `\n  Reprezentowanym przez:\n${line("    Imię i nazwisko", `${rep?.firstName ?? ""} ${rep?.lastName ?? ""}`.trim())}\n${line("    Funkcja", rep?.role)}\n${line("    Dokument tożsamości", `${rep?.idDocument?.type ? idDocumentTypeLabels[rep.idDocument.type] : ""} ${rep?.idDocument?.number ?? ""}`.trim())}`
      : "",

    header("§ 1. Przedmiot umowy"),
    `Pożyczkodawca udziela Pożyczkobiorcy pożyczki na warunkach określonych w niniejszej umowie. Pożyczka jest udzielana w związku z prowadzoną przez Pożyczkobiorcę działalnością gospodarczą i nie ma charakteru konsumenckiego.`,

    header("§ 2. Warunki finansowe"),
    line(
      "Kwota Pożyczki (pełna wypłata)",
      formatPLN(schedule?.nominalLoanAmount ?? o.netAmountToClient ?? 0),
    ),
    line("Prowizja (rozłożona na raty)", formatPLN(o.creditedCommission)),
    line("Oprocentowanie roczne", `${o.annualInterestPercent ?? 0}%`),
    line("Prowizja miesięcznie", formatPLN(schedule?.monthlyCommissionAmount)),
    line("Maksymalna miesięczna rata bieżąca", formatPLN(o.maxMonthlyPaymentByClient)),
    line("Rata balonowa", formatPLN(schedule?.balloonPayment)),
    line("Całkowita kwota zobowiązań Pożyczkobiorcy", formatPLN(schedule?.totalClientObligation)),
    line("Data wypłaty", formatDate(o.payoutDate)),
    line("Data pierwszej raty", formatDate(firstInstallment?.date)),
    line("Data końcowa umowy", formatDate(lastDate)),
    line("Rachunek do spłat", inv.bankAccount),
    ``,
    `Pożyczkobiorca otrzymuje pełną Kwotę Pożyczki. Prowizja nie jest potrącana z wypłaty — jest wymagalna w dniu zawarcia Umowy, a jej rozłożenie na raty stanowi wyłącznie ułatwienie płatnicze. Odsetki naliczane są od kapitału pozostającego do spłaty. Harmonogram stanowi załącznik nr 1 do Umowy.`,

    header("§ 3. Zabezpieczenia"),
    line("Numer KW", p.propertyData.landRegisterNumber),
    line("Adres nieruchomości", p.propertyData.address),
    line("Kwota hipoteki", formatPLN(sec.mortgageAmount)),
    line("Kwota art. 777 § 1 pkt 5 k.p.c.", formatPLN(sec.art777Amount)),
    line("Termin nadania klauzuli wykonalności (art. 777)", formatDate(sec.art777ClauseDeadline)),

    header("§ 4. Oświadczenia Pożyczkobiorcy"),
    `Pożyczkobiorca oświadcza, że:`,
    `1) działa jako przedsiębiorca,`,
    `2) zawiera umowę w związku z prowadzoną działalnością gospodarczą lub zawodową,`,
    `3) pożyczka nie ma charakteru konsumenckiego,`,
    `4) dane podane we wniosku są prawdziwe i kompletne,`,
    `5) zapoznał się z treścią umowy,`,
    `6) rozumie zasady spłaty,`,
    `7) akceptuje harmonogram spłat stanowiący załącznik nr 1,`,
    `8) wie, że prowizja nie jest potrącana z wypłaty i jest rozłożona na raty jako ułatwienie płatnicze,`,
    `9) wie, że część zobowiązania może być płatna w racie balonowej,`,
    `10) wyraża zgodę na ustanowienie zabezpieczeń wskazanych w umowie,`,
    `11) rozumie skutki poddania się egzekucji w trybie art. 777 § 1 pkt 5 k.p.c.`,

    header("§ 5. Postanowienia końcowe"),
    `Wszelkie zmiany niniejszej umowy wymagają formy pisemnej pod rygorem nieważności. W sprawach nieuregulowanych mają zastosowanie przepisy Kodeksu cywilnego.`,
    ``,
    `..................................          ..................................`,
    `       Pożyczkodawca                                Pożyczkobiorca`,
  ].join("\n");
}

export function generateScheduleDoc(p: ClientProfile, schedule: ScheduleData | null): string {
  if (!schedule)
    return "Załącznik nr 1 — Harmonogram spłat\n\nBrak danych do wygenerowania harmonogramu.";
  const head = `Załącznik nr 1 do umowy pożyczki — HARMONOGRAM SPŁAT\nPożyczkobiorca: ${borrowerDisplayName(p)}\nKwota Pożyczki: ${formatPLN(schedule.nominalLoanAmount)}\nOprocentowanie roczne: ${p.offerData.annualInterestPercent ?? 0}%\nProwizja miesięcznie: ${schedule.monthlyCommissionPercent.toFixed(4)}%\n`;
  const cols = [
    "Lp.",
    "Data raty",
    "Kwota raty",
    "Kapitał",
    "Odsetki",
    "Prowizja",
    "Kapitał pozostały",
  ];
  const lines = [cols.join("\t")];
  for (const r of schedule.rows) {
    lines.push(
      [
        String(r.index),
        formatDate(r.date),
        formatPLN(r.paymentAmount),
        formatPLN(r.capital),
        formatPLN(r.interest),
        formatPLN(r.commission),
        formatPLN(r.remainingCapital),
      ].join("\t"),
    );
  }
  return `${head}\n${lines.join("\n")}`;
}

export function generateProtocolDoc(p: ClientProfile, schedule: ScheduleData | null): string {
  const o = p.offerData;
  const sec = recommendSecurity(schedule, o);
  return [
    `Załącznik nr 2 do umowy pożyczki — PROTOKÓŁ NEGOCJACJI`,
    `Strony oświadczają, że indywidualnie negocjowane były następujące warunki:`,
    ``,
    line("Kwota wypłacana klientowi", formatPLN(o.netAmountToClient)),
    line("Maksymalna miesięczna rata klienta", formatPLN(o.maxMonthlyPaymentByClient)),
    line("Okres pożyczki", o.loanTermMonths ? `${o.loanTermMonths} mies.` : "—"),
    line("Prowizja (rozłożona na raty)", formatPLN(o.creditedCommission)),
    line(
      "Wynagrodzenie inwestora (miesięcznie)",
      formatPLN(schedule?.expectedMonthlyInvestorReturn),
    ),
    line("Oprocentowanie roczne", `${o.annualInterestPercent ?? 0}%`),
    line("Prowizja miesięcznie", formatPLN(schedule?.monthlyCommissionAmount)),
    line("Rata balonowa", formatPLN(schedule?.balloonPayment)),
    line("Zabezpieczenia — hipoteka", formatPLN(p.securityData.mortgageAmount)),
    line("Zabezpieczenia — art. 777 k.p.c.", formatPLN(p.securityData.art777Amount)),
    line("Rekomendowana data końcowa art. 777", formatDate(sec?.recommended777Deadline)),
    line("Data wypłaty", formatDate(o.payoutDate)),
    line(
      "Sposób wypłaty środków",
      p.investorData.bankAccount ? `Przelew na rachunek ${p.investorData.bankAccount}` : "—",
    ),
    ``,
    `..................................          ..................................`,
    `       Pożyczkodawca                                Pożyczkobiorca`,
  ].join("\n");
}

export function generateAllDocs(p: ClientProfile, schedule: ScheduleData | null): string {
  const sep = `\n\n${"=".repeat(72)}\n\n`;
  return [
    generateApplicationDoc(p),
    generateContractDoc(p, schedule),
    generateScheduleDoc(p, schedule),
    generateProtocolDoc(p, schedule),
  ].join(sep);
}
