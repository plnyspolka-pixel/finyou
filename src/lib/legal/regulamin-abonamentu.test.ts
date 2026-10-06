/**
 * Regulamin Abonamentu Inwestora: płacąc, inwestor akceptuje tę wersję (jej
 * nazwa trafia do płatności). Skrót treści jest przypięty do wersji — zmiana
 * ceny albo treści wymaga nowej wersji. Sprzedawca zgadza się z Umową
 * ramową v7, cena z cennikiem, a kopie w docs/legal/inwestor są aktualne.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CENA_ABONAMENTU,
  FUNDACJA,
  REGULAMIN_ABONAMENTU_VERSION,
  REGULAMIN_ABONAMENTU_VERSIONS,
  isRegulaminAbonamentuVersion,
  regulaminAbonamentuInwestora,
} from "./regulamin-abonamentu";
import { SPRZEDAWCA_ABONAMENTU } from "./pakiet-v7";
import { SUBSCRIPTION_OPTION, SUBSCRIPTION_YEARLY_PLN } from "@/lib/investor-plan/plans";

const tekst = regulaminAbonamentuInwestora();
const sha = createHash("sha256").update(tekst, "utf8").digest("hex");

describe("regulamin abonamentu inwestora", () => {
  it("wersja 3 jest aktualna; v2 zostaje odtwarzalna bez zmian (skróty przypięte)", () => {
    expect(REGULAMIN_ABONAMENTU_VERSION).toBe("regulamin-abonamentu-inwestora-v3");
    expect(sha).toBe("0ced5b722a6a8c9f9f13327a304c797eaa239cb4473cd61267566a5942540c06");
    const v2 = regulaminAbonamentuInwestora("regulamin-abonamentu-inwestora-v2");
    expect(createHash("sha256").update(v2, "utf8").digest("hex")).toBe(
      "544eaad67791cc0c43e708807a57cc22c47dab22bf3470a4232c7428f7ee2488",
    );
    expect(isRegulaminAbonamentuVersion("regulamin-abonamentu-inwestora-v2")).toBe(true);
    expect(isRegulaminAbonamentuVersion("regulamin-abonamentu-inwestora-v1")).toBe(false);
  });

  it("v3: wyłącznie Abonament roczny — bez okresu 30 dni i ceny miesięcznej", () => {
    expect(CENA_ABONAMENTU).toBe("7 000,00 zł brutto za 365 dni");
    expect(SUBSCRIPTION_YEARLY_PLN).toBe(7_000);
    expect(SUBSCRIPTION_OPTION.days).toBe(365);
    expect(tekst).toContain("opłacony okres Abonamentu: 365 dni.");
    expect(tekst).not.toMatch(/30 dni|30 albo|1 500|miesięcznie|według wyboru|30-dniow/);
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

  it("cena w treści; sprzedawca zgodny z Umową ramową v7", () => {
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

  it("kopie w docs/legal/inwestor są aktualne", () => {
    for (const v of REGULAMIN_ABONAMENTU_VERSIONS) {
      expect(
        readFileSync(join(process.cwd(), "docs", "legal", "inwestor", `${v}.md`), "utf8"),
      ).toBe(regulaminAbonamentuInwestora(v));
    }
  });
});
