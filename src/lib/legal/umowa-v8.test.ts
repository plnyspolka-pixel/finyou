/**
 * Umowa ramowa v8: jedyna zmiana względem v7 to Abonament wyłącznie roczny.
 * Pliki w docs/legal/paczka-inwestor-v8 i migracja 20261006191000 (lustro
 * drizzle 0029) są dokładnie tym, co generuje `buildUmowaV8()` — po zmianie
 * uruchom `npx tsx scripts/legal/build-umowa-v8.ts`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tekstZDocx } from "@/lib/contract-engine/umowa-docx";
import { CENA_ABONAMENTU } from "./regulamin-abonamentu";
import { PACKAGE_ID_V7, transformUmowaV7 } from "./pakiet-v7";
import { readLegalSources } from "./sources";
import { ABONAMENT_UMOWA_V8, buildUmowaV8, migracjaUmowyV8Sql, type UmowaV8 } from "./umowa-v8";

const sha = (d: string | Uint8Array) => createHash("sha256").update(d).digest("hex");
const DIR = join(process.cwd(), "docs", "legal", "paczka-inwestor-v8");

let d: UmowaV8;
beforeAll(async () => {
  d = await buildUmowaV8();
});

describe("umowa ramowa v8", () => {
  it("wersja, package_id i skrót treści", () => {
    expect(d.version).toBe("v8");
    expect(d.package_id).toBe(PACKAGE_ID_V7);
    expect(d.sha256).toBe(sha(d.content_text));
    expect(d.content_text).toContain(`${PACKAGE_ID_V7}.v8 • 6 października 2026 r.`);
    expect(d.content_text).not.toContain(".v7 •");
  });

  it("Abonament wyłącznie roczny — zgodny z Regulaminem Abonamentu v3", () => {
    expect(ABONAMENT_UMOWA_V8).toBe(CENA_ABONAMENTU);
    expect(d.content_text.split(`obecnie ${ABONAMENT_UMOWA_V8}`)).toHaveLength(5);
    expect(d.content_text).toContain(
      "Okres Abonamentowy oznacza opłacony okres Abonamentu (365 dni)",
    );
    expect(d.content_text).not.toMatch(
      /1 500,00|30 albo 365|według wyboru Inwestora|za wybrany okres/,
    );
    expect(d.content_text).toContain("5% Kwoty Udzielonej, nie mniej niż 5 000,00 zł, bez VAT");
    expect(d.content_text).not.toContain("7% Kwoty Udzielonej");
  });

  it("poza Abonamentem i nagłówkiem treść v7 bez zmian", () => {
    const v7 = transformUmowaV7(readLegalSources().umowa_ramowa.content_text).split("\n");
    const v8 = d.content_text.split("\n");
    expect(v8).toHaveLength(v7.length);
    const changed = v7.map((l, i) => (l === v8[i] ? null : i + 1)).filter((x) => x !== null);
    expect(changed).toEqual([5, 37, 51, 52, 109, 329]);
  });

  it("tekst .docx = content_text", async () => {
    const norm = (s: string) =>
      s
        .split("\n")
        .map((l) => l.trimEnd())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    expect(norm(await tekstZDocx(d.docx))).toBe(norm(d.content_text));
  });

  it("pliki w docs/legal/paczka-inwestor-v8 i migracje są aktualne", () => {
    expect(sha(readFileSync(join(DIR, d.docx_filename)))).toBe(d.docx_sha256);
    expect(readFileSync(join(DIR, d.docx_filename.replace(/\.docx$/, ".txt")), "utf8")).toBe(
      d.content_text,
    );
    expect(readFileSync(join(DIR, "CONTENT.sha256"), "utf8")).toContain(d.sha256);
    expect(readFileSync(join(DIR, "MANIFEST.sha256"), "utf8")).toContain(d.docx_sha256);
    const sql = migracjaUmowyV8Sql(d);
    for (const p of [
      join("supabase", "migrations", "20261006191000_umowa_ramowa_v8.sql"),
      join("drizzle", "migrations", "0029_umowa_ramowa_v8.sql"),
    ]) {
      expect(readFileSync(join(process.cwd(), p), "utf8")).toBe(sql);
    }
    expect(sql).toMatch(/where code = 'umowa_ramowa'\s+and version = 'v7'/);
    const journal = JSON.parse(
      readFileSync(join(process.cwd(), "drizzle", "migrations", "meta", "_journal.json"), "utf8"),
    );
    expect(journal.entries.map((e: { tag: string }) => e.tag)).toContain("0029_umowa_ramowa_v8");
  });
});
