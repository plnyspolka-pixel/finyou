import { useEffect,useMemo,useState,type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { extractOrderedFields } from "@/lib/document-fields";
import { getMyStoreLegalState } from "@/lib/storefront/legal.functions";
import { getPurchasedDocDraft, generatePurchasedDocx } from "@/lib/storefront/purchased.functions";
import { MarketingShell } from "@/components/marketing/shell";

export const Route=createFileRoute("/sklep/dokument/$id")({component:PurchasedDocumentPage});
function PurchasedDocumentPage(){
  const {id}=Route.useParams();
  const fetchDraft=useServerFn(getPurchasedDocDraft);
  const fetchLegal=useServerFn(getMyStoreLegalState);
  const generate=useServerFn(generatePurchasedDocx);
  const [draft,setDraft]=useState<Awaited<ReturnType<typeof getPurchasedDocDraft>>|null>(null);
  const [dpa,setDpa]=useState<boolean|null>(null);
  const [values,setValues]=useState<Record<string,string>>({});
  const [fileUrl,setFileUrl]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const fields=useMemo(()=>draft?extractOrderedFields(draft.text):[],[draft]);
  useEffect(()=>{
    let active=true;setDraft(null);setError("");
    Promise.all([fetchDraft({data:{templateId:id}}),fetchLegal()])
      .then(([data,legal])=>{if(active){setDraft(data);setDpa(!!legal.docs.find(d=>d.code==="store_dpa"&&d.accepted))}})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:"Błąd ładowania dokumentu.")});
    return ()=>{active=false};
  },[id,fetchDraft,fetchLegal]);
  async function submit(e:FormEvent){
    e.preventDefault();setError("");setFileUrl(null);setSaving(true);
    try{const result=await generate({data:{templateId:id,values}});setFileUrl(result.url)}
    catch(e){setError(e instanceof Error?e.message:"Nie można wygenerować dokumentu.")}
    finally{setSaving(false)}
  }
  return <MarketingShell page="sklep"><main className="mx-auto max-w-3xl px-4 py-12">
    <a href="/sklep/zakupy" className="text-sm underline">← Moje zakupy</a>
    <h1 className="mt-5 text-3xl font-bold">Generator zakupionego dokumentu</h1>
    <p className="mt-2 text-sm text-muted-foreground">Wprowadź wyłącznie dane niezbędne do dokumentu. Podgląd i plik są udostępniane tylko na Twoim koncie.</p>
    {error&&<p role="alert" className="mt-4 rounded-lg border border-red-500/50 p-3 text-red-400">{error}</p>}
    {dpa===false?<div className="mt-5 rounded-lg border p-5">Przed wpisaniem danych osobowych osób trzecich należy zaakceptować aktualną umowę powierzenia. <a className="underline" href="/sklep/zgody">Przeczytaj i zaakceptuj DPA</a>.</div>:null}
    {draft&&dpa?<form onSubmit={submit} className="mt-7 space-y-5">
      <h2 className="text-xl font-bold">{draft.name}</h2>
      {fields.length===0&&<p>Wzór nie zawiera pól — wygenerujesz dokument w oryginalnym brzmieniu.</p>}
      {fields.map(field=><label key={field.id} className="block">
        <span className="mb-1 block text-sm font-semibold">{field.label||field.key}</span>
        <input autoComplete="off" className="w-full rounded-lg border border-border bg-card p-3"
          value={values[field.id]??""} onChange={e=>setValues(v=>({...v,[field.id]:e.target.value}))}
          placeholder={"["+field.key+"]"} maxLength={2000}/>
      </label>)}
      <button type="submit" disabled={saving} className="w-full rounded-lg bg-amber-300 px-5 py-3 font-bold text-slate-900 disabled:opacity-50">{saving?"Generowanie…":"Wygeneruj dokument DOCX"}</button>
      {fileUrl&&<a href={fileUrl} className="block text-center rounded-lg border p-3 font-bold underline" target="_blank" rel="noopener noreferrer">Pobierz wygenerowany DOCX (link ważny 5 minut)</a>}
    </form>:!error?<p className="mt-5">Sprawdzanie uprawnień i umowy powierzenia…</p>:null}
    <p className="mt-8 text-xs text-muted-foreground">Dokument powstaje na podstawie wzoru; przed podpisaniem zweryfikuj jego treść i zgodność z faktami. Do podpisu stosuj odpowiednią prawnie formę.</p>
  </main></MarketingShell>;
}
