// „Pobierz PDF” raportu analitycznego (Analityka, analiza własnego wniosku,
// raport Projektu w „Moich zleceniach”). PDF powstaje w przeglądarce z danych,
// które widok już wczytał; pdf-lib z fontami ładujemy dopiero po kliknięciu.
import { useMutation } from "@tanstack/react-query";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { downloadBytes } from "@/lib/download-file";
import type { InvestorReportSource } from "@/lib/investor-analytics/report-pdf";

/** Nazwa do stopki „Przygotowano dla”: profil inwestora, potem dane konta, na końcu e-mail. */
async function investorDisplayName(user: User | null): Promise<string> {
  if (!user) return "Inwestor";
  try {
    const { data } = await supabase
      .from("investors")
      .select("first_name, last_name, company_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const company = data?.company_name?.trim();
    if (company) return company;
    const person = [data?.first_name, data?.last_name]
      .map((s) => s?.trim())
      .filter(Boolean)
      .join(" ");
    if (person) return person;
  } catch {
    // Brak profilu inwestora nie blokuje pobrania — zostaje nazwa z konta.
  }
  const meta = user.user_metadata?.full_name;
  if (typeof meta === "string" && meta.trim()) return meta.trim();
  return user.email ?? "Inwestor";
}

export function ReportPdfButton({
  source,
  disabled = false,
  label = "Pobierz PDF",
}: {
  /** Dane widoku (te same, które widać na ekranie). */
  source: InvestorReportSource;
  /** Np. dopóki żaden krok analizy nie jest gotowy. */
  disabled?: boolean;
  label?: string;
}) {
  const { user } = useAuth();
  const pdf = useMutation({
    mutationFn: async () => {
      const [mod, preparedFor] = await Promise.all([
        import("@/lib/investor-analytics/report-pdf"),
        investorDisplayName(user),
      ]);
      const model = mod.buildInvestorReportModel(source);
      const bytes = await mod.renderInvestorReportPdf(model, { preparedFor });
      downloadBytes(bytes, mod.reportPdfFilename(model));
    },
    onError: (e) =>
      toast.error(
        `Nie udało się przygotować PDF: ${e instanceof Error ? e.message : "nieznany błąd"}`,
      ),
  });

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled || pdf.isPending}
      title={
        disabled
          ? "Raport PDF będzie dostępny po zakończeniu pierwszego kroku analizy."
          : "Pobierz raport analityczny jako PDF"
      }
      onClick={() => pdf.mutate()}
    >
      {pdf.isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <FileDown className="mr-2 h-4 w-4" />
      )}
      {pdf.isPending ? "Przygotowuję PDF…" : label}
    </Button>
  );
}
