// Powiadomienia właściciela z autopilota MAILEM (decyzja właściciela
// 27.10.2026): raport dzienny, tygodniowy i alarm o pauzie idą e-mailem, nie
// SMS-em. Czysty moduł – bez I/O: adres odbiorcy, temat i treść maila.
//
// Adres: zmienna OWNER_ALERT_EMAIL (nadpisuje), inaczej ustawienie
// `integration_settings` z integration_name = "autopilot_raporty",
// configuration.owner_email (włączone). Brak adresu = mail nie wychodzi,
// raport zostaje w dzienniku autopilota.
import { buildReportText, type ReportInput } from "./metrics";

export const AUTOPILOT_REPORTS_INTEGRATION = "autopilot_raporty";

/** Panel autopilota — link w każdym mailu. */
export const AUTOPILOT_PANEL_URL = "https://financeyou.pl/admin/ai-growth-engine";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function ownerReportEmail(
  row: { is_enabled?: boolean | null; configuration?: unknown } | null | undefined,
  envValue: string | undefined,
): string | null {
  const env = envValue?.trim();
  if (env && EMAIL_RE.test(env)) return env;
  if (!row || row.is_enabled === false) return null;
  const cfg = (row.configuration ?? {}) as { owner_email?: unknown };
  const email = typeof cfg.owner_email === "string" ? cfg.owner_email.trim() : "";
  return EMAIL_RE.test(email) ? email : null;
}

export interface OwnerEmail {
  subject: string;
  text: string;
}

const LEGEND =
  "publ. = publikacje (Instagram, Facebook, YouTube), wyśw. = mediana wyświetleń, " +
  "zapisy = pobrania lead magnetów, leady = zapisy z kontaktem w CRM.";

export function buildReportEmail(kind: "daily" | "weekly", r: ReportInput): OwnerEmail {
  const label = kind === "daily" ? "raport dzienny" : "raport tygodniowy";
  return {
    subject: `Autopilot Finance You — ${label} ${r.periodLabel}${r.paused ? " — PAUZA" : ""}`,
    text: [buildReportText(r), "", LEGEND, "", `Panel autopilota: ${AUTOPILOT_PANEL_URL}`].join(
      "\n",
    ),
  };
}

export function buildAlarmEmail(reason: string): OwnerEmail {
  return {
    subject: "Autopilot Finance You — WSTRZYMANY",
    text: [
      "Autopilot wstrzymał publikacje automatycznie.",
      "",
      `Powód: ${reason}`,
      "",
      "Ręczne publikacje zespołu idą dalej. Wznowienie: panel autopilota albo MCP autopilot_kill_switch.",
      `Panel autopilota: ${AUTOPILOT_PANEL_URL}`,
    ].join("\n"),
  };
}
