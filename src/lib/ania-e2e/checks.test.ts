import { describe, expect, it } from "vitest";
import { coversTranscript, textChecks } from "./checks";

const failing = (reply: string) =>
  textChecks(reply)
    .filter((c) => !c.pass)
    .map((c) => c.name);

describe("textChecks — wpadki z produkcji", () => {
  it("powitanie zamiast odpowiedzi (Bogusław, Tymecki)", () => {
    expect(failing("Dzień dobry, tu Ania z Finance You. W czym mogę pomóc?")).toContain(
      "nie jest samym powitaniem",
    );
  });
  it("notatka wewnętrzna (Paweł)", () => {
    expect(
      failing("Paweł wypełnił formularz inwestorski — przekazuję go na ścieżkę inwestorów."),
    ).toContain("bez notatki wewnętrznej");
  });
  it("męska forma i emoji (Kochanowski)", () => {
    const f = failing("Cześć Krzysztof! Napisałem do Ciebie w wiadomości prywatnej 👋");
    expect(f).toContain("Ania w formie żeńskiej");
    expect(f).toContain("bez emoji");
  });
  it("dobra odpowiedź przechodzi", () => {
    expect(
      failing(
        "Panie Pawle, dziękuję za wiadomość. Jaką kwotę chciałby Pan przeznaczyć na jedną sprawę?",
      ),
    ).toEqual([]);
  });
});

describe("coversTranscript — ucięta odpowiedź (Kaniecki / A2P)", () => {
  const transcript = [
    { role: "agent", message: "Dzień dobry, tu Ania z Finance You. W czym mogę pomóc?" },
    { role: "user", message: "Jak to działa?" },
    { role: "agent", message: "Chętnie opowiem o modelu, który oferujemy." },
    { role: "agent", message: "Inwestor pożycza pod hipotekę." },
  ];
  it("wykrywa brak drugiej części", () => {
    expect(coversTranscript("Chętnie opowiem o modelu, który oferujemy.", transcript)).toEqual({
      pass: false,
      missing: ["Inwestor pożycza pod hipotekę."],
    });
  });
  it("cała odpowiedź przechodzi", () => {
    expect(
      coversTranscript(
        "Chętnie opowiem o modelu, który oferujemy.\nInwestor pożycza pod hipotekę.",
        transcript,
      )?.pass,
    ).toBe(true);
  });
});
