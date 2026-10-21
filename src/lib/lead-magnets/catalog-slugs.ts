// Slugi lead magnetów z katalogu startowego (src/lib/lead-magnets/catalog.ts).
// Osobny, lekki moduł: importuje go schemat zod (panel + MCP) i strona
// publiczna — bez ciągnięcia pełnej treści PDF do bundla klienta.
export const CATALOG_SLUGS = [
  "start-inwestora",
  "checklista-ksiegi-wieczystej",
  "bledy-inwestora",
  "bank-odmowil-co-dalej",
  "checklista-dokumentow",
  "od-wniosku-do-wyplaty",
] as const;

export type CatalogSlug = (typeof CATALOG_SLUGS)[number];

/** Czy slug należy do katalogu — taki lead magnet ma PDF generowany z kodu (nie wymaga pliku). */
export function isCatalogSlug(slug: string | null | undefined): slug is CatalogSlug {
  return (CATALOG_SLUGS as readonly string[]).includes(String(slug ?? ""));
}
