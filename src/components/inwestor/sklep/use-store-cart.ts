// Koszyk sklepu panelu w stanie React + sessionStorage tej karty
// (lib/storefront/cart-storage.ts — ten sam klucz, który zasilają podstrony
// marketingowe). Odczyt odfiltrowuje produkty wycofane ze sprzedaży.
import { useCallback, useEffect, useMemo, useState } from "react";
import { readStoreCart, writeStoreCart, type StoreCartItem } from "@/lib/storefront/cart-storage";

export function useStoreCart() {
  const [items, setItems] = useState<StoreCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(readStoreCart());
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) writeStoreCart(items);
  }, [items, hydrated]);

  const add = useCallback(
    (item: StoreCartItem) =>
      setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item])),
    [],
  );
  const remove = useCallback(
    (id: string) => setItems((prev) => prev.filter((i) => i.id !== id)),
    [],
  );
  const clear = useCallback(() => setItems([]), []);
  const ids = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const total = useMemo(() => items.reduce((sum, i) => sum + i.price, 0), [items]);

  return { items, ids, total, hydrated, add, remove, clear };
}

export type StoreCart = ReturnType<typeof useStoreCart>;
