// Wywiad właścicieli z działu II: ogłoszenia sądowe MSiG/KRZ (iMSiG API)
// oraz publiczne indeksowane ogłoszenia giełd wierzytelności.
// Bez obchodzenia zabezpieczeń serwisów i bez wysyłania PESEL do wyszukiwarek.
// PESEL/NIP/KRS/REGON służą jedynie do serwerowego odpytania uprawnionego API;
// wynik nie przechowuje pełnych identyfikatorów.
import { stripHtml } from "@/lib/risk-assessment/kw-parse-core";
import { webSearch } from "@/lib/web-fetch.server";
import { searchPublicIndex, type IndexedSearchResult } from "./public-index-search.server";
import { searchOfficialMsig } from "./official-msig.server";
import { lookupKrzTable } from "@/lib/krz/lookup.server";
import type {
  OwnerIntelligenceHit,
  OwnerIntelligenceReport,
  OwnerIntelligenceSubject,
} from "./owner-intelligence.types";

export interface OwnerIntelligenceInput {
  kind: "person" | "company";
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  pesel?: string | null;
  nip?: string | null;
  regon?: string | null;
  krs?: string | null;
  /** "client" = pożyczkobiorca z wniosku; domyślnie właściciel z działu II KW. */
  role?: "client" | "owner";
}

const EXCHANGES = [
  { domain: "gielda-dlugow.com", title: "Giełda Długów" },
  { domain: "dlugi.info", title: "Długi.info" },
  { domain: "dlug.info.pl", title: "DługInfo" },
] as const;

const maxItems = 12;
const cap = (s: unknown, length = 220) =>
  String(s ?? "")
    .trim()
    .slice(0, length);
const redactPesel = (s: string) => s.replace(/\b\d{11}\b/g, "[PESEL ukryty]");
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const normalize = (s: string) =>
  s
    .toLocaleLowerCase("pl-PL")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function equalName(a: unknown, b: string): boolean {
  return typeof a === "string" && normalize(a) === normalize(b);
}

function safeUrl(raw: unknown): string | null {
  try {
    const url = new URL(String(raw));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** Nazwy podmiotów z tabel działu II: nie skanujemy pozostałych działów KW. */
export function extractCompanyOwnersFromKw(
  dzial2: string | null | undefined,
): OwnerIntelligenceInput[] {
  const text = stripHtml(dzial2);
  const found: OwnerIntelligenceInput[] = [];
  const seen = new Set<string>();
  // EKW/CMD/EasyMKW: "Nazwa ABC SPÓŁKA... Siedziba ... REGON 123456789"
  for (const m of text.matchAll(
    /\bnazwa\s+(.{3,160}?)(?=\s+(?:siedziba|regon|krs|lp\.?|wielkość udziału)\b|$)/giu,
  )) {
    const name = m[1].trim().replace(/[|,;]+$/, "");
    if (!name || !/[\p{L}]/u.test(name) || seen.has(normalize(name))) continue;
    const vicinity = text.slice(m.index ?? 0, (m.index ?? 0) + 250);
    const regon = vicinity.match(/\bregon\s*[:\s]*(\d{9}|\d{14})\b/i)?.[1] ?? null;
    const krs = vicinity.match(/\bkrs\s*[:\s]*(\d{10})\b/i)?.[1] ?? null;
    const nip = vicinity.match(/\bnip\s*[:\s]*(\d{10})\b/i)?.[1] ?? null;
    // Wpis musi dotyczyć podmiotu: identyfikator lub rozpoznawalna forma prawna.
    if (
      !regon &&
      !krs &&
      !nip &&
      !/sp[oó][łl]k|sp\.\s*z\s*o\.o\.|s\.a\.|fundacj|sp[oó][łl]dzielni|gmina|bank|wsp[oó]lnota/i.test(
        name,
      )
    )
      continue;
    seen.add(normalize(name));
    found.push({ kind: "company", name: cap(name, 160), regon, krs, nip });
  }
  return found.slice(0, maxItems);
}

export function identifierMatch(input: OwnerIntelligenceInput, entity: any): boolean {
  const numbers = entity?.numbers ?? {};
  return Boolean(
    (input.pesel && /^\d{11}$/.test(input.pesel) && digits(numbers.pesel) === input.pesel) ||
    (input.nip && /^\d{10}$/.test(input.nip) && digits(numbers.nip) === input.nip) ||
    (input.regon &&
      /^(\d{9}|\d{14})$/.test(input.regon) &&
      digits(numbers.regon) === input.regon) ||
    (input.krs && /^\d{10}$/.test(input.krs) && digits(numbers.krs) === input.krs),
  );
}

async function checkCourt(input: OwnerIntelligenceInput): Promise<{
  status: OwnerIntelligenceSubject["courtStatus"];
  note: string;
  hits: OwnerIntelligenceHit[];
}> {
  const key = process.env.IMSIG_API_KEY?.trim();
  if (!key) {
    // iMSiG (komercyjne API) jest opcjonalne — podstawą jest oficjalna
    // wyszukiwarka MSiG (searchOfficialMsig) i indeks stron KRZ.
    return { status: "unavailable", note: "", hits: [] };
  }
  const params = new URLSearchParams({ stream: "none", append_first_entry: "true" });
  // Najpierw stabilny identyfikator, dopiero później nazwa. Nie wykonujemy
  // wielu zapytań, gdyż każdorazowe pobranie może zużywać limit API.
  if (input.kind === "person" && /^\d{11}$/.test(input.pesel ?? "")) {
    params.set("pesel", input.pesel!);
  } else if (/^\d{10}$/.test(input.krs ?? "")) {
    params.set("krs", input.krs!);
  } else if (/^\d{10}$/.test(input.nip ?? "")) {
    params.set("nip", input.nip!);
  } else if (/^(\d{9}|\d{14})$/.test(input.regon ?? "")) {
    params.set("regon", input.regon!);
  } else if (input.kind === "person" && input.name.trim().split(/\s+/).length >= 2) {
    const parts = input.name.trim().split(/\s+/);
    params.set("first_name", parts[0]);
    params.set("last_name", parts.slice(1).join(" "));
  } else {
    params.set("cleaned_name", input.name);
  }
  try {
    const response = await fetch(`https://api.imsig.pl/v2/announcements?${params}`, {
      headers: { Authorization: key, Accept: "application/json" },
      signal: AbortSignal.timeout(18_000),
    });
    if (!response.ok) {
      return {
        status: "unavailable",
        note: `API KRZ/MSiG zwróciło HTTP ${response.status}; nie oznacza to braku wpisów.`,
        hits: [],
      };
    }
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) {
      return {
        status: "unavailable",
        note: "Nieprawidłowy format danych z API KRZ/MSiG.",
        hits: [],
      };
    }
    const matches: OwnerIntelligenceHit[] = [];
    for (const record of rows) {
      const r = record as any;
      const entities: any[] = Array.isArray(r.entity) ? r.entity : [];
      const confirmed = entities.some((e) => identifierMatch(input, e));
      const sameName = entities.some(
        (e) =>
          equalName(e?.info?.cleaned_name, input.name) ||
          equalName(
            [e?.info?.first_name, e?.info?.last_name].filter(Boolean).join(" "),
            input.name,
          ),
      );
      // W odpowiedzi mogą znaleźć się osoby o identycznym nazwisku — brak
      // powiązania z identyfikatorem => jedynie wynik do weryfikacji.
      if (!confirmed && !sameName) continue;
      const url = safeUrl(r.content?.url ?? r.msig_entry?.url);
      if (!url) continue;
      const p = r.proceeding ?? {};
      matches.push({
        source: "KRZ/MSiG — iMSiG",
        category: "court_notice",
        title: cap(p.type || "Ogłoszenie w KRZ/MSiG", 160),
        detail: cap(p.status || "Status postępowania nieustalony", 150),
        publicationDate:
          cap(r.meta?.issue_date || r.krz_entry?.issue_date || r.msig_entry?.issue_date, 25) ||
          null,
        caseSignature:
          cap(p.main_signature || r.krz_entry?.signature || r.msig_entry?.signature, 100) || null,
        url,
        match: confirmed ? "identifier" : "name_only",
      });
      if (matches.length >= maxItems) break;
    }
    const partial = rows.length >= 1000;
    return {
      status: partial ? "partial" : "checked",
      note: partial
        ? "Wynik ograniczony do 1000 ogłoszeń API; wymaga dalszej kwerendy."
        : matches.length
          ? "Znaleziono ogłoszenia; sprawdź datę, rodzaj i status postępowania (może być historyczne)."
          : "Nie odnaleziono ogłoszeń w dostępnym zakresie iMSiG; nie wyklucza to innych postępowań.",
      hits: matches,
    };
  } catch {
    return {
      status: "unavailable",
      note: "Błąd połączenia z API KRZ/MSiG; wynik nie jest negatywnym potwierdzeniem.",
      hits: [],
    };
  }
}

const INDEX_COURT_SITES = ["krpu.pl", "imsig.pl", "krz.ms.gov.pl"] as const;

/**
 * Wyniki Google/DDG nie są odpisem KRZ. Nie przypisujemy osobie cudzej
 * sprawy tylko dlatego, że imię i nazwisko występuje na wielkiej liście.
 * Sygnatura musi być blisko nazwiska/nazwy w krótkim fragmencie wyniku.
 */
export function classifyIndexedCourtHit(
  input: OwnerIntelligenceInput,
  result: IndexedSearchResult,
): OwnerIntelligenceHit | null {
  let hostname = "";
  try {
    hostname = new URL(result.url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!INDEX_COURT_SITES.some((d) => hostname === d || hostname.endsWith("." + d))) return null;
  if (/\b\d{11}\b/.test(result.url)) return null;
  const raw = result.title + " " + result.snippet;
  const norm = normalize(raw);
  const sought = normalize(input.name);
  const variants = [sought];
  if (input.kind === "person" && sought.split(" ").length === 2) {
    variants.push(sought.split(" ").reverse().join(" "));
  }
  const positions = variants.map((v) => norm.indexOf(v)).filter((p) => p !== -1);
  if (!positions.length) return null;
  // Krótki snippet + odległość 180 znaków ogranicza fałszywe dopasowania
  // na stronach katalogowych z tysiącami spraw.
  const signature = raw.match(
    /\b[A-Z]{2}\d[A-Z]\/(?:GRz-nu|GRz|GUp-s|GUp|GU|GR)\/\d{1,5}\/20\d{2}\b/i,
  );
  const sigPos = signature ? normalize(raw.slice(0, signature.index ?? 0)).length : -1;
  const nearSignature = Boolean(signature && positions.some((p) => Math.abs(sigPos - p) < 180));
  const distress =
    /\b(restrukturyzacj|upad[łl]o|post[ęe]powani.{0,25}uk[łl]adow|zatwierdzeni.{0,15}uk[łl]ad)/i.test(
      raw,
    );
  const liquidation = /w\s+likwidacji|otwarci.{0,20}likwidacji/i.test(raw);
  const isMsiG = hostname === "imsig.pl" || hostname.endsWith(".imsig.pl");

  if (!nearSignature && !(isMsiG && (distress || liquidation))) return null;
  const url = safeUrl(result.url);
  if (!url) return null;
  const source = hostname.includes("krpu.pl")
    ? "KRPU.pl — indeks WWW (nieoficjalny)"
    : hostname.includes("imsig.pl")
      ? "MSiG — indeks WWW, nieodpis"
      : "KRZ — wynik indeksu WWW, nieodpis";
  const kind = nearSignature
    ? "Zindeksowana wzmianka o sprawie sądowej"
    : liquidation
      ? "Wzmianka o likwidacji podmiotu"
      : "Zindeksowana wzmianka o postępowaniu";
  return {
    source,
    category: "court_notice",
    title: kind,
    detail: redactPesel(cap(result.title + " — " + result.snippet, 210)),
    publicationDate: null,
    caseSignature: signature?.[0] ?? null,
    url,
    match: "name_only",
  };
}

async function checkIndexedCourt(input: OwnerIntelligenceInput): Promise<{
  note: string;
  hits: OwnerIntelligenceHit[];
}> {
  const name = input.name.trim().replace(/"/g, "");
  if (name.length < 5) return { note: "Za krótka nazwa do wyszukiwania.", hits: [] };
  // Maksymalnie 4 kwerendy na podmiot, wyłącznie po nazwie; nigdy PESEL.
  const queries = [
    'site:krpu.pl "' + name + '"',
    'site:imsig.pl "' + name + '"',
    '"' + name + '" (KRZ OR "restrukturyzacja" OR "upadłość" OR "GRz-nu")',
    '"' + name + '" "GRz-nu"',
  ];
  const searched = await Promise.allSettled(queries.map((q) => searchPublicIndex(q, 8)));
  const hits = searched.flatMap((r) =>
    r.status === "fulfilled"
      ? r.value.results.flatMap((item) => {
          const hit = classifyIndexedCourtHit(input, item);
          return hit ? [hit] : [];
        })
      : [],
  );
  const engines = [
    ...new Set(searched.flatMap((r) => (r.status === "fulfilled" ? [r.value.engine] : []))),
  ].join(", ");
  const uniq = [...new Map(hits.map((h) => [h.url + ":" + h.caseSignature, h])).values()].slice(
    0,
    maxItems,
  );
  return {
    note:
      (uniq.length
        ? "Są wzmianki wymagające weryfikacji."
        : "Brak rozpoznanych wzmianek w wynikach indeksów.") +
      " Źródła wyszukiwania: " +
      (engines || "niedostępne") +
      ". Indeks nie stanowi pełnego KRZ/MSiG.",
    hits: uniq,
  };
}

async function checkExchanges(input: OwnerIntelligenceInput): Promise<{
  status: OwnerIntelligenceSubject["exchangesStatus"];
  note: string;
  hits: OwnerIntelligenceHit[];
}> {
  const name = input.name.trim();
  if (!name || name.length < 5)
    return { status: "unavailable", note: "Nie ustalono nazwy do wyszukiwania.", hits: [] };
  const searches = await Promise.allSettled(
    EXCHANGES.map(async (market) => {
      const query = `site:${market.domain} "${name.replace(/"/g, "")}"`;
      const results = await webSearch(query, { limit: 8, region: "pl-pl" });
      return results
        .filter((r) => {
          try {
            const u = new URL(r.url);
            const host = u.hostname.toLowerCase();
            if (!(host === market.domain || host.endsWith("." + market.domain))) return false;
            if (u.pathname === "/" || u.pathname.length < 3 || /\d{11}/.test(u.href)) return false;
            return normalize(`${r.title} ${r.snippet}`).includes(normalize(name));
          } catch {
            return false;
          }
        })
        .slice(0, 5)
        .map((r): OwnerIntelligenceHit => ({
          source: market.title,
          category: "debt_exchange",
          title: redactPesel(cap(r.title, 160)),
          detail: redactPesel(cap(r.snippet, 180)) || null,
          publicationDate: null,
          caseSignature: null,
          url: r.url,
          match: "name_only",
        }));
    }),
  );
  const hits = searches.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  const failed = searches.some((s) => s.status === "rejected");
  // Wyszukiwarka może być chwilowo blokowana: zerowa liczba rezultatów
  // nie dowodzi, że konkretny portal został skutecznie przeszukany.
  const allEmpty = hits.length === 0;
  const unique = [...new Map(hits.map((h) => [h.url, h])).values()].slice(0, maxItems);
  return {
    status: failed || allEmpty ? "partial" : "checked",
    note: "Wyszukiwanie publicznego indeksu stron: nie jest pełnym przeszukaniem giełd. Każde trafienie to niezweryfikowana publikacja, a nie potwierdzenie długu.",
    hits: unique,
  };
}

export async function checkOwnerPublicIntelligence(
  inputs: OwnerIntelligenceInput[],
): Promise<OwnerIntelligenceReport> {
  const checkedAt = new Date().toISOString();
  // Deduplikacja po nazwie; przy zbiegu klient wygrywa (rola), a brakujące
  // identyfikatory uzupełniamy z drugiego wpisu.
  const byKey = new Map<string, OwnerIntelligenceInput>();
  for (const o of inputs) {
    if (!o.name.trim()) continue;
    const key = `${o.kind}:${normalize(o.name)}`;
    const prev = byKey.get(key);
    byKey.set(
      key,
      prev
        ? {
            ...prev,
            ...o,
            pesel: o.pesel || prev.pesel,
            nip: o.nip || prev.nip,
            regon: o.regon || prev.regon,
            krs: o.krs || prev.krs,
            role: o.role === "client" || prev.role === "client" ? "client" : "owner",
          }
        : o,
    );
  }
  // Klient na początku — nie może wypaść poza limit podmiotów.
  const unique = [...byKey.values()]
    .sort((a, b) => Number(b.role === "client") - Number(a.role === "client"))
    .slice(0, maxItems);
  // Przetwarzamy WSZYSTKICH rozpoznanych właścicieli z działu II (do limitu
  // analizy 12), ale maksymalnie dwa jednoczesne zapytania do publicznego
  // interfejsu MSiG. Nie przekazujemy tam PESEL.
  const officialPromises = new Map<OwnerIntelligenceInput, ReturnType<typeof searchOfficialMsig>>();
  const lanes: Promise<unknown>[] = [Promise.resolve(), Promise.resolve()];
  unique.forEach((input, index) => {
    const lane = index % 2;
    const task = lanes[lane].then(() => searchOfficialMsig(input));
    officialPromises.set(input, task);
    lanes[lane] = task.catch(() => undefined);
  });

  const subjects = await Promise.all(
    unique.map(async (input): Promise<OwnerIntelligenceSubject> => {
      const officialTask = officialPromises.get(input);
      const [court, official, krz, indexed, exchanges] = await Promise.all([
        checkCourt(input),
        officialTask ?? searchOfficialMsig(input),
        // Lokalna kopia tablicy obwieszczeń KRZ (scripts/krz-tablica.ts):
        // NIP/KRS = identyfikator, nazwa = tylko do weryfikacji; zakres dat
        // ograniczony do pobranych dni, więc nie zastępuje pełnego KRZ.
        lookupKrzTable({ kind: input.kind, name: input.name, nip: input.nip, krs: input.krs }),
        checkIndexedCourt(input),
        checkExchanges(input),
      ]);
      return {
        name: cap(input.name, 160),
        kind: input.kind,
        role: input.role ?? "owner",
        // „checked" tylko z pełnego API KRZ/MSiG; samo wyszukiwanie w indeksie
        // stron lub w kopii KRZ to co najwyżej częściowe sprawdzenie.
        courtStatus: court.status === "checked" ? "checked" : "partial",
        // Najpierw oficjalny MSiG (źródło podstawowe), potem KRZ i pozostałe.
        courtNote: [official.note, krz.note, court.note, indexed.note].filter(Boolean).join(" | "),
        exchangesStatus: exchanges.status,
        exchangesNote: exchanges.note,
        hits: [
          ...court.hits,
          ...krz.hits,
          ...official.hits,
          ...indexed.hits,
          ...exchanges.hits,
        ].slice(0, maxItems),
      };
    }),
  );
  return {
    checkedAt,
    subjects,
    note: "Analiza otwartych źródeł. Zgodność samego imienia i nazwiska lub nazwy nie potwierdza tożsamości ani istnienia wymagalnego długu. Brak trafienia nie potwierdza braku zadłużenia.",
  };
}
