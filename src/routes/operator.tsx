import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard, Users, FileText, Wand2 } from "lucide-react";
import { PanelShell, type NavGroup } from "@/components/layout/panel-shell";

export const Route = createFileRoute("/operator")({
  component: OperatorLayout,
});

const groups: NavGroup[] = [
  {
    items: [
      { to: "/operator", label: "Pulpit", icon: LayoutDashboard, exact: true },
      { to: "/operator/leady", label: "Leady (wszystkie)", icon: Users },
      { to: "/operator/kreator-dokumentow", label: "Kreator dokumentów", icon: Wand2 },
      { to: "/operator/dokumenty", label: "Moje dokumenty", icon: FileText },
    ],
  },
];

function OperatorLayout() {
  return (
    <PanelShell title="Panel operatora" allow={["operator", "administrator"]} groups={groups} />
  );
}
