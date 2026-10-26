export const FREE_LESSON_ID = "9e3b75e6-d396-4462-9847-5b5ce8bd2d1d";
export const FREE_LESSON_SLUG = "darmowa-lekcja";
export const VIDEO_TOKEN_TTL_DAYS = 30;
export const VIDEO_URL_TTL_SECONDS = 15 * 60;
export const VIDEO_MILESTONES = [0, 25, 50, 75, 100] as const;
export function lessonGrantValid(grant: { video_expires_at: string | null; consent: boolean; lead_magnets: { slug: string; published: boolean } | null } | null, lessonId: string, now = Date.now()) {
  return Boolean(grant?.consent && grant.lead_magnets?.published && grant.lead_magnets.slug === FREE_LESSON_SLUG && lessonId === FREE_LESSON_ID && grant.video_expires_at && new Date(grant.video_expires_at).getTime() > now);
}
export function newVideoMilestones(percent: number, seen: Set<number>): number[] {
  return VIDEO_MILESTONES.filter(p => percent >= p && !seen.has(p)).map(p => { seen.add(p); return p; });
}
export async function videoTokenHash(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}