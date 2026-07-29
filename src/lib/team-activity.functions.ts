import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type TeamMember = {
  user_id: string;
  name: string | null;
  email: string | null;
  roles: string[];
  last_sign_in_at: string | null;
  last_action_at: string | null;
  actions_30d: number;
};

export type TeamActivityRow = {
  id: string;
  happened_at: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  event_type: string;
  title: string;
  details: string | null;
  object_type: string | null;
  object_id: string | null;
};

export const getTeamMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC spoza wygenerowanych typów Database
    const { data, error } = await (context.supabase as any).rpc("get_team_members");
    if (error) throw new Error(error.message);
    return (data ?? []) as TeamMember[];
  });

export const getTeamActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ limit: z.number().int().min(1).max(1000).default(500) })
      .default({ limit: 500 })
      .parse(raw ?? {}),
  )
  .handler(async ({ context, data }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC spoza wygenerowanych typów Database
    const { data: rows, error } = await (context.supabase as any).rpc("get_team_activity", {
      p_limit: data.limit,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as TeamActivityRow[];
  });
