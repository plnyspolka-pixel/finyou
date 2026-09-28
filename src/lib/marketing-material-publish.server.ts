// Publiczna kopia materiału marketingowego pod publikację.
//
// Bucket `marketing-materials` jest prywatny, a platformy (Meta, YouTube,
// X, TikTok) ściągają plik z URL-a dopiero w chwili publikacji — kopiujemy go
// więc do publicznego `studio-media` (tego samego, z którego Studio publikuje
// grafiki AI i b-rolle). Kopia robi się po stronie Storage (`copy` między
// bucketami), bez przepuszczania pliku przez pamięć workera — filmy potrafią
// mieć setki MB.
//
// Ścieżka kopii jest deterministyczna (publicCopyPath), więc ponowna
// publikacja tego samego materiału używa istniejącego pliku. Kopii nie
// usuwamy przy kasowaniu materiału z biblioteki: zaplanowany wpis w kolejce
// mógłby stracić źródło tuż przed publikacją.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  MATERIALS_BUCKET,
  PUBLIC_MEDIA_BUCKET,
  publicCopyPath,
  type PublishableMaterial,
} from "./marketing-material-publish";

export type MaterialRow = PublishableMaterial & { mime_type: string | null };

export async function loadMaterial(id: string): Promise<MaterialRow> {
  const { data, error } = await supabaseAdmin
    .from("marketing_materials")
    .select("id, title, description, ai_description, media_type, storage_path, mime_type")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nie znaleziono materiału.");
  return data as MaterialRow;
}

/** Zwraca trwały publiczny URL kopii materiału; tworzy ją, jeśli jej nie ma. */
export async function ensureMaterialPublicUrl(
  m: Pick<PublishableMaterial, "id" | "storage_path">,
): Promise<string> {
  const path = publicCopyPath(m);
  const slash = path.lastIndexOf("/");
  const dir = path.slice(0, slash);
  const name = path.slice(slash + 1);

  const { data: existing, error: listErr } = await supabaseAdmin.storage
    .from(PUBLIC_MEDIA_BUCKET)
    .list(dir, { search: name, limit: 10 });
  if (listErr) throw new Error(`Storage (${PUBLIC_MEDIA_BUCKET}): ${listErr.message}`);

  if (!(existing ?? []).some((f) => f.name === name)) {
    const { error } = await supabaseAdmin.storage
      .from(MATERIALS_BUCKET)
      .copy(m.storage_path, path, { destinationBucket: PUBLIC_MEDIA_BUCKET });
    // Wyścig dwóch publikacji tego samego pliku: druga kopia zastaje pierwszą.
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw new Error(`Nie udało się przygotować publicznej kopii pliku: ${error.message}`);
    }
  }
  const { data } = supabaseAdmin.storage.from(PUBLIC_MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
