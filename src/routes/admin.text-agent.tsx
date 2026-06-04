import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getTextAgentSettings, saveTextAgentSettings } from "@/lib/text-agent-settings.functions";

export const Route = createFileRoute("/admin/text-agent")({
  component: TextAgentSettingsPage,
});

function TextAgentSettingsPage() {
  const load = useServerFn(getTextAgentSettings);
  const save = useServerFn(saveTextAgentSettings);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load()
      .then((d) => {
        setSystemPrompt(d.systemPrompt ?? "");
        setFirstMessage(d.firstMessage ?? "");
        setUpdatedAt(d.updatedAt);
      })
      .catch((e) => toast.error(e?.message ?? "Błąd ładowania"))
      .finally(() => setLoading(false));
  }, [load]);

  const onSave = async () => {
    setSaving(true);
    try {
      await save({ data: { systemPrompt, firstMessage } });
      toast.success("Zapisano prompt agenta");
      setUpdatedAt(new Date().toISOString());
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd zapisu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agent DM (Messenger / Instagram / Email)</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Prompt systemowy i pierwsza wiadomość dla agenta odpisującego 24/7 na wiadomości.
          Pusty prompt = używany jest domyślny zaszyty w kodzie. Zmiany działają natychmiast (cache 5 min).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prompt systemowy</CardTitle>
          <CardDescription>
            Instrukcje dla modelu: rola, ton, cele, kiedy zapisywać dane, kiedy wysłać link.
            Tools dostępne automatycznie: <code>update_lead_data</code>, <code>send_application_link</code>, <code>mark_ready_for_human</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="prompt">System prompt</Label>
            <Textarea
              id="prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={20}
              placeholder="Jesteś agentem Finance You..."
              disabled={loading}
              className="font-mono text-sm mt-2"
            />
          </div>
          <div>
            <Label htmlFor="first">Pierwsza wiadomość (opcjonalnie)</Label>
            <Input
              id="first"
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              placeholder="Cześć! Tu Finance You — w czym mogę pomóc?"
              disabled={loading}
              className="mt-2"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {updatedAt ? `Ostatnio zapisano: ${new Date(updatedAt).toLocaleString("pl-PL")}` : "Brak zapisanych zmian"}
            </span>
            <Button onClick={onSave} disabled={saving || loading}>
              {saving ? "Zapisywanie..." : "Zapisz"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
