import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/inwestor/szkolenia")({
  component: SzkoleniaInwestor,
});

type TrainingVideo = Database["public"]["Tables"]["training_videos"]["Row"];

function isExternal(url: string) {
  return /youtube\.com|youtu\.be|vimeo\.com/.test(url);
}

function embedUrl(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return url;
}

function extractTrainingPath(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/training-videos\/(.+)$/);
  return m ? m[1] : null;
}

function SzkoleniaInwestor() {
  const [videos, setVideos] = useState<TrainingVideo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [posters, setPosters] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("training_videos")
        .select("*")
        .eq("is_published", true)
        .order("sort_order")
        .order("created_at", { ascending: false });
      const list = data ?? [];
      setVideos(list);
      const urlEntries: Array<[string, string]> = [];
      const posterEntries: Array<[string, string]> = [];
      await Promise.all(
        list.map(async (v) => {
          if (v.external_url) {
            urlEntries.push([v.id, v.external_url]);
          } else if (v.file_path) {
            const { data: signed } = await supabase.storage
              .from("training-videos")
              .createSignedUrl(v.file_path, 60 * 60 * 4);
            if (signed?.signedUrl) urlEntries.push([v.id, signed.signedUrl]);
          }
          const posterPath = extractTrainingPath(v.thumbnail_url);
          if (posterPath) {
            const { data: signed } = await supabase.storage
              .from("training-videos")
              .createSignedUrl(posterPath, 60 * 60 * 4);
            if (signed?.signedUrl) posterEntries.push([v.id, signed.signedUrl]);
          } else if (v.thumbnail_url) {
            posterEntries.push([v.id, v.thumbnail_url]);
          }
        }),
      );
      setUrls(Object.fromEntries(urlEntries));
      setPosters(Object.fromEntries(posterEntries));
    })();
  }, []);

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Wiedza inwestora"
        title="Akademia inwestora"
        subtitle="Szkolenia wideo — wszystko, co musisz wiedzieć o inwestowaniu w pożyczki zabezpieczone."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {videos.map((v) => {
          const url = urls[v.id] ?? null;
          const external = url ? isExternal(url) : false;
          return (
            <Card key={v.id} className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">{v.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {v.description && <p className="text-sm text-muted-foreground">{v.description}</p>}
                {url ? (
                  external ? (
                    <iframe
                      src={embedUrl(url)}
                      className="aspect-video w-full rounded-md border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      src={url}
                      poster={posters[v.id] ?? undefined}
                      controls
                      preload="metadata"
                      playsInline
                      className="aspect-video w-full rounded-md bg-black object-contain"
                    />
                  )
                ) : posters[v.id] ? (
                  <img
                    src={posters[v.id]}
                    alt=""
                    className="aspect-video w-full rounded-md object-cover"
                    loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="aspect-video w-full rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    Materiał wkrótce
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {videos.length === 0 && <div className="text-sm text-muted-foreground">Brak materiałów.</div>}
      </div>
    </div>
  );
}
