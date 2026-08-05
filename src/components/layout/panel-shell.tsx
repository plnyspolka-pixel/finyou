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
  /**
   * Dozwolone prefiksy ścieżek, gdy bieżąca rola ma węższy dostęp niż cały panel
   * (np. księgowość w panelu admina). Wejście na ścieżkę spoza listy blokuje render
   * i przekierowuje na pierwszy dozwolony adres — nie wystarczy ukryć linki w nawigacji.
   */
  allowByPath?: string[];
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
export function PanelShell({
  title,
  groups,
  allow,
  allowByPath,
  footer,
  fancy = false,
}: PanelShellProps) {
  const { user, roles, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  const pathAllowed =
    !allowByPath || allowByPath.some((p) => pathname === p || pathname.startsWith(p + "/"));

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
      return;
    }
    // Rola z węższym dostępem (np. księgowość) na ścieżce spoza białej listy:
    // odeślij na pierwszy dozwolony adres, żeby URL nie był furtką wokół nawigacji.
    if (!pathAllowed && allowByPath && allowByPath.length > 0) {
      void navigate({ to: allowByPath[0] });
    }
  }, [loading, user, roles, allow, allowByPath, pathAllowed, navigate, pathname]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">Ładowanie…</div>
    );
  }

  // Uwierzytelniony, ale bez wymaganej roli: NIE renderuj <Outlet/> (ani danych
  // panelu). Bez tego strona-dziecko montowałaby się i odpalała swoje loadery
  // danych na co najmniej jeden commit, zanim useEffect wykona navigate({to:"/"}).
  // `loading` jest false dopiero po dociągnięciu ról, więc legalni użytkownicy
  // nie zobaczą tego ekranu.
  if (allow && !allow.some((r) => roles.includes(r))) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        Przekierowywanie…
      </div>
    );
  }

  // Ścieżka spoza białej listy dla węższej roli — nie montuj strony-dziecka
  // (ani jej loaderów danych), zanim useEffect wykona przekierowanie.
  if (!pathAllowed) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        Przekierowywanie…
      </div>
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
        <main
          className={`relative flex-1 overflow-y-auto p-4 md:p-6 ${fancy ? "fy-fancy-main dark isolate text-foreground bg-[oklch(0.10_0.03_265)]" : ""}`}
        >
          {fancy && (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10"
                style={{
                  background:
                    "radial-gradient(120% 100% at 0% 0%, oklch(0.22 0.10 268 / 0.55) 0%, transparent 55%), radial-gradient(90% 80% at 100% 10%, oklch(0.20 0.08 240 / 0.50) 0%, transparent 60%), radial-gradient(80% 80% at 50% 100%, oklch(0.20 0.10 285 / 0.45) 0%, transparent 65%), linear-gradient(180deg, oklch(0.12 0.04 265) 0%, oklch(0.08 0.02 265) 100%)",
                }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute -top-20 -left-20 -z-10 h-72 w-72 rounded-full blur-3xl"
                style={{
                  background:
                    "radial-gradient(circle, oklch(0.32 0.16 268 / 0.30), transparent 70%)",
                  animation: "fy-panel-drift-a 14s ease-in-out infinite alternate",
                }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute top-10 -right-20 -z-10 h-80 w-80 rounded-full blur-3xl"
                style={{
                  background:
                    "radial-gradient(circle, oklch(0.32 0.12 235 / 0.22), transparent 70%)",
                  animation: "fy-panel-drift-b 17s ease-in-out infinite alternate",
                }}
              />
              <style>{`
                @keyframes fy-panel-drift-a { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(40px,24px) scale(1.15); } }
                @keyframes fy-panel-drift-b { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(-44px,20px) scale(1.1); } }

                /*
                 * Legibility strategy: the whole panel runs on the app's real \`.dark\` design
                 * tokens (set on <main>), so every shadcn primitive — Card, Table, Tabs, Input,
                 * Select, Badge, Dialog — becomes dark-legible automatically, with proper
                 * contrast, and no per-class \`!important\` whack-a-mole. Below is only the
                 * premium polish that the tokens can't express on their own.
                 */

                /* Headings pop cleanly over the drifting aurora. */
                .fy-fancy-main :is(h1, h2, h3) { text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35); }

                /* shadcn cards read as frosted glass floating on the aurora. */
                .fy-fancy-main .bg-card {
                  background-color: color-mix(in oklab, var(--card) 82%, transparent);
                  -webkit-backdrop-filter: blur(12px);
                  backdrop-filter: blur(12px);
                }
              `}</style>
            </>
          )}

          <Outlet />
        </main>
      </div>
      {footer}
    </div>
  );
}
