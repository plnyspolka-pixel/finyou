// Publiczna funkcja serwerowa do wgrywania POJEDYNCZEGO załącznika wniosku
// z landing-page/embed formularza. Kluczowa dla stabilności na mobile:
// zamiast wysyłać kilka plików w jednym POST-cie (co timeoutowało na 4G),
// klient wgrywa każdy plik osobno przez tę funkcję i dostaje zwrotnie path
// w buckecie `pliki-klienta`. Następnie w submicie wysyłamy tylko ścieżki.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";

const UploadSchema = z.object({
  dataUrl: z.string().min(20).max(15_000_000), // ~11MB base64
  mimeType: z.string().max(120),
  fileName: z.string().max(200),
  bucket: z.string().max(60), // logiczny typ dokumentu (np. property_photos, ownership_deed)
});

export const uploadLandingAttachment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UploadSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const m = /^data:([^;]+);base64,(.*)$/.exec(data.dataUrl);
    if (!m) throw new Error("invalid dataUrl");
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
    const path = `landing-inbox/${data.bucket}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const { error } = await supabaseAdmin.storage
      .from(CLIENT_FILES_BUCKET)
      .upload(path, bytes, { contentType: data.mimeType || m[1], upsert: false });
    if (error) throw new Error(error.message);
    return {
      ok: true as const,
      path,
      bucket: data.bucket,
      mimeType: data.mimeType || m[1],
      fileName: data.fileName,
    };
  });
