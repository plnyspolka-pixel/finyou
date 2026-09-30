/**
 * Regulamin Abonamentu Inwestora: płacąc, inwestor akceptuje tę wersję (jej
 * nazwa trafia do płatności). Skrót treści jest przypięty do wersji — zmiana
 * ceny albo treści wymaga nowej wersji. Cena i sprzedawca zgadzają się z
 * Umową ramową v7, a kopia w docs/legal/inwestor jest aktualna.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CENA_ABONAMENTU,
  FUNDACJA,
  REGULAMIN_ABONAMENTU_VERSION,
  regulaminAbonamentuInwestora,
} from "./regulamin-abonamentu";
import { ABONAMENT_UMOWA, SPRZEDAWCA_ABONAMENTU } from "./pakiet-v7";

const tekst = regulaminAbonamentuInwestora();
const sha = createHash("sha256").update(tekst, "utf8").digest("hex");

describe("regulamin abonamentu inwestora", () => {
  it("wersja 1 ma przypięty skrót treści (zmiana treści = nowa wersja)", () => {
    expect(REGULAMIN_ABONAMENTU_VERSION).toBe("regulamin-abonamentu-inwestora-v1");
    expect(sha).toBe("2b22a44face9faef448c0b306f90262a16b35e13517b75b6946edc2e893885ec");
  });

  it("cena i sprzedawca zgodne z Umową ramową v7", () => {
    expect(CENA_ABONAMENTU).toBe(ABONAMENT_UMOWA);
    expect(tekst).toContain(CENA_ABONAMENTU);
    expect(SPRZEDAWCA_ABONAMENTU).toContain(FUNDACJA.nazwa);
    expect(SPRZEDAWCA_ABONAMENTU).toContain(FUNDACJA.krs);
    expect(SPRZEDAWCA_ABONAMENTU).toContain(FUNDACJA.nip);
    expect(tekst).toContain(`KRS ${FUNDACJA.krs}, NIP ${FUNDACJA.nip}`);
  });

  it("umowy o dostęp do Klientów akceptowane po zakupie, bez wynagrodzenia Finance You", () => {
    expect(tekst).toContain("Inwestor akceptuje je w panelu po zakupie Abonamentu");
    expect(tekst).toContain("nie przewidują wynagrodzenia Finance You od Inwestora");
    expect(tekst).toContain("nie odnawia się automatycznie");
    expect(tekst).toMatch(/art\. 113 ust\. 1/);
  });

  it("kopia w docs/legal/inwestor jest aktualna", () => {
    expect(
      readFileSync(
        join(process.cwd(), "docs", "legal", "inwestor", `${REGULAMIN_ABONAMENTU_VERSION}.md`),
        "utf8",
      ),
    ).toBe(tekst);
  });
});
