import { createFileRoute } from "@tanstack/react-router";
import { formatDateTime } from "@/lib/labels";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus, Pencil } from "lucide-react";
import { getTextAgentSettings, saveTextAgentSettings } from "@/lib/text-agent-settings.functions";
import {
  getProcessAgentsState,
  provisionProcessAgents,
} from "@/lib/elevenlabs-agents.functions";
import {
  listKnowledge,
  upsertKnowledge,
  deleteKnowledge,
  type KnowledgeAudience,
} from "@/lib/text-agent-knowledge.functions";
import type { AgentVariant } from "@/lib/elevenlabs-text-agent.server";

export const Route = createFileRoute("/admin/text-agent")({
  component: TextAgentSettingsPage,
});

const SURFACE_LABELS: Record<string, string> = {
  intake: "A1 — przyjęcie wniosku (chat na stronie, telefon, widget)",
  investor_info: "A2 — informacja dla inwestora (/dla-inwestora)",
  investor_panel: "A3 — panel inwestora",
};

function ElevenLabsAgentsCard() {
  const fetchState = useServerFn(getProcessAgentsState);
  const provision = useServerFn(provisionProcessAgents);
  const [state, setState] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setState(await fetchState());
    } catch {
      /* brak uprawnień / błąd — karta zostaje pusta */
    }
  }, [fetchState]);
  useEffect(() => {
    void reload();
  }, [reload]);

  if (!state) return null;

  const missing = ["intake", "investor_info", "investor_panel"].filter((s) => !state[s]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agenty procesowe ElevenLabs</CardTitle>
        <CardDescription>
          Docelowo wszystkie boty procesowe działają jako agenty ElevenLabs. Gdy agent dla
          powierzchni jest utworzony, widget na stronie/panelu automatycznie przełącza się na
          niego; bez agenta działa dotychczasowy silnik tekstowy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(["intake", "investor_info", "investor_panel"] as const).map((s) => (
          <div key={s} className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={state[s] ? "secondary" : "outline"}>
              {state[s] ? "aktywny" : "brak agenta"}
            </Badge>
            <span>{SURFACE_LABELS[s]}</span>
            {state[s] && <span className="font-mono text-xs text-muted-foreground">{state[s]}</span>}
          </div>
        ))}
        {!state.hasApiKey && (
          <p className="text-sm text-destructive">
            Brak sekretu ELEVENLABS_API_KEY — utworzenie agentów niemożliwe.
          </p>
        )}
        {!state.hasToolsSecret && (
          <p className="text-sm text-amber-600">
            Brak sekretu AGENT_TOOLS_SECRET — narzędzia webhook agentów (zapis leadów, status,
            faktury) nie będą działać, ustaw go przed podpięciem tooli w konsoli ElevenLabs.
          </p>
        )}
        {missing.length > 0 && state.hasApiKey && (
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res: any = await provision();
                if (res.created?.length)
                  toast.success(`Utworzono agentów: ${res.created.map((c: any) => c.surface).join(", ")}`);
                if (res.errors?.length)
                  toast.error(res.errors.map((e: any) => `${e.surface}: ${e.error}`).join("; "));
                await reload();
              } catch (e: any) {
                toast.error(e?.message ?? "Błąd tworzenia agentów");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Tworzę agentów…" : `Utwórz brakujących agentów (${missing.length})`}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Po utworzeniu agentów dopnij w konsoli ElevenLabs webhook tool:{" "}
          <span className="font-mono">POST /api/public/agent-tools</span> (nagłówek
          X-Agent-Tools-Secret) — narzędzia: update_lead_data, send_application_link,
          mark_ready_for_human, get_application_status, get_missing_info_brief, issue_invoice.
        </p>
      </CardContent>
    </Card>
  );
}

function TextAgentSettingsPage() {
  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agenci DM (Messenger / Instagram / Email / Czat)</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Prompty systemowe + wspólna baza wiedzy (RAG) dla agentów odpisujących 24/7: bot klientów
          (pożyczkobiorcy), bot inwestorów instytucjonalnych (czat na /dla-inwestora — tylko
          informacje + FV) i asystent Klubu dla inwestorów prywatnych z dostępem (panel /inwestor).
        </p>
      </div>
      <ElevenLabsAgentsCard />
      <Tabs defaultValue="prompt">
        <TabsList>
          <TabsTrigger value="prompt">Prompt — klienci</TabsTrigger>
          <TabsTrigger value="prompt-inwestor">Prompt — inwestorzy instytucjonalni</TabsTrigger>
          <TabsTrigger value="prompt-inwestor-prywatny">Prompt — asystent Klubu</TabsTrigger>
          <TabsTrigger value="knowledge">Baza wiedzy (RAG)</TabsTrigger>
        </TabsList>
        <TabsContent value="prompt" className="mt-4">
          <PromptTab variant="klient" />
        </TabsContent>
        <TabsContent value="prompt-inwestor" className="mt-4">
          <PromptTab variant="inwestor" />
        </TabsContent>
        <TabsContent value="prompt-inwestor-prywatny" className="mt-4">
          <PromptTab variant="inwestor_prywatny" />
        </TabsContent>
        <TabsContent value="knowledge" className="mt-4">
          <KnowledgeTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PromptTab({ variant }: { variant: AgentVariant }) {
  const load = useServerFn(getTextAgentSettings);
  const save = useServerFn(saveTextAgentSettings);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load({ data: { variant } })
      .then((d) => {
        setSystemPrompt(d.systemPrompt ?? "");
        setFirstMessage(d.firstMessage ?? "");
        setUpdatedAt(d.updatedAt);
      })
      .catch((e) => toast.error(e?.message ?? "Błąd ładowania"))
      .finally(() => setLoading(false));
  }, [load, variant]);

  const onSave = async () => {
    setSaving(true);
    try {
      await save({ data: { systemPrompt, firstMessage, variant } });
      toast.success("Zapisano prompt agenta");
      setUpdatedAt(new Date().toISOString());
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd zapisu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {variant === "inwestor"
            ? "Prompt systemowy — bot inwestorów instytucjonalnych"
            : variant === "inwestor_prywatny"
              ? "Prompt systemowy — asystent Klubu (inwestorzy z dostępem)"
              : "Prompt systemowy — bot klientów"}
        </CardTitle>
        <CardDescription>
          {variant === "inwestor" ? (
            <>
              Tylko przekazywanie informacji + FV. Tools: <code>update_lead_data</code>,{" "}
              <code>request_invoice</code>, <code>mark_ready_for_human</code>. Placeholder:{" "}
              <code>{"{{LINK_REJESTRACJA_INWESTORA}}"}</code>. Pusty prompt = używany jest domyślny.
              Cache 5 min.
            </>
          ) : variant === "inwestor_prywatny" ? (
            <>
              Asystent w panelu /inwestor dla członków z wykupionym dostępem — przewodnik po
              platformie, bez tools. Pusty prompt = używany jest domyślny. Cache 5 min.
            </>
          ) : (
            <>
              Tools: <code>update_lead_data</code>, <code>send_application_link</code>,{" "}
              <code>mark_ready_for_human</code>. Pusty prompt = używany jest domyślny. Cache 5 min.
            </>
          )}
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
            {updatedAt
              ? `Ostatnio zapisano: ${formatDateTime(updatedAt)}`
              : "Brak zapisanych zmian"}
          </span>
          <Button onClick={onSave} disabled={saving || loading}>
            {saving ? "Zapisywanie..." : "Zapisz"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type KItem = {
  id: string;
  title: string;
  content: string;
  audience: KnowledgeAudience;
  updated_at: string;
  has_embedding: boolean;
};

const AUDIENCE_LABELS: Record<KnowledgeAudience, string> = {
  klient: "Klienci",
  inwestor: "Inwestorzy (instytucjonalni + asystent Klubu)",
  wspolna: "Wspólna (wszystkie boty)",
};

function KnowledgeTab() {
  const list = useServerFn(listKnowledge);
  const upsert = useServerFn(upsertKnowledge);
  const remove = useServerFn(deleteKnowledge);
  const [items, setItems] = useState<KItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{
    id?: string;
    title: string;
    content: string;
    audience: KnowledgeAudience;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await list();
      setItems(d as KItem[]);
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd");
    } finally {
      setLoading(false);
    }
  }, [list]);

  useEffect(() => {
    reload();
  }, [reload]);

  const onSave = async () => {
    if (!editing || !editing.title.trim() || !editing.content.trim()) {
      toast.error("Tytuł i treść są wymagane");
      return;
    }
    setSaving(true);
    try {
      const res: any = await upsert({ data: editing });
      toast.success(
        res.embedded
          ? "Zapisano (z embeddingiem)"
          : "Zapisano (bez embeddingu — sprawdź LOVABLE_API_KEY)",
      );
      setEditing(null);
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd zapisu");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Usunąć ten wpis?")) return;
    try {
      await remove({ data: { id } });
      toast.success("Usunięto");
      reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Baza wiedzy (RAG)</CardTitle>
          <CardDescription>
            Wpisy są automatycznie embeddowane (openai/text-embedding-3-small) i podpinane do rozmów
            na podstawie podobieństwa semantycznego do pytania klienta (top 4, próg 0.5). Pole
            „Odbiorcy" decyduje, który bot korzysta z wpisu.
          </CardDescription>
        </div>
        <Button
          onClick={() => setEditing({ title: "", content: "", audience: "klient" })}
          size="sm"
        >
          <Plus className="w-4 h-4 mr-1" /> Nowy wpis
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing && (
          <Card className="border-primary">
            <CardContent className="p-4 space-y-3">
              <div>
                <Label>Tytuł</Label>
                <Input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="Np. Maksymalna kwota pożyczki dla osób fizycznych"
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Treść</Label>
                <Textarea
                  value={editing.content}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                  rows={8}
                  placeholder="Treść którą agent może wykorzystać w odpowiedzi..."
                  className="mt-2 text-sm"
                />
              </div>
              <div>
                <Label>Odbiorcy</Label>
                <Select
                  value={editing.audience}
                  onValueChange={(v) =>
                    setEditing({ ...editing, audience: v as KnowledgeAudience })
                  }
                >
                  <SelectTrigger className="mt-2 w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(AUDIENCE_LABELS) as KnowledgeAudience[]).map((a) => (
                      <SelectItem key={a} value={a}>
                        {AUDIENCE_LABELS[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                  Anuluj
                </Button>
                <Button onClick={onSave} disabled={saving}>
                  {saving ? "Zapisywanie..." : "Zapisz"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Ładowanie...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Brak wpisów. Dodaj pierwszy aby agent mógł korzystać z wiedzy.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="border rounded-lg p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium truncate">{it.title}</h4>
                    <Badge variant="outline" className="text-[10px]">
                      {AUDIENCE_LABELS[it.audience] ?? it.audience}
                    </Badge>
                    {!it.has_embedding && (
                      <Badge variant="destructive" className="text-[10px]">
                        brak embeddingu
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{it.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDateTime(it.updated_at)}
                  </p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setEditing(it)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => onDelete(it.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
