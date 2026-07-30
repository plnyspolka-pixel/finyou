import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Wspomaga pisanie opisu celu biznesowego pożyczki za pomocą Lovable AI.
export const assistBusinessDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        currentText: z.string().max(5000).optional().default(""),
        hint: z.string().max(2000).optional().default(""),
        mode: z.enum(["draft", "improve", "expand"]).default("improve"),
        loanId: z.string().uuid().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY nie skonfigurowany");

    // Pobierz fakty z wniosku, żeby AI używało prawdziwych liczb (a nie X/Y/Z).
    let factsBlock = "";
    if (data.loanId) {
      const { supabase } = context;
      const { data: loan } = await supabase
        .from("loan_applications")
        .select(
          "loan_amount, preferred_period_months, max_monthly_payment, annual_investor_rate, business_status, nip",
        )
        .eq("id", data.loanId)
        .maybeSingle();
      const { data: prop } = await supabase
        .from("properties")
        .select("property_type, city, street, voivodeship")
        .eq("loan_application_id", data.loanId)
        .maybeSingle();

      const fmtPln = (v: number | null | undefined) =>
        v == null
          ? null
          : new Intl.NumberFormat("pl-PL", {
              style: "currency",
              currency: "PLN",
              maximumFractionDigits: 0,
            }).format(v);
      const facts: string[] = [];
      if (loan?.loan_amount) facts.push(`kwota pożyczki: ${fmtPln(Number(loan.loan_amount))}`);
      if (loan?.preferred_period_months) facts.push(`okres: ${loan.preferred_period_months} mies.`);
      if (loan?.max_monthly_payment)
        facts.push(`maks. rata miesięczna: ${fmtPln(Number(loan.max_monthly_payment))}`);
      if (loan?.annual_investor_rate)
        facts.push(`oprocentowanie roczne: ${loan.annual_investor_rate}%`);
      if (loan?.business_status) facts.push(`status działalności: ${loan.business_status}`);
      if (loan?.nip) facts.push(`NIP: ${loan.nip}`);
      if (prop?.property_type) facts.push(`zabezpieczenie: ${prop.property_type}`);
      const loc = [prop?.street, prop?.city, prop?.voivodeship].filter(Boolean).join(", ");
      if (loc) facts.push(`lokalizacja: ${loc}`);
      if (facts.length) {
        factsBlock = `\n\nDane z wniosku klienta (UŻYWAJ TYCH WARTOŚCI, nie wstawiaj X/Y/Z ani placeholderów):\n- ${facts.join("\n- ")}`;
      }
    }

    const system =
      "Jesteś doradcą biznesowym pomagającym przedsiębiorcom opisać cel pożyczki pod zastaw nieruchomości. " +
      "Pisz po polsku, rzeczowo, konkretnie. Skup się na: na co środki zostaną przeznaczone, " +
      "jaki efekt biznesowy klient chce osiągnąć, źródła spłaty, harmonogram. " +
      "Maksymalnie 6-10 zdań. Bez listy punktowanej, zwarty akapit. " +
      "ZASADA LICZB: jeżeli używasz jakichkolwiek liczb (kwoty, okresy, raty, oprocentowanie, lokalizacja, typ nieruchomości), " +
      "bierz je WYŁĄCZNIE z sekcji 'Dane z wniosku klienta'. " +
      "NIGDY nie zostawiaj placeholderów typu X zł, Y%, Z miesięcy, [kwota], ____. " +
      "Jeśli dana liczba nie została podana — pomiń ją lub opisz słownie (np. 'w uzgodnionym terminie'), zamiast wstawiać symbol zastępczy.";

    const userMsg =
      data.mode === "draft"
        ? `Na podstawie poniższych wskazówek napisz krótki opis celu biznesowego pożyczki:\n${data.hint || "(brak wskazówek — zaproponuj typowy przykład inwestycyjny)"}${factsBlock}`
        : data.mode === "expand"
          ? `Rozwiń poniższy opis o brakujące elementy (cel, efekt, źródła spłaty), zachowaj sens:\n\n${data.currentText}\n\nDodatkowe wskazówki: ${data.hint || "brak"}${factsBlock}`
          : `Popraw i doszlifuj poniższy opis celu pożyczki, zachowaj fakty i intencję klienta. Jeśli w tekście są placeholdery typu X/Y/Z lub [kwota], zastąp je realnymi wartościami z wniosku albo usuń:\n\n${data.currentText}\n\nDodatkowe wskazówki: ${data.hint || "brak"}${factsBlock}`;

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
