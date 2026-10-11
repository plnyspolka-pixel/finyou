// Ocena ryzyka i wycena (krok 4 pipeline'u) na żądanie panelu inwestora.
//
// Obietnica: ocena ryzyka i wycena w ciągu ok. 15 minut od uruchomienia
// analizy. Sama ocena trwa 30–50 s, więc panel — gdy wczytane dane pokazują
// rozstrzygnięte kroki 1–3 i wolny krok 4 — zleca ją tu od razu, zamiast
// czekać na cron tick (ten zostaje siatką bezpieczeństwa, co 5 min). Krok 4
// liczy się w tym żądaniu (jak w MCP i panelu zespołu), ale tylko po udanym
// zajęciu (claim) — drugie żądanie, druga karta albo cron dostają stan
// „running". Wywołanie jest idempotentne i bezpieczne do powtarzania.
//
// Bramki dostępu jak przy odczycie szczegółów (wyłącznie właściciel):
//  • Analityka — wniosek w zasięgu inwestora (po złożonym Zleceniu),
//  • analiza KW spoza Finance You — własne sprawdzenie,
//  • raport Projektu w „Moich zleceniach" — przyjęte Zlecenie + Projekt w nim.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RiskStepRequestStatus } from "@/lib/analysis-pipeline/step-timing";

const RISK_STEP_TARGET = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("analytics"), applicationId: z.string().uuid() }),
  z.object({ kind: z.literal("kw-check"), id: z.string().uuid() }),
  z.object({
    kind: z.literal("order-report"),
    orderId: z.string().uuid(),
    applicationId: z.string().uuid(),
  }),
]);

/** Czego dotyczy ocena: przebieg wniosku (Analityka / raport Projektu) albo sprawdzenie KW. */
export type RiskStepTarget = z.infer<typeof RISK_STEP_TARGET>;

export const runMyRiskStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RISK_STEP_TARGET.parse(d))
  .handler(async ({ data, context }): Promise<{ status: RiskStepRequestStatus }> => {
    const userId = context.userId as string;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    if (data.kind === "kw-check") {
      const { loadOwnRow } = await import("./kw-checks.functions");
      const row = await loadOwnRow(db, userId, data.id);
      const { runKwCheckRiskStepNow } = await import("./kw-checks.server");
      return { status: await runKwCheckRiskStepNow(row) };
    }

    let applicationId: string;
    if (data.kind === "analytics") {
      const { loadAccessibleApp } = await import("./analytics.functions");
      const { app } = await loadAccessibleApp(db, userId, data.applicationId);
      applicationId = String(app.id);
    } else {
      const { assertOrderReportAccess } =
        await import("@/lib/investor-agreements/order-projects.functions");
      applicationId = await assertOrderReportAccess(db, userId, data.orderId, data.applicationId);
    }
    const { runRiskStepForApplication } = await import("@/lib/analysis-pipeline/engine.server");
    return { status: await runRiskStepForApplication(applicationId) };
  });
