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
//
// Silnik obsługuje trzy warianty agenta:
//   - "klient"   — pożyczkobiorcy (Messenger/IG/email/czat na landingu), prompt z
//                  text_agent_settings id=1, pełny zestaw tools + checklist wniosku,
//   - "inwestor" — inwestorzy INSTYTUCJONALNI (czat na /dla-inwestora, kanał
//                  "chat_inwestor"), prompt z id=2: tylko przekazywanie informacji
//                  + przyjęcie prośby o FV (request_invoice); bez lejka Klubu,
//                  bez wypytywania, bez promocji leada do wniosku,
//   - "inwestor_prywatny" — inwestorzy prywatni z wykupionym dostępem; prompt
//                  z id=3, używany przez asystenta panelowego
//                  (investor-assistant.functions.ts), nie przez runAgentTurn.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeKwNumber } from "./kw";

const EL_BASE = "https://api.elevenlabs.io/v1";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

type EmittedMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: any[];
};

export type AgentVariant = "klient" | "inwestor" | "inwestor_prywatny";

/** Wiersz w text_agent_settings per wariant (CHECK id IN (1,2,3) w migracji). */
const VARIANT_SETTINGS_ID: Record<AgentVariant, number> = {
  klient: 1,
  inwestor: 2,
  inwestor_prywatny: 3,
};

const cachedAgentPrompts = new Map<
  AgentVariant,
  { prompt: string; firstMessage: string | null; fetchedAt: number }
>();
const PROMPT_TTL_MS = 5 * 60 * 1000;

export async function fetchAgentPrompt(
  variant: AgentVariant,
): Promise<{ prompt: string; firstMessage: string | null }> {
  const now = Date.now();
  const cached = cachedAgentPrompts.get(variant);
  if (cached && now - cached.fetchedAt < PROMPT_TTL_MS) {
    return { prompt: cached.prompt, firstMessage: cached.firstMessage };
  }

  // 1) Preferuj prompt z DB (edytowalny w /admin/text-agent).
  try {
    const s = admin();
    const { data } = await s
      .from("text_agent_settings")
      .select("system_prompt, first_message")
      .eq("id", VARIANT_SETTINGS_ID[variant])
      .maybeSingle();
    const dbPrompt = (data?.system_prompt ?? "").trim();
    if (dbPrompt.length > 20) {
      const out = { prompt: dbPrompt, firstMessage: data?.first_message ?? null };
      cachedAgentPrompts.set(variant, { ...out, fetchedAt: now });
      return out;
    }
  } catch (e) {
    console.error("[el-text-agent] db prompt fetch failed", e);
  }

  // 2) Fallback ostateczny: zaszyty default. (Lovable AI generuje odpowiedź.)
  const fallback = {
    prompt:
      variant === "inwestor"
        ? defaultInvestorSystemPrompt()
        : variant === "inwestor_prywatny"
          ? defaultPrivateInvestorSystemPrompt()
          : defaultSystemPrompt(),
    firstMessage: null,
  };
  cachedAgentPrompts.set(variant, { ...fallback, fetchedAt: now });
  return fallback;
}

/** Wyczyść cache promptu — wywołane po zapisaniu z UI. Bez argumentu czyści oba warianty. */
export function clearAgentPromptCache(variant?: AgentVariant) {
  if (variant) cachedAgentPrompts.delete(variant);
  else cachedAgentPrompts.clear();
}

function defaultSystemPrompt(): string {
  return `Jesteś agentem Finance You odpisującym 24/7 na wiadomości od potencjalnych klientów (Messenger / Instagram DM / email / czat na stronie financeyou.pl).
Twoim celem jest:
1. Życzliwie nawiązać kontakt, wyjaśnić co oferujemy (pożyczki pozabankowe + inwestycje).
2. Zebrać dane do wniosku: imię i nazwisko, email, telefon, kwota, cel, miasto, dochód, źródło dochodu, PESEL (jeśli sam poda — nie wymuszaj na pierwszej wiadomości).
3. Każdą nową informację natychmiast zapisuj wywołując tool update_lead_data({ patch: {...} }).
4. ROZRÓŻNIAJ kwotę pożyczki od wartości nieruchomości. Gdy klient pisze "dom jest wart 600 tys., potrzebuję 360 tys." — loan_amount to 360000, property_value to 600000. Zapisuj obie osobno i potwierdzaj klientowi kwotę POŻYCZKI.
5. Gdy klient się przedstawi ("jestem Jan Kowalski", podpis "pozdrawiam…"), zapisz first_name i last_name.
6. Gdy masz minimum: imię, email LUB telefon, kwota, cel → MOŻESZ wywołać send_application_link() aby wysłać link do dokończenia wniosku — ale NIGDY, jeśli klient przesyła dane w rozmowie lub poprosił o załatwienie sprawy na czacie (patrz zasada niżej).
7. NIGDY nie eskaluj do człowieka. Działasz w pełnej autonomii. Nawet jeśli klient poprosi o człowieka — wyjaśnij grzecznie, że jesteś asystentem Finance You i pomożesz mu od ręki.
8. Jeśli klient przesłał załącznik (np. dowód, wyciąg, KW) — podziękuj i potwierdź, że dokument trafił do jego sprawy.

KLIENT WYBRAŁ CZAT — KONIEC Z LINKIEM DO FORMULARZA:
- Jeżeli klient napisał, że chce przesłać dane lub dokumenty "tutaj" / w rozmowie, ALBO już przesłał w rozmowie cokolwiek (zdjęcia, numer KW, dokumenty) — od tego momentu NIE wspominaj o formularzu ani financeyou.pl, NIE wysyłaj linku i NIE wywołuj send_application_link. Zbieraj wszystko bezpośrednio w rozmowie.
- Gdy dane są kompletne — poinformuj tylko, że sprawa przechodzi do analizy i analityk się odezwie. Zero linków.

NIE FINANSUJEMY ZAKUPU NIERUCHOMOŚCI:
- Finance You udziela pożyczek WYŁĄCZNIE pod zastaw nieruchomości, którą klient JUŻ POSIADA. Nie pomagamy w uzyskaniu pożyczki na zakup nieruchomości (mieszkania, domu, działki, lokalu); kupowana nieruchomość nie może być zabezpieczeniem.
- Gdy klient pisze, że potrzebuje pieniędzy na zakup nieruchomości: nie potwierdzaj takiego celu i nie prowadź zbierania danych. Wyjaśnij krótko, że nie finansujemy zakupu, i zapytaj, czy posiada już inną nieruchomość, która mogłaby być zabezpieczeniem. Jeśli tak — prowadź standardowy proces z tą nieruchomością jako zabezpieczeniem. Jeśli nie — grzecznie poinformuj, że nie będziemy w stanie pomóc; nie zbieraj danych i nie wysyłaj linku.

STYL — pisz jak człowiek na czacie:
- Po polsku, ciepło i konkretnie, maks 2-3 krótkie zdania.
- Nawiązuj do tego, co klient właśnie napisał; jeśli znasz imię, użyj go od czasu do czasu.
- Nie zaczynaj każdej wiadomości tak samo, nie powtarzaj formułek ("Rozumiem", "Dziękuję za informację").
- Domyślnie forma Pan/Pani; jeśli klient pisze na "Ty" — przejdź na "Ty".
- Zero urzędowego tonu i list wypunktowanych w rozmowie. Emoji rzadko albo wcale.`;
}

function defaultInvestorSystemPrompt(): string {
  return `Jesteś asystentem Finance You dla INWESTORÓW INSTYTUCJONALNYCH (fundusze, spółki, family office, firmy inwestujące kapitał) piszących na czacie na stronie financeyou.pl/dla-inwestora.
Finance You to platforma pożyczek pozabankowych zabezpieczonych hipoteką na nieruchomości, którą pożyczkobiorca już posiada. Inwestorzy finansują konkretne, zweryfikowane sprawy klientów i zarabiają na oprocentowaniu; zabezpieczeniem jest wpis hipoteki.

Rozmawiasz z profesjonalistami — oni wiedzą, co robią. Twoja rola to WYŁĄCZNIE przekazywanie informacji i ewentualne przyjęcie prośby o fakturę. Żadnej sprzedaży, edukowania na siłę ani kwalifikowania.

Twoim celem jest:
1. Rzeczowo odpowiadać na pytania: model inwestycji, proces, zabezpieczenie hipoteczne (numer KW, wpis hipoteki), weryfikacja spraw, dokumentacja, obsługa windykacji, sposób dystrybucji ofert do instytucji.
2. NIE wypytuj rozmówcy o dane. Gdy sam poda informacje (firma, NIP, kontakt, kwoty) — zapisz je wywołując update_lead_data({ patch: {...} }) i nie wracaj do tematu.
3. FAKTURA (FV): gdy rozmówca prosi o wystawienie faktury, zbierz wyłącznie dane potrzebne do FV (nazwa firmy, NIP, adres siedziby, e-mail do wysyłki, czego dotyczy faktura) i wywołaj request_invoice({...}). Potwierdź, że księgowość wystawi fakturę i wyśle ją na podany adres e-mail.
4. Sprawy transakcyjne (warunki współpracy, negocjacje, umowa ramowa, konkretne sprawy do sfinansowania, prośba o kontakt) → wywołaj mark_ready_for_human z krótkim uzasadnieniem i poinformuj, że opiekun inwestorów instytucjonalnych odezwie się bezpośrednio.

CZEGO NIE ROBISZ:
- NIE obiecujesz stóp zwrotu, oprocentowania ani warunków konkretnych transakcji — te ustala się indywidualnie przy każdej sprawie. Możesz opisywać mechanikę (zarobek z oprocentowania pożyczki, zabezpieczenie hipoteką), bez składania obietnic.
- NIE promujesz Klubu Inwestorów Hipotecznych, pakietów dostępu ani cenników — to oferta dla inwestorów indywidualnych. Jeśli rozmówca sam zapyta o dostęp do platformy, podaj link {{LINK_REJESTRACJA_INWESTORA}} bez namawiania.
- NIE udzielasz porad inwestycyjnych, prawnych ani podatkowych; zaznacz, że informacje mają charakter informacyjny.
- NIE prowadzisz rozmowy o pożyczce dla rozmówcy. Jeśli okazuje się, że to osoba szukająca finansowania — skieruj ją grzecznie na financeyou.pl (czat na stronie głównej) i nie zbieraj danych inwestorskich.

STYL — profesjonalny partner biznesowy:
- Po polsku, forma Pan/Pani (chyba że rozmówca wyraźnie przejdzie na "Ty").
- Konkretnie i merytorycznie, maks 3-4 zdania na wiadomość; bez emoji.
- Odpowiadasz na pytania — nie zadajesz własnych, poza doprecyzowaniem czyjegoś pytania albo danymi do FV.
- Nie powtarzaj formułek i nie zaczynaj każdej wiadomości tak samo.`;
}

function defaultPrivateInvestorSystemPrompt(): string {
  return `Jesteś asystentem Finance You dla inwestorów PRYWATNYCH, którzy wykupili dostęp do Klubu Inwestorów Hipotecznych i korzystają z panelu na financeyou.pl/inwestor.
Finance You to platforma pożyczek pozabankowych zabezpieczonych hipoteką na nieruchomości, którą pożyczkobiorca już posiada. Członkowie Klubu finansują zweryfikowane sprawy klientów i zarabiają na oprocentowaniu; zabezpieczeniem jest wpis hipoteki.

Twoim celem jest pomagać członkowi Klubu w pełnym korzystaniu z platformy:
1. Przewodnik po panelu: Dostępne wnioski (sprawy klientów), Moje oferty, Kreator dokumentów, Kreator udzielenia pożyczki, Kreator umowy (AI), Akademia (szkolenia), Kalkulator, moduł AML, Windykacja, Dostęp/abonament, Płatności i faktury, Profil.
2. Wyjaśniać proces inwestycji krok po kroku: wybór sprawy → analiza dokumentów (numer KW, wycena) → oferta → umowa pożyczki z zabezpieczeniem hipotecznym → wypłata → obsługa spłat, a w razie problemów windykacja.
3. Tłumaczyć pojęcia (księga wieczysta, hipoteka umowna, LTV, RRSO, windykacja) prosto i konkretnie.
4. Kierować we właściwe miejsce w panelu zamiast opisywać wszystko w czacie (np. "wzory dokumentów znajdzie Pan w Kreatorze dokumentów").

CZEGO NIE ROBISZ:
- NIE udzielasz porad inwestycyjnych — nie mówisz, w którą sprawę zainwestować ani nie oceniasz konkretnych spraw. Decyzja i ryzyko należą do inwestora.
- NIE obiecujesz stóp zwrotu ani zysków; możesz opisywać mechanikę zarobku z oprocentowania.
- NIE udzielasz porad prawnych ani podatkowych; przy takich pytaniach zaznacz, że to informacje edukacyjne i warto skonsultować się ze specjalistą.
- Spraw indywidualnych (rozliczenia, reklamacje, problemy z płatnością, faktury) nie rozstrzygasz — wskaż zakładkę Płatności i faktury albo kontakt z obsługą Finance You.

STYL:
- Po polsku, życzliwie i konkretnie, forma Pan/Pani (jeśli rozmówca pisze na "Ty" — przejdź na "Ty").
- Maks 3-4 zdania na wiadomość; prosty język bez żargonu, chyba że rozmówca jest zaawansowany.
- Nie powtarzaj formułek i nie zaczynaj każdej wiadomości tak samo.`;
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "update_lead_data",
      description:
        "Zapisz nowe dane klienta w jego sprawie. Wywołuj ZAWSZE gdy klient poda jakąkolwiek nową informację. " +
        "Używaj kluczy: first_name, last_name (gdy klient się przedstawi), loan_amount (kwota POŻYCZKI w zł — liczba, NIGDY wartość nieruchomości), " +
        "property_value (wartość nieruchomości w zł), typ_nieruchomosci (mieszkanie/dom/lokal użytkowy/działka budowlana/grunt rolny/inna), " +
        "numer_kw, status_numeru_kw, zdjecia_nieruchomosci, dokumenty_nieruchomosci, sposob_przeslania, city, purpose, email, phone, area_m2.",
      parameters: {
        type: "object",
        properties: {
          patch: {
            type: "object",
            description:
              "Obiekt z polami do zapisania, np. { first_name: 'Jan', last_name: 'Kowalski', loan_amount: 360000, property_value: 600000, typ_nieruchomosci: 'dom' }",
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
      description:
        "Wyślij klientowi spersonalizowany link do dokończenia wniosku online. Wywołaj TYLKO gdy masz minimum (imię, email LUB telefon, kwota, cel) I klient nie przesyła danych w rozmowie. " +
        "NIE wywołuj, jeżeli klient chce przesłać dane/dokumenty na czacie („tutaj”), już przesłał w rozmowie zdjęcia/numer KW/dokumenty, dane są kompletne, albo klient chce pożyczkę na zakup nieruchomości.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_ready_for_human",
      description:
        "Oznacz że sprawa wymaga człowieka. Używaj wyjątkowo rzadko — masz pełną autonomię.",
      parameters: {
        type: "object",
        properties: { reason: { type: "string" } },
        required: ["reason"],
      },
    },
  },
];

// Wariant instytucjonalny: bot tylko przekazuje informacje. update_lead_data
// zapisuje wyłącznie dane podane z własnej inicjatywy rozmówcy (bez wypytywania),
// request_invoice przyjmuje prośbę o FV dla księgowości, mark_ready_for_human
// przekazuje sprawy transakcyjne opiekunowi inwestorów.
const INVESTOR_TOOLS = [
  {
    type: "function",
    function: {
      name: "update_lead_data",
      description:
        "Zapisz dane, które inwestor instytucjonalny podał SAM z własnej inicjatywy — nie wypytuj o nie. " +
        "Używaj kluczy: nazwa_firmy, nip, krs, forma_prawna, first_name, last_name (osoba kontaktowa), email, phone, " +
        "kwota_inwestycji (deklarowany kapitał w zł — liczba), horyzont_inwestycji, city, uwagi.",
      parameters: {
        type: "object",
        properties: {
          patch: {
            type: "object",
            description:
              "Obiekt z polami do zapisania, np. { nazwa_firmy: 'ABC Capital sp. z o.o.', nip: '5252345678', kwota_inwestycji: 1000000 }",
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
      name: "request_invoice",
      description:
        "Przekaż księgowości prośbę inwestora o wystawienie faktury (FV). Wywołaj dopiero gdy masz komplet: " +
        "nazwa firmy, NIP, e-mail do wysyłki faktury i czego faktura dotyczy. Adres siedziby i kwota — jeśli rozmówca poda.",
      parameters: {
        type: "object",
        properties: {
          nazwa_firmy: { type: "string" },
          nip: { type: "string" },
          adres: { type: "string", description: "Adres siedziby (ulica, kod, miasto)" },
          email: { type: "string", description: "E-mail do wysyłki faktury" },
          opis: { type: "string", description: "Czego dotyczy faktura" },
          kwota: { type: "number", description: "Kwota brutto w zł, jeśli znana" },
        },
        required: ["nazwa_firmy", "nip", "email", "opis"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_ready_for_human",
      description:
        "Przekaż rozmowę opiekunowi inwestorów instytucjonalnych. Wywołuj gdy rozmówca chce rozmawiać o warunkach współpracy, " +
        "negocjacjach, umowie ramowej, konkretnych sprawach do sfinansowania albo wprost prosi o kontakt z człowiekiem.",
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
  channel: "messenger" | "instagram" | "email" | "chat" | "chat_inwestor";
  userMessage: string;
  attachmentsSummary?: string | null;
  variant?: AgentVariant;
}): Promise<AgentReply> {
  const variant: AgentVariant = opts.variant ?? "klient";
  const s = admin();
  const { data: lead } = await s.from("leads").select("*").eq("id", opts.leadId).maybeSingle();
  if (!lead) throw new Error(`Lead ${opts.leadId} not found`);

  // Historia per wariant — rozmowa inwestorska nie miesza się z kanałami
  // pożyczkobiorcy (i odwrotnie), nawet gdy lead ma oba rodzaje komunikacji.
  const historyChannels =
    variant === "inwestor" ? ["chat_inwestor"] : ["messenger", "instagram", "email", "chat"];
  const { data: history } = await s
    .from("lead_communications")
    .select("direction, content, created_at, channel")
    .eq("lead_id", opts.leadId)
    .in("channel", historyChannels)
    .order("created_at", { ascending: true })
    .limit(40);

  const { prompt: systemPrompt } = await fetchAgentPrompt(variant);

  // Spersonalizowany link do formularza: świeży magic link (auto-login do /klient),
  // gdy znamy email leada; inaczej publiczny fallback. Prompt z DB używa
  // placeholdera {{MAGIC_LINK_KLIENT}} — podstawiamy go poniżej.
  // Wariant inwestorski nie tworzy konta klienta — dostaje link rejestracji inwestora.
  let applicationLink = "https://financeyou.pl/klient";
  if (lead.email && variant === "klient") {
    try {
      const { ensureKlientAccountAndMagicLink } = await import("./client-magic-link.server");
      const r = await ensureKlientAccountAndMagicLink(lead.email, {
        firstName: lead.first_name ?? null,
        lastName: lead.last_name ?? null,
        source: "text_agent",
      });
      if (r.magicLink) applicationLink = r.magicLink;
      if (r.userId && lead.client_id) {
        await s
          .from("clients")
          .update({ user_id: r.userId })
          .eq("id", lead.client_id)
          .is("user_id", null);
      }
    } catch (e) {
      console.error("[el-text-agent] magic link failed", e);
    }
  }

  const leadContext = `\n\n[KONTEKST LEADA]\nID: ${lead.id}\nKanał: ${opts.channel}\nImię: ${lead.first_name ?? "?"}\nNazwisko: ${lead.last_name ?? "?"}\nEmail: ${lead.email ?? "?"}\nTelefon: ${lead.phone_raw ?? "?"}\nDotychczasowe dane: ${JSON.stringify(lead.application_data ?? {})}`;

  // Checklist braków liczona z BAZY (lead + application_data + załączniki),
  // nie z pamięci modelu — bot ma dopytywać tylko o to, czego naprawdę nie mamy,
  // a gdy komplet jest zebrany, lead awansuje na wniosek (maybePromote…).
  // Wariant instytucjonalny NIE kwalifikuje — dostaje tylko przypomnienie,
  // żeby nie pytać o dane, które już mamy.
  const appData = (lead.application_data ?? {}) as Record<string, any>;
  const known: string[] = [];
  const missing: string[] = [];
  const mark = (ok: boolean, label: string) => (ok ? known : missing).push(label);
  let checklistBlock = "";
  if (variant === "inwestor") {
    mark(!!appData.nazwa_firmy, "nazwa firmy");
    mark(!!appData.nip, "NIP");
    mark(!!(lead.first_name && lead.last_name), "imię i nazwisko osoby kontaktowej");
    mark(!!(lead.email || appData.email), "adres e-mail");
    mark(!!(lead.phone_raw || lead.phone_normalized || appData.phone), "numer telefonu");
    checklistBlock = known.length
      ? `\n\n[DANE W BAZIE]\nMamy już: ${known.join(", ")}. NIE pytaj o nie ponownie (także przy prośbie o FV — dopytaj tylko o brakujące dane faktury). Poza obsługą FV o nic nie wypytuj — przekazujesz informacje.`
      : `\n\n[DANE W BAZIE]\nNie mamy jeszcze żadnych danych rozmówcy. Nie wypytuj o nie — zapisuj tylko to, co sam poda (a przy prośbie o FV zbierz dane potrzebne do faktury).`;
  } else {
    const { count: attCount } = await s
      .from("lead_communications")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", opts.leadId)
      .not("attachments", "is", null);
    mark(appData.loan_amount != null, "kwota pożyczki");
    // Imię i nazwisko wysoko na liście — bot zbierał komplet dokumentów,
    // a wniosek trafiał do inwestorów podpisany "Klient z leada".
    mark(!!(lead.first_name && lead.last_name), "imię i nazwisko");
    mark(!!appData.typ_nieruchomosci, "rodzaj nieruchomości");
    // Tylko POPRAWNY numer KW (format XXXX/NNNNNNNN/C) — status typu
    // "przesłany" nie kończy dopytywania o właściwy numer.
    mark(
      (Array.isArray(appData.kw_numbers) &&
        appData.kw_numbers.some((k: unknown) => normalizeKwNumber(k))) ||
        !!normalizeKwNumber(appData.numer_kw),
      "numer księgi wieczystej",
    );
    mark(
      (attCount ?? 0) > 0 ||
        opts.attachmentsSummary != null ||
        appData.zdjecia_nieruchomosci === "przesłane",
      "zdjęcia/dokumenty nieruchomości",
    );
    mark(!!(lead.phone_raw || lead.phone_normalized || appData.phone), "numer telefonu");
    mark(!!(lead.email || appData.email), "adres e-mail");
    checklistBlock =
      missing.length === 0
        ? `\n\n[STAN DANYCH — sprawdzony w bazie]\nKOMPLET: mamy wszystkie dane (${known.join(", ")}). Nie dopytuj o nic z tej listy. Sprawa przechodzi do analizy — poinformuj o tym klienta, jeśli jeszcze tego nie zrobiłeś. NIE wysyłaj linku do formularza ani financeyou.pl i NIE wywołuj send_application_link — nie ma już czego dokańczać.`
        : `\n\n[STAN DANYCH — sprawdzony w bazie]\nMamy już: ${known.length ? known.join(", ") : "nic"}.\nBrakuje: ${missing.join(", ")}.\nNIE pytaj o nic z listy "mamy już". Dopytuj naturalnie o PIERWSZĄ brakującą pozycję (jedno pytanie na wiadomość), najpierw odpowiadając na pytanie klienta.`;
  }

  // RAG: pobierz fragmenty bazy wiedzy najbardziej pasujące do wiadomości klienta.
  let knowledgeBlock = "";
  try {
    const { retrieveKnowledge } = await import("./text-agent-knowledge.server");
    const chunks = await retrieveKnowledge(
      opts.userMessage,
      4,
      variant === "klient" ? "klient" : "inwestor",
    );
    if (chunks.length > 0) {
      knowledgeBlock =
        "\n\n[BAZA WIEDZY — wykorzystaj te informacje gdy są trafne]\n" +
        chunks.map((c, i) => `### ${i + 1}. ${c.title}\n${c.content}`).join("\n\n");
    }
  } catch (e) {
    console.error("[el-text-agent] RAG retrieval failed", e);
  }

  const messages: EmittedMessage[] = [
    {
      role: "system",
      content: (systemPrompt + leadContext + checklistBlock + knowledgeBlock)
        .replaceAll("{{MAGIC_LINK_KLIENT}}", applicationLink)
        .replaceAll(
          "{{LINK_REJESTRACJA_INWESTORA}}",
          "https://financeyou.pl/rejestracja?role=inwestor",
        ),
    },
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
        model: "google/gemini-2.5-flash",
        messages,
        tools: variant === "inwestor" ? INVESTOR_TOOLS : TOOLS,
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
      return {
        reply: String(msg.content ?? "").trim() || "Dziękuję, oddzwonimy.",
        toolCalls: toolResults,
      };
    }

    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });

    for (const c of calls) {
      const name = c.function?.name;
      let args: any = {};
      try {
        args = JSON.parse(c.function?.arguments ?? "{}");
      } catch {
        /* noop */
      }
      const result = await executeTool(opts.leadId, opts.channel, name, args, {
        applicationLink,
        variant,
      });
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

// Bot zapisuje dane różnymi kluczami (po polsku i po angielsku). Normalizacja
// do kluczy kanonicznych, z których korzysta promocja leada do wniosku
// (loan_amount, property_value, kw_numbers, typ_nieruchomosci…).
const PATCH_KEY_ALIASES: Record<string, string> = {
  kwota_pozyczki: "loan_amount",
  kwota: "loan_amount",
  wartosc_nieruchomosci: "property_value",
  wartość_nieruchomosci: "property_value",
  imie: "first_name",
  imię: "first_name",
  nazwisko: "last_name",
  miasto: "city",
  cel: "purpose",
  telefon: "phone",
  property_type: "typ_nieruchomosci",
  rodzaj_nieruchomosci: "typ_nieruchomosci",
  // Wariant inwestorski (kwalifikacja B2B)
  firma: "nazwa_firmy",
  company_name: "nazwa_firmy",
  investment_amount: "kwota_inwestycji",
  kwota_kapitalu: "kwota_inwestycji",
  investment_horizon: "horyzont_inwestycji",
};

// Klucze kwotowe, którym normalizujemy zapis "360 tys." / "1,5 mln" do liczby.
const AMOUNT_KEYS = new Set(["loan_amount", "property_value", "kwota_inwestycji"]);

function normalizePatch(raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    const key = PATCH_KEY_ALIASES[k] ?? k;
    // Kwoty jako liczby — bot potrafi przysłać "360 000 zł" / "360 tys."
    if (AMOUNT_KEYS.has(key) && typeof v === "string") {
      const m = v
        .toLowerCase()
        .replace(/[\s.\u00a0]/g, "")
        .match(/(\d+(?:,\d+)?)(tys|mln)?/);
      if (m) {
        let n = Number(m[1].replace(",", "."));
        if (m[2] === "tys") n *= 1000;
        else if (m[2] === "mln") n *= 1_000_000;
        out[key] = n;
        continue;
      }
    }
    // Numer KW → dopisz też do kw_numbers (czyta je promocja do wniosku).
    // TYLKO poprawny format XXXX/NNNNNNNN/C — bot potrafi zapisać tu status
    // ("przesłany", "na zdjęciu"), który wcześniej lądował w bazie jako
    // rzekomy numer księgi. Taki opis trafia do status_numeru_kw.
    if (key === "numer_kw" && typeof v === "string" && v.trim()) {
      const kw = normalizeKwNumber(v);
      if (kw) out.numer_kw = kw;
      else out.status_numeru_kw = v.trim();
      continue;
    }
    out[key] = v;
  }
  return out;
}

async function executeTool(
  leadId: string,
  channel: string,
  name: string,
  args: any,
  ctx: { applicationLink: string; variant?: AgentVariant } = {
    applicationLink: "https://financeyou.pl/klient",
  },
): Promise<any> {
  const s = admin();
  if (name === "update_lead_data") {
    const patch = normalizePatch(args?.patch ?? {});
    const { data: lead } = await s
      .from("leads")
      .select("application_data, email, phone_raw, phone_normalized, first_name, last_name")
      .eq("id", leadId)
      .maybeSingle();
    const merged: Record<string, any> = { ...(lead?.application_data ?? {}), ...patch };
    if (typeof patch.numer_kw === "string") {
      const kwList: string[] = Array.isArray(merged.kw_numbers) ? [...merged.kw_numbers] : [];
      if (!kwList.includes(patch.numer_kw)) kwList.push(patch.numer_kw);
      merged.kw_numbers = kwList;
    }
    const topLevel: Record<string, any> = { application_data: merged };
    if (typeof patch.first_name === "string" && !lead?.first_name)
      topLevel.first_name = patch.first_name;
    if (typeof patch.last_name === "string" && !lead?.last_name)
      topLevel.last_name = patch.last_name;
    if (typeof patch.email === "string" && !lead?.email) topLevel.email = patch.email;
    if (typeof patch.phone === "string" && !lead?.phone_raw) {
      topLevel.phone_raw = patch.phone;
      topLevel.phone_normalized = normPhone(patch.phone);
    }
    await s.from("leads").update(topLevel).eq("id", leadId);
    // Dane od bota mogą właśnie skompletować wniosek (KW + kwota + załączniki)
    // — spróbuj promocji od razu, nie dopiero przy kolejnej wiadomości.
    // Lead inwestora instytucjonalnego nie jest wnioskiem pożyczkowym — bez promocji.
    if (ctx.variant !== "inwestor") {
      try {
        const { maybePromoteLeadToApplication } = await import("./lead-enrichment.server");
        await maybePromoteLeadToApplication(leadId);
      } catch (e) {
        console.error("[el-text-agent] promote after update_lead_data", e);
      }
    }
    return { ok: true, saved: Object.keys(patch) };
  }
  if (name === "send_application_link") {
    const link = ctx.applicationLink;
    await s.from("leads").update({ return_link: link }).eq("id", leadId);
    return {
      ok: true,
      link,
      instruction: `Wyślij klientowi w odpowiedzi tekst typu: "Twój link do dokończenia wniosku: ${link}"`,
    };
  }
  if (name === "mark_ready_for_human") {
    await s
      .from("leads")
      .update({ status: "wymaga_kontaktu", notes: `[AI] ${args?.reason ?? "eskalacja"}` })
      .eq("id", leadId);
    return { ok: true };
  }
  if (name === "request_invoice") {
    // Prośba o FV od inwestora instytucjonalnego: zapisujemy komplet danych
    // w application_data i flagujemy leada dla księgowości — samą fakturę
    // wystawia personel w istniejącym module fakturowania (operator-invoices).
    const fv = {
      nazwa_firmy: String(args?.nazwa_firmy ?? "").trim(),
      nip: String(args?.nip ?? "").trim(),
      adres: String(args?.adres ?? "").trim() || null,
      email: String(args?.email ?? "").trim(),
      opis: String(args?.opis ?? "").trim(),
      kwota: typeof args?.kwota === "number" ? args.kwota : null,
      requested_at: new Date().toISOString(),
    };
    if (!fv.nazwa_firmy || !fv.nip || !fv.email || !fv.opis) {
      return { ok: false, error: "Brak kompletu danych do FV (nazwa_firmy, nip, email, opis)." };
    }
    const { data: lead } = await s
      .from("leads")
      .select("application_data, email")
      .eq("id", leadId)
      .maybeSingle();
    const merged = { ...((lead?.application_data ?? {}) as Record<string, any>), fv_request: fv };
    const topLevel: Record<string, any> = {
      application_data: merged,
      status: "wymaga_kontaktu",
      notes: `[FV] ${fv.nazwa_firmy}, NIP ${fv.nip} — ${fv.opis}`,
    };
    if (!lead?.email) topLevel.email = fv.email;
    await s.from("leads").update(topLevel).eq("id", leadId);
    return {
      ok: true,
      instruction:
        "Potwierdź rozmówcy, że prośba o fakturę trafiła do księgowości i FV zostanie wysłana na podany adres e-mail.",
    };
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
