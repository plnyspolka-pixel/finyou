import { createFileRoute } from "@tanstack/react-router";
import { Users, UserCheck, FileText, FilePlus2, Mail, UserCircle } from "lucide-react";
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
      { to: "/operator/wnioski", label: "Moje wnioski", icon: FileText },
      { to: "/operator/oferta-wewnetrzna", label: "Oferta wewnętrzna", icon: Calculator },
      { to: "/operator/skrzynka", label: "Skrzynka mailowa", icon: Mail },
      { to: "/operator/profil", label: "Mój profil", icon: UserCircle },
    ],
  },
];

function OperatorLayout() {
  return (
    <PanelShell
      title="Panel operatora"
      allow={["operator", "operator_wewnetrzny", "administrator"]}
      groups={groups}
    />
  );
}
