import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYS = `Jesteś copywriterem Finance You. Twórz krótkie (max 280 znaków), konkretne opisy materiałów marketingowych do publikacji w social media (FB/IG/LinkedIn). Po polsku, bez clickbaitu, z naturalnym CTA. Zwracaj sam tekst, bez cudzysłowów.`;

export const generateMaterialDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { materialId: string; audience: string; title: string; userDescription?: string }) =>
      data,
  )
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    const audienceTxt =
      data.audience === "klient"
        ? "klient indywidualny szukający pożyczki pod nieruchomość"
        : data.audience === "inwestor"
          ? "inwestor lokujący kapitał w pożyczki pod hipotekę"
          : "pośrednik / partner sprzedaży";

    const userPrompt = `Materiał dla: ${audienceTxt}. Tytuł: "${data.title}". ${data.userDescription ? `Kontekst od admina: ${data.userDescription}.` : ""} Napisz opis pod ten materiał (zdjęcie/film) do publikacji w social media.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYS },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    const text = (body.choices?.[0]?.message?.content ?? "").trim();

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
