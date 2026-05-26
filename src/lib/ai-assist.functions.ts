import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Wspomaga pisanie opisu celu biznesowego pożyczki za pomocą Lovable AI.
export const assistBusinessDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      currentText: z.string().max(5000).optional().default(""),
      hint: z.string().max(2000).optional().default(""),
      mode: z.enum(["draft", "improve", "expand"]).default("improve"),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY nie skonfigurowany");

    const system =
      "Jesteś doradcą biznesowym pomagającym przedsiębiorcom opisać cel pożyczki pod zastaw nieruchomości. " +
      "Pisz po polsku, rzeczowo, konkretnie. Skup się na: na co środki zostaną przeznaczone, " +
      "jaki efekt biznesowy klient chce osiągnąć, źródła spłaty, harmonogram. " +
      "Maksymalnie 6-10 zdań. Nie wymyślaj liczb, których klient nie podał. Bez listy punktowanej, zwarty akapit.";

    const userMsg =
      data.mode === "draft"
        ? `Na podstawie poniższych wskazówek napisz krótki opis celu biznesowego pożyczki:\n${data.hint || "(brak wskazówek — zaproponuj typowy przykład inwestycyjny)"}`
        : data.mode === "expand"
          ? `Rozwiń poniższy opis o brakujące elementy (cel, efekt, źródła spłaty), zachowaj sens:\n\n${data.currentText}\n\nDodatkowe wskazówki: ${data.hint || "brak"}`
          : `Popraw i doszlifuj poniższy opis celu pożyczki, zachowaj fakty i intencję klienta:\n\n${data.currentText}\n\nDodatkowe wskazówki: ${data.hint || "brak"}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (res.status === 429) throw new Error("Zbyt wiele zapytań do AI. Spróbuj za chwilę.");
    if (res.status === 402) throw new Error("Wyczerpany limit AI. Doładuj środki w Lovable Cloud.");
    if (!res.ok) throw new Error(`AI gateway: ${res.status}`);

    const json: any = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? "";
    return { text: text.trim() };
  });
