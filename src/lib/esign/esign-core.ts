// Podpis dokumentowy Finance You — logika czysta (bez I/O), wspólna dla
// serwera, UI i generatora PDF. Testowana jednostkowo.
//
// Podstawa prawna: art. 77(2) KC (forma dokumentowa — oświadczenie woli
// w postaci dokumentu złożone w sposób umożliwiający ustalenie osoby
// składającej oświadczenie), art. 77(3) KC (dokument = nośnik informacji
// umożliwiający zapoznanie się z jej treścią), art. 3 pkt 10 i art. 25 ust. 1
// rozporządzenia eIDAS (podpis elektroniczny; zakaz odmowy skutku prawnego
// wyłącznie z powodu postaci elektronicznej).

export type EnvelopeStatus =
  | "szkic"
  | "wyslana"
  | "zakonczona"
  | "odrzucona"
  | "anulowana"
  | "wygasla";

export type SignerStatus =
  | "oczekuje"
  | "otwarty"
  | "weryfikacja"
  | "zweryfikowany"
  | "niezgodnosc"
  | "podpisany"
  | "odrzucony";

export type SignerKind = "zewnetrzny" | "inwestor" | "personel";
export type CapacityMode = "osoba" | "firma" | "wybor";
export type SigningMode = "rownolegle" | "kolejno";
export type OtpChannel = "sms" | "email";

/** JSON serializowalny przez server functions (bez `unknown`). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** Podmiot, w imieniu którego składany jest podpis. */
export interface SignerCompany {
  name: string;
  nip?: string | null;
  krs?: string | null;
  regon?: string | null;
  legalForm?: string | null;
  address?: string | null;
  /** Funkcja reprezentanta (np. „Prezes Zarządu”, „wspólnik”, „pełnomocnik”). */
  role?: string | null;
}

/** Snapshot „w czyim imieniu” utrwalany w chwili podpisu. */
export interface SignedCapacity {
  mode: "osoba" | "firma";
  company: SignerCompany | null;
}

/** Dane tożsamości potwierdzone przez Didit, utrwalane przy podpisie. */
export interface IdentitySnapshot {
  provider: "didit";
  sessionId: string;
  /** 'esign' — sesja założona dla tego podpisu; 'pipeline' — KYC inwestora z pipeline'u. */
  source: "esign" | "pipeline";
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  documentType: string | null;
  /** Numer dokumentu zamaskowany (ostatnie 4 znaki) — pełny nie opuszcza Didit. */
  documentNumberMasked: string | null;
  dateOfBirth: string | null;
  issuingCountry: string | null;
  /** Lista użytych kroków workflow, np. ["dokument", "liveness", "porównanie twarzy"]. */
  checks: string[];
  decidedAt: string | null;
  /** Czy nazwisko z dokumentu zgadza się z nazwiskiem wskazanym przez nadawcę. */
  nameMatch: boolean;
}

export const STATEMENT_KEYS = [
  "zapoznanie",
  "forma_dokumentowa",
  "tozsamosc",
  "umocowanie",
] as const;
export type StatementKey = (typeof STATEMENT_KEYS)[number];

/** Oświadczenia składane przed podpisem (checkboxy startują PUSTE). */
export const STATEMENTS: Record<StatementKey, string> = {
  zapoznanie:
    "Zapoznałem(-am) się z całą treścią dokumentu i rozumiem, że klikając „Podpisuję” składam oświadczenie woli o treści tego dokumentu.",
  forma_dokumentowa:
    "Wyrażam zgodę na złożenie oświadczenia woli w formie dokumentowej (art. 77² Kodeksu cywilnego) z użyciem podpisu elektronicznego oraz na doręczenie podpisanego dokumentu na podany adres e-mail (trwały nośnik).",
  tozsamosc:
    "Potwierdzam, że dane z weryfikacji tożsamości (dokument tożsamości i zdjęcie twarzy) są moimi danymi i że podpisuję osobiście — nikt nie działa w moim imieniu bez umocowania.",
  umocowanie:
    "Oświadczam, że jestem umocowany(-a) do reprezentowania wskazanego podmiotu w zakresie objętym dokumentem i działam w granicach tego umocowania.",
};

/** Oświadczenia wymagane dla danego trybu reprezentacji. */
export function requiredStatements(capacity: SignedCapacity | null): StatementKey[] {
  const base: StatementKey[] = ["zapoznanie", "forma_dokumentowa", "tozsamosc"];
  return capacity?.mode === "firma" ? [...base, "umocowanie"] : base;
}

export function missingStatements(
  statements: Record<string, boolean> | null | undefined,
  capacity: SignedCapacity | null,
): StatementKey[] {
  return requiredStatements(capacity).filter((k) => statements?.[k] !== true);
}

// ── Normalizacja i dopasowanie nazwisk ─────────────────────────────────────

/** Bez diakrytyków, małe litery, tylko litery/cyfry/spacje. */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Czy nazwisko wskazane przez nadawcę zgadza się z danymi z dokumentu
 * tożsamości. Tolerujemy drugie imiona i kolejność (nazwisko-imię), wymagamy
 * natomiast, żeby KAŻDY człon podany przez nadawcę (≥ 2 znaki) znalazł się w
 * danych z dokumentu. Dwuczłonowe nazwiska z łącznikiem traktujemy jak dwa
 * człony.
 */
export function namesMatch(
  expected: string | null | undefined,
  verified: string | null | undefined,
): boolean {
  const exp = normalizeName(expected)
    .split(" ")
    .filter((t) => t.length >= 2);
  const ver = new Set(normalizeName(verified).split(" ").filter(Boolean));
  if (exp.length === 0 || ver.size === 0) return false;
  return exp.every((t) => ver.has(t));
}

// ── Maskowanie ─────────────────────────────────────────────────────────────

export function maskDocumentNumber(n: string | null | undefined): string | null {
  const v = (n ?? "").replace(/\s+/g, "");
  if (!v) return null;
  if (v.length <= 4) return "*".repeat(v.length);
  return "*".repeat(Math.max(2, v.length - 4)) + v.slice(-4);
}

export function maskEmail(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  const at = e.indexOf("@");
  if (at <= 0) return e ? "***" : "";
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const shown = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${shown}${"*".repeat(Math.max(2, local.length - shown.length))}@${domain}`;
}

export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return digits ? "***" : "";
  return `${"*".repeat(Math.max(3, digits.length - 3))}${digits.slice(-3)}`;
}

// ── Reprezentacja ──────────────────────────────────────────────────────────

/** Jedno zdanie „kto podpisuje” do stopki stron i Karty podpisów. */
export function capacityLabel(fullName: string, capacity: SignedCapacity | null): string {
  if (!capacity || capacity.mode === "osoba" || !capacity.company) return fullName;
  const c = capacity.company;
  const ids = [c.nip ? `NIP ${c.nip}` : null, c.krs ? `KRS ${c.krs}` : null].filter(Boolean);
  const idStr = ids.length ? ` (${ids.join(", ")})` : "";
  const role = c.role ? `, ${c.role}` : "";
  return `${c.name}${idStr} — reprezentowana przez: ${fullName}${role}`;
}

/** Krótka etykieta do listy (UI). */
export function capacityShort(capacity: SignedCapacity | null): string {
  if (!capacity || capacity.mode === "osoba" || !capacity.company) return "we własnym imieniu";
  return `w imieniu: ${capacity.company.name}`;
}

// ── Statusy ────────────────────────────────────────────────────────────────

export const ENVELOPE_STATUS_LABELS: Record<EnvelopeStatus, string> = {
  szkic: "Szkic",
  wyslana: "W podpisywaniu",
  zakonczona: "Podpisana",
  odrzucona: "Odrzucona",
  anulowana: "Anulowana",
  wygasla: "Wygasła",
};

export const SIGNER_STATUS_LABELS: Record<SignerStatus, string> = {
  oczekuje: "Oczekuje",
  otwarty: "Otworzył(a) dokument",
  weryfikacja: "Weryfikacja tożsamości",
  zweryfikowany: "Tożsamość potwierdzona",
  niezgodnosc: "Niezgodność danych",
  podpisany: "Podpisał(a)",
  odrzucony: "Odmówił(a) podpisu",
};

/**
 * Status koperty wynikający ze statusów podpisujących: wszyscy podpisali →
 * zakończona; ktoś odmówił → odrzucona; inaczej bez zmian (wysłana).
 */
export function deriveEnvelopeStatus(
  current: EnvelopeStatus,
  signers: Array<{ status: SignerStatus }>,
): EnvelopeStatus {
  if (current === "anulowana" || current === "wygasla" || current === "szkic") return current;
  if (signers.some((s) => s.status === "odrzucony")) return "odrzucona";
  if (signers.length > 0 && signers.every((s) => s.status === "podpisany")) return "zakonczona";
  return "wyslana";
}

/** Czy podpisujący ma już aktywny link (tryb „kolejno” odsłania po kolei). */
export function signerTurnActive(
  mode: SigningMode,
  signer: { order_no: number; status: SignerStatus },
  all: Array<{ order_no: number; status: SignerStatus }>,
): boolean {
  if (mode === "rownolegle") return true;
  const pendingBefore = all.some((s) => s.order_no < signer.order_no && s.status !== "podpisany");
  return !pendingBefore;
}

/** Kolejni podpisujący, którym po podpisie należy wysłać zaproszenie. */
export function nextSignersToInvite<
  T extends { order_no: number; status: SignerStatus; invited_at: string | null },
>(mode: SigningMode, all: T[]): T[] {
  if (mode === "rownolegle") return all.filter((s) => !s.invited_at && s.status !== "podpisany");
  const pending = all
    .filter((s) => s.status !== "podpisany" && s.status !== "odrzucony")
    .sort((a, b) => a.order_no - b.order_no);
  if (pending.length === 0) return [];
  const first = pending[0].order_no;
  return pending.filter((s) => s.order_no === first && !s.invited_at);
}

// ── Łańcuch hashy dziennika ────────────────────────────────────────────────

const HEX = "0123456789abcdef";
export function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (const b of u) out += HEX[b >> 4] + HEX[b & 15];
  return out;
}

/** SHA-256 (WebCrypto — działa w Workerze, Node i przeglądarce). */
export async function sha256Hex(data: string | Uint8Array | ArrayBuffer): Promise<string> {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  const buf = new Uint8Array(bytes.byteLength);
  buf.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return bytesToHex(digest);
}

/** Kanoniczny JSON (posortowane klucze) — żeby hash nie zależał od kolejności pól. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.keys(o)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        if (o[k] !== undefined) acc[k] = sortKeys(o[k]);
        return acc;
      }, {});
  }
  return v;
}

export interface EventHashInput {
  prevHash: string | null;
  envelopeId: string;
  signerId: string | null;
  eventType: string;
  createdAt: string;
  payload: unknown;
}

/** Hash zdarzenia dziennika: wiąże je z poprzednim (łańcuch). */
/**
 * Czas zdarzenia w jednej postaci (ISO 8601 UTC, ms). Zapisujemy
 * `toISOString()` („…123Z”), a baza oddaje tę samą chwilę jako „…123+00:00”
 * — bez normalizacji weryfikacja łańcucha zgłaszałaby fałszywą przerwę.
 */
export function normalizeEventTime(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

export function eventHash(input: EventHashInput): Promise<string> {
  return sha256Hex(
    [
      input.prevHash ?? "",
      input.envelopeId,
      input.signerId ?? "",
      input.eventType,
      normalizeEventTime(input.createdAt),
      canonicalJson(input.payload ?? {}),
    ].join("|"),
  );
}

/** Weryfikacja łańcucha (np. przy eksporcie protokołu). Zwraca indeks pierwszej przerwy albo -1. */
export async function verifyEventChain(
  events: Array<{
    envelope_id: string;
    signer_id: string | null;
    event_type: string;
    created_at: string;
    payload: unknown;
    prev_hash: string | null;
    hash: string;
  }>,
): Promise<number> {
  let prev: string | null = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if ((e.prev_hash ?? null) !== prev) return i;
    const h = await eventHash({
      prevHash: prev,
      envelopeId: e.envelope_id,
      signerId: e.signer_id,
      eventType: e.event_type,
      createdAt: e.created_at,
      payload: e.payload,
    });
    if (h !== e.hash) return i;
    prev = e.hash;
  }
  return -1;
}

/**
 * Identyfikator podpisu — wiąże podpisującego, dokument i okoliczności
 * podpisu. Drukowany w Karcie podpisów.
 */
export function signatureHash(input: {
  envelopeId: string;
  sourceSha256: string;
  signerId: string;
  signedAt: string;
  identity: IdentitySnapshot | null;
  capacity: SignedCapacity | null;
  email: string;
}): Promise<string> {
  return sha256Hex(
    canonicalJson({
      e: input.envelopeId,
      d: input.sourceSha256,
      s: input.signerId,
      t: input.signedAt,
      i: input.identity
        ? {
            sid: input.identity.sessionId,
            n: input.identity.fullName,
            doc: input.identity.documentNumberMasked,
            dob: input.identity.dateOfBirth,
          }
        : null,
      c: input.capacity,
      m: input.email.toLowerCase(),
    }),
  );
}

// ── Kody / tokeny ──────────────────────────────────────────────────────────

const B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // bez I, O, 0, 1 — czytelne w druku

/** Losowy kod weryfikacyjny koperty (publiczny), np. „K7MXQ2PA9T”. */
export function randomVerifyCode(len = 10): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += B32[b % B32.length];
  return out;
}

/** Token linku podpisującego (do URL): 32 bajty, base64url. */
export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Kod jednorazowy — 6 cyfr. */
export function randomOtp(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const TOKEN_TTL_DAYS = 30;

// ── Formatowanie czasu (PDF, e-mail) ───────────────────────────────────────

/** „05.10.2026 14:22:31 CEST (2026-10-05T12:22:31Z)” — lokalnie i w UTC. */
export function formatSignedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const local =
    `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}:${get("second")} ${get("timeZoneName")}`.trim();
  return `${local} (${d.toISOString().replace(/\.\d{3}Z$/, "Z")})`;
}

/** Krótszy wariant do znaczka na stronie: „05.10.2026 14:22 CEST”. */
export function formatSignedAtShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")} ${get("timeZoneName")}`.trim();
}

export const EVENT_LABELS: Record<string, string> = {
  utworzona: "Koperta utworzona",
  wyslana: "Zaproszenia do podpisu wysłane",
  zaproszenie: "Zaproszenie wysłane",
  link_otwarty: "Link otwarty",
  dokument_pobrany: "Dokument wyświetlony / pobrany",
  weryfikacja_start: "Rozpoczęto weryfikację tożsamości (Didit)",
  weryfikacja_ok: "Tożsamość potwierdzona (Didit)",
  weryfikacja_pipeline: "Tożsamość potwierdzona wcześniej (KYC inwestora)",
  weryfikacja_odrzucona: "Weryfikacja tożsamości odrzucona",
  niezgodnosc: "Niezgodność danych z dokumentem tożsamości",
  niezgodnosc_zaakceptowana: "Niezgodność zaakceptowana przez nadawcę",
  reprezentacja: "Wybrano, w czyim imieniu składany jest podpis",
  kod_wyslany: "Kod jednorazowy wysłany",
  kod_bledny: "Błędny kod jednorazowy",
  podpis: "Dokument podpisany",
  odmowa: "Odmowa podpisu",
  zakonczona: "Wszyscy podpisali — dokument zamknięty",
  doreczenie: "Podpisany dokument doręczony e-mailem",
  anulowana: "Koperta anulowana przez nadawcę",
  wygasla: "Koperta wygasła",
  ponowne_zaproszenie: "Zaproszenie wysłane ponownie",
  link_skopiowany: "Nadawca wygenerował link do przekazania ręcznie",
  pobranie_podpisanego: "Pobrano podpisany dokument",
};

export function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type;
}

/** Opis sposobu potwierdzenia tożsamości (PDF + UI). */
export function describeIdentity(identity: IdentitySnapshot | null): string {
  if (!identity) return "brak potwierdzenia tożsamości";
  const checks = identity.checks.length ? identity.checks.join(", ") : "weryfikacja dokumentu";
  const doc = [
    identity.documentType ? identity.documentType : "dokument tożsamości",
    identity.documentNumberMasked ? `nr ${identity.documentNumberMasked}` : null,
    identity.issuingCountry ? `(${identity.issuingCountry})` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const src = identity.source === "pipeline" ? "; KYC z pipeline'u inwestora" : "";
  const when = identity.decidedAt ? `; decyzja ${formatSignedAtShort(identity.decidedAt)}` : "";
  return `Didit — ${checks}; ${doc}${identity.dateOfBirth ? `; ur. ${identity.dateOfBirth}` : ""}; sesja ${identity.sessionId}${when}${src}`;
}
