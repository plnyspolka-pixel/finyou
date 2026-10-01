import { describe, expect, it } from "vitest";
import {
  describeCallbackTime,
  detectCallbackRequest,
  parseCallbackTime,
  userUtterancesFromTranscript,
} from "./callback-request";

// Środa 1 października 2026, 12:00 czasu warszawskiego (CEST, UTC+2) = 10:00 UTC.
const NOW = new Date("2026-10-01T10:00:00Z");

function warsawHm(d: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

describe("parseCallbackTime", () => {
  it("za godzinę → +1 h", () => {
    const r = parseCallbackTime("proszę oddzwonić za godzinę", NOW);
    expect(r.explicit).toBe(true);
    expect(r.dueAt.getTime() - NOW.getTime()).toBe(3600_000);
  });

  it("za 30 minut → +30 min", () => {
    const r = parseCallbackTime("zadzwoń za 30 minut", NOW);
    expect(r.dueAt.getTime() - NOW.getTime()).toBe(30 * 60_000);
  });

  it("za dwie godziny → +2 h", () => {
    const r = parseCallbackTime("oddzwoń za dwie godziny", NOW);
    expect(r.dueAt.getTime() - NOW.getTime()).toBe(2 * 3600_000);
  });

  it("jutro rano → jutro 9:00 (Warszawa)", () => {
    const r = parseCallbackTime("zadzwoń jutro rano", NOW);
    expect(warsawHm(r.dueAt)).toBe("09:00");
    expect(r.dueAt.getTime() - NOW.getTime()).toBeGreaterThan(20 * 3600_000);
  });

  it("jutro bez pory → jutro 10:00", () => {
    const r = parseCallbackTime("niech Pani zadzwoni jutro", NOW);
    expect(warsawHm(r.dueAt)).toBe("10:00");
  });

  it("o 15 → dziś 15:00, bo jeszcze nie minęła", () => {
    const r = parseCallbackTime("oddzwoń o 15", NOW);
    expect(warsawHm(r.dueAt)).toBe("15:00");
    expect(r.dueAt.getTime() - NOW.getTime()).toBe(3 * 3600_000);
  });

  it("o 11 (już po) → jutro 11:00", () => {
    const r = parseCallbackTime("oddzwoń o 11", NOW);
    expect(warsawHm(r.dueAt)).toBe("11:00");
    expect(r.dueAt.getTime() - NOW.getTime()).toBeGreaterThan(20 * 3600_000);
  });

  it("o 5 (po południu) → 17:00", () => {
    const r = parseCallbackTime("zadzwoń o 5", NOW);
    expect(warsawHm(r.dueAt)).toBe("17:00");
  });

  it("po 16:30 → 16:30", () => {
    const r = parseCallbackTime("proszę po 16:30", NOW);
    expect(warsawHm(r.dueAt)).toBe("16:30");
  });

  it("w piątek → najbliższy piątek", () => {
    const r = parseCallbackTime("oddzwoń w piątek", NOW);
    // 1.10.2026 to czwartek → piątek 2.10
    expect(r.dueAt.toISOString().startsWith("2026-10-02")).toBe(true);
  });

  it("bez pory → domyślnie +2 h, nie jawny", () => {
    const r = parseCallbackTime("zadzwoń później", NOW);
    expect(r.explicit).toBe(false);
    expect(r.dueAt.getTime() - NOW.getTime()).toBe(2 * 3600_000);
  });

  it("nigdy wcześniej niż za 5 minut", () => {
    const r = parseCallbackTime("oddzwoń za 1 minutę", NOW);
    expect(r.dueAt.getTime() - NOW.getTime()).toBeGreaterThanOrEqual(5 * 60_000);
  });
});

describe("detectCallbackRequest", () => {
  it("wprost prosi o oddzwonienie", () => {
    const r = detectCallbackRequest(["Halo", "Nie mogę teraz, proszę oddzwonić za godzinę"], NOW);
    expect(r.requested).toBe(true);
    expect(r.dueAt!.getTime() - NOW.getTime()).toBe(3600_000);
  });

  it("zadzwoń później bez pory → prośba z domyślnym terminem", () => {
    const r = detectCallbackRequest(["Zadzwoń później"], NOW);
    expect(r.requested).toBe(true);
    expect(r.hasExplicitTime).toBe(false);
  });

  it("zajęty + pora → prośba", () => {
    const r = detectCallbackRequest(["Jestem w pracy, może po 16"], NOW);
    expect(r.requested).toBe(true);
    expect(warsawHm(r.dueAt!)).toBe("16:00");
  });

  it("samo „nie mogę teraz rozmawiać” to jeszcze nie prośba", () => {
    expect(detectCallbackRequest(["Nie mogę teraz rozmawiać. Co słychać?"], NOW).requested).toBe(
      false,
    );
  });

  it("odmowa wygrywa z oddzwonieniem", () => {
    expect(
      detectCallbackRequest(["Nie jestem zainteresowany, nie dzwońcie więcej"], NOW).requested,
    ).toBe(false);
    expect(
      detectCallbackRequest(["Proszę usunąć mnie z bazy, nie oddzwaniajcie"], NOW).requested,
    ).toBe(false);
    expect(detectCallbackRequest(["Oferta nieaktualna"], NOW).requested).toBe(false);
  });

  it("zwykła rozmowa bez prośby", () => {
    expect(detectCallbackRequest(["Potrzebuję 180 tysięcy pod mieszkanie"], NOW).requested).toBe(
      false,
    );
    expect(detectCallbackRequest([], NOW).requested).toBe(false);
  });

  it("odpowiedź na pytanie „kiedy?” — sama pora wystarcza", () => {
    const r = detectCallbackRequest(["Jutro o 10"], NOW, { awaitingTime: true });
    expect(r.requested).toBe(true);
    expect(warsawHm(r.dueAt!)).toBe("10:00");
    // bez pytania o termin ta sama wypowiedź nie jest prośbą
    expect(detectCallbackRequest(["Jutro o 10"], NOW).requested).toBe(false);
  });

  it("prośba w SMS-ie: oddzwońcie", () => {
    expect(detectCallbackRequest(["Oddzwońcie jutro"], NOW).requested).toBe(true);
    expect(detectCallbackRequest(["Może Pani do mnie zadzwonić wieczorem"], NOW).requested).toBe(
      true,
    );
  });

  it("„oddzwonię” (klient sam zadzwoni) nie jest prośbą o telefon od nas", () => {
    expect(detectCallbackRequest(["Oddzwonię"], NOW).requested).toBe(false);
  });
});

describe("userUtterancesFromTranscript", () => {
  it("bierze tylko wypowiedzi klienta", () => {
    const out = userUtterancesFromTranscript([
      { role: "agent", message: "Oddzwonimy jutro" },
      { role: "user", message: "Dobrze, zadzwoń jutro" },
      { role: "user", message: "" },
    ]);
    expect(out).toEqual(["Dobrze, zadzwoń jutro"]);
  });

  it("nie-tablica → pusta lista", () => {
    expect(userUtterancesFromTranscript(null)).toEqual([]);
    expect(userUtterancesFromTranscript("tekst")).toEqual([]);
  });
});

describe("describeCallbackTime", () => {
  it("opisuje termin po polsku", () => {
    expect(describeCallbackTime(new Date("2026-10-01T13:00:00Z"), NOW)).toBe("dzisiaj o 15:00");
    expect(describeCallbackTime(new Date("2026-10-02T08:00:00Z"), NOW)).toBe("jutro o 10:00");
    expect(describeCallbackTime(new Date("2026-10-05T08:00:00Z"), NOW)).toBe(
      "w poniedziałek o 10:00",
    );
  });
});
