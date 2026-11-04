// Oficjalna, publiczna wyszukiwarka MSiG (Ministerstwo Sprawiedliwości).
// Nie jest to publicznie wspierane API integracyjne; korzystamy wyłącznie
// z odczytu wyszukiwania widocznego w portalu, bez logowania i bez omijania ochrony.
// Źródło NIE obejmuje KRZ i nie dowodzi braku upadłości po 2021 r.
import type { OwnerIntelligenceHit, OwnerIntelligenceSourceStatus } from "./owner-intelligence.types";
import { registryGet } from "@/lib/registry-fetch.server";

export interface OfficialMsigInput {
  kind: "person" | "company";
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  krs?: string | null;
  nip?: string | null;
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

/**
 * Lista ogłoszeń MSiG zawiera również zwykłe wpisy KRS — pokazujemy tylko
 * sygnały wymagające analizy prawnej, a nie każdą aktualizację rejestrową.
 * Status ogłoszenia może być historyczny, identyfikatory w liście nie zawsze
 * są ujawniane. Samo trafienie jest więc name_only.
 */
export function classifyOfficialMsigRows(input: OfficialMsigInput, rows: unknown): OwnerIntelligenceHit[] {
  if (!Array.isArray(rows)) return [];
  const found: OwnerIntelligenceHit[] = [];
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
    found.push({
      category:"court_notice",
      source:"MSiG — Ministerstwo Sprawiedliwości",
      title,
      detail:(entityName + " · Monitor " + monitorNumber + " (ogłoszenie historyczne lub aktualne — wymaga sprawdzenia)").replace(/\b\d{11}\b/g,"[PESEL ukryty]").slice(0,250),
      publicationDate:publication,
      caseSignature:signature || null,
      url:OFFICIAL_MSIG_HOME,
      match:"name_only",
    });
    if (found.length >= 8) break;
  }
  return found;
}

/**
 * Jedna publiczna kwerenda na spółkę lub osobę fizyczną. Brak dostępu, pusty wynik,
 * odchylenie schematu oraz HTTP 429 są raportowane jako brak potwierdzenia
 * i nigdy nie stanowią dowodu braku wpisów.
 */
export async function searchOfficialMsig(input: OfficialMsigInput): Promise<OfficialMsigResult> {
  // PESEL nie jest parametrem publicznej wyszukiwarki MSiG.
  // Nie umieszczamy go w URL ani nie szukamy po nim w treści ogłoszeń.
  const krs = /^\d{10}$/.test(input.krs ?? "") ? input.krs! : "";
  const nip = /^\d{10}$/.test(input.nip ?? "") ? input.nip! : "";
  const name = officialMsigPersonQuery(input).slice(0,160);
  if (!krs && !nip && name.length < 5) return {
    status:"unavailable",note:"Brak KRS, NIP lub wystarczającej nazwy do MSiG.",hits:[],
  };
  const now = new Date();
  const end = now.toISOString().slice(0,10);
  const url = new URL(OFFICIAL_MSIG_ENDPOINT);
  const params = {
    // Dla osoby fizycznej preferujemy „Nazwisko Imię”. W wyszukiwaniu
    // spółki KRS/NIP działa jako stabilniejszy identyfikator.
    entityName:krs || nip ? "" : name,
    krs,nip:krs?"":nip,
    textInPosition:"",textInBody:"",
    signatureType:"A",signatureOfCase:"",signatureKRS:"",court:"",
    from:"2001-01-01",to:end,page:"1",
  };
  for (const [key,val] of Object.entries(params)) url.searchParams.set(key,val);
  // registryGet: najpierw bezpośrednio, a przy blokadzie sieci Cloudflare
  // (403/429/5xx, błąd sieci) — przez registry-proxy w sieci Supabase.
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await registryGet(url.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Language": "pl-PL,pl;q=0.9",
        // Jawna identyfikacja klienta (jak przy OSM/blogu) — bez podszywania się.
        "User-Agent": OFFICIAL_MSIG_USER_AGENT,
      },
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
    const hits = classifyOfficialMsigRows(input,data.list);
    return {
      // Pierwsza strona / nieudokumentowany interfejs / brak wglądu w KRZ:
      // zawsze częściowa kontrola ryzyka, nawet przy pustych wynikach.
      status:"partial",
      note:"Oficjalny MSiG (1. strona od 2001 r.; osoby: wyszukiwanie nazwisko–imię): "+
        (hits.length ? "znaleziono wzmianki wymagające weryfikacji." : "brak rozpoznanych wzmianek w pobranym zakresie.")+
        " Baza KRZ NIE została w ten sposób sprawdzona; zwykłe wpisy KRS pominięto.",
      hits,
    };
  }
  return {
    status:"unavailable",
    note:`Oficjalna wyszukiwarka MSiG nie odpowiedziała (${lastError || "błąd sieci"}, 2 próby) — nie oznacza to braku wpisów.`,
    hits:[],
  };
}
