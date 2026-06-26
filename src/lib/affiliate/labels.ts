// Polskie etykiety i kolory statusów dla UI programu pośredników.

export const settlementTypeLabels: Record<string, string> = {
  b2b: "B2B (faktura)",
  unregistered_activity: "Działalność nierejestrowana",
};

export const partnerStatusLabels: Record<string, string> = {
  pending_approval: "Oczekuje na akceptację",
  active: "Aktywny",
  suspended: "Zawieszony",
  rejected: "Odrzucony",
  missing_billing_data: "Braki rozliczeniowe",
  requires_accounting_review: "Wymaga weryfikacji księgowej",
  requires_business_registration: "Wymaga rejestracji działalności",
  terminated: "Zakończony",
};

export const partnerStatusColors: Record<string, string> = {
  pending_approval: "bg-amber-100 text-amber-800",
  active: "bg-emerald-100 text-emerald-800",
  suspended: "bg-orange-100 text-orange-800",
  rejected: "bg-rose-100 text-rose-800",
  missing_billing_data: "bg-amber-100 text-amber-800",
  requires_accounting_review: "bg-amber-100 text-amber-800",
  requires_business_registration: "bg-orange-100 text-orange-800",
  terminated: "bg-slate-200 text-slate-700",
};

export const eventTypeLabels: Record<string, string> = {
  investor_account_paid: "Opłacone konto inwestora",
  broker_account_paid: "Opłacone konto pośrednika",
  client_funds_disbursed: "Wypłata środków klientowi",
};

export const eventStatusLabels: Record<string, string> = {
  pending: "Oczekuje",
  confirmed: "Potwierdzone",
  refund_window: "Okres bezpieczeństwa",
  eligible: "Kwalifikowane",
  cancelled: "Anulowane",
  refunded: "Zwrócone",
  chargeback: "Chargeback",
  fraud: "Nadużycie",
  manually_blocked: "Zablokowane ręcznie",
};

export const commissionStatusLabels: Record<string, string> = {
  calculated: "Naliczona",
  pending_admin_approval: "Do zatwierdzenia",
  approved: "Zatwierdzona",
  blocked: "Zablokowana",
  requires_invoice: "Wymaga faktury",
  requires_unregistered_activity_statement: "Wymaga oświadczenia",
  requires_business_registration: "Wymaga rejestracji działalności",
  payable: "Do wypłaty",
  paid: "Wypłacona",
  cancelled: "Anulowana",
  clawback: "Korekta (zwrot)",
};

export const commissionStatusColors: Record<string, string> = {
  calculated: "bg-slate-100 text-slate-700",
  pending_admin_approval: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  blocked: "bg-rose-100 text-rose-800",
  requires_invoice: "bg-amber-100 text-amber-800",
  requires_unregistered_activity_statement: "bg-amber-100 text-amber-800",
  requires_business_registration: "bg-orange-100 text-orange-800",
  payable: "bg-indigo-100 text-indigo-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-600",
  clawback: "bg-rose-100 text-rose-800",
};

export const basisTypeLabels: Record<string, string> = {
  fixed_amount: "Kwota stała",
  percent_of_net_revenue: "% przychodu netto",
  percent_of_gross_payment: "% płatności brutto",
  percent_of_loan_amount: "% kwoty pożyczki",
  percent_of_finance_you_fee: "% wynagrodzenia Finance You",
  manual: "Ręczna",
};

export const payoutBatchStatusLabels: Record<string, string> = {
  draft: "Szkic",
  approved: "Zatwierdzona",
  processing: "W realizacji",
  paid: "Wypłacona",
  cancelled: "Anulowana",
};
