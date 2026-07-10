import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard, User, Bell, Handshake } from "lucide-react";
import { PanelShell, type NavGroup } from "@/components/layout/panel-shell";

export const Route = createFileRoute("/klient")({
  component: KlientLayout,
});

const groups: NavGroup[] = [
  {
    items: [
      { to: "/klient", label: "Twoja oferta", icon: LayoutDashboard, exact: true },
      { to: "/klient/propozycje", label: "Propozycje umowy pożyczki", icon: Handshake },
      { to: "/klient/profil", label: "Profil", icon: User },
      { to: "/klient/powiadomienia", label: "Powiadomienia", icon: Bell },
    ],
  },
];

function KlientLayout() {
  return <PanelShell title="Panel klienta" allow={["klient", "administrator"]} groups={groups} />;
}
