import { describe, expect, it } from "vitest";
import {
  looksLikeAutoMessage,
  isAutoReplySubject,
  isRepetitiveInbound,
  maxRepeatedContent,
  countFastPingPong,
} from "./bot-detection";

describe("looksLikeAutoMessage", () => {
  it("wykrywa polskie autorespondery", () => {
    expect(looksLikeAutoMessage("To jest automatyczna odpowiedź. Wrócę 5 sierpnia.")).toBeTruthy();
    expect(looksLikeAutoMessage("Odpowiedź automatyczna: dziękuję za maila")).toBeTruthy();
    expect(looksLikeAutoMessage("Wiadomość wygenerowana automatycznie, prosimy nie odpowiadać")).toBeTruthy();
    expect(looksLikeAutoMessage("Obecnie przebywam na urlopie do 12.08")).toBeTruthy();
  });

  it("wykrywa angielskie autorespondery i bounce", () => {
    expect(looksLikeAutoMessage("This is an automated message, do not reply to this email")).toBeTruthy();
    expect(looksLikeAutoMessage("I am currently out of office until Monday")).toBeTruthy();
    expect(looksLikeAutoMessage("Mail delivery failed: returning message to sender")).toBeTruthy();
    expect(looksLikeAutoMessage("Delivery Status Notification (Failure)")).toBeTruthy();
  });

  it("wykrywa boty przedstawiające się jako bot / wirtualny asystent", () => {
    expect(looksLikeAutoMessage("Cześć! Jestem wirtualnym asystentem firmy X.")).toBeTruthy();
    expect(looksLikeAutoMessage("Hi, I'm a chatbot and I can help you 24/7")).toBeTruthy();
    expect(looksLikeAutoMessage("Jestem botem obsługującym tę stronę")).toBeTruthy();
  });

  it("wykrywa automatyczne powitania stron ('odpowiemy wkrótce')", () => {
    expect(looksLikeAutoMessage("Dziękujemy za wiadomość! Odpowiemy najszybciej jak to możliwe.")).toBeTruthy();
    expect(looksLikeAutoMessage("Thank you for contacting us. We'll get back to you soon.")).toBeTruthy();
  });

  it("nie łapie normalnych wiadomości klientów", () => {
    expect(looksLikeAutoMessage("Dzień dobry, potrzebuję pożyczki 200 000 zł pod dom")).toBeNull();
    expect(looksLikeAutoMessage("Dziękuję za wiadomość, przesyłam dokumenty w załączniku")).toBeNull();
    expect(looksLikeAutoMessage("Kiedy mogę spodziewać się decyzji?")).toBeNull();
    expect(looksLikeAutoMessage("ok")).toBeNull();
    expect(looksLikeAutoMessage("")).toBeNull();
    expect(looksLikeAutoMessage(null)).toBeNull();
  });

  it("ignoruje sygnatury głęboko w cytowanej historii wątku", () => {
    const quoted = "Tak, poproszę o ofertę.\n\n" + "x".repeat(2000) + "\nautomatyczna odpowiedź";
    expect(looksLikeAutoMessage(quoted)).toBeNull();
  });
});

describe("isAutoReplySubject", () => {
  it("wykrywa tematy autoresponderów", () => {
    expect(isAutoReplySubject("Automatic reply: Twoje zapytanie")).toBe(true);
    expect(isAutoReplySubject("Odpowiedź automatyczna: urlop")).toBe(true);
    expect(isAutoReplySubject("Autoodpowiedź")).toBe(true);
    expect(isAutoReplySubject("Out of Office - John Smith")).toBe(true);
    expect(isAutoReplySubject("Undeliverable: Oferta finansowania")).toBe(true);
  });

  it("radzi sobie z prefiksami Re:/Odp:", () => {
    expect(isAutoReplySubject("Re: Automatic reply: Oferta")).toBe(true);
    expect(isAutoReplySubject("Odp: Autoodpowiedź: kontakt")).toBe(true);
  });

  it("nie łapie zwykłych tematów", () => {
    expect(isAutoReplySubject("Pytanie o pożyczkę pod zastaw")).toBe(false);
    expect(isAutoReplySubject("Re: Oferta finansowania")).toBe(false);
    expect(isAutoReplySubject("")).toBe(false);
    expect(isAutoReplySubject(null)).toBe(false);
  });
});

describe("maxRepeatedContent / isRepetitiveInbound", () => {
  it("liczy powtórzenia niezależnie od wielkości liter i spacji", () => {
    const { count } = maxRepeatedContent([
      "Dziękujemy za kontakt!",
      "dziękujemy  za kontakt! ",
      "DZIĘKUJEMY ZA KONTAKT!",
    ]);
    expect(count).toBe(3);
  });

  it("3 identyczne dłuższe wiadomości = pętla", () => {
    const msg = "Zapraszamy do naszego biura";
    expect(isRepetitiveInbound([msg, msg, msg])).toBe(true);
  });

  it("krótkie potwierdzenia ('ok') dopiero przy 5 powtórzeniach", () => {
    expect(isRepetitiveInbound(["ok", "ok", "ok"])).toBe(false);
    expect(isRepetitiveInbound(["ok", "ok", "ok", "ok", "ok"])).toBe(true);
  });

  it("różnorodna rozmowa nie jest pętlą", () => {
    expect(
      isRepetitiveInbound(["Dzień dobry", "Potrzebuję 100 tys.", "Na 24 miesiące", "Dziękuję"]),
    ).toBe(false);
    expect(isRepetitiveInbound([])).toBe(false);
  });
});

describe("countFastPingPong", () => {
  const t = (sec: number) => new Date(1700000000000 + sec * 1000).toISOString();

  it("liczy przychodzące <5s po naszej wychodzącej", () => {
    const rows = [
      { direction: "outbound", createdAt: t(0) },
      { direction: "inbound", createdAt: t(1) }, // 1s — fast
      { direction: "outbound", createdAt: t(10) },
      { direction: "inbound", createdAt: t(12) }, // 2s — fast
      { direction: "outbound", createdAt: t(20) },
      { direction: "inbound", createdAt: t(24) }, // 4s — fast
    ];
    expect(countFastPingPong(rows)).toBe(3);
  });

  it("człowiek odpisujący po kilkudziesięciu sekundach nie jest botem", () => {
    const rows = [
      { direction: "outbound", createdAt: t(0) },
      { direction: "inbound", createdAt: t(45) },
      { direction: "outbound", createdAt: t(60) },
      { direction: "inbound", createdAt: t(130) },
    ];
    expect(countFastPingPong(rows)).toBe(0);
  });

  it("nie liczy par inbound->inbound ani outbound->outbound", () => {
    const rows = [
      { direction: "inbound", createdAt: t(0) },
      { direction: "inbound", createdAt: t(1) },
      { direction: "outbound", createdAt: t(2) },
      { direction: "outbound", createdAt: t(3) },
    ];
    expect(countFastPingPong(rows)).toBe(0);
  });
});
