import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (roles ?? []).some((r) => r.role === "administrator");
  if (!isAdmin) throw new Error("Brak uprawnień");
}

export const listKnowledge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("text_agent_knowledge")
      .select("id, title, content, updated_at, embedding")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      updated_at: r.updated_at,
      has_embedding: !!r.embedding,
    }));
  });

export const upsertKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; title: string; content: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { embedText } = await import("./text-agent-knowledge.server");

    const text = `${data.title}\n\n${data.content}`.trim();
    let embedding: number[] | null = null;
    try {
      embedding = await embedText(text);
    } catch (e: any) {
      console.error("[knowledge] embed failed", e?.message);
    }

    const row: any = {
      title: data.title,
      content: data.content,
      created_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (embedding && embedding.length > 0) row.embedding = embedding as any;

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("text_agent_knowledge")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id, embedded: !!embedding };
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("text_agent_knowledge")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id, embedded: !!embedding };
  });

export const deleteKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("text_agent_knowledge").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
