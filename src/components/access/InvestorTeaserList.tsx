// Teasery Projektów dopasowanych do PRZYJĘTYCH Zleceń inwestora.
// Dane pochodzą wyłącznie z bezpiecznej funkcji serwerowej (tylko dozwolone
// pola, bez opisu i zdjęć). Bez przyjętego Zlecenia lista jest pusta —
// pokazujemy CTA „Złóż Zlecenie". Usługa dla inwestora jest nieodpłatna:
// nie ma tu paywalla ani pakietów dostępu (abonament — w przyszłości).
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  Calendar,
  Percent,
  Wallet,
  Building2,
  TrendingUp,
  FileSignature,
} from "lucide-react";
import { formatPLN, propertyTypeLabels } from "@/lib/labels";
import { listInvestorTeasers, type InvestorOfferTeaser } from "@/lib/access/teasers.functions";

export function InvestorTeaserList() {
  const navigate = useNavigate();
  const teasersFn = useServerFn(listInvestorTeasers);
  const [teasers, setTeasers] = useState<InvestorOfferTeaser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        setTeasers(await teasersFn());
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
    return <div className="py-10 text-center text-muted-foreground">Ładowanie projektów…</div>;
  }

  if (sorted.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-3 py-10 text-center">
          <FileSignature className="mx-auto h-8 w-8 text-primary" />
          <p className="font-medium">Projekty pojawią się po przyjęciu Twojego Zlecenia.</p>
          <p className="text-sm text-muted-foreground">
            Finance You przedstawia Projekty wyłącznie w wykonaniu przyjętego Zlecenia (§ 5 Umowy
            ramowej). Złóż Zlecenie z kwotą, okresem i minimalnym zyskiem — dopasowane Projekty
            zobaczysz tutaj.
          </p>
          <Button asChild>
            <Link to="/inwestor/umowy">Złóż Zlecenie</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((t) => (
        <Card
          key={t.matchId}
          className="group cursor-pointer overflow-hidden transition hover:shadow-md"
          onClick={() => void navigate({ to: "/inwestor/umowy" })}
        >
          <div className="relative flex h-28 w-full items-center justify-center bg-muted text-muted-foreground">
            <Building2 className="h-8 w-8" />
            <div className="absolute left-2 top-2 flex gap-1">
              {t.propertyType && (
                <Badge variant="secondary">
                  {propertyTypeLabels[t.propertyType as keyof typeof propertyTypeLabels] ??
                    t.propertyType}
                </Badge>
              )}
              {t.projectRef && <Badge variant="outline">{t.projectRef}</Badge>}
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
            <Button variant="outline" size="sm" className="w-full">
              Otwórz w cyklu Zlecenia
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
