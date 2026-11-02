import { createServerFn } from "@tanstack/react-start";

/**
 * Public catalog metadata ONLY. Never return lesson file_path, external_url,
 * document template paths, buyer data, signed links or private report contents.
 * This endpoint must not be used to decide access to paid materials.
 */
export const getPublicStoreCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [training, templates] = await Promise.all([
    supabaseAdmin
      .from("training_videos")
      .select("id,title,description,category,sort_order,thumbnail_url,duration_seconds")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("document_templates")
      .select("id,name,category,sort_order,slug,use_case")
      .not("template_file_path", "is", null)
      .neq("use_case", "legacy")
      .neq("category", "instrukcja")
      .order("sort_order", { ascending: true }),
  ]);
  if (training.error) throw new Error("Nie można załadować katalogu lekcji.");
  if (templates.error) throw new Error("Nie można załadować katalogu dokumentów.");
  const lessons = (training.data ?? []).map((v, index) => ({
    id: v.id,
    title: v.title,
    description: v.description ?? "",
    category: v.category ?? "Akademia",
    thumbnail: v.thumbnail_url ?? null,
    durationSeconds: typeof v.duration_seconds === "number" && v.duration_seconds > 0 ? v.duration_seconds : null,
    number: index + 1,
    // The user's pricing policy supersedes stale free_lesson flags in DB.
    free: index === 0,
    price: index === 0 ? 0 : 149,
  }));
  const documents = (templates.data ?? []).map((d, index) => ({
    id: d.id,
    title: d.name,
    category: d.category ?? "Dokument",
    number: index + 1,
    price: 199,
  }));
  return { lessons, documents };
});
