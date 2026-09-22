import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
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
} from "lucide-react";
import { PanelShell, type NavGroup } from "@/components/layout/panel-shell";
import { InvestorAssistantWidget } from "@/components/inwestor/assistant-widget";
import { useAccessState } from "@/hooks/use-access";

export const Route = createFileRoute("/inwestor")({
  component: InwestorLayout,
});

// Nawigacja pakietu PRO (3 000 zł / 6 mies. + 5% od udzielonej pożyczki) —
// oraz personelu. Zawiera moduły zarezerwowane dla PRO: Analitykę, Akademię,
// kalkulator compliance, AML i windykację AI.
const proGroups: NavGroup[] = [
  {
    items: [
      // Pierwszy ekran panelu: pipeline inwestora (dane stron → KYC → screening
      // → pakiet umów → Zlecenie) i okazje z wykonania Zleceń.
      { to: "/inwestor/umowy", label: "Okazje inwestycyjne", icon: Target },
      { to: "/inwestor/oferty", label: "Moje oferty", icon: Tag },
      // Pipeline analityczny (KW → właściciele → analiza KW → ryzyko) — ten
      // sam, którym posługuje się zespół Finance You — dla okazji inwestora.
      { to: "/inwestor/analityka", label: "Analityka", icon: BarChart3 },
      // Jeden moduł dokumentów: agent umowy (silnik klauzul) + kreator
      // dokumentów DOCX (bez kategorii „Umowy" — umowy tylko z agenta).
      { to: "/inwestor/dokumenty", label: "Dokumenty i umowy", icon: FileText },
      { to: "/inwestor/windykacja", label: "Windykacja", icon: Gavel },
      { to: "/inwestor/aml", label: "AML", icon: ShieldCheck },
      { to: "/inwestor/szkolenia", label: "Akademia", icon: GraduationCap },
      { to: "/inwestor/kalkulator", label: "Kalkulator compliance", icon: Calculator },
      // Pakiety oraz historia płatności i faktur w jednym module.
      { to: "/inwestor/abonament", label: "Pakiet i płatności", icon: CreditCard },
      { to: "/inwestor/profil", label: "Profil", icon: User },
    ],
  },
];

// Nawigacja pakietu Podstawowego (0 zł): pipeline i Zlecenia, okazje kupowane
// pojedynczo, generator umowy pożyczki, pakiet z płatnościami i profil.
// Analityka, Akademia, kalkulator compliance, AML i windykacja AI są w PRO.
const basicGroups: NavGroup[] = [
  {
    items: [
      { to: "/inwestor/umowy", label: "Okazje inwestycyjne", icon: Target },
      { to: "/inwestor/oferty", label: "Moje oferty", icon: Tag },
      { to: "/inwestor/dokumenty", label: "Dokumenty i umowy", icon: FileText },
      { to: "/inwestor/abonament", label: "Pakiet i płatności", icon: CreditCard },
      { to: "/inwestor/profil", label: "Profil", icon: User },
    ],
  },
];

// Ścieżki dostępne w pakiecie Podstawowym (routing — pierwsza z trzech warstw
// egzekwowania; server functions i RLS blokują resztę niezależnie).
const BASIC_PATHS = [
  // Głębokie linki modułu projektów (przypisania, propozycje) — dane i tak
  // chronią server functions + RLS.
  "/inwestor/projekty",
  // Pipeline i pakiet umów muszą być dostępne PRZED zakupem czegokolwiek —
  // Podstawowy składa Zlecenia bez opłat stałych.
  "/inwestor/umowy",
  // Dokumenty i umowy: generator umowy pożyczki jest w zakresie pakietu
  // Podstawowego (kreator dokumentów DOCX w tym module wymaga PRO).
  "/inwestor/dokumenty",
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
