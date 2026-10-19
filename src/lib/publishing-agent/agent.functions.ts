import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
// Logika: src/lib/publishing-agent/agent-settings.server.ts (wspólna z MCP).

const killSwitchSchema = z.object({ on: z.boolean(), reason: z.string().max(500).optional() });

/** Wyłącznik awaryjny agenta z panelu: włączyć może personel, wyłączyć administrator. */
export const setPublishingAgentKillSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => killSwitchSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { assertAdmin, assertStaff } = await import("@/lib/affiliate/db");
    if (data.on) await assertStaff(context.supabase as never, context.userId);
    else await assertAdmin(context.supabase as never, context.userId);
    const { setKillSwitch } = await import("./agent-settings.server");
    const r = await setKillSwitch({
      on: data.on,
      reason: data.reason ?? null,
      actor: context.userId,
    });
    if (!r.ok) throw new Error(r.error ?? "Nie udało się zmienić wyłącznika.");
    return { ok: true };
  });

/** Ręczny tick agenta (anomalie, metryki, opcjonalnie raport). Tylko administrator. */
export const runPublishingAgentTickFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ report: z.enum(["daily", "weekly"]).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/affiliate/db");
    await assertAdmin(context.supabase as never, context.userId);
    const { runPublishingAgentTick } = await import("./agent-tick.server");
    return runPublishingAgentTick({ forceReport: data.report });
  });
