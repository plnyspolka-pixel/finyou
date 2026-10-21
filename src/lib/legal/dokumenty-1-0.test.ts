/**
 * Dokumenty prawne 1.0: treść w docs/legal jest jedynym źródłem, moduł
 * danych narzędzia apply_legal_documents_1_0 i skróty SHA-256 są z nią zgodne, a
 * w dokumentach nie ma „Platformy” ani starych numerów wersji.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ABONAMENT_UMOWA,
  PAKIET_PLIKI,
  sha256Hex,
  wersjaDokumentu,
  zastosujDokumenty,
  type KodPakietu,
} from "./dokumenty-1-0";
import { DANE_DOKUMENTOW_1_0 } from "./dokumenty-1-0.dane";
import { CENA_ABONAMENTU } from "./regulamin-abonamentu";

const ROOT = process.cwd();
const KLIENT = join(ROOT, "docs", "legal", "klient");
const PAKIET = join(ROOT, "docs", "legal", "pakiet-inwestora");
const regulamin = readFileSync(join(KLIENT, "regulamin-klienta.md"), "utf8");
const polityka = readFileSync(join(KLIENT, "polityka-prywatnosci.md"), "utf8");
const pakiet = (Object.keys(PAKIET_PLIKI) as KodPakietu[]).map((code) => ({
  code,
  content_text: readFileSync(join(PAKIET, `${PAKIET_PLIKI[code]}.txt`), "utf8"),
  docx: readFileSync(join(PAKIET, `${PAKIET_PLIKI[code]}.docx`)),
}));

describe("dokumenty prawne — wersja 1.0", () => {
  it("regulamin klienta i polityka prywatności: wersja 1.0, Serwis, prowizja 7%", () => {
    expect(regulamin).toContain("**wersja 1.0 — obowiązuje od dnia 19 października 2026 r.**");
    expect(polityka).toContain("**wersja 1.0 — obowiązuje od dnia 19 października 2026 r.**");
    for (const doc of [regulamin, polityka]) {
      expect(doc).not.toMatch(/Platform(?!s)|PLATFORM/);
      expect(doc).not.toMatch(/wersji [2-9]\b|wersja [2-9]\b/);
    }
    expect(regulamin).toContain("platformą finansowania społecznościowego");
    expect(regulamin).toContain("**7% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT**");
    expect(regulamin).not.toMatch(/\b5% Kwoty/);
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

  it("skróty SHA-256 i dane dla narzędzia apply_legal_documents_1_0 są aktualne", () => {
    expect(readFileSync(join(PAKIET, "CONTENT.sha256"), "utf8")).toBe(
      pakiet.map((d) => `${sha256Hex(d.content_text)}  ${PAKIET_PLIKI[d.code]}.txt`).join("\n") +
        "\n",
    );
    expect(readFileSync(join(PAKIET, "MANIFEST.sha256"), "utf8")).toBe(
      pakiet.map((d) => `${sha256Hex(d.docx)}  ${PAKIET_PLIKI[d.code]}.docx`).join("\n") + "\n",
    );
    expect(DANE_DOKUMENTOW_1_0.regulamin).toBe(regulamin);
    expect(DANE_DOKUMENTOW_1_0.polityka).toBe(polityka);
    for (const d of pakiet) {
      expect(DANE_DOKUMENTOW_1_0.pakiet[d.code].content_text, d.code).toBe(d.content_text);
      expect(DANE_DOKUMENTOW_1_0.pakiet[d.code].docx_base64, d.code).toBe(
        Buffer.from(d.docx).toString("base64"),
      );
    }
  });

  it("zastosujDokumenty: pierwsze uruchomienie podmienia dokumenty, drugie nic nie zmienia", async () => {
    const db = fakeDb();
    const pierwszy = await zastosujDokumenty(db, DANE_DOKUMENTOW_1_0);
    expect(pierwszy.zastosowano).toBe(true);
    expect(pierwszy.usunieteAkceptacjeZgod).toBe(2);
    expect(pierwszy.usunieteAkceptacjeUmow).toBe(1);
    expect(db.tables.consent_documents.map((r) => [r.kind, r.version, r.is_active])).toEqual([
      ["marketing", 1, true],
      ["terms", 1, true],
      ["privacy", 1, true],
    ]);
    for (const r of db.tables.legal_documents) {
      expect(r).toMatchObject({ version: "1.0", package_id: "FY-LEGAL-1.0" });
    }
    db.tables.consent_acceptances.push({ id: "nowa", kind: "terms" });
    const drugi = await zastosujDokumenty(db, DANE_DOKUMENTOW_1_0);
    expect(drugi.zastosowano).toBe(false);
    expect(db.tables.consent_acceptances).toHaveLength(2); // marketing + nowa akceptacja 1.0
  });

  it("numer wersji w interfejsie: 1 → 1.0", () => {
    expect(wersjaDokumentu(1)).toBe("1.0");
    expect(wersjaDokumentu("1.0")).toBe("1.0");
  });
});

type Row = Record<string, any>;

/** Minimalny klient Supabase w pamięci — tylko operacje używane przez zastosujDokumenty. */
function fakeDb() {
  const tables: Record<string, Row[]> = {
    consent_documents: [
      { kind: "marketing", version: 1, is_active: true, content: "m" },
      { kind: "terms", version: 3, is_active: true, content: "stary" },
      { kind: "privacy", version: 2, is_active: true, content: "stara" },
    ],
    consent_acceptances: [
      { id: "a", kind: "terms" },
      { id: "b", kind: "privacy" },
      { id: "c", kind: "marketing" },
    ],
    investor_agreement_acceptances: [{ id: "x" }],
    legal_documents: (["nda", "umowa_ramowa", "rodo"] as const).map((code) => ({
      code,
      version: "v7",
      package_id: "FY-LEGAL-2026-09-29",
      sha256: "stary",
    })),
  };
  const query = (name: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "delete" | "update" = "select";
    let patch: Row = {};
    const run = () => {
      const match = (r: Row) => filters.every((f) => f(r));
      const hit = tables[name].filter(match);
      if (op === "delete") tables[name] = tables[name].filter((r) => !match(r));
      if (op === "update") hit.forEach((r) => Object.assign(r, patch));
      return { data: hit, error: null };
    };
    const q: any = {
      select: () => q,
      delete: () => ((op = "delete"), q),
      update: (p: Row) => ((op = "update"), (patch = p), q),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      not: (c: string) => (filters.push((r) => r[c] != null), q),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(res, rej),
    };
    return q;
  };
  return {
    tables,
    from: (name: string) => ({
      ...query(name),
      insert: async (rows: Row[]) => (tables[name].push(...rows), { error: null }),
    }),
  };
}
