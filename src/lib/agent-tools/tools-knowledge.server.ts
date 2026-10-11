// Narzędzia wiedzy — wspólne dla floty agentów (A0 recepcja, A1 intake,
// A2P presale inwestora, A3 panel inwestora, A4/A4T windykacja):
//  * `search_knowledge`     — RAG po `text_agent_knowledge` (te same wpisy co
//                             bot czatu), z odbiorcą wyznaczanym przez KOD;
//  * `get_loan_calculator`  — orientacyjna rata na tym samym silniku co
//                             kalkulatory strony, wniosku i MCP;
//  * `get_process_overview` — deterministyczny opis procesu + lista zdań,
//                             których agent nie wypowiada.
//
// Czego pilnuje KOD, a nie prompt:
//  * odbiorca bazy wiedzy wynika z `session.agent_key` — agent klienta nie
//    wyciągnie materiałów inwestorskich, bo tak „zinterpretował” pytanie;
//    wyjątkiem jest recepcja, która dopiero rozpoznaje, z kim rozmawia;
//  * oprocentowanie w kalkulatorze nigdy nie przekracza odsetek maksymalnych
//    (art. 359 § 2¹ KC) — stopa ponad limit jest przycinana, a agent dostaje
//    o tym uwagę do powiedzenia, zamiast liczyć raty niezgodne z prawem;
//  * opis procesu jest stałym tekstem z kodu (spójnym z INTAKE_PROCESS_RULES
//    i promptem windykacji), więc model nie dopowiada etapów, terminów ani
//    obietnic kontaktu.
// Żadne z narzędzi nie czyta danych podmiotu — stąd brak `requiresIdentity`.
import type { AgentKey, ToolContext, ToolResult, ToolSpec } from "./types";
import { retrieveKnowledge, type KnowledgeAudience } from "@/lib/text-agent-knowledge.server";
import { buildEngineSchedule } from "@/lib/contract-engine/loan-schedule";
import {
  FY_COMMISSION_MIN_PLN,
  FY_COMMISSION_PCT,
  LTV_MAX,
  formatRatePl,
  fyCommission,
  ltvPercent,
  maxCapitalRate,
  maxLoanAtLtv,
} from "@/lib/contract-engine/fees";
import { clampAnnualRate, monthlyPayment } from "@/lib/loan-math";
import { parseKwota } from "@/lib/windykacja-harmonogram";
import {
  SUBSCRIPTION_PAYMENT_SENTENCE,
  SUBSCRIPTION_PRICE_SENTENCE,
  plnLabel,
} from "@/lib/investor-plan/plans";

const ALL_PROCESS: readonly AgentKey[] = [
  "recepcja",
  "intake",
  "inwestor_presale",
  "inwestor_panel",
  "windykacja",
  "windykacja_tekst",
];

/** Kalkulator dla rozmów sprzedażowych — windykacja liczy z akt sprawy, nie „na oko”. */
const CALCULATOR_AGENTS: readonly AgentKey[] = ["intake", "recepcja", "inwestor_presale"];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Klucz porównawczy z wejścia modelu: małe litery, bez polskich znaków,
 * spacje/myślniki → „_”. Model potrafi napisać „malejące” albo „Pożyczkobiorca
 * windykacja” — to nadal poprawna wartość, a nie powód do odmowy.
 */
function plainKey(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s-]+/g, "_");
}

/** Brak wartości (pominięty argument) ≠ wartość błędna — tylko ta druga to odmowa. */
function isMissing(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

// ── search_knowledge ─────────────────────────────────────────────────────────

export const KNOWLEDGE_EMPTY_SAY = "Nie mam tego w materiałach — nie zgaduję.";
const KNOWLEDGE_HITS = 4;
const HIT_MAX_CHARS = 900;
const QUERY_MIN = 3;
const QUERY_MAX = 300;

/** Odbiorca materiałów wynikający z roli agenta (wpisy „wspolna” dochodzą zawsze — robi to RPC). */
export function defaultKnowledgeAudience(agent: AgentKey): KnowledgeAudience {
  if (agent === "inwestor_presale" || agent === "inwestor_panel") return "inwestor";
  // Windykacja rozmawia z pożyczkobiorcą, czyli z klientem pożyczkowym.
  return "klient";
}

type AudienceResolution = { ok: true; audience: KnowledgeAudience } | { ok: false; error: string };

function resolveKnowledgeAudience(agent: AgentKey, raw: unknown): AudienceResolution {
  // Tylko recepcja nie wie jeszcze, kto dzwoni — pozostałe agenty mają odbiorcę
  // z góry, a argument modelu jest ignorowany (nie może poszerzyć zakresu).
  if (agent !== "recepcja" || isMissing(raw)) {
    return { ok: true, audience: defaultKnowledgeAudience(agent) };
  }
  const key = plainKey(raw);
  if (key === "klient" || key === "inwestor") return { ok: true, audience: key };
  return { ok: false, error: "Nieznany odbiorca materiałów. Dozwolone: klient, inwestor." };
}

/** Przycięcie treści trafienia — agent głosowy nie potrzebuje całego artykułu. */
function clip(text: unknown, max: number): string {
  const t = String(text ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

async function searchKnowledge(ctx: ToolContext): Promise<ToolResult> {
  const query = String(ctx.args.query ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (query.length < QUERY_MIN || query.length > QUERY_MAX) {
    return {
      ok: false,
      error: `Pytanie do bazy wiedzy musi mieć od ${QUERY_MIN} do ${QUERY_MAX} znaków.`,
    };
  }
  const resolved = resolveKnowledgeAudience(ctx.session.agent_key, ctx.args.audience);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const found = await retrieveKnowledge(query, KNOWLEDGE_HITS, resolved.audience);
  const hits = (found ?? []).slice(0, KNOWLEDGE_HITS).map((h) => ({
    title: clip(h.title, 200),
    content: clip(h.content, HIT_MAX_CHARS),
    similarity: Math.round(Number(h.similarity ?? 0) * 1000) / 1000,
  }));
  return {
    ok: true,
    rows: hits.length,
    result: {
      audience: resolved.audience,
      hits,
      // Zawsze w wyniku: przy pustej liście agent mówi to zdanie zamiast zgadywać.
      say_if_empty: KNOWLEDGE_EMPTY_SAY,
    },
  };
}

// ── get_loan_calculator ──────────────────────────────────────────────────────

export const LOAN_CALC_MIN_PLN = 1;
export const LOAN_CALC_MAX_PLN = 10_000_000;
export const LOAN_CALC_MAX_MONTHS = 120;
/** Górna granica wartości nieruchomości — chroni przed literówką rzędu wielkości. */
const PROPERTY_MAX_PLN = 1_000_000_000;
export const LOAN_CALC_DISCLAIMER = "Orientacyjnie; warunki ustala inwestor przy konkretnej sprawie.";

type InstallmentType = "rowne" | "malejace";

/** Liczba z wejścia modelu: „100 000 zł”, „14,5%”, 12 — jak parseKwota w windykacji. */
function parseNumberArg(v: unknown): number | null {
  if (typeof v === "boolean") return null;
  return parseKwota(typeof v === "string" ? v.replace(/%/g, "") : v);
}

function parseInstallmentType(raw: unknown): InstallmentType | null {
  // Pominięty typ = raty równe: tak liczą kalkulatory strony i wniosku.
  if (isMissing(raw)) return "rowne";
  const key = plainKey(raw);
  if (key === "rowne" || key === "rowne_raty" || key === "annuitetowe") return "rowne";
  if (key === "malejace" || key === "malejace_raty") return "malejace";
  return null;
}

interface ScheduleFigures {
  rataPierwsza: number;
  rataOstatnia: number;
  odsetki: number;
  doSplaty: number;
}

/**
 * Raty równe: silnik umów (`buildEngineSchedule`) z pułapem = rata annuitetowa
 * zaokrąglona w górę do grosza — dokładnie jak `engineSummary` w MCP, więc
 * agent podaje tę samą ratę co kalkulator na stronie.
 */
function equalSchedule(
  K: number,
  ratePct: number,
  N: number,
  asOf: Date,
): { ok: true; f: ScheduleFigures } | { ok: false; error: string } {
  const nominal = monthlyPayment(K, ratePct, N);
  const eng = buildEngineSchedule({
    kwotaPozyczki: K,
    prowizja: 0,
    // Prowizja FY nie wchodzi do rat — liczona osobno niżej (silnik zgłasza
    // błąd, gdy przewyższa kwotę, a tu chcemy wtedy uwagi, nie odmowy).
    prowizjaFY: 0,
    annualRatePercent: ratePct,
    months: N,
    maxMonthlyPayment: Math.ceil(nominal * 100) / 100,
    asOf,
  });
  if (eng.errors.length > 0 || eng.rows.length === 0) {
    return { ok: false, error: eng.errors.join(" ") || "Nie udało się policzyć harmonogramu." };
  }
  return {
    ok: true,
    f: {
      rataPierwsza: eng.rows[0].rata_razem,
      rataOstatnia: eng.rows[eng.rows.length - 1].rata_razem,
      odsetki: eng.totalInterest,
      doSplaty: eng.totalToRepay,
    },
  };
}

/**
 * Raty malejące: stała część kapitałowa K/N, odsetki od salda (ta sama stopa
 * miesięczna i zaokrąglenie do grosza co w silniku). Silnik umów obsługuje
 * tylko raty równe/balonowe, więc model malejący jest liczony tutaj.
 */
function decreasingSchedule(K: number, ratePct: number, N: number): ScheduleFigures {
  const r = ratePct / 100 / 12;
  const czescKapitalowa = round2(K / N);
  let saldo = K;
  let rataPierwsza = 0;
  let rataOstatnia = 0;
  let odsetki = 0;
  let doSplaty = 0;
  for (let i = 1; i <= N; i++) {
    const ods = round2(saldo * r);
    // Ostatnia rata zabiera resztę kapitału — Σ kapitał = K mimo zaokrągleń.
    const kapital = i < N ? Math.min(czescKapitalowa, saldo) : saldo;
    const rata = round2(kapital + ods);
    saldo = round2(saldo - kapital);
    if (i === 1) rataPierwsza = rata;
    rataOstatnia = rata;
    odsetki = round2(odsetki + ods);
    doSplaty = round2(doSplaty + rata);
  }
  return { rataPierwsza, rataOstatnia, odsetki, doSplaty };
}

async function getLoanCalculator(ctx: ToolContext): Promise<ToolResult> {
  const a = ctx.args;

  const kwota = parseNumberArg(a.kwota_pln);
  if (kwota == null || kwota < LOAN_CALC_MIN_PLN || kwota > LOAN_CALC_MAX_PLN) {
    return {
      ok: false,
      error: `Podaj kwotę pożyczki w złotych: od ${LOAN_CALC_MIN_PLN} do ${plnLabel(LOAN_CALC_MAX_PLN)}.`,
    };
  }
  const okres = parseNumberArg(a.okres_miesiace);
  if (okres == null || !Number.isInteger(okres) || okres < 1 || okres > LOAN_CALC_MAX_MONTHS) {
    return {
      ok: false,
      error: `Podaj okres w pełnych miesiącach: od 1 do ${LOAN_CALC_MAX_MONTHS}.`,
    };
  }
  const typ = parseInstallmentType(a.typ);
  if (!typ) return { ok: false, error: "Nieznany typ rat. Dozwolone: rowne, malejace." };

  const maxRate = maxCapitalRate(ctx.now);
  const uwagi: string[] = [];
  let stopa = maxRate;
  let przycieta = false;
  if (!isMissing(a.oprocentowanie_roczne)) {
    const podana = parseNumberArg(a.oprocentowanie_roczne);
    if (podana == null) {
      return { ok: false, error: "Oprocentowanie roczne podaj jako liczbę w procentach, np. 12,5." };
    }
    stopa = clampAnnualRate(podana, ctx.now);
    if (stopa !== podana) {
      przycieta = true;
      uwagi.push(
        podana > maxRate
          ? `Podane oprocentowanie przekracza odsetki maksymalne — liczę na ${formatRatePl(maxRate)}% rocznie.`
          : "Oprocentowanie nie może być ujemne — liczę na 0%.",
      );
    }
  }

  let wartosc: number | null = null;
  if (!isMissing(a.wartosc_nieruchomosci)) {
    wartosc = parseNumberArg(a.wartosc_nieruchomosci);
    if (wartosc == null || wartosc <= 0 || wartosc > PROPERTY_MAX_PLN) {
      return { ok: false, error: "Wartość nieruchomości podaj w złotych jako liczbę większą od zera." };
    }
  }

  const K = round2(kwota);
  let f: ScheduleFigures;
  if (typ === "rowne") {
    const eq = equalSchedule(K, stopa, okres, ctx.now);
    if (!eq.ok) return { ok: false, error: eq.error };
    f = eq.f;
  } else {
    f = decreasingSchedule(K, stopa, okres);
  }

  const prowizja = fyCommission(K);
  if (prowizja >= K) {
    uwagi.push(
      `Przy tej kwocie minimalna prowizja Finance You (${plnLabel(FY_COMMISSION_MIN_PLN)}) pochłania całą wypłatę.`,
    );
  }

  const ltv: Record<string, unknown> = {};
  if (wartosc != null) {
    const maxKwota = maxLoanAtLtv(wartosc);
    const ltvProc = ltvPercent(K, wartosc);
    ltv.max_kwota_przy_ltv_60 = maxKwota;
    ltv.ltv_proc = ltvProc;
    ltv.ltv_w_limicie = ltvProc != null && ltvProc <= LTV_MAX + 1e-9;
    if (!ltv.ltv_w_limicie) {
      uwagi.push(
        `Kwota przekracza ${LTV_MAX}% wartości nieruchomości — przy tej wartości orientacyjnie do ${plnLabel(Math.floor(maxKwota))}.`,
      );
    }
  }

  return {
    ok: true,
    result: {
      typ,
      kwota_pln: K,
      okres_miesiace: okres,
      oprocentowanie_roczne: stopa,
      oprocentowanie_przyciete: przycieta,
      // Dla rat malejących — pierwsza (najwyższa) rata.
      rata_miesieczna: f.rataPierwsza,
      rata_ostatnia: f.rataOstatnia,
      odsetki_lacznie: f.odsetki,
      do_splaty: f.doSplaty,
      prowizja_finance_you: prowizja,
      kwota_na_reke: round2(Math.max(0, K - prowizja)),
      calkowity_koszt: round2(f.odsetki + prowizja),
      calkowity_koszt_sklad: `odsetki + prowizja Finance You (${FY_COMMISSION_PCT}% kwoty, min ${plnLabel(FY_COMMISSION_MIN_PLN)}, bez VAT, potrącana z wypłaty)`,
      ...ltv,
      uwagi,
      zastrzezenie: LOAN_CALC_DISCLAIMER,
    },
  };
}

// ── get_process_overview ─────────────────────────────────────────────────────

export type ProcessAudience = "klient" | "inwestor" | "pozyczkobiorca_windykacja";
const PROCESS_AUDIENCES: readonly ProcessAudience[] = ["klient", "inwestor", "pozyczkobiorca_windykacja"];

interface ProcessStep {
  nr: number;
  krok: string;
  opis: string;
}

interface ProcessOverview {
  tytul: string;
  kroki: ProcessStep[];
  fakty: string[];
  nigdy_nie_mow: string[];
}

const steps = (list: Array<[string, string]>): ProcessStep[] =>
  list.map(([krok, opis], i) => ({ nr: i + 1, krok, opis }));

/**
 * Teksty są funkcją daty tylko przez odsetki maksymalne (tabela RPP w fees.ts) —
 * po zmianie stopy agent od razu mówi nową wartość, bez edycji promptu.
 */
export function processOverview(audience: ProcessAudience, now: Date): ProcessOverview {
  const maxRate = `${formatRatePl(maxCapitalRate(now))}%`;
  const prowizjaFy = `prowizja ${FY_COMMISSION_PCT}% kwoty pożyczki, nie mniej niż ${plnLabel(FY_COMMISSION_MIN_PLN)}, bez VAT, potrącana z wypłaty`;

  if (audience === "klient") {
    return {
      tytul: "Proces dla klienta: pożyczka dla firmy pod zastaw nieruchomości",
      kroki: steps([
        [
          "Rozmowa i wniosek",
          "Klient opisuje cel związany z działalnością gospodarczą, kwotę, okres i nieruchomość, którą już posiada. Wniosek składa na stronie albo kompletuje w rozmowie.",
        ],
        [
          "Komplet wniosku",
          "Dane i dokumenty muszą być kompletne — bez kompletu inwestor nie może w ogóle pochylić się nad sprawą.",
        ],
        ["Wniosek trafia do inwestorów", "Kompletny wniosek jest przedstawiany inwestorom współpracującym z Finance You."],
        [
          "Kontakt inwestora — tylko jeśli jest zainteresowany",
          "Jeśli sprawa zainteresuje inwestora, to inwestor sam kontaktuje się z klientem z konkretną ofertą. Kwotę, oprocentowanie i okres ustala inwestor.",
        ],
        [
          "Brak oferty oznacza brak zainteresowania",
          "Brak oferty i brak pytań oznacza, że wniosek na razie nie spotkał się z zainteresowaniem.",
        ],
        [
          "Umowa i wypłata",
          `Jeśli klient i inwestor się porozumieją, zawierają umowę pożyczki z zabezpieczeniem na nieruchomości. Jedyna opłata dla Finance You to ${prowizjaFy}.`,
        ],
      ]),
      fakty: [
        "Finansujemy wyłącznie cel związany z działalnością gospodarczą (B2B) — nie cele konsumpcyjne.",
        "Zabezpieczeniem jest nieruchomość, którą klient już posiada; nie finansujemy zakupu nieruchomości.",
        `Kwota pożyczki zwykle do ${LTV_MAX}% wartości nieruchomości.`,
        `Oprocentowanie nie przekracza odsetek maksymalnych (obecnie ${maxRate} rocznie).`,
        `Opłata dla Finance You: ${prowizjaFy} (100 000 zł → 5 000 zł prowizji, 95 000 zł na konto).`,
      ],
      nigdy_nie_mow: [
        "Nie obiecuj kontaktu z naszej strony: żadnego „oddzwonimy”, „analityk się odezwie”, „ktoś zadzwoni”.",
        "Nie obiecuj, że inwestor się odezwie ani że wniosek zostanie przyjęty.",
        "Nie podawaj terminu decyzji, kontaktu ani wypłaty — nikt go nie zna.",
        "Nie obiecuj kwoty, oprocentowania ani warunków — ustala je inwestor przy konkretnej sprawie.",
        "Nie mów klientowi, że wniosek jest odrzucony.",
        "Nie mów „netto” ani „brutto” o prowizji — mów „bez VAT”. Nie podawaj stawek miesięcznych oprocentowania.",
        "Nie zmyślaj etapów procesu ani osób, które rzekomo zajmują się sprawą.",
      ],
    };
  }

  if (audience === "inwestor") {
    return {
      tytul: "Proces dla inwestora: abonament → umowy → moduł ofert",
      kroki: steps([
        [
          "Abonament",
          `Dostęp do systemu to abonament: ${SUBSCRIPTION_PRICE_SENTENCE}. ${SUBSCRIPTION_PAYMENT_SENTENCE}`,
        ],
        [
          "Umowy",
          "Po weryfikacji danych pożyczkodawcy i tożsamości inwestor akceptuje w panelu pakiet umów: umowę ramową (v7), NDA z zakazem obchodzenia i umowę powierzenia danych (RODO).",
        ],
        [
          "Moduł ofert i zlecenia",
          "Akceptacja pakietu umów otwiera moduł ofert: inwestor składa Zlecenie (kwota, maksymalny okres, minimalne oprocentowanie) i widzi dopasowane Projekty. Sam decyduje, czy i z kim rozmawia.",
        ],
        [
          "Decyzja i umowa pożyczki",
          `Ocena sprawy i decyzja o finansowaniu należą wyłącznie do inwestora. Limity: kwota do ${LTV_MAX}% wartości nieruchomości, oprocentowanie do odsetek maksymalnych (obecnie ${maxRate} rocznie).`,
        ],
      ]),
      fakty: [
        "Sprzedawcą abonamentu jest Fundacja Krzewienia Edukacji Finansowej im. Pieczaka.",
        "Nie ma opłaty sukcesu ani opłaty za pojedynczy Projekt — prowizję od pożyczkobiorcy płaci klient, potrącaną z wypłaty.",
        "Płatność przez Tpay (przelew albo BLIK), bez karty kredytowej i bez automatycznego odnawiania.",
      ],
      nigdy_nie_mow: [
        "Nie obiecuj zysków, stopy zwrotu ani rentowności.",
        "Nie mów, że inwestycja jest bezpieczna, gwarantowana albo bez ryzyka.",
        "Nie obiecuj liczby ofert ani tempa, w jakim pojawią się Projekty.",
        "Nie mów o płatności kartą ani o automatycznym odnawianiu abonamentu — ich nie ma.",
        "Nie wspominaj o Pakiecie PRO, opłacie sukcesu ani opłacie za Projekt — nie istnieją.",
        "Nie doradzaj inwestycyjnie, prawnie ani podatkowo.",
        "Nie obiecuj kontaktu ani oddzwonienia.",
      ],
    };
  }

  return {
    tytul: "Postępowanie przy zaległości — co dzieje się po kolei",
    kroki: steps([
      [
        "Polubowne ustalenie",
        "Rozmowa o zaległości i ustalenie konkretnej wpłaty: kwoty i terminu. Ustalenie trafia do akt sprawy.",
      ],
      [
        "Wezwanie do zapłaty",
        "Gdy ustalenie nie przynosi skutku — formalne wezwanie do zapłaty listem poleconym.",
      ],
      [
        "Wypowiedzenie umowy",
        "Gdy wezwanie nie przynosi skutku — wypowiedzenie umowy. Po wypowiedzeniu wymagalne jest całe pozostałe zadłużenie, nie tylko zaległa kwota.",
      ],
      [
        "Droga formalna",
        "Dalsze kroki pożyczkodawcy przewidziane w umowie i przepisach, zależnie od zabezpieczeń tej sprawy. Decyduje pożyczkodawca.",
      ],
    ]),
    fakty: [
      "Konsekwencje to informacja, nie groźba: mów o nich spokojnie i zawsze razem z wyjściem z sytuacji — konkretną wpłatą w konkretnym dniu.",
      "Kwoty, terminy i etap sprawy podawaj wyłącznie z akt sprawy i dopiero po potwierdzeniu tożsamości.",
    ],
    nigdy_nie_mow: [
      "Nie groź i nie strasz: żadnej policji, prokuratury, więzienia, „zabierzemy dom”, „jutro wejdzie komornik”.",
      "Nie wspominaj o rejestrach dłużników (BIG, KRD, BIK).",
      "Nie podawaj się za komornika, sąd, kancelarię ani urząd.",
      "Nie rozmawiaj o sprawie z osobami trzecimi i nie zapowiadaj informowania rodziny, pracodawcy ani kontrahentów.",
      "Nie obiecuj umorzenia, rozłożenia na raty, zmiany warunków ani wstrzymania kroków — decyduje pożyczkodawca.",
      "Nie używaj słowa „dłużnik” — mów o płatności, zaległości, racie.",
      "Nie podawaj innego rachunku niż rachunek z umowy.",
      "Nie obiecuj oddzwonienia i nie umawiaj kolejnych telefonów.",
    ],
  };
}

/** Domyślny opis procesu dla roli agenta, gdy model nie poda odbiorcy. */
function defaultProcessAudience(agent: AgentKey): ProcessAudience {
  if (agent === "inwestor_presale" || agent === "inwestor_panel") return "inwestor";
  if (agent === "windykacja" || agent === "windykacja_tekst") return "pozyczkobiorca_windykacja";
  return "klient";
}

async function getProcessOverview(ctx: ToolContext): Promise<ToolResult> {
  let audience = defaultProcessAudience(ctx.session.agent_key);
  if (!isMissing(ctx.args.audience)) {
    const key = plainKey(ctx.args.audience);
    if (!(PROCESS_AUDIENCES as readonly string[]).includes(key)) {
      return {
        ok: false,
        error: `Nieznany odbiorca procesu. Dozwolone: ${PROCESS_AUDIENCES.join(", ")}.`,
      };
    }
    audience = key as ProcessAudience;
  }
  return { ok: true, result: { audience, ...processOverview(audience, ctx.now) } };
}

export const TOOLS: readonly ToolSpec[] = [
  {
    name: "search_knowledge",
    agents: ALL_PROCESS,
    requiresIdentity: false,
    writes: false,
    rateLimit: { perConversation: 10, windowMinutes: 10 },
    description:
      "Szuka w bazie wiedzy Finance You (te same materiały co bot czatu). args: query (3–300 znaków, pytanie rozmówcy własnymi słowami), audience? (klient | inwestor — tylko recepcja; pozostali agenci mają odbiorcę ustalonego z góry). Zwraca do 4 trafień {title, content, similarity}. Pusta lista → powiedz „say_if_empty” i nie zgaduj.",
    handler: searchKnowledge,
  },
  {
    name: "get_loan_calculator",
    agents: CALCULATOR_AGENTS,
    requiresIdentity: false,
    writes: false,
    rateLimit: { perConversation: 10, windowMinutes: 10 },
    description:
      "Orientacyjna rata pożyczki (ten sam silnik co kalkulator na stronie). args: kwota_pln (1–10 000 000), okres_miesiace (1–120), oprocentowanie_roczne? (%, domyślnie i najwyżej odsetki maksymalne — dziś 14,5), typ? (rowne | malejace, domyślnie rowne), wartosc_nieruchomosci? (zł). Zwraca ratę (przy malejących — pierwszą), odsetki łącznie, całkowity koszt z prowizją Finance You, kwotę na rękę, przy wartości nieruchomości — maks. kwotę przy LTV 60%. Zawsze przekaż „zastrzezenie” i „uwagi”.",
    handler: getLoanCalculator,
  },
  {
    name: "get_process_overview",
    agents: ALL_PROCESS,
    requiresIdentity: false,
    writes: false,
    rateLimit: { perConversation: 5, windowMinutes: 10 },
    description:
      "Jak wygląda proces — stały opis kroków, kluczowe fakty i lista „nigdy_nie_mow”. args: audience? (klient | inwestor | pozyczkobiorca_windykacja; domyślnie wg roli agenta). Mów tylko to, co jest w wyniku — bez dopowiadania etapów, terminów i obietnic kontaktu.",
    handler: getProcessOverview,
  },
];
