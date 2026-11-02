import { supabaseAdmin } from "@/integrations/supabase/client.server";
const db = supabaseAdmin as any;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Called exclusively with Tpay transaction details independently fetched from Tpay API. */
export async function handleStoreTpayNotification(
  orderId: string,
  transaction: { transactionId: string; status: string; amount: number }
): Promise<void> {
  if (!UUID_RE.test(orderId)) throw new Error("Invalid store order reference");
  const { data: order, error } = await db.from("store_orders")
    .select("id,status,amount_grosz,provider_transaction_id,user_id,items")
    .eq("id", orderId).maybeSingle();
  if (error) throw error;
  if (!order) return;
  const txId = String(transaction.transactionId);
  const amount = Math.round(Number(transaction.amount) * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Invalid payment amount");
  if (transaction.status === "correct") {
    const { data: result, error: paidError } = await db.rpc("fulfill_store_order", {
      _order_id: orderId, _transaction_id: txId, _paid_grosz: amount,
    });
    if (paidError) throw paidError;
    if (!result?.ok) {
      console.warn("[store] Tpay paid notification rejected:", result?.reason, orderId);
      return;
    }
    if (!result.alreadyProcessed) {
      try {
        const { sendResendEmail } = await import("@/lib/resend-send.server");
        const { data: full } = await db.from("store_orders").select("buyer,items,amount_grosz").eq("id",orderId).single();
        const email = String(full?.buyer?.email || "");
        if (email) await sendResendEmail({
          to: email,
          category: "transactional",
          subject: "Finance You — potwierdzenie zakupu produktów cyfrowych",
          text: "Twoja płatność została potwierdzona.\n" +
            "Zakupione produkty są dostępne na Twoim koncie: https://financeyou.pl/sklep/moje-zakupy\n\n" +
            "Zamówienie: " + orderId + "\n" +
            "Cena całkowita: " + (Number(full?.amount_grosz || 0)/100).toFixed(2) + " PLN\n" +
            "Produkty:\n" + (full?.items || []).map((i: any) => "- " + i.title).join("\n") +
            "\n\nRegulamin, umowę powierzenia i potwierdzenia ich akceptacji możesz odczytać na koncie.\n" +
            "Jeśli wystąpi problem z dostępem do zakupionej treści, napisz: kontakt@financeyou.pl",
        });
      } catch (err) {
        console.warn("[store] payment confirmation email needs retry", orderId, (err as Error).message);
      }
    }
    return;
  }
  if (["refund","chargeback"].includes(transaction.status) && order.status === "paid" &&
      order.provider_transaction_id === txId) {
    // Stop future downloads and flag accounting for review.
    await db.from("store_orders").update({status:"refunded"}).eq("id",orderId).eq("status","paid");
    await db.from("store_entitlements").delete().eq("source_order_id",orderId);
    return;
  }
  if (["error","declined","cancelled"].includes(transaction.status)) {
    await db.from("store_orders").update({status:"cancelled"}).eq("id",orderId)
      .in("status",["created","pending"])
      .or("provider_transaction_id.is.null,provider_transaction_id.eq." + txId);
  }
}
