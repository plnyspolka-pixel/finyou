import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_ADMIN_MODEL_IDS } from "@/lib/ai-admin.models";

const ALLOWED_MODELS = AI_ADMIN_MODEL_IDS;

async function assertAdmin(ctx: {
  supabase: { rpc: (n: string, p: unknown) => Promise<{ data: unknown; error: unknown }> };
  userId: string;
}) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "administrator",
  });
  if (error) throw new Error("Brak uprawnień: " + (error as Error).message);
  if (!data) throw new Error("Tylko administrator może używać AI Administratora");
}

export const getAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("ai_admin_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
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
        enable_file_write: z.boolean(),
        max_tokens: z.number().int().min(500).max(16000),
        temperature: z.number().min(0).max(1),
        enable_memory: z.boolean(),
        memory_limit: z.number().int().min(0).max(200),
        enable_comms_read: z.boolean(),
        enable_comms_send: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("ai_admin_settings")
      .update(data)
      .eq("singleton", true);
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
    const { error } = await context.supabase
      .from("ai_admin_conversations")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const MEMORY_KIND_VALUES = ["preferencja", "proces", "fakt", "slownik", "projekt"] as const;

export type AiMemoryEntry = {
  id: string;
  kind: string;
  title: string;
  content: string;
  weight: number;
  uses: number;
  pinned: boolean;
  last_used_at: string | null;
  source_conversation_id: string | null;
  updated_at: string;
};

/** Baza wiedzy asystenta — wpisy widoczne w zakładce „Pamięć”. */
export const listMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("ai_admin_memory")
      .select(
        "id, kind, title, content, weight, uses, pinned, last_used_at, source_conversation_id, updated_at",
      )
      .eq("archived", false)
      .order("weight", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return { entries: (data ?? []) as AiMemoryEntry[] };
  });

/**
 * Ręczny wpis pamięci z panelu. `pinned = true`, więc automatyczna destylacja
 * rozmów go nie nadpisze — to wiedza wpisana świadomie przez administratora.
 */
export const upsertMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        kind: z.enum(MEMORY_KIND_VALUES),
        title: z.string().min(2).max(120),
        content: z.string().min(2).max(4000),
        weight: z.number().int().min(0).max(100).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    if (data.id) {
      const { error } = await context.supabase
        .from("ai_admin_memory")
        .update({
          kind: data.kind,
          title: data.title,
          content: data.content,
          weight: data.weight,
          pinned: true,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id, action: "updated" as const };
    }
    const { upsertMemoryEntry } = await import("./ai-admin.server");
    const r = await upsertMemoryEntry({
      kind: data.kind,
      title: data.title,
      content: data.content,
      weight: data.weight,
      userId: context.userId,
      pinned: true,
    });
    return { ok: true, ...r };
  });

/** Archiwizacja wpisu pamięci (nie kasujemy — zostaje ślad w bazie). */
export const deleteMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("ai_admin_memory")
      .update({ archived: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Destylacja rozmowy → streszczenie wątku + wpisy do pamięci długotrwałej.
 * Klient woła to po zakończonej turze bez czekania na wynik, żeby nie wydłużać
 * odpowiedzi czatu.
 */
export const distillConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ conversation_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("ai_admin_settings")
      .select("enable_memory")
      .limit(1)
      .maybeSingle();
    if (settings && settings.enable_memory === false) {
      return { ok: false, reason: "Pamięć długotrwała wyłączona" };
    }
    const { distillConversation: distill } = await import("./ai-admin.server");
    try {
      return await distill({ conversationId: data.conversation_id, userId: context.userId });
    } catch (e) {
      // Destylacja jest dodatkiem — jej błąd nie może wyglądać jak błąd czatu.
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  });

/**
 * Test silnika: potwierdza, że asystent gada z API Anthropica (endpoint, wersja
 * API, klucz) i że ustawiony model odpowiada na tym koncie. Woła `GET /v1/models`
 * (bezpłatne) plus jeden minimalny `POST /v1/messages`.
 */
export const checkAiEngine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("ai_admin_settings")
      .select("model")
      .limit(1)
      .maybeSingle();
    const { checkAnthropicEngine } = await import("./ai-admin.server");
    const { AI_ADMIN_DEFAULT_MODEL } = await import("./ai-admin.models");
    return await checkAnthropicEngine(settings?.model ?? AI_ADMIN_DEFAULT_MODEL);
  });

/** Ostatnie wywołania narzędzi asystenta — podgląd „co bot faktycznie zrobił”. */
export const listAiAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("ai_admin_audit_log")
      .select("id, tool_name, success, error, created_at")
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw new Error(error.message);
    return {
      entries: (data ?? []) as Array<{
        id: string;
        tool_name: string;
        success: boolean;
        error: string | null;
        created_at: string;
      }>,
    };
  });

const attachmentSchema = z.object({
  name: z.string().min(1).max(300),
  mediaType: z.string().min(1).max(200),
  kind: z.enum(["text", "image", "pdf", "other"]),
  size: z.number().int().nonnegative(),
  text: z.string().max(2_000_000).optional(),
  data: z.string().max(40_000_000).optional(), // base64, max ~30 MB plik
});

export const sendAdminChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        conversation_id: z.string().uuid().optional(),
        message: z.string().min(1).max(500000),
        attachments: z.array(attachmentSchema).max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { callAnthropic, runTool, buildMemoryBlock } = await import("./ai-admin.server");
    type AnthropicMessage = import("./ai-admin.server").AnthropicMessage;
    type AnthropicContent = Exclude<AnthropicMessage["content"], string>;

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
      enable_file_write: boolean;
      max_tokens: number;
      temperature: number;
      enable_memory: boolean;
      memory_limit: number;
      enable_comms_read: boolean;
      enable_comms_send: boolean;
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
      await supabaseAdmin
        .from("ai_admin_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", convId);
    }

    // Append user message (z notką o załącznikach, surowych danych nie trzymamy w DB)
    const attList = (data.attachments ?? [])
      .map((a) => `${a.name} (${a.kind}, ${a.size} B)`)
      .join(", ");
    const persistedContent = attList
      ? `${data.message}\n\n📎 Załączniki: ${attList}`
      : data.message;
    await supabaseAdmin.from("ai_admin_messages").insert({
      conversation_id: convId,
      role: "user",
      content: persistedContent,
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
        const tc =
          (mm.tool_calls as Array<{
            id: string;
            name: string;
            input: Record<string, unknown>;
          }> | null) ?? [];
        for (const t of tc)
          parts.push({ type: "tool_use", id: t.id, name: t.name, input: t.input });
        messages.push({ role: "assistant", content: parts.length ? parts : mm.content });
      } else if (mm.role === "tool") {
        const tr =
          (mm.tool_results as Array<{
            tool_use_id: string;
            content: string;
            is_error?: boolean;
          }> | null) ?? [];
        messages.push({
          role: "user",
          content: tr.map((r) => ({
            type: "tool_result",
            tool_use_id: r.tool_use_id,
            content: r.content,
            is_error: r.is_error,
          })),
        });
      }
    }

    // Wpięcie załączników z tej tury w ostatnią wiadomość użytkownika.
    const atts = data.attachments ?? [];
    if (atts.length > 0) {
      const lastUserIdx = (() => {
        for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return i;
        return -1;
      })();
      if (lastUserIdx >= 0) {
        const existing = messages[lastUserIdx].content;
        const baseText = typeof existing === "string" ? existing : "";
        const blocks: AnthropicContent = [];
        if (baseText) blocks.push({ type: "text", text: baseText });
        for (const a of atts) {
          if (a.kind === "image" && a.data) {
            blocks.push({
              type: "image",
              source: { type: "base64", media_type: a.mediaType, data: a.data },
            } as never);
          } else if (a.kind === "pdf" && a.data) {
            blocks.push({
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: a.data },
              title: a.name,
            } as never);
          } else if (a.kind === "text" && a.text) {
            blocks.push({
              type: "text",
              text: `\n\n----- ZAŁĄCZNIK: ${a.name} (${a.size} B, ${a.mediaType}) -----\n${a.text}\n----- KONIEC ZAŁĄCZNIKA -----`,
            });
          } else {
            blocks.push({
              type: "text",
              text: `\n\n[Załącznik binarny ${a.name} (${a.mediaType}, ${a.size} B) — typ nieobsługiwany natywnie przez model, pomijam zawartość.]`,
            });
          }
        }
        messages[lastUserIdx] = { role: "user", content: blocks };
      }
    }

    // Prompt systemowy = ustawienia + pamięć długotrwała (wiedza z poprzednich
    // rozmów) + streszczenie tego wątku. Pamięć zbieramy raz na turę, nie na rundę.
    let systemPrompt = s.system_prompt;
    if (s.enable_memory !== false) {
      try {
        const mem = await buildMemoryBlock(s.memory_limit ?? 40);
        if (mem.text) systemPrompt += mem.text;
      } catch {
        // Brak pamięci nie może blokować rozmowy — lecimy na samym prompcie.
      }
      const { data: convRow } = await supabaseAdmin
        .from("ai_admin_conversations")
        .select("summary")
        .eq("id", convId)
        .maybeSingle();
      if (convRow?.summary) {
        systemPrompt += `\n--- STRESZCZENIE TEGO WĄTKU (wcześniejsze ustalenia) ---\n${convRow.summary}`;
      }
    }

    // Pętla agentowa — max 20 rund narzędzi na jedną wiadomość
    let totalIn = 0;
    let totalOut = 0;
    for (let round = 0; round < 20; round++) {
      const resp = await callAnthropic({
        model: s.model,
        system: systemPrompt,
        messages,
        max_tokens: s.max_tokens,
        temperature: s.temperature,
      });
      totalIn += resp.usage.input_tokens;
      totalOut += resp.usage.output_tokens;

      const textBlocks = resp.content.filter((b) => b.type === "text") as {
        type: "text";
        text: string;
      }[];
      const toolBlocks = resp.content.filter((b) => b.type === "tool_use") as {
        type: "tool_use";
        id: string;
        name: string;
        input: Record<string, unknown>;
      }[];

      const assistantText = textBlocks
        .map((b) => b.text)
        .join("\n")
        .trim();
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
          {
            enableDbRead: s.enable_db_read,
            enableDbWrite: s.enable_db_write,
            enableFileRead: s.enable_file_read,
            enableFileWrite: s.enable_file_write,
            enableMemory: s.enable_memory !== false,
            enableCommsRead: s.enable_comms_read !== false,
            // Wysyłka do klientów działa tylko po świadomym włączeniu w ustawieniach.
            enableCommsSend: s.enable_comms_send === true,
            userId: context.userId,
            conversationId: convId,
          },
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
        tool_results: results as never,
      });
      messages.push({
        role: "user",
        content: results.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.tool_use_id,
          content: r.content,
          is_error: r.is_error,
        })),
      });
    }

    return {
      conversation_id: convId,
      ok: true,
      tokens: { input: totalIn, output: totalOut },
      note: "Limit rund narzędzi osiągnięty",
    };
  });

/** Transkrypcja głosówki dla AI Administratora (ElevenLabs scribe_v2). */
export const transcribeAdminAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("Oczekiwano FormData");
    const file = input.get("audio");
    if (!(file instanceof File)) throw new Error("Brak pliku audio");
    return { file };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("Brak ELEVENLABS_API_KEY");

    const fd = new FormData();
    fd.append("file", data.file);
    fd.append("model_id", "scribe_v2");
    fd.append("language_code", "pol");
    fd.append("diarize", "false");
    fd.append("tag_audio_events", "false");

    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: fd,
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Transkrypcja nieudana (${res.status}): ${err.slice(0, 300)}`);
    }
    const json: { text?: string } = await res.json();
    return { text: String(json.text ?? "").trim() };
  });
