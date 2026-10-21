import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/migration/storage-manifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { storageManifest } = await import("@/lib/migration-storage-manifest.server");
        return storageManifest(request, async () => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          return supabaseAdmin;
        });
      },
    },
  },
});