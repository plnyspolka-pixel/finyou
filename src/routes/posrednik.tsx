import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard, Users, UserCheck, FileText, FilePlus2, Mail, Megaphone, Wallet, Network, Share2, Coins } from "lucide-react";
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
    ],
  },

  {
    label: "Program pośredników",
    items: [
      { to: "/posrednik/program", label: "Program pośredników", icon: Network, exact: true },
      { to: "/posrednik/struktura", label: "Struktura partnerska", icon: Share2 },
      { to: "/posrednik/prowizje", label: "Prowizje sieciowe", icon: Coins },
      { to: "/posrednik/rozliczenia", label: "Rozliczenia i wypłaty", icon: Wallet },
      { to: "/posrednik/marketing", label: "Materiały marketingowe", icon: Megaphone },
    ],
  },
];

function OperatorLayout() {
  return (
    <PanelShell title="Panel pośrednika" allow={["operator", "administrator"]} groups={groups} />
  );
}

