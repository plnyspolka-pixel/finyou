import { useState } from "react";
import { Play } from "lucide-react";

/** Rozbija tytuł lekcji na etykietę i krótki tytuł do okładki (bez dublowania numeru). */
export function coverLabels(title: string): { eyebrow: string | null; heading: string } {
  const t = title.trim();
  const cs = t.match(/^case study:\s*(.+)$/i);
  if (cs) {
    const place = cs[1].replace(/^(mieszkanie|działka|nieruchomość)\s+w\s+/i, "");
    return { eyebrow: "Case study", heading: place };
  }
  return { eyebrow: null, heading: t.replace(/^\d+\.\s*/, "") };
}

type Props = {
  number: number;
  title: string;
  coverUrl: string | null;
  videoUrl: string | null;
};

/**
 * Okładka lekcji (16:9) z numerem i krótkim tytułem nakładanym w UI.
 * Kliknięcie podmienia okładkę na odtwarzacz z autostartem; okładka służy też jako poster.
 */
export function LessonCover({ number, title, coverUrl, videoUrl }: Props) {
  const [playing, setPlaying] = useState(false);
  const { eyebrow, heading } = coverLabels(title);

  if (playing && videoUrl) {
    return (
      <video
        src={videoUrl}
        poster={coverUrl ?? undefined}
        controls
        autoPlay
        preload="metadata"
        playsInline
        className="aspect-video w-full rounded-md bg-cover-ink object-contain"
      />
    );
  }

  return (
    <button
      type="button"
      disabled={!videoUrl}
      onClick={() => setPlaying(true)}
      aria-label={`Odtwórz lekcję ${number}: ${title}`}
      className="group relative block aspect-video w-full overflow-hidden rounded-md bg-cover-ink text-left disabled:cursor-default"
    >
      {coverUrl && (
        <img
          src={coverUrl}
          alt=""
          width={1600}
          height={900}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-cover-ink via-cover-ink/70 to-transparent" />
      <div className="absolute inset-0 flex flex-col justify-end gap-1 p-4 sm:p-6">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cover-gold sm:text-xs">
          Lekcja {String(number).padStart(2, "0")}
          {eyebrow ? ` · ${eyebrow}` : ""}
        </span>
        <span className="max-w-[70%] text-base font-semibold leading-snug text-cover-text line-clamp-2 sm:text-xl">
          {heading}
        </span>
        <span className="mt-1 h-px w-10 bg-cover-gold" />
      </div>
      {videoUrl ? (
        <span className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-cover-gold/70 bg-cover-ink/60 text-cover-gold backdrop-blur-sm transition-colors group-hover:bg-cover-gold group-hover:text-cover-ink">
          <Play className="ml-0.5 h-5 w-5" />
        </span>
      ) : (
        <span className="absolute right-4 top-4 text-xs text-cover-text/80">Materiał wkrótce</span>
      )}
    </button>
  );
}
