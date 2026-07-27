import { createServerFn } from "@tanstack/react-start";

export type PublicInvoice = {
  id: string;
  invoice_number: string | null;
  issue_date: string | null;
  net_amount: number;
  gross_amount: number;
  currency: string;
  buyer_label: string;
  item_label: string;
};

export const fetchPublicInvoices = createServerFn({ method: "GET" }).handler(async () => {
  const anonBuyer = (name: string | null | undefined): string => {
    const clean = (name ?? "").trim();
    if (!clean) return "Podmiot gospodarczy";
    return clean.length > 3 ? `${clean.slice(0, 3)}***` : "Podmiot";
  };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: entities } = await supabaseAdmin
    .from("accounting_entities")
    .select("id, name")
    .ilike("name", "%finance you%");
  const entityIds = (entities ?? []).map((e: any) => e.id);
  let q = supabaseAdmin
    .from("accounting_documents")
    .select(
      "id, invoice_number, issue_date, net_amount, gross_amount, currency, counterparty_name, counterparty_nip, items",
    )
    .eq("direction", "sales")
    .order("issue_date", { ascending: false, nullsFirst: false })
    .limit(25);
  if (entityIds.length > 0) q = q.in("entity_id", entityIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows: PublicInvoice[] = (data ?? []).map((r: any) => {
    return {
      id: r.id,
      invoice_number: r.invoice_number,
      issue_date: r.issue_date,
      net_amount: Number(r.net_amount ?? r.gross_amount ?? 0),
      gross_amount: Number(r.gross_amount ?? 0),
      currency: r.currency ?? "PLN",
      buyer_label: anonBuyer(r.counterparty_name),
      item_label: "Pośrednictwo finansowe",
    };
  });
  return rows;
});
