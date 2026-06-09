import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import type { EnrichedProgress, MissingItem } from "@/lib/my-loan-progress";

interface Props {
  progress: EnrichedProgress;
  hasContact: boolean;
  hasPropertyType: boolean;
  hasLoanTerms: boolean;
  hasInvestorDescription: boolean;
}

interface GroupItem {
  done: boolean;
  label: string;
  ctaHref: string;
  ctaLabel: string;
  hint?: string;
}

interface Group {
  title: string;
  items: GroupItem[];
}

export function ProgressChecklist({
  progress,
  hasContact,
  hasPropertyType,
  hasLoanTerms,
  hasInvestorDescription,
}: Props) {
  // Buduj listę z deduplikowanymi sekcjami
  const missingByLabel = new Map<string, MissingItem>(progress.missing.map((m) => [m.label, m]));
  const uploadedLabels = new Set(progress.uploaded_documents);

  const groups: Group[] = [
    {
      title: "Twoje dane",
      items: [
        {
          done: hasContact,
          label: "Imię, telefon, e-mail",
          ctaHref: "/klient/profil",
          ctaLabel: hasContact ? "Edytuj" : "Uzupełnij",
        },
      ],
    },
    {
      title: "Wniosek",
      items: [
        {
          done: hasPropertyType,
          label: "Typ zabezpieczenia",
          ctaHref: "/wniosek-zabezpieczenie",
          ctaLabel: hasPropertyType ? "Zmień" : "Wybierz",
        },
        {
          done: hasLoanTerms,
          label: "Warunki pożyczki (kwota, okres, rata)",
          ctaHref: "/wniosek-warunki",
          ctaLabel: hasLoanTerms ? "Zmień" : "Ustal",
        },
        {
          done: hasInvestorDescription,
          label: "Opis dla inwestora",
          ctaHref: "/wniosek-opis",
          ctaLabel: hasInvestorDescription ? "Edytuj" : "Dodaj",
        },
      ],
    },
  ];

  if (progress.required_documents.length > 0) {
    groups.push({
      title: "Dokumenty nieruchomości",
      items: progress.required_documents.map((r) => {
        const done = uploadedLabels.has(r.label);
        const m = missingByLabel.get(r.label);
        return {
          done,
          label: r.label,
          ctaHref: m?.ctaHref ?? "/klient/dokumenty",
          ctaLabel: done ? "Zarządzaj" : m?.ctaLabel ?? "Dodaj",
        };
      }),
    });
  }

  const allItems = groups.flatMap((g) => g.items);
  const haveItems = allItems.filter((i) => i.done);
  const missingItems = allItems.filter((i) => !i.done);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="border-emerald-200 dark:border-emerald-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" /> Co już mamy
            <span className="ml-auto text-xs font-normal text-muted-foreground">{haveItems.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {haveItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Jeszcze nic — uzupełnij pierwszy krok, a tu pojawią się ✓.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {haveItems.map((it) => (
                <li key={it.label} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="text-muted-foreground line-through">{it.label}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-200 dark:border-amber-900/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
            <Circle className="h-5 w-5" /> Czego jeszcze potrzebujemy
            <span className="ml-auto text-xs font-normal text-muted-foreground">{missingItems.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {missingItems.length === 0 ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">Wszystko gotowe — wniosek kompletny.</p>
          ) : (
            <ul className="space-y-2">
              {missingItems.map((it) => (
                <li key={it.label} className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Circle className="h-4 w-4 shrink-0 text-amber-500" />
                    <span className="truncate text-sm font-medium">{it.label}</span>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to={it.ctaHref}>
                      {it.ctaLabel} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
