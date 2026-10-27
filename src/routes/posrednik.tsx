import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  PenLine,
  FileText,
  FilePlus2,
  Mail,
  UserCircle,
  Receipt,
  Coins,
} from "lucide-react";
import { PanelShell, type NavGroup } from "@/components/layout/panel-shell";

export const Route = createFileRoute("/posrednik")({
  component: BrokerLayout,
});

// Pośrednik bez bramki płatności, szkoleń i materiałów: wnioski klientów,
// CRM reakcji inwestorów, skrzynka do wysyłki ofert i prowizje od uruchomionych
// pożyczek jego klientów (jedyne źródło zarobku pośrednika).
const groups: NavGroup[] = [
  {
    items: [
      { to: "/posrednik/wniosek", label: "Wprowadź wniosek", icon: FilePlus2 },
      { to: "/posrednik/wnioski", label: "Moje wnioski", icon: FileText },
      { to: "/posrednik/reakcje", label: "Reakcje inwestorów", icon: Activity },
      { to: "/posrednik/skrzynka", label: "Skrzynka mailowa", icon: Mail },
      { to: "/posrednik/podpisy", label: "Umowy klientów", icon: PenLine },
    ],
  },
  {
    label: "Moje prowizje",
    items: [
      { to: "/posrednik/prowizje", label: "Prowizje od pożyczek", icon: Coins },
      { to: "/posrednik/rozliczenia", label: "Wypłaty i rozliczenia", icon: Receipt },
    ],
  },
  {
    items: [{ to: "/posrednik/profil", label: "Mój profil", icon: UserCircle }],
  },
];

function BrokerLayout() {
  return (
    <PanelShell
      title="Panel pośrednika"
      allow={["posrednik", "operator", "administrator"]}
      groups={groups}
    />
  );
}
