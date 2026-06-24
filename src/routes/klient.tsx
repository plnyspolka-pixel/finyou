import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard, User, Bell } from "lucide-react";
import { PanelShell, type NavGroup } from "@/components/layout/panel-shell";

export const Route = createFileRoute("/klient")({
  component: KlientLayout,
});

const groups: NavGroup[] = [
  {
    items: [
      { to: "/klient", label: "Twoja oferta", icon: LayoutDashboard, exact: true },
      { to: "/klient/profil", label: "Profil", icon: User },
      { to: "/klient/powiadomienia", label: "Powiadomienia", icon: Bell },
    ],
  },
];

function KlientLayout() {
  // Brak `allow` = wystarczy bycie zalogowanym (każdy uwierzytelniony użytkownik to klient).
  return <PanelShell title="Panel klienta" groups={groups} />;
}
