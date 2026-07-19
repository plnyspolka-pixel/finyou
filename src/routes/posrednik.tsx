import { createFileRoute } from "@tanstack/react-router";
import {
  Users,
  UserCheck,
  FileText,
  FilePlus2,
  Mail,
  UserCircle,
  GraduationCap,
  CreditCard,
  Receipt,
  Network,
  Coins,
} from "lucide-react";
import { PanelShell, type NavGroup } from "@/components/layout/panel-shell";
import { useAccessState } from "@/hooks/use-access";

export const Route = createFileRoute("/posrednik")({
  component: BrokerLayout,
});

// Konto darmowe: własne oferty (limit 5), baza inwestorów przy dystrybucji,
// zakup pakietu, płatności/faktury, profil.
const freeGroups: NavGroup[] = [
  {
    items: [
      { to: "/posrednik/wniosek", label: "Wprowadź wniosek", icon: FilePlus2 },
      { to: "/posrednik/wnioski", label: "Moje wnioski", icon: FileText },
      { to: "/posrednik/abonament", label: "Pełny dostęp", icon: CreditCard },
      { to: "/posrednik/platnosci", label: "Płatności i faktury", icon: Receipt },
      { to: "/posrednik/profil", label: "Mój profil", icon: UserCircle },
    ],
  },
];

// Pełny (płatny) dostęp: dodatkowo leady Finance You, skrzynka, Akademia
// i moduły programu partnerskiego.
const paidGroups: NavGroup[] = [
  {
    items: [
      { to: "/posrednik/leady", label: "Leady (wszystkie)", icon: Users },
      { to: "/posrednik/moje-leady", label: "Moje leady", icon: UserCheck },
      { to: "/posrednik/wniosek", label: "Wprowadź wniosek", icon: FilePlus2 },
      { to: "/posrednik/wnioski", label: "Moje wnioski", icon: FileText },
      { to: "/posrednik/skrzynka", label: "Skrzynka mailowa", icon: Mail },
      { to: "/posrednik/szkolenia", label: "Akademia", icon: GraduationCap },
    ],
  },
  {
    label: "Program partnerski",
    items: [
      { to: "/posrednik/program", label: "Pulpit programu", icon: Network },
      { to: "/posrednik/prowizje", label: "Prowizje", icon: Coins },
      { to: "/posrednik/rozliczenia", label: "Rozliczenia", icon: Receipt },
    ],
  },
  {
    items: [
      { to: "/posrednik/abonament", label: "Pełny dostęp", icon: CreditCard },
      { to: "/posrednik/platnosci", label: "Płatności i faktury", icon: Receipt },
      { to: "/posrednik/profil", label: "Mój profil", icon: UserCircle },
    ],
  },
];

function BrokerLayout() {
  const { loading, hasFullAccess } = useAccessState("broker");
  const groups = loading || hasFullAccess ? paidGroups : freeGroups;
  return (
    <PanelShell
      title="Panel pośrednika"
      allow={["posrednik", "operator", "administrator"]}
      groups={groups}
    />
  );
}
