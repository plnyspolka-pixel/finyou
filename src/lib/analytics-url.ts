/** Lesson grants are secrets, never analytics dimensions or referrers. */
export function analyticsPageUrl(raw: string): string {
  const url = new URL(raw);
  if (url.pathname === "/pobierz/darmowa-lekcja") url.searchParams.delete("t");
  return url.toString();
}