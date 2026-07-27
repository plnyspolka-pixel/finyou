import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { listPublishedAvatarFaqs } from "@/lib/avatar-faq.functions";
import { Play, Pause, Volume2, VolumeX, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function FilipAvatarHero() {
  const list = useServerFn(listPublishedAvatarFaqs);
  const { data: faqs = [], isLoading } = useQuery({
    queryKey: ["avatar-faqs-public"],
    queryFn: () => list(),
    staleTime: 60_000,
  });

  const intro = faqs.find((f) => f.is_intro) ?? faqs[0];
  const questions = faqs.filter((f) => f.id !== intro?.id);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (intro && !activeId) setActiveId(intro.id);
  }, [intro, activeId]);

  const active = faqs.find((f) => f.id === activeId) ?? intro;

  function handleQuestion(id: string) {
    setActiveId(id);
    setMuted(false);
    setTimeout(() => {
      const v = videoRef.current;
      if (v) {
        v.currentTime = 0;
        v.muted = false;
        v.play().catch(() => {});
      }
    }, 50);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.muted = false;
      setMuted(false);
      v.play();
    } else {
      v.pause();
    }
  }

  if (isLoading || !active) {
    return null; // nothing to show until at least intro is ready
  }

  return (
    <section className="relative overflow-hidden border-b border-border bg-[oklch(0.13_0.07_265)] text-primary-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-90 [background-image:radial-gradient(ellipse_60%_50%_at_20%_10%,oklch(0.45_0.22_265_/_0.45),transparent_60%),radial-gradient(ellipse_55%_45%_at_85%_20%,oklch(0.65_0.13_235_/_0.4),transparent_65%)]"
      />
      <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 md:px-6 md:py-14 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* Wideo (portret) */}
        <div className="relative mx-auto w-full max-w-[360px]">
          <div className="absolute -inset-3 rounded-3xl bg-gradient-to-br from-accent/30 to-[oklch(0.55_0.22_278)]/30 blur-2xl" />
          <div className="relative aspect-[9/16] overflow-hidden rounded-3xl border border-white/15 bg-black shadow-2xl">
            {active.video_url ? (
              <video
                key={active.id}
                ref={videoRef}
                src={active.video_url}
                poster={active.thumbnail_url ?? undefined}
                className="h-full w-full object-cover"
                autoPlay
                muted={muted}
                playsInline
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
              />
            ) : null}
            {/* Controls overlay */}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-3">
              <button
                onClick={togglePlay}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-black shadow-lg hover:bg-white"
                aria-label={playing ? "Pauza" : "Odtwórz"}
              >
                {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
              </button>
              <button
                onClick={() => {
                  setMuted((m) => {
                    const next = !m;
                    if (videoRef.current) videoRef.current.muted = next;
                    return next;
                  });
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
                aria-label={muted ? "Włącz dźwięk" : "Wycisz"}
              >
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
            </div>
            {muted && playing && (
              <button
                onClick={() => {
                  setMuted(false);
                  if (videoRef.current) videoRef.current.muted = false;
                }}
                className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-black shadow-lg"
              >
                🔊 Kliknij, żeby usłyszeć Filipa
              </button>
            )}
          </div>
        </div>

        {/* Treść + pytania */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur">
            <MessageCircle className="h-3.5 w-3.5" />
            Zapytaj Filipa
          </div>
          <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
            Cześć, jestem Filip — założyciel Finance You.
          </h2>
          <p className="mt-3 max-w-xl text-white/80">
            Kliknij pytanie, a odpowiem Ci osobiście. Jeśli chcesz od razu zacząć — wypełnij wniosek
            poniżej.
          </p>

          {questions.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">
                Najczęstsze pytania
              </p>
              <div className="flex flex-wrap gap-2">
                {questions.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => handleQuestion(q.id)}
                    className={cn(
                      "rounded-full border px-3 py-2 text-sm transition",
                      activeId === q.id
                        ? "border-accent bg-accent text-accent-foreground shadow-lg shadow-accent/30"
                        : "border-white/20 bg-white/5 text-white hover:border-white/40 hover:bg-white/10",
                    )}
                  >
                    {q.question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {active && active.id !== intro?.id && (
            <p className="mt-5 max-w-xl rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/90">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-accent">
                {active.question}
              </span>
              {active.answer_text}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
