/**
 * Regulamin Abonamentu Inwestora: płacąc, inwestor akceptuje tę wersję (jej
 * nazwa trafia do płatności). Skrót treści jest przypięty do wersji — zmiana
 * ceny albo treści wymaga nowej wersji. Cena i sprzedawca zgadzają się z
 * Umową ramową 1.0, a kopia w docs/legal/inwestor jest aktualna.
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
import { SPRZEDAWCA_ABONAMENTU } from "./dokumenty-1-0";

const tekst = regulaminAbonamentuInwestora();
const sha = createHash("sha256").update(tekst, "utf8").digest("hex");

describe("regulamin abonamentu inwestora", () => {
  it("wersja 1.0 ma przypięty skrót treści (zmiana treści = nowa wersja)", () => {
    expect(REGULAMIN_ABONAMENTU_VERSION).toBe("regulamin-abonamentu-inwestora-1.1");
    expect(sha).toBe("ca86a91f08198ff038d8f3413ffef7d3ff1efad53e2d387ae17ad63e42b7e296");
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

  it("cena i sprzedawca zgodne z Umową ramową 1.0", () => {
    expect(CENA_ABONAMENTU.replace(/\u00a0/g," ")).toBe("7 000,00 zł brutto za 365 dni");
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
