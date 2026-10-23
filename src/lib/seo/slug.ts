// Normalizacja slugów w adresach publicznych (blog): małe litery, bez polskich
// znaków, tylko [a-z0-9-]. Linki w treści artykułów bywają pisane „z polskimi
// znakami” (np. `/blog/jak-banki-i-firmy-pożyczkowe-...`), a slug w bazie jest
// ASCII — bez normalizacji taki link kończy się 404.

export function asciiSlug(raw: string): string {
  let s = raw;
  try {
    s = decodeURIComponent(s);
  } catch {
    // niepoprawne kodowanie — zostawiamy jak jest
  }
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}
