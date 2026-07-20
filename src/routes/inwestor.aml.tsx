// Sekcja AML panelu inwestora — dostępna w całości od pierwszego wejścia,
// bez aktywacji, konfiguracji SI*GIIF i podpisu kwalifikowanego.
// Wymóg podpisu pojawia się dopiero przy faktycznej wysyłce do GIIF.
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/inwestor/aml")({
  component: AmlLayout,
});

const TABS: { to: string; label: string; exact?: boolean }[] = [
  { to: "/inwestor/aml", label: "Przegląd", exact: true },
  { to: "/inwestor/aml/klienci", label: "Klienci i weryfikacje" },
  { to: "/inwestor/aml/ryzyko", label: "Oceny ryzyka" },
  { to: "/inwestor/aml/transakcje", label: "Transakcje" },
  { to: "/inwestor/aml/ponadprogowe", label: "Transakcje ponadprogowe" },
  { to: "/inwestor/aml/sprawy", label: "Sprawy AML" },
  { to: "/inwestor/aml/zgloszenia", label: "Zgłoszenia GIIF" },
  { to: "/inwestor/aml/upo", label: "UPO i odpowiedzi GIIF" },
  { to: "/inwestor/aml/ustawienia", label: "Ustawienia AML" },
];

function AmlLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1 border-b pb-2">
        {TABS.map((t) => {
          const active = t.exact
            ? pathname === t.to || pathname === `${t.to}/`
            : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
