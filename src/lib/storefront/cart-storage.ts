// Koszyk sklepu panelu inwestora (/inwestor/sklep) żyje w sessionStorage tej
// karty przeglądarki. Ten sam klucz i kształt pozycji zapisują podstrony
// marketingowe (/dla-inwestora/szkolenie — pojedyncze lekcje, /dla-inwestora/
// analityk-ai — raport KW), więc produkt dodany przed zalogowaniem czeka w
// koszyku po przejściu przez /logowanie na /inwestor/sklep. Ceny i tak liczy
// serwer (storefront/checkout.functions.ts, priceItems) — kwoty tutaj są tylko
// do pokazania.
//
// Decyzja właściciela 04.11.2026: publicznego sklepu nie ma; sklep panelu
// sprzedaje wyłącznie pojedyncze lekcje Akademii, kalkulator compliance (HIT
// 9,99 zł / 30 dni) i raport KW. Moduły Akademii, pakiet całej Akademii i
// Centrum Zarządzania zostały wycofane — stare pozycje z sessionStorage są
// odfiltrowywane przy odczycie (isSellableCartItem).
import {
  CALCULATOR_CART_ID,
  CALCULATOR_UNLOCK_DAYS,
  CALCULATOR_UNLOCK_PRICE_GROSZ,
  CALCULATOR_UNLOCK_TITLE,
  ACADEMY_LESSON_PRICE_PLN,
  KW_REPORT_PRICE_PLN,
  cleanLessonTitle,
} from "./products";

export const STORE_CART_KEY = "fy-store-cart-v1";
/** Sklep w panelu inwestora (ścieżka bez abonamentu — FREE_INVESTOR_PATHS). */
export const STORE_PATH = "/inwestor/sklep";
export const STORE_CART_PATH = "/inwestor/sklep#koszyk";
/** Zakładka „Moje zakupy” — tu wracają płatności Tpay i e-mail potwierdzający. */
export const STORE_LIBRARY_PATH = "/inwestor/sklep?tab=zakupy";

export type StoreCartItemType = "lesson" | "document" | "course" | "kw";

export type StoreCartItem = {
  /** `${type}:${id}` — id lekcji (uuid), produktu (mapa-szans-30d) albo numer KW. */
  id: string;
  type: StoreCartItemType;
  title: string;
  /** Cena w PLN (orientacyjna — ostateczną liczy serwer). */
  price: number;
};

const MAX_ITEMS = 50;

export const CALCULATOR_CART_ITEM_ID = "course:" + CALCULATOR_CART_ID;

function isItem(x: unknown): x is StoreCartItem {
  if (!x || typeof x !== "object") return false;
  const i = x as Record<string, unknown>;
  return (
    typeof i.id === "string" &&
    ["lesson", "document", "course", "kw"].includes(String(i.type)) &&
    typeof i.title === "string" &&
    Number.isFinite(i.price)
  );
}

/** Pozycje, które sklep panelu nadal sprzedaje: lekcja, kalkulator compliance, raport KW. */
export function isSellableCartItem(i: StoreCartItem): boolean {
  if (i.type === "lesson" || i.type === "kw") return true;
  return i.type === "course" && i.id === CALCULATOR_CART_ITEM_ID;
}

export function lessonCartItem(l: { id: string; title: string }): StoreCartItem {
  return {
    id: "lesson:" + l.id,
    type: "lesson",
    title: `Lekcja: ${cleanLessonTitle(l.title)}`,
    price: ACADEMY_LESSON_PRICE_PLN,
  };
}

export function calculatorCartItem(): StoreCartItem {
  return {
    id: CALCULATOR_CART_ITEM_ID,
    type: "course",
    title: `${CALCULATOR_UNLOCK_TITLE} — kalkulator compliance, ${CALCULATOR_UNLOCK_DAYS} dni`,
    price: CALCULATOR_UNLOCK_PRICE_GROSZ / 100,
  };
}

export function kwCartItem(kw: { value: string; compact: string }): StoreCartItem {
  return {
    id: "kw:" + kw.compact,
    type: "kw",
    title: "Raport księgi wieczystej " + kw.value,
    price: KW_REPORT_PRICE_PLN,
  };
}

/** Koszyk tej karty — tylko pozycje, które da się dziś kupić. */
export function readStoreCart(): StoreCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(STORE_CART_KEY) || "[]");
    return Array.isArray(raw)
      ? raw.filter(isItem).filter(isSellableCartItem).slice(0, MAX_ITEMS)
      : [];
  } catch {
    return [];
  }
}

export function writeStoreCart(items: StoreCartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORE_CART_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* storage wyłączony — koszyk tylko w pamięci strony */
  }
}

/** Dodaje pozycję (bez duplikatów). Zwraca aktualny koszyk. */
export function addToStoreCart(item: StoreCartItem): StoreCartItem[] {
  const current = readStoreCart();
  if (current.some((i) => i.id === item.id)) return current;
  const next = [...current, item];
  writeStoreCart(next);
  return next;
}

export function removeFromStoreCart(id: string): StoreCartItem[] {
  const next = readStoreCart().filter((i) => i.id !== id);
  writeStoreCart(next);
  return next;
}
