import { createFileRoute } from "@tanstack/react-router";
import { LoanCalculator } from "@/components/loan-calculator";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { DyrektorFinansowyChat } from "@/components/inwestor/dyrektor-finansowy-chat";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Calculator } from "lucide-react";

export const Route = createFileRoute("/inwestor/kalkulator")({
  component: DyrektorFinansowy,
});

function DyrektorFinansowy() {
  return (
    <div className="space-y-6 max-w-5xl">
      <FancyPageHeader
        eyebrow="Narzędzia inwestora"
        title="Dyrektor finansowy"
        subtitle="Asystent AI z dostępem do Twoich danych, ofert, pełnych danych klientów po akceptacji oraz wzorów dokumentów — plus kalkulator pożyczki z kontrolą limitów odsetek, MPKK i krotności spłaty."
      />

      <Tabs defaultValue="ai" className="w-full">
        <TabsList>
          <TabsTrigger value="ai">
            <Bot className="mr-2 h-4 w-4" />
            Asystent AI
          </TabsTrigger>
          <TabsTrigger value="kalkulator">
            <Calculator className="mr-2 h-4 w-4" />
            Kalkulator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="mt-4">
          <DyrektorFinansowyChat />
        </TabsContent>

        <TabsContent value="kalkulator" className="mt-4">
          <LoanCalculator investorGuidance />
        </TabsContent>
      </Tabs>
    </div>
  );
}
