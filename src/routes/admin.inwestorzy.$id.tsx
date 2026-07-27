import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { investorTypeLabels } from "@/lib/labels";

export const Route = createFileRoute("/admin/inwestorzy/$id")({
  component: InwestorDetail,
});

function InwestorDetail() {
  const { id } = Route.useParams();
  const [inv, setInv] = useState<any | null>(null);
  const [settings, setSettings] = useState<any>({
    preferred_min_amount: "",
    preferred_max_amount: "",
    max_ltv: "",
    preferred_property_types: "",
    preferred_locations: "",
    email_template: "",
  });

  const load = async () => {
    const { data } = await supabase.from("investors").select("*").eq("id", id).single();
    setInv(data);
    if (data?.investor_type === "instytucjonalny") {
      const { data: s } = await supabase
        .from("institutional_investor_settings")
        .select("*")
        .eq("investor_id", id)
        .maybeSingle();
      if (s)
        setSettings({
          preferred_min_amount: s.preferred_min_amount?.toString() ?? "",
          preferred_max_amount: s.preferred_max_amount?.toString() ?? "",
          max_ltv: s.max_ltv?.toString() ?? "",
          preferred_property_types: (s.preferred_property_types ?? []).join(","),
          preferred_locations: (s.preferred_locations ?? []).join(","),
          email_template: s.email_template ?? "",
        });
    }
  };
  useEffect(() => {
    void load();
  }, [id]);

  const saveInv = async () => {
    const { error } = await supabase
      .from("investors")
      .update({
        first_name: inv.first_name,
        last_name: inv.last_name,
        company_name: inv.company_name,
        email: inv.email,
        phone: inv.phone,
        is_active: inv.is_active,
      })
      .eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Zapisano");
  };

  const saveSettings = async () => {
    const payload = {
      investor_id: id,
      preferred_min_amount: settings.preferred_min_amount
        ? Number(settings.preferred_min_amount)
        : null,
      preferred_max_amount: settings.preferred_max_amount
        ? Number(settings.preferred_max_amount)
        : null,
      max_ltv: settings.max_ltv ? Number(settings.max_ltv) : null,
      preferred_property_types: settings.preferred_property_types
        ? settings.preferred_property_types
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : null,
      preferred_locations: settings.preferred_locations
        ? settings.preferred_locations
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : null,
      email_template: settings.email_template || null,
    };
    const { data: existing } = await supabase
      .from("institutional_investor_settings")
      .select("id")
      .eq("investor_id", id)
      .maybeSingle();
    const { error } = existing
      ? await supabase.from("institutional_investor_settings").update(payload).eq("id", existing.id)
      : await supabase.from("institutional_investor_settings").insert(payload);
    if (error) toast.error(error.message);
    else toast.success("Zapisano ustawienia");
  };

  if (!inv) return <div>Ładowanie…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        to="/admin/inwestorzy"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Wróć
      </Link>
      <h1 className="text-2xl font-bold">
        {inv.company_name || `${inv.first_name ?? ""} ${inv.last_name ?? ""}`.trim()}{" "}
        <span className="text-sm text-muted-foreground">
          ({investorTypeLabels[inv.investor_type]})
        </span>
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Dane</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Firma</Label>
            <Input
              value={inv.company_name ?? ""}
              onChange={(e) => setInv({ ...inv, company_name: e.target.value })}
            />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input
              value={inv.email ?? ""}
              onChange={(e) => setInv({ ...inv, email: e.target.value })}
            />
          </div>
          <div>
            <Label>Imię</Label>
            <Input
              value={inv.first_name ?? ""}
              onChange={(e) => setInv({ ...inv, first_name: e.target.value })}
            />
          </div>
          <div>
            <Label>Nazwisko</Label>
            <Input
              value={inv.last_name ?? ""}
              onChange={(e) => setInv({ ...inv, last_name: e.target.value })}
            />
          </div>
          <div>
            <Label>Telefon</Label>
            <Input
              value={inv.phone ?? ""}
              onChange={(e) => setInv({ ...inv, phone: e.target.value })}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={saveInv}>Zapisz dane</Button>
          </div>
        </CardContent>
      </Card>
      {inv.investor_type === "instytucjonalny" && (
        <Card>
          <CardHeader>
            <CardTitle>Ustawienia instytucjonalne</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Minimalna kwota</Label>
              <Input
                type="number"
                value={settings.preferred_min_amount}
                onChange={(e) => setSettings({ ...settings, preferred_min_amount: e.target.value })}
              />
            </div>
            <div>
              <Label>Maksymalna kwota</Label>
              <Input
                type="number"
                value={settings.preferred_max_amount}
                onChange={(e) => setSettings({ ...settings, preferred_max_amount: e.target.value })}
              />
            </div>
            <div>
              <Label>Maks. LTV (%)</Label>
              <Input
                type="number"
                value={settings.max_ltv}
                onChange={(e) => setSettings({ ...settings, max_ltv: e.target.value })}
              />
            </div>
            <div>
              <Label>Preferowane typy (po przecinku)</Label>
              <Input
                value={settings.preferred_property_types}
                onChange={(e) =>
                  setSettings({ ...settings, preferred_property_types: e.target.value })
                }
                placeholder="mieszkanie,dom"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Preferowane lokalizacje (po przecinku)</Label>
              <Input
                value={settings.preferred_locations}
                onChange={(e) => setSettings({ ...settings, preferred_locations: e.target.value })}
                placeholder="Warszawa,Kraków"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Szablon e-maila</Label>
              <Textarea
                rows={5}
                value={settings.email_template}
                onChange={(e) => setSettings({ ...settings, email_template: e.target.value })}
                placeholder="Cześć {{imie}}, mamy nową okazję..."
              />
            </div>
            <div className="md:col-span-2">
              <Button onClick={saveSettings}>Zapisz ustawienia</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
