// Okresy modułów sklepu liczone z opłaconych zamówień store_orders (status
// "paid"; zwrot/chargeback zmienia status na "refunded" i kasuje uprawnienia,
// więc tura przestaje się liczyć):
//  • Centrum Zarządzania — 500 zł / 30 dni (item_id "centrum:…"),
//  • HIT „Pełna mapa szans i zagrożeń” — 9,99 zł / 30 dni kalkulatora
//    compliance (item_id "kalkulator:…").
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CALCULATOR_ITEM_PREFIX,
  CALCULATOR_UNLOCK_DAYS,
  MANAGEMENT_ITEM_PREFIX,
  MANAGEMENT_MODULE_DAYS,
  managementActiveUntil,
} from "./products";

const db = supabaseAdmin as any;

async function paidAtForPrefix(userId: string, prefix: string): Promise<string[]> {
  const { data, error } = await db
    .from("store_orders")
    .select("paid_at,items")
    .eq("user_id", userId)
    .eq("status", "paid")
    .order("paid_at", { ascending: true })
    .limit(500);
  if (error) throw new Error("Nie można odczytać okresu modułu sklepu.");
  return ((data ?? []) as Array<{ paid_at: string | null; items: unknown }>)
    .filter(
      (o) =>
        o.paid_at &&
        Array.isArray(o.items) &&
        (o.items as any[]).some(
          (i) => i?.kind === "course" && typeof i?.id === "string" && i.id.startsWith(prefix),
        ),
    )
    .map((o) => o.paid_at as string);
}

export async function managementModuleActiveUntilFor(userId: string): Promise<Date | null> {
  return managementActiveUntil(
    await paidAtForPrefix(userId, MANAGEMENT_ITEM_PREFIX),
    MANAGEMENT_MODULE_DAYS,
  );
}

export async function managementModuleActive(userId: string, now = new Date()): Promise<boolean> {
  const until = await managementModuleActiveUntilFor(userId);
  return Boolean(until && until.getTime() > now.getTime());
}

/** HIT 9,99 zł: do kiedy działa pełny kalkulator compliance (null — nigdy nie kupiony). */
export async function calculatorUnlockActiveUntilFor(userId: string): Promise<Date | null> {
  return managementActiveUntil(
    await paidAtForPrefix(userId, CALCULATOR_ITEM_PREFIX),
    CALCULATOR_UNLOCK_DAYS,
  );
}

export async function calculatorUnlockActive(userId: string, now = new Date()): Promise<boolean> {
  const until = await calculatorUnlockActiveUntilFor(userId);
  return Boolean(until && until.getTime() > now.getTime());
}
