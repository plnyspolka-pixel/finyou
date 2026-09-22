// Server functions filmu z landingu inwestora: publiczny odczyt adresu kopii
// w Storage (loader /dla-inwestora) i synchronizacja HeyGen → Storage dla
// zespołu (panel /admin/materialy).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { LandingVideoInfo } from "./landing-video";
import type { LandingVideoSyncResult } from "./landing-video.server";

async function assertTeam(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("administrator") && !roles.includes("operator")) {
    throw new Error("Wymagane uprawnienia administrator/operator");
  }
}

/** Publiczne: adresy kopii filmu, gdy jest już w Storage; inaczej null. */
export const getLandingInvestorVideo = createServerFn({ method: "GET" }).handler(
  async (): Promise<LandingVideoInfo | null> => {
    const { getLandingInvestorVideoInfo } = await import("./landing-video.server");
    return getLandingInvestorVideoInfo();
  },
);

/** Zespół: kopiuje gotowy film z HeyGen do Storage (nadpisuje poprzednią kopię). */
export const syncLandingInvestorVideoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ variant: z.enum(["captioned", "clean"]).optional() }).parse(i ?? {}),
  )
  .handler(async ({ context, data }): Promise<LandingVideoSyncResult> => {
    await assertTeam(context.userId);
    const { syncLandingInvestorVideo } = await import("./landing-video.server");
    return syncLandingInvestorVideo({ variant: data.variant });
  });
