import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getStoreLegalTexts, getMyStorePurchases, acceptStoreDpa } from "@/lib/storefront/checkout.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

/** One-time Art.28 DPA gate for ALL investor document generators. */
export function StoreDpaGate({ children }: { children: ReactNode }) {
  const fetchLegal = useServerFn(getStoreLegalTexts);
  const fetchPurchases = useServerFn(getMyStorePurchases);
  const accept = useServerFn(acceptStoreDpa);
  const qc = useQueryClient();
  const [checked,setChecked] = useState(false);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const terms = useQuery({queryKey:["store-dpa-document"],queryFn:()=>fetchLegal()});
  const state = useQuery({queryKey:["store-dpa-acceptance"],queryFn:()=>fetchPurchases()});
  if (terms.isLoading || state.isLoading) return <p className="p-4 text-sm">Weryfikacja umowy powierzenia…</p>;
  if (terms.isError || state.isError) return <p className="p-4 text-sm text-destructive">Nie można sprawdzić umowy powierzenia. Odśwież stronę.</p>;
  if (state.data?.dpaAccepted) return <>{children}</>;
  const sign = async () => {
    if (!checked || saving) return;
    setSaving(true);setError("");
    try {
      await accept({data:{accepted:true}});
      await qc.invalidateQueries({queryKey:["store-dpa-acceptance"]});
    } catch(e) {setError(e instanceof Error?e.message:"Nie udało się zapisać akceptacji.");}
    finally {setSaving(false);}
  };
  return <Card className="border-primary/30">
    <CardHeader><CardTitle>Umowa powierzenia danych — kreator dokumentów</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Zanim wprowadzisz dane pożyczkobiorcy, poręczyciela lub właściciela nieruchomości, zawrzyj elektronicznie umowę powierzenia danych (art. 28 RODO). Nie jest to zgoda marketingowa.</p>
      <details className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold">Przeczytaj pełną umowę, wersja {terms.data?.dpa.version}</summary>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap pt-3 text-xs leading-relaxed font-sans">{terms.data?.dpa.text}</pre>
      </details>
      <label className="flex items-start gap-2 text-sm"><Checkbox checked={checked} onCheckedChange={v=>setChecked(v===true)}/>
        <span>Zapoznałem się z treścią umowy powierzenia i akceptuję ją elektronicznie.</span></label>
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      <Button disabled={!checked || saving} onClick={()=>void sign()}>{saving?"Zapisywanie…":"Akceptuję umowę i otwieram kreator"}</Button>
    </CardContent>
  </Card>;
}
