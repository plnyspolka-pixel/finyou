// Analiza korespondencji z klientem — e-maile, DM/Messenger, transkrypcje rozmów.
// Zbiera wiadomości z lead_communications (powiązane przez leads → wniosek/klienta)
// i wyciąga WYŁĄCZNIE TWARDE FAKTY przy pomocy Gemini (Lovable AI Gateway).
//
// UWAGA: NIE oceniamy zaangażowania klienta w rozmowę, sentymentu, „poziomu współpracy"
// ani pilności. Interesują nas tylko konkretne, weryfikowalne fakty, rozbieżności
// względem wniosku/KW oraz twarde sygnały ryzyka wynikające z treści.

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
    statedFacts: [],
    inconsistencies: [],
    redFlags: [],
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

async function gatherMessages(
  applicationId: string,
  clientId: string | null,
): Promise<GatheredMessage[]> {
  // 1) Znajdź leady powiązane z wnioskiem lub klientem.
  const leadIds = new Set<string>();
  const { data: byApp } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("loan_application_id", applicationId);
  (byApp ?? []).forEach((l) => leadIds.add(l.id));
  if (clientId) {
    const { data: byClient } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("client_id", clientId);
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

function buildPrompt(
  messages: GatheredMessage[],
  context: { declaredValue: number | null; loanAmount: number | null; city: string | null },
): string {
  const convo = messages
    .map(
      (m, i) => `[${i + 1}] (${CHANNEL_LABELS[m.channel] ?? m.channel}, ${m.direction}) ${m.text}`,
    )
    .join("\n");
  return `Jesteś analitykiem ryzyka w firmie pożyczkowej zabezpieczonej nieruchomością. Z poniższej korespondencji z klientem wyciągnij WYŁĄCZNIE TWARDE FAKTY.

BARDZO WAŻNE — CZEGO NIE ROBIĆ:
- NIE oceniaj zaangażowania klienta w rozmowę, tonu, sentymentu, uprzejmości ani „poziomu współpracy".
- NIE interpretuj emocji, motywacji ani pilności.
- Podawaj tylko konkretne, weryfikowalne informacje wprost wynikające z treści (jeśli fakt nie jest wprost napisany — pomiń go).

KONTEKST WNIOSKU (do wykrywania rozbieżności):
- Deklarowana wartość nieruchomości: ${context.declaredValue ? context.declaredValue.toLocaleString("pl-PL") + " PLN" : "brak"}
- Wnioskowana kwota: ${context.loanAmount ? context.loanAmount.toLocaleString("pl-PL") + " PLN" : "brak"}
- Lokalizacja: ${context.city ?? "brak"}

KORESPONDENCJA (od najstarszej):
${convo}

ZADANIE — wyciągnij:
1. statedFacts — twarde fakty o nieruchomości i sytuacji prawno-finansowej podane wprost przez klienta (np. „nieruchomość jest wynajęta", „jest drugi współwłaściciel", „istnieje inna pożyczka/hipoteka", „trwa rozwód/spadek", „planowana sprzedaż", konkretne kwoty, daty, adresy).
2. inconsistencies — twarde rozbieżności między treścią korespondencji a danymi wniosku/KW (inna kwota, inna wartość, inny adres, inny właściciel, sprzeczne informacje między wiadomościami).
3. redFlags — twarde sygnały ryzyka wynikające z faktów (wzmianka o egzekucji/komorniku, zajęciu, innym wierzycielu, sporze o własność, braku zgody współwłaściciela, toczącym się postępowaniu, nieruchomości już wystawionej na sprzedaż lub obciążonej).

ODPOWIEDŹ — wyłącznie poprawny JSON, bez markdown ani backticków:
{
  "statedFacts": ["..."],
  "inconsistencies": ["..."],
  "redFlags": ["..."],
  "factSummary": "1-3 zdania podsumowania wyłącznie na podstawie ustalonych faktów (bez ocen zaangażowania/sentymentu)"
}`;
}

function tryParseJson(s: string): any | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
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
    const r = emptyResult(
      `Zebrano ${messages.length} wiadomości (${channels.join(", ")}), ale brak LOVABLE_API_KEY — ekstrakcja faktów pominięta.`,
    );
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
          {
            role: "system",
            content:
              "Jesteś analitykiem ryzyka. Wyciągasz wyłącznie twarde fakty (bez ocen zaangażowania czy sentymentu). Odpowiadasz wyłącznie poprawnym JSON-em.",
          },
          {
            role: "user",
            content: buildPrompt(messages, {
              declaredValue: args.declaredValue ?? null,
              loanAmount: args.loanAmount ?? null,
              city: args.city ?? null,
            }),
          },
        ],
        temperature: 0.1,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const r = emptyResult(
        `Ekstrakcja faktów z korespondencji nie powiodła się (HTTP ${res.status}: ${txt.slice(0, 120)}).`,
      );
      r.messagesAnalyzed = messages.length;
      r.channels = channels;
      return r;
    }
    const json: any = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "";
    const parsed = tryParseJson(content);
    if (!parsed) {
      const r = emptyResult(
        `Nie udało się sparsować ekstrakcji faktów (${messages.length} wiadomości).`,
      );
      r.messagesAnalyzed = messages.length;
      r.channels = channels;
      return r;
    }

    const statedFacts = Array.isArray(parsed.statedFacts)
      ? parsed.statedFacts.map(String).slice(0, 12)
      : [];
    const inconsistencies = Array.isArray(parsed.inconsistencies)
      ? parsed.inconsistencies.map(String).slice(0, 12)
      : [];
    const redFlags = Array.isArray(parsed.redFlags) ? parsed.redFlags.map(String).slice(0, 12) : [];

    return {
      available: true,
      messagesAnalyzed: messages.length,
      channels,
      statedFacts,
      inconsistencies,
      redFlags,
      summary: String(
        parsed.factSummary ??
          `Wyodrębniono fakty z ${messages.length} wiadomości (kanały: ${channels.join(", ")}).`,
      ),
    };
  } catch (e: any) {
    const r = emptyResult(`Błąd ekstrakcji faktów z korespondencji: ${e?.message ?? "nieznany"}.`);
    r.messagesAnalyzed = messages.length;
    r.channels = channels;
    return r;
  }
}
