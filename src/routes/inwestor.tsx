import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  ListChecks,
  Tag,
  FileSignature,
  GraduationCap,
  Calculator,
  CreditCard,
  User,
  Gavel,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { PanelShell, type NavGroup } from "@/components/layout/panel-shell";
import { useAccessState } from "@/hooks/use-access";

export const Route = createFileRoute("/inwestor")({
  component: InwestorLayout,
});

// Pełna nawigacja — dla inwestora z aktywnym płatnym dostępem (i personelu).
const fullGroups: NavGroup[] = [
  {
    items: [
      { to: "/inwestor", label: "Dostępne wnioski", icon: ListChecks, exact: true },
      { to: "/inwestor/oferty", label: "Moje oferty", icon: Tag },
      { to: "/inwestor/windykacja", label: "Windykacja", icon: Gavel },
      { to: "/inwestor/aml", label: "AML", icon: ShieldCheck },
      { to: "/inwestor/kreator-dokumentow", label: "Kreator dokumentów", icon: FileSignature },
      { to: "/inwestor/szkolenia", label: "Akademia", icon: GraduationCap },
      { to: "/inwestor/kalkulator", label: "Kalkulator", icon: Calculator },
      { to: "/inwestor/abonament", label: "Dostęp", icon: CreditCard },
      { to: "/inwestor/platnosci", label: "Płatności i faktury", icon: Receipt },
      { to: "/inwestor/profil", label: "Profil", icon: User },
    ],
  },
];

// Nawigacja bez płatnego dostępu: bramka modułu w „Dostępnych wnioskach"
// (zajawki dopiero po pozytywnym KYC), kalkulator, 3 darmowe lekcje Akademii,
// zakup, płatności, profil.
const limitedGroups: NavGroup[] = [
  {
    items: [
      { to: "/inwestor", label: "Dostępne wnioski", icon: ListChecks, exact: true },
      { to: "/inwestor/oferty", label: "Moje oferty", icon: Tag },
      { to: "/inwestor/aml", label: "AML", icon: ShieldCheck },
      { to: "/inwestor/kalkulator", label: "Kalkulator", icon: Calculator },
      { to: "/inwestor/szkolenia", label: "Akademia (3 darmowe lekcje)", icon: GraduationCap },
      { to: "/inwestor/abonament", label: "Pełny dostęp", icon: CreditCard },
      { to: "/inwestor/platnosci", label: "Płatności i faktury", icon: Receipt },
      { to: "/inwestor/profil", label: "Profil", icon: User },
    ],
  },
];

// Ścieżki dostępne bez płatnego dostępu (routing — pierwsza z trzech warstw
// egzekwowania; server functions i RLS blokują resztę niezależnie).
const FREE_PATHS = [
  "/inwestor/aml", // moduł AML w całości dostępny od pierwszego wejścia, bez kłódek i planów
  // Bramka zamkniętego modułu (aplikacja → KYC → screening → decyzja Finance
  // You) żyje teraz w zakładce „Dostępne wnioski" (/inwestor). Ścieżki
  // /inwestor/projekty zostają dostępne dla głębokich linków (przypisania,
  // propozycje) — dane i tak chronią server functions + RLS.
  "/inwestor/projekty",
  "/inwestor/abonament",
  "/inwestor/platnosci",
  "/inwestor/profil",
  "/inwestor/oferty",
  "/inwestor/kalkulator",
  "/inwestor/szkolenia",
];

function AccessRedirectGate() {
  const { state, loading, hasFullAccess } = useAccessState("investor");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !state || hasFullAccess) return;
    const isFree =
      pathname === "/inwestor" ||
      pathname === "/inwestor/" ||
      FREE_PATHS.some((p) => pathname.startsWith(p));
    if (!isFree) {
      void navigate({ to: "/inwestor/abonament" });
    }
  }, [loading, state, hasFullAccess, pathname, navigate]);

  return null;
}

function InwestorLayout() {
  const { loading, hasFullAccess } = useAccessState("investor");
  const groups = loading || hasFullAccess ? fullGroups : limitedGroups;
  return (
    <>
      <AccessRedirectGate />
      <PanelShell title="Panel inwestora" allow={["inwestor", "administrator"]} groups={groups} />
    </>
  );
}
