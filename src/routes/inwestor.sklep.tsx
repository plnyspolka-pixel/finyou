import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Library, ShoppingBag } from "lucide-react";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StoreProducts } from "@/components/inwestor/sklep/store-products";
import { StoreLibrary } from "@/components/inwestor/sklep/store-library";
import { writeStoreCart } from "@/lib/storefront/cart-storage";

// Sklep w panelu inwestora (decyzja właściciela 04.11.2026) — jedyny sklep:
// publiczny /sklep i /sklep/moje-zakupy są przekierowaniami 301 tutaj. Ścieżka
// bez abonamentu (FREE_INVESTOR_PATHS), bo właśnie tu inwestor bez abonamentu
// kupuje pojedyncze lekcje Akademii, kalkulator compliance (HIT 9,99 zł) i raport
// KW. Zakładki: „Produkty” (katalog + koszyk) i „Moje zakupy” (tu wracają
// płatności Tpay i e-mail potwierdzający). Twarde bramki po stronie serwera.
export type StoreTab = "produkty" | "zakupy";

export const Route = createFileRoute("/inwestor/sklep")({
  validateSearch: (search: Record<string, unknown>): { tab?: StoreTab; tpay?: string } => ({
    tab: search.tab === "zakupy" ? "zakupy" : undefined,
    tpay: typeof search.tpay === "string" ? search.tpay : undefined,
  }),
  component: InwestorSklep,
});

function InwestorSklep() {
  const { tab, tpay } = Route.useSearch();
  const navigate = useNavigate();
  const active: StoreTab = tab ?? "produkty";

  // Udany powrót z Tpay: pozycje z koszyka tej karty są już zamówieniem —
  // czyścimy go, żeby nie kupić ich drugi raz. Dostęp nadaje webhook, nie ten parametr.
  useEffect(() => {
    if (tpay === "success") writeStoreCart([]);
  }, [tpay]);

  const go = (t: StoreTab) =>
    void navigate({
      to: "/inwestor/sklep",
      search: { tab: t === "zakupy" ? "zakupy" : undefined },
      replace: true,
    });

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Sklep inwestora"
        title="Lekcje, kalkulator compliance i raport KW"
        subtitle="Kupujesz pojedynczo, bez abonamentu — płatność Tpay. Dostęp pojawia się w „Moich zakupach” po potwierdzeniu płatności z serwera Tpay."
      />
      <Tabs value={active} onValueChange={(v) => go(v === "zakupy" ? "zakupy" : "produkty")}>
        <TabsList>
          <TabsTrigger value="produkty">
            <ShoppingBag className="mr-2 h-4 w-4" /> Produkty
          </TabsTrigger>
          <TabsTrigger value="zakupy">
            <Library className="mr-2 h-4 w-4" /> Moje zakupy
          </TabsTrigger>
        </TabsList>
        <TabsContent value="produkty" className="mt-4">
          <StoreProducts onGoToLibrary={() => go("zakupy")} />
        </TabsContent>
        <TabsContent value="zakupy" className="mt-4">
          <StoreLibrary tpay={tpay} onGoToProducts={() => go("produkty")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
