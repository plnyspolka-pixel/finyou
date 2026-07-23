// Licznik pozostałego czasu przypisania. Jedynym źródłem czasu jest serwer:
// liczymy offset między `serverNow` a zegarem urządzenia w momencie odpowiedzi
// i odejmujemy go przy każdym ticku — przestawiony zegar użytkownika nie
// zmienia ważności karty (i tak decyduje serwer).
import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";

export function useServerCountdown(
  expiresAt: string,
  serverNow: string,
): {
  msLeft: number;
  label: string;
  expired: boolean;
} {
  const offset = useMemo(() => Date.now() - new Date(serverNow).getTime(), [serverNow]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const msLeft = new Date(expiresAt).getTime() - (now - offset);
  return { msLeft, label: formatDuration(msLeft), expired: msLeft <= 0 };
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "wygasło";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h} godz. ${m} min`;
  if (m > 0) return `${m} min ${s} s`;
  return `${s} s`;
}

export function AssignmentCountdown({
  expiresAt,
  serverNow,
  prefix = "Pozostało",
  className = "",
}: {
  expiresAt: string;
  serverNow: string;
  prefix?: string;
  className?: string;
}) {
  const { label, expired, msLeft } = useServerCountdown(expiresAt, serverNow);
  const urgent = msLeft > 0 && msLeft < 3 * 3600 * 1000;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        expired
          ? "bg-destructive/15 text-destructive"
          : urgent
            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            : "bg-muted text-muted-foreground"
      } ${className}`}
    >
      <Clock className="h-3.5 w-3.5" />
      {expired ? "Czas minął" : `${prefix} ${label}`}
    </span>
  );
}
