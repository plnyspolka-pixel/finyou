import { createFileRoute } from "@tanstack/react-router";
import {
  Users,
  UserCheck,
  FileText,
  FilePlus2,
  Mail,
  UserCircle,
  Receipt,
  MessageCircle,
  Sparkles,
  Calculator,
  HandCoins,
} from "lucide-react";
import { PanelShell, type NavGroup } from "@/components/layout/panel-shell";

export const Route = createFileRoute("/operator")({
  component: OperatorLayout,
});

const groups: NavGroup[] = [
  {
    items: [
      { to: "/operator/leady", label: "Leady (wszystkie)", icon: Users },
      { to: "/operator/moje-leady", label: "Moje leady", icon: UserCheck },
      { to: "/operator/wniosek", label: "Wprowadź wniosek", icon: FilePlus2 },
      { to: "/operator/kreator-udzielenia", label: "Kreator pożyczki (AI)", icon: Sparkles },
      { to: "/operator/wnioski", label: "Wnioski (wszystkie)", icon: FileText },
      { to: "/operator/oferty", label: "Oferty", icon: HandCoins },
      { to: "/operator/faktury", label: "Wystaw fakturę", icon: Receipt },
      { to: "/operator/kalkulator", label: "Kalkulator", icon: Calculator },
      { to: "/operator/skrzynka", label: "Skrzynka mailowa", icon: Mail },
      { to: "/operator/messenger", label: "Messenger", icon: MessageCircle },
      { to: "/operator/czat", label: "Czat na stronie", icon: MessageCircle },
      { to: "/operator/profil", label: "Mój profil", icon: UserCircle },
    ],
  },
];

function OperatorLayout() {
  return (
    <PanelShell
      title="Panel operatora"
      allow={["operator", "administrator"]}
      groups={groups}
      fancy
    />
  );
}
