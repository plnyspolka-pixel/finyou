// Porządek nagłówków w treści z markdownu (dokumenty prawne z bazy).

/**
 * Zostawia tylko pierwszy nagłówek „#” (tytuł dokumentu) jako H1; kolejne
 * (np. „# ZAŁĄCZNIK NR 1”) obniża do „##”, żeby strona miała jeden H1.
 */
export function singleH1(markdown: string): string {
  let seen = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (!/^#\s/.test(line)) return line;
      if (!seen) {
        seen = true;
        return line;
      }
      return `#${line}`;
    })
    .join("\n");
}
