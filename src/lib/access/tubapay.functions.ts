// Oferta rat TubaPay dla produktu z katalogu dostępu — do wyboru liczby
// płatności miesięcznych na formularzu. Publiczna (używa jej też zakup bez
// konta); kwotę bierzemy wyłącznie z zaufanego katalogu access_products.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { groszToPln } from "./core";

export const getTubapayInstallmentOffer = createServerFn({ method: "GET" })
  .inputValidator((i) =>
    z
      .object({
        productCode: z.string().trim().min(1).max(80),
        discountCode: z.string().trim().max(40).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data }): Promise<{ available: boolean; options: number[] }> => {
    const tp = await import("@/lib/tubapay.server");
    if (!tp.isTubapayConfigured()) return { available: false, options: [] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: product } = await (supabaseAdmin as any)
      .from("access_products")
      .select("amount_grosz,kind,active")
      .eq("code", data.productCode)
      .eq("active", true)
      .maybeSingle();
    if (!product || product.kind === "unlock") return { available: false, options: [] };

    // Oferta dla kwoty po rabacie (gdy kod poprawny) — tyle obejmie umowa.
    let amountGrosz = Number(product.amount_grosz);
    if (data.discountCode) {
      const { verifyDiscountCode, applyDiscountGrosz } = await import("./discount-code");
      const { getDiscountSecret } = await import("./discount.server");
      const parsed = await verifyDiscountCode(data.discountCode, getDiscountSecret());
      if (parsed) amountGrosz = applyDiscountGrosz(amountGrosz, parsed.pct);
    }

    try {
      const options = await tp.getTubapayInstallmentOptions(groszToPln(amountGrosz));
      return { available: options.length > 0, options };
    } catch (e) {
      console.error("[tubapay] offer failed", (e as Error).message);
      return { available: false, options: [] };
    }
  });
