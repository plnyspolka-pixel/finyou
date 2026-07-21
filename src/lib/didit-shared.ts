// Współdzielone stałe Didit — bezpieczne dla klienta (bez importów node:*).
// Używane zarówno przez server (didit.server.ts), jak i komponenty UI.

export type DiditWorkflowKind = "kyc" | "kyb";

export type DiditStatusTone = "green" | "amber" | "red" | "blue" | "muted";

// Statusy sesji Didit → etykiety PL.
export const DIDIT_STATUS_LABELS: Record<string, string> = {
  "Not Started": "Nie rozpoczęto",
  "In Progress": "W trakcie",
  "In Review": "W przeglądzie",
  Approved: "Zatwierdzona",
  Declined: "Odrzucona",
  Expired: "Wygasła",
  Abandoned: "Porzucona",
  "Kyc Expired": "KYC wygasło",
  Resubmitted: "Ponownie przesłana",
  "Awaiting User": "Oczekuje na użytkownika",
};

export function diditStatusLabel(status: string): string {
  return DIDIT_STATUS_LABELS[status] ?? status;
}

export function diditStatusTone(status: string): DiditStatusTone {
  switch (status) {
    case "Approved":
      return "green";
    case "Declined":
    case "Expired":
    case "Kyc Expired":
      return "red";
    case "In Review":
    case "Awaiting User":
      return "amber";
    case "In Progress":
    case "Resubmitted":
      return "blue";
    default:
      return "muted";
  }
}
