// Przeglądarki (poza Safari) nie renderują HEIC w <img>. Ten helper zamienia
// podpisany URL pliku .heic na lokalny object-URL z JPEG-iem (heic2any,
// konwersja w przeglądarce). Dla pozostałych plików zwraca URL bez zmian.

const HEIC_RE = /\.heic(\?|$)/i;

export function isHeic(nameOrUrl: string): boolean {
  return HEIC_RE.test(nameOrUrl.split("?")[0] ?? nameOrUrl) || HEIC_RE.test(nameOrUrl);
}

export async function toDisplayableImageUrl(url: string, name?: string | null): Promise<string> {
  if (!isHeic(name ?? "") && !isHeic(url)) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const blob = await res.blob();
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob, toType: "image/jpeg", quality: 0.8 });
    const outBlob = Array.isArray(out) ? out[0] : (out as Blob);
    return URL.createObjectURL(outBlob);
  } catch (e) {
    console.warn("[heic-preview] konwersja HEIC nie powiodła się:", e);
    return url;
  }
}
