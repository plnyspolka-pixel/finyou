import { describe, expect, it } from "vitest";
import { extractInboundFacts } from "./lead-enrichment.server";

describe("extractInboundFacts — kwota", () => {
  it("nie bierze koloru hex z CSS phishingowego maila za kwotę (#951246)", () => {
    const text =
      "body{margin:0;padding:0}.mail a[href]:not(.deep-link){color:#c2185b}" +
      ".mail a[href]:not(.deep-link):hover{color:#951246}" +
      "blockquote{color:#6a1b9a !important;border-left:2px solid #6a1b9a}";
    expect(extractInboundFacts(text).loanAmount).toBeNull();
  });

  it("nie bierze cyfr z adresu e-mail za kwotę (ikunia8900@…)", () => {
    const text =
      "Cześć! Wypełniłem(am) formularz.\nFull name: Ewelina Flis\n" +
      "Phone number: 730 397 993\nEmail: ikunia8900@interia.pl";
    expect(extractInboundFacts(text).loanAmount).toBeNull();
  });

  it("nie bierze numeru telefonu za kwotę", () => {
    expect(extractInboundFacts("Proszę o kontakt: 511 834 349").loanAmount).toBeNull();
    expect(extractInboundFacts("tel. 511834349").loanAmount).toBeNull();
  });

  it("ignoruje gołą liczbę bez waluty i słowa-klucza", () => {
    expect(extractInboundFacts("numer sprawy 951246").loanAmount).toBeNull();
    expect(extractInboundFacts("kod 88123").loanAmount).toBeNull();
  });

  it("akceptuje kwotę z walutą", () => {
    expect(extractInboundFacts("Chciałbym 8900 zł").loanAmount).toBe(8900);
    expect(extractInboundFacts("mam do spłaty 100 000 PLN").loanAmount).toBe(100000);
    expect(extractInboundFacts("50 tys zł na remont").loanAmount).toBe(50000);
    expect(extractInboundFacts("inwestycja 1,2 mln").loanAmount).toBe(1200000);
  });

  it("akceptuje kwotę ze słowem-kluczem bez waluty", () => {
    expect(extractInboundFacts("kwota: 250000").loanAmount).toBe(250000);
    expect(extractInboundFacts("potrzebuję 150 000 na dokończenie budowy").loanAmount).toBe(150000);
    expect(extractInboundFacts("wnioskuję o kredyt w wysokości 320.000").loanAmount).toBe(320000);
  });

  it("wybiera największą wiarygodną kwotę", () => {
    expect(
      extractInboundFacts("potrzebuję 100 000 zł, ale wystarczy też 50 000 zł").loanAmount,
    ).toBe(100000);
  });

  it("odsiewa wartości spoza zakresu 5 tys – 10 mln", () => {
    expect(extractInboundFacts("potrzebuję 3000 zł").loanAmount).toBeNull();
    expect(extractInboundFacts("kwota 50 mln zł").loanAmount).toBeNull();
  });

  it("ignoruje liczby w linkach", () => {
    expect(
      extractInboundFacts("Szczegóły: https://example.com/oferta/951246?id=88123").loanAmount,
    ).toBeNull();
  });
});

describe("extractInboundFacts — KW i miasto", () => {
  it("wyciąga numer KW także z maila z HTML", () => {
    const text = "<p>Moja księga to <b>WR1E/00097423/1</b>, potrzebuję 60 000 zł</p>";
    const facts = extractInboundFacts(text);
    expect(facts.kwNumbers).toEqual(["WR1E/00097423/1"]);
    expect(facts.loanAmount).toBe(60000);
  });

  it("wyciąga miasto", () => {
    expect(extractInboundFacts("mieszkanie w Poznaniu, kwota 200 000 zł").city).toBe("Poznaniu");
  });

  it("jest stabilna między wywołaniami (regex z flagą g)", () => {
    const text = "działka w Krakowie";
    expect(extractInboundFacts(text).city).toBe("Krakowie");
    expect(extractInboundFacts(text).city).toBe("Krakowie");
  });
});

describe("extractInboundFacts — imię i nazwisko", () => {
  it("wyciąga imię i nazwisko po 'pozdrawiam'", () => {
    const f = extractInboundFacts(
      "Witam proszę o kontakt jestem zainteresowany ofertą pozdrawiam Waldek Trojanowski",
    );
    expect(f.firstName).toBe("Waldek");
    expect(f.lastName).toBe("Trojanowski");
  });

  it("wyciąga imię i nazwisko po 'nazywam się'", () => {
    const f = extractInboundFacts("Dzień dobry, nazywam się Anna Kowalska-Nowak i szukam pożyczki");
    expect(f.firstName).toBe("Anna");
    expect(f.lastName).toBe("Kowalska-Nowak");
  });

  it("wyciąga samo imię po 'mam na imię'", () => {
    const f = extractInboundFacts("Cześć, mam na imię Jan i mam pytanie");
    expect(f.firstName).toBe("Jan");
    expect(f.lastName).toBeNull();
  });

  it("nie łapie 'jestem zainteresowany' jako nazwiska", () => {
    const f = extractInboundFacts("Witam, jestem zainteresowany ofertą pożyczki");
    expect(f.firstName).toBeNull();
    expect(f.lastName).toBeNull();
  });

  it("nie łapie 'Pozdrawiam Serdecznie'", () => {
    const f = extractInboundFacts("Dziękuję za informacje. Pozdrawiam Serdecznie");
    expect(f.firstName).toBeNull();
  });

  it("nadal wyciąga kwotę i KW razem z nazwiskiem", () => {
    const f = extractInboundFacts(
      "Potrzebuję 360000 złotych, KW WR1E/00097423/1, pozdrawiam Waldek Trojanowski",
    );
    expect(f.loanAmount).toBe(360000);
    expect(f.kwNumbers).toContain("WR1E/00097423/1");
    expect(f.firstName).toBe("Waldek");
    expect(f.lastName).toBe("Trojanowski");
  });
});

describe("extractInboundFacts — kwota pożyczki vs wartość nieruchomości", () => {
  it("nie bierze wartości domu za kwotę pożyczki (przypadek z Messengera)", () => {
    const f = extractInboundFacts(
      "Wartość domu to około 600000 złotych akurat tak jak w ogłoszeniu więc 360000 złotych jak najbardziej byłoby ok",
    );
    expect(f.loanAmount).toBe(360000);
    expect(f.propertyValue).toBe(600000);
  });

  it("słowo-klucz prośby wygrywa z większą liczbą bez kontekstu", () => {
    const f = extractInboundFacts("Dom jest wart 900 000 zł, potrzebuję 250 000 zł");
    expect(f.loanAmount).toBe(250000);
    expect(f.propertyValue).toBe(900000);
  });

  it("'wycena' też oznacza wartość nieruchomości", () => {
    const f = extractInboundFacts("Wycena mieszkania: 450 000 zł. Chciałbym 200 000 zł");
    expect(f.propertyValue).toBe(450000);
    expect(f.loanAmount).toBe(200000);
  });

  it("'wartość pożyczki' to nadal kwota pożyczki (słowo-klucz)", () => {
    const f = extractInboundFacts("wartość pożyczki 300 000 zł");
    expect(f.loanAmount).toBe(300000);
  });

  it("sama kwota z walutą bez kontekstu wartości pozostaje kwotą pożyczki", () => {
    const f = extractInboundFacts("Chciałbym 8900 zł");
    expect(f.loanAmount).toBe(8900);
    expect(f.propertyValue).toBeNull();
  });
});

describe("extractInboundFacts — formularz reklamy FB", () => {
  const fbGreeting =
    "Cześć! Wypełniłem(am) formularz i chcę dowiedzieć się więcej o Twojej firmie.\n" +
    "Full name: Michał Szpak\nPhone number: 609 657 140\nEmail: michszpak@gmail.com";

  it("wyciąga imię, nazwisko, telefon i e-mail z bloku formularza", () => {
    const f = extractInboundFacts(fbGreeting);
    expect(f.firstName).toBe("Michał");
    expect(f.lastName).toBe("Szpak");
    expect(f.phone).toBe("609 657 140");
    expect(f.email).toBe("michszpak@gmail.com");
    expect(f.loanAmount).toBeNull();
  });

  it("radzi sobie z samym imieniem w formularzu", () => {
    const f = extractInboundFacts(
      "Full name: Marzena\nPhone number: 511 834 349\nEmail: kontakt.amd@wp.pl",
    );
    expect(f.firstName).toBe("Marzena");
    expect(f.lastName).toBeNull();
    expect(f.email).toBe("kontakt.amd@wp.pl");
  });

  it("formularz ma pierwszeństwo przed 'pozdrawiam…' w tej samej wiadomości", () => {
    const f = extractInboundFacts("Full name: Jan Nowak\npozdrawiam Adam Inny");
    expect(f.firstName).toBe("Jan");
    expect(f.lastName).toBe("Nowak");
  });

  it("zwykła wiadomość bez formularza nie ma e-maila/telefonu", () => {
    const f = extractInboundFacts("Dzień dobry, potrzebuję 100 000 zł");
    expect(f.email).toBeNull();
    expect(f.phone).toBeNull();
  });
});

describe("extractInboundFacts — telefon poza formularzem", () => {
  it("cała wiadomość będąca numerem to telefon (odpowiedź na pytanie bota)", () => {
    expect(extractInboundFacts("609 657 140").phone).toBe("609 657 140");
    expect(extractInboundFacts("+48 609 657 140").phone).toBe("+48 609 657 140");
    expect(extractInboundFacts("609657140").phone).toBe("609657140");
  });

  it("numer po 'tel/kontakt' to telefon", () => {
    expect(extractInboundFacts("Proszę o kontakt: 511 834 349").phone).toBe("511 834 349");
    expect(extractInboundFacts("tel. 511834349").phone).toBe("511834349");
    expect(extractInboundFacts("mój numer to 730 397 993").phone).toBe("730 397 993");
  });

  it("kwota nie jest braną za telefon", () => {
    const f = extractInboundFacts("potrzebuję 360000 zł");
    expect(f.phone).toBeNull();
    expect(f.loanAmount).toBe(360000);
  });

  it("numer w środku zdania bez kontekstu nie jest telefonem", () => {
    expect(extractInboundFacts("działka ma 123 456 789 m2 powierzchni").phone).toBeNull();
  });
});
