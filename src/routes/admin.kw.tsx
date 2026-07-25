import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { KwAnalysisSection } from "@/components/kw-analysis/kw-analysis-section";

export const Route = createFileRoute("/admin/kw")({
  component: AdminKwPage,
});

function AdminKwPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6" /> Analiza księgi wieczystej
        </h1>
        <p className="text-sm text-muted-foreground">
          Deterministyczna analiza treści KW według polityki ryzyka Finance You: miejsce hipoteki,
          zdolność egzekucyjna, aktywne wzmianki, rozbieżności własności i wymagane dokumenty.
          Analiza korzysta z pobranej treści KW (CMD KW Engine) — pobierz odpis KW przed
          uruchomieniem.
        </p>
      </div>
      <KwAnalysisSection />
    </div>
  );
}
