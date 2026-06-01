import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/pixele")({
  component: PixelePage,
});

type Settings = {
  client_pixel_id: string | null;
  investor_pixel_id: string | null;
  track_lead: boolean;
  track_registration: boolean;
  track_subscribe: boolean;
  track_contact: boolean;
};

function PixelePage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void supabase.from("tracking_settings").select("*").eq("id", 1).maybeSingle().then(({ data }) => {
      setS((data as Settings) ?? {
        client_pixel_id: "", investor_pixel_id: "",
        track_lead: true, track_registration: true, track_subscribe: true, track_contact: true,
      });
    });
  }, []);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    const { error } = await supabase.from("tracking_settings").update({
      client_pixel_id: s.client_pixel_id?.trim() || null,
      investor_pixel_id: s.investor_pixel_id?.trim() || null,
      track_lead: s.track_lead,
      track_registration: s.track_registration,
      track_subscribe: s.track_subscribe,
      track_contact: s.track_contact,
    }).eq("id", 1);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Zapisano. Pixele załadują się przy następnym przeładowaniu strony.");
  };

  const testFire = (event: string) => {
    const w = window as any;
    if (!w.fbq || !w.__fbPixelActive) {
      toast.error("Pixel nie jest aktywny na tej stronie. Otwórz / lub /inwestor.");
      return;
    }
    w.fbq("trackCustom", event, { test: true, ts: Date.now() });
    toast.success(`Wysłano ${event} (pixel ${w.__fbPixelActive})`);
  };

  if (!s) return <div className="text-muted-foreground">Ładowanie…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Facebook / Meta Pixel</h1>
        <p className="text-sm text-muted-foreground">
          Dwa osobne piksele: jeden dla obszaru klientów (strona główna, <code>/klient/*</code>, <code>/wniosek/*</code>) i drugi dla obszaru inwestorów (<code>/inwestor/*</code>).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Identyfikatory</CardTitle>
          <CardDescription>Wklej Pixel ID z Events Manager (sam numer, np. <code>1234567890123456</code>).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Pixel ID — klienci</Label>
            <Input value={s.client_pixel_id ?? ""} onChange={(e) => setS({ ...s, client_pixel_id: e.target.value })} placeholder="np. 1234567890123456" />
          </div>
          <div className="space-y-1">
            <Label>Pixel ID — inwestorzy</Label>
            <Input value={s.investor_pixel_id ?? ""} onChange={(e) => setS({ ...s, investor_pixel_id: e.target.value })} placeholder="np. 9876543210987654" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Śledzone wydarzenia</CardTitle>
          <CardDescription>PageView leci automatycznie przy każdej zmianie ścieżki.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            ["track_lead", "Lead — krok 2 wniosku pożyczkowego"],
            ["track_registration", "CompleteRegistration — po założeniu konta"],
            ["track_subscribe", "Subscribe — opłacenie abonamentu inwestora"],
            ["track_contact", "Contact — wysłanie wiadomości / formularza"],
          ].map(([k, label]) => (
            <div key={k} className="flex items-center justify-between">
              <Label>{label}</Label>
              <Switch checked={(s as any)[k]} onCheckedChange={(v) => setS({ ...s, [k]: v } as Settings)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Zapisz"}
        </Button>
        <Button variant="outline" onClick={() => testFire("LovableTestEvent")}>Wyślij testowe zdarzenie</Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Wskazówka: w przeglądarce zainstaluj <b>Meta Pixel Helper</b>, otwórz <code>/</code> i <code>/inwestor</code> — powinieneś zobaczyć dwa różne pixele.
      </p>
    </div>
  );
}
