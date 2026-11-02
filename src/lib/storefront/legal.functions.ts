import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { legalDigest, legalText, legalVersion, type StoreLegalCode } from "./legal";

const codes = ["store_terms","store_dpa"] as const;
const AcceptSchema = z.object({
  codes: z.array(z.enum(codes)).min(1).max(2),
  termsConfirmed: z.boolean().default(false),
  dpaConfirmed: z.boolean().default(false),
  controllerAuthority: z.boolean().default(false),
});

export const getStoreLegalDocuments = createServerFn({method:"GET"}).handler(async () => {
  return await Promise.all(codes.map(async code => ({
    code,version:legalVersion(code),sha256:await legalDigest(code),content:legalText(code),
    title: code==="store_terms" ? "Regulamin sklepu Finance You" : "Umowa powierzenia danych osobowych — narzędzia",
  })));
});

export const getMyStoreLegalState = createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context}) => {
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const db=supabaseAdmin as any;
    const {data, error}=await db.from("store_legal_acceptances")
      .select("id,document_code,document_version,document_sha256,accepted_at")
      .eq("user_id",context.userId);
    if(error) throw new Error("Nie można odczytać zaakceptowanych umów.");
    const docs=await Promise.all(codes.map(async code=>{
      const sha256=await legalDigest(code);
      return {code,version:legalVersion(code),sha256,
        accepted:(data??[]).some((r:any)=>r.document_code===code&&r.document_sha256===sha256)};
    }));
    return {docs,acceptedHistory:data??[]};
  });

/**
 * Clickwrap is explicit, not pre-ticked. Acceptance is bound to authenticated
 * account and full immutable text, never to a mutable URL alone.
 */
export const acceptStoreLegalDocuments = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((i:unknown)=>AcceptSchema.parse(i))
  .handler(async ({context,data})=>{
    const unique=[...new Set(data.codes)] as StoreLegalCode[];
    if(unique.includes("store_terms")&&!data.termsConfirmed)
      throw new Error("Potwierdź akceptację regulaminu.");
    if(unique.includes("store_dpa")&&(!data.dpaConfirmed||!data.controllerAuthority))
      throw new Error("Potwierdź umowę powierzenia oraz uprawnienie do działania jako administrator danych.");
    const request=getRequest();
    // The first forwarded address is used ONLY as non-decisive audit metadata.
    const rawIp=request?.headers.get("cf-connecting-ip")??request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??null;
    const ip=rawIp && (/^[\d.:a-f]+$/i.test(rawIp)) ? rawIp : null;
    const userAgent=request?.headers.get("user-agent")?.slice(0,500)??null;
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const records=await Promise.all(unique.map(async code=>({
      user_id:context.userId,document_code:code,document_version:legalVersion(code),
      document_sha256:await legalDigest(code),document_text:legalText(code),
      auth_method:"authenticated_session",ip,user_agent:userAgent,
      statements:{termsConfirmed:code==="store_terms"?true:undefined,
        dpaConfirmed:code==="store_dpa"?true:undefined,controllerAuthority:code==="store_dpa"?true:undefined},
    })));
    const {error}=await (supabaseAdmin as any).from("store_legal_acceptances")
      .upsert(records,{onConflict:"user_id,document_code,document_sha256",ignoreDuplicates:true});
    if(error)throw new Error("Nie udało się utrwalić akceptacji. Spróbuj ponownie.");
    return {accepted:unique.map(code=>({code,version:legalVersion(code)}))};
  });
