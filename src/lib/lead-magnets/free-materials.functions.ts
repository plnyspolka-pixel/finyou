// Publiczna server function działu „Darmowe materiały” (loader landingów).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { LEAD_MAGNET_AUDIENCES } from "./core";

export const getFreeMaterialsFn = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ audience: z.enum(LEAD_MAGNET_AUDIENCES) }).parse(d))
  .handler(async ({ data }) => {
    const { listFreeMaterials } = await import("./free-materials.server");
    return listFreeMaterials(data.audience);
  });
