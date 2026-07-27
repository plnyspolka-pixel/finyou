import { createServerFn } from "@tanstack/react-start";

// Publiczna, zanonimizowana lista faktur sprzedaży Finance You (embed „Ostatnie transakcje").
// Celowo NIE zwracamy dat ani numerów faktur — numeracja (np. „23/07/2026") zdradza daty
// wystawienia, a lista ma pokazywać wyłącznie skalę sprzedaży.
export type PublicInvoice = {
  id: string;
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
    .select("id, invoice_number, issue_date, net_amount, gross_amount, currency, counterparty_name, counterparty_nip, items")
    .eq("direction", "sales")
    .order("issue_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(60);
  if (entityIds.length > 0) q = q.in("entity_id", entityIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  // Ta sama faktura potrafi trafić do rejestru dwiema drogami (KSeF + Fakturowo) —
  // deduplikacja po numerze i kwocie, wygrywa nowsza pozycja (lista jest już posortowana).
  const seen = new Set<string>();
  const rows: PublicInvoice[] = [];
  for (const r of (data ?? []) as any[]) {
    const key = `${(r.invoice_number ?? "").trim()}|${Number(r.gross_amount ?? 0)}`;
    if (r.invoice_number && seen.has(key)) continue;
    seen.add(key);
    rows.push({
      id: r.id,
      net_amount: Number(r.net_amount ?? r.gross_amount ?? 0),
      gross_amount: Number(r.gross_amount ?? 0),
      currency: r.currency ?? "PLN",
      buyer_label: anonBuyer(r.counterparty_name),
      item_label: "Pośrednictwo finansowe",
    });
    if (rows.length >= 25) break;
  }
  return rows;
});
