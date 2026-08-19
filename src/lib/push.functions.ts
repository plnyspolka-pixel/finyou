// Funkcje serwerowe subskrypcji powiadomień push panelu operatora.
// Tabela push_subscriptions jest bez polityk RLS — cały dostęp idzie tędy
// (service role), po weryfikacji tożsamości i roli pracowniczej.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type StaffContext = {
  userId: string;
  supabase: {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: string },
    ) => PromiseLike<{ data: boolean | null }>;
  };
};

async function assertStaff(context: StaffContext): Promise<void> {
  const roles = ["administrator", "operator", "operator_wewnetrzny"] as const;
  const checks = await Promise.all(
    roles.map((r) => context.supabase.rpc("has_role", { _user_id: context.userId, _role: r })),
  );
  if (!checks.some((c) => c.data === true)) {
    throw new Error("Forbidden: wymagana rola operatora lub administratora");
  }
}

// Tabela push_subscriptions nie jest jeszcze w wygenerowanych typach Database —
// dostęp przez nietypowany klient service role (jak w lead-comms.server.ts).
async function adminDb() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Klucz publiczny VAPID dla przeglądarki (null = push nieskonfigurowany). */
export const getPushConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as StaffContext);
    const { getVapidKeys } = await import("@/lib/operator-push.server");
    const keys = getVapidKeys();
    return { enabled: keys !== null, publicKey: keys?.publicKey ?? null };
  });

const SubscriptionSchema = z.object({
  endpoint: z.string().url().max(2000),
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(100),
  userAgent: z.string().max(400).optional().nullable(),
});

/** Zapis subskrypcji push bieżącej przeglądarki (upsert po endpoincie). */
export const registerPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SubscriptionSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context as StaffContext);
    const db = await adminDb();
    const { error } = await db.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent ?? null,
        last_error: null,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Usunięcie subskrypcji bieżącej przeglądarki (wyłączenie powiadomień). */
export const unregisterPushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ endpoint: z.string().url().max(2000) }).parse(i))
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    const { error } = await db
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Testowe powiadomienie — tylko do subskrypcji wywołującego. */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context as StaffContext);
    const { sendOperatorPush } = await import("@/lib/operator-push.server");
    const result = await sendOperatorPush({
      event: "test",
      title: "Powiadomienia działają 🎉",
      body: "Tak będą wyglądać powiadomienia o nowych leadach, wnioskach i wiadomościach.",
      url: "/operator/powiadomienia",
      targetUserIds: [context.userId],
    });
    return result;
  });
