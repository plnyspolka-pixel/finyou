// Asystent panelowy dla inwestorów prywatnych z wykupionym dostępem (Klub
// Inwestorów Hipotecznych). Osobna logika od bota instytucjonalnego: przewodnik
// po panelu i procesie inwestycji, bez tools i bez leadów — historia rozmowy
// trzymana per użytkownik w investor_assistant_messages.
// Prompt: text_agent_settings id=3 (wariant "inwestor_prywatny"), edytowalny
// w /admin/text-agent; RAG współdzielony z botem instytucjonalnym (audience
// "inwestor" + "wspolna").
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const HISTORY_LIMIT = 30;

export const getInvestorAssistantHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertInvestorFullAccess } = await import("@/lib/access/guards.server");
    await assertInvestorFullAccess(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("investor_assistant_messages")
      .select("id, role, content, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .limit(200);
    return (data ?? []).map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      created_at: m.created_at,
    }));
  });

export const sendInvestorAssistantMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { message: string }) => {
    const message = String(d?.message ?? "").trim();
    if (!message || message.length > 4000) throw new Error("Nieprawidłowa wiadomość.");
    return { message };
  })
  .handler(async ({ data, context }) => {
    const { assertInvestorFullAccess } = await import("@/lib/access/guards.server");
    await assertInvestorFullAccess(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: investor } = await supabaseAdmin
      .from("investors")
      .select("first_name, last_name, investor_type")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { data: history } = await supabaseAdmin
      .from("investor_assistant_messages")
      .select("role, content")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    const { fetchAgentPrompt } = await import("@/lib/elevenlabs-text-agent.server");
    const { prompt: systemPrompt } = await fetchAgentPrompt("inwestor_prywatny");

    let knowledgeBlock = "";
    try {
      const { retrieveKnowledge } = await import("@/lib/text-agent-knowledge.server");
      const chunks = await retrieveKnowledge(data.message, 4, "inwestor");
      if (chunks.length > 0) {
        knowledgeBlock =
          "\n\n[BAZA WIEDZY — wykorzystaj te informacje gdy są trafne]\n" +
          chunks.map((c, i) => `### ${i + 1}. ${c.title}\n${c.content}`).join("\n\n");
      }
    } catch (e) {
      console.error("[investor-assistant] RAG retrieval failed", e);
    }

    const userContext = investor
      ? `\n\n[KONTEKST CZŁONKA KLUBU]\nImię: ${investor.first_name ?? "?"}\nNazwisko: ${investor.last_name ?? "?"}\nTyp inwestora: ${investor.investor_type ?? "?"}`
      : "";

    // ── Ścieżka ElevenLabs (agent A3) ──────────────────────────────────────
    // Gdy agent panelu inwestora istnieje, odpowiada on — dzięki temu w panelu
    // nie musimy osadzać obcego widgetu, żeby korzystać z tego samego bota.
    // Każde niepowodzenie = cichy powrót do silnika poniżej.
    let reply = "";
    try {
      const { getAgentIdForSurface } = await import("@/lib/elevenlabs-agents.server");
      const agentId = await getAgentIdForSurface("investor_panel");
      if (agentId) {
        const recent = (history ?? []).slice(0, 16).reverse();
        const historyBlock =
          recent.length > 0
            ? recent
                .map(
                  (m) =>
                    `${m.role === "user" ? "INWESTOR" : "TY (asystent)"}: ${String(m.content ?? "")
                      .replace(/\s+/g, " ")
                      .slice(0, 600)}`,
                )
                .join("\n")
            : "(brak wcześniejszych wiadomości)";
        const { elevenLabsTextTurn } = await import("@/lib/elevenlabs-text-turn.server");
        const { channelDynamicVariables } = await import("@/lib/agent-channel-rules");
        const turn = await elevenLabsTextTurn({
          agentId,
          userMessage:
            `[DOTYCHCZASOWA ROZMOWA — kontekst, nie odpowiadaj na nią ponownie]\n${historyBlock}\n\n` +
            `[NOWA WIADOMOŚĆ — odpowiedz na nią]\n${data.message}`,
          dynamicVariables: {
            ...channelDynamicVariables("chat_inwestor"),
            lead_id: "",
            first_name: investor?.first_name ?? "",
            last_name: investor?.last_name ?? "",
            email: "",
            phone: "",
          },
        });
        if (turn.ok && turn.reply) reply = turn.reply;
        else console.warn(`[investor-assistant] ElevenLabs fallback: ${turn.error ?? "unknown"}`);
      }
    } catch (e) {
      console.error("[investor-assistant] ElevenLabs path error — fallback", e);
    }

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt + userContext + knowledgeBlock },
    ];
    for (const m of (history ?? []).reverse()) {
      messages.push({ role: m.role as "user" | "assistant", content: m.content });
    }
    messages.push({ role: "user", content: data.message });

    if (!reply) {
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) throw new Error("Asystent jest chwilowo niedostępny.");
      const res = await fetch(GATEWAY, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
      });
      if (!res.ok) {
        const t = await res.text();
        console.error(`[investor-assistant] gateway ${res.status}: ${t.slice(0, 300)}`);
        throw new Error("Asystent jest chwilowo niedostępny. Spróbuj ponownie za chwilę.");
      }
      const json: any = await res.json();
      reply = String(json?.choices?.[0]?.message?.content ?? "").trim();
    }
    if (!reply) throw new Error("Asystent jest chwilowo niedostępny. Spróbuj ponownie za chwilę.");

    const { error: insertError } = await supabaseAdmin.from("investor_assistant_messages").insert([
      { user_id: context.userId, role: "user", content: data.message },
      { user_id: context.userId, role: "assistant", content: reply },
    ]);
    if (insertError) console.error("[investor-assistant] insert failed", insertError);

    return { reply };
  });
