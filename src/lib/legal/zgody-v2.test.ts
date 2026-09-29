/**
 * Regulamin klienta v2 i Polityka prywatności v2: treść w repozytorium
 * i migracja są dokładnie tym, co generuje kod (po zmianie transformacji:
 * `npx tsx scripts/legal/build-zgody-v2.ts`), a kluczowe zasady są w tekście.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { migracjaZgodV2, naprawListy, transformPolitykaV2, transformRegulaminV2 } from "./zgody-v2";

const DIR = join(process.cwd(), "docs", "legal", "klient");
const rd = (f: string) => readFileSync(join(DIR, f), "utf8");
const regulamin = transformRegulaminV2(rd("regulamin-klienta-v1.md"));
const polityka = transformPolitykaV2(rd("polityka-prywatnosci-v1.md"));

describe("regulamin klienta v2", () => {
  it("B2B, oświadczenie o celu gospodarczym, prowizja 7% / 5 000 zł / bez VAT, potrącana", () => {
    expect(regulamin).toContain("wyłącznie finansowanie przeznaczone na Cel Gospodarczy");
    expect(regulamin).toContain(
      "Klient oświadcza, że finansowanie przeznaczy wyłącznie na Cel Gospodarczy",
    );
    expect(regulamin).toContain("**7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT**");
    expect(regulamin).toContain("Klient otrzymuje 93 000,00 zł");
    expect(regulamin).toContain("Prowizja Finance You jest potrącana z wypłaty finansowania.");
    expect(regulamin).not.toMatch(/netto|brutto/);
  });

  it("ochrona 5 lat, poprawna numeracja § 12 i odesłanie do ust. 12", () => {
    expect(regulamin).toContain("13. Postanowienie ust. 12 stosuje się przez okres 5 lat");
    expect(regulamin).toContain("12. Jeżeli użytkownik po przedstawieniu mu finansującego");
    expect(regulamin).toContain("   1. kosztów notarialnych;");
    expect(regulamin).not.toContain("12 miesięcy");
  });

  it("decyzję odmowną podejmuje człowiek; odsetki nie wyższe niż maksymalne", () => {
    expect(regulamin).toContain("zawsze podejmuje pracownik Finance You");
    expect(regulamin).toContain("nie może przekraczać odsetek maksymalnych");
  });
});

describe("polityka prywatności v2", () => {
  it("IOD niewyznaczony, podmioty przetwarzające, § 17 udział człowieka, nagrywanie AI", () => {
    expect(polityka).toContain("Administrator nie wyznaczył inspektora ochrony danych (IOD).");
    // Pełne nazwy podmiotów (stan na 29.09.2026) — tylko faktycznie używani dostawcy.
    for (const p of [
      "Lovable Labs Sweden AB",
      "Supabase Pte. Ltd.",
      "Anthropic Ireland, Limited",
      "Didit Identity Spain, S.L.",
      "dilisense GmbH",
      "Eleven Labs Inc.",
      "Twilio Ireland Limited",
      "Krajowy Integrator Płatności S.A.",
      "Plus Five Five, Inc. (Resend)",
      "Meta Platforms Ireland Limited",
      "współadministratorami (art. 26 RODO)",
    ]) {
      expect(polityka).toContain(p);
    }
    expect(polityka).not.toContain("jeżeli w przyszłości zostaną wykorzystani");
    // Platforma nie korzysta z AWS Bedrock — polityka nie może go wymieniać.
    expect(polityka).not.toContain("Bedrock");
    expect(polityka).toContain("standardowe klauzule umowne");
    expect(polityka).toContain("zawsze podejmuje człowiek");
    expect(polityka).toContain(
      "agent informuje, że jest asystentem AI i że rozmowa jest nagrywana",
    );
  });

  it("naprawia spłaszczone listy podstaw prawnych w § 6", () => {
    expect(polityka).not.toMatch(/^\d+\. art\. 6/m);
  });
});

describe("pliki i migracja", () => {
  it("docs/legal/klient/*-v2.md są aktualne", () => {
    expect(rd("regulamin-klienta-v2.md")).toBe(regulamin);
    expect(rd("polityka-prywatnosci-v2.md")).toBe(polityka);
  });

  it("migracja = wynik generatora; lustro drizzle identyczne", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", "20260929156000_etap5_zgody_v2.sql"),
      "utf8",
    );
    expect(sql).toBe(
      migracjaZgodV2([
        { kind: "terms", title: "Akceptuję regulamin klienta", content: regulamin },
        { kind: "privacy", title: "Akceptuję politykę prywatności", content: polityka },
      ]),
    );
    expect(
      readFileSync(join(process.cwd(), "drizzle", "migrations", "0017_etap5_zgody_v2.sql"), "utf8"),
    ).toBe(sql);
  });

  it("naprawListy nie zmienia poprawnie ponumerowanego tekstu", () => {
    const ok = "## § 1. X\n\n1. A:\n\n   1. a;\n   2. b.\n\n2. B.\n";
    expect(naprawListy(ok)).toBe(ok);
  });
});
