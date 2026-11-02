import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assembleStartPackage, WINDYKATOR_PRICE_GROSZ, WINDYKATOR_TERMS_VERSION, type SourceFacts } from "./core";
import { qualifyWindykatorCase, mayPurchaseQualifiedCase } from "./qualification";

const dbAdmin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const isDate = (v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v));
const norm=(s:string)=>s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const schema=z.object({
  creditorKind:z.enum(["person","business","company"]),
  creditorName:z.string().trim().min(5).max(240),
  creditorNip:z.string().trim().max(10).optional(),
  creditorEmail:z.string().trim().email().max(240),
  debtorName:z.string().trim().min(4).max(240),
  claimKind:z.enum(["invoice","loan","other"]),
  claimAmount:z.number().min(1).max(100000000),
  dueDate:z.string().refine(isDate,"Nieprawidłowy termin"),
  description:z.string().max(2000).optional(),
  fileName:z.string().min(1).max(160),
  mime:z.enum(["application/pdf","image/jpeg","image/png","image/webp"]),
  dataUrl:z.string().min(100).max(8000000),
  consents:z.object({
    representation:z.literal(true), balance:z.literal(true), noDispute:z.literal(true), terms:z.literal(true),
    privacy:z.literal(true), earlyStart:z.literal(true), withdrawalNotice:z.literal(true),
  }),
});
function bytesFromDataUrl(src:string,mime:string):Uint8Array {
  const prefix="data:"+mime+";base64,";
  if(!src.startsWith(prefix))throw Error("Nieprawidłowy format pliku.");
  const b64=src.slice(prefix.length);
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))throw Error("Niepoprawne kodowanie pliku.");
  const b=new Uint8Array(Buffer.from(b64,"base64"));
  const pre=Array.from(b.slice(0,5)).join(",");
  const valid=(mime==="application/pdf"&&pre==="37,80,68,70,45") ||
    (mime==="image/jpeg"&&b[0]===255&&b[1]===216&&b[2]===255) ||
    (mime==="image/png"&&pre.startsWith("137,80,78,71")) ||
    (mime==="image/webp"&&String.fromCharCode(...b.slice(0,4))==="RIFF");
  if(!valid||b.length<128||b.length>5242880)throw Error("Obsługiwane są PDF/JPG/PNG/WebP do 5 MB.");
  return b;
}
/** Funkcja publiczna: nie prosimy o wrażliwe dane, gdy checkout jest zamknięty. */
export const getWindykatorSaleStatus=createServerFn({method:"GET"})
  .handler(async()=>({enabled:process.env.WINDYKATOR_AI_CHECKOUT_ENABLED==="true"}));

export const createWindykatorDraft=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((v:unknown)=>schema.parse(v))
  .handler(async ({data,context})=>{
    if(process.env.WINDYKATOR_AI_CHECKOUT_ENABLED!=="true") return {error:"Przyjmowanie zgłoszeń jest jeszcze wyłączone."};
    const db=await dbAdmin();
    const {count}=await db.from("windykator_orders").select("id",{count:"exact",head:true})
      .eq("user_id",context.userId).gte("created_at",new Date(Date.now()-86400000).toISOString());
    if((count??0)>=10)return {error:"Limit nowych zgłoszeń: 10 na dobę."};
    if(data.dueDate>new Date().toISOString().slice(0,10))return {error:"Roszczenie nie jest jeszcze wymagalne."};
    const bytes=bytesFromDataUrl(data.dataUrl,data.mime);
    const hash=await crypto.subtle.digest("SHA-256",bytes);
    const sha256=Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,"0")).join("");
    const id=crypto.randomUUID();
    const name=data.fileName.replace(/[^\p{L}\p{N}._ -]/gu,"_");
    const path=context.userId+"/"+id+"/"+name;
    const {error:uploadError}=await db.storage.from("windykator-private").upload(path,bytes,{contentType:data.mime,upsert:false});
    if(uploadError)return {error:"Nie można zapisać prywatnego dokumentu."};
    const {error}=await db.from("windykator_orders").insert({
      id,user_id:context.userId,creditor_kind:data.creditorKind,creditor_name:data.creditorName,
      creditor_nip:data.creditorNip??null,creditor_email:data.creditorEmail,
      debtor_name:data.debtorName,claim_kind:data.claimKind,claim_amount:data.claimAmount,
      due_date:data.dueDate,case_description:data.description??null,
      source_file_name:name,source_mime:data.mime,source_storage_path:path,source_sha256:sha256,
      early_start_consent:true,withdrawal_notice_ack:true,terms_accepted:true,
      privacy_ack:true,representation_asserted:true,balance_asserted:true,undisputed_asserted:true,
      accepted_terms_version:WINDYKATOR_TERMS_VERSION
    });
    if(error){await db.storage.from("windykator-private").remove([path]);return {error:"Nie można utworzyć sprawy."};}
    return {caseId:id};
  });

export const getWindykatorKyc=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context})=>{
    const db=await dbAdmin();
    const {data:row}=await db.from("didit_verifications").select("status,verification_url")
      .eq("user_id",context.userId).eq("vendor_data","windykator:"+context.userId)
      .order("created_at",{ascending:false}).limit(1).maybeSingle();
    return {verified:row?.status==="Approved",status:row?.status??"not_started",url:row?.verification_url??null};
  });

export const startWindykatorKyc=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context})=>{
    const {createDiditSession,selectWorkflowId,hasDiditConfig}=await import("@/lib/didit.server");
    if(!hasDiditConfig())return {error:"Didit jest chwilowo niedostępny."};
    const workflowId=selectWorkflowId("kyc");
    if(!workflowId)return {error:"Brak konfiguracji KYC."};
    const db=await dbAdmin();
    const vendorData="windykator:"+context.userId;
    const {data:existing}=await db.from("didit_verifications")
      .select("status,verification_url,created_at").eq("vendor_data",vendorData)
      .order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(existing?.status==="Approved")return {verified:true};
    if(existing?.verification_url&&["Not Started","In Progress"].includes(existing.status)
      &&Date.now()-new Date(existing.created_at).getTime()<5*86400000)return {url:existing.verification_url};
    const {resolveAppBaseUrl}=await import("@/lib/access/urls.server");
    const session=await createDiditSession({workflowId,vendorData,
      callback:resolveAppBaseUrl()+"/windykator-ai?didit=return",language:"pl",
      metadata:{purpose:"windykator_creditor",user_id:context.userId}});
    const {error}=await db.from("didit_verifications").insert({
      user_id:context.userId,aml_customer_id:null,vendor_data:vendorData,
      session_id:session.sessionId,session_number:session.sessionNumber,
      workflow_id:session.workflowId,workflow_type:"kyc",status:session.status,
      verification_url:session.url,metadata:{purpose:"windykator_creditor"}});
    if(error)return {error:"Nie udało się utworzyć weryfikacji."};
    return {url:session.url};
  });

export const createWindykatorCheckout=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((v:unknown)=>z.object({caseId:z.string().uuid()}).parse(v))
  .handler(async ({data,context})=>{
    if(process.env.WINDYKATOR_AI_CHECKOUT_ENABLED!=="true")
      return {error:"Zakup jest chwilowo wyłączony do czasu uruchomienia pełnej obsługi."};
    const db=await dbAdmin();
    const {data:o}=await db.from("windykator_orders").select("*")
      .eq("id",data.caseId).eq("user_id",context.userId).eq("intake_source","shop").maybeSingle();
    if(!o)return {error:"Nie znaleziono sprawy."};
    if(!mayPurchaseQualifiedCase({status:o.status,qualifiedAt:o.qualified_at,now:new Date().toISOString(),identityValid:true}))return {error:"Najpierw przejdź automatyczną kwalifikację sprawy. Ważność kwalifikacji: 7 dni."};
    if(o.creditor_kind!=="person")
      return {error:"Reprezentacja firmy wymaga odrębnej weryfikacji. Płatność zablokowana."};
    const {data:k}=await db.from("didit_verifications").select("status,decision")
      .eq("user_id",context.userId).eq("vendor_data","windykator:"+context.userId)
      .order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(k?.status!=="Approved")return {error:"Potwierdź tożsamość przez Didit."};
    const {extractDiditPersonalData}=await import("@/lib/didit.server");
    const name=extractDiditPersonalData(k.decision).fullName;
    if(!name||norm(name)!==norm(o.creditor_name))
      return {error:"Dane wierzyciela różnią się od zweryfikowanej tożsamości."};
    const {data:locked}=await db.from("windykator_orders")
      .update({status:"checkout_pending"}).eq("id",o.id).eq("status","qualified")
      .select("id").maybeSingle();
    if(!locked)return {error:"Sprawa jest już przetwarzana."};
    try{
      const {createTpayTransaction}=await import("@/lib/tpay.server");
      const {resolveAppBaseUrl}=await import("@/lib/access/urls.server");
      const base=resolveAppBaseUrl();
      const tx=await createTpayTransaction({
        amount:WINDYKATOR_PRICE_GROSZ/100,
        description:"Pakiet Startowy Windykator AI — dokumenty",
        email:o.creditor_email,name:o.creditor_name,
        crc:"WINDYKATOR:"+o.id,notifyUrl:base+"/api/public/payments/tpay-webhook",
        successUrl:base+"/windykator-ai?tpay=success&caseId="+o.id,
        errorUrl:base+"/windykator-ai?tpay=error&caseId="+o.id
      });
      await db.from("windykator_orders").update({tpay_transaction_id:String(tx.transactionId)})
        .eq("id",o.id).eq("status","checkout_pending");
      return {paymentUrl:tx.transactionPaymentUrl};
    }catch(e){
      console.error("[windykator] Tpay",e);
      await db.from("windykator_orders").update({status:"qualified"}).eq("id",o.id)
        .eq("status","checkout_pending").is("tpay_transaction_id",null);
      return {error:"Brak połączenia z Tpay. Spróbuj ponownie."};
    }
  });

const caseSchema=z.object({caseId:z.string().uuid()});
export const getWindykatorOrder=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>caseSchema.parse(v))
  .handler(async ({data,context})=>{
    const db=await dbAdmin();
    const {data:o}=await db.from("windykator_orders")
      .select("id,status,qualification_reasons,qualified_at,collection_activated_at,collection_ends_at,report_text,notice_text,epu_draft_text,analysis_error")
      .eq("id",data.caseId).eq("user_id",context.userId).maybeSingle();
    if(!o)return {error:"Nie znaleziono sprawy."};
    if(["draft","qualifying","qualified","needs_documents","rejected","checkout_pending","refunded","failed"].includes(o.status))return {caseId:o.id,status:o.status,paid:false,qualificationReasons:o.qualification_reasons??[],qualifiedAt:o.qualified_at??null};
    return {caseId:o.id,status:o.status,paid:true,
      report:o.report_text,notice:o.notice_text,epuDraft:o.epu_draft_text,error:o.analysis_error,
      collectionActivatedAt:o.collection_activated_at,collectionEndsAt:o.collection_ends_at};
  });

function extract(raw:string):SourceFacts {
  const obj=JSON.parse(raw.trim()) as Record<string,unknown>;
  const s=(x:unknown)=>typeof x==="string"?x.trim().slice(0,1000):null;
  const n=(x:unknown)=>typeof x==="number"&&Number.isFinite(x)&&x>0?x:null;
  const list=(x:unknown)=>Array.isArray(x)?x.filter(y=>typeof y==="string").slice(0,20).map(y=>String(y).slice(0,180)):[];
  const type=["invoice","loan","other"].includes(String(obj.documentType))
    ? String(obj.documentType) as "invoice"|"loan"|"other":"unknown";
  const due=s(obj.dueDate);
  return {documentType:type,creditor:s(obj.creditor),debtor:s(obj.debtor),
    documentNumber:s(obj.documentNumber),amount:n(obj.amount),
    dueDate:due&&isDate(due)?due:null,evidence:list(obj.evidence),
    missing:list(obj.missing),summary:s(obj.summary)??""};
}

/** Odczyt tylko na etapie kwalifikacji; nie generuje płatnego raportu. */
async function readFactsForQualification(o:any):Promise<SourceFacts>{
  const db=await dbAdmin();
  const key=process.env.LOVABLE_API_KEY;
  if(!key)throw Error("AI offline");
  const {data:file,error:fileError}=await db.storage.from("windykator-private")
    .download(o.source_storage_path);
  if(fileError||!file)throw Error("Brak źródła");
  const url="data:"+o.source_mime+";base64,"+Buffer.from(await file.arrayBuffer()).toString("base64");
  const prompt=[
    "Wyodrębnij jedynie dane znajdujące się w załączonym dokumencie. Niczego nie zgaduj.",
    "Zwróć WYŁĄCZNIE JSON z polami:",
    '{"documentType":"invoice|loan|other|unknown","creditor":null,"debtor":null,',
    '"documentNumber":null,"amount":null,"dueDate":null,"evidence":[],"missing":[],"summary":""}.',
    "Używaj prawdziwych wartości, podawaj daty jako YYYY-MM-DD, kwoty jako liczby.",
    "Nie traktuj faktury jako dowodu zapłaty ani niezapłacenia."
  ].join("\n");
  const content=o.source_mime==="application/pdf" ?
    [{type:"text",text:prompt},{type:"file",file:{filename:o.source_file_name,file_data:url}}] :
    [{type:"text",text:prompt},{type:"image_url",image_url:{url}}];
  const res=await fetch("https://ai.gateway.lovable.dev/v1/chat/completions",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},
    body:JSON.stringify({model:"google/gemini-2.5-flash",
      messages:[{role:"system",content:"Zwracaj tylko JSON z udokumentowanymi danymi."},
        {role:"user",content}],response_format:{type:"json_object"}})
  });
  if(!res.ok)throw Error("AI HTTP "+res.status);
  const body=await res.json();
  const facts=extract(String(body?.choices?.[0]?.message?.content??""));
  return facts;
}

/**
 * Jedyna droga przyjęcia: formularz sklepu -> KYC -> OCR+reguły -> "qualified".
 * Identyfikator caseId pochodzi z rekordu zalogowanego wierzyciela, nie z SMS/CRM.
 */
export const qualifyWindykatorOrder=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>caseSchema.parse(v))
  .handler(async ({data,context})=>{
    if(process.env.WINDYKATOR_AI_CHECKOUT_ENABLED!=="true")
      return {error:"Automatyczna kwalifikacja jest wyłączona do czasu wdrożenia."};
    const db=await dbAdmin();
    const {data:o}=await db.from("windykator_orders").select("*")
      .eq("id",data.caseId).eq("user_id",context.userId).eq("intake_source","shop").maybeSingle();
    if(!o)return {error:"Nie znaleziono zgłoszenia w sklepie."};
    if(o.status==="qualified" && mayPurchaseQualifiedCase({status:o.status,qualifiedAt:o.qualified_at,now:new Date().toISOString(),identityValid:true})) return {status:"qualified" as const,reasons:[]};
    if(!["draft","needs_documents","qualified"].includes(o.status))
      return {error:"Sprawa ma już decyzję kwalifikacyjną lub płatność."};
    const {data:k}=await db.from("didit_verifications").select("status,decision")
      .eq("user_id",context.userId).eq("vendor_data","windykator:"+context.userId)
      .order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(k?.status!=="Approved")return {error:"Najpierw przejdź weryfikację tożsamości Didit."};
    const {extractDiditPersonalData}=await import("@/lib/didit.server");
    const verifiedName=extractDiditPersonalData(k.decision).fullName;
    const same=!!verifiedName && norm(verifiedName)===norm(o.creditor_name);
    if(!same){
      const reasons=["Dane wierzyciela są niezgodne z potwierdzoną tożsamością."];
      await db.from("windykator_orders")
        .update({status:"rejected",qualification_reasons:reasons,qualified_at:null})
        .eq("id",o.id).in("status",["draft","needs_documents","qualified"]);
      return {status:"rejected" as const,reasons};
    }
    // Brak osobnego KYB oznacza brak kwalifikacji firm, nie ominięcie sprawdzenia.
    if(o.creditor_kind!=="person"){
      const reasons=["Weryfikacja reprezentacji firmy nie jest jeszcze dostępna."];
      await db.from("windykator_orders")
        .update({status:"needs_documents",qualification_reasons:reasons,qualified_at:null})
        .eq("id",o.id).in("status",["draft","needs_documents"]);
      return {status:"needs_documents" as const,reasons};
    }
    const {data:lock}=await db.from("windykator_orders")
      .update({status:"qualifying",qualification_reasons:[]}).eq("id",o.id)
      .in("status",["draft","needs_documents","qualified"]).select("id").maybeSingle();
    if(!lock)return {error:"Ta sprawa jest już sprawdzana."};
    try{
      const facts=await readFactsForQualification(o);
      const result=qualifyWindykatorCase({
        claim:{creditorName:o.creditor_name,debtorName:o.debtor_name,
          amount:Number(o.claim_amount),dueDate:o.due_date,claimKind:o.claim_kind},
        facts,creditorKind:o.creditor_kind,
        identityVerified:true,identityMatchesCreditor:true,creditorRepresentationVerified:true,
        creditorDeclaredNoPayment:o.balance_asserted===true,
        creditorDeclaredNoDispute:o.undisputed_asserted===true,
        today:new Date().toISOString().slice(0,10)
      });
      const {error}=await db.from("windykator_orders").update({
        status:result.status,qualification_reasons:result.reasons,
        qualification_facts:facts,qualified_at:result.status==="qualified"?new Date().toISOString():null,
        analysis_error:null
      }).eq("id",o.id).eq("status","qualifying");
      if(error)throw Error("Nie zapisano kwalifikacji.");
      return result;
    }catch(e){
      console.error("[windykator] qualification",e);
      await db.from("windykator_orders")
        .update({status:"draft",analysis_error:"Błąd kontroli dokumentów. Możesz ponowić kwalifikację."})
        .eq("id",o.id).eq("status","qualifying");
      return {error:"Nie udało się zweryfikować dokumentów. Spróbuj ponownie."};
    }
  });

/** Po Tpay, idempotentnie; błąd OCR nie odblokowuje windykacji ani wezwania. */
export const prepareWindykatorPackage=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>caseSchema.parse(v))
  .handler(async ({data,context})=>{
    const db=await dbAdmin();
    const {data:o}=await db.from("windykator_orders").select("*")
      .eq("id",data.caseId).eq("user_id",context.userId).maybeSingle();
    if(!o)return {error:"Nie znaleziono sprawy."};
    if(["analysis_ready","review_required"].includes(o.status))return {done:true};
    if(o.status!=="paid")return {error:"Raport dostępny dopiero po potwierdzonej płatności."};
    const {data:lock}=await db.from("windykator_orders").update({status:"analysis_running"})
      .eq("id",o.id).eq("status","paid").select("id").maybeSingle();
    if(!lock)return {error:"Analiza już trwa."};
    try{
      const facts=o.qualification_facts as SourceFacts;
      if(!facts || !o.qualified_at)throw Error("Brak zatwierdzonej kwalifikacji.");
      const pack=assembleStartPackage({creditorName:o.creditor_name,debtorName:o.debtor_name,
        claimKind:o.claim_kind,amount:Number(o.claim_amount),dueDate:o.due_date},facts);
      const {error}=await db.from("windykator_orders").update({
        status:pack.ready?"analysis_ready":"review_required",analysis:{facts,warnings:pack.warnings},
        report_text:pack.report,notice_text:pack.notice,epu_draft_text:pack.epuDraft,analysis_error:null
      }).eq("id",o.id).eq("status","analysis_running");
      if(error)throw Error("Błąd zapisu wyniku");
      return {done:true,reviewRequired:!pack.ready};
    }catch(e){
      console.error("[windykator] analysis",e);
      await db.from("windykator_orders").update({status:"paid",analysis_error:"Wystąpił błąd. Ponów analizę."})
        .eq("id",o.id).eq("status","analysis_running");
      return {error:"Analiza nie powiodła się. Spróbuj ponownie."};
    }
  });
