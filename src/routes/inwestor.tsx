import { createFileRoute } from "@tanstack/react-router";
import {
  Tag,
  FileText,
  GraduationCap,
  Calculator,
  CreditCard,
  User,
  Gavel,
  ShieldCheck,
  Target,
  BarChart3,
  Undo2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyInvestorFlags } from "@/lib/investor-agreements/legal-pack.functions";
import { ConsentGate } from "@/components/consent/consent-gate";
import { PanelShell, type NavGroup } from "@/components/layout/panel-shell";
import { InvestorAssistantWidget } from "@/components/inwestor/assistant-widget";

export const Route = createFileRoute("/inwestor")({
  component: InwestorLayout,
});

// Jedna nawigacja dla każdego inwestora — usługa Finance You dla Inwestora
// jest nieodpłatna (Umowa ramowa v7), więc nie ma paywalla ani podziału na
// pakiety. Abonament za dostęp do systemu — w przyszłości.
const navGroups: NavGroup[] = [
  {
    items: [
      // Pierwszy ekran panelu: pipeline inwestora (dane stron → KYC → screening
      // → pakiet umów → Zlecenie) i Projekty z wykonania Zleceń.
      { to: "/inwestor/umowy", label: "Zlecenia i Projekty", icon: Target },
      { to: "/inwestor/oferty", label: "Moje oferty", icon: Tag },
      // Pipeline analityczny (KW → właściciele → analiza KW → ryzyko) — ten
      // sam, którym posługuje się zespół Finance You — dla Projektów inwestora.
      { to: "/inwestor/analityka", label: "Analityka", icon: BarChart3 },
      // Jeden moduł dokumentów: agent umowy (silnik klauzul) + kreator
      // dokumentów DOCX (bez kategorii „Umowy" — umowy tylko z agenta).
      { to: "/inwestor/dokumenty", label: "Dokumenty i umowy", icon: FileText },
      { to: "/inwestor/windykacja", label: "Windykacja", icon: Gavel },
      { to: "/inwestor/aml", label: "AML", icon: ShieldCheck },
      { to: "/inwestor/szkolenia", label: "Akademia", icon: GraduationCap },
      { to: "/inwestor/kalkulator", label: "Kalkulator compliance", icon: Calculator },
      // Informacja o dostępie (bezpłatny) oraz historia płatności i faktur.
      { to: "/inwestor/abonament", label: "Dostęp i płatności", icon: CreditCard },
      { to: "/inwestor/profil", label: "Profil", icon: User },
    ],
  },
];

// Konsument ma stały link do odstąpienia od Umowy ramowej (Zał. 4).
const withdrawalGroup: NavGroup = {
  items: [{ to: "/inwestor/odstapienie", label: "Odstąpienie od umowy", icon: Undo2 }],
};

function InwestorLayout() {
  const fetchFlags = useServerFn(getMyInvestorFlags);
  const { data: flags } = useQuery({
    queryKey: ["investor-flags"],
    queryFn: () => fetchFlags(),
    staleTime: 10 * 60_000,
  });
  const groups = flags?.isConsumer ? [...navGroups, withdrawalGroup] : navGroups;
  return (
    <>
      <PanelShell
        title="Panel inwestora"
        allow={["inwestor", "administrator"]}
        groups={groups}
        wrapOutlet={(outlet) => <ConsentGate audience="inwestor">{outlet}</ConsentGate>}
      />
      <InvestorAssistantWidget />
    </>
  );
}
