/**
 * Klienckie helpery do wgrywania kreacji reklamowych: rozpoznawanie typu
 * mediów, rozpakowywanie ZIP-ów w przeglądarce (fflate) i generowanie
 * miniatur wideo przez canvas — ciężkie pliki nigdy nie przechodzą przez
 * serwer aplikacji.
 */
import { unzip } from "fflate";

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;

export function mediaKind(name: string): "image" | "video" | null {
  if (IMAGE_EXT.test(name)) return "image";
  if (VIDEO_EXT.test(name)) return "video";
  return null;
}

export function mimeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
  };
  return map[ext] ?? "application/octet-stream";
}

export function sanitizeName(name: string): string {
  return name.replace(/[^\w.-]+/g, "_");
}

export type ZipMediaEntry = { name: string; blob: Blob; kind: "image" | "video"; type: string };

/** Rozpakowuje ZIP w przeglądarce i zwraca tylko wpisy będące grafiką/wideo. */
export async function unzipMedia(file: File): Promise<ZipMediaEntry[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(buf, (err, data) => (err ? reject(err) : resolve(data)));
  });
  return Object.entries(entries)
    .filter(([name, data]) => {
      const base = name.split("/").pop() ?? "";
      return (
        data.length > 0 && !name.includes("__MACOSX") && !base.startsWith(".") && mediaKind(base)
      );
    })
    .map(([name, data]) => {
      const base = name.split("/").pop()!;
      const type = mimeFor(base);
      return {
        name: base,
        blob: new Blob([data as BlobPart], { type }),
        kind: mediaKind(base)!,
        type,
      };
    });
}

/** Zrzuca klatkę wideo do JPEG-a (miniatura); null gdy przeglądarka nie umie odtworzyć pliku. */
export function captureVideoThumb(file: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      let settled = false;
      const cleanup = (b: Blob | null) => {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        resolve(b);
      };
      v.preload = "auto";
      v.muted = true;
      v.src = url;
      v.onloadeddata = () => {
        v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
      };
      v.onseeked = () => {
        const c = document.createElement("canvas");
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        if (!c.width || !c.height) return cleanup(null);
        c.getContext("2d")?.drawImage(v, 0, 0);
        c.toBlob((b) => cleanup(b), "image/jpeg", 0.85);
      };
      v.onerror = () => cleanup(null);
      setTimeout(() => cleanup(null), 15_000);
    } catch {
      resolve(null);
    }
  });
}
