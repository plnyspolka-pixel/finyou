import { createServerFn } from "@tanstack/react-start";

export type PublicLead = {
  id: string;
  created_at: string;
  property_type: string;
  loan_amount: number | null;
  voivodeship: string | null;
};

export const fetchPublicLeads = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Ostatnie okazje inwestycyjne: wnioski z ustawionym typem nieruchomości.
  const { data, error } = await supabaseAdmin
    .from("loan_applications")
    .select("id, created_at, loan_amount, properties(property_type, voivodeship)")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);

  const rows: PublicLead[] = [];
  for (const r of (data ?? []) as any[]) {
    const props = Array.isArray(r.properties) ? r.properties[0] : r.properties;
    const pt = props?.property_type;
    if (!pt) continue;
    const amt = r.loan_amount != null ? Number(r.loan_amount) : null;
    if (amt == null || Number.isNaN(amt) || amt <= 0) continue;
    rows.push({
      id: r.id,
      created_at: r.created_at,
      property_type: String(pt),
      loan_amount: amt,
      voivodeship: props?.voivodeship ? String(props.voivodeship) : null,
    });
    if (rows.length >= 30) break;
  }
  return rows;
});
