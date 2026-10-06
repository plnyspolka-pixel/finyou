// Osobisty link do pliku lead magnetu z maila: /pobierz-plik/<token> → 302 na
// krótki podpisany adres w Storage (albo zewnętrzny URL materiału) + licznik
// pobrań. Publiczny, bez autoryzacji — token jest sekretem adresata.
import { createFileRoute } from "@tanstack/react-router";
import { SITE_URL } from "@/lib/seo/company";
import { leadMagnetPath } from "@/lib/lead-magnets/core";

export const Route = createFileRoute("/pobierz-plik/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { resolveLeadMagnetDownload } =
            await import("@/lib/lead-magnets/lead-magnets.server");
          const r = await resolveLeadMagnetDownload(String(params.token ?? ""));
          if (r.ok) {
            return new Response(null, {
              status: 302,
              headers: { Location: r.url, "Cache-Control": "no-store" },
            });
          }
          // Brak pliku / nieznany token — wracamy na stronę materiału albo główną.
          const back = r.slug ? `${SITE_URL}${leadMagnetPath(r.slug)}` : SITE_URL;
          return Response.redirect(back, 302);
        } catch (e) {
          console.error("[lead-magnet] download resolve error", e);
          return Response.redirect(SITE_URL, 302);
        }
      },
    },
  },
});
