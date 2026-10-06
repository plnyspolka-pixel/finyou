// Panel lead magnetów: materiał za e-mail (/pobierz/<slug>) + automat
// odpowiedzi na komentarze pod postami FB / IG / YouTube.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/labels";
import { supabase } from "@/integrations/supabase/client";
import {
  listLeadMagnets,
  saveLeadMagnet,
  deleteLeadMagnet,
  listLeadMagnetSignups,
  listLeadMagnetTriggers,
  getLeadMagnetFileUrl,
  generateLeadMagnetCopy,
  runLeadMagnetYoutubeCheck,
} from "@/lib/lead-magnets/lead-magnets.functions";
import {
  AUDIENCE_LABELS,
  DEFAULT_TEMPLATES,
  LEAD_MAGNET_AUDIENCES,
  LEAD_MAGNET_PLATFORMS,
  PLATFORM_LABELS,
  leadMagnetUrl,
  parseKeywords,
  suggestedCaption,
  type LeadMagnetAudience,
  type LeadMagnetPlatform,
} from "@/lib/lead-magnets/core";
import type { LeadMagnetInput } from "@/lib/lead-magnets/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Gift,
  MessageSquare,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/admin/marketing/lead-magnety")({
  component: LeadMagnetsAdmin,
});

const BUCKET = "lead-magnets";

type Magnet = {
  id: string;
  slug: string;
  title: string;
  audience: string;
  headline: string;
  subheadline: string | null;
  benefits: string[];
  cta_text: string;
  cover_image_url: string | null;
  og_image_url: string | null;
  meta_description: string | null;
  file_path: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  thank_you_message: string;
  instant_download: boolean;
  email_subject: string;
  email_body: string;
  subscriber_tags: string[];
  create_crm_lead: boolean;
  trigger_keywords: string[];
  match_any_post: boolean;
  reply_public_template: string;
  reply_private_template: string;
  reply_fallback_template: string;
  published: boolean;
  view_count: number;
  signup_count: number;
  download_count: number;
  trigger_count: number;
  created_at: string;
};

type Post = {
  id: string;
  lead_magnet_id: string;
  platform: string;
  external_post_id: string;
  label: string | null;
  post_url: string | null;
  linked_at: string;
};

type PostForm = {
  platform: LeadMagnetPlatform;
  external_post_id: string;
  label: string;
  post_url: string;
};

type FormState = {
  id?: string;
  slug: string;
  title: string;
  audience: LeadMagnetAudience;
  headline: string;
  subheadline: string;
  benefits: string; // jedna korzyść na linię
  cta_text: string;
  cover_image_url: string;
  og_image_url: string;
  meta_description: string;
  file_path: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  mime_type: string;
  thank_you_message: string;
  instant_download: boolean;
  email_subject: string;
  email_body: string;
  subscriber_tags: string; // po przecinku
  create_crm_lead: boolean;
  trigger_keywords: string; // po przecinku
  match_any_post: boolean;
  reply_public_template: string;
  reply_private_template: string;
  reply_fallback_template: string;
  published: boolean;
  posts: PostForm[];
};

const emptyForm = (): FormState => ({
  slug: "",
  title: "",
  audience: "klient",
  headline: "",
  subheadline: "",
  benefits: "",
  cta_text: DEFAULT_TEMPLATES.cta,
  cover_image_url: "",
  og_image_url: "",
  meta_description: "",
  file_path: "",
  file_url: "",
  file_name: "",
  file_size: null,
  mime_type: "",
  thank_you_message: DEFAULT_TEMPLATES.thank_you,
  instant_download: true,
  email_subject: DEFAULT_TEMPLATES.email_subject,
  email_body: DEFAULT_TEMPLATES.email_body,
  subscriber_tags: "",
  create_crm_lead: false,
  trigger_keywords: "",
  match_any_post: false,
  reply_public_template: DEFAULT_TEMPLATES.reply_public,
  reply_private_template: DEFAULT_TEMPLATES.reply_private,
  reply_fallback_template: DEFAULT_TEMPLATES.reply_fallback,
  published: false,
  posts: [],
});

const formFromMagnet = (m: Magnet, posts: Post[]): FormState => ({
  id: m.id,
  slug: m.slug,
  title: m.title,
  audience: (m.audience as LeadMagnetAudience) ?? "klient",
  headline: m.headline,
  subheadline: m.subheadline ?? "",
  benefits: (m.benefits ?? []).join("\n"),
  cta_text: m.cta_text,
  cover_image_url: m.cover_image_url ?? "",
  og_image_url: m.og_image_url ?? "",
  meta_description: m.meta_description ?? "",
  file_path: m.file_path ?? "",
  file_url: m.file_url ?? "",
  file_name: m.file_name ?? "",
  file_size: m.file_size ?? null,
  mime_type: m.mime_type ?? "",
  thank_you_message: m.thank_you_message,
  instant_download: m.instant_download,
  email_subject: m.email_subject,
  email_body: m.email_body,
  subscriber_tags: (m.subscriber_tags ?? []).join(", "),
  create_crm_lead: m.create_crm_lead,
  trigger_keywords: (m.trigger_keywords ?? []).join(", "),
  match_any_post: m.match_any_post,
  reply_public_template: m.reply_public_template,
  reply_private_template: m.reply_private_template,
  reply_fallback_template: m.reply_fallback_template,
  published: m.published,
  posts: posts
    .filter((p) => p.lead_magnet_id === m.id)
    .map((p) => ({
      platform: p.platform as LeadMagnetPlatform,
      external_post_id: p.external_post_id,
      label: p.label ?? "",
      post_url: p.post_url ?? "",
    })),
});

function toInput(form: FormState): LeadMagnetInput {
  const lines = (s: string) =>
    s
      .split(/\n+/)
      .map((x) => x.trim())
      .filter(Boolean);
  return {
    id: form.id,
    slug: form.slug.toLowerCase().trim(),
    title: form.title.trim(),
    audience: form.audience,
    headline: form.headline.trim(),
    subheadline: form.subheadline.trim() || undefined,
    benefits: lines(form.benefits),
    cta_text: form.cta_text.trim() || DEFAULT_TEMPLATES.cta,
    cover_image_url: form.cover_image_url.trim(),
    og_image_url: form.og_image_url.trim(),
    meta_description: form.meta_description.trim() || undefined,
    file_path: form.file_path || null,
    file_url: form.file_url.trim(),
    file_name: form.file_name || null,
    file_size: form.file_size,
    mime_type: form.mime_type || null,
    thank_you_message: form.thank_you_message.trim() || DEFAULT_TEMPLATES.thank_you,
    instant_download: form.instant_download,
    email_subject: form.email_subject.trim() || DEFAULT_TEMPLATES.email_subject,
    email_body: form.email_body.trim() || DEFAULT_TEMPLATES.email_body,
    subscriber_tags: parseKeywords(form.subscriber_tags),
    create_crm_lead: form.create_crm_lead,
    trigger_keywords: parseKeywords(form.trigger_keywords),
    match_any_post: form.match_any_post,
    reply_public_template: form.reply_public_template.trim() || DEFAULT_TEMPLATES.reply_public,
    reply_private_template: form.reply_private_template.trim() || DEFAULT_TEMPLATES.reply_private,
    reply_fallback_template:
      form.reply_fallback_template.trim() || DEFAULT_TEMPLATES.reply_fallback,
    published: form.published,
    posts: form.posts
      .filter((p) => p.external_post_id.trim())
      .map((p) => ({
        platform: p.platform,
        external_post_id: p.external_post_id.trim(),
        label: p.label.trim() || undefined,
        post_url: p.post_url.trim(),
      })),
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function copyText(text: string, okMsg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(okMsg);
  } catch {
    toast.error("Schowek niedostępny — skopiuj ręcznie");
  }
}

function LeadMagnetsAdmin() {
  const qc = useQueryClient();
  const listFn = useServerFn(listLeadMagnets);
  const saveFn = useServerFn(saveLeadMagnet);
  const delFn = useServerFn(deleteLeadMagnet);
  const ytFn = useServerFn(runLeadMagnetYoutubeCheck);

  const { data, isLoading } = useQuery({ queryKey: ["lead-magnets"], queryFn: () => listFn() });
  const magnets = (data?.magnets ?? []) as Magnet[];
  const posts = (data?.posts ?? []) as Post[];

  const [editor, setEditor] = useState<FormState | null>(null);
  const [signupsFor, setSignupsFor] = useState<Magnet | null>(null);
  const [triggersFor, setTriggersFor] = useState<Magnet | null>(null);

  const saveMut = useMutation({
    mutationFn: (form: FormState) => saveFn({ data: toInput(form) }),
    onSuccess: () => {
      toast.success("Zapisano");
      setEditor(null);
      qc.invalidateQueries({ queryKey: ["lead-magnets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Usunięto");
      qc.invalidateQueries({ queryKey: ["lead-magnets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ytMut = useMutation({
    mutationFn: () => ytFn(),
    onSuccess: (r) => {
      if (!r.ok) toast.error(r.error ?? "Błąd sprawdzania YouTube");
      else if (r.skipped) toast.info("Brak opublikowanych lead magnetów z filmami YouTube");
      else
        toast.success(
          `YouTube: ${r.videos} filmów, ${r.scanned} nowych komentarzy, ${r.replied} odpowiedzi${r.failed ? `, ${r.failed} błędów` : ""}`,
        );
      qc.invalidateQueries({ queryKey: ["lead-magnets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Lead magnety</h1>
          <p className="text-sm text-muted-foreground">
            Materiał do pobrania w zamian za e-mail — osobno dla klienta pożyczkowego i dla
            inwestora. Komentarz z hasłem pod postem dostaje link automatycznie.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => ytMut.mutate()} disabled={ytMut.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${ytMut.isPending ? "animate-spin" : ""}`} />
            Sprawdź komentarze YouTube
          </Button>
          <Button onClick={() => setEditor(emptyForm())}>
            <Plus className="mr-2 h-4 w-4" /> Nowy lead magnet
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 text-sm md:grid-cols-3">
          <div className="flex gap-3">
            <Gift className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="font-medium">1. Materiał</div>
              <p className="text-muted-foreground">
                Wgraj PDF (albo podaj link), napisz, co jest w środku, wybierz grupę. Strona:
                financeyou.pl/pobierz/&lt;slug&gt;.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <MessageSquare className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="font-medium">2. Post z hasłem</div>
              <p className="text-muted-foreground">
                „Polub i napisz w komentarzu PRZEWODNIK”. Powiąż post (FB / IG / YouTube) —
                komentarz z hasłem dostaje link w wiadomości prywatnej (YouTube: pod komentarzem).
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Users className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="font-medium">3. E-mail → lista</div>
              <p className="text-muted-foreground">
                Na stronie zostawia e-mail i zgodę, dostaje plik od razu i mailem. Trafia do
                subskrybentów z tagami lead-magnet, klient/inwestor i slug.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-muted-foreground">Ładowanie…</div>
      ) : magnets.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Brak lead magnetów. Kliknij „Nowy lead magnet”, żeby zacząć.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {magnets.map((m) => {
            const myPosts = posts.filter((p) => p.lead_magnet_id === m.id);
            const cvr = m.view_count > 0 ? ((m.signup_count / m.view_count) * 100).toFixed(1) : "0";
            const url = leadMagnetUrl(m.slug);
            return (
              <Card key={m.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{m.title}</span>
                      <Badge variant="outline">
                        {AUDIENCE_LABELS[m.audience as LeadMagnetAudience] ?? m.audience}
                      </Badge>
                      {m.published ? (
                        <Badge variant="default">opublikowany</Badge>
                      ) : (
                        <Badge variant="secondary">szkic</Badge>
                      )}
                      {!m.file_path && !m.file_url && (
                        <Badge variant="destructive">brak pliku</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">/pobierz/{m.slug}</div>
                    <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3 w-3" /> {m.view_count} odsłon
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" /> {m.signup_count} zapisów
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Download className="h-3 w-3" /> {m.download_count} pobrań
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> {m.trigger_count} komentarzy z hasłem
                      </span>
                      <span>CVR: {cvr}%</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 text-xs">
                      {m.trigger_keywords.length ? (
                        m.trigger_keywords.map((k) => (
                          <Badge key={k} variant="secondary" className="font-mono">
                            {k}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">bez hasła (każdy komentarz)</span>
                      )}
                      {m.match_any_post && <Badge variant="outline">pod każdym postem</Badge>}
                      <span className="text-muted-foreground">
                        · {myPosts.length} powiązanych postów
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {m.published && (
                      <a href={url} target="_blank" rel="noreferrer">
                        <Button variant="outline" size="sm">
                          <ExternalLink className="mr-1 h-3 w-3" /> Otwórz
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyText(url, "Skopiowano link do strony")}
                    >
                      <Copy className="mr-1 h-3 w-3" /> Link
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSignupsFor(m)}>
                      <Users className="mr-1 h-3 w-3" /> Zapisy
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setTriggersFor(m)}>
                      <MessageSquare className="mr-1 h-3 w-3" /> Komentarze
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditor(formFromMagnet(m, posts))}
                    >
                      Edytuj
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Usunąć „${m.title}”? Razem z zapisami i plikiem.`))
                          delMut.mutate(m.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editor && (
        <EditorDialog
          form={editor}
          setForm={setEditor}
          onSave={() => saveMut.mutate(editor)}
          saving={saveMut.isPending}
        />
      )}
      {signupsFor && <SignupsDialog magnet={signupsFor} onClose={() => setSignupsFor(null)} />}
      {triggersFor && <TriggersDialog magnet={triggersFor} onClose={() => setTriggersFor(null)} />}
    </div>
  );
}

function EditorDialog({
  form,
  setForm,
  onSave,
  saving,
}: {
  form: FormState;
  setForm: (f: FormState | null) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const aiFn = useServerFn(generateLeadMagnetCopy);
  const fileUrlFn = useServerFn(getLeadMagnetFileUrl);
  const [brief, setBrief] = useState("");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm({ ...form, [k]: v });

  const aiMut = useMutation({
    mutationFn: () => aiFn({ data: { brief, audience: form.audience } }),
    onSuccess: (r) => {
      setForm({
        ...form,
        title: r.title || form.title,
        slug: form.slug || slugify(r.title || form.title),
        headline: r.headline || form.headline,
        subheadline: r.subheadline || form.subheadline,
        benefits: r.benefits.length ? r.benefits.join("\n") : form.benefits,
        cta_text: r.cta_text || form.cta_text,
        meta_description: r.meta_description || form.meta_description,
        trigger_keywords: r.trigger_keywords.length
          ? r.trigger_keywords.join(", ")
          : form.trigger_keywords,
      });
      if (r.caption) setCaption(r.caption);
      toast.success("Wygenerowano treść");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const previewMut = useMutation({
    mutationFn: async () => {
      if (form.id && form.file_path) return fileUrlFn({ data: { id: form.id } });
      if (form.file_path) {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(form.file_path, 600);
        if (error) throw new Error(error.message);
        return { url: data?.signedUrl ?? null };
      }
      return { url: form.file_url || null };
    },
    onSuccess: (r) => {
      if (r.url) window.open(r.url, "_blank", "noopener");
      else toast.error("Brak pliku do podglądu");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) {
      toast.error("Plik jest większy niż 50 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = f.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${form.audience}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, f, { contentType: f.type || undefined, upsert: false });
      if (error) throw error;
      if (form.file_path) {
        // Stary plik nie jest już nikomu potrzebny — linki w mailach idą przez token, nie przez ścieżkę.
        await supabase.storage
          .from(BUCKET)
          .remove([form.file_path])
          .catch(() => null);
      }
      setForm({
        ...form,
        file_path: path,
        file_name: f.name,
        file_size: f.size,
        mime_type: f.type || "",
        file_url: "",
      });
      toast.success(`Wgrano ${f.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Błąd uploadu");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const keywords = parseKeywords(form.trigger_keywords);
  const captionPreview =
    caption ||
    suggestedCaption({
      title: form.title || "nasz materiał",
      keyword: keywords[0] ?? null,
      audience: form.audience,
      platform: "facebook",
    });

  const updatePost = (i: number, patch: Partial<PostForm>) =>
    set(
      "posts",
      form.posts.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
    );

  return (
    <Dialog open onOpenChange={(o) => !o && setForm(null)}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edycja lead magnetu" : "Nowy lead magnet"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basics">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="basics">Podstawy</TabsTrigger>
            <TabsTrigger value="content">Treść strony</TabsTrigger>
            <TabsTrigger value="file">Plik</TabsTrigger>
            <TabsTrigger value="email">E-mail</TabsTrigger>
            <TabsTrigger value="social">Automat social</TabsTrigger>
            <TabsTrigger value="posts">Posty ({form.posts.length})</TabsTrigger>
            <TabsTrigger value="ai">AI Copy</TabsTrigger>
          </TabsList>

          <TabsContent value="basics" className="space-y-3 pt-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Tytuł materiału</Label>
                <Input
                  value={form.title}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      title: e.target.value,
                      slug: form.id || form.slug ? form.slug : slugify(e.target.value),
                    })
                  }
                  placeholder="Przewodnik: pożyczka pod nieruchomość krok po kroku"
                />
              </div>
              <div>
                <Label>Slug (URL: /pobierz/…)</Label>
                <Input
                  value={form.slug}
                  onChange={(e) => set("slug", slugify(e.target.value))}
                  placeholder="przewodnik-pozyczka"
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Dla kogo</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.audience}
                  onChange={(e) => set("audience", e.target.value as LeadMagnetAudience)}
                >
                  {LEAD_MAGNET_AUDIENCES.map((a) => (
                    <option key={a} value={a}>
                      {AUDIENCE_LABELS[a]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Subskrybent dostaje tag „{form.audience}” — segmenty mailingu mogą po nim
                  filtrować.
                </p>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={form.published} onCheckedChange={(v) => set("published", v)} />
                <Label>Opublikowany (strona i automat działają)</Label>
              </div>
            </div>
            <div>
              <Label>Meta description (SEO / podgląd linku)</Label>
              <Textarea
                value={form.meta_description}
                onChange={(e) => set("meta_description", e.target.value)}
                maxLength={300}
                rows={2}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Okładka (URL obrazka na stronie)</Label>
                <Input
                  value={form.cover_image_url}
                  onChange={(e) => set("cover_image_url", e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label>OG image (podgląd w social; domyślnie okładka)</Label>
                <Input
                  value={form.og_image_url}
                  onChange={(e) => set("og_image_url", e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="content" className="space-y-3 pt-4">
            <div>
              <Label>Nagłówek (H1)</Label>
              <Textarea
                value={form.headline}
                onChange={(e) => set("headline", e.target.value)}
                rows={2}
                placeholder="Sprawdź, ile możesz pożyczyć pod swoją nieruchomość — zanim złożysz wniosek"
              />
            </div>
            <div>
              <Label>Podnagłówek</Label>
              <Textarea
                value={form.subheadline}
                onChange={(e) => set("subheadline", e.target.value)}
                rows={2}
              />
            </div>
            <div>
              <Label>Co jest w środku (jedna korzyść na linię, do 12)</Label>
              <Textarea
                value={form.benefits}
                onChange={(e) => set("benefits", e.target.value)}
                rows={6}
                placeholder={
                  "Kalkulator LTV i widełki kosztów\nLista dokumentów do wniosku\nNajczęstsze błędy, które blokują wypłatę"
                }
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Tekst przycisku</Label>
                <Input value={form.cta_text} onChange={(e) => set("cta_text", e.target.value)} />
              </div>
              <div>
                <Label>Dodatkowe tagi subskrybenta (po przecinku)</Label>
                <Input
                  value={form.subscriber_tags}
                  onChange={(e) => set("subscriber_tags", e.target.value)}
                  placeholder="webinar-2026, kampania-jesien"
                />
              </div>
            </div>
            <div>
              <Label>Komunikat po zapisie</Label>
              <Textarea
                value={form.thank_you_message}
                onChange={(e) => set("thank_you_message", e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex flex-wrap gap-6 pt-1">
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.instant_download}
                  onCheckedChange={(v) => set("instant_download", v)}
                />
                <Label>Pokaż przycisk pobrania od razu (poza mailem)</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.create_crm_lead}
                  onCheckedChange={(v) => set("create_crm_lead", v)}
                />
                <Label>Twórz też leada w CRM</Label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="file" className="space-y-3 pt-4">
            <div className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    <FileText className="h-4 w-4" />
                    {form.file_name || (form.file_path ? form.file_path : "Brak wgranego pliku")}
                  </div>
                  {form.file_size != null && form.file_size > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {(form.file_size / 1024 / 1024).toFixed(2)} MB · {form.mime_type || "—"}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {(form.file_path || form.file_url) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => previewMut.mutate()}
                      disabled={previewMut.isPending}
                    >
                      <ExternalLink className="mr-1 h-3 w-3" /> Podgląd
                    </Button>
                  )}
                  <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? "Wgrywam…" : form.file_path ? "Zamień plik" : "Wgraj plik"}
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.xlsx,.pptx,.zip,.png,.jpg,.jpeg,.mp4"
                    onChange={onUpload}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Plik leży w prywatnym buckecie — pobranie działa wyłącznie przez osobisty link z
                tokenem (/pobierz-plik/…), więc nikt nie udostępni go dalej bez zapisu.
              </p>
            </div>
            <div>
              <Label>Albo zewnętrzny adres materiału (zamiast pliku)</Label>
              <Input
                value={form.file_url}
                onChange={(e) => set("file_url", e.target.value)}
                placeholder="https://drive.google.com/… albo https://youtu.be/…"
                disabled={Boolean(form.file_path)}
              />
              {form.file_path && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Wgrany plik ma pierwszeństwo. Usuń go, żeby użyć adresu.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      setForm({
                        ...form,
                        file_path: "",
                        file_name: "",
                        file_size: null,
                        mime_type: "",
                      })
                    }
                  >
                    Odłącz plik
                  </button>
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="email" className="space-y-3 pt-4">
            <div>
              <Label>Temat maila</Label>
              <Input
                value={form.email_subject}
                onChange={(e) => set("email_subject", e.target.value)}
              />
            </div>
            <div>
              <Label>Treść maila (tekst; linki stają się klikalne)</Label>
              <Textarea
                value={form.email_body}
                onChange={(e) => set("email_body", e.target.value)}
                rows={10}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Zmienne: {"{imie}"}, {"{tytul}"}, {"{link}"} (osobisty link do pliku), {"{strona}"}{" "}
                (adres strony lead magnetu). Mail dostaje brandowanie Finance You i stopkę z wypisem
                automatycznie.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="social" className="space-y-3 pt-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Hasła w komentarzu (po przecinku)</Label>
                <Input
                  value={form.trigger_keywords}
                  onChange={(e) => set("trigger_keywords", e.target.value)}
                  placeholder="PRZEWODNIK, PDF"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Bez haseł: każdy komentarz pod powiązanym postem dostaje link. Wielkość liter,
                  polskie znaki i „#” nie mają znaczenia.
                </p>
              </div>
              <div className="flex items-start gap-3 pt-6">
                <Switch
                  checked={form.match_any_post}
                  onCheckedChange={(v) => set("match_any_post", v)}
                />
                <div>
                  <Label>Reaguj na hasło pod każdym postem</Label>
                  <p className="text-xs text-muted-foreground">
                    Także pod postami, których nie powiązałeś (wymaga hasła).
                  </p>
                </div>
              </div>
            </div>
            <div>
              <Label>Wiadomość prywatna z linkiem (Facebook / Instagram)</Label>
              <Textarea
                value={form.reply_private_template}
                onChange={(e) => set("reply_private_template", e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Publiczne potwierdzenie pod komentarzem</Label>
                <Textarea
                  value={form.reply_public_template}
                  onChange={(e) => set("reply_public_template", e.target.value)}
                  rows={3}
                />
              </div>
              <div>
                <Label>Publicznie z linkiem (YouTube i gdy DM się nie uda)</Label>
                <Textarea
                  value={form.reply_fallback_template}
                  onChange={(e) => set("reply_fallback_template", e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Zmienne: {"{imie}"}, {"{tytul}"}, {"{link}"}. Polubienia bez komentarza Meta nie
              pozwala odpisać — są tylko liczone w dzienniku. Dlatego post powinien prosić o
              komentarz.
            </p>
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label>Propozycja treści posta</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyText(captionPreview, "Skopiowano treść posta")}
                >
                  <Copy className="mr-1 h-3 w-3" /> Kopiuj
                </Button>
              </div>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{captionPreview}</pre>
            </div>
          </TabsContent>

          <TabsContent value="posts" className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">
              Komentarz pod powiązanym postem dostaje link. Id posta: Facebook — z adresu posta albo
              z „Social Media AI” / Studia publikacji (external_post_id), Instagram — id mediów
              (list_instagram_media), YouTube — id filmu z adresu (po „v=”).
            </p>
            {form.posts.map((p, i) => (
              <div
                key={i}
                className="grid gap-2 rounded-lg border p-3 md:grid-cols-[150px_1fr_1fr_auto]"
              >
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={p.platform}
                  onChange={(e) =>
                    updatePost(i, { platform: e.target.value as LeadMagnetPlatform })
                  }
                >
                  {LEAD_MAGNET_PLATFORMS.map((pl) => (
                    <option key={pl} value={pl}>
                      {PLATFORM_LABELS[pl]}
                    </option>
                  ))}
                </select>
                <Input
                  value={p.external_post_id}
                  onChange={(e) => updatePost(i, { external_post_id: e.target.value })}
                  placeholder={
                    p.platform === "youtube"
                      ? "id filmu, np. dQw4w9WgXcQ"
                      : p.platform === "instagram"
                        ? "id mediów, np. 1789…"
                        : "id posta, np. 1234_5678"
                  }
                />
                <Input
                  value={p.label}
                  onChange={(e) => updatePost(i, { label: e.target.value })}
                  placeholder="Opis (np. post z 6.10)"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    set(
                      "posts",
                      form.posts.filter((_, idx) => idx !== i),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                set("posts", [
                  ...form.posts,
                  { platform: "facebook", external_post_id: "", label: "", post_url: "" },
                ])
              }
            >
              <Plus className="mr-1 h-3 w-3" /> Dodaj post
            </Button>
          </TabsContent>

          <TabsContent value="ai" className="space-y-3 pt-4">
            <div>
              <Label>Brief dla AI</Label>
              <Textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={6}
                placeholder={
                  form.audience === "inwestor"
                    ? "Np. Checklista 12 pytań, które inwestor powinien zadać przed pożyczeniem pod hipotekę: LTV, KW, zabezpieczenia, windykacja, podatki…"
                    : "Np. Przewodnik dla właściciela nieruchomości z negatywnym BIK: jak przygotować dokumenty, czego unikać, ile realnie można pożyczyć…"
                }
              />
            </div>
            <Button onClick={() => aiMut.mutate()} disabled={aiMut.isPending || brief.length < 10}>
              <Sparkles className="mr-2 h-4 w-4" />
              {aiMut.isPending ? "Generuję…" : "Wygeneruj treść"}
            </Button>
            <p className="text-xs text-muted-foreground">
              AI uzupełni tytuł, nagłówek, podnagłówek, korzyści, CTA, meta description i hasła oraz
              zaproponuje treść posta (zakładka „Automat social”). Plik i szablony odpowiedzi
              zostawia w spokoju.
            </p>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => setForm(null)}>
            Anuluj
          </Button>
          <Button onClick={onSave} disabled={saving || uploading}>
            {saving ? "Zapisuję…" : "Zapisz"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SignupsDialog({ magnet, onClose }: { magnet: Magnet; onClose: () => void }) {
  const fn = useServerFn(listLeadMagnetSignups);
  const { data, isLoading } = useQuery({
    queryKey: ["lead-magnet-signups", magnet.id],
    queryFn: () => fn({ data: { lead_magnet_id: magnet.id } }),
  });
  const rows = useMemo(
    () =>
      (data?.signups ?? []) as Array<{
        id: string;
        email: string;
        first_name: string | null;
        source: string | null;
        download_count: number;
        email_sent_at: string | null;
        email_error: string | null;
        created_at: string;
      }>,
    [data],
  );

  const csv = useMemo(() => {
    const headers = [
      "created_at",
      "email",
      "first_name",
      "source",
      "download_count",
      "email_sent_at",
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.created_at,
          r.email,
          r.first_name ?? "",
          r.source ?? "",
          r.download_count,
          r.email_sent_at ?? "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      );
    }
    return lines.join("\n");
  }, [rows]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Zapisy — {magnet.title}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="text-muted-foreground">Ładowanie…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">Brak zapisów</div>
        ) : (
          <>
            <div className="mb-3 flex justify-between text-sm text-muted-foreground">
              <span>{rows.length} zapisów</span>
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
                download={`lead-magnet-${magnet.slug}.csv`}
                className="text-primary hover:underline"
              >
                Pobierz CSV
              </a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Data</th>
                    <th>E-mail</th>
                    <th>Imię</th>
                    <th>Źródło</th>
                    <th>Pobrania</th>
                    <th>Mail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="py-2 text-xs text-muted-foreground">
                        {formatDateTime(r.created_at)}
                      </td>
                      <td>{r.email}</td>
                      <td>{r.first_name ?? "—"}</td>
                      <td>{r.source ?? "—"}</td>
                      <td>{r.download_count}</td>
                      <td className="text-xs">
                        {r.email_sent_at ? (
                          <span className="text-emerald-600">wysłany</span>
                        ) : (
                          <span className="text-destructive" title={r.email_error ?? ""}>
                            błąd
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const REPLY_LABELS: Record<string, string> = {
  sent_both: "DM + komentarz",
  sent_private: "DM",
  sent_public: "komentarz z linkiem",
  failed: "błąd",
  skipped: "bez hasła",
  not_possible: "polubienie",
};

function TriggersDialog({ magnet, onClose }: { magnet: Magnet; onClose: () => void }) {
  const fn = useServerFn(listLeadMagnetTriggers);
  const { data, isLoading } = useQuery({
    queryKey: ["lead-magnet-triggers", magnet.id],
    queryFn: () => fn({ data: { lead_magnet_id: magnet.id, limit: 200 } }),
  });
  const rows = (data?.triggers ?? []) as Array<{
    id: string;
    platform: string;
    kind: string;
    author_name: string | null;
    comment_text: string | null;
    matched: boolean;
    reply_status: string;
    reply_error: string | null;
    created_at: string;
  }>;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Komentarze i reakcje — {magnet.title}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="text-muted-foreground">Ładowanie…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            Jeszcze nic — powiąż post i poproś o komentarz z hasłem.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2">Data</th>
                  <th>Kanał</th>
                  <th>Autor</th>
                  <th>Treść</th>
                  <th>Odpowiedź</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b align-top">
                    <td className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td>{PLATFORM_LABELS[r.platform as LeadMagnetPlatform] ?? r.platform}</td>
                    <td>{r.author_name ?? "—"}</td>
                    <td className="max-w-[18rem] truncate" title={r.comment_text ?? ""}>
                      {r.kind === "reaction" ? `👍 ${r.comment_text ?? "like"}` : r.comment_text}
                    </td>
                    <td className="text-xs">
                      <span
                        className={
                          r.reply_status === "failed"
                            ? "text-destructive"
                            : r.matched
                              ? "text-emerald-600"
                              : "text-muted-foreground"
                        }
                        title={r.reply_error ?? ""}
                      >
                        {REPLY_LABELS[r.reply_status] ?? r.reply_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
