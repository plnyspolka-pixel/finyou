// Raporty i alarmy autopilota mailem (decyzja właściciela 27.10.2026).
import { describe, expect, it } from "vitest";
import {
  AUTOPILOT_PANEL_URL,
  buildAlarmEmail,
  buildReportEmail,
  ownerReportEmail,
} from "./owner-email";
import type { ReportInput } from "./metrics";

const REPORT: ReportInput = {
  periodLabel: "27 października 2026 (wtorek)",
  tracks: [
    {
      track: "pozyczkobiorca",
      publications: 3,
      medianViews: 412,
      signups: 0,
      leads: 0,
      costPln: 1.2,
    },
    { track: "inwestor", publications: 3, medianViews: 380, signups: 2, leads: 1, costPln: 1.2 },
  ],
  outliers: 0,
  changes: [],
  alarms: [],
  paused: false,
};

describe("adres maila właściciela", () => {
  it("zmienna OWNER_ALERT_EMAIL ma pierwszeństwo przed ustawieniem w bazie", () => {
    expect(
      ownerReportEmail(
        { is_enabled: true, configuration: { owner_email: "baza@example.com" } },
        " env@example.com ",
      ),
    ).toBe("env@example.com");
  });

  it("bez zmiennej bierze adres z włączonego ustawienia", () => {
    expect(
      ownerReportEmail(
        { is_enabled: true, configuration: { owner_email: "baza@example.com" } },
        undefined,
      ),
    ).toBe("baza@example.com");
  });

  it("wyłączone ustawienie, zły adres albo brak wiersza = brak maila", () => {
    expect(
      ownerReportEmail(
        { is_enabled: false, configuration: { owner_email: "baza@example.com" } },
        undefined,
      ),
    ).toBeNull();
    expect(
      ownerReportEmail({ is_enabled: true, configuration: { owner_email: "nie-mail" } }, ""),
    ).toBeNull();
    expect(ownerReportEmail(null, undefined)).toBeNull();
  });
});

describe("treść maila", () => {
  it("raport dzienny: czytelny temat, pełne liczby z opisem i link do panelu", () => {
    const m = buildReportEmail("daily", REPORT);
    expect(m.subject).toBe("Autopilot Finance You — raport dzienny 27 października 2026 (wtorek)");
    expect(m.text).toMatch(/Pożyczkobiorcy: 3 publ\., mediana 412 wyśw\., 0 zapisów, 0 leadów/);
    expect(m.text).toMatch(/Inwestorzy: 3 publ\..*2 zapisów, 1 leadów/);
    expect(m.text).toMatch(/zapisy = pobrania lead magnetów/);
    expect(m.text).toContain(AUTOPILOT_PANEL_URL);
    expect(m.text).not.toMatch(/\dp\/\dz\/\dl/);
  });

  it("raport tygodniowy z pauzą ma to w temacie", () => {
    const m = buildReportEmail("weekly", { ...REPORT, paused: true, periodLabel: "7 dni" });
    expect(m.subject).toBe("Autopilot Finance You — raport tygodniowy 7 dni — PAUZA");
  });

  it("alarm: powód i sposób wznowienia", () => {
    const m = buildAlarmEmail("Koszt AI dziś 3× średnia 7 dni.");
    expect(m.subject).toBe("Autopilot Finance You — WSTRZYMANY");
    expect(m.text).toContain("Powód: Koszt AI dziś 3× średnia 7 dni.");
    expect(m.text).toMatch(/autopilot_kill_switch/);
  });
});
