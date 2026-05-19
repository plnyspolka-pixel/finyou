import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, FileText, Building, FolderOpen, PhoneCall, Briefcase, Send, Tag, Plug, Settings, LogOut, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const items = [
  { to: "/admin", label: "Pulpit", icon: LayoutDashboard, exact: true },
  { to: "/admin/leady", label: "Leady", icon: Users },
  { to: "/admin/wnioski", label: "Wnioski", icon: FileText },
  { to: "/admin/klienci", label: "Klienci", icon: Users },
  { to: "/admin/nieruchomosci", label: "Nieruchomości", icon: Building },
  { to: "/admin/dokumenty", label: "Dokumenty", icon: FolderOpen },
  { to: "/admin/follow-up", label: "Follow-up", icon: PhoneCall },
  { to: "/admin/inwestorzy", label: "Inwestorzy", icon: Briefcase },
  { to: "/admin/dystrybucja", label: "Dystrybucja ofert", icon: Send },
  { to: "/admin/oferty", label: "Oferty", icon: Tag },
  { to: "/admin/integracje", label: "Integracje", icon: Plug },
  { to: "/admin/role", label: "Role użytkowników", icon: ShieldCheck },
  { to: "/admin/ustawienia", label: "Ustawienia", icon: Settings },
];

function AdminLayout() {
  const { user, roles, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!user) { void navigate({ to: "/logowanie" }); return; }
    if (!roles.includes("administrator") && !roles.includes("operator")) {
      void navigate({ to: "/" });
    }
  }, [loading, user, roles, navigate]);

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Ładowanie…</div>;
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2 font-semibold">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">FY</div>
            Panel administratora
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {items.map((it) => {
            const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
            return (
              <Link key={it.to} to={it.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60"}`}>
                <it.icon className="h-4 w-4" /> {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => { void signOut(); void navigate({ to: "/" }); }}>
            <LogOut className="mr-2 h-4 w-4" /> Wyloguj
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6"><Outlet /></main>
    </div>
  );
}
