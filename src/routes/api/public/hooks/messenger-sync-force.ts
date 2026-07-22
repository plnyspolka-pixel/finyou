// Forced Messenger/IG sync + attachment backfill (idempotent, protected by
// CRON_SECRET or anon `apikey` header). Bypasses the 1h throttle used by
// follow-up-tick, so you can trigger it on demand for debugging.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/cron-auth.server";

async function run() {
  const out: any = {};
  try {
    const { syncMessengerConversations, backfillGraphSyncAttachments } = await import(
      "@/lib/messenger-sync.server"
    );
    const sync = await syncMessengerConversations({
      platform: "both",
      maxConversationsPerPage: 200,
    });
    out.sync = {
      conversationsSeen: sync.conversationsSeen,
      messagesNew: sync.messagesNew,
      leadsCreated: sync.leadsCreated,
      errors: sync.errors.slice(0, 5),
    };
    const atts = await backfillGraphSyncAttachments({ maxMessages: 500 });
    out.attachments = {
      messagesProcessed: atts.messagesProcessed,
      attachmentsDownloaded: atts.attachmentsDownloaded,
      ocrProcessed: atts.ocrProcessed,
      kwFound: atts.kwFound,
      errors: atts.errors.slice(0, 5),
    };
  } catch (e: any) {
    out.error = String(e?.message ?? e);
  }
  try {
    const { runScheduledMessengerBackfill } = await import(
      "@/lib/messenger-backfill.server"
    );
    out.backfill = await runScheduledMessengerBackfill();
  } catch (e: any) {
    out.backfillError = String(e?.message ?? e);
  }
  return out;
}

export const Route = createFileRoute("/api/public/hooks/messenger-sync-force")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        const out = await run();
        return new Response(JSON.stringify({ ok: true, ...out }), {
          headers: { "content-type": "application/json" },
        });
      },
      POST: async ({ request }) => {
        const unauth = requireCronSecret(request);
        if (unauth) return unauth;
        const out = await run();
        return new Response(JSON.stringify({ ok: true, ...out }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
