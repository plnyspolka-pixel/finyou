// Panel agenta publikującego (zakładka w /admin/ai-growth-engine): stan modułu,
// wyłącznik awaryjny, profile torów, ostatnie decyzje bramki compliance.
// Zmiana trybu i limitów: MCP `update_publishing_agent_settings` (administrator).
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Power, ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/labels";
import {
  runPublishingAgentTickFn,
  setPublishingAgentKillSwitch,
} from "@/lib/publishing-agent/agent.functions";

type Settings = {
  mode: string;
  kill_switch: boolean;
  kill_switch_reason: string | null;
  kill_switch_at: string | null;
  auto_paused_at: string | null;
  auto_pause_reason: string | null;
  daily_ai_budget_pln: number;
  max_posts_per_day_per_platform: number;
  disabled_platforms: string[];
};
type Profile = {
  track: string;
  label: string;
  cadence_share_pct: number;
  monthly_ads_budget_pln: number;
  primary_cta_url: string;
};
type Check = {
  id: string;
  created_at: string;
  decision: string;
  subject_type: string;
  rules_version: string;
  violations: unknown;
};

const DECISION_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pass: "secondary",
  fixed: "outline",
  rewrite: "outline",
  reject: "destructive",
};

export function PublishingAgentPanel() {
  const toggle = useServerFn(setPublishingAgentKillSwitch);
  const tick = useServerFn(runPublishingAgentTickFn);
  const [s, setS] = useState<Settings | null>(null);
  const [missing, setMissing] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data, error }, { data: p }, { data: c }] = await Promise.all([
      supabase.from("publishing_agent_settings").select("*").eq("id", true).maybeSingle(),
      supabase
        .from("ai_audience_profiles")
        .select("track,label,cadence_share_pct,monthly_ads_budget_pln,primary_cta_url"),
      supabase
        .from("ai_compliance_checks")
        .select("id,created_at,decision,subject_type,rules_version,violations")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);
    setMissing(!!error || !data);
    setS((data as Settings) ?? null);
    setProfiles((p as Profile[]) ?? []);
    setChecks((c as Check[]) ?? []);
  };
  useEffect(() => {
    void load();
  }, []);

  if (missing) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Moduł agenta publikującego czeka na migrację{" "}
          <code>20261019180000_agent_publikujacy_fundament</code>. Bramka compliance w publikatorach
          działa już teraz (na wartościach domyślnych).
        </CardContent>
      </Card>
    );
  }
  if (!s) return <div className="text-sm text-muted-foreground">Ładowanie…</div>;

  const paused = s.kill_switch || !!s.auto_paused_at;
  const flip = async (on: boolean) => {
    setBusy(true);
    try {
      await toggle({ data: { on, reason: reason || undefined } });
      toast.success(on ? "Agent wstrzymany" : "Agent wznowiony");
      setReason("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className={paused ? "border-destructive" : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Power className="h-4 w-4" /> Agent publikujący — wyłącznik awaryjny
          </CardTitle>
          <CardDescription>
            Tryb: <Badge variant="outline">{s.mode}</Badge> · budżet AI {s.daily_ai_budget_pln}{" "}
            zł/dzień · maks. {s.max_posts_per_day_per_platform} publikacji na dobę na platformę ·
            wyłączone: {s.disabled_platforms.length ? s.disabled_platforms.join(", ") : "—"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {s.kill_switch && (
            <p className="text-sm text-destructive">
              Wyłącznik włączony {s.kill_switch_at ? formatDateTime(s.kill_switch_at) : ""}
              {s.kill_switch_reason ? ` — ${s.kill_switch_reason}` : ""}
            </p>
          )}
          {s.auto_paused_at && (
            <p className="text-sm text-destructive">
              Automatyczna pauza {formatDateTime(s.auto_paused_at)} — {s.auto_pause_reason}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="max-w-sm"
              placeholder="Powód (opcjonalnie)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {paused ? (
              <Button disabled={busy} onClick={() => flip(false)}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Wznów agenta
              </Button>
            ) : (
              <Button variant="destructive" disabled={busy} onClick={() => flip(true)}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Wstrzymaj cały moduł
              </Button>
            )}
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await tick({ data: { report: "daily" } });
                  toast.success("Raport dzienny wysłany");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Wyślij raport teraz
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Tryb i limity zmienia właściciel (MCP <code>update_publishing_agent_settings</code>).
            Reguły compliance są w kodzie i nie da się ich zmienić z panelu ani przez agenta.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tory odbiorców</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {profiles.map((p) => (
            <div key={p.track} className="rounded-md border p-3 text-sm">
              <div className="font-medium">{p.label}</div>
              <div className="text-muted-foreground">
                udział w kadencji {p.cadence_share_pct}% · reklamy {p.monthly_ads_budget_pln}{" "}
                zł/mies.
              </div>
              <div className="truncate text-muted-foreground">CTA: {p.primary_cta_url}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Ostatnie decyzje bramki compliance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {checks.length === 0 && <p className="text-muted-foreground">Brak decyzji.</p>}
          {checks.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">{formatDateTime(c.created_at)}</span>
              <Badge variant={DECISION_VARIANT[c.decision] ?? "outline"}>{c.decision}</Badge>
              <span>{c.subject_type}</span>
              {Array.isArray(c.violations) && c.violations.length > 0 && (
                <span className="text-muted-foreground">
                  {(c.violations as Array<{ ruleId: string }>).map((v) => v.ruleId).join(", ")}
                </span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
