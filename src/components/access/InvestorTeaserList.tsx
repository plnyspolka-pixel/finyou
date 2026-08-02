// Anonimowe zajawki ofert dla inwestora bez aktywnego płatnego dostępu.
// Dane pochodzą wyłącznie z bezpiecznej funkcji serwerowej (tylko dozwolone
// pola) — kliknięcie otwiera estetyczny paywall z pakietami dostępu.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Lock, MapPin, Calendar, Percent, Wallet, ImageOff, TrendingUp } from "lucide-react";
import { formatPLN, propertyTypeLabels } from "@/lib/labels";
import { listInvestorTeasers, type InvestorOfferTeaser } from "@/lib/access/teasers.functions";
import { listAccessProducts } from "@/lib/access/state.functions";
import { AccessPlanCards } from "@/components/access/AccessPlanCards";
import type { AccessProduct } from "@/lib/access/core";

export function InvestorTeaserList() {
  const navigate = useNavigate();
  const teasersFn = useServerFn(listInvestorTeasers);
  const productsFn = useServerFn(listAccessProducts);
  const [teasers, setTeasers] = useState<InvestorOfferTeaser[]>([]);
  const [products, setProducts] = useState<AccessProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [t, p] = await Promise.all([
          teasersFn(),
          productsFn({ data: { audience: "investor" } }),
        ]);
        setTeasers(t);
        setProducts(p);
      } catch {
        setTeasers([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(
    () => [...teasers].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    [teasers],
  );

  if (loading) {
    return <div className="py-10 text-center text-muted-foreground">Ładowanie ofert…</div>;
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3 text-sm">
            <Lock className="h-5 w-5 text-primary" />
            <span>
              Przeglądasz anonimowe zajawki ofert. Pełne dane, dokumenty, księga wieczysta,
              składanie ofert i kontakt — po aktywacji pełnego dostępu.
            </span>
          </div>
          <Button onClick={() => setPaywallOpen(true)}>Odblokuj pełny dostęp</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((t) => (
          <Card
            key={t.id}
            className="group cursor-pointer overflow-hidden transition hover:shadow-md"
            onClick={() => void navigate({ to: "/inwestor/wniosek/$id", params: { id: t.id } })}
          >
            <div className="relative h-40 w-full bg-muted">
              {t.photoUrl ? (
                <img
                  src={t.photoUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <ImageOff className="h-8 w-8" />
                </div>
              )}
              <div className="absolute left-2 top-2 flex gap-1">
                {t.propertyType && (
                  <Badge variant="secondary">
                    {propertyTypeLabels[t.propertyType as keyof typeof propertyTypeLabels] ??
                      t.propertyType}
                  </Badge>
                )}
              </div>
            </div>
            <CardContent className="space-y-2 py-3 text-sm">
              <div className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {[t.city, t.voivodeship].filter(Boolean).join(", ") || "Polska"}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {t.loanAmount != null && (
                  <span className="flex items-center gap-1 font-semibold">
                    <Wallet className="h-4 w-4 text-primary" /> {formatPLN(t.loanAmount)}
                  </span>
                )}
                {t.periodMonths != null && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-4 w-4" /> {t.periodMonths} mies.
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                {t.annualRate != null && (
                  <span className="flex items-center gap-1">
                    <Percent className="h-4 w-4" /> {t.annualRate}% rocznie
                  </span>
                )}
                {t.ltv != null && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" /> LTV {t.ltv}%
                  </span>
                )}
              </div>
              {t.estimatedValue != null && (
                <div className="text-muted-foreground">
                  Wartość nieruchomości:{" "}
                  <b className="text-foreground">{formatPLN(t.estimatedValue)}</b>
                </div>
              )}
              {t.description && (
                <p className="line-clamp-2 text-muted-foreground">{t.description}</p>
              )}
              <Button variant="outline" size="sm" className="w-full">
                Zobacz szczegóły i złóż ofertę
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {sorted.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Brak dostępnych ofert w tej chwili.
          </CardContent>
        </Card>
      )}

      <Dialog open={paywallOpen} onOpenChange={setPaywallOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Odblokuj pełny dostęp inwestora</DialogTitle>
            <DialogDescription>
              Pełne dane ofert, dokumenty, KW, analizy, składanie ofert, czat i windykacja — po
              wykupieniu jednorazowego pakietu dostępu.
            </DialogDescription>
          </DialogHeader>
          <AccessPlanCards
            products={products}
            hasActiveAccess={false}
            onSelect={() => {
              setPaywallOpen(false);
              void navigate({ to: "/inwestor/abonament" });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
