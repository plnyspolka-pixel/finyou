import { createFileRoute } from "@tanstack/react-router";
import { formatDateTime } from "@/lib/labels";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listSocialPosts,
  saveSocialPost,
  deleteSocialPost,
  generateSocialPost,
  generateSocialImageFn,
} from "@/lib/social-posts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Image as ImageIcon, Plus, Trash2, Calendar, Send, Copy } from "lucide-react";

export const Route = createFileRoute("/admin/marketing/social")({
  component: SocialAdmin,
});

type Platform = "facebook" | "instagram" | "linkedin" | "x" | "tiktok" | "threads";
type Status = "draft" | "scheduled" | "published" | "failed";

type Post = {
  id: string;
  platform: Platform;
  content: string;
  hashtags: string[] | null;
  image_url: string | null;
  link_url: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  status: Status;
  campaign: string | null;
  created_at: string;
};

type FormState = {
  id?: string;
  platform: Platform;
  content: string;
  hashtags: string; // comma/space separated
  image_url: string;
  link_url: string;
  scheduled_at: string; // datetime-local
  status: Status;
  campaign: string;
  ai_prompt: string;
  ai_tone: string;
};

const empty = (): FormState => ({
  platform: "facebook",
  content: "",
  hashtags: "",
  image_url: "",
  link_url: "",
  scheduled_at: "",
  status: "draft",
  campaign: "",
  ai_prompt: "",
  ai_tone: "",
});

const PLATFORM_LABELS: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X / Twitter",
  tiktok: "TikTok",
  threads: "Threads",
};

const STATUS_COLORS: Record<Status, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  published: "bg-green-500/15 text-green-700 dark:text-green-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
};

function SocialAdmin() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSocialPosts);
  const saveFn = useServerFn(saveSocialPost);
  const delFn = useServerFn(deleteSocialPost);
  const genFn = useServerFn(generateSocialPost);
  const imgFn = useServerFn(generateSocialImageFn);

  const { data, isLoading } = useQuery({
    queryKey: ["social-posts"],
    queryFn: () => listFn(),
  });
  const posts = (data?.posts ?? []) as Post[];

  const [form, setForm] = useState<FormState>(empty());
  const [filter, setFilter] = useState<"all" | Status>("all");

  const filtered = useMemo(
    () => (filter === "all" ? posts : posts.filter((p) => p.status === filter)),
    [posts, filter],
  );

  const save = useMutation({
    mutationFn: async () => {
      const hashtags = form.hashtags
        .split(/[,\s]+/)
        .map((h) => h.trim().replace(/^#?/, "#"))
        .filter((h) => h.length > 1);
      return saveFn({
        data: {
          id: form.id,
          platform: form.platform,
          content: form.content,
          hashtags,
          image_url: form.image_url || "",
          link_url: form.link_url || "",
          scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : "",
          status: form.status,
          campaign: form.campaign || undefined,
          ai_prompt: form.ai_prompt || undefined,
          ai_model: form.ai_prompt ? "google/gemini-2.5-flash" : undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Zapisano post");
      setForm(empty());
      void qc.invalidateQueries({ queryKey: ["social-posts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Usunięto");
      void qc.invalidateQueries({ queryKey: ["social-posts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const genCopy = useMutation({
    mutationFn: () =>
      genFn({
        data: {
          platform: form.platform,
          brief: form.ai_prompt,
          campaign: form.campaign || undefined,
          tone: form.ai_tone || undefined,
        },
      }),
    onSuccess: (r) => {
      setForm((f) => ({
        ...f,
        content: r.content,
        hashtags: r.hashtags.join(" "),
      }));
      toast.success("Wygenerowano treść");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const genImage = useMutation({
    mutationFn: (prompt: string) => imgFn({ data: { prompt } }),
    onSuccess: (r) => {
      setForm((f) => ({ ...f, image_url: r.image_url }));
      toast.success("Wygenerowano grafikę");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Social Media & AI Content</h1>
          <p className="text-sm text-muted-foreground">
            Planer postów + generator tekstów i obrazów AI dla wszystkich platform.
          </p>
        </div>
        <Button variant="outline" onClick={() => setForm(empty())}>
          <Plus className="mr-2 h-4 w-4" /> Nowy post
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* Editor */}
        <Card>
          <CardHeader>
            <CardTitle>{form.id ? "Edycja postu" : "Nowy post"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="ai">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="ai">AI Generator</TabsTrigger>
                <TabsTrigger value="content">Treść</TabsTrigger>
                <TabsTrigger value="schedule">Publikacja</TabsTrigger>
              </TabsList>

              <TabsContent value="ai" className="space-y-3 pt-4">
                <div>
                  <Label>Platforma</Label>
                  <Select
                    value={form.platform}
                    onValueChange={(v) => setForm({ ...form, platform: v as Platform })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Brief / temat</Label>
                  <Textarea
                    rows={4}
                    placeholder="np. Promujemy nową kalkulację raty pożyczki pod nieruchomość — pokażmy, że klient w 60 sek. widzi orientacyjną ratę."
                    value={form.ai_prompt}
                    onChange={(e) => setForm({ ...form, ai_prompt: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Ton (opcjonalnie)</Label>
                    <Input
                      placeholder="ekspercki, ciepły, edukacyjny..."
                      value={form.ai_tone}
                      onChange={(e) => setForm({ ...form, ai_tone: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Kampania (tag)</Label>
                    <Input
                      placeholder="np. Q3-kalkulator"
                      value={form.campaign}
                      onChange={(e) => setForm({ ...form, campaign: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    onClick={() => genCopy.mutate()}
                    disabled={genCopy.isPending || form.ai_prompt.trim().length < 10}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    {genCopy.isPending ? "Generuję…" : "Wygeneruj treść"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      genImage.mutate(
                        form.ai_prompt ||
                          `Professional financial brand visual, ${PLATFORM_LABELS[form.platform]} post about real-estate loans`,
                      )
                    }
                    disabled={genImage.isPending}
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    {genImage.isPending ? "Generuję obraz…" : "Wygeneruj grafikę"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="content" className="space-y-3 pt-4">
                <div>
                  <Label>Treść postu</Label>
                  <Textarea
                    rows={8}
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{form.content.length} znaków</p>
                </div>
                <div>
                  <Label>Hashtagi (oddziel spacją lub przecinkiem)</Label>
                  <Input
                    value={form.hashtags}
                    onChange={(e) => setForm({ ...form, hashtags: e.target.value })}
                    placeholder="#pożyczka #nieruchomości"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <Label>URL grafiki</Label>
                    <Input
                      value={form.image_url}
                      onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                      placeholder="https://…"
                    />
                  </div>
                  <div>
                    <Label>Link (CTA)</Label>
                    <Input
                      value={form.link_url}
                      onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                      placeholder="https://app.financeyou.pl/…"
                    />
                  </div>
                </div>
                {form.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.image_url}
                    alt="Podgląd"
                    className="mt-2 max-h-64 rounded-md border object-contain"
                  />
                )}
              </TabsContent>

              <TabsContent value="schedule" className="space-y-3 pt-4">
                <div>
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v as Status })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Szkic</SelectItem>
                      <SelectItem value="scheduled">Zaplanowany</SelectItem>
                      <SelectItem value="published">Opublikowany</SelectItem>
                      <SelectItem value="failed">Błąd</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Termin publikacji</Label>
                  <Input
                    type="datetime-local"
                    value={form.scheduled_at}
                    onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Publikacja automatyczna wymaga połączenia z API platformy — na razie kalendarz
                    służy do planowania ręcznej publikacji.
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <div className="mt-6 flex justify-end gap-2">
              {form.id && (
                <Button variant="ghost" onClick={() => setForm(empty())}>
                  Anuluj
                </Button>
              )}
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending || form.content.trim().length === 0}
              >
                <Send className="mr-2 h-4 w-4" />
                {save.isPending ? "Zapisuję…" : form.id ? "Zaktualizuj" : "Zapisz post"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Posty</CardTitle>
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie</SelectItem>
                <SelectItem value="draft">Szkice</SelectItem>
                <SelectItem value="scheduled">Zaplanowane</SelectItem>
                <SelectItem value="published">Opublikowane</SelectItem>
                <SelectItem value="failed">Błąd</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && <p className="text-sm text-muted-foreground">Ładowanie…</p>}
            {!isLoading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Brak postów. Zacznij od AI Generatora obok.
              </p>
            )}
            {filtered.map((p) => (
              <div key={p.id} className="rounded-md border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{PLATFORM_LABELS[p.platform]}</Badge>
                  <Badge className={STATUS_COLORS[p.status]}>{p.status}</Badge>
                  {p.campaign && <Badge variant="secondary">{p.campaign}</Badge>}
                  {p.scheduled_at && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDateTime(p.scheduled_at)}
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm">{p.content}</p>
                {p.hashtags && p.hashtags.length > 0 && (
                  <p className="mt-1 text-xs text-primary">{p.hashtags.join(" ")}</p>
                )}
                {p.image_url && (
                  <img
                    src={p.image_url}
                    alt=""
                    className="mt-2 max-h-40 rounded border object-cover"
                  />
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setForm({
                        id: p.id,
                        platform: p.platform,
                        content: p.content,
                        hashtags: (p.hashtags ?? []).join(" "),
                        image_url: p.image_url ?? "",
                        link_url: p.link_url ?? "",
                        scheduled_at: p.scheduled_at
                          ? new Date(p.scheduled_at).toISOString().slice(0, 16)
                          : "",
                        status: p.status,
                        campaign: p.campaign ?? "",
                        ai_prompt: "",
                        ai_tone: "",
                      })
                    }
                  >
                    Edytuj
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        `${p.content}\n\n${(p.hashtags ?? []).join(" ")}`.trim(),
                      );
                      toast.success("Skopiowano do schowka");
                    }}
                  >
                    <Copy className="mr-1 h-3 w-3" /> Kopiuj
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => {
                      if (confirm("Usunąć post?")) remove.mutate(p.id);
                    }}
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Usuń
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
