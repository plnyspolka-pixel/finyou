import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { MarketingShell } from "@/components/marketing/shell";
import {
  createWindykatorDraft, getWindykatorSaleStatus, getWindykatorKyc, startWindykatorKyc,
  createWindykatorCheckout, getWindykatorOrder, prepareWindykatorPackage
} from "@/lib/windykator-startowy/orders.functions";

const search=z.object({caseId:z.string().optional(),tpay:z.string().optional(),didit:z.string().optional()});
export const Route=createFileRoute("/windykator-ai")({
  validateSearch:(x)=>search.parse(x),
  head:()=>({meta:[
    {title:"Windykator AI — analiza długu i pakiet dokumentów za 50 zł | Finance You"},
    {name:"description",content:"Zleć automatyczną analizę faktury lub umowy. Pakiet Startowy za 50 zł, a następnie odrębna kwalifikacja do bezpłatnej obsługi polubownej."}
  ],links:[{rel:"canonical",href:"https://financeyou.pl/windykator-ai"}]}),
  component:WindykatorPage,
});
const field="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-900 focus:ring-2 focus:ring-amber-500";
const label="block text-sm font-semibold text-slate-800 mb-2";
const section="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7";
const initial={
  creditorKind:"person" as "person"|"business"|"company",
  creditorName:"",creditorNip:"",creditorEmail:"",
  debtorName:"",claimKind:"invoice" as "invoice"|"loan"|"other",
  claimAmount:"",dueDate:"",description:"",
};
function WindykatorPage(){
  const query=Route.useSearch();
  const draftFn=useServerFn(createWindykatorDraft);
  const saleFn=useServerFn(getWindykatorSaleStatus);
  const kycFn=useServerFn(getWindykatorKyc);
  const startKycFn=useServerFn(startWindykatorKyc);
  const payFn=useServerFn(createWindykatorCheckout);
  const getFn=useServerFn(getWindykatorOrder);
  const prepareFn=useServerFn(prepareWindykatorPackage);
  const [saleEnabled,setSaleEnabled]=useState(false);
  const [saleChecked,setSaleChecked]=useState(false);
  const [f,setF]=useState(initial);
  const [file,setFile]=useState<File|null>(null);
  const [confirm,setConfirm]=useState({representation:false,balance:false,terms:false,privacy:false,earlyStart:false,withdrawalNotice:false});
  const [caseId,setCaseId]=useState<string|null>(query.caseId??null);
  const [kyc,setKyc]=useState<{verified:boolean,status:string,url:string|null}|null>(null);
  const [order,setOrder]=useState<any>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const set=(key:keyof typeof f,value:string)=>setF(old=>({...old,[key]:value}));
  useEffect(()=>{
    void saleFn().then(r=>{setSaleEnabled(r.enabled);setSaleChecked(true);})
      .catch(()=>setSaleChecked(true));
  },[saleFn]);
  useEffect(()=>{
    if(!caseId && typeof window!=="undefined"){
      const saved=window.sessionStorage.getItem("windykator_case");
      if(saved)setCaseId(saved);
    }
  },[caseId]);
  useEffect(()=>{
    void kycFn().then(setKyc).catch(()=>{});
  },[kycFn]);
  async function reload(id:string){
    const result=await getFn({data:{caseId:id}});
    setOrder(result);
    if("paid" in result && result.paid && result.status==="paid"){
      const prep=await prepareFn({data:{caseId:id}});
      if("error" in prep && prep.error)setError(prep.error);
      const after=await getFn({data:{caseId:id}});
      setOrder(after);
    }
  }
  useEffect(()=>{
    if(caseId)void reload(caseId).catch(()=>setError("Zaloguj się, aby sprawdzić status sprawy."));
  },[caseId]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError("");setNotice("");
    if(!file){setError("Dodaj fakturę lub umowę.");return;}
    if(Object.values(confirm).some(x=>!x)){setError("Potwierdź wymagane oświadczenia.");return;}
    if(file.size>5242880){setError("Maksymalny rozmiar to 5 MB.");return;}
    setBusy(true);
    try{
      const dataUrl=await new Promise<string>((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));
        reader.onerror=()=>reject(new Error("Nie można odczytać pliku."));reader.readAsDataURL(file);
      });
      const r=await draftFn({data:{
        creditorKind:f.creditorKind,creditorName:f.creditorName,
        creditorNip:f.creditorNip||undefined,creditorEmail:f.creditorEmail,
        debtorName:f.debtorName,claimKind:f.claimKind,claimAmount:Number(f.claimAmount),
        dueDate:f.dueDate,description:f.description,fileName:file.name,
        mime:file.type as "application/pdf"|"image/jpeg"|"image/png"|"image/webp",
        dataUrl,consents:{
          representation:true,balance:true,terms:true,privacy:true,
          earlyStart:true,withdrawalNotice:true
        }
      }});
      if("error" in r && r.error)throw Error(r.error);
      if("caseId" in r && r.caseId){
        window.sessionStorage.setItem("windykator_case",r.caseId);
        setCaseId(r.caseId);setNotice("Zgłoszenie zapisane prywatnie. Następny krok: weryfikacja tożsamości i płatność.");
      }
    }catch(e){setError(e instanceof Error?e.message:"Nie udało się przyjąć zgłoszenia. Zaloguj się i spróbuj ponownie.");}
    finally{setBusy(false);}
  }
  async function startIdentity(){
    setBusy(true);setError("");
    try{const r=await startKycFn();if("error" in r && r.error)throw Error(r.error);
      if("verified" in r && r.verified){setKyc({verified:true,status:"Approved",url:null});setNotice("Tożsamość potwierdzona.");}
      else if("url" in r && r.url)window.location.assign(r.url);
    }catch(e){setError(e instanceof Error?e.message:"Błąd weryfikacji.");}
    finally{setBusy(false);}
  }
  async function pay(){
    if(!caseId)return;
    setBusy(true);setError("");
    try{const r=await payFn({data:{caseId}});if("error" in r && r.error)throw Error(r.error);
      if("paymentUrl" in r && r.paymentUrl)window.location.assign(r.paymentUrl);
    }catch(e){setError(e instanceof Error?e.message:"Błąd płatności.");}
    finally{setBusy(false);}
  }
  return <MarketingShell page="sklep">
    <section className="fy-hero" style={{color:"#fff"}}>
      <div aria-hidden className="fy-hero-fx"/>
      <div className="relative mx-auto max-w-5xl px-5 py-16 md:py-20">
        <div className="text-sm font-extrabold uppercase tracking-widest text-amber-300">Finance You · Windykator AI</div>
        <h1 className="mt-4 text-4xl font-black leading-tight md:text-6xl">
          Niezapłacona faktura lub umowa?<br/><span className="text-amber-300">Zacznij od dokumentów.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-slate-200">
          Jednorazowy Pakiet Startowy: analiza dokumentu, raport roszczenia, projekt wezwania do zapłaty
          i wstępny szkic EPU, jeżeli roszczenie się kwalifikuje.
        </p>
        <div className="mt-7 inline-flex items-center gap-4 rounded-2xl border border-amber-400/40 bg-slate-900/70 p-5">
          <strong className="text-4xl font-black text-amber-300">50 zł</strong>
          <span className="max-w-xs text-sm text-slate-200">brutto · jednorazowo · za analizę jednej sprawy</span>
        </div>
      </div>
    </section>
    <main className="mx-auto grid max-w-6xl gap-7 px-4 py-12 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <section className={section}>
          <h2 className="text-2xl font-extrabold text-slate-900">1. Zgłoś należność</h2>
          <p className="mt-2 text-sm text-slate-600">
            Dane i dokument przechowujemy w prywatnym repozytorium sprawy. Zlecenie wymaga konta Finance You.
          </p>
          {saleChecked && !saleEnabled && <p className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            Nowy produkt jest przygotowywany do uruchomienia. Do czasu zakończenia weryfikacji prawnej i technicznej nie przyjmujemy dokumentów ani płatności.
          </p>}
          {!caseId ? <form className="mt-6 space-y-4" onSubmit={submit}><fieldset disabled={!saleEnabled} className="space-y-4">
            <div>
              <label className={label} htmlFor="creditorKind">Rodzaj wierzyciela</label>
              <select id="creditorKind" className={field} value={f.creditorKind} onChange={e=>set("creditorKind",e.target.value)}>
                <option value="person">Osoba prywatna</option>
                <option value="business">Jednoosobowa działalność</option>
                <option value="company">Spółka / inny podmiot</option>
              </select>
              {f.creditorKind!=="person"&&<p className="mt-2 text-xs text-amber-800">Weryfikacja reprezentacji podmiotów wymaga dodatkowego etapu. Nie pobierzemy płatności przed jego uruchomieniem.</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={label} htmlFor="creditorName">Imię i nazwisko lub firma wierzyciela</label>
                <input id="creditorName" className={field} required minLength={5} value={f.creditorName} onChange={e=>set("creditorName",e.target.value)}/></div>
              <div><label className={label} htmlFor="creditorEmail">E-mail wierzyciela</label>
                <input id="creditorEmail" className={field} type="email" required value={f.creditorEmail} onChange={e=>set("creditorEmail",e.target.value)}/></div>
              {f.creditorKind!=="person"&&<div><label className={label} htmlFor="creditorNip">NIP</label>
                <input id="creditorNip" className={field} value={f.creditorNip} onChange={e=>set("creditorNip",e.target.value)}/></div>}
              <div><label className={label} htmlFor="debtorName">Dłużnik — imię i nazwisko / firma</label>
                <input id="debtorName" className={field} required minLength={4} value={f.debtorName} onChange={e=>set("debtorName",e.target.value)}/></div>
              <div><label className={label} htmlFor="claimKind">Podstawa</label>
                <select id="claimKind" className={field} value={f.claimKind} onChange={e=>set("claimKind",e.target.value)}>
                  <option value="invoice">Faktura</option><option value="loan">Umowa pożyczki</option><option value="other">Inna umowa</option>
                </select></div>
              <div><label className={label} htmlFor="amount">Zaległa kwota (PLN)</label>
                <input id="amount" className={field} type="number" min="1" step="0.01" required value={f.claimAmount} onChange={e=>set("claimAmount",e.target.value)}/></div>
              <div><label className={label} htmlFor="due">Termin wymagalności</label>
                <input id="due" className={field} type="date" required value={f.dueDate} onChange={e=>set("dueDate",e.target.value)}/></div>
            </div>
            <div><label className={label} htmlFor="description">Krótki opis sprawy (opcjonalnie)</label>
              <textarea id="description" className={field} rows={3} value={f.description} onChange={e=>set("description",e.target.value)}/></div>
            <div><label className={label} htmlFor="document">Dokument źródłowy — PDF/JPG/PNG/WebP, do 5 MB</label>
              <input id="document" type="file" className={field} accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*" required
                onChange={e=>setFile(e.target.files?.[0]??null)}/></div>
            <div className="space-y-3 rounded-xl bg-slate-50 p-4">
              {([
                ["representation","Oświadczam, że jestem wierzycielem albo działam na podstawie ważnego umocowania."],
                ["balance","Potwierdzam aktualność kwoty oraz zobowiązuję się zgłosić wpłaty, spory i inne zmiany."],
                ["terms","Akceptuję warunki Pakietu Startowego i rozdzielenie go od osobnej obsługi polubownej."],
                ["privacy","Zapoznałem/am się z polityką prywatności i informacją o przetwarzaniu danych oraz analizie AI."],
                ["earlyStart","Wyraźnie żądam wykonania odpłatnego Pakietu Startowego przed upływem 14 dni."],
                ["withdrawalNotice","Wiem, że po pełnym wykonaniu odpłatnej usługi, na warunkach ustawy, utracę prawo odstąpienia; wcześniej obowiązują ustawowe zasady rozliczenia."]
              ] as const).map(([id,text])=><label key={id} className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
                <input type="checkbox" className="mt-1" checked={confirm[id]}
                  onChange={e=>setConfirm(old=>({...old,[id]:e.target.checked}))}/>
                <span>{text}</span></label>)}
              <p className="text-xs text-slate-600">Przeczytaj <a href="/regulamin-windykator-ai" className="underline">warunki Pakietu Startowego</a> i <a href="/polityka-prywatnosci" className="underline">politykę prywatności</a>. Potwierdzenie nie pozbawia konsumenta praw sprzecznie z ustawą. Usługa jest w pełni wykonana dopiero po faktycznym dostarczeniu rezultatów.</p>
            </div>
            <button type="submit" disabled={busy} className="w-full rounded-xl bg-amber-400 px-6 py-4 font-extrabold text-slate-950 disabled:opacity-60">
              {busy?"Zapisywanie…":"Zapisz zgłoszenie i przejdź do weryfikacji"}
            </button>
            <p className="text-xs text-slate-500">Bez opłaty na tym etapie. <a className="underline" href="/logowanie">Zaloguj się</a> lub <a className="underline" href="/rejestracja">załóż konto</a>.</p>
          </fieldset></form> : <div className="mt-6 space-y-4">
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-800">
              Numer zgłoszenia: <strong className="break-all">{caseId}</strong><br/>
              {order?.status==="checkout_pending"?"Oczekiwanie na potwierdzenie Tpay":order?.status==="paid"?"Płatność potwierdzona — gotowe do analizy":order?.status==="analysis_ready"?"Pakiet wykonany":order?.status==="review_required"?"Pakiet wymaga weryfikacji": "Dokument zapisany"}
            </div>
            {!order?.paid && <div>
              <h3 className="font-bold text-slate-900">2. Potwierdź tożsamość i uruchom zakup</h3>
              <p className="my-2 text-sm text-slate-600">Weryfikacja Didit jest jednorazowa. Sprawy firmowe wymagają również potwierdzenia reprezentacji.</p>
              {kyc?.verified ? <p className="my-3 font-semibold text-emerald-700">Tożsamość zweryfikowana</p> :
                <button type="button" disabled={busy} onClick={startIdentity} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-900">Zweryfikuj tożsamość</button>}
              <button type="button" disabled={busy||!kyc?.verified} onClick={pay}
                className="mt-3 block w-full rounded-xl bg-amber-400 px-5 py-4 font-extrabold text-slate-950 disabled:opacity-40">
                Przejdź do Tpay — 50 zł brutto
              </button>
            </div>}
            {order?.paid && <div>
              <button type="button" onClick={()=>void reload(caseId)} disabled={busy}
                className="rounded-xl bg-slate-900 px-6 py-3 font-bold text-white">Odśwież status i analizę</button>
              {order.report&&<div className="mt-4 space-y-4">
                {[["Raport analizy",order.report],["Projekt wezwania",order.notice],["Wstępny szkic EPU",order.epuDraft]].filter(v=>v[1]).map(([title,body])=>
                  <div key={title}><h3 className="font-bold text-slate-900">{title}</h3>
                    <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-xs text-slate-800">{body}</pre>
                    <button type="button" className="mt-2 text-sm font-semibold underline" onClick={()=>navigator.clipboard.writeText(body)}>Kopiuj</button>
                  </div>)}
              </div>}
            </div>}
            <button type="button" className="text-sm text-slate-700 underline" onClick={()=>{
              window.sessionStorage.removeItem("windykator_case");setCaseId(null);setOrder(null);setError("");}}>Rozpocznij nowe zgłoszenie</button>
          </div>}
          {notice&&<p role="status" className="mt-3 text-sm font-semibold text-emerald-700">{notice}</p>}
          {error&&<p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        </section>
      </div>
      <aside className="space-y-6">
        <div className={section}>
          <h2 className="text-xl font-extrabold text-slate-900">Co kupujesz za 50 zł?</h2>
          <ol className="mt-4 list-inside list-decimal space-y-3 text-sm text-slate-700">
            <li>Odczyt i analiza jednego dokumentu</li>
            <li>Raport faktów i braków dowodowych</li>
            <li>Projekt wezwania w imieniu wierzyciela</li>
            <li>Wstępny szkic EPU, gdy sprawa się kwalifikuje</li>
          </ol>
          <p className="mt-4 text-xs text-slate-500">Wynikiem jest pakiet dokumentów, nie wyrok sądu ani gwarancja odzyskania należności.</p>
        </div>
        <div className={section}>
          <h2 className="text-xl font-extrabold text-slate-900">A następnie: 90 dni obsługi</h2>
          <p className="mt-3 text-sm text-slate-700">Planowana osobna, bezpłatna usługa polubowna z e-mailami, SMS-em, agentem głosowym i obsługą odpowiedzi.</p>
          <p className="mt-3 text-xs text-amber-800">Aktywacja komunikacji z dłużnikiem wymaga odrębnej kwalifikacji sprawy i wdrożenia zabezpieczeń. Na tym etapie żadne monity nie są wysyłane automatycznie.</p>
        </div>
        <div className={section}>
          <h2 className="text-xl font-extrabold text-slate-900">Bezpieczeństwo</h2>
          <p className="mt-3 text-sm text-slate-700">Nie dysponujemy informacjami z rachunku bankowego wierzyciela. Deklaracja dłużnika o spłacie nie jest potwierdzeniem wpłaty.</p>
          <a href="/polityka-prywatnosci" className="mt-4 inline-block text-sm underline">Polityka prywatności</a>
        </div>
      </aside>
    </main>
  </MarketingShell>;
}
