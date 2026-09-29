// Studio publikacji → biblioteka materiałów (/admin/materialy).
//
// Każda gotowa rolka Studia trafia do biblioteki materiałów: plik kopiujemy
// do bucketu `marketing-materials` (trwale — linki HeyGena wygasają po ~7
// dniach) i zakładamy wpis w `marketing_materials`. Stąd rolkę widać
// w /admin/materialy, można ją publikować „Publikuj" i udostępniać
// pośrednikom (zakładka kategorii w ich portalu).
//
// Powiązanie rolka ↔ materiał to stała ścieżka pliku `studio/<id joba>.mp4`
// — bez dodatkowej kolumny. Ponowny zapis (np. po zmianie napisów) podmienia
// plik i aktualizuje wpis zamiast tworzyć duplikat; kategorię zmienioną
// ręcznie w panelu materiałów zostawiamy.
//
// Konfiguracja (sekrety środowiska, opcjonalne):
//   STUDIO_SAVE_TO_MATERIALS   — `0` / `off` wyłącza zapis do materiałów,
//   STUDIO_MATERIALS_AUDIENCE  — kategoria domyślna: klient | inwestor | posrednik
//                                (domyślnie `klient`); job może mieć własną
//                                (`studio_video_jobs.material_audience`).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MATERIALS_BUCKET } from "./marketing-material-publish";
import { fetchBytes } from "./media-storage.server";

export const MATERIAL_AUDIENCES = ["klient", "inwestor", "posrednik"] as const;
export type MaterialAudience = (typeof MATERIAL_AUDIENCES)[number];

/** Rolki 720p 30–60 s ważą zwykle 10–30 MB; limit chroni pamięć workera. */
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export function isStudioMaterialsEnabled(): boolean {
  const v = (process.env.STUDIO_SAVE_TO_MATERIALS ?? "").trim().toLowerCase();
  return !["0", "false", "off", "no", "nie"].includes(v);
}

export function parseMaterialAudience(v: unknown): MaterialAudience | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return (MATERIAL_AUDIENCES as readonly string[]).includes(s) ? (s as MaterialAudience) : null;
}

export function defaultMaterialAudience(): MaterialAudience {
  return parseMaterialAudience(process.env.STUDIO_MATERIALS_AUDIENCE) ?? "klient";
}

/** Stała ścieżka pliku rolki w bibliotece materiałów. */
export const studioMaterialPath = (jobId: string): string => `studio/${jobId}.mp4`;

/** Tytuł materiału: tytuł publikacji, a w ostateczności prompt bez tagu „#N · ". */
export function studioMaterialTitle(job: { publish_title: string; prompt: string }): string {
  const title = job.publish_title.trim() || job.prompt.replace(/^#\d{1,3} · /, "").trim();
  return (title || "Rolka ze Studia").slice(0, 200);
}

export type StudioMaterialRef = {
  id: string;
  audience: MaterialAudience;
  storage_path: string;
  title: string;
};

/** Materiały powiązane z jobami Studia (po stałej ścieżce pliku). */
export async function findStudioMaterials(
  jobIds: string[],
): Promise<Map<string, StudioMaterialRef>> {
  const out = new Map<string, StudioMaterialRef>();
  const ids = [...new Set(jobIds.filter(Boolean))];
  if (!ids.length) return out;
  const byPath = new Map(ids.map((id) => [studioMaterialPath(id), id]));
  const { data, error } = await supabaseAdmin
    .from("marketing_materials")
    .select("id, audience, storage_path, title")
    .in("storage_path", [...byPath.keys()]);
  if (error) {
    console.warn(`[Studio] materiały: ${error.message}`);
    return out;
  }
  for (const row of data ?? []) {
    const jobId = byPath.get(row.storage_path);
    if (jobId) out.set(jobId, row as StudioMaterialRef);
  }
  return out;
}

/**
 * Kopiuje gotową rolkę do biblioteki materiałów i zakłada / aktualizuje wpis.
 * Rzuca przy błędzie — wołający decyduje, jak to zgłosić (rolka i tak jest
 * gotowa w Studiu).
 */
export async function saveStudioJobToMaterials(job: {
  id: string;
  video_url: string | null;
  publish_title: string;
  publish_description: string;
  prompt: string;
  created_by: string | null;
  material_audience?: string | null;
}): Promise<StudioMaterialRef & { created: boolean }> {
  if (!job.video_url) throw new Error("rolka nie ma pliku wideo");
  const { bytes } = await fetchBytes(job.video_url, MAX_VIDEO_BYTES);
  if (!bytes.byteLength) throw new Error("pusty plik wideo");
  const path = studioMaterialPath(job.id);
  const { error: upErr } = await supabaseAdmin.storage
    .from(MATERIALS_BUCKET)
    .upload(path, new Uint8Array(bytes), { contentType: "video/mp4", upsert: true });
  if (upErr) throw new Error(`Storage (${MATERIALS_BUCKET}): ${upErr.message}`);

  const title = studioMaterialTitle(job);
  const description = job.publish_description.trim() || null;
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("marketing_materials")
    .select("id, audience")
    .eq("storage_path", path)
    .maybeSingle();
  if (findErr) throw new Error(`marketing_materials: ${findErr.message}`);

  if (existing) {
    const { error } = await supabaseAdmin
      .from("marketing_materials")
      .update({ title, description, mime_type: "video/mp4", file_size: bytes.byteLength })
      .eq("id", existing.id);
    if (error) throw new Error(`marketing_materials: ${error.message}`);
    return {
      id: existing.id,
      audience: existing.audience as MaterialAudience,
      storage_path: path,
      title,
      created: false,
    };
  }

  const audience = parseMaterialAudience(job.material_audience) ?? defaultMaterialAudience();
  const { data: row, error } = await supabaseAdmin
    .from("marketing_materials")
    .insert({
      title,
      description,
      audience,
      media_type: "video",
      storage_path: path,
      mime_type: "video/mp4",
      file_size: bytes.byteLength,
      uploaded_by: job.created_by,
    })
    .select("id")
    .single();
  if (error) throw new Error(`marketing_materials: ${error.message}`);

  // Tick i panel mogą domknąć tę samą rolkę naraz — zostaje najstarszy wpis.
  const { data: twins } = await supabaseAdmin
    .from("marketing_materials")
    .select("id")
    .eq("storage_path", path)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  const keep = twins?.[0]?.id ?? row.id;
  const extra = (twins ?? []).map((t) => t.id).filter((id) => id !== keep);
  if (extra.length) {
    await supabaseAdmin.from("marketing_materials").delete().in("id", extra);
  }
  return { id: keep, audience, storage_path: path, title, created: keep === row.id };
}

/**
 * Kategoria materiału zapisana przy jobie. Kolumna przychodzi migracją
 * `material_audience`; zanim baza ją dostanie, zapis po prostu się nie
 * udaje, a rolka trafi do kategorii domyślnej — job i render działają dalej.
 */
export async function setJobMaterialAudience(
  jobId: string,
  audience: MaterialAudience | null | undefined,
): Promise<boolean> {
  if (!audience) return false;
  const { error } = await supabaseAdmin
    .from("studio_video_jobs")
    .update({ material_audience: audience })
    .eq("id", jobId);
  if (error) {
    console.warn(`[Studio] kategoria materiału (${jobId}): ${error.message}`);
    return false;
  }
  return true;
}
