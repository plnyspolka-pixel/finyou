import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard, Users, FileText, Wand2 } from "lucide-react";
import { PanelShell, type NavGroup } from "@/components/layout/panel-shell";

export const Route = createFileRoute("/posrednik")({
  component: OperatorLayout,
});

const groups: NavGroup[] = [
  {
    items: [
      { to: "/posrednik", label: "Pulpit", icon: LayoutDashboard, exact: true },
      { to: "/posrednik/leady", label: "Leady (wszystkie)", icon: Users },
      { to: "/posrednik/kreator-dokumentow", label: "Kreator dokumentów", icon: Wand2 },
      { to: "/posrednik/dokumenty", label: "Moje dokumenty", icon: FileText },
    ],
  },
];

function OperatorLayout() {
  return (
    <PanelShell title="Panel pośrednika" allow={["operator", "administrator"]} groups={groups} />
  );
}
