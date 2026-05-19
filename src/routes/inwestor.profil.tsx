import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { investorTypeLabels } from "@/lib/labels";

export const Route = createFileRoute("/inwestor/profil")({
  component: InwestorProfil,
});

function InwestorProfil() {
  const { user } = useAuth();
  const [inv, setInv] = useState<any | null>(null);
  const [f, setF] = useState({ first_name: "", last_name: "", company_name: "", phone: "", email: "", investor_type: "indywidualny" });

  useEffect(() => { if (!user) return; void (async () => {
    const { data } = await supabase.from("investors").select("*").eq("user_id", user.id).maybeSingle();
    setInv(data);
    if (data) setF({
      first_name: data.first_name ?? "", last_name: data.last_name ?? "", company_name: data.company_name ?? "",
      phone: data.phone ?? "", email: data.email ?? user.email ?? "", investor_type: data.investor_type ?? "indywidualny",
    });
    else setF((x) => ({ ...x, email: user.email ?? "" }));
  })(); }, [user]);

  const save = async () => {
    if (!user) return;
    const payload = {
      first_name: f.first_name || null, last_name: f.last_name || null, company_name: f.company_name || null,
      phone: f.phone || null, email: f.email || null, investor_type: f.investor_type as any,
    };
    const { error } = inv
      ? await supabase.from("investors").update(payload).eq("id", inv.id)
      : await supabase.from("investors").insert({ ...payload, user_id: user.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Zapisano");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Profil inwestora</h1>
      <Card><CardHeader><CardTitle>Dane</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div><Label>Typ</Label>
            <Select value={f.investor_type} onValueChange={(v) => setF({ ...f, investor_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(investorTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Firma</Label><Input value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} /></div>
          <div><Label>Imię</Label><Input value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></div>
          <div><Label>Nazwisko</Label><Input value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></div>
          <div><Label>E-mail</Label><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><Label>Telefon</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div className="md:col-span-2"><Button onClick={save}>Zapisz</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}
