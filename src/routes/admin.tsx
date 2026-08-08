import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { FileText, Receipt, FileCheck, Building2 } from "lucide-react";
import { PanelShell, type NavGroup } from "@/components/layout/panel-shell";
import { AdminTopBar } from "@/components/admin/admin-top-bar";
import { AdminSearchDialog, AdminSearchIconTrigger } from "@/components/admin/admin-search";
import { AdminBotLauncher } from "@/components/admin/admin-bot-launcher";
import { SectionTabs } from "@/components/admin/section-tabs";
import { adminSections, type AdminSection } from "@/lib/admin-nav";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

// Widok dla samej księgowości: tylko moduł księgowości + rozliczenia programu.
// Musi odpowiadać `accountingAllowedPaths` w src/lib/admin-nav.ts.
const accountingGroups: NavGroup[] = [
  { items: [{ to: "/admin/ksiegowosc", label: "Pulpit księgowości", icon: Receipt, exact: true }] },
  {
    label: "Księgowość",
    items: [
      { to: "/admin/ksiegowosc/faktury", label: "Faktury sprzedaży", icon: FileText },
      { to: "/admin/ksiegowosc/podmioty", label: "Podmioty gospodarcze", icon: Building2 },
      {
        to: "/admin/program-posrednikow/rozliczenia",
        label: "Rozliczenia B2B / nierejestrowana",
        icon: FileCheck,
      },
    ],
  },
];

// Ścieżki dostępne dla roli `ksiegowosc` — zawężają indeks wyszukiwarki.
const accountingPaths = accountingGroups.flatMap((g) => g.items.map((i) => i.to));

// Widok `ksiegowosc` w stylistyce sekcyjnego sidebara: te same 4 linki co w
// `accountingGroups`, każdy jako syntetyczna „sekcja" (puste hubPath = link
// bezpośredni, bez huba). Funkcjonalnie identyczne z widokiem sprzed przebudowy.
const accountingSections: AdminSection[] = accountingGroups.flatMap((g) =>
  g.items.map((i) => ({
    id: `ksiegowosc-${i.to}`,
    label: i.label,
    icon: i.icon,
    hubPath: "",
    accent: "teal" as const,
    description: "",
    items: [
      { to: i.to, label: i.label, icon: i.icon, description: "", synonyms: [], exact: i.exact },
    ],
  })),
);

function AdminLayout() {
  const { roles } = useAuth();
  const isStaff = roles.includes("administrator") || roles.includes("operator");
  const isAccountant = roles.includes("ksiegowosc");
  const accountingOnly = !isStaff && isAccountant;
  return (
    <PanelShell
      title={isStaff ? "Panel administratora" : "Panel księgowości"}
      allow={["administrator", "ksiegowosc"]}
      sections={accountingOnly ? accountingSections : adminSections}
      topBar={
        <>
          <AdminTopBar />
          <SectionTabs />
        </>
      }
      mobileHeaderExtra={<AdminSearchIconTrigger />}
      footer={
        <>
          <AdminSearchDialog allowedPaths={accountingOnly ? accountingPaths : undefined} />
          <AdminBotLauncher />
        </>
      }
    />
  );
}
