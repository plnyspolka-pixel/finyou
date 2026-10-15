import { describe, expect, it } from "vitest";
import {
  canWithdrawOffer,
  decidableFrom,
  isOfferAccepted,
  shouldAutoAccept,
  statusAfterDecision,
} from "./acceptance";

describe("propozycje 1:1 — akceptacja", () => {
  it("złożona propozycja nie odblokowuje dalszego etapu", () => {
    expect(isOfferAccepted("zlozona")).toBe(false);
    expect(isOfferAccepted("w_trakcie_weryfikacji")).toBe(false);
    expect(isOfferAccepted("odrzucona_przez_administratora")).toBe(false);
  });

  it("akceptacja administratora lub klienta odblokowuje dalszy etap", () => {
    expect(isOfferAccepted("zatwierdzona_przez_administratora")).toBe(true);
    expect(isOfferAccepted("zaakceptowana_przez_klienta")).toBe(true);
    // Przekazanie klientowi to jeszcze nie akceptacja — czeka na decyzję klienta.
    expect(isOfferAccepted("wyslana_do_klienta")).toBe(false);
  });

  it("status po decyzji zależy od strony", () => {
    expect(statusAfterDecision("administrator", "accept")).toBe(
      "zatwierdzona_przez_administratora",
    );
    expect(statusAfterDecision("operator", "reject")).toBe("odrzucona_przez_administratora");
    expect(statusAfterDecision("pozyczkobiorca", "accept")).toBe("zaakceptowana_przez_klienta");
    expect(statusAfterDecision("posrednik", "reject")).toBe("odrzucona_przez_klienta");
  });

  it("zespół decyduje tylko o oczekujących, klient także po zatwierdzeniu", () => {
    expect(decidableFrom("administrator")).not.toContain("wyslana_do_klienta");
    expect(decidableFrom("pozyczkobiorca")).toContain("wyslana_do_klienta");
    expect(decidableFrom("posrednik")).not.toContain("odrzucona_przez_administratora");
  });

  it("auto-akceptacja tylko dla konta inwestor + administrator", () => {
    expect(shouldAutoAccept(["inwestor", "administrator"], true)).toBe(true);
    expect(shouldAutoAccept(["inwestor"], true)).toBe(false);
    expect(shouldAutoAccept(["administrator"], false)).toBe(false);
    expect(shouldAutoAccept(["inwestor", "operator"], true)).toBe(false);
  });
});

describe("canWithdrawOffer", () => {
  it("pozwala wycofać złożoną i zaakceptowaną propozycję", () => {
    for (const s of [
      "zlozona",
      "w_trakcie_weryfikacji",
      "zatwierdzona_przez_administratora",
      "wyslana_do_klienta",
      "zaakceptowana_przez_klienta",
    ]) {
      expect(canWithdrawOffer(s)).toBe(true);
    }
  });
  it("nie pozwala wycofać szkicu, odrzuconej, wygasłej ani już wycofanej", () => {
    for (const s of [
      "szkic",
      "odrzucona_przez_administratora",
      "odrzucona_przez_klienta",
      "wygasla",
      "wycofana_przez_inwestora",
      null,
    ]) {
      expect(canWithdrawOffer(s)).toBe(false);
    }
  });
});
