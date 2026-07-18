// Lekki, bezzależnościowy sanitizer HTML (defense-in-depth) dla treści z
// zewnętrznych źródeł (np. dokumenty KW/EKW pobierane przez CMD), które
// renderujemy przez dangerouslySetInnerHTML. Działa izomorficznie:
//  - w przeglądarce: parsuje drzewo DOM i usuwa niedozwolone elementy/atrybuty
//    (whitelist) — odporne na sztuczki składniowe HTML,
//  - na serwerze (SSR): stosuje ostrożny pre-pass regexowy, który wycina
//    całe bloki <script>/<style>/<iframe> itp., atrybuty zdarzeń oraz
//    niebezpieczne URL-e. Dzięki temu żaden skrypt nie trafia do initial HTML.

const BLOCK_TAG_CONTENT =
  /<\s*(script|style|iframe|object|embed|form|svg|math|template|noscript|link|meta|base)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
const SELF_CLOSING_DANGEROUS =
  /<\s*(script|style|iframe|object|embed|form|svg|math|template|noscript|link|meta|base)\b[^>]*\/?\s*>/gi;
const EVENT_HANDLER_ATTR = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URI_ATTR =
  /\s+(href|src|xlink:href|action|formaction)\s*=\s*("\s*(?:javascript|vbscript|data(?!:image\/)):[^"]*"|'\s*(?:javascript|vbscript|data(?!:image\/)):[^']*'|\s*(?:javascript|vbscript):[^\s>]+)/gi;

function regexSanitize(html: string): string {
  let out = html;
  let prev: string;
  // Iteruj do stabilizacji — usuwa zagnieżdżone/rozbite konstrukcje.
  do {
    prev = out;
    out = out
      .replace(BLOCK_TAG_CONTENT, "")
      .replace(SELF_CLOSING_DANGEROUS, "")
      .replace(EVENT_HANDLER_ATTR, "")
      .replace(JS_URI_ATTR, "");
  } while (out !== prev);
  return out;
}

const ALLOWED_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "code",
  "col",
  "colgroup",
  "dd",
  "div",
  "dl",
  "dt",
  "em",
  "figure",
  "figcaption",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "s",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);
const ALLOWED_ATTRS = new Set([
  "href",
  "src",
  "alt",
  "title",
  "colspan",
  "rowspan",
  "class",
  "align",
  "width",
  "height",
  "scope",
]);

function isSafeUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.startsWith("javascript:") || v.startsWith("vbscript:")) return false;
  if (v.startsWith("data:") && !v.startsWith("data:image/")) return false;
  return true;
}

function domSanitize(html: string): string {
  const doc = new DOMParser().parseFromString(regexSanitize(html), "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const toRemove: Element[] = [];
  let node = walker.nextNode() as Element | null;
  while (node) {
    const tag = node.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      toRemove.push(node);
    } else {
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on") || !ALLOWED_ATTRS.has(name)) {
          node.removeAttribute(attr.name);
        } else if ((name === "href" || name === "src") && !isSafeUrl(attr.value)) {
          node.removeAttribute(attr.name);
        }
      }
      if (tag === "a") {
        node.setAttribute("rel", "noopener noreferrer nofollow");
      }
    }
    node = walker.nextNode() as Element | null;
  }
  // Usuń niedozwolone elementy, zachowując ich dzieci (unwrap).
  for (const el of toRemove) {
    const parent = el.parentNode;
    if (!parent) continue;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }
  return doc.body.innerHTML;
}

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return "";
  try {
    if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
      return domSanitize(html);
    }
  } catch {
    // Fallback poniżej.
  }
  return regexSanitize(html);
}
