import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const querySchema = z.object({
  bucket: z.enum(["documents", "lead-magnets", "marketing-materials", "pliki-klienta", "training-videos", "shorts-video", "podpisy", "aml-private", "avatars", "property-photos", "screening-attachments"]),
  offset: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(2_147_483_647)).default("0"),
  limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)).default("100"),
});

type Admin = SupabaseClient<Database>;
const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

export async function storageManifest(request: Request, getAdmin: () => Promise<Admin>): Promise<Response> {
  const token = request.headers.get("x-migration-token");
  if (!token) return reply({ error: "Unauthorized" }, 401);
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const admin = await getAdmin();
    const { data: authorization, error: authError } = await admin.from("migration_export_tokens")
      .select("token_hash").eq("token_hash", hash).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (authError || !authorization) return reply({ error: "Unauthorized" }, 401);
    const params = new URL(request.url).searchParams;
    const parsed = querySchema.safeParse({ bucket: params.get("bucket"), offset: params.get("offset") ?? undefined, limit: params.get("limit") ?? undefined });
    if (!parsed.success) return reply({ error: "Invalid query" }, 400);
    const { bucket, offset, limit } = parsed.data;
    const { data: objects, error } = await admin.rpc("migration_list_storage_objects", { p_bucket: bucket, p_offset: offset, p_limit: limit });
    if (error || !objects) return reply({ error: "Export unavailable" }, 503);
    if (objects.length === 0) return reply({ items: [], next_offset: null });
    const { data: signed, error: signError } = await admin.storage.from(bucket).createSignedUrls(objects.map((item) => item.name), 10800);
    if (signError || !signed) return reply({ error: "Export unavailable" }, 503);
    const urls = new Map<string, string>();
    for (const item of signed) if (item.path && !item.error && item.signedUrl) urls.set(item.path, item.signedUrl);
    const items = [];
    const missing = [];
    for (const item of objects) {
      const url = urls.get(item.name);
      if (url) items.push({ bucket, ...item, url });
      else missing.push({ bucket, name: item.name, size: item.size, etag: item.etag });
    }
    return reply({ items, missing, next_offset: objects.length < limit ? null : offset + objects.length });
  } catch {
    // Never log tokens, object names, signed URLs, or downstream errors.
    return reply({ error: "Export unavailable" }, 503);
  }
}