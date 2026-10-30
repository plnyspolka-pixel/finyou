/** Regresja: w indywidualnym pośrednictwie żaden endpoint nie dobiera sam projektów. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf-8");
const orderCycle = source("src/lib/investor-agreements/order-cycle.functions.ts");
const orderServer = source("src/lib/investor-agreements/order-cycle.server.ts");
const orderProjects = source("src/lib/investor-agreements/order-projects.functions.ts");
const projectAssignments = source("src/lib/projects/assignments.functions.ts");
const distribution = source("src/lib/auto-distribution/engine.server.ts");
const email = source("src/lib/offer-distribution-core.server.ts");
const sql = source("supabase/migrations/20261030230000_manual_mediation_security.sql");
const mirror = source("drizzle/migrations/0054_manual_mediation_security.sql");

describe("indywidualne pośrednictwo — ograniczenia kanałów ofertowych", () => {
  it("nie uruchamia automatycznego dopasowania przy odczycie ani z crona", () => {
    expect(orderCycle).not.toContain("autoMatchInvestorOrders(");
    expect(orderServer).not.toContain("autoMatchInvestorOrders(");
    expect(distribution).toContain("return { disabled: true };");
    expect(distribution).toContain("Automatyczna dystrybucja jest wyłączona.");
  });

  it("nie dopuszcza samodzielnego pobrania projektu bez ręcznego dopasowania", () => {
    expect(orderProjects).toContain("if (!match) continue;");
    expect(orderProjects).toContain("Ten Projekt nie został indywidualnie przypisany");
    expect(orderProjects).toContain("Projekt musi zostać przypisany przez operatora");
    expect(projectAssignments).toContain('code: "manual_only"');
    expect(orderCycle).toContain('type: "indywidualny_dobor_przez_operatora"');
    expect(orderCycle).toContain("min(20).max(2000)");
  });

  it("wymaga jednego odbiorcy zamiast wysyłki do wszystkich", () => {
    expect(email).toContain("input.investorIds.length !== 1");
    expect(source("src/lib/offer-distribution.functions.ts")).toContain(".length(1)");
  });

  it("odbiera authenticated dostęp do dawnego katalogu ofert; migracje mają lustro", () => {
    expect(sql).toContain("list_public_loan_proposals() FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("get_public_loan_proposal(uuid) FROM PUBLIC, anon, authenticated");
    expect(mirror).toBe(sql);
  });
});
