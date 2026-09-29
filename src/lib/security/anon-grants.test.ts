/**
 * Regresja Etapu 0 (bezpieczeństwo danych): migracja SQL musi odbierać roli
 * `anon` dostęp do teaserów i propozycji pożyczek oraz usuwać publiczny widok.
 * Test parsuje plik migracji — nie wymaga bazy.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260929120000_etap0_bezpieczenstwo_teaserow.sql",
);
const MIRROR = join(process.cwd(), "drizzle/migrations/0009_etap0_bezpieczenstwo_teaserow.sql");

const sql = readFileSync(MIGRATION, "utf-8").toLowerCase();

describe("Etap 0 — granty dla anon", () => {
  it("usuwa widok public_loan_teasers po cofnięciu grantów", () => {
    expect(sql).toMatch(/revoke all on public\.public_loan_teasers from anon, authenticated/);
    expect(sql).toMatch(/drop view public\.public_loan_teasers/);
  });

  it("investor_offer_teasers: bez anon, bez auth.uid() is null, tylko przyjęte Zlecenia", () => {
    expect(sql).toMatch(
      /revoke execute on function public\.investor_offer_teasers\(\) from public, anon/,
    );
    // treść funkcji (bez komentarza nagłówkowego migracji)
    const fnBody = sql.slice(sql.indexOf("create function public.investor_offer_teasers"));
    const body = fnBody.slice(0, fnBody.indexOf("$$;"));
    expect(body).not.toMatch(/or auth\.uid\(\) is null/);
    expect(body).toMatch(/o\.status = 'przyjete'/);
    expect(body).toMatch(/o\.user_id = auth\.uid\(\)/);
    // bez opisu i zdjęć w teaserze
    expect(body).not.toMatch(/p\.description|p\.photos/);
  });

  it("propozycje pożyczek: anon bez EXECUTE, wymagany auth.uid()", () => {
    expect(sql).toMatch(
      /revoke execute on function public\.list_public_loan_proposals\(\) from public, anon/,
    );
    expect(sql).toMatch(
      /revoke execute on function public\.get_public_loan_proposal\(uuid\) from public, anon/,
    );
    expect((sql.match(/auth\.uid\(\) is not null/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("funkcje SECURITY DEFINER zapisujące dane bez EXECUTE dla anon", () => {
    for (const fn of [
      "apply_loan_auto_status(uuid)",
      "compute_loan_auto_status(uuid)",
      "dedup_leads()",
    ]) {
      expect(sql).toContain(`revoke execute on function public.${fn} from public, anon`);
    }
  });

  it("lustro migracji w drizzle/ jest identyczne (ścieżka, którą puszcza deploy)", () => {
    expect(readFileSync(MIRROR, "utf-8")).toBe(readFileSync(MIGRATION, "utf-8"));
  });
});
