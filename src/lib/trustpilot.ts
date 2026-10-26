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

// ── Publiczny profil i widżet (TrustBox) ─────────────────────────────────────
// Identyfikator jednostki biznesowej jest publiczny — siedzi w kodzie strony
// profilu Trustpilot (pl.trustpilot.com/review/financeyou.pl).

/** Profil Finance You na Trustpilot (opinie). */
export const TRUSTPILOT_PROFILE_URL = "https://pl.trustpilot.com/review/financeyou.pl";
/** Strona „napisz opinię”. */
export const TRUSTPILOT_EVALUATE_URL = "https://pl.trustpilot.com/evaluate/financeyou.pl";
/** `businessUnit.id` profilu financeyou.pl — wymagany przez każdy TrustBox. */
export const TRUSTPILOT_BUSINESS_UNIT_ID = "6adc08a391bd82e6106c0836";
/** Skrypt TrustBox (ładowany raz, na kliencie). */
export const TRUSTBOX_SCRIPT_URL =
  "https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js";

/**
 * Szablony TrustBox (identyfikatory z biblioteki TrustBox Trustpilot — wspólne
 * dla wszystkich firm). Plan Free obejmuje „Review Collector”; szablony
 * pokazujące treść opinii (Carousel, Grid, Slider, List) wymagają planu
 * płatnego — na planie Free skrypt ich nie wyrenderuje i zostaje zapasowy
 * link do profilu.
 */
export const TRUSTBOX_TEMPLATES = {
  /** Ocena + „Napisz opinię” — plan Free. */
  reviewCollector: { id: "56278e9abfbbba0bdcd568bc", height: "52px" },
  /** Gwiazdki + liczba opinii w jednej linii. */
  microCombo: { id: "5419b6ffb0d04a076446a9af", height: "24px" },
  /** Same gwiazdki. */
  microStar: { id: "5419b732fbfb950b10de65e5", height: "24px" },
  /** Ocena, gwiazdki i liczba opinii w ramce. */
  mini: { id: "53aa8807dec7e10d38f59f32", height: "150px" },
  /** Karuzela najnowszych opinii — plan płatny. */
  carousel: { id: "53aa8912dec7e10d38f59f36", height: "140px" },
  /** Siatka opinii — plan płatny. */
  grid: { id: "539adbd6dec7e10e686debee", height: "500px" },
} as const;

export type TrustBoxTemplate = keyof typeof TRUSTBOX_TEMPLATES;

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
