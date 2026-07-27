import { createFileRoute } from "@tanstack/react-router";
import { recordEmailOpen } from "@/lib/loan-reminder-emails.server";

const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
  0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

export const Route = createFileRoute("/api/public/email/open")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sid = url.searchParams.get("s");
        if (sid) {
          try {
            await recordEmailOpen(sid);
          } catch {}
        }
        return new Response(PIXEL, {
          status: 200,
          headers: {
            "content-type": "image/gif",
            "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
            pragma: "no-cache",
          },
        });
      },
    },
  },
});
