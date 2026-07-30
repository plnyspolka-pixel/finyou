import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "list_affiliate_commissions",
  title: "List affiliate commissions",
  description: "Prowizje partnerów – filtruj po statusie (pending/approved/paid) lub partnerze.",
  inputSchema: {
    partner_id: z.string().uuid().optional(),
    status: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ partner_id, status, limit }, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    let q = userClient(ctx)
      .from("affiliate_commissions")
      .select(
        "id, partner_id, status, gross_amount, currency, network_level, settlement_type, approved_at, paid_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (partner_id) q = q.eq("partner_id", partner_id);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ commissions: data ?? [] });
  },
});
