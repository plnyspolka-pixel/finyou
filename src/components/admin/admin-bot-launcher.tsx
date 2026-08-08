import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Bot, ChevronDown, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { AdminBot } from "@/components/admin/admin-bot";
import { cn } from "@/lib/utils";

/**
 * Pływający launcher asystenta panelu — montowany raz w layoucie `/admin`, więc
 * bot jest pod ręką na każdej podstronie. Na pulpicie go nie pokazujemy, bo tam
 * asystent stoi jako pełna karta. Tylko rola `administrator` (backend i tak
 * odrzuca pozostałe role).
 */
export function AdminBotLauncher() {
  const { roles } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);

  if (!roles.includes("administrator")) return null;
  if (pathname === "/admin" || pathname === "/admin/") return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg ring-2 ring-primary/25 transition-transform hover:scale-105"
        aria-label="Otwórz asystenta panelu"
      >
        <Bot className="h-4 w-4" />
        <span className="hidden sm:inline">Asystent</span>
      </button>
    );
  }

  return (
    <AdminBot
      className={cn(
        "fixed z-40 shadow-2xl",
        maximized
          ? "inset-3 md:inset-6"
          : "bottom-4 right-4 h-[min(620px,80vh)] w-[min(440px,calc(100vw-2rem))]",
      )}
      headerActions={
        <>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setMaximized((v) => !v)}
            aria-label={maximized ? "Zmniejsz" : "Powiększ"}
            title={maximized ? "Zmniejsz" : "Powiększ"}
          >
            {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setOpen(false)}
            aria-label="Zwiń asystenta"
            title="Zwiń"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </>
      }
    />
  );
}
