import { describe, it, expect } from "vitest";
import {
  audienceFor,
  buildClientMessage,
  deriveQaThreadState,
  outstandingQuestions,
  parseExtractedQuestions,
  questionKey,
  type ThreadQuestion,
} from "./qa-questions";

// Pytania wzięte 1:1 z wątków w panelu (7-9.09.2026).
describe("questionKey — deduplikacja między instytucjami", () => {
  it("scala parafrazy tego samego tematu", () => {
    expect(
      questionKey("Czy Klient jest przedsiębiorcą? Proszę o wskazanie numeru NIP firmy."),
    ).toBe(questionKey("NIP Pożyczkobiorcy"));
    expect(questionKey("Ile lat ma pożyczkobiorca oraz właściciel nieruchomości?")).toBe(
      questionKey("W jakim wieku jest właścicielka nieruchomości?"),
    );
    expect(questionKey("Jaki jest cel pożyczki?")).toBe(
      questionKey(
        "Jaki jest dokładny cel pożyczki? Na co konkretnie Klient chce przeznaczyć środki?",
      ),
    );
    expect(questionKey("Jaki plan na spłatę ma Klient?")).toBe(
      questionKey("Z czego nastąpi spłata kapitału po roku?"),
    );
    expect(questionKey("Kto mieszka w nieruchomości?")).toBe(
      questionKey("Kto zamieszkuje wskazaną nieruchomość?"),
    );
  });

  it("nie scala tematów, które tylko wyglądają podobnie", () => {
    expect(questionKey("Jakie są aktualne dochody?")).not.toBe(
      questionKey("Wyniki finansowe pożyczkobiorcy za rok 2025 oraz okres bieżący"),
    );
    expect(questionKey("Jaka jest powierzchnia budynku?")).not.toBe(
      questionKey("Kto jest obecnie właścicielem nieruchomości?"),
    );
  });

  it("dla nieznanego tematu bierze podpowiedź modelu, a w ostateczności tekst", () => {
    expect(questionKey("Czy pies jest groźny?", "pies_na_posesji")).toBe("pies_na_posesji");
    expect(questionKey("Czy pies jest groźny?")).toBe("czy pies jest groźny");
  });
});

describe("audienceFor — kto ma odpowiadać", () => {
  it("pytania z KW i o status wniosku zostają w biurze", () => {
    for (const q of [
      "Czy KW jest aktualna?",
      "Czy numer księgi wieczystej jest poprawny?",
      "Proszę o wyjaśnienie wzmianki: 1. REP.C. / NOTA / 376717 / 26",
      "Czy jest decyzja w sprawie wniosku?",
    ]) {
      expect(audienceFor(q, questionKey(q))).toBe("biuro");
    }
  });

  it("pytania o klienta idą do klienta", () => {
    for (const q of [
      "Na jakim poziomie kształtuje się dochód Klienta?",
      "Proszę o nadesłanie zdjęć budynków naniesionych na działce.",
      "Czy Klient ma zaległości ZUS/US, w jakiej wysokości?",
    ]) {
      expect(audienceFor(q, questionKey(q))).toBe("klient");
    }
  });

  it("model może przekierować pytanie do biura, ale nie odwrotnie", () => {
    expect(
      audienceFor("Jakieś pytanie techniczne", questionKey("Jakieś pytanie techniczne"), "biuro"),
    ).toBe("biuro");
    expect(
      audienceFor("Czy KW jest aktualna?", questionKey("Czy KW jest aktualna?"), "klient"),
    ).toBe("biuro");
  });
});

describe("parseExtractedQuestions", () => {
  it("przyjmuje stary format (stringi) i nowy (obiekty)", () => {
    const out = parseExtractedQuestions([
      "Jaki jest cel pożyczki?",
      { text: "Czy KW jest aktualna?", audience: "klient" },
      { text: "Jaki jest dokładny cel pożyczki?" },
      "",
      null,
    ]);
    expect(out.map((q) => q.text)).toEqual(["Jaki jest cel pożyczki?", "Czy KW jest aktualna?"]);
    expect(out[1].audience).toBe("biuro");
  });

  it("usuwa duplikaty w obrębie jednego maila", () => {
    const out = parseExtractedQuestions(["NIP Pożyczkobiorcy", "Proszę o numer NIP firmy."]);
    expect(out).toHaveLength(1);
  });
});

describe("deriveQaThreadState", () => {
  const q = (over: Partial<ThreadQuestion> = {}): ThreadQuestion => ({
    text: "x",
    key: "x",
    from: [],
    distribution_ids: [],
    asked_client_at: null,
    answered_at: null,
    ...over,
  });

  it("wątek bez wysyłki nie udaje, że czeka na klienta", () => {
    expect(deriveQaThreadState({ status: "otwarte", questions: [q()] }).key).toBe("do_wyslania");
  });

  it("blokada ma pierwszeństwo i wymaga reakcji", () => {
    const s = deriveQaThreadState({
      status: "otwarte",
      questions: [q()],
      blocked_reason: "Brak kanału kontaktu",
      last_sent_to_client_at: null,
    });
    expect(s.key).toBe("zablokowane");
    expect(s.needsAttention).toBe(true);
  });

  it("po wysyłce czeka na odpowiedź, a po częściowej odpowiedzi widać brak reszty", () => {
    expect(
      deriveQaThreadState({
        status: "otwarte",
        questions: [q({ asked_client_at: "2026-09-03T15:30:00Z" })],
        last_sent_to_client_at: "2026-09-03T15:30:00Z",
      }).key,
    ).toBe("czeka");
    expect(
      deriveQaThreadState({
        status: "otwarte",
        questions: [q({ asked_client_at: "2026-09-03T15:30:00Z" })],
        last_sent_to_client_at: "2026-09-03T15:30:00Z",
        forwarded_at: "2026-09-05T10:00:00Z",
      }).key,
    ).toBe("czesciowo");
  });

  it("statusy końcowe wygrywają z blokadą", () => {
    expect(deriveQaThreadState({ status: "przekazane", blocked_reason: "x" }).key).toBe(
      "przekazane",
    );
    expect(deriveQaThreadState({ status: "zamkniete", blocked_reason: "x" }).key).toBe("zamkniete");
  });
});

describe("outstandingQuestions i treść wiadomości", () => {
  it("zostawia tylko wysłane i nieodpowiedziane", () => {
    const qs: ThreadQuestion[] = [
      {
        text: "a",
        key: "a",
        from: [],
        distribution_ids: [],
        asked_client_at: "t",
        answered_at: null,
      },
      {
        text: "b",
        key: "b",
        from: [],
        distribution_ids: [],
        asked_client_at: "t",
        answered_at: "t2",
      },
      {
        text: "c",
        key: "c",
        from: [],
        distribution_ids: [],
        asked_client_at: null,
        answered_at: null,
      },
    ];
    expect(outstandingQuestions(qs).map((q) => q.text)).toEqual(["a"]);
  });

  it("przypomnienie ma inny wstęp niż pierwsza wiadomość", () => {
    const qs: ThreadQuestion[] = [
      {
        text: "Jaki jest cel pożyczki?",
        key: "cel_pozyczki",
        from: [],
        distribution_ids: [],
        asked_client_at: null,
      },
    ];
    expect(buildClientMessage(qs)).toContain("prosi o dodatkowe informacje");
    expect(buildClientMessage(qs, { reminder: true })).toContain("wracamy do pytań");
    expect(buildClientMessage(qs)).toContain("1. Jaki jest cel pożyczki?");
  });
});
