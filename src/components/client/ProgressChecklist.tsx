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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Czego jeszcze brakuje</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {groups.map((g) => (
          <div key={g.title} className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {g.title}
            </div>
            <ul className="divide-y rounded-lg border">
              {g.items.map((it) => (
                <li key={it.label} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    {it.done ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                    ) : (
                      <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" />
                    )}
                    <span className={`text-sm truncate ${it.done ? "text-muted-foreground line-through" : "font-medium"}`}>
                      {it.label}
                    </span>
                  </div>
                  <Button asChild size="sm" variant={it.done ? "ghost" : "outline"}>
                    <Link to={it.ctaHref}>
                      {it.ctaLabel} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
