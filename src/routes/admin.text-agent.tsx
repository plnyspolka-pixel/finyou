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
import { Trash2, Plus, Pencil } from "lucide-react";
import { getTextAgentSettings, saveTextAgentSettings } from "@/lib/text-agent-settings.functions";
import {
  listKnowledge,
  upsertKnowledge,
  deleteKnowledge,
} from "@/lib/text-agent-knowledge.functions";

export const Route = createFileRoute("/admin/text-agent")({
  component: TextAgentSettingsPage,
});

function TextAgentSettingsPage() {
  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Agent DM (Messenger / Instagram / Email)</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Prompt systemowy + baza wiedzy (RAG) dla agenta odpisującego 24/7.
        </p>
      </div>
      <Tabs defaultValue="prompt">
        <TabsList>
          <TabsTrigger value="prompt">Prompt systemowy</TabsTrigger>
          <TabsTrigger value="knowledge">Baza wiedzy (RAG)</TabsTrigger>
        </TabsList>
        <TabsContent value="prompt" className="mt-4">
          <PromptTab />
        </TabsContent>
        <TabsContent value="knowledge" className="mt-4">
          <KnowledgeTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PromptTab() {
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
    <Card>
      <CardHeader>
        <CardTitle>Prompt systemowy</CardTitle>
        <CardDescription>
          Tools: <code>update_lead_data</code>, <code>send_application_link</code>,{" "}
          <code>mark_ready_for_human</code>. Pusty prompt = używany jest domyślny. Cache 5 min.
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
  updated_at: string;
  has_embedding: boolean;
};

function KnowledgeTab() {
  const list = useServerFn(listKnowledge);
  const upsert = useServerFn(upsertKnowledge);
  const remove = useServerFn(deleteKnowledge);
  const [items, setItems] = useState<KItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id?: string; title: string; content: string } | null>(
    null,
  );
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
            na podstawie podobieństwa semantycznego do pytania klienta (top 4, próg 0.5).
          </CardDescription>
        </div>
        <Button onClick={() => setEditing({ title: "", content: "" })} size="sm">
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
