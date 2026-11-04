import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Katalog z serwera zastępujemy stałą listą (bez Supabase); lekcje jak w
// produkcji: lekcja 1 bez numeru w tytule (darmowa), numerowane lekcje Akademii
// i nagrania kategorii „inwestor” bez numeru (sort_order decyduje o module).
const LESSONS = [
  {
    id: "l1",
    title: "Dlaczego po 15 latach…",
    number: 1,
    free: true,
    price: 0,
    sortOrder: 10,
    durationSeconds: 2043,
    description: "",
    category: "Wprowadzenie",
    thumbnail: null,
  },
  {
    id: "l2",
    title: "2. Zarabianie na pożyczkach",
    number: 2,
    free: false,
    price: 149,
    sortOrder: 20,
    durationSeconds: 1500,
    description: "",
    category: "Strategia",
    thumbnail: null,
  },
  {
    id: "l7",
    title: "7. Interpretacja wyłączeń",
    number: 3,
    free: false,
    price: 149,
    sortOrder: 70,
    durationSeconds: null,
    description: "",
    category: "Prawo",
    thumbnail: null,
  },
  {
    id: "lx",
    title: "Jak zawrzeć umowę pożyczki",
    number: 4,
    free: false,
    price: 149,
    sortOrder: 120,
    durationSeconds: null,
    description: "",
    category: "inwestor",
    thumbnail: null,
  },
  {
    id: "lw",
    title: "Miękka windykacja",
    number: 5,
    free: false,
    price: 149,
    sortOrder: 200,
    durationSeconds: 900,
    description: "",
    category: "inwestor",
    thumbnail: null,
  },
];

// Stała referencja — komponent ma `fetchCatalog` w zależnościach useEffect.
const fetchCatalog = () => Promise.resolve({ lessons: LESSONS, documents: [] });
vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => fetchCatalog,
  createServerFn: () => {
    const chain: any = {
      middleware: () => chain,
      inputValidator: () => chain,
      handler: () => () => Promise.resolve({ lessons: LESSONS, documents: [] }),
    };
    return chain;
  },
}));

import { TrainingCatalog, formatLessonDuration } from "./training-catalog";
import { readStoreCart, STORE_CART_KEY } from "@/lib/storefront/cart-storage";

beforeEach(() => sessionStorage.clear());

describe("program szkolenia — katalog lekcji", () => {
  it("formatuje czas trwania", () => {
    expect(formatLessonDuration(2043)).toBe("ok. 34 min");
    expect(formatLessonDuration(4200)).toBe("1 h 10 min");
    expect(formatLessonDuration(null)).toBeNull();
  });

  it("grupuje lekcje w 7 modułów, pokazuje czas i cenę, darmową lekcję 1", async () => {
    render(<TrainingCatalog />);
    await act(async () => {});
    // 7 modułów z grafik Akademii
    expect(screen.getAllByText(/^Moduł \d$/)).toHaveLength(7);
    expect(screen.getByText((t) => /149.zł · ok\. 25 min/.test(t))).toBeTruthy();
    expect(screen.getByText(/Za darmo · ok\. 34 min/)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Obejrzyj/ })[0].getAttribute("href")).toBe(
      "/pobierz/darmowa-lekcja",
    );
    // Nagranie bez numeru (sort 120) → Operacje, windykacyjne (sort 200) → Windykacja
    expect(screen.getByText("Jak zawrzeć umowę pożyczki")).toBeTruthy();
    expect(screen.getByText("Miękka windykacja")).toBeTruthy();
  });

  it("dodaje lekcję i moduł do koszyka sklepu (sessionStorage)", async () => {
    render(<TrainingCatalog />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Dodaj do koszyka lekcję: Zarabianie/ }));
    expect(readStoreCart()).toEqual([
      { id: "lesson:l2", type: "lesson", title: "Lekcja: Zarabianie na pożyczkach", price: 149 },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /Dodaj do koszyka cały moduł 2/ }));
    const cart = JSON.parse(sessionStorage.getItem(STORE_CART_KEY)!);
    expect(cart.map((i: { id: string }) => i.id)).toEqual(["lesson:l2", "course:module-2"]);
    expect(screen.getByRole("link", { name: /Przejdź do koszyka/ }).getAttribute("href")).toBe(
      "/sklep#koszyk",
    );
  });
});
