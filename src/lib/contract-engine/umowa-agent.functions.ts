// ════════════════════════════════════════════════════════════════════
// AGENT UMOWY (AI) — osobny agent czatowy TYLKO do wypełniania umowy.
//
// Główny ekran panelu /inwestor. Architektura zgodna z filozofią silnika:
// AI wypełnia WYŁĄCZNIE dane zgodne ze schematem (`UmowaData`), a tekst umowy
// składa kod deterministycznie z biblioteki klauzul. Model nie dotyka treści
// umowy — zwraca łatkę danych (patch), którą serwer scala z szkicem, po czym:
//   1. dolicza deterministycznie to, czego AI nie ma liczyć (kwoty słownie,
//      harmonogram rat z silnika `buildEngineSchedule`, identyfikatory N1…),
//   2. domyka rozjazd groszowy autonaprawą (zmiana 4 po Kańkowskich),
//   3. waliduje (`waliduj` + `walidujHarmonogram`) i zwraca braki operatorowi.
// Podgląd i .docx generują te same funkcje silnika co w kreatorze.
// ════════════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import type { Problem } from "./validator";
import type { KorektaGroszowa } from "./schedule";
import { scalPatch, przetworzSzkic } from "./umowa-agent-core";
import { renderuj } from "./renderer";
import { formatuj } from "./formatter";
import { buildUmowaDocx, harmonogramZUmowy } from "./umowa-docx";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GEMINI_PRO = "google/gemini-2.5-pro";

type ChatMsg = { role: "user" | "assistant"; content: string };

// ── katalog schematu do promptu (opis, nie treść umowy) ──────────────
const KATALOG_SCHEMATU = `
KORZEŃ: { meta, pozyczkodawca, pozyczkobiorca, porecziciel?, warunki, nieruchomosci[], zabezpieczenia }

meta: { data_umowy "DD.MM.RRRR", miejscowosc (miejscownik, np. "Lublinie"), numer_umowy? }

STRONA (pozyczkodawca; pozyczkobiorca może być tablicą 1–6 stron):
- osoba fizyczna: { typ:"osoba_fizyczna", imie_nazwisko, firma? (nazwa JDG), dzialalnosc? ("gospodarstwo_rolne" dla rolnika prowadzącego gospodarstwo), pesel (11 cyfr), nip? (10 cyfr — przy wspólnym gospodarstwie rolnym NIP tylko u jednego przedstawiciela), regon?, dokument_tozsamosci?, adres, telefon?, email?, stan_cywilny? ("kawaler_panna"|"zonaty_zamezna"|"rozwiedziony"|"wdowiec"), ustroj_majatkowy? ("wspolnosc_ustawowa"|"rozdzielnosc"|"wspolnosc_umowna") }
- podmiot gospodarczy: { typ:"podmiot_gospodarczy", nazwa, forma? ("jdg"|"spolka_cywilna"|"spolka_jawna"|"spolka_partnerska"|"spolka_komandytowa"|"spolka_komandytowo_akcyjna"|"sp_z_oo"|"prosta_sa"|"sa"|"spoldzielnia"|"fundacja"|"stowarzyszenie"|"inna"), forma_prawna?, krs? (10 cyfr), nip?, regon?, adres, reprezentacja: [{ imie_nazwisko, pesel?, funkcja (np. "prezes zarządu"), podstawa? }], reprezentacja_laczna?, kapital_zakladowy? {cyframi, slownie}, wspolnicy_sc? (dla s.c.: tablica osób fizycznych), uchwala_zobowiazanie?, uchwala_nieruchomosc? { wymagana, organ?, przedlozona?, data?, numer?, wylaczona_umowa_spolki? } }

porecziciel?: jak strona + zakres_odpowiedzialnosci? ("rzeczowa"|"rzeczowa_i_osobista") + zgoda_malzonka? { na_hipoteke, na_poreczenie }

warunki: {
  kwota_pozyczki {cyframi}, prowizja { kwota {cyframi}, model? ("nie_potracana_raty" domyślnie | "potracana_z_wyplaty") },
  oprocentowanie (string, JEDNO miejsce po przecinku, np. "15,5"), cel (min. 5 znaków),
  harmonogram { liczba_rat (1–360), typ ("balonowy"|"rowne_raty"|"malejace"), data_pierwszej_raty "DD.MM.RRRR", dzien_miesiaca (1–28), kwota_raty? {cyframi} (przy typie balonowym = pułap raty miesięcznej — WYMAGANA do policzenia rat) },
  rachunki { wyplata (nr rachunku pożyczkobiorcy), splata (nr rachunku pożyczkodawcy) }
}

nieruchomosci[≥1]: { nr_kw (np. "LU1I/00123456/7"), sad (np. "Sąd Rejonowy Lublin-Zachód w Lublinie"), opis, rodzaj? ("lokal"|"dom"|"dzialka_budowlana"|"grunt_rolny"|"lokal_uzytkowy"|"inne"), wlasciciel_ref ("pozyczkobiorca"|"porecziciel"|"osoba_trzecia"), wlasciciel_dane? (strona, gdy osoba_trzecia), wlasciciel_index? (indeks pożyczkobiorcy-właściciela), wspolwlasnosc? { rodzaj ("laczna_malzenska"|"ulamkowa"), wspolwlasciciele: [{ imie_nazwisko, pesel?, udzial? (np. "1/2" przy ułamkowej) }] }, obciazenia?: [{ dzial ("III"|"IV"), rodzaj ("hipoteka_umowna"|"hipoteka_przymusowa"|"sluzebnosc_osobista"|"sluzebnosc_gruntowa"|"dozywocie"|"roszczenie"|"egzekucja_sadowa"|"egzekucja_administracyjna"|"najem_dzierzawa"|"zakaz_zbywania"|"inne"), opis, wierzyciel? (np. "Skarb Państwa — KRUS"), kwota? (np. "38 450,00"), sposob_usuniecia? ("brak"|"wykreslenie_przed_wyplata"|"wykreslenie_ze_srodkow_pozyczki"|"zrzeczenie_uprawnionego"|"pozostaje_akceptowane"), kwota_splaty? {cyframi}, wierzyciel_rachunek? }], hipoteka { kwota {cyframi}, pierwszenstwo ("pierwsze"|"kolejne"|"oproznione_miejsce"), oproznione_miejsce_po? }, zakres? ("cala_kw"|"po_odlaczeniu"), dzialki_w_kw?, dzialki_do_odlaczenia?, roszczenie_oproznione_miejsce? (bool) }

zabezpieczenia: { egzekucja_777 { kwota {cyframi}, poddaje_sie: ["pozyczkobiorca"|"porecziciel"|"wlasciciel_osoba_trzecia"], data_graniczna "DD.MM.RRRR", termin_wezwania_dni? (np. 7) }, charakter_hipoteki? ("laczna"|"odrebna") }`;

const SYSTEM_PROMPT =
  "Jesteś AGENTEM UMOWY Finance You — osobnym agentem, którego JEDYNYM zadaniem jest wypełnianie danych " +
  "umowy pożyczki dla silnika klauzul. NIE jesteś ogólnym asystentem: nie doradzasz inwestycyjnie, nie " +
  "oceniasz ryzyka, nie prowadzisz rozmów poza budową umowy. Tekst umowy składa deterministycznie silnik — " +
  "Ty wypełniasz wyłącznie DANE zgodne ze schematem.\n\n" +
  "ZASADY:\n" +
  "1. Używaj WYŁĄCZNIE informacji podanych przez rozmówcę. NIGDY nie wymyślaj PESEL, NIP, KRS, numerów KW, " +
  "rachunków, kwot ani dat — czego nie podano, nie wpisuj i dopytaj.\n" +
  '2. Formaty: kwoty jako {"cyframi": "50 000,00"} (spacje tysięcy, przecinek, 2 miejsca) — pola ' +
  '"slownie" NIE wypełniaj (doliczy je system); daty "DD.MM.RRRR"; oprocentowanie z JEDNYM miejscem po ' +
  'przecinku (np. "15,5"); PESEL 11 cyfr, NIP 10 cyfr.\n' +
  '3. NIE licz harmonogramu rat (tabeli "raty") ani kwoty raty końcowej — policzy je silnik, gdy podasz ' +
  "kwotę, prowizję, oprocentowanie, liczbę rat, typ, datę pierwszej raty i (przy balonie) pułap kwota_raty. " +
  "Nie nadawaj identyfikatorów nieruchomości (id) — nada je system.\n" +
  "4. Domyślne praktyki Finance You (stosuj, gdy rozmówca nie wskaże inaczej): prowizja model " +
  '"nie_potracana_raty"; hipoteka i kwota z art. 777 zwykle na 2× łącznej kwoty do spłaty — ale kwoty te ' +
  "zawsze potwierdź z rozmówcą, nie wpisuj ich bez akceptacji.\n" +
  '5. W "reply" odpowiadaj zwięźle po polsku: potwierdź, co uzupełniłeś, wskaż, co jeszcze blokuje umowę ' +
  "(dostaniesz listę problemów walidatora), i zadaj JEDNO najważniejsze pytanie o brakujące dane.\n" +
  '6. W "patch" zwróć TYLKO zmieniane fragmenty danych (deep-merge: obiekty są scalane, tablice podmieniane ' +
  "w całości — podając tablicę, podaj ją kompletną; null usuwa wartość).\n" +
  '7. W "missing" wypisz najważniejsze brakujące dane (krótkie etykiety, max 8).\n\n' +
  "SCHEMAT DANYCH UMOWY:\n" +
  KATALOG_SCHEMATU +
  '\n\nZwróć WYŁĄCZNIE JSON: { "reply": "…", "patch": { … }, "missing": ["…"] }';

// ── rozmowa z agentem ────────────────────────────────────────────────
export interface UmowaAgentResult {
  reply: string;
  umowa: any;
  problemy: Problem[];
  autokorekty: KorektaGroszowa[];
  missing: string[];
}

export const sendUmowaAgentMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messages: ChatMsg[]; umowa?: any }) => {
    const messages = Array.isArray(d?.messages) ? d.messages.slice(-40) : [];
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user" || !String(last.content ?? "").trim())
      throw new Error("Brak wiadomości użytkownika.");
    if (String(last.content).length > 6000) throw new Error("Wiadomość jest za długa.");
    return { messages, umowa: d?.umowa ?? {} };
  })
  .handler(async ({ data }): Promise<UmowaAgentResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Agent umowy jest chwilowo niedostępny.");

    const szkic = data.umowa && typeof data.umowa === "object" ? structuredClone(data.umowa) : {};

    // Stan szkicu + aktualne problemy walidacji — kontekst dla agenta.
    const { problemy: problemyPrzed } = przetworzSzkic(structuredClone(szkic));
    const stan =
      "AKTUALNY SZKIC DANYCH UMOWY (JSON):\n" +
      JSON.stringify(szkic).slice(0, 24000) +
      "\n\nAKTUALNE PROBLEMY WALIDATORA:\n" +
      (problemyPrzed.length
        ? problemyPrzed
            .slice(0, 40)
            .map((p) => `[${p.poziom}] ${p.sciezka}: ${p.komunikat}`)
            .join("\n")
        : "(brak)");

    const history = data.messages.filter((m) => m && m.content && m.content.trim());
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: stan },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMINI_PRO,
        messages,
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) throw new Error("Zbyt wiele zapytań do AI. Spróbuj za chwilę.");
    if (res.status === 402) throw new Error("Wyczerpany limit AI. Doładuj środki w Lovable Cloud.");
    if (!res.ok) throw new Error(`AI gateway: ${res.status} ${await res.text().catch(() => "")}`);

    const json: any = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      try {
        parsed = m ? JSON.parse(m[0]) : {};
      } catch {
        parsed = {};
      }
    }

    const scalona =
      parsed.patch && typeof parsed.patch === "object" ? scalPatch(szkic, parsed.patch) : szkic;
    const { umowa, problemy, autokorekty } = przetworzSzkic(scalona);

    return {
      reply:
        typeof parsed.reply === "string" && parsed.reply.trim()
          ? parsed.reply
          : "Zaktualizowałem dane umowy.",
      umowa,
      problemy,
      autokorekty,
      missing: Array.isArray(parsed.missing) ? parsed.missing.map(String).slice(0, 8) : [],
    };
  });

// ── podgląd tekstowy z danych agenta ─────────────────────────────────
export const previewUmowaAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { umowa: any }) => ({ umowa: d?.umowa ?? {} }))
  .handler(async ({ data }) => {
    const { umowa, problemy, autokorekty } = przetworzSzkic(structuredClone(data.umowa));
    const blocked = problemy.some((p) => p.poziom === "BLAD");
    let previewText = "";
    if (!blocked) {
      try {
        previewText = formatuj(renderuj(umowa));
      } catch (e: any) {
        problemy.push({
          poziom: "BLAD",
          sciezka: "render",
          komunikat: `Nie udało się wyrenderować dokumentu: ${e?.message ?? e}`,
        });
      }
    }
    return {
      previewText,
      problemy,
      autokorekty,
      blocked: blocked || problemy.some((p) => p.poziom === "BLAD"),
    };
  });

// ── generacja .docx z danych agenta ──────────────────────────────────
export const generateUmowaAgentDocx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { umowa: any }) => ({ umowa: d?.umowa ?? {} }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { umowa, problemy, autokorekty } = przetworzSzkic(structuredClone(data.umowa));
    const blocked = problemy.some((p) => p.poziom === "BLAD");
    if (blocked) {
      return { docxPath: null, signedUrl: null, problemy, autokorekty, blocked: true };
    }

    let bytes: Uint8Array;
    try {
      const doc = renderuj(umowa);
      bytes = await buildUmowaDocx(doc, harmonogramZUmowy(umowa));
    } catch (e: any) {
      problemy.push({
        poziom: "BLAD",
        sciezka: "render",
        komunikat: `Nie udało się złożyć dokumentu: ${e?.message ?? e}`,
      });
      return { docxPath: null, signedUrl: null, problemy, autokorekty, blocked: true };
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const nazwa = (umowa?.meta?.numer_umowy || "umowa-pozyczki")
      .replace(/[^\p{L}\p{N}._-]+/gu, "_")
      .slice(0, 60);
    const outPath = `generated/${userId}/${ts}_${nazwa}.docx`;

    const { error: upErr } = await supabase.storage.from(CLIENT_FILES_BUCKET).upload(
      outPath,
      new Blob([new Uint8Array(bytes)], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      { upsert: false },
    );
    if (upErr) throw new Error(`Upload DOCX: ${upErr.message}`);

    try {
      await supabase.from("generated_documents").insert({
        template_name: "Umowa pożyczki (agent umowy AI, silnik klauzul)",
        form_data: { zrodlo: "umowa-agent" },
        docx_path: outPath,
        file_size_bytes: bytes.length,
        created_by: userId,
      });
    } catch {
      /* rejestracja pomocnicza — pomijalna */
    }

    const { data: signed } = await supabase.storage
      .from(CLIENT_FILES_BUCKET)
      .createSignedUrl(outPath, 3600);

    return {
      docxPath: outPath,
      signedUrl: signed?.signedUrl ?? null,
      problemy,
      autokorekty,
      blocked: false,
    };
  });
