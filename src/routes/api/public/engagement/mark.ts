// Linki „✅ Zrobione" / „⏭ Pomiń" z porannego digestu zaangażowania.
// Token w `t` jest podpisany HMAC (id pozycji + akcja + ważność 14 dni,
// src/lib/engagement/token.ts) — bez niego endpoint nic nie robi.
//
// GET niczego nie zapisuje: skanery linków w poczcie otwierają adresy bez
// JavaScriptu, więc strona tylko wysyła formularz (POST) z przeglądarki
// człowieka. Odpowiedź to mała strona „Zapisane ✓" — bez żadnych danych
// pozycji.
import { createFileRoute } from "@tanstack/react-router";
import { renderMarkPage } from "@/lib/engagement/email";
import { verifyMarkToken } from "@/lib/engagement/token";

const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

const page = (html: string, status = 200) => new Response(html, { status, headers: HEADERS });

async function secret(): Promise<string> {
  const { markSecret } = await import("@/lib/engagement/digest.server");
  return markSecret();
}

export const Route = createFileRoute("/api/public/engagement/mark")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("t") ?? "";
        const v = await verifyMarkToken(token, await secret());
        if (!v.ok) return page(renderMarkPage("invalid"), 400);
        return page(renderMarkPage("confirm", token));
      },
      POST: async ({ request }) => {
        let token = new URL(request.url).searchParams.get("t") ?? "";
        try {
          const fromBody = new URLSearchParams(await request.text()).get("t");
          if (fromBody) token = fromBody;
        } catch {
          /* brak ciała — zostaje token z adresu */
        }
        const v = await verifyMarkToken(token, await secret());
        if (!v.ok) return page(renderMarkPage("invalid"), 400);
        try {
          const { applyMarkAction } = await import("@/lib/engagement/digest.server");
          await applyMarkAction(v.id, v.action);
        } catch (e) {
          console.error("[engagement-mark]", e instanceof Error ? e.message : e);
          return page(renderMarkPage("error"), 500);
        }
        return page(renderMarkPage(v.action === "done" ? "done" : "skip"));
      },
    },
  },
});
