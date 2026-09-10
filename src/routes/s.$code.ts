// Krótki link z SMS-a: /s/<kod> → 302 na adres docelowy (świeży magic link,
// gdy znamy maila klienta). Publiczny, bez autoryzacji.
// (`/r/<kod>` to linki kampanii marketingowych, `/l/<slug>` to landing page —
// SMS-y mają własny prefiks, żeby przestrzenie kodów się nie mieszały.)
import { createFileRoute } from "@tanstack/react-router";
import { resolveShortLink, PUBLIC_SITE_ORIGIN } from "@/lib/short-link.server";

export const Route = createFileRoute("/s/$code")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const target = await resolveShortLink(String(params.code ?? ""));
          return Response.redirect(target || PUBLIC_SITE_ORIGIN, 302);
        } catch (e) {
          console.error("[short-link] resolve error", e);
          return Response.redirect(PUBLIC_SITE_ORIGIN, 302);
        }
      },
    },
  },
});
