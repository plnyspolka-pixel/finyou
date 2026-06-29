import { createFileRoute } from "@tanstack/react-router";
import {
  ListChecks,
  Tag,
  FileSignature,
  MessageSquare,
  GraduationCap,
  Calculator,
  CreditCard,
  User,
} from "lucide-react";
import { PanelShell, type NavGroup } from "@/components/layout/panel-shell";

export const Route = createFileRoute("/inwestor")({
  component: InwestorLayout,
});

const groups: NavGroup[] = [
  {
    items: [
      { to: "/inwestor", label: "Dostępne wnioski", icon: ListChecks, exact: true },
      { to: "/inwestor/oferty", label: "Moje oferty", icon: Tag },
      { to: "/inwestor/kreator-dokumentow", label: "Kreator dokumentów", icon: FileSignature },
      
      { to: "/inwestor/szkolenia", label: "Akademia", icon: GraduationCap },
      { to: "/inwestor/kalkulator", label: "Kalkulator", icon: Calculator },
      { to: "/inwestor/abonament", label: "Abonament", icon: CreditCard },
      { to: "/inwestor/profil", label: "Profil", icon: User },
    ],
  },
];

function InwestorLayout() {
  return (
    <PanelShell title="Panel inwestora" allow={["inwestor", "administrator"]} groups={groups} />
  );
}
