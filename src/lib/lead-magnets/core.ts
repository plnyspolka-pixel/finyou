// Lead magnety — czysta logika (bez I/O), wspólna dla serwera, panelu,
// strony publicznej i narzędzi MCP. Testowana jednostkowo w core.test.ts.
//
// Przepływ: post w social („polub i napisz w komentarzu PRZEWODNIK”) →
// komentarz z hasłem → odpowiedź z linkiem /pobierz/<slug> → e-mail na stronie
// → subskrybent + osobisty link do pliku (/pobierz-plik/<token>).
import { SITE_URL } from "@/lib/seo/company";

export const LEAD_MAGNET_PLATFORMS = ["facebook", "instagram", "youtube"] as const;
export type LeadMagnetPlatform = (typeof LEAD_MAGNET_PLATFORMS)[number];

export const LEAD_MAGNET_AUDIENCES = ["klient", "inwestor"] as const;
export type LeadMagnetAudience = (typeof LEAD_MAGNET_AUDIENCES)[number];

export const PLATFORM_LABELS: Record<LeadMagnetPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
};

export const AUDIENCE_LABELS: Record<LeadMagnetAudience, string> = {
  klient: "Klient pożyczkowy",
  inwestor: "Inwestor",
};

/** Tag subskrybenta nadawany każdemu zapisowi (poza tagiem grupy i slugu). */
export const LEAD_MAGNET_TAG = "lead-magnet";

export const DEFAULT_TEMPLATES = {
  reply_public: "Cześć {imie}! Wysłaliśmy Ci link w wiadomości prywatnej 👋",
  reply_private:
    "Cześć {imie}! Oto link do materiału „{tytul}”: {link}\nWpisz tam swój e-mail, a plik od razu wyląduje w Twojej skrzynce.",
  reply_fallback: "Cześć {imie}! Link do materiału „{tytul}”: {link}",
  email_subject: "Twój materiał od Finance You: {tytul}",
  email_body:
    "Cześć {imie}!\n\nDziękujemy za zainteresowanie. Twój materiał „{tytul}” czeka tutaj:\n{link}\n\nJeśli ktoś z Twoich znajomych też chce go dostać, podeślij mu stronę {strona}.\n\nPozdrawiamy,\nzespół Finance You",
  thank_you: "Dziękujemy! Link do materiału wysłaliśmy też na Twój e-mail.",
  cta: "Wyślij mi materiał",
} as const;

/** Treść zgody pokazywana pod formularzem (zapisywana przy każdym zapisie). */
export function consentTextFor(audience: LeadMagnetAudience): string {
  const kto = audience === "inwestor" ? "dla inwestorów" : "o finansowaniu pod nieruchomość";
  return `Chcę otrzymać ten materiał i zapisuję się na listę mailingową Finance You (informacje ${kto}). Mogę wypisać się w każdej chwili jednym kliknięciem w stopce maila. Akceptuję politykę prywatności.`;
}

// ── Adresy ───────────────────────────────────────────────────────────────────

export function leadMagnetPath(slug: string): string {
  return `/pobierz/${slug}`;
}

/**
 * Publiczny adres strony lead magnetu. Z platformą dostaje UTM-y, żeby zapis
 * niósł źródło (np. utm_source=facebook, utm_medium=comment) i id komentarza.
 */
export function leadMagnetUrl(
  slug: string,
  opts: { platform?: LeadMagnetPlatform; ref?: string | null } = {},
): string {
  const url = new URL(leadMagnetPath(slug), SITE_URL);
  if (opts.platform) {
    url.searchParams.set("utm_source", opts.platform);
    url.searchParams.set("utm_medium", "comment");
    url.searchParams.set("utm_campaign", `lm-${slug}`);
  }
  if (opts.ref) url.searchParams.set("ref", opts.ref.slice(0, 120));
  return url.toString();
}

export function downloadUrl(token: string): string {
  return `${SITE_URL}/pobierz-plik/${token}`;
}

// ── Hasła i dopasowanie komentarzy ──────────────────────────────────────────

/** Małe litery, bez polskich znaków i interpunkcji — porównanie „po ludzku”. */
export function normalizeForMatch(input: string): string {
  return input
    .toLocaleLowerCase("pl")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** „PRZEWODNIK, pdf; checklista” → ["PRZEWODNIK", "pdf", "checklista"] (bez duplikatów). */
export function parseKeywords(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\n]+/)) {
    const k = part.trim().replace(/^#/, "").slice(0, 60);
    if (!k) continue;
    const key = normalizeForMatch(k);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

/** Czy w tekście pojawia się któreś hasło jako całe słowo (albo ciąg słów). */
export function hasKeyword(text: string, keywords: readonly string[]): boolean {
  const haystack = ` ${normalizeForMatch(text)} `;
  if (!haystack.trim()) return false;
  for (const kw of keywords) {
    const needle = normalizeForMatch(kw);
    if (!needle) continue;
    if (haystack.includes(` ${needle} `)) return true;
  }
  return false;
}

export type MatchableMagnet = {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  trigger_keywords: string[];
  match_any_post: boolean;
};

export type LinkedPost = {
  lead_magnet_id: string;
  platform: LeadMagnetPlatform;
  external_post_id: string;
};

export type CommentMatch =
  | { magnet: MatchableMagnet; via: "linked_post" | "keyword" }
  | { magnet: null; via: "linked_post_no_keyword"; linkedMagnet: MatchableMagnet }
  | { magnet: null; via: "none" };

/** Identyfikatory postów Meta bywają zapisywane z prefiksem strony (PAGEID_POSTID) albo bez. */
export function postIdsEqual(a: string, b: string): boolean {
  const x = a.trim();
  const y = b.trim();
  if (!x || !y) return false;
  if (x === y) return true;
  const tail = (s: string) => (s.includes("_") ? s.slice(s.lastIndexOf("_") + 1) : s);
  return tail(x) === tail(y);
}

/**
 * Który lead magnet dostaje komentarz:
 *  1. post powiązany → ten lead magnet, jeśli komentarz zawiera hasło (albo
 *     lead magnet nie ma haseł — wtedy każdy komentarz),
 *  2. post niepowiązany → pierwszy opublikowany lead magnet z `match_any_post`,
 *     którego hasło pada w komentarzu,
 *  3. nic.
 */
export function matchLeadMagnetForComment(opts: {
  platform: LeadMagnetPlatform;
  postId: string | null | undefined;
  text: string;
  magnets: readonly MatchableMagnet[];
  posts: readonly LinkedPost[];
}): CommentMatch {
  const postId = opts.postId ?? "";
  const link = postId
    ? opts.posts.find(
        (p) => p.platform === opts.platform && postIdsEqual(p.external_post_id, postId),
      )
    : undefined;
  if (link) {
    const magnet = opts.magnets.find((m) => m.id === link.lead_magnet_id && m.published);
    if (magnet) {
      if (magnet.trigger_keywords.length === 0 || hasKeyword(opts.text, magnet.trigger_keywords)) {
        return { magnet, via: "linked_post" };
      }
      return { magnet: null, via: "linked_post_no_keyword", linkedMagnet: magnet };
    }
  }
  for (const m of opts.magnets) {
    if (!m.published || !m.match_any_post || m.trigger_keywords.length === 0) continue;
    if (hasKeyword(opts.text, m.trigger_keywords)) return { magnet: m, via: "keyword" };
  }
  return { magnet: null, via: "none" };
}

// ── Szablony ────────────────────────────────────────────────────────────────

export type TemplateVars = {
  imie?: string | null;
  tytul: string;
  link: string;
  strona?: string;
};

/**
 * Podstawia {imie}, {tytul}, {link}, {strona}. Bez imienia znika także spacja
 * przed {imie}, więc „Cześć {imie}!” daje „Cześć!”.
 */
export function renderTemplate(template: string, vars: TemplateVars): string {
  const name = (vars.imie ?? "").trim();
  let out = name
    ? template.replace(/\{imie\}/g, name)
    : template.replace(/[ \t]*\{imie\}/g, "").replace(/\{imie\}/g, "");
  out = out
    .replace(/\{tytul\}/g, vars.tytul)
    .replace(/\{link\}/g, vars.link)
    .replace(/\{strona\}/g, vars.strona ?? SITE_URL);
  return out.trim();
}

/** Pierwsze słowo z pełnego imienia i nazwiska (Facebook) — do powitania. */
export function firstNameOf(fullName: string | null | undefined): string | null {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first) return null;
  // Loginy IG / YouTube zostawiamy bez zmian; „jan kowalski” → „Jan”.
  if (/^[@a-z0-9._-]+$/i.test(first) && first.startsWith("@")) return first;
  return first.charAt(0).toLocaleUpperCase("pl") + first.slice(1);
}

// ── Pomocnicze dla panelu ───────────────────────────────────────────────────

/** Propozycja treści posta zachęcającego do komentarza z hasłem. */
export function suggestedCaption(opts: {
  title: string;
  keyword: string | null;
  audience: LeadMagnetAudience;
  platform: LeadMagnetPlatform;
}): string {
  const kw = opts.keyword?.trim() || "CHCĘ";
  const dla =
    opts.audience === "inwestor"
      ? "dla inwestorów, którzy chcą lokować kapitał pod zabezpieczeniem na nieruchomości"
      : "dla osób, które potrzebują finansowania pod nieruchomość";
  const jak =
    opts.platform === "youtube"
      ? `Napisz w komentarzu „${kw}” — odpowiemy pod komentarzem linkiem do pobrania.`
      : `Polub ten post i napisz w komentarzu „${kw}” — wyślemy Ci link w wiadomości prywatnej.`;
  return `🎁 Przygotowaliśmy bezpłatny materiał „${opts.title}” — ${dla}.\n\n${jak}\n\nMateriał jest darmowy; na stronie zostawiasz tylko e-mail, na który wysyłamy plik.`;
}

/**
 * Tick YouTube: czy komentarz jest nowszy niż powiązanie filmu (z godziną
 * zapasu na opóźnienia API). Dzięki temu nie odpowiadamy na stare komentarze
 * po podpięciu filmu, który już ma dyskusję.
 */
export function isFreshComment(
  publishedAt: string | null | undefined,
  linkedAt: string | null | undefined,
  graceMs = 60 * 60 * 1000,
): boolean {
  if (!publishedAt) return false;
  const published = new Date(publishedAt).getTime();
  if (!Number.isFinite(published)) return false;
  if (!linkedAt) return true;
  const linked = new Date(linkedAt).getTime();
  if (!Number.isFinite(linked)) return true;
  return published >= linked - graceMs;
}

/** Tagi nadawane subskrybentowi: lead-magnet, grupa, slug i tagi własne. */
export function subscriberTagsFor(opts: {
  slug: string;
  audience: LeadMagnetAudience;
  extra?: readonly string[] | null;
  existing?: readonly string[] | null;
}): string[] {
  const set = new Set<string>();
  for (const t of opts.existing ?? []) if (t) set.add(t);
  set.add(LEAD_MAGNET_TAG);
  set.add(opts.audience);
  set.add(`${LEAD_MAGNET_TAG}:${opts.slug}`);
  for (const t of opts.extra ?? []) if (t?.trim()) set.add(t.trim());
  return [...set];
}

const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Osobisty token pobrania (32 znaki) — działa w przeglądarce i w Node. */
export function newDownloadToken(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
  return out;
}

export function isValidDownloadToken(token: string): boolean {
  return /^[a-z0-9]{16,64}$/.test(token);
}

/** Pola strony publicznej /pobierz/<slug> (bez danych wewnętrznych: pliku, haseł, szablonów). */
export type PublicLeadMagnet = {
  id: string;
  slug: string;
  title: string;
  audience: string;
  headline: string;
  subheadline: string | null;
  benefits: string[];
  cta_text: string;
  cover_image_url: string | null;
  og_image_url: string | null;
  meta_description: string | null;
  thank_you_message: string;
  instant_download: boolean;
  file_name: string | null;
  published: boolean;
  consent_text: string;
  url: string;
};
