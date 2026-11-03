/**
 * Finance You -> private e-Doręczenia bridge.
 * No PEM, OAuth token, ADE credential or bridge secret ever leaves the backend.
 * A valid Supabase user AND a DB-side role check are mandatory.
 * Personal ADE is a physically separate bridge, limited to one explicit owner UID.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Action = "list_mailboxes" | "list_messages" | "read_message" | "evidences" |
  "create_draft" | "list_drafts" | "get_draft" | "send_approved" | "send_task_status";
const actions = new Set<Action>([
  "list_mailboxes","list_messages","read_message","evidences",
  "create_draft","list_drafts","get_draft","send_approved","send_task_status"
]);
const noStore = {
  "Cache-Control": "no-store, private, max-age=0",
  "X-Content-Type-Options": "nosniff"
};
function output(data: unknown, status=200) {
  return Response.json(data,{status,headers:noStore});
}
type Identity={id:string,admin:boolean,staff:boolean,personal:boolean};
async function authenticate(req:Request):Promise<Identity|null> {
  const match=/^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!match) return null;
  const {data,error}=await supabaseAdmin.auth.getUser(match[1]);
  const id=data?.user?.id;
  if (error||!id) return null;
  const roles=await supabaseAdmin.from("user_roles").select("role").eq("user_id",id);
  if (roles.error) throw new Error("Could not verify user role");
  const all=(roles.data ?? []).map((r)=>r.role as string);
  const admin=all.includes("administrator");
  const staff=admin || all.includes("operator");
  if (!staff) return null;
  const personal=admin && Boolean(process.env.EDO_PERSONAL_OWNER_UID) &&
    id===process.env.EDO_PERSONAL_OWNER_UID;
  return {id,admin,staff,personal};
}
type BridgeKind="business"|"personal";
function bridgeConfig(kind:BridgeKind) {
  const url=kind==="personal"
    ?process.env.EDO_PRIVATE_BRIDGE_URL
    :process.env.EDO_BRIDGE_URL;
  const token=kind==="personal"
    ?process.env.EDO_PRIVATE_BRIDGE_TOKEN
    :process.env.EDO_BRIDGE_TOKEN;
  if (!url || !token || token.length < 32) throw new Error("Bridge not configured: "+kind);
  const u=new URL(url);
  const localTest=process.env.NODE_ENV!=="production" &&
    u.protocol==="http:" && ["127.0.0.1","localhost"].includes(u.hostname);
  if (u.protocol!=="https:" && !localTest) throw new Error("Secure HTTPS bridge URL required");
  if (u.username || u.password || u.search || u.hash) throw new Error("Invalid bridge URL");
  u.pathname="/v1/command";
  return {url:u.toString(),token};
}
async function bridge(kind:BridgeKind,action:Action,args:Record<string,unknown>) {
  const target=bridgeConfig(kind);
  const response=await fetch(target.url,{
    method:"POST",
    headers:{"Content-Type":"application/json","X-EDO-Bridge-Token":target.token},
    body:JSON.stringify({action,args}),
    signal:AbortSignal.timeout(25000)
  });
  const json=await response.json() as {ok?:boolean,result?:unknown,error?:string};
  if (!response.ok || json.ok!==true) {
    throw new Error(String(json.error || "Bridge HTTP "+response.status).slice(0,500));
  }
  return json.result;
}
export const Route=createFileRoute("/api/admin/edoreczenia")({
  server:{
    handlers:{
      POST:async({request})=>{
        let identity:Identity|null;
        try {identity=await authenticate(request);}
        catch {return output({ok:false,error:"Błąd weryfikacji uprawnień"},503);}
        if (!identity) return output({ok:false,error:"Brak uprawnień administratora/operatora"},403);
        try {
          const raw=await request.text();
          if (raw.length>262144) return output({ok:false,error:"Payload zbyt duży"},413);
          const body=JSON.parse(raw) as {action?:Action,args?:Record<string,unknown>};
          if (!body || !body.action || !actions.has(body.action) ||
              body.args && (typeof body.args!=="object" || Array.isArray(body.args)))
            return output({ok:false,error:"Nieznana operacja"},400);
          const args=body.args ?? {};
          if (body.action==="list_mailboxes") {
            const business=await bridge("business","list_mailboxes",{});
            let boxes=(business as {boxes?:Array<{id:string}>}).boxes ?? [];
            boxes=boxes.filter((box)=>["financeyou","fundacja"].includes(box.id));
            if (identity.personal) {
              try {
                const priv=await bridge("personal","list_mailboxes",{});
                boxes.push(...((priv as {boxes?:Array<{id:string}>}).boxes ?? [])
                  .filter((box)=>box.id==="personal"));
              } catch { /* personal integration may not be connected yet */ }
            }
            return output({ok:true,result:{boxes}});
          }
          const boxId=args.boxId;
          if (typeof boxId!=="string" || !["financeyou","fundacja","personal"].includes(boxId))
            return output({ok:false,error:"Nieprawidłowa skrzynka"},400);
          if (boxId==="personal" && !identity.personal)
            return output({ok:false,error:"Prywatna korespondencja: odmowa dostępu"},403);
          if (body.action==="read_message" && args.ackLegalEffect!==true)
            return output({ok:false,error:"Wymagane wyraźne potwierdzenie odczytu"},400);
          if (body.action==="send_approved" && !identity.admin)
            return output({ok:false,error:"Wysyłka wymaga roli administrator"},403);
          const result=await bridge(boxId==="personal"?"personal":"business",body.action,args);
          return output({ok:true,result});
        } catch(e) {
          // Never log the user message, bearer credentials, AES keys or submitted payload.
          const message=e instanceof Error?e.message:"Błąd połączenia z e-Doręczeniami";
          return output({ok:false,error:message.slice(0,500)},503);
        }
      }
    }
  }
});
