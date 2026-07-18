// Jeden wspólny bucket Storage na WSZYSTKIE pliki klienta (zdjęcia, skany,
// załączniki z Messengera/maila, dokumenty wygenerowane, avatary, marketing).
// Zastąpił dawne buckety "documents" i "property-photos" — patrz migracja
// 20260715090000_pliki_klienta_unified_bucket.sql. Plik bez importów, żeby
// można go było używać zarówno po stronie klienta, jak i serwera.
export const CLIENT_FILES_BUCKET = "pliki-klienta" as const;

/** Nazwa sekcji w UI — wszystkie pliki wpadają do jednego worka. */
export const CLIENT_FILES_LABEL = "Pliki klienta";
