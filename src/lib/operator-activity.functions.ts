import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { DEFAULT_SUMMARY_DAYS, type OperatorActivityRow } from "@/lib/operator-activity";

/**
 * Zbiorcza aktywność zespołu za ostatnie N dni — jeden wiersz na osobę.
 * Kontrola roli administratora siedzi w samej funkcji RPC (SECURITY DEFINER),
 * bo widok `v_team_activity` czyta tabele z pominięciem RLS.
 */
export const getOperatorActivitySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ days: z.number().int().min(1).max(365).default(DEFAULT_SUMMARY_DAYS) })
      .default({ days: DEFAULT_SUMMARY_DAYS })
      .parse(raw ?? {}),
  )
  .handler(async ({ context, data }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC spoza wygenerowanych typów Database
    const { data: rows, error } = await (context.supabase as any).rpc(
      "get_operator_activity_summary",
      { p_days: data.days },
    );
    if (error) throw new Error(error.message);
    return (rows ?? []) as OperatorActivityRow[];
  });
