import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoanCalculator } from "@/components/loan-calculator";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";

export const Route = createFileRoute("/inwestor/kalkulator")({
  component: Kalkulator,
});

function Kalkulator() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6 max-w-5xl">
      <FancyPageHeader
        eyebrow="Narzędzia inwestora"
        title="Kalkulator pożyczki"
        subtitle="Ustaw parametry — od razu zobaczysz harmonogram, koszty oraz ostrzeżenia o limitach odsetek, MPKK i krotności spłaty. „Wyślij do kreatora” otwiera kreator umowy, a harmonogram spłat rozpoczyna rozmowę z agentem umowy."
      />
      <LoanCalculator
        investorGuidance
        // „Wyślij do kreatora": harmonogram trafia do kreatora umowy jako
        // pierwsza wiadomość rozmowy (UmowaAgentPanel czyta handoff po wejściu).
        onSentToCreator={() => void navigate({ to: "/inwestor/dokumenty" })}
      />
    </div>
  );
}
