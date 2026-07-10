// Server-side wrapper for the ElevenLabs text agent.
// Strategy: pobieramy konfigurację agenta z ElevenLabs (system prompt, first message,
// opcjonalne tools z UI), a samą rozmowę prowadzimy przez Lovable AI Gateway
// (Gemini 2.5 Flash) z tym samym promptem + naszymi tools. Pozwala to odpisywać
// autonomicznie 24/7 server-side (EL text mode jest tylko WebSocket/browser).
//
// Tools dostępne dla agenta:
//   - update_lead_data({ patch: Record<string, any> })
//   - send_application_link()
//   - mark_ready_for_human({ reason }) — zapisywane, ale prompt instruuje pełną autonomię

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const EL_BASE = "https://api.elevenlabs.io/v1";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
// Model wewnętrznego bota do pisania/odpisywania (maile + DM). Gemini Pro.
const AGENT_MODEL = "google/gemini-2.5-pro";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

type EmittedMessage = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: any[] };

let cachedAgentPrompt: { prompt: string; firstMessage: string | null; fetchedAt: number } | null = null;
const PROMPT_TTL_MS = 5 * 60 * 1000;

async function fetchAgentPrompt(): Promise<{ prompt: string; firstMessage: string | null }> {
  const now = Date.now();
  if (cachedAgentPrompt && now - cachedAgentPrompt.fetchedAt < PROMPT_TTL_MS) {
    return { prompt: cachedAgentPrompt.prompt, firstMessage: cachedAgentPrompt.firstMessage };
  }

  // 1) Preferuj prompt z DB (edytowalny w /admin/text-agent).
  try {
    const s = admin();
    const { data } = await s
      .from("text_agent_settings")
      .select("system_prompt, first_message")
      .eq("id", 1)
      .maybeSingle();
    const dbPrompt = (data?.system_prompt ?? "").trim();
    if (dbPrompt.length > 20) {
      const out = { prompt: dbPrompt, firstMessage: data?.first_message ?? null };
      cachedAgentPrompt = { ...out, fetchedAt: now };
      return out;
    }
  } catch (e) {
    console.error("[el-text-agent] db prompt fetch failed", e);
  }

  // 2) Fallback ostateczny: zaszyty default. (Lovable AI generuje odpowiedź.)
  const fallback = { prompt: defaultSystemPrompt(), firstMessage: null };
  cachedAgentPrompt = { ...fallback, fetchedAt: now };
  return fallback;
}

/** Wyczyść cache promptu — wywołane po zapisaniu z UI. */
export function clearAgentPromptCache() {
  cachedAgentPrompt = null;
}

function defaultSystemPrompt(): string {
  return `Jesteś agentem Finance You odpisującym 24/7 na wiadomości od potencjalnych klientów (Messenger / Instagram DM / email).
Twoim celem jest:
1. Życzliwie nawiązać kontakt, wyjaśnić co oferujemy (pożyczki pozabankowe + inwestycje).
2. Zebrać dane do wniosku: imię i nazwisko, email, telefon, kwota, cel, miasto, dochód, źródło dochodu, PESEL (jeśli sam poda — nie wymuszaj na pierwszej wiadomości).
3. Każdą nową informację natychmiast zapisuj wywołując tool update_lead_data({ patch: {...} }).
4. Gdy masz minimum: imię, email LUB telefon, kwota, cel → wywołaj send_application_link() aby wysłać link do dokończenia wniosku.
5. NIGDY nie eskaluj do człowieka. Działasz w pełnej autonomii. Nawet jeśli klient poprosi o człowieka — wyjaśnij grzecznie, że jesteś asystentem Finance You i pomożesz mu od ręki.
6. Odpowiadaj po polsku, ciepło, krótko (max 2-3 zdania na wiadomość). Nie używaj emoji nadmiernie.
7. Jeśli klient przesłał załącznik (np. dowód, wyciąg, KW) — podziękuj i potwierdź, że dokument trafił do jego sprawy.`;
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "update_lead_data",
      description: "Zapisz nowe dane klienta w jego sprawie (application_data). Wywołuj zawsze gdy klient podaje jakąkolwiek nową informację: imię, email, telefon, kwota, cel, miasto, dochód itp.",
      parameters: {
        type: "object",
        properties: {
          patch: {
            type: "object",
            description: "Obiekt z polami do zapisania, np. { first_name: 'Jan', loan_amount: 50000, purpose: 'remont' }",
            additionalProperties: true,
          },
        },
        required: ["patch"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_application_link",
      description: "Wyślij klientowi spersonalizowany link do dokończenia wniosku online. Wywołaj gdy masz minimum: imię, email LUB telefon, kwota, cel.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_ready_for_human",
      description: "Oznacz że sprawa wymaga człowieka. Używaj wyjątkowo rzadko — masz pełną autonomię.",
      parameters: {
        type: "object",
        properties: { reason: { type: "string" } },
        required: ["reason"],
      },
    },
  },
];

export type AgentReply = {
  reply: string;
  toolCalls: Array<{ name: string; args: any; result: any }>;
};

/**
 * Uruchamia jeden krok rozmowy:
 * - bierze historię z lead_communications dla danego leada i kanału,
 * - dokłada inboundową wiadomość użytkownika (już zapisana wcześniej),
 * - woła LLM z tools,
 * - wykonuje tool calls (update_lead_data / send_application_link),
 * - zwraca finalną odpowiedź tekstową do wysłania klientowi.
 */
export async function runAgentTurn(opts: {
  leadId: string;
  channel: "messenger" | "instagram" | "email";
  userMessage: string;
  attachmentsSummary?: string | null;
}): Promise<AgentReply> {
  const s = admin();
  const { data: lead } = await s.from("leads").select("*").eq("id", opts.leadId).maybeSingle();
  if (!lead) throw new Error(`Lead ${opts.leadId} not found`);

  const { data: history } = await s
    .from("lead_communications")
    .select("direction, content, created_at, channel")
    .eq("lead_id", opts.leadId)
    .in("channel", ["messenger", "instagram", "email"])
    .order("created_at", { ascending: true })
    .limit(40);

  const { prompt: systemPrompt } = await fetchAgentPrompt();

  const leadContext = `\n\n[KONTEKST LEADA]\nID: ${lead.id}\nKanał: ${opts.channel}\nImię: ${lead.first_name ?? "?"}\nEmail: ${lead.email ?? "?"}\nTelefon: ${lead.phone_raw ?? "?"}\nDotychczasowe dane: ${JSON.stringify(lead.application_data ?? {})}`;

  // RAG: pobierz fragmenty bazy wiedzy najbardziej pasujące do wiadomości klienta.
  let knowledgeBlock = "";
  try {
    const { retrieveKnowledge } = await import("./text-agent-knowledge.server");
    const chunks = await retrieveKnowledge(opts.userMessage, 4);
    if (chunks.length > 0) {
      knowledgeBlock =
        "\n\n[BAZA WIEDZY — wykorzystaj te informacje gdy są trafne]\n" +
        chunks.map((c, i) => `### ${i + 1}. ${c.title}\n${c.content}`).join("\n\n");
    }
  } catch (e) {
    console.error("[el-text-agent] RAG retrieval failed", e);
  }

  const messages: EmittedMessage[] = [
    { role: "system", content: systemPrompt + leadContext + knowledgeBlock },
  ];
  for (const m of history ?? []) {
    if (!m.content) continue;
    messages.push({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: String(m.content),
    });
  }
  const userMsg = opts.attachmentsSummary
    ? `${opts.userMessage}\n\n[Załączniki klienta]\n${opts.attachmentsSummary}`
    : opts.userMessage;
  // history może już zawierać tę inbound wiadomość; nie duplikujemy jeśli ostatnia user pasuje
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || last.content !== userMsg) {
    messages.push({ role: "user", content: userMsg });
  }

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const toolResults: AgentReply["toolCalls"] = [];

  // Pętla maks 3 iteracji (tool call → wynik → kolejna odpowiedź).
  for (let iter = 0; iter < 3; iter++) {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AGENT_MODEL,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI gateway ${res.status}: ${t.slice(0, 300)}`);
    }
    const json: any = await res.json();
    const msg = json?.choices?.[0]?.message;
    if (!msg) throw new Error("AI gateway: empty response");

    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) {
      return { reply: String(msg.content ?? "").trim() || "Dziękuję, oddzwonimy.", toolCalls: toolResults };
    }

    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });

    for (const c of calls) {
      const name = c.function?.name;
      let args: any = {};
      try { args = JSON.parse(c.function?.arguments ?? "{}"); } catch { /* noop */ }
      const result = await executeTool(opts.leadId, opts.channel, name, args);
      toolResults.push({ name, args, result });
      messages.push({
        role: "tool",
        tool_call_id: c.id,
        content: JSON.stringify(result),
      });
    }
  }

  return { reply: "Dziękuję! Wracam za chwilę.", toolCalls: toolResults };
}

export type DraftMode = "reply" | "compose";

/**
 * Generuje SZKIC wiadomości dla operatora (nie wysyła, nie wykonuje tools).
 * Ten sam mózg co runAgentTurn: prompt systemowy z /admin/text-agent + RAG + kontekst leada,
 * na modelu Gemini Pro. Używane przez przyciski "AI" w skrzynce mailowej i w messengerze.
 */
export async function runAgentDraft(opts: {
  channel: "messenger" | "instagram" | "email";
  mode: DraftMode;
  leadId?: string | null;
  incomingMessage?: string | null; // treść, na którą odpisujemy
  instruction?: string | null; // wskazówka operatora
  subject?: string | null; // temat maila (kontekst)
}): Promise<{ text: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const s = admin();
  const { prompt: systemPrompt } = await fetchAgentPrompt();

  // Kontekst leada + historia rozmowy (jeśli znamy leada).
  let leadContext = "";
  let history: Array<{ direction: string; content: string | null }> = [];
  if (opts.leadId) {
    const { data: lead } = await s.from("leads").select("*").eq("id", opts.leadId).maybeSingle();
    if (lead) {
      leadContext = `\n\n[KONTEKST LEADA]\nID: ${lead.id}\nKanał: ${opts.channel}\nImię: ${lead.first_name ?? "?"}\nEmail: ${lead.email ?? "?"}\nTelefon: ${lead.phone_raw ?? "?"}\nDotychczasowe dane: ${JSON.stringify(lead.application_data ?? {})}`;
    }
    const { data: h } = await s
      .from("lead_communications")
      .select("direction, content, created_at")
      .eq("lead_id", opts.leadId)
      .in("channel", ["messenger", "instagram", "email"])
      .order("created_at", { ascending: true })
      .limit(40);
    history = h ?? [];
  }

  // RAG na podstawie tego, na co odpisujemy / o czym piszemy.
  const ragQuery = [opts.incomingMessage, opts.instruction, opts.subject].filter(Boolean).join("\n");
  let knowledgeBlock = "";
  try {
    const { retrieveKnowledge } = await import("./text-agent-knowledge.server");
    const chunks = await retrieveKnowledge(ragQuery || "oferta pożyczki", 4);
    if (chunks.length > 0) {
      knowledgeBlock =
        "\n\n[BAZA WIEDZY — wykorzystaj te informacje gdy są trafne]\n" +
        chunks.map((c, i) => `### ${i + 1}. ${c.title}\n${c.content}`).join("\n\n");
    }
  } catch (e) {
    console.error("[el-text-agent] draft RAG failed", e);
  }

  const isEmail = opts.channel === "email";
  const channelLabel = isEmail ? "e-mail" : "wiadomość Messenger/Instagram";
  const draftDirective =
    `\n\n[TRYB: SZKIC DLA OPERATORA]\nGenerujesz TREŚĆ (${channelLabel}) do wysłania klientowi. ` +
    `Zwróć wyłącznie gotowy tekst wiadomości — bez nagłówków typu "Temat:", bez cudzysłowów, bez komentarzy od siebie i bez opisu co robisz. ` +
    (isEmail
      ? "Możesz użyć akapitów i grzecznościowego podpisu (Zespół Finance You). "
      : "Krótko, 2-3 zdania, ton swobodnej rozmowy. ") +
    "Nie wywołuj żadnych narzędzi — tylko napisz wiadomość.";

  const messages: EmittedMessage[] = [
    { role: "system", content: systemPrompt + leadContext + knowledgeBlock + draftDirective },
  ];
  for (const m of history) {
    if (!m.content) continue;
    messages.push({ role: m.direction === "inbound" ? "user" : "assistant", content: String(m.content) });
  }

  let task: string;
  if (opts.mode === "reply") {
    const incoming = (opts.incomingMessage ?? "").trim();
    task = `Napisz odpowiedź na poniższą wiadomość klienta${opts.subject ? ` (temat: ${opts.subject})` : ""}:\n\n${incoming || "(treść niedostępna — odpowiedz na podstawie historii rozmowy powyżej)"}`;
    if (opts.instruction?.trim()) task += `\n\nWskazówka operatora: ${opts.instruction.trim()}`;
  } else {
    task = `Napisz nową wiadomość do klienta${opts.subject ? ` (temat: ${opts.subject})` : ""}.`;
    task += `\n\nWytyczne: ${opts.instruction?.trim() || "nawiąż kontakt i zaproponuj pomoc w uzyskaniu pożyczki pozabankowej lub inwestycji."}`;
  }
  messages.push({ role: "user", content: task });

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: AGENT_MODEL, messages }),
  });
  if (res.status === 429) throw new Error("Zbyt wiele zapytań do AI. Spróbuj za chwilę.");
  if (res.status === 402) throw new Error("Wyczerpany limit AI. Doładuj środki w Lovable Cloud.");
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 200)}`);
  }
  const json: any = await res.json();
  const text: string = json?.choices?.[0]?.message?.content ?? "";
  return { text: text.trim() };
}

async function executeTool(leadId: string, channel: string, name: string, args: any): Promise<any> {
  const s = admin();
  if (name === "update_lead_data") {
    const patch = args?.patch ?? {};
    const { data: lead } = await s.from("leads").select("application_data, email, phone_raw, phone_normalized, first_name, last_name").eq("id", leadId).maybeSingle();
    const merged = { ...(lead?.application_data ?? {}), ...patch };
    const topLevel: Record<string, any> = { application_data: merged };
    if (typeof patch.first_name === "string" && !lead?.first_name) topLevel.first_name = patch.first_name;
    if (typeof patch.last_name === "string" && !lead?.last_name) topLevel.last_name = patch.last_name;
    if (typeof patch.email === "string" && !lead?.email) topLevel.email = patch.email;
    if (typeof patch.phone === "string" && !lead?.phone_raw) {
      topLevel.phone_raw = patch.phone;
      topLevel.phone_normalized = normPhone(patch.phone);
    }
    await s.from("leads").update(topLevel).eq("id", leadId);
    return { ok: true, saved: Object.keys(patch) };
  }
  if (name === "send_application_link") {
    const link = "https://financeyou.pl";
    await s.from("leads").update({ return_link: link }).eq("id", leadId);
    return { ok: true, link, instruction: `Wyślij klientowi w odpowiedzi tekst typu: "Twój link do dokończenia wniosku: ${link}"` };
  }
  if (name === "mark_ready_for_human") {
    await s.from("leads").update({ status: "wymaga_kontaktu", notes: `[AI] ${args?.reason ?? "eskalacja"}` }).eq("id", leadId);
    return { ok: true };
  }
  return { ok: false, error: `unknown tool ${name}` };
}

function normPhone(p: string): string {
  const s = String(p ?? "").replace(/\s|-/g, "");
  if (s.startsWith("+")) return s;
  const d = s.replace(/\D/g, "");
  if (d.length === 9) return `+48${d}`;
  if (d.length === 11 && d.startsWith("48")) return `+${d}`;
  return s.startsWith("+") ? s : `+${d}`;
}
