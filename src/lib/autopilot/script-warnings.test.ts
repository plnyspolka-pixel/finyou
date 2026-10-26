// Zastrzeżenia w rolce: liczenie zdań-ostrzeżeń i przyjęcie odchudzonej
// wersji scenariusza (decyzja właściciela 26.10.2026: jedno zdanie o ryzyku).
import { describe, expect, it } from "vitest";
import {
  MAX_WARNING_SENTENCES_PER_REEL,
  acceptCondensedScript,
  countWarnings,
  overWarns,
  scriptKeyword,
  splitSentences,
  warningSentences,
} from "./script-warnings";

// Scenariusz z produkcji 26.10.2026 (tor inwestora) — cztery zastrzeżenia na 110 słów.
const OVERWARNED =
  "Czy wiesz, jak działa finansowanie pod hipotekę z perspektywy inwestora prywatnego? " +
  "Wielu zakłada, że jedyną drogą jest zakup i remont lokalu, tymczasem istnieje też mechanizm pożyczki zabezpieczonej wpisem w księdze wieczystej. " +
  "W takim modelu pożyczkodawca może otrzymywać odsetki, o ile pożyczkobiorca terminowo spłaca zobowiązanie. " +
  "Pamiętaj: hipoteka nie gwarantuje zwrotu. " +
  "Możesz doświadczyć opóźnień, a nawet utraty części lub całości kapitału, a dochodzenie roszczeń bywa długie i kosztowne. " +
  "To jedna z form inwestowania, którą warto poznać razem z jej ryzykiem. " +
  "Obserwuj profil i skomentuj UMOWA, a wyślę Ci bezpłatny wzór umowy pożyczki pod hipotekę (materiał edukacyjny). " +
  "Wzór ma charakter wyłącznie poglądowy i nie zastępuje indywidualnej analizy prawnej.";

// Scenariusz, który przeszedł bramkę bez poprawek — jedno zdanie o ryzyku.
const ONE_WARNING =
  "3 BŁĘDY. Zastanawiasz się, który błąd kosztuje inwestora najwięcej, gdy próbuje zarabiać na odsetkach tak jak bank? " +
  "Pierwszy to przekonanie, że zysk z nieruchomości wymaga zakupu lokalu i remontów. " +
  "Drugi to brak rzetelnej weryfikacji wartości zabezpieczenia w stosunku do pożyczonej kwoty. " +
  "Trzeci to ignorowanie regularnego przepływu z odsetek na rzecz zamrażania środków na długie lata. " +
  "Pamiętaj, że każda inwestycja wiąże się z ryzykiem nieterminowej spłaty i wymaga dokładnej analizy prawnej oraz finansowej. " +
  "Świadome podejście chroni Twój kapitał przed kosztownymi potknięciami. " +
  "Skomentuj BŁĘDY, a wyślę Ci przewodnik „7 błędów inwestora w pożyczkach pod hipotekę – i jak ich uniknąć”.";

describe("zastrzeżenia w scenariuszu — liczenie", () => {
  it("dozwolone jest jedno zdanie o ryzyku", () => {
    expect(MAX_WARNING_SENTENCES_PER_REEL).toBe(1);
  });

  it("podział na zdania nie tnie skrótów („750 tys. zł”) ani cudzysłowów", () => {
    const s = splitSentences(
      "Przy nieruchomości wartej 1,5 mln zł i LTV do 50% górna granica to 750 tys. zł. Pamiętaj jednak o ryzyku. „Kalkulator” jest bezpłatny.",
    );
    expect(s).toHaveLength(3);
    expect(s[0]).toMatch(/750 tys\. zł\.$/);
  });

  it("łapie ryzyko, brak gwarancji, utratę kapitału i formułki prawne; nie łapie treści", () => {
    const w = warningSentences(OVERWARNED);
    expect(w).toHaveLength(4);
    expect(w[0]).toMatch(/nie gwarantuje/);
    expect(w[1]).toMatch(/utraty części lub całości/);
    expect(w[2]).toMatch(/ryzykiem/);
    expect(w[3]).toMatch(/charakter wyłącznie poglądowy/);
    expect(overWarns(OVERWARNED)).toBe(true);

    expect(countWarnings(ONE_WARNING)).toBe(1);
    expect(overWarns(ONE_WARNING)).toBe(false);
    expect(overWarns("Bank odmówił? Twoja nieruchomość może powiedzieć tak.")).toBe(false);
  });

  it("zastrzeżenie doklejone do CTA („wynik jest szacunkowy i nie stanowi oferty”) też się liczy", () => {
    const s =
      "Od czego zależy kwota finansowania pod nieruchomość? Zastaw na majątku wiąże się z ryzykiem i wyższym kosztem. " +
      "Skomentuj ILE, a prześlę Ci „Kalkulator orientacyjnej kwoty pod zastaw nieruchomości” – wynik jest szacunkowy i nie stanowi oferty.";
    expect(countWarnings(s)).toBe(2);
    expect(overWarns(s)).toBe(true);
    expect(scriptKeyword(s)).toBe("ILE");
    expect(scriptKeyword(OVERWARNED)).toBe("UMOWA");
    expect(scriptKeyword("Obserwuj profil, żeby nie przegapić.")).toBeNull();
  });
});

describe("zastrzeżenia w scenariuszu — przyjęcie odchudzonej wersji", () => {
  const ctx = { kind: "script" as const, track: "inwestor" as const };
  const slim =
    "Czy wiesz, jak działa finansowanie pod hipotekę z perspektywy inwestora prywatnego? " +
    "Wielu zakłada, że jedyną drogą jest zakup i remont lokalu, tymczasem istnieje też mechanizm pożyczki zabezpieczonej wpisem w księdze wieczystej. " +
    "W takim modelu pożyczkodawca może otrzymywać odsetki, o ile pożyczkobiorca terminowo spłaca zobowiązanie. " +
    "Pamiętaj jednak o ryzyku: przy braku spłaty możesz stracić część lub całość kapitału. " +
    "To jedna z form inwestowania, którą warto poznać. " +
    "Obserwuj profil i skomentuj UMOWA, a wyślę Ci bezpłatny wzór umowy pożyczki pod hipotekę.";

  it("przyjmuje wersję z jednym zdaniem o ryzyku, hasłem i podobną długością", () => {
    const r = acceptCondensedScript(OVERWARNED, slim, ctx);
    expect(r.ok, r.reason).toBe(true);
    expect(r.reason).toMatch(/4 → 1/);
  });

  it("odrzuca, gdy zastrzeżeń nie ubyło, zniknęło słowo „ryzyko” albo hasło", () => {
    expect(acceptCondensedScript(OVERWARNED, OVERWARNED, ctx).ok).toBe(false);
    expect(
      acceptCondensedScript(
        OVERWARNED,
        slim.replace(
          "Pamiętaj jednak o ryzyku: przy braku spłaty możesz stracić część lub całość kapitału. ",
          "",
        ),
        ctx,
      ).reason,
    ).toMatch(/ryzyk/);
    expect(acceptCondensedScript(OVERWARNED, slim.replace("UMOWA", "START"), ctx).reason).toMatch(
      /UMOWA/,
    );
    expect(acceptCondensedScript(OVERWARNED, "", ctx).ok).toBe(false);
  });

  it("odrzuca wersję za krótką albo z nową blokadą reguł twardych", () => {
    expect(
      acceptCondensedScript(OVERWARNED, "Pamiętaj o ryzyku. Skomentuj UMOWA.", ctx).reason,
    ).toMatch(/za krótki/);
    const promised = slim.replace(
      "To jedna z form inwestowania, którą warto poznać.",
      "To gwarantowany zysk dla każdego inwestora.",
    );
    const r = acceptCondensedScript(OVERWARNED, promised, ctx);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/gwarancja/);
  });
});
