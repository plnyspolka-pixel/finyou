import { useEffect,useMemo,useState,type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell } from "@/components/marketing/shell";
import { acceptStoreLegalDocuments } from "@/lib/storefront/legal.functions";
import { startStoreCheckout,getMyStoreOrder } from "@/lib/storefront/orders.functions";
import { getPublicStoreCatalog } from "@/lib/storefront/catalog.functions";
type Line={kind:"lesson"|"document"|"course";id:string};
const parseItems=(s:string):Line[]=>s.split(",").slice(0,50).flatMap(p=>{
  const [kind,id]=p.split(":");
  if((kind==="lesson"||kind==="document"||kind==="course")&&id&&id.length<90)
    return [{kind,id}] as Line[];
  return [];
});
export const Route=createFileRoute("/sklep/zamowienie")({
  validateSearch:(s:Record<string,unknown>)=>({
    items:typeof s.items==="string"?s.items.slice(0,5000):"",
    order:typeof s.order==="string"?s.order.slice(0,40):"",
    tpay:typeof s.tpay==="string"?s.tpay.slice(0,20):"",
  }),
  component:CheckoutPage,
});
function CheckoutPage(){
  const search=Route.useSearch();
  const accept=useServerFn(acceptStoreLegalDocuments);
  const checkout=useServerFn(startStoreCheckout);
  const getOrder=useServerFn(getMyStoreOrder);
  const fetchCatalog=useServerFn(getPublicStoreCatalog);
  const [status,setStatus]=useState<string|null>(null);
  const [buyerType,setBuyerType]=useState<"person"|"company">("person");
  const [buyerName,setBuyerName]=useState("");
  const [buyerEmail,setBuyerEmail]=useState("");
  const [buyerNip,setBuyerNip]=useState("");
  const [buyerStreet,setBuyerStreet]=useState("");
  const [buyerPostalCode,setBuyerPostalCode]=useState("");
  const [buyerCity,setBuyerCity]=useState("");
  const [terms,setTerms]=useState(false);
  const [dpa,setDpa]=useState(false);
  const [authority,setAuthority]=useState(false);
  const [immediate,setImmediate]=useState(false);
  const [processing,setProcessing]=useState(false);
  const [error,setError]=useState("");
  const [catalog,setCatalog]=useState<Awaited<ReturnType<typeof getPublicStoreCatalog>>|null>(null);
  const items=useMemo(()=>parseItems(search.items),[search.items]);
  const hasDocuments=items.some(i=>i.kind==="document");
  const labels=items.map(i=>{
    if(i.kind==="course")return "Akademia Inwestora — pełny program · 1 990 zł";
    const v=i.kind==="lesson"?catalog?.lessons.find(l=>l.id===i.id):catalog?.documents.find(d=>d.id===i.id);
    return v?(("title"in v?v.title:"Produkt")+" · "+(i.kind==="lesson"?"149 zł":"199 zł")):i.kind+" · "+i.id;
  });
  useEffect(()=>{
    let active=true;
    fetchCatalog().then(v=>{if(active)setCatalog(v)}).catch(()=>{});
    supabase.auth.getUser().then(({data})=>{
      if(active) setStatus(data.user?"logged":"guest");
      if(active&&data.user?.email)setBuyerEmail(data.user.email);
    }).catch(()=>{if(active)setStatus("guest")});
    if(search.order)getOrder({data:{orderId:search.order}}).then(o=>{
      if(active)setStatus(o?.status??"not_found");
    }).catch(()=>{if(active)setStatus("error")});
    return()=>{active=false};
  },[search.order,fetchCatalog,getOrder]);
  async function submit(e:FormEvent){
    e.preventDefault();setError("");
    if(!terms||!immediate||(hasDocuments&&(!dpa||!authority))) {
      setError("Zaznacz obowiązkowe oświadczenia dla wybranego zakupu.");return;
    }
    setProcessing(true);
    try{
      await accept({data:{
        codes:hasDocuments?["store_terms","store_dpa"]:["store_terms"],
        termsConfirmed:terms,dpaConfirmed:dpa,controllerAuthority:authority,
      }});
      const result=await checkout({data:{
        items,immediateDigitalDelivery:true,buyer:{
          buyerType,buyerName,buyerEmail,buyerNip:buyerNip||null,
          buyerStreet,buyerPostalCode,buyerCity,buyerCountry:"PL",
        },
      }});
      if(!result.ok){setError(result.error);return;}
      window.location.href=result.paymentUrl;
    }catch(e){setError(e instanceof Error?e.message:"Nie można rozpocząć zamówienia.")}
    finally{setProcessing(false)}
  }
  return <MarketingShell page="sklep">
    <main className="mx-auto max-w-3xl px-4 py-12">
      <a className="text-sm underline" href="/sklep">← Wróć do sklepu</a>
      <h1 className="mt-5 text-3xl font-extrabold">Zamówienie produktów cyfrowych</h1>
      {search.order?<section className="mt-7 rounded-xl border p-5">
        <h2 className="font-bold text-lg">Status płatności</h2>
        <p className="mt-2">{status==="paid"?"Płatność potwierdzona przez serwer, dostęp został nadany.":status==="pending"?"Płatność jest weryfikowana. Odśwież za chwilę.":status==="failed"?"Płatność nie powiodła się.":status==="review"?"Płatność wymaga sprawdzenia przez obsługę.":status==="not_found"?"Nie znaleziono zamówienia na Twoim koncie.":status===null?"Sprawdzanie statusu…":"Status zamówienia: "+status}</p>
        {status==="paid"&&<a href="/sklep/zakupy" className="mt-3 inline-block font-bold underline">Przejdź do moich zakupów</a>}
      </section>:<>
        {status==="guest"?<div className="mt-7 rounded-xl border p-5">Zakup i historia dokumentów wymagają konta inwestora. <a className="font-bold underline" href={"/logowanie?next="+encodeURIComponent("/sklep/zamowienie?items="+encodeURIComponent(search.items))}>Zaloguj się</a> albo <a href="/rejestracja?role=inwestor" className="underline">zarejestruj</a>.</div>:
        status==="logged"?<form className="mt-7 space-y-5" onSubmit={submit}>
          <section className="rounded-xl border p-5"><h2 className="text-lg font-bold">Produkty w zamówieniu</h2><ul className="mt-3 list-disc pl-5 text-sm space-y-1">{labels.map((l,i)=><li key={i}>{l}</li>)}</ul></section>
          <section className="rounded-xl border p-5 space-y-3"><h2 className="text-lg font-bold">Dane nabywcy</h2>
            <label className="block text-sm">Typ nabywcy<select className="mt-1 block w-full rounded border p-3 bg-card" value={buyerType} onChange={e=>setBuyerType(e.target.value as "person"|"company")}><option value="person">Osoba fizyczna</option><option value="company">Firma</option></select></label>
            {([["Imię i nazwisko / nazwa",buyerName,setBuyerName],["Adres e-mail",buyerEmail,setBuyerEmail],["Ulica, numer",buyerStreet,setBuyerStreet],["Kod pocztowy",buyerPostalCode,setBuyerPostalCode],["Miejscowość",buyerCity,setBuyerCity]] as const).map(([label,value,setValue],i)=><label className="block text-sm" key={label}>{label}<input className="mt-1 block w-full rounded border p-3 bg-card" type={i===1?"email":"text"} value={value} onChange={e=>setValue(e.target.value)} required maxLength={i===1?255:300}/></label>)}
            {buyerType==="company"&&<label className="block text-sm">NIP<input className="mt-1 block w-full rounded border p-3 bg-card" value={buyerNip} onChange={e=>setBuyerNip(e.target.value)} required/></label>}
          </section>
          <section className="rounded-xl border p-5 space-y-3"><h2 className="text-lg font-bold">Dokumenty i oświadczenia</h2>
            <p className="text-sm">Przed zamówieniem przeczytaj <a className="underline font-semibold" href="/sklep/zgody" target="_blank" rel="noopener noreferrer">regulamin sklepu i umowę powierzenia</a>. Akceptacje zapiszą się elektronicznie przy rozpoczęciu zamówienia.</p>
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={terms} onChange={e=>setTerms(e.target.checked)}/><span>Zapoznałem się z pełnym regulaminem sklepu i akceptuję jego postanowienia.</span></label>
            {hasDocuments&&<><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={authority} onChange={e=>setAuthority(e.target.checked)}/><span>Jestem administratorem powierzanych danych lub mam uprawnienie do zawarcia umowy w jego imieniu.</span></label>
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={dpa} onChange={e=>setDpa(e.target.checked)}/><span>Akceptuję umowę powierzenia danych osobowych Finance You.</span></label></>}
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={immediate} onChange={e=>setImmediate(e.target.checked)}/><span>Wyraźnie żądam rozpoczęcia dostarczania wybranych treści cyfrowych przed upływem terminu do odstąpienia i przyjmuję do wiadomości ustawowe skutki rozpoczęcia i spełnienia świadczenia. Wiem, że nie tracę praw z tytułu niezgodności produktu z umową.</span></label>
            <p className="text-xs text-muted-foreground">Nie wymagamy zgody na marketing. Przetwarzanie danych opisuje <a className="underline" href="/polityka-prywatnosci">Polityka prywatności</a>.</p>
          </section>
          {error&&<p role="alert" className="rounded-lg border border-red-500/40 p-3 text-red-400">{error}</p>}
          <button type="submit" disabled={processing||items.length===0} className="w-full rounded-xl bg-amber-300 px-6 py-4 font-bold text-slate-900 disabled:opacity-60">{processing?"Przygotowanie zamówienia…":"Zamawiam i płacę przez Tpay"}</button>
          <p className="text-xs text-muted-foreground">Automatyczne płatności jednostkowe wymagają aktywacji właściwego konta sprzedawcy oraz ostatecznego rozliczenia podatkowego; przed aktywacją system nie pobierze opłaty.</p>
        </form>:<p className="mt-7">Sprawdzanie konta…</p>}
      </>}
    </main>
  </MarketingShell>;
}
