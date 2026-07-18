import { createServerFn } from "@tanstack/react-start";

export type PublicLead = {
  id: string;
  created_at: string;
  property_type: string;
  city: string | null;
  loan_amount: number | null;
  period_months: number | null;
  ltv: number | null;
  is_new: boolean;
};

export const fetchPublicLeads = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("loan_applications")
    .select("id, created_at, loan_amount, preferred_period_months, properties(property_type, city, estimated_value)")
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw new Error(error.message);

  const now = Date.now();
  const rows: PublicLead[] = [];
  for (const r of (data ?? []) as any[]) {
    const props = Array.isArray(r.properties) ? r.properties[0] : r.properties;
    const pt = props?.property_type;
    if (!pt) continue;
    const amt = r.loan_amount != null ? Number(r.loan_amount) : null;
    if (amt == null || Number.isNaN(amt) || amt <= 0) continue;
    const val = props?.estimated_value != null ? Number(props.estimated_value) : null;
    const ltv = val && val > 0 ? Math.round((amt / val) * 100) : null;
    const period = r.preferred_period_months != null ? Number(r.preferred_period_months) : null;
    const ageDays = (now - new Date(r.created_at).getTime()) / 86400000;
    rows.push({
      id: r.id,
      created_at: r.created_at,
      property_type: String(pt),
      city: props?.city ?? null,
      loan_amount: amt,
      period_months: period,
      ltv,
      is_new: ageDays <= 3,
    });
    if (rows.length >= 30) break;
  }
  return rows;
});
