import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getAiSettings, updateAiSettings } from "@/lib/ai-admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/admin/ai-administrator")({
  component: AiAdminSettings,
});

const MODELS = [
  { value: "claude-opus-4-5", label: "Claude Opus 4.5 (najmocniejszy)" },
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 (zalecane)" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (najszybszy)" },
  { value: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet" },
  { value: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
  { value: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
];

function AiAdminSettings() {
  const qc = useQueryClient();
  const getFn = useServerFn(getAiSettings);
  const updFn = useServerFn(updateAiSettings);

  const { data, isLoading } = useQuery({ queryKey: ["ai-admin-settings"], queryFn: () => getFn() });
  const s = data?.settings as
    | {
        model: string;
        system_prompt: string;
        enable_db_read: boolean;
        enable_db_write: boolean;
        enable_file_read: boolean;
        enable_file_write: boolean;
        max_tokens: number;
        temperature: number;
      }
    | undefined;

  const [form, setForm] = useState(s);
  useEffect(() => setForm(s), [s]);

  const save = useMutation({
    mutationFn: () => updFn({ data: form! }),
    onSuccess: () => {
      toast.success("Zapisano");
      void qc.invalidateQueries({ queryKey: ["ai-admin-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !form) return <div className="p-6 text-muted-foreground">Ładowanie…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Administrator</h1>
        <p className="text-sm text-muted-foreground">
          Konfiguracja systemowego użytkownika AI (Claude). Czat dostępny w prawym dolnym rogu każdej strony /admin.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Model i parametry</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Model Claude</Label>
            <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Max tokens (długość odpowiedzi)</Label>
              <Input
                type="number"
                min={500}
                max={16000}
                value={form.max_tokens}
                onChange={(e) => setForm({ ...form, max_tokens: parseInt(e.target.value) || 8000 })}
              />
            </div>
            <div>
              <Label>Temperatura (0 = deterministycznie)</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Uprawnienia narzędzi</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <ToolRow
            label="Odczyt bazy danych (SELECT)"
            desc="AI może przeglądać dane: leady, klienci, wnioski, oferty itd."
            value={form.enable_db_read}
            onChange={(v) => setForm({ ...form, enable_db_read: v })}
          />
          <ToolRow
            label="Zapis bazy danych (INSERT/UPDATE/DELETE)"
            desc="AI może modyfikować rekordy. Każda operacja jest logowana w audicie."
            value={form.enable_db_write}
            onChange={(v) => setForm({ ...form, enable_db_write: v })}
            warn
          />
          <ToolRow
            label="Odczyt plików projektu (src/**)"
            desc="AI może czytać kod, by analizować i sugerować zmiany. Tylko odczyt — nie modyfikuje plików."
            value={form.enable_file_read}
            onChange={(v) => setForm({ ...form, enable_file_read: v })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>System prompt (instrukcja dla AI)</CardTitle></CardHeader>
        <CardContent>
          <Textarea
            rows={12}
            value={form.system_prompt}
            onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
            className="font-mono text-xs"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Zapisuję…" : "Zapisz ustawienia"}
        </Button>
      </div>
    </div>
  );
}

function ToolRow({
  label,
  desc,
  value,
  onChange,
  warn,
}: {
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
  warn?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 rounded-md border p-3 ${warn ? "border-amber-500/40 bg-amber-500/5" : ""}`}>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
