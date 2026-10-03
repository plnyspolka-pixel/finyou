// Slajder zdjęć Projektu: przeglądanie w karcie (strzałki, przesuwanie palcem,
// licznik), miniatury do szybkiego wyboru i powiększenie w oknie — bez
// otwierania zdjęć w osobnej karcie przeglądarki.
import { useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Building2, ChevronLeft, ChevronRight, Expand } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface GalleryPhoto {
  url: string;
  name: string;
}

interface SliderProps {
  photos: GalleryPhoto[];
  index: number;
  onIndexChange: (index: number) => void;
  /** `cover` — kafelek w karcie; `contain` — powiększenie, całe zdjęcie. */
  fit: "cover" | "contain";
  className?: string;
  onImageClick?: () => void;
}

function Slider({ photos, index, onIndexChange, fit, className, onImageClick }: SliderProps) {
  const many = photos.length > 1;
  // Indeks startowy tylko z chwili montowania — zmiana opcji embli wymusza
  // reInit (skok bez animacji), więc późniejsze zmiany idą przez scrollTo.
  const [startIndex] = useState(index);
  const [viewportRef, api] = useEmblaCarousel({ loop: many, startIndex });

  // Przesunięcie palcem / strzałką → stan rodzica.
  useEffect(() => {
    if (!api) return;
    const onSelect = () => onIndexChange(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api, onIndexChange]);

  // Zmiana z zewnątrz (miniatura, klawiatura w oknie) → przewinięcie slajdera.
  useEffect(() => {
    if (api && api.selectedScrollSnap() !== index) api.scrollTo(index);
  }, [api, index]);

  const imgClass = cn("h-full w-full", fit === "cover" ? "object-cover" : "object-contain");

  return (
    <div className={cn("relative", className)}>
      <div ref={viewportRef} className="h-full overflow-hidden">
        <div className="flex h-full">
          {photos.map((ph, i) => (
            <div key={`${ph.url}-${i}`} className="h-full min-w-0 shrink-0 grow-0 basis-full">
              {onImageClick ? (
                <button
                  type="button"
                  onClick={onImageClick}
                  // Tab zatrzymuje się tylko na widocznym zdjęciu, nie na każdym slajdzie.
                  tabIndex={i === index ? 0 : -1}
                  className="block h-full w-full cursor-zoom-in"
                  aria-label={`Powiększ zdjęcie ${i + 1} z ${photos.length}`}
                >
                  <img
                    src={ph.url}
                    alt={ph.name}
                    className={imgClass}
                    draggable={false}
                    loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"}
                  />
                </button>
              ) : (
                <img
                  src={ph.url}
                  alt={ph.name}
                  className={imgClass}
                  draggable={false}
                  loading={Math.abs(i - index) <= 1 ? "eager" : "lazy"}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {many ? (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              api?.scrollPrev();
            }}
            aria-label="Poprzednie zdjęcie"
            className="absolute left-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              api?.scrollNext();
            }}
            aria-label="Następne zdjęcie"
            className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span
            className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium leading-none text-white"
            aria-live="polite"
          >
            {index + 1} / {photos.length}
          </span>
        </>
      ) : null}
    </div>
  );
}

interface GalleryProps {
  photos: GalleryPhoto[];
  index: number;
  onIndexChange: (index: number) => void;
  className?: string;
}

/**
 * Główne zdjęcie Projektu w karcie: slajder ze strzałkami i licznikiem;
 * kliknięcie otwiera powiększenie w oknie (strzałki ← → na klawiaturze).
 */
export function ProjectPhotoGallery({ photos, index, onIndexChange, className }: GalleryProps) {
  const [open, setOpen] = useState(false);
  const count = photos.length;

  if (count === 0) {
    return (
      <div
        className={cn(
          "flex h-36 items-center justify-center rounded-md bg-muted text-muted-foreground sm:h-full",
          className,
        )}
      >
        <Building2 className="h-8 w-8" />
      </div>
    );
  }

  const step = (delta: number) => onIndexChange((index + delta + count) % count);

  return (
    <>
      <div className={cn("relative h-36 overflow-hidden rounded-md bg-muted sm:h-auto", className)}>
        <Slider
          photos={photos}
          index={index}
          onIndexChange={onIndexChange}
          fit="cover"
          className="h-full sm:absolute sm:inset-0"
          onImageClick={() => setOpen(true)}
        />
        <Expand
          className="pointer-events-none absolute right-1 top-1 h-5 w-5 rounded bg-black/50 p-1 text-white"
          aria-hidden
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-5xl gap-2 border-0 bg-black/95 p-2 text-white sm:p-3"
          aria-describedby={undefined}
          onKeyDown={(e) => {
            if (count < 2) return;
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              step(-1);
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              step(1);
            }
          }}
        >
          <DialogTitle className="sr-only">Zdjęcia Projektu</DialogTitle>
          <Slider
            photos={photos}
            index={index}
            onIndexChange={onIndexChange}
            fit="contain"
            className="h-[70vh]"
          />
          {count > 1 ? (
            <ProjectPhotoThumbs
              photos={photos}
              index={index}
              onIndexChange={onIndexChange}
              className="mx-auto w-fit max-w-full"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Pasek miniatur — kliknięcie przewija slajder do wybranego zdjęcia. */
export function ProjectPhotoThumbs({ photos, index, onIndexChange, className }: GalleryProps) {
  const stripRef = useRef<HTMLDivElement>(null);

  // Aktywna miniatura zawsze w kadrze paska (tylko przewijanie w poziomie,
  // bez ruszania strony).
  useEffect(() => {
    const strip = stripRef.current;
    const thumb = strip?.children.item(index);
    if (!strip || !(thumb instanceof HTMLElement)) return;
    const left = thumb.offsetLeft;
    const right = left + thumb.offsetWidth;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (right > strip.scrollLeft + strip.clientWidth)
      strip.scrollLeft = right - strip.clientWidth;
  }, [index]);

  if (photos.length < 2) return null;
  return (
    <div
      ref={stripRef}
      className={cn("relative flex gap-1 overflow-x-auto py-0.5 scroll-smooth", className)}
    >
      {photos.map((ph, i) => (
        <button
          key={`${ph.url}-${i}`}
          type="button"
          onClick={() => onIndexChange(i)}
          aria-label={`Zdjęcie ${i + 1} z ${photos.length}`}
          aria-current={i === index ? "true" : undefined}
          className={cn(
            "shrink-0 overflow-hidden rounded ring-offset-background transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            i === index ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100",
          )}
        >
          <img src={ph.url} alt="" className="h-14 w-20 object-cover" loading="lazy" />
        </button>
      ))}
    </div>
  );
}
