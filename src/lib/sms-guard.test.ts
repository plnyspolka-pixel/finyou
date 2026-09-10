import { describe, it, expect } from "vitest";
import {
  classifySmsSource,
  decideSms,
  normalizeSmsBody,
  type RecentSms,
  type SmsLimits,
} from "./sms-guard.server";

const LIMITS: SmsLimits = {
  automatedMaxPer24h: 1,
  automatedMaxPer7d: 3,
  conversationalMaxPer24h: 8,
  duplicateWindowDays: 14,
  windowStartHour: 8,
  windowEndHour: 20,
};

// Wtorek 2026-09-08, 12:00 Warszawa (10:00 UTC, CEST = UTC+2).
const NOON = new Date("2026-09-08T10:00:00Z");
const hoursAgo = (h: number, from: Date = NOON) => new Date(from.getTime() - h * 3600_000);

const ago = (h: number, body: string): RecentSms => ({ body, createdAt: hoursAgo(h) });

function decide(over: Partial<Parameters<typeof decideSms>[0]> = {}) {
  return decideSms({
    category: "automated",
    body: "Finance You: dokoncz wniosek",
    now: NOON,
    recent: [],
    optedOut: false,
    limits: LIMITS,
    ...over,
  });
}

describe("classifySmsSource", () => {
  it("traktuje OTP, panel i windykację jako krytyczne", () => {
    expect(classifySmsSource("phone_verification")).toBe("critical");
    expect(classifySmsSource("panel_manual")).toBe("critical");
    expect(classifySmsSource("windykacja")).toBe("critical");
  });

  it("odpowiedź na SMS klienta to kanał konwersacyjny", () => {
    expect(classifySmsSource("sms_agent_reply")).toBe("conversational");
  });

  it("link wysyłany przez Anię w rozmowie podlega limitom (na wejściu wystarczy SMS powitalny)", () => {
    expect(classifySmsSource("elevenlabs_agent")).toBe("automated");
  });

  it("wszystko inne (kadencja, callbacki, meta_lead) jest automatyczne", () => {
    expect(classifySmsSource("meta_lead")).toBe("automated");
    expect(classifySmsSource("follow_up_sms_3")).toBe("automated");
    expect(classifySmsSource("ania_callback_sms")).toBe("automated");
    expect(classifySmsSource("lead_welcome")).toBe("automated");
    expect(classifySmsSource(null)).toBe("automated");
  });
});

describe("normalizeSmsBody", () => {
  it("ignoruje różnice w magic linku — ta sama wiadomość to duplikat", () => {
    const a = normalizeSmsBody("Finance You: dokończ wniosek → https://x.co/verify?token=aaa");
    const b = normalizeSmsBody("Finance You: dokończ wniosek → https://x.co/verify?token=bbb");
    expect(a).toBe(b);
  });

  it("różne treści zostają różne", () => {
    expect(normalizeSmsBody("Tu Ania, oddzwonimy")).not.toBe(normalizeSmsBody("Dokoncz wniosek"));
  });
});

describe("decideSms — SMS krytyczny", () => {
  it("przechodzi mimo limitów, wypisu i pory nocnej", () => {
    const d = decideSms({
      category: "critical",
      body: "Finance You: Twój kod weryfikacyjny to 123456.",
      now: new Date("2026-09-08T01:00:00Z"),
      recent: [ago(1, "a"), ago(2, "b"), ago(3, "c")],
      optedOut: true,
      limits: LIMITS,
    });
    expect(d.allowed).toBe(true);
  });
});

describe("decideSms — SMS automatyczny", () => {
  it("przepuszcza pierwszy SMS w oknie godzinowym", () => {
    expect(decide().allowed).toBe(true);
  });

  it("blokuje po STOP (do_not_sms)", () => {
    expect(decide({ optedOut: true })).toMatchObject({ allowed: false, reason: "opt_out" });
  });

  it("blokuje poza oknem 8–20 (SMS z 21:51 już nie pójdzie)", () => {
    // 2026-09-08 21:51 Warszawa = 19:51 UTC.
    const d = decide({ now: new Date("2026-09-08T19:51:00Z") });
    expect(d).toMatchObject({ allowed: false, reason: "quiet_hours" });
  });

  it("blokuje w niedzielę", () => {
    // 2026-09-13 to niedziela; 12:00 Warszawa.
    const d = decide({ now: new Date("2026-09-13T10:00:00Z") });
    expect(d).toMatchObject({ allowed: false, reason: "sunday" });
  });

  it("blokuje drugi SMS tego samego dnia (limit dobowy)", () => {
    const d = decide({ recent: [ago(3, "Inna tresc niz teraz")] });
    expect(d).toMatchObject({ allowed: false, reason: "rate_limit_24h" });
  });

  it("blokuje powtórkę tej samej zapowiedzi telefonu nawet po dobie", () => {
    const body = "Cześć! Tu Finance You. Za chwilę zadzwoni nasza asystentka głosowa Ania.";
    const d = decide({ body, recent: [{ body, createdAt: hoursAgo(30) }] });
    expect(d).toMatchObject({ allowed: false, reason: "duplicate" });
  });

  it("pilnuje limitu tygodniowego przy różnych treściach", () => {
    const d = decide({
      body: "czwarta rozna tresc",
      recent: [
        { body: "pierwsza", createdAt: hoursAgo(30) },
        { body: "druga", createdAt: hoursAgo(60) },
        { body: "trzecia", createdAt: hoursAgo(90) },
      ],
    });
    expect(d).toMatchObject({ allowed: false, reason: "rate_limit_7d" });
  });

  it("po wygaśnięciu okna tygodniowego znów przepuszcza", () => {
    const d = decide({
      body: "nowa tresc",
      recent: [
        { body: "pierwsza", createdAt: hoursAgo(24 * 8) },
        { body: "druga", createdAt: hoursAgo(24 * 9) },
        { body: "trzecia", createdAt: hoursAgo(24 * 10) },
      ],
    });
    expect(d.allowed).toBe(true);
  });

  it("scenariusz z reklamacji: lead z Mety nie dostaje serii SMS-ów", () => {
    const notice = "Cześć! Tu Finance You. Za chwilę zadzwoni nasza asystentka głosowa Ania.";
    // 1. zapowiedź telefonu — przechodzi
    expect(decide({ body: notice }).allowed).toBe(true);
    const sentNotice: RecentSms[] = [{ body: notice, createdAt: hoursAgo(1) }];
    // 2. ta sama zapowiedź przy kolejnej próbie telefonu — duplikat
    expect(decide({ body: notice, recent: sentNotice }).reason).toBe("duplicate");
    // 3. SMS z magic linkiem tego samego dnia — limit dobowy
    expect(
      decide({ body: "Finance You: dokoncz wniosek https://a.co/t=1", recent: sentNotice }).reason,
    ).toBe("rate_limit_24h");
    // 4. SMS z kadencji dnia 1 — też limit dobowy
    expect(decide({ body: "Finance You: policz rate", recent: sentNotice }).reason).toBe(
      "rate_limit_24h",
    );
  });
});

describe("decideSms — kanał konwersacyjny", () => {
  it("odpowiada na SMS klienta także poza oknem godzinowym", () => {
    const d = decide({
      category: "conversational",
      body: "Już sprawdzam Twój wniosek.",
      now: new Date("2026-09-08T21:30:00Z"),
    });
    expect(d.allowed).toBe(true);
  });

  it("nie wysyła w kółko tej samej odpowiedzi (pętla z automatem)", () => {
    const body = "Już sprawdzam Twój wniosek.";
    const d = decide({
      category: "conversational",
      body,
      recent: [{ body, createdAt: hoursAgo(2) }],
    });
    expect(d).toMatchObject({ allowed: false, reason: "duplicate" });
  });

  it("ucina rozmowę po limicie odpowiedzi na dobę", () => {
    const recent: RecentSms[] = Array.from({ length: 8 }, (_, i) => ago(i + 1, `odpowiedz ${i}`));
    const d = decide({ category: "conversational", body: "kolejna", recent });
    expect(d).toMatchObject({ allowed: false, reason: "loop_guard" });
  });

  it("respektuje STOP", () => {
    const d = decide({ category: "conversational", body: "cokolwiek", optedOut: true });
    expect(d).toMatchObject({ allowed: false, reason: "opt_out" });
  });
});
