// Rozpoznawanie prośby klienta o oddzwonienie (rozmowa telefoniczna albo SMS)
// i wyliczanie terminu, na który Ania ma oddzwonić. Czysta logika, bez I/O.
//
// Wcześniej rozmowa, w której klient prosił „proszę oddzwonić za godzinę",
// kończyła się statusem w kolejce i nic więcej — nikt nie planował telefonu.

export interface CallbackRequest {
  /** Klient prosi, żeby Ania do niego zadzwoniła (później). */
  requested: boolean;
  /** Termin telefonu (UTC). Ustawiony tylko, gdy `requested`. */
  dueAt?: Date;
  /** Fragment wypowiedzi klienta, który zdecydował — do notatki w kolejce. */
  evidence?: string;
  /** Czy termin wynika z wypowiedzi klienta (true), czy to nasza wartość domyślna. */
  hasExplicitTime?: boolean;
}

/** Domyślne opóźnienie, gdy klient nie podał pory. */
export const DEFAULT_CALLBACK_DELAY_MS = 2 * 3600_000;
/** Najwcześniej tyle po prośbie — telefon „za 0 minut" nie ma sensu. */
export const MIN_CALLBACK_DELAY_MS = 5 * 60_000;

// Klient wprost prosi o telefon.
const EXPLICIT_RE =
  /oddzwo(?:ń|ni(?!ę)|nić|nij|nicie|nisz)|zadzwo(?:ń|ni|nić|nij|nicie|nisz)\s+(?:do\s+mnie\s+|do\s+nas\s+|jeszcze\s+raz\s+|ponownie\s+|proszę\s+)?(?:p[oó][żźz]niej|za\b|jutro|pojutrze|wieczorem|rano|po\b|o\b|w\b|kiedy[śs]|jeszcze|ponownie|potem|za\s+chwil)|prosz[ęe]\s+(?:o\s+)?(?:ponowny\s+|p[oó][żźz]niejszy\s+)?(?:telefon|kontakt\s+telefoniczny)|prosz[ęe]\s+(?:do\s+mnie\s+)?(?:zadzwoni[ćc]|oddzwoni[ćc])|mo[żz]ecie\s+(?:do\s+mnie\s+)?(?:zadzwoni[ćc]|oddzwoni[ćc])|zadzwo(?:ń|ni)\s+p[oó][żźz]niej|zadzwoni[ćc]\s+(?:p[oó][żźz]niej|jutro|za\b|wieczorem|rano|po\b)/i;

// Klient nie może teraz rozmawiać.
const BUSY_RE =
  /nie\s+(?:mam|moge|mogę)\s+(?:teraz\s+)?(?:czasu|rozmawia[ćc]|gada[ćc])|jestem\s+(?:teraz\s+)?(?:w\s+pracy|zaj[ęe]ty|zaj[ęe]ta|za\s+kierownic[aą]|w\s+trasie|na\s+spotkaniu)|prowadz[ęe]\s+(?:teraz\s+)?(?:auto|samoch[oó]d)|nie\s+jest\s+to\s+dobry\s+moment|nie\s+teraz|teraz\s+nie\s+(?:mog[ęe]|dam)|nie\s+w\s+tej\s+chwili/i;

// Klient NIE chce kontaktu — wygrywa z każdą prośbą o oddzwonienie.
const REFUSAL_RE =
  /nie\s+dzwo[ńn]cie|nie\s+dzwo[ńn]\s|nie\s+dzwonić|prosz[ęe]\s+(?:mnie\s+)?(?:nie\s+dzwoni[ćc]|usun[ąa][ćc]|skre[śs]li[ćc])|usu[ńn]cie\s+mnie|usu[ńn]\s+mnie|skre[śs]l(?:cie)?\s+mnie|nie\s+jestem\s+zainteresowan|nie\s+chc[ęe]\s+(?:rozmawia[ćc]|kontaktu|po[żz]yczki|tej\s+oferty)|nie\s+potrzebuj[ęe]|zdejmij\s+mnie|wypisz\s+mnie|przesta[ńn]cie\s+dzwoni[ćc]|oferta\s+(?:jest\s+)?nieaktualna|nie\s+jest\s+(?:ju[żz]\s+)?aktualn/i;

const WEEKDAYS: Array<[RegExp, number]> = [
  [/poniedzia[łl]ek|poniedzia[łl]ku/i, 1],
  [/wtorek|wtorku/i, 2],
  [/[śs]rod[ęea]|[śs]rod[ęe]/i, 3],
  [/czwartek|czwartku/i, 4],
  [/pi[ąa]tek|pi[ąa]tku/i, 5],
  [/sobot[ęea]/i, 6],
];

const WORD_NUMBERS: Record<string, number> = {
  jedną: 1,
  jedna: 1,
  dwie: 2,
  dwa: 2,
  trzy: 3,
  cztery: 4,
  pięć: 5,
  piec: 5,
};

/** Offset Europe/Warsaw (minuty) w danej chwili — uwzględnia czas letni. */
function warsawOffsetMinutes(at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Warsaw",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) === 24 ? 0 : Number(p.hour);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Data kalendarzowa w Warszawie (rok, miesiąc 0–11, dzień, dzień tygodnia 0=nd). */
function warsawDate(at: Date): { y: number; m: number; d: number; dow: number } {
  const local = new Date(at.getTime() + warsawOffsetMinutes(at) * 60000);
  return {
    y: local.getUTCFullYear(),
    m: local.getUTCMonth(),
    d: local.getUTCDate(),
    dow: local.getUTCDay(),
  };
}

/** Chwila UTC dla godziny:minuty czasu warszawskiego w dniu (y, m, d + addDays). */
function warsawTime(
  base: { y: number; m: number; d: number },
  addDays: number,
  hour: number,
  minute: number,
): Date {
  const guess = new Date(Date.UTC(base.y, base.m, base.d + addDays, hour, minute, 0));
  // Offset zależy od daty docelowej, więc liczymy go dla przybliżenia.
  const off = warsawOffsetMinutes(guess);
  return new Date(guess.getTime() - off * 60000);
}

function numberFrom(token: string | undefined): number | null {
  if (!token) return null;
  const n = Number(token);
  if (Number.isFinite(n)) return n;
  return WORD_NUMBERS[token.toLowerCase()] ?? null;
}

/** Godzina z wypowiedzi: „o 15", „po 16:30", „koło 9". Zwraca [godz, min] albo null. */
function clockFrom(text: string): [number, number] | null {
  const m =
    /(?:\bo|\bpo|\bko[łl]o|\bokoło|\bna|\bgodz(?:inie|\.)?)\s*(\d{1,2})(?:[:.](\d{2}))?(?!\d)(?:\s*(?:rano|wieczorem|po\s+po[łl]udniu))?/i.exec(
      text,
    );
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  // „o 5" w sensie telefonu do klienta to 17:00, nie 5 rano.
  if (hour >= 1 && hour <= 7) hour += 12;
  return [hour, minute];
}

/**
 * Termin telefonu z wypowiedzi klienta. `now` wstrzykiwane dla testów.
 * Zwraca `explicit = false`, gdy klient nie podał pory (wtedy domyślnie +2 h).
 */
export function parseCallbackTime(
  text: string,
  now: Date = new Date(),
): { dueAt: Date; explicit: boolean } {
  const t = text.toLowerCase();
  const nowMs = now.getTime();
  const clamp = (d: Date) => new Date(Math.max(d.getTime(), nowMs + MIN_CALLBACK_DELAY_MS));
  const today = warsawDate(now);

  // 1) Względnie: „za 30 minut", „za godzinę", „za 2 godziny", „za pół godziny".
  const rel =
    /za\s+(?:(\d+|jedn[ąa]|dwie|dwa|trzy|cztery|pi[ęe][ćc])\s+)?(minut[ęy]?|min\b|godzin[ęy]?|godz\b)/i.exec(
      t,
    );
  if (rel) {
    const n = numberFrom(rel[1]) ?? 1;
    const unit = rel[2].startsWith("min") ? 60_000 : 3600_000;
    return { dueAt: clamp(new Date(nowMs + n * unit)), explicit: true };
  }
  if (/za\s+p[óo][łl]\s+godziny/i.test(t)) {
    return { dueAt: clamp(new Date(nowMs + 30 * 60_000)), explicit: true };
  }
  if (/za\s+kwadrans/i.test(t)) {
    return { dueAt: clamp(new Date(nowMs + 15 * 60_000)), explicit: true };
  }
  if (/za\s+chwil[ęe]|za\s+moment|za\s+momencik/i.test(t)) {
    return { dueAt: clamp(new Date(nowMs + 15 * 60_000)), explicit: true };
  }

  // 2) Dzień: jutro / pojutrze / dzień tygodnia; godzina z wypowiedzi lub pora dnia.
  let dayOffset: number | null = null;
  if (/pojutrze/i.test(t)) dayOffset = 2;
  else if (/jutro/i.test(t)) dayOffset = 1;
  else {
    for (const [re, dow] of WEEKDAYS) {
      if (re.test(t)) {
        const diff = (dow - today.dow + 7) % 7;
        dayOffset = diff === 0 ? 7 : diff;
        break;
      }
    }
  }

  const clock = clockFrom(t);
  let partOfDay: [number, number] | null = null;
  if (/rano|z\s+rana/i.test(t)) partOfDay = [9, 0];
  else if (/po\s+po[łl]udniu|popo[łl]udniu/i.test(t)) partOfDay = [15, 0];
  else if (/wieczorem|wieczor/i.test(t)) partOfDay = [18, 0];
  else if (/w\s+po[łl]udnie|w\s+po[łl]udnie/i.test(t)) partOfDay = [12, 0];

  const hm = clock ?? partOfDay;

  if (dayOffset !== null) {
    const [h, m] = hm ?? [10, 0];
    return { dueAt: clamp(warsawTime(today, dayOffset, h, m)), explicit: true };
  }

  if (hm) {
    // Dziś o tej porze; jeśli już minęła — jutro.
    let due = warsawTime(today, 0, hm[0], hm[1]);
    if (due.getTime() < nowMs + MIN_CALLBACK_DELAY_MS) due = warsawTime(today, 1, hm[0], hm[1]);
    return { dueAt: due, explicit: true };
  }

  // 3) „później", „kiedyś" — bez pory.
  return { dueAt: new Date(nowMs + DEFAULT_CALLBACK_DELAY_MS), explicit: false };
}

/**
 * Czy klient prosi o oddzwonienie. Wejście: WYŁĄCZNIE wypowiedzi klienta
 * (nie agenta) — inaczej „oddzwonimy" z ust Ani liczyłoby się jako prośba.
 *
 * Reguły:
 *   • odmowa kontaktu / prośba o usunięcie wygrywa ze wszystkim,
 *   • wprost „oddzwoń / zadzwoń później" → prośba,
 *   • „nie mogę teraz rozmawiać" liczymy jako prośbę dopiero z podaną porą
 *     („jestem w pracy, proszę za godzinę") — samo „nie mogę teraz" nie
 *     wystarcza, bo bywa uprzejmym odesłaniem bez zamiaru rozmowy.
 */
export function detectCallbackRequest(
  userUtterances: string[],
  now: Date = new Date(),
  opts: { awaitingTime?: boolean } = {},
): CallbackRequest {
  const utterances = userUtterances.map((u) => u.trim()).filter(Boolean);
  if (utterances.length === 0) return { requested: false };
  const joined = utterances.join(" \n ");

  if (REFUSAL_RE.test(joined)) return { requested: false };

  // Ostatnia pasująca wypowiedź decyduje o terminie (klient mógł się poprawić).
  for (let i = utterances.length - 1; i >= 0; i--) {
    const u = utterances[i];
    const explicit = EXPLICIT_RE.test(u);
    const busy = BUSY_RE.test(u);
    const { dueAt, explicit: hasTime } = parseCallbackTime(u, now);
    const awaitingAnswer = opts.awaitingTime === true && hasTime;
    if (explicit || (busy && hasTime) || awaitingAnswer) {
      return { requested: true, dueAt, evidence: u.slice(0, 300), hasExplicitTime: hasTime };
    }
  }

  // Rozmowa złożona z kilku wypowiedzi: „nie mogę teraz" + w innej turze „za godzinę".
  if (BUSY_RE.test(joined)) {
    for (let i = utterances.length - 1; i >= 0; i--) {
      const { dueAt, explicit } = parseCallbackTime(utterances[i], now);
      if (explicit) {
        return {
          requested: true,
          dueAt,
          evidence: utterances[i].slice(0, 300),
          hasExplicitTime: true,
        };
      }
    }
  }
  return { requested: false };
}

/** Wypowiedzi KLIENTA z transkryptu ElevenLabs (role: user). */
export function userUtterancesFromTranscript(transcript: unknown): string[] {
  if (!Array.isArray(transcript)) return [];
  const out: string[] = [];
  for (const t of transcript as Array<Record<string, unknown>>) {
    const role = String(t?.role ?? t?.speaker ?? "").toLowerCase();
    if (role !== "user" && role !== "customer" && role !== "client") continue;
    const msg = String(t?.message ?? t?.text ?? "").trim();
    if (msg) out.push(msg);
  }
  return out;
}

/** Pierwsza wypowiedź Ani przy telefonie, który jest wykonaniem prośby klienta. */
export const CALLBACK_FIRST_MESSAGE =
  "Dzień dobry, tu Ania, asystent AI Finance You — rozmowa jest nagrywana. Miałam oddzwonić — czy możemy teraz porozmawiać?";

/** „dzisiaj o 15:00" / „jutro o 10:00" / „w piątek o 10:00" — do potwierdzenia SMS-em. */
export function describeCallbackTime(dueAt: Date, now: Date = new Date()): string {
  const hm = new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dueAt);
  const a = warsawDate(now);
  const b = warsawDate(dueAt);
  const days = Math.round((Date.UTC(b.y, b.m, b.d) - Date.UTC(a.y, a.m, a.d)) / 86_400_000);
  if (days <= 0) return `dzisiaj o ${hm}`;
  if (days === 1) return `jutro o ${hm}`;
  const weekday = new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "long",
  }).format(dueAt);
  return `w ${weekday} o ${hm}`;
}
