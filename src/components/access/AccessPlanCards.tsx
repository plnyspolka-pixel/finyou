// Karty pakietów dostępu (30/365 dni) — wspólne dla inwestora i pośrednika.
// Ceny pochodzą z katalogu serwera (access_products); UI niczego nie wylicza
// poza prezentacją oszczędności pakietu rocznego.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatGroszPln, yearlySavingsGrosz, type AccessProduct } from "@/lib/access/core";

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
  const monthly = products.find((p) => p.duration_days === 30);
  const yearly = products.find((p) => p.duration_days === 365);
  const savings =
    monthly && yearly ? yearlySavingsGrosz(monthly.amount_grosz, yearly.amount_grosz) : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {products.map((p) => {
        const isYearly = p.duration_days === 365;
        return (
          <Card key={p.code} className={isYearly ? "border-primary shadow-lg" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Pełny dostęp – {p.duration_days} dni
                {isYearly && <Badge>Najlepsza oferta</Badge>}
              </CardTitle>
              <div className="text-3xl font-bold">{formatGroszPln(p.amount_grosz)} brutto</div>
              <div className="text-xs text-muted-foreground">
                Płatność jednorazowa · dokładnie {p.duration_days} dni dostępu
              </div>
              {isYearly && savings > 0 && (
                <div className="text-xs font-medium text-emerald-700">
                  Oszczędzasz {formatGroszPln(savings)} względem 12 zakupów miesięcznych
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {featuresByDuration?.[p.duration_days] && (
                <ul className="text-sm space-y-1 text-muted-foreground">
                  {featuresByDuration[p.duration_days].map((f) => (
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
                  ? `Przedłuż o ${p.duration_days} dni`
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
