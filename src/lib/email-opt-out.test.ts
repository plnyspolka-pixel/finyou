import { describe, it, expect } from "vitest";
import { decideEmailSend, detectOptOut, stripQuotedReply } from "./email-opt-out";

describe("stripQuotedReply", () => {
  it("odcina cytat po nagłówku 'Od:'", () => {
    const body = [
      "Proszę o zaprzestanie wysyłki.",
      "",
      "Od: Finance You <kontakt@financeyou.pl>",
      "Temat: Przypomnienie o wniosku",
      "Wypisz mnie",
    ].join("\n");
    expect(stripQuotedReply(body)).toBe("Proszę o zaprzestanie wysyłki.");
  });

  it("odcina cytat po 'W dniu ... napisał'", () => {
    const body =
      "Dziękuję, nie jestem zainteresowany.\nW dniu 2026-09-01 Finance You napisał:\n> oferta";
    expect(stripQuotedReply(body)).toBe("Dziękuję, nie jestem zainteresowany.");
  });

  it("odcina linie cytowane '>'", () => {
    expect(stripQuotedReply("ok\n> poprzednia wiadomość\n> Wypisz mnie")).toBe("ok");
  });
});

describe("detectOptOut — rozpoznaje rezygnację", () => {
  const cases: [string, string][] = [
    ["wprost", "Proszę mnie wypisać z waszej listy."],
    ["wypiszcie", "Wypiszcie mnie natychmiast."],
    ["rezygnacja", "Rezygnuję z otrzymywania wiadomości."],
    ["zaprzestanie", "Proszę o zaprzestanie wysyłania mi wiadomości."],
    ["przestańcie", "Przestańcie do mnie pisać."],
    ["nie chcę", "Nie chcę więcej dostawać maili."],
    ["nie życzę sobie", "Nie życzę sobie kontaktu."],
    ["usuńcie", "Usuńcie mój adres z bazy."],
    ["mam dość", "Mam dość tych maili, ile można."],
    ["samo dość", "DOŚĆ!"],
    ["stop", "stop"],
    ["angielski", "Please unsubscribe me."],
    ["remove me", "Remove me from your mailing list."],
  ];
  for (const [name, text] of cases) {
    it(name, () => {
      const m = detectOptOut({ text });
      expect(m, `brak wykrycia dla: ${text}`).not.toBeNull();
      expect(m!.strength).toBe("soft");
    });
  }

  it("łapie rezygnację w temacie", () => {
    expect(detectOptOut({ subject: "Wypisz mnie", text: "" })).not.toBeNull();
  });
});

describe("detectOptOut — sygnały twarde", () => {
  it("RODO", () => {
    const m = detectOptOut({ text: "Żądam usunięcia moich danych zgodnie z RODO." });
    expect(m?.strength).toBe("hard");
  });

  it("cofnięcie zgody", () => {
    expect(detectOptOut({ text: "Cofam zgodę na przetwarzanie." })?.strength).toBe("hard");
  });

  it("groźba skargi do UODO", () => {
    expect(detectOptOut({ text: "Jeszcze jeden mail i zgłoszę to do UODO." })?.strength).toBe(
      "hard",
    );
  });

  it("zgłoszenie jako spam", () => {
    expect(detectOptOut({ text: "Zgłaszam to jako spam." })?.strength).toBe("hard");
  });
});

describe("detectOptOut — brak fałszywych alarmów", () => {
  const negatives = [
    "Dzień dobry, proszę o informację o oprocentowaniu.",
    "Czy mogę dosłać zaświadczenie jutro?",
    "Wniosek wypełniłem, proszę o kontakt telefoniczny.",
    "Dziękuję za ofertę, zastanowię się i odezwę.",
    "Mam dość dobre zabezpieczenie — mieszkanie bez hipoteki.",
    "Proszę o przesłanie umowy do podpisu.",
  ];
  for (const text of negatives) {
    it(text.slice(0, 40), () => {
      expect(detectOptOut({ text })).toBeNull();
    });
  }

  it("stopka firmowa klienta z linkiem unsubscribe nie jest rezygnacją", () => {
    const reply = [
      "Dzień dobry, proszę o przesłanie warunków.",
      "",
      "-- ",
      "Jan Kowalski | ACME sp. z o.o.",
      "You received this email as our partner. To unsubscribe click here.",
    ].join("\n");
    expect(detectOptOut({ text: reply })).toBeNull();
  });

  it("nasza własna stopka w cytacie nie jest rezygnacją", () => {
    const reply = [
      "Dziękuję, proszę o kontakt w przyszłym tygodniu.",
      "",
      "Od: Finance You <kontakt@financeyou.pl>",
      "Wypisz mnie · Finance You — pożyczki pod zastaw nieruchomości.",
    ].join("\n");
    expect(detectOptOut({ text: reply })).toBeNull();
  });
});

describe("decideEmailSend — strażnik wysyłki", () => {
  it("przepuszcza adres bez blokady", () => {
    expect(decideEmailSend({ category: "automated" })).toEqual({ allowed: true });
  });

  it("blokuje marketing po wypisie", () => {
    expect(
      decideEmailSend({ suppression: { reason: "unsubscribe" }, category: "automated" }),
    ).toMatchObject({ allowed: false, reason: "suppressed:unsubscribe" });
  });

  it("przepuszcza mail z umowy mimo zwykłego wypisu", () => {
    expect(
      decideEmailSend({ suppression: { reason: "unsubscribe" }, category: "transactional" }),
    ).toEqual({ allowed: true });
  });

  it("twarda blokada zatrzymuje także maile z umowy", () => {
    expect(
      decideEmailSend({
        suppression: { reason: "unsubscribe", hard: true },
        category: "transactional",
      }),
    ).toMatchObject({ allowed: false, detail: "hard" });
  });

  it("skarga spam blokuje wszystko", () => {
    expect(
      decideEmailSend({ suppression: { reason: "complaint" }, category: "transactional" }),
    ).toMatchObject({ allowed: false, reason: "suppressed:complaint" });
  });

  it("odbicie i pętla bot-bot blokują wszystko", () => {
    for (const reason of ["bounce", "loop_detected", "bot_detected", "repeated_content"]) {
      expect(decideEmailSend({ suppression: { reason }, category: "transactional" }).allowed).toBe(
        false,
      );
    }
  });

  it("do_not_email z kartoteki blokuje automaty, przepuszcza umowę", () => {
    expect(decideEmailSend({ doNotEmail: true, category: "automated" })).toMatchObject({
      allowed: false,
      reason: "do_not_email",
    });
    expect(decideEmailSend({ doNotEmail: true, category: "transactional" })).toEqual({
      allowed: true,
    });
  });
});

describe("decideEmailSend — cofnięty wypis", () => {
  it("wpis oznaczony jako odblokowany nie blokuje", () => {
    expect(
      decideEmailSend({
        suppression: { reason: "unsubscribe", unblocked: true },
        category: "automated",
      }),
    ).toEqual({ allowed: true });
  });
});
