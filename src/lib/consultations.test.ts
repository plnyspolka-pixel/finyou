import { describe, expect, it } from "vitest";
import {
  CONSULTATION_TOTAL_MINUTES,
  consultationOwnerSms,
  consultationTimes,
  isConsultationDay,
  minutesLabel,
  remainingConsultationMinutes,
  warsawToDate,
} from "./consultations";

// Środa 28.10.2026, 12:00 czasu polskiego (CET, UTC+1 po zmianie czasu 25.10).
const now = new Date("2026-10-28T11:00:00Z");

describe("konsultacje — terminy w czasie polskim", () => {
  it("przelicza czas polski na UTC także po zmianie czasu", () => {
    expect(warsawToDate("2026-11-03", "10:30").toISOString()).toBe("2026-11-03T09:30:00.000Z");
    expect(warsawToDate("2026-07-01", "10:00").toISOString()).toBe("2026-07-01T08:00:00.000Z");
  });

  it("tylko dni robocze, najwcześniej 24 h naprzód, najdalej 60 dni", () => {
    expect(isConsultationDay("2026-10-31", now)).toBe(false); // sobota
    expect(isConsultationDay("2026-11-01", now)).toBe(false); // niedziela
    expect(isConsultationDay("2026-10-28", now)).toBe(false); // dziś
    expect(isConsultationDay("2026-10-29", now)).toBe(true);
    expect(isConsultationDay("2027-01-15", now)).toBe(false); // > 60 dni
  });

  it("godziny 9:00–18:00 co 30 min, z końcem przed 18:00 i z wyprzedzeniem 24 h", () => {
    const jutro = consultationTimes("2026-10-29", 60, now);
    expect(jutro[0]).toBe("12:00"); // 24 h od teraz
    expect(jutro.at(-1)).toBe("17:00");
    const pozniej = consultationTimes("2026-11-03", 120, now);
    expect(pozniej[0]).toBe("09:00");
    expect(pozniej.at(-1)).toBe("16:00");
  });
});

describe("konsultacje — limit 4 h", () => {
  it("odwołane nie zużywają godzin", () => {
    expect(CONSULTATION_TOTAL_MINUTES).toBe(240);
    expect(
      remainingConsultationMinutes([
        { duration_minutes: 60, status: "odbyta" },
        { duration_minutes: 90, status: "zgloszona" },
        { duration_minutes: 120, status: "odwolana" },
      ]),
    ).toBe(90);
    expect(minutesLabel(90)).toBe("1 h 30 min");
    expect(minutesLabel(240)).toBe("4 h");
  });

  it("SMS do właściciela: kto, kiedy (czas polski), ile, temat", () => {
    expect(
      consultationOwnerSms({
        name: "Jan Nowak",
        phone: "+48600100200",
        at: warsawToDate("2026-11-03", "10:30"),
        minutes: 60,
        topic: "Pierwsza umowa",
      }),
    ).toBe(
      "Konsultacja: Jan Nowak (+48600100200) chce wt., 3.11, 10:30, 1 h. Temat: Pierwsza umowa",
    );
  });
});
