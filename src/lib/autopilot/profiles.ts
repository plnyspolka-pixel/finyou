// Profile dwóch torów odbiorców (brief 2.2, 5.1) i dynamiczny podział
// kadencji. Obecne ustawienia silnika wzrostu (target_audience,
// primary_cta_url, daily_ai_budget_pln) stają się profilem „pożyczkobiorca”.
// Profil zapisany w ai_growth_settings.audience_profiles nadpisuje domyślny
// pole po polu. Czysty moduł – bez I/O.
import { z } from "zod";
import { TRACKS, type Track } from "./types";

export const INVESTOR_PAGE_URL = "https://financeyou.pl/dla-inwestora";
export const BORROWER_DEFAULT_CTA_URL = "https://app.financeyou.pl/embed/wniosek";

const slotSchema = z.object({
  platform: z.enum(["instagram_reels", "facebook_reels", "youtube", "tiktok", "x"]),
  /** Dni tygodnia 1 = pon … 7 = niedz. */
  weekdays: z.array(z.number().int().min(1).max(7)).min(1),
  /** Godzina lokalna Europe/Warsaw „HH:MM”. */
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
export type PublishSlot = z.infer<typeof slotSchema>;

export const audienceProfileSchema = z.object({
  track: z.enum(TRACKS),
  label: z.string().min(2),
  targetGroup: z.string().min(5),
  tone: z.string().min(5),
  ctaUrl: z.string().url(),
  ctaLabel: z.string().min(2),
  /** Pierwszy komentarz YouTube; osobny od CTA opisu i innych platform. */
  youtubeFirstComment: z.object({
    text: z.string().trim().min(1).max(8000),
    url: z.string().url().max(1000).refine((v) => v.startsWith("https://")),
  }).optional(),
  allowedTopics: z.array(z.string()).default([]),
  /** Dodatkowe frazy zakazane w torze (poza regułami twardymi w kodzie). */
  forbiddenPhrases: z.array(z.string()).default([]),
  slots: z.array(slotSchema).default([]),
  /** Rolek na tydzień w torze (brief 5.3: 5–7). */
  weeklyReels: z.number().int().min(0).max(21),
  /** Dłuższych odcinków na tydzień w torze. */
  weeklyLongform: z.number().int().min(0).max(3),
  /** Budżet AI dzienny przypisany torowi (część wspólnego limitu). */
  dailyAiBudgetPln: z.number().min(0).max(1000),
  /** Budżet reklam (podbicia) na miesiąc – 0 = podbicia wyłączone. */
  monthlyAdBudgetPln: z.number().min(0).max(100000),
  /** Szacowana wartość leada (do podziału kadencji). */
  leadValuePln: z.number().min(0).max(1_000_000),
});
export type AudienceProfile = z.infer<typeof audienceProfileSchema>;

export const audienceProfilesPatchSchema = z
  .object({
    pozyczkobiorca: audienceProfileSchema.partial().optional(),
    inwestor: audienceProfileSchema.partial().optional(),
  })
  .strict();
export type AudienceProfilesPatch = z.infer<typeof audienceProfilesPatchSchema>;

export interface GrowthSettingsRow {
  target_audience?: string | null;
  primary_cta_url?: string | null;
  daily_ai_budget_pln?: number | string | null;
  audience_profiles?: unknown;
}

/** Sloty startowe: IG/FB 16:00–17:00 (polski szczyt), tory rozdzielone. */
const SLOTS: Record<Track, PublishSlot[]> = {
  pozyczkobiorca: [
    { platform: "instagram_reels", weekdays: [1, 2, 3, 4, 5, 6], time: "16:00" },
    { platform: "facebook_reels", weekdays: [1, 2, 3, 4, 5, 6], time: "16:05" },
    { platform: "youtube", weekdays: [1, 2, 3, 4, 5, 6], time: "18:00" },
  ],
  inwestor: [
    { platform: "instagram_reels", weekdays: [1, 2, 3, 4, 5, 6], time: "16:45" },
    { platform: "facebook_reels", weekdays: [1, 2, 3, 4, 5, 6], time: "16:50" },
    { platform: "youtube", weekdays: [1, 2, 3, 4, 5, 6], time: "19:00" },
  ],
};

export function defaultProfiles(row: GrowthSettingsRow = {}): Record<Track, AudienceProfile> {
  const totalBudget = Number(row.daily_ai_budget_pln ?? 50) || 50;
  return {
    pozyczkobiorca: {
      track: "pozyczkobiorca",
      label: "Pożyczkobiorca",
      // Decyzja właściciela 21.10.2026: w rolkach nie akcentujemy, że oferta
      // jest tylko dla firm — warunki klient poznaje przy wniosku
      // (autopilot/track-voice.ts). Reguła „konsument” w compliance zostaje.
      targetGroup:
        row.target_audience?.trim() ||
        "Osoby, które potrzebują szybkiego finansowania pod zastaw nieruchomości, często po odmowie banku. W rolkach NIE akcentujemy, że oferta jest tylko dla firm – mówimy po prostu o pożyczkach pod nieruchomość; warunki (w tym działalność gospodarcza) klient poznaje na etapie wniosku.",
      tone: "Konkretnie, po ludzku, bez straszenia. Widz jest bohaterem; pokazujemy, co może zrobić, decyzja zostaje po jego stronie. Nie powtarzamy słów „firma”, „przedsiębiorca”, „działalność” – maksymalnie raz i tylko gdy temat tego wymaga.",
      ctaUrl: row.primary_cta_url?.trim() || BORROWER_DEFAULT_CTA_URL,
      ctaLabel: "Złóż bezpłatny wniosek",
      youtubeFirstComment: {
        text: "👉 Sprawdź, ile możesz uzyskać pod swoją nieruchomość — złóż bezpłatny wniosek:",
        url: "https://financeyou.pl/r/kuugaim5",
      },
      allowedTopics: [
        "odmowa banku i alternatywy",
        "LTV i ile można uzyskać pod nieruchomość",
        "dokumenty i proces od wniosku do wypłaty",
        "mity o finansowaniu pozabankowym",
        "płynność i szybkie finansowanie",
      ],
      forbiddenPhrases: [],
      slots: SLOTS.pozyczkobiorca,
      weeklyReels: 6,
      weeklyLongform: 1,
      dailyAiBudgetPln: Math.round((totalBudget / 2) * 100) / 100,
      monthlyAdBudgetPln: 0,
      leadValuePln: 0,
    },
    inwestor: {
      track: "inwestor",
      label: "Inwestor prywatny",
      targetGroup:
        "Prywatni inwestorzy szukający sposobu na zarabianie na nieruchomościach bez kupowania, budowania i remontowania",
      tone: "Szanse, nie straszenie. Wolność finansowa, „zarabiaj tak, jak banki od stuleci” – z jednym uczciwym zdaniem o ryzyku (nie więcej).",
      ctaUrl: INVESTOR_PAGE_URL,
      ctaLabel: "Zobacz, jak to działa",
      youtubeFirstComment: {
        text: "👉 Jak zarabiać na pożyczkach zabezpieczonych hipoteką — i jakie ryzyko się z tym wiąże:",
        url: "https://financeyou.pl/r/0eurrzyb",
      },
      allowedTopics: [
        "jak bank zarabia na odsetkach",
        "zabezpieczenie hipoteczne i LTV",
        "księga wieczysta i ocena zabezpieczenia",
        "błędy inwestora",
        "pierwsze kroki",
      ],
      forbiddenPhrases: [],
      slots: SLOTS.inwestor,
      weeklyReels: 6,
      weeklyLongform: 1,
      dailyAiBudgetPln: Math.round((totalBudget / 2) * 100) / 100,
      monthlyAdBudgetPln: 0,
      leadValuePln: 0,
    },
  };
}

/** Profile efektywne = domyślne ⊕ zapisane (nieprawidłowy zapis → domyślne + błąd). */
export function resolveProfiles(row: GrowthSettingsRow = {}): {
  profiles: Record<Track, AudienceProfile>;
  errors: string[];
} {
  const base = defaultProfiles(row);
  const errors: string[] = [];
  const stored = row.audience_profiles;
  if (stored == null) return { profiles: base, errors };
  const patch = audienceProfilesPatchSchema.safeParse(stored);
  if (!patch.success) {
    errors.push(`audience_profiles: ${patch.error.issues.map((i) => i.message).join("; ")}`);
    return { profiles: base, errors };
  }
  const out = { ...base };
  for (const t of TRACKS) {
    const p = patch.data[t];
    if (!p) continue;
    const merged = audienceProfileSchema.safeParse({ ...base[t], ...p, track: t });
    if (merged.success) out[t] = merged.data;
    else errors.push(`${t}: ${merged.error.issues.map((i) => i.message).join("; ")}`);
  }
  return { profiles: out, errors };
}

// ── podział kadencji między tory (brief 5.1) ─────────────────────────────────

export type CadenceSplit = Record<Track, number>;
export const DEFAULT_SPLIT: CadenceSplit = { pozyczkobiorca: 50, inwestor: 50 };
export const MAX_WEEKLY_SHIFT_PP = 10;
export const SPLIT_BOUNDS = { min: 20, max: 80 } as const;

export interface TrackEconomics {
  leads: number;
  /** Koszt (AI + reklamy) w tym samym okresie. */
  costPln: number;
  leadValuePln: number;
}

export function parseSplit(v: unknown): CadenceSplit {
  const o = (v ?? {}) as Partial<Record<Track, unknown>>;
  const a = Number(o.pozyczkobiorca);
  const b = Number(o.inwestor);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a + b <= 0) return { ...DEFAULT_SPLIT };
  const pa = Math.round((a / (a + b)) * 100);
  return { pozyczkobiorca: pa, inwestor: 100 - pa };
}

/**
 * Nowy podział kadencji: tor z wyższym (wartość leada × leady − koszt) / koszt
 * dostaje więcej, ale zmiana ≤ 10 p.p. na tydzień i udział w [20, 80].
 * Bez danych (0 leadów w obu torach) – bez zmiany.
 */
export function adjustCadenceSplit(
  current: CadenceSplit,
  econ: Record<Track, TrackEconomics>,
  lastChangedAt: Date | null,
  now: Date,
): { split: CadenceSplit; changed: boolean; reason: string } {
  if (lastChangedAt && now.getTime() - lastChangedAt.getTime() < 7 * 86_400_000) {
    return { split: current, changed: false, reason: "Zmiana możliwa raz na 7 dni." };
  }
  const score = (e: TrackEconomics) => {
    const value = e.leads * e.leadValuePln;
    return value / Math.max(1, e.costPln);
  };
  if (econ.pozyczkobiorca.leads + econ.inwestor.leads === 0) {
    return { split: current, changed: false, reason: "Brak leadów – za mało danych." };
  }
  const sa = score(econ.pozyczkobiorca);
  const sb = score(econ.inwestor);
  const target = sa + sb > 0 ? Math.round((sa / (sa + sb)) * 100) : current.pozyczkobiorca;
  const delta = Math.max(
    -MAX_WEEKLY_SHIFT_PP,
    Math.min(MAX_WEEKLY_SHIFT_PP, target - current.pozyczkobiorca),
  );
  const next = Math.max(
    SPLIT_BOUNDS.min,
    Math.min(SPLIT_BOUNDS.max, current.pozyczkobiorca + delta),
  );
  if (next === current.pozyczkobiorca) {
    return { split: current, changed: false, reason: "Podział optymalny w granicach limitów." };
  }
  return {
    split: { pozyczkobiorca: next, inwestor: 100 - next },
    changed: true,
    reason: `Wartość/koszt: pożyczkobiorca ${sa.toFixed(2)}, inwestor ${sb.toFixed(2)} → ${next}/${100 - next}.`,
  };
}

/** Rozkład tygodniowej liczby rolek na tory wg podziału (suma = total). */
export function allocateWeekly(split: CadenceSplit, total: number): Record<Track, number> {
  const a = Math.round((total * split.pozyczkobiorca) / 100);
  return { pozyczkobiorca: a, inwestor: total - a };
}
