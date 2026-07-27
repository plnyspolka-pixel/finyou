import { isPreviewHost, isPreviewBypassActive, setPreviewBypass } from "@/hooks/use-auth";
import { Eye, EyeOff } from "lucide-react";

/**
 * Mały pływający przełącznik widoczny WYŁĄCZNIE na preview
 * (id-preview--*.lovable.app / localhost). Umożliwia przeglądanie
 * całego serwisu bez logowania (wszystkie role) — do celów podglądowych.
 */
export function PreviewBypassToggle() {
  if (!isPreviewHost()) return null;
  const active = isPreviewBypassActive();
  return (
    <button
      type="button"
      onClick={() => setPreviewBypass(!active)}
      className={
        "fixed bottom-3 left-3 z-[9999] flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium shadow-lg backdrop-blur transition " +
        (active
          ? "border-emerald-400/40 bg-emerald-500/90 text-white hover:bg-emerald-500"
          : "border-white/20 bg-slate-900/80 text-white hover:bg-slate-900")
      }
      title={
        active ? "Wyłącz podgląd bez logowania" : "Włącz podgląd bez logowania (tylko preview)"
      }
    >
      {active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      {active ? "Podgląd: BEZ LOGOWANIA" : "Podgląd bez logowania"}
    </button>
  );
}
