import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Phone, MessageSquare, Mail, BellOff } from "lucide-react";

export const Route = createFileRoute("/klient/powiadomienia")({
  component: KlientPowiadomienia,
});

type Prefs = { do_not_call: boolean; do_not_sms: boolean; do_not_email: boolean };

function KlientPowiadomienia() {
  const { user } = useAuth();
  const [row, setRow] = useState<any | null>(null);
  const [prefs, setPrefs] = useState<Prefs>({
    do_not_call: false,
    do_not_sms: false,
    do_not_email: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      setRow(data);
      if (data) {
        setPrefs({
          do_not_call: (data as any).do_not_call === true,
          do_not_sms: (data as any).do_not_sms === true,
          do_not_email: (data as any).do_not_email === true,
        });
      }
    })();
  }, [user]);

  const updatePref = async (key: keyof Prefs, value: boolean) => {
    if (!row) {
      toast.error("Najpierw zapisz profil, aby zarządzać powiadomieniami");
      return;
    }
    setSaving(true);
    setPrefs((p) => ({ ...p, [key]: value }));
    const patch: any = { [key]: value };
    if (key === "do_not_call" && value) {
      patch.do_not_call_at = new Date().toISOString();
      patch.do_not_call_reason = "Wyłączone w panelu klienta";
      patch.do_not_call_source = "client_panel";
    }
    const { error } = await supabase.from("clients").update(patch).eq("id", row.id);
    setSaving(false);
    if (error) {
      setPrefs((p) => ({ ...p, [key]: !value }));
      toast.error(error.message);
      return;
    }
    toast.success(value ? "Wyciszono" : "Włączono powiadomienia");
  };

  const muteAll = async (mute: boolean) => {
    if (!row) {
      toast.error("Najpierw zapisz profil");
      return;
    }
    setSaving(true);
    const patch: any = { do_not_call: mute, do_not_sms: mute, do_not_email: mute };
    if (mute) {
      patch.do_not_call_at = new Date().toISOString();
      patch.do_not_call_reason = "Wyciszone z panelu klienta";
      patch.do_not_call_source = "client_panel";
    }
    const { error } = await supabase.from("clients").update(patch).eq("id", row.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPrefs({ do_not_call: mute, do_not_sms: mute, do_not_email: mute });
    toast.success(mute ? "Wszystkie powiadomienia wyciszone" : "Powiadomienia włączone");
  };

  const allMuted = prefs.do_not_call && prefs.do_not_sms && prefs.do_not_email;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Powiadomienia</h1>
        <p className="text-sm text-muted-foreground">
          Decyduj, jak mamy Cię informować o postępach wniosku i przypominać o uzupełnieniu danych.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellOff className="h-4 w-4" /> Wycisz wszystko
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Jednym kliknięciem wyłączasz przypomnienia SMS, e-mail i połączenia. Krytyczne
            informacje (np. oferta, umowa, link aktywacyjny) nadal będą dostarczane.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm font-medium">
              {allMuted ? "Wszystkie powiadomienia są wyciszone" : "Powiadomienia aktywne"}
            </span>
            <Switch
              checked={allMuted}
              disabled={saving || !row}
              onCheckedChange={(v) => muteAll(v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Przypomnienia szczegółowo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <PrefRow
            icon={<Phone className="h-4 w-4" />}
            title="Połączenia telefoniczne"
            desc="Asystent głosowy nie będzie do Ciebie dzwonił z przypomnieniami."
            checked={!prefs.do_not_call}
            disabled={saving || !row}
            onChange={(on) => updatePref("do_not_call", !on)}
          />
          <PrefRow
            icon={<MessageSquare className="h-4 w-4" />}
            title="SMS"
            desc="Krótkie przypomnienia o dokończeniu wniosku lub brakujących dokumentach."
            checked={!prefs.do_not_sms}
            disabled={saving || !row}
            onChange={(on) => updatePref("do_not_sms", !on)}
          />
          <PrefRow
            icon={<Mail className="h-4 w-4" />}
            title="E-mail"
            desc="Wiadomości z linkami do uzupełnienia wniosku i statusem oferty."
            checked={!prefs.do_not_email}
            disabled={saving || !row}
            onChange={(on) => updatePref("do_not_email", !on)}
          />
          {!row && (
            <p className="text-xs text-muted-foreground">
              Najpierw zapisz dane profilu w zakładce „Profil", aby móc zarządzać powiadomieniami.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PrefRow({
  icon,
  title,
  desc,
  checked,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">{icon}</div>
        <div>
          <div className="font-medium text-sm">{title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
