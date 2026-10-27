// Automatyczny feedback dla pośrednika — czysta logika (bez bazy).
// Pośrednik dostaje e-mail, gdy inwestor zainteresuje się ofertą jego klienta
// i gdy pożyczka zostanie uruchomiona (wypłacona — przez inwestora albo z
// kapitału Finance You). Inwestorzy w treści są anonimowi.
import { BROKER_COMMISSION_PERCENT_OF_LOAN } from "@/lib/affiliate/engine-pure";

export type BrokerSignalKind = "zainteresowanie" | "propozycja" | "wyplata";

export type BrokerSignal = {
  /** Klucz deduplikacji — ten sam sygnał nigdy nie idzie dwa razy. */
  key: string;
  brokerUserId: string;
  applicationId: string;
  kind: BrokerSignalKind;
  label: string;
  at: string;
};

/** Statusy wysyłki oferty, które oznaczają zainteresowanie inwestora. */
export const INTERESTED_DISTRIBUTION = new Set([
  "odpowiedz_otrzymana",
  "prosba_o_dodatkowe_informacje",
  "oferta_otrzymana",
]);
/** Etapy obiegu Zlecenie–Projekt, w których inwestor chce iść dalej. */
export const INTERESTED_MATCH = new Set(["karta_leada", "rezerwacja", "transakcja"]);
/** Propozycje finansowania złożone przez inwestora. */
export const PROPOSAL_STATUSES = new Set([
  "zlozona",
  "zatwierdzona_przez_administratora",
  "wyslana_do_klienta",
  "zaakceptowana_przez_klienta",
]);

const DIST_LABEL: Record<string, string> = {
  odpowiedz_otrzymana: "Inwestor odpowiedział na ofertę",
  prosba_o_dodatkowe_informacje: "Inwestor prosi o dodatkowe informacje",
  oferta_otrzymana: "Inwestor złożył ofertę",
};
const MATCH_LABEL: Record<string, string> = {
  karta_leada: "Inwestor chce poznać szczegóły oferty",
  rezerwacja: "Inwestor zarezerwował ofertę",
  transakcja: "Inwestor przechodzi do transakcji",
};
const PROPOSAL_LABEL: Record<string, string> = {
  zlozona: "Inwestor złożył propozycję finansowania",
  zatwierdzona_przez_administratora: "Propozycja inwestora zatwierdzona",
  wyslana_do_klienta: "Propozycja inwestora wysłana do klienta",
  zaakceptowana_przez_klienta: "Klient przyjął propozycję inwestora",
};

type App = { id: string; status: string; created_by_partner_user_id: string; updated_at?: string };

export function collectBrokerSignals(input: {
  apps: App[];
  distributions: Array<{
    id: string;
    loan_application_id: string;
    distribution_status: string;
    responded_at?: string | null;
    updated_at?: string | null;
  }>;
  matches: Array<{
    id: string;
    application_id: string;
    status: string;
    updated_at?: string | null;
  }>;
  offers: Array<{
    id: string;
    loan_application_id: string;
    offer_status: string;
    updated_at?: string | null;
  }>;
  since: string;
}): BrokerSignal[] {
  const byId = new Map(input.apps.map((a) => [a.id, a]));
  const out: BrokerSignal[] = [];
  const push = (
    appId: string,
    key: string,
    kind: BrokerSignalKind,
    label: string,
    at: string | null | undefined,
  ) => {
    const app = byId.get(appId);
    if (!app || !at || at < input.since) return;
    out.push({
      key,
      brokerUserId: app.created_by_partner_user_id,
      applicationId: appId,
      kind,
      label,
      at,
    });
  };

  for (const d of input.distributions) {
    if (!INTERESTED_DISTRIBUTION.has(d.distribution_status)) continue;
    push(
      d.loan_application_id,
      `dist:${d.id}:${d.distribution_status}`,
      "zainteresowanie",
      DIST_LABEL[d.distribution_status],
      d.responded_at ?? d.updated_at,
    );
  }
  for (const m of input.matches) {
    if (!INTERESTED_MATCH.has(m.status)) continue;
    push(
      m.application_id,
      `match:${m.id}:${m.status}`,
      "zainteresowanie",
      MATCH_LABEL[m.status],
      m.updated_at,
    );
  }
  for (const o of input.offers) {
    if (!PROPOSAL_STATUSES.has(o.offer_status)) continue;
    push(
      o.loan_application_id,
      `offer:${o.id}:${o.offer_status}`,
      "propozycja",
      PROPOSAL_LABEL[o.offer_status],
      o.updated_at,
    );
  }
  for (const a of input.apps) {
    if (a.status !== "wyplacony") continue;
    push(
      a.id,
      `wyplata:${a.id}`,
      "wyplata",
      "Pożyczka uruchomiona — środki wypłacone klientowi",
      a.updated_at,
    );
  }
  return out;
}

export function formatPct(n: number): string {
  return `${String(n).replace(".", ",")}%`;
}

/** Treść e-maila do pośrednika z listą nowych zdarzeń. */
export function buildBrokerFeedbackEmail(input: {
  baseUrl: string;
  items: Array<{
    signal: BrokerSignal;
    clientName: string;
    loanAmount: number | null;
    commission: number | null;
  }>;
}): { subject: string; text: string } {
  const fmt = (n: number) =>
    new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency: "PLN",
      maximumFractionDigits: 0,
    }).format(n);
  const hasPayout = input.items.some((i) => i.signal.kind === "wyplata");
  const subject = hasPayout
    ? "Pożyczka Twojego klienta uruchomiona — prowizja dla Ciebie | Finance You"
    : "Inwestor zainteresował się ofertą Twojego klienta | Finance You";
  const lines = input.items.map(({ signal, clientName, loanAmount, commission }) => {
    const head = `• ${clientName}${loanAmount ? ` (${fmt(loanAmount)})` : ""}: ${signal.label}.`;
    if (signal.kind === "wyplata" && commission != null) {
      return `${head}\n  Twoja prowizja: ${fmt(commission)} (${formatPct(BROKER_COMMISSION_PERCENT_OF_LOAN)} kwoty pożyczki) — po zatwierdzeniu trafi na Twoje konto do wypłat.`;
    }
    return head;
  });
  const text = `Dzień dobry,

mamy nowe informacje o ofertach Twoich klientów:

${lines.join("\n")}

Szczegóły i pełną historię reakcji inwestorów znajdziesz w panelu pośrednika:
${input.baseUrl}/posrednik/reakcje

Pozdrawiamy,
Zespół Finance You`;
  return { subject, text };
}
