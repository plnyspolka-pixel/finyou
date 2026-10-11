// KATALOG MOŻLIWOŚCI AGENTÓW — co agent może dostać sam, a co wymaga
// właściciela. Reguła właściciela (2026-10-11):
//   • narzędzia i konektory, które da się dać KODEM i BEZ KOSZTÓW — przyznajemy
//     automatycznie,
//   • gdy czegoś nie da się zrobić automatycznie, a jest ważne, ALBO usługa jest
//     płatna — SMS do właściciela; przy płatnych ZAWSZE najpierw szukamy
//     darmowych alternatyw i podajemy je w tym samym SMS-ie.
//
// Czysty moduł: klasyfikacja prośby agenta + wiedza o alternatywach.

export type CapabilityCost = "free" | "paid" | "free_manual";
export type CapabilityDecision = "auto_grant" | "already_available" | "needs_owner" | "rejected";

export interface CapabilityInfo {
  key: string;
  label: string;
  cost: CapabilityCost;
  /** Czy da się przyznać kodem, bez człowieka. */
  codeable: boolean;
  /** Co konkretnie musi zrobić człowiek (dla needs_owner). */
  ownerAction?: string;
  /** Darmowe zamienniki — sprawdzane przed płatnym. */
  freeAlternatives?: string[];
  /** Znaczenie dla celu (1–3) — o płatnych/ręcznych o wadze 1 nie piszemy SMS-a. */
  importance: 1 | 2 | 3;
}

export const CAPABILITY_CATALOGUE: CapabilityInfo[] = [
  {
    key: "x_api_credits",
    label: "Publikacja na X (API płatne — skończyły się kredyty, HTTP 402)",
    cost: "paid",
    codeable: false,
    ownerAction: "Doładować kredyty X API albo zrezygnować z X na rzecz darmowych kanałów.",
    freeAlternatives: [
      "Threads przez API Meta (darmowe; token ma threads_business_basic, potrzebny jeszcze zakres threads_content_publish w aplikacji Meta)",
      "Bluesky (darmowe API; wystarczy konto firmowe i hasło aplikacji)",
      "LinkedIn — strona firmowa (darmowe API po weryfikacji aplikacji)",
    ],
    importance: 2,
  },
  {
    key: "tiktok_audit",
    label: "Publiczne posty na TikToku (aplikacja nie przeszła audytu)",
    cost: "free_manual",
    codeable: false,
    ownerAction:
      "Dokończyć audyt aplikacji w TikTok for Developers (scenariusz: docs/tiktok-audyt-nagranie.md).",
    importance: 3,
  },
  {
    key: "threads_publish",
    label: "Publikacja na Threads",
    cost: "free_manual",
    codeable: false,
    ownerAction: "W aplikacji Meta dodać zakres threads_content_publish i odnowić token systemowy.",
    importance: 2,
  },
  {
    key: "bluesky_account",
    label: "Kanał Bluesky (darmowe API)",
    cost: "free_manual",
    codeable: false,
    ownerAction:
      "Założyć konto Bluesky Finance You i dodać sekrety BLUESKY_HANDLE oraz BLUESKY_APP_PASSWORD.",
    importance: 1,
  },
  {
    key: "linkedin_page",
    label: "Publikacja na stronie firmowej LinkedIn",
    cost: "free_manual",
    codeable: false,
    ownerAction:
      "Utworzyć aplikację LinkedIn z produktem Community Management API i podpiąć stronę firmową.",
    importance: 2,
  },
  {
    key: "google_business_posts",
    label: "Posty w Profilu Firmy w Google",
    cost: "free_manual",
    codeable: false,
    ownerAction: "Zweryfikować Profil Firmy Google i dodać dostęp do Business Profile API.",
    importance: 2,
  },
  {
    key: "twilio_balance",
    label: "Saldo Twilio (SMS i telefony)",
    cost: "paid",
    codeable: false,
    ownerAction: "Doładować konto Twilio.",
    freeAlternatives: [
      "Messenger i Instagram DM zamiast SMS tam, gdzie klient napisał pierwszy (darmowe)",
      "E-mail przez Resend zamiast SMS przy przypomnieniach (w ramach planu)",
    ],
    importance: 3,
  },
  {
    key: "max_interest_update",
    label: "Aktualizacja odsetek maksymalnych po decyzji RPP",
    cost: "free_manual",
    codeable: false,
    ownerAction:
      "Dopisać nowy wiersz w MAX_INTEREST_TABLE (src/lib/contract-engine/fees.ts) — boty i umowy podają stawkę z tej tabeli.",
    importance: 3,
  },
  {
    key: "public_data_source",
    label: "Nowe publiczne źródło danych (RSS / JSON) do treści",
    cost: "free",
    codeable: true,
    importance: 1,
  },
  {
    key: "knowledge_entry",
    label: "Nowy wpis wiedzy dla botów",
    cost: "free",
    codeable: true,
    importance: 1,
  },
  {
    key: "image_generation",
    label: "Generowanie grafik do postów (AI w ramach dziennego budżetu)",
    cost: "free",
    codeable: true,
    importance: 1,
  },
  {
    key: "comment_replies",
    label: "Odpowiadanie na komentarze FB / IG / YouTube",
    cost: "free",
    codeable: true,
    importance: 1,
  },
];

const BY_KEY = new Map(CAPABILITY_CATALOGUE.map((c) => [c.key, c]));

export function capabilityInfo(key: string): CapabilityInfo | undefined {
  return BY_KEY.get(key);
}

/**
 * Domeny, z których agent może SAM dodać źródło danych (RSS/JSON) — publiczne,
 * rzetelne, bez logowania. Spoza listy — tylko za zgodą właściciela.
 */
export const PUBLIC_SOURCE_ALLOWLIST = [
  "nbp.pl",
  "static.nbp.pl",
  "api.nbp.pl",
  "gov.pl",
  "knf.gov.pl",
  "stat.gov.pl",
  "bdl.stat.gov.pl",
  "isap.sejm.gov.pl",
  "sejm.gov.pl",
  "uokik.gov.pl",
  "bankier.pl",
  "money.pl",
  "rp.pl",
  "pb.pl",
  "businessinsider.com.pl",
  "obserwatorfinansowy.pl",
] as const;

export function hostAllowed(url: string): boolean {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    host = u.hostname.toLowerCase();
  } catch {
    return false;
  }
  return PUBLIC_SOURCE_ALLOWLIST.some((d) => host === d || host.endsWith(`.${d}`));
}

export interface CapabilityRequest {
  key?: string | null;
  /** Opis własnymi słowami agenta, gdy nie ma klucza z katalogu. */
  description: string;
  /** Uzasadnienie — po co to agentowi. */
  why?: string | null;
  /** Dla public_data_source: adres źródła. */
  url?: string | null;
}

export interface CapabilityVerdict {
  decision: CapabilityDecision;
  key: string;
  reason: string;
  notifyOwner: boolean;
  freeAlternatives: string[];
}

/** Słowa kluczowe → klucz katalogu (agent nie zawsze zna nazwy). */
const KEYWORDS: Array<[RegExp, string]> = [
  [/\bx\b|twitter|tweet/i, "x_api_credits"],
  [/tiktok/i, "tiktok_audit"],
  [/threads/i, "threads_publish"],
  [/bluesky|bsky/i, "bluesky_account"],
  [/linkedin/i, "linkedin_page"],
  [/google (?:business|moja firma)|profil firmy/i, "google_business_posts"],
  [/twilio|sms|saldo/i, "twilio_balance"],
  [/odsetk|rpp|stop[ay] referencyjn/i, "max_interest_update"],
  [/rss|źródł|feed|api publiczn/i, "public_data_source"],
  [/wiedz|knowledge|faq/i, "knowledge_entry"],
  [/grafik|obraz|image/i, "image_generation"],
  [/komentarz|comment/i, "comment_replies"],
];

export function resolveCapabilityKey(req: CapabilityRequest): string {
  if (req.key && BY_KEY.has(req.key)) return req.key;
  const text = `${req.key ?? ""} ${req.description} ${req.why ?? ""}`;
  for (const [re, key] of KEYWORDS) if (re.test(text)) return key;
  return "other";
}

/** Decyzja o prośbie agenta — bez I/O. */
export function classifyCapabilityRequest(
  req: CapabilityRequest,
  available: ReadonlySet<string> = new Set(),
): CapabilityVerdict {
  const key = resolveCapabilityKey(req);
  if (available.has(key)) {
    return {
      decision: "already_available",
      key,
      reason: "Możliwość jest już włączona.",
      notifyOwner: false,
      freeAlternatives: [],
    };
  }
  if (key === "public_data_source") {
    if (req.url && hostAllowed(req.url)) {
      return {
        decision: "auto_grant",
        key,
        reason: "Publiczne źródło z listy dozwolonych domen.",
        notifyOwner: false,
        freeAlternatives: [],
      };
    }
    return {
      decision: "needs_owner",
      key,
      reason: "Źródło spoza listy dozwolonych domen — wymaga zgody właściciela.",
      notifyOwner: false,
      freeAlternatives: [],
    };
  }
  const info = BY_KEY.get(key);
  if (!info) {
    return {
      decision: "needs_owner",
      key: "other",
      reason: "Nowa możliwość spoza katalogu — do oceny przez właściciela.",
      notifyOwner: true,
      freeAlternatives: [],
    };
  }
  if (info.cost === "free" && info.codeable) {
    return {
      decision: "auto_grant",
      key,
      reason: "Darmowe i możliwe do włączenia kodem.",
      notifyOwner: false,
      freeAlternatives: [],
    };
  }
  return {
    decision: "needs_owner",
    key,
    reason: info.ownerAction ?? "Wymaga działania właściciela.",
    // SMS tylko gdy to ważne albo płatne (reguła właściciela).
    notifyOwner: info.cost === "paid" || info.importance >= 2,
    freeAlternatives: info.freeAlternatives ?? [],
  };
}

/** Polskie znaki → ASCII: SMS w GSM-7 to 160 znaków na segment zamiast 70. */
export function toGsmAscii(s: string): string {
  const map: Record<string, string> = {
    ą: "a",
    ć: "c",
    ę: "e",
    ł: "l",
    ń: "n",
    ó: "o",
    ś: "s",
    ź: "z",
    ż: "z",
    Ą: "A",
    Ć: "C",
    Ę: "E",
    Ł: "L",
    Ń: "N",
    Ó: "O",
    Ś: "S",
    Ź: "Z",
    Ż: "Z",
    "„": '"',
    "”": '"',
    "–": "-",
    "—": "-",
    "…": "...",
    "’": "'",
  };
  return s.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ„”–—…’]/g, (c) => map[c] ?? c);
}

/** Treść SMS-a do właściciela z listą spraw (najważniejsze pierwsze), max ~3 segmenty. */
export function ownerDigestSms(
  items: Array<{ label: string; action: string; alternatives?: string[] }>,
): string {
  const head = "Finance You / agenci AI - potrzebna Twoja decyzja:";
  const parts: string[] = [];
  for (const [i, it] of items.entries()) {
    const alt = it.alternatives?.length ? ` Darmowo: ${it.alternatives[0]}.` : "";
    parts.push(`${i + 1}) ${it.label}: ${it.action}${alt}`);
  }
  let body = toGsmAscii(
    `${head} ${parts.join(" ")} Szczegoly: panel /admin, MCP growth_agent_status.`,
  );
  if (body.length > 459) body = `${body.slice(0, 456)}...`;
  return body;
}
