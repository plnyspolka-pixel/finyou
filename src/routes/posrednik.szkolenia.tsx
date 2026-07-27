import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/posrednik/szkolenia")({
  component: SzkoleniaPosrednik,
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

function SzkoleniaPosrednik() {
  const [videos, setVideos] = useState<TrainingVideo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

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
        }),
      );
      setUrls(Object.fromEntries(urlEntries));
    })();
  }, []);

  const grouped = videos.reduce<Record<string, TrainingVideo[]>>((acc, v) => {
    const key = v.category ?? "Pozostałe";
    (acc[key] ||= []).push(v);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Wiedza pośrednika"
        title="Akademia pośrednika"
        subtitle="Szkolenia wideo — jak skutecznie pośredniczyć między klientem a inwestorem, prawo, marketing i case studies."
      />
      {Object.entries(grouped).map(([category, list]) => (
        <div key={category} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {category}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {list.map((v) => {
              const url = urls[v.id] ?? null;
              const external = url ? isExternal(url) : false;
              return (
                <Card key={v.id} className="overflow-hidden flex flex-col h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg line-clamp-2 min-h-[3.5rem]">{v.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 flex flex-col flex-1">
                    {v.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                        {v.description}
                      </p>
                    )}
                    <div className="mt-auto">
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
                            controls
                            preload="metadata"
                            playsInline
                            className="aspect-video w-full rounded-md bg-black object-contain"
                          />
                        )
                      ) : (
                        <div className="aspect-video w-full rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground">
                          Materiał wkrótce
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
      {videos.length === 0 && <div className="text-sm text-muted-foreground">Brak materiałów.</div>}
    </div>
  );
}
