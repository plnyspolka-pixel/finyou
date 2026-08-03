// Panel pipeline'u YouTube (moduł 5 promptu SEO): artykuł → scenariusz →
// render (adapter HeyGen albo ręcznie) → upload przez moduł YouTube → embed.
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listVideoPipeline,
  enqueueVideoSource,
  generateVideoScriptFn,
  startVideoRenderFn,
  enqueueVideoUploadFn,
  updateVideoPipelineItem,
  type VideoPipelineItem,
} from "@/lib/video-pipeline.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Clapperboard, ExternalLink, FileText, Loader2, Upload, Youtube } from "lucide-react";

export const Route = createFileRoute("/admin/video-pipeline")({
  component: VideoPipelinePage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-destructive">{(error as Error).message}</div>
  ),
});

const STATUS_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  queued: { label: "W kolejce", variant: "secondary" },
  script_ready: { label: "Scenariusz gotowy", variant: "outline" },
  rendering: { label: "Renderowanie…", variant: "outline" },
  rendered: { label: "Zrenderowany", variant: "default" },
  publish_queued: { label: "W kolejce YouTube", variant: "outline" },
  published: { label: "Opublikowany", variant: "default" },
  failed: { label: "Błąd", variant: "destructive" },
};

function PipelineCard({ item }: { item: VideoPipelineItem }) {
  const qc = useQueryClient();
  const scriptFn = useServerFn(generateVideoScriptFn);
  const renderFn = useServerFn(startVideoRenderFn);
  const uploadFn = useServerFn(enqueueVideoUploadFn);
  const updateFn = useServerFn(updateVideoPipelineItem);
  const [showScript, setShowScript] = useState(false);
  const [manualUrl, setManualUrl] = useState("");

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["video-pipeline"] });
  const onErr = (e: Error) => toast.error(e.message);

  const scriptMut = useMutation({
    mutationFn: () => scriptFn({ data: { id: item.id } }),
    onSuccess: () => {
      toast.success("Scenariusz wygenerowany");
      invalidate();
    },
    onError: onErr,
  });
  const renderMut = useMutation({
    mutationFn: () => renderFn({ data: { id: item.id } }),
    onSuccess: (r: { skipped?: string }) => {
      toast[r.skipped ? "info" : "success"](r.skipped ?? "Render wystartował");
      invalidate();
    },
    onError: onErr,
  });
  const uploadMut = useMutation({
    mutationFn: () => uploadFn({ data: { id: item.id } }),
    onSuccess: () => {
      toast.success("Dodano do kolejki YouTube");
      invalidate();
    },
    onError: onErr,
  });
  const manualMut = useMutation({
    mutationFn: () => updateFn({ data: { id: item.id, status: "rendered", video_url: manualUrl } }),
    onSuccess: () => {
      toast.success("Oznaczono jako zrenderowane");
      invalidate();
    },
    onError: onErr,
  });

  const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.queued;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm leading-snug">
              {item.yt_title ?? item.source_title}
            </CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={badge.variant}>{badge.label}</Badge>
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-accent hover:underline"
              >
                źródło <ExternalLink size={12} />
              </a>
              {item.youtube_video_id && (
                <a
                  href={`https://www.youtube.com/watch?v=${item.youtube_video_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  <Youtube size={12} /> film
                </a>
              )}
            </div>
            {item.last_error && <p className="mt-1 text-xs text-destructive">{item.last_error}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {item.status === "queued" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => scriptMut.mutate()}
                disabled={scriptMut.isPending}
              >
                {scriptMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                Generuj scenariusz
              </Button>
            )}
            {item.status === "script_ready" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => renderMut.mutate()}
                disabled={renderMut.isPending}
              >
                {renderMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Clapperboard className="h-4 w-4" />
                )}
                Renderuj (HeyGen)
              </Button>
            )}
            {item.status === "rendered" && (
              <Button size="sm" onClick={() => uploadMut.mutate()} disabled={uploadMut.isPending}>
                {uploadMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Wyślij do YouTube
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {item.script_md && (
        <CardContent className="space-y-2 pt-0">
          <Button
            size="sm"
            variant="link"
            className="px-0"
            onClick={() => setShowScript((v) => !v)}
          >
            {showScript ? "Ukryj scenariusz" : "Pokaż scenariusz i opis"}
          </Button>
          {showScript && (
            <div className="space-y-2">
              {item.yt_title_options?.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Propozycje tytułów: {item.yt_title_options.join(" • ")}
                </p>
              )}
              <Textarea value={item.script_md ?? ""} readOnly rows={12} />
              <Textarea value={item.yt_description ?? ""} readOnly rows={5} />
              {item.yt_tags?.length > 0 && (
                <p className="text-xs text-muted-foreground">Tagi: {item.yt_tags.join(", ")}</p>
              )}
            </div>
          )}
          {item.status === "script_ready" && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="URL gotowego MP4 (render ręczny)"
                className="max-w-md"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => manualMut.mutate()}
                disabled={manualMut.isPending || !manualUrl}
              >
                Oznacz jako zrenderowane
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function VideoPipelinePage() {
  const listFn = useServerFn(listVideoPipeline);
  const enqueueFn = useServerFn(enqueueVideoSource);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["video-pipeline"],
    queryFn: () => listFn(),
  });

  const enqueueMut = useMutation({
    mutationFn: (slug: string) => enqueueFn({ data: { slug } }),
    onSuccess: () => {
      toast.success("Dodano artykuł do pipeline'u");
      void qc.invalidateQueries({ queryKey: ["video-pipeline"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = data?.items ?? [];
  const sources = data?.sources ?? [];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Pipeline YouTube — treść → wideo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Z opublikowanego artykułu powstaje scenariusz (5–8 min), render przez HeyGen (albo
          ręcznie, gdy brak kluczy), upload przez moduł YouTube i automatyczny embed na stronie
          źródłowej. Automatyczny upload tylko za flagą env VIDEO_PIPELINE_AUTO_UPLOAD=1.
        </p>
      </div>

      {sources.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dodaj artykuł do pipeline'u</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {sources.slice(0, 10).map((s) => (
              <Button
                key={s.slug}
                size="sm"
                variant="outline"
                onClick={() => enqueueMut.mutate(s.slug)}
                disabled={enqueueMut.isPending}
                title={s.title}
                className="max-w-xs truncate"
              >
                {s.title}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Pipeline jest pusty — dodaj opublikowany artykuł powyżej.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <PipelineCard key={i.id} item={i} />
          ))}
        </div>
      )}
    </div>
  );
}
