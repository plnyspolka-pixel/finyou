import { ReactNode, useEffect, useState } from "react";
import { Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu, type LucideIcon } from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import brandMark from "@/assets/financeyou-mark-v2.png.asset.json";

export type NavItem = { to: string; label: string; icon: LucideIcon; exact?: boolean };
export type NavGroup = { label?: string; items: NavItem[] };

type PanelShellProps = {
  /** Tytuł panelu obok znaczka „FY". */
  title: string;
  /** Nawigacja — jedna lub wiele grup (grupy mogą mieć nagłówek). */
  groups: NavGroup[];
  /** Role uprawnione do panelu. Pominięcie = wystarczy bycie zalogowanym (panel klienta). */
  allow?: AppRole[];
  /** Dodatkowy element w obrębie shella (np. pływający czat AI administratora). */
  footer?: ReactNode;
  /** Włącz „fancy" navy aurora backdrop w obszarze głównym. */
  fancy?: boolean;
};

/**
 * Wspólny shell wszystkich paneli (admin / operator / inwestor / klient).
 * Jedno źródło prawdy dla: nawigacji desktop + mobilnej (Sheet), brandingu,
 * strażnika ról i wylogowania. Dzięki temu każdy panel jest nawigowalny na telefonie.
 */
export function PanelShell({ title, groups, allow, footer }: PanelShellProps) {
  const { user, roles, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      // Efekt potrafi odpalić się jeszcze raz, gdy jesteśmy już w drodze na /logowanie —
      // nie nadpisuj wtedy `next` adresem /logowanie, bo po zalogowaniu użytkownik (np. recenzent
      // Meta) wróciłby na ekran logowania zamiast na docelową stronę panelu.
      if (pathname === "/logowanie") return;
      // Rolę wyliczamy ze ścieżki panelu (jednoznacznie), a nie z `allow` — panel admina zawiera
      // rolę "operator", przez co wcześniej logowanie prowadziło do /posrednik zamiast /admin.
      const role = pathname.startsWith("/inwestor")
        ? "inwestor"
        : pathname.startsWith("/admin")
        ? "operator"
        : pathname.startsWith("/posrednik")
        ? "posrednik"
        : "klient";
      void navigate({ to: "/logowanie", search: { role, next: pathname } as never });
      return;
    }
    if (allow && !allow.some((r) => roles.includes(r))) {
      void navigate({ to: "/" });
    }
  }, [loading, user, roles, allow, navigate, pathname]);


  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">Ładowanie…</div>
    );
  }

  const brand = (
    <div className="flex items-center gap-2.5 font-semibold">
      <img
        src={brandMark.url}
        alt="Finance You"
        className="h-9 w-9 shrink-0 select-none object-contain"
        draggable={false}
      />
      <span className="tracking-tight">{title}</span>
    </div>
  );


  const nav = (onNavigate?: () => void) => (
    <>
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
              <Link
                key={it.to}
                to={it.to}
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/60"
                }`}
              >
                <it.icon className="h-4 w-4 shrink-0" /> {it.label}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );

  const signOutButton = (onNavigate?: () => void) => (
    <Button
      variant="ghost"
      className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
      onClick={() => {
        onNavigate?.();
        void signOut();
        void navigate({ to: "/" });
      }}
    >
      <LogOut className="mr-2 h-4 w-4" /> Wyloguj
    </Button>
  );

  return (
    <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-secondary/30">
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-5 py-5 border-b border-sidebar-border">{brand}</div>
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">{nav()}</nav>
        <div className="border-t border-sidebar-border p-3">{signOutButton()}</div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="md:hidden sticky top-0 z-30 flex items-center gap-2 border-b bg-background px-3 py-2">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Otwórz menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex w-72 flex-col p-0 bg-sidebar text-sidebar-foreground"
            >
              <SheetTitle className="sr-only">Menu nawigacji</SheetTitle>
              <div className="px-5 py-5 border-b border-sidebar-border">{brand}</div>
              <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
                {nav(() => setMobileOpen(false))}
              </nav>
              <div className="border-t border-sidebar-border p-3">
                {signOutButton(() => setMobileOpen(false))}
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2 font-semibold text-sm">
            <img
              src={brandMark.url}
              alt="Finance You"
              className="h-7 w-7 shrink-0 select-none object-contain"
              draggable={false}
            />
            {title}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
      {footer}
    </div>
  );
}
