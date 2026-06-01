import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, FileText, FolderOpen, PhoneCall, Briefcase, Send, Tag, Plug, Settings, LogOut, ShieldCheck, Mic, GraduationCap, Code2, Wand2, Receipt, BookOpen, Facebook, Mail, Search } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

type Item = { to: string; label: string; icon: any; exact?: boolean };
type Group = { label?: string; items: Item[] };

const groups: Group[] = [
  { items: [{ to: "/admin", label: "Pulpit", icon: LayoutDashboard, exact: true }] },
  {
    label: "Klienci pożyczkowi",
    items: [
      { to: "/admin/leady", label: "Leady", icon: Users },
      { to: "/admin/wnioski", label: "Wnioski", icon: FileText },
      { to: "/admin/klienci", label: "Klienci", icon: Users },
      { to: "/admin/dokumenty", label: "Dokumenty", icon: FolderOpen },
      { to: "/admin/kw", label: "Księgi wieczyste", icon: BookOpen },
      { to: "/admin/kreator-pozyczki", label: "Kreator pożyczki", icon: Wand2 },
      { to: "/admin/voicebot", label: "Voicebot", icon: Mic },
      { to: "/admin/follow-up", label: "Follow-up", icon: PhoneCall },
    ],
  },
  {
    label: "Inwestorzy",
    items: [
      { to: "/admin/inwestorzy", label: "Lista inwestorów", icon: Briefcase },
      { to: "/admin/oferty", label: "Oferty", icon: Tag },
      { to: "/admin/dystrybucja", label: "Dystrybucja ofert", icon: Send },
      { to: "/admin/szkolenia", label: "Szkolenia", icon: GraduationCap },
    ],
  },
  {
    label: "Marketing",
    items: [
      { to: "/admin/mailing", label: "Mailing", icon: Mail },
      { to: "/admin/meta", label: "Meta Ads", icon: Facebook },
      { to: "/admin/fb-ads/kreator", label: "Kreator FB Ads", icon: Facebook },
      { to: "/admin/google-ads/kreator", label: "Kreator Google Ads", icon: Search },
      { to: "/admin/pixele", label: "Pixele FB", icon: Facebook },
    ],
  },
  {
    label: "Konfiguracja",
    items: [
      { to: "/admin/embed", label: "Wniosek do osadzenia", icon: Code2 },
      { to: "/admin/fakturowo", label: "Fakturowo", icon: Receipt },
      { to: "/admin/integracje", label: "Integracje", icon: Plug },
      { to: "/admin/role", label: "Role użytkowników", icon: ShieldCheck },
      { to: "/admin/ustawienia", label: "Ustawienia", icon: Settings },
    ],
  },
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
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {groups.map((g, gi) => (
            <div key={gi} className="space-y-1">
              {g.label && (
                <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                  {g.label}
                </div>
              )}
              {g.items.map((it) => {
                const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
                return (
                  <Link key={it.to} to={it.to}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60"}`}>
                    <it.icon className="h-4 w-4" /> {it.label}
                  </Link>
                );
              })}
            </div>
          ))}
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
