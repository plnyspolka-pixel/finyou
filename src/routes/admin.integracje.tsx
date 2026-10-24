import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { integrationStatusLabels } from "@/lib/labels";
import {
  TRUSTPILOT_AFS_DOMAIN,
  TRUSTPILOT_INTEGRATION_NAME,
  normalizeTrustpilotAfsAddress,
  parseTrustpilotConfig,
} from "@/lib/trustpilot";

export const Route = createFileRoute("/admin/integracje")({
  component: IntegracjePage,
});

const DEFAULT_INTEGRATIONS = [
  { name: "make", label: "Make", desc: "Automatyzacje, webhooki dla dystrybucji ofert" },
  { name: "getresponse", label: "GetResponse", desc: "E-mail marketing i nurturing leadów" },
  { name: "stripe", label: "Stripe", desc: "Płatności abonamentowe inwestorów" },
  { name: "web2learn", label: "Web2Learn", desc: "Platforma kursów inwestorskich" },
  { name: "jotform", label: "JotForm", desc: "Zewnętrzne formularze leadowe" },
  { name: "meta_lead_ads", label: "Meta Lead Ads", desc: "Leady z Facebooka i Instagrama" },
  { name: "sms", label: "SMS", desc: "Bramka SMS dla powiadomień" },
  { name: "voicebot", label: "Voicebot", desc: "Voicebot wstępnej kwalifikacji" },
  { name: "gmail", label: "Gmail", desc: "Wysyłka i odbiór e-maili obsługowych" },
  {
    name: TRUSTPILOT_INTEGRATION_NAME,
    label: "Trustpilot",
    desc: "Automatyczne zaproszenia do opinii (AFS) po pobraniu lead magnetu",
  },
];

function IntegracjePage() {
  const [rows, setRows] = useState<any[]>([]);

  const load = async () => {
    const { data } = await supabase.from("integration_settings").select("*");
    const map = new Map((data ?? []).map((r) => [r.integration_name, r]));
    const merged = DEFAULT_INTEGRATIONS.map((d) => ({
      ...d,
      ...(map.get(d.name) ?? { is_enabled: false, status: "niepolaczona", webhook_url: null }),
    }));
    setRows(merged);
  };
  useEffect(() => {
    void load();
  }, []);

  const upsert = async (integration_name: string, patch: any) => {
    const { data: existing } = await supabase
      .from("integration_settings")
      .select("id")
      .eq("integration_name", integration_name)
      .maybeSingle();
    const { error } = existing
      ? await supabase.from("integration_settings").update(patch).eq("id", existing.id)
      : await supabase.from("integration_settings").insert({ integration_name, ...patch });
    if (error) toast.error(error.message);
    else {
      toast.success("Zapisano");
      void load();
    }
  };

  const test = (name: string) => {
    toast.info(`Testuj połączenie z ${name}`, {
      description: "Funkcja zostanie podpięta wraz z prawdziwą integracją.",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integracje</h1>
        <p className="text-sm text-muted-foreground">
          Zarządzaj statusem zewnętrznych systemów. Aktywacja realna nastąpi po podpięciu
          webhooków/API.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.name}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{r.label}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{r.desc}</p>
                </div>
                <Badge
                  variant={
                    r.status === "polaczona"
                      ? "default"
                      : r.status === "blad"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {integrationStatusLabels[r.status]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Włączona</span>
                <Switch
                  checked={!!r.is_enabled}
                  onCheckedChange={(v) =>
                    void upsert(r.name, {
                      is_enabled: v,
                      status: v ? "wymaga_konfiguracji" : "wylaczona",
                    })
                  }
                />
              </div>
              {r.name === TRUSTPILOT_INTEGRATION_NAME ? (
                <TrustpilotFields row={r} onSave={(patch) => upsert(r.name, patch)} />
              ) : (
                <Input
                  placeholder="Webhook URL / endpoint"
                  defaultValue={r.webhook_url ?? ""}
                  onBlur={(e) => {
                    if (e.target.value !== (r.webhook_url ?? ""))
                      void upsert(r.name, { webhook_url: e.target.value || null });
                  }}
                />
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => test(r.label)}
                >
                  Testuj połączenie
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void upsert(r.name, { status: "polaczona" })}
                >
                  Oznacz jako połączoną
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * Trustpilot: adres AFS (ukryta kopia maila z linkiem do lead magnetu) i
 * przełącznik zaproszeń po pobraniu. Adres musi być w domenie
 * invite.trustpilot.com — inny nie zostanie zapisany.
 */
function TrustpilotFields({
  row,
  onSave,
}: {
  row: { configuration?: unknown };
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const cfg = parseTrustpilotConfig(row.configuration);
  const savedAfs = cfg.afs_bcc_email ?? "";
  const [afs, setAfs] = useState(savedAfs);
  useEffect(() => {
    setAfs(savedAfs);
  }, [savedAfs]);

  const configuration = (
    row.configuration && typeof row.configuration === "object" ? row.configuration : {}
  ) as Record<string, unknown>;

  const saveAfs = () => {
    const typed = afs.trim();
    const normalized = normalizeTrustpilotAfsAddress(typed);
    if (typed && !normalized) {
      toast.error(`Adres AFS musi kończyć się na @${TRUSTPILOT_AFS_DOMAIN}`);
      return;
    }
    if ((normalized ?? "") === savedAfs) return;
    void onSave({
      configuration: { ...configuration, afs_bcc_email: normalized },
      status: normalized ? "polaczona" : "wymaga_konfiguracji",
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">
          Adres AFS (Trustpilot Business → Get reviews → Automatic invitations)
        </label>
        <Input
          placeholder={`np. 1234567890@${TRUSTPILOT_AFS_DOMAIN}`}
          value={afs}
          onChange={(e) => setAfs(e.target.value)}
          onBlur={saveAfs}
        />
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Zapraszaj po pobraniu lead magnetu</span>
        <Switch
          checked={cfg.invite_lead_magnets}
          onCheckedChange={(v) =>
            void onSave({ configuration: { ...configuration, invite_lead_magnets: v } })
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Mail z linkiem do pliku dostaje ukrytą kopię na ten adres, a Trustpilot po swoim opóźnieniu
        wysyła tej osobie zaproszenie do opinii. Działa, gdy integracja jest włączona i adres jest
        wpisany.
      </p>
    </div>
  );
}
