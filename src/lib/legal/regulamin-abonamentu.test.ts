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
  it("wersja 2 ma przypięty skrót treści (zmiana treści = nowa wersja)", () => {
    expect(REGULAMIN_ABONAMENTU_VERSION).toBe("regulamin-abonamentu-inwestora-v2");
    expect(sha).toBe("544eaad67791cc0c43e708807a57cc22c47dab22bf3470a4232c7428f7ee2488");
  });

  it("całość jako szkolenie w treściach cyfrowych — bez prawa odstąpienia (art. 38 ust. 1 pkt 13)", () => {
    expect(tekst).toContain(
      "Abonament jest szkoleniem inwestora dostarczanym w formie treści cyfrowych",
    );
    expect(tekst).toContain("stanowią część szkolenia, a nie odrębną usługę");
    expect(tekst).toContain("art. 38 ust. 1 pkt 13");
    expect(tekst).toContain("potwierdzenie zawarcia umowy na trwałym nośniku");
    expect(tekst).not.toMatch(/pomniejszona o kwotę proporcjonalną/);
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
