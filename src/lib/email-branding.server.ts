// Wspólny "wrapper" brandujący wszystkie maile wychodzące Finance You.
// Dodaje: favicon (góra), wordmark + linki w stopce, zachętę do odpisania.
// Aby pominąć (np. szablon już zbrandowany), użyj noBranding=true lub
// wstaw w HTML marker: data-fy-branded.

const FAVICON_URL =
  "https://financeyou.pl/__l5e/assets-v1/73e2df85-6890-4ae6-a18a-debbc0970e07/favicon-mark.png";
const WORDMARK_URL =
  "https://financeyou.pl/__l5e/assets-v1/78c589be-8669-4bdf-a471-ff97875e8d7a/financeyou-wordmark.png";

const BRAND_MARKER = "data-fy-branded";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Zamienia URL-e w klikalne linki + zachowuje akapity z tekstu.
function textToInnerHtml(text: string): string {
  const escaped = escapeHtml(text);
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#111;text-decoration:underline" target="_blank" rel="noopener">$1</a>',
  );
  const paragraphs = linked
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="font-size:14px;color:#222;line-height:1.6;margin:0 0 14px">${p.replace(/\n/g, "<br/>")}</p>`,
    )
    .join("\n");
  return paragraphs;
}

export interface BrandOptions {
  innerHtml?: string;
  text?: string;
  unsubscribeUrl?: string;
  showReplyHint?: boolean; // domyślnie true
}

export function wrapBrandedEmail(opts: BrandOptions): string {
  const inner = opts.innerHtml ?? (opts.text ? textToInnerHtml(opts.text) : "");
  const showReply = opts.showReplyHint !== false;
  const unsub = opts.unsubscribeUrl
    ? `<a href="${opts.unsubscribeUrl}" style="color:#888;text-decoration:underline">Wypisz mnie</a> · `
    : "";

  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body ${BRAND_MARKER} style="margin:0;padding:0;background:#ffffff;font-family:Arial,sans-serif;color:#222">
<div style="max-width:580px;margin:0 auto;padding:24px 20px">
  <a href="https://financeyou.pl" style="display:block;text-align:center;text-decoration:none">
    <img src="${FAVICON_URL}" width="64" height="64" alt="Finance You" style="display:block;margin:0 auto 18px;border:0"/>
  </a>
  ${inner}
  ${
    showReply
      ? `<p style="font-size:14px;color:#111;margin:24px 0 6px"><strong>Masz pytanie? Po prostu odpisz na tego maila.</strong></p>
  <p style="font-size:13px;color:#555;margin:0 0 18px">Czytamy każdą wiadomość — pomożemy rozwiać wątpliwości, doprecyzować warunki lub pokazać alternatywy.</p>`
      : ""
  }
  <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
  <a href="https://financeyou.pl" style="display:block;text-align:center;text-decoration:none;margin:0 0 10px">
    <img src="${WORDMARK_URL}" width="180" alt="financeyou.pl" style="display:block;margin:0 auto;border:0;max-width:60%;height:auto"/>
  </a>
  <p style="font-size:12px;color:#888;text-align:center;margin:0 0 6px">
    <a href="https://financeyou.pl" style="color:#888;text-decoration:none">financeyou.pl</a> ·
    <a href="https://financeyou.pl/blog" style="color:#888;text-decoration:none">blog</a> ·
    <a href="mailto:kontakt@financeyou.pl" style="color:#888;text-decoration:none">kontakt@financeyou.pl</a>
  </p>
  <p style="font-size:11px;color:#aaa;text-align:center;margin:0">
    ${unsub}Finance You — pożyczki pod zastaw nieruchomości.
  </p>
</div>
</body></html>`;
}

export function isAlreadyBranded(html: string | undefined | null): boolean {
  if (!html) return false;
  return html.includes(BRAND_MARKER);
}
