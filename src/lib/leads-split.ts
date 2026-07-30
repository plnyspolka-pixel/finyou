// Rozdzielenie leadów od wniosków: lead jest w puli na sprzedaż dla
// pośredników, dopóki klient nie rozpocznie wniosku. Ten moduł zawiera
// czystą logikę decyzyjną (testowalną bez bazy) — zapis znacznika robi
// leads-split.server.ts.

/**
 * Klucze application_data, których pojawienie się w patchu od bota oznacza,
 * że klient realnie rozpoczął wniosek (bot zbiera merytoryczne dane wniosku,
 * a nie tylko dane kontaktowe). Klucze po normalizacji przez normalizePatch
 * w elevenlabs-text-agent.server.ts.
 */
const APPLICATION_PATCH_KEYS = [
  "loan_amount",
  "numer_kw",
  "kw_numbers",
  "status_numeru_kw",
  "typ_nieruchomosci",
  "property_value",
  "purpose",
] as const;

function hasValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

/**
 * Czy patch danych od bota (update_lead_data) rozpoczyna wniosek?
 * Sam kontakt (imię, telefon, e-mail, miasto) nie wystarcza — dopiero
 * merytoryka wniosku: kwota, KW, typ/wartość nieruchomości, cel.
 */
export function patchStartsApplication(patch: Record<string, unknown> | null | undefined): boolean {
  if (!patch) return false;
  return APPLICATION_PATCH_KEYS.some((k) => hasValue(patch[k]));
}
