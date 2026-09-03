import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ════════════════════════════════════════════════════════════════════
// TELEFON WINDYKACYJNY Z SYSTEMU — agent ElevenLabs dzwoniący w imieniu
// inwestora i przypominający o konieczności uregulowania należności.
//
// Agent jest tworzony automatycznie przez API ElevenLabs przy pierwszym
// użyciu (zapisywany w voicebot_settings.windykacja_agent_id). Kwota
// zaległości, imię inwestora, dłużnik i numer umowy są przekazywane jako
// zmienne dynamiczne ({{...}}) przy każdym połączeniu — jeden agent
// obsługuje wszystkich inwestorów.
// ════════════════════════════════════════════════════════════════════

// Tabele wind_* nie są w wygenerowanych typach Database (jak w windykacja.functions.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- luźny dostęp do klienta
type LooseDb = { from: (t: string) => any };
const loose = (c: unknown) => c as LooseDb;

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

/** Prompt agenta windykacyjnego — zmienne dynamiczne w {{podwójnych klamrach}}. */
const WIND_AGENT_PROMPT = `Jesteś uprzejmym, ale stanowczym asystentem windykacyjnym platformy Finance You. Dzwonisz w imieniu inwestora {{imie_inwestora}} do klienta {{imie_dluznika}} w sprawie zaległości ze spłatą pożyczki (umowa {{numer_umowy}}).

Aktualna kwota zaległości: {{kwota_zaleglosci}} zł.

Zasady rozmowy:
1. Przedstaw się: dzwonisz z Finance You w imieniu {{imie_inwestora}} w sprawie umowy pożyczki.
2. Potwierdź, że rozmawiasz z właściwą osobą ({{imie_dluznika}}). Jeśli to nie ta osoba — przeproś, nie podawaj ŻADNYCH szczegółów zadłużenia i grzecznie zakończ rozmowę.
3. Poinformuj o zaległości: {{kwota_zaleglosci}} zł, i poproś o pilne uregulowanie należności.
4. Zapytaj, kiedy klient planuje dokonać wpłaty. Zanotuj deklarowany termin.
5. Jeśli klient deklaruje problemy ze spłatą — zaproponuj kontakt z inwestorem w celu ustalenia porozumienia lub ugody.
6. Uprzedz, że brak spłaty może skutkować dalszymi krokami windykacyjnymi (wezwanie do zapłaty, wypowiedzenie umowy, postępowanie sądowe) i dodatkowymi kosztami.
7. Bądź kulturalny i rzeczowy. Nie strasz, nie podnoś głosu, nie używaj gróźb. Nie negocjuj wysokości długu — od tego jest inwestor.
8. Rozmawiaj wyłącznie po polsku. Kwoty czytaj słownie, np. „pięć tysięcy złotych".
9. Na koniec podsumuj ustalenia i podziękuj za rozmowę.`;

const WIND_AGENT_FIRST_MESSAGE = `Dzień dobry, dzwonię z platformy Finance You w imieniu {{imie_inwestora}}, w sprawie umowy pożyczki {{numer_umowy}}. Czy rozmawiam z {{imie_dluznika}}?`;

/**
 * Zwraca ID agenta windykacyjnego ElevenLabs. Jeśli nie istnieje — tworzy
 * go przez API i zapisuje w ustawieniach (jednorazowo).
 */
async function ensureWindykacjaAgent(): Promise<{ agentId?: string; error?: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { error: "Brak ELEVENLABS_API_KEY — skonfiguruj integrację ElevenLabs." };

  const s = admin();
  const { data: settings } = await s
    .from("voicebot_settings")
    .select("windykacja_agent_id")
    .eq("id", 1)
    .maybeSingle();
  const existing = (settings as { windykacja_agent_id?: string | null } | null)
    ?.windykacja_agent_id;
  if (existing) return { agentId: existing };

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Finance You — windykacja (w imieniu inwestora)",
        conversation_config: {
          agent: {
            first_message: WIND_AGENT_FIRST_MESSAGE,
            language: "pl",
            prompt: { prompt: WIND_AGENT_PROMPT },
            dynamic_variables: {
              dynamic_variable_placeholders: {
                imie_inwestora: "inwestora",
                imie_dluznika: "klientem",
                kwota_zaleglosci: "0",
                numer_umowy: "—",
              },
            },
          },
          // Agenty nie-angielskie wymagają modelu turbo/flash v2_5.
          tts: { model_id: "eleven_flash_v2_5" },
        },
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- odpowiedź zewnętrznego API
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.agent_id) {
      const msg = json?.detail?.message ?? json?.message ?? `ElevenLabs HTTP ${res.status}`;
      return { error: `Nie udało się utworzyć agenta windykacyjnego: ${msg}` };
    }
    await s.from("voicebot_settings").update({ windykacja_agent_id: json.agent_id }).eq("id", 1);
    await s.from("automation_events").insert({
      automation_type: "elevenlabs_agent_created",
      status: "sent",
      sent_payload: { purpose: "windykacja" },
      response_payload: { agent_id: json.agent_id },
    });
    return { agentId: json.agent_id as string };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Błąd tworzenia agenta ElevenLabs",
    };
  }
}

/** Formatuje kwotę do odczytania przez agenta (bez groszy, z separatorem). */
function kwotaSlownie(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 }).format(Math.round(n));
}

// ── Telefon windykacyjny (bot dzwoni w imieniu inwestora) ────────────
export const placeWindCollectionCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, unknown>) =>
    z
      .object({
        caseId: z.string().uuid(),
        telefon: z.string().min(6, "Podaj numer telefonu"),
        /** Kwota zaległości do zakomunikowania (domyślnie wyliczenie z systemu). */
        kwota: z.coerce.number().min(0),
        oplata: z.coerce.number().min(0).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);

    // Sprawa + dłużnik (RLS gwarantuje, że sprawa należy do inwestora).
    const { data: kase, error: cErr } = await db
      .from("wind_collection_cases")
      .select(
        "id, kwota_zalegla, loan:wind_loans(numer_umowy, borrower:wind_borrowers(imie_nazwisko, telefon))",
      )
      .eq("id", data.caseId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!kase) throw new Error("Sprawa nie znaleziona");

    const loan = kase.loan as {
      numer_umowy: string | null;
      borrower: { imie_nazwisko: string; telefon: string | null } | null;
    } | null;

    // Imię i nazwisko inwestora, w którego imieniu dzwoni agent.
    const s = admin();
    const { data: profile } = await s
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("user_id", context.userId)
      .maybeSingle();
    const imieInwestora =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
      context.claims?.email ||
      "inwestora Finance You";

    const { agentId, error: agentErr } = await ensureWindykacjaAgent();
    if (!agentId) throw new Error(agentErr ?? "Brak agenta windykacyjnego");

    const kwota = data.kwota > 0 ? data.kwota : Number(kase.kwota_zalegla || 0);
    const { placeOutboundCallInternal } = await import("@/lib/voicebot.functions");
    const res = await placeOutboundCallInternal({
      phone: data.telefon,
      source: "windykacja",
      firstName: loan?.borrower?.imie_nazwisko?.split(" ")[0] ?? null,
      agentIdOverride: agentId,
      dynamicVariables: {
        imie_inwestora: imieInwestora,
        imie_dluznika: loan?.borrower?.imie_nazwisko ?? "klientem",
        kwota_zaleglosci: kwotaSlownie(kwota),
        numer_umowy: loan?.numer_umowy ?? "—",
      },
    });

    // Zdarzenie w aktach sprawy — niezależnie od wyniku (dowód próby kontaktu).
    const { data: ev, error: eErr } = await db
      .from("wind_events")
      .insert({
        case_id: data.caseId,
        typ: "telefon",
        kategoria: "automatyczne",
        tytul: res.ok
          ? "Telefon windykacyjny (agent AI) — połączenie zainicjowane"
          : "Telefon windykacyjny (agent AI) — nie wykonano",
        tresc: res.ok
          ? `Agent AI dzwoni w imieniu: ${imieInwestora}. Komunikowana zaległość: ${kwotaSlownie(kwota)} zł.`
          : `Powód: ${res.error ?? "nieznany"}`,
        status_doreczenia: null,
        metadata: {
          numer: data.telefon,
          agent_id: agentId,
          conversation_id: res.conversationId ?? null,
          call_sid: res.callSid ?? null,
          kwota_zaleglosci: kwota,
          ok: res.ok,
          error: res.error ?? null,
        },
        oplata: res.ok ? data.oplata : 0,
        autor: context.claims?.email ?? null,
      })
      .select(
        "id, case_id, typ, kategoria, tytul, tresc, data_zdarzenia, data_doreczenia, status_doreczenia, zalacznik_url, metadata, oplata, autor, created_at",
      )
      .single();
    if (eErr) throw new Error(eErr.message);

    return { ok: res.ok, error: res.error ?? null, event: ev };
  });
