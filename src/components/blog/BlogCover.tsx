import wordmark from "@/assets/financeyou-wordmark.png.asset.json";

interface BlogCoverProps {
  src: string;
  alt: string;
  rounded?: boolean;
}

/**
 * Okładka artykułu blogowego: darmowe zdjęcie stockowe + nakładka z oficjalnym
 * wordmarkiem Finance You w prawym dolnym rogu. Logo jest renderowane jako
 * overlay CSS (nie wbijane w piksele), żeby nie potrzebować server-side
 * kompozytora obrazów na Cloudflare Workers.
 */
export function BlogCover({ src, alt, rounded = false }: BlogCoverProps) {
  return (
    <div
      className={`relative aspect-[16/9] w-full overflow-hidden bg-muted ${rounded ? "rounded-xl" : ""}`}
    >
      <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      {/* Subtelny gradient pod logo dla czytelności na jasnych zdjęciach */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 to-transparent" />
      <img
        src={wordmark.url}
        alt="Finance You"
        className="pointer-events-none absolute bottom-3 right-3 h-6 w-auto opacity-95 drop-shadow-md md:bottom-4 md:right-4 md:h-8"
      />
    </div>
  );
}
