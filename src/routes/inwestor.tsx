import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ListChecks, Tag, Calculator, CreditCard, User, LogOut, MessageSquare, GraduationCap, FileSignature } from "lucide-react";

export const Route = createFileRoute("/inwestor")({
  component: InwestorLayout,
});

const items = [
  { to: "/inwestor", label: "Dostępne wnioski", icon: ListChecks, exact: true },
  { to: "/inwestor/oferty", label: "Moje oferty", icon: Tag },
  { to: "/inwestor/kreator-dokumentow", label: "Kreator dokumentów", icon: FileSignature },
  { to: "/inwestor/wiadomosci", label: "Wiadomości", icon: MessageSquare },
  { to: "/inwestor/szkolenia", label: "Akademia", icon: GraduationCap },
  { to: "/inwestor/kalkulator", label: "Kalkulator", icon: Calculator },
  { to: "/inwestor/abonament", label: "Abonament", icon: CreditCard },
  { to: "/inwestor/profil", label: "Profil", icon: User },
];

function InwestorLayout() {
  const { user, roles, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!user) { void navigate({ to: "/logowanie" }); return; }
    if (!roles.includes("inwestor") && !roles.includes("administrator")) {
      void navigate({ to: "/" });
    }
  }, [loading, user, roles, navigate]);

  if (loading || !user) return <div className="grid min-h-screen place-items-center text-muted-foreground">Ładowanie…</div>;

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden md:flex w-60 flex-col bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-5 border-b border-sidebar-border font-semibold">Panel inwestora</div>
        <nav className="flex-1 px-2 py-3 space-y-1">
          {items.map((it) => {
            const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
            return (
              <Link key={it.to} to={it.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60"}`}>
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
