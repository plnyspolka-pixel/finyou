// Wspólne typy i pomocniki zakładek sklepu panelu inwestora (/inwestor/sklep).
import type { getPublicStoreCatalog } from "@/lib/storefront/catalog.functions";
import type { getMyStorePurchases } from "@/lib/storefront/checkout.functions";
import { ACADEMY_MODULES, academyModuleForCatalogLesson } from "@/lib/storefront/products";

export type Catalog = Awaited<ReturnType<typeof getPublicStoreCatalog>>;
export type Lesson = Catalog["lessons"][number];
export type Purchases = Awaited<ReturnType<typeof getMyStorePurchases>>;
export type Entitlement = { item_kind: string; item_id: string };
export type Order = { id: string; status: string; created_at: string; amount_grosz: number };

/** „149 zł” / „9,99 zł” — kwoty w PLN tylko do pokazania; liczy je serwer. */
export const pln = (n: number) =>
  n.toLocaleString("pl-PL", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }) + " zł";

/**
 * Lekcje, które inwestor już ma: kupione pojedynczo, w dawnym module Akademii
 * albo w dawnym pakiecie całej Akademii (produkty wycofane 04.11.2026, ale
 * opłacone uprawnienia działają — ta sama reguła co assertEntitled na serwerze).
 */
export function ownedLessonIds(entitlements: Entitlement[], lessons: Lesson[]): Set<string> {
  const owned = new Set<string>();
  const hasCourse = entitlements.some((e) => e.item_kind === "course" && e.item_id === "academy");
  const modules = new Set(
    entitlements
      .filter((e) => e.item_kind === "course" && ACADEMY_MODULES.some((m) => m.id === e.item_id))
      .map((e) => e.item_id),
  );
  for (const l of lessons) {
    if (
      hasCourse ||
      entitlements.some((e) => e.item_kind === "lesson" && e.item_id === l.id) ||
      modules.has(academyModuleForCatalogLesson(l)?.id ?? "")
    ) {
      owned.add(l.id);
    }
  }
  return owned;
}

/** Zamówienie czeka na potwierdzenie webhooka Tpay. */
export function hasPendingOrder(orders: Order[]): boolean {
  return orders.some((o) => o.status === "pending" || o.status === "created");
}
