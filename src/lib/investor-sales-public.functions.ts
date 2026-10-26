import { createServerFn } from "@tanstack/react-start";
import { COMPLETE_APPLICATION_STATUSES, publicCase } from "./investor-sales-public";

/** Explicit public projection: never return underlying applications, identities or raw teaser JSON. */
export const getInvestorPublicProof = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin;
  const [countResult, matches] = await Promise.all([
    db.from("loan_applications").select("id", { count: "exact", head: true }).in("status", [...COMPLETE_APPLICATION_STATUSES]),
    db.from("investor_order_matches").select("project_ref,match_seq,status,created_at,teaser,application_id").in("status", ["teaser", "dopasowane", "karta_leada", "rezerwacja", "transakcja"]).order("created_at", { ascending: false }).limit(30),
  ]);
  const seen = new Set<string>();
  const cases = (matches.data ?? []).flatMap((row) => {
    if (seen.has(row.application_id)) return [];
    seen.add(row.application_id);
    const item = publicCase({ ...row, match_seq: Number(row.match_seq), teaser: row.teaser as Record<string, unknown> | null });
    return item ? [item] : [];
  }).slice(0, 3);
  return { applications: countResult.error ? null : countResult.count, cases };
});