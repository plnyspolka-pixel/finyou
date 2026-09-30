/**
 * Pakiet v7 w repozytorium odpowiada kodowi: pliki w docs/legal/paczka-inwestor-v7
 * i sekcja umowy v7 w migracji 20260930140000 (z lustrem drizzle 0023) są
 * dokładnie tym, co generuje `buildPakietV7()` (po zmianie transformacji trzeba
 * uruchomić `npx tsx scripts/legal/build-pakiet-v7.ts`). Migracja 20260929155000
 * (pierwotne wgranie v7) jest wgrana na produkcji i się nie zmienia.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tekstZDocx } from "@/lib/contract-engine/umowa-docx";
import {
  V7_UMOWA_SHA256_PRZED_ABONAMENTEM,
  aktualizacjaUmowyV7Sql,
  buildPakietV7,
  sha256Hex,
  wstawSekcjeV7,
  type DokumentV7,
} from "./build-v7";
import { NEW_EMAIL, OLD_EMAIL, PACKAGE_ID_V7 } from "./pakiet-v7";

const DIR = join(process.cwd(), "docs", "legal", "paczka-inwestor-v7");
const MIG = "20260930140000_abonament_inwestora.sql";

let docs: DokumentV7[];
const byCode = (c: DokumentV7["code"]) => docs.find((d) => d.code === c)!;

beforeAll(async () => {
  docs = await buildPakietV7();
});

describe("pakiet v7 — pliki i skróty", () => {
  it("wersje i package_id", () => {
    expect(docs.map((d) => `${d.code}:${d.version}`).sort()).toEqual([
      "nda:v6",
      "rodo:v5",
      "umowa_ramowa:v7",
    ]);
    for (const d of docs) expect(d.package_id).toBe(PACKAGE_ID_V7);
  });

  it("sha256 = SHA-256 z content_text", () => {
    for (const d of docs) expect(d.sha256).toBe(sha256Hex(d.content_text));
  });

  it("tekst .docx umowy v7 = content_text (linia w linię)", async () => {
    const u = byCode("umowa_ramowa");
    const norm = (s: string) =>
      s
        .split("\n")
        .map((l) => l.trimEnd())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    expect(norm(await tekstZDocx(u.docx))).toBe(norm(u.content_text));
  });

  it("NDA v6 i RODO v5 .docx: nowa wersja i e-mail, bez starych", async () => {
    for (const code of ["nda", "rodo"] as const) {
      const t = await tekstZDocx(byCode(code).docx);
      expect(t).toContain(`${PACKAGE_ID_V7}.${byCode(code).version}`);
      expect(t).not.toContain("FY-LEGAL-2026-09-04");
      expect(t).not.toContain(OLD_EMAIL);
    }
    expect(await tekstZDocx(byCode("rodo").docx)).toContain(NEW_EMAIL);
  });

  it("pliki w docs/legal/paczka-inwestor-v7 i manifesty są aktualne", () => {
    const manifest = readFileSync(join(DIR, "MANIFEST.sha256"), "utf8");
    const content = readFileSync(join(DIR, "CONTENT.sha256"), "utf8");
    for (const d of docs) {
      const onDisk = readFileSync(join(DIR, d.docx_filename));
      expect(sha256Hex(onDisk)).toBe(d.docx_sha256);
      expect(manifest).toContain(`${d.docx_sha256}  ${d.docx_filename}`);
      expect(content).toContain(d.sha256);
    }
  });

  it("migracja 20260930140000 zawiera aktualną treść v7 (sekcja z generatora), lustro drizzle identyczne", () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", MIG), "utf8");
    expect(sql).toContain(aktualizacjaUmowyV7Sql(docs));
    expect(wstawSekcjeV7(sql, docs)).toBe(sql);
    const drizzle = readFileSync(
      join(process.cwd(), "drizzle", "migrations", "0023_abonament_inwestora.sql"),
      "utf8",
    );
    expect(drizzle).toBe(sql);
    expect(sql).toContain("allows_investor_fees = true");
    expect(sql).toContain(`set sha256 = '${byCode("umowa_ramowa").sha256}'`);
    expect(byCode("umowa_ramowa").sha256).not.toBe(V7_UMOWA_SHA256_PRZED_ABONAMENTEM);
  });

  it("migracja 20260929155000 (pierwotne wgranie v7) pozostaje bez zmian", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", "20260929155000_etap5_pakiet_inwestor_v7.sql"),
      "utf8",
    );
    expect(sql).toContain(
      `-- umowa_ramowa v7: content sha256 ${V7_UMOWA_SHA256_PRZED_ABONAMENTEM}`,
    );
  });
});
