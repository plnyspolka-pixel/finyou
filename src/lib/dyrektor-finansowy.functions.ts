import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AuthedCtx = {
  supabase: { rpc: (n: string, p: unknown) => Promise<{ data: unknown; error: unknown }> };
  userId: string;
};

/** Weryfikuje, że wywołujący jest inwestorem i zwraca jego investor_id. */
async function requireInvestor(ctx: AuthedCtx): Promise<{ investorId: string }> {
  const { data: isInvestor, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "inwestor",
  });
  if (error) throw new Error("Błąd autoryzacji: " + (error as Error).message);
  if (!isInvestor) throw new Error("Dyrektor finansowy jest dostępny tylko dla inwestorów.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: inv, error: invErr } = await db
    .from("investors")
    .select("id")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (invErr) throw new Error(invErr.message);
  if (!inv) throw new Error("Nie znaleziono profilu inwestora.");
  return { investorId: inv.id as string };
}

export const listDfConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireInvestor(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data, error } = await db
      .from("df_conversations")
      .select("*")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { conversations: data ?? [] };
  });

export const getDfConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireInvestor(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    // Upewnij się, że rozmowa należy do wywołującego.
    const { data: conv } = await db
      .from("df_conversations")
      .select("id")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!conv) throw new Error("Rozmowa nie została znaleziona.");
    const { data: msgs, error } = await db
      .from("df_messages")
      .select("*")
      .eq("conversation_id", data.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { messages: msgs ?? [] };
  });

export const deleteDfConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireInvestor(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { error } = await db
      .from("df_conversations")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendDfChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        conversation_id: z.string().uuid().optional(),
        message: z.string().min(1).max(20000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { investorId } = await requireInvestor(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { callDfAnthropic, runDfTool, DF_SYSTEM_PROMPT } = await import("./dyrektor-finansowy.server");
    type AnthropicMessage = import("./dyrektor-finansowy.server").AnthropicMessage;

    // Zapewnij rozmowę (z weryfikacją własności przy istniejącej).
    let convId = data.conversation_id;
    if (convId) {
      const { data: conv } = await db
        .from("df_conversations")
        .select("id")
        .eq("id", convId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!conv) throw new Error("Rozmowa nie została znaleziona.");
      await db.from("df_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
    } else {
      const { data: ins, error } = await db
        .from("df_conversations")
        .insert({ user_id: context.userId, investor_id: investorId, title: data.message.slice(0, 60) })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      convId = ins.id as string;
    }

    await db.from("df_messages").insert({ conversation_id: convId, role: "user", content: data.message });

    // Wczytaj historię → format Anthropic.
    const { data: history, error: hErr } = await db
      .from("df_messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    if (hErr) throw new Error(hErr.message);

    const messages: AnthropicMessage[] = [];
    for (const m of history ?? []) {
      const mm = m as {
        role: string;
        content: string;
        tool_calls: unknown;
        tool_results: unknown;
      };
      if (mm.role === "user") {
        messages.push({ role: "user", content: mm.content });
      } else if (mm.role === "assistant") {
        const parts: Exclude<AnthropicMessage["content"], string> = [];
        if (mm.content) parts.push({ type: "text", text: mm.content });
        const tc = (mm.tool_calls as Array<{ id: string; name: string; input: Record<string, unknown> }> | null) ?? [];
        for (const t of tc) parts.push({ type: "tool_use", id: t.id, name: t.name, input: t.input });
        messages.push({ role: "assistant", content: parts.length ? parts : mm.content });
      } else if (mm.role === "tool") {
        const tr = (mm.tool_results as Array<{ tool_use_id: string; content: string; is_error?: boolean }> | null) ?? [];
        messages.push({
          role: "user",
          content: tr.map((r) => ({ type: "tool_result" as const, tool_use_id: r.tool_use_id, content: r.content, is_error: r.is_error })),
        });
      }
    }

    let totalIn = 0;
    let totalOut = 0;
    for (let round = 0; round < 12; round++) {
      const resp = await callDfAnthropic({ system: DF_SYSTEM_PROMPT, messages });
      totalIn += resp.usage.input_tokens;
      totalOut += resp.usage.output_tokens;

      const textBlocks = resp.content.filter((b) => b.type === "text") as { type: "text"; text: string }[];
      const toolBlocks = resp.content.filter((b) => b.type === "tool_use") as {
        type: "tool_use";
        id: string;
        name: string;
        input: Record<string, unknown>;
      }[];

      const assistantText = textBlocks.map((b) => b.text).join("\n").trim();
      const toolCalls = toolBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input }));

      await db.from("df_messages").insert({
        conversation_id: convId,
        role: "assistant",
        content: assistantText,
        tool_calls: toolCalls.length ? toolCalls : null,
        tokens_in: resp.usage.input_tokens,
        tokens_out: resp.usage.output_tokens,
      });
      messages.push({
        role: "assistant",
        content: [
          ...(assistantText ? [{ type: "text" as const, text: assistantText }] : []),
          ...toolBlocks,
        ],
      });

      if (resp.stop_reason !== "tool_use" || toolBlocks.length === 0) {
        return { conversation_id: convId, ok: true, tokens: { input: totalIn, output: totalOut } };
      }

      const results: Array<{ tool_use_id: string; content: string; is_error?: boolean }> = [];
      for (const tc of toolBlocks) {
        const r = await runDfTool({ name: tc.name, input: tc.input }, { investorId });
        const content = r.ok
          ? typeof r.output === "string"
            ? r.output
            : JSON.stringify(r.output).slice(0, 60000)
          : `BŁĄD: ${r.error}`;
        results.push({ tool_use_id: tc.id, content, is_error: !r.ok });

        await db.from("df_audit_log").insert({
          user_id: context.userId,
          investor_id: investorId,
          conversation_id: convId,
          tool_name: tc.name,
          tool_input: tc.input,
          success: r.ok,
          error: r.ok ? null : r.error,
        });
      }

      await db.from("df_messages").insert({
        conversation_id: convId,
        role: "tool",
        content: "",
        tool_results: results,
      });
      messages.push({
        role: "user",
        content: results.map((r) => ({ type: "tool_result" as const, tool_use_id: r.tool_use_id, content: r.content, is_error: r.is_error })),
      });
    }

    return { conversation_id: convId, ok: true, tokens: { input: totalIn, output: totalOut }, note: "Osiągnięto limit rund narzędzi." };
  });
