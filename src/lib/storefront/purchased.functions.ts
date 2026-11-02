import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { legalDigest } from "./legal";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { normalizePlaceholders, replaceByOccurrence, xmlToPlainText } from "@/lib/document-fields";

const Uuid=z.string().uuid();
async function ownEntitlement(db:any,userId:string,kind:string,itemId:string):Promise<boolean>{
  const {data}=await db.from("store_entitlements").select("id")
    .eq("user_id",userId).eq("item_kind",kind).eq("item_id",itemId).maybeSingle();
  return !!data;
}
export const getStoreLessonAccess=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((v:unknown)=>z.object({lessonId:Uuid}).parse(v))
  .handler(async({context,data})=>{
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const db=supabaseAdmin as any;
    const entitled=await ownEntitlement(db,context.userId,"lesson",data.lessonId)
      ||await ownEntitlement(db,context.userId,"course","academy");
    const {investorHasFullAccess}=await import("@/lib/access/guards.server");
    if(!entitled && !(await investorHasFullAccess(context.userId)))
      throw new Error("Brak uprawnień do tej lekcji. Kup lekcję lub pakiet Akademii.");
    const {data:v}=await db.from("training_videos")
      .select("id,title,is_published,file_path,external_url,description")
      .eq("id",data.lessonId).maybeSingle();
    if(!v?.is_published)throw new Error("Lekcja nie jest dostępna.");
    if(v.external_url)return {title:v.title,description:v.description??"",url:v.external_url};
    if(!v.file_path)return {title:v.title,description:v.description??"",url:null};
    const {data:signed,error}=await supabaseAdmin.storage.from("training-videos")
      .createSignedUrl(v.file_path,15*60);
    if(error)throw new Error("Nie można udostępnić lekcji.");
    return {title:v.title,description:v.description??"",url:signed?.signedUrl??null};
  });

export const getPurchasedDocDraft=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((v:unknown)=>z.object({templateId:Uuid}).parse(v))
  .handler(async({context,data})=>{
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const db=supabaseAdmin as any;
    if(!(await ownEntitlement(db,context.userId,"document",data.templateId)))
      throw new Error("Nie masz wykupionego dostępu do tego dokumentu.");
    const {data:doc}=await db.from("document_templates").select("name,template_file_path,category,use_case")
      .eq("id",data.templateId).maybeSingle();
    if(!doc?.template_file_path||doc.use_case==="legacy"||doc.category==="instrukcja")
      throw new Error("Wzór nie jest dostępny.");
    const {downloadTemplateFile}=await import("@/lib/document-generator.functions");
    const downloaded=await downloadTemplateFile(context.supabase,doc.template_file_path);
    if(!downloaded.file)throw new Error("Nie można pobrać wzoru dokumentu.");
    const {default:PizZip}=await import("pizzip");
    const zip=new PizZip(await downloaded.file.arrayBuffer());
    const text=xmlToPlainText(normalizePlaceholders(zip.file("word/document.xml")?.asText()??""));
    return {name:doc.name,text};
  });

export const generatePurchasedDocx=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((v:unknown)=>z.object({
    templateId:Uuid, values:z.record(z.string().max(2000)).refine(v=>Object.keys(v).length<=350),
  }).parse(v))
  .handler(async({context,data})=>{
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const db=supabaseAdmin as any;
    const [entitled,dpaHash]=await Promise.all([
      ownEntitlement(db,context.userId,"document",data.templateId),
      legalDigest("store_dpa"),
    ]);
    if(!entitled)throw new Error("Brak opłaconego prawa do wygenerowania tego wzoru.");
    const {data:dpa}=await db.from("store_legal_acceptances").select("id")
      .eq("user_id",context.userId).eq("document_code","store_dpa")
      .eq("document_sha256",dpaHash).maybeSingle();
    if(!dpa)throw new Error("Przed wpisaniem danych osób trzecich zaakceptuj umowę powierzenia w /sklep/zgody.");
    const {data:doc}=await db.from("document_templates").select("id,name,slug,category,use_case,template_file_path")
      .eq("id",data.templateId).maybeSingle();
    if(!doc?.template_file_path||doc.use_case==="legacy"||doc.category==="instrukcja")
      throw new Error("Ten wzór nie jest dostępny.");
    const {downloadTemplateFile}=await import("@/lib/document-generator.functions");
    const downloaded=await downloadTemplateFile(context.supabase,doc.template_file_path);
    if(!downloaded.file)throw new Error("Nie można pobrać wzoru.");
    const {default:PizZip}=await import("pizzip");
    const zip=new PizZip(await downloaded.file.arrayBuffer());
    const raw=zip.file("word/document.xml")?.asText();
    if(!raw)throw new Error("Nieprawidłowy szablon DOCX.");
    zip.file("word/document.xml",replaceByOccurrence(normalizePlaceholders(raw),data.values));
    const output=zip.generate({type:"nodebuffer",compression:"DEFLATE"});
    const storagePath=`generated/${context.userId}/${crypto.randomUUID()}_dokument.docx`;
    const {error:uploadErr}=await context.supabase.storage.from(CLIENT_FILES_BUCKET)
      .upload(storagePath,new Blob([new Uint8Array(output)],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}),{upsert:false});
    if(uploadErr)throw new Error("Nie udało się zapisać wygenerowanego dokumentu.");
    const {data:saved,error:saveErr}=await context.supabase.from("generated_documents").insert({
      template_id:doc.id,template_name:doc.name,template_slug:doc.slug,
      form_data:data.values,docx_path:storagePath,file_size_bytes:output.length,created_by:context.userId,
    }).select("id").single();
    if(saveErr||!saved){
      await context.supabase.storage.from(CLIENT_FILES_BUCKET).remove([storagePath]);
      throw new Error("Nie można zapisać historii wygenerowanego dokumentu.");
    }
    const {data:url,error:signErr}=await context.supabase.storage.from(CLIENT_FILES_BUCKET)
      .createSignedUrl(storagePath,5*60);
    if(signErr)throw new Error("Dokument zapisano, ale nie można utworzyć linku do pobrania.");
    return {id:saved.id,url:url?.signedUrl??null};
  });
