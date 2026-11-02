import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TpayTransactionStatus } from "@/lib/tpay.server";

const db=supabaseAdmin as any;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Intercepts a known store order before legacy access-payments handling.
 * Caller MUST already have fetched the transaction from authenticated Tpay API.
 * Returns true if CRC belongs to the standalone storefront.
 */
export async function handleVerifiedStoreTpay(
  crc:string,transactionId:string,tx:TpayTransactionStatus
):Promise<boolean> {
  if(!UUID_RE.test(crc))return false;
  const {data:order,error}=await db.from("store_orders")
    .select("id,user_id,status,amount_grosz,provider_transaction_id")
    .eq("id",crc).maybeSingle();
  if(error)throw new Error("Nie można sprawdzić zamówienia sklepu.");
  if(!order)return false;
  if(tx.transactionId && tx.transactionId!==transactionId)throw new Error("Tpay transaction id mismatch");
  if(String(tx.hiddenDescription??"")!==order.id)throw new Error("Tpay order reference mismatch");
  if(order.provider_transaction_id && order.provider_transaction_id!==transactionId)
    throw new Error("Tpay order transaction mismatch");
  const paidAmount=Math.round(Number(tx.amount)*100);
  if(tx.status==="correct") {
    if(paidAmount!==Number(order.amount_grosz)) {
      await db.from("store_orders").update({status:"review"}).eq("id",crc).in("status",["created","pending"]);
      throw new Error("Tpay store amount mismatch");
    }
    const {data:success,error:rpcError}=await db.rpc("finalize_store_paid_order",{
      p_id:crc,p_transaction_id:transactionId,p_amount_grosz:paidAmount,
    });
    if(rpcError||success!==true)throw new Error("Store order fulfilment failed");
    return true;
  }
  if(["error","cancelled","rejected"].includes(String(tx.status))) {
    await db.from("store_orders").update({status:"failed"}).eq("id",crc)
      .in("status",["created","pending"]);
  }
  return true;
}
