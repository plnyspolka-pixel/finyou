import { createServerFn } from "@tanstack/react-start";

export type PublicLead = {
  id: string;
  created_at: string;
  initials: string;
  city: string | null;
  loan_amount: number | null;
  source_label: string;
};

const anonInitials = (first?: string | null, last?: string | null): string => {
  const a = (first ?? "").trim();
  const b = (last ?? "").trim();
  const fi = a ? a[0].toUpperCase() : "";
  const li = b ? b[0].toUpperCase() : "";
  const s = `${fi}${li}`.trim();
  return s || "•••";
};

const sourceLabel = (src?: string | null): string => {
  const s = (src ?? "").toLowerCase();
  if (s.includes("meta") || s.includes("facebook") || s.includes("fb") || s.includes("instagram") || s.includes("ig"))
    return "Kampania Meta";
  if (s.includes("google") || s.includes("ads")) return "Google Ads";
  if (s.includes("landing") || s.includes("strona") || s.includes("web")) return "Strona www";
  if (s.includes("phone") || s.includes("call") || s.includes("voice")) return "Telefon";
  if (s.includes("messenger")) return "Messenger";
  return "Wniosek online";
};

export const fetchPublicLeads = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("leads")
    .select("id, created_at, first_name, last_name, source, application_data, loan_application_id")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);

  const appIds = (data ?? [])
    .map((r: any) => r.loan_application_id)
    .filter((x: string | null): x is string => !!x);

  const amountByApp = new Map<string, number>();
  const cityByApp = new Map<string, string>();
  if (appIds.length > 0) {
    const { data: apps } = await supabaseAdmin
      .from("loan_applications")
      .select("id, loan_amount, property_city")
      .in("id", appIds);
    for (const a of apps ?? []) {
      if (a.loan_amount != null) amountByApp.set(a.id, Number(a.loan_amount));
      if (a.property_city) cityByApp.set(a.id, String(a.property_city));
    }
  }

  const rows: PublicLead[] = (data ?? []).map((r: any) => {
    const app = r.application_data ?? {};
    const city =
      (r.loan_application_id && cityByApp.get(r.loan_application_id)) ||
      app.property_city ||
      app.city ||
      null;
    const amount =
      (r.loan_application_id && amountByApp.get(r.loan_application_id)) ??
      (app.loan_amount != null ? Number(app.loan_amount) : null);
    return {
      id: r.id,
      created_at: r.created_at,
      initials: anonInitials(r.first_name, r.last_name),
      city: city ? String(city) : null,
      loan_amount: amount != null && !Number.isNaN(amount) ? amount : null,
      source_label: sourceLabel(r.source),
    };
  });
  return rows;
});
