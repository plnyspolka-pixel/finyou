import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ArrowRight, Sparkles } from "lucide-react";
import { BorderBeam } from "@/components/ui/border-beam";
import type { EnrichedProgress, MissingItem } from "@/lib/my-loan-progress";

interface Props {
  progress: EnrichedProgress;
  hasContact: boolean;
  hasPropertyType: boolean;
  hasLoanTerms: boolean;
  hasInvestorDescription: boolean;
  hasIncomeDocs?: boolean;
  hasCompanyData?: boolean;
  hasBankAccount?: boolean;
  hasIncomeDocsBoost?: boolean;
  hasBikReport?: boolean;
  hideMissing?: boolean;
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

// Etykiety dokumentów traktowanych jako „boost szans" (nie blokują wniosku)
const BOOST_DOC_LABELS = new Set<string>([
  "Dokumenty dochodowe",
  "Zaświadczenia o dochodach",
  "Dochody",
  "PIT za ostatni rok",
]);

export function ProgressChecklist({
  progress,
  hasContact,
  hasPropertyType,
  hasLoanTerms,
  hasInvestorDescription,
  hasIncomeDocs = false,
  hasCompanyData = false,
  hasBankAccount = false,
  hasIncomeDocsBoost = false,
  hasBikReport = false,
  hideMissing = false,
}: Props) {
  void hasIncomeDocs;
  void hasBankAccount;

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
          ctaHref: "/klient",
          ctaLabel: hasPropertyType ? "Zmień" : "Wybierz",
        },
        {
          done: hasLoanTerms,
          label: "Warunki pożyczki (kwota, okres, rata)",
          ctaHref: "/klient",
          ctaLabel: hasLoanTerms ? "Zmień" : "Ustal",
        },
      ],
    },
  ];

  // Wymagane dokumenty nieruchomości — bez „boostujących"
  const requiredDocs = progress.required_documents.filter((r) => !BOOST_DOC_LABELS.has(r.label));
  if (requiredDocs.length > 0) {
    groups.push({
      title: "Dokumenty nieruchomości",
      items: requiredDocs.map((r) => {
        const done = uploadedLabels.has(r.label);
        const m = missingByLabel.get(r.label);
        return {
          done,
          label: r.label,
          ctaHref: m?.ctaHref ?? "/klient",
          ctaLabel: done ? "Zarządzaj" : (m?.ctaLabel ?? "Dodaj"),
        };
      }),
    });
  }

  const allItems = groups.flatMap((g) => g.items);
  const haveItems = allItems.filter((i) => i.done);
  const missingItems = allItems.filter((i) => !i.done);

  // Sekcja „Zwiększ swoje szanse" — nieobowiązkowe, ale podnoszą sukces wniosku
  const boostItems: GroupItem[] = [
    {
      done: hasInvestorDescription,
      label: "Opis dla inwestora",
      ctaHref: "/klient",
      ctaLabel: hasInvestorDescription ? "Edytuj" : "Dodaj",
      hint: "Krótka historia, dlaczego potrzebujesz finansowania — buduje zaufanie inwestorów.",
    },
    {
      done: hasCompanyData,
      label: "Pełne dane firmowe",
      ctaHref: "/klient/profil",
      ctaLabel: hasCompanyData ? "Zarządzaj" : "Uzupełnij",
      hint: "NIP, REGON, KRS i adres — automatycznie pobierzemy z rejestrów państwowych.",
    },
    {
      done: hasIncomeDocsBoost,
      label: "Dokumenty dochodowe",
      ctaHref: "/klient/profil",
      ctaLabel: hasIncomeDocsBoost ? "Zarządzaj" : "Dodaj",
      hint: "PIT, zaświadczenia o dochodach — pokazują inwestorowi Twoją zdolność spłaty.",
    },
    {
      done: hasBikReport,
      label: "Raport BIK",
      ctaHref: "/klient/profil",
      ctaLabel: hasBikReport ? "Zarządzaj" : "Wgraj",
      hint: "Pełny raport BIK — najmocniej zwiększa zaufanie inwestora do Twojej historii kredytowej.",
    },
  ];

  const boostDone = boostItems.filter((b) => b.done).length;

  return (
    <div className="space-y-4">
      <div className={hideMissing ? "" : "grid gap-4 md:grid-cols-2"}>
        <Card className="border-emerald-200 dark:border-emerald-900/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" /> Co już mamy
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {haveItems.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {haveItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Jeszcze nic — uzupełnij pierwszy krok, a tu pojawią się ✓.
              </p>
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

        {!hideMissing && (
          <Card className="border-amber-200 dark:border-amber-900/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
                <Circle className="h-5 w-5" /> Czego jeszcze potrzebujemy
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {missingItems.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {missingItems.length === 0 ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  Wszystko gotowe — wniosek kompletny.
                </p>
              ) : (
                <ul className="space-y-2">
                  {missingItems.map((it) => (
                    <li
                      key={it.label}
                      className="flex flex-col gap-2 rounded-md border bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Circle className="h-4 w-4 shrink-0 text-amber-500" />
                        <span className="truncate text-sm font-medium">{it.label}</span>
                      </div>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto shrink-0"
                      >
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
        )}
      </div>

      <Card className="relative overflow-hidden border-violet-300 bg-violet-50/40 dark:border-violet-900/50 dark:bg-violet-950/20">
        <BorderBeam size={120} duration={8} colorFrom="#a78bfa" colorTo="#22d3ee" />
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-violet-700 dark:text-violet-300">
            <Sparkles className="h-5 w-5" /> Zwiększ swoje szanse na sukces
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {boostDone} / {boostItems.length}
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Te elementy nie są wymagane do złożenia wniosku — ale każdy z nich realnie zwiększa
            szansę, że inwestor wybierze właśnie Twój projekt.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            {boostItems.map((it) => (
              <li
                key={it.label}
                className={`relative overflow-hidden flex flex-col gap-2 rounded-md border bg-card p-3 ${it.done ? "" : "ring-1 ring-violet-300/60 dark:ring-violet-700/60 shadow-[0_0_0_4px_rgba(167,139,250,0.08)]"}`}
              >
                <div className="flex items-center gap-2">
                  {it.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Sparkles className="h-4 w-4 shrink-0 text-violet-500" />
                  )}
                  <span className="text-sm font-semibold">{it.label}</span>
                </div>
                {it.hint && <p className="text-xs text-muted-foreground">{it.hint}</p>}
                <Button
                  asChild
                  size="sm"
                  variant={it.done ? "outline" : "secondary"}
                  className="mt-auto self-start"
                >
                  <Link to={it.ctaHref}>
                    {it.ctaLabel} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
