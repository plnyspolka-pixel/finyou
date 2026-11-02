import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateBuyer } from "@/lib/access/core";
import { legalDigest } from "./legal";
import { validateKwNumber } from "@/lib/kw";

const ItemSchema=z.object({
  kind:z.enum(["lesson","document","course","kw"]),
  id:z.string().min(2).max(80),
});
const BuyerSchema=z.object({
  buyerType:z.enum(["person","company"]),
  buyerName:z.string().trim().min(2).max(300),
  buyerEmail:z.string().trim().email().max(255),
  buyerNip:z.string().trim().max(20).optional().nullable(),
  buyerStreet:z.string().trim().min(2).max(300),
  buyerPostalCode:z.string().trim().max(12),
  buyerCity:z.string().trim().min(2).max(120),
  buyerCountry:z.string().trim().length(2).default("PL"),
});
const OrderSchema=z.object({
  items:z.array(ItemSchema).min(1).max(50),
  buyer:BuyerSchema,
  immediateDigitalDelivery:z.literal(true),
});
const UuidSchema=z.string().uuid();

export const getMyStoreOrders=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async({context})=>{
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const db=supabaseAdmin as any;
    const [orders,entitlements,inquiries]=await Promise.all([
      db.from("store_orders").select("id,status,amount_grosz,created_at,items,paid_at").eq("user_id",context.userId).order("created_at",{ascending:false}).limit(30),
      db.from("store_entitlements").select("item_kind,item_id,created_at,source_order_id").eq("user_id",context.userId).limit(200),
      db.from("store_inquiries").select("id,status,total_grosz,created_at,email_sent").eq("user_id",context.userId).order("created_at",{ascending:false}).limit(30),
    ]);
    if(orders.error||entitlements.error||inquiries.error)throw new Error("Błąd odczytu zamówień.");
    return {orders:orders.data??[],entitlements:entitlements.data??[],inquiries:inquiries.data??[]};
  });

export const getMyStoreOrder=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:unknown)=>z.object({orderId:UuidSchema}).parse(i))
  .handler(async({context,data})=>{
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const {data:row,error}=await (supabaseAdmin as any).from("store_orders")
      .select("id,status,amount_grosz,created_at,paid_at,items").eq("id",data.orderId).eq("user_id",context.userId).maybeSingle();
    if(error)throw new Error("Nie można sprawdzić zamówienia.");
    return row??null;
  });

/** Server-side price and eligibility calculator; browser never supplies amount. */
export async function resolveStoreItems(db:any,items:z.infer<typeof ItemSchema>[]){
  const unique=new Set<string>();
  const out:{kind:"lesson"|"document"|"course"|"kw";id:string;title:string;price_grosz:number}[]=[];
  for(const item of items) {
    const key=item.kind+":"+item.id;
    if(unique.has(key))continue;
    unique.add(key);
    if(item.kind==="lesson") {
      if(!UuidSchema.safeParse(item.id).success)throw new Error("Nieprawidłowy identyfikator lekcji.");
      const {data:v}=await db.from("training_videos").select("title,free_lesson,is_published").eq("id",item.id).maybeSingle();
      if(!v?.is_published)throw new Error("Ta lekcja nie jest dostępna.");
      if(v.free_lesson)continue; // first lesson is free, never charge for it.
      out.push({kind:"lesson",id:item.id,title:v.title,price_grosz:14900});
    }else if(item.kind==="document") {
      if(!UuidSchema.safeParse(item.id).success)throw new Error("Nieprawidłowy identyfikator dokumentu.");
      const {data:d}=await db.from("document_templates").select("name,use_case,category,template_file_path")
        .eq("id",item.id).maybeSingle();
      if(!d?.template_file_path||d.use_case==="legacy"||d.category==="instrukcja")
        throw new Error("Ten dokument nie jest dostępny w sklepie.");
      out.push({kind:"document",id:item.id,title:d.name,price_grosz:19900});
    }else if(item.kind==="course") {
      if(item.id!=="academy")throw new Error("Nieznany pakiet szkoleniowy.");
      out.push({kind:"course",id:"academy",title:"Akademia Inwestora — pełny program",price_grosz:199000});
    }else if(item.kind==="kw") {
      const check=validateKwNumber(item.id);
      if(!check.ok)throw new Error("Nieprawidłowy numer księgi.");
      // KW is intentionally not offered until verified fulfilment from paid purchase
      // has a protected server-side report-generation workflow.
      throw new Error("Zakup raportów KW jest tymczasowo niedostępny.");
    }
  }
  if(out.some(i=>i.kind==="course"))return out.filter(i=>i.kind!=="lesson");
  return out;
}

export const startStoreCheckout=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:unknown)=>OrderSchema.parse(i))
  .handler(async({context,data})=>{
    // Seller, VAT/invoicing and transaction recipient must be verified for these
    // standalone products before charging customers on production.
    if(process.env.STORE_PAYMENTS_ENABLED!=="true" || process.env.STORE_SELLER_CONFIRMED!=="true" || !(process.env.STORE_SELLER_LEGAL_NAME??"").trim() || process.env.STORE_INVOICING_READY!=="true")
      return {ok:false as const,error:"Płatności za produkty jednostkowe są jeszcze niedostępne. Skorzystaj z zamówienia do potwierdzenia."};
    const buyerErrors=validateBuyer(data.buyer);
    if(buyerErrors.length)return {ok:false as const,error:buyerErrors[0]};
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const db=supabaseAdmin as any;
    const digest=await legalDigest("store_terms");
    const {data:accepted}=await db.from("store_legal_acceptances")
      .select("document_code,document_sha256").eq("user_id",context.userId).eq("document_code","store_terms").eq("document_sha256",digest).maybeSingle();
    if(!accepted)return {ok:false as const,error:"Przed zakupem zaakceptuj aktualny regulamin sklepu."};
    const items=await resolveStoreItems(db,data.items);
    if(items.length===0)return {ok:false as const,error:"Nie wybrano płatnych produktów."};
    const amount_grosz=items.reduce((s,i)=>s+i.price_grosz,0);
    if(amount_grosz>200000000)return {ok:false as const,error:"Maksymalna kwota zamówienia została przekroczona."};
    const since=new Date(Date.now()-60*60_000).toISOString();
    const {count}=await db.from("store_orders").select("id",{count:"exact",head:true})
      .eq("user_id",context.userId).gte("created_at",since);
    if((count??0)>=5)return {ok:false as const,error:"Zbyt wiele prób płatności. Spróbuj później."};
    const {data:order,error:insError}=await db.from("store_orders").insert({
      user_id:context.userId,items,amount_grosz,currency:"PLN",status:"created",
      buyer:data.buyer,immediate_digital_delivery:true,
      legal_snapshots:{store_terms:digest,digitalDeliveryAccepted:true},
    }).select("id").single();
    if(insError||!order)return {ok:false as const,error:"Nie udało się zapisać zamówienia."};
    const {resolveAppBaseUrl}=await import("@/lib/access/urls.server");
    const base=resolveAppBaseUrl();
    const qp="?order="+encodeURIComponent(order.id);
    try {
      const {createTpayTransaction}=await import("@/lib/tpay.server");
      const tx=await createTpayTransaction({
        amount:amount_grosz/100,description:"Produkty cyfrowe Finance You",
        email:data.buyer.buyerEmail,name:data.buyer.buyerName,
        crc:order.id,notifyUrl:base+"/api/public/payments/tpay-webhook",
        successUrl:base+"/sklep/zamowienie"+qp+"&tpay=success",
        errorUrl:base+"/sklep/zamowienie"+qp+"&tpay=error",
      });
      await db.from("store_orders").update({provider_transaction_id:tx.transactionId,status:"pending"})
        .eq("id",order.id).eq("status","created");
      return {ok:true as const,paymentUrl:tx.transactionPaymentUrl,orderId:order.id};
    }catch(e) {
      await db.from("store_orders").update({status:"failed"}).eq("id",order.id).eq("status","created");
      console.error("[store] checkout provider error",e instanceof Error?e.message:"unknown");
      return {ok:false as const,error:"Nie udało się rozpocząć płatności Tpay. Spróbuj później."};
    }
  });

export const getStoreCheckoutCapability=createServerFn({method:"GET"}).handler(async()=>({
  available:process.env.STORE_PAYMENTS_ENABLED==="true" &&
    process.env.STORE_SELLER_CONFIRMED==="true" &&
    !!(process.env.STORE_SELLER_LEGAL_NAME??"").trim() &&
    process.env.STORE_INVOICING_READY==="true",
  sellerName:(process.env.STORE_SELLER_LEGAL_NAME??"").trim()||null,
}));

export const submitStoreInquiry=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:unknown)=>z.object({items:z.array(ItemSchema).min(1).max(50),buyer:BuyerSchema}).parse(i))
  .handler(async({context,data})=>{
    const errors=validateBuyer(data.buyer);
    if(errors.length)return {ok:false as const,error:errors[0]};
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const db=supabaseAdmin as any;
    const termsHash=await legalDigest("store_terms");
    const {data:acceptance}=await db.from("store_legal_acceptances").select("id")
      .eq("user_id",context.userId).eq("document_code","store_terms")
      .eq("document_sha256",termsHash).maybeSingle();
    if(!acceptance)return {ok:false as const,error:"Najpierw zaakceptuj regulamin sklepu."};
    const items=await resolveStoreItems(db,data.items);
    if(items.length===0)return {ok:false as const,error:"Brak płatnych produktów w zamówieniu."};
    const since=new Date(Date.now()-3600000).toISOString();
    const {count}=await db.from("store_inquiries").select("id",{count:"exact",head:true})
      .eq("user_id",context.userId).gte("created_at",since);
    if((count??0)>=3)return {ok:false as const,error:"Osiągnięto limit zgłoszeń. Spróbuj ponownie za godzinę."};
    const total=items.reduce((sum,item)=>sum+item.price_grosz,0);
    const {data:request,error:saveError}=await db.from("store_inquiries")
      .insert({user_id:context.userId,items,total_grosz:total,buyer:data.buyer,store_terms_sha256:termsHash})
      .select("id").single();
    if(saveError||!request)return {ok:false as const,error:"Nie udało się zapisać zamówienia."};
    const details=items.map((i:any)=>`- ${i.title} / ${(i.price_grosz/100).toFixed(2)} zł`).join("\n");
    const textBody=`Zamówienie do potwierdzenia ${request.id}\nNabywca: ${data.buyer.buyerName}\nE-mail: ${data.buyer.buyerEmail}\n\nProdukty:\n${details}\n\nSuma: ${(total/100).toFixed(2)} zł\n\nTo NIE jest potwierdzenie opłacenia ani automatyczna realizacja zamówienia.`;
    let sent=false;
    try{
      const {sendResendEmail}=await import("@/lib/resend-send.server");
      const internal=await sendResendEmail({to:"kontakt@financeyou.pl",
        subject:`Nowe zamówienie sklepu FY: ${request.id.slice(0,8)}`,
        text:textBody,category:"transactional",noBranding:true});
      const buyer=await sendResendEmail({to:data.buyer.buyerEmail,
        subject:"Otrzymaliśmy Twoje zamówienie do potwierdzenia — Finance You",
        text:textBody,category:"transactional"});
      sent=internal.ok&&buyer.ok;
      await db.from("store_inquiries").update({email_sent:sent}).eq("id",request.id);
    }catch(e){
      console.error("[store] transactional notification failed",e instanceof Error?e.message:"unknown");
    }
    return {ok:true as const,inquiryId:request.id,emailSent:sent};
  });
