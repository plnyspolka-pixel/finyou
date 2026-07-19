// Bezpieczne budowanie adresów powrotu/notyfikacji dla Tpay.
// Nie używamy `returnUrl` podanego przez przeglądarkę (ochrona przed open
// redirect) — bazę bierzemy z env APP_URL albo z białej listy domen.
import { getRequest } from "@tanstack/react-start/server";

const ALLOWED_ORIGINS = new Set([
  "https://app.financeyou.pl",
  "https://financeyou.pl",
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:3000",
]);

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Środowiska podglądowe Lovable (deployment aplikacji).
  try {
    const u = new URL(origin);
    return (
      u.protocol === "https:" &&
      (u.hostname.endsWith(".lovable.app") || u.hostname.endsWith(".lovableproject.com"))
    );
  } catch {
    return false;
  }
}

export function resolveAppBaseUrl(): string {
  const fromEnv = (process.env.APP_URL || process.env.PUBLIC_BASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (fromEnv && isAllowedOrigin(fromEnv)) return fromEnv;

  try {
    const req = getRequest();
    const origin = req ? new URL(req.url).origin : "";
    if (origin && isAllowedOrigin(origin)) return origin;
  } catch {
    // poza kontekstem żądania (testy/cron) — użyj domyślnej domeny
  }
  return "https://app.financeyou.pl";
}

export function requestClientMeta(): { ip: string | null; userAgent: string | null } {
  try {
    const req = getRequest();
    if (!req) return { ip: null, userAgent: null };
    const ip =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    return { ip, userAgent: req.headers.get("user-agent") };
  } catch {
    return { ip: null, userAgent: null };
  }
}
