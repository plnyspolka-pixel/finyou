import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { investorHomePath } from "@/components/inwestor/investor-nav";
import { getMyInvestorFlags } from "@/lib/investor-agreements/legal-pack.functions";

// Zakładka „Dostępne wnioski" została usunięta z panelu inwestora. Pierwszym
// ekranem jest pipeline „Złóż zlecenie" (/inwestor/umowy); gdy inwestor ma już
// żywe Zlecenie, ta zakładka znika z menu, więc panel startuje od „Moich
// zleceń". Trasa zostaje wyłącznie jako przekierowanie dla starych linków
// (e-maile, zakładki).
export const Route = createFileRoute("/inwestor/")({
  component: InvestorHome,
});

function InvestorHome() {
  const fetchFlags = useServerFn(getMyInvestorFlags);
  const { data: flags, isError } = useQuery({
    queryKey: ["investor-flags"],
    queryFn: () => fetchFlags(),
    staleTime: 10 * 60_000,
  });
  if (!flags && !isError) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wczytywanie panelu…
      </div>
    );
  }
  return <Navigate to={investorHomePath(flags)} replace />;
}
