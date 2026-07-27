import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/zgody")({
  component: ZgodyPage,
});

type Kind = "privacy" | "marketing" | "terms" | "terms_investor";
type Doc = {
  id: string;
  kind: Kind;
  title: string;
  content: string;
  version: number;
  is_active: boolean;
  updated_at: string;
};

const KINDS: Kind[] = ["privacy", "marketing", "terms", "terms_investor"];

const KIND_LABELS: Record<Kind, string> = {
  privacy: "Polityka prywatności",
  marketing: "Zgody marketingowe",
  terms: "Regulamin klienta (pożyczkobiorcy)",
  terms_investor: "Regulamin inwestora",
};

const KIND_DEFAULT_TITLE: Record<Kind, string> = {
  privacy: "Akceptuję politykę prywatności",
  marketing: "Wyrażam zgodę na otrzymywanie informacji handlowych",
  terms: "Akceptuję regulamin klienta",
  terms_investor: "Akceptuję regulamin inwestora",
};

function ZgodyPage() {
  const [docs, setDocs] = useState<Record<Kind, Doc | null>>({
    privacy: null,
    marketing: null,
    terms: null,
    terms_investor: null,
  });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("consent_documents")
      .select("*")
      .eq("is_active", true)
      .order("version", { ascending: false });
    const next: Record<Kind, Doc | null> = {
      privacy: null,
      marketing: null,
      terms: null,
      terms_investor: null,
    };
    (data as Doc[] | null)?.forEach((d) => {
      if (!next[d.kind]) next[d.kind] = d;
    });
    setDocs(next);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Treści zgód</h1>
        <p className="text-sm text-muted-foreground">
          Polityka prywatności, zgody marketingowe oraz dwa regulaminy: dla klientów
          (pożyczkobiorców) i dla inwestorów. Zaakceptowana wersja jest zapisywana przy użytkowniku.
        </p>
      </div>

      <Tabs defaultValue="privacy">
        <TabsList>
          {KINDS.map((k) => (
            <TabsTrigger key={k} value={k}>
              {KIND_LABELS[k]}
            </TabsTrigger>
          ))}
        </TabsList>

        {KINDS.map((kind) => (
          <TabsContent key={kind} value={kind}>
            <ConsentEditor kind={kind} doc={docs[kind]} loading={loading} onSaved={load} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ConsentEditor({
  kind,
  doc,
  loading,
  onSaved,
}: {
  kind: Kind;
  doc: Doc | null;
  loading: boolean;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTitle(doc?.title ?? KIND_DEFAULT_TITLE[kind]);
    setContent(doc?.content ?? "");
    setIsActive(doc?.is_active ?? true);
  }, [doc, kind]);

  const saveNewVersion = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Tytuł i treść są wymagane");
      return;
    }
    setBusy(true);
    // dezaktywuj poprzednie aktywne tej samej kategorii
    if (doc) {
      await supabase.from("consent_documents").update({ is_active: false }).eq("kind", kind);
    }
    const newVersion = (doc?.version ?? 0) + 1;
    const { error } = await supabase.from("consent_documents").insert({
      kind,
      title,
      content,
      version: newVersion,
      is_active: true,
    });
    setBusy(false);
    if (error) {
      toast.error("Błąd zapisu", { description: error.message });
      return;
    }
    toast.success(`Zapisano wersję ${newVersion}`);
    onSaved();
  };

  const updateInPlace = async () => {
    if (!doc) return;
    setBusy(true);
    const { error } = await supabase
      .from("consent_documents")
      .update({ title, content, is_active: isActive })
      .eq("id", doc.id);
    setBusy(false);
    if (error) {
      toast.error("Błąd zapisu", { description: error.message });
      return;
    }
    toast.success("Zaktualizowano");
    onSaved();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{KIND_LABELS[kind]}</CardTitle>
        <CardDescription>
          {doc
            ? `Aktualna aktywna wersja: ${doc.version}`
            : "Brak zapisanej wersji — utwórz pierwszą."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Tytuł checkboxa (krótki tekst pokazywany przy zaznaczaniu)</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={loading} />
        </div>
        <div className="space-y-2">
          <Label>Pełna treść zgody / dokumentu</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={14}
            disabled={loading}
            placeholder="Wklej pełną treść..."
          />
        </div>
        {doc && (
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Aktywna</div>
              <div className="text-xs text-muted-foreground">
                Wyłączenie ukryje zgodę w formularzu wniosku.
              </div>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {doc && (
            <Button variant="outline" disabled={busy} onClick={() => void updateInPlace()}>
              Zapisz zmiany (ta sama wersja)
            </Button>
          )}
          <Button disabled={busy} onClick={() => void saveNewVersion()}>
            {doc ? "Opublikuj nową wersję" : "Utwórz pierwszą wersję"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
