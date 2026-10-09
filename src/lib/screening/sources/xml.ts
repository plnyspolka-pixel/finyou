// Minimalne narzędzia do parsowania XML i HTML bez DOM (Cloudflare Workers
// nie ma DOMParser). Parsery źródeł operują na znanych, stabilnych strukturach,
// więc wystarczy wyszukiwanie elementów i atrybutów.

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", oacute: "ó", Oacute: "Ó",
  ndash: "–", mdash: "—", bdquo: "„", rdquo: "”", ldquo: "“", rsquo: "’", lsquo: "‘",
  hellip: "…", sect: "§", deg: "°", eacute: "é", Eacute: "É", uuml: "ü", ouml: "ö", auml: "ä",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Wszystkie wystąpienia elementu `<tag ...>...</tag>` lub `<tag .../>` (bez zagnieżdżeń tego samego tagu). */
export function elements(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?=[\\s>/])[^>]*?(?:/>|>[\\s\\S]*?</${tag}>)`, "g");
  return xml.match(re) ?? [];
}

/** Tekst pierwszego elementu `tag` (zdekodowany, przycięty) albo null. */
export function text(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  if (!m) return null;
  const t = decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
  return t || null;
}

/** Atrybuty znacznika otwierającego elementu. */
export function attrs(element: string): Record<string, string> {
  const open = element.match(/^<[^>]+>/)?.[0] ?? "";
  const out: Record<string, string> = {};
  for (const m of open.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = decodeEntities(m[2]);
  return out;
}

/** Tekst HTML bez znaczników, ze złączonymi białymi znakami. */
export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}
