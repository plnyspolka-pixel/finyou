import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Download, FileCheck, ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell } from "@/components/marketing/shell";
import { MktButton } from "@/components/marketing/primitives";
import { acceptStoreLegalDocuments, getMyStoreLegalState, getStoreLegalDocuments } from "@/lib/storefront/legal.functions";

export const Route = createFileRoute("/sklep/zgody")({
  component: StoreLegalPage,
  head:()=>({meta:[{title:"Dokumenty i akceptacje sklepu | Finance You"},{name:"robots",content:"noindex,follow"}]}),
});
type Doc = Awaited<ReturnType<typeof getStoreLegalDocuments>>[number];
function downloadText(d:Doc) {
  const url=URL.createObjectURL(new Blob([d.content],{type:"text/plain;charset=utf-8"}));
  const a=document.createElement("a");
  a.href=url;a.download=(d.code==="store_terms"?"regulamin-sklepu":"powierzenie-danych")+"-"+d.version+".txt";
  a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function StoreLegalPage() {
  const getDocs=useServerFn(getStoreLegalDocuments);
  const getState=useServerFn(getMyStoreLegalState);
  const save=useServerFn(acceptStoreLegalDocuments);
  const [docs,setDocs]=useState<Doc[]>([]);
  const [accepted,setAccepted]=useState<string[]>([]);
  const [loggedIn,setLoggedIn]=useState<boolean|null>(null);
  const [terms,setTerms]=useState(false);
  const [dpa,setDpa]=useState(false);
  const [authority,setAuthority]=useState(false);
  const [controllerName,setControllerName]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  useEffect(()=>{
    let active=true;
    getDocs().then(x=>{if(active)setDocs(x)}).catch(()=>{if(active)setError("Nie można pobrać dokumentów.")});
    supabase.auth.getUser().then(({data})=>{
      if(!active)return;
      setLoggedIn(!!data.user);
      if(data.user)getState().then(x=>{if(active)setAccepted(x.docs.filter(d=>d.accepted).map(d=>d.code))}).catch(()=>{if(active)setError("Nie można odczytać historii akceptacji.")});
    }).catch(()=>{if(active)setLoggedIn(false)});
    return ()=>{active=false};
  },[getDocs,getState]);
  async function accept() {
    setError("");setMessage("");
    const codes:("store_terms"|"store_dpa")[]=[];
    if(terms&&!accepted.includes("store_terms"))codes.push("store_terms");
    if(dpa&&authority&&!accepted.includes("store_dpa"))codes.push("store_dpa");
    if(codes.length===0){setError("Zaznacz wymagane oświadczenia, aby przyjąć dokumenty.");return;}
    setBusy(true);
    try{
      await save({data:{codes,termsConfirmed:terms,dpaConfirmed:dpa,controllerAuthority:authority,controllerName}});
      const next=await getState();
      setAccepted(next.docs.filter(d=>d.accepted).map(d=>d.code));
      setMessage("Akceptacje zapisane na Twoim koncie wraz z pełną wersją dokumentów i datą.");
      setTerms(false);setDpa(false);setAuthority(false);setControllerName("");
    }catch(e){setError(e instanceof Error?e.message:"Nie udało się zapisać akceptacji.")}
    finally{setBusy(false)}
  }
  return <MarketingShell page="sklep">
    <main className="mx-auto max-w-4xl px-4 py-12 text-foreground">
      <a href="/sklep" className="text-sm underline">← Wróć do sklepu</a>
      <h1 className="mt-5 text-3xl font-extrabold">Dokumenty i akceptacje</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Raz zaakceptowana wersja dokumentu zostaje przypisana do Twojego konta. Kolejna akceptacja jest wymagana dopiero po zmianie obowiązującej treści. Sam zakup lekcji nie wymaga umowy powierzenia danych.</p>
      <div className="mt-7 grid gap-5">
        {docs.map(doc=><section key={doc.code} className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-bold text-lg">{doc.title}</h2><p className="text-xs text-muted-foreground">Wersja: {doc.version}</p></div>
            <div className="flex items-center gap-3">
              {accepted.includes(doc.code)?<span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 size={16}/> Zaakceptowano</span>:null}
              <button className="text-sm underline flex items-center gap-1" onClick={()=>downloadText(doc)}><Download size={16}/> Pobierz treść</button>
            </div>
          </div>
          <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Przeczytaj pełną treść dokumentu</summary><pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-4 text-xs leading-relaxed">{doc.content}</pre></details>
        </section>)}
      </div>
      {loggedIn===false?<div className="mt-7 rounded-xl border p-5"><p className="mb-3">Zaloguj się, aby zaakceptować dokumenty i zapisać dowód akceptacji.</p><MktButton variant="gold" href="/logowanie?next=%2Fsklep%2Fzgody">Zaloguj się</MktButton></div>:
      loggedIn===null?<p className="mt-6 flex gap-2"><Loader2 className="animate-spin"/> Sprawdzanie konta…</p>:
      <div className="mt-7 rounded-2xl border border-amber-400/40 p-5">
        <h2 className="font-bold text-lg flex gap-2 items-center"><FileCheck size={20}/> Potwierdź dokumenty elektronicznie</h2>
        {!accepted.includes("store_terms")&&<label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={terms} onChange={e=>setTerms(e.target.checked)}/><span>Zapoznałem się z pełną treścią <strong>regulaminu sklepu</strong> i akceptuję go.</span></label>}
        {!accepted.includes("store_dpa")&&<div className="mt-4 space-y-3 border-t border-border pt-4">
          <label className="block text-sm">Pełna nazwa administratora danych (imię i nazwisko lub firma)<input type="text" className="mt-1 block w-full rounded-lg border border-border bg-card p-3" value={controllerName} maxLength={300} onChange={e=>setControllerName(e.target.value)} placeholder="Imię i nazwisko / firma" required/></label>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={authority} onChange={e=>setAuthority(e.target.checked)}/><span>Potwierdzam, że jestem administratorem powierzanych danych lub mam umocowanie do zawarcia umowy w jego imieniu.</span></label>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={dpa} onChange={e=>setDpa(e.target.checked)}/><span>Zapoznałem się z pełną treścią <strong>umowy powierzenia przetwarzania danych</strong> i akceptuję ją jako administrator danych.</span></label>
        </div>}
        {accepted.includes("store_terms")&&accepted.includes("store_dpa")?<p className="mt-4 flex items-center gap-2 text-emerald-400"><ShieldCheck size={18}/> Aktualne wersje dokumentów zostały zaakceptowane.</p>:
        <button className="mt-5 rounded-lg bg-amber-300 px-5 py-3 font-bold text-slate-900 disabled:opacity-50" disabled={busy || (!terms && !(dpa&&authority&&controllerName.trim()))} onClick={accept}>{busy?"Zapisywanie…":"Akceptuję wybrane dokumenty"}</button>}
        {error&&<p role="alert" className="mt-3 text-red-400">{error}</p>}
        {message&&<p role="status" className="mt-3 text-emerald-400">{message}</p>}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Akceptacja nie oznacza zgody na marketing i nie jest automatyczną podstawą do przetwarzania dowolnych danych osób trzecich. Dla zleceń inwestycyjnych obowiązuje odrębny pipeline weryfikacji i umów.</p>
      </div>}
    </main>
  </MarketingShell>;
}
