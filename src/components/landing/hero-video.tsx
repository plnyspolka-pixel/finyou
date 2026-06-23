import { useEffect, useRef, useState } from "react";
import { Play, Pause, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroVideo from "@/assets/financeyou-hero.mp4.asset.json";

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const goFullscreen = () => {
    const el = wrapperRef.current;
    const v = videoRef.current;
    if (el?.requestFullscreen) void el.requestFullscreen();
    else if (v && "webkitEnterFullscreen" in v) {
      (v as unknown as { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
    }
  };

  return (
    <div
      ref={wrapperRef}
      className="relative mb-6 overflow-hidden rounded-2xl border border-border shadow-lg md:mb-8"
    >
      <video
        ref={videoRef}
        src={heroVideo.url}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full bg-black"
      />
      <div className="pointer-events-none absolute right-3 top-3 flex gap-2">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          onClick={togglePlay}
          aria-label={playing ? "Zatrzymaj wideo" : "Odtwórz wideo"}
          className="pointer-events-auto h-9 w-9 bg-background/80 backdrop-blur hover:bg-background"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          onClick={goFullscreen}
          aria-label="Pełny ekran"
          className="pointer-events-auto h-9 w-9 bg-background/80 backdrop-blur hover:bg-background"
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
