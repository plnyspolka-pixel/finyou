import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  readOwnerBusinessCheckForApplication,
  refreshOwnerBusinessCheckForApplication,
} from "@/lib/owner-business-check.server";

export const getOwnerBusinessCheck = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) =>
    readOwnerBusinessCheckForApplication({
      supabase: context.supabase as never,
      userId: context.userId,
      applicationId: data.applicationId,
    }),
  );

export const refreshOwnerBusinessCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) =>
    refreshOwnerBusinessCheckForApplication({
      supabase: context.supabase as never,
      userId: context.userId,
      applicationId: data.applicationId,
    }),
  );
