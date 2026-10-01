// Sprawdzenie kodu rabatowego na formularzu płatności — podgląd ceny przed
// przejściem do bramki. Ostateczna weryfikacja i tak odbywa się w checkoucie.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const checkDiscountCode = createServerFn({ method: "POST" })
  .inputValidator((i) => z.object({ code: z.string().trim().min(1).max(40) }).parse(i))
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; code: string; pct: number } | { ok: false; error: string }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { resolveDiscountCode } = await import("./discount.server");
      const res = await resolveDiscountCode(supabaseAdmin as any, data.code);
      return res ?? { ok: false, error: "Wpisz kod rabatowy." };
    },
  );
