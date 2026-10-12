// ROLKI AGENTA WZROSTU — część bez I/O: pory, prompt scenariusza, wybór
// platform i ocena wyników. Strona serwerowa: reel.server.ts.
//
// Właściciel: „agent ma przede wszystkim codziennie publikować rolki na
// wszystkich dostępnych platformach”. Rolka to główny produkt agenta; posty
// tekstowe są dodatkiem.
import type { StudioPlatform } from "@/lib/studio-platforms";
import {
  HOOK_BRIEF,
  PILLAR_BRIEF,
  REEL_SLOTS,
  warsawToUtcIso,
  type PostPlan,
  type ReelSlotKey,
} from "./strategy";
import type { PostMetrics } from "./scoring";
import { engagementScore } from "./scoring";

export { REEL_SLOTS, type ReelSlotKey };

/** Platformy wideo w kolejności wyświetlania w raportach. */
export const REEL_PLATFORMS: readonly StudioPlatform[] = [
  "instagram_reels",
  "facebook_reels",
  "youtube",
  "tiktok",
  "x",
];

/** Najkrócej, ile przed porą publikacji zlecamy render (HeyGen + napisy). */
export const REEL_LEAD_MIN = 150;

/** Pora rolki dla godziny publikacji (ciepły start z istniejących rolek). */
export function reelSlotForDate(iso: string): ReelSlotKey {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(iso)),
  );
  if (h < 15) return "12:30";
  if (h < 19) return "17:00";
  return "20:30";
}

/** Od tej godziny (Warszawa) agent zleca rolkę na bieżący dzień. */
export const REEL_DAY_START_HOUR = 6;

/**
 * Pora dzisiejszej rolki: najpierw ta, którą wybrał bandyta, potem pozostałe
 * w kolejności dnia. Pora musi być co najmniej {@link REEL_LEAD_MIN} minut
 * przed nami (render + napisy + zapas na ponowienie) i nie zajęta. Przed
 * {@link REEL_DAY_START_HOUR} nie planujemy — rolka na dziś powstaje rano,
 * żeby nie zdublować rolki dodanej ręcznie poprzedniego wieczoru.
 */
export function pickReelSlotToday(input: {
  now: Date;
  preferred: ReelSlotKey;
  takenIso?: string[];
}): { slot: ReelSlotKey; slotIso: string } | null {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      hour12: false,
    }).format(input.now),
  );
  if (hour < REEL_DAY_START_HOUR) return null;
  const minTime = input.now.getTime() + REEL_LEAD_MIN * 60_000;
  const taken = (input.takenIso ?? []).map((t) => new Date(t).getTime());
  const order = [input.preferred, ...REEL_SLOTS.filter((s) => s !== input.preferred)];
  for (const slot of order) {
    const [hh, mm] = slot.split(":").map(Number);
    const slotIso = warsawToUtcIso(input.now, 0, hh, mm);
    const t = new Date(slotIso).getTime();
    if (t < minTime) continue;
    // Inna rolka w promieniu 2 h — to ta sama pora.
    if (taken.some((x) => Math.abs(x - t) < 2 * 3600_000)) continue;
    return { slot, slotIso };
  }
  return null;
}

/** Dzień w Warszawie (YYYY-MM-DD) dla chwili `iso`. */
export function warsawDay(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

// ── wybór platform ─────────────────────────────────────────────────────────

export interface QueueOutcome {
  platform: string;
  status: string;
  last_error: string | null;
  updated_at?: string | null;
  scheduled_at?: string | null;
}

/**
 * Błędy, których ponawianie nic nie da, dopóki ktoś czegoś nie zmieni
 * (audyt TikToka, kredyty X, odebrany dostęp). Po takim błędzie platforma
 * odpoczywa tydzień, potem agent próbuje znowu — sam zauważy, że właściciel
 * problem rozwiązał.
 */
const PERMANENT_ERROR =
  /unaudited_client|can_only_post_to_private|payment required|credits depleted|\b402\b|token[^.]{0,40}(?:expired|revoked|wygas|uniewa)/i;
export const BLOCK_COOLDOWN_DAYS = 7;

export function blockedPlatforms(outcomes: QueueOutcome[], now: Date): Map<StudioPlatform, string> {
  const out = new Map<StudioPlatform, string>();
  const cutoff = now.getTime() - BLOCK_COOLDOWN_DAYS * 86_400_000;
  // Najnowszy wynik na platformę decyduje: sukces po błędzie odblokowuje.
  const sorted = [...outcomes].sort((a, b) =>
    String(b.updated_at ?? b.scheduled_at ?? "").localeCompare(
      String(a.updated_at ?? a.scheduled_at ?? ""),
    ),
  );
  const seen = new Set<string>();
  for (const o of sorted) {
    if (seen.has(o.platform)) continue;
    if (o.status !== "failed" && o.status !== "published") continue;
    seen.add(o.platform);
    const at = new Date(String(o.updated_at ?? o.scheduled_at ?? 0)).getTime();
    if (o.status === "failed" && at >= cutoff && PERMANENT_ERROR.test(o.last_error ?? "")) {
      out.set(o.platform as StudioPlatform, (o.last_error ?? "").slice(0, 160));
    }
  }
  return out;
}

export interface ReelPlatformChoice {
  platforms: StudioPlatform[];
  skipped: Array<{ platform: StudioPlatform; reason: string }>;
}

/**
 * „Wszystkie dostępne platformy”: połączone konta, bez platform zablokowanych
 * trwałym błędem w ostatnim tygodniu. TikTok tylko z ustawieniami posta
 * wybranymi przez człowieka (wymóg audytu TikToka — prywatności nie
 * ustalamy za twórcę).
 */
export function chooseReelPlatforms(input: {
  availability: Record<StudioPlatform, boolean>;
  blocked: Map<StudioPlatform, string>;
  preference: "auto" | StudioPlatform[];
  tiktokOptionsSet: boolean;
}): ReelPlatformChoice {
  const wanted = input.preference === "auto" ? REEL_PLATFORMS : input.preference;
  const platforms: StudioPlatform[] = [];
  const skipped: ReelPlatformChoice["skipped"] = [];
  for (const p of REEL_PLATFORMS) {
    if (!wanted.includes(p)) continue;
    if (!input.availability[p]) {
      skipped.push({ platform: p, reason: "konto niepołączone" });
    } else if (input.blocked.has(p)) {
      skipped.push({ platform: p, reason: `wstrzymane po błędzie: ${input.blocked.get(p)}` });
    } else if (p === "tiktok" && !input.tiktokOptionsSet) {
      skipped.push({
        platform: p,
        reason: "brak ustawień posta TikToka wybranych przez właściciela (prywatność)",
      });
    } else {
      platforms.push(p);
    }
  }
  return { platforms, skipped };
}

// ── prompt scenariusza ─────────────────────────────────────────────────────

export const REEL_SYSTEM_PROMPT = `Jesteś scenarzystą krótkich rolek Finance You (Instagram Reels, Facebook Reels, YouTube Shorts, TikTok). Finance You łączy firmy potrzebujące finansowania pod zastaw nieruchomości z prywatnymi inwestorami. Piszesz po polsku dla przedsiębiorców albo inwestorów.

Rolkę czyta lektor (awatar), a montaż sam dokłada napisy, przebitki i animacje. Ty piszesz tekst mówiony i opisy publikacji.

CEL: widz ogląda do końca, zapamiętuje jedną rzecz i zostaje obserwatorem albo pisze komentarz. Edukujesz, informujesz, czasem subtelnie bawisz.

ZASADY NIEPODWAŻALNE:
1. Mówisz tylko prawdę. Liczby, stawki i warunki WYŁĄCZNIE z bloku FAKTY. Bez wymyślonych statystyk rynku, historii klientów, wyników i cytatów.
2. Prawdę pokazujesz z perspektywy korzyści widza, ale nie przemilczasz ograniczeń: finansujemy tylko cele firmowe, pod nieruchomość, którą ktoś już ma; inwestycja nie ma gwarancji zysku.
3. Bez obietnic decyzji, terminu, zysku i „bezpieczeństwa”. Bez „gwarantujemy”, „bez ryzyka”, „pewny zysk”, „stabilny zwrot”, „bezpiecznie lokować”.
4. Humor z sytuacji, nie z ludzi w kłopotach.

SCENARIUSZ (pole "script"):
- 70–120 słów (25–45 sekund), zdania krótkie, mówione, bez nawiasów, list, emoji i hashtagów.
- Pierwsze zdanie to haczyk: zatrzymuje kciuk w 2 sekundy.
- Liczby zapisuj słowami („sześćdziesiąt procent”, „pięć tysięcy złotych”), bo czyta je lektor.
- Jedna myśl, konkret, na końcu jedno zdanie zachęty: „Obserwuj Finance You…” albo pytanie do komentarzy.
- Bez form „Pan/Pani” — mów na „ty” albo bezosobowo.

OPISY:
- "title": tytuł rolki, do 70 znaków, bez hashtagów (YouTube, nagłówek).
- "caption": jeden opis na Instagram, Facebook, YouTube i TikToka, 250–600 znaków, pierwsze zdanie jak nagłówek, pytanie do komentujących, na końcu 4–8 hashtagów. Podawaj financeyou.pl, nie pisz „link w bio”.
- "short": wersja na X, do 200 znaków razem z 1–2 hashtagami (system dopisze krótkie zastrzeżenie).
- "summary": jedno zdanie, o czym jest rolka.

Zwracasz WYŁĄCZNIE JSON:
{"script":"…","title":"…","caption":"…","short":"…","summary":"…"}`;

export interface ReelPromptInput {
  plan: PostPlan;
  factsBlock: string;
  playbook: string[];
  recentTitles: string[];
}

export function buildReelUserPrompt(input: ReelPromptInput): string {
  const { plan } = input;
  const audienceLabel =
    plan.audience === "inwestor"
      ? "INWESTORZY (osoby i firmy z kapitałem)"
      : "PRZEDSIĘBIORCY potrzebujący finansowania dla firmy";
  const parts: string[] = [
    `ODBIORCA: ${audienceLabel}.`,
    `FILAR: ${plan.pillar} — ${PILLAR_BRIEF[plan.pillar]}`,
    `HACZYK (pierwsze zdanie scenariusza): ${plan.hook} — ${HOOK_BRIEF[plan.hook]}`,
  ];
  if (plan.question) {
    parts.push(
      `KOTWICA MERYTORYCZNA (sprawdzona prawnie — oprzyj na niej rolkę):\nPytanie: ${plan.question.question}\nTeza: ${plan.question.thesis}\nDział: ${plan.question.section}`,
    );
  }
  if (input.playbook.length) {
    parts.push(
      `WNIOSKI Z WYNIKÓW NASZYCH ROLEK I POSTÓW (stosuj):\n${input.playbook
        .slice(0, 12)
        .map((l) => `- ${l}`)
        .join("\n")}`,
    );
  }
  if (input.recentTitles.length) {
    parts.push(
      `OSTATNIE ROLKI (nie powtarzaj tematu ani schematu otwarcia):\n${input.recentTitles
        .slice(0, 10)
        .map((l) => `- ${l}`)
        .join("\n")}`,
    );
  }
  parts.push(input.factsBlock.trim());
  return parts.join("\n\n");
}

export interface ReelDraft {
  script: string;
  title: string;
  caption: string;
  short: string;
  summary: string;
}

export function buildReelRepairPrompt(previous: ReelDraft, problems: string): string {
  return `Twoja poprzednia rolka nie przeszła kontroli prawdy. Popraw ją, zachowując myśl i ton, ale usuń problemy:
${problems}

POPRZEDNIA WERSJA:
${JSON.stringify(previous, null, 2)}

Zwróć cały JSON jeszcze raz w tym samym formacie.`;
}

export function normalizeReelDraft(raw: any): ReelDraft {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const script = s(raw?.script)
    .replace(/#[\p{L}\d_]+/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  const caption = s(raw?.caption) || s(raw?.description);
  const title = (s(raw?.title) || script.split(/(?<=[.!?])\s/)[0] || "")
    .replace(/#[\p{L}\d_]+/gu, "")
    .trim()
    .slice(0, 95);
  return {
    script,
    title,
    caption,
    short: s(raw?.short) || title,
    summary: s(raw?.summary) || title,
  };
}

/** Liczba słów scenariusza — rolka ma trwać 25–45 s. */
export function scriptWords(script: string): number {
  return script.split(/\s+/).filter(Boolean).length;
}

// ── ocena wyników ──────────────────────────────────────────────────────────

/**
 * Wynik rolki: zaangażowanie jak dla posta plus składnik zasięgu. Przy małym
 * profilu interakcji jest mało albo wcale, a liczba wyświetleń i tak mówi,
 * którą rolkę algorytm pokazał szerzej — to też sygnał do nauki.
 */
export function reelScore(m: PostMetrics): number {
  const views = Math.max(0, m.views ?? m.reach ?? m.impressions ?? 0);
  return Math.round((engagementScore(m) + Math.log10(1 + views) / 100) * 10000) / 10000;
}
