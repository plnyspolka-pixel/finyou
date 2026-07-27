// Zunifikowany uploader: WSZYSTKIE nowe pliki (zdjecia, dokumenty, awatary,
// zalaczniki, materialy marketingowe) laduja w jednym buckecie `pliki-klienta`.
// Prefiks (`context`) porzadkuje sciezki, a polityki RLS bucketu obsluguja
// wszystkie te prefiksy naraz (patrz migracja 20260715090000 na storage.objects).

import { supabase } from "@/integrations/supabase/client";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";

export const UNIFIED_BUCKET = CLIENT_FILES_BUCKET;

export type UploadContext =
  | { context: "property"; applicationId: string }
  | { context: "document"; applicationId: string; docType?: string }
  | { context: "attachment"; messageId?: string; ownerId?: string }
  | { context: "avatar"; userId: string }
  | { context: "marketing"; materialId?: string }
  | { context: "generated"; applicationId?: string };

export interface UploadResult {
  bucket: typeof UNIFIED_BUCKET;
  path: string;
  thumbnailPath: string | null;
  mimeType: string;
  size: number;
  fileName: string;
}

function slugName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : "";
  return `${base || "file"}${ext}`;
}

function pathFor(ctx: UploadContext, fileName: string): string {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const safe = slugName(fileName);
  switch (ctx.context) {
    case "property":
      return `property/${ctx.applicationId}/${stamp}-${safe}`;
    case "document":
      return `documents/${ctx.applicationId}/${ctx.docType ?? "misc"}/${stamp}-${safe}`;
    case "attachment":
      return `attachments/${ctx.messageId ?? ctx.ownerId ?? "misc"}/${stamp}-${safe}`;
    case "avatar":
      return `avatars/${ctx.userId}/${stamp}-${safe}`;
    case "marketing":
      return `marketing/${ctx.materialId ?? "misc"}/${stamp}-${safe}`;
    case "generated":
      return `generated/${ctx.applicationId ?? "misc"}/${stamp}-${safe}`;
  }
}

/** Renderuje pierwsza strone PDF do PNG za pomoca pdfjs-dist (client-side). */
async function renderPdfFirstPage(file: Blob): Promise<Blob | null> {
  try {
    // Lazy import — pdfjs jest ciezki.
    const pdfjs: typeof import("pdfjs-dist") = await import("pdfjs-dist");
    // Uzyj worker z tego samego pakietu (bundlowany przez Vite).
    const workerMod = (await import(
      /* @vite-ignore */ "pdfjs-dist/build/pdf.worker.min.mjs?url"
    )) as { default: string };
    pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;

    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const targetW = 400;
    const scale = targetW / viewport.width;
    const scaled = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(scaled.width);
    canvas.height = Math.ceil(scaled.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // pdfjs v6 wymaga argumentu canvas
    await page.render({ canvasContext: ctx, viewport: scaled, canvas } as any).promise;
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png", 0.85),
    );
  } catch (e) {
    console.warn("[unified-upload] PDF thumbnail render failed:", e);
    return null;
  }
}

export async function uploadFile(file: File, ctx: UploadContext): Promise<UploadResult> {
  const path = pathFor(ctx, file.name);
  const mimeType = file.type || "application/octet-stream";

  const { error } = await supabase.storage
    .from(UNIFIED_BUCKET)
    .upload(path, file, { upsert: false, contentType: mimeType });
  if (error) throw error;

  let thumbnailPath: string | null = null;
  if (mimeType === "application/pdf") {
    const thumb = await renderPdfFirstPage(file);
    if (thumb) {
      const tPath = `${path}.thumb.png`;
      const { error: tErr } = await supabase.storage
        .from(UNIFIED_BUCKET)
        .upload(tPath, thumb, { upsert: true, contentType: "image/png" });
      if (!tErr) thumbnailPath = tPath;
    }
  }

  return {
    bucket: UNIFIED_BUCKET,
    path,
    thumbnailPath,
    mimeType,
    size: file.size,
    fileName: file.name,
  };
}

/** Generuje miniature PDF w tle i zapisuje ja do bazy dla pliku ktory jej nie ma. */
export async function backfillPdfThumbnail(path: string): Promise<string | null> {
  const buckets = [UNIFIED_BUCKET, "marketing-materials"];
  for (const bucket of buckets) {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 600);
    if (!data?.signedUrl) continue;
    try {
      const res = await fetch(data.signedUrl);
      if (!res.ok) continue;
      const blob = await res.blob();
      const thumb = await renderPdfFirstPage(blob);
      if (!thumb) return null;
      const tPath = `${path}.thumb.png`;
      const { error: tErr } = await supabase.storage
        .from(UNIFIED_BUCKET)
        .upload(tPath, thumb, { upsert: true, contentType: "image/png" });
      if (tErr) return null;
      return tPath;
    } catch {
      return null;
    }
  }
  return null;
}

/** Usun plik (i miniature jesli istnieje) sprobowaniem we wszystkich legacy bucketach. */
export async function deleteStoragePath(path: string): Promise<void> {
  const buckets = [UNIFIED_BUCKET, "marketing-materials", "avatars"];
  for (const bucket of buckets) {
    await supabase.storage
      .from(bucket)
      .remove([path, `${path}.thumb.png`])
      .catch(() => {});
  }
}
