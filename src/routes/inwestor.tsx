import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  ListChecks,
  Tag,
  FileSignature,
  FileText,
  GraduationCap,
  Calculator,
  CreditCard,
  User,
  Gavel,
  Receipt,
  ShieldCheck,
  FileCheck,
} from "lucide-react";
import { PanelShell, type NavGroup } from "@/components/layout/panel-shell";
import { InvestorAssistantWidget } from "@/components/inwestor/assistant-widget";
import { useAccessState } from "@/hooks/use-access";

export const Route = createFileRoute("/inwestor")({
  component: InwestorLayout,
});

// Nawigacja pakietu PRO (3 000 zł / 6 mies. + 5% od udzielonej pożyczki) —
// oraz personelu. Zawiera moduły zarezerwowane dla PRO: Akademię, kalkulator
// compliance, AML i windykację AI.
const proGroups: NavGroup[] = [
  {
    items: [
      // Główny ekran panelu: wyszukiwarka dostępnych wniosków (tylko wnioski —
      // tworzenie umowy ma osobną, JEDYNĄ zakładkę „Tworzenie umowy").
      { to: "/inwestor", label: "Dostępne wnioski", icon: ListChecks, exact: true },
      // Jedyna ścieżka tworzenia umowy: agent AI + deterministyczny silnik klauzul.
      { to: "/inwestor/kreator-umowy", label: "Tworzenie umowy", icon: FileSignature },
      { to: "/inwestor/oferty", label: "Moje oferty", icon: Tag },
      { to: "/inwestor/windykacja", label: "Windykacja", icon: Gavel },
      { to: "/inwestor/aml", label: "AML", icon: ShieldCheck },
      // Kreator dokumentów BEZ kategorii „Umowy" — umowy powstają wyłącznie
      // w zakładce „Tworzenie umowy".
      { to: "/inwestor/kreator-dokumentow", label: "Kreator dokumentów", icon: FileText },
      { to: "/inwestor/szkolenia", label: "Akademia", icon: GraduationCap },
      { to: "/inwestor/kalkulator", label: "Kalkulator compliance", icon: Calculator },
      { to: "/inwestor/abonament", label: "Pakiet", icon: CreditCard },
      { to: "/inwestor/umowy", label: "Pipeline i Zlecenia", icon: FileCheck },
      { to: "/inwestor/platnosci", label: "Płatności i faktury", icon: Receipt },
      { to: "/inwestor/profil", label: "Profil", icon: User },
    ],
  },
];

// Nawigacja pakietu Podstawowego (0 zł): cały pipeline, Zlecenia, okazje
// kupowane pojedynczo, generator umowy pożyczki, płatności i profil.
// Akademia, kalkulator compliance, AML i windykacja AI są w pakiecie PRO.
const basicGroups: NavGroup[] = [
  {
    items: [
      { to: "/inwestor", label: "Dostępne wnioski", icon: ListChecks, exact: true },
      { to: "/inwestor/umowy", label: "Pipeline i Zlecenia", icon: FileCheck },
      { to: "/inwestor/kreator-umowy", label: "Generator umowy pożyczki", icon: FileSignature },
      { to: "/inwestor/oferty", label: "Moje oferty", icon: Tag },
      { to: "/inwestor/abonament", label: "Pakiety", icon: CreditCard },
      { to: "/inwestor/platnosci", label: "Płatności i faktury", icon: Receipt },
      { to: "/inwestor/profil", label: "Profil", icon: User },
    ],
  },
];

// Ścieżki dostępne w pakiecie Podstawowym (routing — pierwsza z trzech warstw
// egzekwowania; server functions i RLS blokują resztę niezależnie).
const BASIC_PATHS = [
  // Bramka zamkniętego modułu (aplikacja → KYC → screening → decyzja Finance
  // You) żyje w zakładce „Dostępne wnioski" (/inwestor). Ścieżki
  // /inwestor/projekty zostają dostępne dla głębokich linków (przypisania,
  // propozycje) — dane i tak chronią server functions + RLS.
  "/inwestor/projekty",
  // Pipeline i pakiet umów muszą być dostępne PRZED zakupem czegokolwiek —
  // Podstawowy składa Zlecenia bez opłat stałych.
  "/inwestor/umowy",
  // Generator umowy pożyczki jest w zakresie pakietu Podstawowego.
  "/inwestor/kreator-umowy",
  "/inwestor/abonament",
  "/inwestor/platnosci",
  "/inwestor/profil",
  "/inwestor/oferty",
];

function AccessRedirectGate() {
  const { state, loading, hasFullAccess } = useAccessState("investor");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !state || hasFullAccess) return;
    const isBasic =
      pathname === "/inwestor" ||
      pathname === "/inwestor/" ||
      BASIC_PATHS.some((p) => pathname.startsWith(p));
    if (!isBasic) {
      void navigate({ to: "/inwestor/abonament" });
    }
  }, [loading, state, hasFullAccess, pathname, navigate]);

  return null;
}

function InwestorLayout() {
  const { loading, hasFullAccess } = useAccessState("investor");
  const groups = loading || hasFullAccess ? proGroups : basicGroups;
  return (
    <>
      <AccessRedirectGate />
      <PanelShell title="Panel inwestora" allow={["inwestor", "administrator"]} groups={groups} />
      {/* Asystent Klubu tylko dla inwestorów z wykupionym dostępem
          (server functions i tak egzekwują to niezależnie). */}
      {!loading && hasFullAccess && <InvestorAssistantWidget />}
    </>
  );
}
