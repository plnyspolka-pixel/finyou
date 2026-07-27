import { createFileRoute } from "@tanstack/react-router";
import { formatDateTime } from "@/lib/labels";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";
import {
  getVoicebotSettings,
  updateVoicebotSettings,
  testOutboundCall,
  testSms,
  listVoicebotConversations,
  enrichPendingVoicebotConversations,
} from "@/lib/voicebot.functions";
import { syncAndPullMetaLeads } from "@/lib/meta-leads-sync.functions";
import { toast } from "sonner";
import {
  Phone,
  RefreshCw,
  PhoneCall,
  Save,
  MessageSquare,
  Megaphone,
  DownloadCloud,
  Search,
  Sparkles,
} from "lucide-react";
import { VoicebotConversationCard } from "@/components/admin/VoicebotConversationCard";
import { VoicebotStats } from "@/components/admin/VoicebotStats";

export const Route = createFileRoute("/admin/voicebot")({
  component: VoicebotAdmin,
});

function VoicebotAdmin() {
  const [rows, setRows] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [testPhone, setTestPhone] = useState("+48889888700");

  // filtry
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [days, setDays] = useState<string>("7");

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
  const doSyncMeta = useServerFn(syncAndPullMetaLeads);
  const listConv = useServerFn(listVoicebotConversations);
  const enrichPending = useServerFn(enrichPendingVoicebotConversations);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const dateFrom =
        days === "all"
          ? undefined
          : new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString();
      const data: any = await listConv({
        data: {
          status: filterStatus,
          source: filterSource,
          search: search || undefined,
          dateFrom,
          limit: 100,
        },
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error("Nie udało się załadować rozmów", { description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  const handleEnrich = async () => {
    setEnriching(true);
    const tid = toast.loading("Odświeżam dane rozmów z ElevenLabs…");
    try {
      const r: any = await enrichPending();
      toast.success("Zaktualizowano rozmowy", {
        id: tid,
        description: `Sprawdzono ${r.checked}, zaktualizowano ${r.updated}${r.errors?.length ? `, błędów ${r.errors.length}` : ""}`,
      });
      void loadQueue();
    } catch (e: any) {
      toast.error("Błąd odświeżania", { id: tid, description: e?.message });
    } finally {
      setEnriching(false);
    }
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
    const { error } = await supabase
      .from("meta_lead_forms")
      .update({ voicebot_enabled: value })
      .eq("id", id);
    if (error) {
      toast.error("Nie udało się zapisać", { description: error.message });
      void loadForms();
    }
  };

  useEffect(() => {
    void loadQueue();
    void loadForms();
    fetchSettings()
      .then((s) => {
        if (s) setSettings({ ...settings, ...s });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterSource, days]);

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
          <RefreshCw className="mr-2 h-4 w-4" />
          Odśwież
        </Button>
      </div>

      {/* KONFIGURACJA AGENTA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PhoneCall className="h-5 w-5" />
            Konfiguracja agenta
          </CardTitle>
          <CardDescription>
            ID agenta i numeru z panelu ElevenLabs → Conversational AI.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Agent ID</Label>
            <Input
              value={settings.agent_id ?? ""}
              onChange={(e) => setSettings({ ...settings, agent_id: e.target.value })}
              placeholder="agent_..."
            />
          </div>
          <div>
            <Label>Agent Phone Number ID</Label>
            <Input
              value={settings.agent_phone_number_id ?? ""}
              onChange={(e) => setSettings({ ...settings, agent_phone_number_id: e.target.value })}
              placeholder="phnum_..."
            />
          </div>
          <div>
            <Label>Tryb wyzwalania połączeń</Label>
            <Select
              value={settings.call_trigger}
              onValueChange={(v) => setSettings({ ...settings, call_trigger: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto — od razu po zapisaniu leada</SelectItem>
                <SelectItem value="auto_retry">Auto + ponawianie przy nieodebraniu</SelectItem>
                <SelectItem value="manual">Tylko ręcznie (z listy)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Opóźnienie połączenia (s)</Label>
            <Input
              type="number"
              min={0}
              value={settings.call_delay_seconds ?? 0}
              onChange={(e) =>
                setSettings({ ...settings, call_delay_seconds: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <Label>Liczba ponowień</Label>
            <Input
              type="number"
              min={0}
              max={10}
              value={settings.retry_count ?? 1}
              onChange={(e) => setSettings({ ...settings, retry_count: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Odstęp ponowienia (min)</Label>
            <Input
              type="number"
              min={1}
              value={settings.retry_delay_minutes ?? 30}
              onChange={(e) =>
                setSettings({ ...settings, retry_delay_minutes: Number(e.target.value) })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* SMS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            SMS do leada
          </CardTitle>
          <CardDescription>
            Wysyłka SMS przed/po rozmowie. Wymaga podłączenia Twilio w Konektorach. Zmienne:{" "}
            <code>{"{imie}"}</code>, <code>{"{telefon}"}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={!!settings.sms_enabled}
              onCheckedChange={(b) => setSettings({ ...settings, sms_enabled: b })}
            />
            <Label>Włącz wysyłkę SMS</Label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Kiedy wysyłać</Label>
              <Select
                value={settings.sms_trigger}
                onValueChange={(v) => setSettings({ ...settings, sms_trigger: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
              <Input
                value={settings.sms_from ?? ""}
                onChange={(e) => setSettings({ ...settings, sms_from: e.target.value })}
                placeholder="+48... lub FinanceYou"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Numer Twilio w formacie E.164 (np. +48123456789) lub zarejestrowany Alphanumeric
                Sender ID.
              </p>
            </div>
            <div>
              <Label>Opóźnienie SMS (s)</Label>
              <Input
                type="number"
                min={0}
                value={settings.sms_delay_seconds ?? 0}
                onChange={(e) =>
                  setSettings({ ...settings, sms_delay_seconds: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div>
            <Label>Treść SMS</Label>
            <Textarea
              rows={3}
              value={settings.sms_template ?? ""}
              onChange={(e) => setSettings({ ...settings, sms_template: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          Zapisz ustawienia
        </Button>
      </div>

      {/* TEST */}
      <Card>
        <CardHeader>
          <CardTitle>Test połączenia</CardTitle>
          <CardDescription>
            Wykonaj testowe wywołanie agentem Ania, aby zweryfikować konfigurację.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            placeholder="+48..."
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
          />
          <Button onClick={handleTest} disabled={testing || !settings.agent_id}>
            <Phone className="mr-2 h-4 w-4" />
            {testing ? "Dzwonię..." : "Zadzwoń teraz"}
          </Button>
          <Button
            variant="outline"
            onClick={handleTestSms}
            disabled={testing || !settings.sms_from}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Wyślij testowy SMS
          </Button>
        </CardContent>
      </Card>

      {/* FORMULARZE META */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              Formularze Meta — do których dzwonić
            </CardTitle>
            <CardDescription>
              Włącz przełącznik dla formularzy błyskawicznych, z których Ania ma automatycznie
              dzwonić do leadów. Przycisk „Pobierz z Meta" odkrywa formularze ze stron, do których
              mamy dostęp, i ściąga nowe leady (od ostatniego pobrania) — od razu zapisuje klienta,
              tworzy wniosek z linkiem powrotu, wysyła SMS/email i — jeśli tryb wyzwalania ≠ ręczny
              — zleca rozmowę Ani. Nie musisz czekać na webhook.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              const t = toast.loading("Pobieram formularze i leady z Meta…");
              try {
                const r: any = await doSyncMeta();
                toast.success("Pobrano z Meta", {
                  id: t,
                  description: `Formularzy: ${r.forms_discovered} • Leadów nowych: ${r.leads_new} • Połączeń: ${r.calls_queued}${r.errors?.length ? ` • Błędów: ${r.errors.length}` : ""}`,
                });
                void loadForms();
                void loadQueue();
              } catch (e: any) {
                toast.error("Błąd pobrania", { id: t, description: e?.message });
              }
            }}
          >
            <DownloadCloud className="mr-2 h-4 w-4" />
            Pobierz z Meta
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {forms.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between border rounded-md p-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {f.form_name || `Formularz ${f.meta_form_id}`}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    ID: <code>{f.meta_form_id}</code>
                    {f.page_name && <> • {f.page_name}</>}
                    {f.last_lead_at && <> • Ostatni lead: {formatDateTime(f.last_lead_at)}</>}
                    {typeof f.total_leads_pulled === "number" && (
                      <> • Leadów: {f.total_leads_pulled}</>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Label className="text-xs text-muted-foreground">Ania dzwoni</Label>
                  <Switch
                    checked={!!f.voicebot_enabled}
                    onCheckedChange={(b) => void toggleFormVoicebot(f.id, b)}
                  />
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

      {/* STATYSTYKI */}
      <VoicebotStats rows={rows} />

      {/* KOLEJKA + FILTRY */}
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle>Rozmowy ({rows.length})</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadQueue()}
                disabled={loading}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Odśwież listę
              </Button>
              <Button size="sm" onClick={handleEnrich} disabled={enriching}>
                <Sparkles className={`mr-2 h-4 w-4 ${enriching ? "animate-spin" : ""}`} />
                {enriching ? "Pobieram…" : "Odśwież z ElevenLabs"}
              </Button>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void loadQueue();
                }}
                placeholder="Szukaj: numer, transkrypt…"
                className="pl-8"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie statusy</SelectItem>
                <SelectItem value="oczekuje">Oczekuje</SelectItem>
                <SelectItem value="w_trakcie">W trakcie</SelectItem>
                <SelectItem value="wykonane">Odebrana</SelectItem>
                <SelectItem value="nieodebrana">Nieodebrana</SelectItem>
                <SelectItem value="poczta_glosowa">Poczta głosowa</SelectItem>
                <SelectItem value="blad">Błąd</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSource} onValueChange={setFilterSource}>
              <SelectTrigger>
                <SelectValue placeholder="Źródło" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie źródła</SelectItem>
                <SelectItem value="meta_lead">Meta Ads</SelectItem>
                <SelectItem value="wniosek_krok2">Wniosek</SelectItem>
                <SelectItem value="manual">Ręcznie</SelectItem>
                <SelectItem value="test">Test</SelectItem>
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Ostatnie 24h</SelectItem>
                <SelectItem value="7">Ostatnie 7 dni</SelectItem>
                <SelectItem value="30">Ostatnie 30 dni</SelectItem>
                <SelectItem value="all">Wszystkie</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {rows.map((r) => (
              <VoicebotConversationCard key={r.id} row={r} onChanged={loadQueue} />
            ))}
            {rows.length === 0 && !loading && (
              <div className="text-muted-foreground text-sm">
                Brak rozmów dla wybranych filtrów.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground space-y-1">
        <div>
          Webhook ElevenLabs (po-rozmowowy): <code>/api/public/elevenlabs-webhook</code>
        </div>
        <div>
          Webhook Meta Lead Ads: <code>/api/public/meta-leads-webhook</code>
        </div>
      </div>
    </div>
  );
}
