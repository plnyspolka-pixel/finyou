// Czyste heurystyki wykrywania botów / autoresponderów w korespondencji.
// Wspólne dla e-maila i Messengera/Instagrama. Bez zależności od bazy —
// funkcje są deterministyczne i testowalne (bot-detection.test.ts).

/** Frazy zdradzające automat / autoresponder / innego bota (PL + EN). */
const AUTO_MESSAGE_PATTERNS: { signal: string; re: RegExp }[] = [
  // Wprost: wiadomość automatyczna
  { signal: "auto_message_pl", re: /automatyczn[aą]\s+(odpowiedź|wiadomo[śs][ćc])/i },
  { signal: "auto_message_pl", re: /odpowied[źz]\s+automatyczn/i },
  { signal: "auto_message_pl", re: /autoodpowied[źz]/i },
  { signal: "auto_message_pl", re: /wygenerowan[ao]\s+automatycznie/i },
  { signal: "auto_message_pl", re: /wiadomo[śs][ćc]\s+zosta[łl]a\s+wys[łl]ana\s+automatycznie/i },
  { signal: "auto_message_en", re: /automat(ed|ic)\s+(reply|response|message)/i },
  { signal: "auto_message_en", re: /auto[- ]?repl(y|ied)/i },
  { signal: "auto_message_en", re: /this\s+is\s+an\s+automated/i },
  // Prośba, by nie odpowiadać / skrzynka niemonitorowana
  { signal: "do_not_reply", re: /nie\s+odpowiadaj\s+na\s+t[ęe]\s+wiadomo/i },
  { signal: "do_not_reply", re: /prosimy\s+nie\s+odpowiada[ćc]/i },
  { signal: "do_not_reply", re: /skrzynka\s+nie\s+jest\s+monitorowana/i },
  { signal: "do_not_reply", re: /do\s+not\s+reply\s+to\s+this/i },
  { signal: "do_not_reply", re: /(mailbox|inbox)\s+is\s+not\s+monitored/i },
  // Bot przedstawia się jako bot / wirtualny asystent
  { signal: "self_declared_bot", re: /jestem\s+(botem|wirtualnym\s+asystentem|asystentem\s+ai)/i },
  { signal: "self_declared_bot", re: /wirtualny\s+asystent/i },
  { signal: "self_declared_bot", re: /i\s*('|a)?m\s+a\s+(bot|virtual\s+assistant|chatbot)/i },
  { signal: "self_declared_bot", re: /\bchatbot\b/i },
  { signal: "self_declared_bot", re: /asystent\s+ai\b/i },
  // Nieobecność / urlop
  { signal: "out_of_office", re: /out[- ]of[- ]office/i },
  { signal: "out_of_office", re: /przebywam\s+(obecnie\s+)?(na\s+urlopie|poza\s+biurem)/i },
  { signal: "out_of_office", re: /jestem\s+na\s+urlopie/i },
  { signal: "out_of_office", re: /obecnie\s+jestem\s+niedost[ęe]pn/i },
  // Automatyczne powitania stron/firm ("odpowiemy wkrótce")
  { signal: "instant_greeting", re: /dzi[ęe]kujemy\s+za\s+(wiadomo[śs][ćc]|kontakt)/i },
  { signal: "instant_greeting", re: /odpowiemy\s+(najszybciej|tak\s+szybko|wkr[óo]tce|w\s+ci[ąa]gu)/i },
  { signal: "instant_greeting", re: /thank\s+you\s+for\s+(your\s+message|contacting)/i },
  { signal: "instant_greeting", re: /we('|w)?ll\s+get\s+back\s+to\s+you/i },
  // Zwroty niedostarczonych wiadomości (bounce w treści)
  { signal: "bounce", re: /mail\s+delivery\s+(failed|subsystem)/i },
  { signal: "bounce", re: /delivery\s+status\s+notification/i },
  { signal: "bounce", re: /undeliver(able|ed)/i },
  { signal: "bounce", re: /nie\s+mo[żz]na\s+dostarczy[ćc]\s+wiadomo/i },
];

/**
 * Czy treść wygląda na wiadomość od automatu (autoresponder, bot, bounce)?
 * Zwraca nazwę sygnału albo null.
 */
export function looksLikeAutoMessage(text: string | null | undefined): string | null {
  if (!text) return null;
  // Ograniczamy do początku wiadomości — cytowana historia wątku (poniżej
  // "Od: ..."/"On ... wrote:") może zawierać nasze własne stopki automatów.
  const head = text.slice(0, 1500);
  for (const { signal, re } of AUTO_MESSAGE_PATTERNS) {
    if (re.test(head)) return signal;
  }
  return null;
}

/** Tematy typowe dla autoresponderów / zwrotów (bounce). */
const AUTO_SUBJECT_RE =
  /^(automatic\s+reply|autoreply|auto[- ]reply|auto:|odpowied[źz]\s+automatyczna|automatyczna\s+odpowied[źz]|autoodpowied[źz]|out\s+of\s+office|ooo:|away:|nieobecno[śs][ćc]|urlop|vacation|delivery\s+status|undeliver|mail\s+delivery|failure\s+notice|returned\s+mail|zwrot\s+niedostarczonej)/i;

export function isAutoReplySubject(subject: string | null | undefined): boolean {
  if (!subject) return false;
  // Zdejmij prefiksy Re:/Fwd:/Odp: — autoresponder może odpowiadać w wątku.
  const stripped = subject.trim().replace(/^((re|fwd?|odp|pd)\s*:\s*)+/i, "");
  return AUTO_SUBJECT_RE.test(stripped);
}

function normalizeContent(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Najczęściej powtórzona treść wśród wiadomości przychodzących.
 * Boty w pętli wysyłają w kółko to samo — człowiek raczej nie.
 */
export function maxRepeatedContent(contents: (string | null | undefined)[]): {
  count: number;
  content: string | null;
} {
  const counts = new Map<string, number>();
  for (const raw of contents) {
    const c = normalizeContent(raw ?? "");
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: { count: number; content: string | null } = { count: 0, content: null };
  for (const [content, count] of counts) {
    if (count > best.count) best = { count, content };
  }
  return best;
}

/**
 * Czy powtarzalność treści przychodzących wskazuje na bota?
 * Dłuższe wiadomości: 3 identyczne wystarczą. Krótkie ("ok", "tak") mogą
 * naturalnie się powtarzać u człowieka — wymagamy 5.
 */
export function isRepetitiveInbound(contents: (string | null | undefined)[]): boolean {
  const { count, content } = maxRepeatedContent(contents);
  if (!content) return false;
  return content.length >= 8 ? count >= 3 : count >= 5;
}

export type PingPongRow = {
  direction: "inbound" | "outbound" | string;
  createdAt: string | Date;
};

/**
 * Liczy "błyskawiczne odbicia": wiadomości przychodzące, które wpadły w mniej
 * niż `thresholdMs` po naszej wychodzącej. Człowiek potrzebuje chwili na
 * przeczytanie i odpisanie — seria natychmiastowych odpowiedzi to bot.
 * `rows` muszą być posortowane rosnąco po czasie.
 */
export function countFastPingPong(rows: PingPongRow[], thresholdMs = 5000): number {
  let fast = 0;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];
    if (prev.direction !== "outbound" || cur.direction !== "inbound") continue;
    const gap = new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime();
    if (gap >= 0 && gap < thresholdMs) fast++;
  }
  return fast;
}
