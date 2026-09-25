import { describe, it, expect } from "vitest";
import { guardOutboundContactDetails, nationalPhoneDigits } from "./bot-contact-guard";

describe("guardOutboundContactDetails", () => {
  it("wycina zdanie ze zmyślonym numerem telefonu", () => {
    const res = guardOutboundContactDetails(
      "Dziękuję za informacje. Proszę zadzwonić pod numer +48 22 230 25 79. Wniosek uzupełnimy tutaj.",
    );
    expect(res.text).not.toContain("230 25 79");
    expect(res.text).toContain("Dziękuję za informacje.");
    expect(res.text).toContain("Wniosek uzupełnimy tutaj.");
    expect(res.redactions).toHaveLength(1);
    expect(res.redactions[0].kind).toBe("telefon");
  });

  it("zostawia numer, który klient sam podał w rozmowie", () => {
    const res = guardOutboundContactDetails(
      "Potwierdzam numer 501 123 456 — zapisałam go przy wniosku.",
      { knownText: ["Mój telefon to 501123456"] },
    );
    expect(res.text).toContain("501 123 456");
    expect(res.redactions).toHaveLength(0);
  });

  it("zostawia prawdziwy numer i adres e-mail Finance You", () => {
    const res = guardOutboundContactDetails(
      "Nasz numer to +48 732 059 898, a adres e-mail kontakt@financeyou.pl.",
    );
    expect(res.redactions).toHaveLength(0);
    expect(res.text).toContain("+48 732 059 898");
  });

  it("nie rusza kwot ani numeru księgi wieczystej", () => {
    const res = guardOutboundContactDetails(
      "Przy wartości 1 500 000 zł możemy rozmawiać o 360 000 zł. Numer księgi WA1M/00123456/7 się zgadza.",
    );
    expect(res.redactions).toHaveLength(0);
    expect(res.text).toContain("360 000 zł");
    expect(res.text).toContain("WA1M/00123456/7");
  });

  it("wycina obcy adres e-mail, zostawia resztę wiadomości", () => {
    const res = guardOutboundContactDetails(
      "Rozumiem sytuację. Proszę napisać na biuro@pozyczki24.pl. Zdjęcia wrzucimy do wniosku.",
    );
    expect(res.text).not.toContain("pozyczki24.pl");
    expect(res.redactions[0].kind).toBe("email");
    expect(res.text).toContain("Zdjęcia wrzucimy do wniosku.");
  });

  it("zostawia nasz link do wniosku, wycina obcy adres", () => {
    const ours = guardOutboundContactDetails(
      "Link do wniosku: https://financeyou.pl/klient?token=abc123",
    );
    expect(ours.redactions).toHaveLength(0);

    const foreign = guardOutboundContactDetails(
      "Dziękuję. Formularz jest pod https://szybkie-pozyczki.example.com/wniosek. Czekam na dokumenty.",
    );
    expect(foreign.text).not.toContain("example.com");
    expect(foreign.redactions[0].kind).toBe("adres");
  });

  it("nie wycina spersonalizowanego linku do wniosku podanego botowi w kontekście", () => {
    const link =
      "https://abcdefgh.supabase.co/auth/v1/verify?token=482913756102&type=magiclink&redirect_to=https://financeyou.pl/klient";
    const res = guardOutboundContactDetails(`Jasne! Twój link do dokończenia wniosku: ${link}.`, {
      knownText: ["Poproszę link do wniosku", link],
    });
    expect(res.redactions).toHaveLength(0);
    expect(res.usedFallback).toBe(false);
    expect(res.text).toContain(link);
  });

  it("link z kontekstu przechodzi też z &amp; i końcową interpunkcją", () => {
    const link = "https://abcdefgh.supabase.co/auth/v1/verify?token=abc&type=magiclink";
    const res = guardOutboundContactDetails(
      `Proszę: https://abcdefgh.supabase.co/auth/v1/verify?token=abc&amp;type=magiclink!`,
      { knownText: [link] },
    );
    expect(res.redactions).toHaveLength(0);
  });

  it("zostawia krótki link i subdomeny Finance You, nawet z cyframi w kodzie", () => {
    const res = guardOutboundContactDetails(
      "Twój link: https://financeyou.pl/s/ab3k9x. Panel: https://app.financeyou.pl/klient/123456789.",
    );
    expect(res.redactions).toHaveLength(0);
    expect(res.text).toContain("https://financeyou.pl/s/ab3k9x");
  });

  it("wciąż wycina zmyślony numer w zdaniu obok naszego linku", () => {
    const res = guardOutboundContactDetails(
      "Link: https://financeyou.pl/klient i telefon +48 22 230 25 79. Czekam na dane wniosku.",
    );
    expect(res.redactions[0].kind).toBe("telefon");
    expect(res.text).toBe("Czekam na dane wniosku.");
  });

  it("gdy po czyszczeniu nie zostaje nic, wysyła bezpieczne zdanie zastępcze", () => {
    const res = guardOutboundContactDetails("Proszę dzwonić: +48 22 230 25 79.", {
      fallback: "Zostańmy przy wniosku — co jeszcze mogę wyjaśnić?",
    });
    expect(res.usedFallback).toBe(true);
    expect(res.text).toBe("Zostańmy przy wniosku — co jeszcze mogę wyjaśnić?");
  });

  it("czysta wiadomość przechodzi bez zmian", () => {
    const message = "Rozumiem. Do wyceny potrzebuję rodzaju nieruchomości — dom czy mieszkanie?";
    const res = guardOutboundContactDetails(message);
    expect(res.text).toBe(message);
    expect(res.redactions).toHaveLength(0);
    expect(res.usedFallback).toBe(false);
  });
});

describe("nationalPhoneDigits", () => {
  it("rozpoznaje zapisy polskiego numeru", () => {
    expect(nationalPhoneDigits("+48 732 059 898")).toBe("732059898");
    expect(nationalPhoneDigits("0048732059898")).toBe("732059898");
    expect(nationalPhoneDigits("732-059-898")).toBe("732059898");
  });

  it("odrzuca ciągi, które nie są numerem", () => {
    expect(nationalPhoneDigits("1500000")).toBeNull();
    expect(nationalPhoneDigits("70106118031")).toBeNull();
  });
});
