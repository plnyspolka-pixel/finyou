import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateMaterialDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { materialId: string; audience: string; title: string; userDescription?: string }) =>
      data,
  )
  .handler(async ({ data, context }) => {
    const { generateMaterialDescriptionText } = await import("./marketing-materials-ai.server");
    const text = await generateMaterialDescriptionText({
      audience: data.audience,
      title: data.title,
      userDescription: data.userDescription,
    });

    const { error } = await context.supabase
      .from("marketing_materials")
      .update({ ai_description: text })
      .eq("id", data.materialId);
    if (error) throw new Error(error.message);

    return { ai_description: text };
  });

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 7; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export const ensureMyReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: existing } = await context.supabase
      .from("profiles")
      .select("referral_code")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing?.referral_code) return { code: existing.referral_code };

    for (let i = 0; i < 5; i++) {
      const code = randomCode();
      const { error } = await context.supabase
        .from("profiles")
        .update({ referral_code: code })
        .eq("user_id", context.userId);
      if (!error) return { code };
    }
    throw new Error("Nie udało się wygenerować kodu polecającego");
  });
