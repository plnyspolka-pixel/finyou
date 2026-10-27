import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PORTFOLIO_STORIES } from "./marketing-stories";

const all = PORTFOLIO_STORIES.map((s) => `${s.title} ${s.amount} ${s.outcome} ${s.text}`).join(
  "\n",
);

describe("historie (/historie)", () => {
  it("bez słowa „leasing” w kartach i w meta strony", () => {
    expect(all.toLowerCase()).not.toContain("leasing");
    const route = readFileSync("src/routes/historie.tsx", "utf8");
    expect(route.toLowerCase()).not.toContain("leasing");
  });

  it("promesa to promesa wykreślenia hipoteki — nie „dla notariusza” ani źródło pieniędzy", () => {
    expect(all).not.toMatch(/promes\w* dla notariusza/i);
    expect(all).not.toMatch(/z promesy/i);
  });

  it("karta warsztatu bez kwoty odzysku", () => {
    const warsztat = PORTFOLIO_STORIES.find((s) => s.title === "Pięć lat finansowania warsztatu");
    expect(warsztat?.text).not.toContain("180 000");
  });
});
