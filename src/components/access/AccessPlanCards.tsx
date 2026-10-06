// Karty pakietów dostępu — wspólne dla inwestora i pośrednika. W sprzedaży
// jest wyłącznie dostęp roczny (365 dni); ceny pochodzą z katalogu serwera
// (access_products).
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatGroszPln, isRetiredProductCode, type AccessProduct } from "@/lib/access/core";

interface Props {
  products: AccessProduct[];
  hasActiveAccess: boolean;
  onSelect: (product: AccessProduct) => void;
  featuresByDuration?: Record<number, string[]>;
}

export function AccessPlanCards({
  products,
  hasActiveAccess,
  onSelect,
  featuresByDuration,
}: Props) {
  // Produkty „unlock" (zakup jednej okazji) kupuje się z poziomu okazji,
  // nie z cennika — tutaj pokazujemy wyłącznie pakiety czasowe, bez
  // wycofanych pakietów 30-dniowych.
  const timed = products.filter(
    (p) => p.kind !== "unlock" && p.duration_days != null && !isRetiredProductCode(p.code),
  );

  return (
    <div className={timed.length > 1 ? "grid gap-4 md:grid-cols-2" : "mx-auto grid max-w-md gap-4"}>
      {timed.map((p) => {
        const days = p.duration_days as number;
        const isYearly = days === 365;
        return (
          <Card key={p.code} className={isYearly ? "border-primary shadow-lg" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {isYearly ? "Pełny dostęp – rok (365 dni)" : `Pełny dostęp – ${days} dni`}
              </CardTitle>
              <div className="text-3xl font-bold">{formatGroszPln(p.amount_grosz)} brutto</div>
              <div className="text-xs text-muted-foreground">
                Płatność jednorazowa · dokładnie {days} dni dostępu
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {featuresByDuration?.[days] && (
                <ul className="text-sm space-y-1 text-muted-foreground">
                  {featuresByDuration[days].map((f: string) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
              )}
              <Button
                className="w-full"
                variant={isYearly ? "default" : "outline"}
                onClick={() => onSelect(p)}
              >
                {hasActiveAccess
                  ? `Przedłuż o ${days} dni`
                  : isYearly
                    ? "Wykup dostęp na rok"
                    : "Wykup dostęp"}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
