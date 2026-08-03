// Pipeline YouTube (moduł 5 promptu SEO) — czysta logika: walidacja
// scenariusza z AI, budowa opisu YT (zawsze z linkiem do źródłowej
// podstrony) i sanityzacja tagów. Testowalne bez sieci/bazy.

export interface VideoScript {
  titleOptions: string[]; // 3 propozycje tytułów
  scriptMd: string; // scenariusz 5–8 min: hook, 3–4 sekcje, CTA
  description: string; // opis YT (z linkiem do źródła)
  tags: string[];
}

export const YT_TITLE_MAX = 100;
export const YT_DESCRIPTION_MAX = 5000;
export const YT_TAGS_MAX = 15;

export function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const tag = String(t ?? "")
      .trim()
      .replace(/^#/, "")
      .slice(0, 60);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= YT_TAGS_MAX) break;
  }
  return out;
}

/**
 * Opis YT: treść z AI + gwarantowany link do źródłowej podstrony i stała
 * stopka. Link do źródła jest wymogiem modułu — dokładamy go w kodzie,
 * nawet jeśli AI go pominęło.
 */
export function buildYtDescription(aiDescription: string, sourceUrl: string): string {
  const base = aiDescription.trim();
  const withLink = base.includes(sourceUrl) ? base : `${base}\n\n📖 Pełny artykuł: ${sourceUrl}`;
  const footer =
    `\n\nFinance You — pożyczki prywatne pod zastaw nieruchomości\n` +
    `https://financeyou.pl\n\n` +
    `Materiał ma charakter informacyjny i nie stanowi oferty w rozumieniu art. 66 KC.`;
  return (withLink + footer).slice(0, YT_DESCRIPTION_MAX);
}

/** Waliduje i normalizuje odpowiedź AI na kompletny scenariusz. */
export function parseVideoScript(
  args: Record<string, unknown>,
  sourceUrl: string,
): VideoScript | null {
  const titleOptions = Array.isArray(args.title_options)
    ? args.title_options
        .map((t) => String(t ?? "").trim())
        .filter(Boolean)
        .map((t) => t.slice(0, YT_TITLE_MAX))
        .slice(0, 3)
    : [];
  const scriptMd = String(args.script_md ?? "").trim();
  const description = String(args.description ?? "").trim();
  const tags = sanitizeTags(args.tags);

  if (titleOptions.length < 3 || !scriptMd || !description) return null;
  // Scenariusz 5–8 min mówienia to z grubsza 650–1200 słów — sprawdzamy
  // jedynie dolny próg sensowności (nie blokujemy dłuższych).
  if (scriptMd.split(/\s+/).length < 300) return null;

  return {
    titleOptions,
    scriptMd,
    description: buildYtDescription(description, sourceUrl),
    tags,
  };
}
