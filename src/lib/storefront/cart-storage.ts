// Koszyk sklepu (/sklep) żyje w sessionStorage tej karty przeglądarki —
// ten sam klucz i kształt pozycji, co w routes/sklep.tsx. Dzięki temu produkt
// dodany na podstronie modułu (/dla-inwestora/szkolenie, /dla-inwestora/analityk-ai)
// czeka w koszyku po przejściu na /sklep#koszyk. Ceny i tak liczy serwer
// (storefront/checkout.functions.ts, priceItems) — kwoty tutaj są tylko do pokazania.

export const STORE_CART_KEY = "fy-store-cart-v1";
export const STORE_CART_PATH = "/sklep#koszyk";

export type StoreCartItemType = "lesson" | "document" | "course" | "kw";

export type StoreCartItem = {
  /** `${type}:${id}` — id lekcji (uuid), modułu (module-N), produktu albo numer KW. */
  id: string;
  type: StoreCartItemType;
  title: string;
  /** Cena w PLN (orientacyjna — ostateczną liczy serwer). */
  price: number;
};

const MAX_ITEMS = 50;

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

export function readStoreCart(): StoreCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(STORE_CART_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter(isItem).slice(0, MAX_ITEMS) : [];
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
