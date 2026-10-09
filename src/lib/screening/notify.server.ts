// Powiadomienia e-mail modułu screeningu (adresy w screening_settings).
// Zasada RODO modułu: dane klientów nie trafiają do zewnętrznych API — e-mail
// (dostawca poczty) zawiera wyłącznie numer sprawy, typ, wynik i link do panelu;
// dane osoby weryfikujący ogląda w panelu (dostęp z kontrolą uprawnień).
import { sendResendEmail } from "@/lib/resend-send.server";
import type { ScreeningSettings } from "./db.server";

const PANEL_URL = `${process.env.PUBLIC_BASE_URL || process.env.SITE_URL || "https://financeyou.pl"}/admin/screening`;

async function sendAll(
  to: string[],
  subject: string,
  text: string,
): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;
  for (const addr of [...new Set(to.map((a) => a.trim()).filter(Boolean))]) {
    const r = await sendResendEmail({
      to: addr,
      subject,
      text,
      category: "transactional",
      noBranding: true,
    });
    if (r.ok) sent++;
    else errors.push(`${addr}: ${r.error ?? "błąd wysyłki"}`);
  }
  return { sent, errors };
}

export async function notifyNewCase(
  settings: ScreeningSettings,
  c: {
    id: string;
    case_no?: number | null;
    case_type: string;
    priority: string;
    max_score: number | null;
  },
) {
  if (c.priority === "normal") return { sent: 0, errors: [] };
  const kind =
    c.case_type === "sanctions" ? "możliwe trafienie na liście sankcyjnej" : "silne trafienie PEP";
  return sendAll(
    settings.aml_officer_emails,
    `[AML] ${c.priority === "critical" ? "PILNE: " : ""}${kind} — sprawa ${c.case_no ?? ""}`.trim(),
    [
      `Automatyczny screening utworzył sprawę wymagającą decyzji człowieka.`,
      ``,
      `Typ: ${kind}`,
      `Wynik dopasowania: ${c.max_score ?? "—"}/100`,
      `Priorytet: ${c.priority}`,
      ``,
      `Proces wniosku klienta jest wstrzymany do czasu decyzji (jeśli wynik ≥ progu silnego).`,
      `Sprawa: ${PANEL_URL}/${c.id}`,
    ].join("\n"),
  );
}

/** Potwierdzone trafienie sankcyjne → osoba odpowiedzialna za AML + zarząd. */
export async function notifySanctionsConfirmed(
  settings: ScreeningSettings,
  c: { id: string; case_no?: number | null },
) {
  return sendAll(
    [...settings.aml_officer_emails, ...settings.board_emails],
    `[AML] POTWIERDZONE TRAFIENIE SANKCYJNE — sprawa ${c.case_no ?? ""}`.trim(),
    [
      `Weryfikujący potwierdził trafienie na liście sankcyjnej.`,
      ``,
      `Wszystkie operacje klienta zostały wstrzymane w systemie.`,
      ``,
      `Dalsze kroki (m.in. zawiadomienie GIIF, zamrożenie wartości majątkowych) podejmuje człowiek —`,
      `system niczego nie zgłasza automatycznie.`,
      `Sprawa: ${PANEL_URL}/${c.id}`,
    ].join("\n"),
  );
}

export async function notifyImportAlert(settings: ScreeningSettings, lines: string[]) {
  return sendAll(
    settings.aml_officer_emails,
    `[AML] Problem z importem źródeł screeningu PEP/sankcji`,
    [
      `Co najmniej jedno źródło referencyjne nie zostało zaktualizowane przez więcej niż ${settings.import_alert_failed_cycles} cykle:`,
      ``,
      ...lines.map((l) => `• ${l}`),
      ``,
      `Panel źródeł: ${PANEL_URL}?tab=zrodla`,
    ].join("\n"),
  );
}
