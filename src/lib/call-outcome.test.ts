import { describe, it, expect } from "vitest";
import { classifyCallOutcome, shouldRetryCall } from "./call-outcome";

describe("klasyfikacja wyniku rozmowy", () => {
  it("291-sekundowa rozmowa to odebrana, choć agent ocenił ją jako nieudaną", () => {
    // Prawdziwy przypadek z produkcji: klient poprosił o 300 tys. pod zastaw domu,
    // a rozmowa wisiała w panelu jako „Błąd połączenia".
    expect(
      classifyCallOutcome({
        disconnectionReason: "Call ended by remote party",
        callSuccessful: "failure",
        durationSec: 291,
      }),
    ).toEqual({ outcome: "answered", label: "Odebrana" });
  });

  it("rozmowa zakończona przez agenta (end_call) też jest odebrana", () => {
    expect(
      classifyCallOutcome({
        disconnectionReason: "end_call tool was called.",
        callSuccessful: "failure",
        durationSec: 102,
      }).outcome,
    ).toBe("answered");
  });

  it("poczta głosowa ma pierwszeństwo przed długością nagrania", () => {
    expect(
      classifyCallOutcome({
        disconnectionReason: "voicemail_detection tool was called.",
        durationSec: 32,
      }).outcome,
    ).toBe("voicemail");
  });

  it("brak odpowiedzi rozpoznajemy po powodzie i po zerowej długości", () => {
    expect(classifyCallOutcome({ disconnectionReason: "no_answer", durationSec: 0 }).outcome).toBe(
      "no_answer",
    );
    expect(classifyCallOutcome({ callStatus: "no-answer" }).outcome).toBe("no_answer");
    expect(classifyCallOutcome({ callStatus: "canceled", durationSec: 2 }).outcome).toBe(
      "no_answer",
    );
  });

  it("zajęte i realny błąd zostają sobą", () => {
    expect(classifyCallOutcome({ disconnectionReason: "busy" }).outcome).toBe("busy");
    expect(classifyCallOutcome({ callStatus: "failed", durationSec: 0 }).outcome).toBe("failed");
    expect(
      classifyCallOutcome({ disconnectionReason: "twilio error", durationSec: 1 }).outcome,
    ).toBe("failed");
  });

  it("ocena jakości nie podnosi wyniku, gdy nikt nie odebrał", () => {
    expect(
      classifyCallOutcome({
        disconnectionReason: "no_answer",
        callSuccessful: "success",
        durationSec: 0,
      }).outcome,
    ).toBe("no_answer");
  });
});

describe("ponowne podejście", () => {
  it("po rozmowie z człowiekiem nie oddzwaniamy", () => {
    expect(shouldRetryCall("answered", 102)).toBe(false);
    // Nawet gdy wynik wyszedł jako „failed", a rozmowa trwała.
    expect(shouldRetryCall("failed", 57)).toBe(false);
  });

  it("nieodebrane, zajęte i poczta kwalifikują się do kolejnej próby", () => {
    expect(shouldRetryCall("no_answer", 0)).toBe(true);
    expect(shouldRetryCall("busy", 0)).toBe(true);
    expect(shouldRetryCall("voicemail", 12)).toBe(true);
  });

  it("twardy błąd połączenia nie generuje kolejnej próby w pętli", () => {
    expect(shouldRetryCall("failed", 0)).toBe(false);
  });
});
