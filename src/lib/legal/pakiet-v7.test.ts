/**
 * Pakiet inwestora v7: transformacje treści są deterministyczne, usuwają
 * Pakiety, Cennik i opłaty jednostkowe, wprowadzają jedną Opłatę Abonamentową,
 * a zostawiają Karę Obejściową 5 % i 5-letni Okres Ochronny. Źródła
 * (v6/v5/v4) czytamy z migracji SQL.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { SUBSCRIPTION_MONTHLY_PLN, SUBSCRIPTION_YEARLY_PLN } from "@/lib/investor-plan/plans";
import {
  ABONAMENT_UMOWA,
  FORBIDDEN_IN_V7,
  NEW_EMAIL,
  OLD_EMAIL,
  PACKAGE_ID_V7,
  prowizjaOdPozyczkobiorcy,
  transformNdaV6,
  transformRodoV5,
  transformUmowaV7,
} from "./pakiet-v7";
import { readLegalSources } from "./sources";

const src = readLegalSources();

describe("umowa ramowa v7", () => {
  const v7 = transformUmowaV7(src.umowa_ramowa.content_text);

  it("nie zawiera Pakietów, Cennika, opłat jednostkowych, Zał. 8 ani starego e-maila", () => {
    for (const f of FORBIDDEN_IN_V7) {
      expect(v7, `fraza „${f}” nie może wystąpić`).not.toContain(f);
    }
    expect(v7).not.toMatch(/ZAŁĄCZNIK NR 8/);
  });

  it("nagłówek wersji spójny z package_id; Opłata Abonamentowa; 7 % Kwoty Udzielonej bez VAT", () => {
    expect(v7).toContain(`${PACKAGE_ID_V7}.v7`);
    expect(v7).toContain("7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT");
    expect(v7).toContain("Załączniki nr 1–7");
    expect(v7).not.toMatch(/nieodpłatn/i);
  });

  it("Opłata Abonamentowa: 1 500 zł / 30 dni albo 7 000 zł / 365 dni, jedyne wynagrodzenie od Inwestora", () => {
    expect(ABONAMENT_UMOWA).toBe("1 500,00 zł brutto za 30 dni albo 7 000,00 zł brutto za 365 dni");
    expect(v7).toContain("§ 7. Opłata Abonamentowa i zabezpieczenie Prowizji od Pożyczkobiorcy");
    expect(v7).toContain(
      `Opłata Abonamentowa oznacza jedyne wynagrodzenie Finance You należne od Inwestora`,
    );
    expect(v7).toContain("Okres Abonamentowy oznacza opłacony okres dostępu do systemu");
    expect(v7).toContain(
      `Finance You pobiera od Inwestora wyłącznie Opłatę Abonamentową za dostęp do systemu: ${ABONAMENT_UMOWA}`,
    );
    expect(v7).toContain(
      "bez konieczności podawania danych karty płatniczej i bez automatycznego odnowienia",
    );
    expect(v7).toContain(
      "Opłata Inwestora za Projekt: brak (dostęp w ramach Opłaty Abonamentowej)",
    );
    expect(v7).toContain("Inwestor płaci wyłącznie Opłatę Abonamentową");
    // Kwoty w umowie = cennik na stronie i w panelu.
    expect(SUBSCRIPTION_MONTHLY_PLN).toBe(1_500);
    expect(SUBSCRIPTION_YEARLY_PLN).toBe(7_000);
    // Konsument: zwrot Opłaty Abonamentowej przy odstąpieniu.
    expect(v7).toContain(
      "Finance You zwraca Opłatę Abonamentową pomniejszoną o kwotę proporcjonalną do wykorzystanej części Okresu Abonamentowego",
    );
  });

  it("§ 5: pięć Zleceń, pięć odrzuceń, 24 h + 12 h, dwie przedłużone", () => {
    expect(v7).toContain("nie więcej niż pięć przyjętych Zleceń");
    expect(v7).toContain("po odrzuceniu przez Inwestora pięciu kolejnych Projektów");
    expect(v7).toContain("rezerwację na 24 godziny");
    expect(v7).toContain("przedłużyć ją o 12 godzin");
    expect(v7).toContain("nie więcej niż dwie rezerwacje przedłużone");
  });

  it("Kara Obejściowa 5 % Sumy Hipotecznej i pięcioletni Okres Ochronny bez zmian", () => {
    expect(v7).toContain("Kara Obejściowa oznacza karę umowną równą 5% Sumy Hipotecznej");
    expect(v7).toContain("Okres Ochronny oznacza pięć lat od Ujawnienia Identyfikującego");
    expect(v7).toContain("§ 9. Pięcioletnia ochrona i zakaz obchodzenia");
  });

  it("kontakt: kontakt@financeyou.pl (telefon zostaje)", () => {
    expect(v7).toContain(NEW_EMAIL);
    expect(v7).not.toContain(OLD_EMAIL);
    expect(v7).toContain("889 888 700");
  });

  it("jest deterministyczna (ten sam skrót SHA-256 z content_text)", () => {
    const h1 = createHash("sha256").update(v7, "utf8").digest("hex");
    const h2 = createHash("sha256")
      .update(transformUmowaV7(src.umowa_ramowa.content_text), "utf8")
      .digest("hex");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("NDA v6 i RODO v5 — e-mail, package_id i nazwa prowizji", () => {
  it("NDA v6", () => {
    const v6 = transformNdaV6(src.nda.content_text);
    expect(v6).toContain(`${PACKAGE_ID_V7}.v6`);
    expect(v6).not.toContain(OLD_EMAIL);
    expect(v6).not.toMatch(/klientowsk/i);
    expect(v6).toContain("Prowizja od Pożyczkobiorcy");
    expect(v6.split("\n").length).toBe(src.nda.content_text.split("\n").length);
  });
  it("RODO v5", () => {
    const v5 = transformRodoV5(src.rodo.content_text);
    expect(v5).toContain(`${PACKAGE_ID_V7}.v5`);
    expect(v5).not.toContain(OLD_EMAIL);
    expect(v5).toContain(NEW_EMAIL);
    expect(v5.split("\n").length).toBe(src.rodo.content_text.split("\n").length);
  });
});

describe("nazwa prowizji od pożyczkobiorcy", () => {
  it("wszystkie formy „Prowizji Klientowskiej” dostają nową nazwę", () => {
    expect(
      prowizjaOdPozyczkobiorcy(
        "Prowizja Klientowska, Prowizji Klientowskiej, Prowizję Klientowską, Prowizją Klientowską, prowizja klientowska, PROWIZJI KLIENTOWSKIEJ",
      ),
    ).toBe(
      "Prowizja od Pożyczkobiorcy, Prowizji od Pożyczkobiorcy, Prowizję od Pożyczkobiorcy, Prowizją od Pożyczkobiorcy, prowizja od pożyczkobiorcy, PROWIZJI OD POŻYCZKOBIORCY",
    );
  });
  it("umowa ramowa v7 używa nowej nazwy w definicji", () => {
    expect(transformUmowaV7(src.umowa_ramowa.content_text)).toContain(
      "Prowizja od Pożyczkobiorcy oznacza odrębne wynagrodzenie Finance You",
    );
  });
});

describe("linie podpisów", () => {
  it("rola i opis pola podpisu są rozdzielone we wszystkich trzech dokumentach", () => {
    const docs = [
      transformUmowaV7(src.umowa_ramowa.content_text),
      transformNdaV6(src.nda.content_text),
      transformRodoV5(src.rodo.content_text),
    ];
    for (const d of docs) {
      expect(d).not.toMatch(/[A-ZĄĆĘŁŃÓŚŹŻ]imię, nazwisko/);
      expect(d).toContain("FINANCE YOU — imię, nazwisko");
    }
  });
});
