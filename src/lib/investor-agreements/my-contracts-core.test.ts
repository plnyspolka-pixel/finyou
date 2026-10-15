import { describe, expect, it } from "vitest";
import { contractStage, isLiveEnvelope } from "./my-contracts-core";

const ME = "u-me";
const MAIL = "inwestor@example.com";

describe("contractStage — podział „Moich umów”", () => {
  it("bez koperty: do wysłania", () => {
    expect(contractStage(null, ME, MAIL)).toBe("do_wyslania");
  });
  it("koperta zakończona: podpisane", () => {
    expect(contractStage({ status: "zakonczona", signers: [] }, ME, MAIL)).toBe("podpisane");
  });
  it("wysłana, mój podpis brakuje (po user_id): czeka na mnie", () => {
    expect(
      contractStage(
        {
          status: "wyslana",
          signers: [
            { user_id: ME, email: "x@y.pl", status: "oczekuje" },
            { email: "klient@y.pl", status: "podpisany" },
          ],
        },
        ME,
        MAIL,
      ),
    ).toBe("czeka_na_mnie");
  });
  it("wysłana, mój podpis brakuje (po e-mailu, bez user_id): czeka na mnie", () => {
    expect(
      contractStage(
        { status: "wyslana", signers: [{ email: "Inwestor@Example.com", status: "otwarty" }] },
        ME,
        MAIL,
      ),
    ).toBe("czeka_na_mnie");
  });
  it("wysłana, ja podpisałem, klient nie: czeka na klienta", () => {
    expect(
      contractStage(
        {
          status: "wyslana",
          signers: [
            { email: "klient@y.pl", status: "weryfikacja" },
            { user_id: ME, email: MAIL, status: "podpisany" },
          ],
        },
        ME,
        MAIL,
      ),
    ).toBe("czeka_na_klienta");
  });
  it("wysłana, nie jestem podpisującym: czeka na klienta", () => {
    expect(
      contractStage(
        { status: "wyslana", signers: [{ email: "klient@y.pl", status: "oczekuje" }] },
        ME,
        MAIL,
      ),
    ).toBe("czeka_na_klienta");
  });
  it("szkic / wygasła / odrzucona: do wysłania", () => {
    for (const status of ["szkic", "wygasla", "odrzucona"]) {
      expect(contractStage({ status, signers: [] }, ME, MAIL)).toBe("do_wyslania");
    }
  });
  it("anulowana koperta nie liczy się jako umowa w obiegu", () => {
    expect(isLiveEnvelope("anulowana")).toBe(false);
    expect(isLiveEnvelope("wyslana")).toBe(true);
    expect(isLiveEnvelope("szkic")).toBe(true);
  });
});
