// Sędzia LLM (LLM-as-a-judge): raz dziennie ocenia rozmowy Messenger/IG
// z ostatnich 24 h (transkrypt z lead_communications), zapisuje ocenę 0–1,
// najdalszy osiągnięty krok, tagi porażek i propozycję poprawki promptu.
// Model: ten sam gateway co bot (Lovable AI Gateway), ale oceniamy WYŁĄCZNIE
// strukturalnym JSON-em — bez wolnego tekstu do klienta.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logFunnelStep, FUNNEL_ORDER, type FunnelStep } from "./bot-funnel.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const FAILURE_TAGS = [
  "za_dlugie_wiadomosci",
  "dwa_pytania_naraz",
  "brak_reakcji_na_pytanie_klienta",
  "zbyt_szybka_prosba_o_kontakt",
  "brak_domkniecia_kroku",
  "klient_zamilkl_po_pytaniu_o_kwote",
  "klient_zamilkl_po_pytaniu_o_nieruchomosc",
  "ton_zbyt_formalny",
  "halucynacja_lub_bledna_informacja",
  "spam_lub_nie_lead",
] as const;

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const JUDGE_SYSTEM = `Jesteś audytorem jakości rozmów bota sprzedażowego firmy pożyczkowej
(pożyczki pod zastaw nieruchomości, Polska). Oceniasz rozmowę bota z klientem na Messengerze.

Zwróć WYŁĄCZNIE JSON (bez markdown, bez komentarzy):
{
  "score": <0..1, jakość prowadzenia rozmowy przez bota>,
  "step_reached": <najdalszy krok: "greeting"|"intent"|"property_declared"|"amount_declared"|"contact_collected"|"application_link_sent"|"qualified">,
  "failure_tags": [<0..3 tagi z listy: ${FAILURE_TAGS.join(", ")}>],
  "summary": "<1 zdanie po polsku: co się wydarzyło>",
  "suggestion": "<1 zdanie po polsku: konkretna poprawka promptu/zachowania bota, albo pusty string>"
}

Kryteria score: (1) czy bot odpowiada na pytania klienta zanim zada własne,
(2) jedno pytanie na wiadomość, krótkie wiadomości, (3) czy każde pytanie przybliża
do kwalifikacji (nieruchomość → kwota → kontakt), (4) brak błędnych informacji o ofercie,
(5) naturalny, ludzki ton po polsku.`;

async function judgeOne(transcript: string): Promise<{
  score: number;
  step_reached: FunnelStep;
  failure_tags: string[];
  summary: string;
  suggestion: string;
} | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: JUDGE_SYSTEM },
        { role: "user", content: `Rozmowa do oceny:\n\n${transcript.slice(0, 24_000)}` },
      ],
      temperature: 0,
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  const text: string = json?.choices?.[0]?.message?.content ?? "";
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    if (typeof parsed.score !== "number") return null;
    return {
      score: Math.max(0, Math.min(1, parsed.score)),
      step_reached: FUNNEL_ORDER.includes(parsed.step_reached) ? parsed.step_reached : "greeting",
      failure_tags: Array.isArray(parsed.failure_tags) ? parsed.failure_tags.slice(0, 3) : [],
      summary: String(parsed.summary ?? "").slice(0, 400),
      suggestion: String(parsed.suggestion ?? "").slice(0, 400),
    };
  } catch {
    return null;
  }
}

export async function runBotJudge(opts?: {
  /** okno wstecz w godzinach (domyślnie 26 — bufor na opóźnienia crona) */
  hours?: number;
  maxConversations?: number;
}): Promise<{ evaluated: number; skipped: number; avgScore: number | null; errors: string[] }> {
  const supa = admin();
  const hours = opts?.hours ?? 26;
  const maxN = opts?.maxConversations ?? 60;
  const sinceTs = new Date(Date.now() - hours * 3_600_000).toISOString();
  const errors: string[] = [];
  let evaluated = 0;
  let skipped = 0;
  const scores: number[] = [];

  // Leady z aktywnością messenger/IG w oknie
  const { data: comms } = await supa
    .from("lead_communications")
    .select("lead_id")
    .in("channel", ["messenger", "instagram"])
    .gte("created_at", sinceTs)
    .not("lead_id", "is", null);
  const leadIds: string[] = [...new Set((comms ?? []).map((c: any) => String(c.lead_id)))].slice(
    0,
    maxN,
  );

  for (const leadId of leadIds) {
    try {
      const { data: msgs } = await supa
        .from("lead_communications")
        .select("direction, content, created_at")
        .eq("lead_id", leadId)
        .in("channel", ["messenger", "instagram"])
        .order("created_at", { ascending: true })
        .limit(120);

      const withUser = (msgs ?? []).some((m) => m.direction === "inbound");
      if (!withUser || (msgs ?? []).length < 2) {
        skipped++;
        continue;
      }
      const transcript = (msgs ?? [])
        .map((m) => `${m.direction === "inbound" ? "KLIENT" : "BOT"}: ${m.content ?? ""}`)
        .join("\n");

      const verdict = await judgeOne(transcript);
      if (!verdict) {
        skipped++;
        continue;
      }

      await supa.from("bot_conversation_evals").upsert(
        {
          lead_id: leadId,
          judge_score: verdict.score,
          step_reached: verdict.step_reached,
          failure_tags: verdict.failure_tags,
          summary: verdict.summary,
          suggestion: verdict.suggestion,
          model: MODEL,
          messages_evaluated: (msgs ?? []).length,
          created_at: new Date().toISOString(),
        },
        { onConflict: "lead_id" },
      );

      // Krok z werdyktu dopisz do lejka (idempotentnie) — łata dziury,
      // gdy klient podał dane tekstem, a bot nie wywołał update_lead_data.
      await logFunnelStep(leadId, verdict.step_reached);

      scores.push(verdict.score);
      evaluated++;
    } catch (e: any) {
      errors.push(`${leadId}: ${String(e?.message ?? e).slice(0, 150)}`);
    }
  }

  const avgScore =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : null;
  return { evaluated, skipped, avgScore, errors };
}
