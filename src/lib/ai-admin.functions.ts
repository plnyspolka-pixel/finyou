import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_MODELS = [
  "claude-opus-4-5",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "claude-3-7-sonnet-latest",
  "claude-3-5-sonnet-latest",
  "claude-3-5-haiku-latest",
] as const;

async function assertAdmin(ctx: { supabase: { rpc: (n: string, p: unknown) => Promise<{ data: unknown; error: unknown }> }; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "administrator" });
  if (error) throw new Error("Brak uprawnień: " + (error as Error).message);
  if (!data) throw new Error("Tylko administrator może używać AI Administratora");
}

export const getAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase.from("ai_admin_settings").select("*").limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return { settings: data };
  });

export const updateAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        model: z.enum(ALLOWED_MODELS),
        system_prompt: z.string().min(20).max(8000),
        enable_db_read: z.boolean(),
        enable_db_write: z.boolean(),
        enable_file_read: z.boolean(),
        max_tokens: z.number().int().min(500).max(16000),
        temperature: z.number().min(0).max(1),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase.from("ai_admin_settings").update(data).eq("singleton", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("ai_admin_conversations")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { conversations: data ?? [] };
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: msgs, error } = await context.supabase
      .from("ai_admin_messages")
      .select("*")
      .eq("conversation_id", data.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { messages: msgs ?? [] };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase.from("ai_admin_conversations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendAdminChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        conversation_id: z.string().uuid().optional(),
        message: z.string().min(1).max(20000),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { callAnthropic, runTool } = await import("./ai-admin.server");
    type AnthropicMessage = import("./ai-admin.server").AnthropicMessage;

    // Load settings
    const { data: settings, error: sErr } = await supabaseAdmin
      .from("ai_admin_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (sErr || !settings) throw new Error("Brak ustawień AI");
    const s = settings as {
      model: string;
      system_prompt: string;
      enable_db_read: boolean;
      enable_db_write: boolean;
      enable_file_read: boolean;
      max_tokens: number;
      temperature: number;
    };

    // Ensure conversation
    let convId = data.conversation_id;
    if (!convId) {
      const { data: ins, error } = await supabaseAdmin
        .from("ai_admin_conversations")
        .insert({ user_id: context.userId, title: data.message.slice(0, 60) })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      convId = ins.id;
    } else {
      await supabaseAdmin.from("ai_admin_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
    }

    // Append user message
    await supabaseAdmin.from("ai_admin_messages").insert({
      conversation_id: convId,
      role: "user",
      content: data.message,
    });

    // Load full history → Anthropic format
    const { data: history, error: hErr } = await supabaseAdmin
      .from("ai_admin_messages")
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
        const parts: AnthropicMessage["content"] = [];
        if (mm.content) parts.push({ type: "text", text: mm.content });
        const tc = (mm.tool_calls as Array<{ id: string; name: string; input: Record<string, unknown> }> | null) ?? [];
        for (const t of tc) parts.push({ type: "tool_use", id: t.id, name: t.name, input: t.input });
        messages.push({ role: "assistant", content: parts.length ? parts : mm.content });
      } else if (mm.role === "tool") {
        const tr = (mm.tool_results as Array<{ tool_use_id: string; content: string; is_error?: boolean }> | null) ?? [];
        messages.push({
          role: "user",
          content: tr.map((r) => ({ type: "tool_result", tool_use_id: r.tool_use_id, content: r.content, is_error: r.is_error })),
        });
      }
    }

    // Agentic loop — max 8 tool rounds
    let totalIn = 0;
    let totalOut = 0;
    for (let round = 0; round < 8; round++) {
      const resp = await callAnthropic({
        model: s.model,
        system: s.system_prompt,
        messages,
        max_tokens: s.max_tokens,
        temperature: s.temperature,
      });
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

      await supabaseAdmin.from("ai_admin_messages").insert({
        conversation_id: convId,
        role: "assistant",
        content: assistantText,
        tool_calls: (toolCalls.length ? toolCalls : null) as never,
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

      // Execute tools
      const results: Array<{ tool_use_id: string; content: string; is_error?: boolean }> = [];
      for (const tc of toolBlocks) {
        const r = await runTool(
          { name: tc.name, input: tc.input },
          { enableDbRead: s.enable_db_read, enableDbWrite: s.enable_db_write, enableFileRead: s.enable_file_read }
        );
        const content = r.ok
          ? typeof r.output === "string"
            ? r.output
            : JSON.stringify(r.output).slice(0, 60000)
          : `BŁĄD: ${r.error}`;
        results.push({ tool_use_id: tc.id, content, is_error: !r.ok });

        await supabaseAdmin.from("ai_admin_audit_log").insert({
          user_id: context.userId,
          conversation_id: convId,
          tool_name: tc.name,
          tool_input: tc.input as never,
          tool_output: (r.ok ? r.output : null) as never,
          success: r.ok,
          error: r.ok ? null : r.error,
        });
      }

      await supabaseAdmin.from("ai_admin_messages").insert({
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

    return { conversation_id: convId, ok: true, tokens: { input: totalIn, output: totalOut }, note: "Limit rund narzędzi osiągnięty" };
  });
