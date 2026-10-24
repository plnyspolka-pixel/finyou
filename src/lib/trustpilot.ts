// Trustpilot — automatyczne zaproszenia do opinii (AFS, Automatic Feedback
// Service). Trustpilot daje firmie unikalny adres w domenie
// invite.trustpilot.com; mail transakcyjny z tym adresem w ukrytej kopii (BCC)
// uruchamia po stronie Trustpilot zaproszenie do opinii, wysyłane po
// ustawionym tam opóźnieniu. Opinia z takiego zaproszenia dostaje znacznik
// „Zweryfikowano”. Ustawienia: /admin/integracje, karta „Trustpilot”
// (tabela integration_settings, integration_name = "trustpilot").
//
// Ten plik jest czysty (bez bazy) — wspólny dla panelu i serwera.

export const TRUSTPILOT_INTEGRATION_NAME = "trustpilot";
export const TRUSTPILOT_AFS_DOMAIN = "invite.trustpilot.com";

export type TrustpilotConfig = {
  /** Adres AFS z Trustpilot Business (…@invite.trustpilot.com) albo null. */
  afs_bcc_email: string | null;
  /** Zaproszenie po każdym pierwszym pobraniu lead magnetu. */
  invite_lead_magnets: boolean;
};

export type TrustpilotSettingsRow = {
  is_enabled?: boolean | null;
  configuration?: unknown;
};

/**
 * Czy to adres AFS Trustpilot. Tylko taki adres wolno dopisać jako ukrytą
 * kopię — literówka w panelu nie może wysłać maili klientów gdzie indziej.
 */
export function isTrustpilotAfsAddress(value: string | null | undefined): value is string {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return /^[a-z0-9._+-]+@invite\.trustpilot\.com$/.test(v);
}

export function normalizeTrustpilotAfsAddress(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().toLowerCase();
  return isTrustpilotAfsAddress(v) ? v : null;
}

/** Konfiguracja z kolumny `configuration` (jsonb) — odporna na braki i śmieci. */
export function parseTrustpilotConfig(configuration: unknown): TrustpilotConfig {
  const c = (
    configuration && typeof configuration === "object" && !Array.isArray(configuration)
      ? configuration
      : {}
  ) as Record<string, unknown>;
  return {
    afs_bcc_email: normalizeTrustpilotAfsAddress(
      typeof c.afs_bcc_email === "string" ? c.afs_bcc_email : null,
    ),
    invite_lead_magnets: c.invite_lead_magnets === true,
  };
}

/**
 * Ukryta kopia do AFS dla maila po pobraniu lead magnetu. Pusta lista, gdy
 * integracja jest wyłączona, nie ma poprawnego adresu albo zaproszenia po
 * lead magnetach są wyłączone.
 */
export function trustpilotLeadMagnetBcc(row: TrustpilotSettingsRow | null | undefined): string[] {
  if (!row?.is_enabled) return [];
  const cfg = parseTrustpilotConfig(row.configuration);
  if (!cfg.invite_lead_magnets || !cfg.afs_bcc_email) return [];
  return [cfg.afs_bcc_email];
}
