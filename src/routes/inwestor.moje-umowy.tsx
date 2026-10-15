// „Moje umowy" — umowy inwestora do Projektów, podzielone na etapy:
// czekają na mój podpis → czekają na podpis klienta → podpisane, plus
// wygenerowane, jeszcze niewysłane do podpisu. Projekt z umową znika
// z „Moich zleceń" (order-projects.functions) i trafia tutaj.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock, FileSignature, Loader2, MapPin, PenLine, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { formatDateTime, formatPLN } from "@/lib/labels";
import {
  ENVELOPE_STATUS_LABELS,
  SIGNER_STATUS_LABELS,
  type EnvelopeStatus,
  type SignerStatus,
} from "@/lib/esign/esign-core";
import type { ContractStage } from "@/lib/investor-agreements/my-contracts-core";
import { getMyContracts, type MyContract } from "@/lib/investor-agreements/my-contracts.functions";

export const Route = createFileRoute("/inwestor/moje-umowy")({
  component: MyContractsPage,
});

const SECTIONS: Array<{
  stage: ContractStage;
  title: string;
  empty: string;
  icon: typeof Clock;
  tone: string;
}> = [
  {
    stage: "czeka_na_mnie",
    title: "Czekają na mój podpis",
    empty: "Nic nie czeka na Twój podpis.",
    icon: PenLine,
    tone: "border-l-amber-500",
  },
  {
    stage: "czeka_na_klienta",
    title: "Czekają na podpis klienta",
    empty: "Żadna umowa nie czeka na klienta.",
    icon: Clock,
    tone: "border-l-blue-500",
  },
  {
    stage: "podpisane",
    title: "Podpisane",
    empty: "Jeszcze nie ma podpisanych umów.",
    icon: CheckCircle2,
    tone: "border-l-emerald-500",
  },
  {
    stage: "do_wyslania",
    title: "Wygenerowane — do wysłania do podpisu",
    empty: "Brak umów czekających na wysyłkę.",
    icon: Send,
    tone: "border-l-slate-400",
  },
];

function MyContractsPage() {
  const fetchContracts = useServerFn(getMyContracts);
  const { data, isLoading } = useQuery({
    queryKey: ["my-contracts"],
    queryFn: () => fetchContracts(),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wczytywanie umów…
      </div>
    );
  }
  const by = (stage: ContractStage) => data.contracts.filter((c) => c.stage === stage);

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Panel inwestora"
        title={`Moje umowy (${data.contracts.length})`}
        subtitle="Umowy do Twoich Projektów. Po wygenerowaniu umowy Projekt znika z „Moich zleceń” i jest tutaj — aż do kompletu podpisów."
      />
      {SECTIONS.map((sec) => {
        const items = by(sec.stage);
        // Pusta sekcja „do wysłania" nic nie wnosi — chowamy ją.
        if (sec.stage === "do_wyslania" && items.length === 0) return null;
        const Icon = sec.icon;
        return (
          <section key={sec.stage} className="space-y-3">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Icon className="h-4 w-4 text-muted-foreground" />
              {sec.title}
              <Badge variant="secondary">{items.length}</Badge>
            </h2>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{sec.empty}</p>
            ) : (
              <div className="space-y-3">
                {items.map((c) => (
                  <ContractCard key={c.applicationId} contract={c} tone={sec.tone} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ContractCard({ contract: c, tone }: { contract: MyContract; tone: string }) {
  const env = c.envelope;
  return (
    <Card className={cn("border-l-4", tone)}>
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium">{c.clientName ?? "Klient"}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {c.loanAmount ? <span>{formatPLN(c.loanAmount)}</span> : null}
              {c.city ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {c.city}
                </span>
              ) : null}
              {env ? <span>{env.publicId}</span> : null}
            </div>
          </div>
          {env ? (
            <Badge variant="outline">
              {ENVELOPE_STATUS_LABELS[env.status as EnvelopeStatus] ?? env.status}
            </Badge>
          ) : (
            <Badge variant="outline">Niewysłana</Badge>
          )}
        </div>

        {env && env.signers.length > 0 ? (
          <ul className="space-y-1 text-xs">
            {env.signers.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-x-3">
                <span>
                  {s.name}
                  {s.roleLabel ? (
                    <span className="text-muted-foreground"> · {s.roleLabel}</span>
                  ) : null}
                  {s.isMe ? <span className="text-muted-foreground"> (Ty)</span> : null}
                </span>
                <span
                  className={cn(
                    "font-medium",
                    s.status === "podpisany"
                      ? "text-emerald-700 dark:text-emerald-400"
                      : s.status === "odrzucony" || s.status === "niezgodnosc"
                        ? "text-red-700 dark:text-red-400"
                        : "text-muted-foreground",
                  )}
                >
                  {SIGNER_STATUS_LABELS[s.status as SignerStatus] ?? s.status}
                  {s.signedAt ? ` · ${formatDateTime(s.signedAt)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {env?.completedAt
              ? `Podpisana ${formatDateTime(env.completedAt)}`
              : env?.sentAt
                ? `Wysłana ${formatDateTime(env.sentAt)}`
                : c.generatedAt
                  ? `Wygenerowana ${formatDateTime(c.generatedAt)}`
                  : null}
          </span>
          {c.stage === "do_wyslania" ? (
            <Button asChild size="sm">
              <Link to="/inwestor/podpisy" search={{ wniosek: c.applicationId } as never}>
                <Send className="mr-2 h-4 w-4" /> Wyślij do podpisu
              </Link>
            </Button>
          ) : env ? (
            <Button asChild size="sm" variant={c.stage === "czeka_na_mnie" ? "default" : "outline"}>
              <Link to="/inwestor/podpisy" search={{ koperta: env.id } as never}>
                <FileSignature className="mr-2 h-4 w-4" />
                {c.stage === "czeka_na_mnie" ? "Podpisz umowę" : "Szczegóły i pliki"}
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
