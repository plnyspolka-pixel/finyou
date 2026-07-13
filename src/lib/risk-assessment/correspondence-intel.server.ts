// Analiza korespondencji z klientem — e-maile, DM/Messenger, transkrypcje rozmów.
// Zbiera wiadomości z lead_communications (powiązane przez leads → wniosek/klienta)
// i wykonuje analizę behawioralną przy pomocy Gemini (Lovable AI Gateway).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CorrespondenceIntel } from "./types";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const CHANNEL_LABELS: Record<string, string> = {
  email: "e-mail",
  messenger: "Messenger/DM",
  voicebot_call: "rozmowa telefoniczna (transkrypcja)",
  sms: "SMS",
};

interface GatheredMessage {
  channel: string;
  direction: string;
  when: string;
  text: string;
}

function emptyResult(summary: string): CorrespondenceIntel {
  return {
    available: false,
    messagesAnalyzed: 0,
    channels: [],
    sentiment: "nieznany",
    cooperationLevel: "nieznany",
    urgency: "nieznana",
    redFlags: [],
    statedFacts: [],
    inconsistencies: [],
    behavioralRiskScore: 60,
    summary,
  };
}

function coerceTranscript(transcript: unknown): string {
  if (!transcript) return "";
  if (typeof transcript === "string") return transcript;
  if (Array.isArray(transcript)) {
    return transcript
      .map((t: any) => {
        if (typeof t === "string") return t;
        const role = t?.role ?? t?.speaker ?? "";
        const msg = t?.message ?? t?.text ?? t?.content ?? "";
        return `${role ? role + ": " : ""}${msg}`;
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

async function gatherMessages(applicationId: string, clientId: string | null): Promise<GatheredMessage[]> {
  // 1) Znajdź leady powiązane z wnioskiem lub klientem.
  const leadIds = new Set<string>();
  const { data: byApp } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("loan_application_id", applicationId);
  (byApp ?? []).forEach((l) => leadIds.add(l.id));
  if (clientId) {
    const { data: byClient } = await supabaseAdmin.from("leads").select("id").eq("client_id", clientId);
    (byClient ?? []).forEach((l) => leadIds.add(l.id));
  }
  if (leadIds.size === 0) return [];

  const { data: comms } = await supabaseAdmin
    .from("lead_communications")
    .select("channel, direction, content, subject, transcript, created_at")
    .in("lead_id", [...leadIds])
    .order("created_at", { ascending: true })
    .limit(120);

  return (comms ?? [])
    .map((c) => {
      const transcript = coerceTranscript(c.transcript);
      const parts = [c.subject, c.content, transcript].filter(Boolean).join(" — ");
      return {
        channel: c.channel ?? "nieznany",
        direction: c.direction ?? "",
        when: c.created_at ?? "",
        text: parts.replace(/\s+/g, " ").trim().slice(0, 1500),
      };
    })
    .filter((m) => m.text.length > 2);
}

function buildPrompt(messages: GatheredMessage[], context: { declaredValue: number | null; loanAmount: number | null; city: string | null }): string {
  const convo = messages
    .map((m, i) => `[${i + 1}] (${CHANNEL_LABELS[m.channel] ?? m.channel}, ${m.direction}) ${m.text}`)
    .join("\n");
  return `Jesteś analitykiem ryzyka w firmie pożyczkowej zabezpieczonej nieruchomością. Przeanalizuj poniższą korespondencję z klientem pod kątem oceny ryzyka inwestycji.

KONTEKST WNIOSKU:
- Deklarowana wartość nieruchomości: ${context.declaredValue ? context.declaredValue.toLocaleString("pl-PL") + " PLN" : "brak"}
- Wnioskowana kwota: ${context.loanAmount ? context.loanAmount.toLocaleString("pl-PL") + " PLN" : "brak"}
- Lokalizacja: ${context.city ?? "brak"}

KORESPONDENCJA (od najstarszej):
${convo}

ZADANIE — oceń:
1. sentiment ogólny klienta,
2. poziom współpracy (czy odpowiada, dostarcza dokumenty, jest transparentny),
3. pilność/nacisk czasowy zgłaszany przez klienta,
4. sygnały ostrzegawcze (redFlags): presja czasu, ukrywanie informacji, niespójne kwoty, oznaki przymusu/desperacji, możliwe oszustwo, konflikt współwłaścicieli, problemy z tytułem prawnym,
5. konkretne fakty o nieruchomości/sytuacji podane przez klienta (statedFacts),
6. niespójności względem danych wniosku (inconsistencies).

ODPOWIEDŹ — wyłącznie poprawny JSON, bez markdown ani backticków:
{
  "sentiment": "pozytywny|neutralny|negatywny|mieszany",
  "cooperationLevel": "wysoki|sredni|niski",
  "urgency": "niska|srednia|wysoka",
  "redFlags": ["..."],
  "statedFacts": ["..."],
  "inconsistencies": ["..."],
  "riskCommentary": "1-3 zdania podsumowania ryzyka behawioralnego"
}`;
}

function tryParseJson(s: string): any | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function computeBehavioralScore(p: {
  sentiment: string;
  cooperationLevel: string;
  urgency: string;
  redFlagsCount: number;
  inconsistenciesCount: number;
}): number {
  let score = 75;
  if (p.sentiment === "negatywny") score -= 15;
  else if (p.sentiment === "mieszany") score -= 8;
  if (p.cooperationLevel === "niski") score -= 20;
  else if (p.cooperationLevel === "sredni") score -= 8;
  else if (p.cooperationLevel === "wysoki") score += 5;
  if (p.urgency === "wysoka") score -= 8;
  score -= Math.min(30, p.redFlagsCount * 10);
  score -= Math.min(15, p.inconsistenciesCount * 5);
  return Math.max(0, Math.min(100, score));
}

export async function analyzeCorrespondence(args: {
  applicationId: string;
  clientId: string | null;
  declaredValue?: number | null;
  loanAmount?: number | null;
  city?: string | null;
}): Promise<CorrespondenceIntel> {
  const messages = await gatherMessages(args.applicationId, args.clientId);
  if (messages.length === 0) {
    return emptyResult("Brak zarejestrowanej korespondencji z klientem (e-mail / DM / rozmowy).");
  }
  const channels = [...new Set(messages.map((m) => CHANNEL_LABELS[m.channel] ?? m.channel))];

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    const r = emptyResult(`Zebrano ${messages.length} wiadomości (${channels.join(", ")}), ale brak LOVABLE_API_KEY — analiza AI pominięta.`);
    r.messagesAnalyzed = messages.length;
    r.channels = channels;
    return r;
  }

  try {
    const res = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "Jesteś analitykiem ryzyka. Odpowiadasz wyłącznie poprawnym JSON-em." },
          { role: "user", content: buildPrompt(messages, { declaredValue: args.declaredValue ?? null, loanAmount: args.loanAmount ?? null, city: args.city ?? null }) },
        ],
        temperature: 0.1,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const r = emptyResult(`Analiza AI korespondencji nie powiodła się (HTTP ${res.status}: ${txt.slice(0, 120)}).`);
      r.messagesAnalyzed = messages.length;
      r.channels = channels;
      return r;
    }
    const json: any = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "";
    const parsed = tryParseJson(content);
    if (!parsed) {
      const r = emptyResult(`Nie udało się sparsować analizy AI (${messages.length} wiadomości).`);
      r.messagesAnalyzed = messages.length;
      r.channels = channels;
      return r;
    }

    const sentiment = ["pozytywny", "neutralny", "negatywny", "mieszany"].includes(parsed.sentiment) ? parsed.sentiment : "nieznany";
    const cooperationLevel = ["wysoki", "sredni", "niski"].includes(parsed.cooperationLevel) ? parsed.cooperationLevel : "nieznany";
    const urgency = ["niska", "srednia", "wysoka"].includes(parsed.urgency) ? parsed.urgency : "nieznana";
    const redFlags = Array.isArray(parsed.redFlags) ? parsed.redFlags.map(String).slice(0, 12) : [];
    const statedFacts = Array.isArray(parsed.statedFacts) ? parsed.statedFacts.map(String).slice(0, 12) : [];
    const inconsistencies = Array.isArray(parsed.inconsistencies) ? parsed.inconsistencies.map(String).slice(0, 12) : [];

    const behavioralRiskScore = computeBehavioralScore({
      sentiment, cooperationLevel, urgency,
      redFlagsCount: redFlags.length, inconsistenciesCount: inconsistencies.length,
    });

    return {
      available: true,
      messagesAnalyzed: messages.length,
      channels,
      sentiment: sentiment as CorrespondenceIntel["sentiment"],
      cooperationLevel: cooperationLevel as CorrespondenceIntel["cooperationLevel"],
      urgency: urgency as CorrespondenceIntel["urgency"],
      redFlags,
      statedFacts,
      inconsistencies,
      behavioralRiskScore,
      summary: String(parsed.riskCommentary ?? `Przeanalizowano ${messages.length} wiadomości z kanałów: ${channels.join(", ")}.`),
    };
  } catch (e: any) {
    const r = emptyResult(`Błąd analizy korespondencji: ${e?.message ?? "nieznany"}.`);
    r.messagesAnalyzed = messages.length;
    r.channels = channels;
    return r;
  }
}
