import { createFileRoute } from "@tanstack/react-router";

/** Anonymous download: no user input, cookies or document content stored. */
export const Route = createFileRoute("/api/public/store/free-loan-agreement")({
  server: {
    handlers: {
      GET: async () => {
        const { freeLoanAgreementDocx } = await import("@/lib/storefront/free-loan-agreement");
        const bytes = await freeLoanAgreementDocx();
        return new Response(new Uint8Array(bytes), {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": 'attachment; filename="finance-you-umowa-pozyczki-bez-zalacznikow.docx"',
            "Cache-Control": "public,max-age=3600",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
