// STRATEGIA AGENTA WZROSTU — co publikować, dla kogo, jakim haczykiem i kiedy.
//
// Uczenie: niezależny bandyta Thompsona per wymiar (odbiorca, filar treści,
// haczyk, pora). Przy małym profilu (dziesiątki obserwujących) danych jest
// mało, więc model faktoryzowany uczy się szybciej niż kombinacje. Nagroda
// z zaangażowania względem mediany konta (scoring.ts).
//
// Ograniczenia twarde (nie podlegają uczeniu): rozrywka najwyżej co piąty
// post, „dowód" tylko z faktów systemu, odbiorcy na zmianę gdy 3 posty pod
// rząd poszły do jednej grupy, pytanie z bazy 250 nie wraca przez 60 dni.
//
// Czysty moduł; losowość wstrzykiwana (testy deterministyczne).

export const AUDIENCES = ["inwestor", "pozyczkobiorca"] as const;
export const PILLARS = ["edukacja", "informacja", "rozrywka", "zaangazowanie", "dowod"] as const;
export const HOOKS = [
  "pytanie",
  "mit_fakt",
  "liczba",
  "historia",
  "kontra",
  "lista",
  "czy_wiesz",
] as const;
/** Pory (czas Warszawy). 15:00 zajmuje codzienna rolka — nie kolidujemy. */
export const SLOTS = ["07:40", "12:10", "19:05"] as const;
/**
 * Pory rolek (czas Warszawy). 17:00 to dotychczasowa pora codziennej rolki;
 * bandyta uczy się, czy południe albo wieczór działają lepiej. Nie kolidują
 * z porami postów tekstowych.
 */
export const REEL_SLOTS = ["12:30", "17:00", "20:30"] as const;

export type AudienceKey = (typeof AUDIENCES)[number];
export type PillarKey = (typeof PILLARS)[number];
export type HookKey = (typeof HOOKS)[number];
export type SlotKey = (typeof SLOTS)[number];
export type ReelSlotKey = (typeof REEL_SLOTS)[number];

export interface Features {
  audience: AudienceKey;
  pillar: PillarKey;
  hook: HookKey;
  slot: SlotKey | ReelSlotKey;
}

export interface ArmStat {
  alpha: number;
  beta: number;
  pulls: number;
}
export type ArmTable = Record<string, ArmStat>;

export const PILLAR_BRIEF: Record<PillarKey, string> = {
  edukacja:
    "Wyjaśnij jeden mechanizm prosto i konkretnie (np. LTV, księga wieczysta, hipoteka na 2. miejscu, art. 777, harmonogram). Widz ma wyjść mądrzejszy.",
  informacja:
    "Aktualność albo fakt z rynku/prawa (stopy NBP, odsetki maksymalne, zmiany przepisów) i co z niego wynika dla widza. Tylko fakty z podanych źródeł.",
  rozrywka:
    "Subtelny humor z życia przedsiębiorcy albo inwestora (sytuacja, z którą każdy się utożsami), lekko i z klasą — ale z merytoryczną puentą. Bez kpin z ludzi w kłopotach finansowych.",
  zaangazowanie:
    "Krótkie pytanie albo mini-ankieta do odbiorców (np. „A czy B?”), które zachęca do komentarza. Daj własną odpowiedź w drugim zdaniu.",
  dowod:
    "Konkret o tym, jak działa proces Finance You (kroki, zabezpieczenia, narzędzia), oparty wyłącznie na FAKTACH Z SYSTEMU — bez wymyślonych historii klientów i bez liczb spoza faktów.",
};

export const HOOK_BRIEF: Record<HookKey, string> = {
  pytanie: "Zacznij od pytania, które widz sobie zadaje.",
  mit_fakt: "Zacznij od popularnego mitu, potem fakt („Mit: … Fakt: …”).",
  liczba: "Zacznij od jednej konkretnej liczby z FAKTÓW (np. 60% LTV, 14,5% odsetek maksymalnych).",
  historia: "Zacznij od krótkiej, typowej sytuacji (bez nazwisk, bez wymyślonych liczb klienta).",
  kontra: "Zacznij od tezy wbrew intuicji, którą potem uczciwie uzasadnisz.",
  lista: "Zapowiedz 3 punkty i je wypunktuj.",
  czy_wiesz: "Zacznij od „Czy wiesz, że…” z prawdziwym, mało znanym faktem.",
};

export function armKey(dim: keyof Features, value: string): string {
  return `${dim}:${value}`;
}

function stat(arms: ArmTable, key: string): ArmStat {
  return arms[key] ?? { alpha: 1, beta: 1, pulls: 0 };
}

/** Aktualizacja bandyty nagrodą 0..1 dla wszystkich wymiarów posta. */
export function updateArms(arms: ArmTable, f: Features, reward: number): ArmTable {
  const r = Math.max(0, Math.min(1, reward));
  const out: ArmTable = { ...arms };
  for (const [dim, value] of Object.entries(f) as Array<[keyof Features, string]>) {
    const k = armKey(dim, value);
    const s = stat(out, k);
    out[k] = { alpha: s.alpha + r, beta: s.beta + (1 - r), pulls: s.pulls + 1 };
  }
  return out;
}

// ── losowanie ──────────────────────────────────────────────────────────────

export type Rng = () => number;

/** Deterministyczny generator (testy, powtarzalność planu w dry-run). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma(shape, 1) — Marsaglia–Tsang. */
function gamma(shape: number, rng: Rng): number {
  if (shape < 1) return gamma(shape + 1, rng) * Math.pow(Math.max(rng(), 1e-12), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(Math.max(u, 1e-12)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function betaSample(alpha: number, beta: number, rng: Rng): number {
  const x = gamma(alpha, rng);
  const y = gamma(beta, rng);
  return x / (x + y);
}

function pickThompson<T extends string>(
  dim: keyof Features,
  values: readonly T[],
  arms: ArmTable,
  rng: Rng,
  allowed?: (v: T) => boolean,
): T {
  let best: T = values[0];
  let bestScore = -1;
  for (const v of values) {
    if (allowed && !allowed(v)) continue;
    const s = stat(arms, armKey(dim, v));
    const score = betaSample(s.alpha, s.beta, rng);
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

// ── planowanie ─────────────────────────────────────────────────────────────

export interface HistoryItem {
  audience: AudienceKey;
  pillar: PillarKey;
  hook?: HookKey;
  questionId?: number | null;
  createdAt: string;
}

export interface PlanInput {
  arms: ArmTable;
  history: HistoryItem[];
  now: Date;
  rng: Rng;
  /** Pory już zajęte dziś/jutro (ISO) — nie planujemy dwóch postów na tę samą porę. */
  takenSlotsIso?: string[];
  /** Pory do wyboru (domyślnie pory postów; rolki mają własne). */
  slots?: readonly (SlotKey | ReelSlotKey)[];
  questionBank: Array<{
    id: number;
    category: "klient" | "inwestor";
    question: string;
    thesis: string;
    section: string;
  }>;
}

export interface PostPlan extends Features {
  slotIso: string;
  question: { id: number; question: string; thesis: string; section: string } | null;
}

/** Najbliższe wystąpienie pory (czas Warszawy) po `now`, z pominięciem zajętych. */
export function nextSlotIso(slot: SlotKey | ReelSlotKey, now: Date, taken: string[] = []): string {
  const [hh, mm] = slot.split(":").map(Number);
  const takenSet = new Set(taken.map((t) => t.slice(0, 16)));
  for (let dayOffset = 0; dayOffset < 4; dayOffset++) {
    const iso = warsawToUtcIso(now, dayOffset, hh, mm);
    if (new Date(iso).getTime() > now.getTime() + 20 * 60_000 && !takenSet.has(iso.slice(0, 16)))
      return iso;
  }
  return warsawToUtcIso(now, 4, hh, mm);
}

/** Data „dzień + offset" w Warszawie o hh:mm → ISO UTC (uwzględnia czas letni). */
export function warsawToUtcIso(now: Date, dayOffset: number, hh: number, mm: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now.getTime() + dayOffset * 86_400_000));
  // Przesunięcie Warszawy względem UTC w tym dniu.
  const probe = new Date(`${parts}T12:00:00Z`);
  const warsawNoon = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    hour12: false,
  }).format(probe);
  const offsetH = Number(warsawNoon) - 12;
  const utc = new Date(
    `${parts}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`,
  );
  return new Date(utc.getTime() - offsetH * 3600_000).toISOString();
}

export function planNextPost(input: PlanInput): PostPlan {
  const { arms, history, rng } = input;
  const recent = [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const last3 = recent.slice(0, 3).map((h) => h.audience);
  const forceAudience: AudienceKey | null =
    last3.length === 3 && last3.every((a) => a === last3[0])
      ? last3[0] === "inwestor"
        ? "pozyczkobiorca"
        : "inwestor"
      : null;
  const audience = forceAudience ?? pickThompson("audience", AUDIENCES, arms, rng);

  const last5 = recent.slice(0, 5).map((h) => h.pillar);
  const pillar = pickThompson("pillar", PILLARS, arms, rng, (p) => {
    if (p === "rozrywka" && last5.includes("rozrywka")) return false;
    if (recent[0]?.pillar === p) return false; // dwa razy pod rząd ten sam filar — nuda
    return true;
  });
  const hook = pickThompson("hook", HOOKS, arms, rng, (h) => recent[0]?.hook !== h);
  const slot = pickThompson("slot", input.slots ?? SLOTS, arms, rng);
  const slotIso = nextSlotIso(slot, input.now, input.takenSlotsIso);

  // Pytanie z bazy 250 — merytoryczna kotwica (sprawdzona prawnie), bez powtórek przez 60 dni.
  const cutoff = input.now.getTime() - 60 * 86_400_000;
  const used = new Set(
    recent
      .filter((h) => new Date(h.createdAt).getTime() >= cutoff && h.questionId != null)
      .map((h) => h.questionId),
  );
  const category = audience === "inwestor" ? "inwestor" : "klient";
  const pool = input.questionBank.filter((q) => q.category === category && !used.has(q.id));
  const question =
    pillar === "rozrywka" && rng() < 0.5
      ? null
      : pool.length
        ? pool[Math.floor(rng() * pool.length)]
        : null;

  return {
    audience,
    pillar,
    hook,
    slot,
    slotIso,
    question: question
      ? {
          id: question.id,
          question: question.question,
          thesis: question.thesis,
          section: question.section,
        }
      : null,
  };
}

// ── klasyfikacja istniejących treści (ciepły start z historii profilu) ─────

export function classifyContent(text: string): Pick<Features, "audience" | "pillar" | "hook"> {
  const t = text.toLowerCase();
  const audience: AudienceKey = /inwest|kapitał|zysk|zwrot|lokat|portfel|zarabia/.test(t)
    ? "inwestor"
    : "pozyczkobiorca";
  let pillar: PillarKey = "edukacja";
  if (/stopy|nbp|rpp|ustaw|przepis|knf|rynek|202\d/.test(t)) pillar = "informacja";
  if (/😂|😅|🙃|haha|mem|kiedy .* a ty/.test(t)) pillar = "rozrywka";
  if (/a ty\?|które wybierasz|co wybierasz|napisz w komentarzu|ankiet/.test(t))
    pillar = "zaangazowanie";
  const first = t.split(/[.!?\n]/)[0] ?? "";
  let hook: HookKey = "pytanie";
  if (/^\s*mit|mit:/.test(t)) hook = "mit_fakt";
  else if (/czy wiesz/.test(first)) hook = "czy_wiesz";
  else if (/\d/.test(first)) hook = "liczba";
  else if (/\?/.test(first)) hook = "pytanie";
  else if (/^(\s*)(1\.|3 |trzy )/.test(t)) hook = "lista";
  else hook = "kontra";
  return { audience, pillar, hook };
}

/** Najbliższa pora z listy dla godziny publikacji (do ciepłego startu). */
export function slotForDate(iso: string): SlotKey {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(iso)),
  );
  if (h < 10) return "07:40";
  if (h < 16) return "12:10";
  return "19:05";
}

/** Podsumowanie bandyty do raportu: średnia skuteczność per wartość. */
export function summarizeArms(arms: ArmTable): Array<{ key: string; mean: number; pulls: number }> {
  return Object.entries(arms)
    .map(([key, s]) => ({
      key,
      mean: Math.round((s.alpha / (s.alpha + s.beta)) * 100) / 100,
      pulls: s.pulls,
    }))
    .sort((a, b) => b.mean - a.mean);
}
