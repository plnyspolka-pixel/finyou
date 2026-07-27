// Wspólne helpery dla narzędzi MCP.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

export function userClient(ctx: ToolContext): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function publicClient(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function requireAuth(ctx: ToolContext) {
  if (!ctx.isAuthenticated()) {
    throw new Error("Not authenticated");
  }
}

export function ok(payload: unknown, structured?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent:
      structured ??
      (typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>)
        : { value: payload }),
  };
}

export function fail(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true as const };
}

export async function isAdmin(ctx: ToolContext): Promise<boolean> {
  const s = userClient(ctx);
  const { data } = await s.from("user_roles").select("role").eq("user_id", ctx.getUserId());
  return (data ?? []).some(
    (r: { role: string }) => r.role === "administrator" || r.role === "operator",
  );
}
