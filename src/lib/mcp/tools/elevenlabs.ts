// ElevenLabs — agenty głosowe i tekstowe (Ania, A1–A3), rozmowy i nagrania,
// numery, baza wiedzy, prompty, głosy, TTS, STT, efekty, muzyka, dubbing,
// wideo (endpoint konfigurowalny) i ogólne wywołanie API.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  DESTRUCTIVE,
  SENDS,
  WRITE,
  WRITE_IDEMPOTENT,
  actorId,
  clampLimit,
  countBy,
  daysAgo,
  fail,
  handle,
  isoDate,
  ok,
  oneOf,
  requireRolesAdmin,
  requireTeam,
  requireTeamAdmin,
  rowsOf,
  snippet,
} from "../_helpers";
import { defineListTool, search, text } from "../_list-tool";

const ADMIN_ONLY = ["administrator"] as const;
const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: true } as const;

type Surface = "intake" | "investor_info" | "investor_panel";
type Variant = "klient" | "inwestor" | "inwestor_prywatny";
const VARIANT_SURFACE: Record<Variant, Surface> = {
  klient: "intake",
  inwestor: "investor_info",
  inwestor_prywatny: "investor_panel",
};
const VARIANT_SETTINGS_ID: Record<Variant, number> = {
  klient: 1,
  inwestor: 2,
  inwestor_prywatny: 3,
};

const unixToIso = (v: unknown) =>
  typeof v === "number" && v > 0 ? new Date(v * 1000).toISOString() : null;

async function agentRoles(s: any) {
  const { getAgentIdForSurface } = await import("@/lib/elevenlabs-agents.server");
  const [intake, investorInfo, investorPanel] = await Promise.all([
    getAgentIdForSurface("intake"),
    getAgentIdForSurface("investor_info"),
    getAgentIdForSurface("investor_panel"),
  ]);
  const settings = await oneOf(
    s
      .from("voicebot_settings")
      .select("agent_id, document_reminder_agent_id, agent_phone_number_id")
      .eq("id", 1),
    "voicebot_settings",
  );
  const roles: Record<string, string[]> = {};
  const add = (id: string | null | undefined, role: string) => {
    if (!id) return;
    (roles[id] ??= []).push(role);
  };
  add(intake, "A1 intake (chat, Messenger, e-mail, widget)");
  add(investorInfo, "A2 investor_info (/dla-inwestora)");
  add(investorPanel, "A3 investor_panel (panel inwestora)");
  add(settings?.agent_id, "telefon (voicebot Ania)");
  add(settings?.document_reminder_agent_id, "telefon — przypomnienie o dokumentach");
  return {
    roles,
    ids: {
      intake,
      investor_info: investorInfo,
      investor_panel: investorPanel,
      phone: settings?.agent_id ?? null,
      document_reminder: settings?.document_reminder_agent_id ?? null,
      phone_number_id: settings?.agent_phone_number_id ?? null,
    },
  };
}

// ── Stan i konfiguracja ─────────────────────────────────────────────────────

export const elevenStatus = defineTool({
  name: "eleven_status",
  title: "ElevenLabs status",
  description:
    "Stan integracji ElevenLabs: klucz API, plan i zużycie znaków, agenty przypisane do powierzchni (A1 intake, A2 investor_info, A3 investor_panel, telefon, przypomnienia), numer telefonu voicebota, ustawienia dzwonienia i SMS, aktualne okno godzinowe dzwonienia, sekret webhook tooli. Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_i, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      const { getCallingWindow } = await import("@/lib/voicebot.functions");
      const errors: string[] = [];
      const { ids } = await agentRoles(s);
      const settings = await oneOf(
        s.from("voicebot_settings").select("*").eq("id", 1),
        "voicebot_settings",
      );
      let subscription: any = null;
      if (el.hasElevenApiKey()) {
        try {
          const sub = await el.getSubscription();
          subscription = {
            tier: sub?.tier,
            status: sub?.status,
            character_count: sub?.character_count,
            character_limit: sub?.character_limit,
            next_reset: unixToIso(sub?.next_character_count_reset_unix),
            voice_slots_used: sub?.voice_slots_used,
            voice_limit: sub?.voice_limit,
            can_use_instant_voice_cloning: sub?.can_use_instant_voice_cloning,
          };
        } catch (e) {
          errors.push(`subscription: ${(e as Error).message}`);
        }
      }
      const win = getCallingWindow();
      return ok({
        api_key_configured: el.hasElevenApiKey(),
        tools_secret_configured: Boolean(process.env.AGENT_TOOLS_SECRET),
        video_endpoints: el.videoEndpoints(),
        subscription,
        agents: ids,
        voicebot: settings
          ? {
              call_trigger: settings.call_trigger,
              call_delay_seconds: settings.call_delay_seconds,
              retry_count: settings.retry_count,
              retry_delay_minutes: settings.retry_delay_minutes,
              sms_enabled: settings.sms_enabled,
              sms_from: settings.sms_from,
              sms_trigger: settings.sms_trigger,
              sms_delay_seconds: settings.sms_delay_seconds,
              updated_at: settings.updated_at,
            }
          : null,
        calling_window: {
          allowed_now: win.allowed,
          reason: win.reason ?? null,
          warsaw_hour: win.hour,
          weekday: win.weekday,
          next_allowed_at: win.nextAllowedAt.toISOString(),
        },
        errors,
      });
    }),
});

export const elevenListAgents = defineTool({
  name: "eleven_list_agents",
  title: "List ElevenLabs agents",
  description:
    "Agenty konwersacyjne na koncie ElevenLabs z oznaczeniem, którą powierzchnię Finance You obsługują (A1/A2/A3, telefon, przypomnienia). Tylko administrator/operator.",
  inputSchema: {
    search: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: READ,
  handler: ({ search, limit }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      const { roles } = await agentRoles(s);
      const json = await el.listAgents({ search, pageSize: clampLimit(limit, 30, 100) });
      return ok({
        agents: (json.agents ?? []).map((a: any) => ({
          agent_id: a.agent_id,
          name: a.name,
          created_at: unixToIso(a.created_at_unix_secs),
          roles: roles[a.agent_id] ?? [],
        })),
        has_more: json.has_more ?? false,
        next_cursor: json.next_cursor ?? null,
      });
    }),
});

export const elevenGetAgent = defineTool({
  name: "eleven_get_agent",
  title: "Get ElevenLabs agent config",
  description:
    "Konfiguracja agenta ElevenLabs: nazwa, pierwsza wiadomość, język, prompt systemowy, model LLM, głos, narzędzia (webhook toole), dokumenty bazy wiedzy. `full=true` zwraca surowy JSON. Tylko administrator/operator.",
  inputSchema: {
    agent_id: z.string().min(5),
    full: z.boolean().default(false),
    prompt_max_chars: z.number().int().min(200).max(60000).default(8000),
  },
  annotations: READ,
  handler: ({ agent_id, full, prompt_max_chars }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      const a = await el.getAgent(agent_id);
      if (full) return ok(a);
      const cc = a?.conversation_config ?? {};
      const prompt = cc.agent?.prompt ?? {};
      const p = String(prompt.prompt ?? "");
      return ok({
        agent_id: a?.agent_id ?? agent_id,
        name: a?.name,
        first_message: cc.agent?.first_message ?? null,
        language: cc.agent?.language ?? null,
        llm: prompt.llm ?? null,
        temperature: prompt.temperature ?? null,
        prompt:
          p.length > prompt_max_chars
            ? `${p.slice(0, prompt_max_chars)}… (ucięte, ${p.length} znaków)`
            : p,
        prompt_length: p.length,
        tools: (prompt.tools ?? []).map((t: any) => ({
          type: t?.type,
          name: t?.name,
          description: snippet(t?.description, 160),
        })),
        tool_ids: prompt.tool_ids ?? [],
        knowledge_base: (prompt.knowledge_base ?? []).map((d: any) => ({
          id: d?.id,
          name: d?.name,
          type: d?.type,
          usage_mode: d?.usage_mode,
        })),
        voice_id: cc.tts?.voice_id ?? null,
        tts_model_id: cc.tts?.model_id ?? null,
        dynamic_variable_placeholders:
          cc.agent?.dynamic_variables?.dynamic_variable_placeholders ?? null,
      });
    }),
});

export const elevenListConversations = defineTool({
  name: "eleven_list_conversations",
  title: "List ElevenLabs conversations",
  description:
    "Rozmowy agentów ElevenLabs (telefon, czat, Messenger przez turę tekstową) z API: agent, status, start, czas trwania, wynik, liczba wiadomości — z dopiętym leadem, jeśli rozmowa jest w historii komunikacji. Filtry: agent, daty, wynik. Tylko administrator/operator.",
  inputSchema: {
    agent_id: z.string().optional(),
    since: z.string().optional().describe("Rozpoczęte od (ISO 8601 lub YYYY-MM-DD)."),
    until: z.string().optional(),
    call_successful: z.enum(["success", "failure", "unknown"]).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().optional().describe("`next_cursor` z poprzedniej strony."),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      const toUnix = (v?: string) => {
        const iso = isoDate(v, "data");
        return iso ? Math.floor(new Date(iso).getTime() / 1000) : undefined;
      };
      const json = await el.listConversations({
        agentId: a.agent_id,
        pageSize: clampLimit(a.limit, 30, 100),
        cursor: a.cursor,
        callStartAfterUnix: toUnix(a.since),
        callStartBeforeUnix: toUnix(a.until),
        callSuccessful: a.call_successful,
      });
      const convs = json.conversations ?? [];
      const ids = convs.map((c: any) => c.conversation_id).filter(Boolean);
      const local = new Map<string, any>();
      if (ids.length) {
        const rows = await rowsOf(
          s
            .from("lead_communications")
            .select("external_id, lead_id, duration_seconds, metadata")
            .in("external_id", ids),
          "lead_communications",
        );
        for (const r of rows) local.set(r.external_id, r);
      }
      return ok({
        conversations: convs.map((c: any) => {
          const l = local.get(c.conversation_id);
          return {
            conversation_id: c.conversation_id,
            agent_id: c.agent_id,
            agent_name: c.agent_name,
            status: c.status,
            start_time: unixToIso(c.start_time_unix_secs),
            call_duration_secs: c.call_duration_secs,
            message_count: c.message_count,
            call_successful: c.call_successful,
            direction: c.direction ?? null,
            lead_id: l?.lead_id ?? null,
            call_outcome: l?.metadata?.call_outcome_label ?? l?.metadata?.call_outcome ?? null,
            lead_url: l?.lead_id ? `/operator/leady/${l.lead_id}` : null,
          };
        }),
        has_more: json.has_more ?? false,
        next_cursor: json.next_cursor ?? null,
      });
    }),
});

export const elevenGetConversation = defineTool({
  name: "eleven_get_conversation",
  title: "Get ElevenLabs conversation (transcript)",
  description:
    "Pełna rozmowa z API ElevenLabs: transkrypt tura po turze (z wywołaniami narzędzi), analiza (podsumowanie, ocena kryteriów, zebrane dane), metadane (czas, koszt, telefon) oraz powiązany lead i wpis kolejki połączeń. Tylko administrator/operator.",
  inputSchema: {
    conversation_id: z.string().min(5),
    include_raw: z.boolean().default(false),
  },
  annotations: READ,
  handler: ({ conversation_id, include_raw }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      const c = await el.getConversation(conversation_id);
      const [comm, queue] = await Promise.all([
        oneOf(
          s
            .from("lead_communications")
            .select(
              "id, lead_id, channel, status, duration_seconds, recording_url, metadata, created_at",
            )
            .eq("external_id", conversation_id),
          "lead_communications",
        ).catch(() => null),
        oneOf(
          s
            .from("call_queue")
            .select(
              "id, status, source, phone_normalized, scheduled_at, started_at, finished_at, result_summary, client_id, loan_application_id",
            )
            .eq("conversation_id", conversation_id),
          "call_queue",
        ).catch(() => null),
      ]);
      const meta = c?.metadata ?? {};
      return ok({
        conversation_id: c?.conversation_id ?? conversation_id,
        agent_id: c?.agent_id,
        status: c?.status,
        transcript: (c?.transcript ?? []).map((t: any) => ({
          role: t?.role,
          message: t?.message,
          time_in_call_secs: t?.time_in_call_secs,
          tool_calls: (t?.tool_calls ?? [])
            .map((x: any) => x?.tool_name ?? x?.name)
            .filter(Boolean),
        })),
        analysis: c?.analysis
          ? {
              call_successful: c.analysis.call_successful,
              transcript_summary: c.analysis.transcript_summary,
              evaluation_criteria_results: c.analysis.evaluation_criteria_results,
              data_collection_results: c.analysis.data_collection_results,
            }
          : null,
        metadata: {
          start_time: unixToIso(meta.start_time_unix_secs),
          call_duration_secs: meta.call_duration_secs,
          cost: meta.cost,
          termination_reason: meta.termination_reason,
          phone_call: meta.phone_call ?? null,
        },
        local: {
          communication: comm,
          call_queue: queue,
          lead_url: comm?.lead_id ? `/operator/leady/${comm.lead_id}` : null,
        },
        raw: include_raw ? c : undefined,
      });
    }),
});

export const elevenGetConversationAudio = defineTool({
  name: "eleven_get_conversation_audio",
  title: "Get conversation recording (audio link)",
  description:
    "Pobiera nagranie rozmowy z ElevenLabs i zwraca podpisany link do pliku (ważny godzinę). Tylko administrator/operator.",
  inputSchema: { conversation_id: z.string().min(5) },
  annotations: READ,
  handler: ({ conversation_id }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      const { storeMedia } = await import("@/lib/media-storage.server");
      const audio = await el.getConversationAudio(conversation_id);
      const stored = await storeMedia(audio.bytes, {
        contentType: audio.contentType,
        visibility: "private",
        prefix: "recordings",
        name: conversation_id,
      });
      return ok({ conversation_id, ...stored });
    }),
});

export const elevenListVoices = defineTool({
  name: "eleven_list_voices",
  title: "List ElevenLabs voices",
  description:
    "Głosy dostępne na koncie ElevenLabs (do TTS i agentów): id, nazwa, kategoria, etykiety, próbka. Tylko administrator/operator.",
  inputSchema: {
    search: z.string().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: READ,
  handler: ({ search, limit }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      const voices = await el.listVoices({ search });
      return ok({
        voices: voices.slice(0, clampLimit(limit, 100, 200)).map((v) => ({
          voice_id: v.voice_id,
          name: v.name,
          category: v.category,
          labels: v.labels,
          preview_url: v.preview_url,
        })),
        total: voices.length,
      });
    }),
});

export const elevenListPhoneNumbers = defineTool({
  name: "eleven_list_phone_numbers",
  title: "List ElevenLabs phone numbers",
  description:
    "Numery telefonów podpięte do agentów w ElevenLabs (Twilio/SIP): numer, etykieta, id, przypisany agent. Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_i, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      const rows = await el.listPhoneNumbers();
      return ok({
        phone_numbers: (Array.isArray(rows) ? rows : []).map((n: any) => ({
          phone_number_id: n.phone_number_id,
          phone_number: n.phone_number,
          label: n.label,
          provider: n.provider,
          assigned_agent: n.assigned_agent
            ? { agent_id: n.assigned_agent.agent_id, name: n.assigned_agent.agent_name }
            : null,
        })),
      });
    }),
});

export const elevenListKnowledgeBase = defineTool({
  name: "eleven_list_knowledge_base",
  title: "List ElevenLabs knowledge base",
  description:
    "Dokumenty bazy wiedzy agentów w ElevenLabs: id, nazwa, typ (tekst/url/plik), rozmiar, agenty, które z nich korzystają. Tylko administrator/operator.",
  inputSchema: {
    search: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: READ,
  handler: ({ search, limit }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      const json = await el.listKnowledgeBase({ search, pageSize: clampLimit(limit, 50, 100) });
      return ok({
        documents: (json.documents ?? []).map((d: any) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          url: d.url ?? null,
          size_bytes: d.metadata?.size_bytes ?? null,
          created_at: unixToIso(d.metadata?.created_at_unix_secs),
          dependent_agents: (d.dependent_agents ?? []).map((a: any) => a?.id ?? a),
        })),
        has_more: json.has_more ?? false,
      });
    }),
});

export const getTextAgentPrompt = defineTool({
  name: "get_text_agent_prompt",
  title: "Get bot prompt (klient / inwestor / inwestor_prywatny)",
  description:
    "Prompt systemowy i pierwsza wiadomość bota dla wariantu: klient (A1 intake — czat, Messenger, e-mail, telefon), inwestor (A2), inwestor_prywatny (A3) — z edytora /admin/text-agent. Tylko administrator/operator.",
  inputSchema: {
    variant: z.enum(["klient", "inwestor", "inwestor_prywatny"]).default("klient"),
    full: z.boolean().default(false).describe("Cały prompt (domyślnie do 8000 znaków)."),
  },
  annotations: READ,
  handler: ({ variant, full }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const { fetchAgentPrompt } = await import("@/lib/elevenlabs-text-agent.server");
      const { getAgentIdForSurface } = await import("@/lib/elevenlabs-agents.server");
      const fetched = await fetchAgentPrompt(variant as Variant);
      const row = await oneOf(
        s
          .from("text_agent_settings")
          .select("id, updated_at, updated_by")
          .eq("id", VARIANT_SETTINGS_ID[variant as Variant]),
        "text_agent_settings",
      );
      const p = fetched.prompt;
      return ok({
        variant,
        surface: VARIANT_SURFACE[variant as Variant],
        agent_id: await getAgentIdForSurface(VARIANT_SURFACE[variant as Variant]),
        first_message: fetched.firstMessage,
        prompt: full || p.length <= 8000 ? p : `${p.slice(0, 8000)}… (ucięte, ${p.length} znaków)`,
        prompt_length: p.length,
        updated_at: row?.updated_at ?? null,
      });
    }),
});

export const listTextAgentKnowledge = defineListTool({
  name: "list_text_agent_knowledge",
  title: "List bot knowledge entries",
  description:
    "Wpisy wiedzy botów (silnik tekstowy / RAG): tytuł, treść, grupa (klient / inwestor / wspolna). Tylko administrator/operator.",
  table: "text_agent_knowledge",
  columns: "id, title, content, audience, created_at, updated_at",
  resultKey: "entries",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    audience: text("audience", "Grupa: klient, inwestor, wspolna."),
    query: search(["title", "content"], "Fraza w tytule lub treści."),
  },
  map: (r) => ({ ...r, content: snippet(r.content, 600) }),
});

export const searchTextAgentKnowledge = defineTool({
  name: "search_text_agent_knowledge",
  title: "Semantic search in bot knowledge",
  description:
    "Wyszukiwanie semantyczne (embeddingi) w wiedzy botów — to, co bot dostałby do kontekstu przy takim pytaniu klienta. Tylko administrator/operator.",
  inputSchema: {
    query: z.string().min(3).max(500),
    audience: z.enum(["klient", "inwestor"]).default("klient"),
    k: z.number().int().min(1).max(10).default(4),
  },
  annotations: READ,
  handler: ({ query, audience, k }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const { retrieveKnowledge } = await import("@/lib/text-agent-knowledge.server");
      const hits = await retrieveKnowledge(query, k, audience);
      return ok({ hits });
    }),
});

export const getVoiceCallStats = defineTool({
  name: "get_voice_call_stats",
  title: "Get voicebot call statistics",
  description:
    "Statystyki telefonów voicebota w okresie (domyślnie 7 dni): kolejka po statusie i źródle, rozmowy po wyniku (odebrane, nieodebrane, poczta, błąd), średni i łączny czas rozmów, po dniach. Tylko administrator/operator.",
  inputSchema: {
    since: z.string().optional().describe("Od (ISO 8601 lub YYYY-MM-DD; domyślnie 7 dni wstecz)."),
    until: z.string().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ since, until }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const from = isoDate(since, "data od") ?? daysAgo(7);
      const to = isoDate(until, "data do") ?? new Date().toISOString();
      const queue = await rowsOf(
        s
          .from("call_queue")
          .select("status, source, created_at, started_at")
          .gte("created_at", from)
          .lt("created_at", to)
          .limit(5000),
        "call_queue",
      );
      const comms = await rowsOf(
        s
          .from("lead_communications")
          .select("duration_seconds, metadata, created_at")
          .eq("channel", "voicebot_call")
          .gte("created_at", from)
          .lt("created_at", to)
          .limit(5000),
        "lead_communications",
      );
      const outcomes = comms.map((c) => ({ outcome: c.metadata?.call_outcome ?? "(brak)" }));
      const durations = comms.map((c) => Number(c.duration_seconds ?? 0)).filter((d) => d > 0);
      const byDay: Record<string, number> = {};
      for (const q of queue) {
        const d = String(q.created_at).slice(0, 10);
        byDay[d] = (byDay[d] ?? 0) + 1;
      }
      return ok({
        since: from,
        until: to,
        queued: queue.length,
        dialed: queue.filter((q) => q.started_at).length,
        by_status: countBy(queue, "status"),
        by_source: countBy(queue, "source"),
        conversations: comms.length,
        by_outcome: countBy(outcomes, "outcome"),
        avg_duration_secs: durations.length
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0,
        total_minutes: Math.round(durations.reduce((a, b) => a + b, 0) / 60),
        by_day: Object.fromEntries(Object.entries(byDay).sort()),
      });
    }),
});

// ── Zapis: ustawienia, prompty, agenty, wiedza ──────────────────────────────

export const updateVoicebotSettings = defineTool({
  name: "update_voicebot_settings",
  title: "Update voicebot settings",
  description:
    "Ustawienia voicebota i SMS: agent telefoniczny, numer (phone_number_id z ElevenLabs), wyzwalacz dzwonienia (auto / manual / auto_retry), opóźnienia i ponowienia, SMS (włączony, nadawca, szablon, wyzwalacz) oraz agenty powierzchni A1/A2/A3 i przypomnień. Zmienia tylko podane pola. Tylko administrator.",
  inputSchema: {
    agent_id: z.string().nullable().optional(),
    agent_phone_number_id: z.string().nullable().optional(),
    document_reminder_agent_id: z.string().nullable().optional(),
    intake_agent_id: z.string().nullable().optional(),
    investor_info_agent_id: z.string().nullable().optional(),
    investor_panel_agent_id: z.string().nullable().optional(),
    call_trigger: z.enum(["auto", "manual", "auto_retry"]).optional(),
    call_delay_seconds: z.number().int().min(0).max(86400).optional(),
    retry_count: z.number().int().min(0).max(10).optional(),
    retry_delay_minutes: z.number().int().min(1).max(1440).optional(),
    sms_enabled: z.boolean().optional(),
    sms_from: z.string().nullable().optional(),
    sms_template: z.string().max(1000).nullable().optional(),
    sms_delay_seconds: z.number().int().min(0).max(86400).optional(),
    sms_trigger: z.enum(["before_call", "after_call", "on_failure", "off"]).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(a)) if (v !== undefined) patch[k] = v;
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const { data, error } = await s
        .from("voicebot_settings")
        .upsert({ id: 1, ...patch, updated_at: new Date().toISOString() })
        .select("*")
        .single();
      if (error) throw new Error(`voicebot_settings: ${error.message}`);
      return ok({ ok: true, settings: data });
    }),
});

export const updateTextAgentPrompt = defineTool({
  name: "update_text_agent_prompt",
  title: "Update bot prompt and push to ElevenLabs",
  description:
    "Zmienia prompt systemowy i/lub pierwszą wiadomość bota dla wariantu (klient = A1, inwestor = A2, inwestor_prywatny = A3), czyści cache i od razu wysyła prompt do agenta w ElevenLabs (z regułami kanałów), tak jak zapis w /admin/text-agent. Tylko administrator.",
  inputSchema: {
    variant: z.enum(["klient", "inwestor", "inwestor_prywatny"]),
    system_prompt: z.string().min(20).max(60000).optional(),
    first_message: z.string().max(1000).nullable().optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ variant, system_prompt, first_message }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      if (system_prompt === undefined && first_message === undefined)
        return fail("Podaj system_prompt albo first_message.");
      const id = VARIANT_SETTINGS_ID[variant as Variant];
      const existing = await oneOf(
        s.from("text_agent_settings").select("system_prompt, first_message").eq("id", id),
        "text_agent_settings",
      );
      const row = {
        id,
        system_prompt: system_prompt ?? existing?.system_prompt ?? "",
        first_message:
          first_message === undefined ? (existing?.first_message ?? null) : first_message,
        updated_by: actorId(ctx),
        updated_at: new Date().toISOString(),
      };
      if (!row.system_prompt) return fail("Brak promptu systemowego do zapisania.");
      const { error } = await s.from("text_agent_settings").upsert(row);
      if (error) throw new Error(`text_agent_settings: ${error.message}`);
      const { clearAgentPromptCache } = await import("@/lib/elevenlabs-text-agent.server");
      clearAgentPromptCache(variant as Variant);
      const { syncElevenLabsAgentPrompts } = await import("@/lib/elevenlabs-agents.server");
      const sync = await syncElevenLabsAgentPrompts({
        surfaces: [VARIANT_SURFACE[variant as Variant]],
      });
      return ok({ ok: true, variant, prompt_length: row.system_prompt.length, sync });
    }),
});

export const syncVoiceAgentPrompts = defineTool({
  name: "sync_voice_agent_prompts",
  title: "Push current prompts to ElevenLabs agents",
  description:
    "Wymusza wysłanie aktualnych promptów (z regułami kanałów) do agentów A1–A3 w ElevenLabs — np. gdy ktoś zmienił prompt ręcznie w konsoli. Zwraca, co zaktualizowano, pominięto i czy telefon dzwoni innym agentem niż A1. Tylko administrator.",
  inputSchema: {
    surfaces: z.array(z.enum(["intake", "investor_info", "investor_panel"])).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ surfaces }, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const { syncElevenLabsAgentPrompts } = await import("@/lib/elevenlabs-agents.server");
      return ok(await syncElevenLabsAgentPrompts({ surfaces: surfaces as Surface[] | undefined }));
    }),
});

export const provisionVoiceAgents = defineTool({
  name: "provision_voice_agents",
  title: "Create missing ElevenLabs process agents",
  description:
    "Tworzy przez API brakujące agenty procesowe A1/A2/A3 z aktualnymi promptami i zapisuje ich id w ustawieniach (idempotentne — istniejące pomija). Webhook toole dopina się potem w konsoli ElevenLabs. Tylko administrator.",
  inputSchema: {},
  annotations: WRITE_IDEMPOTENT,
  handler: (_i, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const { ensureElevenLabsProcessAgents } = await import("@/lib/elevenlabs-agents.server");
      return ok(await ensureElevenLabsProcessAgents());
    }),
});

export const elevenUpdateAgent = defineTool({
  name: "eleven_update_agent",
  title: "Update ElevenLabs agent (any)",
  description:
    "Bezpośrednia edycja dowolnego agenta w ElevenLabs (np. telefonicznego lub windykacyjnego): nazwa, pierwsza wiadomość, prompt, język, model LLM, głos, model TTS. Dla A1–A3 prompt edytuj przez `update_text_agent_prompt`, bo inaczej synchronizacja nadpisze go promptem z panelu. Tylko administrator.",
  inputSchema: {
    agent_id: z.string().min(5),
    name: z.string().max(200).optional(),
    first_message: z.string().max(1000).optional(),
    prompt: z.string().max(60000).optional(),
    language: z.string().max(10).optional(),
    llm: z.string().max(80).optional(),
    voice_id: z.string().max(80).optional(),
    tts_model_id: z.string().max(80).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const el = await import("@/lib/elevenlabs-api.server");
      const { AGENT_DYNAMIC_VARIABLE_DEFAULTS } = await import("@/lib/agent-channel-rules");
      const { agent_id, ...rest } = a;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const result = await el.patchAgent(agent_id, {
        ...patch,
        dynamic_variable_placeholders:
          patch.prompt || patch.first_message ? AGENT_DYNAMIC_VARIABLE_DEFAULTS : undefined,
      });
      return ok({ ok: true, agent_id, name: result?.name, updated_fields: Object.keys(patch) });
    }),
});

const knowledgeAudience = z.enum(["klient", "inwestor", "wspolna"]);

export const addTextAgentKnowledge = defineTool({
  name: "add_text_agent_knowledge",
  title: "Add bot knowledge entry",
  description:
    "Dodaje wpis wiedzy botów (z embeddingiem do wyszukiwania semantycznego): tytuł, treść, grupa. Tylko administrator.",
  inputSchema: {
    title: z.string().min(2).max(200),
    content: z.string().min(10).max(20000),
    audience: knowledgeAudience.default("klient"),
  },
  annotations: WRITE,
  handler: ({ title, content, audience }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      const { embedText } = await import("@/lib/text-agent-knowledge.server");
      let embedding: number[] | null = null;
      try {
        embedding = await embedText(`${title}\n\n${content}`.trim());
      } catch (e) {
        console.error("[mcp knowledge] embed failed", (e as Error).message);
      }
      const row: Record<string, unknown> = {
        title,
        content,
        audience,
        created_by: actorId(ctx),
        updated_at: new Date().toISOString(),
      };
      if (embedding && embedding.length) row.embedding = embedding;
      const { data, error } = await s
        .from("text_agent_knowledge")
        .insert(row)
        .select("id, title, audience, created_at")
        .single();
      if (error) throw new Error(`text_agent_knowledge: ${error.message}`);
      return ok({ ok: true, entry: data, embedded: !!embedding });
    }),
});

export const updateTextAgentKnowledge = defineTool({
  name: "update_text_agent_knowledge",
  title: "Update bot knowledge entry",
  description:
    "Edytuje wpis wiedzy botów (tytuł, treść, grupa) i przelicza embedding. Tylko administrator.",
  inputSchema: {
    id: z.string().uuid(),
    title: z.string().min(2).max(200).optional(),
    content: z.string().min(10).max(20000).optional(),
    audience: knowledgeAudience.optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      const current = await oneOf(
        s.from("text_agent_knowledge").select("id, title, content, audience").eq("id", a.id),
        "text_agent_knowledge",
      );
      if (!current) return fail("Nie znaleziono wpisu.");
      const title = a.title ?? current.title;
      const content = a.content ?? current.content;
      const row: Record<string, unknown> = {
        title,
        content,
        audience: a.audience ?? current.audience,
        updated_at: new Date().toISOString(),
      };
      if (a.title !== undefined || a.content !== undefined) {
        try {
          const { embedText } = await import("@/lib/text-agent-knowledge.server");
          const emb = await embedText(`${title}\n\n${content}`.trim());
          if (emb?.length) row.embedding = emb;
        } catch (e) {
          console.error("[mcp knowledge] embed failed", (e as Error).message);
        }
      }
      const { data, error } = await s
        .from("text_agent_knowledge")
        .update(row)
        .eq("id", a.id)
        .select("id, title, audience, updated_at")
        .single();
      if (error) throw new Error(`text_agent_knowledge: ${error.message}`);
      return ok({ ok: true, entry: data });
    }),
});

export const deleteTextAgentKnowledge = defineTool({
  name: "delete_text_agent_knowledge",
  title: "Delete bot knowledge entry",
  description: "Usuwa wpis wiedzy botów. Tylko administrator.",
  inputSchema: { id: z.string().uuid() },
  annotations: DESTRUCTIVE,
  handler: ({ id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ADMIN_ONLY);
      const { data, error } = await s
        .from("text_agent_knowledge")
        .delete()
        .eq("id", id)
        .select("id, title");
      if (error) throw new Error(`text_agent_knowledge: ${error.message}`);
      if (!data?.length) return fail("Nie znaleziono wpisu.");
      return ok({ ok: true, deleted: data[0] });
    }),
});

export const elevenAddKnowledgeText = defineTool({
  name: "eleven_add_knowledge_text",
  title: "Add text document to ElevenLabs knowledge base",
  description:
    "Dodaje dokument tekstowy do bazy wiedzy ElevenLabs (agenci ConvAI) i opcjonalnie dopina go do wskazanego agenta. Tylko administrator.",
  inputSchema: {
    name: z.string().min(2).max(200),
    text: z.string().min(20).max(200000),
    agent_id: z.string().optional().describe("Dopnij dokument do tego agenta."),
  },
  annotations: WRITE,
  handler: ({ name, text: body, agent_id }, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const el = await import("@/lib/elevenlabs-api.server");
      const doc = await el.createKnowledgeText({ name, text: body });
      let attach: unknown = null;
      if (agent_id && doc?.id) {
        attach = await el
          .attachKnowledgeToAgent(agent_id, { id: doc.id, name: doc.name ?? name, type: "text" })
          .catch((e) => ({ error: (e as Error).message }));
      }
      return ok({ ok: true, document: doc, attach });
    }),
});

export const elevenAddKnowledgeUrl = defineTool({
  name: "eleven_add_knowledge_url",
  title: "Add URL document to ElevenLabs knowledge base",
  description:
    "Dodaje stronę (URL) do bazy wiedzy ElevenLabs i opcjonalnie dopina do agenta. Tylko administrator.",
  inputSchema: {
    url: z.string().url(),
    name: z.string().max(200).optional(),
    agent_id: z.string().optional(),
  },
  annotations: WRITE,
  handler: ({ url, name, agent_id }, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const el = await import("@/lib/elevenlabs-api.server");
      const doc = await el.createKnowledgeUrl({ url, name });
      let attach: unknown = null;
      if (agent_id && doc?.id) {
        attach = await el
          .attachKnowledgeToAgent(agent_id, {
            id: doc.id,
            name: doc.name ?? name ?? url,
            type: "url",
          })
          .catch((e) => ({ error: (e as Error).message }));
      }
      return ok({ ok: true, document: doc, attach });
    }),
});

// ── Rozmowy: telefon i tura testowa ─────────────────────────────────────────

export const placeVoiceCall = defineTool({
  name: "place_voice_call",
  title: "Place voicebot call now (ElevenLabs)",
  description:
    "Dzwoni TERAZ do klienta botem Anią (agent ElevenLabs przez Twilio): numer albo lead / wniosek, imię i zmienne dynamiczne dla agenta, opcjonalnie inny agent. Obowiązuje limit 1 telefon / 24 h na numer i okno godzinowe. To realny telefon — użyj tylko na wyraźne polecenie użytkownika. Zaplanowany telefon w kolejce daje `queue_call`. Tylko administrator/operator.",
  inputSchema: {
    phone: z.string().min(9).max(20).optional(),
    lead_id: z.string().uuid().optional(),
    loan_application_id: z.string().uuid().optional(),
    first_name: z.string().max(80).optional(),
    dynamic_variables: z.record(z.string(), z.string()).optional(),
    agent_id: z.string().optional().describe("Inny agent niż domyślny telefoniczny."),
  },
  annotations: SENDS,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      let phone = a.phone ?? "";
      let clientId: string | null = null;
      let applicationId: string | null = a.loan_application_id ?? null;
      let firstName = a.first_name ?? null;
      if (!phone && a.lead_id) {
        const lead = await oneOf(
          s
            .from("leads")
            .select("phone_normalized, phone_raw, first_name, client_id, loan_application_id")
            .eq("id", a.lead_id),
          "leads",
        );
        if (!lead) return fail("Nie znaleziono leada.");
        phone = lead.phone_normalized ?? lead.phone_raw ?? "";
        clientId = lead.client_id ?? null;
        applicationId = applicationId ?? lead.loan_application_id ?? null;
        firstName = firstName ?? lead.first_name ?? null;
      }
      if (!phone && applicationId) {
        const app = await oneOf(
          s.from("loan_applications").select("client_id").eq("id", applicationId),
          "loan_applications",
        );
        if (!app) return fail("Nie znaleziono wniosku.");
        clientId = app.client_id;
        const client = await oneOf(
          s.from("clients").select("phone_normalized, phone, first_name").eq("id", app.client_id),
          "clients",
        );
        phone = client?.phone_normalized ?? client?.phone ?? "";
        firstName = firstName ?? client?.first_name ?? null;
      }
      if (!phone) return fail("Podaj phone, lead_id albo loan_application_id.");
      const { placeOutboundCallInternal } = await import("@/lib/voicebot.functions");
      const result = await placeOutboundCallInternal({
        phone,
        source: "mcp",
        clientId,
        loanApplicationId: applicationId,
        firstName,
        dynamicVariables: a.dynamic_variables ?? null,
        agentIdOverride: a.agent_id ?? null,
      });
      return result.ok
        ? ok({ ...result, actor: actorId(ctx) })
        : fail(result.error ?? "Połączenie nie zostało wykonane.");
    }),
});

export const askVoiceAgent = defineTool({
  name: "ask_voice_agent",
  title: "Ask an ElevenLabs agent (test turn)",
  description:
    "Jedna tura tekstowa z agentem ElevenLabs (bez historii leada, nic nie jest wysyłane do klientów) — do testowania promptu: „co Ania odpowie na …”. Podaj agent_id albo powierzchnię (intake / investor_info / investor_panel). Tylko administrator/operator.",
  inputSchema: {
    message: z.string().min(1).max(4000),
    agent_id: z.string().optional(),
    surface: z.enum(["intake", "investor_info", "investor_panel"]).optional(),
    channel: z
      .string()
      .max(40)
      .default("chat")
      .describe("Zmienna `channel` dla reguł kanału (chat, messenger, email, sms, voice_phone)."),
    dynamic_variables: z.record(z.string(), z.string()).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      let agentId = a.agent_id ?? null;
      if (!agentId) {
        const { getAgentIdForSurface } = await import("@/lib/elevenlabs-agents.server");
        agentId = await getAgentIdForSurface(a.surface ?? "intake");
      }
      if (!agentId) return fail("Brak agenta dla tej powierzchni — podaj agent_id.");
      const { elevenLabsTextTurn } = await import("@/lib/elevenlabs-text-turn.server");
      const { AGENT_DYNAMIC_VARIABLE_DEFAULTS } = await import("@/lib/agent-channel-rules");
      const result = await elevenLabsTextTurn({
        agentId,
        userMessage: a.message,
        dynamicVariables: {
          ...AGENT_DYNAMIC_VARIABLE_DEFAULTS,
          channel: a.channel,
          ...(a.dynamic_variables ?? {}),
        },
        timeoutMs: 45_000,
      });
      return result.ok
        ? ok({ agent_id: agentId, reply: result.reply })
        : fail(result.error ?? "Agent nie odpowiedział.");
    }),
});

// ── Media: TTS, STT, efekty, muzyka ─────────────────────────────────────────

async function defaultVoiceId(): Promise<string> {
  const fromEnv = process.env.ELEVENLABS_DEFAULT_VOICE_ID;
  if (fromEnv) return fromEnv;
  const el = await import("@/lib/elevenlabs-api.server");
  const voices = await el.listVoices();
  const filip = voices.find((v) => /filip/i.test(v.name));
  const pick = filip ?? voices[0];
  if (!pick) throw new Error("Brak głosów na koncie — podaj voice_id.");
  return pick.voice_id;
}

export const textToSpeechTool = defineTool({
  name: "text_to_speech",
  title: "Text to speech (ElevenLabs)",
  description:
    "Generuje nagranie głosowe z tekstu (do 5000 znaków) wybranym głosem (domyślnie głos z ustawień / Filip) i zwraca publiczny link MP3 w Storage. Do nagrań IVR, lektora wideo, wiadomości głosowych. Tylko administrator/operator.",
  inputSchema: {
    text: z.string().min(1).max(5000),
    voice_id: z.string().optional(),
    model_id: z.string().default("eleven_multilingual_v2"),
    output_format: z.string().default("mp3_44100_128"),
    stability: z.number().min(0).max(1).optional(),
    similarity_boost: z.number().min(0).max(1).optional(),
    speed: z.number().min(0.7).max(1.2).optional(),
    name: z.string().max(60).optional().describe("Nazwa pliku."),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      const { storeMedia } = await import("@/lib/media-storage.server");
      const voiceId = a.voice_id ?? (await defaultVoiceId());
      const audio = await el.textToSpeech({
        voiceId,
        text: a.text,
        modelId: a.model_id,
        outputFormat: a.output_format,
        voiceSettings: {
          stability: a.stability ?? 0.55,
          similarity_boost: a.similarity_boost ?? 0.8,
          speed: a.speed,
        },
      });
      const stored = await storeMedia(audio.bytes, {
        contentType: audio.contentType || "audio/mpeg",
        visibility: "public",
        prefix: "tts",
        name: a.name ?? a.text.slice(0, 30),
      });
      return ok({ ok: true, voice_id: voiceId, characters: a.text.length, ...stored });
    }),
});

export const speechToTextTool = defineTool({
  name: "speech_to_text",
  title: "Speech to text (ElevenLabs Scribe)",
  description:
    "Transkrybuje nagranie (adres http(s) do pliku audio/wideo, do 50 MB) modelem Scribe; domyślnie polski, opcjonalnie z rozdzieleniem mówców. Tylko administrator/operator.",
  inputSchema: {
    audio_url: z.string().url(),
    language_code: z.string().max(10).default("pol"),
    diarize: z.boolean().default(false),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: ({ audio_url, language_code, diarize }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      const { fetchBytes } = await import("@/lib/media-storage.server");
      const file = await fetchBytes(audio_url);
      const filename = audio_url.split("/").pop()?.split("?")[0] || "audio.mp3";
      const r = await el.speechToText({
        bytes: file.bytes,
        filename,
        contentType: file.contentType,
        languageCode: language_code,
        diarize,
      });
      return ok({
        text: r.text,
        language_code: r.language_code,
        words: diarize ? r.words : undefined,
      });
    }),
});

export const generateSoundEffectTool = defineTool({
  name: "generate_sound_effect",
  title: "Generate sound effect (ElevenLabs)",
  description:
    "Generuje efekt dźwiękowy z opisu (0,5–22 s) i zwraca publiczny link MP3. Tylko administrator/operator.",
  inputSchema: {
    text: z.string().min(3).max(500),
    duration_seconds: z.number().min(0.5).max(22).optional(),
    prompt_influence: z.number().min(0).max(1).optional(),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      const { storeMedia } = await import("@/lib/media-storage.server");
      const audio = await el.generateSoundEffect({
        text: a.text,
        durationSeconds: a.duration_seconds,
        promptInfluence: a.prompt_influence,
      });
      const stored = await storeMedia(audio.bytes, {
        contentType: audio.contentType || "audio/mpeg",
        visibility: "public",
        prefix: "sfx",
        name: a.text.slice(0, 30),
      });
      return ok({ ok: true, ...stored });
    }),
});

export const composeMusicTool = defineTool({
  name: "compose_music",
  title: "Compose music (ElevenLabs Music)",
  description:
    "Komponuje utwór z opisu (10–300 s), np. podkład pod film lub reklamę, i zwraca publiczny link MP3. Tylko administrator/operator.",
  inputSchema: {
    prompt: z.string().min(5).max(2000),
    length_seconds: z.number().int().min(10).max(300).default(30),
  },
  annotations: WRITE,
  handler: ({ prompt, length_seconds }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      const { storeMedia } = await import("@/lib/media-storage.server");
      const audio = await el.composeMusic({ prompt, lengthMs: length_seconds * 1000 });
      const stored = await storeMedia(audio.bytes, {
        contentType: audio.contentType || "audio/mpeg",
        visibility: "public",
        prefix: "music",
        name: prompt.slice(0, 30),
      });
      return ok({ ok: true, length_seconds, ...stored });
    }),
});

// ── Dubbing wideo ───────────────────────────────────────────────────────────

const PLATFORM_URL = /(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|twitter\.com|x\.com)/i;

export const createDubbingTool = defineTool({
  name: "create_dubbing",
  title: "Dub a video / audio into another language",
  description:
    "Zleca dubbing filmu lub nagrania (ElevenLabs Dubbing): źródło to link YouTube/Vimeo/TikTok/X albo bezpośredni adres pliku (mp4/mp3, do 100 MB — wtedy plik jest pobierany i wysyłany), język docelowy (np. en, de, uk), opcjonalnie język źródłowy i liczba mówców. Zwraca id zadania; status daje `get_dubbing`, gotowy plik `get_dubbed_file`. Zużywa kredyty. Tylko administrator/operator.",
  inputSchema: {
    source_url: z.string().url(),
    target_lang: z.string().min(2).max(10),
    source_lang: z.string().min(2).max(10).optional(),
    name: z.string().max(120).optional(),
    num_speakers: z.number().int().min(0).max(20).optional(),
    watermark: z.boolean().default(true).describe("Znak wodny (tańszy dubbing)."),
    highest_resolution: z.boolean().default(false),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      let file: { bytes: ArrayBuffer; filename: string; contentType: string } | undefined;
      let sourceUrl: string | undefined = a.source_url;
      if (!PLATFORM_URL.test(a.source_url)) {
        const { fetchBytes } = await import("@/lib/media-storage.server");
        const f = await fetchBytes(a.source_url, 100 * 1024 * 1024);
        file = {
          bytes: f.bytes,
          filename: a.source_url.split("/").pop()?.split("?")[0] || "video.mp4",
          contentType: f.contentType,
        };
        sourceUrl = undefined;
      }
      const job = await el.createDubbing({
        name: a.name,
        sourceUrl,
        file,
        targetLang: a.target_lang,
        sourceLang: a.source_lang,
        numSpeakers: a.num_speakers,
        watermark: a.watermark,
        highestResolution: a.highest_resolution,
      });
      return ok({
        ok: true,
        dubbing_id: job.dubbing_id,
        expected_duration_sec: job.expected_duration_sec ?? null,
      });
    }),
});

export const getDubbingTool = defineTool({
  name: "get_dubbing",
  title: "Get dubbing status",
  description:
    "Status zadania dubbingu: nazwa, status (dubbing / dubbed / failed), języki docelowe, błąd. Tylko administrator/operator.",
  inputSchema: { dubbing_id: z.string().min(5) },
  annotations: READ,
  handler: ({ dubbing_id }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      const j = await el.getDubbing(dubbing_id);
      return ok({
        dubbing_id: j?.dubbing_id ?? dubbing_id,
        name: j?.name,
        status: j?.status,
        target_languages: j?.target_languages,
        error: j?.error ?? null,
        media_metadata: j?.media_metadata ?? null,
      });
    }),
});

export const getDubbedFileTool = defineTool({
  name: "get_dubbed_file",
  title: "Get dubbed file (link)",
  description:
    "Pobiera gotowy zdubbingowany plik (wideo mp4 lub audio) w podanym języku i zwraca publiczny link w Storage. Tylko administrator/operator.",
  inputSchema: { dubbing_id: z.string().min(5), language_code: z.string().min(2).max(10) },
  annotations: WRITE,
  handler: ({ dubbing_id, language_code }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      const { storeMedia } = await import("@/lib/media-storage.server");
      const f = await el.getDubbedFile(dubbing_id, language_code);
      const stored = await storeMedia(f.bytes, {
        contentType: f.contentType,
        visibility: "public",
        prefix: "dubbing",
        name: `${dubbing_id}-${language_code}`,
      });
      return ok({ ok: true, dubbing_id, language_code, ...stored });
    }),
});

// ── Wideo (endpoint konfigurowalny) ─────────────────────────────────────────

export const generateVideoTool = defineTool({
  name: "generate_video",
  title: "Generate video (ElevenLabs)",
  description:
    "Zleca wygenerowanie wideo z opisu przez API ElevenLabs (opcjonalnie model, długość, proporcje, rozdzielczość, obraz startowy, dodatkowe pola 1:1). Ścieżka endpointu pochodzi z ELEVENLABS_VIDEO_CREATE_PATH albo z `endpoint_path`; bez konfiguracji narzędzie zwraca instrukcję. Zwraca odpowiedź API i `job_id` do `get_video_status`. Zużywa kredyty. Tylko administrator/operator.",
  inputSchema: {
    prompt: z.string().min(3).max(4000),
    model: z.string().max(80).optional(),
    duration_seconds: z.number().min(1).max(120).optional(),
    aspect_ratio: z.string().max(10).optional().describe("np. 16:9, 9:16, 1:1"),
    resolution: z.string().max(10).optional().describe("np. 720p, 1080p"),
    image_url: z.string().url().optional().describe("Obraz startowy (image-to-video)."),
    extra: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Dodatkowe pola body przekazywane bez zmian."),
    endpoint_path: z.string().max(200).optional().describe("Nadpisanie ścieżki, np. /v1/…"),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      const body: Record<string, unknown> = { prompt: a.prompt };
      if (a.model) body.model = a.model;
      if (a.duration_seconds) body.duration_seconds = a.duration_seconds;
      if (a.aspect_ratio) body.aspect_ratio = a.aspect_ratio;
      if (a.resolution) body.resolution = a.resolution;
      if (a.image_url) body.image_url = a.image_url;
      Object.assign(body, a.extra ?? {});
      const json = await el.videoGenerate(body, a.endpoint_path);
      const jobId = el.pickJobId(json, el.videoEndpoints().idField);
      return ok({
        ok: true,
        job_id: jobId,
        response: json,
        next: jobId
          ? "Sprawdź postęp przez get_video_status."
          : "Odpowiedź nie zawiera identyfikatora zadania — patrz response.",
      });
    }),
});

export const getVideoStatusTool = defineTool({
  name: "get_video_status",
  title: "Get video generation status",
  description:
    "Status zadania wideo (ELEVENLABS_VIDEO_STATUS_PATH z {id} albo `endpoint_path`). Gdy API zwraca gotowy plik, zapisuje go w Storage i zwraca publiczny link; gdy JSON — zwraca go z wykrytym adresem wideo. Tylko administrator/operator.",
  inputSchema: {
    job_id: z.string().min(1),
    endpoint_path: z.string().max(200).optional(),
  },
  annotations: READ,
  handler: ({ job_id, endpoint_path }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const el = await import("@/lib/elevenlabs-api.server");
      const r = await el.videoStatus(job_id, endpoint_path);
      if (r.bytes) {
        const { storeMedia } = await import("@/lib/media-storage.server");
        const stored = await storeMedia(r.bytes, {
          contentType: r.contentType || "video/mp4",
          visibility: "public",
          prefix: "video",
          name: job_id,
        });
        return ok({ job_id, status: "done", ...stored });
      }
      const j = r.json ?? {};
      const videoUrl =
        j.video_url ?? j.url ?? j.output?.url ?? j.result?.url ?? j.output_url ?? null;
      return ok({ job_id, status: j.status ?? null, video_url: videoUrl, response: j });
    }),
});

// ── Ogólne wywołanie API ────────────────────────────────────────────────────

export const elevenApiRequestTool = defineTool({
  name: "eleven_api_request",
  title: "ElevenLabs API request (generic)",
  description:
    "Dowolne wywołanie API ElevenLabs (ścieżka /v1/… lub /v2/…, GET/POST/PATCH/DELETE, parametry, body JSON) — do funkcji, które nie mają jeszcze osobnego narzędzia (np. nowe API wideo, historia generacji, modele, ustawienia agentów). Odpowiedzi binarne trafiają do Storage jako publiczny link. Klucz zostaje na serwerze. Tylko administrator.",
  inputSchema: {
    method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]).default("GET"),
    path: z.string().min(4).max(300),
    query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    json: z.record(z.string(), z.unknown()).optional(),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const el = await import("@/lib/elevenlabs-api.server");
      const r = await el.elevenRequest(a.path, {
        method: a.method,
        query: a.query,
        json: a.json,
        timeoutMs: 300_000,
      });
      if (r.bytes) {
        const { storeMedia } = await import("@/lib/media-storage.server");
        const stored = await storeMedia(r.bytes, {
          contentType: r.contentType || "application/octet-stream",
          visibility: "public",
          prefix: "api",
          name: a.path.replace(/[^a-z0-9]+/gi, "-"),
        });
        return ok({ status: r.status, file: stored });
      }
      const text = r.json !== undefined ? JSON.stringify(r.json) : (r.text ?? "");
      return ok({
        status: r.status,
        content_type: r.contentType,
        body: text.length > 20000 ? `${text.slice(0, 20000)}… (ucięte)` : (r.json ?? r.text),
      });
    }),
});

export const elevenLabsTools = [
  elevenStatus,
  elevenListAgents,
  elevenGetAgent,
  elevenListConversations,
  elevenGetConversation,
  elevenGetConversationAudio,
  elevenListVoices,
  elevenListPhoneNumbers,
  elevenListKnowledgeBase,
  getTextAgentPrompt,
  listTextAgentKnowledge,
  searchTextAgentKnowledge,
  getVoiceCallStats,
  updateVoicebotSettings,
  updateTextAgentPrompt,
  syncVoiceAgentPrompts,
  provisionVoiceAgents,
  elevenUpdateAgent,
  addTextAgentKnowledge,
  updateTextAgentKnowledge,
  deleteTextAgentKnowledge,
  elevenAddKnowledgeText,
  elevenAddKnowledgeUrl,
  placeVoiceCall,
  askVoiceAgent,
  textToSpeechTool,
  speechToTextTool,
  generateSoundEffectTool,
  composeMusicTool,
  createDubbingTool,
  getDubbingTool,
  getDubbedFileTool,
  generateVideoTool,
  getVideoStatusTool,
  elevenApiRequestTool,
];
