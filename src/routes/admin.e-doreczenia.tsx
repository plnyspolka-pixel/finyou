import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileCheck, Inbox, Mail, RefreshCw, Send, ShieldAlert } from "lucide-react";

export const Route=createFileRoute("/admin/e-doreczenia")({
  component:EdoreczeniaPage
});
type Box={id:string;label:string;ade:string;mode:string;configured:boolean};
type Draft={id:string;boxId:string;subject:string;recipients:string[];status:string;hash:string};
type Result={ok:boolean;result?:unknown;error?:string};

const pick=(obj:unknown,key:string):unknown=>
  obj && typeof obj==="object" ? (obj as Record<string,unknown>)[key] : undefined;
const str=(obj:unknown,key:string):string=>{
  const value=pick(obj,key);
  return typeof value==="string"?value:"";
};
function extractItems(raw:unknown):unknown[] {
  if (Array.isArray(raw)) return raw;
  for (const key of ["messages","items","content","data","results"]) {
    const candidate=pick(raw,key);
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}
function EdoreczeniaPage() {
  const {session}=useAuth();
  const [boxes,setBoxes]=useState<Box[]>([]);
  const [boxId,setBoxId]=useState("");
  const [tab,setTab]=useState<"INBOX"|"SENT"|"drafts">("INBOX");
  const [list,setList]=useState<unknown>(null);
  const [detail,setDetail]=useState<unknown>(null);
  const [drafts,setDrafts]=useState<Draft[]>([]);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [loading,setLoading]=useState(false);
  const [recipient,setRecipient]=useState("");
  const [subject,setSubject]=useState("");
  const [bodyText,setBodyText]=useState("");
  const [uaPayload,setUaPayload]=useState("");
  const [showComposer,setShowComposer]=useState(false);

  const request=useCallback(async (action:string,args:Record<string,unknown>={})=>{
    const token=session?.access_token;
    if (!token) throw new Error("Zaloguj się na prawdziwe konto administratora (podgląd nie daje dostępu).");
    const response=await fetch("/api/admin/edoreczenia",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
      body:JSON.stringify({action,args})
    });
    const json=await response.json() as Result;
    if (!response.ok || json.ok!==true)
      throw new Error(json.error||"Nie udało się połączyć z e-Doręczeniami.");
    return json.result;
  },[session?.access_token]);

  useEffect(()=>{
    if (!session?.access_token) return;
    let cancelled=false;
    request("list_mailboxes").then((value)=>{
      if (cancelled) return;
      const all=(pick(value,"boxes")??[]) as Box[];
      setBoxes(all);
      setBoxId((prev)=>prev&&all.some(b=>b.id===prev)?prev:all[0]?.id??"");
    }).catch((e)=>{
      if (!cancelled) setError(e instanceof Error?e.message:"Błąd pobierania skrzynek.");
    });
    return ()=>{cancelled=true;};
  },[request,session?.access_token]);

  const refresh=useCallback(async()=>{
    if (!boxId) return;
    setError("");setNotice("");setDetail(null);setLoading(true);
    try {
      if (tab==="drafts") {
        setDrafts(await request("list_drafts",{boxId}) as Draft[]);
      } else {
        setList(await request("list_messages",{boxId,label:tab}));
      }
    } catch(e) {
      setError(e instanceof Error?e.message:"Błąd pobierania.");
    } finally {setLoading(false);}
  },[request,boxId,tab]);
  useEffect(()=>{void refresh();},[refresh]);

  const selected=boxes.find(b=>b.id===boxId);
  const items=useMemo(()=>extractItems(list),[list]);
  async function read(messageId:string) {
    if (!window.confirm("Otworzenie pisma w e-Doręczeniach może wywołać skutek prawny doręczenia. Czy świadomie potwierdzasz odczyt tej konkretnej wiadomości?"))
      return;
    setLoading(true);setError("");
    try {setDetail(await request("read_message",{boxId,messageId,ackLegalEffect:true}));}
    catch(e){setError(e instanceof Error?e.message:"Błąd odczytu wiadomości.");}
    finally{setLoading(false);}
  }
  async function showEvidences(messageId:string) {
    setLoading(true);setError("");
    try {setDetail(await request("evidences",{boxId,messageId}));}
    catch(e){setError(e instanceof Error?e.message:"Błąd pobierania dowodów.");}
    finally{setLoading(false);}
  }
  async function saveDraft(){
    setError("");setNotice("");setLoading(true);
    try{
      const recipients=recipient.split(/[,\n;]/).map(x=>x.trim()).filter(Boolean);
      const parsed=uaPayload.trim()?JSON.parse(uaPayload):undefined;
      const result=await request("create_draft",{
        boxId,recipients,subject,text:bodyText,...(parsed?{uaPayload:parsed}:{})
      });
      setNotice("Projekt zapisany. NIE został wysłany. Do nadania wymagane jest odrębne zatwierdzenie.");
      setDetail(result);
      setShowComposer(false);setTab("drafts");
      setRecipient("");setSubject("");setBodyText("");setUaPayload("");
    }catch(e){setError(e instanceof Error?e.message:"Błąd projektu.");}
    finally{setLoading(false);}
  }
  async function send(draftId:string){
    if(!window.confirm("Wysyłka uruchomi nadanie przez e-Doręczenia. Czy potwierdzasz wysłanie WCZEŚNIEJ niezależnie zatwierdzonego projektu?"))
      return;
    setLoading(true);setError("");
    try {
      const result=await request("send_approved",{boxId,draftId});
      setDetail(result);
      setNotice("Zgłoszono zadanie nadania. Sprawdź status zadania i dowody doręczenia.");
      void refresh();
    }catch(e){setError(e instanceof Error?e.message:"Wysłanie nie zostało potwierdzone.");}
    finally{setLoading(false);}
  }
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">e-Doręczenia</h1>
          <p className="text-sm text-muted-foreground">Finance You, Fundacja i osobista skrzynka — wyłącznie z oddzielnymi uprawnieniami</p>
        </div>
        <Button variant="outline" onClick={()=>void refresh()} disabled={loading||!boxId}>
          <RefreshCw className="mr-2 h-4 w-4"/>{loading?"Praca…":"Odśwież"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {boxes.map((box)=>(
          <Button key={box.id} variant={boxId===box.id?"default":"outline"}
            onClick={()=>{setBoxId(box.id);setDetail(null);}}>
            <Mail className="mr-2 h-4 w-4"/>{box.label}
            {!box.configured&&<span className="ml-2 text-xs opacity-70">(brak autoryzacji)</span>}
          </Button>
        ))}
      </div>
      {selected&&<div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{selected.ade}</span><Badge variant="outline">{selected.mode==="delegated_token"?"Prywatna / delegowana":"S2S / certyfikat"}</Badge>
      </div>}
      {boxes.length===0&&!error&&<Card className="p-5 text-sm text-muted-foreground">
        Nie ma połączonych skrzynek. Wymagane jest skonfigurowanie serwera e-Doręczeń i uprawnień ADE.
      </Card>}
      {error&&<Card className="border-destructive p-4 text-sm text-destructive"><ShieldAlert className="mr-2 inline h-4 w-4"/>{error}</Card>}
      {notice&&<Card className="p-4 text-sm">{notice}</Card>}
      <div className="flex flex-wrap gap-2">
        <Button variant={tab==="INBOX"?"default":"outline"} onClick={()=>setTab("INBOX")}><Inbox className="mr-2 h-4 w-4"/>Odebrane</Button>
        <Button variant={tab==="SENT"?"default":"outline"} onClick={()=>setTab("SENT")}><Send className="mr-2 h-4 w-4"/>Wysłane</Button>
        <Button variant={tab==="drafts"?"default":"outline"} onClick={()=>setTab("drafts")}><FileCheck className="mr-2 h-4 w-4"/>Projekty</Button>
        <Button variant="outline" onClick={()=>setShowComposer(v=>!v)}>Nowe pismo</Button>
      </div>
      {showComposer&&<Card className="space-y-3 p-5">
        <h2 className="font-medium">Nowy projekt (bez wysyłki)</h2>
        <Input placeholder="ADE odbiorcy (lub kilka oddzielonych przecinkami)" value={recipient} onChange={e=>setRecipient(e.target.value)}/>
        <Input placeholder="Temat" value={subject} onChange={e=>setSubject(e.target.value)}/>
        <Textarea placeholder="Treść pisma" rows={7} value={bodyText} onChange={e=>setBodyText(e.target.value)}/>
        <details><summary className="cursor-pointer text-sm text-muted-foreground">Zaawansowane: payload UA API v3 (JSON, opcjonalnie)</summary>
          <Textarea className="mt-2 font-mono text-xs" rows={5} value={uaPayload}
            onChange={e=>setUaPayload(e.target.value)} placeholder="Dopiero zweryfikowany schemat UA API umożliwi późniejszą wysyłkę"/>
        </details>
        <Button disabled={loading||!boxId} onClick={()=>void saveDraft()}>Zapisz projekt</Button>
      </Card>}
      <Card className="p-4">
        {tab==="drafts" ? (
          drafts.length===0 ? <p className="text-sm text-muted-foreground">Brak projektów.</p> :
          <div className="space-y-2">{drafts.map(d=><div key={d.id} className="flex flex-wrap justify-between gap-2 border-b p-2">
            <div><p className="font-medium">{d.subject}</p>
              <p className="text-xs text-muted-foreground">{d.recipients.join(", ")} · {d.id}</p>
              <Badge variant="outline">{d.status}</Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={()=>void request("get_draft",{boxId,draftId:d.id}).then(setDetail).catch(e=>setError(String(e)))}>Podgląd</Button>
              {d.status==="approved"&&<Button size="sm" onClick={()=>void send(d.id)}>Wyślij zatwierdzony</Button>}
            </div>
          </div>)}</div>
        ) : (
          items.length>0 ? <div className="space-y-2">{items.map((m,i)=>{
            const msgId=str(m,"messageId")||str(m,"id")||str(pick(m,"message"),"id");
            const title=str(m,"subject")||str(pick(m,"metadata"),"subject")||"Pismo";
            return <div key={msgId||i} className="flex flex-wrap items-center justify-between gap-3 border-b px-2 py-3">
              <div className="min-w-0">
                <p className="font-medium">{title}</p>
                <p className="max-w-xl truncate text-xs text-muted-foreground">{msgId||"Brak identyfikatora w odpowiedzi API"}</p>
              </div>
              {msgId&&<div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={()=>void showEvidences(msgId)}>Dowody</Button>
                <Button size="sm" onClick={()=>void read(msgId)}>Odbierz i czytaj</Button>
              </div>}
            </div>;
          })}</div> :
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Brak pozycji listy lub operator zwrócił inny format odpowiedzi.</p>
            {list!==null&&<pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(list,null,2)}</pre>}
          </div>
        )}
      </Card>
      {detail!==null&&<Card className="space-y-2 p-4">
        <h2 className="font-semibold">Szczegóły / odpowiedź operatora</h2>
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(detail,null,2)}</pre>
      </Card>}
      <p className="text-xs text-muted-foreground">Otworzenie wiadomości może wywołać skutek doręczenia. Wysłanie zadania nie oznacza jeszcze uzyskania dowodu doręczenia.</p>
    </div>
  );
}
