import { createFileRoute, redirect } from "@tanstack/react-router";
import { recordEmailClick } from "@/lib/loan-reminder-emails.server";

export const Route = createFileRoute("/api/public/email/click")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sendId = url.searchParams.get("s");
        const fallback = process.env.PUBLIC_BASE_URL || "https://financeyou.pl";
        if (!sendId) return Response.redirect(fallback, 302);
        try {
          const target = await recordEmailClick(sendId);
          return Response.redirect(target || fallback, 302);
        } catch {
          return Response.redirect(fallback, 302);
        }
      },
    },
  },
});
