import { describe, it, expect } from "vitest";
import {
  applyRequiredElements,
  checkHardRules,
  checkRequiredElements,
  evaluateCompliance,
} from "./compliance-rules";

const codes = (t: string, ctx: Parameters<typeof checkHardRules>[1]) =>
  checkHardRules(t, ctx).map((h) => h.code);

describe("compliance – reguły wspólne", () => {
  it("blokuje gwarancje i „bez ryzyka”", () => {
    expect(codes("Gwarantowany zysk co miesiąc", { kind: "script" })).toContain("gwarancja");
    expect(codes("Inwestycja bez ryzyka", { kind: "script" })).toContain("bez_ryzyka");
    expect(codes("To pewny zysk", { kind: "script" })).toContain("pewny_zysk");
  });

  it("przepuszcza zaprzeczenia", () => {
    expect(codes("Nie gwarantujemy zysku ani finansowania.", { kind: "script" })).not.toContain(
      "gwarancja",
    );
    expect(codes("Brak gwarancji – decyzja należy do Ciebie.", { kind: "script" })).not.toContain(
      "gwarancja",
    );
  });

  it("blokuje % jako obietnicę, ale nie LTV ani stopy NBP", () => {
    expect(codes("Zarabiaj 12% rocznie na odsetkach", { kind: "script" })).toContain(
      "procent_jako_obietnica",
    );
    expect(codes("Przy LTV 60% masz bufor bezpieczeństwa", { kind: "script" })).not.toContain(
      "procent_jako_obietnica",
    );
    expect(
      codes("Stopa referencyjna NBP wynosi dziś 4,5% – co to znaczy dla zysku z lokaty?", {
        kind: "script",
      }),
    ).not.toContain("procent_jako_obietnica");
  });

  it("blokuje superlatywy, zamknięte grupy i KNF jako rekomendację", () => {
    expect(codes("Najlepsza oferta w Polsce", { kind: "title" })).toContain("superlatyw");
    expect(codes("Dołącz do zamkniętej grupy inwestorów", { kind: "script" })).toContain(
      "zamknieta_grupa",
    );
    expect(codes("Działamy jako firma zatwierdzona przez KNF", { kind: "script" })).toContain(
      "instytucja_jako_rekomendacja",
    );
  });

  it("blokuje ceny w wideo, ale nie w mailu", () => {
    expect(codes("Abonament kosztuje 1 500 zł miesięcznie", { kind: "script" })).toContain(
      "cena_w_wideo",
    );
    expect(codes("Abonament kosztuje 1 500 zł miesięcznie", { kind: "email" })).not.toContain(
      "cena_w_wideo",
    );
  });

  it("wykrywa dane osobowe, ale nie nasze numery", () => {
    expect(codes("Zadzwoń: 600 123 456", { kind: "comment_reply" })).toContain("telefon");
    expect(codes("Zadzwoń: +48 732 059 898", { kind: "comment_reply" })).not.toContain("telefon");
    expect(codes("Pisz: jan.kowalski@gmail.com", { kind: "comment_reply" })).toContain("email");
    expect(codes("Pisz: kontakt@financeyou.pl", { kind: "comment_reply" })).not.toContain("email");
    expect(codes("PESEL 85010112345", { kind: "script" })).toContain("pesel");
  });

  it("„to nie jest porada” bez linii ryzyka wymaga uzupełnienia", () => {
    const hits = checkHardRules("To nie jest porada inwestycyjna.", { kind: "description" });
    expect(hits.find((h) => h.code === "jedyne_zastrzezenie_porada")?.severity).toBe("require");
  });
});

describe("compliance – tory", () => {
  it("pożyczkobiorca: konsumenci, BIK, presja, koszt jako hasło", () => {
    const ctx = { kind: "script" as const, track: "pozyczkobiorca" as const };
    expect(codes("Pożyczka na dowolny cel", ctx)).toContain("konsument");
    expect(codes("Finansowanie bez BIK i bez zdolności", ctx)).toContain("bez_weryfikacji");
    expect(codes("Ostatnia szansa – tylko dziś!", ctx)).toContain("presja_czasu");
    expect(codes("Oprocentowanie od 9% rocznie", ctx)).toContain("koszt_jako_haslo");
    expect(codes("Pieniądze dla każdego", ctx)).toContain("dla_kazdego");
  });

  it("reguły pożyczkobiorcy nie dotyczą inwestora i odwrotnie", () => {
    expect(codes("Pożyczka na dowolny cel", { kind: "script", track: "inwestor" })).not.toContain(
      "konsument",
    );
    expect(codes("Sam też inwestuję", { kind: "script", track: "pozyczkobiorca" })).not.toContain(
      "sam_inwestuje",
    );
  });

  it("inwestor: odkup, wabik, drukarka bez ryzyka", () => {
    const ctx = { kind: "script" as const, track: "inwestor" as const };
    expect(codes("Odkupimy Twoje udziały w każdej chwili", ctx)).toContain("gwarancja_odkupu");
    expect(codes("Sam też inwestuję w te pożyczki", ctx)).toContain("sam_inwestuje");
    expect(codes("To drukarka do pieniędzy", ctx)).toContain("drukarka_bez_ryzyka");
    expect(
      codes("To drukarka do pieniędzy? Nie – każda pożyczka niesie ryzyko.", ctx),
    ).not.toContain("drukarka_bez_ryzyka");
  });

  it("czysta teza edukacyjna przechodzi", () => {
    const r = evaluateCompliance(
      "Czy wiesz, że bank zarabia na różnicy odsetek? Ty też możesz finansować przedsiębiorców pod zastaw nieruchomości – ale pamiętaj o ryzyku.",
      { kind: "script", track: "inwestor" },
    );
    expect(r.ok).toBe(true);
  });
});

describe("compliance – elementy obowiązkowe", () => {
  it("opis bez stopki wymaga AI, nadawcy i ryzyka; doklejanie jest idempotentne", () => {
    const ctx = { kind: "description" as const, track: "inwestor" as const };
    expect(checkRequiredElements("Krótki opis", ctx).map((h) => h.code)).toEqual([
      "brak_oznaczenia_ai",
      "brak_nadawcy",
      "brak_linii_ryzyka",
    ]);
    const fixed = applyRequiredElements("Krótki opis", ctx);
    expect(checkRequiredElements(fixed, ctx)).toEqual([]);
    expect(applyRequiredElements(fixed, ctx)).toBe(fixed);
  });

  it("scenariusz nie potrzebuje stopki", () => {
    expect(checkRequiredElements("Hook", { kind: "script" })).toEqual([]);
  });
});
