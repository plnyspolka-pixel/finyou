// Oficjalna, publiczna wyszukiwarka MSiG (Ministerstwo Sprawiedliwości).
// Nie jest to publicznie wspierane API integracyjne; korzystamy wyłącznie
// z odczytu wyszukiwania widocznego w portalu, bez logowania i bez omijania ochrony.
// Źródło NIE obejmuje KRZ i nie dowodzi braku upadłości po 2021 r.
//
// Zawężanie trafień: lista wyników zawiera tylko nazwę, więc dla kandydatów
// pobieramy treść pozycji (/api/Monitor/Detalis). PESEL / NIP / KRS z treści
// porównujemy LOKALNIE z identyfikatorem podmiotu — PESEL nie trafia do MS.
// Zgodny identyfikator → `identifier` + pogłębiony raport postępowania;
// inny identyfikator → imiennik, odrzucony.
import type { OwnerIntelligenceHit, OwnerIntelligenceSourceStatus } from "./owner-intelligence.types";
import { registryGet } from "@/lib/registry-fetch.server";
import {
  OFFICIAL_MSIG_DETAIL_ENDPOINT,
  buildProceedingReport,
  courtKey,
  groupIntoProceedings,
  isInsolvencyNotice,
  officialMsigPdfUrl,
  parseMsigDetail,
  proceedingStatusLabel,
  redactPesel,
  verifyIdentity,
  type MsigNoticeDetail,
} from "./official-msig-detail";

export interface OfficialMsigInput {
  kind: "person" | "company";
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  krs?: string | null;
  nip?: string | null;
  /** Wyłącznie do lokalnego porównania z treścią ogłoszenia — nigdy nie jest wysyłany. */
  pesel?: string | null;
}

export interface OfficialMsigResult {
  status: OwnerIntelligenceSourceStatus;
  note: string;
  hits: OwnerIntelligenceHit[];
}

export interface OfficialMsigRow {
  id: number;
  monitorNumber: string;
  dateOfPublication: string;
  entityName: string;
  signatureOfCase: string | null;
}

export const OFFICIAL_MSIG_ENDPOINT = "https://wyszukiwarka-msig.ms.gov.pl/api/Monitor/Search";
export const OFFICIAL_MSIG_HOME = "https://wyszukiwarka-msig.ms.gov.pl/";
export const OFFICIAL_MSIG_USER_AGENT = "FinanceYou-KYC/1.0 (+https://financeyou.pl)";

const PL_CHARS: Record<string,string>={ą:"a",ć:"c",ę:"e",ł:"l",ń:"n",ó:"o",ś:"s",ź:"z",ż:"z"};
function normalize(value: string): string {
  return value.toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => PL_CHARS[c] ?? c)
    .replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
}

const signals = [
  { pattern: /\bw\s+likwidacji\b/i, title: "Ogłoszenie MSiG — podmiot w likwidacji" },
  { pattern: /\bw\s+upad[łl]o[śs]ci\b/i, title: "Ogłoszenie MSiG — podmiot w upadłości" },
  { pattern: /\brestrukturyzacj|post[ęe]powani.{0,30}uk[łl]adow|sanacyjn/i, title: "Ogłoszenie MSiG — wzmianka o restrukturyzacji" },
] as const;
const digits = (s: unknown) => String(s ?? "").replace(/\D/g,"");

export function officialMsigPersonQuery(input: OfficialMsigInput): string {
  if (input.kind !== "person") return input.name.trim();
  const f = input.firstName?.trim();
  const l = input.lastName?.trim();
  if (f && l) return `${l} ${f}`.slice(0,160);
  const pieces = input.name.trim().split(/\s+/);
  if (pieces.length < 2) return "";
  // Fallback: zazwyczaj KW udostępnia imię i nazwisko osobno. Jeśli brak
  // rozdzielenia, ostatni człon przyjmujemy za nazwisko tylko na potrzeby
  // wyszukiwania; wynik pozostaje wyłącznie name_only.
  return `${pieces.at(-1)} ${pieces.slice(0,-1).join(" ")}`.slice(0,160);
}

const PERSONAL_COURT_SIGNATURE = /\b(?:[IVX]{1,5}|[A-Z]{1,4}\d?)\s+(?:GUp|GU|GRp|GRz|GR)\b/i;

function isSamePersonName(expected: string, actual: string): boolean {
  const a=normalize(expected), b=normalize(actual);
  if (!a || !b) return false;
  return b === a || b.startsWith(a+" ") || b.endsWith(" "+a);
}


export interface OfficialMsigCandidate {
  id: number;
  hit: OwnerIntelligenceHit;
}

/**
 * Lista ogłoszeń MSiG zawiera również zwykłe wpisy KRS — pokazujemy tylko
 * sygnały wymagające analizy prawnej, a nie każdą aktualizację rejestrową.
 * Status ogłoszenia może być historyczny, identyfikatory w liście nie zawsze
 * są ujawniane. Samo trafienie z listy jest więc name_only — dopiero treść
 * pozycji (assembleOfficialMsigHits) może je potwierdzić albo odrzucić.
 */
export function selectOfficialMsigCandidates(input: OfficialMsigInput, rows: unknown, limit = 8): OfficialMsigCandidate[] {
  if (!Array.isArray(rows)) return [];
  const found: OfficialMsigCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of rows.slice(0,100)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Partial<OfficialMsigRow>;
    const entityName = String(r.entityName ?? "").replace(/\s+/g," ").trim();
    const matchedSignal = signals.find((s) => s.pattern.test(entityName));
    const n = normalize(entityName);
    const expected = normalize(input.name);
    const personQuery = officialMsigPersonQuery(input);
    const signature = String(r.signatureOfCase ?? "").slice(0,100);
    // Dla osób fizycznych imię/nazwisko występują w kolejności
    // nazwisko–imię; lista MSiG często nie zawiera słowa „upadłość”.
    const matchedPerson = input.kind === "person" &&
      (isSamePersonName(personQuery,entityName) || isSamePersonName(input.name,entityName));
    if (!matchedSignal && !matchedPerson) continue;
    const krsMatch = input.krs && digits((raw as any).krs) === input.krs;
    const nipMatch = input.nip && digits((raw as any).nip) === input.nip;
    // KRS/NIP nie występują w większości pozycji listy: dopasowanie
    // z wyniku zapytania po identyfikatorze jest nadal tylko kandydatem.
    if (!matchedPerson && !krsMatch && !nipMatch && !n.includes(expected) && !expected.includes(n)) {
      // Skróty z KW (np. sp. z o.o.) różnią się od pełnej nazwy MSiG.
      // Nie odrzucamy jednak odpowiedzi po konkretnym numerze KRS/NIP.
      if (!/^\d{10}$/.test(input.krs ?? "") && !/^\d{10}$/.test(input.nip ?? "")) continue;
    }
    const id = Number(r.id);
    const monitorNumber = String(r.monitorNumber ?? "").slice(0,40);
    const publication = String(r.dateOfPublication ?? "").slice(0,10);
    if (!Number.isInteger(id) || id <= 0 || !monitorNumber || !/^\d{4}-\d\d-\d\d$/.test(publication)) continue;
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    const title = matchedSignal?.title ??
      (PERSONAL_COURT_SIGNATURE.test(signature)
        ? "Ogłoszenie MSiG — sprawa sądowa osoby fizycznej"
        : "Ogłoszenie MSiG — osoba fizyczna, rodzaj sprawy nieustalony");
    found.push({ id, hit: {
      category:"court_notice",
      source:"MSiG — Ministerstwo Sprawiedliwości",
      title,
      detail:redactPesel(entityName + " · Monitor " + monitorNumber + " (ogłoszenie historyczne lub aktualne — wymaga sprawdzenia)").slice(0,250),
      publicationDate:publication,
      caseSignature:signature || null,
      url:OFFICIAL_MSIG_HOME,
      match:"name_only",
    }});
    if (found.length >= limit) break;
  }
  return found;
}

/** Kandydaci z samej listy (bez treści pozycji) — zawsze name_only. */
export function classifyOfficialMsigRows(input: OfficialMsigInput, rows: unknown): OwnerIntelligenceHit[] {
  return selectOfficialMsigCandidates(input, rows).map((c) => c.hit);
}

export interface OfficialMsigAssembly {
  hits: OwnerIntelligenceHit[];
  /** Ogłoszenia z innym PESEL/NIP/KRS — imiennicy. */
  rejected: number;
  /** Ogłoszenia niezwiązane z niewypłacalnością (spadki, zasiedzenie…). */
  neutral: number;
  /** Sprawy potwierdzone identyfikatorem. */
  confirmedCases: number;
  /** Pobrane treści pozycji. */
  verified: number;
  /** Kandydaci bez pobranej treści. */
  unverified: number;
}

const MAX_HITS = 8;

const isOpeningOnly = (d: MsigNoticeDetail) => d.signatures.length > 0 && d.signatures.every((x) => / GU \d/.test(x));

/**
 * Łączenie postanowienia „GU” z dalszymi ogłoszeniami „GUp”: ten sam sąd,
 * ten sam podmiot po nazwie, obie pozycje upadłościowe, odstęp ≤ 2 lata.
 */
export function officialMsigCourtMerge(input: OfficialMsigInput) {
  const q = officialMsigPersonQuery(input);
  const same = (d: MsigNoticeDetail) =>
    input.kind !== "person" || isSamePersonName(q, d.entityName) || isSamePersonName(input.name, d.entityName);
  return (a: MsigNoticeDetail, b: MsigNoticeDetail) => {
    if (!a.court || courtKey(a.court) !== courtKey(b.court)) return false;
    if (!same(a) || !same(b) || !isInsolvencyNotice(a) || !isInsolvencyNotice(b)) return false;
    if (isOpeningOnly(a) === isOpeningOnly(b)) return false;
    const [open, next] = isOpeningOnly(a) ? [a, b] : [b, a];
    const days = (Date.parse(next.publicationDate) - Date.parse(open.publicationDate)) / 864e5;
    return days >= 0 && days <= 731;
  };
}
const caseSig = (g: MsigNoticeDetail[]) => [...new Set(g.flatMap((d) => d.signatures))].join(", ") || null;

/**
 * Łączy kandydatów z listy z treścią pozycji: weryfikuje tożsamość, grupuje
 * ogłoszenia w sprawy (sąd + wspólna sygnatura) i dla spraw potwierdzonych
 * identyfikatorem buduje pogłębiony raport. Czysta funkcja (testowalna).
 */
export function assembleOfficialMsigHits(
  input: OfficialMsigInput,
  candidates: OfficialMsigCandidate[],
  details: Map<number, MsigNoticeDetail | null>,
  opts: { incomplete?: boolean; today?: string } = {},
): OfficialMsigAssembly {
  const fetched = [...details.values()].filter((d): d is MsigNoticeDetail => Boolean(d));
  const verdicts = new Map(fetched.map((d) => [d.id, verifyIdentity(input, d)] as const));
  const hits: OwnerIntelligenceHit[] = [];
  let rejected = 0, neutral = 0, confirmedCases = 0;
  const unverifiedCandidates = candidates.filter((c) => !details.get(c.id));

  for (const group of groupIntoProceedings(fetched, { mergeByCourt: officialMsigCourtMerge(input) })) {
    const confirmed = group.filter((d) => verdicts.get(d.id)?.verdict === "confirmed");
    const contradicted = group.filter((d) => verdicts.get(d.id)?.verdict === "contradicted");
    const insolvency = group.some(isInsolvencyNotice);
    if (confirmed.length === 0 && contradicted.length > 0) { rejected += group.length; continue; }
    if (!insolvency) { neutral += group.length; continue; }
    // Przy potwierdzeniu pomijamy pojedyncze pozycje z cudzym identyfikatorem
    // (np. współdłużnik w tej samej sprawie).
    const notices = confirmed.length ? group.filter((d) => !contradicted.includes(d)) : group;
    rejected += confirmed.length ? contradicted.length : 0;
    const opening = notices[0];
    if (confirmed.length) {
      confirmedCases += 1;
      const proceeding = buildProceedingReport(notices, {
        identityBasis: verdicts.get(confirmed[0].id)?.basis ?? "identyfikator zgodny",
        incomplete: Boolean(opts.incomplete),
        today: opts.today,
      });
      hits.push({
        category: "court_notice",
        source: "MSiG — Ministerstwo Sprawiedliwości",
        title: `MSiG — ${proceeding.kind} (${proceedingStatusLabel[proceeding.status]})`,
        detail: redactPesel(
          [
            proceeding.court,
            `${proceeding.noticesCount} ogł. ${proceeding.firstPublication} – ${proceeding.lastPublication}`,
            proceeding.identityBasis,
            proceeding.statusNote,
          ].filter(Boolean).join(" · "),
        ).slice(0, 400),
        publicationDate: proceeding.firstPublication,
        caseSignature: proceeding.signatures.join(", ") || null,
        url: officialMsigPdfUrl(opening.id),
        match: "identifier",
        proceeding,
      });
    } else {
      const last = notices[notices.length - 1];
      const why = input.kind === "person" && !input.pesel
        ? "brak PESEL podmiotu do porównania"
        : "treść ogłoszenia nie zawiera PESEL/NIP/KRS";
      hits.push({
        category: "court_notice",
        source: "MSiG — Ministerstwo Sprawiedliwości",
        title: `Ogłoszenie MSiG — ${opening.chapter ?? "sprawa o niewypłacalność"}`,
        detail: redactPesel(
          `${opening.entityName} · ${opening.court ?? "sąd nieustalony"} · ${notices.length} ogł., ostatnie ${last.publicationDate}` +
            `${last.chapter ? ` (${last.chapter})` : ""} · tożsamość niepotwierdzona: ${why}`,
        ).slice(0, 400),
        publicationDate: opening.publicationDate,
        caseSignature: caseSig(notices),
        url: officialMsigPdfUrl(opening.id),
        match: "name_only",
      });
    }
  }
  // Potwierdzone sprawy na początku, potem niepotwierdzone, na końcu
  // kandydaci bez pobranej treści (jak dotąd — tylko nazwa).
  hits.sort((a, b) => Number(b.match === "identifier") - Number(a.match === "identifier"));
  hits.push(...unverifiedCandidates.map((c) => c.hit));
  return {
    hits: hits.slice(0, MAX_HITS),
    rejected, neutral, confirmedCases,
    verified: fetched.length,
    unverified: unverifiedCandidates.length,
  };
}

const MSIG_HEADERS = {
  Accept: "application/json",
  "Accept-Language": "pl-PL,pl;q=0.9",
  // Jawna identyfikacja klienta (jak przy OSM/blogu) — bez podszywania się.
  "User-Agent": OFFICIAL_MSIG_USER_AGENT,
};

/** Limit zapytań o treść pozycji na podmiot (kandydaci + oś czasu spraw potwierdzonych). */
const MAX_DETAIL_REQUESTS = 15;
const MAX_TIMELINE_REQUESTS = 10;
const MAX_DEEP_CASES = 2;
const DETAIL_DEADLINE_MS = 60_000;

async function fetchMsigDetail(id: number): Promise<MsigNoticeDetail | null> {
  const url = new URL(OFFICIAL_MSIG_DETAIL_ENDPOINT);
  url.searchParams.set("id", String(id));
  const res = await registryGet(url.toString(), { headers: MSIG_HEADERS, timeoutMs: 15_000, prefer: "direct" }).catch(() => null);
  if (!res?.ok) return null;
  try { return parseMsigDetail(JSON.parse(res.text)); } catch { return null; }
}

function searchUrl(params: { entityName?: string; krs?: string; nip?: string; signatureOfCase?: string }): string {
  const url = new URL(OFFICIAL_MSIG_ENDPOINT);
  const all = {
    entityName: params.entityName ?? "",
    krs: params.krs ?? "", nip: params.nip ?? "",
    textInPosition:"",textInBody:"",
    signatureType:"A",signatureOfCase:params.signatureOfCase ?? "",signatureKRS:"",court:"",
    from:"2001-01-01",to:new Date().toISOString().slice(0,10),page:"1",
  };
  for (const [key,val] of Object.entries(all)) url.searchParams.set(key,val);
  return url.toString();
}

/** Preferowana sygnatura do szukania dalszych ogłoszeń sprawy (GUp/GRp — etap po otwarciu). */
function preferredSignature(group: MsigNoticeDetail[]): string | null {
  const all = [...new Set(group.flatMap((d) => d.signatures))];
  return all.find((s) => /\bG(UP|RP|UPN|RS)\b/.test(s)) ?? all[0] ?? null;
}

/**
 * Pobiera treść pozycji dla kandydatów, a dla spraw potwierdzonych
 * identyfikatorem — dalsze ogłoszenia tej samej sygnatury (oś czasu).
 */
async function verifyCandidates(
  input: OfficialMsigInput,
  candidates: OfficialMsigCandidate[],
): Promise<OfficialMsigAssembly> {
  const deadline = Date.now() + DETAIL_DEADLINE_MS;
  const details = new Map<number, MsigNoticeDetail | null>();
  let incomplete = false;
  const load = async (ids: number[], budget: number) => {
    for (const id of ids) {
      if (details.has(id)) continue;
      if (budget <= 0 || Date.now() > deadline) { incomplete = true; break; }
      budget -= 1;
      details.set(id, await fetchMsigDetail(id));
      if (details.get(id) === null) incomplete = true;
    }
  };
  await load(candidates.map((c) => c.id), MAX_DETAIL_REQUESTS);

  const fetched = () => [...details.values()].filter((d): d is MsigNoticeDetail => Boolean(d));
  const confirmedGroups = groupIntoProceedings(fetched(), { mergeByCourt: officialMsigCourtMerge(input) })
    .filter((g) => g.some((d) => verifyIdentity(input, d).verdict === "confirmed") && g.some(isInsolvencyNotice))
    .slice(0, MAX_DEEP_CASES);
  const allCandidates = [...candidates];
  let timelineBudget = MAX_TIMELINE_REQUESTS;
  for (const group of confirmedGroups) {
    const sig = preferredSignature(group);
    if (!sig || Date.now() > deadline) continue;
    const res = await registryGet(searchUrl({ signatureOfCase: sig }), { headers: MSIG_HEADERS, timeoutMs: 20_000, prefer: "direct" }).catch(() => null);
    let rows: unknown = null;
    try { rows = res?.ok ? JSON.parse(res.text)?.list : null; } catch { rows = null; }
    if (!Array.isArray(rows)) { incomplete = true; continue; }
    // Ta sama sygnatura bywa w innych sądach — filtr nazwy, a potem sąd w treści.
    const more = selectOfficialMsigCandidates(input, rows, 30).filter((c) => !details.has(c.id));
    allCandidates.push(...more.filter((c) => !allCandidates.some((x) => x.id === c.id)));
    const before = details.size;
    await load(more.map((c) => c.id), timelineBudget);
    timelineBudget -= details.size - before;
  }
  // Kandydaci z wyszukiwania po sygnaturze, którzy po pobraniu treści nie
  // należą do żadnej sprawy z pierwszej listy, i tak przejdą weryfikację.
  return assembleOfficialMsigHits(input, allCandidates.filter((c) => details.has(c.id) || candidates.includes(c)), details, { incomplete });
}

/**
 * Jedna publiczna kwerenda na spółkę lub osobę fizyczną (+ treść pozycji
 * kandydatów). Brak dostępu, pusty wynik, odchylenie schematu oraz HTTP 429
 * są raportowane jako brak potwierdzenia i nigdy nie stanowią dowodu braku wpisów.
 */
export async function searchOfficialMsig(input: OfficialMsigInput): Promise<OfficialMsigResult> {
  // PESEL nie jest parametrem publicznej wyszukiwarki MSiG.
  // Nie umieszczamy go w URL ani w treści zapytań — porównujemy go lokalnie.
  const krs = /^\d{10}$/.test(input.krs ?? "") ? input.krs! : "";
  const nip = /^\d{10}$/.test(input.nip ?? "") ? input.nip! : "";
  const name = officialMsigPersonQuery(input).slice(0,160);
  if (!krs && !nip && name.length < 5) return {
    status:"unavailable",note:"Brak KRS, NIP lub wystarczającej nazwy do MSiG.",hits:[],
  };
  // Dla osoby fizycznej preferujemy „Nazwisko Imię”. W wyszukiwaniu
  // spółki KRS/NIP działa jako stabilniejszy identyfikator.
  const url = searchUrl({ entityName: krs || nip ? "" : name, krs, nip: krs ? "" : nip });
  // registryGet: najpierw bezpośrednio, a przy blokadzie sieci Cloudflare
  // (403/429/5xx, błąd sieci) — przez registry-proxy w sieci Supabase.
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await registryGet(url, {
      headers: MSIG_HEADERS,
      timeoutMs: 20_000,
      prefer: "direct",
    }).catch((e: unknown) => {
      lastError = e instanceof Error ? `${e.name}: ${e.message}` : "błąd sieci";
      return null;
    });
    if (!response || response.status === 0) {
      lastError ||= "brak odpowiedzi";
      continue;
    }
    if (!response.ok) return {
      status:"unavailable",
      note:"Oficjalna wyszukiwarka MSiG HTTP "+response.status+(response.viaProxy ? " (przez registry-proxy)" : "")+" — nie oznacza to braku wpisów.",hits:[],
    };
    const body = response.text;
    let data: {list?:unknown;page?:number} | null = null;
    try { data = JSON.parse(body); } catch { data = null; }
    if (!data || !Array.isArray(data.list)) {
      const type = response.viaProxy ? "przez registry-proxy" : "bezpośrednio";
      const blocked = /incapsula|access denied|captcha|<html/i.test(body.slice(0, 2000));
      return {
        status:"unavailable",
        note:`Oficjalna wyszukiwarka MSiG zwróciła ${blocked ? "stronę HTML zamiast danych (prawdopodobnie filtr ruchu portalu)" : "nieznany format odpowiedzi"} — HTTP ${response.status}, ${type}. Nie oznacza to braku wpisów.`,
        hits:[],
      };
    }
    const candidates = selectOfficialMsigCandidates(input, data.list, MAX_DETAIL_REQUESTS);
    const a = candidates.length
      ? await verifyCandidates(input, candidates)
      : { hits: [], rejected: 0, neutral: 0, confirmedCases: 0, verified: 0, unverified: 0 };
    const hasPesel = input.kind === "person" && Boolean(input.pesel);
    const verification = candidates.length
      ? ` Sprawdzono treść ${a.verified} ogłoszeń` +
        (a.confirmedCases ? `: ${a.confirmedCases} spraw(y) potwierdzone ${hasPesel ? "PESEL-em" : "identyfikatorem"} — pogłębiony raport poniżej` : "") +
        (a.rejected ? `; odrzucono ${a.rejected} ogł. imienników (inny identyfikator)` : "") +
        (a.neutral ? `; pominięto ${a.neutral} ogł. niezwiązanych z niewypłacalnością (np. spadki, zasiedzenie)` : "") +
        (a.unverified ? `; ${a.unverified} bez pobranej treści (tylko nazwa)` : "") +
        (input.kind === "person" && !hasPesel ? "; brak PESEL podmiotu — nie można potwierdzić tożsamości" : "") +
        "."
      : "";
    return {
      // Pierwsza strona / nieudokumentowany interfejs / brak wglądu w KRZ:
      // zawsze częściowa kontrola ryzyka, nawet przy pustych wynikach.
      status:"partial",
      note:"Oficjalny MSiG (1. strona od 2001 r.; osoby: wyszukiwanie nazwisko–imię): "+
        (a.hits.length ? "znaleziono wzmianki wymagające weryfikacji." : "brak rozpoznanych wzmianek w pobranym zakresie.")+
        verification+
        " Baza KRZ NIE została w ten sposób sprawdzona; zwykłe wpisy KRS pominięto.",
      hits:a.hits,
    };
  }
  return {
    status:"unavailable",
    note:`Oficjalna wyszukiwarka MSiG nie odpowiedziała (${lastError || "błąd sieci"}, 2 próby) — nie oznacza to braku wpisów.`,
    hits:[],
  };
}
