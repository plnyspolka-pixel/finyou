import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/inwestor/szkolenia")({
  component: SzkoleniaInwestor,
});

type TrainingVideo = Database["public"]["Tables"]["training_videos"]["Row"];

function videoUrl(v: TrainingVideo): string | null {
  if (v.external_url) return v.external_url;
  if (v.file_path) return supabase.storage.from("training-videos").getPublicUrl(v.file_path).data.publicUrl;
  return null;
}

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

function SzkoleniaInwestor() {
  const [videos, setVideos] = useState<TrainingVideo[]>([]);

  useEffect(() => {
    void supabase
      .from("training_videos")
      .select("*")
      .eq("is_published", true)
      .order("sort_order")
      .order("created_at", { ascending: false })
      .then(({ data }) => setVideos(data ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Akademia inwestora</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {videos.map((v) => {
          const url = videoUrl(v);
          return (
            <Card key={v.id} className="overflow-hidden">
              {v.thumbnail_url && (
                <img
                  src={v.thumbnail_url}
                  alt={v.title}
                  className="aspect-video w-full object-cover"
                  loading="lazy"
                />
              )}
              <CardHeader>
                <CardTitle className="text-lg">{v.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {v.description && <p className="text-sm text-muted-foreground">{v.description}</p>}
                {url &&
                  (isExternal(url) ? (
                    <iframe src={embedUrl(url)} className="aspect-video w-full rounded-md" allowFullScreen />
                  ) : (
                    <video src={url} controls className="aspect-video w-full rounded-md bg-black" />
                  ))}
              </CardContent>
            </Card>
          );
        })}
        {videos.length === 0 && <div className="text-sm text-muted-foreground">Brak materiałów.</div>}
      </div>
    </div>
  );
}
