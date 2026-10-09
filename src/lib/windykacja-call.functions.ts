import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireInvestorPro } from "@/lib/investor-plan/pro-middleware";
import { normalizeWindFeeTable, windFeeForAction } from "@/lib/windykacja-fees";
import {
  WIND_AGENT_DATA_COLLECTION,
  WIND_AGENT_EVALUATION,
  WIND_AGENT_FIRST_MESSAGE,
  WIND_AGENT_NAME,
  WIND_AGENT_PLACEHOLDERS,
  WIND_AGENT_PROMPT,
  buildWindCallVariables,
  warsawISODate,
  type WindPreviousPromise,
} from "@/lib/windykacja-agent-prompt";
import { windDebtSnapshot, type WindDebtEvent, type WindDebtLoan } from "@/lib/windykacja-debt";

// ════════════════════════════════════════════════════════════════════
// TELEFON WINDYKACYJNY Z SYSTEMU — agent ElevenLabs dzwoniący w imieniu
// inwestora i ustalający konkretny termin wpłaty zaległości.
//
// Agent jest tworzony automatycznie przez API ElevenLabs przy pierwszym
// użyciu (zapisywany w voicebot_settings.windykacja_agent_id). Prompt,
// pierwsza wiadomość i zmienne żyją w windykacja-agent-prompt.ts; zmiana
// promptu w kodzie trafia do istniejącego agenta przy najbliższym telefonie
// (odcisk w voicebot_settings.agent_prompt_hashes.windykacja). Dane sprawy
// (kwota, etap, termin, zabezpieczenia, opłaty z umowy, poprzednia
// deklaracja) idą jako zmienne dynamiczne ({{...}}) — jeden agent obsługuje
// wszystkich inwestorów. Wynik rozmowy dopisuje do akt webhook ElevenLabs
// (windykacja-call-outcome.ts).
//
// Kwota i opóźnienie — ten sam silnik co karta sprawy (windDebtSnapshot):
// domyślnie agent mówi o kwocie „do zapłaty teraz" (zaległe raty + odsetki
// za opóźnienie + koszty), a całe zadłużenie dopiero po wypowiedzeniu umowy.
// ════════════════════════════════════════════════════════════════════

// Tabele wind_* nie są w wygenerowanych typach Database (jak w windykacja.functions.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- luźny dostęp do klienta
type LooseDb = { from: (t: string) => any };
const loose = (c: unknown) => c as LooseDb;

const EL_BASE = "https://api.elevenlabs.io/v1";
const PROMPT_HASH_KEY = "windykacja";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

/** Zakończenie rozmowy i wykrycie poczty głosowej (bez zostawiania wiadomości). */
const WIND_AGENT_BUILT_IN_TOOLS = {
  end_call: {
    type: "system",
    name: "end_call",
    description: "",
    params: { system_tool_type: "end_call" },
  },
  voicemail_detection: {
    type: "system",
    name: "voicemail_detection",
    description: "",
    params: { system_tool_type: "voicemail_detection", voicemail_message: "" },
  },
};

/**
 * Konfiguracja agenta. `full` = z narzędziami systemowymi i analizą rozmowy;
 * gdy API odrzuci któreś z tych pól (inna wersja schematu), ponawiamy bez
 * nich — prompt i zmienne są ważniejsze niż dodatki.
 */
function windAgentConfig(full: boolean, withTts: boolean): Record<string, unknown> {
  return {
    conversation_config: {
      agent: {
        first_message: WIND_AGENT_FIRST_MESSAGE,
        language: "pl",
        prompt: full
          ? { prompt: WIND_AGENT_PROMPT, built_in_tools: WIND_AGENT_BUILT_IN_TOOLS }
          : { prompt: WIND_AGENT_PROMPT },
        dynamic_variables: { dynamic_variable_placeholders: WIND_AGENT_PLACEHOLDERS },
      },
      // Agenty nie-angielskie wymagają modelu turbo/flash v2_5. Tylko przy
      // tworzeniu — aktualizacja nie nadpisuje głosu wybranego w konsoli.
      ...(withTts ? { tts: { model_id: "eleven_flash_v2_5" } } : {}),
    },
    ...(full
      ? {
          platform_settings: {
            data_collection: WIND_AGENT_DATA_COLLECTION,
            evaluation: WIND_AGENT_EVALUATION,
          },
        }
      : {}),
  };
}

/** Odcisk konfiguracji — po nim poznajemy, czy agent w ElevenLabs jest aktualny. */
async function windAgentFingerprint(): Promise<string> {
  const data = new TextEncoder().encode(
    JSON.stringify([
      WIND_AGENT_FIRST_MESSAGE,
      WIND_AGENT_PROMPT,
      WIND_AGENT_PLACEHOLDERS,
      WIND_AGENT_DATA_COLLECTION,
    ]),
  );
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

interface ElWriteResult {
  ok: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- odpowiedź zewnętrznego API
  json: any;
  /** Czy przeszła pełna konfiguracja (narzędzia + analiza rozmowy). */
  full: boolean;
  status: number;
}

async function elWrite(
  url: string,
  method: "POST" | "PATCH",
  apiKey: string,
  withTts: boolean,
): Promise<ElWriteResult> {
  for (const full of [true, false]) {
    const res = await fetch(url, {
      method,
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        ...(method === "POST" ? { name: WIND_AGENT_NAME } : {}),
        ...windAgentConfig(full, withTts),
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- odpowiedź zewnętrznego API
    const json: any = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, json, full, status: res.status };
    if (!full) return { ok: false, json, full, status: res.status };
    console.warn(
      "[windykacja-agent] API odrzuciło pełną konfigurację — próba bez dodatków",
      res.status,
    );
  }
  return { ok: false, json: {}, full: false, status: 0 };
}

/**
 * Zwraca ID agenta windykacyjnego ElevenLabs. Jeśli nie istnieje — tworzy
 * go przez API i zapisuje w ustawieniach (jednorazowo). Jeśli istnieje, ale
 * prompt w kodzie się zmienił — aktualizuje go (błąd aktualizacji nie
 * blokuje telefonu: agent dzwoni wtedy poprzednią wersją).
 */
async function ensureWindykacjaAgent(): Promise<{ agentId?: string; error?: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { error: "Brak ELEVENLABS_API_KEY — skonfiguruj integrację ElevenLabs." };

  const s = admin();
  const { data: settings, error: sErr } = await s
    .from("voicebot_settings")
    .select("windykacja_agent_id, agent_prompt_hashes")
    .eq("id", 1)
    .maybeSingle();
  // Bez odczytu ustawień nie wiemy, czy agent już jest — nie tworzymy
  // kolejnego przy każdym telefonie (brak kolumny = niezastosowana migracja).
  if (sErr) return { error: `Nie można odczytać ustawień agenta windykacyjnego: ${sErr.message}` };

  const row = (settings ?? {}) as {
    windykacja_agent_id?: string | null;
    agent_prompt_hashes?: Record<string, string> | null;
  };
  const hashes =
    row.agent_prompt_hashes && typeof row.agent_prompt_hashes === "object"
      ? { ...row.agent_prompt_hashes }
      : {};
  const fingerprint = await windAgentFingerprint();
  const saveHash = async () => {
    hashes[PROMPT_HASH_KEY] = fingerprint;
    await s.from("voicebot_settings").update({ agent_prompt_hashes: hashes }).eq("id", 1);
  };

  const existing = row.windykacja_agent_id;
  if (existing) {
    if (hashes[PROMPT_HASH_KEY] === fingerprint) return { agentId: existing };
    try {
      const r = await elWrite(
        `${EL_BASE}/convai/agents/${encodeURIComponent(existing)}`,
        "PATCH",
        apiKey,
        false,
      );
      await s.from("automation_events").insert({
        automation_type: "elevenlabs_agent_prompt_synced",
        status: r.ok ? "sent" : "error",
        sent_payload: { purpose: "windykacja", agent_id: existing, prompt_hash: fingerprint },
        response_payload: { full_config: r.full, http_status: r.status },
        error_message: r.ok ? null : String(r.json?.detail?.message ?? r.json?.message ?? r.status),
      });
      if (r.ok) await saveHash();
    } catch (e) {
      console.error("[windykacja-agent] aktualizacja promptu nie powiodła się", e);
    }
    return { agentId: existing };
  }

  try {
    const r = await elWrite(`${EL_BASE}/convai/agents/create`, "POST", apiKey, true);
    if (!r.ok || !r.json?.agent_id) {
      const msg = r.json?.detail?.message ?? r.json?.message ?? `ElevenLabs HTTP ${r.status}`;
      return { error: `Nie udało się utworzyć agenta windykacyjnego: ${msg}` };
    }
    await s.from("voicebot_settings").update({ windykacja_agent_id: r.json.agent_id }).eq("id", 1);
    await saveHash();
    await s.from("automation_events").insert({
      automation_type: "elevenlabs_agent_created",
      status: "sent",
      sent_payload: { purpose: "windykacja", prompt_hash: fingerprint },
      response_payload: { agent_id: r.json.agent_id, full_config: r.full },
    });
    return { agentId: r.json.agent_id as string };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Błąd tworzenia agenta ElevenLabs",
    };
  }
}

/** Formatuje kwotę do opisu w aktach (bez groszy, z separatorem). */
function kwotaTekst(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 }).format(Math.round(n));
}

/** Kwota z groszami do opisu w aktach („11 744,94 zł"). */
function zlTekst(n: number): string {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `${v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

const dataPL = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

/** Pożyczka: dane do rozmowy + wszystko, czego potrzebuje windDebtSnapshot. */
const CALL_LOAN_COLS =
  "numer_umowy, data_umowy, termin_splaty, status, data_wypowiedzenia, rachunek_splaty, numer_kw, kwota_hipoteki, akt_notarialny_777, kwota_777, oplaty_windykacyjne, pozyczkodawca, kwota_pozyczki, kwota_calkowita, prowizja, oprocentowanie_roczne, stopa_odsetek_max, kwota_doplat, harmonogram";

type CallLoan = WindDebtLoan & {
  numer_umowy: string | null;
  data_umowy: string | null;
  termin_splaty: string | null;
  status: string | null;
  data_wypowiedzenia: string | null;
  rachunek_splaty: string | null;
  numer_kw: string | null;
  kwota_hipoteki: number | null;
  akt_notarialny_777: string | null;
  kwota_777: number | null;
  oplaty_windykacyjne: unknown;
  pozyczkodawca: string | null;
  borrower: {
    imie_nazwisko: string;
    typ: string | null;
    pesel: string | null;
    telefon: string | null;
  } | null;
};

// ── Telefon windykacyjny (bot dzwoni w imieniu inwestora) ────────────
export const placeWindCollectionCall = createServerFn({ method: "POST" })
  .middleware([requireInvestorPro])
  .inputValidator((d: Record<string, unknown>) =>
    z
      .object({
        caseId: z.string().uuid(),
        telefon: z.string().min(6, "Podaj numer telefonu"),
        /**
         * Kwota do zakomunikowania. 0 = wyliczenie z systemu: „do zapłaty
         * teraz" (zaległe raty + odsetki za opóźnienie + koszty), po
         * wypowiedzeniu umowy — całe zadłużenie.
         */
        kwota: z.coerce.number().min(0).default(0),
        /** Brak = opłata za telefon zgodnie z tabelą opłat z umowy (albo domyślna). */
        oplata: z.coerce.number().min(0).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);

    // Sprawa + pożyczka + pożyczkobiorca (RLS gwarantuje, że sprawa należy do inwestora).
    const { data: kase, error: cErr } = await db
      .from("wind_collection_cases")
      .select(
        `id, investor_user_id, sciezka, etap, opoznienie_dni, kwota_zalegla, data_otwarcia, loan:wind_loans(${CALL_LOAN_COLS}, borrower:wind_borrowers(imie_nazwisko, typ, pesel, telefon))`,
      )
      .eq("id", data.caseId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!kase) throw new Error("Sprawa nie znaleziona");

    const loan = kase.loan as CallLoan | null;

    // Agent potwierdza tożsamość po imieniu i nazwisku — bez nich nie wolno
    // mu rozmawiać o sprawie, więc telefon nie miałby sensu.
    if (!loan?.borrower?.imie_nazwisko?.trim()) {
      throw new Error(
        "Uzupełnij imię i nazwisko (lub nazwę firmy) pożyczkobiorcy — agent musi potwierdzić, z kim rozmawia.",
      );
    }

    // Wszystkie zdarzenia sprawy: wpłaty (metadata.kwota) i opłaty (oplata)
    // do wyliczenia kwoty, telefony — do poprzedniej deklaracji. Bez kompletu
    // zdarzeń kwota byłaby błędna, więc błąd odczytu przerywa telefon.
    const { data: history, error: hErr } = await db
      .from("wind_events")
      .select("typ, data_zdarzenia, metadata, oplata")
      .eq("case_id", data.caseId)
      .order("data_zdarzenia", { ascending: false });
    if (hErr) throw new Error(`Nie można odczytać zdarzeń sprawy: ${hErr.message}`);
    const events = (history ?? []) as WindDebtEvent[];

    // Stan zadłużenia na dziś (Europe/Warsaw) — ten sam silnik co karta
    // sprawy i to samo rozumienie wypowiedzenia co agent (windLoanTerminated
    // = windLoanIsTerminated): po wypowiedzeniu całe zadłużenie, przed nim
    // „do zapłaty teraz".
    const now = new Date();
    const today = warsawISODate(now);
    const snapshot = windDebtSnapshot({
      loan,
      kwotaZalegla: Number(kase.kwota_zalegla ?? 0),
      events,
      asOf: today,
    });

    // Kwota do zakomunikowania: podana w formularzu albo „do zapłaty teraz"
    // (po wypowiedzeniu — całe zadłużenie), nigdy całe saldo przed
    // wypowiedzeniem. Agent mówi pełne złote — poniżej 1 zł nie dzwonimy.
    const recznie = data.kwota > 0;
    const kwota = recznie ? data.kwota : snapshot.doZaplatyTeraz;
    if (Math.round(kwota) < 1) {
      throw new Error(
        snapshot.zrodlo === "harmonogram"
          ? `Według harmonogramu rat na ${dataPL(today)} nie ma nic do zapłaty (brak zaległych rat, odsetek i kosztów) — telefon windykacyjny nie jest potrzebny. Jeśli wpłata nie wpłynęła, sprawdź harmonogram i wpłaty w aktach albo podaj kwotę ręcznie.`
          : "Brak kwoty do zapłaty — uzupełnij kwotę zaległą sprawy albo podaj kwotę ręcznie.",
      );
    }

    // Opłata za telefon windykacyjny — zgodnie z umową pożyczki tej sprawy.
    const oplata =
      data.oplata != null
        ? Math.max(0, data.oplata)
        : windFeeForAction(normalizeWindFeeTable(loan.oplaty_windykacyjne), "telefon").fee;

    // Pożyczkodawca, w którego imieniu dzwoni agent: nazwa z umowy, a gdy
    // jej brak — imię i nazwisko właściciela sprawy (inwestora), nie osoby,
    // która zleca telefon (może to być ktoś z zespołu Finance You).
    let imieInwestora = loan.pozyczkodawca?.trim() ?? "";
    if (!imieInwestora) {
      const ownerId = (kase.investor_user_id as string | null) ?? context.userId;
      const { data: profile } = await admin()
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("user_id", ownerId)
        .maybeSingle();
      imieInwestora =
        [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
        profile?.email ||
        (ownerId === context.userId ? context.claims?.email : null) ||
        "inwestora Finance You";
    }

    // Poprzednia deklaracja z telefonu (zapisana przez webhook) i późniejsze wpłaty.
    const lastPromiseEvent = events.find(
      (e) => e.typ === "telefon" && typeof e.metadata?.deklarowana_data === "string",
    );
    const previousPromise: WindPreviousPromise | null = lastPromiseEvent
      ? {
          data: String(lastPromiseEvent.metadata?.deklarowana_data),
          kwota: Number(lastPromiseEvent.metadata?.deklarowana_kwota) || null,
          z_dnia: lastPromiseEvent.data_zdarzenia,
        }
      : null;
    const paymentsAfterISO = events.filter((e) => e.typ === "wplata").map((e) => e.data_zdarzenia);

    const { agentId, error: agentErr } = await ensureWindykacjaAgent();
    if (!agentId) throw new Error(agentErr ?? "Brak agenta windykacyjnego");

    const dynamicVariables = buildWindCallVariables({
      now,
      imieInwestora,
      borrower: loan.borrower,
      loan,
      kase: {
        sciezka: kase.sciezka,
        opoznienie_dni: kase.opoznienie_dni,
        data_otwarcia: kase.data_otwarcia,
      },
      kwota,
      // Z harmonogramu: dni od najstarszej niezapłaconej raty. Model z jednym
      // terminem — szacunek z terminu spłaty i opóźnienia przy otwarciu sprawy.
      dniOpoznienia: snapshot.zrodlo === "harmonogram" ? snapshot.dniOpoznienia : null,
      previousPromise,
      paymentsAfterISO,
    });

    const { placeOutboundCallInternal } = await import("@/lib/voicebot.functions");
    const res = await placeOutboundCallInternal({
      phone: data.telefon,
      source: "windykacja",
      firstName: loan.borrower.imie_nazwisko.split(" ")[0] ?? null,
      agentIdOverride: agentId,
      dynamicVariables,
    });

    // Skład kwoty do akt — żeby było wiadomo, co agent zakomunikował.
    const skladKwoty = recznie
      ? "kwota podana ręcznie"
      : snapshot.wypowiedziana
        ? `całe zadłużenie po wypowiedzeniu umowy, stan na ${dataPL(today)}`
        : `${snapshot.zrodlo === "harmonogram" ? "zaległe raty" : "zaległość"} ${zlTekst(snapshot.zaleglosc)} + odsetki za opóźnienie ${zlTekst(snapshot.odsetkiZaOpoznienie)} + koszty ${zlTekst(snapshot.koszty)}, stan na ${dataPL(today)}`;

    // Zdarzenie w aktach sprawy — niezależnie od wyniku (dowód próby kontaktu).
    // Wynik rozmowy dopisze webhook ElevenLabs (po conversation_id); opłata
    // zostaje tylko wtedy, gdy monit dotarł do pożyczkobiorcy.
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
          ? `Agent AI dzwoni w imieniu: ${imieInwestora}. Komunikowana kwota do zapłaty: ${kwotaTekst(kwota)} zł (${skladKwoty}). Etap rozmowy: ${dynamicVariables.etap}; najpóźniejszy termin wpłaty do przyjęcia: ${dynamicVariables.termin_maksymalny}.`
          : `Powód: ${res.error ?? "nieznany"}`,
        status_doreczenia: null,
        metadata: {
          numer: data.telefon,
          agent_id: agentId,
          conversation_id: res.conversationId ?? null,
          call_sid: res.callSid ?? null,
          kwota_zaleglosci: kwota,
          kwota_zrodlo: recznie ? "recznie" : "wyliczenie",
          zadluzenie: {
            na_dzien: today,
            zrodlo: snapshot.zrodlo,
            wypowiedziana: snapshot.wypowiedziana,
            zaleglosc: snapshot.zaleglosc,
            odsetki_za_opoznienie: snapshot.odsetkiZaOpoznienie,
            koszty: snapshot.koszty,
            do_zaplaty_teraz: snapshot.doZaplatyTeraz,
            calosc: snapshot.calosc,
            dni_opoznienia: snapshot.dniOpoznienia,
            najstarsza_zalegla: snapshot.najstarszaZalegla,
          },
          etap_rozmowy: dynamicVariables.etap,
          termin_maksymalny: dynamicVariables.termin_maksymalny,
          ok: res.ok,
          error: res.error ?? null,
        },
        oplata: res.ok ? oplata : 0,
        autor: context.claims?.email ?? null,
      })
      .select(
        "id, case_id, typ, kategoria, tytul, tresc, data_zdarzenia, data_doreczenia, status_doreczenia, zalacznik_url, metadata, oplata, autor, created_at",
      )
      .single();
    if (eErr) throw new Error(eErr.message);

    return { ok: res.ok, error: res.error ?? null, event: ev, kwota };
  });
