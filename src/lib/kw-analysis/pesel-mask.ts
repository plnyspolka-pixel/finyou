// RODO: maskowanie numerów PESEL (ciągi 11 cyfr) w prezentowanej treści
// źródłowej KW — wspólne dla raportu analizy KW na ekranie i raportu PDF.
// Czyste, bez zależności — bezpieczne po obu stronach.

/** „80010112345” → „80*******45”. Inne ciągi cyfr (kwoty, numery KW) zostają. */
export function maskPeselInText(s: string): string {
  // Bez lookbehind — starsze Safari nie parsują go w literałach wyrażeń.
  return s.replace(/(^|\D)(\d{2})\d{7}(\d{2})(?!\d)/g, "$1$2*******$3");
}
