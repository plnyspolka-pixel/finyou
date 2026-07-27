import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, userClient, ok, fail } from "../_helpers";

export default defineTool({
  name: "create_lead",
  title: "Create lead",
  description:
    "Tworzy nowego leada w Finance You (np. z zewnętrznej rozmowy AI). Wymaga zalogowania.",
  inputSchema: {
    first_name: z.string().min(1),
    last_name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    loan_amount: z.number().positive().optional(),
    purpose: z.string().optional(),
    source: z.string().optional().describe("np. 'mcp_client', 'chatgpt', 'partner_x'"),
    notes: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx: ToolContext) => {
    try {
      requireAuth(ctx);
    } catch (e) {
      return fail((e as Error).message);
    }
    const { data, error } = await userClient(ctx)
      .from("leads")
      .insert({
        first_name: input.first_name,
        last_name: input.last_name ?? null,
        email: input.email ?? null,
        phone_raw: input.phone ?? null,
        source: input.source ?? "mcp",
        status: "nowy",
        type: "borrower",
        notes: input.notes ?? null,
        application_data: {
          loan_amount: input.loan_amount ?? null,
          purpose: input.purpose ?? null,
        },
      })
      .select("id")
      .single();
    if (error) return fail(error.message);
    return ok({ ok: true, lead_id: data.id });
  },
});
