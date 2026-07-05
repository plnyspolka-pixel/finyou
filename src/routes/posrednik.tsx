import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard, Users, UserCheck, FileText, FilePlus2, Mail, UserCircle } from "lucide-react";
import { PanelShell, type NavGroup } from "@/components/layout/panel-shell";

export const Route = createFileRoute("/posrednik")({
  component: OperatorLayout,
});

const groups: NavGroup[] = [
  {
    items: [
      { to: "/posrednik", label: "Pulpit", icon: LayoutDashboard, exact: true },
      { to: "/posrednik/leady", label: "Leady (wszystkie)", icon: Users },
      { to: "/posrednik/moje-leady", label: "Moje leady", icon: UserCheck },
      { to: "/posrednik/wniosek", label: "Wprowadź wniosek", icon: FilePlus2 },
      { to: "/posrednik/wnioski", label: "Moje wnioski", icon: FileText },
      { to: "/posrednik/skrzynka", label: "Skrzynka mailowa", icon: Mail },
      { to: "/posrednik/profil", label: "Mój profil", icon: UserCircle },
    ],
  },


];

function OperatorLayout() {
  return (
    <PanelShell title="Panel pośrednika" allow={["operator", "administrator"]} groups={groups} />
  );
}

