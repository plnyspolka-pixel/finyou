import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TERMS } from "./labels";

// Strony i komponenty inwestora nie używają starych nazw ani cennika.
const UI_FILES = [
  "src/routes/dla-inwestora.tsx",
  "src/routes/inwestor.tsx",
  "src/routes/inwestor.umowy.tsx",
  "src/routes/inwestor.analityka.tsx",
  "src/routes/inwestor.abonament.tsx",
  "src/routes/inwestor.dokumenty.tsx",
  "src/components/inwestor/order-cycle.tsx",
  "src/components/inwestor/pipeline-steps.tsx",
  "src/components/marketing/investor-pricing.tsx",
];

const code = (f: string) =>
  readFileSync(join(process.cwd(), f), "utf8")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");

describe("słownik nazw i teksty inwestora", () => {
  it("słownik ma jedną regułę prowizji", () => {
    expect(TERMS.fyCommissionRule).toBe(
      "5% Kwoty Udzielonej, nie mniej niż 5 000 zł, bez VAT, potrącana z wypłaty",
    );
  });

  it.each(UI_FILES)("%s — bez PRO, Pakietu Podstawowego, 1 500 / 3 000 zł, okazji", (f) => {
    const s = code(f);
    expect(s).not.toMatch(/\bPRO\b/);
    expect(s).not.toMatch(/Pakiet(u)? Podstawow/);
    expect(s).not.toMatch(/(^|[^\d ])(1 500|3 000) zł|5% od udzielonej|5% kwoty udzielonej/);
    // Techniczny klucz źródła `okazja` (dane) jest dozwolony — etykiety nie.
    const text = s.replace(/"okazja"|\bokazja:/g, "");
    expect(text).not.toMatch(/[Oo]kazj[aeiy]\b/);
    expect(s).not.toMatch(/plnyspolka/);
  });
});
