// Ujednolicone etykiety źródła wniosku / leada / klienta.
//
// W bazie źródło zapisywane jest różnie w zależności od kanału wejścia:
// "meta_lead", "landing_wizard", "messenger", "inbound_enrichment:messenger",
// "panel_klienta"… Surowa wartość zostaje w bazie (analityka, deduplikacja),
// a UI pokazuje spójną, polską nazwę kanału.
//
// Prefiks "inbound_enrichment:" oznacza tylko tyle, że wniosek został założony
// automatycznie na podstawie rozmowy — kanałem jest to, co po dwukropku.

const SOURCE_LABELS: Record<string, string> = {
  meta_lead: "Facebook Lead Ads",
  messenger: "Messenger",
  email_inbound: "E-mail",
  landing_wizard: "Formularz — kreator",
  landing_single_page: "Formularz — landing",
  panel_klienta: "Panel klienta",
  embed: "Formularz embed",
  scheduled: "Umówiona rozmowa",
  inbound_enrichment: "Rozmowa (auto)",
  unknown: "nieznane",
  lead: "Lead",
  mcp: "Asystent AI",
  ocr: "OCR dokumentu",
  manual: "Ręcznie (panel)",
  ekw_auto: "EKW (auto-pobranie)",
};

/** Kanoniczny klucz kanału — np. "inbound_enrichment:messenger" -> "messenger". */
export function normalizeLeadSource(source: string | null | undefined): string | null {
  if (!source) return null;
  const raw = source.includes(":") ? (source.split(":").pop() ?? source) : source;
  return raw.trim() || null;
}

/** Etykieta do wyświetlenia w UI; nieznane wartości pokazujemy bez zmian. */
export function leadSourceLabel(source: string | null | undefined): string {
  const key = normalizeLeadSource(source);
  if (!key) return "—";
  return SOURCE_LABELS[key] ?? key;
}

// Kanały będące WYŁĄCZNIE źródłem pozyskania leada — nie da się nimi
// przesłać danych pogłębionych (kwota pożyczki, numer KW, zdjęcia,
// dokumenty). Jeżeli wniosek ma taki `source`, to znaczy, że pogłębione
// dane trafiły do systemu innym kanałem (ręcznie / telefon / messenger),
// którego my w bazie per-pole nie zapisujemy — więc lepiej pokazać
// „nieznane" niż wprowadzać użytkownika w błąd ikonką Facebooka.
const ACQUISITION_ONLY_SOURCES = new Set(["meta_lead"]);

/**
 * Źródło dla pól wymagających pogłębienia (kwota, KW, zdjęcia, dokumenty).
 * Dla czystych kanałów pozyskania (np. Facebook Lead Ads) zwraca `null`,
 * dzięki czemu SourceIcon pokazuje neutralną ikonkę „?".
 */
export function enrichedFieldSource(source: string | null | undefined): string | null {
  const key = normalizeLeadSource(source);
  if (!key) return null;
  if (ACQUISITION_ONLY_SOURCES.has(key)) return null;
  return source ?? null;
}
