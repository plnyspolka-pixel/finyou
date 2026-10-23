import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getYoutubeIntegrationStatus,
  startYoutubeConnect,
  disconnectYoutube,
  listYoutubeQueue,
  listShortSources,
  addYoutubeQueueItem,
  deleteYoutubeQueueItem,
  cancelYoutubeQueueItem,
  retryYoutubeQueueItem,
  publishYoutubeQueueItemNow,
  type YoutubeQueueItem,
} from "@/lib/youtube-shorts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Loader2,
  Youtube,
  Plug,
  Unplug,
  Upload,
  RefreshCw,
  Trash2,
  Ban,
  ExternalLink,
} from "lucide-react";

export const Route = createFileRoute("/admin/youtube-shorts")({
  component: YoutubeShortsPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{(error as Error).message}</div>
  ),
  notFoundComponent: () => <div className="p-6">Nie znaleziono.</div>,
});

const STATUS_LABELS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "Zaplanowany", variant: "secondary" },
  uploading: { label: "Wysyłanie…", variant: "outline" },
  published: { label: "Opublikowany", variant: "default" },
  failed: { label: "Błąd", variant: "destructive" },
  cancelled: { label: "Anulowany", variant: "outline" },
};

function YoutubeShortsPage() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getYoutubeIntegrationStatus);
  const connectFn = useServerFn(startYoutubeConnect);
  const disconnectFn = useServerFn(disconnectYoutube);
  const listFn = useServerFn(listYoutubeQueue);
  const sourcesFn = useServerFn(listShortSources);
  const addFn = useServerFn(addYoutubeQueueItem);
  const deleteFn = useServerFn(deleteYoutubeQueueItem);
  const cancelFn = useServerFn(cancelYoutubeQueueItem);
  const retryFn = useServerFn(retryYoutubeQueueItem);
  const publishNowFn = useServerFn(publishYoutubeQueueItemNow);

  // Wynik powrotu z Google (callback przekierowuje z ?yt=connected|error).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const yt = params.get("yt");
    if (yt === "connected") toast.success("Kanał YouTube połączony!");
    if (yt === "error")
      toast.error(`Połączenie nieudane: ${params.get("reason") ?? "nieznany błąd"}`);
    if (yt) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["yt-status"],
    queryFn: () => statusFn(),
  });
  const { data: queue = [], isLoading: queueLoading } = useQuery({
    queryKey: ["yt-queue"],
    queryFn: () => listFn(),
    refetchInterval: 30_000,
  });
  const { data: sources = [] } = useQuery({
    queryKey: ["yt-sources"],
    queryFn: () => sourcesFn(),
  });

  const connectM = useMutation({
    mutationFn: () => connectFn(),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const disconnectM = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => {
      toast.success("Odłączono kanał");
      qc.invalidateQueries({ queryKey: ["yt-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const [scheduledAt, setScheduledAt] = useState("");

  const addM = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          title,
          description,
          source_video_url: videoUrl,
          privacy_status: privacy,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Dodano do kolejki");
      setTitle("");
      setDescription("");
      setVideoUrl("");
      setScheduledAt("");
      qc.invalidateQueries({ queryKey: ["yt-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rowActionOpts = (okMsg: string) => ({
    onSuccess: () => {
      toast.success(okMsg);
      qc.invalidateQueries({ queryKey: ["yt-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    ...rowActionOpts("Usunięto"),
  });
  const cancelM = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    ...rowActionOpts("Anulowano"),
  });
  const retryM = useMutation({
    mutationFn: (id: string) => retryFn({ data: { id } }),
    ...rowActionOpts("Wpis wróci do kolejki"),
  });
  const publishNowM = useMutation({
    mutationFn: (id: string) => publishNowFn({ data: { id } }),
    ...rowActionOpts("Opublikowano na YouTube!"),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Youtube className="h-6 w-6 text-red-600" />
        <h1 className="text-2xl font-semibold">YouTube Shorts — automatyczna publikacja</h1>
      </div>

      {/* Połączenie */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Połączenie z kanałem YouTube</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : !status?.envConfigured ? (
            <div className="space-y-3 text-sm">
              <p className="font-medium text-destructive">
                Brak konfiguracji — ustaw sekrety YOUTUBE_CLIENT_ID i YOUTUBE_CLIENT_SECRET.
              </p>
              <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
                <li>
                  Wejdź na{" "}
                  <a
                    className="underline"
                    href="https://console.cloud.google.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    console.cloud.google.com
                  </a>{" "}
                  (konto Google będące właścicielem kanału) i utwórz projekt, np. „FinanceYou
                  Shorts".
                </li>
                <li>
                  W „APIs &amp; Services → Library" włącz <b>YouTube Data API v3</b>.
                </li>
                <li>
                  W „OAuth consent screen" skonfiguruj aplikację (typ External), dodaj scope{" "}
                  <code>youtube.upload</code> i <code>youtube.readonly</code>, a potem przełącz na{" "}
                  <b>In production</b> (w trybie Testing refresh token wygasa co 7 dni).
                </li>
                <li>
                  W „Credentials" utwórz <b>OAuth Client ID</b> typu „Web application" z redirect
                  URI:{" "}
                  <code className="break-all rounded bg-muted px-1">{status?.redirectUri}</code>
                </li>
                <li>
                  Skopiuj Client ID i Client Secret do sekretów środowiska jako{" "}
                  <code>YOUTUBE_CLIENT_ID</code> i <code>YOUTUBE_CLIENT_SECRET</code>, po czym wróć
                  tutaj i kliknij „Połącz z YouTube".
                </li>
              </ol>
              <p className="text-muted-foreground">
                Uwaga: aby uploady były publiczne, projekt musi przejść weryfikację/audyt YouTube
                API (formularz zgodności) — do tego czasu YouTube może blokować filmy jako prywatne.
              </p>
            </div>
          ) : status.connected ? (
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="font-medium">
                  Połączono z kanałem: {status.channelTitle ?? status.channelId ?? "(nieznany)"}
                </p>
                {status.connectedAt && (
                  <p className="text-sm text-muted-foreground">
                    od {new Date(status.connectedAt).toLocaleString("pl-PL")}
                  </p>
                )}
                {status.lastError && (
                  <p className="text-sm text-destructive">Ostatni błąd: {status.lastError}</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnectM.mutate()}
                disabled={disconnectM.isPending}
              >
                <Unplug className="mr-1 h-4 w-4" /> Odłącz
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Konfiguracja gotowa. Kliknij, zaloguj się na konto właściciela kanału i zatwierdź
                dostęp — połączenie robi się raz.
              </p>
              <Button onClick={() => connectM.mutate()} disabled={connectM.isPending}>
                {connectM.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Plug className="mr-1 h-4 w-4" />
                )}
                Połącz z YouTube
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dodawanie do kolejki */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Dodaj short do kolejki</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Tytuł (dodamy #Shorts automatycznie)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={92} />
            </div>
            <div className="space-y-2">
              <Label>URL pliku MP4 (pionowe wideo, do 3 minut)</Label>
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
                    const s = sources.find((x) => x.id === e.target.value);
                    if (s) {
                      setVideoUrl(s.video_url);
                      if (!title) setTitle(s.question.slice(0, 92));
                    }
                  }}
                >
                  <option value="">…lub wybierz gotowe wideo z Awatar FAQ</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.question}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Opis</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Publikacja (puste = najbliższy przebieg)</Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Widoczność</Label>
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
            <div className="flex items-end">
              <Button
                onClick={() => addM.mutate()}
                disabled={addM.isPending || !title.trim() || !videoUrl.trim()}
              >
                {addM.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1 h-4 w-4" />
                )}
                Dodaj do kolejki
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Limit YouTube API: ok. 6 uploadów na dobę (1600 z 10 000 jednostek za sztukę). Cron
            publikuje maks. 2 shorty co 10 minut.
          </p>
        </CardContent>
      </Card>

      {/* Kolejka */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Kolejka publikacji</CardTitle>
        </CardHeader>
        <CardContent>
          {queueLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Kolejka jest pusta.</p>
          ) : (
            <div className="space-y-3">
              {queue.map((item: YoutubeQueueItem) => {
                const st = STATUS_LABELS[item.status] ?? {
                  label: item.status,
                  variant: "outline" as const,
                };
                return (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={st.variant}>{st.label}</Badge>
                        <span className="truncate font-medium">{item.title}</span>
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
                      {item.status === "pending" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => publishNowM.mutate(item.id)}
                            disabled={publishNowM.isPending || !status?.connected}
                          >
                            <Upload className="mr-1 h-4 w-4" /> Publikuj teraz
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => cancelM.mutate(item.id)}
                            disabled={cancelM.isPending}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {(item.status === "failed" || item.status === "cancelled") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => retryM.mutate(item.id)}
                          disabled={retryM.isPending}
                        >
                          <RefreshCw className="mr-1 h-4 w-4" /> Ponów
                        </Button>
                      )}
                      {item.status !== "uploading" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteM.mutate(item.id)}
                          disabled={deleteM.isPending}
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
    </div>
  );
}
