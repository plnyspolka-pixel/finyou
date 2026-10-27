export const FREE_LESSON_ID = "9e3b75e6-d396-4462-9847-5b5ce8bd2d1d";
export const FREE_LESSON_SLUG = "darmowa-lekcja";
export const VIDEO_TOKEN_TTL_DAYS = 30;
/**
 * Opis darmowej lekcji 1 (34:03) — zgodny z treścią nagrania (decyzja
 * właściciela 27.10.2026). Jedno źródło dla strony lekcji, karty w „Darmowych
 * materiałach” i odtwarzacza; te same teksty trafiają do bazy migracją
 * 20261027120000 (lead_magnets i training_videos).
 */
export const FREE_LESSON_COPY = {
  title: "Dlaczego po 15 latach inwestowania w nieruchomości wybrałem pożyczki pod hipotekę",
  subtitle:
    "Pierwsza lekcja szkolenia Filipa Bielaka, ok.\u00a035 minut. Obejrzyj od razu po zapisie; link w e‑mailu działa przez 30 dni.",
  benefits: [
    "Dlaczego wybrałem pożyczki pod zastaw, a nie inne sposoby inwestowania w nieruchomości — co sprawdziłem i jakie wnioski wyciągnąłem.",
    "Plusy i minusy tego modelu, których doświadczyłem przez 15 lat — bez upiększania.",
    "Ile realnie można na tym zarobić — konkretne liczby.",
  ],
  disclaimer: "Przykłady z lekcji nie są gwarancją zysku.",
} as const;
export const VIDEO_URL_TTL_SECONDS = 15 * 60;
export const VIDEO_MILESTONES = [0, 25, 50, 75, 100] as const;
export function lessonGrantValid(
  grant: {
    video_expires_at: string | null;
    consent: boolean;
    lead_magnets: { slug: string; published: boolean } | null;
  } | null,
  lessonId: string,
  now = Date.now(),
) {
  return Boolean(
    grant?.consent &&
    grant.lead_magnets?.published &&
    grant.lead_magnets.slug === FREE_LESSON_SLUG &&
    lessonId === FREE_LESSON_ID &&
    grant.video_expires_at &&
    new Date(grant.video_expires_at).getTime() > now,
  );
}
export function newVideoMilestones(percent: number, seen: Set<number>): number[] {
  return VIDEO_MILESTONES.filter((p) => percent >= p && !seen.has(p)).map((p) => {
    seen.add(p);
    return p;
  });
}
export async function videoTokenHash(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
