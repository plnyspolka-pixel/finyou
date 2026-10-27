import { createFileRoute } from "@tanstack/react-router";
import { Coins, Network, Receipt } from "lucide-react";
import { PanelShell, type NavGroup } from "@/components/layout/panel-shell";

export const Route = createFileRoute("/partner")({
  component: PartnerLayout,
});

// Program partnerski: link polecający dla inwestorów, prowizje i wypłaty.
const groups: NavGroup[] = [
  {
    items: [
      { to: "/partner/program", label: "Link i saldo", icon: Network },
      { to: "/partner/prowizje", label: "Prowizje", icon: Coins },
      { to: "/partner/rozliczenia", label: "Wypłaty i rozliczenia", icon: Receipt },
    ],
  },
];

function PartnerLayout() {
  return <PanelShell title="Panel partnera" allow={["partner", "administrator"]} groups={groups} />;
}
