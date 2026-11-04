// Okres Centrum Zarządzania (moduł sklepu 500 zł / 30 dni) — liczony z
// opłaconych zamówień store_orders (status "paid"; zwrot/chargeback zmienia
// status na "refunded" i kasuje uprawnienia, więc tura przestaje się liczyć).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MANAGEMENT_ITEM_PREFIX, managementActiveUntil } from "./products";

const db = supabaseAdmin as any;

export async function managementModuleActiveUntilFor(userId: string): Promise<Date | null> {
  const { data, error } = await db.from("store_orders")
    .select("paid_at,items")
    .eq("user_id", userId).eq("status", "paid")
    .order("paid_at", { ascending: true }).limit(500);
  if (error) throw new Error("Nie można odczytać okresu Centrum Zarządzania.");
  const paid = ((data ?? []) as Array<{ paid_at: string | null; items: unknown }>)
    .filter((o) => o.paid_at && Array.isArray(o.items) && (o.items as any[]).some(
      (i) => i?.kind === "course" && typeof i?.id === "string" && i.id.startsWith(MANAGEMENT_ITEM_PREFIX)))
    .map((o) => o.paid_at as string);
  return managementActiveUntil(paid);
}

export async function managementModuleActive(userId: string, now = new Date()): Promise<boolean> {
  const until = await managementModuleActiveUntilFor(userId);
  return Boolean(until && until.getTime() > now.getTime());
}
