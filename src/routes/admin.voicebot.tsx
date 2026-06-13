import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";
import {
  getVoicebotSettings,
  updateVoicebotSettings,
  testOutboundCall,
  testSms,
} from "@/lib/voicebot.functions";
import { toast } from "sonner";
import { Phone, RefreshCw, PhoneCall, Save, MessageSquare, Megaphone } from "lucide-react";


export const Route = createFileRoute("/admin/voicebot")({
  component: VoicebotAdmin,
});

const STATUS_LABELS: Record<string, string> = {
  oczekuje: "Oczekuje",
  w_trakcie: "W trakcie",
  zakonczona: "Zakończona",
  blad: "Błąd",
  anulowana: "Anulowana",
};

const SOURCE_LABELS: Record<string, string> = {
  meta_lead: "Meta Ads",
  wniosek_krok2: "Wniosek (krok 2)",
  manual: "Ręcznie",
  test: "Test",
};

function VoicebotAdmin() {
  const [rows, setRows] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState("+48889888700");

  const [settings, setSettings] = useState<any>({
    agent_id: "",
    agent_phone_number_id: "",
    call_trigger: "auto",
    call_delay_seconds: 0,
    retry_count: 1,
    retry_delay_minutes: 30,
    sms_enabled: false,
    sms_from: "",
    sms_template: "",
    sms_delay_seconds: 0,
    sms_trigger: "before_call",
  });

  const fetchSettings = useServerFn(getVoicebotSettings);
  const saveSettings = useServerFn(updateVoicebotSettings);
  const doTest = useServerFn(testOutboundCall);
  const doTestSms = useServerFn(testSms);

  const loadQueue = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("call_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setRows(data ?? []);
    setLoading(false);
  };

  const loadForms = async () => {
    const { data } = await supabase
      .from("meta_lead_forms")
      .select("*")
      .order("last_lead_at", { ascending: false, nullsFirst: false });
    setForms(data ?? []);
  };

  const toggleFormVoicebot = async (id: string, value: boolean) => {
    setForms((prev) => prev.map((f) => (f.id === id ? { ...f, voicebot_enabled: value } : f)));
    const { error } = await supabase.from("meta_lead_forms").update({ voicebot_enabled: value }).eq("id", id);
    if (error) {
      toast.error("Nie udało się zapisać", { description: error.message });
      void loadForms();
    }
  };


  useEffect(() => {
    void loadQueue();
    void loadForms();
    fetchSettings().then((s) => {
      if (s) setSettings({ ...settings, ...s });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings({ data: settings });
      toast.success("Ustawienia zapisane");
    } catch (e: any) {
      toast.error("Błąd zapisu", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testPhone.trim()) return;
    setTesting(true);
    try {
      const r: any = await doTest({ data: { phone: testPhone.trim() } });
      if (r?.ok) {
        toast.success("Połączenie testowe wysłane", {
          description: r.conversationId ? `conv: ${r.conversationId}` : undefined,
        });
        void loadQueue();
      } else {
        toast.error("Błąd połączenia", { description: r?.error ?? "nieznany" });
      }
    } catch (e: any) {
      toast.error("Błąd", { description: e.message });
    } finally {
      setTesting(false);
    }
  };

  const handleTestSms = async () => {
    if (!testPhone.trim()) return;
    setTesting(true);
    try {
      const r: any = await doTestSms({ data: { phone: testPhone.trim() } });
      if (r?.ok) {
        toast.success("SMS wysłany", { description: r.sid ? `sid: ${r.sid}` : undefined });
      } else {
        toast.error("Błąd SMS", { description: r?.error ?? "nieznany" });
      }
    } catch (e: any) {
      toast.error("Błąd", { description: e.message });
    } finally {
      setTesting(false);
    }
  };


  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Voicebot — Ania</h1>
          <p className="text-sm text-muted-foreground">
            Konfiguracja agenta ElevenLabs, kolejka rozmów i SMS-y do leadów.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadQueue()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />Odśwież
        </Button>
      </div>

      {/* KONFIGURACJA AGENTA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><PhoneCall className="h-5 w-5" />Konfiguracja agenta</CardTitle>
          <CardDescription>ID agenta i numeru z panelu ElevenLabs → Conversational AI.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Agent ID</Label>
            <Input value={settings.agent_id ?? ""} onChange={(e) => setSettings({ ...settings, agent_id: e.target.value })} placeholder="agent_..." />
          </div>
          <div>
            <Label>Agent Phone Number ID</Label>
            <Input value={settings.agent_phone_number_id ?? ""} onChange={(e) => setSettings({ ...settings, agent_phone_number_id: e.target.value })} placeholder="phnum_..." />
          </div>
          <div>
            <Label>Tryb wyzwalania połączeń</Label>
            <Select value={settings.call_trigger} onValueChange={(v) => setSettings({ ...settings, call_trigger: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto — od razu po zapisaniu leada</SelectItem>
                <SelectItem value="auto_retry">Auto + ponawianie przy nieodebraniu</SelectItem>
                <SelectItem value="manual">Tylko ręcznie (z listy)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Opóźnienie połączenia (s)</Label>
            <Input type="number" min={0} value={settings.call_delay_seconds ?? 0} onChange={(e) => setSettings({ ...settings, call_delay_seconds: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Liczba ponowień</Label>
            <Input type="number" min={0} max={10} value={settings.retry_count ?? 1} onChange={(e) => setSettings({ ...settings, retry_count: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Odstęp ponowienia (min)</Label>
            <Input type="number" min={1} value={settings.retry_delay_minutes ?? 30} onChange={(e) => setSettings({ ...settings, retry_delay_minutes: Number(e.target.value) })} />
          </div>
        </CardContent>
      </Card>

      {/* SMS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" />SMS do leada</CardTitle>
          <CardDescription>
            Wysyłka SMS przed/po rozmowie. Wymaga podłączenia Twilio w Konektorach.
            Zmienne: <code>{"{imie}"}</code>, <code>{"{telefon}"}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch checked={!!settings.sms_enabled} onCheckedChange={(b) => setSettings({ ...settings, sms_enabled: b })} />
            <Label>Włącz wysyłkę SMS</Label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Kiedy wysyłać</Label>
              <Select value={settings.sms_trigger} onValueChange={(v) => setSettings({ ...settings, sms_trigger: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Wyłączone</SelectItem>
                  <SelectItem value="before_call">Przed połączeniem</SelectItem>
                  <SelectItem value="after_call">Po połączeniu</SelectItem>
                  <SelectItem value="on_failure">Tylko gdy nie odbierze</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nadawca (alfanumeryczny lub +48...)</Label>
              <Input value={settings.sms_from ?? ""} onChange={(e) => setSettings({ ...settings, sms_from: e.target.value })} placeholder="+48... lub FinanceYou" />
              <p className="text-xs text-muted-foreground mt-1">Numer Twilio w formacie E.164 (np. +48123456789) lub zarejestrowany Alphanumeric Sender ID.</p>
            </div>
            <div>
              <Label>Opóźnienie SMS (s)</Label>
              <Input type="number" min={0} value={settings.sms_delay_seconds ?? 0} onChange={(e) => setSettings({ ...settings, sms_delay_seconds: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label>Treść SMS</Label>
            <Textarea rows={3} value={settings.sms_template ?? ""} onChange={(e) => setSettings({ ...settings, sms_template: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}><Save className="mr-2 h-4 w-4" />Zapisz ustawienia</Button>
      </div>

      {/* TEST */}
      <Card>
        <CardHeader>
          <CardTitle>Test połączenia</CardTitle>
          <CardDescription>Wykonaj testowe wywołanie agentem Ania, aby zweryfikować konfigurację.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="+48..." value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
          <Button onClick={handleTest} disabled={testing || !settings.agent_id}>
            <Phone className="mr-2 h-4 w-4" />{testing ? "Dzwonię..." : "Zadzwoń teraz"}
          </Button>
          <Button variant="outline" onClick={handleTestSms} disabled={testing || !settings.sms_from}>
            <MessageSquare className="mr-2 h-4 w-4" />Wyślij testowy SMS
          </Button>
        </CardContent>
      </Card>

      {/* FORMULARZE META */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" />Formularze Meta — do których dzwonić</CardTitle>
          <CardDescription>
            Włącz przełącznik dla formularzy błyskawicznych, z których Ania ma automatycznie dzwonić do leadów.
            Formularze pojawiają się tu automatycznie po pierwszym leadzie z webhooka.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {forms.map((f) => (
              <div key={f.id} className="flex items-center justify-between border rounded-md p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{f.form_name || `Formularz ${f.meta_form_id}`}</div>
                  <div className="text-muted-foreground text-xs">
                    ID: <code>{f.meta_form_id}</code>
                    {f.page_name && <> • {f.page_name}</>}
                    {f.last_lead_at && <> • Ostatni lead: {new Date(f.last_lead_at).toLocaleString("pl-PL")}</>}
                    {typeof f.total_leads_pulled === "number" && <> • Leadów: {f.total_leads_pulled}</>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Label className="text-xs text-muted-foreground">Ania dzwoni</Label>
                  <Switch checked={!!f.voicebot_enabled} onCheckedChange={(b) => void toggleFormVoicebot(f.id, b)} />
                </div>
              </div>
            ))}
            {forms.length === 0 && (
              <div className="text-sm text-muted-foreground">
                Brak formularzy. Pojawią się tu po pierwszym leadzie z Meta Ads.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KOLEJKA */}
      <Card>
        <CardHeader><CardTitle>Kolejka rozmów ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-start justify-between border rounded-md p-3 text-sm">
                <div>
                  <div className="font-medium">{r.phone_normalized}</div>
                  <div className="text-muted-foreground text-xs">
                    Źródło: {SOURCE_LABELS[r.source] ?? r.source ?? "—"} • Próby: {r.attempts} •{" "}
                    {new Date(r.created_at).toLocaleString("pl-PL")}
                  </div>
                  {r.result_summary && <div className="mt-1 text-xs">{r.result_summary}</div>}
                  {r.conversation_id && <div className="mt-1 text-xs text-muted-foreground">conv: {r.conversation_id}</div>}
                </div>
                <Badge variant={r.status === "blad" ? "destructive" : r.status === "zakonczona" ? "default" : "secondary"}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </Badge>
              </div>
            ))}
            {rows.length === 0 && <div className="text-muted-foreground">Kolejka pusta.</div>}
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1">
        <div>Webhook ElevenLabs (po-rozmowowy): <code>/api/public/elevenlabs-webhook</code></div>
        <div>Webhook Meta Lead Ads: <code>/api/public/meta-leads-webhook</code></div>
      </div>
    </div>
  );
}
