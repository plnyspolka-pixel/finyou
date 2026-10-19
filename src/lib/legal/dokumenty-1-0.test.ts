/**
 * Dokumenty prawne 1.0: treść w docs/legal jest jedynym źródłem, migracja
 * 20261019120000 (drizzle 0034) i skróty SHA-256 są z nią zgodne, a
 * w dokumentach nie ma „Platformy” ani starych numerów wersji.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ABONAMENT_UMOWA,
  PAKIET_PLIKI,
  migracjaDokumentow,
  sha256Hex,
  wersjaDokumentu,
  type DokumentPakietu,
  type KodPakietu,
} from "./dokumenty-1-0";
import { CENA_ABONAMENTU } from "./regulamin-abonamentu";

const ROOT = process.cwd();
const KLIENT = join(ROOT, "docs", "legal", "klient");
const PAKIET = join(ROOT, "docs", "legal", "pakiet-inwestora");
const regulamin = readFileSync(join(KLIENT, "regulamin-klienta.md"), "utf8");
const polityka = readFileSync(join(KLIENT, "polityka-prywatnosci.md"), "utf8");
const pakiet: DokumentPakietu[] = (Object.keys(PAKIET_PLIKI) as KodPakietu[]).map((code) => ({
  code,
  content_text: readFileSync(join(PAKIET, `${PAKIET_PLIKI[code]}.txt`), "utf8"),
  docx: readFileSync(join(PAKIET, `${PAKIET_PLIKI[code]}.docx`)),
}));

describe("dokumenty prawne — wersja 1.0", () => {
  it("regulamin klienta i polityka prywatności: wersja 1.0, Serwis, prowizja 5%", () => {
    expect(regulamin).toContain("**wersja 1.0 — obowiązuje od dnia 19 października 2026 r.**");
    expect(polityka).toContain("**wersja 1.0 — obowiązuje od dnia 19 października 2026 r.**");
    for (const doc of [regulamin, polityka]) {
      expect(doc).not.toMatch(/Platform(?!s)|PLATFORM/);
      expect(doc).not.toMatch(/wersji [2-9]\b|wersja [2-9]\b/);
    }
    expect(regulamin).toContain("platformą finansowania społecznościowego");
    expect(regulamin).toContain("**5% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT**");
    expect(regulamin).not.toMatch(/\b7% Kwoty/);
  });

  it("pakiet inwestora FY-LEGAL-1.0, bez „platformy”, cena zgodna z regulaminem abonamentu", () => {
    for (const d of pakiet) {
      expect(d.content_text, d.code).toContain("FY-LEGAL-1.0 • 19 października 2026 r.");
      expect(d.content_text, d.code).not.toMatch(/FY-LEGAL-2026|platform/i);
    }
    expect(ABONAMENT_UMOWA).toBe(CENA_ABONAMENTU);
  });

  it("w docs/legal nie ma wersji historycznych", () => {
    expect(readdirSync(KLIENT).sort()).toEqual(["polityka-prywatnosci.md", "regulamin-klienta.md"]);
    expect(existsSync(join(ROOT, "docs", "legal", "paczka-inwestor-v7"))).toBe(false);
  });

  it("skróty SHA-256 i migracje są aktualne", () => {
    expect(readFileSync(join(PAKIET, "CONTENT.sha256"), "utf8")).toBe(
      pakiet.map((d) => `${sha256Hex(d.content_text)}  ${PAKIET_PLIKI[d.code]}.txt`).join("\n") +
        "\n",
    );
    expect(readFileSync(join(PAKIET, "MANIFEST.sha256"), "utf8")).toBe(
      pakiet.map((d) => `${sha256Hex(d.docx)}  ${PAKIET_PLIKI[d.code]}.docx`).join("\n") + "\n",
    );
    const sql = migracjaDokumentow(regulamin, polityka, pakiet);
    for (const p of [
      ["supabase", "migrations", "20261019120000_dokumenty_prawne_1_0.sql"],
      ["drizzle", "migrations", "0034_dokumenty_prawne_1_0.sql"],
    ]) {
      expect(readFileSync(join(ROOT, ...p), "utf8")).toBe(sql);
    }
    expect(sql).toContain(
      "delete from public.consent_documents where kind in ('terms', 'privacy');",
    );
    expect(sql).toContain("delete from public.investor_agreement_acceptances;");
  });

  it("numer wersji w interfejsie: 1 → 1.0", () => {
    expect(wersjaDokumentu(1)).toBe("1.0");
    expect(wersjaDokumentu("1.0")).toBe("1.0");
  });
});
