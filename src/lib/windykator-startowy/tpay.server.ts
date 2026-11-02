/** Tpay potwierdza transakcję server-to-server; nigdy nie ufamy query parametrowi powrotu. */
export async function handleWindykatorTpay(input:{
  caseId:string;
  transactionId:string;
  status:string;
  amount:number;
}):Promise<void>{
  if(!/^[0-9a-f-]{36}$/i.test(input.caseId))throw Error("Invalid case id");
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
  const db=supabaseAdmin as any;
  const {data:order,error}=await db.from("windykator_orders")
    .select("id,status,amount_grosz,tpay_transaction_id,qualified_at,qualification_facts").eq("id",input.caseId).maybeSingle();
  if(error||!order)throw Error("Windykator order not found");
  if(!order.tpay_transaction_id || String(order.tpay_transaction_id)!==String(input.transactionId)){
    // Callback mógł dotrzeć przed zapisem ID transakcji; Tpay powinien go ponowić.
    throw Error("Tpay transaction ID not persisted or mismatched");
  }
  const amount=Math.round(input.amount*100);
  if(input.status==="correct"){
    if(amount!==5000 || Number(order.amount_grosz)!==5000)
      throw Error("Tpay incorrect amount");
    if(order.status==="checkout_pending"){
      if(!order.qualified_at || !order.qualification_facts) throw Error("Unqualified case cannot activate");
      const activatedAt=new Date();
      const endsAt=new Date(activatedAt.getTime()+90*86400000);
      const {error:saveError}=await db.from("windykator_orders")
        .update({status:"paid",paid_at:activatedAt.toISOString(),collection_activated_at:activatedAt.toISOString(),collection_ends_at:endsAt.toISOString(),collection_state:"active"})
        .eq("id",order.id).eq("status","checkout_pending");
      if(saveError)throw Error("Failed to record paid order");
    }
    return;
  }
  if(["error","declined","cancelled"].includes(input.status) && order.status==="checkout_pending"){
    await db.from("windykator_orders")
      .update({status:"qualified",tpay_transaction_id:null})
      .eq("id",order.id).eq("status","checkout_pending");
    return;
  }
  if(["refund","chargeback"].includes(input.status)){
    await db.from("windykator_orders").update({status:"refunded",collection_state:"paused"})
      .eq("id",order.id).in("status",["paid","analysis_ready","review_required","analysis_running"]);
  }
}
