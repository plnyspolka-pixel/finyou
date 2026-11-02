// Oficjalna, publiczna wyszukiwarka MSiG (Ministerstwo Sprawiedliwości).
// Nie jest to publicznie wspierane API integracyjne; korzystamy wyłącznie
// z odczytu wyszukiwania widocznego w portalu, bez logowania i bez omijania ochrony.
// Źródło NIE obejmuje KRZ i nie dowodzi braku upadłości po 2021 r.
import type { OwnerIntelligenceHit, OwnerIntelligenceSourceStatus } from "./owner-intelligence.types";

export interface OfficialMsigInput {
  kind: "person" | "company";
  name: string;
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
    if (!matchedSignal) continue;
    const n = normalize(entityName);
    const expected = normalize(input.name);
    const krsMatch = input.krs && digits((raw as any).krs) === input.krs;
    const nipMatch = input.nip && digits((raw as any).nip) === input.nip;
    // KRS/NIP nie występują w większości pozycji listy: dopasowanie
    // z wyniku zapytania po identyfikatorze jest nadal tylko kandydatem.
    if (!krsMatch && !nipMatch && !n.includes(expected) && !expected.includes(n)) {
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
    found.push({
      category:"court_notice",
      source:"MSiG — Ministerstwo Sprawiedliwości",
      title:matchedSignal.title,
      detail:(entityName + " · Monitor " + monitorNumber + " (ogłoszenie historyczne lub aktualne — wymaga sprawdzenia)").slice(0,250),
      publicationDate:publication,
      caseSignature:r.signatureOfCase ? String(r.signatureOfCase).slice(0,100) : null,
      url:OFFICIAL_MSIG_HOME,
      match:"name_only",
    });
    if (found.length >= 8) break;
  }
  return found;
}

/**
 * Jedna publiczna kwerenda na podmiot prawny. Brak dostępu, pusty wynik,
 * odchylenie schematu oraz HTTP 429 są raportowane jako brak potwierdzenia
 * i nigdy nie stanowią dowodu braku wpisów.
 */
export async function searchOfficialMsig(input: OfficialMsigInput): Promise<OfficialMsigResult> {
  if (input.kind !== "company") return {
    status:"partial",note:"Wyszukiwarka oficjalnego MSiG: kwerenda osoby fizycznej niezweryfikowana; nie wykonano.",hits:[],
  };
  const krs = /^\d{10}$/.test(input.krs ?? "") ? input.krs! : "";
  const nip = /^\d{10}$/.test(input.nip ?? "") ? input.nip! : "";
  const name = (input.name ?? "").trim().slice(0,160);
  if (!krs && !nip && name.length < 5) return {
    status:"unavailable",note:"Brak KRS, NIP lub wystarczającej nazwy do MSiG.",hits:[],
  };
  const now = new Date();
  const end = now.toISOString().slice(0,10);
  const url = new URL(OFFICIAL_MSIG_ENDPOINT);
  const params = {
    entityName:krs || nip ? "" : name,
    krs,nip:krs?"":nip,
    textInPosition:"",textInBody:"",
    signatureType:"A",signatureOfCase:"",signatureKRS:"",court:"",
    from:"2001-01-01",to:end,page:"1",
  };
  for (const [key,val] of Object.entries(params)) url.searchParams.set(key,val);
  try {
    const response = await fetch(url.toString(),{
      headers:{Accept:"application/json","Accept-Language":"pl-PL,pl;q=0.9"},
      signal:AbortSignal.timeout(12_000),
    });
    if (!response.ok) return {
      status:"unavailable",
      note:"Oficjalna wyszukiwarka MSiG HTTP "+response.status+" — nie oznacza to braku wpisów.",hits:[],
    };
    const data = await response.json() as {list?:unknown;page?:number};
    if (!data || !Array.isArray(data.list)) return {
      status:"unavailable",note:"Nieznany format odpowiedzi MSiG; pominięto.",hits:[],
    };
    const hits = classifyOfficialMsigRows(input,data.list);
    return {
      // Pierwsza strona / nieudokumentowany interfejs / brak wglądu w KRZ:
      // zawsze częściowa kontrola ryzyka, nawet przy pustych wynikach.
      status:"partial",
      note:"Oficjalny MSiG (1. strona od 2001 r.): "+
        (hits.length ? "znaleziono wzmianki wymagające weryfikacji." : "brak rozpoznanych wzmianek w pobranym zakresie.")+
        " Baza KRZ NIE została w ten sposób sprawdzona; zwykłe wpisy KRS pominięto.",
      hits,
    };
  } catch {
    return {status:"unavailable",note:"Oficjalna wyszukiwarka MSiG niedostępna — nie oznacza to braku wpisów.",hits:[]};
  }
}
