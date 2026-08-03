// Studio publikacji — jedno miejsce do: publikacji wideo (YouTube / Instagram
// Reels / Facebook Reels / post na Facebooku), generowania wideo HeyGen
// z promptu, generatora promptów i generatora grafik AI.
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getStudioStatus,
  listSocialQueue,
  enqueueStudioPublish,
  deleteSocialQueueItem,
  cancelSocialQueueItem,
  retrySocialQueueItem,
  publishSocialQueueItemNow,
  listStudioVideoSources,
  listStudioVideoJobs,
  generateStudioScript,
  startStudioVideo,
  pollStudioVideoJob,
  deleteStudioVideoJob,
  generateStudioPrompts,
  listStudioImages,
  generateStudioImageFn,
  deleteStudioImage,
  type StudioPlatform,
  type StudioVideoJob,
} from "@/lib/studio.functions";
import { listYoutubeQueue, type YoutubeQueueItem } from "@/lib/youtube-shorts.functions";
import { HEYGEN_AVATARS, FILIP_VOICE_ID } from "@/lib/heygen-avatars";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Loader2,
  Clapperboard,
  Upload,
  RefreshCw,
  Trash2,
  Ban,
  ExternalLink,
  Sparkles,
  ImageIcon,
  Video,
  Wand2,
  Copy,
  Send,
} from "lucide-react";

export const Route = createFileRoute("/admin/studio-publikacji")({
  component: StudioPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{(error as Error).message}</div>
  ),
  notFoundComponent: () => <div className="p-6">Nie znaleziono.</div>,
});

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube Short",
  facebook_post: "Post na Facebooku",
  facebook_reels: "Facebook Reels",
  instagram_reels: "Instagram Reels",
};

const STATUS_LABELS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "Zaplanowany", variant: "secondary" },
  publishing: { label: "Publikowanie…", variant: "outline" },
  uploading: { label: "Wysyłanie…", variant: "outline" },
  processing: { label: "Przetwarzanie (Meta)…", variant: "outline" },
  published: { label: "Opublikowany", variant: "default" },
  failed: { label: "Błąd", variant: "destructive" },
  cancelled: { label: "Anulowany", variant: "outline" },
};

const VIDEO_STATUS_LABELS: Record<string, string> = {
  pending: "Oczekuje",
  generating_audio: "Generuję lektora…",
  uploading: "Wysyłam audio…",
  rendering: "Renderowanie w HeyGen…",
  ready: "Gotowe",
  failed: "Błąd",
};

function externalUrl(platform: string, externalId: string | null): string | null {
  if (!externalId) return null;
  if (platform === "facebook_post" || platform === "facebook_reels") {
    return `https://www.facebook.com/${externalId}`;
  }
  return null;
}

function StudioPage() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getStudioStatus);
  const socialQueueFn = useServerFn(listSocialQueue);
  const ytQueueFn = useServerFn(listYoutubeQueue);
  const enqueueFn = useServerFn(enqueueStudioPublish);
  const deleteQFn = useServerFn(deleteSocialQueueItem);
  const cancelQFn = useServerFn(cancelSocialQueueItem);
  const retryQFn = useServerFn(retrySocialQueueItem);
  const publishNowFn = useServerFn(publishSocialQueueItemNow);
  const sourcesFn = useServerFn(listStudioVideoSources);
  const videoJobsFn = useServerFn(listStudioVideoJobs);
  const genScriptFn = useServerFn(generateStudioScript);
  const startVideoFn = useServerFn(startStudioVideo);
  const pollVideoFn = useServerFn(pollStudioVideoJob);
  const deleteVideoFn = useServerFn(deleteStudioVideoJob);
  const genPromptsFn = useServerFn(generateStudioPrompts);
  const imagesFn = useServerFn(listStudioImages);
  const genImageFn = useServerFn(generateStudioImageFn);
  const deleteImageFn = useServerFn(deleteStudioImage);

  const [tab, setTab] = useState("publikacja");

  const { data: status } = useQuery({ queryKey: ["studio-status"], queryFn: () => statusFn() });
  const { data: socialQueue = [] } = useQuery({
    queryKey: ["studio-social-queue"],
    queryFn: () => socialQueueFn(),
    refetchInterval: 30_000,
  });
  const { data: ytQueue = [] } = useQuery({
    queryKey: ["yt-queue"],
    queryFn: () => ytQueueFn(),
    refetchInterval: 30_000,
  });
  const { data: sources = [] } = useQuery({
    queryKey: ["studio-sources"],
    queryFn: () => sourcesFn(),
  });
  const { data: videoJobs = [] } = useQuery({
    queryKey: ["studio-video-jobs"],
    queryFn: () => videoJobsFn(),
    refetchInterval: 20_000,
  });
  const { data: images = [] } = useQuery({
    queryKey: ["studio-images"],
    queryFn: () => imagesFn(),
  });

  // Automatyczny polling HeyGen dla jobów w trakcie renderowania.
  useEffect(() => {
    const rendering = videoJobs.filter((j) => j.status === "rendering");
    if (!rendering.length) return;
    const t = setInterval(() => {
      rendering.forEach((j) =>
        pollVideoFn({ data: { id: j.id } })
          .then(() => qc.invalidateQueries({ queryKey: ["studio-video-jobs"] }))
          .catch(() => {}),
      );
    }, 15_000);
    return () => clearInterval(t);
  }, [videoJobs, pollVideoFn, qc]);

  // ── Publikacja ─────────────────────────────────────────────────────────────
  const [platforms, setPlatforms] = useState<StudioPlatform[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const [scheduledAt, setScheduledAt] = useState("");

  const togglePlatform = (p: StudioPlatform) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const enqueueM = useMutation({
    mutationFn: () =>
      enqueueFn({
        data: {
          platforms,
          title,
          message,
          video_url: videoUrl || undefined,
          image_url: imageUrl || undefined,
          privacy_status: privacy,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Dodano do kolejki (${r.queued} platform)`);
      qc.invalidateQueries({ queryKey: ["studio-social-queue"] });
      qc.invalidateQueries({ queryKey: ["yt-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rowActionOpts = (okMsg: string) => ({
    onSuccess: () => {
      toast.success(okMsg);
      qc.invalidateQueries({ queryKey: ["studio-social-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteQM = useMutation({
    mutationFn: (id: string) => deleteQFn({ data: { id } }),
    ...rowActionOpts("Usunięto"),
  });
  const cancelQM = useMutation({
    mutationFn: (id: string) => cancelQFn({ data: { id } }),
    ...rowActionOpts("Anulowano"),
  });
  const retryQM = useMutation({
    mutationFn: (id: string) => retryQFn({ data: { id } }),
    ...rowActionOpts("Wpis wróci do kolejki"),
  });
  const publishNowM = useMutation({
    mutationFn: (id: string) => publishNowFn({ data: { id } }),
    ...rowActionOpts("Publikacja uruchomiona"),
  });

  // ── Wideo AI ───────────────────────────────────────────────────────────────
  const [videoPrompt, setVideoPrompt] = useState("");
  const [script, setScript] = useState("");
  const [avatarId, setAvatarId] = useState(HEYGEN_AVATARS[0].id);

  const genScriptM = useMutation({
    mutationFn: () => genScriptFn({ data: { prompt: videoPrompt } }),
    onSuccess: (r) => {
      setScript(r.script);
      if (r.title && !title) setTitle(r.title);
      if (r.description && !message) setMessage([r.description, r.hashtags.join(" ")].join("\n\n"));
      toast.success("Scenariusz gotowy — możesz go edytować przed generacją");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const startVideoM = useMutation({
    mutationFn: () =>
      startVideoFn({
        data: { prompt: videoPrompt, script, avatar_id: avatarId, voice_id: FILIP_VOICE_ID },
      }),
    onSuccess: () => {
      toast.success("Generacja wideo uruchomiona — status w tabeli poniżej");
      qc.invalidateQueries({ queryKey: ["studio-video-jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteVideoM = useMutation({
    mutationFn: (id: string) => deleteVideoFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Usunięto");
      qc.invalidateQueries({ queryKey: ["studio-video-jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyVideoToPublish = (url: string) => {
    setVideoUrl(url);
    setTab("publikacja");
    toast.success("Wideo podstawione do formularza publikacji");
  };

  // ── Prompty ────────────────────────────────────────────────────────────────
  const [promptTopic, setPromptTopic] = useState("");
  const [promptKind, setPromptKind] = useState<"video" | "image" | "social">("video");
  const [promptIdeas, setPromptIdeas] = useState<string[]>([]);

  const genPromptsM = useMutation({
    mutationFn: () => genPromptsFn({ data: { topic: promptTopic, kind: promptKind } }),
    onSuccess: (r) => setPromptIdeas(r.prompts),
    onError: (e: Error) => toast.error(e.message),
  });

  const applyPromptIdea = (p: string) => {
    if (promptKind === "image") {
      setImagePrompt(p);
      setTab("grafiki");
    } else {
      setVideoPrompt(p);
      setTab("wideo");
    }
    toast.success("Prompt podstawiony");
  };

  // ── Grafiki ────────────────────────────────────────────────────────────────
  const [imagePrompt, setImagePrompt] = useState("");

  const genImageM = useMutation({
    mutationFn: () => genImageFn({ data: { prompt: imagePrompt } }),
    onSuccess: () => {
      toast.success("Grafika wygenerowana");
      qc.invalidateQueries({ queryKey: ["studio-images"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteImageM = useMutation({
    mutationFn: (id: string) => deleteImageFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Usunięto");
      qc.invalidateQueries({ queryKey: ["studio-images"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyImageToPublish = (url: string) => {
    setImageUrl(url);
    if (!platforms.includes("facebook_post")) togglePlatform("facebook_post");
    setTab("publikacja");
    toast.success("Grafika podstawiona do posta na Facebooku");
  };

  const needsVideo = platforms.some((p) => p !== "facebook_post");

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Clapperboard className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold">Studio publikacji</h1>
      </div>

      {status && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant={status.youtubeConnected ? "default" : "outline"}>
            YouTube {status.youtubeConnected ? "połączony" : "niepołączony"}
          </Badge>
          <Badge variant={status.facebookConfigured ? "default" : "outline"}>
            Facebook {status.facebookConfigured ? "skonfigurowany" : "brak konfiguracji"}
          </Badge>
          <Badge variant={status.instagramConfigured ? "default" : "outline"}>
            Instagram {status.instagramConfigured ? "skonfigurowany" : "brak konfiguracji"}
          </Badge>
          <Badge variant={status.heygenConfigured ? "default" : "outline"}>
            HeyGen {status.heygenConfigured ? "OK" : "brak klucza"}
          </Badge>
          <Badge variant={status.aiConfigured ? "default" : "outline"}>
            AI {status.aiConfigured ? "OK" : "brak klucza"}
          </Badge>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="publikacja">
            <Send className="mr-1 h-4 w-4" /> Publikacja
          </TabsTrigger>
          <TabsTrigger value="wideo">
            <Video className="mr-1 h-4 w-4" /> Wideo AI (HeyGen)
          </TabsTrigger>
          <TabsTrigger value="grafiki">
            <ImageIcon className="mr-1 h-4 w-4" /> Grafiki AI
          </TabsTrigger>
          <TabsTrigger value="prompty">
            <Wand2 className="mr-1 h-4 w-4" /> Generator promptów
          </TabsTrigger>
        </TabsList>

        {/* ── PUBLIKACJA ─────────────────────────────────────────────────── */}
        <TabsContent value="publikacja" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Opublikuj na wielu platformach naraz</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4">
                {(["youtube", "instagram_reels", "facebook_reels", "facebook_post"] as const).map(
                  (p) => (
                    <label key={p} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={platforms.includes(p)}
                        onCheckedChange={() => togglePlatform(p)}
                      />
                      {PLATFORM_LABELS[p]}
                    </label>
                  ),
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tytuł (YouTube / wideo na FB)</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={92} />
                </div>
                <div className="space-y-2">
                  <Label>URL wideo MP4 (pion 9:16 dla Reels/Shorts)</Label>
                  <Input
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://…"
                  />
                  {sources.length > 0 && (
                    <select
                      className="w-full rounded-md border bg-background p-2 text-sm"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setVideoUrl(e.target.value);
                      }}
                    >
                      <option value="">…lub wybierz wygenerowane wideo</option>
                      {sources.map((s) => (
                        <option key={s.video_url} value={s.video_url}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Treść / opis (opis filmu, caption Reels, treść posta)</Label>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Grafika do posta FB (opcjonalnie)</Label>
                  <Input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://…"
                  />
                  {images.length > 0 && (
                    <select
                      className="w-full rounded-md border bg-background p-2 text-sm"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) setImageUrl(e.target.value);
                      }}
                    >
                      <option value="">…lub wybierz wygenerowaną grafikę</option>
                      {images.map((im) => (
                        <option key={im.id} value={im.image_url}>
                          {im.prompt.slice(0, 80)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Publikacja (puste = najbliższy przebieg)</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Widoczność (YouTube)</Label>
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={privacy}
                    onChange={(e) => setPrivacy(e.target.value as typeof privacy)}
                  >
                    <option value="public">Publiczny</option>
                    <option value="unlisted">Niepubliczny (unlisted)</option>
                    <option value="private">Prywatny</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => enqueueM.mutate()}
                  disabled={
                    enqueueM.isPending || !platforms.length || (needsVideo && !videoUrl.trim())
                  }
                >
                  {enqueueM.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1 h-4 w-4" />
                  )}
                  Dodaj do kolejki publikacji
                </Button>
                <p className="text-xs text-muted-foreground">
                  Cron publikuje co 10 minut. Uwaga: URL-e wideo z HeyGen wygasają — przy publikacji
                  planowanej z wyprzedzeniem wgraj plik do Storage.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Kolejka publikacji</CardTitle>
            </CardHeader>
            <CardContent>
              {socialQueue.length === 0 && ytQueue.length === 0 ? (
                <p className="text-sm text-muted-foreground">Kolejka jest pusta.</p>
              ) : (
                <div className="space-y-3">
                  {ytQueue.map((item: YoutubeQueueItem) => {
                    const st = STATUS_LABELS[item.status] ?? {
                      label: item.status,
                      variant: "outline" as const,
                    };
                    return (
                      <div
                        key={`yt-${item.id}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">YouTube Short</Badge>
                            <Badge variant={st.variant}>{st.label}</Badge>
                            <span className="truncate font-medium">{item.title}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {item.status === "published" && item.published_at
                              ? `Opublikowano ${new Date(item.published_at).toLocaleString("pl-PL")}`
                              : `Plan: ${new Date(item.scheduled_at).toLocaleString("pl-PL")}`}
                          </p>
                          {item.last_error && (
                            <p className="break-all text-xs text-destructive">{item.last_error}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {item.youtube_video_id && (
                            <a
                              href={`https://www.youtube.com/shorts/${item.youtube_video_id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Button variant="outline" size="sm">
                                <ExternalLink className="mr-1 h-4 w-4" /> Zobacz
                              </Button>
                            </a>
                          )}
                          <a href="/admin/youtube-shorts">
                            <Button variant="ghost" size="sm">
                              Zarządzaj
                            </Button>
                          </a>
                        </div>
                      </div>
                    );
                  })}

                  {socialQueue.map((item) => {
                    const st = STATUS_LABELS[item.status] ?? {
                      label: item.status,
                      variant: "outline" as const,
                    };
                    const link = externalUrl(item.platform, item.external_post_id);
                    return (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {PLATFORM_LABELS[item.platform] ?? item.platform}
                            </Badge>
                            <Badge variant={st.variant}>{st.label}</Badge>
                            <span className="truncate font-medium">
                              {item.title || item.message.slice(0, 60) || "(bez tytułu)"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {item.status === "published" && item.published_at
                              ? `Opublikowano ${new Date(item.published_at).toLocaleString("pl-PL")}`
                              : `Plan: ${new Date(item.scheduled_at).toLocaleString("pl-PL")}`}
                            {item.attempt_count > 0 && ` • próby: ${item.attempt_count}`}
                          </p>
                          {item.last_error && (
                            <p className="break-all text-xs text-destructive">{item.last_error}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {link && (
                            <a href={link} target="_blank" rel="noreferrer">
                              <Button variant="outline" size="sm">
                                <ExternalLink className="mr-1 h-4 w-4" /> Zobacz
                              </Button>
                            </a>
                          )}
                          {item.status === "pending" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => publishNowM.mutate(item.id)}
                                disabled={publishNowM.isPending}
                              >
                                <Upload className="mr-1 h-4 w-4" /> Publikuj teraz
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => cancelQM.mutate(item.id)}
                                disabled={cancelQM.isPending}
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {(item.status === "failed" || item.status === "cancelled") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => retryQM.mutate(item.id)}
                              disabled={retryQM.isPending}
                            >
                              <RefreshCw className="mr-1 h-4 w-4" /> Ponów
                            </Button>
                          )}
                          {item.status !== "publishing" && item.status !== "processing" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteQM.mutate(item.id)}
                              disabled={deleteQM.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── WIDEO AI ───────────────────────────────────────────────────── */}
        <TabsContent value="wideo" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Wygeneruj wideo HeyGen z promptu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Prompt (o czym ma być wideo)</Label>
                <Textarea
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  rows={2}
                  placeholder="np. Dlaczego pożyczka pod nieruchomość bywa szybsza niż kredyt bankowy"
                />
                <Button
                  variant="outline"
                  onClick={() => genScriptM.mutate()}
                  disabled={genScriptM.isPending || !videoPrompt.trim()}
                >
                  {genScriptM.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-4 w-4" />
                  )}
                  Wygeneruj scenariusz
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Scenariusz (tekst mówiony — możesz edytować)</Label>
                <Textarea value={script} onChange={(e) => setScript(e.target.value)} rows={6} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Awatar</Label>
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={avatarId}
                    onChange={(e) => setAvatarId(e.target.value)}
                  >
                    {HEYGEN_AVATARS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} — {a.description}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => startVideoM.mutate()}
                    disabled={startVideoM.isPending || !script.trim()}
                  >
                    {startVideoM.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Video className="mr-1 h-4 w-4" />
                    )}
                    Generuj wideo
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Pipeline: scenariusz → lektor ElevenLabs → awatar HeyGen (pion 9:16, 720p).
                Renderowanie trwa zwykle 2-10 minut; status odświeża się automatycznie.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Wygenerowane wideo</CardTitle>
            </CardHeader>
            <CardContent>
              {videoJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak wygenerowanych wideo.</p>
              ) : (
                <div className="space-y-3">
                  {videoJobs.map((j: StudioVideoJob) => (
                    <div
                      key={j.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              j.status === "ready"
                                ? "default"
                                : j.status === "failed"
                                  ? "destructive"
                                  : "outline"
                            }
                          >
                            {VIDEO_STATUS_LABELS[j.status] ?? j.status}
                          </Badge>
                          <span className="truncate font-medium">{j.prompt.slice(0, 90)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(j.created_at).toLocaleString("pl-PL")}
                        </p>
                        {j.last_error && (
                          <p className="break-all text-xs text-destructive">{j.last_error}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {j.video_url && (
                          <>
                            <a href={j.video_url} target="_blank" rel="noreferrer">
                              <Button variant="outline" size="sm">
                                <ExternalLink className="mr-1 h-4 w-4" /> Podgląd
                              </Button>
                            </a>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => applyVideoToPublish(j.video_url!)}
                            >
                              <Send className="mr-1 h-4 w-4" /> Publikuj
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteVideoM.mutate(j.id)}
                          disabled={deleteVideoM.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── GRAFIKI ────────────────────────────────────────────────────── */}
        <TabsContent value="grafiki" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Wygeneruj grafikę z promptu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Prompt (najlepiej po angielsku — opis sceny, stylu, kolorów)</Label>
                <Textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  rows={3}
                  placeholder="np. Modern flat illustration of a house with rising coins, navy and gold palette, no text"
                />
              </div>
              <Button
                onClick={() => genImageM.mutate()}
                disabled={genImageM.isPending || !imagePrompt.trim()}
              >
                {genImageM.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-4 w-4" />
                )}
                Generuj grafikę
              </Button>
              <p className="text-xs text-muted-foreground">
                Grafiki zapisują się w Supabase Storage (bucket studio-media) z trwałym publicznym
                URL — od razu gotowe do posta na Facebooku.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Galeria</CardTitle>
            </CardHeader>
            <CardContent>
              {images.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak wygenerowanych grafik.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {images.map((im) => (
                    <div key={im.id} className="space-y-2 rounded-lg border p-3">
                      <img
                        src={im.image_url}
                        alt={im.prompt}
                        className="aspect-square w-full rounded-md object-cover"
                        loading="lazy"
                      />
                      <p className="line-clamp-2 text-xs text-muted-foreground">{im.prompt}</p>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => applyImageToPublish(im.image_url)}
                        >
                          <Send className="mr-1 h-4 w-4" /> Do posta
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(im.image_url);
                            toast.success("Skopiowano URL");
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteImageM.mutate(im.id)}
                          disabled={deleteImageM.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PROMPTY ────────────────────────────────────────────────────── */}
        <TabsContent value="prompty" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Generator promptów</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2 md:col-span-2">
                  <Label>Temat / obszar</Label>
                  <Input
                    value={promptTopic}
                    onChange={(e) => setPromptTopic(e.target.value)}
                    placeholder="np. pożyczki pod zastaw nieruchomości dla firm"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rodzaj promptów</Label>
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={promptKind}
                    onChange={(e) => setPromptKind(e.target.value as typeof promptKind)}
                  >
                    <option value="video">Wideo (Shorts/Reels)</option>
                    <option value="image">Grafiki AI</option>
                    <option value="social">Posty social media</option>
                  </select>
                </div>
              </div>
              <Button
                onClick={() => genPromptsM.mutate()}
                disabled={genPromptsM.isPending || !promptTopic.trim()}
              >
                {genPromptsM.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-1 h-4 w-4" />
                )}
                Generuj prompty
              </Button>

              {promptIdeas.length > 0 && (
                <div className="space-y-2">
                  {promptIdeas.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3"
                    >
                      <p className="flex-1 text-sm">{p}</p>
                      <div className="flex shrink-0 items-center gap-1">
                        {promptKind !== "social" && (
                          <Button variant="outline" size="sm" onClick={() => applyPromptIdea(p)}>
                            <Send className="mr-1 h-4 w-4" /> Użyj
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(p);
                            toast.success("Skopiowano");
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Prompty na posty social wykorzystasz w module{" "}
                <a className="underline" href="/admin/marketing/social">
                  Social Media AI
                </a>
                .
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
