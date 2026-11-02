import { useEffect,useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getMyStoreOrders } from "@/lib/storefront/orders.functions";
import { MarketingShell } from "@/components/marketing/shell";
export const Route=createFileRoute("/sklep/zakupy")({component:Purchases});
function Purchases(){
  const fn=useServerFn(getMyStoreOrders);
  const [state,setState]=useState<Awaited<ReturnType<typeof getMyStoreOrders>>|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{let ok=true;fn().then(v=>{if(ok)setState(v)}).catch(e=>{if(ok)setError(e instanceof Error?e.message:"Błąd odczytu")});return()=>{ok=false}},[fn]);
  return <MarketingShell page="sklep"><main className="mx-auto max-w-4xl px-4 py-12">
    <a href="/sklep" className="text-sm underline">← Sklep</a><h1 className="mt-5 text-3xl font-bold">Moje zakupy</h1>
    {error&&<p role="alert" className="mt-5 text-red-400">{error} · <a className="underline" href="/logowanie?next=%2Fsklep%2Fzakupy">Zaloguj się</a></p>}
    {!state&&!error&&<p className="mt-5">Wczytywanie zakupów…</p>}
    {state&&<><h2 className="mt-8 text-lg font-bold">Odblokowane produkty</h2>
      {state.entitlements.length===0?<p className="mt-3 text-sm">Nie masz jeszcze odblokowanych produktów jednostkowych.</p>:
        <ul className="mt-3 space-y-2">{state.entitlements.map(e=><li key={e.item_kind+e.item_id} className="rounded-lg border p-3">
          <span className="mr-3 text-sm">{e.item_kind==="lesson"?"Lekcja":e.item_kind==="document"?"Dokument":e.item_kind==="course"?"Akademia":"Raport KW"} — {e.item_id}</span>
          {e.item_kind==="lesson"&&<a className="underline" href={"/sklep/lekcja/"+e.item_id}>Obejrzyj</a>}
          {e.item_kind==="document"&&<a className="underline" href={"/sklep/dokument/"+e.item_id}>Wygeneruj</a>}
          {e.item_kind==="course"&&<a className="underline" href="/sklep#akademia">Wybierz lekcję w Akademii</a>}
        </li>)}</ul>}
      <h2 className="mt-8 text-lg font-bold">Historia zamówień</h2><ul className="mt-3 space-y-2">{state.orders.map(o=><li key={o.id} className="rounded-lg border p-3 text-sm">Zamówienie {o.id.slice(0,8)} · {o.status==="paid"?"Opłacone":o.status==="pending"?"Oczekuje na płatność":o.status} · {(o.amount_grosz/100).toLocaleString("pl-PL")} zł</li>)}</ul>
    </>}
  </main></MarketingShell>;
}
